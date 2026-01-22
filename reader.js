// Live Reader - UI Logic Modernized

let pages = [];
let currentPageIndex = 0;
let isCapturing = true;
let videoTitle = '';
let videoId = '';
let youtubeTabId = null;
let keepAliveInterval = null;
let isBatchMode = false;
let isPlaying = false;

// Stall Check
let lastPageCount = 0;
let lastUpdateTime = Date.now();
let stallCheckInterval = null;
const STALL_TIMEOUT_MS = 30000;

document.addEventListener('DOMContentLoaded', async () => {
    await loadData();
    await initYouTubeTab();
    setupEventListeners();
    startStorageSync();
    startKeepAlive();
    startStallCheck();
});

// --- Toast System ---
function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = 'toast';
    // Simple icon based on type
    const icon = type === 'error' ? '❌' : (type === 'success' ? '✅' : 'ℹ️');
    toast.innerHTML = `<span>${icon}</span><span>${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(20px)';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// --- Data Loading ---
async function loadData() {
    const result = await chrome.storage.local.get(['liveCapture', 'youtubeOperationTabId', 'youtubeVideoId']);
    const data = result.liveCapture;
    youtubeTabId = result.youtubeOperationTabId;
    videoId = result.youtubeVideoId || '';

    if (!data) {
        document.getElementById('pageContent').innerHTML = '<div class="loading">尚無頁面資料，請在 YouTube 頁面開始製作</div>';
        return;
    }

    videoTitle = data.videoTitle || '未知影片';
    if (!videoId) videoId = data.videoId || '';
    pages = data.pages || [];
    isCapturing = data.isCapturing !== false;

    document.getElementById('videoTitle').textContent = videoTitle;
    updateStatus();

    if (pages.length > 0) {
        document.getElementById('pageJumpInput').max = pages.length;
        showPage(currentPageIndex < pages.length ? currentPageIndex : 0);
    } else {
        document.getElementById('pageContent').innerHTML = '<div class="loading">等待頁面製作中...</div>';
    }
}

async function initYouTubeTab() {
    if (!youtubeTabId && videoId) {
        const newTab = await chrome.tabs.create({ url: `https://www.youtube.com/watch?v=${videoId}`, active: false });
        youtubeTabId = newTab.id;
        await chrome.storage.local.set({ youtubeOperationTabId: youtubeTabId });
    }
}

function startKeepAlive() {
    if (keepAliveInterval) clearInterval(keepAliveInterval);
    keepAliveInterval = setInterval(async () => {
        if (youtubeTabId) {
            try { await chrome.tabs.sendMessage(youtubeTabId, { action: 'keepAlive' }); } catch (e) { }
        }
    }, 30000);
}

function startStorageSync() {
    chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName === 'local' && changes.liveCapture) {
            const newData = changes.liveCapture.newValue;
            if (newData) {
                const oldPagesCount = pages.length;
                pages = newData.pages || [];
                isCapturing = newData.isCapturing !== false;

                document.getElementById('videoTitle').textContent = newData.videoTitle || videoTitle;
                document.getElementById('pageJumpInput').max = pages.length;
                updateStatus();
                updateNavigation();

                if (pages.length > 0 && (oldPagesCount === 0 || currentPageIndex < pages.length)) {
                    showPage(currentPageIndex);
                }
            }
        }
    });
}

// --- Rendering ---
function showPage(pageIndex) {
    if (pageIndex < 0 || (pages.length > 0 && pageIndex >= pages.length)) return;

    // Fix for empty pages case
    if (pages.length === 0) return;

    currentPageIndex = pageIndex;
    const page = pages[pageIndex];
    const content = document.getElementById('pageContent');

    const screenshotCount = page.screenshots.length;
    // const maxHeight = screenshotCount > 0 ? `calc((100vh - 120px) / ${screenshotCount})` : 'auto'; 
    // Proposal says: Seamless, maybe not forcing height to fit viewport but letting it scroll nicely?
    // "Optimized Reader Typography" -> "Immersive Reading". 
    // Let's keep max-height logic for now to ensure ebook feel, or relax it.
    // Making it fit screen is good for "Pagination".
    // Use auto to respect aspect ratio and allow scrolling for seamless effect
    const maxHeight = 'auto';

    content.innerHTML = page.screenshots.map((shot, idx) => `
        <div class="screenshot-item" style="max-height: ${maxHeight};" data-shot-index="${idx}">
            ${isBatchMode ? `<input type="checkbox" class="batch-checkbox" data-index="${idx}">` : ''}
            ${shot.upperPreview ? `<div class="upper-preview-container" data-index="${idx}"><img src="${shot.upperPreview}" class="upper-preview-thumb"></div>` : ''}
            <img src="${shot.imageData}" style="max-height: ${maxHeight}; object-fit: contain;">
            
            <div class="screenshot-controls">
                ${!shot.isUpperSubtitle ? `
                    <button class="adj-btn" data-action="addUpper" data-index="${idx}" title="新增上方字幕">
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M5 16h3v3h2v-3h3v-2h-3V11h-2v3H5v2zm7-4.5c.83 0 1.5-.67 1.5-1.5S12.83 8.5 12 8.5s-1.5.67-1.5 1.5.67 1.5 1.5 1.5z"/></svg>
                    </button>
                    <button class="adj-btn" data-action="backward" data-index="${idx}" title="-0.2s">
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M15.41 16.59L10.83 12l4.58-4.59L14 6l-6 6 6 6 1.41-1.41z"/></svg>
                    </button>
                    <button class="adj-btn play" data-action="playFromShot" data-index="${idx}" data-time="${shot.time}" title="播放">
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                    </button>
                    <button class="adj-btn" data-action="forward" data-index="${idx}" title="+0.2s">
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z"/></svg>
                    </button>
                    <button class="adj-btn" data-action="insertBelow" data-index="${idx}" title="插入截圖">
                         <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
                    </button>
                ` : ''}
                <button class="adj-btn delete" data-action="delete" data-index="${idx}" title="刪除">
                     <svg viewBox="0 0 24 24" width="16" height="16" fill="var(--danger-color)"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
                </button>
            </div>
            
            <span class="timestamp">${formatTime(shot.time)}</span>
        </div>
    `).join('');

    document.getElementById('pageJumpInput').value = pageIndex + 1;
    updateNavigation();
    bindScreenshotEvents();
}

function bindScreenshotEvents() {
    document.querySelectorAll('.adj-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const target = e.currentTarget; // correctly target button even if svg clicked
            const action = target.dataset.action;
            const idx = parseInt(target.dataset.index);

            if (action === 'playFromShot') {
                playFromTime(parseFloat(target.dataset.time));
            } else {
                await adjustScreenshot(idx, action);
            }
        });
    });

    document.querySelectorAll('.upper-preview-container').forEach(el => {
        el.addEventListener('click', async () => {
            await adjustScreenshot(parseInt(el.dataset.index), 'addUpper');
        });
    });
}

// --- Actions ---
async function adjustScreenshot(shotIndex, action) {
    if (!youtubeTabId) return showToast('未連接 YouTube', 'error');

    // Disable btn
    const btn = document.querySelector(`[data-action="${action}"][data-index="${shotIndex}"]`);
    if (btn) btn.style.opacity = '0.5';

    try {
        const response = await chrome.tabs.sendMessage(youtubeTabId, {
            action: 'adjustScreenshotForReader',
            pageIndex: currentPageIndex,
            shotIndex: shotIndex,
            adjustAction: action
        });

        if (!response.success) showToast('操作失敗: ' + response.error, 'error');
        else showToast('已更新', 'success');

    } catch (e) {
        showToast('無法連接 YouTube', 'error');
    } finally {
        if (btn) btn.style.opacity = '1';
    }
}

async function playFromTime(time) {
    if (!youtubeTabId && videoId) return window.open(`https://www.youtube.com/watch?v=${videoId}&t=${Math.floor(time)}s`, '_blank');
    try {
        await chrome.tabs.update(youtubeTabId, { active: true });
        const page = pages[currentPageIndex];
        await chrome.tabs.sendMessage(youtubeTabId, {
            action: 'playAudioForReader',
            startTime: time,
            endTime: page ? page.endTime : time + 5
        });
    } catch (e) {
        if (videoId) window.open(`https://www.youtube.com/watch?v=${videoId}&t=${Math.floor(time)}s`, '_blank');
    }
}

function playPageAudio() {
    if (!pages[currentPageIndex]) return;
    const page = pages[currentPageIndex];
    playFromTime(page.startTime);
    isPlaying = true;
    updatePlayButton();
}

function updatePlayButton() {
    // Optional: Toggle icon state
}

// --- Navigation & Batch ---
function updateNavigation() {
    const prev = document.getElementById('prevPage');
    const next = document.getElementById('nextPage');
    const total = document.getElementById('totalPages');

    total.textContent = pages.length > 0 ? pages.length + (isCapturing ? '+' : '') : '-';

    prev.style.opacity = currentPageIndex <= 0 ? 0.3 : 1;
    prev.disabled = currentPageIndex <= 0;

    // Logic for next page during capture
    const isLast = currentPageIndex >= pages.length - 1;
    if (isLast && isCapturing) {
        next.disabled = true;
        next.style.opacity = 0.5;
        document.getElementById('waitingMsg').classList.remove('hidden');
    } else {
        next.disabled = isLast;
        next.style.opacity = isLast ? 0.3 : 1;
        document.getElementById('waitingMsg').classList.add('hidden');
    }
}

function updateStatus() {
    const el = document.getElementById('captureStatus');
    el.textContent = isCapturing ? `擷取中... (${pages.length}頁)` : `完成 (${pages.length}頁)`;
    el.className = isCapturing ? 'status' : 'status done';
}

function enterBatchMode() {
    isBatchMode = true;
    document.getElementById('floatingControls').classList.add('hidden');
    document.getElementById('batchControls').classList.remove('hidden');
    showPage(currentPageIndex);
}

function exitBatchMode() {
    isBatchMode = false;
    document.getElementById('floatingControls').classList.remove('hidden');
    document.getElementById('batchControls').classList.add('hidden');
    showPage(currentPageIndex);
}

// --- Events Setup ---
function setupEventListeners() {
    document.getElementById('prevPage').addEventListener('click', () => { if (currentPageIndex > 0) showPage(currentPageIndex - 1); });
    document.getElementById('nextPage').addEventListener('click', () => { if (currentPageIndex < pages.length - 1) showPage(currentPageIndex + 1); });
    document.getElementById('pageJumpInput').addEventListener('change', (e) => {
        const p = parseInt(e.target.value) - 1;
        if (p >= 0 && p < pages.length) showPage(p);
    });

    document.getElementById('playAudio').addEventListener('click', playPageAudio);
    document.getElementById('toggleMute').addEventListener('click', () => {
        // Toggle logic (simplified)
        const btn = document.getElementById('toggleMute');
        if (btn.style.opacity === '0.5') { btn.style.opacity = '1'; } else { btn.style.opacity = '0.5'; }
    });

    document.getElementById('toggleBatchMode').addEventListener('click', enterBatchMode);
    document.getElementById('cancelBatchMode').addEventListener('click', exitBatchMode);
    document.getElementById('confirmBatchDelete').addEventListener('click', async () => {
        const indices = Array.from(document.querySelectorAll('.batch-checkbox:checked')).map(cb => parseInt(cb.dataset.index));
        if (!indices.length) return showToast('未選擇項目', 'error');

        // Simulating batch delete logic
        const response = await chrome.storage.local.get(['liveCapture']);
        const data = response.liveCapture;
        const page = data.pages[currentPageIndex];

        indices.sort((a, b) => b - a).forEach(i => page.screenshots.splice(i, 1));
        await chrome.storage.local.set({ liveCapture: data });

        showToast(`已刪除 ${indices.length} 張`);
        exitBatchMode();
    });
}

// --- Stall Check ---
function startStallCheck() {
    if (stallCheckInterval) clearInterval(stallCheckInterval);
    stallCheckInterval = setInterval(() => {
        if (!isCapturing) return hideForceComplete();
        if (Date.now() - lastUpdateTime > STALL_TIMEOUT_MS && pages.length > 0) {
            showForceComplete();
        }
    }, 5000);
}

function showForceComplete() {
    let btn = document.getElementById('forceCompleteBtn');
    if (!btn) {
        btn = document.createElement('button');
        btn.id = 'forceCompleteBtn';
        btn.textContent = '⚡ 強制停止';
        btn.style.cssText = 'background:var(--danger-color); color:white; border:none; padding:4px 8px; border-radius:4px; font-size:10px; margin-left:10px; cursor:pointer;';
        btn.addEventListener('click', async () => {
            const res = await chrome.storage.local.get(['liveCapture']);
            if (res.liveCapture) {
                res.liveCapture.isCapturing = false;
                await chrome.storage.local.set({ liveCapture: res.liveCapture });
                showToast('已強制停止');
                hideForceComplete();
            }
        });
        document.getElementById('captureStatus').appendChild(btn);
    }
}

function hideForceComplete() {
    const btn = document.getElementById('forceCompleteBtn');
    if (btn) btn.remove();
}

function formatTime(s) {
    return `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, '0')}`;
}
