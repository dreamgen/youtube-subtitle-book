// Library Manager - Complete Segment Management

let videoId = null;
let allSegments = [];
let filteredSegments = [];
let selectedKeys = new Set();

// 自訂確認對話框（因為 popup 中無法使用 confirm）
function customConfirm(message) {
    return new Promise((resolve) => {
        const modal = document.createElement('div');
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.5);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10000;
        `;

        const dialog = document.createElement('div');
        dialog.style.cssText = `
            background: var(--bg-color, white);
            border: 1px solid var(--border-color, #ccc);
            border-radius: 8px;
            padding: 20px;
            max-width: 400px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        `;

        dialog.innerHTML = `
            <div style="color: var(--text-primary, black); margin-bottom: 20px; white-space: pre-wrap;">${message}</div>
            <div style="display: flex; gap: 10px; justify-content: flex-end;">
                <button id="cancelBtn" style="padding: 8px 16px; border: 1px solid var(--border-color, #ccc); background: var(--surface-color, #f5f5f5); border-radius: 4px; cursor: pointer;">取消</button>
                <button id="confirmBtn" style="padding: 8px 16px; border: none; background: #f44336; color: white; border-radius: 4px; cursor: pointer;">確定</button>
            </div>
        `;

        modal.appendChild(dialog);
        document.body.appendChild(modal);

        document.getElementById('confirmBtn').onclick = () => {
            document.body.removeChild(modal);
            resolve(true);
        };

        document.getElementById('cancelBtn').onclick = () => {
            document.body.removeChild(modal);
            resolve(false);
        };

        modal.onclick = (e) => {
            if (e.target === modal) {
                document.body.removeChild(modal);
                resolve(false);
            }
        };
    });
}

// --- Init ---
document.addEventListener('DOMContentLoaded', async () => {
    // Get videoId from URL query
    const urlParams = new URLSearchParams(window.location.search);
    videoId = urlParams.get('videoId');

    if (!videoId) {
        showToast('無法取得影片 ID', 'error');
        return;
    }

    await loadSegments();
    setupEventListeners();
});

// --- Data Loading ---
async function loadSegments() {
    const result = await chrome.storage.local.get(['savedSegments']);
    allSegments = (result.savedSegments || []).filter(s => s.videoId === videoId);

    // Get video title from first segment
    if (allSegments.length > 0 && allSegments[0].videoTitle) {
        document.getElementById('videoInfo').textContent = `影片：${allSegments[0].videoTitle}`;
    } else {
        document.getElementById('videoInfo').textContent = `影片 ID：${videoId}`;
    }

    // Apply default sort
    sortSegments('newest');
    filterAndRender();
    updateStats();
}

// --- Sorting ---
function sortSegments(sortBy) {
    switch (sortBy) {
        case 'newest':
            allSegments.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
            break;
        case 'oldest':
            allSegments.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
            break;
        case 'duration':
            allSegments.sort((a, b) => {
                const durationA = (a.endTime || 0) - (a.startTime || 0);
                const durationB = (b.endTime || 0) - (b.startTime || 0);
                return durationB - durationA;
            });
            break;
    }
}

// --- Filtering & Rendering ---
function filterAndRender() {
    const searchText = document.getElementById('searchBox').value.toLowerCase();

    filteredSegments = allSegments.filter(seg => {
        if (!searchText) return true;
        const timeRange = `${formatTime(seg.startTime)} - ${formatTime(seg.endTime)}`.toLowerCase();
        return timeRange.includes(searchText);
    });

    renderSegments();
}

function renderSegments() {
    const listContainer = document.getElementById('segmentList');

    if (filteredSegments.length === 0) {
        listContainer.innerHTML = `
            <div class="empty-state">
                <svg viewBox="0 0 24 24" fill="currentColor">
                    <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM9 17H7v-7h2v7zm4 0h-2V7h2v10zm4 0h-2v-4h2v4z"/>
                </svg>
                <div>${document.getElementById('searchBox').value ? '找不到符合的段落' : '尚無儲存的段落'}</div>
            </div>
        `;
        return;
    }

    listContainer.innerHTML = filteredSegments.map(seg => {
        const isSelected = selectedKeys.has(seg.key);
        const date = seg.createdAt ? new Date(seg.createdAt).toLocaleString('zh-TW', {
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        }) : '未知時間';
        const duration = seg.endTime - seg.startTime;

        return `
            <div class="segment-item ${isSelected ? 'selected' : ''}" data-key="${seg.key}">
                <input type="checkbox" class="segment-checkbox" data-key="${seg.key}" ${isSelected ? 'checked' : ''}>
                <div class="segment-info">
                    <div class="segment-title">
                        <span>${formatTime(seg.startTime)} - ${formatTime(seg.endTime)}</span>
                        <span style="color: var(--text-secondary);">|</span>
                        <span style="color: var(--success-color);">${seg.pageCount} 頁</span>
                    </div>
                    <div class="segment-meta">
                        <span>📅 ${date}</span>
                        <span>⏱ ${Math.floor(duration / 60)}:${Math.floor(duration % 60).toString().padStart(2, '0')}</span>
                        <span>📸 ${seg.screenshotCount || 0} 張</span>
                    </div>
                </div>
                <div class="segment-actions">
                    <button class="icon-btn primary" data-action="load" data-key="${seg.key}" title="開啟閱讀器">
                        📖
                    </button>
                    <button class="icon-btn" data-action="download" data-key="${seg.key}" title="單獨下載 PDF">
                        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                            <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/>
                        </svg>
                    </button>
                    <button class="icon-btn danger" data-action="delete" data-key="${seg.key}" title="刪除">
                        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                            <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
                        </svg>
                    </button>
                </div>
            </div>
        `;
    }).join('');

    // Bind events
    bindSegmentEvents();
}

function bindSegmentEvents() {
    let lastClickedIndex = null;

    // Checkbox events
    document.querySelectorAll('.segment-checkbox').forEach(cb => {
        cb.addEventListener('change', (e) => {
            const key = e.target.dataset.key;
            if (e.target.checked) {
                selectedKeys.add(key);
            } else {
                selectedKeys.delete(key);
            }
            updateSelection();
        });
    });

    // Action button events
    document.querySelectorAll('.segment-actions button').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const action = e.currentTarget.dataset.action;
            const key = e.currentTarget.dataset.key;

            switch (action) {
                case 'load':
                    await loadSegment(key);
                    break;
                case 'download':
                    await downloadSinglePdf(key);
                    break;
                case 'delete':
                    await deleteSingleSegment(key);
                    break;
            }
        });
    });

    // Enhanced click on item to toggle checkbox with Shift+Click range selection
    document.querySelectorAll('.segment-item').forEach((item, currentIndex) => {
        item.addEventListener('click', (e) => {
            // Ignore if clicking on checkbox or button
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'BUTTON' || e.target.closest('button')) {
                return;
            }

            const key = item.dataset.key;
            const checkbox = item.querySelector('.segment-checkbox');

            // Shift+Click for range selection
            if (e.shiftKey && lastClickedIndex !== null) {
                const start = Math.min(lastClickedIndex, currentIndex);
                const end = Math.max(lastClickedIndex, currentIndex);

                // Select all items in range
                const items = document.querySelectorAll('.segment-item');
                for (let i = start; i <= end; i++) {
                    const rangeItem = items[i];
                    const rangeKey = rangeItem.dataset.key;
                    const rangeCheckbox = rangeItem.querySelector('.segment-checkbox');

                    if (!rangeCheckbox.checked) {
                        rangeCheckbox.checked = true;
                        selectedKeys.add(rangeKey);
                    }
                }
                updateSelection();
            } else {
                // Normal click - toggle single item
                checkbox.checked = !checkbox.checked;
                if (checkbox.checked) {
                    selectedKeys.add(key);
                } else {
                    selectedKeys.delete(key);
                }
                updateSelection();
            }

            // Remember last clicked index for shift+click
            lastClickedIndex = currentIndex;
        });
    });
}

// --- Actions ---
async function loadSegment(key) {
    try {
        // 從 storage 讀取該段落的完整資料（包含截圖）
        const result = await chrome.storage.local.get([`segment_${key}`]);
        const segmentData = result[`segment_${key}`];

        if (!segmentData) {
            showToast('找不到該段落資料', 'error');
            return;
        }

        console.log('載入段落資料:', segmentData);

        // 儲存書庫閱讀模式的資料（單一段落）
        await chrome.storage.local.set({
            libraryReaderMode: {
                videoId: videoId,
                segments: [segmentData], // 完整的段落資料（包含 screenshots）
                openReader: true
            }
        });

        // 找到最後使用的正常瀏覽器視窗
        const windows = await chrome.windows.getAll({
            populate: false,
            windowTypes: ['normal']
        });

        let targetWindowId = null;
        if (windows.length > 0) {
            // 使用最後一個正常視窗（通常是最近使用的）
            const sortedWindows = windows.sort((a, b) => b.id - a.id);
            targetWindowId = sortedWindows[0].id;
        }

        // 在主視窗中開啟新分頁
        showToast('正在開啟閱讀器...', 'info');
        await chrome.tabs.create({
            url: `https://www.youtube.com/watch?v=${videoId}`,
            active: true,
            windowId: targetWindowId
        });

        // 關閉 popup 視窗（如果是從 popup 開啟的）
        if (window.opener === null && window.name === '') {
            window.close();
        }
    } catch (error) {
        console.error('Load segment error:', error);
        showToast('載入失敗: ' + error.message, 'error');
    }
}

async function downloadSinglePdf(key) {
    showToast('正在產生 PDF...');
    await exportPdfForKeys([key]);
}

async function deleteSingleSegment(key) {
    const confirmed = await customConfirm('確定要刪除此段落？');
    if (!confirmed) return;

    const result = await chrome.storage.local.get(['savedSegments']);
    let segments = result.savedSegments || [];
    segments = segments.filter(s => s.key !== key);

    await chrome.storage.local.remove([`segment_${key}`]);
    await chrome.storage.local.set({ savedSegments: segments });

    selectedKeys.delete(key);
    await loadSegments();
    showToast('已刪除', 'success');
}

// --- Batch Actions ---
function toggleSelectAll() {
    if (selectedKeys.size === filteredSegments.length) {
        // Deselect all
        selectedKeys.clear();
    } else {
        // Select all
        filteredSegments.forEach(seg => selectedKeys.add(seg.key));
    }
    updateSelection();
}

async function batchDelete() {
    if (selectedKeys.size === 0) {
        return showToast('請先選擇要刪除的段落', 'error');
    }

    const confirmed = await customConfirm(`確定要刪除 ${selectedKeys.size} 個段落？`);
    if (!confirmed) return;

    const result = await chrome.storage.local.get(['savedSegments']);
    let segments = result.savedSegments || [];

    const keysToDelete = Array.from(selectedKeys);
    segments = segments.filter(s => !keysToDelete.includes(s.key));

    // Remove from storage
    const removeKeys = keysToDelete.map(k => `segment_${k}`);
    await chrome.storage.local.remove(removeKeys);
    await chrome.storage.local.set({ savedSegments: segments });

    selectedKeys.clear();
    await loadSegments();
    showToast(`已刪除 ${keysToDelete.length} 個段落`, 'success');
}

async function batchExportPdf() {
    if (selectedKeys.size === 0) {
        return showToast('請先選擇要匯出的段落', 'error');
    }

    showToast('正在產生 PDF...');
    await exportPdfForKeys(Array.from(selectedKeys));
}

// --- PDF Export ---
async function exportPdfForKeys(keys) {
    try {
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF();
        let pageHeight = pdf.internal.pageSize.getHeight();
        let pageWidth = pdf.internal.pageSize.getWidth();

        let isFirstPage = true;
        let processedCount = 0;
        let videoTitle = 'Subtitle Book';

        for (const key of keys) {
            const result = await chrome.storage.local.get([`segment_${key}`]);
            const data = result[`segment_${key}`];
            if (!data) continue;

            if (data.videoTitle) videoTitle = data.videoTitle;

            // Render each segment's pages
            data.pages.forEach((page) => {
                if (!isFirstPage) {
                    pdf.addPage();
                }
                isFirstPage = false;

                const margin = 10;
                const headerHeight = 8;
                const shotCount = page.screenshots.length;
                const availableHeight = pageHeight - (margin * 2) - 10 - headerHeight;
                const maxShotHeight = availableHeight / shotCount;

                // Page header with play link
                const pageStartUrl = `https://www.youtube.com/watch?v=${videoId}&t=${Math.floor(page.startTime)}`;
                pdf.setFontSize(10);
                pdf.setTextColor(0, 100, 200);
                pdf.textWithLink('[> PLAY]', margin, margin + 4, { url: pageStartUrl });
                pdf.setTextColor(100);
                pdf.text(`Page ${page.pageNumber}`, pageWidth - margin, margin + 4, { align: 'right' });

                page.screenshots.forEach((shot, idx) => {
                    const imgData = shot.imageData;
                    const yPos = margin + headerHeight + (idx * maxShotHeight);
                    const imgWidth = pageWidth - 2 * margin - 25; // Leave space for timestamp
                    pdf.addImage(imgData, 'JPEG', margin, yPos, imgWidth, maxShotHeight - 2);

                    // Add clickable timestamp link
                    const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}&t=${Math.floor(shot.time)}`;
                    pdf.setFontSize(9);
                    pdf.setTextColor(0, 100, 200);
                    pdf.textWithLink(`[>] ${formatTime(shot.time)}`, pageWidth - margin - 20, yPos + maxShotHeight / 2, { url: youtubeUrl });
                });

                // Footer
                pdf.setFontSize(10);
                pdf.setTextColor(100);
                const timeRange = `${formatTime(page.startTime)} - ${formatTime(page.endTime)}`;
                pdf.text(`${data.videoTitle || ''} | ${timeRange}`, pageWidth / 2, pageHeight - 5, { align: 'center' });

                processedCount++;
            });
        }

        const fileName = `${videoTitle.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '_')}_${keys.length}segments.pdf`;
        pdf.save(fileName);
        showToast(`PDF 下載完成 (${processedCount} 頁)`, 'success');
    } catch (e) {
        console.error('PDF export error:', e);
        showToast('匯出失敗: ' + e.message, 'error');
    }
}

// --- UI Updates ---
function updateSelection() {
    renderSegments();
    updateStats();
}

function updateStats() {
    document.getElementById('totalCount').textContent = allSegments.length;
    const selectedCount = selectedKeys.size;
    document.getElementById('selectedCount').textContent = selectedCount;

    const totalPages = allSegments.reduce((sum, seg) => sum + (seg.pageCount || 0), 0);
    document.getElementById('totalPages').textContent = totalPages;

    // Add visual highlight when items are selected
    const selectedElement = document.getElementById('selectedCount');
    if (selectedCount > 0) {
        selectedElement.style.color = '#FF0000';  // YouTube red
        selectedElement.style.fontWeight = 'bold';
        selectedElement.style.transform = 'scale(1.1)';
    } else {
        selectedElement.style.color = 'var(--primary-color)';
        selectedElement.style.fontWeight = 'bold';
        selectedElement.style.transform = 'scale(1)';
    }
}

// --- Event Listeners ---
function setupEventListeners() {
    // Search
    document.getElementById('searchBox').addEventListener('input', filterAndRender);

    // Sort
    document.getElementById('sortSelect').addEventListener('change', (e) => {
        sortSegments(e.target.value);
        filterAndRender();
    });

    // Batch actions
    document.getElementById('selectAllBtn').addEventListener('click', toggleSelectAll);
    document.getElementById('batchDeleteBtn').addEventListener('click', batchDelete);
    document.getElementById('batchExportPdfBtn').addEventListener('click', batchExportPdf);
    document.getElementById('batchExportHtmlBtn').addEventListener('click', batchExportHtml);

    // Import/Export
    document.getElementById('exportBtn').addEventListener('click', exportAllSegments);
    document.getElementById('importFile').addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            importSegments(file);
            e.target.value = ''; // Reset for next import
        }
    });
}

// --- Helpers ---
function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = 'toast';
    const icon = type === 'error' ? '❌' : (type === 'success' ? '✅' : 'ℹ️');
    toast.innerHTML = `<span>${icon}</span><span>${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100px)';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// --- HTML Audiobook Export ---
async function batchExportHtml() {
    if (selectedKeys.size === 0) {
        return showToast('請先選擇要匯出的段落', 'error');
    }
    showToast('正在產生有聲書 HTML...');
    await exportHtmlAudioBook(Array.from(selectedKeys));
}

async function exportHtmlAudioBook(keys) {
    try {
        let allPages = [];
        let videoTitle = 'Subtitle Audiobook';

        for (const key of keys) {
            const result = await chrome.storage.local.get([`segment_${key}`]);
            const data = result[`segment_${key}`];
            if (!data) continue;
            if (data.videoTitle) videoTitle = data.videoTitle;
            allPages.push(...data.pages);
        }

        if (allPages.length === 0) {
            return showToast('沒有頁面資料可匯出', 'error');
        }

        // Generate HTML content
        const htmlContent = `<!DOCTYPE html>
<html lang="zh-TW">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${videoTitle} - 有聲書</title>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
            color: #fff;
            min-height: 100vh;
            padding: 20px;
        }
        .header {
            text-align: center;
            padding: 20px 0 30px;
            border-bottom: 1px solid rgba(255,255,255,0.1);
            margin-bottom: 30px;
        }
        .header h1 { font-size: 24px; margin-bottom: 10px; }
        .header p { color: rgba(255,255,255,0.6); font-size: 14px; }
        #player-container {
            position: fixed;
            bottom: 20px;
            right: 20px;
            width: 320px;
            height: 180px;
            border-radius: 12px;
            overflow: hidden;
            box-shadow: 0 10px 40px rgba(0,0,0,0.5);
            z-index: 1000;
            background: #000;
        }
        #player-container.minimized {
            width: 60px;
            height: 60px;
            border-radius: 50%;
            cursor: pointer;
        }
        #player-container.minimized iframe { display: none; }
        #player-container.minimized::after {
            content: '🔊';
            display: flex;
            align-items: center;
            justify-content: center;
            width: 100%;
            height: 100%;
            font-size: 24px;
            background: linear-gradient(135deg, #ff0000, #cc0000);
        }
        .page {
            background: rgba(255,255,255,0.05);
            border-radius: 12px;
            padding: 20px;
            margin-bottom: 20px;
            border: 1px solid rgba(255,255,255,0.1);
        }
        .page-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 15px;
            padding-bottom: 10px;
            border-bottom: 1px solid rgba(255,255,255,0.1);
        }
        .page-title { font-size: 16px; font-weight: 600; }
        .play-btn {
            background: linear-gradient(135deg, #ff0000, #cc0000);
            border: none;
            color: white;
            padding: 8px 16px;
            border-radius: 20px;
            cursor: pointer;
            font-size: 14px;
            transition: transform 0.2s, box-shadow 0.2s;
        }
        .play-btn:hover {
            transform: scale(1.05);
            box-shadow: 0 4px 15px rgba(255,0,0,0.4);
        }
        .screenshot {
            display: flex;
            align-items: center;
            gap: 15px;
            padding: 10px;
            margin: 8px 0;
            background: rgba(255,255,255,0.03);
            border-radius: 8px;
            cursor: pointer;
            transition: background 0.2s;
        }
        .screenshot:hover { background: rgba(255,255,255,0.08); }
        .screenshot img {
            max-width: 70%;
            border-radius: 6px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.3);
        }
        .timestamp {
            color: #4dabf7;
            font-size: 14px;
            white-space: nowrap;
        }
        .speed-indicator {
            position: fixed;
            top: 20px;
            right: 20px;
            background: rgba(255,0,0,0.9);
            padding: 8px 16px;
            border-radius: 20px;
            font-size: 14px;
            font-weight: bold;
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>📖 ${videoTitle}</h1>
        <p>點擊時間戳或播放按鈕，以 1.5x 速度播放</p>
    </div>
    <div class="speed-indicator">⚡ 1.5x 速度</div>
    <div id="player-container" class="minimized"></div>
    <div id="pages">
${allPages.map((page, pageIdx) => `
        <div class="page">
            <div class="page-header">
                <span class="page-title">第 ${page.pageNumber || pageIdx + 1} 頁</span>
                <button class="play-btn" onclick="playAt(${page.startTime})">▶ 播放整頁</button>
            </div>
${page.screenshots.map(shot => `
            <div class="screenshot" onclick="playAt(${shot.time})">
                <img src="${shot.imageData}" alt="字幕截圖">
                <span class="timestamp">🔊 ${formatTimeForHtml(shot.time)}</span>
            </div>
`).join('')}
        </div>
`).join('')}
    </div>

    <script>
        let player;
        let playerReady = false;

        // Load YouTube IFrame API
        const tag = document.createElement('script');
        tag.src = 'https://www.youtube.com/iframe_api';
        document.head.appendChild(tag);

        function onYouTubeIframeAPIReady() {
            player = new YT.Player('player-container', {
                height: '180',
                width: '320',
                videoId: '${videoId}',
                playerVars: {
                    'autoplay': 0,
                    'controls': 1,
                    'rel': 0,
                    'modestbranding': 1
                },
                events: {
                    'onReady': onPlayerReady,
                    'onStateChange': onPlayerStateChange
                }
            });
        }

        function onPlayerReady(event) {
            playerReady = true;
            player.setPlaybackRate(1.5);
            document.getElementById('player-container').classList.remove('minimized');
        }

        function onPlayerStateChange(event) {
            if (event.data === YT.PlayerState.PLAYING) {
                player.setPlaybackRate(1.5);
            }
        }

        function playAt(seconds) {
            if (!playerReady) {
                alert('播放器載入中，請稍候...');
                return;
            }
            document.getElementById('player-container').classList.remove('minimized');
            player.seekTo(seconds, true);
            player.playVideo();
            player.setPlaybackRate(1.5);
        }
    <\/script>
</body>
</html>`;

        // Download HTML file
        const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${videoTitle.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '_')}_audiobook.html`;
        a.click();
        URL.revokeObjectURL(url);

        showToast(`有聲書 HTML 下載完成 (${allPages.length} 頁)`, 'success');
    } catch (e) {
        console.error('HTML export error:', e);
        showToast('匯出失敗: ' + e.message, 'error');
    }
}

function formatTimeForHtml(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// --- Import/Export Functions ---
async function exportAllSegments() {
    const result = await chrome.storage.local.get(null);
    const allStoredSegments = result.savedSegments || [];

    if (allStoredSegments.length === 0) {
        return showToast('沒有可匯出的段落', 'error');
    }

    // Collect all segment data
    const exportData = {
        version: '1.0',
        exportDate: new Date().toISOString(),
        segments: allStoredSegments,
        segmentData: {}
    };

    for (const seg of allStoredSegments) {
        const data = result[`segment_${seg.key}`];
        if (data) {
            exportData.segmentData[seg.key] = data;
        }
    }

    // Download as JSON
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `subtitle-book-export-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);

    showToast(`已匯出 ${allStoredSegments.length} 個段落`, 'success');
}

async function importSegments(file) {
    try {
        const text = await file.text();
        const importData = JSON.parse(text);

        if (!importData.segments || !importData.segmentData) {
            return showToast('無效的匯入檔案格式', 'error');
        }

        // Get existing segments
        const result = await chrome.storage.local.get(['savedSegments']);
        let segments = result.savedSegments || [];

        let importCount = 0;
        let skipCount = 0;
        const saveData = {};

        for (const seg of importData.segments) {
            const data = importData.segmentData[seg.key];
            if (data) {
                // Check if already exists
                const exists = segments.find(s => s.key === seg.key);
                if (!exists) {
                    segments.push(seg);
                    saveData[`segment_${seg.key}`] = data;
                    importCount++;
                } else {
                    skipCount++;
                }
            }
        }

        if (importCount > 0) {
            saveData.savedSegments = segments;
            await chrome.storage.local.set(saveData);
            await loadSegments();
            showToast(`已匯入 ${importCount} 個段落${skipCount > 0 ? `，跳過 ${skipCount}個重複項` : ''}`, 'success');
        } else {
            showToast('沒有新的段落可匯入', 'error');
        }
    } catch (e) {
        console.error('Import failed:', e);
        showToast('匯入失敗: ' + e.message, 'error');
    }
}
