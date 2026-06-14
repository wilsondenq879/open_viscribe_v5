# AI Tutorial Video Editor 重建 Prompt

以下是一份給其他開發者或 AI Coding Agent 使用的高保真提示詞。目標不是做「類似產品」，而是要重建出和目前這個專案在功能、操作流程、畫面配置、資料模型、檔案結構、命名風格與匯出行為都極度接近的版本。

---

## 可直接使用的 Prompt

你要建立一個名為 `video_rec_editor` 的專案，技術棧必須是 `React 18 + Vite + Tailwind CSS + Chrome/Edge Extension Manifest V3`。這不是一般網站，而是一個運行在瀏覽器擴充套件中的「AI 教學影片錄製與編輯工作室」。

### 最高原則

1. 不要做簡化版。
2. 不要只做概念 demo。
3. 不要改成別的 UI 風格。
4. 不要把功能拆掉。
5. 不要自創新流程取代既有流程。
6. 要保留目前專案的深色工作室介面、三軌影片、兩軌音訊、一軌字幕、素材庫、AI 工具欄、設定彈窗、匯出彈窗、全域點擊紅圈、教學文章、AI 字幕、AI 語音、專案匯入匯出。
7. 目標是讓熟悉原專案的人打開後，覺得操作路徑、區塊分布、用途與結果幾乎一樣。

### 專案結構必須接近以下形式

```text
video_rec_editor/
  public/
    manifest.json
    background.js
    click-ripple-content.js
  src/
    App.jsx
    main.jsx
    index.css
  index.html
  package.json
  vite.config.js
  tailwind.config.js
  postcss.config.js
  build.sh
  readme.md
```

### 必須使用的核心依賴

- react
- react-dom
- vite
- @vitejs/plugin-react
- tailwindcss
- postcss
- autoprefixer
- lucide-react

### 擴充套件設定要求

Manifest 必須是 `manifest_version: 3`，名稱為 `AI Tutorial Video Editor`，描述為 AI-powered screen recording and tutorial video editor。需要以下權限：

- `storage`
- `scripting`
- `tabCapture`
- `tabs`
- `activeTab`

需要：

- `action.default_title`
- `background.service_worker = background.js`
- 全域 `content_scripts`
- `matches: <all_urls>`
- `all_frames: true`
- `run_at: document_start`
- `host_permissions: <all_urls>`

### 背景腳本要求

`background.js` 要做兩件事：

1. 使用者點擊擴充套件圖示時，開啟 `chrome.runtime.getURL('index.html')`。
2. 當 `chrome.storage.local` 的 `clickRippleEnabled` 變成 `true` 時，把 `click-ripple-content.js` 注入所有已開啟分頁。

### Content Script 要求

`click-ripple-content.js` 必須：

1. 監聽全域 click 事件。
2. 在頁面點擊位置畫出大顆、紅色、帶白色外暈、會放大並漸隱的圓形漣漪。
3. 漣漪大約是 54px，邊框約 7px，顏色偏亮紅。
4. 動畫時間約 1300ms。
5. 蒐集以下資訊寫入 `chrome.storage.local.clickEventLog`：
   - id
   - sessionId
   - epochMs
   - x
   - y
   - viewportW
   - viewportH
   - targetText
   - href
6. `targetText` 不能亂猜，要盡量從：
   - `aria-label`
   - `title`
   - `innerText`
   - `textContent`
   中找出最像按鈕或可點元素的真實文字。
7. 需要支援 `clickRippleEnabled` 與 `clickRippleSessionId` 的即時同步。

### 主畫面整體外觀

整個介面是深色主題，像影片剪輯工作室：

- 背景主色為深灰黑色系
- 整體使用 Tailwind utility class 寫法
- 頂部有藍色提醒列
- 再下面是灰黑色 header
- 中間主體分三欄
  - 左欄：工具與 AI 操作面板，寬約 288px
  - 中間：預覽播放器區
  - 右欄：可收合素材庫，展開寬約 256px
- 最下方是可拉高拉低的時間軸區

### 頂部提醒列

頂部要有一條藍底提醒列，文字說明：

- 全域點擊紅圈已改為開關控制
- 請到右上角設定啟用

右側有一顆圓角膠囊按鈕，可切換：

- `全域紅圈：開啟`
- `全域紅圈：關閉`

### Header 要求

Header 左側：

- 藍色方塊 icon 容器
- 裡面是 `MonitorPlay`
- 標題文字：`AI Tutorial Video Editor v2`

Header 右側按鈕群：

- 開始錄影 / 停止錄影
- 匯入專案
- 暫存
- 清空
- 設定
- 匯出選項

開始錄影按鈕要是紅色，停止錄影是深灰但文字偏紅。

### 左側工具面板

預設顯示「專案工具 & AI」。

內容順序要接近：

1. 輸出模式與影片介紹
2. 一個 textarea，讓使用者輸入影片提示詞、功能重點、文章 brief、連結
3. AI 智慧生成區
4. `AI字幕` 按鈕
5. AI字幕狀態卡
6. `生成文章` 按鈕
7. 文章生成結果卡
8. `AI 自動語音生成` 按鈕
9. 語音生成結果卡

狀態卡需要可展開收合，顯示：

- message
- detail
- 統計數字
- 最後更新時間

### 中央預覽區

預覽區必須是 `16:9` 的黑色畫布容器，支援：

- 影片片段顯示
- 圖片片段顯示
- 片段定位與縮放
- Ken Burns 預覽
- 過場動畫預覽
- 字幕疊加顯示
- 可直接用滑鼠拖曳字幕位置
- 已選取片段要出現橘色外框與四角控制點

底部要有浮動控制列，含：

- 播放 / 暫停
- 目前時間 / 總長度

### 右側素材庫

右側要有一個可收合的素材庫欄位，標題為 `素材庫 Branding`。

上方有資料夾按鈕可以匯入本機檔案。

內容分兩個 tab：

- `過場`
- `素材`

過場項目可拖曳到：

- 任一影片軌
- 字幕軌

素材項目可拖曳到：

- 影片軌
- 音訊軌

### 時間軸要求

時間軸是本專案最重要的區塊，必須包含：

1. 最上方時間尺
2. 一條字幕軌
3. 三條影片軌，從上到下 index 實際渲染順序要是 `[2,1,0]` 視覺排列
4. 兩條音訊軌
5. 播放頭垂直線
6. 可框選多個片段
7. 可拖曳移動
8. 可調整左右長度
9. 可跨軌拖曳
10. 支援吸附到其他片段頭尾與播放頭

時間軸基準：

- `PIXELS_PER_SECOND = 50`
- `TIMELINE_OFFSET = 20`

### 編輯側欄切換規則

當選取不同類型內容時，左側面板要切換成對應編輯器：

- 多選一般片段：顯示批次刪除
- 選字幕：顯示字幕文字與樣式編輯
- 多選字幕：顯示批次樣式調整
- 選過場：顯示過場長度設定
- 選影片 / 圖片：顯示片段資訊、播放速度、Ken Burns 編輯
- 選音訊：顯示音量、淡入、淡出、播放速度

### 字幕樣式要求

預設字幕風格：

- fontSize: 16
- fontFamily: Arial
- textColor: `#ffffff`
- backgroundColor: `#000000`
- backgroundOpacity: `0.8`
- x: `50`
- y: `88`

字幕要是：

- 置中對齊
- 粗體
- 圓角底色框
- 可多行
- 帶陰影感

字型選項要至少有：

- Arial
- Helvetica
- Georgia
- Times New Roman
- Verdana
- Trebuchet MS
- Noto Sans TC
- Microsoft JhengHei

### 內建過場

必須內建以下過場：

- fade
- slide-left
- slide-right
- zoom-in
- wipe-up

且在素材庫中以彩色圓點和中文名稱顯示：

- 淡入
- 左滑入
- 右滑入
- 縮放淡入
- 上推擦拭

### Ken Burns 功能

對影片或圖片片段，必須能設定：

- enabled
- easing
- start.scale / start.x / start.y
- end.scale / end.x / end.y

預設 preset 要有：

- 慢速推近
- 慢速拉遠
- 由左到右
- 由右到左
- 由上到下
- 由下到上

### 錄影功能要求

錄影流程要使用：

- `navigator.mediaDevices.getDisplayMedia`
- `MediaRecorder`

設定包含：

- 1080p 或 720p
- 可選是否錄製音訊
- frame rate 30fps

停止錄影後：

1. 產生 blob
2. 存入 IndexedDB
3. 建立 object URL
4. 加入第一條影片軌
5. 同時加入素材庫
6. 更新 recordingRange

若 `getDisplayMedia` 失敗，要進入 mock recording 模式：

- 建立 canvas
- 畫深色背景
- 顯示「模擬操作畫面 (Mock Recording)」
- 畫一個會移動的白色滑鼠游標
- 用 `canvas.captureStream(30)` 模擬錄影

### 儲存層要求

需要三層儲存：

1. `localStorage`
   - `extension_settings`
   - `wilson_project_draft`
2. `chrome.storage.local`
   - `clickRippleEnabled`
   - `clickRippleSessionId`
   - `clickEventLog`
3. `IndexedDB`
   - DB 名稱 `WilsonEditorDB`
   - store 名稱 `media_blobs`

### Project State 結構

必須有一個集中式專案狀態，至少包含：

```js
{
  tracks: [[], [], []],
  videoTransitions: [[], [], []],
  audioTracks: [[], []],
  subtitles: [],
  subtitleTransitions: [],
  assets: [],
  tutorialDescription: '',
  tutorialMD: '',
  capturedFrames: [],
  recordingRange: { startEpochMs: null, endEpochMs: null }
}
```

### Undo / Redo

必須支援：

- Undo
- Redo
- 歷史上限 50 筆
- 拖曳與畫布操作結束後再記錄 snapshot

快捷鍵要支援：

- 空白鍵：播放 / 暫停
- `Cmd/Ctrl + Z`：Undo
- `Cmd/Ctrl + Shift + Z` 或 `Ctrl + Y`：Redo
- `Cmd/Ctrl + B`：分割片段
- `Delete / Backspace`：刪除選取

### AI 設定欄位

設定視窗必須支援：

- AI Provider
  - azure
  - gemini
- API Key
- Model
- Azure Vision Endpoint
- Azure TTS Endpoint
- Azure Vision Key
- Azure TTS Key
- Azure Vision Deployment
- Azure TTS Deployment
- AI 語言預設
  - en
  - zh-TW
- includeAudio
- resolution
- aspectRatio
- clickRippleEnabled

請使用以下預設值：

```js
{
  aiProvider: 'azure',
  apiKey: '',
  model: 'gemini-2.5-flash',
  azureEndpoint: 'https://auto-teaching-resource.openai.azure.com/',
  azureVisionEndpoint: 'https://auto-teaching-resource.openai.azure.com/',
  azureTtsEndpoint: 'https://SWRD-FAS-swedencentral.openai.azure.com/',
  azureDeployment: 'gpt-5.4-mini-wilson',
  azureTtsDeployment: 'tts-wilson',
  azureVisionKey: '',
  azureTtsKey: '',
  temperature: 0.0,
  language: 'en',
  includeAudio: false,
  resolution: '1080p',
  aspectRatio: '16:9',
  clickRippleEnabled: false
}
```

### AI 字幕功能要求

這是本專案最關鍵的智慧功能之一，請高度還原。

流程必須如下：

1. 讀取影片軌上所有 video clips。
2. 讀取 `chrome.storage.local.clickEventLog`。
3. 只挑選落在錄影時間範圍內的 click event。
4. 以 click session 過濾。
5. 依每個 click time 建立多組取樣偏移：
   - `-0.06`
   - `0`
   - `0.08`
   - `0.16`
   - `0.24`
   - `0.4`
   - `0.65`
   - `0.95`
6. 額外每秒擷取一次 mandatory frames。
7. 用 canvas 取樣影像。
8. 計算：
   - clarityScore
   - loadingScore
   - isBlurry
   - isLikelyLoading
9. 偵測點擊附近是否真的有紅色漣漪。
10. 保留高畫質與 AI 用縮圖兩種 base64。
11. 送到 Azure OpenAI Vision 或 Gemini。
12. 要求模型回傳 JSON。
13. 產生字幕後同步到字幕軌。
14. 同時保留 `capturedFrames` 供文章截圖使用。

### AI 字幕 Prompt 約束

模型提示要非常嚴格，核心精神如下：

- 只能根據真實畫面 OCR
- 不能猜按鈕文字
- 不能把沒有發生的操作寫進字幕
- 如果有紅圈點擊文字，就優先直接用那個文字
- 若字幕語言是中文，就統一繁體中文
- 若是英文，就統一英文
- 不要中英夾雜

字幕格式要有：

- id
- clickId
- startAt
- endAt
- text

### 文章生成功能要求

文章生成必須根據：

- 使用者輸入的 `tutorialDescription`
- 已經確認的字幕
- AI 擷取的截圖

輸出為 Markdown，內容包含：

- title
- whatIsIt
- consumerBenefits
- setupGuide
- conclusion

然後組成：

- `# 標題`
- `## 這是什麼？`
- `## 優點`
- `## 快速上手教學`
- `### 步驟 1`
- 對應截圖
- `## 總結評價`

每一個步驟都要能插入對應時間點的截圖，圖片命名形式類似：

- `screenshot_1.jpg`
- `screenshot_2.jpg`

### AI 語音功能要求

根據字幕逐段產生 TTS 音訊。

支援：

- Azure `audio/speech`
- Gemini preview TTS

每段成功後：

1. 轉成 wav 或接收 wav
2. 寫入 IndexedDB
3. 建立 object URL
4. 加入第一條 audio track

音訊片段資料至少包含：

- id
- type: audio
- src
- startAt
- duration
- originalDuration
- playbackRate
- trimStart
- trimEnd
- name
- volume
- fadeIn
- fadeOut

### 匯出功能要求

匯出彈窗要有勾選項目：

- renderVideo
- rawMedia
- includeMarkdown
- includeAudio
- includeSubtitles
- projectJson

匯出行為：

- `subtitles.srt`
- `product_article.md`
- `audio_XX_name.wav`
- `media_1.webm` / `media_2.jpg`
- `project.json`
- `Composed_Tutorial_Video.webm`

若支援 `showDirectoryPicker`，要可寫入資料夾；否則就用下載連結。

### 合成影片渲染要求

必須使用 hidden canvas + `captureStream(30)` + `MediaRecorder`。

渲染要合成：

- 三軌影片 / 圖片
- 字幕
- 過場
- Ken Burns
- 音訊

輸出格式先以 `webm` 為主。

### 匯入專案要求

要能選擇 `project.json` 匯入。

匯入後：

1. 還原 project state
2. 嘗試從 IndexedDB 重建 media url
3. 若仍缺媒體，允許使用者再選匯出資料夾，從對應檔名重新連結

### 互動細節

以下細節不要漏：

- 預覽中的片段可拖曳、縮放
- 字幕可直接在畫布上拖曳
- 多選字幕可一起移動
- 字幕批次樣式設定
- 時間軸框選
- 素材庫可拖曳素材到軌道
- 素材庫可拖曳過場到影片軌與字幕軌
- 音訊預覽要避免每幀硬 seek 造成抖動
- 渲染模式與一般預覽模式要分開控制
- 有狀態卡顯示 AI 執行進度
- 有清楚的 alert 提示使用者目前成功或失敗狀態

### 視覺風格

整體風格請忠於目前專案：

- 深灰、黑、藍、橘色高亮
- 按鈕偏 dashboard / studio 風格
- 不是極簡白底產品頁
- 不是行銷 landing page
- 要像桌面級編輯工作台

### 驗收標準

如果以下任一點沒做到，就不算完成：

1. 可以作為 Chrome / Edge 擴充套件載入。
2. 點擴充套件圖示能打開編輯器。
3. 可以錄影並把結果加入時間軸。
4. 全域紅圈能在網頁上顯示並記錄點擊。
5. 時間軸有三軌影片、兩軌音訊、一軌字幕。
6. 可以拖曳素材與過場。
7. 可以播放、暫停、拖曳、裁切、分割。
8. 可以生成 AI 字幕。
9. 可以生成 Markdown 文章。
10. 可以生成 AI 語音。
11. 可以輸出 `webm / srt / md / json / raw media / audio`。
12. 可以匯回 `project.json`。
13. 視覺布局與操作感接近原專案，而不是完全不同的 UI。

### 最後要求

輸出完整可執行程式碼，不要只給架構說明。請直接建立所有檔案內容，保留合理註解，但不要把程式拆得和需求描述完全不同。除非有必要，主邏輯可以集中在 `src/App.jsx`，以保持與原專案相似的結構與維護方式。

---

## 補充說明

這份 prompt 的用途是讓未來開發者：

- 重新生成相同架構的專案
- 交給 AI agent 協助重構時，仍維持原產品模型
- 在需要複刻 UI / 功能 / 操作方式時有完整基準

如果未來專案功能再擴充，建議同步更新這份文件，避免 prompt 與實際產品逐漸失真。

