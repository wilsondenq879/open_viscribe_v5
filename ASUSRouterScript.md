# ASUS Router Script Design

## 目的

這份文件用來定義 OpenViscribe 的第一批 ASUS router scripts。

重點不是立刻把所有自動化寫完，而是先建立一套可重複使用的 script 規格，讓後續可以：

- 接上 agent runner
- 接上 Playwright 類型的自動化層
- 接回目前的 editor 產出 FAQ、字幕、旁白與影片

## 設計原則

第一批 ASUS router scripts 應該優先選擇：

- 常見需求
- 操作明確
- 畫面教學價值高
- 失敗風險低
- 容易轉成 FAQ 與教學影片

因此不建議一開始就做：

- 重開機
- 恢復原廠設定
- WAN 設定修改
- LAN IP 修改
- 韌體升級

## 第一波推薦主題

以下是最適合做成第一批 scripts 的主題。

### Safe Tier A

- 查看目前連線裝置
- 修改 Wi-Fi 名稱
- 修改 Wi-Fi 密碼
- 開啟或關閉訪客網路
- 查看韌體版本
- 查看網路狀態
- 查看家長控制入口

### Safe Tier B

- 調整 LED 燈設定
- 啟用簡單 QoS 預設模式
- 查看 USB 應用入口
- 查看 AiProtection 狀態頁

### Blocked Tier

以下任務預設不允許 agent 自動提交：

- reboot
- reset
- restore backup
- firmware upgrade
- WAN setup change
- LAN IP change
- DHCP range change
- port forwarding submit
- DDNS submit

## 支援的 ASUS 產品假設

第一版不追求全 ASUS 全系列通吃，而是先假設：

- ASUSWRT 風格管理介面
- 左側導覽列
- 常見主頁分區
- 主要頁面可透過文字、欄位標題與按鈕辨識

第一版應聚焦在：

- RT 系列家用路由器
- ZenWiFi 系列中共用 ASUSWRT 介面者

## Script 結構

每一個 script 都建議有這些欄位：

```json
{
  "id": "asus.wifi.change_password",
  "domain": "router",
  "vendor": "ASUS",
  "family": "ASUSWRT",
  "intent": "change_wifi_password",
  "riskLevel": "low",
  "requiresAuth": true,
  "entryHint": "router dashboard",
  "outputs": ["video", "faq_md", "subtitles", "voiceover", "project_json"],
  "params": [],
  "steps": [],
  "guards": [],
  "contentPlan": {}
}
```

## 共用 Step Schema

建議先定義這些 action 類型：

- `goto`
- `wait_for`
- `click_text`
- `click_role`
- `input_text`
- `clear_and_input`
- `select_option`
- `toggle`
- `assert_text`
- `assert_value`
- `capture_step`
- `capture_highlight`
- `save_form`
- `record_note`

### Step 範例

```json
{
  "action": "click_text",
  "target": "Guest Network",
  "timeoutMs": 8000,
  "fallbackTargets": ["訪客網路", "Guest Network Pro"]
}
```

## 共用 Guard 規格

每支 script 都要附 guards，避免 agent 做出高風險操作。

```json
[
  {
    "type": "forbid_text",
    "values": ["Factory default", "Restore", "Reboot", "WAN", "LAN IP"]
  },
  {
    "type": "require_page_hint",
    "values": ["ASUS", "AiMesh", "Network Map", "Wireless"]
  }
]
```

## 建議的 Script 目錄

```text
scripts/
  router/
    asus/
      common/
        selectors.json
        glossary.json
        policy.json
      wifi/
        change_ssid.json
        change_password.json
      guest-network/
        toggle_guest_network.json
      devices/
        view_connected_devices.json
      system/
        view_firmware_version.json
        view_network_status.json
```

## 共用知識包建議

### selectors.json

用來放 ASUS 常見導覽與欄位關鍵字，例如：

- `Wireless`
- `General`
- `Guest Network`
- `Network Map`
- `Clients`
- `Firmware Version`
- `Apply`
- `SSID`
- `WPA Pre-Shared Key`

### glossary.json

用來放 FAQ 與字幕可能會用到的術語對照，例如：

- `SSID` = Wi-Fi 名稱
- `Guest Network` = 訪客網路
- `Clients` = 已連線裝置
- `Apply` = 套用設定

### policy.json

用來定義 ASUS 領域的安全規則，例如：

- 遇到 `Administration > Restore/Save/Upload Setting` 不可提交
- 遇到 `Reboot` 不可點擊
- 遇到 `WAN` 頁面只能查看，不能提交

## 第一批 5 支範例 Script

### 1. `asus.devices.view_connected_clients`

用途：

- 教使用者查看目前有哪些裝置連上路由器

價值：

- 非常適合 FAQ
- 風險低
- 不需修改設定

輸入參數：

- 無

腳本概要：

```json
{
  "id": "asus.devices.view_connected_clients",
  "title": "如何查看目前有哪些裝置連線到 ASUS 路由器",
  "riskLevel": "safe",
  "params": [],
  "steps": [
    { "action": "goto", "target": "/" },
    { "action": "wait_for", "target": "Network Map" },
    { "action": "capture_step", "label": "進入 ASUS 路由器首頁" },
    { "action": "click_text", "target": "Clients", "fallbackTargets": ["Client Status", "已連線裝置"] },
    { "action": "wait_for", "target": "Client" },
    { "action": "capture_step", "label": "查看已連線裝置清單" },
    { "action": "record_note", "text": "不要展示或匯出敏感裝置名稱與 MAC 位址" }
  ],
  "contentPlan": {
    "faqQuestion": "How do I check which devices are connected to my ASUS router?",
    "keyPoints": [
      "從首頁或 Network Map 查看裝置",
      "可用來確認陌生裝置是否連入",
      "注意畫面中可能含有敏感裝置資訊"
    ]
  }
}
```

### 2. `asus.wifi.change_ssid`

用途：

- 教使用者修改 Wi-Fi 名稱

風險：

- 低到中
- 提交後會影響使用者重新連線

建議：

- 預設允許產生教學內容
- 預設在 dry-run 模式下不真正按 `Apply`

輸入參數：

- `new_ssid`
- `band`

腳本概要：

```json
{
  "id": "asus.wifi.change_ssid",
  "title": "如何修改 ASUS 路由器的 Wi-Fi 名稱",
  "riskLevel": "low",
  "mode": "dry-run-first",
  "params": [
    { "name": "new_ssid", "type": "string", "required": true },
    { "name": "band", "type": "enum", "values": ["2.4GHz", "5GHz", "smart-connect"] }
  ],
  "steps": [
    { "action": "click_text", "target": "Wireless", "fallbackTargets": ["無線網路"] },
    { "action": "wait_for", "target": "SSID" },
    { "action": "capture_step", "label": "進入無線網路設定頁" },
    { "action": "clear_and_input", "target": "SSID", "value": "{{new_ssid}}" },
    { "action": "capture_highlight", "label": "輸入新的 Wi-Fi 名稱", "target": "SSID" },
    { "action": "record_note", "text": "預設不按 Apply，僅產生教學步驟" }
  ]
}
```

### 3. `asus.wifi.change_password`

用途：

- 教使用者變更 Wi-Fi 密碼

風險：

- 中
- 變更後所有裝置可能需要重新連線

建議：

- 只在明確開啟 `allowSubmit` 時才允許最後提交

輸入參數：

- `new_password`
- `band`

腳本概要：

```json
{
  "id": "asus.wifi.change_password",
  "title": "如何修改 ASUS 路由器的 Wi-Fi 密碼",
  "riskLevel": "medium",
  "requiresConfirmation": true,
  "params": [
    { "name": "new_password", "type": "secret", "required": true },
    { "name": "band", "type": "enum", "values": ["2.4GHz", "5GHz", "smart-connect"] }
  ],
  "guards": [
    { "type": "require_flag", "value": "allowSubmit" }
  ],
  "steps": [
    { "action": "click_text", "target": "Wireless" },
    { "action": "wait_for", "target": "WPA Pre-Shared Key" },
    { "action": "capture_step", "label": "找到 Wi-Fi 密碼欄位" },
    { "action": "clear_and_input", "target": "WPA Pre-Shared Key", "value": "{{new_password}}" },
    { "action": "capture_highlight", "label": "輸入新的 Wi-Fi 密碼", "target": "WPA Pre-Shared Key" },
    { "action": "record_note", "text": "若未開啟 allowSubmit，這支 script 不會提交變更" }
  ],
  "contentPlan": {
    "faqQuestion": "How do I change the Wi-Fi password on an ASUS router?",
    "warnings": [
      "變更後需重新讓裝置連上新密碼",
      "教學影片不應直接曝光真實密碼"
    ]
  }
}
```

### 4. `asus.guest.toggle_guest_network`

用途：

- 教使用者開啟訪客網路

價值：

- 很適合 FAQ 與商務場景
- 畫面明確

輸入參數：

- `guest_ssid`
- `guest_password`
- `band`

腳本概要：

```json
{
  "id": "asus.guest.toggle_guest_network",
  "title": "如何在 ASUS 路由器上開啟訪客網路",
  "riskLevel": "low",
  "params": [
    { "name": "guest_ssid", "type": "string", "required": true },
    { "name": "guest_password", "type": "secret", "required": true },
    { "name": "band", "type": "enum", "values": ["2.4GHz", "5GHz"] }
  ],
  "steps": [
    { "action": "click_text", "target": "Guest Network", "fallbackTargets": ["訪客網路"] },
    { "action": "wait_for", "target": "Enable" },
    { "action": "capture_step", "label": "進入訪客網路設定頁" },
    { "action": "toggle", "target": "Enable", "value": true },
    { "action": "clear_and_input", "target": "SSID", "value": "{{guest_ssid}}" },
    { "action": "clear_and_input", "target": "Password", "value": "{{guest_password}}" },
    { "action": "capture_highlight", "label": "完成訪客網路名稱與密碼設定", "target": "SSID" }
  ]
}
```

### 5. `asus.system.view_firmware_version`

用途：

- 教使用者查看目前韌體版本

價值：

- 極低風險
- 適合新手 FAQ

輸入參數：

- 無

腳本概要：

```json
{
  "id": "asus.system.view_firmware_version",
  "title": "如何查看 ASUS 路由器的韌體版本",
  "riskLevel": "safe",
  "params": [],
  "steps": [
    { "action": "goto", "target": "/" },
    { "action": "wait_for", "target": "Firmware Version" },
    { "action": "capture_step", "label": "在首頁查看韌體版本資訊" },
    { "action": "record_note", "text": "此腳本只查看，不做升級操作" }
  ]
}
```

## 建議的內容輸出模板

每支 script 最後都應轉成一致的內容輸出資料，方便丟回 editor。

```json
{
  "topic": "如何開啟 ASUS 訪客網路",
  "vendor": "ASUS",
  "productFamily": "ASUSWRT",
  "faqQuestion": "How do I enable guest Wi-Fi on an ASUS router?",
  "summary": "這份教學說明如何在 ASUS 路由器中建立訪客 Wi-Fi，讓來賓使用獨立的無線網路。",
  "steps": [
    "登入 ASUS 路由器管理頁",
    "打開 Guest Network 頁面",
    "啟用訪客網路",
    "設定訪客 Wi-Fi 名稱與密碼",
    "儲存設定"
  ],
  "narration": [
    "先登入 ASUS 路由器管理頁面。",
    "接著從左側選單進入訪客網路設定。",
    "啟用訪客網路後，輸入你要提供給訪客的 Wi-Fi 名稱與密碼。",
    "確認設定內容後再套用變更。"
  ],
  "safetyLevel": "low",
  "recordingScriptId": "asus.guest.toggle_guest_network"
}
```

## 執行模式建議

ASUS router scripts 建議先支援三種模式。

### 1. Inspect

只讀取頁面、確認導覽與欄位是否存在，不改任何設定。

### 2. Dry Run

走完整個步驟流程、填入暫存值、產出截圖與影片腳本，但不提交。

### 3. Live Run

真的提交設定。

預設應為：

- `inspect` 或 `dry-run`

## 第一版最推薦先實作的順序

1. `asus.system.view_firmware_version`
2. `asus.devices.view_connected_clients`
3. `asus.guest.toggle_guest_network`
4. `asus.wifi.change_ssid`
5. `asus.wifi.change_password`

這樣排序的原因：

- 先做只讀任務最好驗證
- 再做低風險設定任務
- 最後再碰有提交風險的 Wi-Fi 變更

## 後續延伸方向

當這批穩定後，再擴充：

- 家長控制
- AiProtection 查看與設定
- QoS 預設模式
- Mesh / AiMesh 加入流程
- USB 應用導覽

## 一句話總結

ASUS router scripts 的第一版，不應追求全功能，而應先做一組高價值、低風險、可穩定轉成 FAQ 與教學影片的任務集合。

## 已登入側欄安全巡檢規格

這一版另外定義一個偏自動測試用途的 audit flow。

目標不是產生教學腳本，而是讓 agent 或 runner 在「已登入」的 ASUS Router 管理頁中，安全地巡覽左側主選單並收集診斷資料。

### 目標

- 不碰 login
- 不碰內容區互動
- 不提交任何設定
- 只巡覽左側主選單
- 收集每頁的截圖、錯誤與載入資訊

### 測試範圍

起點假設：

- 使用者已經登入 ASUS Router 後台
- 目前停留在左側主選單可見的管理頁面

納入的主選單：

- 儀錶板
- AiMesh
- Clients
- Adaptive QoE
- 網路
- VPN
- AiProtection 智慧安全防護
- 家長電腦控制程式
- 流量監控
- 設定

排除的主選單：

- 網路設定精靈

額外排除規則：

- 文字包含 `精靈`
- 文字包含 `wizard`
- 文字包含 `quick setup`

### 安全限制

第一版 runner 必須遵守以下限制：

- 只允許點擊左側導航項
- 不點右側內容區按鈕
- 不按 `Apply`
- 不按 `Save`
- 不按 `Reboot`
- 不按 `Reset`
- 不按 `Upgrade`
- 不觸發任何表單提交

### 巡檢流程

每一個主選單頁面都走同一套流程：

1. 從左側找到指定主選單項。
2. 點擊該主選單。
3. 等待頁面穩定。
4. 收集診斷資訊。
5. 截圖。
6. 記錄成功、警告或失敗。
7. 前往下一個主選單。

### 等待穩定條件

第一版建議採用保守規則：

- 主內容區出現
- 主要 loading 標記消失
- 額外等待 300 到 600ms 的穩定期
- 若 5 秒內仍未穩定，記為慢頁或 timeout，但保留證據

### 每頁收集資料

每一頁至少要收集：

- `menuLabel`
- `heading`
- `loadTimeMs`
- `screenshotName`
- `consoleErrors`
- `networkFailures`
- `contentMissing`
- `notes`

### 狀態判定

`fail`

- 點擊失敗
- 主內容空白
- 關鍵內容區不存在

`warning`

- 載入超過慢頁門檻
- 有 console error 或 warn
- 有 failed network
- 頁面穩定等待 timeout

`pass`

- 正常載入
- 主內容存在
- 沒有重大異常

### 建議設定物件

```js
export const ASUS_ROUTER_SIDEBAR_AUDIT = {
  mode: 'asus-router-sidebar-audit',
  skipLogin: true,
  includeMenus: [
    '儀錶板',
    'AiMesh',
    'Clients',
    'Adaptive QoE',
    '網路',
    'VPN',
    'AiProtection',
    '家長電腦控制程式',
    '流量監控',
    '設定'
  ],
  excludeMenus: ['網路設定精靈'],
  excludePatterns: [/精靈/i, /wizard/i, /quick\\s*setup/i],
  pageStableTimeoutMs: 5000,
  slowPageThresholdMs: 3000,
  safeNavigationOnly: true,
  forbidContentActions: true
};
```

### 建議檔案拆分

建議新增以下檔案：

- `src/lib/routerAuditConfig.js`
- `src/lib/routerAuditUtils.js`
- `src/lib/routerAuditRunner.js`

並調整以下既有檔案：

- `src/skills/ui-debug/skill.js`
- `src/lib/uiDebugUtils.js`
- `public/page-debug-bridge.js`

### routerAuditConfig.js

用途：

- 放 ASUS Router 側欄巡檢的白名單、黑名單與 timeout 設定

### routerAuditUtils.js

建議提供這些函式：

```js
export function normalizeMenuLabel(label) {}
export function isExcludedRouterMenu(label, config) {}
export function isIncludedRouterMenu(label, config) {}
export function isAllowedRouterMenu(label, config) {}
export function buildRouterMenuPlan(menuNodes, config) {}
export function classifyRouterAuditStatus(result, config) {}
export function summarizeRouterAuditResult(results) {}
```

責任分工：

- `normalizeMenuLabel(label)`
  - 去前後空白、壓縮多餘空白、做比對標準化
- `isExcludedRouterMenu(label, config)`
  - 判斷是否命中 `excludeMenus` 或 `excludePatterns`
- `isIncludedRouterMenu(label, config)`
  - 判斷是否在 `includeMenus` 白名單
- `isAllowedRouterMenu(label, config)`
  - 白名單通過且黑名單未命中
- `buildRouterMenuPlan(menuNodes, config)`
  - 將原始 sidebar 節點轉成可執行清單
- `classifyRouterAuditStatus(result, config)`
  - 回傳 `pass | warning | fail`
- `summarizeRouterAuditResult(results)`
  - 統計總數、成功、警告、失敗與慢頁數量

### routerAuditRunner.js

建議提供這些函式：

```js
export async function collectSidebarMenuNodes(rootEl, options = {}) {}
export async function clickRouterMenu(menuItem) {}
export async function waitForRouterPageStable(options = {}) {}
export async function captureRouterAuditEvidence(options = {}) {}
export async function runAsusRouterSidebarAudit(options = {}) {}
```

建議責任分工：

- `collectSidebarMenuNodes(rootEl, options = {})`
  - 從左側導航區蒐集主選單節點
- `clickRouterMenu(menuItem)`
  - 只負責安全點擊左側主選單
- `waitForRouterPageStable(options = {})`
  - 等待主內容出現、loading 消失、畫面進入穩定期
- `captureRouterAuditEvidence(options = {})`
  - 收集截圖、標題、console errors、network failures
- `runAsusRouterSidebarAudit(options = {})`
  - 負責整體流程編排與結果輸出

### 建議輸入格式

```js
{
  mode: 'asus-router-sidebar-audit',
  skipLogin: true,
  includeMenus: [...],
  excludeMenus: [...],
  excludePatterns: [...],
  pageStableTimeoutMs: 5000
}
```

### 建議輸出格式

```js
{
  startedAt: 0,
  finishedAt: 0,
  totalMenus: 0,
  summary: {
    total: 0,
    passCount: 0,
    warningCount: 0,
    failCount: 0,
    slowCount: 0
  },
  results: [
    {
      menuLabel: '儀錶板',
      status: 'pass',
      clickSucceeded: true,
      pageStableTimedOut: false,
      loadTimeMs: 1250,
      heading: '儀錶板',
      screenshotName: 'router-dashboard.png',
      consoleErrors: [],
      networkFailures: [],
      contentMissing: false,
      notes: []
    }
  ]
}
```

### 與 ui-debug 整合

建議在 `src/lib/uiDebugUtils.js` 補兩個函式：

```js
export function createRouterAuditIssue(result) {}
export function formatRouterAuditMarkdown(report) {}
```

用途：

- `createRouterAuditIssue(result)`
  - 將單頁 audit 結果轉成 ui-debug 可用的 issue 結構
- `formatRouterAuditMarkdown(report)`
  - 將整份側欄巡檢報告轉成 Markdown

### 與現有 bridge 的關係

`public/page-debug-bridge.js` 可沿用目前的頁面事件蒐集能力，持續提供：

- console
- resource error
- fetch / XHR
- performance
- DOM mutation

側欄巡檢 runner 只需要讀取這些訊號，不需要額外引入高風險操作。

### 第一版實作順序

1. 新增 `routerAuditConfig.js`
2. 新增 `routerAuditUtils.js`
3. 新增 `routerAuditRunner.js`
4. 在 `uiDebugUtils.js` 補報告轉換
5. 在 `src/skills/ui-debug/skill.js` 加入 ASUS Router 側欄巡檢入口

### 一句話總結

ASUS Router 的第一版自動測試，應先聚焦在「已登入後的左側主選單安全巡檢」，以最低風險完成頁面導覽、錯誤蒐集與報告輸出。
