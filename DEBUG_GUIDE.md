# 除錯指南 V2.0

## 🔧 開發者工具使用

### 開啟開發者工具
1. 按 `F12` 或 `Cmd+Option+I` (Mac)
2. 切換到 Console 分頁

### 不同頁面的 Console

#### Side Panel
1. 前往 `chrome://extensions/`
2. 找到擴充功能
3. 點擊「Service Worker」連結
4. 開啟開發者工具

#### Content Script (YouTube 頁面)
1. 在 YouTube 頁面按 F12
2. Console 會顯示 content.js 的日誌

#### Reader 頁面
1. 在閱讀器視窗按 F12
2. Console 會顯示 reader.js 的日誌

---

## 🐛 常見問題診斷

### 問題 1: 側邊面板無法開啟

**症狀**：點擊擴充功能圖示沒反應

**檢查步驟**：
1. 確認 Chrome 版本 ≥ 114
2. 檢查 Service Worker 是否有錯誤
3. 查看 `chrome://extensions/` 是否有紅色錯誤

**解決方案**：
```javascript
// 在 Service Worker Console 檢查
// 應該看到 "Side panel registered" 訊息
```

### 問題 2: 截圖全黑

**症狀**：製作完成但截圖是黑色

**檢查步驟**：
1. 確認字幕區域高度設定正確
2. 檢查影片是否有硬編碼字幕
3. 開啟 Console 查看錯誤

**解決方案**：
- 調整「字幕區域高度」（嘗試 10%-25%）
- 調整「底部邊界」

### 問題 3: 無法存取 YouTube

**症狀**：顯示「請在 YouTube 頁面使用」

**檢查步驟**：
1. 確認網址是 `https://www.youtube.com/watch?v=...`
2. 確認擴充功能有權限存取 YouTube

**解決方案**：
1. 前往 `chrome://extensions/`
2. 點擊擴充功能的「詳細資訊」
3. 確認「網站存取權」包含 YouTube

### 問題 4: 閱讀器無法開啟

**症狀**：點擊開啟閱讀器沒反應

**檢查步驟**：
1. 檢查 Console 是否有錯誤
2. 確認 Storage 中有資料

**診斷指令**：
```javascript
// 在 YouTube 頁面 Console 執行
chrome.storage.local.get(null, (data) => {
  console.log('Storage 資料:', data);
});
```

### 問題 5: 編輯後資料遺失

**症狀**：編輯完成後重新開啟資料消失

**檢查步驟**：
1. 檢查 Storage 是否正確寫入
2. 確認沒有覆蓋問題

**診斷指令**：
```javascript
// 在 Reader Console 執行
chrome.storage.local.get(['liveCapture'], (data) => {
  console.log('Live Capture 資料:', data);
});
```

---

## 📊 日誌訊息說明

### Side Panel 日誌
```
[sidepanel] 設定已載入
[sidepanel] 開始製作...
[sidepanel] 進度更新: 50%
[sidepanel] 製作完成
```

### Content Script 日誌
```
[content] 收到 startCapture 訊息
[content] 開始截圖: 0s
[content] 截圖完成: 100 張
[content] 儲存到 Storage
```

### Reader 日誌
```
[reader] 載入資料...
[reader] 頁面數: 20
[reader] 顯示第 1 頁
[reader] 編輯已儲存
```

---

## 🔍 Storage 檢查

### 查看所有資料
```javascript
chrome.storage.local.get(null, (data) => {
  console.log('所有 Storage 資料:');
  Object.keys(data).forEach(key => {
    const size = JSON.stringify(data[key]).length;
    console.log(`  ${key}: ${(size/1024).toFixed(2)} KB`);
  });
});
```

### 查看特定段落
```javascript
// 列出所有段落
chrome.storage.local.get(['savedSegments'], (data) => {
  console.log('已儲存段落:', data.savedSegments);
});

// 查看特定段落資料
chrome.storage.local.get(['segment_VIDEO_ID_TIMESTAMP'], (data) => {
  console.log('段落資料:', data);
});
```

### 清除資料（謹慎使用）
```javascript
// 清除所有資料
chrome.storage.local.clear(() => {
  console.log('已清除所有資料');
});

// 清除特定資料
chrome.storage.local.remove(['key1', 'key2'], () => {
  console.log('已清除');
});
```

---

## ⚠️ 錯誤訊息對照

| 錯誤訊息 | 原因 | 解決方案 |
|----------|------|----------|
| `找不到影片元素` | 頁面未載入或不是影片頁 | 等待頁面載入完成 |
| `請在 YouTube 頁面使用` | 不在 YouTube 域名 | 前往 YouTube |
| `Storage 超限` | 資料量過大 | 刪除舊資料 |
| `無法載入資料` | Storage 讀取失敗 | 重新載入擴充功能 |
| `影片載入失敗` | 影片跳轉失敗 | 檢查網路連線 |

---

## 🛠️ 進階除錯

### 監聽 Storage 變化
```javascript
chrome.storage.onChanged.addListener((changes, area) => {
  console.log('Storage 變化:', area);
  for (let key in changes) {
    console.log(`  ${key}:`, changes[key]);
  }
});
```

### 檢查訊息傳遞
```javascript
// 在 Content Script Console
chrome.runtime.onMessage.addListener((msg, sender, respond) => {
  console.log('收到訊息:', msg);
  console.log('來源:', sender);
});
```

### 效能監控
```javascript
// 計算截圖時間
console.time('截圖');
// ... 截圖操作
console.timeEnd('截圖');
```

---

## 📝 回報問題

回報問題時請提供：
1. Chrome 版本
2. 擴充功能版本 (2.0.0)
3. 錯誤訊息（完整）
4. 重現步驟
5. 影片網址（如可分享）

### 收集日誌
1. 開啟開發者工具
2. 右鍵 Console
3. 選擇「Save as...」
4. 附上日誌檔案

---

## 🔄 重設擴充功能

如果問題持續：

1. **重新載入擴充功能**
   - 前往 `chrome://extensions/`
   - 點擊重新載入按鈕

2. **清除並重新安裝**
   - 移除擴充功能
   - 重新載入

3. **完全重設**
   ```javascript
   // 清除所有擴充功能資料
   chrome.storage.local.clear();
   // 然後重新載入擴充功能
   ```

---

**需要更多幫助？請查看 [TEST_CHECKLIST.md](TEST_CHECKLIST.md) 進行系統性測試。**
