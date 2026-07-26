# OpenViscribe Automation API

This local service lets Codex orchestrate an OpenViscribe project without taking ownership of browser permissions or AI credentials.

## Start the API

Choose a stable local token, then start the service:

```bash
OPEN_VISCRIBE_API_TOKEN="choose-a-long-random-token" npm run automation:api
```

The service binds only to `127.0.0.1:4318`. Its OpenAPI document is available at `/v1/openapi.json` and authenticated health check at `/v1/health`.

## Connect the Studio

1. Start OpenViscribe and open **Settings**.
2. Enable **Allow Codex workflow control**.
3. Keep the API URL as `http://127.0.0.1:4318` unless you changed the port.
4. Paste the same `OPEN_VISCRIBE_API_TOKEN` into **Automation API Token**.
5. Save settings. The header will show `Codex API：已連線` when the browser Studio has registered with the local API.

The Studio keeps AI provider settings and keys inside the browser. The API never receives those keys. If you want Codex (or another agent) to write the copy and subtitles, it does not need any Azure, Gemini, or Studio AI credentials: use `openviscribe_apply_agent_content` and send the agent-authored result directly to the project.

## Connect Codex

When Codex CLI is installed and signed in on the same Mac, the Studio's **MCP Agent → Codex** option automatically starts a short-lived, read-only Codex planner for each submitted edit brief. It can only claim the local request and return a reviewable plan; it cannot apply the plan, record, browse, generate media, or export. The user still applies an accepted plan in Studio.

Register the bundled MCP launcher once (the token is read from macOS Keychain, not stored in Codex configuration):

```bash
codex mcp add openviscribe -- sh /ABSOLUTE/PATH/TO/open_viscribe_v5/automation-api/run-codex-mcp.sh
```

If Codex is not signed in or cannot be launched, the request remains visible with its error state instead of pretending that an agent accepted it.

Copy `mcp.config.example.json` into your Codex MCP configuration and replace:

- `/ABSOLUTE/PATH/TO/open_viscribe_v5` with this repository's absolute path.
- `replace-with-your-stable-token` with the same `OPEN_VISCRIBE_API_TOKEN` used to start the API.

The MCP provides these tools:

- Create and inspect an OpenViscribe project.
- Start and stop browser recording.
- Generate subtitles, an article, and voice.
- Apply agent-authored Traditional Chinese copy, timed subtitles, and Markdown directly — without calling a Studio AI provider or asking the user for an Azure key.
- Apply AI or manual motion design.
- Start export and inspect asynchronous jobs.
- Store an interaction script, use Computer Use to execute and verify each step, then run the whole production sequence.
- List and apply curated **Contents** recipes, so an agent can turn a natural-language style request into an inspectable motion template before it edits the video.

## Contents natural-language templates

Use `openviscribe_list_hyperframe_templates` before choosing a visual treatment. It returns a compact, agent-readable catalog with a plain-language visual preview, best use case, the source HyperFrames Catalog block IDs, and the OpenViscribe-native Intro / Outro / Lower Third treatment that will actually render. In the Studio this area is called **Contents**, so people choose by narrative purpose rather than by implementation name.

For example, an agent can answer “I want a calm B2B product tutorial” with **產品清晰教學**, explain its `lt-clean-bar` and `caption-editorial-emphasis` recipe, then apply it through `openviscribe_apply_hyperframe_template`. The same dynamic previews are available in Studio’s **素材庫 → Contents** tab for manual selection.

For individual visual moments, call `openviscribe_list_hyperframe_assets` and `openviscribe_add_hyperframe_asset`. Or call `openviscribe_auto_add_contents` with a natural-language brief: it adds at most two justified layers and deliberately adds nothing when the video does not need an extra visual. The built-in collection currently includes 15 editable animations: world map, global flow, data chart, flowchart, terminal, code diff, code typing, app showcase, device reveal, liquid glass, social follow, news ticker, caption highlight, neon code, and release roadmap.

## Computer Use tutorial run

Give Codex a UI script as plain steps or structured `{ instruction, expected }` steps. The intended orchestration is:

1. `openviscribe_create_project`
2. `openviscribe_prepare_ui_script`
3. `openviscribe_start_recording` with `requireRealCapture: true`, then approve the one Chromium sharing dialog.
4. Codex uses **Computer Use** to open the script's `startUrl`, complete one visible step at a time, and calls `openviscribe_report_ui_step` with concise evidence after each verified result.
5. `openviscribe_stop_recording`
6. `openviscribe_start_tutorial_production` to chain subtitles → optional voice → automatic narrative Contents selection → intro/outro/lower third design → Markdown article with screenshots → export. When Codex has authored the copy itself, use `openviscribe_start_agent_production` instead so the flow never calls a Studio AI provider.

The script run intentionally fails if screen sharing is unavailable; it never replaces the tutorial with a simulated recording. The final export folder still needs your browser confirmation.

### Browser tutorial tasks from the AI dialogue

In Studio, open the lower-right **AI 剪輯** panel, choose **MCP Agent → Browser 教學**, select a Browser-capable agent, enter the starting URL, then paste the steps. This creates a pending Browser tutorial task in the local API. The agent discovers it with `openviscribe_list_browser_tutorial_requests`, reads the full script with `openviscribe_get_browser_tutorial_request`, and claims it before Browser or Computer Use actions with `openviscribe_claim_browser_tutorial_request`.

The task includes an allowed-domain list derived from the starting URL. Agents must not leave that list, and must hand control back for login/password entry, CAPTCHA, purchases, permanent deletion, security/permission changes, or consequential form submission. Claiming a task is not permission to perform those actions.

> **Claude Cowork note:** this repository's MCP server is local (`127.0.0.1` and stdio). Claude Cowork can use a browser, but Cowork cannot reach local MCP servers. Use a publicly reachable Remote MCP gateway with appropriate authentication for Cowork, or use a Claude Desktop local MCP session for the OpenViscribe tools. The Studio labels this directly so it does not imply that selecting Claude alone starts a Cowork browser run.

## Agent-authored copy and subtitles (no Azure key)

When an agent already has the user’s script, it should write the narration, subtitle cues, and article itself, then call `openviscribe_apply_agent_content`. This is the preferred route for Codex and any other MCP-capable agent when the user should not be asked to configure an AI provider.

```json
{
  "projectId": "project_...",
  "articleTopic": "在 YouTube 搜尋教學影片",
  "tutorialDescription": "帶使用者完成搜尋、篩選與開啟影片。",
  "replaceSubtitles": true,
  "subtitles": [
    { "startAt": 0, "endAt": 2.8, "text": "先開啟 YouTube，點選上方搜尋列。" },
    { "startAt": 2.8, "endAt": 5.8, "text": "輸入關鍵字後按下 Enter，即可看到搜尋結果。" }
  ],
  "articleMarkdown": "# 在 YouTube 搜尋教學影片\n\n依照以下步驟快速找到想看的內容。"
}
```

The tool writes the text straight into the Studio project. It never invokes the extension’s Azure, Gemini, LM Studio, or Ollama generation flow. Set `replaceSubtitles` to `false` when the agent should append rather than replace existing cues.

For a single no-provider completion run after recording, call `openviscribe_start_agent_production` with the same JSON under its `content` field. It chains `agent.content.apply → Contents → motion design → export`, so it never inserts `subtitles.generate` or `article.generate` into the workflow.

## Codex, Claude, Hermes, and OpenClaw

The **MCP Agent** tab in Studio works with any of these agents. It does not send the edit brief to Azure or another Studio provider. Studio stores the brief in the local Automation API; the selected agent reads it through MCP and returns a proposal. The user still reviews the proposal in Studio before it changes the timeline.

All four clients use the same local `automation-api/mcp-server.mjs` process with `OPEN_VISCRIBE_API_URL` and `OPEN_VISCRIBE_API_TOKEN` set. The agent flow is:

1. In Studio, choose **MCP Agent**, select Codex, Claude, Hermes, or OpenClaw, and send the edit brief.
2. The agent calls `openviscribe_get_agent_edit_request` with the project ID.
3. It reviews the supplied project snapshot and returns `openviscribe_propose_agent_edit_plan`.
4. Studio opens the returned plan in AI 剪輯總監; the user chooses **套用到時間軸**.

This is intentionally MCP-standard rather than vendor-specific: Claude and Hermes load local MCP servers, while OpenClaw can register the same server with its MCP registry. The response plan is identical across clients, so every agent gets the same safety boundary and editable video result.

## Approval boundaries

Codex can schedule every step, but two browser-level actions intentionally require you:

1. Choose and approve the recording source in the Chromium sharing dialog.
2. Choose the output folder and confirm export.

This keeps the workflow automatable without silently recording a screen or writing files somewhere unexpected.

## REST usage

Every API and Studio bridge request needs the configured token. MCP and REST clients send `Authorization: Bearer <token>`; Studio sends the same token as `X-OpenViscribe-Token`.

```text
POST /v1/projects
POST /v1/projects/{projectId}/actions
POST /v1/projects/{projectId}/script
GET  /v1/projects/{projectId}/script
POST /v1/projects/{projectId}/script/steps/{stepId}
GET  /v1/browser-tutorial-requests
GET  /v1/projects/{projectId}/browser-tutorial-request
POST /v1/projects/{projectId}/browser-tutorial-request
POST /v1/projects/{projectId}/browser-tutorial-request/claim
POST /v1/projects/{projectId}/workflows/tutorial-production
POST /v1/projects/{projectId}/workflows/agent-production
GET  /v1/projects/{projectId}/agent-edit-request
POST /v1/projects/{projectId}/agent-edit-request
POST /v1/projects/{projectId}/snapshot
GET  /v1/agent-edit-requests?agent=Codex&status=pending
POST /v1/projects/{projectId}/agent-edit-request/claim
GET  /v1/hyperframes/templates
GET  /v1/hyperframes/assets
POST /v1/projects/{projectId}/hyperframes-template
POST /v1/projects/{projectId}/hyperframes-assets
GET  /v1/projects/{projectId}
GET  /v1/jobs/{jobId}
POST /v1/jobs/{jobId}/cancel
```

Example action payload:

```json
{
  "action": "design.apply",
  "input": {
    "presetId": "signal",
    "mode": "ai",
    "includeIntro": true,
    "includeOutro": true,
    "includeLowerThird": true
  }
}
```
