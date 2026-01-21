/**
 * 字幕偵測模組 - 像素差異比較
 * 用於判斷字幕是否有變化，避免重覆截圖
 */

/**
 * 從 Canvas 獲取字幕區域的像素資料
 * @param {HTMLCanvasElement} canvas - 已繪製字幕區域的 canvas
 * @returns {ImageData} - 像素資料
 */
function getSubtitleImageData(canvas) {
    const ctx = canvas.getContext('2d');
    return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

/**
 * 計算兩張圖像的像素差異百分比
 * @param {ImageData} imgData1 - 第一張圖像的像素資料
 * @param {ImageData} imgData2 - 第二張圖像的像素資料
 * @param {number} colorThreshold - 顏色差異閾值 (預設 30)
 * @returns {number} - 差異百分比 (0-100)
 */
function calculatePixelDifference(imgData1, imgData2, colorThreshold = 30) {
    const pixels1 = imgData1.data;
    const pixels2 = imgData2.data;

    // 確保兩張圖像大小相同
    if (pixels1.length !== pixels2.length) {
        console.warn('圖像大小不同，無法比較');
        return 100; // 視為完全不同
    }

    let diffCount = 0;
    const totalPixels = pixels1.length / 4; // RGBA 每個像素 4 個值

    for (let i = 0; i < pixels1.length; i += 4) {
        // 計算 RGB 差異（忽略 Alpha 通道）
        const rDiff = Math.abs(pixels1[i] - pixels2[i]);
        const gDiff = Math.abs(pixels1[i + 1] - pixels2[i + 1]);
        const bDiff = Math.abs(pixels1[i + 2] - pixels2[i + 2]);

        // 若任一顏色通道差異超過閾值，視為變化像素
        if (rDiff > colorThreshold || gDiff > colorThreshold || bDiff > colorThreshold) {
            diffCount++;
        }
    }

    return (diffCount / totalPixels) * 100;
}

/**
 * 判斷字幕是否有意義地變化
 * @param {number} diffPercent - 差異百分比
 * @param {number} sensitivity - 敏感度閾值 (預設 8)
 * @returns {object} - { changed: boolean, reason: string }
 */
function isSubtitleChanged(diffPercent, sensitivity = 8) {
    if (diffPercent < 2) {
        return {
            changed: false,
            reason: 'identical', // 完全相同（重覆字幕）
            diffPercent
        };
    } else if (diffPercent < sensitivity) {
        return {
            changed: false,
            reason: 'minor_change', // 輕微變化（可能是背景閃爍）
            diffPercent
        };
    } else {
        return {
            changed: true,
            reason: 'subtitle_changed', // 字幕變化
            diffPercent
        };
    }
}

/**
 * 比較兩個 Canvas 的字幕區域
 * 綜合計算差異並判斷是否需要截圖
 * @param {HTMLCanvasElement} canvas1 - 前一張截圖的 canvas
 * @param {HTMLCanvasElement} canvas2 - 當前截圖的 canvas
 * @param {number} sensitivity - 敏感度閾值
 * @returns {object} - { shouldCapture: boolean, diffPercent: number, reason: string }
 */
function compareSubtitleRegions(canvas1, canvas2, sensitivity = 8) {
    const imgData1 = getSubtitleImageData(canvas1);
    const imgData2 = getSubtitleImageData(canvas2);

    const diffPercent = calculatePixelDifference(imgData1, imgData2);
    const result = isSubtitleChanged(diffPercent, sensitivity);

    return {
        shouldCapture: result.changed,
        diffPercent: result.diffPercent,
        reason: result.reason
    };
}

/**
 * 快速比較兩張已有的 ImageData
 * @param {ImageData} imgData1 
 * @param {ImageData} imgData2 
 * @param {number} sensitivity 
 * @returns {object}
 */
function quickCompare(imgData1, imgData2, sensitivity = 8) {
    const diffPercent = calculatePixelDifference(imgData1, imgData2);
    const result = isSubtitleChanged(diffPercent, sensitivity);

    return {
        shouldCapture: result.changed,
        diffPercent: result.diffPercent,
        reason: result.reason
    };
}

/**
 * 檢測圖像中是否存在指定顏色的字幕文字
 * @param {ImageData} imgData - 圖像像素資料
 * @param {string} colorType - 顏色類型: 'white', 'yellow', 'any'
 * @param {number} minPixelPercent - 最小像素百分比閾值 (預設 0.5%)
 * @returns {object} - { hasText: boolean, textPixelPercent: number }
 */
function hasSubtitleText(imgData, colorType = 'white', minPixelPercent = 0.5) {
    const pixels = imgData.data;
    const totalPixels = pixels.length / 4;
    let textPixelCount = 0;

    for (let i = 0; i < pixels.length; i += 4) {
        const r = pixels[i];
        const g = pixels[i + 1];
        const b = pixels[i + 2];

        let isTextPixel = false;

        if (colorType === 'white') {
            // 白色字幕：RGB 都 > 200
            isTextPixel = (r > 200 && g > 200 && b > 200);
        } else if (colorType === 'yellow') {
            // 黃色字幕：R > 200, G > 180, B < 100
            isTextPixel = (r > 200 && g > 180 && b < 100);
        } else if (colorType === 'any') {
            // 不過濾，總是視為有字幕
            return { hasText: true, textPixelPercent: 100 };
        }

        if (isTextPixel) {
            textPixelCount++;
        }
    }

    const textPixelPercent = (textPixelCount / totalPixels) * 100;
    const hasText = textPixelPercent >= minPixelPercent;

    if (!hasText) {
        console.log(`⏭️ 無字幕偵測 (${colorType}): 僅 ${textPixelPercent.toFixed(2)}% 符合像素`);
    }

    return {
        hasText,
        textPixelPercent
    };
}

// 導出函數供 content.js 使用
// 注意：Chrome 擴充功能的 content script 不使用 ES6 模組
// 這些函數會直接在全域作用域中可用
