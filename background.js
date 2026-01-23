// Background Service Worker
// 處理擴充套件圖示點擊事件，開啟 Side Panel

chrome.action.onClicked.addListener((tab) => {
    // 點擊擴充套件圖示時開啟 Side Panel
    chrome.sidePanel.open({ windowId: tab.windowId });
});

// 設定 Side Panel 行為
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
    .catch((error) => console.error('設定 Side Panel 行為失敗:', error));

// 建立右鍵選單
chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.create({
        id: 'openLibraryManager',
        title: '📚 開啟書庫總管理',
        contexts: ['action'] // 只在擴充套件圖示右鍵時顯示
    });
});

// 處理右鍵選單點擊
chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === 'openLibraryManager') {
        // 開啟總 Library Manager 視窗
        chrome.windows.create({
            url: chrome.runtime.getURL('all-libraries.html'),
            type: 'popup',
            width: 900,
            height: 700,
            left: 100,
            top: 50
        });
    }
});
