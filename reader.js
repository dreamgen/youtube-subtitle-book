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



// Auto-hide Controls
let hideControlsTimeout = null;
const HIDE_CONTROLS_DELAY = 3000;



// Render timeout tracking
let renderPageTimeout = null;

document.addEventListener('DOMContentLoaded', async () => {
    await loadData();
    // 不再預先開啟 YouTube 分頁，改為在需要時才開啟
    setupEventListeners();
    startStorageSync();
    startKeepAlive();

    setupAutoHideControls();
});

// 關閉即時閱讀器時，關閉 YouTube 操作分頁
window.addEventListener('beforeunload', async () => {
    if (youtubeTabId) {
        try {
            await chrome.tabs.remove(youtubeTabId);
            console.log('[beforeunload] Closed YouTube tab:', youtubeTabId);
        } catch (e) {
            console.log('[beforeunload] Failed to close tab:', e);
        }
    }
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

// 確保 YouTube 操作分頁存在
async function ensureYouTubeTab() {
    console.log('[ensureYouTubeTab] Called with videoId:', videoId, 'youtubeTabId:', youtubeTabId);

    if (!videoId) {
        console.error('[ensureYouTubeTab] No videoId');
        showToast('無法取得影片 ID', 'error');
        return;
    }

    // 檢查現有的 youtubeTabId 是否有效
    if (youtubeTabId) {
        try {
            await chrome.tabs.get(youtubeTabId);
            console.log('[ensureYouTubeTab] Tab exists:', youtubeTabId);
            return; // 分頁存在，直接返回
        } catch (e) {
            // 分頁不存在，清除舊的 ID
            console.log('[ensureYouTubeTab] Old tab not found, creating new one');
            youtubeTabId = null;
        }
    }

    // 顯示載入提示
    showToast('正在載入 YouTube...', 'info');

    try {
        // 創建一個可見的 popup 視窗來播放 YouTube（方便除錯）
        console.log('[ensureYouTubeTab] Creating popup window for:', videoId);
        const win = await chrome.windows.create({
            url: `https://www.youtube.com/watch?v=${videoId}`,
            type: 'popup',
            width: 400,
            height: 300,
            left: 100,
            top: 100,
            focused: false
        });

        youtubeTabId = win.tabs[0].id;
        await chrome.storage.local.set({ youtubeOperationTabId: youtubeTabId });
        console.log('[ensureYouTubeTab] Created tab:', youtubeTabId);

        // 等待分頁載入完成
        await new Promise((resolve) => {
            const listener = (tabId, info) => {
                if (tabId === youtubeTabId && info.status === 'complete') {
                    chrome.tabs.onUpdated.removeListener(listener);
                    console.log('[ensureYouTubeTab] Tab loaded');
                    resolve();
                }
            };
            chrome.tabs.onUpdated.addListener(listener);

            // 超時保護（15秒）
            setTimeout(() => {
                chrome.tabs.onUpdated.removeListener(listener);
                console.log('[ensureYouTubeTab] Timeout, continuing anyway');
                resolve();
            }, 15000);
        });

        // 等待更長時間確保 content script 已載入（3秒）
        await new Promise(resolve => setTimeout(resolve, 3000));
        console.log('[ensureYouTubeTab] Ready');
        showToast('YouTube 已準備就緒', 'success');
    } catch (error) {
        console.error('[ensureYouTubeTab] Error:', error);
        showToast('載入 YouTube 失敗: ' + error.message, 'error');
        throw error;
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
function showPage(pageIndex, withAnimation = true) {
    if (pageIndex < 0 || (pages.length > 0 && pageIndex >= pages.length)) return;

    // Fix for empty pages case
    if (pages.length === 0) return;

    // Cancel any pending render to prevent race conditions
    if (renderPageTimeout) {
        clearTimeout(renderPageTimeout);
        renderPageTimeout = null;
    }

    const content = document.getElementById('pageContent');

    // Apply fade-out animation if requested
    if (withAnimation && currentPageIndex !== pageIndex) {
        content.classList.add('fade-out');
        renderPageTimeout = setTimeout(() => {
            renderPage(pageIndex, content);
            content.classList.remove('fade-out');
            content.classList.add('fade-in');
            setTimeout(() => content.classList.remove('fade-in'), 300);
            renderPageTimeout = null;
        }, 200);
    } else {
        renderPage(pageIndex, content);
    }
}

function renderPage(pageIndex, content) {
    // Clear controls position memory when switching pages to prevent stale data
    controlsPositionMemory = {};

    currentPageIndex = pageIndex;
    const page = pages[pageIndex];

    // 計算每張截圖的高度，確保所有截圖在一頁內可見
    const screenshotCount = page.screenshots.length;
    const maxHeight = screenshotCount > 0 ? `calc((100vh - 120px) / ${screenshotCount})` : 'auto';

    content.innerHTML = page.screenshots.map((shot, idx) => {
        // 構建 HTML 元素
        let html = `<div class="screenshot-item" data-shot-index="${idx}">`;

        // 批次模式的 checkbox
        if (isBatchMode) {
            html += `<input type="checkbox" class="batch-checkbox" data-index="${idx}">`;
        }

        // 上方字幕預覽縮圖（如果存在）
        if (shot.upperPreview) {
            const hasUpperClass = shot.hasUpperSubtitle ? 'has-upper-subtitle' : '';
            const upperIndicator = shot.hasUpperSubtitle ? '<span class="upper-subtitle-indicator">📄 偵測到上方字幕</span>' : '';
            html += `
                <div class="upper-preview-container ${hasUpperClass}" data-index="${idx}">
                    ${upperIndicator}
                    <img src="${shot.upperPreview}" class="upper-preview-thumb" alt="上方字幕預覽">
                </div>
            `;
        }

        // 主要截圖
        html += `<img src="${shot.imageData}" alt="字幕截圖" style="max-height: ${maxHeight}; object-fit: contain;">`;

        // 控制按鈕（非上方字幕時才顯示完整控制）
        html += `<div class="screenshot-controls">`;
        if (!shot.isUpperSubtitle) {
            html += `
                <button class="adj-btn" data-action="addUpper" data-index="${idx}" title="新增上方字幕">
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M5 16h3v3h2v-3h3v-2h-3V11h-2v3H5v2zm7-4.5c.83 0 1.5-.67 1.5-1.5S12.83 8.5 12 8.5s-1.5.67-1.5 1.5.67 1.5 1.5 1.5z"/></svg>
                </button>
                <button class="adj-btn" data-action="openTimeScrubber" data-index="${idx}" data-time="${shot.time}" title="微調時間">
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z"/></svg>
                </button>
                <button class="adj-btn play" data-action="playFromShot" data-index="${idx}" data-time="${shot.time}" title="播放">
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                </button>
                <button class="adj-btn" data-action="insertBelow" data-index="${idx}" title="插入截圖">
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
                </button>
            `;
        }
        html += `
            <button class="adj-btn delete" data-action="delete" data-index="${idx}" title="刪除">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="var(--danger-color)"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
            </button>
        </div>`;

        // 時間戳記
        html += `<span class="timestamp">${formatTime(shot.time)}</span>`;
        html += `</div>`;

        return html;
    }).join('');

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
            } else if (action === 'openTimeScrubber') {
                const time = parseFloat(target.dataset.time);
                await openTimeScrubberModal(idx, time);
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

    // Add hover-based auto-hide for screenshot controls
    document.querySelectorAll('.screenshot-item').forEach(item => {
        let hideTimeout = null;
        const controls = item.querySelector('.screenshot-controls');

        if (!controls) return;

        // Show controls on mouse enter
        item.addEventListener('mouseenter', () => {
            if (hideTimeout) {
                clearTimeout(hideTimeout);
            }
            controls.style.opacity = '1';
            controls.style.pointerEvents = 'auto';
        });

        // Start hide timer on mouse move
        item.addEventListener('mousemove', () => {
            if (hideTimeout) {
                clearTimeout(hideTimeout);
            }

            controls.style.opacity = '1';
            controls.style.pointerEvents = 'auto';

            // Set timeout to hide controls after 3 seconds
            hideTimeout = setTimeout(() => {
                controls.style.opacity = '0';
                controls.style.pointerEvents = 'none';
            }, 3000);
        });

        // Hide immediately on mouse leave
        item.addEventListener('mouseleave', () => {
            if (hideTimeout) {
                clearTimeout(hideTimeout);
            }
            controls.style.opacity = '0';
            controls.style.pointerEvents = 'none';
        });

        // Keep controls visible when hovering over them
        controls.addEventListener('mouseenter', () => {
            if (hideTimeout) {
                clearTimeout(hideTimeout);
            }
        });

        controls.addEventListener('mouseleave', () => {
            hideTimeout = setTimeout(() => {
                controls.style.opacity = '0';
                controls.style.pointerEvents = 'none';
            }, 3000);
        });
    });
}

// --- Actions ---
async function adjustScreenshot(shotIndex, action) {
    // 如果沒有 YouTube 分頁，先建立一個
    if (!youtubeTabId && videoId) {
        await ensureYouTubeTab();
    }

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

        // Only show error toast for critical errors
        if (!response.success) {
            // Log all errors for debugging
            console.warn(`[Reader] Adjustment failed:`, response.error, `(critical: ${response.critical})`);

            // Only show toast for critical errors or errors that should be shown to user
            if (response.critical !== false) {
                showToast('操作失敗: ' + response.error, 'error');
            }
        } else {
            // Auto-save successful - show brief confirmation
            showToast('✓ 已自動儲存', 'success');

            // Reload data from storage to sync changes
            setTimeout(() => {
                loadData();
            }, 100);
        }

    } catch (e) {
        showToast('無法連接 YouTube', 'error');
    } finally {
        if (btn) btn.style.opacity = '1';
    }
}

// --- Time Scrubber Modal ---
async function openTimeScrubberModal(shotIndex, currentTime) {
    // 如果沒有 YouTube 分頁，先建立一個
    if (!youtubeTabId && videoId) {
        await ensureYouTubeTab();
    }

    if (!youtubeTabId) return showToast('未連接 YouTube', 'error');

    showToast('準備預覽圖...', 'info');

    // Request frame previews from content script
    try {
        const response = await chrome.tabs.sendMessage(youtubeTabId, {
            action: 'generateFramePreviews',
            currentTime: currentTime,
            rangeSeconds: 5, // ±5 seconds
            intervalSeconds: 0.5
        });

        if (!response.success) {
            return showToast('無法生成預覽圖', 'error');
        }

        // Create modal
        const modal = document.createElement('div');
        modal.className = 'time-scrubber-modal';
        modal.innerHTML = `
            <div class="modal-overlay"></div>
            <div class="modal-content">
                <div class="modal-header">
                    <h3>微調截圖時間</h3>
                    <button class="modal-close">×</button>
                </div>
                <div class="modal-body">
                    <div class="preview-strip" id="previewStrip"></div>
                    <div class="scrubber-controls">
                        <input type="range" 
                               id="timeScrubber" 
                               min="${currentTime - 5}" 
                               max="${currentTime + 5}" 
                               step="0.1" 
                               value="${currentTime}">
                        <div class="time-display">
                            <span id="currentTimeDisplay">${formatTime(currentTime)}</span>
                        </div>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // Populate preview strip
        const previewStrip = document.getElementById('previewStrip');
        response.previews.forEach((preview, index) => {
            const frame = document.createElement('div');
            frame.className = 'preview-frame';
            frame.dataset.time = preview.time;
            frame.innerHTML = `
                <img src="${preview.imageData}" alt="${formatTime(preview.time)}">
                <span class="frame-time">${formatTime(preview.time)}</span>
            `;
            previewStrip.appendChild(frame);
        });

        // Scrubber event handling
        const scrubber = document.getElementById('timeScrubber');
        const timeDisplay = document.getElementById('currentTimeDisplay');
        const frames = document.querySelectorAll('.preview-frame');

        // Update preview opacity and size based on scrubber position (perspective effect)
        function updatePreviewHighlight(time) {
            frames.forEach(frame => {
                const frameTime = parseFloat(frame.dataset.time);
                const diff = Math.abs(frameTime - time);

                // Remove/add active class
                if (diff < 0.25) {
                    frame.classList.add('active');
                    frame.style.opacity = '1';
                } else {
                    frame.classList.remove('active');

                    // Perspective effect: opacity and size decrease with distance
                    const distance = diff / 5; // Normalize distance (max is 5 seconds)
                    const opacity = Math.max(0.3, 1 - distance * 0.7); // Min 30% opacity
                    frame.style.opacity = opacity.toString();

                    // Scale down images based on distance
                    const img = frame.querySelector('img');
                    if (!frame.classList.contains('active')) {
                        const scale = Math.max(0.4, 1 - distance * 0.6); // Min 40% size
                        const width = 40 * scale; // Base width 40px, scaled
                        img.style.width = `${width}px`;
                    }
                }
            });

            // Scroll to active frame
            const activeFrame = document.querySelector('.preview-frame.active');
            if (activeFrame) {
                activeFrame.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
            }
        }

        updatePreviewHighlight(currentTime);

        scrubber.addEventListener('input', (e) => {
            const newTime = parseFloat(e.target.value);
            timeDisplay.textContent = formatTime(newTime);
            updatePreviewHighlight(newTime);
        });

        scrubber.addEventListener('change', async (e) => {
            const newTime = parseFloat(e.target.value);

            // Close modal
            modal.remove();

            // Trigger recapture if time changed significantly
            if (Math.abs(newTime - currentTime) > 0.05) {
                showToast('重新截圖中...', 'info');
                await adjustScreenshotToTime(shotIndex, newTime);
            }
        });

        // Close button
        modal.querySelector('.modal-close').addEventListener('click', () => {
            modal.remove();
        });

        // Click overlay to close
        modal.querySelector('.modal-overlay').addEventListener('click', () => {
            modal.remove();
        });

    } catch (e) {
        showToast('無法連接 YouTube', 'error');
    }
}

// Adjust screenshot to specific time
async function adjustScreenshotToTime(shotIndex, newTime) {
    // 如果沒有 YouTube 分頁，先建立一個
    if (!youtubeTabId && videoId) {
        await ensureYouTubeTab();
    }

    if (!youtubeTabId) return;

    try {
        const response = await chrome.tabs.sendMessage(youtubeTabId, {
            action: 'adjustScreenshotToTime',
            pageIndex: currentPageIndex,
            shotIndex: shotIndex,
            newTime: newTime
        });

        if (response.success) {
            showToast('✓ 已自動儲存', 'success');
            setTimeout(() => loadData(), 100);
        } else {
            showToast('調整失敗: ' + response.error, 'error');
        }
    } catch (e) {
        showToast('無法連接 YouTube', 'error');
    }
}

async function playFromTime(time) {
    console.log('[playFromTime] Called - time:', time, 'videoId:', videoId, 'youtubeTabId:', youtubeTabId);

    try {
        // 確保有有效的 YouTube 分頁
        await ensureYouTubeTab();

        if (!youtubeTabId) {
            console.error('[playFromTime] No youtubeTabId after ensure');
            showToast('無法建立 YouTube 分頁', 'error');
            return;
        }

        const playbackSpeed = parseFloat(document.getElementById('playbackSpeed').value) || 1;
        const muteBtn = document.getElementById('toggleMute');
        const isMuted = muteBtn && muteBtn.classList.contains('active');

        // 不要切換分頁，保持在背景播放
        const page = pages[currentPageIndex];
        console.log('[playFromTime] Sending message to tab:', youtubeTabId);
        await chrome.tabs.sendMessage(youtubeTabId, {
            action: 'playAudioForReader',
            startTime: time,
            endTime: page ? page.endTime : time + 5,
            playbackRate: playbackSpeed,
            muted: isMuted
        });
        console.log('[playFromTime] Message sent successfully');
    } catch (e) {
        console.error('[playFromTime] Error:', e);
        showToast('播放失敗: ' + e.message, 'error');
    }
}

async function playPageAudio() {
    if (!pages[currentPageIndex]) return;

    // 切換播放/暫停
    if (isPlaying) {
        // 暫停影片
        await pauseYouTubeVideo();
        isPlaying = false;
        updatePlayButton();
    } else {
        // 播放影片
        const page = pages[currentPageIndex];
        await playFromTime(page.startTime);
        isPlaying = true;
        updatePlayButton();
    }
}

async function pauseYouTubeVideo() {
    try {
        if (!youtubeTabId) return;

        await chrome.tabs.sendMessage(youtubeTabId, {
            action: 'pauseVideo'
        });
    } catch (e) {
        console.error('[pauseYouTubeVideo] Error:', e);
    }
}

function updatePlayButton() {
    const btn = document.getElementById('playAudio');
    if (!btn) return;
    // Toggle play/pause icon state
    const svg = btn.querySelector('svg path');
    if (svg) {
        svg.setAttribute('d', isPlaying ? 'M6 19h4V5H6v14zm8-14v14h4V5h-4z' : 'M8 5v14l11-7z');
    }
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
    document.getElementById('prevPage').addEventListener('click', () => { if (currentPageIndex > 0) showPage(currentPageIndex - 1, true); });
    document.getElementById('nextPage').addEventListener('click', () => { if (currentPageIndex < pages.length - 1) showPage(currentPageIndex + 1, true); });
    document.getElementById('pageJumpInput').addEventListener('change', (e) => {
        const p = parseInt(e.target.value) - 1;
        if (p >= 0 && p < pages.length) showPage(p, true);
    });

    document.getElementById('playAudio').addEventListener('click', playPageAudio);
    document.getElementById('toggleMute').addEventListener('click', () => {
        const btn = document.getElementById('toggleMute');
        btn.classList.toggle('active');
        const isMuted = btn.classList.contains('active');
        // Update icon
        const svg = btn.querySelector('svg path');
        if (svg) {
            svg.setAttribute('d', isMuted
                ? 'M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z'
                : 'M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z');
        }
    });

    document.getElementById('toggleBatchMode').addEventListener('click', enterBatchMode);
    document.getElementById('cancelBatchMode').addEventListener('click', exitBatchMode);
    document.getElementById('confirmBatchDelete').addEventListener('click', async () => {
        const indices = Array.from(document.querySelectorAll('.batch-checkbox:checked')).map(cb => parseInt(cb.dataset.index));
        if (!indices.length) return showToast('未選擇項目', 'error');

        const response = await chrome.storage.local.get(['liveCapture']);
        const data = response.liveCapture;
        const page = data.pages[currentPageIndex];

        if (indices.length >= page.screenshots.length) {
            return showToast('無法刪除所有截圖，每頁至少需保留一張', 'error');
        }

        // 從後向前刪除，避免索引變化
        indices.sort((a, b) => b - a).forEach(i => page.screenshots.splice(i, 1));

        // 更新頁面時間範圍
        const remainingShots = page.screenshots;
        if (remainingShots.length > 0) {
            page.startTime = remainingShots[0].time;
            page.endTime = remainingShots[remainingShots.length - 1].time;
        }

        await chrome.storage.local.set({ liveCapture: data });

        showToast(`已刪除 ${indices.length} 張`, 'success');
        exitBatchMode();
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        // Ignore if user is typing in input fields
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') {
            return;
        }

        // Get the currently focused screenshot (if hovering)
        const hoveredItem = document.querySelector('.screenshot-item:hover');
        const hoveredIndex = hoveredItem ? parseInt(hoveredItem.dataset.shotIndex) : null;

        switch (e.key) {
            case 'ArrowLeft':
                // 左：截圖向前調整時間 (-0.2s)
                e.preventDefault();
                if (hoveredIndex !== null) {
                    adjustScreenshot(hoveredIndex, 'backward');
                }
                break;

            case 'ArrowRight':
                // 右：截圖向後調整時間 (+0.2s)
                e.preventDefault();
                if (hoveredIndex !== null) {
                    adjustScreenshot(hoveredIndex, 'forward');
                }
                break;

            case 'ArrowUp':
                // 上：上一頁
                e.preventDefault();
                if (currentPageIndex > 0) {
                    showPage(currentPageIndex - 1, true);
                }
                break;

            case 'ArrowDown':
                // 下：下一頁
                e.preventDefault();
                if (currentPageIndex < pages.length - 1) {
                    showPage(currentPageIndex + 1, true);
                }
                break;

            case 'Enter':
                // Enter：下一頁
                e.preventDefault();
                if (currentPageIndex < pages.length - 1) {
                    showPage(currentPageIndex + 1, true);
                }
                break;

            case ' ':
                // 空白鍵：播放/暫停
                e.preventDefault();
                playPageAudio();
                break;
        }
    });
}



function formatTime(s) {
    return `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, '0')}`;
}

// --- Auto-hide Controls ---
function setupAutoHideControls() {
    const controls = document.getElementById('floatingControls');
    const batchControls = document.getElementById('batchControls');

    if (!controls) return;

    const resetHideTimer = () => {
        // Clear existing timeout
        if (hideControlsTimeout) {
            clearTimeout(hideControlsTimeout);
        }

        // Show controls
        controls.classList.remove('hidden-auto');
        if (batchControls && !batchControls.classList.contains('hidden')) {
            batchControls.classList.remove('hidden-auto');
        }

        // Set new timeout to hide after 3 seconds
        hideControlsTimeout = setTimeout(() => {
            controls.classList.add('hidden-auto');
            if (batchControls && !batchControls.classList.contains('hidden')) {
                batchControls.classList.add('hidden-auto');
            }
        }, HIDE_CONTROLS_DELAY);
    };

    // Listen for mouse movement
    document.addEventListener('mousemove', resetHideTimer);
    document.addEventListener('mousedown', resetHideTimer);
    document.addEventListener('keydown', resetHideTimer);

    // Keep controls visible when hovering over them
    controls.addEventListener('mouseenter', () => {
        if (hideControlsTimeout) {
            clearTimeout(hideControlsTimeout);
        }
        controls.classList.remove('hidden-auto');
    });

    controls.addEventListener('mouseleave', () => {
        resetHideTimer();
    });

    // Initial hide timer
    resetHideTimer();
}
