# 綜合教學影片 Skill 設計 v2

## 目標

`綜合教學影片` 不應只是「教學影片 skill 的加強版」，而應被定義成一個可理解多模態教學素材的 skill。

它要處理的不只是單純的滑鼠操作錄影，而是同一支影片中可能同時包含：

- 實拍短片
- 螢幕錄影操作
- picture in picture
- 說明字卡與箭頭疊層
- 螢幕操作搭配設備實機示範

因此這個 skill 的核心工作不是只描述畫面，而是要回答三件事：

- 這段教學的主敘事是什麼
- 哪些畫面是輔助示範
- 該如何將它們整理成可用的字幕、旁白與文章步驟

## 核心輸出目標

這個 skill 最終應同時生成三種不同用途的內容：

- 影片字幕
- 旁白稿
- 教學文章步驟

三者可以共用同一份結構化分析結果，但不應直接共用同一句文字。

原因是：

- 字幕要短，方便觀看
- 旁白要順，適合口說
- 文章步驟要清楚，方便重做

## 為什麼第一版不夠穩

第一版已經有不錯的方向，例如：

- `scene_type`
- `main_action`
- `pip_action`

但目前仍偏向「逐秒描述畫面」，還沒有完整涵蓋下列能力：

### 1. 缺少教學角色判斷

目前比較像在判斷畫面類型，但還不知道該段在教學流程裡扮演什麼角色，例如：

- 前置準備
- 實際操作
- 驗證結果
- 錯誤提醒
- 補充說明

### 2. 缺少主副畫面關係判斷

有 PIP 不代表 PIP 一定重要。

如果沒有判斷主畫面與 PIP 的關係，AI 很容易：

- 把輔助示範講得太重
- 忽略真正重要的同步動作
- 把 decorative overlay 誤判成主要內容

### 3. 缺少段落級輸出

教學內容最終不是給人看逐秒 log，而是給人看一個段落在做什麼。

因此真正需要的是：

- frame 級理解
- segment 級整合
- 通道化輸出

### 4. 缺少多通道輸出策略

目前還沒有明確規則定義：

- 什麼適合進字幕
- 什麼適合進旁白
- 什麼適合進文章

這會讓輸出容易冗長、重複或不自然。

## Skill 定義

`綜合教學影片` skill 的任務可以定義為：

> 理解由實拍、螢幕錄影、PIP 與疊層說明組成的教學素材，抽出主流程、輔助示範與兩者之間的關係，並產出適合影片、語音與文件的多層內容。

## 建議資料來源

第一階段可先沿用目前已有的資料流：

- `capturedFrames`
- `clickEventLog`
- `tutorialMD`

建議未來補充：

- `sceneRegions`
- `ocrTexts`
- `pipCandidates`
- `visualTransitions`
- `audioTranscript`

其中：

- `sceneRegions` 用於主畫面 / PIP / 疊字區域切分
- `ocrTexts` 用於 UI 字樣與說明字卡理解
- `pipCandidates` 用於判定是否存在可識別的小視窗
- `visualTransitions` 用於找出段落切點
- `audioTranscript` 用於對齊原始旁白或口播內容

## 分析流程

建議把這個 skill 的分析流程拆成五層。

### 1. Frame Understanding

每個時間點先判斷基本畫面類型。

建議保留這五種 `scene_type`：

1. `live_action`
2. `screen_recording`
3. `screen_recording_with_pip`
4. `mixed_overlay`
5. `uncertain`

#### `live_action`

代表主畫面是實拍，例如：

- 插線
- 按按鈕
- 拿起設備
- 觀察燈號

此時應優先描述肉眼可見動作，不要臆測介面操作細節。

#### `screen_recording`

代表主畫面是 UI 操作。

此時應優先結合：

- click timeline
- 畫面前後差異
- OCR / UI 字樣

#### `screen_recording_with_pip`

代表主畫面是螢幕操作，但存在同步輔助視窗。

此時必須至少分成兩層理解：

- 主畫面在操作什麼
- PIP 在補充什麼

#### `mixed_overlay`

代表畫面上有箭頭、字卡、說明框、轉場標題等疊層。

這些通常是輔助說明，不應被誤判成主要操作事件。

#### `uncertain`

如果資訊不足，應保守描述可見變化，不要捏造意圖。

### 2. Region Understanding

不能只看整張 frame，必須拆成區域來理解。

建議最少拆成：

- `main_region`
- `pip_region`
- `overlay_region`
- `ui_focus_region`

這一層的目的不是做精密 CV，而是讓 prompt 或前處理可以把畫面語意分開。

### 3. Instruction Role Detection

每段畫面都應判斷它在教學流程中的角色。

建議新增 `instruction_role`：

- `setup`
- `action`
- `confirmation`
- `warning`
- `explanation`
- `comparison`
- `result`

定義如下：

- `setup`：前置準備，例如插電、登入、進入首頁
- `action`：真正執行操作
- `confirmation`：檢查設定是否生效
- `warning`：提示風險或注意事項
- `explanation`：純說明，不一定有明確操作
- `comparison`：展示操作前後差異
- `result`：呈現最後完成狀態

這一層會直接影響字幕與文章語氣。

### 4. Cross-Modal Alignment

若存在 PIP 或多視覺來源，需判斷主副畫面的關係。

建議新增 `relation_type`：

- `parallel`
- `cause_and_effect`
- `zoom_in_detail`
- `real_world_correspondence`
- `supplementary_hint`
- `decorative_only`

定義如下：

- `parallel`：主畫面與 PIP 同時提供不同但同等重要資訊
- `cause_and_effect`：一個動作導致另一個結果
- `zoom_in_detail`：PIP 是主畫面的局部放大補充
- `real_world_correspondence`：螢幕設定與實機操作互相對應
- `supplementary_hint`：PIP 只是輔助提示
- `decorative_only`：僅為裝飾，不應進主要輸出

### 5. Segment Composition

最後應將逐秒結果合併成段落，而不是直接輸出 frame log。

一個 segment 應代表一段完整教學意圖，例如：

- 開始登入
- 進入 Wi-Fi 設定
- 按住實機配對鍵
- 確認連線成功

## Segment 合併原則

建議依下列條件切段：

1. `scene_type` 明顯變化
2. `instruction_role` 改變
3. 出現 click event 並造成畫面轉換
4. PIP 出現或消失
5. 疊層文字進入新主題
6. 完成狀態或結果頁出現

合併時應避免：

- 每秒都成為一段
- 把不相關的短片硬合併
- 把 setup 與 result 混在一起

## 建議結構化輸出欄位

建議這個 skill 不只輸出單一 `subtitle`，而是輸出 segment 級 JSON。

範例：

```json
{
  "time_start": 12.0,
  "time_end": 18.5,
  "scene_type": "screen_recording_with_pip",
  "instruction_role": "action",
  "main_visual": "路由器管理頁中的 Wi-Fi 配對設定頁",
  "pip_visual": "右下角畫中畫顯示手指按住設備配對鍵",
  "main_action": "開啟配對設定並開始連線流程",
  "pip_action": "按住設備配對鍵 3 秒",
  "relation_type": "real_world_correspondence",
  "ui_focus": "Pairing section",
  "click_based": true,
  "pip_relevance": "critical",
  "subtitle": "開啟配對設定，並同時按住設備配對鍵 3 秒。",
  "voiceover": "進入配對設定後，請同步按住設備上的配對鍵三秒鐘，開始建立連線。",
  "article_step": "進入配對設定頁後，按住設備配對鍵 3 秒以開始配對。",
  "confidence": 0.92
}
```

## 建議新增欄位

### `pip_relevance`

建議明確判斷 PIP 是否真的重要：

- `critical`
- `supporting`
- `optional`
- `ignore`

只有 `critical` 與 `supporting` 應進主要字幕或步驟。

### `teaching_goal`

補一個簡短欄位描述這段在教什麼，例如：

- 進入設定頁
- 開始設備配對
- 確認網路連線完成

這會讓段落級摘要更穩。

### `evidence`

可選欄位，用來保存判斷依據，例如：

- 點擊事件時間
- OCR 關鍵字
- 畫面出現的狀態文字
- PIP 出現位置

這對 debug 與人工校稿很有用。

## 多通道輸出規則

這個 skill 的關鍵不是只產出一句話，而是同一段素材要能分流成三種語氣。

### 字幕

字幕應以觀看負擔最低為原則：

- 句子短
- 只保留主動作
- PIP 只有在重要時才帶入

例如：

`開啟配對設定，並按住設備配對鍵。`

### 旁白

旁白應偏自然口說：

- 比字幕完整
- 可補充目的與前後關係
- 可加入時間順序詞

例如：

`進入配對設定後，請同步按住設備上的配對鍵，開始建立連線。`

### 教學文章步驟

文章步驟應以可重做為目標：

- 明確寫出操作對象
- 盡量避免省略詞
- 可帶入條件與結果

例如：

`在路由器管理頁開啟配對設定後，按住設備上的配對鍵 3 秒以開始連線。`

## Prompt 設計重點

這個 skill 的 prompt 不應只問「畫面發生什麼事」，而應要求模型回答：

- 主畫面在教什麼
- PIP 是否重要
- 這段屬於 setup / action / confirmation 哪一種角色
- 這段應如何整理成字幕、旁白、文章步驟

特別要限制模型：

- 不可把字卡當成主要事件
- 不可因單張 frame 過度推論使用者意圖
- 不可在 `uncertain` 狀態下虛構操作目的

## 跟現有教學影片 Skill 的差異

原本教學影片 skill 的核心假設是：

- 畫面大多是螢幕錄影
- 點擊是主事件來源
- 輸出以操作步驟為主

`綜合教學影片` 則新增以下能力：

- 辨識實拍與螢幕錄影混用
- 辨識 PIP 與主畫面之間的關係
- 辨識疊層說明與真正操作的差異
- 將逐秒資訊合併成段落級教學事件
- 針對字幕、旁白與文章分流生成

## 實作優先順序

### 第一階段

先用現有資料流完成可用版本：

- 沿用 `capturedFrames`
- 沿用 `clickEventLog`
- 先不做精密區域偵測
- 先靠 prompt 判斷 `scene_type`、`instruction_role`、`relation_type`
- 先輸出 segment 級 JSON + Markdown

### 第二階段

補上畫面區域理解能力：

- PIP 區域偵測
- 主畫面 / PIP 分區裁切
- OCR 分區理解
- overlay 區域排除

### 第三階段

補上更完整的素材對齊：

- 原始音訊逐句對齊
- 轉場與節奏點分析
- 更穩定的段落切分
- 多語系旁白與字幕生成

## 最值得先驗證的使用場景

這個 skill 最適合拿來驗證的不是純桌面錄影，而是下列混合型教學：

- 路由器管理頁加上實機配對示範
- App 設定流程加上裝置操作畫面
- NAS 初始化流程加上實體設備連接
- 攝影機系統教學加上鏡頭或主機操作
- 拆箱後立即進行設定的售後教學內容

## 結論

`綜合教學影片` 的真正價值，不是「比原本多支援一種場景」，而是把 OpenViscribe 從單純的操作錄影理解，推進到多模態教學編排。

只要這個 skill 做得穩，OpenViscribe 就不只是會幫你描述畫面，而是會幫你把一段混合素材整理成真正能交付的教學內容。
