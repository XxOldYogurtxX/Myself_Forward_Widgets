// Trakt 组件 (完全自定义配置版 v4.0)
WidgetMetadata = {
    id: "Trakt_Custom_Input",
    title: "Trakt (自定义配置)",
    modules: [
        {
            title: "🛠️ 步骤1：获取 Token 工具",
            requiresWebView: false,
            functionName: "generateToken",
            cacheDuration: 0,
            params: [
                {
                    name: "client_id",
                    title: "Client ID (必填)",
                    type: "input",
                    description: "请输入 Trakt 申请的 Client ID",
                },
                {
                    name: "client_secret",
                    title: "Client Secret (必填)",
                    type: "input",
                    description: "请输入 Trakt 申请的 Client Secret",
                },
                {
                    name: "auth_code",
                    title: "授权码 (Code)",
                    type: "input",
                    description: "首次运行留空以获取链接；获取到 8 位 Code 后填入此处换取 Token",
                }
            ],
        },
        {
            title: "Trakt 列表与推荐",
            requiresWebView: false,
            functionName: "loadInterestItems",
            cacheDuration: 3600,
            params: [
                {
                    name: "client_id",
                    title: "Client ID (必填)",
                    type: "input",
                    description: "Trakt Client ID",
                },
                {
                    name: "oauth_token",
                    title: "OAuth Token (推荐)",
                    type: "input",
                    description: "通过上方工具获取的 Token。填入后解锁推荐、进度及隐私列表。",
                },
                {
                    name: "user_name",
                    title: "用户名 (无Token时必填)",
                    type: "input",
                    description: "如：giladg (若已填 Token 可留空)",
                },
                {
                    name: "status",
                    title: "内容类型",
                    type: "enumeration",
                    enumOptions: [
                        { title: "想看 (Watchlist)", value: "watchlist" },
                        { title: "正在追 (Progress - 暂停项)", value: "progress" },
                        { title: "个性化推荐 (需Token)", value: "recommendations" },
                        { title: "热门趋势 (无需Token)", value: "trending" },
                        { title: "看过-电影 (History)", value: "history_movies" },
                        { title: "看过-剧集 (History)", value: "history_shows" }
                    ],
                },
                {
                    name: "page",
                    title: "页码",
                    type: "page"
                },
            ],
        },
        {
            title: "Trakt 自定义片单",
            requiresWebView: false,
            functionName: "loadListItems",
            cacheDuration: 3600,
            params: [
                {
                    name: "client_id",
                    title: "Client ID (必填)",
                    type: "input",
                },
                {
                    name: "oauth_token",
                    title: "OAuth Token (选填)",
                    type: "input",
                    description: "若是私密片单则必填",
                },
                {
                    name: "user_name",
                    title: "用户名 (必填)",
                    type: "input",
                },
                {
                    name: "list_name",
                    title: "片单 ID/名称",
                    type: "input",
                    description: "例如: my-best-movies",
                },
                {
                    name: "page",
                    title: "页码",
                    type: "page"
                },
            ],
        }
    ],
    version: "4.0.0",
    description: "无硬编码版。所有 ID、Secret 和 Token 均需在组件编辑页手动输入。支持自动降级（无Token时尝试读取公开数据）。",
    author: "Trakt_User",
    site: "https://trakt.tv"
};

// --- 通用 API 请求函数 (完全依赖传入参数) ---
async function fetchTraktApi(endpoint, clientId, token, params = {}) {
    if (!clientId) {
        console.error("❌ 错误：未配置 Client ID");
        return null;
    }

    // 构建 URL 参数
    const queryString = Object.keys(params)
        .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`)
        .join('&');
    
    const url = `https://api.trakt.tv${endpoint}?${queryString}`;
    
    // 构建 Headers
    const headers = {
        "Content-Type": "application/json",
        "trakt-api-version": "2",
        "trakt-api-key": clientId
    };
    
    // 只有当用户输入了 Token 时才添加 Authorization 头
    if (token && token.length > 5) {
        headers["Authorization"] = `Bearer ${token}`;
    }

    console.log(`[API请求] ${url}`);

    try {
        const response = await Widget.http.get(url, { headers: headers });
        
        if (response.status === 401 || response.status === 403) {
            console.error(`权限错误 (${response.status})：请检查 Client ID 或 Token 是否正确/过期。`);
            return [];
        }
        
        if (response.status !== 200) {
            console.error(`API 错误 (${response.status}): ${response.data}`);
            return [];
        }

        return typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
    } catch (e) {
        console.error("网络请求失败:", e);
        return [];
    }
}

// --- 数据清洗：确保返回 IMDb ID 以防止“数据缺失” ---
function parseTraktItems(items) {
    if (!Array.isArray(items)) return [];

    const results = items.map(item => {
        // Trakt 结构可能很复杂，需要层层剥离
        // 结构1: { movie: { ids: ... } } (Watchlist, History)
        // 结构2: { show: { ids: ... } } (Watchlist, History)
        // 结构3: { title: "...", ids: ... } (Trending)
        let data = item.movie || item.show || item;

        // 特殊处理：Progress 接口返回 { show: {...}, episode: {...} }
        // 我们通常展示 Show 的封面，但如果是某一集，Trakt 有时放在 episode 里
        if (item.show && item.episode) {
            data = item.show; 
        }

        // 核心校验：必须有 IDs 且最好是 IMDb
        if (data && data.ids) {
            if (data.ids.imdb) {
                return { id: data.ids.imdb, type: "imdb" };
            } 
            // 降级：如果没有 IMDb，尝试 TMDB (Forward 某些组件可能支持，或者你可以自己转换)
            // 但为了稳妥，这里先只返回 IMDb，因为很多下游组件拿 TMDB ID 去拼 IMDb URL 会挂
            else if (data.ids.tmdb) {
                console.log(`跳过项目 ${data.title}: 仅有 TMDB ID (${data.ids.tmdb}) 无 IMDb ID`);
                return null; 
            }
        }
        return null;
    }).filter(Boolean); // 过滤掉 null

    console.log(`[解析完成] 有效项目数: ${results.length} (原数据: ${items.length})`);
    return results;
}

// --- 模块 1: Token 生成工具 ---
async function generateToken(params = {}) {
    const clientId = params.client_id;
    const clientSecret = params.client_secret;
    const code = params.auth_code;

    // 1. 检查必要参数
    if (!clientId || !clientSecret) {
        return [{ title: "配置缺失", body: "请在组件设置中填入 Client ID 和 Client Secret", type: "text" }];
    }

    // 2. 阶段 A：用户还没填 Code -> 生成授权链接
    if (!code) {
        const redirectUri = "urn:ietf:wg:oauth:2.0:oob";
        const authUrl = `https://trakt.tv/oauth/authorize?response_type=code&client_id=${clientId}&redirect_uri=${redirectUri}`;
        
        console.log("授权链接生成成功: " + authUrl);
        
        return [
            { 
                title: "👉 第一步：点击获取 Code", 
                body: "点击本行或复制日志中的链接，登录 Trakt 并允许授权。",
                url: authUrl, 
                type: "text"
            },
            {
                title: "第二步", 
                body: "授权后网页会显示 8 位代码。复制它，填入本组件配置的 [授权码] 栏，再次刷新。",
                type: "text"
            }
        ];
    }

    // 3. 阶段 B：用户填了 Code -> 换取 Token
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
            body: JSON.stringify(payload)
        });

        const data = typeof response.data === 'string' ? JSON.parse(response.data) : response.data;

        if (data.access_token) {
            return [
                {
                    title: "✅ 成功！Access Token",
                    body: data.access_token, // 放在 body 方便复制
                    type: "text"
                },
                {
                    title: "使用说明",
                    body: "请复制上方 Token，填入 [Trakt 列表] 模块的 OAuth Token 栏。",
                    type: "text"
                }
            ];
        } else {
            return [{ title: "❌ 获取失败", body: "Code 可能无效或已过期，请清空 Code 栏重新获取。", type: "text" }];
        }
    } catch (e) {
        return [{ title: "网络错误", body: e.message, type: "text" }];
    }
}

// --- 模块 2: 内容加载 (Watchlist, History, Recommendations) ---
async function loadInterestItems(params = {}) {
    const clientId = params.client_id;
    const token = params.oauth_token;
    const userName = params.user_name;
    const status = params.status || "watchlist";
    const page = params.page || 1;
    
    if (!clientId) {
        console.log("❌ 错误：缺少 Client ID");
        return [];
    }

    let endpoint = "";
    // 默认参数：获取详细信息(为了拿到imdb id)，分页
    let apiParams = { page: page, limit: 20, extended: "full" };

    // --- 逻辑分支 ---

    // A. 个性化推荐 (必须 Token)
    if (status === "recommendations") {
        if (!token) return []; // 无 Token 无法获取
        endpoint = "/recommendations/movies"; 
        apiParams.ignore_collected = "true";
    }
    // B. 热门趋势 (公开)
    else if (status === "trending") {
        endpoint = "/movies/trending";
    }
    // C. 正在追剧 (必须 Token)
    else if (status === "progress") {
        if (!token) return []; 
        endpoint = "/sync/playback/episodes";
    }
    // D. Watchlist (混合模式)
    else if (status === "watchlist") {
        if (token) {
            // 有 Token -> 查自己的私密 Watchlist
            endpoint = "/sync/watchlist";
            apiParams.sort = "rank,asc"; 
        } else if (userName) {
            // 无 Token -> 查公开用户的 Watchlist
            endpoint = `/users/${userName}/watchlist`;
        } else {
            console.log("Watchlist 需 Token 或 用户名");
            return [];
        }
    }
    // E. History (混合模式)
    else if (status.startsWith("history")) {
        const type = status.includes("shows") ? "shows" : "movies";
        if (token) {
            endpoint = `/sync/history/${type}`;
        } else if (userName) {
            endpoint = `/users/${userName}/history/${type}`;
        } else {
            return [];
        }
    }

    // 执行请求
    const data = await fetchTraktApi(endpoint, clientId, token, apiParams);
    
    // 解析结果
    return parseTraktItems(data);
}

// --- 模块 3: 自定义片单 ---
async function loadListItems(params = {}) {
    const clientId = params.client_id;
    const token = params.oauth_token; // 选填，如果是私密片单则需要
    const userName = params.user_name;
    const listName = params.list_name;
    const page = params.page || 1;

    if (!clientId || !userName || !listName) {
        console.log("片单模式参数不全");
        return [];
    }

    const endpoint = `/users/${userName}/lists/${listName}/items`;
    const apiParams = { page: page, limit: 20, extended: "full" };

    const data = await fetchTraktApi(endpoint, clientId, token, apiParams);
    return parseTraktItems(data);
}
