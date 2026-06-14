# Composite Tutorial Implementation Gaps

## 目的

這份文件整理目前專案已經支援什麼，以及若要把 `綜合教學影片` 做成 v2 skill，還缺哪些資料流、schema 與 UI 支撐。

## 目前已經有的基礎

### 1. Skill 已存在

專案已經有 [src/skills/composite-tutorial/skill.js](/Users/wilsondenq879/Documents/GitHub/wilsondenq879-gamehub/video_rec_editor/src/skills/composite-tutorial/skill.js)。

代表：

- skill 已經進入 registry
- UI 已經可以切換到 `composite-tutorial`
- 已有專屬 prompt 文案與檢查說明

### 2. AI 字幕流程已經能區分 composite mode

在 [src/App.jsx](/Users/wilsondenq879/Documents/GitHub/wilsondenq879-gamehub/video_rec_editor/src/App.jsx) 裡，`activeSkillId === 'composite-tutorial'` 已經會走不同的 prompt 與 response schema。

目前已經支援的 composite 欄位包含：

- `scene_type`
- `main_action`
- `pip_action`
- `subtitle`
- `click_based`
- `screen_focus`
- `confidence`

### 3. 專案 state 已經有 composite 分析暫存欄位

在 [src/lib/projectState.js](/Users/wilsondenq879/Documents/GitHub/wilsondenq879-gamehub/video_rec_editor/src/lib/projectState.js) 已經有：

- `capturedFrames`
- `tutorialMD`
- `compositeSubtitleAnalysis`

所以它不是從零開始。

## 目前最核心的限制

### 1. Composite 還共用 tutorial 的主資料欄位

目前 [src/skills/composite-tutorial/skill.js](/Users/wilsondenq879/Documents/GitHub/wilsondenq879-gamehub/video_rec_editor/src/skills/composite-tutorial/skill.js) 仍使用：

- `markdownField: 'tutorialMD'`
- `frameField: 'capturedFrames'`

這讓第一版能快速上線，但也代表：

- composite 和 tutorial 的文章輸出沒有真正分流
- composite 的結構化結果無法成為一等資料模型
- 後面要加 `voiceover` 或 `segment` 會比較擠

### 2. AI schema 還是字幕導向，不是 segment 導向

目前在 [src/App.jsx](/Users/wilsondenq879/Documents/GitHub/wilsondenq879-gamehub/video_rec_editor/src/App.jsx) 的 composite schema，回傳主體仍是 `subtitles[]`。

這造成幾個限制：

- 模型被鼓勵輸出逐段字幕，而不是段落事件
- 無法明確表達 `instruction_role`
- 無法明確表達 `relation_type`
- 無法穩定保存 `voiceover` 與 `article_step`

### 3. `compositeSubtitleAnalysis` 目前仍是扁平字幕鏡像

目前存進 state 的 `compositeSubtitleAnalysis` 只保留：

- `startAt`
- `endAt`
- `text`
- `scene_type`
- `main_action`
- `pip_action`
- `click_based`
- `screen_focus`
- `confidence`

也就是說它本質上還是 S2 字幕的附帶 metadata，不是真正的 segment model。

### 4. 文章生成流程還是讀 highlight subtitles

目前在 [src/App.jsx](/Users/wilsondenq879/Documents/GitHub/wilsondenq879-gamehub/video_rec_editor/src/App.jsx) 的 `generateArticleFromSubtitles()`，文章生成仍以排序過的 S2 字幕為主。

這代表：

- `article_step` 沒有獨立來源
- `instruction_role` 還不能影響文章結構
- `setup`、`warning`、`result` 很難被寫成不同段落

### 5. UI 還沒有 composite 專屬分析面板

目前 composite 的結果主要反映在：

- S2 字幕
- `compositeSubtitleAnalysis`

但尚未有像 `ui-debug` 那樣的專屬結果卡片，因此使用者很難直接檢查：

- 哪一段被判成 `screen_recording_with_pip`
- 哪一段的 PIP 被判定為重要
- 哪一段屬於 `setup` 或 `confirmation`

## 建議補的資料模型

第一步不一定要完全改 storage，但建議先把結構想清楚。

```json
{
  "compositeTutorialReport": {
    "segments": [],
    "doc": {},
    "generatedAt": 0,
    "aiProvider": "",
    "aiModel": ""
  }
}
```

其中 `segments[]` 至少應包含：

- `time_start`
- `time_end`
- `scene_type`
- `instruction_role`
- `relation_type`
- `teaching_goal`
- `main_action`
- `pip_action`
- `pip_relevance`
- `subtitle`
- `voiceover`
- `article_step`
- `confidence`

## 建議補的程式變更

### 第一階段：最小可用改造

這一階段不碰太多 UI 結構，先把資料與 schema 補齊。

1. 把 composite AI response 從 `subtitles[]` 改成 `segments[] + doc`
2. 把 `segments[].subtitle` 映射成 S2 字幕
3. 把完整 `segments[]` 存進 `compositeSubtitleAnalysis`
4. 文章生成時，若 `activeSkillId === 'composite-tutorial'`，優先讀 `segments[].article_step`
5. 在現有右側面板增加簡單的 composite summary 區塊

### 第二階段：UI 顯示升級

1. 增加 composite 專屬狀態卡
2. 顯示 segment list
3. 每段顯示：
   - `scene_type`
   - `instruction_role`
   - `relation_type`
   - `main_action`
   - `pip_action`
   - `pip_relevance`
4. 點擊 segment 可跳對應時間軸

### 第三階段：Collector 升級

1. 加入 PIP 區域偵測
2. 加入 OCR 區域辨識
3. 加入 overlay 區域排除
4. 規則式切段，不只依 AI 自由發揮

## 建議的程式切入點

### AI schema 與 prompt

修改位置：

- [src/App.jsx](/Users/wilsondenq879/Documents/GitHub/wilsondenq879-gamehub/video_rec_editor/src/App.jsx)

重點：

- composite mode 的 `azureSystemPrompt`
- composite mode 的 Gemini `responseSchema`
- parse `parsedData` 後轉成 segment model

### State 結構

修改位置：

- [src/lib/projectState.js](/Users/wilsondenq879/Documents/GitHub/wilsondenq879-gamehub/video_rec_editor/src/lib/projectState.js)

重點：

- 增加 `compositeTutorialReport`
- 規範 `compositeSubtitleAnalysis` 的結構

### Skill metadata

修改位置：

- [src/skills/composite-tutorial/skill.js](/Users/wilsondenq879/Documents/GitHub/wilsondenq879-gamehub/video_rec_editor/src/skills/composite-tutorial/skill.js)

重點：

- 明確標示 subtitle/article workflow
- 補 `articleActionLabel`
- 把描述改成 segment 與多通道輸出導向

### 文章生成

修改位置：

- [src/App.jsx](/Users/wilsondenq879/Documents/GitHub/wilsondenq879-gamehub/video_rec_editor/src/App.jsx)

重點：

- 若 composite mode 啟用，改從 segment 產生文章步驟
- `setup` / `warning` / `result` 可映射成不同文章章節

## 建議優先順序

如果只能先做一部分，我建議順序如下：

1. 先改 AI schema，讓 composite 回傳 `segments`
2. 再讓 state 保留完整 segment
3. 再改文章生成，讓它吃 `article_step`
4. 最後補專屬 UI 面板與更細的 collectors

## 一句話總結

現在的 `composite-tutorial` 已經有可用雛形，但本質上仍是「附帶 scene metadata 的字幕模式」。

要把它做強，最關鍵的不是再調 prompt，而是把它升級成「以 segment 為主體、可同時服務字幕 / 旁白 / 文章」的技能資料流。
