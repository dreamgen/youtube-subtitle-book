// 儲存截圖和頁面資料
let captureData = {
  screenshots: [],
  pages: [],
  videoTitle: '',
  videoDuration: 0,
  linesPerPage: 5
};

// 儲存當前設定供重新截圖使用
let currentConfig = null;
let isStopRequested = false; // Flag for force stop

// 檢查是否從書庫開啟閱讀器
(async function checkLibraryReaderMode() {
  const result = await chrome.storage.local.get('libraryReaderMode');
  if (result.libraryReaderMode && result.libraryReaderMode.openReader) {
    const { videoId, segments } = result.libraryReaderMode;

    // 檢查當前頁面是否是對應的影片
    const urlParams = new URLSearchParams(window.location.search);
    const currentVideoId = urlParams.get('v');

    if (currentVideoId === videoId) {
      // 清除標記（避免重複開啟）
      await chrome.storage.local.remove('libraryReaderMode');

      // 載入書庫的段落資料到 captureData
      loadLibrarySegments(segments);

      // 延遲一下再開啟閱讀器，確保影片載入完成
      setTimeout(() => {
        openViewer(5); // 使用預設的 5 行/頁
      }, 2000);
    }
  }
})();

// 監聽來自popup的訊息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'startCapture') {
    isStopRequested = false;
    currentConfig = message.config;
    captureData.linesPerPage = message.config.linesPerPage;
    startCapture(message.config);
    sendResponse({ success: true });
  } else if (message.action === 'stopCapture') {
    isStopRequested = true;
    sendResponse({ success: true });
  } else if (message.action === 'startSmartCapture') {
    isStopRequested = false;
    currentConfig = message.config;
    captureData.linesPerPage = message.config.linesPerPage;
    startSmartCapture(message.config);
    sendResponse({ success: true });
  } else if (message.action === 'openViewer') {
    openViewer(captureData.linesPerPage);
    sendResponse({ success: true });
  } else if (message.action === 'showPreview') {
    showPreview(message.config);
    sendResponse({ success: true });
  } else if (message.action === 'loadCaptureData') {
    // 保留舊的直接載入方式（用於小型資料）
    captureData = message.data;
    sendResponse({ success: true });
  } else if (message.action === 'loadCaptureDataFromStorage') {
    // 從 storage 載入資料（避免超過 64MB 訊息限制）
    chrome.storage.local.get([message.storageKey]).then(result => {
      const data = result[message.storageKey];
      if (data) {
        captureData = data;
        sendResponse({ success: true, pageCount: data.pages ? data.pages.length : 0 });
      } else {
        sendResponse({ success: false, error: '找不到該段落資料' });
      }
    }).catch(error => {
      sendResponse({ success: false, error: error.message });
    });
    return true; // 保持非同步回應
  } else if (message.action === 'keepAlive') {
    // 保持分頁活躍
    sendResponse({ alive: true });
  } else if (message.action === 'adjustScreenshotForReader') {
    // 處理來自 reader 的截圖調整請求
    handleReaderAdjustment(message).then(result => {
      sendResponse(result);
    });
    return true; // 保持非同步回應
  } else if (message.action === 'generateFramePreviews') {
    // 生成時間軸預覽圖
    handleGenerateFramePreviews(message).then(result => {
      sendResponse(result);
    });
    return true;
  } else if (message.action === 'adjustScreenshotToTime') {
    // 調整截圖到指定時間
    handleAdjustToTime(message).then(result => {
      sendResponse(result);
    });
    return true;
  } else if (message.action === 'playAudioForReader') {
    // 處理來自 reader 的播放請求
    handleReaderPlayback(message).then(result => {
      sendResponse(result);
    });
    return true;
  } else if (message.action === 'pauseVideo') {
    // 暫停影片
    const video = document.querySelector('video');
    if (video) {
      video.pause();
      sendResponse({ success: true });
    } else {
      sendResponse({ success: false, error: '找不到影片元素' });
    }
    return true;
  } else if (message.action === 'getVideoId') {
    const videoId = new URL(window.location.href).searchParams.get('v');
    sendResponse({ videoId });
  }
  return true;
});

// 從書庫段落載入資料到 captureData
function loadLibrarySegments(segments) {
  console.log('loadLibrarySegments 收到的段落資料:', segments);

  const pages = [];
  const screenshots = [];

  segments.forEach((segment) => {
    // segment.pages 是該段落的所有頁面（每頁有多個截圖）
    const segmentPages = segment.pages || [];

    console.log(`段落 ${segment.key} 有 ${segmentPages.length} 頁`);

    segmentPages.forEach((page) => {
      // 加入該頁的所有截圖到總截圖列表
      const pageScreenshots = page.screenshots || [];
      screenshots.push(...pageScreenshots);

      // 加入頁面資料
      pages.push({
        pageNumber: pages.length + 1,
        startTime: page.startTime,
        endTime: page.endTime,
        screenshots: pageScreenshots,
        subtitles: page.subtitles || []
      });
    });
  });

  // 更新 captureData
  captureData = {
    screenshots: screenshots,
    pages: pages,
    videoTitle: segments[0]?.videoTitle || '未知影片',
    videoDuration: segments[segments.length - 1]?.endTime || 0,
    linesPerPage: 5
  };

  console.log('已載入書庫資料:', captureData);
  console.log(`總共 ${pages.length} 頁，${screenshots.length} 張截圖`);
}

// 處理來自 reader 的截圖調整請求
async function handleReaderAdjustment(message) {
  const { pageIndex, shotIndex, adjustAction } = message;

  // 從 storage 讀取最新資料
  const result = await chrome.storage.local.get(['liveCapture']);
  const data = result.liveCapture;

  if (!data || !data.pages) {
    console.warn('[Reader] liveCapture data not found');
    return { success: false, error: '找不到擷取資料', critical: true };
  }

  // 驗證頁面索引
  if (pageIndex < 0 || pageIndex >= data.pages.length) {
    console.warn(`[Reader] Invalid pageIndex: ${pageIndex}, total pages: ${data.pages.length}`);
    return { success: false, error: '頁面索引無效', critical: false };
  }

  const page = data.pages[pageIndex];
  if (!page || !page.screenshots) {
    console.warn(`[Reader] Page ${pageIndex} has no screenshots`);
    return { success: false, error: '找不到頁面資料', critical: true };
  }

  // 驗證截圖索引
  if (shotIndex < 0 || shotIndex >= page.screenshots.length) {
    console.warn(`[Reader] Invalid shotIndex: ${shotIndex}, page: ${pageIndex}, total screenshots: ${page.screenshots.length}`);
    return { success: false, error: '截圖索引超出範圍', critical: false };
  }

  const shot = page.screenshots[shotIndex];
  if (!shot) {
    console.warn(`[Reader] Screenshot not found at page ${pageIndex}, shot ${shotIndex}`);
    return { success: false, error: '找不到截圖資料', critical: false };
  }

  const video = document.querySelector('video');
  if (!video) {
    return { success: false, error: '找不到影片元素' };
  }

  try {
    if (adjustAction === 'forward' || adjustAction === 'backward') {
      // 調整時間並重新截圖
      const delta = adjustAction === 'backward' ? -0.2 : 0.2;
      const newTime = Math.max(0, Math.min(video.duration, shot.time + delta));
      shot.time = newTime;

      // 重新截圖
      await recaptureForReader(shot, data.captureSettings);

      // 更新頁面時間範圍
      page.startTime = Math.min(...page.screenshots.map(s => s.time));
      page.endTime = Math.max(...page.screenshots.map(s => s.time));

    } else if (adjustAction === 'addUpper') {
      // 新增上方字幕
      const upperShot = await captureUpperForReader(shot.time, data.captureSettings);
      if (upperShot) {
        page.screenshots.splice(shotIndex, 0, upperShot);
      }
    } else if (adjustAction === 'delete') {
      // 刪除截圖
      if (page.screenshots.length <= 1) {
        return { success: false, error: '每頁至少需要一張截圖' };
      }
      page.screenshots.splice(shotIndex, 1);
      page.startTime = page.screenshots[0].time;
      page.endTime = page.screenshots[page.screenshots.length - 1].time;
    } else if (adjustAction === 'insertBelow') {
      // 向下插入複製的截圖
      const newShot = {
        time: shot.time + 0.1,  // 稍微後移一點時間
        imageData: shot.imageData,
        upperPreview: shot.upperPreview || null,
        isInserted: true  // 標記為插入的截圖
      };
      page.screenshots.splice(shotIndex + 1, 0, newShot);

      // 更新頁面時間範圍
      page.startTime = Math.min(...page.screenshots.map(s => s.time));
      page.endTime = Math.max(...page.screenshots.map(s => s.time));
    }

    // 儲存更新後的資料
    await chrome.storage.local.set({ liveCapture: data });

    // 🆕 同步到其他 storage
    await syncToAllStorage(data);

    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// 🆕 同步 liveCapture 資料到所有相關 storage
async function syncToAllStorage(liveData) {
  try {
    console.log('🔄 開始同步資料到所有 storage...');

    // 1. 更新 captureData
    if (captureData && captureData.pages) {
      captureData.pages = liveData.pages;
      await chrome.storage.local.set({ captureData: captureData });
      console.log('✅ 已同步到 captureData');
    }

    // 2. 更新對應的 segment
    const videoId = liveData.videoId;
    if (!videoId) {
      console.log('ℹ️ 沒有 videoId，跳過 segment 同步');
      return;
    }

    const segmentsResult = await chrome.storage.local.get(['savedSegments']);
    const segments = segmentsResult.savedSegments || [];

    if (liveData.pages.length === 0) {
      console.log('ℹ️ 沒有頁面資料，跳過 segment 同步');
      return;
    }

    const firstPageTime = liveData.pages[0].startTime;
    const lastPageTime = liveData.pages[liveData.pages.length - 1].endTime;

    // 尋找對應的 segment（時間範圍匹配，允許 2 秒誤差）
    const matchingSegment = segments.find(seg =>
      seg.videoId === videoId &&
      Math.abs(seg.startTime - firstPageTime) < 2 &&
      Math.abs(seg.endTime - lastPageTime) < 2
    );

    if (matchingSegment) {
      const segmentKey = matchingSegment.key;
      const segmentResult = await chrome.storage.local.get([`segment_${segmentKey}`]);
      const segmentData = segmentResult[`segment_${segmentKey}`];

      if (segmentData) {
        segmentData.pages = liveData.pages;
        await chrome.storage.local.set({ [`segment_${segmentKey}`]: segmentData });
        console.log(`✅ 已同步到 segment: ${segmentKey}`);
      }
    } else {
      console.log('ℹ️ 找不到匹配的 segment，可能是新製作的內容');
    }

    console.log('✅ 所有 storage 同步完成');
  } catch (error) {
    console.error('❌ 同步失敗:', error);
    // 不中斷操作，即使同步失敗也返回成功
  }
}

// 為 reader 重新截圖
async function recaptureForReader(shot, settings) {
  const video = document.querySelector('video');
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  // 🔧 修正:使用當前影片的實際尺寸,而不是儲存的設定值
  const currentVideoWidth = video.videoWidth;
  const currentVideoHeight = video.videoHeight;

  // 使用設定中的百分比重新計算區域
  const subtitleHeightPercent = settings.subtitleHeight || 15;
  const bottomMarginPercent = settings.bottomMargin || 0;

  const subtitleRegionHeight = Math.floor(currentVideoHeight * (subtitleHeightPercent / 100));
  const bottomMarginHeight = Math.floor(currentVideoHeight * (bottomMarginPercent / 100));
  const subtitleRegionY = currentVideoHeight - subtitleRegionHeight - bottomMarginHeight;

  canvas.width = currentVideoWidth;
  canvas.height = subtitleRegionHeight;

  // 跳轉到指定時間
  video.currentTime = shot.time;

  // 等待影片跳轉完成
  await new Promise(resolve => {
    const checkReady = () => {
      if (Math.abs(video.currentTime - shot.time) < 0.1 && video.readyState >= 2) {
        resolve();
      } else {
        setTimeout(checkReady, 50);
      }
    };
    checkReady();
  });

  await sleep(200);

  // 截取字幕區域
  ctx.drawImage(
    video,
    0, subtitleRegionY, currentVideoWidth, subtitleRegionHeight,
    0, 0, currentVideoWidth, subtitleRegionHeight
  );

  shot.imageData = canvas.toDataURL('image/jpeg', 0.7);

  // 截取上方預覽縮圖
  const upperSubtitleY = subtitleRegionY - subtitleRegionHeight;
  if (upperSubtitleY >= 0) {
    const previewCanvas = document.createElement('canvas');
    const previewCtx = previewCanvas.getContext('2d');
    const centerWidth = Math.floor(currentVideoWidth * 0.3);
    const centerX = Math.floor((currentVideoWidth - centerWidth) / 2);
    const thumbWidth = 100;
    const thumbHeight = Math.floor(subtitleRegionHeight * thumbWidth / centerWidth);

    previewCanvas.width = thumbWidth;
    previewCanvas.height = thumbHeight;

    previewCtx.drawImage(
      video,
      centerX, upperSubtitleY, centerWidth, subtitleRegionHeight,
      0, 0, thumbWidth, thumbHeight
    );

    shot.upperPreview = previewCanvas.toDataURL('image/jpeg', 0.5);
  }
}

// 為 reader 截取上方字幕
async function captureUpperForReader(time, settings) {
  const video = document.querySelector('video');
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  // 🔧 修正:使用當前影片的實際尺寸,而不是儲存的設定值
  const currentVideoWidth = video.videoWidth;
  const currentVideoHeight = video.videoHeight;

  // 使用設定中的百分比重新計算區域
  const subtitleHeightPercent = settings.subtitleHeight || 15;
  const bottomMarginPercent = settings.bottomMargin || 0;

  const subtitleRegionHeight = Math.floor(currentVideoHeight * (subtitleHeightPercent / 100));
  const bottomMarginHeight = Math.floor(currentVideoHeight * (bottomMarginPercent / 100));

  const normalSubtitleY = currentVideoHeight - subtitleRegionHeight - bottomMarginHeight;
  const upperSubtitleY = normalSubtitleY - subtitleRegionHeight;

  if (upperSubtitleY < 0) {
    return null;
  }

  canvas.width = currentVideoWidth;
  canvas.height = subtitleRegionHeight;

  // 跳轉到指定時間
  video.currentTime = time;

  await new Promise(resolve => {
    const checkReady = () => {
      if (Math.abs(video.currentTime - time) < 0.1 && video.readyState >= 2) {
        resolve();
      } else {
        setTimeout(checkReady, 50);
      }
    };
    checkReady();
  });

  await sleep(200);

  // 截取上方字幕區域
  ctx.drawImage(
    video,
    0, upperSubtitleY, currentVideoWidth, subtitleRegionHeight,
    0, 0, currentVideoWidth, subtitleRegionHeight
  );

  return {
    time: time,
    imageData: canvas.toDataURL('image/jpeg', 0.7),
    isUpperSubtitle: true
  };
}

// 處理來自 reader 的播放請求
async function handleReaderPlayback(message) {
  const { startTime, endTime, playbackRate, muted } = message;
  const video = document.querySelector('video');

  if (!video) {
    return { success: false, error: '找不到影片元素' };
  }

  // 套用播放設定
  if (playbackRate !== undefined) {
    video.playbackRate = playbackRate;
  }
  if (muted !== undefined) {
    video.muted = muted;
  }

  video.currentTime = startTime;
  video.play();

  // 設定播放結束檢查
  const checkEnd = setInterval(() => {
    if (video.currentTime >= endTime + 1 || video.paused) {
      clearInterval(checkEnd);
      video.pause();
    }
  }, 100);

  return { success: true };
}

// 生成時間軸預覽圖
async function handleGenerateFramePreviews(message) {
  const { currentTime, rangeSeconds, intervalSeconds } = message;
  const video = document.querySelector('video');

  if (!video) {
    return { success: false, error: '找不到影片元素' };
  }

  const result = await chrome.storage.local.get(['liveCapture']);
  const data = result.liveCapture;

  if (!data || !data.captureSettings) {
    return { success: false, error: '找不到擷取設定' };
  }

  const settings = data.captureSettings;
  const previews = [];

  // Generate previews for range (currentTime - rangeSeconds) to (currentTime + rangeSeconds)
  const startTime = Math.max(0, currentTime - rangeSeconds);
  const endTime = Math.min(video.duration, currentTime + rangeSeconds);

  const originalTime = video.currentTime;
  const wasPaused = video.paused;

  for (let time = startTime; time <= endTime; time += intervalSeconds) {
    const preview = await captureFramePreview(time, settings, video);
    if (preview) {
      previews.push({
        time: time,
        imageData: preview
      });
    }
  }

  // Restore video state
  video.currentTime = originalTime;
  if (!wasPaused) {
    video.play();
  }

  return { success: true, previews: previews };
}

// 截取單個影格預覽（字幕區域中間10%）
async function captureFramePreview(time, settings, video) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  const currentVideoWidth = video.videoWidth;
  const currentVideoHeight = video.videoHeight;

  const subtitleHeightPercent = settings.subtitleHeight || 15;
  const bottomMarginPercent = settings.bottomMargin || 0;

  const subtitleRegionHeight = Math.floor(currentVideoHeight * (subtitleHeightPercent / 100));
  const bottomMarginHeight = Math.floor(currentVideoHeight * (bottomMarginPercent / 100));
  const subtitleRegionY = currentVideoHeight - subtitleRegionHeight - bottomMarginHeight;

  // 中間10%的範圍
  const previewWidth = Math.floor(currentVideoWidth * 0.1);
  const previewX = Math.floor((currentVideoWidth - previewWidth) / 2);

  canvas.width = previewWidth;
  canvas.height = subtitleRegionHeight;

  // 跳轉到指定時間
  video.currentTime = time;

  // 優化：使用 seeked 事件而不是輪詢，加上超時保護
  await Promise.race([
    new Promise(resolve => {
      const onSeeked = () => {
        video.removeEventListener('seeked', onSeeked);
        resolve();
      };
      video.addEventListener('seeked', onSeeked);

      // 如果已經在正確位置，立即觸發
      if (Math.abs(video.currentTime - time) < 0.1 && video.readyState >= 2) {
        video.removeEventListener('seeked', onSeeked);
        resolve();
      }
    }),
    // 超時保護：最多等待200ms
    new Promise(resolve => setTimeout(resolve, 200))
  ]);

  await sleep(30); // 優化：從100ms減少到30ms

  // 截取字幕區域中間10%
  ctx.drawImage(
    video,
    previewX, subtitleRegionY, previewWidth, subtitleRegionHeight,
    0, 0, previewWidth, subtitleRegionHeight
  );

  return canvas.toDataURL('image/jpeg', 0.4); // 優化：降低質量以加速編碼
}

// 調整截圖到指定時間
async function handleAdjustToTime(message) {
  const { pageIndex, shotIndex, newTime } = message;

  const result = await chrome.storage.local.get(['liveCapture']);
  const data = result.liveCapture;

  if (!data || !data.pages) {
    return { success: false, error: '找不到擷取資料' };
  }

  const page = data.pages[pageIndex];
  if (!page) {
    return { success: false, error: '找不到頁面' };
  }

  const shot = page.screenshots[shotIndex];
  if (!shot) {
    return { success: false, error: '找不到截圖' };
  }

  const video = document.querySelector('video');
  if (!video) {
    return { success: false, error: '找不到影片元素' };
  }

  try {
    // 更新時間
    shot.time = newTime;

    // 重新截圖
    await recaptureForReader(shot, data.captureSettings);

    // 更新頁面時間範圍
    page.startTime = Math.min(...page.screenshots.map(s => s.time));
    page.endTime = Math.max(...page.screenshots.map(s => s.time));

    // 儲存
    await chrome.storage.local.set({ liveCapture: data });
    await syncToAllStorage(data);

    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}


async function startCapture(config) {
  const video = document.querySelector('video');
  if (!video) {
    updateProgress(0, '找不到影片元素');
    return;
  }

  // 暫停影片
  video.pause();

  // 取得影片資訊
  captureData.videoTitle = document.title.replace(' - YouTube', '');
  captureData.videoDuration = video.duration;

  // 決定開始時間
  const startTime = config.startTimeOption === 'current' ? video.currentTime : 0;

  // 建立canvas用於截圖
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  // 計算字幕區域
  const videoWidth = video.videoWidth;
  const videoHeight = video.videoHeight;
  const subtitleRegionHeight = Math.floor(videoHeight * (config.subtitleHeight / 100));
  const bottomMarginHeight = Math.floor(videoHeight * ((config.bottomMargin || 0) / 100));
  const subtitleRegionY = videoHeight - subtitleRegionHeight - bottomMarginHeight;

  // 儲存截圖設定供後續使用
  captureData.captureSettings = {
    videoWidth,
    videoHeight,
    subtitleRegionHeight,
    bottomMarginHeight,
    subtitleRegionY,
    subtitleHeight: config.subtitleHeight,
    bottomMargin: config.bottomMargin || 0
  };

  canvas.width = videoWidth;
  canvas.height = subtitleRegionHeight;

  updateProgress(0, '開始截圖...');

  // 計算截圖數量
  let totalCaptures;
  if (config.totalPages) {
    // 如果指定了頁數，計算需要的截圖數量
    totalCaptures = config.totalPages * config.linesPerPage;
  } else {
    // 否則截圖到影片結尾
    totalCaptures = Math.floor((captureData.videoDuration - startTime) / config.captureInterval);
  }

  // 截圖並即時組合頁面
  captureData.screenshots = [];
  captureData.pages = [];
  let currentPageScreenshots = [];
  let lastUpperImageData = null; // 用於比對上方字幕變化

  // 初始化即時閱讀資料
  const videoId = new URL(window.location.href).searchParams.get('v');
  await chrome.storage.local.set({
    liveCapture: {
      videoId,
      videoTitle: captureData.videoTitle,
      isCapturing: true,
      pages: [],
      captureSettings: captureData.captureSettings
    }
  });

  for (let i = 0; i < totalCaptures; i++) {
    const time = startTime + (i * config.captureInterval);

    // 檢查時間是否超過影片長度
    if (time >= video.duration) {
      console.log(`時間 ${time} 超過影片長度 ${video.duration}，結束擷取`);
      break;
    }

    // 檢查強制停止
    if (isStopRequested) {
      console.log('🛑 強制停止擷取');
      break;
    }

    // 跳轉到指定時間
    video.currentTime = time;

    // 等待影片跳轉完成（加入超時機制）
    const seekTimeout = 5000; // 5 秒超時
    const seekStartTime = Date.now();

    await new Promise(resolve => {
      const checkReady = () => {
        // 超時檢查
        if (Date.now() - seekStartTime > seekTimeout) {
          console.warn(`跳轉到 ${time} 秒超時，繼續下一張`);
          resolve();
          return;
        }

        // 影片已結束
        if (video.ended) {
          console.log('影片已結束');
          resolve();
          return;
        }

        if (Math.abs(video.currentTime - time) < 0.1 && video.readyState >= 2) {
          resolve();
        } else {
          setTimeout(checkReady, 50);
        }
      };
      checkReady();
    });

    // 如果影片已結束，跳出迴圈
    if (video.ended) {
      console.log('影片已結束，停止擷取');
      break;
    }

    // 再等待一點時間確保畫面穩定
    await sleep(200);

    // 先截取字幕區域到 canvas 檢查是否有主字幕
    ctx.drawImage(
      video,
      0, subtitleRegionY, videoWidth, subtitleRegionHeight,
      0, 0, videoWidth, subtitleRegionHeight
    );

    // 檢查主字幕區域是否有字幕
    const currentImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const subtitleColor = config.subtitleColor || 'white';
    const minPixelPercent = config.minPixelPercent || 0.5;
    const centerWidthPercent = config.centerWidthPercent || 15;
    const textCheck = hasSubtitleText(currentImageData, subtitleColor, minPixelPercent, centerWidthPercent);

    // 如果沒有主字幕，跳過此時間點
    if (!textCheck.hasText) {
      console.log(`⏭️ 跳過時間點 ${time.toFixed(1)}s - 無主字幕`);
      continue; // 跳過此次迴圈
    }

    // 有主字幕，進行截圖
    const imageData = canvas.toDataURL('image/jpeg', 0.7);

    // 檢測並截取上方字幕區域（只在有主字幕時才進行）
    const upperSubtitleY = subtitleRegionY - subtitleRegionHeight;
    let upperPreview = null;
    let hasUpperSubtitle = false;
    const autoDetectUpper = config.autoDetectUpperSubtitle !== false;

    if (upperSubtitleY >= 0) {
      // 截取上方字幕區域進行檢測
      const upperCanvas = document.createElement('canvas');
      const upperCtx = upperCanvas.getContext('2d');
      upperCanvas.width = videoWidth;
      upperCanvas.height = subtitleRegionHeight;

      upperCtx.drawImage(
        video,
        0, upperSubtitleY, videoWidth, subtitleRegionHeight,
        0, 0, videoWidth, subtitleRegionHeight
      );

      // 檢測上方區域是否有字幕（使用與主字幕區相同的檢測參數）
      if (autoDetectUpper) {
        const upperImageData = upperCtx.getImageData(0, 0, upperCanvas.width, upperCanvas.height);
        const subtitleColor = config.subtitleColor || 'white';
        const minPixelPercent = config.minPixelPercent || 0.5;
        const centerWidthPercent = config.centerWidthPercent || 15;
        const sensitivity = config.sensitivity || 8;
        const upperTextCheck = hasSubtitleText(upperImageData, subtitleColor, minPixelPercent, centerWidthPercent);

        if (upperTextCheck.hasText) {
          // 有偵測到文字像素，需要與上一張比對確認
          if (!lastUpperImageData) {
            // 第一次偵測到上方字幕
            hasUpperSubtitle = true;
            console.log(`📄 首次偵測到上方字幕 @ ${time.toFixed(1)}s (${upperTextCheck.centerPixelPercent.toFixed(2)}%)`);
          } else {
            // 比對與上一張上方字幕的差異
            const upperComparison = quickCompare(lastUpperImageData, upperImageData, sensitivity, centerWidthPercent);

            if (upperComparison.shouldCapture) {
              // 上方字幕有變化，確認為真正的字幕
              hasUpperSubtitle = true;
              console.log(`📄 偵測到上方字幕變化 @ ${time.toFixed(1)}s (像素: ${upperTextCheck.centerPixelPercent.toFixed(2)}%, 差異: ${upperComparison.diffPercent.toFixed(1)}%)`);
            } else {
              // 上方字幕與上一張相似，視為靜態背景
              console.log(`⏭️ 上方區域無變化，視為背景 @ ${time.toFixed(1)}s (差異僅 ${upperComparison.diffPercent.toFixed(1)}%)`);
            }
          }
          // 不論是否標記為字幕，都更新 lastUpperImageData 以追蹤上方區域變化
          lastUpperImageData = upperImageData;
        } else {
          // 無字幕時，重置 lastUpperImageData
          if (lastUpperImageData) {
            lastUpperImageData = null;
            console.log(`⏭️ 上方字幕消失 @ ${time.toFixed(1)}s`);
          }
        }
      }

      // 生成預覽縮圖
      const previewCanvas = document.createElement('canvas');
      const previewCtx = previewCanvas.getContext('2d');
      const centerWidth = Math.floor(videoWidth * 0.3);
      const centerX = Math.floor((videoWidth - centerWidth) / 2);
      const thumbWidth = 100;
      const thumbHeight = Math.floor(subtitleRegionHeight * thumbWidth / centerWidth);

      previewCanvas.width = thumbWidth;
      previewCanvas.height = thumbHeight;

      previewCtx.drawImage(
        video,
        centerX, upperSubtitleY, centerWidth, subtitleRegionHeight,
        0, 0, thumbWidth, thumbHeight
      );

      upperPreview = previewCanvas.toDataURL('image/jpeg', 0.5);
    }

    const shot = {
      time: time,
      imageData: imageData,
      upperPreview: upperPreview,
      hasUpperSubtitle: hasUpperSubtitle
    };

    captureData.screenshots.push(shot);
    currentPageScreenshots.push(shot);

    // 當達到每頁行數時，建立頁面並儲存
    if (currentPageScreenshots.length >= config.linesPerPage || i === totalCaptures - 1) {
      const page = {
        pageNumber: captureData.pages.length + 1,
        startTime: currentPageScreenshots[0].time,
        endTime: currentPageScreenshots[currentPageScreenshots.length - 1].time,
        screenshots: [...currentPageScreenshots]
      };

      captureData.pages.push(page);
      currentPageScreenshots = [];

      // 即時儲存頁面到 storage - 保留現有頁面的調整
      const existingResult = await chrome.storage.local.get(['liveCapture']);
      const existingData = existingResult.liveCapture || {};
      const existingPages = existingData.pages || [];

      // 合併頁面：保留已存在頁面（可能已被調整），只新增新頁面
      const mergedPages = [];
      for (let p = 0; p < captureData.pages.length; p++) {
        if (p < existingPages.length) {
          // 保留現有頁面（可能包含調整）
          mergedPages.push(existingPages[p]);
        } else {
          // 新增新頁面
          mergedPages.push(captureData.pages[p]);
        }
      }

      await chrome.storage.local.set({
        liveCapture: {
          videoId,
          videoTitle: captureData.videoTitle,
          isCapturing: true,
          pages: mergedPages,
          captureSettings: captureData.captureSettings
        }
      });
    }

    const progress = Math.floor(((i + 1) / totalCaptures) * 90); // 截圖佔90%進度
    updateProgress(progress, `製作中... ${i + 1}/${totalCaptures} (已完成 ${captureData.pages.length} 頁)`);
  }

  // 處理迴圈提前結束時的剩餘截圖
  if (currentPageScreenshots.length > 0) {
    console.log(`處理剩餘 ${currentPageScreenshots.length} 張截圖`);
    const page = {
      pageNumber: captureData.pages.length + 1,
      startTime: currentPageScreenshots[0].time,
      endTime: currentPageScreenshots[currentPageScreenshots.length - 1].time,
      screenshots: [...currentPageScreenshots]
    };
    captureData.pages.push(page);

    // 儲存到 storage
    const existingResult = await chrome.storage.local.get(['liveCapture']);
    const existingData = existingResult.liveCapture || {};
    const existingPages = existingData.pages || [];

    const mergedPages = [];
    for (let p = 0; p < captureData.pages.length; p++) {
      if (p < existingPages.length) {
        mergedPages.push(existingPages[p]);
      } else {
        mergedPages.push(captureData.pages[p]);
      }
    }

    await chrome.storage.local.set({
      liveCapture: {
        videoId,
        videoTitle: captureData.videoTitle,
        isCapturing: true,
        pages: mergedPages,
        captureSettings: captureData.captureSettings
      }
    });
  }

  // 完成後標記為非擷取中 - 保留現有頁面的調整
  const finalResult = await chrome.storage.local.get(['liveCapture']);
  const finalData = finalResult.liveCapture || {};
  const finalPages = finalData.pages || captureData.pages;

  await chrome.storage.local.set({
    liveCapture: {
      videoId,
      videoTitle: captureData.videoTitle,
      isCapturing: false,
      pages: finalPages,  // 使用 storage 中的頁面（可能包含調整）
      captureSettings: captureData.captureSettings
    }
  });

  // 儲存到storage - 使用 video ID + 時間範圍作為識別
  updateProgress(95, '儲存資料中...');
  try {
    // 基本儲存
    await chrome.storage.local.set({ captureData: captureData });

    // 段落儲存
    const videoId = new URL(window.location.href).searchParams.get('v');
    // 從 liveCapture 讀取最新資料（包含調整）
    const liveCaptureResult = await chrome.storage.local.get(['liveCapture']);
    const liveCaptureData = liveCaptureResult.liveCapture;
    const pagesForSave = liveCaptureData?.pages || captureData.pages;

    if (pagesForSave.length > 0) {
      const startTime = pagesForSave[0].startTime;
      const endTime = pagesForSave[pagesForSave.length - 1].endTime;
      const segmentKey = `${videoId}_${Math.floor(startTime)}_${Math.floor(endTime)}`;

      // 獲取現有段落列表
      const result = await chrome.storage.local.get(['savedSegments']);
      let segments = result.savedSegments || [];

      // 移除相同 key 的舊資料
      segments = segments.filter(s => s.key !== segmentKey);

      // 新增此段落 - 使用 liveCapture 中的資料
      const dataToSave = {
        ...captureData,
        pages: pagesForSave
      };

      segments.push({
        key: segmentKey,
        videoId,
        videoTitle: captureData.videoTitle,
        startTime,
        endTime,
        pageCount: pagesForSave.length,
        screenshotCount: captureData.screenshots.length,
        createdAt: Date.now()
      });

      await chrome.storage.local.set({
        savedSegments: segments,
        [`segment_${segmentKey}`]: dataToSave
      });
      console.log('段落已儲存:', segmentKey);
    }

    console.log('資料已儲存');
  } catch (error) {
    console.error('儲存失敗:', error);
  }

  updateProgress(100, '完成！已截取 ' + captureData.screenshots.length + ' 張圖片，共 ' + captureData.pages.length + ' 頁');
}

/**
 * 智慧擷取模式 - 偵測字幕變化時才截圖
 */
async function startSmartCapture(config) {
  const video = document.querySelector('video');
  if (!video) {
    updateProgress(0, '找不到影片元素');
    return;
  }

  // 取得影片資訊
  captureData.videoTitle = document.title.replace(' - YouTube', '');
  captureData.videoDuration = video.duration;

  // 決定開始時間
  const startTime = config.startTimeOption === 'current' ? video.currentTime : 0;

  // 建立 canvas 用於截圖和比較
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const compareCanvas = document.createElement('canvas');
  const compareCtx = compareCanvas.getContext('2d');

  // 計算字幕區域
  const videoWidth = video.videoWidth;
  const videoHeight = video.videoHeight;
  const subtitleRegionHeight = Math.floor(videoHeight * (config.subtitleHeight / 100));
  const bottomMarginHeight = Math.floor(videoHeight * ((config.bottomMargin || 0) / 100));
  const subtitleRegionY = videoHeight - subtitleRegionHeight - bottomMarginHeight;

  // 儲存截圖設定
  captureData.captureSettings = {
    videoWidth,
    videoHeight,
    subtitleRegionHeight,
    bottomMarginHeight,
    subtitleRegionY,
    subtitleHeight: config.subtitleHeight,
    bottomMargin: config.bottomMargin || 0
  };

  canvas.width = videoWidth;
  canvas.height = subtitleRegionHeight;
  compareCanvas.width = videoWidth;
  compareCanvas.height = subtitleRegionHeight;

  updateProgress(0, '🤖 智慧擷取模式啟動...');

  // 初始化資料
  captureData.screenshots = [];
  captureData.pages = [];
  let currentPageScreenshots = [];
  let lastImageData = null;
  let lastUpperImageData = null; // 上方字幕區域的上一張 ImageData
  let capturedCount = 0;
  let lastCaptureTime = -1;
  const minCaptureInterval = 0.5; // 最小截圖間隔（秒）

  // 計算預估截圖數量
  const estimatedCaptures = config.totalPages
    ? config.totalPages * config.linesPerPage
    : Math.floor((video.duration - startTime) / 2); // 預估每 2 秒一張

  const videoId = new URL(window.location.href).searchParams.get('v');

  // 初始化即時閱讀資料
  await chrome.storage.local.set({
    liveCapture: {
      videoId,
      videoTitle: captureData.videoTitle,
      isCapturing: true,
      pages: [],
      captureSettings: captureData.captureSettings
    }
  });

  // 設定開始時間並播放
  video.currentTime = startTime;
  await sleep(300);

  // 加速製作：靜音並設定最高播放速度
  const originalMuted = video.muted;
  const originalPlaybackRate = video.playbackRate;
  video.muted = true;

  // 嘗試最高速度 4x → 3x → 2x
  const speedsToTry = [4, 3, 2];
  let actualSpeed = 1;
  for (const speed of speedsToTry) {
    video.playbackRate = speed;
    await sleep(50);  // 等待瀏覽器套用
    if (Math.abs(video.playbackRate - speed) < 0.1) {
      actualSpeed = speed;
      break;
    }
  }
  console.log(`🚀 加速模式：靜音 + ${actualSpeed}倍速`);

  video.play();

  // 輪詢檢查字幕變化
  const checkIntervalMs = config.checkInterval || 200;
  const sensitivity = config.sensitivity || 8;

  console.log(`🤖 智慧擷取：檢測頻率 ${checkIntervalMs}ms, 敏感度 ${sensitivity}%`);

  const checkLoop = setInterval(async () => {
    // 強制保持靜音（防止 YouTube 重設）
    if (!video.muted) {
      video.muted = true;
    }

    // 檢查停止條件
    const shouldStop =
      video.ended ||
      isStopRequested ||
      (config.totalPages && captureData.pages.length >= config.totalPages);

    if (shouldStop) {
      clearInterval(checkLoop);
      await finishSmartCapture(videoId, config);
      return;
    }

    const currentTime = video.currentTime;

    // 截取當前字幕區域到比較用 canvas
    compareCtx.drawImage(
      video,
      0, subtitleRegionY, videoWidth, subtitleRegionHeight,
      0, 0, videoWidth, subtitleRegionHeight
    );

    const currentImageData = compareCtx.getImageData(0, 0, compareCanvas.width, compareCanvas.height);

    // 判斷是否需要截圖
    let shouldCapture = false;
    const subtitleColor = config.subtitleColor || 'white';
    const minPixelPercent = config.minPixelPercent || 0.5;
    const centerWidthPercent = config.centerWidthPercent || 15;

    // 先檢查是否有字幕文字
    const textCheck = hasSubtitleText(currentImageData, subtitleColor, minPixelPercent, centerWidthPercent);

    if (!textCheck.hasText) {
      // 無字幕，跳過
      // console log 已在 hasSubtitleText 函數內處理
    } else if (!lastImageData) {
      // 首張截圖（有字幕）
      shouldCapture = true;
      console.log('📷 首張截圖');
    } else if (currentTime - lastCaptureTime >= minCaptureInterval) {
      // 比較像素差異
      const comparison = quickCompare(lastImageData, currentImageData, sensitivity, centerWidthPercent);

      if (comparison.shouldCapture) {
        shouldCapture = true;
        console.log(`📷 偵測到變化 (${comparison.diffPercent.toFixed(1)}%) @ ${currentTime.toFixed(1)}s`);
      }
    }

    if (shouldCapture) {
      // 截圖到主 canvas
      ctx.drawImage(
        video,
        0, subtitleRegionY, videoWidth, subtitleRegionHeight,
        0, 0, videoWidth, subtitleRegionHeight
      );

      const imageData = canvas.toDataURL('image/jpeg', 0.7);

      // 檢測上方字幕區域
      const upperSubtitleY = subtitleRegionY - subtitleRegionHeight;
      let upperPreview = null;
      let hasUpperSubtitle = false;
      const autoDetectUpper = config.autoDetectUpperSubtitle !== false;

      if (upperSubtitleY >= 0) {
        // 截取上方字幕區域進行檢測
        const upperCanvas = document.createElement('canvas');
        const upperCtx = upperCanvas.getContext('2d');
        upperCanvas.width = videoWidth;
        upperCanvas.height = subtitleRegionHeight;

        upperCtx.drawImage(
          video,
          0, upperSubtitleY, videoWidth, subtitleRegionHeight,
          0, 0, videoWidth, subtitleRegionHeight
        );

        // 檢測上方區域是否有字幕（如果啟用自動檢測）
        if (autoDetectUpper) {
          const upperImageData = upperCtx.getImageData(0, 0, upperCanvas.width, upperCanvas.height);
          const upperTextCheck = hasSubtitleText(upperImageData, subtitleColor, minPixelPercent, centerWidthPercent);

          if (upperTextCheck.hasText) {
            // 有偵測到文字像素，但需要進一步確認是否為真正的字幕
            // 透過與上一張上方區域比對，排除靜態背景的干擾
            if (!lastUpperImageData) {
              // 第一次偵測到上方字幕
              hasUpperSubtitle = true;
              console.log(`📄 首次偵測到上方字幕 (${upperTextCheck.centerPixelPercent.toFixed(2)}%)`);
            } else {
              // 比對與上一張上方字幕的差異
              const upperComparison = quickCompare(lastUpperImageData, upperImageData, sensitivity, centerWidthPercent);

              if (upperComparison.shouldCapture) {
                // 上方字幕有變化，確認為真正的字幕
                hasUpperSubtitle = true;
                console.log(`📄 偵測到上方字幕變化 (像素: ${upperTextCheck.centerPixelPercent.toFixed(2)}%, 差異: ${upperComparison.diffPercent.toFixed(1)}%)`);
              } else {
                // 上方字幕與上一張相似，可能只是靜態背景
                console.log(`⏭️ 上方區域無變化，視為背景 (差異僅 ${upperComparison.diffPercent.toFixed(1)}%)`);
              }
            }
            // 不論是否標記為字幕，都更新 lastUpperImageData 以追蹤上方區域變化
            lastUpperImageData = upperImageData;
          } else {
            // 無字幕時，重置 lastUpperImageData
            if (lastUpperImageData) {
              lastUpperImageData = null;
              console.log(`⏭️ 上方字幕消失`);
            }
          }
        }

        // 生成預覽縮圖（不論是否有字幕都生成，供用戶參考）
        const previewCanvas = document.createElement('canvas');
        const previewCtx = previewCanvas.getContext('2d');
        const centerWidth = Math.floor(videoWidth * 0.3);
        const centerX = Math.floor((videoWidth - centerWidth) / 2);
        const thumbWidth = 100;
        const thumbHeight = Math.floor(subtitleRegionHeight * thumbWidth / centerWidth);

        previewCanvas.width = thumbWidth;
        previewCanvas.height = thumbHeight;

        previewCtx.drawImage(
          video,
          centerX, upperSubtitleY, centerWidth, subtitleRegionHeight,
          0, 0, thumbWidth, thumbHeight
        );

        upperPreview = previewCanvas.toDataURL('image/jpeg', 0.5);
      }

      const shot = {
        time: currentTime,
        imageData: imageData,
        upperPreview: upperPreview,
        hasUpperSubtitle: hasUpperSubtitle
      };

      captureData.screenshots.push(shot);
      currentPageScreenshots.push(shot);
      capturedCount++;
      lastCaptureTime = currentTime;
      lastImageData = currentImageData;

      // 組合頁面
      if (currentPageScreenshots.length >= config.linesPerPage) {
        const page = {
          pageNumber: captureData.pages.length + 1,
          startTime: currentPageScreenshots[0].time,
          endTime: currentPageScreenshots[currentPageScreenshots.length - 1].time,
          screenshots: [...currentPageScreenshots]
        };

        captureData.pages.push(page);
        currentPageScreenshots = [];

        // 即時儲存
        const existingResult = await chrome.storage.local.get(['liveCapture']);
        const existingData = existingResult.liveCapture || {};
        const existingPages = existingData.pages || [];

        const mergedPages = [];
        for (let p = 0; p < captureData.pages.length; p++) {
          if (p < existingPages.length) {
            mergedPages.push(existingPages[p]);
          } else {
            mergedPages.push(captureData.pages[p]);
          }
        }

        await chrome.storage.local.set({
          liveCapture: {
            videoId,
            videoTitle: captureData.videoTitle,
            isCapturing: true,
            pages: mergedPages,
            captureSettings: captureData.captureSettings
          }
        });
      }

      // 更新進度
      const progress = Math.min(90, Math.floor((capturedCount / estimatedCaptures) * 90));
      updateProgress(progress, `🤖 智慧擷取中... ${capturedCount} 張 (${captureData.pages.length} 頁)`);
    }
  }, checkIntervalMs);

  // 監聽影片結束
  video.addEventListener('ended', () => {
    clearInterval(checkLoop);
  }, { once: true });
}

/**
 * 完成智慧擷取
 */
async function finishSmartCapture(videoId, config) {
  const video = document.querySelector('video');
  if (video) {
    video.pause();
    // 恢復正常播放設定
    video.muted = false;
    video.playbackRate = 1.0;
    console.log('🔊 已恢復正常播放設定');
  }

  // 處理未滿一頁的剩餘截圖
  if (captureData.screenshots.length > captureData.pages.length * config.linesPerPage) {
    const startIdx = captureData.pages.length * config.linesPerPage;
    const remainingShots = captureData.screenshots.slice(startIdx);

    if (remainingShots.length > 0) {
      const page = {
        pageNumber: captureData.pages.length + 1,
        startTime: remainingShots[0].time,
        endTime: remainingShots[remainingShots.length - 1].time,
        screenshots: remainingShots
      };
      captureData.pages.push(page);
    }
  }

  // 儲存資料
  updateProgress(95, '儲存資料中...');

  try {
    await chrome.storage.local.set({ captureData: captureData });

    const finalResult = await chrome.storage.local.get(['liveCapture']);
    const finalData = finalResult.liveCapture || {};
    const finalPages = finalData.pages || captureData.pages;

    await chrome.storage.local.set({
      liveCapture: {
        videoId,
        videoTitle: captureData.videoTitle,
        isCapturing: false,
        pages: finalPages,
        captureSettings: captureData.captureSettings
      }
    });

    // 段落儲存
    if (captureData.pages.length > 0) {
      const startTime = captureData.pages[0].startTime;
      const endTime = captureData.pages[captureData.pages.length - 1].endTime;
      const segmentKey = `${videoId}_${Math.floor(startTime)}_${Math.floor(endTime)}`;

      const result = await chrome.storage.local.get(['savedSegments']);
      let segments = result.savedSegments || [];
      segments = segments.filter(s => s.key !== segmentKey);

      segments.push({
        key: segmentKey,
        videoId,
        videoTitle: captureData.videoTitle,
        startTime,
        endTime,
        pageCount: captureData.pages.length,
        screenshotCount: captureData.screenshots.length,
        createdAt: Date.now()
      });

      await chrome.storage.local.set({
        savedSegments: segments,
        [`segment_${segmentKey}`]: captureData
      });

      console.log('段落已儲存:', segmentKey);
    }

    console.log('資料已儲存');
  } catch (error) {
    console.error('儲存失敗:', error);
  }

  updateProgress(100, `🤖 智慧擷取完成！${captureData.screenshots.length} 張圖片，${captureData.pages.length} 頁`);
}

async function createPages(linesPerPage) {
  captureData.pages = [];

  // 初始化即時閱讀資料
  const videoId = new URL(window.location.href).searchParams.get('v');
  await chrome.storage.local.set({
    liveCapture: {
      videoId,
      videoTitle: captureData.videoTitle,
      isCapturing: true,
      pages: [],
      captureSettings: captureData.captureSettings
    }
  });

  for (let i = 0; i < captureData.screenshots.length; i += linesPerPage) {
    const pageScreenshots = captureData.screenshots.slice(i, i + linesPerPage);

    const page = {
      pageNumber: captureData.pages.length + 1,
      startTime: pageScreenshots[0].time,
      endTime: pageScreenshots[pageScreenshots.length - 1].time,
      screenshots: pageScreenshots
    };

    captureData.pages.push(page);

    // 即時儲存頁面到 storage
    await chrome.storage.local.set({
      liveCapture: {
        videoId,
        videoTitle: captureData.videoTitle,
        isCapturing: true,
        pages: captureData.pages,
        captureSettings: captureData.captureSettings
      }
    });

    // 完成 2 頁後通知 popup 顯示即時閱讀按鈕
    if (captureData.pages.length === 2) {
      chrome.runtime.sendMessage({
        action: 'liveReadyPages',
        pageCount: 2
      }).catch(() => { }); // popup 可能已關閉
    }

    const progress = 50 + Math.floor(((i + linesPerPage) / captureData.screenshots.length) * 50);
    updateProgress(progress, `組合頁面... ${page.pageNumber}`);
  }

  // 完成後標記為非擷取中
  await chrome.storage.local.set({
    liveCapture: {
      videoId,
      videoTitle: captureData.videoTitle,
      isCapturing: false,
      pages: captureData.pages,
      captureSettings: captureData.captureSettings
    }
  });
}

function updateProgress(progress, message) {
  console.log(`進度: ${progress}% - ${message}`);

  try {
    chrome.runtime.sendMessage({
      action: 'updateProgress',
      progress: progress,
      message: message
    }, (response) => {
      // 忽略回應，避免阻塞
      if (chrome.runtime.lastError) {
        console.log('進度更新訊息發送失敗（可忽略）:', chrome.runtime.lastError.message);
      }
    });
  } catch (error) {
    console.error('發送進度更新失敗:', error);
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function openViewer(linesPerPage = 5) {
  // 建立全螢幕閱讀器
  if (document.getElementById('subtitle-book-viewer')) {
    document.getElementById('subtitle-book-viewer').remove();
  }

  // 使用直式右側控制列布局
  const layoutClass = 'side-controls';

  const viewer = document.createElement('div');
  viewer.id = 'subtitle-book-viewer';
  viewer.innerHTML = `
    <div class="viewer-container ${layoutClass}">
      <div class="viewer-main">
        <div class="viewer-header">
          <div class="viewer-title">${captureData.videoTitle}</div>
          <div class="viewer-page-info">
            <input type="number" id="pageJumpInput" min="1" max="${captureData.pages.length}" value="1" title="輸入頁碼後按 Enter 跳轉">
            <span>/ ${captureData.pages.length}</span>
          </div>
          <button class="viewer-close" id="closeViewer">✕</button>
        </div>
        <div class="viewer-content" id="viewerContent">
          <!-- 頁面內容會動態插入這裡 -->
        </div>
      </div>
      <div class="viewer-controls">
        <button id="prevPage" title="上一頁">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
            <path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/>
          </svg>
        </button>
        <button id="playAudio" title="播放/暫停">
          <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
            <path d="M8 5v14l11-7z"/>
          </svg>
        </button>
        <button id="nextPage" title="下一頁">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
            <path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/>
          </svg>
        </button>
        <select id="playbackSpeed" title="播放速度">
          <option value="1">1x</option>
          <option value="1.25">1.25x</option>
          <option value="1.5">1.5x</option>
          <option value="2">2x</option>
        </select>
        <button id="toggleMute" title="靜音開關">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
            <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
          </svg>
        </button>
        <button id="toggleBatchMode" title="批次刪除" style="background: #9C27B0;">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
            <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-2 10H7v-2h10v2z"/>
          </svg>
        </button>
        <button id="confirmBatchDelete" title="刪除已選" style="background: #ff4444; display: none;">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
            <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
          </svg>
        </button>
        <button id="cancelBatchMode" title="取消" style="background: #666; display: none;">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
          </svg>
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(viewer);

  // 顯示第一頁
  let currentPageIndex = 0;
  let isPlaying = false;
  let playCheckInterval = null;
  let pausedTime = null;  // 新增：記錄暫停位置
  let isBatchMode = false;  // 批次刪除模式
  showPage(currentPageIndex);

  // 控制按鈕
  document.getElementById('closeViewer').addEventListener('click', () => {
    stopPlayback();
    viewer.remove();
  });

  document.getElementById('prevPage').addEventListener('click', () => {
    if (currentPageIndex > 0) {
      stopPlayback();
      pausedTime = null;  // 切頁時清除暫停位置
      currentPageIndex--;
      showPage(currentPageIndex);
      playPageAudio(currentPageIndex);
    }
  });

  document.getElementById('nextPage').addEventListener('click', () => {
    if (currentPageIndex < captureData.pages.length - 1) {
      stopPlayback();
      pausedTime = null;  // 切頁時清除暫停位置
      currentPageIndex++;
      showPage(currentPageIndex);
      playPageAudio(currentPageIndex);
    }
  });

  document.getElementById('playAudio').addEventListener('click', () => {
    if (isPlaying) {
      pausePlayback();
    } else {
      playPageAudio(currentPageIndex);
    }
  });

  // 頁碼跳轉 - 按 Enter 跳轉（不自動播放）
  document.getElementById('pageJumpInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const targetPage = parseInt(e.target.value) - 1;
      if (targetPage >= 0 && targetPage < captureData.pages.length) {
        stopPlayback();
        pausedTime = null;
        currentPageIndex = targetPage;
        showPage(currentPageIndex);
        // 不自動播放
      }
    }
  });

  function showPage(pageIndex) {
    const page = captureData.pages[pageIndex];
    const content = document.getElementById('viewerContent');

    // 計算每張截圖的高度，確保所有截圖在一頁內可見
    const screenshotCount = page.screenshots.length;
    const maxHeight = screenshotCount > 0 ? `calc((100vh - 200px) / ${screenshotCount})` : 'auto';

    content.innerHTML = page.screenshots.map((shot, idx) => `
      <div class="screenshot-item ${isBatchMode ? 'batch-mode' : ''}" style="max-height: ${maxHeight};" data-shot-index="${idx}">
        ${isBatchMode ? `<input type="checkbox" class="batch-checkbox" data-index="${idx}" style="position:absolute;left:10px;top:10px;width:20px;height:20px;z-index:100;cursor:pointer;">` : ''}
        ${shot.upperPreview ? `
          <div class="upper-preview-container" data-index="${idx}" title="點擊新增上方字幕">
            <img src="${shot.upperPreview}" class="upper-preview-thumb" alt="上方預覽">
          </div>
        ` : ''}
        <img src="${shot.imageData}" alt="字幕 ${shot.time}秒" style="max-height: ${maxHeight}; object-fit: contain;">
        <span class="timestamp">${formatTime(shot.time)}</span>
        ${!isBatchMode ? `
        <div class="screenshot-controls">
          ${!shot.isUpperSubtitle ? `
            <button class="adj-btn" data-action="addUpper" data-index="${idx}" title="新增上方字幕">⬆ 上方</button>
            <button class="adj-btn" data-action="openTimeScrubber" data-index="${idx}" data-time="${shot.time}" title="微調時間">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z"/></svg>
            </button>
            <button class="adj-btn play" data-action="playFromShot" data-index="${idx}" data-time="${shot.time}" title="從此位置播放">▶</button>
            <button class="adj-btn" data-action="insertBelow" data-index="${idx}" title="向下插入截圖" style="background:#2196F3;">＋</button>
          ` : ''}
          <button class="adj-btn delete" data-action="delete" data-index="${idx}" title="刪除此行">🗑</button>
        </div>
        ` : ''}
      </div>
    `).join('');

    // 更新頁碼輸入框
    document.getElementById('pageJumpInput').value = pageIndex + 1;

    // 更新按鈕狀態
    document.getElementById('prevPage').disabled = pageIndex === 0;
    document.getElementById('nextPage').disabled = pageIndex === captureData.pages.length - 1;

    // 綁定調整按鈕事件
    content.querySelectorAll('.adj-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const action = e.target.closest('.adj-btn')?.dataset?.action;
        const shotIndex = parseInt(e.target.closest('.adj-btn')?.dataset?.index);

        if (action === 'playFromShot') {
          // 從此截圖位置播放（設定 pausedTime 然後呼叫 playPageAudio）
          const time = parseFloat(e.target.closest('.adj-btn')?.dataset?.time);
          pausedTime = time;
          playPageAudio(currentPageIndex);
        } else if (action === 'openTimeScrubber') {
          const time = parseFloat(e.target.closest('.adj-btn')?.dataset?.time);
          await openTimeScrubberModal(pageIndex, shotIndex, time);
        } else {
          await adjustScreenshot(pageIndex, shotIndex, action);
        }
      });
    });

    // 綁定預覽縮圖點擊事件
    content.querySelectorAll('.upper-preview-container').forEach(container => {
      container.addEventListener('click', async () => {
        const shotIndex = parseInt(container.dataset.index);
        await adjustScreenshot(pageIndex, shotIndex, 'addUpper');
      });
    });
  }

  function playPageAudio(pageIndex) {
    const page = captureData.pages[pageIndex];
    const video = document.querySelector('video');
    const playButton = document.getElementById('playAudio');

    // 停止之前的播放檢查
    if (playCheckInterval) {
      clearInterval(playCheckInterval);
    }

    // 套用播放設定
    const speedSelect = document.getElementById('playbackSpeed');
    const muteBtn = document.getElementById('toggleMute');
    if (speedSelect) {
      video.playbackRate = parseFloat(speedSelect.value) || 1;
    }
    if (muteBtn) {
      video.muted = muteBtn.dataset.muted === 'true';
    }

    // 如果有暫停位置且在該頁範圍內，從暫停位置繼續
    if (pausedTime !== null && pausedTime >= page.startTime && pausedTime < page.endTime + 1) {
      video.currentTime = pausedTime;
    } else {
      video.currentTime = page.startTime;
    }
    pausedTime = null;  // 清除暫停位置
    video.play();

    // 更新狀態和按鈕
    isPlaying = true;
    const svg = playButton.querySelector('svg path');
    if (svg) {
      svg.setAttribute('d', 'M6 19h4V5H6v14zm8-14v14h4V5h-4z'); // Pause icon
    }
    playButton.style.background = '#ff9800';

    // 播放到該頁結束時間時暫停
    playCheckInterval = setInterval(() => {
      if (video.currentTime >= page.endTime + 1) {
        stopPlayback();
      }
    }, 100);
  }

  function pausePlayback() {
    const video = document.querySelector('video');
    const playButton = document.getElementById('playAudio');

    pausedTime = video.currentTime;  // 記錄暫停位置
    video.pause();
    isPlaying = false;
    const svg = playButton.querySelector('svg path');
    if (svg) {
      svg.setAttribute('d', 'M8 5v14l11-7z'); // Play icon
    }
    playButton.style.background = '#ff0000';

    if (playCheckInterval) {
      clearInterval(playCheckInterval);
      playCheckInterval = null;
    }
  }

  function stopPlayback() {
    const video = document.querySelector('video');
    const playButton = document.getElementById('playAudio');

    video.pause();
    isPlaying = false;
    pausedTime = null;  // 播放完畢清除暫停位置
    const svg = playButton.querySelector('svg path');
    if (svg) {
      svg.setAttribute('d', 'M8 5v14l11-7z'); // Play icon
    }
    playButton.style.background = '#ff0000';

    if (playCheckInterval) {
      clearInterval(playCheckInterval);
      playCheckInterval = null;
    }
  }

  // 微調時間模態框
  async function openTimeScrubberModal(pageIndex, shotIndex, currentTime) {
    const video = document.querySelector('video');
    if (!video) return;

    // 顯示準備提示
    showToast('準備預覽圖...', 'info');

    // 獲取影片尺寸（在函數開頭定義，供整個函數使用）
    const settings = captureData.captureSettings || { subtitleHeight: 15, bottomMargin: 0 };
    const currentVideoWidth = video.videoWidth;
    const currentVideoHeight = video.videoHeight;

    // 生成預覽圖
    const previews = [];
    const rangeSeconds = 5;
    const intervalSeconds = 0.5;
    const startTime = Math.max(0, currentTime - rangeSeconds);
    const endTime = Math.min(captureData.videoDuration, currentTime + rangeSeconds);

    for (let time = startTime; time <= endTime; time += intervalSeconds) {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const subtitleRegionHeight = Math.floor(currentVideoHeight * (settings.subtitleHeight / 100));
      const bottomMarginHeight = Math.floor(currentVideoHeight * (settings.bottomMargin / 100));
      const subtitleRegionY = currentVideoHeight - subtitleRegionHeight - bottomMarginHeight;

      // 只截取中間10%寬度的區域
      const centerWidth = Math.floor(currentVideoWidth * 0.1);
      const centerX = Math.floor((currentVideoWidth - centerWidth) / 2);

      canvas.width = centerWidth;
      canvas.height = subtitleRegionHeight;

      video.currentTime = time;
      await new Promise(resolve => {
        const checkReady = () => {
          if (Math.abs(video.currentTime - time) < 0.1 && video.readyState >= 2) {
            resolve();
          } else {
            setTimeout(checkReady, 50);
          }
        };
        checkReady();
      });
      await sleep(100);

      // 從影片中間10%區域截取
      ctx.drawImage(
        video,
        centerX, subtitleRegionY, centerWidth, subtitleRegionHeight,
        0, 0, centerWidth, subtitleRegionHeight
      );

      previews.push({
        time: time,
        imageData: canvas.toDataURL('image/jpeg', 0.7)
      });
    }

    // 建立模態框
    const modal = document.createElement('div');
    modal.className = 'time-scrubber-modal';
    modal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      z-index: 2147483647;
      display: flex;
      align-items: center;
      justify-content: center;
    `;

    modal.innerHTML = `
      <div class="modal-overlay" style="position: absolute; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.85); backdrop-filter: blur(4px);"></div>
      <div class="modal-content" style="position: relative; background: #1F1F1F; border-radius: 12px; min-width: 700px; max-width: 85%; box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);">
        <div class="modal-header" style="display: flex; justify-content: space-between; align-items: center; padding: 16px 20px; border-bottom: 1px solid #3F3F3F;">
          <h3 style="margin: 0; color: white; font-size: 16px;">微調截圖時間</h3>
          <button class="modal-close" style="background: transparent; border: none; color: #AAAAAA; font-size: 24px; cursor: pointer; padding: 0; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; border-radius: 4px; transition: all 0.2s;">×</button>
        </div>
        <div class="modal-body" style="padding: 20px;">
          <div class="preview-strip" id="previewStrip" style="display: flex; gap: 2px; overflow-x: auto; padding: 8px 0; margin-bottom: 20px; scrollbar-width: thin; scrollbar-color: #3F3F3F #1F1F1F; justify-content: center;"></div>
          <div class="scrubber-controls" style="display: flex; flex-direction: column; align-items: center; gap: 12px;">
            <input type="range"
                   id="timeScrubber"
                   min="${startTime}"
                   max="${endTime}"
                   step="0.1"
                   value="${currentTime}"
                   style="width: 100%; height: 6px; background: #3F3F3F; border-radius: 3px; outline: none; cursor: pointer;">
            <div class="time-display">
              <span id="currentTimeDisplay" style="color: #FF0000; font-size: 18px; font-weight: bold; font-family: monospace;">${formatTime(currentTime)}</span>
            </div>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    // 填充預覽圖 - 截圖已經是中間10%寬度，設定合適的顯示大小
    const previewStrip = document.getElementById('previewStrip');
    const centerWidth = Math.floor(currentVideoWidth * 0.1); // 截圖的實際寬度
    const baseWidth = 60; // 基礎顯示寬度（像素）- 縮小以容納20張

    previews.forEach((preview, index) => {
      const frame = document.createElement('div');
      frame.className = 'preview-frame';
      frame.dataset.time = preview.time;
      frame.style.cssText = `
        flex-shrink: 0;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 2px;
        cursor: pointer;
        transition: opacity 0.2s ease, transform 0.2s ease;
        opacity: 0.5;
      `;
      frame.innerHTML = `
        <img src="${preview.imageData}" alt="${formatTime(preview.time)}" style="display: block; width: ${baseWidth * 0.5}px; height: auto; border-radius: 4px; border: 2px solid transparent; transition: all 0.2s ease;">
        <span class="frame-time" style="display: block; text-align: center; color: #AAAAAA; font-size: 9px; font-family: monospace;">${formatTime(preview.time)}</span>
      `;
      previewStrip.appendChild(frame);
    });

    // Scrubber event handling
    const scrubber = document.getElementById('timeScrubber');
    const timeDisplay = document.getElementById('currentTimeDisplay');
    const frames = document.querySelectorAll('.preview-frame');

    function updatePreviewHighlight(time) {
      frames.forEach(frame => {
        const frameTime = parseFloat(frame.dataset.time);
        const diff = Math.abs(frameTime - time);
        const img = frame.querySelector('img');

        // 當前選中的幀 - 最大尺寸
        if (diff < 0.25) {
          frame.classList.add('active');
          frame.style.opacity = '1';
          img.style.width = baseWidth + 'px';
          img.style.borderColor = '#FF0000';
          img.style.boxShadow = '0 0 8px rgba(255, 0, 0, 0.5)';
        } else {
          frame.classList.remove('active');

          // 透視效果：不透明度和大小隨距離遞減
          const distance = diff / rangeSeconds; // 標準化距離 (最大為1)
          const opacity = Math.max(0.3, 1 - distance * 0.7); // 最小30%不透明度
          frame.style.opacity = opacity.toString();

          // 根據距離縮小圖片 - 範圍從30%到100%
          const scale = Math.max(0.3, 1 - distance * 0.7); // 最小30%大小
          const width = baseWidth * scale;
          img.style.width = width + 'px';
          img.style.borderColor = 'transparent';
          img.style.boxShadow = 'none';
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
      modal.remove();

      if (Math.abs(newTime - currentTime) > 0.05) {
        const page = captureData.pages[pageIndex];
        const shot = page.screenshots[shotIndex];
        shot.time = newTime;
        await recaptureScreenshot(shot, pageIndex, shotIndex);

        // 更新頁面時間範圍
        page.startTime = Math.min(...page.screenshots.map(s => s.time));
        page.endTime = Math.max(...page.screenshots.map(s => s.time));

        await saveCurrentResult();
        showPage(pageIndex);
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
  }

  async function adjustScreenshot(pageIndex, shotIndex, action) {
    const page = captureData.pages[pageIndex];
    const shot = page.screenshots[shotIndex];

    if (action === 'delete') {
      // 刪除截圖
      if (page.screenshots.length <= 1) {
        alert('無法刪除，每頁至少需要一張截圖');
        return;
      }
      page.screenshots.splice(shotIndex, 1);
      // 更新頁面時間範圍
      page.startTime = page.screenshots[0].time;
      page.endTime = page.screenshots[page.screenshots.length - 1].time;
    } else if (action === 'addUpper') {
      // 新增上方字幕 - 截取當前位置上方的區域
      const upperShot = await captureUpperSubtitle(shot.time);
      if (upperShot) {
        // 在當前位置上方插入
        page.screenshots.splice(shotIndex, 0, upperShot);
      }
    } else if (action === 'insertBelow') {
      // 向下插入複製的截圖
      const newShot = {
        time: shot.time + 0.1,  // 稍微後移一點時間
        imageData: shot.imageData,
        upperPreview: shot.upperPreview || null,
        isInserted: true  // 標記為插入的截圖
      };
      page.screenshots.splice(shotIndex + 1, 0, newShot);

      // 更新頁面時間範圍
      page.startTime = Math.min(...page.screenshots.map(s => s.time));
      page.endTime = Math.max(...page.screenshots.map(s => s.time));
    } else {
      // 調整時間
      const delta = action === 'backward' ? -0.2 : 0.2;
      const newTime = Math.max(0, Math.min(captureData.videoDuration, shot.time + delta));
      shot.time = newTime;

      // 重新截圖
      await recaptureScreenshot(shot, pageIndex, shotIndex);

      // 更新頁面時間範圍
      page.startTime = Math.min(...page.screenshots.map(s => s.time));
      page.endTime = Math.max(...page.screenshots.map(s => s.time));
    }

    // 儲存調整後的資料
    await saveCurrentResult();

    // Show auto-save confirmation
    console.log('✓ 已自動儲存變更');

    // 重新顯示頁面
    showPage(pageIndex);
  }

  async function recaptureScreenshot(shot, pageIndex, shotIndex) {
    const video = document.querySelector('video');
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    // 🔧 修正:使用 captureData.captureSettings 中儲存的設定
    const settings = captureData.captureSettings;
    if (!settings) {
      alert('無法取得原始截圖設定');
      return;
    }

    // 🔧 修正:使用當前影片尺寸 + 儲存的百分比設定重新計算
    const currentVideoWidth = video.videoWidth;
    const currentVideoHeight = video.videoHeight;

    const subtitleHeightPercent = settings.subtitleHeight || 15;
    const bottomMarginPercent = settings.bottomMargin || 0;

    const subtitleRegionHeight = Math.floor(currentVideoHeight * (subtitleHeightPercent / 100));
    const bottomMarginHeight = Math.floor(currentVideoHeight * (bottomMarginPercent / 100));
    const subtitleRegionY = currentVideoHeight - subtitleRegionHeight - bottomMarginHeight;

    canvas.width = currentVideoWidth;
    canvas.height = subtitleRegionHeight;

    // 跳轉到新時間
    video.currentTime = shot.time;

    // 等待影片跳轉完成
    await new Promise(resolve => {
      const checkReady = () => {
        if (Math.abs(video.currentTime - shot.time) < 0.1 && video.readyState >= 2) {
          resolve();
        } else {
          setTimeout(checkReady, 50);
        }
      };
      checkReady();
    });

    await sleep(200);

    // 截取字幕區域
    ctx.drawImage(
      video,
      0, subtitleRegionY, currentVideoWidth, subtitleRegionHeight,
      0, 0, currentVideoWidth, subtitleRegionHeight
    );

    shot.imageData = canvas.toDataURL('image/jpeg', 0.7);
  }

  // 截取上方字幕區域
  async function captureUpperSubtitle(time) {
    const video = document.querySelector('video');
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    // 🔧 修正:使用儲存的截圖設定
    const settings = captureData.captureSettings;
    if (!settings) {
      alert('無法取得原始截圖設定');
      return null;
    }

    // 🔧 修正:使用當前影片尺寸 + 儲存的百分比設定重新計算
    const currentVideoWidth = video.videoWidth;
    const currentVideoHeight = video.videoHeight;

    const subtitleHeightPercent = settings.subtitleHeight || 15;
    const bottomMarginPercent = settings.bottomMargin || 0;

    const subtitleRegionHeight = Math.floor(currentVideoHeight * (subtitleHeightPercent / 100));
    const bottomMarginHeight = Math.floor(currentVideoHeight * (bottomMarginPercent / 100));

    // 上方字幕區域 = 原本字幕位置再往上一個高度
    const normalSubtitleY = currentVideoHeight - subtitleRegionHeight - bottomMarginHeight;
    const upperSubtitleY = normalSubtitleY - subtitleRegionHeight;

    // 檢查是否超出影片範圍
    if (upperSubtitleY < 0) {
      alert('無法截取上方字幕:已超出影片範圍');
      return null;
    }

    canvas.width = currentVideoWidth;
    canvas.height = subtitleRegionHeight;

    // 跳轉到指定時間
    video.currentTime = time;

    // 等待影片跳轉完成
    await new Promise(resolve => {
      const checkReady = () => {
        if (Math.abs(video.currentTime - time) < 0.1 && video.readyState >= 2) {
          resolve();
        } else {
          setTimeout(checkReady, 50);
        }
      };
      checkReady();
    });

    await sleep(200);

    // 截取上方字幕區域
    ctx.drawImage(
      video,
      0, upperSubtitleY, currentVideoWidth, subtitleRegionHeight,
      0, 0, currentVideoWidth, subtitleRegionHeight
    );

    return {
      time: time,
      imageData: canvas.toDataURL('image/jpeg', 0.7),
      isUpperSubtitle: true
    };
  }

  async function saveCurrentResult() {
    try {
      // 基本儲存
      await chrome.storage.local.set({ captureData: captureData });

      // 段落儲存
      const videoId = new URL(window.location.href).searchParams.get('v');
      if (captureData.pages.length > 0) {
        const startTime = captureData.pages[0].startTime;
        const endTime = captureData.pages[captureData.pages.length - 1].endTime;
        const segmentKey = `${videoId}_${Math.floor(startTime)}_${Math.floor(endTime)}`;

        // 獲取現有段落列表
        const result = await chrome.storage.local.get(['savedSegments']);
        let segments = result.savedSegments || [];

        // 更新或新增此段落
        const existingIndex = segments.findIndex(s => s.key === segmentKey);
        const segmentInfo = {
          key: segmentKey,
          videoId,
          videoTitle: captureData.videoTitle,
          startTime,
          endTime,
          pageCount: captureData.pages.length,
          screenshotCount: captureData.screenshots.length,
          updatedAt: Date.now()
        };

        if (existingIndex >= 0) {
          segments[existingIndex] = { ...segments[existingIndex], ...segmentInfo };
        } else {
          segmentInfo.createdAt = Date.now();
          segments.push(segmentInfo);
        }

        await chrome.storage.local.set({
          savedSegments: segments,
          [`segment_${segmentKey}`]: captureData
        });
      }

      console.log('調整已儲存');
    } catch (error) {
      console.error('儲存失敗:', error);
    }
  }

  // 批次刪除模式
  function enterBatchMode() {
    isBatchMode = true;
    document.getElementById('toggleBatchMode').style.display = 'none';
    document.getElementById('confirmBatchDelete').style.display = 'inline-block';
    document.getElementById('cancelBatchMode').style.display = 'inline-block';
    showPage(currentPageIndex);
  }

  function exitBatchMode() {
    isBatchMode = false;
    document.getElementById('toggleBatchMode').style.display = 'inline-block';
    document.getElementById('confirmBatchDelete').style.display = 'none';
    document.getElementById('cancelBatchMode').style.display = 'none';
    showPage(currentPageIndex);
  }

  async function executeBatchDelete() {
    const checkboxes = document.querySelectorAll('.batch-checkbox:checked');
    const selectedIndices = Array.from(checkboxes).map(cb => parseInt(cb.dataset.index));

    if (selectedIndices.length === 0) {
      alert('請先勾選要刪除的截圖');
      return;
    }

    const page = captureData.pages[currentPageIndex];
    if (selectedIndices.length >= page.screenshots.length) {
      alert('無法刪除所有截圖，每頁至少需保留一張');
      return;
    }

    // 從後向前刪除，避免索引變化
    const sortedIndices = selectedIndices.sort((a, b) => b - a);

    // 刪除選中的截圖
    for (const idx of sortedIndices) {
      page.screenshots.splice(idx, 1);
    }

    // 更新時間範圍
    page.startTime = page.screenshots[0].time;
    page.endTime = page.screenshots[page.screenshots.length - 1].time;

    // 儲存
    await saveCurrentResult();

    // 退出批次模式
    exitBatchMode();

    console.log(`✅ 已刪除 ${sortedIndices.length} 張截圖`);
  }

  // 批次刪除按鈕事件
  document.getElementById('toggleBatchMode').addEventListener('click', enterBatchMode);
  document.getElementById('confirmBatchDelete').addEventListener('click', executeBatchDelete);
  document.getElementById('cancelBatchMode').addEventListener('click', exitBatchMode);

  // 靜音開關
  document.getElementById('toggleMute').addEventListener('click', () => {
    const btn = document.getElementById('toggleMute');
    const isMuted = btn.dataset.muted === 'true';
    const svg = btn.querySelector('svg path');
    if (isMuted) {
      btn.dataset.muted = 'false';
      if (svg) {
        svg.setAttribute('d', 'M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z');
      }
      btn.style.background = 'transparent';
    } else {
      btn.dataset.muted = 'true';
      if (svg) {
        svg.setAttribute('d', 'M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z');
      }
      btn.style.background = '#ff9800';
    }
  });

  // 鍵盤快捷鍵 - 綁定到 viewer 元素
  viewer.addEventListener('keydown', (e) => {
    // Ignore if user is typing in input fields
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') {
      return;
    }

    // Get the currently hovered screenshot within the viewer
    const hoveredItem = viewer.querySelector('.screenshot-item:hover');
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
          showPage(currentPageIndex - 1);
        }
        break;

      case 'ArrowDown':
        // 下：下一頁
        e.preventDefault();
        if (currentPageIndex < captureData.pages.length - 1) {
          showPage(currentPageIndex + 1);
        }
        break;

      case 'Enter':
        // Enter：下一頁
        e.preventDefault();
        if (currentPageIndex < captureData.pages.length - 1) {
          showPage(currentPageIndex + 1);
        }
        break;

      case ' ':
        // 空白鍵：播放/暫停
        e.preventDefault();
        playPageAudio();
        break;
    }
  });

  // Make viewer focusable to receive keyboard events
  viewer.setAttribute('tabindex', '0');
  viewer.focus();

  function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }
}

// 預覽功能：截取一個頁面的量來顯示
async function showPreview(config) {
  const video = document.querySelector('video');
  if (!video) {
    alert('找不到影片元素');
    return;
  }

  // 移除舊的預覽
  const oldPreview = document.getElementById('subtitle-book-preview');
  if (oldPreview) {
    oldPreview.remove();
  }

  // 儲存當前播放位置
  const originalTime = video.currentTime;
  const wasPlaying = !video.paused;

  // 暫停影片
  video.pause();

  // 建立canvas用於截圖
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  // 計算字幕區域
  const videoWidth = video.videoWidth;
  const videoHeight = video.videoHeight;
  const subtitleRegionHeight = Math.floor(videoHeight * (config.subtitleHeight / 100));
  const bottomMarginHeight = Math.floor(videoHeight * ((config.bottomMargin || 0) / 100));
  const subtitleRegionY = videoHeight - subtitleRegionHeight - bottomMarginHeight;

  canvas.width = videoWidth;
  canvas.height = subtitleRegionHeight;

  // 從當前時間開始截取
  const startTime = Math.max(0, originalTime);
  const previewScreenshots = [];

  // 截取指定行數的截圖
  for (let i = 0; i < config.linesPerPage; i++) {
    const time = startTime + (i * config.captureInterval);

    // 如果超過影片長度，就停止
    if (time > video.duration) {
      break;
    }

    // 跳轉到指定時間
    video.currentTime = time;

    // 等待影片跳轉完成
    await new Promise(resolve => {
      const checkReady = () => {
        if (Math.abs(video.currentTime - time) < 0.1 && video.readyState >= 2) {
          resolve();
        } else {
          setTimeout(checkReady, 50);
        }
      };
      checkReady();
    });

    // 等待畫面穩定
    await sleep(200);

    // 截取字幕區域
    ctx.drawImage(
      video,
      0, subtitleRegionY, videoWidth, subtitleRegionHeight,
      0, 0, videoWidth, subtitleRegionHeight
    );

    const imageData = canvas.toDataURL('image/jpeg', 0.7);

    previewScreenshots.push({
      time: time,
      imageData: imageData
    });
  }

  // 恢復原始播放位置
  video.currentTime = originalTime;
  if (wasPlaying) {
    video.play();
  }

  // 顯示預覽
  showPreviewModal(previewScreenshots, config);
}

// 顯示預覽視窗
function showPreviewModal(screenshots, config) {
  // 儲存預覽截圖供後續調整使用
  let previewScreenshots = [...screenshots];

  const preview = document.createElement('div');
  preview.id = 'subtitle-book-preview';

  function renderPreview() {
    preview.innerHTML = `
      <div class="preview-container">
        <div class="preview-header">
          <h3>📋 預覽效果</h3>
          <div class="preview-info">
            <span>截圖間隔: ${config.captureInterval}秒</span>
            <span>每頁行數: ${config.linesPerPage}行</span>
            <span>字幕高度: ${config.subtitleHeight}%</span>
          </div>
          <button class="preview-close" id="closePreview">✕</button>
        </div>
        <div class="preview-content">
          <p class="preview-hint">這是一個頁面會顯示的內容範例：</p>
          ${previewScreenshots.map((shot, idx) => `
            <div class="preview-screenshot-item" data-shot-index="${idx}">
              <img src="${shot.imageData}" alt="字幕 ${shot.time}秒">
              <span class="preview-timestamp">${formatTime(shot.time)}</span>
              <div class="screenshot-controls preview-shot-controls">
                <button class="adj-btn" data-action="backward" data-index="${idx}" title="向前 0.2 秒">◄ -0.2s</button>
                <button class="adj-btn play" data-action="playFromShot" data-index="${idx}" data-time="${shot.time}" title="從此位置播放">▶</button>
                <button class="adj-btn" data-action="forward" data-index="${idx}" title="向後 0.2 秒">+0.2s ►</button>
                <button class="adj-btn delete" data-action="delete" data-index="${idx}" title="刪除此行">🗑</button>
              </div>
            </div>
          `).join('')}
        </div>
        <div class="preview-footer">
          <p>💡 如果字幕位置不正確，請調整「字幕區域高度」參數</p>
          <p>💡 如果字幕太密集或太稀疏，請調整「截圖間隔」或「每頁行數」</p>
          <div class="preview-btn-group">
            <button class="preview-youtube" id="openYouTube">📺 開啟 YouTube 頁面</button>
            <button class="preview-ok" id="okPreview">確定</button>
          </div>
        </div>
      </div>
    `;

    bindPreviewEvents();
  }

  function bindPreviewEvents() {
    // 關閉按鈕
    document.getElementById('closePreview').addEventListener('click', () => {
      preview.remove();
    });

    document.getElementById('okPreview').addEventListener('click', () => {
      preview.remove();
    });

    // 開啟 YouTube 按鈕
    document.getElementById('openYouTube').addEventListener('click', () => {
      const currentUrl = window.location.href;
      window.open(currentUrl, '_blank');
    });

    // 綁定調整按鈕事件
    preview.querySelectorAll('.adj-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const action = e.target.dataset.action;
        const shotIndex = parseInt(e.target.dataset.index);

        if (action === 'playFromShot') {
          // 從此截圖位置播放
          const time = parseFloat(e.target.dataset.time);
          const video = document.querySelector('video');
          if (video) {
            video.currentTime = time;
            video.play();
          }
        } else if (action === 'delete') {
          // 刪除截圖
          if (previewScreenshots.length <= 1) {
            alert('無法刪除，至少需要一張截圖');
            return;
          }
          previewScreenshots.splice(shotIndex, 1);
          renderPreview();
        } else {
          // 調整時間 (forward/backward)
          await adjustPreviewScreenshot(shotIndex, action);
        }
      });
    });
  }

  async function adjustPreviewScreenshot(shotIndex, action) {
    const shot = previewScreenshots[shotIndex];
    const video = document.querySelector('video');
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    // 計算新時間
    const delta = action === 'backward' ? -0.2 : 0.2;
    const newTime = Math.max(0, Math.min(video.duration, shot.time + delta));
    shot.time = newTime;

    // 使用預覽設定重新截圖
    const videoWidth = video.videoWidth;
    const videoHeight = video.videoHeight;
    const subtitleRegionHeight = Math.floor(videoHeight * (config.subtitleHeight / 100));
    const bottomMarginHeight = Math.floor(videoHeight * ((config.bottomMargin || 0) / 100));
    const subtitleRegionY = videoHeight - subtitleRegionHeight - bottomMarginHeight;

    canvas.width = videoWidth;
    canvas.height = subtitleRegionHeight;

    // 跳轉到新時間
    video.currentTime = newTime;

    // 等待影片跳轉完成
    await new Promise(resolve => {
      const checkReady = () => {
        if (Math.abs(video.currentTime - newTime) < 0.1 && video.readyState >= 2) {
          resolve();
        } else {
          setTimeout(checkReady, 50);
        }
      };
      checkReady();
    });

    await sleep(200);

    // 截取字幕區域
    ctx.drawImage(
      video,
      0, subtitleRegionY, videoWidth, subtitleRegionHeight,
      0, 0, videoWidth, subtitleRegionHeight
    );

    shot.imageData = canvas.toDataURL('image/jpeg', 0.7);

    // 重新渲染預覽
    renderPreview();
  }

  function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  document.body.appendChild(preview);
  renderPreview();
}

// Toast notification function for embedded viewer
function showToast(message, type = 'info') {
  const existingToast = document.querySelector('.embedded-viewer-toast');
  if (existingToast) {
    existingToast.remove();
  }

  const toast = document.createElement('div');
  toast.className = 'embedded-viewer-toast';
  toast.textContent = message;

  const colors = {
    info: '#2196F3',
    success: '#4CAF50',
    error: '#f44336',
    warning: '#ff9800'
  };

  toast.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: ${colors[type] || colors.info};
    color: white;
    padding: 12px 24px;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    z-index: 2147483646;
    font-size: 14px;
    font-weight: 500;
    animation: slideIn 0.3s ease;
  `;

  document.body.appendChild(toast);

  setTimeout(() => {
    toast.style.animation = 'slideOut 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 2000);
}
