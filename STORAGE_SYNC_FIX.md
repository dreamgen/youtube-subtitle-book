# 🔧 即時閱讀修改結果儲存修正

## 修正日期
2026-01-20

---

## 🐛 問題描述

### 症狀
在即時閱讀器（reader.html）中進行的修改操作：
- ✅ 當下立即顯示更新
- ❌ 關閉並重新開啟閱讀器後，修改消失
- ❌ 載入段落資料後，修改被舊資料覆蓋

### 根本原因
系統使用三個獨立的 Chrome Storage Keys：
1. `captureData` - 完整製作資料（舊版）
2. `liveCapture` - 即時閱讀資料（新版）
3. `segment_xxx` - 分段儲存資料

**問題**：修改只更新 `liveCapture`，沒有同步到其他 storage，導致資料不一致。

---

## ✅ 修正方案

### 實施策略
採用 **自動同步機制** + **視覺回饋**：
- 每次調整截圖時，自動同步到所有相關 storage
- 顯示「✅ 修改已自動保存」提示，讓使用者知道修改已保存

---

## 📝 修改內容

### 1. content.js

#### 新增函數：`syncToAllStorage()`
**位置**：handleReaderAdjustment() 之後

**功能**：
```javascript
async function syncToAllStorage(liveData) {
  // 1. 同步到 captureData
  captureData.pages = liveData.pages;
  await chrome.storage.local.set({ captureData });

  // 2. 同步到對應的 segment_xxx
  // 透過 videoId 和時間範圍匹配找到對應的 segment
  // 更新該 segment 的 pages 資料
}
```

**特點**：
- ✅ 完整的錯誤處理
- ✅ 詳細的 Console 日誌
- ✅ 即使同步失敗也不中斷操作
- ✅ 智慧匹配 segment（允許 2 秒時間誤差）

#### 修改函數：`handleReaderAdjustment()`
**變更**：
```javascript
// 原本：
await chrome.storage.local.set({ liveCapture: data });
return { success: true };

// 修改後：
await chrome.storage.local.set({ liveCapture: data });
await syncToAllStorage(data);  // 🆕 新增同步
return { success: true };
```

---

### 2. reader.html

#### 新增 CSS 樣式
```css
.save-status {
    position: fixed;
    top: 20px;
    right: 20px;
    background: #4CAF50;
    color: white;
    padding: 12px 20px;
    border-radius: 8px;
    font-size: 14px;
    font-weight: bold;
    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.3);
    z-index: 10000;
    animation: slideIn 0.3s ease-out;
}

@keyframes slideIn {
    from { transform: translateX(100%); opacity: 0; }
    to { transform: translateX(0); opacity: 1; }
}
```

#### 新增 HTML 元素
```html
<!-- 保存狀態提示 -->
<div class="save-status" id="saveStatus" style="display: none;">
    ✅ 修改已自動保存
</div>
```

**特點**：
- 🎨 從右側滑入動畫
- 🎯 固定在右上角
- ⏱️ 2 秒後自動消失

---

### 3. reader.js

#### 新增函數：`showSaveStatus()`
```javascript
function showSaveStatus() {
    const saveStatus = document.getElementById('saveStatus');
    if (!saveStatus) return;

    saveStatus.style.display = 'block';

    // 2 秒後自動隱藏
    setTimeout(() => {
        saveStatus.style.display = 'none';
    }, 2000);
}
```

#### 修改函數：`adjustScreenshot()`
**變更**：
```javascript
// 原本：
if (!response.success) {
    alert('操作失敗: ' + (response.error || '未知錯誤'));
}

// 修改後：
if (!response.success) {
    alert('操作失敗: ' + (response.error || '未知錯誤'));
} else {
    showSaveStatus();  // 🆕 顯示保存提示
}
```

---

## 🔄 資料流向（修正後）

### 調整截圖流程
```
使用者點擊調整按鈕（向前/向後/新增上方/刪除）
              ↓
reader.js: adjustScreenshot()
              ↓
發送訊息到 content.js: adjustScreenshotForReader
              ↓
content.js: handleReaderAdjustment()
              ↓
修改 liveCapture.pages[pageIndex].screenshots[]
              ↓
await chrome.storage.local.set({ liveCapture: data })
              ↓
🆕 await syncToAllStorage(data)
    ├─ 更新 captureData.pages
    ├─ 尋找匹配的 segment
    └─ 更新 segment_xxx.pages
              ↓
reader.js 收到成功回應
              ↓
🆕 showSaveStatus() - 顯示「✅ 修改已自動保存」
              ↓
storage.onChanged 觸發
              ↓
reader.js 自動重新載入頁面顯示
```

---

## 📊 修正效果對比

### 修正前
| 操作 | liveCapture | captureData | segment_xxx | 結果 |
|------|------------|-------------|-------------|------|
| 調整截圖 | ✅ 更新 | ❌ 未更新 | ❌ 未更新 | 重新開啟後消失 |
| 載入段落 | - | - | - | ❌ 覆蓋修改 |

### 修正後
| 操作 | liveCapture | captureData | segment_xxx | 結果 |
|------|------------|-------------|-------------|------|
| 調整截圖 | ✅ 更新 | ✅ 自動同步 | ✅ 自動同步 | ✅ 永久保存 |
| 載入段落 | - | - | - | ✅ 保留修改 |

---

## 🎯 測試步驟

### 測試場景 1: 基本調整
1. 開啟即時閱讀器
2. 點擊「向前 +0.2s」按鈕
3. 確認：
   - ✅ 截圖立即更新
   - ✅ 顯示「✅ 修改已自動保存」提示（2秒後消失）
4. 關閉閱讀器
5. 重新開啟閱讀器
6. 確認：
   - ✅ 修改仍然存在

### 測試場景 2: 新增上方字幕
1. 開啟即時閱讀器
2. 點擊「⬆ 上方」按鈕
3. 確認：
   - ✅ 新增上方字幕截圖
   - ✅ 顯示保存提示
4. 重新開啟閱讀器
5. 確認：
   - ✅ 上方字幕仍存在

### 測試場景 3: 刪除截圖
1. 開啟即時閱讀器
2. 點擊「🗑」按鈕刪除一行
3. 確認：
   - ✅ 截圖被刪除
   - ✅ 顯示保存提示
4. 重新開啟閱讀器
5. 確認：
   - ✅ 截圖仍被刪除

### 測試場景 4: 載入段落後修改
1. 在 popup 中點擊「載入段落」
2. 開啟即時閱讀器
3. 進行修改（例如調整時間）
4. 確認：
   - ✅ 顯示保存提示
5. 關閉閱讀器
6. 再次「載入段落」
7. 開啟閱讀器
8. 確認：
   - ✅ 修改仍然存在（segment 已同步）

---

## 🔍 除錯指引

### Console 訊息
修改截圖時，YouTube 頁面的 Console 應該看到：

```
🔄 開始同步資料到所有 storage...
✅ 已同步到 captureData
ℹ️ 找不到匹配的 segment，可能是新製作的內容
✅ 所有 storage 同步完成
```

或者（如果找到匹配的 segment）：
```
🔄 開始同步資料到所有 storage...
✅ 已同步到 captureData
✅ 已同步到 segment: 1737359400000_1737359700000
✅ 所有 storage 同步完成
```

### 驗證資料同步
在 YouTube 頁面 Console 執行：
```javascript
// 檢查 liveCapture
chrome.storage.local.get(['liveCapture'], (r) => {
  console.log('liveCapture pages:', r.liveCapture?.pages?.length);
});

// 檢查 captureData
chrome.storage.local.get(['captureData'], (r) => {
  console.log('captureData pages:', r.captureData?.pages?.length);
});

// 檢查所有 segments
chrome.storage.local.get(['savedSegments'], (r) => {
  console.log('Segments:', r.savedSegments);
});
```

三者的 pages 數量和內容應該一致。

---

## ⚠️ 注意事項

### Storage 配額
- Chrome Storage 有大小限制（約 5-10 MB）
- 三份資料可能會超出限制
- **建議**：未來版本考慮統一使用 `liveCapture`，移除 `captureData`

### 效能考量
- 每次調整都會寫入三個 storage
- 對於頻繁調整可能較慢
- **目前方案**：已接受此代價以確保資料一致性
- **未來改進**：可考慮 debounce 機制

### 向後相容性
- ✅ 不影響舊版功能
- ✅ 舊的 captureData 仍可使用
- ✅ 新舊 storage 並存運作

---

## 📁 修改檔案清單

1. **content.js** (youtube-subtitle-book/content.js)
   - 新增 `syncToAllStorage()` 函數
   - 修改 `handleReaderAdjustment()` 函數

2. **reader.html** (youtube-subtitle-book/reader.html)
   - 新增 `.save-status` CSS 樣式
   - 新增 `<div id="saveStatus">` 元素

3. **reader.js** (youtube-subtitle-book/reader.js)
   - 新增 `showSaveStatus()` 函數
   - 修改 `adjustScreenshot()` 函數

---

## 🎉 修正完成

### 版本資訊
- **修正版本**: v0.3.1
- **修正日期**: 2026-01-20
- **修正類型**: Bug Fix（儲存同步問題）

### 改進效果
- ✅ 即時閱讀修改結果永久保存
- ✅ 資料在所有 storage 間保持同步
- ✅ 使用者獲得明確的保存確認回饋
- ✅ 不影響現有功能

---

**修正完成！請重新載入擴充功能進行測試。** 🚀
