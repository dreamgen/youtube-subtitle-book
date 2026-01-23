// All Libraries Manager - 書庫總管理
// 管理所有影片的儲存資料

let allVideos = [];
let selectedVideoIds = new Set();

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

// 初始化
document.addEventListener('DOMContentLoaded', async () => {
    await loadAllVideos();
    bindEvents();
});

// 載入所有影片資料
async function loadAllVideos() {
    try {
        const result = await chrome.storage.local.get(null);
        allVideos = [];

        // 遍歷所有儲存的資料
        for (const [key, value] of Object.entries(result)) {
            // 篩選出 segment_ 開頭的資料
            if (key.startsWith('segment_')) {
                const parts = key.split('_');
                if (parts.length >= 3) {
                    const videoId = parts[1];

                    // 檢查是否已經添加過這個影片
                    if (!allVideos.find(v => v.videoId === videoId)) {
                        // 收集該影片的所有 segment
                        const segments = Object.entries(result)
                            .filter(([k]) => k.startsWith(`segment_${videoId}_`))
                            .map(([k, v]) => ({ key: k, data: v }));

                        if (segments.length > 0) {
                            // 使用第一個 segment 的資料取得影片標題
                            const firstSegment = segments[0].data;

                            allVideos.push({
                                videoId: videoId,
                                title: firstSegment.videoTitle || 'Unknown',
                                segmentCount: segments.length,
                                segments: segments,
                                firstCreated: firstSegment.startTime || 0
                            });
                        }
                    }
                }
            }
        }

        // 按建立時間排序（新的在前）
        allVideos.sort((a, b) => b.firstCreated - a.firstCreated);

        // 更新統計資料
        updateStats();

        // 更新儲存容量資訊
        updateStorageInfo();

        // 渲染列表
        renderVideoList();

    } catch (error) {
        console.error('載入影片資料失敗:', error);
    }
}

// 更新統計資料
function updateStats() {
    const totalVideos = allVideos.length;
    const totalSegments = allVideos.reduce((sum, v) => sum + v.segmentCount, 0);

    // 估算總容量（粗略估計）
    const avgSegmentSize = 500; // KB per segment
    const totalSizeMB = (totalSegments * avgSegmentSize / 1024).toFixed(1);

    document.getElementById('totalVideos').textContent = totalVideos;
    document.getElementById('totalSegments').textContent = totalSegments;
    document.getElementById('totalSize').textContent = totalSizeMB + ' MB';
}

// 更新儲存容量資訊
async function updateStorageInfo() {
    try {
        if (chrome.storage.local.getBytesInUse) {
            const bytesInUse = await chrome.storage.local.getBytesInUse(null);
            const mb = (bytesInUse / 1024 / 1024).toFixed(2);

            // Chrome local storage 上限通常是 10MB（unlimitedStorage 權限下可更大）
            const limitMB = 100; // 假設上限 100MB
            const percentage = Math.min((bytesInUse / (limitMB * 1024 * 1024)) * 100, 100);

            document.getElementById('storageUsage').textContent = `${mb} MB`;
            document.getElementById('storageFill').style.width = `${percentage}%`;
        } else {
            document.getElementById('storageUsage').textContent = '無法計算';
        }
    } catch (error) {
        console.error('計算儲存容量失敗:', error);
    }
}

// 渲染影片列表
function renderVideoList() {
    const container = document.getElementById('videoList');
    const searchTerm = document.getElementById('searchBox').value.toLowerCase();

    // 過濾影片
    const filteredVideos = allVideos.filter(video =>
        video.title.toLowerCase().includes(searchTerm) ||
        video.videoId.toLowerCase().includes(searchTerm)
    );

    if (filteredVideos.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <svg viewBox="0 0 24 24" fill="currentColor">
                    <path d="M20 6h-8l-2-2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm0 12H4V6h5.17l2 2H20v10zm-8-4h2v2h-2zm0-6h2v4h-2z"/>
                </svg>
                <div style="font-size: 18px; margin-bottom: 10px;">暫無儲存資料</div>
                <div style="font-size: 14px;">在 YouTube 上使用字幕電子書功能後，資料會出現在這裡</div>
            </div>
        `;
        return;
    }

    container.innerHTML = filteredVideos.map(video => `
        <div class="video-item ${selectedVideoIds.has(video.videoId) ? 'selected' : ''}" data-video-id="${video.videoId}">
            <input type="checkbox" class="video-checkbox" ${selectedVideoIds.has(video.videoId) ? 'checked' : ''}>
            <div class="video-info">
                <div class="video-title">${escapeHtml(video.title)}</div>
                <div class="video-meta">
                    <span>📄 ${video.segmentCount} 個段落</span>
                    <span>🆔 ${video.videoId}</span>
                </div>
            </div>
            <div class="video-actions">
                <button class="icon-btn manage-btn" data-video-id="${video.videoId}">
                    📚 管理段落
                </button>
                <button class="icon-btn view-btn" data-video-id="${video.videoId}">
                    👁️ 查看
                </button>
                <button class="icon-btn delete-btn" data-video-id="${video.videoId}">
                    🗑️ 刪除
                </button>
            </div>
        </div>
    `).join('');

    // 綁定項目事件
    bindItemEvents();
    updateSelectionInfo();
}

// 綁定項目事件
function bindItemEvents() {
    // Checkbox 事件
    document.querySelectorAll('.video-checkbox').forEach(checkbox => {
        checkbox.addEventListener('change', (e) => {
            const videoItem = e.target.closest('.video-item');
            const videoId = videoItem.dataset.videoId;

            if (e.target.checked) {
                selectedVideoIds.add(videoId);
                videoItem.classList.add('selected');
            } else {
                selectedVideoIds.delete(videoId);
                videoItem.classList.remove('selected');
            }

            updateSelectionInfo();
        });
    });

    // 管理按鈕
    document.querySelectorAll('.manage-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const videoId = e.target.dataset.videoId;
            openLibraryManager(videoId);
        });
    });

    // 查看按鈕
    document.querySelectorAll('.view-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const videoId = e.target.dataset.videoId;
            openYouTubeVideo(videoId);
        });
    });

    // 刪除按鈕
    document.querySelectorAll('.delete-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const videoId = e.target.dataset.videoId;
            const video = allVideos.find(v => v.videoId === videoId);

            const confirmed = await customConfirm(`確定要刪除「${video.title}」的所有資料嗎？\n\n這將刪除 ${video.segmentCount} 個段落，此操作無法復原。`);
            if (confirmed) {
                await deleteVideo(videoId);
            }
        });
    });
}

// 綁定全域事件
function bindEvents() {
    // 搜尋框
    document.getElementById('searchBox').addEventListener('input', () => {
        renderVideoList();
    });

    // 重新整理按鈕
    document.getElementById('refreshBtn').addEventListener('click', async () => {
        selectedVideoIds.clear();
        await loadAllVideos();
    });

    // 刪除選取項目按鈕
    document.getElementById('deleteSelectedBtn').addEventListener('click', async () => {
        if (selectedVideoIds.size === 0) return;

        const confirmed = await customConfirm(`確定要刪除選取的 ${selectedVideoIds.size} 個影片的所有資料嗎？\n\n此操作無法復原。`);
        if (confirmed) {
            for (const videoId of selectedVideoIds) {
                await deleteVideo(videoId, false); // 不重新載入
            }
            selectedVideoIds.clear();
            await loadAllVideos(); // 統一重新載入
        }
    });

    // 全選按鈕
    document.getElementById('selectAllBtn').addEventListener('click', () => {
        allVideos.forEach(video => selectedVideoIds.add(video.videoId));
        renderVideoList();
    });

    // 取消全選按鈕
    document.getElementById('deselectAllBtn').addEventListener('click', () => {
        selectedVideoIds.clear();
        renderVideoList();
    });
}

// 更新選取資訊
function updateSelectionInfo() {
    const count = selectedVideoIds.size;
    const infoText = count === 0
        ? '未選取任何項目'
        : `已選取 ${count} 個影片`;

    document.getElementById('selectionInfo').textContent = infoText;
    document.getElementById('deleteSelectedBtn').disabled = count === 0;
}

// 刪除影片
async function deleteVideo(videoId, reload = true) {
    try {
        const video = allVideos.find(v => v.videoId === videoId);
        if (!video) return;

        // 刪除所有相關的 segment
        const keysToDelete = video.segments.map(s => s.key);

        // 也刪除 liveCapture 資料（如果存在）
        keysToDelete.push(`liveCapture_${videoId}`);

        await chrome.storage.local.remove(keysToDelete);

        console.log(`已刪除影片 ${videoId} 的 ${keysToDelete.length} 筆資料`);

        if (reload) {
            await loadAllVideos();
        }
    } catch (error) {
        console.error('刪除影片資料失敗:', error);
    }
}

// 開啟 Library Manager（單一影片）
function openLibraryManager(videoId) {
    chrome.windows.create({
        url: chrome.runtime.getURL(`library.html?videoId=${videoId}`),
        type: 'popup',
        width: 600,
        height: 700,
        left: 200,
        top: 50
    });
}

// 開啟 YouTube 影片
async function openYouTubeVideo(videoId) {
    try {
        // 先找到最後使用的正常瀏覽器視窗（非 popup）
        const windows = await chrome.windows.getAll({
            populate: false,
            windowTypes: ['normal']
        });

        let targetWindowId = null;
        if (windows.length > 0) {
            // 使用最後聚焦的正常視窗
            const focusedWindow = windows.find(w => w.focused);
            targetWindowId = focusedWindow ? focusedWindow.id : windows[0].id;
        }

        // 在指定視窗中建立分頁
        const tab = await chrome.tabs.create({
            url: `https://www.youtube.com/watch?v=${videoId}`,
            active: true,
            windowId: targetWindowId || undefined
        });

        // 確保視窗聚焦
        if (tab.windowId) {
            await chrome.windows.update(tab.windowId, {
                focused: true
            });
        }

        console.log('已開啟 YouTube 影片:', videoId);
    } catch (error) {
        console.error('開啟 YouTube 影片失敗:', error);
    }
}

// HTML 跳脫函數
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
