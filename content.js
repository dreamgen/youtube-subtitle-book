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

// 監聽來自popup的訊息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'startCapture') {
    currentConfig = message.config;
    captureData.linesPerPage = message.config.linesPerPage;
    startCapture(message.config);
    sendResponse({ success: true });
  } else if (message.action === 'startSmartCapture') {
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
    captureData = message.data;
    sendResponse({ success: true });
  } else if (message.action === 'keepAlive') {
    // 保持分頁活躍
    sendResponse({ alive: true });
  } else if (message.action === 'adjustScreenshotForReader') {
    // 處理來自 reader 的截圖調整請求
    handleReaderAdjustment(message).then(result => {
      sendResponse(result);
    });
    return true; // 保持非同步回應
  } else if (message.action === 'playAudioForReader') {
    // 處理來自 reader 的播放請求
    handleReaderPlayback(message).then(result => {
      sendResponse(result);
    });
    return true;
  } else if (message.action === 'getVideoId') {
    const videoId = new URL(window.location.href).searchParams.get('v');
    sendResponse({ videoId });
  }
  return true;
});

// 處理來自 reader 的截圖調整請求
async function handleReaderAdjustment(message) {
  const { pageIndex, shotIndex, adjustAction } = message;

  // 從 storage 讀取最新資料
  const result = await chrome.storage.local.get(['liveCapture']);
  const data = result.liveCapture;

  if (!data || !data.pages || !data.pages[pageIndex]) {
    return { success: false, error: '找不到頁面資料' };
  }

  const page = data.pages[pageIndex];
  const shot = page.screenshots[shotIndex];

  if (!shot) {
    return { success: false, error: '找不到截圖資料' };
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

    // 截取字幕區域
    ctx.drawImage(
      video,
      0, subtitleRegionY, videoWidth, subtitleRegionHeight,
      0, 0, videoWidth, subtitleRegionHeight
    );

    const imageData = canvas.toDataURL('image/jpeg', 0.7);

    // 截取上方區域的預覽縮圖（僅中間 30% 區域）
    const upperSubtitleY = subtitleRegionY - subtitleRegionHeight;
    let upperPreview = null;

    if (upperSubtitleY >= 0) {
      const previewCanvas = document.createElement('canvas');
      const previewCtx = previewCanvas.getContext('2d');

      // 截取中間 30% 的區域
      const centerWidth = Math.floor(videoWidth * 0.3);
      const centerX = Math.floor((videoWidth - centerWidth) / 2);

      // 縮圖尺寸：寬度 100px，高度按比例
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
      upperPreview: upperPreview
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
      video.paused ||
      video.ended ||
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

    // 先檢查是否有字幕文字
    const textCheck = hasSubtitleText(currentImageData, subtitleColor, minPixelPercent);

    if (!textCheck.hasText) {
      // 無字幕，跳過
      // console log 已在 hasSubtitleText 函數內處理
    } else if (!lastImageData) {
      // 首張截圖（有字幕）
      shouldCapture = true;
      console.log('📷 首張截圖');
    } else if (currentTime - lastCaptureTime >= minCaptureInterval) {
      // 比較像素差異
      const comparison = quickCompare(lastImageData, currentImageData, sensitivity);

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

      // 截取上方區域預覽
      const upperSubtitleY = subtitleRegionY - subtitleRegionHeight;
      let upperPreview = null;

      if (upperSubtitleY >= 0) {
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
        upperPreview: upperPreview
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

  // 根據行數決定布局 - 超過10行使用右側按鈕布局
  const layoutClass = linesPerPage > 10 ? 'side-controls' : 'bottom-controls';

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
        <button id="prevPage">◄ 上一頁</button>
        <button id="playAudio">▶ 播放</button>
        <button id="nextPage">下一頁 ►</button>
        <select id="playbackSpeed" style="padding: 8px; font-size: 12px; border-radius: 5px; background: #444; color: white; border: none;">
          <option value="1">1x</option>
          <option value="1.25">1.25x</option>
          <option value="1.5">1.5x</option>
          <option value="2">2x</option>
        </select>
        <button id="toggleMute" style="background: #666;">🔊</button>
        <button id="toggleBatchMode" style="background: #9C27B0;">☑ 批次刪除</button>
        <button id="confirmBatchDelete" style="background: #ff4444; display: none;">🗑 刪除已選</button>
        <button id="cancelBatchMode" style="background: #666; display: none;">✖ 取消</button>
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
            <button class="adj-btn" data-action="backward" data-index="${idx}" title="向前 0.2 秒">◄ -0.2s</button>
            <button class="adj-btn play" data-action="playFromShot" data-index="${idx}" data-time="${shot.time}" title="從此位置播放">▶</button>
            <button class="adj-btn" data-action="forward" data-index="${idx}" title="向後 0.2 秒">+0.2s ►</button>
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
        const action = e.target.dataset.action;
        const shotIndex = parseInt(e.target.dataset.index);

        if (action === 'playFromShot') {
          // 從此截圖位置播放（設定 pausedTime 然後呼叫 playPageAudio）
          const time = parseFloat(e.target.dataset.time);
          pausedTime = time;
          playPageAudio(currentPageIndex);
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
    playButton.textContent = '⏸ 暫停';
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
    playButton.textContent = '▶ 播放';
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
    playButton.textContent = '▶ 播放';
    playButton.style.background = '#ff0000';

    if (playCheckInterval) {
      clearInterval(playCheckInterval);
      playCheckInterval = null;
    }
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
    if (isMuted) {
      btn.dataset.muted = 'false';
      btn.textContent = '🔊';
      btn.style.background = '#666';
    } else {
      btn.dataset.muted = 'true';
      btn.textContent = '🔇';
      btn.style.background = '#ff9800';
    }
  });

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
