// Trakt 组件 (OAuth 自动化版)
WidgetMetadata = {
    id: "Trakt_OAuth_Auto",
    title: "Trakt (OAuth版)",
    modules: [{
            title: "🔑 获取/更新 Token (运行此项)",
            requiresWebView: false,
            functionName: "getOAuthToken", // 新增的认证函数
            cacheDuration: 0, // 不缓存
            params: [{
                    name: "client_id",
                    title: "Client ID",
                    type: "input",
                    description: "必须填写。在 Trakt 官网申请 App 获取。",
                },
                {
                    name: "client_secret",
                    title: "Client Secret",
                    type: "input",
                    description: "必须填写。在 Trakt 官网申请 App 获取。",
                }
            ],
        },
        {
            title: "Trakt 我看 (需Token)",
            requiresWebView: false,
            functionName: "loadInterestItems",
            cacheDuration: 3600,
            params: [{
                    name: "oauth_token",
                    title: "OAuth Token",
                    type: "input",
                    description: "运行上方'获取Token'模块后，将日志里的Token复制到这里",
                },
                {
                    name: "client_id",
                    title: "Client ID",
                    type: "input",
                    description: "必须填写",
                },
                {
                    name: "status",
                    title: "状态",
                    type: "enumeration",
                    enumOptions: [{
                            title: "想看 (Watchlist)",
                            value: "sync/watchlist", // 接口变更为 sync
                        },
                        {
                            title: "看过-电影 (History)",
                            value: "sync/history/movies",
                        },
                        {
                            title: "看过-电视 (History)",
                            value: "sync/history/shows",
                        },
                        {
                            title: "在看 (Progress)", // 终于可以用这个了！
                            value: "sync/playback",
                        }
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
            title: "Trakt 推荐 (需Token)",
            requiresWebView: false,
            functionName: "loadSuggestionItems",
            cacheDuration: 43200,
            params: [{
                    name: "oauth_token",
                    title: "OAuth Token",
                    type: "input",
                },
                {
                    name: "client_id",
                    title: "Client ID",
                    type: "input",
                },
                {
                    name: "type",
                    title: "类型",
                    type: "enumeration",
                    enumOptions: [{
                            title: "个性化推荐电影",
                            value: "recommendations/movies",
                        },
                        {
                            title: "个性化推荐电视",
                            value: "recommendations/shows",
                        },
                    ],
                },
            ],
        }
    ],
    version: "3.0.0",
    description: "支持自动 OAuth 流程。请先填写 ID 和 Secret 运行第一个模块获取 Token，然后填入 Token 使用其他功能。",
    author: "Refactored_AI"
};

// --- 辅助工具：延时函数 ---
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// --- 核心功能 1: 自动获取 Token (Device Flow) ---
async function getOAuthToken(params = {}) {
    const clientId = params.client_id;
    const clientSecret = params.client_secret;

    if (!clientId || !clientSecret) {
        console.error("❌ 错误：必须填写 Client ID 和 Client Secret 才能获取 Token");
        return { error: "Missing Credentials" };
    }

    console.log("🚀 开始 Device Code 授权流程...");

    // 1. 请求设备代码
    const codeUrl = "https://api.trakt.tv/oauth/device/code";
    const codeBody = {
        client_id: clientId
    };

    try {
        const codeRes = await Widget.http.post(codeUrl, {
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(codeBody)
        });

        const codeData = JSON.parse(codeRes.data);
        const userCode = codeData.user_code;
        const verificationUrl = codeData.verification_url;
        const deviceCode = codeData.device_code;
        const interval = codeData.interval || 5;
        const expiresIn = codeData.expires_in;

        console.log(`\n⚠️ --- 请执行以下操作 ---`);
        console.log(`1. 复制此代码: 【 ${userCode} 】`);
        console.log(`2. 浏览器打开: ${verificationUrl}`);
        console.log(`3. 在网页输入代码并点击 "Yes" 授权`);
        console.log(`(脚本正在后台等待您的授权...)\n`);

        // 2. 轮询等待用户授权
        const tokenUrl = "https://api.trakt.tv/oauth/device/token";
        const tokenBody = {
            code: deviceCode,
            client_id: clientId,
            client_secret: clientSecret
        };

        let attempts = 0;
        const maxAttempts = expiresIn / interval;

        while (attempts < maxAttempts) {
            await sleep(interval * 1000); // 等待几秒
            attempts++;

            try {
                const tokenRes = await Widget.http.post(tokenUrl, {
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(tokenBody)
                });
                
                // 注意：如果未授权，Trakt 通常返回 400 Pending，Widget.http 可能会抛出异常或返回错误码
                // 这里假设 Widget.http 不会直接 throw，而是返回 status
                
                if (tokenRes.status === 200) {
                    const tokenData = JSON.parse(tokenRes.data);
                    const accessToken = tokenData.access_token;
                    
                    console.log(`\n✅ 授权成功！`);
                    console.log(`==========================================`);
                    console.log(`您的 OAuth Token (请复制下方字符串):`);
                    console.log(accessToken);
                    console.log(`==========================================`);
                    console.log(`请将此 Token 填入组件配置的 "OAuth Token" 栏位中。`);
                    
                    return { 
                        success: true, 
                        message: "Token获取成功，请查看日志",
                        token: accessToken 
                    };
                }
            } catch (e) {
                // 忽略 Pending 期间的 400 错误
            }
            
            console.log(`⏳ 等待授权中... (${attempts}/${Math.floor(maxAttempts)})`);
        }

        console.error("❌ 超时：未在规定时间内完成授权。");
        return { error: "Timeout" };

    } catch (e) {
        console.error("❌ 请求失败:", e);
        return { error: e.message };
    }
}

// --- 通用 API 请求 (带 Token) ---
async function fetchTraktApi(endpoint, clientId, token, params = {}) {
    const baseUrl = "https://api.trakt.tv";
    const queryString = Object.keys(params)
        .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`)
        .join('&');
    const url = `${baseUrl}${endpoint}?${queryString}`;

    try {
        const headers = {
            "Content-Type": "application/json",
            "trakt-api-version": "2",
            "trakt-api-key": clientId
        };
        
        if (token) {
            headers["Authorization"] = `Bearer ${token}`;
        }

        const response = await Widget.http.get(url, { headers });
        
        if (response.status !== 200) {
            console.error(`Error ${response.status}:`, response.data);
            return [];
        }
        return JSON.parse(response.data);
    } catch (e) {
        console.error("Fetch Error:", e);
        return [];
    }
}

// --- 数据解析 ---
function parseTraktItems(items) {
    if (!Array.isArray(items)) return [];
    return items.map(item => {
        const data = item.movie || item.show || item; // 兼容不同接口结构
        if (!data || !data.ids) return null;
        if (data.ids.imdb) return { id: data.ids.imdb, type: "imdb" };
        if (data.ids.tmdb) return { id: `${data.ids.tmdb}`, type: "tmdb" };
        return null;
    }).filter(Boolean);
}

// --- 模块 2: 我看 (支持私有数据) ---
async function loadInterestItems(params = {}) {
    const { oauth_token, client_id, status = "sync/watchlist", page = 1 } = params;
    if (!client_id || !oauth_token) return [];

    // status 示例: "sync/watchlist" 或 "sync/playback"
    let endpoint = `/${status}`;
    
    // 如果是 playback (在看)，不需要 page 参数，通常有 limit
    const apiParams = {
        extended: "full",
        page: page,
        limit: 20
    };
    
    if (status.includes("playback")) {
        // playback 接口略有不同，不需要 page，limit 默认 10
        delete apiParams.page;
        apiParams.limit = 20; 
    }

    const data = await fetchTraktApi(endpoint, client_id, oauth_token, apiParams);
    return parseTraktItems(data);
}

// --- 模块 3: 推荐 (支持个性化) ---
async function loadSuggestionItems(params = {}) {
    const { oauth_token, client_id, type = "recommendations/movies" } = params;
    if (!client_id || !oauth_token) return [];

    const endpoint = `/${type}`;
    const data = await fetchTraktApi(endpoint, client_id, oauth_token, { limit: 20, extended: "full" });
    return parseTraktItems(data);
}
