// 即時閱讀器 - 從 storage 同步頁面資料

let pages = [];
let currentPageIndex = 0;
let isCapturing = true;
let videoTitle = '';
let videoId = '';
let captureSettings = null;
let isPlaying = false;
let youtubeTabId = null;
let keepAliveInterval = null;
let isBatchMode = false;  // 批次刪除模式

// 初始化
document.addEventListener('DOMContentLoaded', async () => {
    await loadData();
    await initYouTubeTab();
    setupEventListeners();
    startStorageSync();
    startKeepAlive();
});

// 載入資料
async function loadData() {
    const result = await chrome.storage.local.get(['liveCapture', 'youtubeOperationTabId', 'youtubeVideoId']);
    const data = result.liveCapture;
    youtubeTabId = result.youtubeOperationTabId;
    videoId = result.youtubeVideoId || '';

    if (!data) {
        document.getElementById('pageContent').innerHTML =
            '<div class="loading">尚無頁面資料，請在 YouTube 頁面開始製作</div>';
        return;
    }

    videoTitle = data.videoTitle || '未知影片';
    if (!videoId) videoId = data.videoId || '';
    pages = data.pages || [];
    isCapturing = data.isCapturing !== false;
    captureSettings = data.captureSettings || null;

    document.getElementById('videoTitle').textContent = videoTitle;
    updateStatus();

    if (pages.length > 0) {
        document.getElementById('pageJumpInput').max = pages.length;
        showPage(0);
    } else {
        document.getElementById('pageContent').innerHTML =
            '<div class="loading">等待頁面製作中...</div>';
    }
}

// 初始化 YouTube 分頁連線
async function initYouTubeTab() {
    if (!youtubeTabId) {
        console.log('未找到操作用 YouTube 分頁 ID，嘗試開啟...');
        if (videoId) {
            const newTab = await chrome.tabs.create({
                url: `https://www.youtube.com/watch?v=${videoId}`,
                active: false
            });
            youtubeTabId = newTab.id;
            await chrome.storage.local.set({ youtubeOperationTabId: youtubeTabId });
            console.log('已開啟新的操作用 YouTube 分頁:', youtubeTabId);
        }
        return;
    }

    try {
        // 檢查分頁是否存在
        const tab = await chrome.tabs.get(youtubeTabId);
        console.log('已連接到操作用 YouTube 分頁:', tab.url);
    } catch (error) {
        console.log('操作用 YouTube 分頁已關閉，嘗試重新開啟...');
        // 如果分頁不存在，嘗試開啟新分頁
        if (videoId) {
            const newTab = await chrome.tabs.create({
                url: `https://www.youtube.com/watch?v=${videoId}`,
                active: false
            });
            youtubeTabId = newTab.id;
            await chrome.storage.local.set({ youtubeOperationTabId: youtubeTabId });
        }
    }
}

// 保持 YouTube 分頁活躍
function startKeepAlive() {
    if (keepAliveInterval) {
        clearInterval(keepAliveInterval);
    }

    keepAliveInterval = setInterval(async () => {
        if (youtubeTabId) {
            try {
                await chrome.tabs.sendMessage(youtubeTabId, { action: 'keepAlive' });
            } catch (error) {
                console.log('YouTube 分頁可能已關閉');
            }
        }
    }, 30000);
}

// 監聽 storage 變化
function startStorageSync() {
    chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName === 'local' && changes.liveCapture) {
            const newData = changes.liveCapture.newValue;
            if (newData) {
                const oldPagesCount = pages.length;
                pages = newData.pages || [];
                isCapturing = newData.isCapturing !== false;
                videoTitle = newData.videoTitle || videoTitle;
                videoId = newData.videoId || videoId;
                captureSettings = newData.captureSettings || captureSettings;

                document.getElementById('videoTitle').textContent = videoTitle;
                document.getElementById('pageJumpInput').max = pages.length;
                updateStatus();
                updateNavigation();

                // 如果有新頁面且之前沒頁面，顯示第一頁
                if (pages.length > 0 && oldPagesCount === 0) {
                    showPage(0);
                } else if (pages.length > 0 && currentPageIndex < pages.length) {
                    // 刷新當前頁面以顯示更新
                    showPage(currentPageIndex);
                }
            }
        }
    });
}

// 顯示指定頁面
function showPage(pageIndex) {
    if (pageIndex < 0 || pageIndex >= pages.length) return;

    currentPageIndex = pageIndex;
    const page = pages[pageIndex];
    const content = document.getElementById('pageContent');

    // 計算每張截圖的高度
    const screenshotCount = page.screenshots.length;
    const maxHeight = screenshotCount > 0 ? `calc((100vh - 100px) / ${screenshotCount})` : 'auto';

    content.innerHTML = page.screenshots.map((shot, idx) => `
        <div class="screenshot-item" style="max-height: ${maxHeight};" data-shot-index="${idx}">
            ${isBatchMode ? `<input type="checkbox" class="batch-checkbox" data-index="${idx}">` : ''}
            ${shot.upperPreview ? `
                <div class="upper-preview-container" data-index="${idx}" title="點擊新增上方字幕">
                    <img src="${shot.upperPreview}" class="upper-preview-thumb" alt="上方預覽">
                </div>
            ` : ''}
            <img src="${shot.imageData}" style="max-height: ${maxHeight}; object-fit: contain;">
            <span class="timestamp">${formatTime(shot.time)}</span>
            <div class="screenshot-controls">
                ${!shot.isUpperSubtitle ? `
                    <button class="adj-btn" data-action="addUpper" data-index="${idx}" title="新增上方字幕">⬆ 上方</button>
                    <button class="adj-btn" data-action="backward" data-index="${idx}" title="向前 0.2 秒">◄ -0.2s</button>
                    <button class="adj-btn play" data-action="playFromShot" data-index="${idx}" data-time="${shot.time}" title="從此位置播放">▶</button>
                    <button class="adj-btn" data-action="forward" data-index="${idx}" title="向後 0.2 秒">+0.2s ►</button>
                ` : ''}
                <button class="adj-btn delete" data-action="delete" data-index="${idx}" title="刪除此行">🗑</button>
            </div>
        </div>
    `).join('');

    // 更新頁碼輸入框
    document.getElementById('pageJumpInput').value = pageIndex + 1;

    // 更新批次模式樣式
    if (isBatchMode) {
        content.classList.add('batch-mode');
    } else {
        content.classList.remove('batch-mode');
    }

    updateNavigation();
    bindScreenshotEvents();
}

// 綁定截圖控制按鈕事件
function bindScreenshotEvents() {
    const content = document.getElementById('pageContent');

    // 綁定調整按鈕事件
    content.querySelectorAll('.adj-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const action = e.target.dataset.action;
            const shotIndex = parseInt(e.target.dataset.index);

            if (action === 'playFromShot') {
                // 從此截圖位置播放
                const time = parseFloat(e.target.dataset.time);
                await playFromTime(time);
            } else {
                // 調整截圖 (forward, backward, addUpper, delete)
                await adjustScreenshot(shotIndex, action);
            }
        });
    });

    // 綁定預覽縮圖點擊事件
    content.querySelectorAll('.upper-preview-container').forEach(container => {
        container.addEventListener('click', async () => {
            const shotIndex = parseInt(container.dataset.index);
            await adjustScreenshot(shotIndex, 'addUpper');
        });
    });
}

// 向 YouTube 分頁發送調整請求
async function adjustScreenshot(shotIndex, action) {
    if (!youtubeTabId) {
        alert('未連接到 YouTube 分頁，請確保 YouTube 頁面仍開啟');
        return;
    }

    // 顯示載入狀態
    const btn = document.querySelector(`[data-action="${action}"][data-index="${shotIndex}"]`);
    if (btn) {
        btn.disabled = true;
        btn.style.opacity = '0.5';
    }

    try {
        const response = await chrome.tabs.sendMessage(youtubeTabId, {
            action: 'adjustScreenshotForReader',
            pageIndex: currentPageIndex,
            shotIndex: shotIndex,
            adjustAction: action
        });

        if (!response.success) {
            alert('操作失敗: ' + (response.error || '未知錯誤'));
        } else {
            // 🆕 顯示保存成功提示
            showSaveStatus();
        }
        // storage 變化會自動觸發頁面更新
    } catch (error) {
        console.error('發送訊息失敗:', error);
        alert('無法連接到 YouTube 分頁，請確保頁面仍開啟');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.style.opacity = '1';
        }
    }
}

// 從指定時間播放
async function playFromTime(time) {
    if (!youtubeTabId) {
        // 開啟 YouTube 頁面
        if (videoId) {
            window.open(`https://www.youtube.com/watch?v=${videoId}&t=${Math.floor(time)}s`, '_blank');
        }
        return;
    }

    try {
        // 切換到 YouTube 分頁
        await chrome.tabs.update(youtubeTabId, { active: true });

        // 發送播放請求
        const page = pages[currentPageIndex];
        await chrome.tabs.sendMessage(youtubeTabId, {
            action: 'playAudioForReader',
            startTime: time,
            endTime: page.endTime
        });
    } catch (error) {
        console.error('播放失敗:', error);
        // 備用：開啟新分頁
        if (videoId) {
            window.open(`https://www.youtube.com/watch?v=${videoId}&t=${Math.floor(time)}s`, '_blank');
        }
    }
}

// 更新導航狀態
function updateNavigation() {
    const prevBtn = document.getElementById('prevPage');
    const nextBtn = document.getElementById('nextPage');
    const waitingMsg = document.getElementById('waitingMsg');
    const totalEl = document.getElementById('totalPages');

    // 更新頁碼顯示
    totalEl.textContent = pages.length > 0 ? pages.length + (isCapturing ? '+' : '') : '-';

    // 上一頁按鈕
    prevBtn.disabled = currentPageIndex <= 0;

    // 下一頁按鈕 - 如果是最後一頁且還在擷取中，顯示等待
    const isLastPage = currentPageIndex >= pages.length - 1;

    if (isLastPage && isCapturing) {
        nextBtn.disabled = true;
        waitingMsg.style.display = 'inline';
    } else {
        nextBtn.disabled = isLastPage;
        waitingMsg.style.display = 'none';
    }
}

// 更新擷取狀態
function updateStatus() {
    const statusEl = document.getElementById('captureStatus');
    if (isCapturing) {
        statusEl.textContent = `擷取中... (${pages.length}頁)`;
        statusEl.className = 'status';
    } else {
        statusEl.textContent = `完成 (${pages.length}頁)`;
        statusEl.className = 'status done';
    }
}

// 播放當前頁面音訊
async function playPageAudio() {
    if (pages.length === 0 || currentPageIndex >= pages.length) return;

    const page = pages[currentPageIndex];
    const playbackSpeed = parseFloat(document.getElementById('playbackSpeed').value) || 1;
    const isMuted = document.getElementById('toggleMute').dataset.muted === 'true';

    if (!youtubeTabId) {
        // 開啟 YouTube 頁面
        if (videoId) {
            window.open(`https://www.youtube.com/watch?v=${videoId}&t=${Math.floor(page.startTime)}s`, '_blank');
        }
        return;
    }

    try {
        // 切換到 YouTube 分頁
        await chrome.tabs.update(youtubeTabId, { active: true });

        // 發送播放請求（包含音量和速度設定）
        await chrome.tabs.sendMessage(youtubeTabId, {
            action: 'playAudioForReader',
            startTime: page.startTime,
            endTime: page.endTime,
            playbackRate: playbackSpeed,
            muted: isMuted
        });

        isPlaying = true;
        updatePlayButton();
    } catch (error) {
        console.error('播放失敗:', error);
        if (videoId) {
            window.open(`https://www.youtube.com/watch?v=${videoId}&t=${Math.floor(page.startTime)}s`, '_blank');
        }
    }
}

function updatePlayButton() {
    const playButton = document.getElementById('playAudio');
    if (isPlaying) {
        playButton.textContent = '⏸ 暫停';
        playButton.style.background = '#ff9800';
    } else {
        playButton.textContent = '▶ 播放';
        playButton.style.background = '#ff0000';
    }
}

// 設定事件監聽
function setupEventListeners() {
    document.getElementById('prevPage').addEventListener('click', () => {
        if (currentPageIndex > 0) {
            isPlaying = false;
            updatePlayButton();
            showPage(currentPageIndex - 1);
        }
    });

    document.getElementById('nextPage').addEventListener('click', () => {
        if (currentPageIndex < pages.length - 1) {
            isPlaying = false;
            updatePlayButton();
            showPage(currentPageIndex + 1);
        }
    });

    document.getElementById('playAudio').addEventListener('click', () => {
        playPageAudio();
    });

    // 開啟 YouTube 按鈕
    document.getElementById('openYouTube').addEventListener('click', async () => {
        if (youtubeTabId) {
            try {
                await chrome.tabs.update(youtubeTabId, { active: true });
            } catch (error) {
                // 分頁可能已關閉，開新分頁
                if (videoId) {
                    const newTab = await chrome.tabs.create({
                        url: `https://www.youtube.com/watch?v=${videoId}`
                    });
                    youtubeTabId = newTab.id;
                    await chrome.storage.local.set({ youtubeOperationTabId: youtubeTabId });
                }
            }
        } else if (videoId) {
            const newTab = await chrome.tabs.create({
                url: `https://www.youtube.com/watch?v=${videoId}`
            });
            youtubeTabId = newTab.id;
            await chrome.storage.local.set({ youtubeOperationTabId: youtubeTabId });
        }
    });

    // 頁碼跳轉 - 按 Enter 跳轉
    document.getElementById('pageJumpInput').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            const targetPage = parseInt(e.target.value) - 1;
            if (targetPage >= 0 && targetPage < pages.length) {
                isPlaying = false;
                updatePlayButton();
                showPage(targetPage);
            }
        }
    });

    // 鍵盤控制
    document.addEventListener('keydown', (e) => {
        if (e.target.tagName === 'INPUT') return; // 忽略輸入框中的鍵盤事件

        if (e.key === 'ArrowLeft' && currentPageIndex > 0) {
            isPlaying = false;
            updatePlayButton();
            showPage(currentPageIndex - 1);
        } else if (e.key === 'ArrowRight' && currentPageIndex < pages.length - 1) {
            isPlaying = false;
            updatePlayButton();
            showPage(currentPageIndex + 1);
        } else if (e.key === ' ') {
            e.preventDefault();
            playPageAudio();
        } else if (e.key === 'Escape' && isBatchMode) {
            exitBatchMode();
        }
    });

    // 批次刪除模式按鈕
    document.getElementById('toggleBatchMode').addEventListener('click', () => {
        enterBatchMode();
    });

    document.getElementById('confirmBatchDelete').addEventListener('click', async () => {
        await executeBatchDelete();
    });

    document.getElementById('cancelBatchMode').addEventListener('click', () => {
        exitBatchMode();
    });

    // 靜音開關
    document.getElementById('toggleMute').addEventListener('click', () => {
        const btn = document.getElementById('toggleMute');
        const isMuted = btn.dataset.muted === 'true';
        if (isMuted) {
            btn.dataset.muted = 'false';
            btn.textContent = '🔊 有聲';
            btn.style.background = '#666';
        } else {
            btn.dataset.muted = 'true';
            btn.textContent = '🔇 靜音';
            btn.style.background = '#ff9800';
        }
    });
}

// 進入批次刪除模式
function enterBatchMode() {
    isBatchMode = true;
    document.getElementById('toggleBatchMode').style.display = 'none';
    document.getElementById('confirmBatchDelete').style.display = 'block';
    document.getElementById('cancelBatchMode').style.display = 'block';
    showPage(currentPageIndex);  // 重新渲染以顯示 checkbox
}

// 退出批次刪除模式
function exitBatchMode() {
    isBatchMode = false;
    document.getElementById('toggleBatchMode').style.display = 'block';
    document.getElementById('confirmBatchDelete').style.display = 'none';
    document.getElementById('cancelBatchMode').style.display = 'none';
    showPage(currentPageIndex);  // 重新渲染以隱藏 checkbox
}

// 執行批次刪除
async function executeBatchDelete() {
    const checkboxes = document.querySelectorAll('.batch-checkbox:checked');
    const selectedIndices = Array.from(checkboxes).map(cb => parseInt(cb.dataset.index));

    if (selectedIndices.length === 0) {
        alert('請先勾選要刪除的截圖');
        return;
    }

    const page = pages[currentPageIndex];
    if (selectedIndices.length >= page.screenshots.length) {
        alert('無法刪除所有截圖，每頁至少需保留一張');
        return;
    }

    // 從後向前刪除，避免索引變化
    const sortedIndices = selectedIndices.sort((a, b) => b - a);

    // 禁用按鈕
    document.getElementById('confirmBatchDelete').disabled = true;
    document.getElementById('confirmBatchDelete').textContent = '刪除中...';

    try {
        // 讀取最新資料
        const result = await chrome.storage.local.get(['liveCapture']);
        const data = result.liveCapture;

        if (!data || !data.pages || !data.pages[currentPageIndex]) {
            alert('找不到頁面資料');
            return;
        }

        // 刪除選中的截圖
        for (const idx of sortedIndices) {
            data.pages[currentPageIndex].screenshots.splice(idx, 1);
        }

        // 更新時間範圍
        const remainingShots = data.pages[currentPageIndex].screenshots;
        if (remainingShots.length > 0) {
            data.pages[currentPageIndex].startTime = remainingShots[0].time;
            data.pages[currentPageIndex].endTime = remainingShots[remainingShots.length - 1].time;
        }

        // 儲存更新
        await chrome.storage.local.set({ liveCapture: data });

        // 顯示成功訊息
        showSaveStatus();

        // 退出批次模式
        exitBatchMode();

        console.log(`✅ 已刪除 ${sortedIndices.length} 張截圖`);
    } catch (error) {
        console.error('批次刪除失敗:', error);
        alert('刪除失敗: ' + error.message);
    } finally {
        document.getElementById('confirmBatchDelete').disabled = false;
        document.getElementById('confirmBatchDelete').textContent = '🗑 刪除已選';
    }
}

// 格式化時間
function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// 🆕 顯示保存狀態提示
function showSaveStatus() {
    const saveStatus = document.getElementById('saveStatus');
    if (!saveStatus) return;

    saveStatus.style.display = 'block';

    // 2 秒後自動隱藏
    setTimeout(() => {
        saveStatus.style.display = 'none';
    }, 2000);
}

// 頁面卸載時清理
window.addEventListener('beforeunload', () => {
    if (keepAliveInterval) {
        clearInterval(keepAliveInterval);
    }
});
