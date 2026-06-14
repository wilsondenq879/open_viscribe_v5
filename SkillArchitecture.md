# OpenViscribe Skill Architecture

## 目的

這份文件定義 OpenViscribe 下一階段的 skill 化架構。

目標是把目前「螢幕錄影剪輯教學片」這條主軸抽成一個可切換的 skill，並在同一套工具內擴充出其他用途，例如：

- 教學內容生成
- UI debug / 效能問題分析
- FAQ 產生
- 產品操作報告

這份文件特別聚焦在第二個 skill：`ui-debug`。

## 背景

目前專案已經具備這些可重用能力：

- 錄製瀏覽器操作流程
- 收集 click timeline
- 擷取關鍵畫面與 `capturedFrames`
- 匯出 Markdown 與對應截圖
- 以 AI 根據畫面與時間點生成結構化內容

目前的問題不是能力不夠，而是任務邏輯大多寫死在 [src/App.jsx](/Users/wilsondenq879/Documents/GitHub/wilsondenq879-gamehub/video_rec_editor/src/App.jsx) 內。

這會造成幾個限制：

- 只能服務單一主題
- prompt、schema、markdown 格式很難切換
- 若要擴充新用途，會一直把更多條件塞進同一支檔案
- 很難讓使用者自行匯入新的 skill

因此下一步建議不是單純換 prompt，而是導入 skill registry 與 skill bundle。

## 核心原則

### 1. Engine 與 Skill 分離

OpenViscribe 應拆成兩層：

- Engine 固定層
- Skill 可替換層

Engine 負責共用能力：

- 錄影
- timeline
- click log
- 截圖
- 匯出
- AI 呼叫器
- skill 載入器

Skill 負責任務差異：

- 任務描述
- 需要蒐集哪些資料
- prompt 組裝
- 回傳 schema
- markdown 樣板
- UI 文案
- 顯示哪些分析欄位

### 2. 先用宣告式 skill

第一版不建議開放任意 JavaScript plugin。

先支援這種宣告式 bundle：

- `skill.json`
- `system.md`
- `user-prompt.md`
- `output-schema.json`
- `markdown-template.md`
- `collectors.json`

這樣比較容易：

- 驗證格式
- 匯入 skill
- 防止惡意邏輯
- 做版本管理

### 3. Base Prompt 不可被完全覆蓋

Prompt 建議分三層：

- Base system prompt
- Skill system prompt
- User custom instructions

理由：

- 保留底層輸出穩定性
- 避免使用者 skill 破壞核心流程
- 允許使用者客製化任務語氣與輸出偏好

## 建議目錄結構

```text
skills/
  registry.json
  tutorial/
    skill.json
    system.md
    user-prompt.md
    output-schema.json
    markdown-template.md
    collectors.json
  ui-debug/
    skill.json
    system.md
    user-prompt.md
    output-schema.json
    markdown-template.md
    collectors.json
```

也可以把內建 skill 放在 `src/skills/`，自訂 skill 放在匯入資料夾或 IndexedDB 中。

## Skill Manifest

每個 skill 必須至少有一份 `skill.json`。

範例：

```json
{
  "id": "ui-debug",
  "name": "UI Debug Analyzer",
  "version": "1.0.0",
  "description": "分析點擊後的介面切換延遲、卡頓與可疑 console/network 訊號",
  "category": "diagnostics",
  "collectors": {
    "clicks": true,
    "screenshots": true,
    "consoleLogs": true,
    "performanceTimeline": true,
    "network": true,
    "domMutations": true
  },
  "ai": {
    "mode": "structured-report",
    "systemPromptFile": "system.md",
    "userPromptFile": "user-prompt.md",
    "outputSchemaFile": "output-schema.json"
  },
  "export": {
    "markdownTemplateFile": "markdown-template.md",
    "defaultFileName": "ui_debug_report.md",
    "imagePrefix": "debug_screenshot"
  },
  "ui": {
    "leftPanelTitle": "UI Debug 工具",
    "primaryActionLabel": "分析切換延遲",
    "resultTitle": "偵錯報告"
  }
}
```

## Skill 切換模型

建議在 App 內新增一個 `activeSkillId`。

切換 skill 後，變動的不是整個 App，而是這幾個區塊：

- 左側工具面板標題
- 主操作按鈕文案
- 要蒐集的 signals
- AI prompt
- AI output schema
- markdown export 檔名與內容
- 結果卡片顯示欄位

不需要切換的共用能力：

- 錄影
- 點擊紅圈
- timeline
- 畫面擷取
- 基本匯出流程

## 建議資料模型

目前專案已有：

- `capturedFrames`
- `tutorialMD`
- `clickEventLog`

skill 化後，建議把專案內的分析輸出抽象成：

```json
{
  "activeSkillId": "ui-debug",
  "artifacts": {
    "markdown": "",
    "structuredResult": {},
    "capturedFrames": [],
    "subtitleDrafts": []
  },
  "diagnostics": {
    "consoleLogs": [],
    "networkEvents": [],
    "performanceEntries": [],
    "domMutations": []
  }
}
```

其中：

- `markdown` 是目前的 `tutorialMD` 通用化後的欄位
- `structuredResult` 是 skill 專屬 JSON 結果
- `diagnostics` 是 `ui-debug` 這類 skill 需要的額外訊號

## 為什麼第二個 Skill 不該只靠 Screenshot + OCR

`tutorial` skill 的主輸入是：

- click 時間點
- 畫面
- OCR

但 `ui-debug` skill 要回答的是：

- 點下去多久才開始反應
- 多久才真的切完頁
- 中間有沒有網路卡住
- 有沒有 long task
- console 有沒有 error / warning
- DOM 有沒有異常重繪

因此它需要新的 collectors，而不只是沿用教學模式的 prompt。

## ui-debug Skill 目標

`ui-debug` 的目標是把一次操作錄影轉成工程可讀的 debug report。

輸出應包含：

- 哪次點擊之後發生明顯等待
- 切換界面耗時幾秒
- 卡住期間的 console log
- 可疑 network request
- 對應截圖
- AI 根據畫面與訊號整理出的可能原因
- 提供工程師快速定位問題的 Markdown 報告

## ui-debug 需要蒐集的資料

### 1. Click Event Timeline

沿用現有點擊資料，至少保留：

- `clickId`
- `epochMs`
- `targetText`
- `x`
- `y`

### 2. Screenshot Frames

沿用現有 `capturedFrames`，但用途改成：

- 點擊前
- 點擊後短延遲
- 明顯畫面變更時
- 畫面穩定時

### 3. Browser Console Logs

需要收集頁面本身的：

- `console.log`
- `console.warn`
- `console.error`

每筆建議至少保留：

```json
{
  "id": "",
  "type": "log",
  "level": "warn",
  "text": "",
  "timestamp": 0,
  "source": "page"
}
```

注意：

- 這不能只抓 extension 自己的 console
- 需要注入 page context script 攔截原生 `console`
- 再透過 message bridge 回傳給 extension

### 4. Performance Timeline

建議蒐集：

- `longtask`
- `navigation`
- `paint`
- `resource`
- `measure`

若瀏覽器權限或注入限制存在，第一版至少要先拿到：

- long task
- resource timing

### 5. Network Events

第一版可先攔：

- `fetch`
- `XMLHttpRequest`

記錄欄位：

- url
- method
- startTime
- endTime
- durationMs
- status
- failed

### 6. DOM Mutation Summary

使用 `MutationObserver` 統計：

- 主要區塊何時開始變動
- 何時停止大幅變動
- 是否發生大量節點重繪

這可以幫助判斷：

- 點擊後是否有真的開始切頁
- 卡住是網路慢還是前端 render 慢

## ui-debug 的核心分析事件

建議把每次點擊轉成一個 `interaction`：

```json
{
  "clickId": "click_123",
  "targetText": "Save",
  "clickTime": 12.42,
  "firstVisualChangeTime": 12.58,
  "settledTime": 14.91,
  "transitionDurationMs": 2490,
  "longTasks": [],
  "networkEvents": [],
  "consoleLogs": [],
  "suspectedCause": ""
}
```

其中：

- `firstVisualChangeTime` = 點擊後首次偵測到畫面或 DOM 變動
- `settledTime` = 畫面回到穩定狀態
- `transitionDurationMs` = `settledTime - clickTime`

## Slow Interaction 判斷建議

第一版可先用規則法，不一定一開始就交給 AI 判定。

建議門檻：

- 大於 `800ms` 記為可觀察延遲
- 大於 `1500ms` 記為明顯偏慢
- 大於 `3000ms` 記為高優先檢查

可再搭配訊號分類：

- 有 error log
- 有 warning log
- 有超過 `500ms` 的 long task
- 有超過 `1000ms` 的 network request
- 有大量 DOM mutation 但無 network

## ui-debug 的 AI 輸出 Schema

建議不要沿用教學文章 schema。

第一版建議如下：

```json
{
  "summary": "string",
  "issues": [
    {
      "title": "string",
      "severity": "low",
      "clickTime": 12.42,
      "targetText": "Save",
      "transitionStartTime": 12.58,
      "settledTime": 14.91,
      "durationMs": 2490,
      "symptoms": ["string"],
      "suspectedCause": "string",
      "evidence": {
        "consoleLogs": ["string"],
        "networkEvents": ["string"],
        "performanceNotes": ["string"]
      },
      "screenshotTime": 13.2
    }
  ],
  "recommendations": ["string"]
}
```

這樣的好處：

- 可直接轉成工程報告
- 後續也能顯示在 UI 結果卡
- 匯出 markdown 很直覺

## ui-debug 的 Markdown 輸出格式

建議生成：

```md
# UI Debug Report

## Summary

...

## Issue 1: Save button transition is slow

- Severity: High
- Click time: 12.42s
- First visual change: 12.58s
- Settled: 14.91s
- Total duration: 2490ms

### Symptoms

- After clicking Save, the page stayed visually unchanged for 160ms
- A network request to `/api/config` took 1.8s
- Console emitted one warning during the transition

### Suspected Cause

...

### Evidence

- Console: ...
- Network: ...
- Performance: ...

![Screenshot at 13.20s](./debug_screenshot_102.jpg)
```

這種格式比教學文章更適合直接丟給工程師。

## 建議的 Skill 檔案責任

### `skill.json`

定義：

- skill id
- skill 名稱
- collector 開關
- 需要的 prompt 檔
- 需要的 schema 檔
- 匯出預設檔名
- UI 文案

### `system.md`

定義這個 skill 的角色。

例如 `ui-debug`：

- 你是前端 debug analyst
- 不寫行銷文案
- 不腦補不存在的因果
- 只能根據截圖、時間線、console、network、performance 證據提出推論

### `user-prompt.md`

定義要如何把本次錄影資料包裝給模型。

### `output-schema.json`

定義模型一定要輸出的 JSON 格式。

### `markdown-template.md`

定義如何把結構化輸出渲染成 md。

### `collectors.json`

定義這個 skill 要不要啟用：

- console collector
- network collector
- performance collector
- screenshot strategy

## 建議的匯入方式

第一版建議：

- 內建 skill 直接打包進專案
- 自訂 skill 允許匯入 zip 或資料夾 manifest
- 匯入後先做 schema 驗證
- 驗證成功才加入 registry

匯入驗證至少檢查：

- `skill.json` 是否存在
- `id` 是否重複
- prompt 檔是否存在
- `output-schema.json` 是否有效 JSON schema

## 安全與限制

第一版不要支援：

- 任意 JavaScript 執行
- 直接覆蓋 base engine
- 修改錄影核心流程
- 修改瀏覽器權限 manifest

第一版可以支援：

- prompt 替換
- collector 開關
- schema 替換
- markdown 模板替換
- UI 文案替換

## 與目前程式碼的對應

目前最值得先抽離的區塊有：

- [src/App.jsx](/Users/wilsondenq879/Documents/GitHub/wilsondenq879-gamehub/video_rec_editor/src/App.jsx) 內組 AI prompt 的段落
- [src/App.jsx](/Users/wilsondenq879/Documents/GitHub/wilsondenq879-gamehub/video_rec_editor/src/App.jsx) 內定義 response schema 的段落
- [src/App.jsx](/Users/wilsondenq879/Documents/GitHub/wilsondenq879-gamehub/video_rec_editor/src/App.jsx) 內組 markdown 的段落
- [src/App.jsx](/Users/wilsondenq879/Documents/GitHub/wilsondenq879-gamehub/video_rec_editor/src/App.jsx) 內 export markdown 的檔名與流程

建議之後拆成：

- `src/skills/index.js`
- `src/skills/tutorial/*`
- `src/skills/ui-debug/*`
- `src/lib/skill-runtime.js`
- `src/lib/collectors/*`
- `src/lib/markdown-renderer.js`

## 實作順序建議

### Phase 1

先把目前教學模式抽成 `tutorial` skill。

目標：

- 不改功能
- 只把 prompt、schema、markdown renderer 抽離

### Phase 2

新增 `ui-debug` skill。

目標：

- 收集 console log
- 收集 network event
- 收集 performance long task
- 生成 debug report markdown

### Phase 3

加上 skill registry 與 skill selector UI。

目標：

- 可在 UI 內切換 `tutorial` / `ui-debug`
- 根據 skill 動態變更左側面板與主要按鈕

### Phase 4

支援自訂 skill 匯入。

目標：

- 匯入 skill bundle
- 顯示 registry
- 驗證並儲存本地 skill

## 對 `ui-debug` 的一句話定義

`ui-debug` 不是教使用者怎麼操作，而是把一次真實操作錄影轉成可交付給工程師的診斷報告：

- 哪裡慢
- 慢多久
- 當時畫面是什麼
- 同步發生了哪些 console / network / performance 訊號
- 根據證據最可能是哪一類問題

## 下一步

接下來實作 `ui-debug` skill 時，優先順序建議如下：

1. 建立 skill runtime 與 `tutorial` skill 基本抽離
2. 建立 `ui-debug` skill manifest、prompt、schema、markdown template
3. 新增 page console collector
4. 新增 network collector
5. 新增 performance long task collector
6. 把 interaction timeline 組起來
7. 接上 markdown export
