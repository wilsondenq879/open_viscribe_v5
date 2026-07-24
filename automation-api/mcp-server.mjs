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
        name: 'openviscribe_apply_design',
        description: 'Apply an AI or manual motion-design pack, including intro, outro and lower-third choices.',
        action: 'design.apply',
        inputSchema: {
            type: 'object',
            properties: {
                projectId: { type: 'string' },
                presetId: { type: 'string', enum: ['signal', 'editorial', 'creator'] },
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
                skillId: { type: 'string', enum: ['tutorial', 'composite-tutorial', 'column-topic', 'ui-debug', 'ux-research'], default: 'tutorial' }
            },
            required: ['name']
        }
    },
    ...actionTools.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })),
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
        name: 'openviscribe_start_tutorial_production',
        description: 'After all UI script steps are completed and recording has stopped, run subtitles, optional voice, motion design, article, and export in order. Export still requires a user to choose an output folder.',
        inputSchema: {
            type: 'object',
            properties: {
                projectId: { type: 'string' },
                includeVoice: { type: 'boolean', default: false },
                design: { type: 'object' },
                export: { type: 'object' }
            },
            required: ['projectId']
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
    if (name === 'openviscribe_prepare_ui_script') {
        const { projectId, ...script } = args;
        return api(`/v1/projects/${encodeURIComponent(projectId)}/script`, { method: 'POST', body: JSON.stringify({ script }) });
    }
    if (name === 'openviscribe_get_ui_script') return api(`/v1/projects/${encodeURIComponent(args.projectId)}/script`);
    if (name === 'openviscribe_report_ui_step') {
        const { projectId, stepId, ...result } = args;
        return api(`/v1/projects/${encodeURIComponent(projectId)}/script/steps/${encodeURIComponent(stepId)}`, { method: 'POST', body: JSON.stringify(result) });
    }
    if (name === 'openviscribe_start_tutorial_production') {
        const { projectId, ...workflow } = args;
        return api(`/v1/projects/${encodeURIComponent(projectId)}/workflows/tutorial-production`, { method: 'POST', body: JSON.stringify(workflow) });
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
