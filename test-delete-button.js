// 🧪 刪除按鈕測試腳本
// 在 Popup 的 Console 中執行此腳本來測試刪除按鈕

console.log('=== 開始測試刪除按鈕 ===');

// 測試 1: 檢查按鈕元素
const deleteBtn = document.getElementById('deleteResult');
const loadBtn = document.getElementById('loadResult');
const selectElement = document.getElementById('savedResults');

console.log('1. 檢查元素:');
console.log('   刪除按鈕:', deleteBtn ? '✅ 存在' : '❌ 不存在');
console.log('   載入按鈕:', loadBtn ? '✅ 存在' : '❌ 不存在');
console.log('   下拉選單:', selectElement ? '✅ 存在' : '❌ 不存在');

if (!deleteBtn || !loadBtn || !selectElement) {
  console.error('❌ 某些元素不存在，無法繼續測試');
  console.log('提示：請確保 popup 已完全載入');
} else {
  // 測試 2: 檢查函數
  console.log('\n2. 檢查函數:');
  console.log('   setupSegmentButtons:', typeof setupSegmentButtons === 'function' ? '✅ 存在' : '❌ 不存在');

  // 測試 3: 檢查事件監聽器（嘗試觸發）
  console.log('\n3. 測試事件綁定:');

  // 保存原始 addEventListener
  const originalAddEventListener = Element.prototype.addEventListener;
  let deleteEventBound = false;
  let loadEventBound = false;

  // 臨時覆寫 addEventListener 來追蹤綁定
  Element.prototype.addEventListener = function(event, handler, options) {
    if (this.id === 'deleteResult' && event === 'click') {
      deleteEventBound = true;
      console.log('   ✅ 刪除按鈕 click 事件已綁定');
    }
    if (this.id === 'loadResult' && event === 'click') {
      loadEventBound = true;
      console.log('   ✅ 載入按鈕 click 事件已綁定');
    }
    return originalAddEventListener.call(this, event, handler, options);
  };

  // 重新執行綁定
  if (typeof setupSegmentButtons === 'function') {
    console.log('   執行 setupSegmentButtons()...');
    setupSegmentButtons();
  }

  // 恢復原始 addEventListener
  Element.prototype.addEventListener = originalAddEventListener;

  console.log('\n4. 綁定結果:');
  console.log('   刪除按鈕事件:', deleteEventBound ? '✅ 已綁定' : '❌ 未綁定');
  console.log('   載入按鈕事件:', loadEventBound ? '✅ 已綁定' : '❌ 未綁定');

  // 測試 4: 檢查下拉選單內容
  console.log('\n5. 下拉選單內容:');
  console.log('   選項數量:', selectElement.options.length);
  console.log('   當前選中值:', selectElement.value || '(未選擇)');

  if (selectElement.options.length > 1) {
    console.log('   可用段落:');
    for (let i = 1; i < selectElement.options.length; i++) {
      console.log(`   - ${i}. ${selectElement.options[i].text}`);
    }
  } else {
    console.log('   ⚠️ 沒有已儲存的段落');
  }

  // 測試 5: 手動觸發刪除流程（僅測試，不實際刪除）
  console.log('\n6. 模擬點擊測試:');
  console.log('   提示：請手動點擊刪除按鈕，然後查看是否有反應');
  console.log('   如果沒有反應，請執行下方的「強制綁定」命令');
}

console.log('\n=== 測試完成 ===');
console.log('\n如果刪除按鈕仍無反應，請在 Console 執行：');
console.log('   setupSegmentButtons();');
console.log('   console.log("已重新綁定事件");');
