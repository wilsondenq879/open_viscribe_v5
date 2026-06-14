# Composite Tutorial Skill Bundle Draft

## 目的

這份文件把 `綜合教學影片` skill 從概念規格整理成可落地的 bundle 草案。

目標不是一次把整套 plugin 系統做完，而是先定義出：

- `skill.json` 應該長什麼樣子
- AI system prompt 應該守哪些規則
- output schema 應該有哪些欄位
- markdown template 應該怎麼吃 segment 結果

## 建議 Bundle 結構

```text
skills/
  composite-tutorial/
    skill.json
    system.md
    user-prompt.md
    output-schema.json
    markdown-template.md
    collectors.json
```

## `skill.json` 草案

```json
{
  "id": "composite-tutorial",
  "name": "Composite Tutorial Composer",
  "version": "2.0.0",
  "description": "理解實拍、螢幕錄影、PIP 與疊層說明的混合教學素材，產出字幕、旁白與教學文章段落。",
  "category": "tutorial",
  "editorMode": "tutorial",
  "subtitleWorkflow": "composite-segmented",
  "articleWorkflow": "composite-tutorial",
  "frameField": "capturedFrames",
  "markdownField": "tutorialMD",
  "structuredResultField": "compositeSubtitleAnalysis",
  "collectors": {
    "frames": true,
    "clicks": true,
    "ocrTexts": false,
    "sceneRegions": false,
    "pipDetection": false,
    "audioTranscript": false
  },
  "ui": {
    "panelTitle": "綜合教學工具 & AI",
    "primaryActionLabel": "AI 場景分析",
    "articleActionLabel": "生成教學文章",
    "promptTitle": "Composite Tutorial 模式",
    "promptLabel": "1. 本次影片教學 brief",
    "promptDescription": "描述這支影片中的螢幕操作、實拍示範、PIP 關鍵畫面與希望保留的教學重點，讓 AI 依段落整理主流程與輔助示範。",
    "promptPlaceholder": "例如：先實拍插上電源與燈號亮起，再切到後台設定 Wi-Fi。右下角 PIP 會同步示範按住設備配對鍵。請把主畫面操作與實機示範的對應關係整理清楚，字幕保持簡短，文章步驟要可重做。"
  },
  "ai": {
    "mode": "structured-report",
    "systemPromptFile": "system.md",
    "userPromptFile": "user-prompt.md",
    "outputSchemaFile": "output-schema.json"
  },
  "export": {
    "markdownTemplateFile": "markdown-template.md",
    "defaultFileName": "composite_tutorial_article.md",
    "imagePrefix": "composite_screenshot"
  }
}
```

## `collectors.json` 草案

第一階段先沿用現有資料流，第二階段再逐步打開更細的 collector。

```json
{
  "required": ["frames"],
  "optional": ["clicks"],
  "future": ["ocrTexts", "sceneRegions", "pipDetection", "audioTranscript"],
  "frameStrategy": {
    "baseSampling": "1fps",
    "emphasizeTransitions": true,
    "emphasizeClicks": true,
    "dedupeNearbyFrames": true
  },
  "segmentHints": {
    "cutOnSceneChange": true,
    "cutOnClickTransition": true,
    "cutOnPipToggle": true,
    "cutOnOverlayTopicChange": true
  }
}
```

## `system.md` 草案

這個 skill 的 system prompt 需要強調它不是一般 OCR，也不是一般 caption。

```md
你是多模態教學編排助手。

你的任務是理解一段混合了螢幕錄影、實拍畫面、PIP 與疊層說明的教學素材，並把它整理成可用的教學段落。

你必須遵守以下規則：

1. 請優先判斷每段素材的主教學目的，而不是逐秒重述畫面。
2. 若畫面同時有主畫面與 PIP，必須判斷兩者的關係。
3. 不可把裝飾性疊層、轉場字卡或視覺特效誤判成主要操作。
4. 不可在資訊不足時虛構操作目的。
5. 字幕、旁白、文章步驟必須是同一段事件的三種不同表達，不可只是複製同一句話。
6. 請輸出 segment 級結果，不要輸出逐秒流水帳。

scene_type 只能是：
- live_action
- screen_recording
- screen_recording_with_pip
- mixed_overlay
- uncertain

instruction_role 只能是：
- setup
- action
- confirmation
- warning
- explanation
- comparison
- result

relation_type 只能是：
- parallel
- cause_and_effect
- zoom_in_detail
- real_world_correspondence
- supplementary_hint
- decorative_only

pip_relevance 只能是：
- critical
- supporting
- optional
- ignore
```

## `user-prompt.md` 草案

```md
請根據使用者提供的 brief、畫面順序與事件線索，產出綜合教學段落。

輸出時請特別注意：

- 找出主流程與輔助示範的對應關係
- 若 PIP 很重要，要明確寫進 subtitle / voiceover / article_step
- 若 PIP 只是裝飾或輔助提示，不要讓它搶走主敘事
- 每個 segment 都要有明確 teaching_goal
- article_step 必須可重做
- subtitle 必須短
- voiceover 必須自然
```

## `output-schema.json` 草案

```json
{
  "type": "object",
  "properties": {
    "segments": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "time_start": { "type": "number" },
          "time_end": { "type": "number" },
          "scene_type": {
            "type": "string",
            "enum": [
              "live_action",
              "screen_recording",
              "screen_recording_with_pip",
              "mixed_overlay",
              "uncertain"
            ]
          },
          "instruction_role": {
            "type": "string",
            "enum": [
              "setup",
              "action",
              "confirmation",
              "warning",
              "explanation",
              "comparison",
              "result"
            ]
          },
          "relation_type": {
            "type": "string",
            "enum": [
              "parallel",
              "cause_and_effect",
              "zoom_in_detail",
              "real_world_correspondence",
              "supplementary_hint",
              "decorative_only"
            ]
          },
          "teaching_goal": { "type": "string" },
          "main_visual": { "type": "string" },
          "pip_visual": { "type": "string" },
          "main_action": { "type": "string" },
          "pip_action": { "type": "string" },
          "ui_focus": { "type": "string" },
          "click_based": { "type": "boolean" },
          "pip_relevance": {
            "type": "string",
            "enum": ["critical", "supporting", "optional", "ignore"]
          },
          "subtitle": { "type": "string" },
          "voiceover": { "type": "string" },
          "article_step": { "type": "string" },
          "confidence": { "type": "number" },
          "evidence": {
            "type": "array",
            "items": { "type": "string" }
          }
        },
        "required": [
          "time_start",
          "time_end",
          "scene_type",
          "instruction_role",
          "relation_type",
          "teaching_goal",
          "main_action",
          "pip_action",
          "pip_relevance",
          "subtitle",
          "voiceover",
          "article_step"
        ]
      }
    },
    "doc": {
      "type": "object",
      "properties": {
        "title": { "type": "string" },
        "overview": { "type": "string" },
        "preparation": {
          "type": "array",
          "items": { "type": "string" }
        },
        "steps": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "segment_index": { "type": "number" },
              "step_title": { "type": "string" },
              "description": { "type": "string" },
              "screenshot_time": { "type": "number" }
            },
            "required": ["segment_index", "step_title", "description", "screenshot_time"]
          }
        },
        "warnings": {
          "type": "array",
          "items": { "type": "string" }
        },
        "result_summary": { "type": "string" }
      },
      "required": ["title", "overview", "steps", "result_summary"]
    }
  },
  "required": ["segments", "doc"]
}
```

## `markdown-template.md` 草案

這個 template 的重點是不要只把 AI 的 doc 原封不動印出來，而是能吃 `segments` 裡的結構化資訊。

```md
# {{doc.title}}

## 概覽
{{doc.overview}}

## 事前準備
{{#each doc.preparation}}
- {{this}}
{{/each}}

## 操作步驟
{{#each doc.steps}}
### 步驟 {{@index + 1}}：{{step_title}}
{{description}}

![Composite screenshot](./composite_screenshot_{{segment_index}}.jpg)
{{/each}}

## 注意事項
{{#each doc.warnings}}
- {{this}}
{{/each}}

## 結果
{{doc.result_summary}}
```

## 與目前專案現況的最小對接方式

如果先不改整套 engine，這份 bundle 也可以先用最小成本落地：

- `segments` 先塞進既有 `compositeSubtitleAnalysis`
- `subtitle` 先映射到現有 S2 highlight subtitles
- `article_step` 先繼續走 `tutorialMD`
- `voiceover` 先存著，等 TTS 流程接入

## 第一版最小可用版

第一版不一定要一次達到完整 bundle，只要先滿足這幾件事就很有價值：

1. AI 回傳 `segments` 而不是只有 `subtitles`
2. segment 內至少有 `instruction_role`、`relation_type`、`pip_relevance`
3. S2 字幕用 `subtitle`
4. 文章生成改讀 `article_step`
5. UI 可顯示每段的 `scene_type` / `main_action` / `pip_action`

做到這裡，`composite-tutorial` 就會從「比較聰明的字幕模式」進化成真正有敘事能力的 skill。
