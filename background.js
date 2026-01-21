// Background Service Worker
// 處理擴充套件圖示點擊事件，開啟 Side Panel

chrome.action.onClicked.addListener((tab) => {
    // 點擊擴充套件圖示時開啟 Side Panel
    chrome.sidePanel.open({ windowId: tab.windowId });
});

// 設定 Side Panel 行為
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
    .catch((error) => console.error('設定 Side Panel 行為失敗:', error));
