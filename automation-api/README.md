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

The Studio keeps AI provider settings and keys inside the browser. The API never receives those keys.

## Connect Codex

Copy `mcp.config.example.json` into your Codex MCP configuration and replace:

- `/ABSOLUTE/PATH/TO/open_viscribe_v5` with this repository's absolute path.
- `replace-with-your-stable-token` with the same `OPEN_VISCRIBE_API_TOKEN` used to start the API.

The MCP provides these tools:

- Create and inspect an OpenViscribe project.
- Start and stop browser recording.
- Generate subtitles, an article, and voice.
- Apply AI or manual motion design.
- Start export and inspect asynchronous jobs.
- Store an interaction script, use Computer Use to execute and verify each step, then run the whole production sequence.

## Computer Use tutorial run

Give Codex a UI script as plain steps or structured `{ instruction, expected }` steps. The intended orchestration is:

1. `openviscribe_create_project`
2. `openviscribe_prepare_ui_script`
3. `openviscribe_start_recording` with `requireRealCapture: true`, then approve the one Chromium sharing dialog.
4. Codex uses **Computer Use** to open the script's `startUrl`, complete one visible step at a time, and calls `openviscribe_report_ui_step` with concise evidence after each verified result.
5. `openviscribe_stop_recording`
6. `openviscribe_start_tutorial_production` to chain subtitles → optional voice → intro/outro/lower third design → Markdown article → export.

The script run intentionally fails if screen sharing is unavailable; it never replaces the tutorial with a simulated recording. The final export folder still needs your browser confirmation.

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
POST /v1/projects/{projectId}/workflows/tutorial-production
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
