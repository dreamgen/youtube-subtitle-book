# 🔍 刪除按鈕除錯指南

## 如果刪除按鈕仍然沒有反應，請按照以下步驟除錯：

---

## 步驟 1: 徹底清除快取並重新載入

### 方法 A: 完整重新載入擴充功能

1. 開啟 `chrome://extensions/`
2. 找到「YouTube字幕電子書製作器」
3. **關閉**擴充功能（toggle 開關）
4. 等待 2 秒
5. **開啟**擴充功能
6. 點擊「重新載入」圖示（🔄）

### 方法 B: 移除並重新安裝

1. 開啟 `chrome://extensions/`
2. 點擊「移除」
3. 重新載入擴充功能：
   - 點擊「載入未封裝項目」
   - 選擇 `youtube-subtitle-book` 資料夾

---

## 步驟 2: 檢查 Console 錯誤訊息

### 在 Popup 上檢查

1. 開啟擴充功能 popup
2. 在 popup 上**按右鍵** → 選擇「檢查」
3. 切換到 **Console** 標籤
4. 點擊「刪除」按鈕
5. 查看是否有錯誤訊息

**常見錯誤訊息**：
```javascript
// ❌ 如果看到這個：
Uncaught TypeError: Cannot read property 'addEventListener' of null

// 表示按鈕元素沒有找到
```

---

## 步驟 3: 手動測試按鈕元素

在 Popup Console 執行以下命令：

### 測試 1: 檢查按鈕是否存在
```javascript
const deleteBtn = document.getElementById('deleteResult');
console.log('刪除按鈕:', deleteBtn);
// 應該回傳: <button id="deleteResult">刪除</button>
// 如果回傳 null，表示按鈕不存在
```

### 測試 2: 檢查下拉選單
```javascript
const select = document.getElementById('savedResults');
console.log('下拉選單:', select);
console.log('選中的值:', select.value);
// 應該顯示選中的段落 key
```

### 測試 3: 檢查函數是否存在
```javascript
console.log('setupSegmentButtons:', typeof setupSegmentButtons);
// 應該回傳: "function"
```

### 測試 4: 手動綁定事件
```javascript
document.getElementById('deleteResult').onclick = function() {
  console.log('刪除按鈕被點擊！');
  const select = document.getElementById('savedResults');
  console.log('選中的值:', select.value);

  if (!select.value) {
    alert('請先選擇要刪除的段落');
    return;
  }

  if (confirm('確定要刪除這個段落嗎？')) {
    console.log('使用者確認刪除');
    // 手動執行刪除
    chrome.storage.local.get(['savedSegments'], async (result) => {
      let segments = result.savedSegments || [];
      const key = select.value;
      segments = segments.filter(s => s.key !== key);

      await chrome.storage.local.remove([`segment_${key}`]);
      await chrome.storage.local.set({ savedSegments: segments });

      console.log('刪除完成');
      alert('段落已刪除（手動）');

      // 重新載入頁面
      location.reload();
    });
  }
};
```

然後點擊刪除按鈕，看是否有反應。

---

## 步驟 4: 檢查 HTML 結構

### 在 Popup Console 執行
```javascript
// 檢查段落選擇區域的完整 HTML
const container = document.querySelector('.segment-selector');
console.log(container.innerHTML);
```

應該看到：
```html
<select id="savedResults">...</select>
<div class="btn-group">
  <button id="loadResult">載入</button>
  <button id="deleteResult">刪除</button>
</div>
```

---

## 步驟 5: 驗證 popup.js 版本

### 在 Popup Console 執行
```javascript
// 檢查 setupSegmentButtons 函數的內容
console.log(setupSegmentButtons.toString());
```

應該看到函數內有：
```javascript
document.getElementById('loadResult').addEventListener('click', ...
document.getElementById('deleteResult').addEventListener('click', ...
```

---

## 步驟 6: 強制重新綁定事件

如果以上都正常但按鈕仍無反應，在 Popup Console 執行：

```javascript
// 強制重新綁定
setupSegmentButtons();
console.log('已重新綁定事件');
```

然後再次測試刪除按鈕。

---

## 步驟 7: 檢查瀏覽器版本

### 確認 Chrome 版本
```
chrome://version/
```

**最低要求**：Chrome 88+

---

## 🔧 臨時解決方案

如果以上步驟都無效，可以使用以下臨時方法刪除段落：

### 方法 1: 使用 Console 直接刪除

1. 在任何 Chrome 頁面按 F12
2. 切換到 Console
3. 執行以下程式碼：

```javascript
// 列出所有段落
chrome.storage.local.get(['savedSegments'], (result) => {
  const segments = result.savedSegments || [];
  console.log('所有段落:');
  segments.forEach((seg, index) => {
    console.log(`${index}. Key: ${seg.key}`);
    console.log(`   時間: ${seg.startTime}s - ${seg.endTime}s`);
    console.log(`   頁數: ${seg.pageCount}`);
  });
});
```

然後刪除特定段落（替換 `KEY_TO_DELETE`）：
```javascript
const keyToDelete = 'KEY_TO_DELETE';  // 替換成要刪除的 key

chrome.storage.local.get(['savedSegments'], async (result) => {
  let segments = result.savedSegments || [];
  segments = segments.filter(s => s.key !== keyToDelete);

  await chrome.storage.local.remove([`segment_${keyToDelete}`]);
  await chrome.storage.local.set({ savedSegments: segments });

  console.log('✅ 段落已刪除');
});
```

### 方法 2: 清除所有段落

**警告：這會刪除所有已儲存的段落！**

```javascript
chrome.storage.local.get(['savedSegments'], async (result) => {
  const segments = result.savedSegments || [];

  // 刪除所有 segment 資料
  for (const seg of segments) {
    await chrome.storage.local.remove([`segment_${seg.key}`]);
  }

  // 清空段落列表
  await chrome.storage.local.set({ savedSegments: [] });

  console.log('✅ 所有段落已清除');
});
```

---

## 📊 除錯檢查表

請逐項檢查並記錄結果：

- [ ] 已徹底重新載入擴充功能
- [ ] Popup Console 沒有錯誤訊息
- [ ] `document.getElementById('deleteResult')` 回傳按鈕元素
- [ ] `typeof setupSegmentButtons` 回傳 "function"
- [ ] 手動綁定事件測試成功
- [ ] 已選擇段落（select.value 不是空字串）
- [ ] Chrome 版本 >= 88

---

## 💡 常見問題解答

### Q1: 為什麼載入按鈕有效但刪除按鈕無效？
A: 兩個按鈕現在都在 `setupSegmentButtons()` 函數內，應該同時有效或無效。如果只有刪除按鈕無效，可能是：
- 確認對話框被瀏覽器阻擋了
- 某個中間步驟失敗但沒有顯示錯誤

### Q2: 點擊後沒有跳出確認對話框
A: 檢查瀏覽器是否阻擋了彈出視窗：
```javascript
// 在 Console 測試
confirm('測試');  // 應該跳出對話框
```

### Q3: 確認後仍然沒有刪除
A: 檢查 storage 操作：
```javascript
// 測試 storage 寫入權限
chrome.storage.local.set({ test: 'hello' }, () => {
  chrome.storage.local.get(['test'], (r) => {
    console.log('Storage 測試:', r.test);  // 應該顯示 "hello"
  });
});
```

---

## 🆘 如果以上都無效

請提供以下資訊以便進一步診斷：

1. Chrome 版本：`chrome://version/`
2. Popup Console 的完整錯誤訊息（截圖）
3. 執行測試 1-7 的結果
4. `setupSegmentButtons.toString()` 的輸出

---

**完成除錯後請回報結果** 🔍
