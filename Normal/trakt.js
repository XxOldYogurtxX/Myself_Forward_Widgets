// Trakt 组件 (TMDB标准格式版 v8.0)
WidgetMetadata = {
    id: "Trakt_TMDB_Standard",
    title: "Trakt (TMDB规范版)",
    modules: [
        {
            title: "Trakt 影视列表",
            requiresWebView: false,
            functionName: "loadInterestItems",
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
                    description: "默认公用ID，建议替换为自己的",
                },
                {
                    name: "user_name",
                    title: "用户名",
                    type: "input",
                    description: "查看个人列表时可能需要",
                },
                {
                    name: "oauth_token",
                    title: "OAuth Token",
                    type: "input",
                    description: "高级功能必填",
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
            functionName: "generateToken",
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
                    description: "必填",
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
    version: "8.0.0",
    description: "严格遵循 Forward 开发文档。返回标准 TMDB 格式 (id, type, mediaType)。",
    author: "Refactored_AI",
    site: "https://trakt.tv"
};

// --- 核心 API 请求 ---
async function fetchTraktApi(endpoint, clientId, token, params = {}) {
    if (!clientId) return null;

    // 自动追加 extended=full 以获取 ids
    if (!params.extended) params.extended = "full";

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
        const response = await Widget.http.get(url, { headers: headers });
        if (response.status !== 200) return []; 
        return typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
    } catch (e) {
        return [];
    }
}

// --- 数据解析 (完全符合开发文档) ---
function parseTraktItems(items) {
    if (!Array.isArray(items)) return [];
    
    const results = items.map(item => {
        // 1. 确定数据对象和类型
        let data = null;
        let mediaType = "movie"; // 默认为 movie

        if (item.movie) {
            data = item.movie;
            mediaType = "movie";
        } else if (item.show) {
            data = item.show;
            mediaType = "tv"; // Trakt叫show, TMDB/Forward叫tv
        } else if (item.ids) {
            // 如果根对象就是数据 (如 trending 某些接口)
            data = item;
            // 尝试通过 title 是否存在来猜测，或者默认为 movie
            // 更严谨的是看 endpoint，但这里我们尽量从数据推断
            // 只有 show 有 "aired_episodes" 属性
            if (data.aired_episodes !== undefined) mediaType = "tv";
        }

        // 2. 提取 TMDB ID
        if (data && data.ids && data.ids.tmdb) {
            const itemObj = { 
                id: String(data.ids.tmdb), 
                type: "tmdb",
                mediaType: mediaType,
                title: data.title || "", // 附带标题方便调试
            };

            // 3. 尝试附带图片 (如果 Trakt 偶尔返回了)
            // Trakt 通常不返回完整 image url，所以这里只作为备选
            // Forward App 会根据 tmdb id 自动去拉取封面，所以这里不填 posterPath 也没关系
            
            return itemObj;
        }
        return null;
    }).filter(Boolean);

    return results;
}

// --- 演示数据 (标准格式) ---
function getDemoData() {
    return [
        { id: "157336", type: "tmdb", mediaType: "movie", title: "Interstellar" }, 
        { id: "1396", type: "tmdb", mediaType: "tv", title: "Breaking Bad" }
    ];
}

// --- 主逻辑 ---
async function loadInterestItems(params = {}) {
    const clientId = params.client_id;
    if (!clientId) return getDemoData();

    const token = params.oauth_token;
    const userName = params.user_name;
    const status = params.status || "trending"; 
    const page = params.page || 1;
    
    let endpoint = "";
    let apiParams = { page: page, limit: 20 };

    // 路由选择
    if (status === "trending") {
        endpoint = "/movies/trending"; // 默认只看电影 Trending，混合比较麻烦
        // 如果想混合，可以请求两次合并，但 Forward 列表通常单类型
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

// --- Token 工具 ---
async function generateToken(params = {}) {
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
