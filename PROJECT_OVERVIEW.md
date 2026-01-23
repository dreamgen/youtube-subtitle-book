# 專案總覽 V2.0

## 📌 專案目標

將 YouTube 影片中的硬編碼字幕轉換成可翻頁閱讀的電子書格式，讓使用者能夠：
- 一次看到多行連續字幕
- 快速閱讀文字內容
- 不需要盯著影片下方的單行字幕區域
- 儲存並管理多個字幕段落
- 導出為 PDF 或有聲書格式

## 🎯 核心概念

傳統看法：
```
[影片播放] → 字幕一行一行出現 → 需要不斷閱讀底部
```

我們的方法：
```
[截取N秒字幕] → 組合成一頁 → 全螢幕顯示 → 翻頁+播放音訊
              ↓
         儲存到書庫 → PDF/有聲書導出
```

## 🏗️ V2.0 技術架構

### 1. Manifest V3 架構

```
┌─────────────────────────────────────────────────────────────┐
│                      Chrome Extension                        │
├─────────────────────────────────────────────────────────────┤
│  manifest.json (V3)                                         │
│  ├── permissions: storage, tabs, sidePanel, unlimitedStorage│
│  ├── background: service_worker (background.js)            │
│  └── side_panel: default_path (sidepanel.html)              │
└─────────────────────────────────────────────────────────────┘
```

### 2. Side Panel 架構

```
┌──────────────────┐     ┌──────────────────┐
│   Side Panel     │     │   YouTube Tab    │
│  (sidepanel.js)  │◄───►│   (content.js)   │
├──────────────────┤     ├──────────────────┤
│ • 參數設定       │     │ • 影片控制       │
│ • 開始/停止製作   │     │ • 截圖擷取       │
│ • 進度顯示       │     │ • 頁面組合       │
│ • 書庫管理       │     │ • 預覽顯示       │
└──────────────────┘     └──────────────────┘
         │                        │
         └────────┬───────────────┘
                  ▼
         ┌──────────────────┐
         │  Chrome Storage   │
         │   (local)         │
         ├──────────────────┤
         │ • captureData     │
         │ • savedSegments   │
         │ • liveCapture     │
         │ • settings        │
         └──────────────────┘
```

### 3. 雙視窗協作機制 (Dual-Tab Architecture)

```
┌─────────────────────────────────────────────────────────────┐
│                    Capture Flow                              │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌─────────────┐         ┌─────────────┐                    │
│  │ YouTube Tab │         │ Reader Tab  │                    │
│  │ (Capture)   │         │ (Display)   │                    │
│  └──────┬──────┘         └──────┬──────┘                    │
│         │                       │                            │
│         │   截圖資料            │   顯示/編輯                │
│         ▼                       ▼                            │
│  ┌──────────────────────────────────────────┐               │
│  │           Chrome Storage                  │               │
│  │  • liveCapture: 即時截圖資料              │               │
│  │  • segment_*: 已儲存段落                  │               │
│  └──────────────────────────────────────────┘               │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 4. 模組分離

```
youtube-subtitle-book-v2/
│
├── 🎛️ 控制層
│   ├── background.js        # Service Worker
│   ├── sidepanel.js         # 側邊面板邏輯
│   └── sidepanel.html       # 側邊面板 UI
│
├── 📷 核心層
│   ├── content.js           # 截圖、組合核心
│   └── subtitleDetection.js # 智慧偵測模組
│
├── 📖 顯示層
│   ├── reader.js            # 閱讀器邏輯
│   ├── reader.html          # 閱讀器 UI
│   └── reader.css           # 閱讀器樣式
│
├── 📚 管理層
│   ├── library.js           # 書庫管理
│   ├── library.html         # 書庫 UI
│   ├── all-libraries.js     # 全部書庫
│   └── all-libraries.html   # 全部書庫 UI
│
└── 🎨 樣式層
    ├── theme.css            # 共用主題
    └── content.css          # 影片頁樣式
```

## 🔧 核心功能實現

### 截圖機制 (content.js)

```javascript
核心流程：
for (每個時間點) {
  1. video.currentTime = 目標時間
  2. video.playbackRate = 2.0 (加速)
  3. video.muted = true (靜音)
  4. 等待影片載入該時間點
  5. 使用 Canvas API 截取字幕區域
  6. 將截圖轉為 Base64 儲存
  7. 寫入 chrome.storage.local
}
```

### 智慧偵測 (subtitleDetection.js)

```javascript
智慧擷取流程：
while (播放中) {
  1. 每 200ms 擷取中央檢測區域
  2. 對比前後兩張圖片像素差異
  3. 如果差異 > 靈敏度閾值
     → 判定字幕變化，截圖
  4. 過濾非字幕顏色的像素
}
```

### 書庫管理 (library.js)

```javascript
功能列表：
• loadSegments()      - 載入所有段落
• filterAndRender()   - 搜尋過濾
• sortSegments()      - 排序
• batchDelete()       - 批次刪除
• batchExportPdf()    - PDF 合併導出
• batchExportHtml()   - 有聲書導出
• exportAllSegments() - 資料備份
• importSegments()    - 資料還原
```

## 📊 資料結構

### captureData（截圖資料）

```javascript
captureData = {
  videoTitle: "影片標題",
  videoDuration: 600,  // 秒
  linesPerPage: 5,
  screenshots: [
    { 
      id: "timestamp_random", // 唯一 ID
      time: 0, 
      imageData: "data:image/png;base64,...",
      upperImageData: "..." // 上方字幕（可選）
    },
    ...
  ],
  pages: [
    {
      pageNumber: 1,
      startTime: 0,
      endTime: 10,
      screenshots: [...]
    },
    ...
  ]
}
```

### savedSegments（書庫索引）

```javascript
savedSegments = [
  {
    key: "video_timestamp",
    videoId: "xxxxxxxxxxx",
    videoTitle: "影片標題",
    savedAt: "2026-01-23T12:00:00Z",
    pageCount: 20,
    startTime: 0,
    endTime: 120
  },
  ...
]
```

### segment_*（段落完整資料）

```javascript
// chrome.storage.local.get(['segment_video_timestamp'])
{
  videoTitle: "影片標題",
  screenshots: [...],
  pages: [...]
}
```

## 🎨 UI/UX 設計原則

### Side Panel 介面
- **簡潔**：基本設定直接顯示，進階設定摺疊
- **清晰**：滑桿即時顯示數值
- **回饋**：Toast 通知操作結果
- **固定**：底部按鈕始終可見

### 閱讀器介面
- **專注**：深色背景減少干擾
- **舒適**：適當間距和字體大小
- **直覺**：明顯的導航與控制按鈕
- **靈活**：完整編輯功能

### 書庫介面
- **統一**：列表式顯示所有段落
- **效率**：批次選取與操作
- **直觀**：右鍵或按鈕操作

## 💡 創新點

1. **Side Panel**：利用 Chrome 原生側邊面板，操作空間更大
2. **智慧偵測**：不依賴固定間隔，偵測字幕變化時才截圖
3. **書庫系統**：統一管理所有製作的字幕電子書
4. **多格式導出**：PDF、HTML 有聲書、JSON 備份
5. **即時預覽**：製作過程中可即時閱讀已完成頁面

## ⚡ 效能考量

### 記憶體使用
```
單張截圖（1920x108 PNG）≈ 80KB
10分鐘影片（間隔2秒）= 300張 ≈ 24MB
30分鐘影片（間隔2秒）= 900張 ≈ 72MB
```

### 儲存優化
- 使用 `unlimitedStorage` 權限
- 大型資料分片儲存
- 解決 64MB 訊息限制

### 處理時間
```
截圖速度 ≈ 1-2張/秒（取決於影片載入速度）
智慧模式可能更快（跳過無變化區間）
10分鐘影片 ≈ 5-10分鐘處理時間
```

## 🚀 未來擴展方向

### 近期（v2.1）
- [ ] 鍵盤快捷鍵支援
- [ ] 字幕去重功能
- [ ] 閱讀進度記憶

### 中期（v2.x）
- [ ] OCR 文字提取
- [ ] 搜尋功能
- [ ] 書籤系統

### 長期（v3.0）
- [ ] 雲端同步
- [ ] 多語言介面
- [ ] 影片片段下載

## 🔍 已知限制

1. **字幕類型限制**
   - ✅ 硬編碼字幕（burned-in subtitles）
   - ❌ YouTube CC 字幕

2. **效能限制**
   - 長影片處理時間較長
   - 大量截圖佔用儲存空間

3. **相容性**
   - Chrome 114+ （Side Panel API）
   - Manifest V3 支援

4. **使用限制**
   - 需手動調整字幕區域位置
   - 部分影片字幕位置不同

## 📄 授權

MIT License - 自由使用、修改、分發
