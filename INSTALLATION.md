# 安裝指南 V2.0

## 📋 系統需求

- **瀏覽器**: Google Chrome 114 或更新版本
- **作業系統**: Windows、macOS、Linux（支援 Chrome 的系統）

### 確認 Chrome 版本
1. 開啟 Chrome
2. 進入 `chrome://version/`
3. 確認版本號 ≥ 114

---

## 🚀 安裝步驟

### 方法一：開發模式載入（推薦）

1. **下載專案**
   - 下載此 `youtube-subtitle-book-v2` 資料夾到本機

2. **開啟擴充功能頁面**
   - 在 Chrome 網址列輸入：`chrome://extensions/`
   - 或點擊 選單 > 更多工具 > 擴充功能

3. **開啟開發人員模式**
   - 點擊右上角的「開發人員模式」開關

4. **載入擴充功能**
   - 點擊「載入未封裝項目」
   - 選擇 `youtube-subtitle-book-v2` 資料夾
   - 完成！

5. **確認安裝**
   - 擴充功能列表中應出現「YouTube字幕電子書製作器 (V2 Modern UI)」
   - 工具列應出現紅色 YouTube 圖示

---

## ✅ 驗證安裝

### 檢查清單
- [ ] 擴充功能已載入
- [ ] 沒有錯誤訊息（紅色背景）
- [ ] 工具列有圖示
- [ ] 版本顯示 2.0.0

### 測試側邊面板
1. 前往任意 YouTube 影片
2. 點擊擴充功能圖示
3. 側邊面板應開啟
4. 可看到「字幕電子書」標題

---

## ❗ 疑難排解

### 問題 1: 無法載入擴充功能

**症狀**：載入時出現錯誤

**解決方案**：
1. 確認資料夾結構正確：
   ```
   youtube-subtitle-book-v2/
   ├── manifest.json  ← 必須在資料夾根目錄
   ├── background.js
   ├── sidepanel.html
   └── ...
   ```
2. 確認是選擇整個資料夾，不是單一檔案

### 問題 2: manifest 錯誤

**症狀**：`Error: manifest.json` 相關錯誤

**解決方案**：
1. 確認 Chrome 版本 ≥ 114（支援 Side Panel API）
2. 確認 `manifest.json` 檔案沒有語法錯誤

### 問題 3: 圖示不顯示

**症狀**：工具列沒有擴充功能圖示

**解決方案**：
1. 點擊工具列的拼圖圖示
2. 找到「YouTube字幕電子書製作器」
3. 點擊釘選圖示

### 問題 4: 側邊面板無法開啟

**症狀**：點擊圖示沒有反應

**解決方案**：
1. 確認在 YouTube 網站上
2. 重新載入擴充功能
3. 檢查 `chrome://extensions/` 是否有錯誤

### 問題 5: 權限問題

**症狀**：擴充功能無法運作

**解決方案**：
確認已授予所需權限：
- 存取 YouTube 網站
- 儲存空間

---

## 🔄 更新擴充功能

### 方法
1. 前往 `chrome://extensions/`
2. 找到擴充功能
3. 點擊「重新載入」按鈕（圓形箭頭）

### 注意事項
- 更新後原有資料仍會保留
- 建議更新前先「匯出全部」備份

---

## 🗑️ 移除擴充功能

1. 前往 `chrome://extensions/`
2. 找到「YouTube字幕電子書製作器」
3. 點擊「移除」
4. 確認移除

### 注意
移除後，儲存的字幕資料將會清除。
建議先使用「匯出全部」功能備份。

---

## 📁 檔案結構確認

確認資料夾包含以下必要檔案：

```
youtube-subtitle-book-v2/
├── manifest.json          ← 必須
├── background.js          ← 必須
├── sidepanel.html         ← 必須
├── sidepanel.js           ← 必須
├── content.js             ← 必須
├── content.css            ← 必須
├── reader.html            ← 必須
├── reader.js              ← 必須
├── reader.css             ← 必須
├── library.html           ← 必須
├── library.js             ← 必須
├── subtitleDetection.js   ← 必須
├── theme.css              ← 必須
├── jspdf.umd.min.js       ← 必須
├── icon16.png             ← 必須
├── icon48.png             ← 必須
└── icon128.png            ← 必須
```

---

## 💡 小技巧

### 固定側邊面板
- 側邊面板可以調整寬度
- 拖曳邊緣即可調整

### 快速存取
- 將擴充功能圖示釘選到工具列
- 下次可快速點擊開啟

### 同時開啟
- 側邊面板和影片頁面可同時操作
- 不需要切換視窗

---

## 📞 需要幫助？

如果仍有問題：
1. 檢查 [DEBUG_GUIDE.md](DEBUG_GUIDE.md)
2. 開啟開發者工具（F12）查看 Console 錯誤
3. 確認 Chrome 版本和權限

---

**安裝完成後，前往 [QUICK_START.md](QUICK_START.md) 開始使用！**
