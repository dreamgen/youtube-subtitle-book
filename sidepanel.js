// Side Panel 版本 - 主控制介面
// 設定管理 - 儲存和載入設定
const DEFAULT_SETTINGS = {
    startTimeOption: 'current',
    captureMode: 'interval',
    captureInterval: 2,
    checkInterval: 200,
    sensitivity: 30,
    subtitleColor: 'white',
    minPixelPercent: 0.5,
    linesPerPage: 5,
    totalPages: 'all',
    subtitleHeight: 15,
    bottomMargin: 0
};

// 從 URL 提取 YouTube 影片 ID
function getVideoIdFromUrl(url) {
    if (!url) return null;
    const match = url.match(/[?&]v=([^&]+)/);
    return match ? match[1] : null;
}

// 獲取當前活動的 YouTube 分頁
async function getActiveYouTubeTab() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.url && tab.url.includes('youtube.com/watch')) {
        return tab;
    }
    // 如果當前分頁不是 YouTube，嘗試找一個 YouTube 分頁
    const youtubeTabs = await chrome.tabs.query({ url: 'https://www.youtube.com/watch*' });
    return youtubeTabs[0] || null;
}

// 載入設定
async function loadSettings() {
    const tab = await getActiveYouTubeTab();
    const videoId = getVideoIdFromUrl(tab?.url);

    const result = await chrome.storage.local.get(['globalSettings', `videoSettings_${videoId}`]);

    // 優先使用影片專屬設定，其次是全域設定，最後是預設值
    let settings;
    if (videoId && result[`videoSettings_${videoId}`]) {
        settings = { ...DEFAULT_SETTINGS, ...result[`videoSettings_${videoId}`] };
        console.log('載入影片專屬設定:', videoId);
    } else if (result.globalSettings) {
        settings = { ...DEFAULT_SETTINGS, ...result.globalSettings };
        console.log('載入全域設定');
    } else {
        settings = DEFAULT_SETTINGS;
        console.log('使用預設設定');
    }

    // 套用設定到 UI
    document.getElementById('startTimeOption').value = settings.startTimeOption;
    document.getElementById('captureMode').value = settings.captureMode || 'interval';
    document.getElementById('captureInterval').value = settings.captureInterval;
    document.getElementById('intervalValue').textContent = parseFloat(settings.captureInterval).toFixed(1) + ' 秒';
    document.getElementById('checkInterval').value = settings.checkInterval || 200;
    document.getElementById('sensitivity').value = settings.sensitivity || 30;
    document.getElementById('sensitivityValue').textContent = (settings.sensitivity || 30) + '%';
    document.getElementById('subtitleColor').value = settings.subtitleColor || 'white';
    document.getElementById('minPixelPercent').value = settings.minPixelPercent || 0.5;
    document.getElementById('minPixelValue').textContent = (settings.minPixelPercent || 0.5) + '%';
    document.getElementById('linesPerPage').value = settings.linesPerPage;
    document.getElementById('totalPages').value = settings.totalPages;
    document.getElementById('subtitleHeight').value = settings.subtitleHeight;
    document.getElementById('bottomMargin').value = settings.bottomMargin;

    // 根據模式顯示對應選項
    updateCaptureMode(settings.captureMode || 'interval');
}

// 儲存設定
async function saveSettings() {
    const tab = await getActiveYouTubeTab();
    const videoId = getVideoIdFromUrl(tab?.url);

    const settings = {
        startTimeOption: document.getElementById('startTimeOption').value,
        captureMode: document.getElementById('captureMode').value,
        captureInterval: parseFloat(document.getElementById('captureInterval').value),
        checkInterval: parseInt(document.getElementById('checkInterval').value),
        sensitivity: parseInt(document.getElementById('sensitivity').value),
        subtitleColor: document.getElementById('subtitleColor').value,
        minPixelPercent: parseFloat(document.getElementById('minPixelPercent').value),
        linesPerPage: parseInt(document.getElementById('linesPerPage').value),
        totalPages: document.getElementById('totalPages').value,
        subtitleHeight: parseInt(document.getElementById('subtitleHeight').value),
        bottomMargin: parseInt(document.getElementById('bottomMargin').value) || 0
    };

    // 同時儲存為全域設定和影片專屬設定
    const saveData = { globalSettings: settings };
    if (videoId) {
        saveData[`videoSettings_${videoId}`] = settings;
        console.log('儲存影片專屬設定:', videoId);
    }

    await chrome.storage.local.set(saveData);
    console.log('設定已儲存');
}

// 設定在 DOMContentLoaded 結尾處載入

// 滑軸即時更新顯示值並儲存
document.getElementById('captureInterval').addEventListener('input', (e) => {
    document.getElementById('intervalValue').textContent = parseFloat(e.target.value).toFixed(1) + ' 秒';
    saveSettings();
});

// 監聽所有設定變更
['startTimeOption', 'captureMode', 'checkInterval', 'subtitleColor', 'linesPerPage', 'totalPages', 'subtitleHeight', 'bottomMargin'].forEach(id => {
    document.getElementById(id).addEventListener('change', saveSettings);
});

// 擷取模式切換
function updateCaptureMode(mode) {
    const intervalOptions = document.getElementById('intervalOptions');
    const smartOptions = document.getElementById('smartOptions');

    if (mode === 'smart') {
        intervalOptions.style.display = 'none';
        smartOptions.style.display = 'block';
    } else {
        intervalOptions.style.display = 'block';
        smartOptions.style.display = 'none';
    }
}

document.getElementById('captureMode').addEventListener('change', (e) => {
    updateCaptureMode(e.target.value);
    saveSettings();
});

// 敏感度滑軸即時更新
document.getElementById('sensitivity').addEventListener('input', (e) => {
    document.getElementById('sensitivityValue').textContent = e.target.value + '%';
    saveSettings();
});

// 字幕像素閾值滑軸即時更新
document.getElementById('minPixelPercent').addEventListener('input', (e) => {
    document.getElementById('minPixelValue').textContent = e.target.value + '%';
    saveSettings();
});

// 預覽按鈕事件
document.getElementById('previewButton').addEventListener('click', async () => {
    const captureInterval = parseFloat(document.getElementById('captureInterval').value);
    const linesPerPage = parseInt(document.getElementById('linesPerPage').value);
    const subtitleHeight = parseInt(document.getElementById('subtitleHeight').value);
    const bottomMargin = parseInt(document.getElementById('bottomMargin').value) || 0;

    const status = document.getElementById('status');
    const previewButton = document.getElementById('previewButton');

    const tab = await getActiveYouTubeTab();

    if (!tab) {
        status.textContent = '請在YouTube影片頁面使用此功能';
        status.className = 'status show';
        return;
    }

    previewButton.disabled = true;
    status.textContent = '正在產生預覽...';
    status.className = 'status show';

    chrome.tabs.sendMessage(tab.id, {
        action: 'showPreview',
        config: {
            captureInterval,
            linesPerPage,
            subtitleHeight,
            bottomMargin
        }
    }, (response) => {
        previewButton.disabled = false;

        if (chrome.runtime.lastError) {
            status.textContent = '錯誤: ' + chrome.runtime.lastError.message;
            return;
        }

        if (response && response.success) {
            status.textContent = '預覽已開啟，請查看YouTube頁面';
        }
    });
});

document.getElementById('startCapture').addEventListener('click', async () => {
    const startTimeOption = document.getElementById('startTimeOption').value;
    const captureInterval = parseFloat(document.getElementById('captureInterval').value);
    const linesPerPage = parseInt(document.getElementById('linesPerPage').value);
    const totalPagesValue = document.getElementById('totalPages').value;
    const totalPages = totalPagesValue === 'all' ? null : parseInt(totalPagesValue);
    const subtitleHeight = parseInt(document.getElementById('subtitleHeight').value);
    const bottomMargin = parseInt(document.getElementById('bottomMargin').value) || 0;

    const status = document.getElementById('status');
    const progress = document.getElementById('progress');
    const progressBar = document.getElementById('progressBar');
    const startButton = document.getElementById('startCapture');

    const tab = await getActiveYouTubeTab();

    if (!tab) {
        status.textContent = '請在YouTube影片頁面使用此功能';
        status.className = 'status show';
        return;
    }

    // 儲存設定
    await saveSettings();

    // 發送訊息到content script開始截圖
    startButton.disabled = true;
    status.textContent = '正在初始化...';
    status.className = 'status show';
    progress.className = 'progress show';
    progressBar.style.width = '0%';

    // 獲取擷取模式和智慧擷取設定
    const captureMode = document.getElementById('captureMode').value;
    const checkInterval = parseInt(document.getElementById('checkInterval').value);
    const sensitivity = parseInt(document.getElementById('sensitivity').value);
    const subtitleColor = document.getElementById('subtitleColor').value;
    const minPixelPercent = parseFloat(document.getElementById('minPixelPercent').value);

    chrome.tabs.sendMessage(tab.id, {
        action: captureMode === 'smart' ? 'startSmartCapture' : 'startCapture',
        config: {
            startTimeOption,
            captureMode,
            captureInterval,
            checkInterval,
            sensitivity,
            subtitleColor,
            minPixelPercent,
            linesPerPage,
            totalPages,
            subtitleHeight,
            bottomMargin
        }
    }, (response) => {
        if (chrome.runtime.lastError) {
            status.textContent = '錯誤: ' + chrome.runtime.lastError.message;
            startButton.disabled = false;
            return;
        }

        if (response && response.success) {
            status.textContent = '開始截圖...';
        }
    });
});

// 監聽來自content script的進度更新
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'updateProgress') {
        console.log('收到進度更新:', message.progress + '%', message.message);

        const progressBar = document.getElementById('progressBar');
        const status = document.getElementById('status');

        if (progressBar && status) {
            progressBar.style.width = message.progress + '%';
            status.textContent = message.message;

            if (message.progress >= 100) {
                console.log('製作完成！顯示開啟閱讀器按鈕');
                document.getElementById('startCapture').disabled = false;
                document.getElementById('openViewer').style.display = 'block';
                document.getElementById('liveReader').style.display = 'none';
            }
        }

        // 必須回應，否則會導致訊息發送失敗
        sendResponse({ received: true });
    } else if (message.action === 'liveReadyPages') {
        // 顯示即時閱讀按鈕（完成 2 頁後）
        if (message.pageCount >= 2) {
            document.getElementById('liveReader').style.display = 'block';
        }
        sendResponse({ received: true });
    }
    return true; // 保持訊息通道開啟
});

document.getElementById('openViewer').addEventListener('click', async () => {
    const tab = await getActiveYouTubeTab();

    if (!tab) {
        alert('找不到 YouTube 分頁');
        return;
    }

    chrome.tabs.sendMessage(tab.id, {
        action: 'openViewer'
    });
});

// 即時閱讀按鈕 - 開啟獨立視窗
document.getElementById('liveReader').addEventListener('click', async () => {
    const tab = await getActiveYouTubeTab();

    if (!tab) {
        alert('找不到 YouTube 分頁');
        return;
    }

    const videoId = getVideoIdFromUrl(tab.url);

    if (!videoId) {
        alert('無法取得影片 ID');
        return;
    }

    // 開啟新的 YouTube 分頁作為操作用（背景分頁）
    const operationTab = await chrome.tabs.create({
        url: `https://www.youtube.com/watch?v=${videoId}`,
        active: false  // 背景開啟
    });

    // 儲存操作用 YouTube 分頁 ID 供 reader 使用
    await chrome.storage.local.set({
        youtubeOperationTabId: operationTab.id,
        youtubeVideoId: videoId
    });

    // 開啟閱讀器為獨立視窗
    const readerUrl = chrome.runtime.getURL('reader.html');
    chrome.windows.create({
        url: readerUrl,
        type: 'popup',
        width: 450,
        height: 750,
        left: 100,
        top: 50
    });
});

// 格式化時間
function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// 載入已儲存的段落
async function loadSavedSegments() {
    const tab = await getActiveYouTubeTab();
    const videoId = getVideoIdFromUrl(tab?.url);

    const savedResults = document.getElementById('savedResults');

    if (!videoId) {
        savedResults.innerHTML = '<option value="">（請在 YouTube 影片頁面開啟）</option>';
        return;
    }

    const result = await chrome.storage.local.get(['savedSegments']);
    const segments = result.savedSegments || [];

    // 過濾當前影片的段落
    const videoSegments = segments.filter(s => s.videoId === videoId);

    if (videoSegments.length > 0) {
        savedResults.innerHTML = '<option value="">選擇要載入的段落...</option>';

        videoSegments.forEach(seg => {
            const option = document.createElement('option');
            option.value = seg.key;
            option.textContent = `${formatTime(seg.startTime)} - ${formatTime(seg.endTime)} (${seg.pageCount}頁)`;
            savedResults.appendChild(option);
        });
    } else {
        savedResults.innerHTML = '<option value="">（此影片尚無已儲存的段落）</option>';
    }
}

// 🔧 設定段落按鈕事件（移到 DOMContentLoaded 內調用）
let segmentButtonsInitialized = false;

function setupSegmentButtons() {
    // 避免重複綁定
    if (segmentButtonsInitialized) {
        console.log('段落按鈕事件已綁定，跳過重複綁定');
        return;
    }

    console.log('開始綁定段落按鈕事件...');

    // 載入選中的段落
    document.getElementById('loadResult').addEventListener('click', async () => {
        console.log('載入按鈕被點擊');
        const savedResults = document.getElementById('savedResults');
        const selectedKey = savedResults.value;

        if (!selectedKey) {
            alert('請先選擇要載入的段落');
            return;
        }

        const result = await chrome.storage.local.get([`segment_${selectedKey}`]);
        const captureData = result[`segment_${selectedKey}`];

        if (!captureData) {
            alert('找不到該段落資料');
            return;
        }

        // 發送到 content script
        const tab = await getActiveYouTubeTab();

        if (!tab) {
            alert('找不到 YouTube 分頁');
            return;
        }

        chrome.tabs.sendMessage(tab.id, {
            action: 'loadCaptureData',
            data: captureData
        }, (response) => {
            if (chrome.runtime.lastError) {
                alert('載入失敗: ' + chrome.runtime.lastError.message);
                return;
            }

            if (response && response.success) {
                document.getElementById('openViewer').style.display = 'block';
                document.getElementById('status').textContent = `已載入段落 (${captureData.pages.length}頁)`;
                document.getElementById('status').className = 'status show';
            }
        });
    });

    // 自訂確認對話框函數
    function showConfirmDialog(message) {
        return new Promise((resolve) => {
            const overlay = document.getElementById('confirmOverlay');
            const messageEl = document.getElementById('confirmMessage');
            const yesBtn = document.getElementById('confirmYes');
            const noBtn = document.getElementById('confirmNo');

            messageEl.textContent = message;
            overlay.classList.add('show');

            const cleanup = () => {
                overlay.classList.remove('show');
                yesBtn.removeEventListener('click', onYes);
                noBtn.removeEventListener('click', onNo);
            };

            const onYes = () => {
                cleanup();
                resolve(true);
            };

            const onNo = () => {
                cleanup();
                resolve(false);
            };

            yesBtn.addEventListener('click', onYes);
            noBtn.addEventListener('click', onNo);
        });
    }

    // 刪除選中的段落
    document.getElementById('deleteResult').addEventListener('click', async () => {
        console.log('刪除按鈕被點擊');
        const savedResults = document.getElementById('savedResults');
        const selectedKey = savedResults.value;

        console.log('選中的 key:', selectedKey);

        if (!selectedKey) {
            alert('請先選擇要刪除的段落');
            return;
        }

        console.log('顯示確認對話框...');
        const confirmed = await showConfirmDialog('確定要刪除這個段落嗎？');
        if (!confirmed) {
            console.log('使用者取消刪除');
            return;
        }

        console.log('使用者確認刪除，開始執行...');

        // 從段落列表中移除
        const result = await chrome.storage.local.get(['savedSegments']);
        let segments = result.savedSegments || [];
        console.log('刪除前段落數量:', segments.length);

        segments = segments.filter(s => s.key !== selectedKey);
        console.log('刪除後段落數量:', segments.length);

        // 刪除段落資料
        await chrome.storage.local.remove([`segment_${selectedKey}`]);
        console.log('已刪除 storage key:', `segment_${selectedKey}`);

        await chrome.storage.local.set({ savedSegments: segments });
        console.log('已更新 savedSegments');

        // 重新載入列表
        await loadSavedSegments();
        console.log('已重新載入段落列表');

        document.getElementById('status').textContent = '段落已刪除';
        document.getElementById('status').className = 'status show';
        console.log('✅ 刪除完成');
    });

    segmentButtonsInitialized = true;
    console.log('✅ 段落按鈕事件綁定完成');
}

// 頁面載入時載入設定和已儲存段落
document.addEventListener('DOMContentLoaded', async () => {
    await loadSettings();
    await loadSavedSegments();
    await loadExportCheckboxes();
    await checkLiveCapture();

    // 🔧 修正：在 DOM 載入後綁定載入和刪除按鈕事件
    setupSegmentButtons();
});

// 檢查是否有正在進行的即時擷取
async function checkLiveCapture() {
    const result = await chrome.storage.local.get(['liveCapture']);
    const data = result.liveCapture;

    if (data && data.pages && data.pages.length >= 2) {
        document.getElementById('liveReader').style.display = 'block';

        // 如果已完成，隱藏即時閱讀按鈕
        if (!data.isCapturing) {
            document.getElementById('liveReader').style.display = 'none';
        }
    }
}

// 監聽 storage 變化以即時更新按鈕狀態
chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local' && changes.liveCapture) {
        const data = changes.liveCapture.newValue;
        if (data && data.pages && data.pages.length >= 2 && data.isCapturing) {
            document.getElementById('liveReader').style.display = 'block';
        }
    }
});

// 載入匯出用的 checkbox 列表
async function loadExportCheckboxes() {
    const tab = await getActiveYouTubeTab();
    const videoId = getVideoIdFromUrl(tab?.url);
    const checkboxContainer = document.getElementById('exportCheckboxes');

    if (!videoId) {
        checkboxContainer.innerHTML = '<div class="checkbox-item"><span style="color:#999">（請在 YouTube 影片頁面開啟）</span></div>';
        return;
    }

    const result = await chrome.storage.local.get(['savedSegments']);
    const segments = result.savedSegments || [];
    const videoSegments = segments.filter(s => s.videoId === videoId);

    if (videoSegments.length === 0) {
        checkboxContainer.innerHTML = '<div class="checkbox-item"><span style="color:#999">（此影片尚無已儲存的段落）</span></div>';
        return;
    }

    checkboxContainer.innerHTML = videoSegments.map(seg => `
    <div class="checkbox-item">
      <input type="checkbox" id="export_${seg.key}" value="${seg.key}">
      <span>${formatTime(seg.startTime)} - ${formatTime(seg.endTime)} (${seg.pageCount}頁)</span>
    </div>
  `).join('');
}

// 全選按鈕
document.getElementById('selectAll').addEventListener('click', () => {
    const checkboxes = document.querySelectorAll('#exportCheckboxes input[type="checkbox"]');
    const allChecked = Array.from(checkboxes).every(cb => cb.checked);
    checkboxes.forEach(cb => cb.checked = !allChecked);
});

// 匯出 PDF
document.getElementById('exportPdf').addEventListener('click', async () => {
    const checkboxes = document.querySelectorAll('#exportCheckboxes input[type="checkbox"]:checked');
    const selectedKeys = Array.from(checkboxes).map(cb => cb.value);

    if (selectedKeys.length === 0) {
        alert('請先選擇要匯出的段落');
        return;
    }

    const status = document.getElementById('status');
    status.textContent = '正在生成 PDF...';
    status.className = 'status show';

    try {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({
            orientation: 'portrait',
            unit: 'mm',
            format: 'a4'
        });

        let isFirstPage = true;
        let videoTitle = '';
        let totalPages = 0;
        let processedPages = 0;

        // 計算總頁數
        for (const key of selectedKeys) {
            const result = await chrome.storage.local.get([`segment_${key}`]);
            const data = result[`segment_${key}`];
            if (data && data.pages) {
                totalPages += data.pages.length;
                if (!videoTitle) videoTitle = data.videoTitle;
            }
        }

        // 生成 PDF - 每個 page 對應一個 PDF 頁面
        for (const key of selectedKeys) {
            const result = await chrome.storage.local.get([`segment_${key}`]);
            const data = result[`segment_${key}`];

            if (!data || !data.pages) continue;

            for (const page of data.pages) {
                if (!isFirstPage) {
                    doc.addPage();
                }
                isFirstPage = false;

                const pageWidth = doc.internal.pageSize.getWidth();
                const pageHeight = doc.internal.pageSize.getHeight();
                const margin = 5;
                const usableHeight = pageHeight - margin * 2 - 10; // 留空間給頁碼
                const usableWidth = pageWidth - margin * 2;

                // 計算每張截圖的高度
                const shotCount = page.screenshots.length;
                const shotHeight = usableHeight / shotCount;

                // 將所有截圖垂直排列在同一頁
                for (let i = 0; i < page.screenshots.length; i++) {
                    const shot = page.screenshots[i];
                    const yPos = margin + i * shotHeight;

                    doc.addImage(shot.imageData, 'JPEG', margin, yPos, usableWidth, shotHeight - 1);
                }

                // 添加頁碼和時間範圍
                doc.setFontSize(8);
                doc.setTextColor(100);
                const timeRange = `${formatTime(page.startTime)} - ${formatTime(page.endTime)}`;
                doc.text(`第 ${page.pageNumber} 頁 | ${timeRange}`, pageWidth / 2, pageHeight - 5, { align: 'center' });

                processedPages++;
                status.textContent = `正在生成 PDF... ${Math.floor(processedPages / totalPages * 100)}%`;
            }
        }

        // 下載 PDF
        const filename = `${videoTitle.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '_')}.pdf`;
        doc.save(filename);

        status.textContent = `PDF 已下載！共 ${processedPages} 頁`;
    } catch (error) {
        console.error('PDF 生成失敗:', error);
        status.textContent = '生成失敗: ' + error.message;
    }
});
