# OpenViscribe

## 產品方向

OpenViscribe 可以從目前這個專案延伸成一個「可插拔的教學內容自動化平台」。

目前專案已經具備這些核心能力：

- 錄製瀏覽器操作流程
- 收集點擊事件與畫面素材
- 產生 AI 字幕
- 產生教學文章 Markdown
- 產生 AI 語音
- 匯出影片、字幕、Markdown、素材與 `project.json`

因此它不是從零開始，而是很適合從「單支教學影片生成器」升級成「批次 FAQ / 教學影片生產系統」。

## 核心目標

希望 OpenViscribe 不只是一個 editor，而是：

- 可讓不同人使用
- 可讓不同廠商套用
- 可支援不同產品場景
- 可透過很多 script 重複利用
- 可自動或半自動產出 FAQ、教學影片、字幕、語音與 Markdown

## 目標使用情境

以路由器為例，系統可延伸為：

- 找出哪些功能值得做 FAQ
- 自動整理操作步驟
- 自動進入管理頁執行流程
- 自動錄影、截圖、收集步驟
- 自動生成 FAQ Markdown
- 自動生成旁白、字幕與影片

可延伸的場景不只路由器，也可以是：

- NAS
- 攝影機系統
- 電商後台
- SaaS 後台
- 內部管理系統

## 不是只加 API Key 就完成

若要從現有 editor 進化成 agent 系統，除了 API Key，還需要補上以下能力：

1. 題材發掘能力
- 找出哪些操作值得產出 FAQ / 教學內容

2. 瀏覽器自動操作能力
- 自動進頁面、點擊、輸入、切換、截圖、錄製

3. 內容規劃能力
- 把操作轉成 FAQ 題目、步驟稿、旁白稿、字幕稿、文章摘要

4. 批次執行能力
- 一次處理多個主題並輸出多份成品

## 系統建議分層

建議把 OpenViscribe 拆成四層。

### 1. Core Editor

也就是目前這個專案本體，負責：

- 錄影
- 時間軸編輯
- 字幕管理
- TTS
- Markdown 文章
- 匯出影片 / md / `project.json`

這層適合作為內容生產工作台。

### 2. Scenario Scripts

這層放很多可插拔的情境腳本，每個 script 對應一種教學任務。

例如：

- `router/tplink/change_wifi_name`
- `router/asus/guest_network`
- `nas/synology/create_shared_folder`
- `saas/shopify/create_discount_code`

### 3. Knowledge Packs

這層放領域知識，不直接做操作，而是提供：

- 哪些功能值得寫 FAQ
- 哪些操作有風險不能自動執行
- 品牌術語與欄位差異
- FAQ 標題與內容風格建議

### 4. Agent Runner

這層負責執行自動化流程：

- 打開頁面
- 導航與互動
- 點擊與輸入
- 截圖與錄影
- 記錄步驟
- 把輸出送回 editor 生成內容

這層可以考慮使用瀏覽器自動化工具，例如 Playwright 類型方案。

## 推薦的產品型態

OpenViscribe 比較適合做成：

- 一套共用 UI
- 一套共用輸出流程
- 一套共用 AI 能力
- 外掛很多 script 與知識包

而不是把所有廠商、所有邏輯都寫死在單一前端檔案裡。

## 市場上相對少人做的方向

如果只做：

- AI 教學影片生成
- Product tour
- SaaS onboarding
- 自動字幕與配音

這些方向目前市場上已經很多產品在做，競爭較高。

OpenViscribe 真正比較有機會的，是以下幾條相對少人做、而且與目前能力接近的方向：

### 1. 設備與管理後台的教學內容自動化

這類場景包含：

- 路由器管理頁
- NAS 管理頁
- 攝影機系統
- 內部維運後台
- 高操作門檻的管理介面

這類產品的共同特徵是：

- 不是一般 SaaS onboarding
- UI 較複雜
- 風險操作較多
- 教學內容更新成本高
- 常需要同時輸出影片、FAQ、字幕與文件

這條線的優勢是垂直、明確，而且不容易被通用教學工具直接取代。

### 2. 帶安全規則的錄製與自動化平台

很多瀏覽器 agent 或 RPA 工具強調自動操作，但較少把「教學內容生成」與「高風險動作 guardrails」放在同一個產品裡。

OpenViscribe 若主打：

- 哪些步驟可自動執行
- 哪些步驟只能人工確認
- 哪些操作不可錄製或不可提交
- 如何保留安全證據與執行紀錄

就會比單純的錄影工具或通用 agent 更有差異化。

### 3. Scenario Script + Knowledge Pack 的垂直平台

市場上有很多模板系統與知識庫，但較少看到把以下幾件事整合得很好：

- 可執行 script
- 品牌知識
- 術語差異
- 風險規則
- FAQ / 字幕 / 影片 / Markdown 一次輸出

這表示 OpenViscribe 可以不只是工具，而是逐步變成一個可累積 domain asset 的平台。

## 最值得優先聚焦的產品定位

若要避免一開始就掉進紅海，建議不要把 OpenViscribe 定位成通用 AI 影片工具，而是先聚焦在下列三種定位之一。

### 定位 A：設備管理 UI 的教學內容工廠

核心句子：

把設備或管理後台的操作流程，自動轉成 FAQ、教學影片、字幕、旁白與 Markdown。

適合先切入的場景：

- 路由器
- NAS
- 攝影機系統
- 企業內部管理後台

這是最建議優先做的定位，因為與目前文件中的 script、policy 與 knowledge pack 設計最一致。

### 定位 B：有 guardrails 的教學錄製 agent

核心句子：

讓 agent 可以安全地操作後台並錄製流程，同時避免高風險動作被自動執行。

這條定位的價值在於：

- 不只是會自動化
- 還知道哪些不能做
- 適合企業與設備廠商

如果未來要強調企業可信度，這條線很值得保留。

### 定位 C：垂直 script library 平台

核心句子：

建立可重複使用的教學 script 與 knowledge pack，讓不同品牌或產品線能快速產出內容。

這條定位適合後續平台化與 marketplace 化，但不建議一開始就當主敘事，因為前期更需要先證明單一垂直場景可行。

## 建議先不要主打的方向

以下方向雖然可以做，但不建議作為第一主軸：

- 通用 AI 教學影片平台
- 通用 product tour builder
- 通用 customer education platform
- 面向所有產業的 agent content platform

原因不是不能做，而是太廣、太擠，也較難在早期講出明確差異。

## Script 設計原則

Script 最好優先採用「宣告式」設計，而不是一開始就全部寫成硬編碼 automation。

這樣的好處：

- 初階使用者可只改 JSON / manifest
- 進階使用者可再加 handler
- 更容易驗證、維護與重用

## Script 的最小單位

建議定義為：

一個 script = 一個可重複執行的教學任務單元

輸入：

- 品牌
- 場景
- 參數

輸出：

- 步驟
- 截圖
- 字幕
- FAQ markdown
- 影片素材
- `project.json`

## 建議的 Script 範例格式

```json
{
  "id": "tplink.guest_network.create",
  "domain": "router",
  "vendor": "TP-Link",
  "productLine": "Archer",
  "title": "如何開啟訪客網路",
  "safe": true,
  "entryUrl": "/",
  "steps": [
    { "action": "click", "target": "Guest Network" },
    { "action": "click", "target": "Enable 2.4GHz Guest Network" },
    { "action": "input", "target": "SSID", "value": "{{guest_ssid}}" },
    { "action": "input", "target": "Password", "value": "{{guest_password}}" },
    { "action": "click", "target": "Save" }
  ],
  "outputs": ["video", "faq_md", "subtitles", "voiceover"]
}
```

## 建議的三種 Script 類型

### 1. Recording Script

專注在：

- 怎麼操作 UI
- 怎麼錄畫面
- 怎麼抓步驟與截圖

### 2. Content Script

專注在：

- 怎麼把操作轉成 FAQ
- 怎麼寫標題、摘要、步驟文案
- 怎麼生成旁白與字幕

### 3. Policy Script

專注在安全規則，例如：

- 不可按 reset
- 不可按 reboot
- 不可改 WAN
- 不可提交高風險設定

## 為什麼要做成平台而不是單一 agent

這樣做的優點：

- 同一套平台可以支援多廠商
- 不同人可以只維護自己熟悉的腳本
- 故障時更容易定位問題
- 後續可做 script library 或 marketplace

## 主要風險

### 1. 不同品牌 UI 差異很大

不同路由器或系統的欄位、選單、導覽方式都不同，不能只靠一套 selector。

### 2. 某些操作具有高風險

例如：

- 重設設定
- 重開機
- 修改 WAN
- 修改 LAN IP

這些需要嚴格的 policy guard。

### 3. 前端畫面不一定穩定

有些系統會遇到：

- iframe
- canvas
- SPA 動態載入
- 延遲顯示

所以 agent runner 需要穩定的等待、驗證與重試機制。

### 4. 內容品質不只靠 OCR

FAQ 寫得好不好，不只靠畫面辨識，也要結合領域知識與品牌語氣。

## 建議的落地階段

### 階段 1：半自動版

人工錄一支影片，系統自動完成：

- 字幕
- FAQ Markdown
- 語音

這個階段與目前專案最接近。

### 階段 2：模板化 agent 版

先支援單一品牌或少數品牌，建立固定 SOP。

例如：

- TP-Link
- ASUS Router

由 agent 按腳本自動操作並批次產出內容。

### 階段 3：探索型 agent 版

讓 agent 可以先讀頁面選單與功能，再規劃：

- 哪些主題值得做
- 應該產哪些 FAQ
- 每個 FAQ 對應哪些操作流程

## 建議的市場切入順序

若從市場稀缺度、落地難度與現有能力重用程度綜合評估，建議順序如下：

1. 單一品牌或單一類型設備的 FAQ / 教學影片自動化
2. 加入 policy script，變成安全可控的錄製 agent
3. 把 script 與 knowledge pack 做成可擴充平台
4. 最後才考慮更通用的多產業版本

也就是先證明：

- 同一類 UI 可以重複跑
- 同一套輸出流程可以穩定產內容
- 同一組安全規則可以保護高風險操作

有了這三件事，再談平台化會更有說服力。

## 中介資料格式的重要性

建議在 editor 與 agent runner 之間加入中介 spec，先由 agent 產出任務描述，再交給 editor 產生內容。

範例：

```json
{
  "topic": "如何修改 Wi-Fi 密碼",
  "faqQuestion": "How do I change the Wi-Fi password on this router?",
  "steps": [
    "登入管理頁",
    "進入 Wireless Settings",
    "修改 WPA password",
    "按 Save"
  ],
  "narration": [
    "先登入路由器管理頁面",
    "接著打開無線網路設定頁",
    "修改 Wi-Fi 密碼後儲存設定"
  ],
  "safetyLevel": "safe",
  "automationScript": "playwright/router/change_wifi_password.js"
}
```

這樣會比直接讓 editor 自己猜所有流程更穩定。

## 未來可以加的 UI 區塊

如果往平台化發展，可以新增 `Script Hub` 之類的區域，提供：

- 選場景
- 選品牌
- 選 script
- 查看需要哪些參數
- 查看安全等級
- 執行預覽
- 批次生成 FAQ + 影片

## 最值得先定義的標準

如果希望未來真的支援很多人、很多廠商，最先該定的不是畫面，而是標準。

建議優先定義：

- script manifest 格式
- step / action schema
- 變數注入格式
- 輸出 artifact 格式
- 安全等級定義
- 失敗重試與人工接手機制

## 可延伸的 Skill 方向

如果 OpenViscribe 未來的錄影 input 不只來自網頁或桌面軟體，而可能來自：

- 任意螢幕錄影
- 手機畫面錄影
- 遠端會議錄影
- 客服示範影片
- 操作教學影片
- 實拍流程影片

那 skill 的設計就不應只綁在 DOM、console 或 network 訊號，而應該改成以更通用的 signals 為核心：

- 畫面變化
- 時間軸切段
- 語音與字幕
- 關鍵事件片段
- OCR 文字
- 互動訊號
- 匯出 artifact

### 建議的 Skill 分類方式

與其用題材分類，不如先用依賴訊號分類。

#### 1. visual-only

這類 skill 只靠畫面與時間軸就能成立。

適合的 skill 包括：

- `session-summary`
- `highlight-extractor`
- `timeline-chunker`
- `change-detector`
- `retake-finder`

#### 2. audio-aware

這類 skill 需要語音、字幕或逐字稿。

適合的 skill 包括：

- `subtitle-polisher`
- `voiceover-planner`
- `lesson-builder`
- `call-review`
- `interview-summarizer`

#### 3. interaction-aware

這類 skill 需要 click timeline、操作步驟或互動事件。

適合的 skill 包括：

- `ui-debug`
- `test-report`
- `bug-repro-writer`
- `support-ticket-writer`
- `usability-observer`

#### 4. safety-aware

這類 skill 需要 OCR 與文字審查能力，並可能結合 policy 或紅旗偵測。

適合的 skill 包括：

- `privacy-redflag`
- `compliance-review`
- `translation-audit`
- `brand-check`
- `accessibility-review`

### 最值得優先做的 Skill

若考量泛用性、與現有能力的重用程度，以及未來產品化的價值，建議優先投入以下幾種：

#### 1. `test-report`

把一次錄影自動整理成測試報告，輸出：

- summary
- findings
- severity
- screenshots
- fix suggestions

這條線與目前的 `ui-debug` 最接近，也最容易被理解成明確產品價值。

#### 2. `bug-repro-writer`

把錄影、自動擷取片段與事件整合成 bug report。

輸出建議包含：

- 重現步驟
- 預期結果
- 實際結果
- 關鍵畫面
- 可疑原因
- 影響範圍

#### 3. `session-summary`

適用於任何長錄影來源，將長影片拆成章節、重點片段與時間點摘要。

#### 4. `highlight-extractor`

從長片中找出最值得保留的片段，例如：

- 精彩操作
- 明顯錯誤
- 成功完成瞬間
- 值得剪成短片的片段

#### 5. `lesson-builder`

把一段示範流程轉成可教學的章節、學習目標、步驟與注意事項。

#### 6. `support-ticket-writer`

把客服操作錄影或問題重現錄影，自動轉成 ticket 與交接文件。

#### 7. `privacy-redflag`

檢查影片中是否出現不該曝光的資訊，例如：

- email
- phone number
- token
- MAC address
- 內部網址
- 客戶資料

#### 8. `retake-finder`

標出講錯、停頓太久、重複操作或不自然重講的片段，幫助後製快速修剪。

### 不同 Skill 的共同資料抽象

無論 skill 題目為何，OpenViscribe 都應該逐步把共用輸出抽象成統一 artifact，而不是為每種用途各寫一套流程。

建議至少維持以下幾類中介資料：

- `timeline segments`
- `key frames`
- `ocr blocks`
- `speech transcript`
- `interaction events`
- `diagnostic events`
- `structured result`
- `markdown export`

如此一來，不同 skill 之間才能共用 engine，而不是讓每個 skill 各自重做擷取、判斷與匯出邏輯。

## 專利布局建議

OpenViscribe 若要考慮專利，重點不應該放在「某個 skill 的名字或題目」，而應該放在背後的技術流程與資料處理方法。

換句話說，較有專利價值的不是：

- 生成教學文章
- 自動產生 FAQ
- 自動寫報告

而是：

- 如何從不同來源錄影擷取與標準化訊號
- 如何動態挑選關鍵片段
- 如何建立可用於工程或客服的證據鏈
- 如何以宣告式設定切換分析任務
- 如何在自動化流程中加上風險 guard

### 最值得主打的 Utility Patent 主軸

#### 1. 任意錄影來源的多模態事件標準化與分析方法

此主軸聚焦在：

- 接收不同來源錄影
- 將畫面、時間點、互動訊號與文字訊號轉成統一事件模型
- 將結果提供給不同分析 skill 重用

這條線的價值在於跨來源適用性與可插拔分析能力。

#### 2. 自適應關鍵片段擷取與證據鏈生成方法

此主軸聚焦在：

- 不採固定頻率平均擷取
- 根據畫面變化、點擊、錯誤、等待與語音節點調整取樣密度
- 自動產出前後脈絡完整的關鍵片段與對應畫面

這條線可主張的技術效果包括：

- 降低擷取與分析成本
- 保留較高價值的證據
- 降低人工 review 負擔

#### 3. 互動錄影自動轉結構化工程報告的方法

此主軸聚焦在：

- 將錄影、事件、關鍵畫面與 AI 推論整合
- 產出 debug report、test report、bug report 或 support ticket
- 讓異常、證據與重現步驟能自動對齊

這條線較容易被理解成具體的工程工具流程，而不只是內容摘要。

### 可獨立考慮的後續 Utility Patent 主軸

#### 4. 宣告式 skill bundle 驅動的分析系統

若未來 skill 架構落地成：

- `skill.json`
- `collectors.json`
- `system.md`
- `output-schema.json`
- `markdown-template.md`

並且具備：

- 安全驗證
- collector 選擇
- 輸出 schema 約束
- skill 匯入與版本管理

則這條線可以考慮作為獨立申請方向。

#### 5. 帶 policy guard 的半自動操作錄影與內容生成流程

若未來 agent runner 會自動進頁、導航、點擊、截圖、錄影與產出內容，同時還會依風險規則阻擋高風險操作，則這條線也適合獨立考慮。

典型 guard 例子包括：

- 禁止 reset
- 禁止 reboot
- 禁止 WAN 設定提交
- 禁止高風險頁面的提交動作

### 哪些題目不適合作為核心專利主張

以下題目比較適合當產品功能、行銷賣點或 demo，而不適合作為第一波核心專利主張：

- `article-writer`
- `tutorial-localizer`
- `session-summary`
- `sales-demo-recap`
- `handoff-note`

原因是這些題目較容易被認為只是內容整理、摘要、改寫或教學編排，本身的技術性與可保護性較弱。

### 建議的專利分案思路

OpenViscribe 不建議一開始把每個 skill 都各自申請一件專利。

較合理的布局方式是：

#### 主案

以一件主案涵蓋整條最核心的分析 pipeline：

- 任意錄影來源輸入
- 事件標準化
- 關鍵片段擷取
- 證據鏈生成
- 結構化報告輸出

#### 分案或後續案 1

獨立處理 skill bundle / declarative config / collector orchestration 的架構。

#### 分案或後續案 2

獨立處理 agent runner + policy guard + 安全限制的自動操作流程。

#### Design Patent

如果 editor、timeline UI、報告檢視器或特殊分析介面的畫面配置夠有辨識度，可另外考慮設計專利，以保護介面外觀而非功能邏輯。

### 申請前應先準備的內容

若未來真的要找專利師討論，建議先整理以下資料：

#### 1. invention one-pager

每個主軸各寫一頁，內容包括：

- 想解決的問題
- 現有做法缺點
- OpenViscribe 的差異化流程
- 核心技術步驟
- 可量化的效果

#### 2. 技術效果

盡量避免只描述產品功能，而要強調：

- 降低運算量
- 降低人工檢查成本
- 提高異常定位效率
- 提高跨來源適用性
- 降低誤判率

#### 3. 公開揭露控管

若要保留較完整的專利空間，應注意：

- 對外簡報
- demo 影片
- repo 公開內容
- 官網或社群貼文

這些公開揭露都可能影響後續專利布局，因此需要提早規劃揭露節奏與 filing 時點。

## 一句話總結

OpenViscribe 的長期方向，不只是 AI 教學影片編輯器，而是可插拔的 agent studio：

- 用 script 定義任務
- 用 runner 執行流程
- 用 editor 生產成品
- 用 knowledge pack 提升內容品質與安全性
