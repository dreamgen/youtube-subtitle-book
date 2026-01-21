# 專案檔案清單

## 📂 完整檔案結構

```
youtube-subtitle-book/
│
├── 📘 文件檔案 (Documentation)
│   ├── START_HERE.md          (4.6 KB) - 🌟 從這裡開始！
│   ├── QUICK_START.md         (2.6 KB) - 快速開始指南
│   ├── README.md              (4.7 KB) - 完整說明文件
│   ├── INSTALLATION.md        (4.3 KB) - 安裝疑難排解
│   ├── TEST_CHECKLIST.md      (4.7 KB) - 測試檢查清單
│   ├── PROJECT_OVERVIEW.md    (5.9 KB) - 技術架構說明
│   └── FILES.md               (本檔案) - 檔案清單
│
├── ⚙️ 核心程式碼 (Core Code)
│   ├── manifest.json          (745 B)  - Chrome擴充功能配置
│   ├── popup.html             (2.5 KB) - 控制面板UI
│   ├── popup.js               (2.3 KB) - 控制面板邏輯
│   ├── content.js             (6.5 KB) - 核心功能（截圖、組合、閱讀器）
│   └── content.css            (2.4 KB) - 閱讀器樣式
│
├── 🛠️ 工具檔案 (Tools)
│   └── create-icons.html      (2.8 KB) - 圖示產生工具
│
└── 🖼️ 圖示檔案 (Icons) - 需要自行產生
    ├── icon16.png             (需產生) - 16x16 圖示
    ├── icon48.png             (需產生) - 48x48 圖示
    └── icon128.png            (需產生) - 128x128 圖示
```

**總大小**: ~33 KB (不含圖示)

---

## 📄 檔案功能說明

### 文件檔案

#### START_HERE.md 🌟
- **用途**: 專案入口，快速導航
- **適合**: 第一次接觸專案的人
- **內容**: 快速開始步驟、文件索引、功能預覽

#### QUICK_START.md
- **用途**: 5分鐘快速教學
- **適合**: 想立即使用的人
- **內容**: 安裝步驟、基本使用、測試建議

#### README.md
- **用途**: 完整說明文件
- **適合**: 想全面了解功能的人
- **內容**: 功能特色、使用方式、技術原理、疑難排解

#### INSTALLATION.md
- **用途**: 詳細安裝指南
- **適合**: 遇到安裝問題的人
- **內容**: 多種安裝方法、疑難排解、驗證步驟

#### TEST_CHECKLIST.md
- **用途**: 功能測試清單
- **適合**: 想驗證功能是否正常的人
- **內容**: 完整測試項目、檢查清單、結果記錄表

#### PROJECT_OVERVIEW.md
- **用途**: 技術架構文件
- **適合**: 開發者、想修改程式的人
- **內容**: 架構設計、資料結構、擴展方向、技術細節

---

### 核心程式碼

#### manifest.json
```json
Chrome擴充功能的配置檔案
定義：
- 擴充功能名稱和版本
- 權限需求
- Content Scripts
- 圖示檔案路徑
```

#### popup.html
```html
控制面板的UI結構
包含：
- 參數設定表單
- 按鈕
- 進度條
- 狀態訊息區域
```

#### popup.js
```javascript
控制面板的邏輯
負責：
- 接收使用者輸入
- 發送訊息到content script
- 顯示進度更新
- 開啟閱讀器按鈕控制
```

#### content.js ⭐ 核心
```javascript
主要功能實作
包含：
- startCapture() - 截圖主流程
- createPages() - 組合頁面
- openViewer() - 開啟閱讀器
- 資料儲存和管理
```

**關鍵函數**：
- `startCapture(config)` - 控制整個截圖流程
- `createPages(linesPerPage)` - 將截圖組合成頁面
- `openViewer()` - 建立並顯示全螢幕閱讀器
- `updateProgress(progress, message)` - 更新進度

#### content.css
```css
閱讀器的視覺樣式
定義：
- 全螢幕覆蓋層樣式
- 閱讀器容器布局
- 按鈕樣式
- 捲動條樣式
```

---

### 工具檔案

#### create-icons.html
```html
獨立的圖示產生工具
功能：
- 產生三個尺寸的PNG圖示
- 紅色背景 + 白色"YT"文字
- 自動下載檔案
- 預覽功能
```

**使用方式**：
直接用瀏覽器開啟，點擊按鈕即可產生圖示

---

### 圖示檔案（需產生）

#### icon16.png
- **尺寸**: 16x16 像素
- **用途**: 擴充功能工具列小圖示
- **格式**: PNG

#### icon48.png
- **尺寸**: 48x48 像素
- **用途**: 擴充功能管理頁面
- **格式**: PNG

#### icon128.png
- **尺寸**: 128x128 像素
- **用途**: Chrome Web Store（如果發布）
- **格式**: PNG

---

## 🔄 檔案依賴關係

```
manifest.json
    ├─→ popup.html
    │       └─→ popup.js
    │
    ├─→ content.js
    │       └─→ content.css
    │
    └─→ icon*.png (需產生)

create-icons.html (獨立工具，無依賴)
```

---

## 📊 檔案重要性排序

### 🔴 必要檔案（缺一不可）
1. manifest.json - 擴充功能配置
2. content.js - 核心功能
3. popup.html - 控制面板
4. popup.js - 控制邏輯
5. icon*.png - 圖示（需產生）

### 🟡 重要檔案（影響體驗）
6. content.css - 閱讀器樣式
7. START_HERE.md - 入門指南

### 🟢 輔助檔案（幫助理解）
8. QUICK_START.md - 快速開始
9. README.md - 完整說明
10. create-icons.html - 圖示工具

### ⚪ 參考檔案（進階使用）
11. INSTALLATION.md - 安裝疑難排解
12. TEST_CHECKLIST.md - 測試清單
13. PROJECT_OVERVIEW.md - 技術文件
14. FILES.md - 本檔案

---

## 📝 修改建議

### 想調整UI樣式？
→ 修改 `content.css` 和 `popup.html`

### 想改變截圖邏輯？
→ 修改 `content.js` 中的 `startCapture()` 函數

### 想調整參數選項？
→ 修改 `popup.html` 中的 `<select>` 選項

### 想改變閱讀器布局？
→ 修改 `content.js` 中的 `openViewer()` 函數

---

## 🚀 快速定位

**我想...**

- 了解專案 → START_HERE.md
- 立即使用 → QUICK_START.md
- 解決安裝問題 → INSTALLATION.md
- 測試功能 → TEST_CHECKLIST.md
- 修改程式碼 → PROJECT_OVERVIEW.md + content.js
- 調整樣式 → content.css
- 產生圖示 → create-icons.html

---

## ✅ 完整性檢查

使用此清單確認所有檔案都已準備好：

- [ ] manifest.json
- [ ] popup.html
- [ ] popup.js
- [ ] content.js
- [ ] content.css
- [ ] create-icons.html
- [ ] START_HERE.md
- [ ] QUICK_START.md
- [ ] README.md
- [ ] INSTALLATION.md
- [ ] TEST_CHECKLIST.md
- [ ] PROJECT_OVERVIEW.md
- [ ] FILES.md
- [ ] icon16.png (需產生)
- [ ] icon48.png (需產生)
- [ ] icon128.png (需產生)

**共 16 個檔案**（13個已有 + 3個需產生）

---

**下一步**: 開啟 [START_HERE.md](START_HERE.md) 開始使用！
