// Side Panel - Logic for UI Modernization
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

// --- Helpers ---
function getVideoIdFromUrl(url) {
    if (!url) return null;
    const match = url.match(/[?&]v=([^&]+)/);
    return match ? match[1] : null;
}

async function getActiveYouTubeTab() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.url && tab.url.includes('youtube.com/watch')) {
        return tab;
    }
    const youtubeTabs = await chrome.tabs.query({ url: 'https://www.youtube.com/watch*' });
    return youtubeTabs[0] || null;
}

function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// --- Settings Management ---
async function loadSettings() {
    const tab = await getActiveYouTubeTab();
    const videoId = getVideoIdFromUrl(tab?.url);
    const result = await chrome.storage.local.get(['globalSettings', `videoSettings_${videoId}`]);

    let settings;
    if (videoId && result[`videoSettings_${videoId}`]) {
        settings = { ...DEFAULT_SETTINGS, ...result[`videoSettings_${videoId}`] };
    } else if (result.globalSettings) {
        settings = { ...DEFAULT_SETTINGS, ...result.globalSettings };
    } else {
        settings = DEFAULT_SETTINGS;
    }

    // Apply to UI
    ['startTimeOption', 'captureMode', 'captureInterval', 'checkInterval', 'sensitivity',
        'subtitleColor', 'minPixelPercent', 'linesPerPage', 'totalPages', 'subtitleHeight', 'bottomMargin']
        .forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = settings[id];
        });

    // Update displays
    document.getElementById('intervalValue').textContent = parseFloat(settings.captureInterval).toFixed(1) + ' 秒';
    document.getElementById('sensitivityValue').textContent = settings.sensitivity + '%';
    document.getElementById('minPixelValue').textContent = settings.minPixelPercent + '%';

    updateCaptureMode(settings.captureMode);
}

async function saveSettings() {
    const tab = await getActiveYouTubeTab();
    const videoId = getVideoIdFromUrl(tab?.url);

    const settings = {};
    ['startTimeOption', 'captureMode', 'captureInterval', 'checkInterval', 'sensitivity',
        'subtitleColor', 'minPixelPercent', 'linesPerPage', 'totalPages', 'subtitleHeight', 'bottomMargin']
        .forEach(id => {
            const el = document.getElementById(id);
            if (el) settings[id] = (el.type === 'number' || el.type === 'range') ? parseFloat(el.value) : el.value;
        });

    const saveData = { globalSettings: settings };
    if (videoId) {
        saveData[`videoSettings_${videoId}`] = settings;
    }
    await chrome.storage.local.set(saveData);
}

// --- Event Listeners ---

// Sliders
document.getElementById('captureInterval').addEventListener('input', (e) => {
    document.getElementById('intervalValue').textContent = parseFloat(e.target.value).toFixed(1) + ' 秒';
    saveSettings();
});
document.getElementById('sensitivity').addEventListener('input', (e) => {
    document.getElementById('sensitivityValue').textContent = e.target.value + '%';
    saveSettings();
});
document.getElementById('minPixelPercent').addEventListener('input', (e) => {
    document.getElementById('minPixelValue').textContent = e.target.value + '%';
    saveSettings();
});

// Change Listeners
['startTimeOption', 'captureMode', 'checkInterval', 'subtitleColor', 'linesPerPage',
    'totalPages', 'subtitleHeight', 'bottomMargin'].forEach(id => {
        document.getElementById(id).addEventListener('change', saveSettings);
    });

// Capture Mode Toggle
function updateCaptureMode(mode) {
    const intervalOptions = document.getElementById('intervalOptions');
    const smartOptions = document.getElementById('smartOptions');
    if (mode === 'smart') {
        intervalOptions.classList.add('hidden');
        smartOptions.classList.remove('hidden');
    } else {
        intervalOptions.classList.remove('hidden');
        smartOptions.classList.add('hidden');
    }
}
document.getElementById('captureMode').addEventListener('change', (e) => updateCaptureMode(e.target.value));

// Preview Button
document.getElementById('previewButton').addEventListener('click', async () => {
    const btn = document.getElementById('previewButton');
    const tab = await getActiveYouTubeTab();
    if (!tab) return showToast('請在 YouTube 頁面使用', 'error');

    btn.disabled = true;
    btn.textContent = '⏳ 處理中...';

    const config = {
        captureInterval: parseFloat(document.getElementById('captureInterval').value),
        linesPerPage: parseInt(document.getElementById('linesPerPage').value),
        subtitleHeight: parseInt(document.getElementById('subtitleHeight').value),
        bottomMargin: parseInt(document.getElementById('bottomMargin').value) || 0
    };

    chrome.tabs.sendMessage(tab.id, { action: 'showPreview', config }, (response) => {
        btn.disabled = false;
        btn.textContent = '🔍 預覽效果';
        if (chrome.runtime.lastError) return showToast('錯誤: ' + chrome.runtime.lastError.message, 'error');
        if (response && response.success) showToast('預覽已開啟');
    });
});

// Start Capture
document.getElementById('startCapture').addEventListener('click', async () => {
    const tab = await getActiveYouTubeTab();
    if (!tab) return showToast('請在 YouTube 頁面使用', 'error');

    await saveSettings();

    // UI Transition
    document.getElementById('settingsForm').classList.add('hidden');
    document.getElementById('statusOverlay').classList.add('show');
    document.getElementById('startCapture').disabled = true;
    document.getElementById('startCapture').textContent = '製作中...';

    // Collect Config
    const config = {};
    ['startTimeOption', 'captureMode', 'captureInterval', 'checkInterval', 'sensitivity',
        'subtitleColor', 'minPixelPercent', 'linesPerPage', 'totalPages', 'subtitleHeight', 'bottomMargin']
        .forEach(id => {
            const el = document.getElementById(id);
            config[id] = (el.type === 'number' || el.type === 'range') ? parseFloat(el.value) : el.value;
        });

    const action = config.captureMode === 'smart' ? 'startSmartCapture' : 'startCapture';
    chrome.tabs.sendMessage(tab.id, { action, config }, (response) => {
        if (chrome.runtime.lastError) {
            showToast('錯誤: ' + chrome.runtime.lastError.message, 'error');
            resetUIState();
        }
    });
});

// Stop Capture (Force Stop)
document.getElementById('stopCapture').addEventListener('click', async () => {
    const tab = await getActiveYouTubeTab();
    if (tab) {
        chrome.tabs.sendMessage(tab.id, { action: 'stopCapture' }); // Content script needs to handle this
        document.getElementById('status').textContent = '正在停止...';
    }
});

// Message Listener (Progress)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'updateProgress') {
        const progressBar = document.getElementById('progressBar');
        const status = document.getElementById('status');
        const percentageEl = document.getElementById('statusPercentage');

        if (progressBar) progressBar.style.width = message.progress + '%';
        if (status) status.textContent = message.message;
        if (percentageEl) percentageEl.textContent = Math.floor(message.progress) + '%';

        if (message.progress >= 100) {
            document.getElementById('openViewer').classList.remove('hidden');
            // document.getElementById('startCapture').classList.add('hidden');
            document.getElementById('startCapture').textContent = '再次製作';
            document.getElementById('startCapture').disabled = false;

            // Re-enable UI after a moment or keep showing result?
            // Proposal says: "Complete: Show 'Open Reader' card". 
            // For now, let's keep the overlay but show the Open Viewer button prominently.
            document.getElementById('stopCapture').classList.add('hidden');
        }
        sendResponse({ received: true });
    } else if (message.action === 'liveReadyPages') {
        // Just ensure button is available? It's always visible now. 
        // Maybe highlight it?
    }
    return true;
});

// Open Viewer
document.getElementById('openViewer').addEventListener('click', async () => {
    const tab = await getActiveYouTubeTab();
    if (tab) chrome.tabs.sendMessage(tab.id, { action: 'openViewer' });
});

// Live Reader
document.getElementById('liveReader').addEventListener('click', async () => {
    const tab = await getActiveYouTubeTab();
    if (!tab) return showToast('找不到 YouTube 分頁', 'error');

    const videoId = getVideoIdFromUrl(tab.url);
    if (!videoId) return showToast('無法取得影片 ID', 'error');

    // Open Background Op Tab
    const operationTab = await chrome.tabs.create({ url: `https://www.youtube.com/watch?v=${videoId}`, active: false });
    await chrome.storage.local.set({ youtubeOperationTabId: operationTab.id, youtubeVideoId: videoId });

    // Open Reader Window
    chrome.windows.create({
        url: chrome.runtime.getURL('reader.html'),
        type: 'popup',
        width: 450, height: 750, left: 100, top: 50
    });
});

// --- Library / Saved Segments ---
async function loadSavedSegments() {
    const tab = await getActiveYouTubeTab();
    const videoId = getVideoIdFromUrl(tab?.url);
    const select = document.getElementById('savedResults');

    if (!videoId) {
        select.innerHTML = '<option value="">（請在 YouTube 頁面使用）</option>';
        return;
    }

    const result = await chrome.storage.local.get(['savedSegments']);
    const segments = (result.savedSegments || []).filter(s => s.videoId === videoId);

    select.innerHTML = segments.length ? '<option value="">選擇要載入的段落...</option>' : '<option value="">（尚無儲存段落）</option>';
    segments.forEach(seg => {
        const opt = document.createElement('option');
        opt.value = seg.key;
        opt.textContent = `${formatTime(seg.startTime)} - ${formatTime(seg.endTime)} (${seg.pageCount}頁)`;
        select.appendChild(opt);
    });
}

// Load Saved
document.getElementById('loadResult').addEventListener('click', async () => {
    const key = document.getElementById('savedResults').value;
    if (!key) return showToast('請選擇段落', 'error');

    const tab = await getActiveYouTubeTab();
    chrome.tabs.sendMessage(tab.id, { action: 'loadCaptureDataFromStorage', storageKey: `segment_${key}` }, (resp) => {
        if (resp && resp.success) {
            showToast(`已載入 ${resp.pageCount} 頁`);
            document.getElementById('openViewer').classList.remove('hidden');
        }
    });
});

// Delete Saved
document.getElementById('deleteResult').addEventListener('click', async () => {
    const key = document.getElementById('savedResults').value;
    if (!key) return showToast('請選擇要刪除的段落', 'error');

    // Custom confirm dialog
    const confirmed = await showConfirmDialog('確定要刪除此段落？');
    if (!confirmed) return;

    const result = await chrome.storage.local.get(['savedSegments']);
    let segments = result.savedSegments || [];
    segments = segments.filter(s => s.key !== key);

    await chrome.storage.local.remove([`segment_${key}`]);
    await chrome.storage.local.set({ savedSegments: segments });
    await loadSavedSegments();
    await loadSavedSegments();
    showToast('已刪除');
});

// Export PDF
document.getElementById('exportPdf').addEventListener('click', async () => {
    const key = document.getElementById('savedResults').value;
    if (!key) return showToast('請選擇段落', 'error');

    showToast('正在產生 PDF...');
    const btn = document.getElementById('exportPdf');
    btn.disabled = true;

    try {
        const result = await chrome.storage.local.get([`segment_${key}`]);
        const data = result[`segment_${key}`];
        if (!data) throw new Error('找不到資料');

        const pdf = new jspdf.jsPDF();
        let pageHeight = pdf.internal.pageSize.getHeight();
        let pageWidth = pdf.internal.pageSize.getWidth();
        let y = 10;

        // Title
        pdf.setFontSize(16);
        pdf.text(data.videoTitle || 'Subtitle Book', 10, y);
        y += 10;

        // Content
        data.pages.forEach((page, pIdx) => {
            if (pIdx > 0) {
                pdf.addPage();
                y = 10;
            }

            page.screenshots.forEach((shot) => {
                if (y > pageHeight - 40) {
                    pdf.addPage();
                    y = 10;
                }

                const imgData = shot.imageData;
                const imgProps = pdf.getImageProperties(imgData);
                const imgHeight = (pageWidth - 20) * (imgProps.height / imgProps.width);

                pdf.addImage(imgData, 'JPEG', 10, y, pageWidth - 20, imgHeight);
                pdf.setFontSize(10);
                pdf.text(formatTime(shot.time), 10, y + imgHeight + 5);

                y += imgHeight + 15;
            });
        });

        pdf.save(`${data.videoTitle || 'subtitle_book'}.pdf`);
        showToast('PDF 下載完成');
    } catch (e) {
        showToast('匯出失敗: ' + e.message, 'error');
    } finally {
        btn.disabled = false;
    }
});

// --- Dialogs & Toasts ---
function showConfirmDialog(msg) {
    return new Promise((resolve) => {
        const overlay = document.getElementById('confirmOverlay');
        document.getElementById('confirmMessage').textContent = msg;
        overlay.style.display = 'flex';

        const close = (val) => {
            overlay.style.display = 'none';
            resolve(val);
        };

        document.getElementById('confirmYes').onclick = () => close(true);
        document.getElementById('confirmNo').onclick = () => close(false);
    });
}

function showToast(msg, type = 'info') {
    // Basic toast implementation for Side Panel (can be improved later)
    // For now, let's use the status element if visible, or a temporary element
    const status = document.getElementById('status');
    const oldText = status.textContent;
    status.textContent = msg;
    status.style.color = type === 'error' ? 'var(--danger-color)' : 'var(--success-color)';
    setTimeout(() => {
        if (status.textContent === msg) {
            status.textContent = oldText;
            status.style.color = 'var(--text-secondary)';
        }
    }, 3000);
}

function resetUIState() {
    document.getElementById('settingsForm').classList.remove('hidden');
    document.getElementById('statusOverlay').classList.remove('show');
    document.getElementById('startCapture').disabled = false;
    document.getElementById('startCapture').textContent = '🚀 開始製作';
}

// --- Init ---
document.addEventListener('DOMContentLoaded', async () => {
    await loadSettings();
    await loadSavedSegments();

    // Accordion Toggle
    document.getElementById('advancedAccordionHeader').addEventListener('click', () => {
        document.getElementById('advancedAccordion').classList.toggle('open');
    });
});
