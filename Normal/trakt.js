// Trakt 本地调试版 (无网络请求)
// 如果这个版本能运行，说明之前的错误是因为 api.trakt.tv 连不上(被墙)

WidgetMetadata = {
    id: "Trakt_Debug_Local",
    title: "Trakt (本地调试)",
    modules: [
        {
            title: "调试模式-强制返回数据",
            requiresWebView: false,
            functionName: "loadInterestItems",
            cacheDuration: 0,
            params: [] // 不接受任何参数，防止参数校验报错
        }
    ],
    version: "1.0.0",
    description: "用于测试 Forward 是否能正常运行脚本。",
    author: "Debug_User",
};

// 这里的函数名必须和上面 functionName 一致
async function loadInterestItems(params) {
    console.log("✅ 正在执行本地调试脚本...");
    
    // 直接返回写死的 IMDb ID，不发起任何网络请求
    // 这样可以排除网络超时导致的“数据缺失”
    return [
        { id: "tt0816692", type: "imdb" }, // 星际穿越
        { id: "tt1375666", type: "imdb" }, // 盗梦空间
        { id: "tt0468569", type: "imdb" }  // 黑暗骑士
    ];
}

// 兼容性导出 (防止某些旧版本找不到函数)
globalThis.loadInterestItems = loadInterestItems;
