# Code Index

這份文件給人類與 AI 快速建立專案心智模型用。

目標：
- 不用每次從頭到尾讀完整個 repo
- 先知道主要入口、狀態核心、功能模組、子專案邊界
- 後續只打開和任務直接相關的檔案

## 專案定位

這個 repo 主要是一個以 `React + Vite` 建成的影片教學 / 診斷編輯器，核心能力包含：
- 錄製螢幕、音訊、Webcam 與眼動框資訊
- 編輯時間軸上的影片、音訊、字幕、轉場
- 用多種 AI provider 生成字幕、文章、語音
- 產出 `Web 診斷報告` 與 `UX 研究報告`
- 匯出 Markdown、截圖、字幕、原始素材、專案 JSON、合成影片

另外這個 repo 還包含兩個周邊系統：
- `public/` 下的瀏覽器 extension 腳本
- `desktop-click-ripple/` 的 Electron 桌面紅圈工具

## 高層架構

```text
src/main.jsx
  -> src/App.jsx                       主入口，幾乎所有 UI 與 workflow 編排都在這裡
     -> src/hooks/useAiTaskState.jsx   AI 任務狀態管理
     -> src/constants/appConstants.js  全域常數、預設值、模型/模式選項
     -> src/lib/*                      純函式工具：project/render/media/subtitle/article/provider/uiDebug
     -> src/skills/*                   不同工作模式的設定描述
     -> src/components/modals/SettingsModal.jsx

public/
  -> manifest.json + background.js     Chrome extension 入口

desktop-click-ripple/
  -> main.cjs                          Electron 桌面紅圈 overlay
```

## 先讀順序

如果之後 AI 要理解專案，建議優先順序：

1. `src/App.jsx`
2. `src/lib/projectState.js`
3. `src/hooks/useAiTaskState.jsx`
4. `src/constants/appConstants.js`
5. 依任務再選讀對應 `src/lib/*`
6. 依模式再讀 `src/skills/*`
7. 若任務跟 extension 或桌面紅圈有關，再讀 `public/*` 或 `desktop-click-ripple/*`

## 主要檔案與責任

### 1. App / UI 編排層

#### `src/App.jsx`
- 專案絕對核心，約 `10395` 行，屬於超大型 orchestrator
- 同時負責：
  - 錄影流程
  - 專案狀態更新
  - 時間軸編輯
  - 預覽與 render
  - AI 字幕 / 文章 / 語音
  - Web 診斷
  - UX 研究
  - 匯出流程
  - 大部分 UI rendering
- 如果要改使用者流程、按鈕行為、時間軸互動、AI 串接流程，通常都要先看這裡

可以把它理解成 7 個區塊：
- `recording`: 螢幕 / webcam / audio 錄製與預覽合成
- `project state`: 對 `tracks / audioTracks / subtitles / assets` 的操作
- `timeline editor`: 拖拉、對齊、剪輯、轉場、字幕編輯
- `ai workflows`: 字幕、文章、語音、Web 診斷、UX 研究
- `preview/render`: canvas 預覽與輸出影片
- `export/import`: 匯出素材、Markdown、JSON；讀回專案
- `mode-specific panels`: tutorial / column / ui-debug / ux-research 的右側工具面板

### 2. 狀態核心

#### `src/lib/projectState.js`
- 專案資料模型核心，約 `470` 行
- 主要責任：
  - 建立空專案 `createEmptyProjectState()`
  - 定義 AI 任務狀態初始值
  - 正規化 clip / subtitle / ken burns / project state
  - 建立 AI 字幕用的 timeline snapshot
  - 匯出時補上 media filename metadata
- 任何碰到「project JSON 長什麼樣」或「為什麼 state 會被補值」的問題，先看這裡

`projectState` 重要欄位：
- `tracks`: 3 軌視訊/圖片時間軸
- `videoTransitions`: 各視訊軌的轉場
- `audioTracks`: 2 軌音訊
- `subtitles`: 字幕資料
- `subtitleTransitions`: 字幕轉場
- `assets`: 素材庫
- `tutorialMD / columnTopicMD / uiDebugMD / uxResearchMD`: 各模式輸出的 Markdown
- `uiDebugReport / uxResearchReport / compositeTutorialReport`: 結構化分析結果
- `capturedFrames / uiDebugFrames / uxResearchFrames`: 對應模式的截圖快照

#### `src/hooks/useAiTaskState.jsx`
- AI 任務的 UI 狀態集中管理，約 `354` 行
- 管理：
  - `subtitle`
  - `article`
  - `voice`
  - `ui-debug`
  - `ux-research`
- 提供：
  - 任務開始 / 完成 / 取消
  - 各任務 status patch 更新
  - 從既有 project state 回推 status 的能力
- 如果你要改進度條、狀態卡、取消邏輯，先看這裡

### 3. 設定與模式定義

#### `src/constants/appConstants.js`
- 全域設定與預設值來源
- 包含：
  - AI provider 預設設定
  - timeline / render 常數
  - 字幕樣式與字型
  - 轉場 preset
  - UI debug / UX research threshold 預設值
  - provider tabs 與模型選項
- 想找預設 endpoint、模型名稱、UI 限制值，先看這裡

#### `src/skills/index.js`
- 註冊所有模式
- `DEFAULT_SKILL_ID = 'tutorial'`

#### `src/skills/tutorial/skill.js`
- 傳統步驟教學模式
- AI 會走字幕 -> 文章 -> 語音的教學工作流

#### `src/skills/composite-tutorial/skill.js`
- 混合素材教學模式
- 支援螢幕錄影 + 實拍 + PIP + 疊層說明

#### `src/skills/column-topic/skill.js`
- 專欄模式
- 不依賴 click ripple，偏內容理解與第一人稱文章輸出

#### `src/skills/ui-debug/skill.js`
- Web 診斷模式
- 定義檢查項目與 threshold

#### `src/skills/ux-research/skill.js`
- UX 研究模式
- 定義研究欄位、presets 與 threshold

### 4. 工具函式層 `src/lib/`

#### `src/lib/providerUtils.js`
- AI provider 抽象層的小型工具
- 處理：
  - provider label
  - feature 對應 provider
  - provider 對應模型顯示
  - Ollama URL / timeout 正規化

#### `src/lib/subtitleUtils.js`
- 字幕與 AI 輸出文本正規化
- 處理：
  - subtitle 樣式與座標 clamp
  - scene / role / relation type 正規化
  - composite subtitle 合成
  - ui-debug / ux-research marker 字幕建立

#### `src/lib/renderUtils.js`
- 預覽與 render 畫面用工具
- 處理：
  - 內建轉場資產
  - transition state 計算
  - Ken Burns 動畫
  - canvas 上繪製媒體與字幕

#### `src/lib/mediaUtils.js`
- 媒體持久化與 frame 品質分析
- 處理：
  - IndexedDB 儲存 blob
  - 專案 reopen 後 media rehydrate
  - 匯出資料夾 relink
  - screenshot frame 品質評分與挑選

#### `src/lib/articleUtils.js`
- 文章 prompt / title 清理
- 用來避免把使用者 prompt 雜訊直接當成文章標題或主題

#### `src/lib/uiDebugUtils.js`
- Web 診斷與報告格式化工具
- 處理：
  - Markdown table 組裝
  - browser / os parsing
  - issue evidence log
  - module-specific recommendations
  - frame 視覺變化分析

### 5. 元件層

#### `src/components/modals/SettingsModal.jsx`
- AI 與專案設定視窗
- 負責編輯各 provider 的 key / endpoint / model
- 也能 refresh LM Studio / Ollama model catalog
- 屬於設定 UI，本身邏輯不算全域狀態核心

### 6. 瀏覽器 Extension

#### `public/manifest.json`
- Chrome extension manifest v3
- 權限重點：
  - `storage`
  - `scripting`
  - `tabCapture`
  - `tabs`
  - `activeTab`

#### `public/background.js`
- extension service worker，約 `145` 行
- 主要責任：
  - 點 extension icon 時開 `index.html`
  - 依設定把 `page-debug-bridge.js` / `click-ripple-content.js` 注入頁面
  - 維護 `clickRippleEnabled` / `pageDebugEnabled`
  - 在分頁更新時自動重新注入腳本

#### `public/page-debug-bridge.js`
- 頁面診斷橋接腳本
- 作用應該是把 page 端事件 / console / network / performance 訊號送回工具

#### `public/click-ripple-content.js`
- 頁面上的點擊紅圈視覺腳本
- 主要支援教學錄影與 click 對位流程

### 7. 桌面紅圈子專案

#### `desktop-click-ripple/main.cjs`
- Electron 主程序，約 `191` 行
- 主要責任：
  - 每個螢幕建立透明 overlay window
  - 用 `uiohook-napi` 監聽全域滑鼠點擊
  - 在對應螢幕送出 ripple event
  - 提供 tray menu 與快捷鍵切換

#### `desktop-click-ripple/preload.cjs`
- 安全地把 IPC 暴露給 renderer

#### `desktop-click-ripple/renderer/*`
- 純前端 overlay 畫面
- 負責顯示 ripple 動畫，不碰主編輯器邏輯

## 重要資料流

### A. 錄影到專案

```text
使用者開始錄影
  -> App 取得 screen / webcam / audio streams
  -> MediaRecorder 錄成 blob
  -> 存入 assets / tracks / audioTracks
  -> projectState 更新 recordingSessionId / recordingRange
  -> 之後 AI / 診斷流程可依這段資料分析
```

### B. AI 字幕 / 文章 / 語音

```text
projectState + active skill + settings
  -> App 組 prompt / frames / timeline snapshot
  -> providerUtils 決定用哪個 provider/model
  -> AI 回傳結果
  -> projectState 寫入 subtitles / markdown / audio clips / 報告
  -> useAiTaskState 更新狀態卡
```

### C. Web 診斷 / UX 研究

```text
extension 注入頁面腳本
  -> 收集 click / console / network / performance / page 訊號
  -> App 依 recordingSessionId 與時間範圍篩資料
  -> frame 擷取 + rule-based 分析
  -> 視需要再交給 AI 做高階摘要
  -> 產出 report + markdown + marker subtitles
```

### D. 匯出

```text
projectState
  -> 匯出字幕 srt
  -> 匯出 markdown + screenshots
  -> 匯出 raw media / audio
  -> 匯出 project json
  -> 可選擇 render 合成影片
```

## 目錄快速導覽

建議忽略這些目錄或檔案，除非任務直接相關：
- `node_modules/`
- `dist/`
- `*.zip`

平常最常需要看的目錄：
- `src/`
- `public/`
- `desktop-click-ripple/`

## 常見任務對應檔案

如果要改錄影流程：
- `src/App.jsx`
- `public/background.js`
- `public/click-ripple-content.js`

如果要改時間軸 / clip / subtitle 行為：
- `src/App.jsx`
- `src/lib/projectState.js`
- `src/lib/subtitleUtils.js`
- `src/lib/renderUtils.js`

如果要改 AI provider / model / endpoint：
- `src/components/modals/SettingsModal.jsx`
- `src/constants/appConstants.js`
- `src/lib/providerUtils.js`

如果要改 Web 診斷：
- `src/App.jsx`
- `src/lib/uiDebugUtils.js`
- `src/skills/ui-debug/skill.js`
- `public/page-debug-bridge.js`

如果要改 UX 研究：
- `src/App.jsx`
- `src/skills/ux-research/skill.js`
- `src/lib/subtitleUtils.js`

如果要改桌面紅圈：
- `desktop-click-ripple/main.cjs`
- `desktop-click-ripple/preload.cjs`
- `desktop-click-ripple/renderer/renderer.js`

## AI 閱讀策略建議

之後如果 AI 要處理任務，建議先做這件事：

1. 先讀 `code_index.md`
2. 判斷任務屬於哪個區塊
3. 只打開該區塊的入口檔與對應 util
4. 若需要調整資料結構，再補讀 `src/lib/projectState.js`
5. 若需要動到模式差異，再補讀 `src/skills/*`

避免：
- 一開始就全讀 `src/App.jsx` 以外的所有檔案
- 把 `dist/` 或 `node_modules/` 當作理解來源
- 在不了解 active skill 的情況下直接改 export / AI 流程

## 補充觀察

- 目前 `src/App.jsx` 非常大，已經同時扮演 container、domain workflow、render controller、timeline editor 與 export coordinator
- 若未來要提升可維護性，最值得拆分的方向通常會是：
  - recording workflow
  - timeline editing logic
  - AI workflow services
  - ui-debug / ux-research analyzers
  - export pipeline

