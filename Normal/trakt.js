// Trakt 组件 (API + OAuth工具版)
WidgetMetadata = {
    id: "Trakt_API_Pro",
    title: "Trakt (API & Token版)",
    modules: [
        {
            title: "🛠️ 工具：获取 Token (首次使用)",
            requiresWebView: false,
            functionName: "generateToken",
            cacheDuration: 0, // 不缓存，每次运行都执行
            params: [
                {
                    name: "client_id",
                    title: "Client ID",
                    type: "input",
                    description: "从 Trakt 申请的应用 ID",
                },
                {
                    name: "client_secret",
                    title: "Client Secret",
                    type: "input",
                    description: "从 Trakt 申请的应用 Secret (注意保密)",
                },
                {
                    name: "auth_code",
                    title: "授权码 (Code)",
                    type: "input",
                    description: "若为空：脚本会生成授权链接，去浏览器打开获取Code。若不为空：脚本将用此Code换取Token。",
                }
            ],
        },
        {
            title: "Trakt 我看 (API)",
            requiresWebView: false,
            functionName: "loadInterestItems",
            cacheDuration: 3600,
            params: [
                {
                    name: "oauth_token",
                    title: "OAuth Token",
                    type: "input",
                    description: "使用上方工具获取到的 Access Token (必填)",
                },
                {
                    name: "client_id",
                    title: "Client ID",
                    type: "input",
                    description: "Trakt API Client ID",
                },
                {
                    name: "status",
                    title: "状态",
                    type: "enumeration",
                    enumOptions: [
                        { title: "正在追 (Progress)", value: "progress" }, // 需要 Token
                        { title: "个性化推荐 (Recs)", value: "recommendations" }, // 需要 Token
                        { title: "想看 (Watchlist)", value: "watchlist" },
                        { title: "看过 (History)", value: "history" }
                    ],
                },
                {
                    name: "page",
                    title: "页码",
                    type: "page"
                },
            ],
        },
        // ... (可以保留其他模块，只需增加 oauth_token 参数)
    ],
    version: "3.0.0",
    description: "集成了 Token 生成工具。先使用工具模块获取 Token，填入'我看'模块即可解锁个性化推荐和进度。",
    author: "Refactored_AI",
    site: "https://trakt.tv"
};

// --- 核心功能：Token 生成器 ---
async function generateToken(params = {}) {
    const clientId = params.client_id;
    const clientSecret = params.client_secret;
    const code = params.auth_code;

    if (!clientId || !clientSecret) {
        return [{ title: "错误：请填写 Client ID 和 Secret", type: "text" }];
    }

    // 阶段 1：用户还没填 Code，生成授权链接提示用户去浏览器
    if (!code) {
        const redirectUri = "urn:ietf:wg:oauth:2.0:oob";
        const authUrl = `https://trakt.tv/oauth/authorize?response_type=code&client_id=${clientId}&redirect_uri=${redirectUri}`;
        
        console.log("授权链接: " + authUrl);
        
        // 返回一个特殊的界面告诉用户怎么做
        // 注意：不同 Widget 平台的复制/跳转方式不同，这里打印日志并尝试返回文本
        return [
            { 
                title: "⚠️ 第一步：获取 Code", 
                body: "请复制下方日志中的链接，在浏览器打开，点击 Approve，然后复制页面显示的 8 位代码，填入本模块的 '授权码' 栏。",
                type: "text"
            },
            {
                title: "点击这里复制链接 (如果支持)", 
                url: authUrl, // 尝试让用户点击跳转
                body: authUrl,
                type: "text"
            }
        ];
    }

    // 阶段 2：用户填了 Code，开始换取 Token
    const url = "https://api.trakt.tv/oauth/token";
    const payload = {
        code: code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: "urn:ietf:wg:oauth:2.0:oob",
        grant_type: "authorization_code"
    };

    try {
        const response = await Widget.http.post(url, {
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload) // 确保 body 是字符串
        });

        console.log("Token Response:", response.data);
        
        const data = typeof response.data === 'string' ? JSON.parse(response.data) : response.data;

        if (data.access_token) {
            return [
                {
                    title: "✅ 获取成功！",
                    body: "请复制下方的 Access Token，并填入其他模块的 'OAuth Token' 栏中。",
                    type: "text"
                },
                {
                    title: "Access Token (长按复制)",
                    body: data.access_token,
                    type: "text" // 这里的 body 就是 token，方便用户复制
                },
                {
                    title: "Refresh Token (备用)",
                    body: data.refresh_token,
                    type: "text"
                }
            ];
        } else {
            return [{ title: "❌ 获取失败", body: "请检查 Code 是否过期或 ID/Secret 是否正确。", type: "text" }];
        }
    } catch (e) {
        return [{ title: "网络错误", body: e.message, type: "text" }];
    }
}

// --- 通用 API 请求 (支持 Token) ---
async function fetchTraktApi(endpoint, clientId, token, params = {}) {
    const baseUrl = "https://api.trakt.tv";
    
    // 构建 Query String
    const queryString = Object.keys(params)
        .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`)
        .join('&');
    
    const url = `${baseUrl}${endpoint}?${queryString}`;
    
    // 构建 Headers
    const headers = {
        "Content-Type": "application/json",
        "trakt-api-version": "2",
        "trakt-api-key": clientId
    };
    
    // 关键：如果有 Token，则添加 Authorization
    if (token) {
        headers["Authorization"] = `Bearer ${token}`;
    }

    console.log(`[Request] ${url}`);
    
    try {
        const response = await Widget.http.get(url, { headers: headers });
        return typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
    } catch (e) {
        console.error("API Error:", e);
        return [];
    }
}

// --- 数据解析 ---
function parseTraktItems(items) {
    if (!Array.isArray(items)) return [];
    return items.map(item => {
        // 兼容不同接口返回的结构: item.movie, item.show, 或者直接是 movie/show 对象
        const data = item.movie || item.show || item;
        if (!data || !data.ids) return null;
        if (data.ids.imdb) return { id: data.ids.imdb, type: "imdb" };
        if (data.ids.tmdb) return { id: `${data.ids.tmdb}`, type: "tmdb" };
        return null;
    }).filter(Boolean);
}

// --- 业务逻辑：我看/推荐/进度 ---
async function loadInterestItems(params = {}) {
    const clientId = params.client_id;
    const token = params.oauth_token;
    const status = params.status || "watchlist"; 
    const page = params.page || 1;
    
    if (!clientId) return []; // Token 是可选的（对于 public 数据），但 ClientID 必填

    let endpoint = "";
    let apiParams = { page: page, limit: 20, extended: "full" };

    // 根据不同状态选择不同接口
    if (status === "recommendations") {
        if (!token) throw new Error("个性化推荐必须填写 OAuth Token");
        endpoint = "/recommendations/movies"; // 默认推荐电影，可改为 shows
        apiParams.ignore_collected = "true"; // 过滤掉已收集的
    } else if (status === "progress") {
        if (!token) throw new Error("追剧进度必须填写 OAuth Token");
        endpoint = "/sync/playback/episodes"; // 获取播放进度
        // 进度接口返回的数据结构略有不同，需要特殊处理，这里先做通用处理
    } else if (status === "watchlist") {
        // 如果有 Token，获取自己的；没 Token，需要 username (这里简化为必须有 token 获取自己的)
        endpoint = "/sync/watchlist"; 
        if (!token) throw new Error("此版本 Watchlist 需 Token (或修改代码指定 Username)");
    } else {
        endpoint = "/sync/history";
    }

    const data = await fetchTraktApi(endpoint, clientId, token, apiParams);
    return parseTraktItems(data);
}
