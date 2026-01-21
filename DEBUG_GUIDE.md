# 🔧 除錯指南

## 問題：停在「組合頁面... 8」沒有出現「開啟閱讀器」

### 可能的原因

1. **chrome.runtime.sendMessage 失敗**
   - popup 關閉導致訊息接收器失效
   - 訊息發送失敗但沒有回應

2. **chrome.storage.local.set 失敗**
   - 資料太大超過限制
   - 權限問題

3. **進度更新遺失**
   - 100% 進度訊息沒有送達
   - popup 沒有正確接收訊息

## 如何除錯

### 步驟1: 開啟開發者工具

#### 在YouTube頁面（content script）
1. 在YouTube影片頁面按 `F12`
2. 切換到 `Console` 標籤
3. 點擊「開始製作電子書」
4. 觀察 Console 輸出

**應該看到的訊息：**
```
進度: 0% - 開始截圖...
進度: 10% - 截圖中... 30/300
...
進度: 50% - 組合頁面中...
進度: 52% - 組合頁面... 1
進度: 54% - 組合頁面... 2
...
進度: 95% - 儲存資料中...
資料已儲存
進度: 100% - 完成！已截取 300 張圖片，共 60 頁
```

**如果卡住，檢查：**
- 最後一行是什麼？
- 有沒有錯誤訊息（紅色）？
- 有沒有「資料已儲存」？

#### 在擴充功能 Popup（popup script）
1. 點擊擴充功能圖示（不要關閉）
2. 在 popup 上按右鍵 → `檢查`
3. 切換到 `Console` 標籤
4. 點擊「開始製作電子書」
5. 觀察 Console 輸出

**應該看到的訊息：**
```
收到進度更新: 0% 開始截圖...
收到進度更新: 10% 截圖中... 30/300
...
收到進度更新: 100% 完成！已截取 300 張圖片，共 60 頁
製作完成！顯示開啟閱讀器按鈕
```

**如果沒看到 100% 訊息：**
- popup 可能已關閉（訊息接收器失效）
- 訊息發送失敗

### 步驟2: 檢查常見問題

#### 問題1: Popup 關閉導致訊息遺失
**症狀：**
- YouTube Console 有「進度: 100%」
- Popup Console 沒有「收到進度更新: 100%」

**解決方法：**
保持 popup 開啟狀態，不要點擊其他地方

**或者：使用背景頁面**
1. 進入 `chrome://extensions/`
2. 找到本擴充功能
3. 點擊「檢查背景頁」（如果有）

#### 問題2: 資料太大無法儲存
**症狀：**
- Console 顯示「儲存失敗: QuotaExceededError」
- 沒有「資料已儲存」訊息

**解決方法：**
1. 減少截圖數量
   - 增加截圖間隔（改成 5 秒）
   - 使用較短的影片測試
2. 清除舊資料
   ```javascript
   // 在 Console 執行
   chrome.storage.local.clear()
   ```

#### 問題3: 進度卡在組合階段
**症狀：**
- 停在「組合頁面... 8」
- 後續沒有「儲存資料中...」或「完成！」

**檢查：**
```javascript
// 在 YouTube Console 執行
console.log('截圖數量:', captureData.screenshots.length);
console.log('頁面數量:', captureData.pages.length);
```

### 步驟3: 手動測試

#### 測試訊息傳遞
在 YouTube Console 執行：
```javascript
chrome.runtime.sendMessage({
  action: 'updateProgress',
  progress: 100,
  message: '測試完成'
}, (response) => {
  console.log('回應:', response);
  if (chrome.runtime.lastError) {
    console.error('錯誤:', chrome.runtime.lastError);
  }
});
```

#### 測試資料儲存
在 YouTube Console 執行：
```javascript
chrome.storage.local.set({ test: 'hello' }, () => {
  console.log('儲存測試完成');
  if (chrome.runtime.lastError) {
    console.error('儲存失敗:', chrome.runtime.lastError);
  }
});
```

#### 檢查已儲存的資料
在 YouTube Console 執行：
```javascript
chrome.storage.local.get('captureData', (result) => {
  if (result.captureData) {
    console.log('已儲存資料:');
    console.log('- 影片標題:', result.captureData.videoTitle);
    console.log('- 截圖數量:', result.captureData.screenshots.length);
    console.log('- 頁面數量:', result.captureData.pages.length);
  } else {
    console.log('沒有儲存的資料');
  }
});
```

## 臨時解決方案

### 方案1: 手動觸發「開啟閱讀器」按鈕

如果資料已經製作完成，但按鈕沒顯示：

1. 在 Popup Console 執行：
```javascript
document.getElementById('openViewer').style.display = 'block';
```

2. 或者直接在 YouTube 頁面 Console 執行：
```javascript
openViewer();
```

### 方案2: 檢查並修復資料

在 YouTube Console 執行：
```javascript
chrome.storage.local.get('captureData', (result) => {
  if (result.captureData) {
    window.captureData = result.captureData;
    console.log('資料已載入，可以開啟閱讀器');
    openViewer();
  }
});
```

### 方案3: 重新載入擴充功能

1. 進入 `chrome://extensions/`
2. 找到「YouTube字幕電子書製作器」
3. 點擊「重新載入」圖示（🔄）
4. 重新整理 YouTube 頁面
5. 再次嘗試

## 已修復的問題

### v0.2.1 修復（最新版）

1. **加入錯誤處理**
   - `updateProgress` 加入 try-catch
   - `chrome.storage.local.set` 加入錯誤處理
   - 所有訊息發送都有回應處理

2. **加入除錯訊息**
   - 所有進度都會輸出到 Console
   - 儲存成功/失敗訊息
   - Popup 收到進度的訊息

3. **改進訊息機制**
   - `sendResponse` 必定回應
   - `return true` 保持通道開啟
   - 進度 >= 100 (不只 === 100)

4. **新增儲存階段**
   - 95% - 儲存資料中...
   - 100% - 完成！

## 最佳實踐

### 使用時
1. ✅ 保持 popup 開啟（不要關閉或切換）
2. ✅ 開啟 Console 觀察進度
3. ✅ 測試前清除舊資料
4. ✅ 從短影片開始測試

### 測試時
1. ✅ 使用 5 分鐘以內的影片
2. ✅ 截圖間隔設定 3-5 秒
3. ✅ 每頁行數設定 3-5 行
4. ✅ 觀察 Console 是否有錯誤

## 回報問題

如果問題持續，請記錄：

1. **YouTube Console 的最後幾行訊息**
2. **Popup Console 的所有訊息**
3. **影片長度**
4. **設定參數**（截圖間隔、每頁行數）
5. **Chrome 版本**

---

**更新後請重新載入擴充功能！**

1. `chrome://extensions/`
2. 找到本擴充功能
3. 點擊「重新載入」🔄
4. 重新整理 YouTube 頁面
5. 再次測試
