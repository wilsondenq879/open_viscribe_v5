import readline from 'node:readline';

const baseUrl = String(process.env.OPEN_VISCRIBE_API_URL || 'http://127.0.0.1:4318').replace(/\/+$/, '');
const token = String(process.env.OPEN_VISCRIBE_API_TOKEN || '');

if (!token) {
    console.error('OPEN_VISCRIBE_API_TOKEN is required to run the OpenViscribe MCP server.');
    process.exit(1);
}

const actionTools = [
    {
        name: 'openviscribe_start_recording',
        description: 'Ask OpenViscribe Studio to open its browser-capture approval dialog. The user must choose the tab/window and approve capture.',
        action: 'capture.start',
        inputSchema: {
            type: 'object',
            properties: {
                projectId: { type: 'string' },
                includeAudio: { type: 'boolean', default: false },
                includeWebcam: { type: 'boolean', default: false },
                requireRealCapture: { type: 'boolean', default: true, description: 'Keep true for Computer Use tutorials. Recording fails instead of producing a mock video.' }
            },
            required: ['projectId']
        }
    },
    {
        name: 'openviscribe_stop_recording',
        description: 'Stop the active OpenViscribe browser recording and add it to the timeline.',
        action: 'capture.stop',
        inputSchema: { type: 'object', properties: { projectId: { type: 'string' } }, required: ['projectId'] }
    },
    {
        name: 'openviscribe_generate_subtitles',
        description: 'Generate AI subtitles and captured tutorial frames for the selected project.',
        action: 'subtitles.generate',
        inputSchema: { type: 'object', properties: { projectId: { type: 'string' } }, required: ['projectId'] }
    },
    {
        name: 'openviscribe_generate_article',
        description: 'Generate the project Markdown article from its subtitles and captured frames.',
        action: 'article.generate',
        inputSchema: { type: 'object', properties: { projectId: { type: 'string' } }, required: ['projectId'] }
    },
    {
        name: 'openviscribe_apply_agent_content',
        description: 'Apply copy and timed subtitles written by the calling agent directly into OpenViscribe. This does not call Azure, Gemini, or any Studio AI provider: generate the Traditional Chinese copy yourself, then send it here. It can replace or append subtitle cues and optionally set the project topic, tutorial brief, and finished Markdown article.',
        action: 'agent.content.apply',
        inputSchema: {
            type: 'object',
            properties: {
                projectId: { type: 'string' },
                subtitles: {
                    type: 'array',
                    description: 'Timed subtitle / narration cues authored by the agent. Every cue needs text, startAt, and endAt in seconds.',
                    items: {
                        type: 'object',
                        properties: {
                            text: { type: 'string' },
                            startAt: { type: 'number', minimum: 0 },
                            endAt: { type: 'number', minimum: 0 },
                            trackIndex: { type: 'integer', minimum: 0, maximum: 2 },
                            fontSize: { type: 'number' },
                            x: { type: 'number' },
                            y: { type: 'number' }
                        },
                        required: ['text', 'startAt', 'endAt']
                    }
                },
                replaceSubtitles: { type: 'boolean', default: true, description: 'Replace all existing subtitle cues when subtitles is provided. Set false to append.' },
                articleMarkdown: { type: 'string', description: 'Finished Markdown article written by the agent. OpenViscribe will export this text without calling an AI provider.' },
                articleTopic: { type: 'string', description: 'Optional visible project/article title.' },
                tutorialDescription: { type: 'string', description: 'Optional tutorial brief shown in Studio.' }
            },
            required: ['projectId']
        }
    },
    {
        name: 'openviscribe_apply_design',
        description: 'Apply an AI or manual motion-design pack, including intro, outro and lower-third choices.',
        action: 'design.apply',
        inputSchema: {
            type: 'object',
            properties: {
                projectId: { type: 'string' },
                presetId: { type: 'string', enum: ['signal', 'editorial', 'creator'] },
                templateId: { type: 'string', description: 'Curated HyperFrames recipe ID. Prefer openviscribe_apply_hyperframe_template for a listed template.' },
                mode: { type: 'string', enum: ['ai', 'manual'], default: 'ai' },
                includeIntro: { type: 'boolean' },
                includeOutro: { type: 'boolean' },
                includeLowerThird: { type: 'boolean' },
                introDuration: { type: 'number', minimum: 0.8, maximum: 10 },
                outroDuration: { type: 'number', minimum: 0.8, maximum: 10 },
                cardDuration: { type: 'number', minimum: 0.8, maximum: 10 }
            },
            required: ['projectId']
        }
    },
    {
        name: 'openviscribe_auto_add_contents',
        description: 'Read the project topic, brief, and completed UI script, then add at most two narrative Contents layers (for example map, terminal, chart, flow, or product UI). It skips decoration when no supporting visual is justified.',
        action: 'contents.apply',
        inputSchema: {
            type: 'object',
            properties: {
                projectId: { type: 'string' },
                brief: { type: 'string', description: 'Optional natural-language focus that overrides the project brief for Contents selection.' }
            },
            required: ['projectId']
        }
    },
    {
        name: 'openviscribe_export',
        description: 'Ask OpenViscribe Studio to open an export confirmation dialog. The user selects a folder and confirms final video/article export.',
        action: 'export.start',
        inputSchema: {
            type: 'object',
            properties: {
                projectId: { type: 'string' },
                renderVideo: { type: 'boolean', default: true },
                includeMarkdown: { type: 'boolean', default: true },
                includeSubtitles: { type: 'boolean', default: true },
                includeAudio: { type: 'boolean', default: false },
                rawMedia: { type: 'boolean', default: false },
                projectJson: { type: 'boolean', default: true }
            },
            required: ['projectId']
        }
    }
];

const tools = [
    {
        name: 'openviscribe_create_project',
        description: 'Create a new OpenViscribe project and initialize the connected Studio with its topic and brief.',
        inputSchema: {
            type: 'object',
            properties: {
                name: { type: 'string' },
                title: { type: 'string' },
                topic: { type: 'string' },
                brief: { type: 'string' },
                skillId: { type: 'string', enum: ['tutorial', 'shorts', 'long-form', 'product-launch', 'podcast', 'social-ad', 'blank-video', 'composite-tutorial', 'column-topic', 'ui-debug', 'ux-research'], default: 'tutorial' }
            },
            required: ['name']
        }
    },
    ...actionTools.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })),
    {
        name: 'openviscribe_list_hyperframe_templates',
        description: 'List OpenViscribe curated Contents template recipes. Use this first when a user describes desired style in natural language. Show at most three fitting candidates with their preview, useWhen, and catalogBlocks before applying one.',
        inputSchema: { type: 'object', properties: {} }
    },
    {
        name: 'openviscribe_apply_hyperframe_template',
        description: 'Apply one user-approved HyperFrames template to an OpenViscribe project. This writes a real native motion treatment for intro, outro, and lower thirds; the response includes the catalog source blocks used for the recipe.',
        inputSchema: {
            type: 'object',
            properties: {
                projectId: { type: 'string' },
                templateId: { type: 'string', enum: ['hf-clean-product', 'hf-editorial-story', 'hf-creator-cta', 'hf-dev-release', 'hf-bold-announcement'] },
                mode: { type: 'string', enum: ['ai', 'manual'], default: 'ai' },
                includeIntro: { type: 'boolean' },
                includeOutro: { type: 'boolean' },
                includeLowerThird: { type: 'boolean' },
                introDuration: { type: 'number', minimum: 0.8, maximum: 10 },
                outroDuration: { type: 'number', minimum: 0.8, maximum: 10 },
                cardDuration: { type: 'number', minimum: 0.8, maximum: 10 }
            },
            required: ['projectId', 'templateId']
        }
    },
    {
        name: 'openviscribe_list_hyperframe_assets',
        description: 'List the built-in animated Contents library: world maps, data charts, flowcharts, terminal, code, app/device showcases, social cards, ticker, captions, and roadmap. Use this when the user asks for a specific visual element rather than a full design pack.',
        inputSchema: { type: 'object', properties: {} }
    },
    {
        name: 'openviscribe_add_hyperframe_asset',
        description: 'Add one built-in animated HyperFrames asset to the project timeline. Use list_hyperframe_assets first, state why the selected asset supports the current tutorial step, then add it at the current playhead or an explicit startAt time.',
        inputSchema: {
            type: 'object',
            properties: {
                projectId: { type: 'string' },
                assetId: { type: 'string', enum: ['hf-world-map', 'hf-world-flow', 'hf-data-chart', 'hf-flowchart', 'hf-console', 'hf-code-diff', 'hf-code-typing', 'hf-app-showcase', 'hf-device-reveal', 'hf-liquid-glass', 'hf-social-follow', 'hf-news-ticker', 'hf-caption-highlight', 'hf-neon-code', 'hf-release-roadmap'] },
                startAt: { type: 'number', minimum: 0 },
                duration: { type: 'number', minimum: 0.8, maximum: 10 },
                presetId: { type: 'string', enum: ['signal', 'editorial', 'creator'] },
                assetConfig: { type: 'object', description: 'Detailed asset content. For world maps use heading, status, nodes [{id,locationId,label}], and routes [{from,to}]. Other asset types expose matching text/data fields in Studio after adding.' }
            },
            required: ['projectId', 'assetId']
        }
    },
    {
        name: 'openviscribe_prepare_ui_script',
        description: 'Store a user-interface tutorial script in the project and prepare Studio for a Computer Use recording. After Studio reports this job completed, use Computer Use to navigate startUrl and perform every script step. Do not claim a step completed until the UI visibly reached its expected state.',
        inputSchema: {
            type: 'object',
            properties: {
                projectId: { type: 'string' },
                title: { type: 'string' },
                goal: { type: 'string' },
                startUrl: { type: 'string' },
                prerequisites: { type: 'array', items: { type: 'string' } },
                narration: { type: 'string' },
                instructions: { type: 'string', description: 'Newline-separated user operation script.' },
                steps: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: { id: { type: 'string' }, instruction: { type: 'string' }, expected: { type: 'string' } },
                        required: ['instruction']
                    }
                }
            },
            required: ['projectId']
        }
    },
    {
        name: 'openviscribe_get_ui_script',
        description: 'Read the normalized UI script and exact current progress before the next Computer Use action.',
        inputSchema: { type: 'object', properties: { projectId: { type: 'string' } }, required: ['projectId'] }
    },
    {
        name: 'openviscribe_report_ui_step',
        description: 'After using Computer Use on a visible UI step, report its result and concise visual evidence. Use failed if the expected UI state was not reached; use completed only after verifying it.',
        inputSchema: {
            type: 'object',
            properties: {
                projectId: { type: 'string' },
                stepId: { type: 'string' },
                status: { type: 'string', enum: ['pending', 'running', 'completed', 'failed', 'skipped'], default: 'completed' },
                evidence: { type: 'array', items: { type: 'string' } },
                note: { type: 'string' }
            },
            required: ['projectId', 'stepId']
        }
    },
    {
        name: 'openviscribe_list_browser_tutorial_requests',
        description: 'List pending Browser / Computer Use tutorial tasks created from the OpenViscribe AI dialogue. Use this to discover work explicitly delegated by a user.',
        inputSchema: { type: 'object', properties: {} }
    },
    {
        name: 'openviscribe_get_browser_tutorial_request',
        description: 'Read a browser tutorial task, its normalized script, allowed domains, and required human-takeover safety boundaries before taking any Browser or Computer Use action.',
        inputSchema: { type: 'object', properties: { projectId: { type: 'string' } }, required: ['projectId'] }
    },
    {
        name: 'openviscribe_claim_browser_tutorial_request',
        description: 'Claim a browser tutorial task immediately before operating the browser. This does not authorize credentials, CAPTCHAs, purchases, deletion, security changes, or high-impact submissions; hand those steps to the user.',
        inputSchema: {
            type: 'object',
            properties: { projectId: { type: 'string' }, agent: { type: 'string', description: 'The Browser-capable agent claiming this task.' } },
            required: ['projectId']
        }
    },
    {
        name: 'openviscribe_start_tutorial_production',
        description: 'After all UI script steps are completed and recording has stopped, run subtitles, optional voice, narrative Contents selection, motion design, article, and export in order. Export still requires a user to choose an output folder.',
        inputSchema: {
            type: 'object',
            properties: {
                projectId: { type: 'string' },
                includeVoice: { type: 'boolean', default: false },
                autoContents: { type: 'boolean', default: true, description: 'Automatically add up to two Contents layers when the project brief justifies them.' },
                contentsBrief: { type: 'string', description: 'Optional natural-language focus for automatic Contents selection.' },
                design: { type: 'object' },
                export: { type: 'object' }
            },
            required: ['projectId']
        }
    },
    {
        name: 'openviscribe_start_agent_production',
        description: 'Run the no-Azure agent production path after recording: apply agent-authored copy/subtitles/Markdown, add justified Contents, apply motion design, then request export. Do not use openviscribe_start_tutorial_production when avoiding Studio AI providers, because that workflow generates its own subtitles and article.',
        inputSchema: {
            type: 'object',
            properties: {
                projectId: { type: 'string' },
                content: {
                    type: 'object',
                    description: 'Agent-authored payload in the same format accepted by openviscribe_apply_agent_content: subtitles, replaceSubtitles, articleMarkdown, articleTopic, and tutorialDescription.'
                },
                autoContents: { type: 'boolean', default: true },
                contentsBrief: { type: 'string' },
                design: { type: 'object' },
                export: { type: 'object' }
            },
            required: ['projectId', 'content']
        }
    },
    {
        name: 'openviscribe_list_agent_edit_requests',
        description: 'Find OpenViscribe edit briefs waiting for this local agent. Call this first when working as an unattended Codex edit planner, then claim exactly one request before reading or proposing a plan.',
        inputSchema: {
            type: 'object',
            properties: { agent: { type: 'string', default: 'Codex' } }
        }
    },
    {
        name: 'openviscribe_claim_agent_edit_request',
        description: 'Atomically claim a pending OpenViscribe edit brief for this agent. After claiming, call openviscribe_get_agent_edit_request and return a reviewable plan with openviscribe_propose_agent_edit_plan.',
        inputSchema: {
            type: 'object',
            properties: { projectId: { type: 'string' }, agent: { type: 'string', default: 'Codex' } },
            required: ['projectId']
        }
    },
    {
        name: 'openviscribe_get_agent_edit_request',
        description: 'Read the latest edit brief submitted from OpenViscribe Studio in Codex Agent mode, together with the current project snapshot. Use this to understand what the user wants before proposing an edit plan.',
        inputSchema: { type: 'object', properties: { projectId: { type: 'string' } }, required: ['projectId'] }
    },
    {
        name: 'openviscribe_propose_agent_edit_plan',
        description: 'Send a Codex-authored edit plan back to OpenViscribe Studio. Studio opens it in the AI editor for user review; it does not alter the timeline until the user presses Apply. Include a complete timed narration/subtitle script in plan.subtitles, not only cards. Studio can use localTts to generate on-device macOS narration after the user applies the plan.',
        inputSchema: {
            type: 'object',
            properties: {
                projectId: { type: 'string' },
                agent: { type: 'string', default: 'Codex' },
                plan: {
                    type: 'object',
                    properties: {
                        reply: { type: 'string' }, title: { type: 'string' }, brief: { type: 'string' },
                        sequence: { type: 'array', items: { type: 'object', properties: { assetId: { type: 'string' }, duration: { type: 'number' } }, required: ['assetId'] } },
                        presetId: { type: 'string', enum: ['signal', 'editorial', 'creator'] }, templateId: { type: 'string' },
                        contentAssetIds: { type: 'array', items: { type: 'string' } },
                        cards: { type: 'array', items: { type: 'object', properties: { text: { type: 'string' }, position: { type: 'string' } }, required: ['text'] } },
                        subtitles: { type: 'array', items: { type: 'object', properties: { text: { type: 'string' }, startAt: { type: 'number' }, endAt: { type: 'number' } }, required: ['text', 'startAt', 'endAt'] } },
                        generateSubtitles: { type: 'boolean' },
                        localTts: { type: 'boolean' },
                        voice: { type: 'object', properties: { voice: { type: 'string' }, rate: { type: 'number' } } }
                    },
                    required: ['reply']
                }
            },
            required: ['projectId', 'plan']
        }
    },
    {
        name: 'openviscribe_get_project',
        description: 'Read a project, including its latest Studio snapshot and every automation job.',
        inputSchema: { type: 'object', properties: { projectId: { type: 'string' } }, required: ['projectId'] }
    },
    {
        name: 'openviscribe_get_job',
        description: 'Check whether an asynchronous OpenViscribe action has completed, is awaiting user approval, or failed.',
        inputSchema: { type: 'object', properties: { jobId: { type: 'string' } }, required: ['jobId'] }
    }
];

async function api(path, options = {}) {
    const response = await fetch(`${baseUrl}${path}`, {
        ...options,
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            ...(options.headers || {})
        }
    });
    const data = await response.json().catch(() => ({ error: { message: response.statusText } }));
    if (!response.ok) throw new Error(data?.error?.message || `OpenViscribe API returned HTTP ${response.status}`);
    return data;
}

function content(data) {
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}

async function callTool(name, args = {}) {
    if (name === 'openviscribe_create_project') {
        return api('/v1/projects', { method: 'POST', body: JSON.stringify(args) });
    }
    if (name === 'openviscribe_get_project') return api(`/v1/projects/${encodeURIComponent(args.projectId)}`);
    if (name === 'openviscribe_get_job') return api(`/v1/jobs/${encodeURIComponent(args.jobId)}`);
    if (name === 'openviscribe_list_hyperframe_templates') return api('/v1/hyperframes/templates');
    if (name === 'openviscribe_list_hyperframe_assets') return api('/v1/hyperframes/assets');
    if (name === 'openviscribe_apply_hyperframe_template') {
        const { projectId, ...template } = args;
        return api(`/v1/projects/${encodeURIComponent(projectId)}/hyperframes-template`, { method: 'POST', body: JSON.stringify(template) });
    }
    if (name === 'openviscribe_add_hyperframe_asset') {
        const { projectId, ...asset } = args;
        return api(`/v1/projects/${encodeURIComponent(projectId)}/hyperframes-assets`, { method: 'POST', body: JSON.stringify(asset) });
    }
    if (name === 'openviscribe_prepare_ui_script') {
        const { projectId, ...script } = args;
        return api(`/v1/projects/${encodeURIComponent(projectId)}/script`, { method: 'POST', body: JSON.stringify({ script }) });
    }
    if (name === 'openviscribe_get_ui_script') return api(`/v1/projects/${encodeURIComponent(args.projectId)}/script`);
    if (name === 'openviscribe_report_ui_step') {
        const { projectId, stepId, ...result } = args;
        return api(`/v1/projects/${encodeURIComponent(projectId)}/script/steps/${encodeURIComponent(stepId)}`, { method: 'POST', body: JSON.stringify(result) });
    }
    if (name === 'openviscribe_list_browser_tutorial_requests') return api('/v1/browser-tutorial-requests');
    if (name === 'openviscribe_get_browser_tutorial_request') return api(`/v1/projects/${encodeURIComponent(args.projectId)}/browser-tutorial-request`);
    if (name === 'openviscribe_claim_browser_tutorial_request') {
        const { projectId, ...claim } = args;
        return api(`/v1/projects/${encodeURIComponent(projectId)}/browser-tutorial-request/claim`, { method: 'POST', body: JSON.stringify(claim) });
    }
    if (name === 'openviscribe_start_tutorial_production') {
        const { projectId, ...workflow } = args;
        return api(`/v1/projects/${encodeURIComponent(projectId)}/workflows/tutorial-production`, { method: 'POST', body: JSON.stringify(workflow) });
    }
    if (name === 'openviscribe_start_agent_production') {
        const { projectId, ...workflow } = args;
        return api(`/v1/projects/${encodeURIComponent(projectId)}/workflows/agent-production`, { method: 'POST', body: JSON.stringify(workflow) });
    }
    if (name === 'openviscribe_list_agent_edit_requests') {
        const agent = String(args.agent || 'Codex');
        return api(`/v1/agent-edit-requests?agent=${encodeURIComponent(agent)}&status=pending`);
    }
    if (name === 'openviscribe_claim_agent_edit_request') {
        const { projectId, ...claim } = args;
        return api(`/v1/projects/${encodeURIComponent(projectId)}/agent-edit-request/claim`, { method: 'POST', body: JSON.stringify(claim) });
    }
    if (name === 'openviscribe_get_agent_edit_request') return api(`/v1/projects/${encodeURIComponent(args.projectId)}/agent-edit-request`);
    if (name === 'openviscribe_propose_agent_edit_plan') {
        const { projectId, plan, agent = 'Codex' } = args;
        return api(`/v1/projects/${encodeURIComponent(projectId)}/actions`, { method: 'POST', body: JSON.stringify({ action: 'agent.edit.propose', input: { plan, agent } }) });
    }
    const actionTool = actionTools.find(tool => tool.name === name);
    if (!actionTool) throw new Error(`Unknown tool: ${name}`);
    const { projectId, ...input } = args;
    return api(`/v1/projects/${encodeURIComponent(projectId)}/actions`, {
        method: 'POST',
        body: JSON.stringify({ action: actionTool.action, input })
    });
}

function write(message) {
    process.stdout.write(`${JSON.stringify(message)}\n`);
}

const input = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
for await (const line of input) {
    let request;
    try {
        request = JSON.parse(line);
        const { id, method, params = {} } = request;
        if (method === 'initialize') {
            write({ jsonrpc: '2.0', id, result: { protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'openviscribe', version: '1.0.0' } } });
            continue;
        }
        if (method === 'notifications/initialized') continue;
        if (method === 'tools/list') {
            write({ jsonrpc: '2.0', id, result: { tools } });
            continue;
        }
        if (method === 'tools/call') {
            try {
                write({ jsonrpc: '2.0', id, result: content(await callTool(params.name, params.arguments || {})) });
            } catch (error) {
                write({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: error.message }], isError: true } });
            }
            continue;
        }
        if (id !== undefined) write({ jsonrpc: '2.0', id, error: { code: -32601, message: `Unsupported method: ${method}` } });
    } catch (error) {
        if (request?.id !== undefined) write({ jsonrpc: '2.0', id: request.id, error: { code: -32700, message: error.message } });
    }
}
