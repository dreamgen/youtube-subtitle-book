# 🧪 快速測試指南 - 儲存同步修正

## 📋 測試前準備

### 1. 重新載入擴充功能
```
1. 開啟 chrome://extensions/
2. 找到「YouTube字幕電子書製作器」
3. 點擊「重新載入」圖示（🔄）
```

### 2. 開啟開發者工具
```
1. 前往任何 YouTube 影片頁面
2. 按 F12 開啟開發者工具
3. 切換到 Console 標籤
4. 保持開啟狀態以觀察日誌
```

---

## ✅ 核心測試（5 分鐘）

### 測試 1: 基本修改保存 ⭐⭐⭐
**目的**：驗證修改會被永久保存

#### 步驟
1. 在 YouTube 影片頁面製作電子書（或開啟即時閱讀）
2. 點擊擴充功能 → 「📖 即時閱讀」
3. 在閱讀器中點擊任一截圖的「+0.2s ►」按鈕
4. **預期結果**：
   - ✅ 截圖立即更新
   - ✅ 右上角顯示「✅ 修改已自動保存」（綠色提示框）
   - ✅ 提示框 2 秒後自動消失
5. **檢查 Console**：
   ```
   🔄 開始同步資料到所有 storage...
   ✅ 已同步到 captureData
   ✅ 已同步到 segment: xxx (如果有對應 segment)
   ✅ 所有 storage 同步完成
   ```
6. 關閉閱讀器分頁
7. 再次開啟「📖 即時閱讀」
8. **驗證**：
   - ✅ 修改後的截圖仍然存在（時間已改變）

**✅ PASS** = 修改被永久保存
**❌ FAIL** = 修改消失，回到原始狀態

---

### 測試 2: 新增上方字幕 ⭐⭐
**目的**：驗證新增操作會被保存

#### 步驟
1. 在即時閱讀器中找到有「⬆ 上方」按鈕的截圖
2. 點擊「⬆ 上方」按鈕
3. **預期結果**：
   - ✅ 新增一張上方字幕截圖（插入在當前截圖前）
   - ✅ 顯示「✅ 修改已自動保存」
4. 關閉並重新開啟閱讀器
5. **驗證**：
   - ✅ 新增的上方字幕截圖仍存在

---

### 測試 3: 刪除截圖 ⭐⭐
**目的**：驗證刪除操作會被保存

#### 步驟
1. 在即時閱讀器中點擊任一截圖的「🗑」按鈕
2. **預期結果**：
   - ✅ 該截圖被移除
   - ✅ 顯示「✅ 修改已自動保存」
3. 關閉並重新開啟閱讀器
4. **驗證**：
   - ✅ 被刪除的截圖不會出現

---

## 🔍 進階測試（選做）

### 測試 4: 載入段落後的修改
**目的**：驗證 segment 同步正常

#### 前置條件
- 已有儲存的段落資料

#### 步驟
1. 在 popup 中選擇一個段落並點擊「載入段落」
2. 開啟即時閱讀器
3. 進行修改（例如調整時間）
4. 關閉閱讀器
5. 再次「載入段落」（選擇同一個段落）
6. 開啟閱讀器
7. **驗證**：
   - ✅ 修改仍然存在

---

### 測試 5: Console 日誌驗證
**目的**：確認同步機制正常運作

#### 步驟
1. 在 YouTube 頁面保持 Console 開啟
2. 在即時閱讀器中進行任何修改
3. 回到 YouTube 頁面檢查 Console

#### 預期日誌
```javascript
🔄 開始同步資料到所有 storage...
✅ 已同步到 captureData
```

**如果有對應的 segment**：
```javascript
✅ 已同步到 segment: 1737359400000_1737359700000
✅ 所有 storage 同步完成
```

**如果沒有對應的 segment**：
```javascript
ℹ️ 找不到匹配的 segment，可能是新製作的內容
✅ 所有 storage 同步完成
```

---

## 🐛 除錯方法

### 問題 1: 沒有顯示保存提示
**可能原因**：
- reader.html 沒有正確載入新的樣式
- reader.js 沒有正確載入新的函數

**檢查方法**：
```javascript
// 在 reader 分頁的 Console 執行
document.getElementById('saveStatus')  // 應該回傳 <div> 元素
```

**解決方法**：
```
1. 確認已重新載入擴充功能
2. 關閉所有 reader 分頁
3. 重新開啟 reader
```

---

### 問題 2: Console 沒有同步日誌
**可能原因**：
- content.js 沒有正確載入新的程式碼

**檢查方法**：
```javascript
// 在 YouTube 頁面的 Console 執行
typeof syncToAllStorage  // 應該回傳 "function"
```

**解決方法**：
```
1. 重新載入擴充功能
2. 重新整理 YouTube 頁面（F5）
3. 再次測試
```

---

### 問題 3: 修改仍然消失
**檢查步驟**：

#### Step 1: 驗證 liveCapture 是否更新
```javascript
chrome.storage.local.get(['liveCapture'], (r) => {
  console.log('liveCapture pages:', r.liveCapture?.pages);
});
```

#### Step 2: 驗證 captureData 是否同步
```javascript
chrome.storage.local.get(['captureData'], (r) => {
  console.log('captureData pages:', r.captureData?.pages);
});
```

#### Step 3: 比對資料
```javascript
// 兩者的 pages 應該相同
chrome.storage.local.get(['liveCapture', 'captureData'], (r) => {
  const live = r.liveCapture?.pages || [];
  const capture = r.captureData?.pages || [];
  console.log('liveCapture pages count:', live.length);
  console.log('captureData pages count:', capture.length);
  console.log('相同?', JSON.stringify(live) === JSON.stringify(capture));
});
```

---

## 📊 測試結果記錄表

| 測試項目 | 結果 | 備註 |
|---------|------|------|
| ✅ 測試 1: 基本修改保存 | ☐ PASS ☐ FAIL | |
| ✅ 測試 2: 新增上方字幕 | ☐ PASS ☐ FAIL | |
| ✅ 測試 3: 刪除截圖 | ☐ PASS ☐ FAIL | |
| ✅ 測試 4: 載入段落後修改 | ☐ PASS ☐ FAIL | |
| ✅ 測試 5: Console 日誌 | ☐ PASS ☐ FAIL | |

---

## 🎯 預期結果總結

### 全部通過時
- ✅ 所有修改操作都會永久保存
- ✅ 每次修改都會顯示保存提示
- ✅ Console 顯示完整的同步日誌
- ✅ liveCapture、captureData、segment 三者資料一致

### 如果失敗
請參考上方的除錯方法，或查看詳細文件：
- [STORAGE_SYNC_FIX.md](STORAGE_SYNC_FIX.md) - 修正詳細說明
- [DEBUG_GUIDE.md](DEBUG_GUIDE.md) - 除錯指南

---

**開始測試！** 🚀

_測試時間預估：核心測試 5 分鐘，進階測試 10 分鐘_
