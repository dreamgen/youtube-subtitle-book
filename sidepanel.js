// Side Panel - Logic for UI Modernization

// 🆕 Open Library Manager
async function openLibraryManager() {
    const tab = await getActiveYouTubeTab();
    const videoId = getVideoIdFromUrl(tab?.url);

    if (!videoId) {
        return showToast('請在 YouTube 頁面使用', 'error');
    }

    // Open Library Manager in a new window
    chrome.windows.create({
        url: chrome.runtime.getURL(`library.html?videoId=${videoId}`),
        type: 'popup',
        width: 600,
        height: 700,
        left: 200,
        top: 50
    });
}

const DEFAULT_SETTINGS = {
    startTimeOption: 'current',
    captureMode: 'interval',
    captureInterval: 2,
    checkInterval: 200,
    sensitivity: 30,
    subtitleColor: 'white',
    minPixelPercent: 0.5,
    centerWidthPercent: 15,
    autoDetectUpperSubtitle: true,
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
        'subtitleColor', 'minPixelPercent', 'centerWidthPercent', 'linesPerPage', 'totalPages', 'subtitleHeight', 'bottomMargin']
        .forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = settings[id];
        });

    // Apply checkbox
    const autoDetectCheckbox = document.getElementById('autoDetectUpperSubtitle');
    if (autoDetectCheckbox) {
        autoDetectCheckbox.checked = settings.autoDetectUpperSubtitle !== false;
    }

    // Update displays
    document.getElementById('intervalValue').textContent = parseFloat(settings.captureInterval).toFixed(1) + ' 秒';
    document.getElementById('sensitivityValue').textContent = settings.sensitivity + '%';
    document.getElementById('minPixelValue').textContent = settings.minPixelPercent + '%';
    document.getElementById('centerWidthValue').textContent = settings.centerWidthPercent + '%';

    updateCaptureMode(settings.captureMode);
}

async function saveSettings() {
    const tab = await getActiveYouTubeTab();
    const videoId = getVideoIdFromUrl(tab?.url);

    const settings = {};
    ['startTimeOption', 'captureMode', 'captureInterval', 'checkInterval', 'sensitivity',
        'subtitleColor', 'minPixelPercent', 'centerWidthPercent', 'linesPerPage', 'totalPages', 'subtitleHeight', 'bottomMargin']
        .forEach(id => {
            const el = document.getElementById(id);
            if (el) settings[id] = (el.type === 'number' || el.type === 'range') ? parseFloat(el.value) : el.value;
        });

    // Save checkbox
    const autoDetectCheckbox = document.getElementById('autoDetectUpperSubtitle');
    if (autoDetectCheckbox) {
        settings.autoDetectUpperSubtitle = autoDetectCheckbox.checked;
    }

    const saveData = { globalSettings: settings };
    if (videoId) {
        saveData[`videoSettings_${videoId}`] = settings;
    }
    await chrome.storage.local.set(saveData);
}

// --- Event Listeners ---

// Slider progress fill helper
function updateSliderProgress(slider) {
    const value = slider.value;
    const min = slider.min || 0;
    const max = slider.max || 100;
    const percentage = ((value - min) / (max - min)) * 100;
    slider.style.setProperty('--range-progress', percentage + '%');
}

// Sliders
document.getElementById('captureInterval').addEventListener('input', (e) => {
    document.getElementById('intervalValue').textContent = parseFloat(e.target.value).toFixed(1) + ' 秒';
    updateSliderProgress(e.target);
    saveSettings();
});
document.getElementById('sensitivity').addEventListener('input', (e) => {
    document.getElementById('sensitivityValue').textContent = e.target.value + '%';
    updateSliderProgress(e.target);
    saveSettings();
});
document.getElementById('minPixelPercent').addEventListener('input', (e) => {
    document.getElementById('minPixelValue').textContent = e.target.value + '%';
    updateSliderProgress(e.target);
    saveSettings();
});
document.getElementById('centerWidthPercent').addEventListener('input', (e) => {
    document.getElementById('centerWidthValue').textContent = e.target.value + '%';
    updateSliderProgress(e.target);
    saveSettings();
});

// Change Listeners
['startTimeOption', 'captureMode', 'checkInterval', 'subtitleColor', 'linesPerPage',
    'totalPages', 'subtitleHeight', 'bottomMargin'].forEach(id => {
        document.getElementById(id).addEventListener('change', saveSettings);
    });

// Checkbox Listener
document.getElementById('autoDetectUpperSubtitle')?.addEventListener('change', saveSettings);

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
        'subtitleColor', 'minPixelPercent', 'centerWidthPercent', 'linesPerPage', 'totalPages', 'subtitleHeight', 'bottomMargin']
        .forEach(id => {
            const el = document.getElementById(id);
            config[id] = (el.type === 'number' || el.type === 'range') ? parseFloat(el.value) : el.value;
        });

    // Add checkbox config
    const autoDetectCheckbox = document.getElementById('autoDetectUpperSubtitle');
    config.autoDetectUpperSubtitle = autoDetectCheckbox ? autoDetectCheckbox.checked : true;

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

        // 顯示即時閱讀按鈕（製作進行中且有進度）
        const liveBtn = document.getElementById('liveReaderInCapture');
        if (message.progress > 0 && message.progress < 100 && liveBtn) {
            liveBtn.classList.remove('hidden');
        }

        if (message.progress >= 100) {
            // 製作完成
            document.getElementById('statusTitle').textContent = '✅ 製作完成！';
            document.getElementById('openViewer').classList.remove('hidden');
            document.getElementById('startCapture').textContent = '再次製作';
            document.getElementById('startCapture').disabled = false;

            // 隱藏停止按鈕和即時閱讀按鈕，顯示返回按鈕
            document.getElementById('stopCapture').classList.add('hidden');
            if (liveBtn) liveBtn.classList.add('hidden');
            document.getElementById('returnToMain').classList.remove('hidden');

            // 重新載入書庫列表
            loadSavedSegments();
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

// Live Reader (in capture area)
async function openLiveReader() {
    const tab = await getActiveYouTubeTab();
    if (!tab) return showToast('找不到 YouTube 分頁', 'error');

    const videoId = getVideoIdFromUrl(tab.url);
    if (!videoId) return showToast('無法取得影片 ID', 'error');

    // 不再預先開啟背景操作分頁，改為在需要時才開啟
    // 只儲存 videoId，讓 reader.js 在需要時自行建立分頁
    await chrome.storage.local.set({ youtubeVideoId: videoId });

    // Open Reader Window
    // Calculate window dimensions (80% of screen width, 90% of screen height)
    const screenWidth = window.screen.availWidth;
    const screenHeight = window.screen.availHeight;
    const windowWidth = Math.floor(screenWidth * 0.8);
    const windowHeight = Math.floor(screenHeight * 0.9);
    const left = Math.floor((screenWidth - windowWidth) / 2);
    const top = Math.floor((screenHeight - windowHeight) / 2);

    chrome.windows.create({
        url: chrome.runtime.getURL('reader.html'),
        type: 'popup',
        width: windowWidth,
        height: windowHeight,
        left: left,
        top: top
    });
}

// Bind live reader button in capture area
const liveReaderBtn = document.getElementById('liveReaderInCapture');
if (liveReaderBtn) {
    liveReaderBtn.addEventListener('click', openLiveReader);
}

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
    let segments = (result.savedSegments || []).filter(s => s.videoId === videoId);

    // 依照建立時間排序（最新的在前）
    segments.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

    // 🆕 只顯示最新 10 筆
    const displaySegments = segments.slice(0, 10);
    const totalCount = segments.length;

    select.innerHTML = segments.length ? '<option value="">選擇要載入的段落...</option>' : '<option value="">（尚無儲存段落）</option>';
    displaySegments.forEach(seg => {
        const opt = document.createElement('option');
        opt.value = seg.key;
        const dateStr = seg.createdAt ? new Date(seg.createdAt).toLocaleDateString('zh-TW', { month: '2-digit', day: '2-digit' }) : '';
        opt.textContent = `${dateStr} ${formatTime(seg.startTime)}-${formatTime(seg.endTime)} (${seg.pageCount}頁)`;
        select.appendChild(opt);
    });

    // 如果有超過 10 筆，顯示提示
    if (totalCount > 10) {
        const opt = document.createElement('option');
        opt.disabled = true;
        opt.textContent = `... 還有 ${totalCount - 10} 個段落（開啟書庫管理檢視）`;
        select.appendChild(opt);
    }
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
    showToast('已刪除');
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
    document.getElementById('statusTitle').textContent = '製作中...';
    document.getElementById('stopCapture').classList.remove('hidden');
    document.getElementById('liveReaderInCapture').classList.add('hidden');
    document.getElementById('returnToMain').classList.add('hidden');
    document.getElementById('progressBar').style.width = '0%';
    document.getElementById('statusPercentage').textContent = '0%';
    document.getElementById('status').textContent = '初始化...';
}

// --- Check Live Capture (Restore state) ---
async function checkLiveCapture() {
    const result = await chrome.storage.local.get(['liveCapture']);
    const data = result.liveCapture;

    if (data && data.pages && data.pages.length >= 2) {
        if (data.isCapturing) {
            showToast(`偵測到正在進行的擷取 (${data.pages.length}頁)`);
        }
    }
}

// --- Storage Change Listener ---
chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local' && changes.liveCapture) {
        const data = changes.liveCapture.newValue;
        if (data && data.pages && data.pages.length >= 2 && data.isCapturing) {
            // Live capture in progress, could highlight Live Reader button
        }
    }
});

// --- Init ---
document.addEventListener('DOMContentLoaded', async () => {
    await loadSettings();
    await loadSavedSegments();
    await checkLiveCapture();

    // Initialize slider progress on load
    document.querySelectorAll('input[type="range"]').forEach(slider => {
        updateSliderProgress(slider);
    });

    // Accordion Toggle
    document.getElementById('advancedAccordionHeader').addEventListener('click', () => {
        document.getElementById('advancedAccordion').classList.toggle('open');
    });

    // Return to Main Button
    document.getElementById('returnToMain').addEventListener('click', () => {
        resetUIState();
    });

    // Open Library Manager Button
    const openLibraryBtn = document.getElementById('openLibrary');
    if (openLibraryBtn) {
        openLibraryBtn.addEventListener('click', openLibraryManager);
    }

    // Debug Storage Listener
    document.getElementById('debugStorage').addEventListener('click', async () => {
        console.log('🐞 Debug Storage Clicked');
        const all = await chrome.storage.local.get(null);
        console.log('📦 All Storage Data:', all);
        console.log('📂 Saved Segments:', all.savedSegments);
        console.log('🔑 Segment Keys:', Object.keys(all).filter(k => k.startsWith('segment_')));

        // Specific Key Analysis
        if (all.savedSegments && all.savedSegments.length > 0) {
            all.savedSegments.forEach(seg => {
                const hasData = !!all[`segment_${seg.key}`];
                console.log(`Segment: ${seg.key} | Has Data: ${hasData} | Video: ${seg.videoId}`);
            });
        } else {
            console.log('⚠️ No saved segments found in index.');
        }

        showToast('Storage dumped to Console');
    });
});
