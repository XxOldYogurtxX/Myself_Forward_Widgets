/**
 * Trakt Widget (Rslib/ESM 标准版)
 * 适用于使用 @forward-widget/rslib-plugin 构建的项目
 */

// 1. 导出组件配置 (export default)
export default {
    id: "Trakt_ESM_Fix",
    title: "Trakt (Rslib版)",
    modules: [
        {
            title: "Trakt 影视列表",
            requiresWebView: false,
            functionName: "loadInterestItems", // 对应下方导出的函数名
            cacheDuration: 3600,
            params: [
                {
                    name: "status",
                    title: "内容类型",
                    type: "enumeration",
                    defaultValue: "trending",
                    enumOptions: [
                        { title: "热门趋势 (无需Token)", value: "trending" },
                        { title: "想看 (Watchlist)", value: "watchlist" },
                        { title: "正在追 (Progress)", value: "progress" },
                        { title: "个性化推荐 (需Token)", value: "recommendations" },
                        { title: "看过-电影", value: "history_movies" },
                        { title: "看过-剧集", value: "history_shows" }
                    ],
                },
                {
                    name: "client_id",
                    title: "Client ID",
                    type: "input",
                    defaultValue: "201dc70c5ec6af530f12f079ea1922733f6e1085ad7b02f36d8e011b75bcea7d",
                    description: "默认使用了公用ID，建议替换为自己的",
                },
                {
                    name: "user_name",
                    title: "用户名",
                    type: "input",
                    description: "看自己/别人的Watchlist时必填",
                },
                {
                    name: "oauth_token",
                    title: "OAuth Token",
                    type: "input",
                    description: "高级功能(推荐/进度/私密)必填",
                },
                {
                    name: "page",
                    title: "页码",
                    type: "page"
                },
            ],
        },
        {
            title: "🛠️ 工具：获取 Token",
            requiresWebView: false,
            functionName: "generateToken", // 对应下方导出的函数名
            cacheDuration: 0,
            params: [
                {
                    name: "client_id",
                    title: "Client ID",
                    type: "input",
                    defaultValue: "201dc70c5ec6af530f12f079ea1922733f6e1085ad7b02f36d8e011b75bcea7d"
                },
                {
                    name: "client_secret",
                    title: "Client Secret",
                    type: "input",
                    description: "必须填写",
                },
                {
                    name: "auth_code",
                    title: "授权码 (Code)",
                    type: "input",
                    description: "获取步骤见运行结果",
                }
            ],
        }
    ],
    version: "7.0.0",
    description: "适配 Rslib 插件标准。使用 ESM 导出。",
    author: "Refactored_AI",
    site: "https://trakt.tv"
};

// --- 内部通用函数 (不需要 export) ---

async function fetchTraktApi(endpoint, clientId, token, params = {}) {
    if (!clientId) return null;

    const queryString = Object.keys(params)
        .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`)
        .join('&');
    const url = `https://api.trakt.tv${endpoint}?${queryString}`;
    
    const headers = {
        "Content-Type": "application/json",
        "trakt-api-version": "2",
        "trakt-api-key": clientId
    };
    if (token && token.length > 5) headers["Authorization"] = `Bearer ${token}`;

    try {
        // Widget 是运行时全局对象，无需导入
        const response = await Widget.http.get(url, { headers: headers });
        if (response.status !== 200) {
            console.error(`API Error ${response.status}`);
            return []; 
        }
        return typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
    } catch (e) {
        console.error("Net Error: " + e.message);
        return [];
    }
}

function parseTraktItems(items) {
    if (!Array.isArray(items)) return [];
    
    const results = items.map(item => {
        let data = item.movie || item.show || item;
        if (item.show && item.episode) data = item.show; 

        if (data && data.ids && data.ids.imdb) {
            return { id: data.ids.imdb, type: "imdb" };
        }
        return null;
    }).filter(Boolean);

    return results;
}

function getDemoData() {
    return [
        { id: "tt0816692", type: "imdb" }, 
        { id: "tt1375666", type: "imdb" } 
    ];
}

// --- 2. 导出功能函数 (export async function) ---

export async function loadInterestItems(params = {}) {
    const clientId = params.client_id;
    if (!clientId) return getDemoData(); // 预览保护

    const token = params.oauth_token;
    const userName = params.user_name;
    const status = params.status || "trending"; 
    const page = params.page || 1;
    
    let endpoint = "";
    let apiParams = { page: page, limit: 20, extended: "full" };

    // 路由逻辑
    if (status === "trending") {
        endpoint = "/movies/trending";
    }
    else if (status === "recommendations") {
        if (!token) endpoint = "/movies/trending";
        else {
            endpoint = "/recommendations/movies";
            apiParams.ignore_collected = "true";
        }
    }
    else if (status === "progress") {
        if (!token) return getDemoData(); 
        endpoint = "/sync/playback/episodes";
    }
    else if (status === "watchlist") {
        if (token) {
            endpoint = "/sync/watchlist";
            apiParams.sort = "rank,asc";
        } else if (userName) {
            endpoint = `/users/${userName}/watchlist`;
        } else {
            endpoint = "/movies/trending"; 
        }
    }
    else if (status.startsWith("history")) {
        const type = status.includes("shows") ? "shows" : "movies";
        if (token || userName) {
            endpoint = token ? `/sync/history/${type}` : `/users/${userName}/history/${type}`;
        } else {
            endpoint = "/movies/trending";
        }
    }

    const data = await fetchTraktApi(endpoint, clientId, token, apiParams);
    const parsed = parseTraktItems(data);

    if (!parsed || parsed.length === 0) {
        return getDemoData();
    }

    return parsed;
}

export async function generateToken(params = {}) {
    const clientId = params.client_id;
    const clientSecret = params.client_secret;
    const code = params.auth_code;

    if (!clientId || !clientSecret) {
        return [{ title: "配置向导", body: "请先填写 Client ID 和 Secret", type: "text" }];
    }

    if (!code) {
        const authUrl = `https://trakt.tv/oauth/authorize?response_type=code&client_id=${clientId}&redirect_uri=urn:ietf:wg:oauth:2.0:oob`;
        return [
            { title: "步骤1：获取 Code", body: "复制下方链接去授权", type: "text" },
            { title: "🔗 点击复制链接", body: authUrl, url: authUrl, type: "text" }
        ];
    }

    const url = "https://api.trakt.tv/oauth/token";
    try {
        const response = await Widget.http.post(url, {
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                code: code,
                client_id: clientId,
                client_secret: clientSecret,
                redirect_uri: "urn:ietf:wg:oauth:2.0:oob",
                grant_type: "authorization_code"
            })
        });
        const data = typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
        if (data.access_token) {
            return [
                { title: "✅ 获取成功", body: "请复制下方 Token", type: "text" },
                { title: "Access Token", body: data.access_token, type: "text" }
            ];
        } else {
            return [{ title: "❌ 失败", body: "Code 无效", type: "text" }];
        }
    } catch (e) {
        return [{ title: "Error", body: e.message, type: "text" }];
    }
}

// 兼容导出 (保留 loadListItems 以防有旧引用)
export async function loadListItems(params) { return getDemoData(); }
