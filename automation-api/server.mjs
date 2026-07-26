import { createServer } from 'node:http';
import { randomBytes, randomUUID } from 'node:crypto';
import { execFile, spawn } from 'node:child_process';
import { closeSync, existsSync, openSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import hyperframeTemplates from '../src/data/hyperframeTemplates.json' with { type: 'json' };
import hyperframeAssets from '../src/data/hyperframeAssets.json' with { type: 'json' };

const moduleDirectory = dirname(fileURLToPath(import.meta.url));
const projectDirectory = resolve(moduleDirectory, '..');
const port = Number(process.env.OPEN_VISCRIBE_API_PORT || 4318);
const host = process.env.OPEN_VISCRIBE_API_HOST || '127.0.0.1';
const storagePath = resolve(projectDirectory, '.openviscribe-automation', 'state.json');
const apiToken = process.env.OPEN_VISCRIBE_API_TOKEN || randomBytes(24).toString('base64url');
const execFileAsync = (file, args, options) => new Promise((resolvePromise, rejectPromise) => {
    execFile(file, args, options, (error, stdout, stderr) => {
        if (error) {
            error.stdout = stdout;
            error.stderr = stderr;
            rejectPromise(error);
            return;
        }
        resolvePromise({ stdout, stderr });
    });
});
const supportedActions = new Set([
    'project.initialize',
    'capture.start',
    'capture.stop',
    'subtitles.generate',
    'article.generate',
    'agent.content.apply',
    'agent.edit.propose',
    'voice.generate',
    'contents.apply',
    'design.apply',
    'export.start',
    'script.prepare'
]);

let store = {
    version: 1,
    projects: {},
    jobs: {},
    commands: {},
    clients: {}
};
let persistQueue = Promise.resolve();

function now() {
    return new Date().toISOString();
}

function publicProject(project) {
    if (!project) return null;
    const jobs = (project.jobIds || []).map(id => store.jobs[id]).filter(Boolean).map(publicJob);
    return { ...project, jobs };
}

function publicJob(job) {
    if (!job) return null;
    const { commandId, ...publicValue } = job;
    return publicValue;
}

function persist() {
    // Requests can arrive concurrently from the Studio and an MCP client.  A
    // shared `state.json.tmp` lets one request rename the file while another is
    // still writing it, causing ENOENT.  Queue writes and give every atomic
    // replacement its own temporary file.
    const serializedStore = JSON.stringify(store, null, 2);
    const temporaryPath = `${storagePath}.${randomUUID()}.tmp`;
    const nextPersist = persistQueue
        .catch(() => undefined)
        .then(async () => {
            await mkdir(dirname(storagePath), { recursive: true });
            await writeFile(temporaryPath, serializedStore);
            await rename(temporaryPath, storagePath);
        });
    persistQueue = nextPersist;
    return nextPersist;
}

async function loadStore() {
    try {
        const saved = JSON.parse(await readFile(storagePath, 'utf8'));
        if (saved && typeof saved === 'object') {
            store = {
                version: 1,
                projects: saved.projects || {},
                jobs: saved.jobs || {},
                commands: saved.commands || {},
                clients: {}
            };
        }
    } catch (error) {
        if (error?.code !== 'ENOENT') console.warn('Unable to load automation state:', error.message);
    }
}

function sendJson(response, statusCode, data) {
    response.writeHead(statusCode, {
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-OpenViscribe-Token',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
    });
    response.end(JSON.stringify(data));
}

function sendError(response, statusCode, message, code = 'request_error') {
    sendJson(response, statusCode, { error: { code, message } });
}

async function readJson(request) {
    const chunks = [];
    for await (const chunk of request) {
        chunks.push(chunk);
        if (Buffer.concat(chunks).length > 2_000_000) throw new Error('Request body is too large.');
    }
    if (!chunks.length) return {};
    try {
        return JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch {
        throw new Error('Request body must be valid JSON.');
    }
}

function isAuthorized(request) {
    const authorization = String(request.headers.authorization || '');
    const bearer = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
    const supplied = bearer || request.headers['x-openviscribe-token'];
    return typeof supplied === 'string' && supplied === apiToken;
}

function getProject(projectId) {
    return store.projects[projectId] || null;
}

function createProject(input = {}) {
    const id = `project_${randomUUID()}`;
    const project = {
        id,
        name: String(input.name || input.title || 'Untitled OpenViscribe project').slice(0, 160),
        topic: String(input.topic || input.title || '').slice(0, 500),
        brief: String(input.brief || '').slice(0, 2000),
        skillId: String(input.skillId || 'tutorial'),
        createdAt: now(),
        updatedAt: now(),
        status: input.snapshot && typeof input.snapshot === 'object' ? String(input.snapshot.phase || 'ready') : 'created',
        snapshot: input.snapshot && typeof input.snapshot === 'object' ? input.snapshot : null,
        script: null,
        workflow: null,
        agentEditRequest: null,
        browserTutorialRequest: null,
        jobIds: []
    };
    store.projects[id] = project;
    return project;
}

function dispatchCodexEditPlanner(project) {
    const request = project?.agentEditRequest;
    if (!request || String(request.requestedAgent || 'Codex').toLowerCase() !== 'codex') return;

    // The Codex task is deliberately limited to producing a proposal. The
    // Studio remains the only place where a user can apply it to the timeline.
    request.dispatchStatus = 'starting';
    request.dispatchError = null;
    request.updatedAt = now();
    const projectId = project.id;
    const prompt = [
        'You are the local OpenViscribe Codex edit planner.',
        'Use only the OpenViscribe MCP tools; do not use shell commands or edit files.',
        `Process the single requested project: ${projectId}.`,
        'Call openviscribe_get_agent_edit_request. If its status is pending, call openviscribe_claim_agent_edit_request with agent Codex; if it is already claimed by Codex, continue.',
        'Read the current project snapshot, then call openviscribe_propose_agent_edit_plan with a conservative, reviewable Traditional Chinese plan.',
        'The plan MUST include a complete timed narration/subtitle script in plan.subtitles: an array of {text,startAt,endAt}. It is not enough to return title cards. Write natural, spoken Traditional Chinese that matches the requested goal; use consecutive timing from 0 seconds and cover the full proposed edit. Honor an explicit duration: for a one-minute request, provide roughly 55–65 seconds across 12–18 readable cues; never return a few short cues for a longer requested video. Set plan.localTts to true unless the user explicitly asks for no voice.',
        'For a narration-led edit, subtitles are the primary on-screen copy: do not create a card for every subtitle, leave cards empty unless a single non-overlapping moment is essential, and choose at most one Contents asset. Intro and outro are exclusive title moments and must not overlap captions or other overlays.',
        'Do not apply any plan, change the timeline, record, browse, generate media, or export. If media is absent, say so clearly and propose only a structure that becomes executable after import.'
    ].join(' ');
    try {
        // launchd intentionally has a minimal PATH. Codex Desktop bundles the
        // CLI in its app resources on this Mac; keep Homebrew and PATH as
        // fallbacks for other local installations.
        const codexCandidates = [
            process.env.OPEN_VISCRIBE_CODEX_BIN,
            '/Applications/ChatGPT.app/Contents/Resources/codex',
            '/opt/homebrew/bin/codex',
            '/usr/local/bin/codex'
        ].filter(Boolean);
        const codexExecutable = codexCandidates.find(candidate => existsSync(candidate)) || 'codex';
        const agentHome = process.env.HOME || homedir();
        const plannerLogFd = openSync('/tmp/openviscribe-codex-planner.log', 'a');
        let plannerLogClosed = false;
        const closePlannerLog = () => {
            if (plannerLogClosed) return;
            plannerLogClosed = true;
            closeSync(plannerLogFd);
        };
        const child = spawn(codexExecutable, [
            'exec', '--ephemeral', '--sandbox', 'read-only', '--skip-git-repo-check', '-C', projectDirectory, prompt
        ], {
            cwd: projectDirectory,
            // Codex is a short-lived CLI task. Keep it attached to the local
            // service process: detached launchd children can lose the session
            // context that Codex uses for its authenticated MCP connection.
            detached: false,
            stdio: ['ignore', plannerLogFd, plannerLogFd],
            env: {
                ...process.env,
                HOME: agentHome,
                USER: process.env.USER || 'wilsondenq879',
                CODEX_HOME: process.env.CODEX_HOME || `${agentHome}/.codex`,
                PATH: process.env.PATH || '/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin'
            }
        });
        child.once('spawn', () => {
            if (request.status === 'pending') {
                request.dispatchStatus = 'running';
                request.updatedAt = now();
                void persist();
            }
        });
        child.once('error', error => {
            if (request.status === 'pending') {
                request.dispatchStatus = 'failed';
                request.dispatchError = String(error?.message || 'Unable to start Codex CLI.').slice(0, 500);
                request.updatedAt = now();
                void persist();
            }
        });
        child.once('exit', (code, signal) => {
            closePlannerLog();
            if (request.status !== 'proposed') {
                request.dispatchStatus = 'failed';
                request.dispatchError = `Codex planner exited without returning a plan${signal ? ` (${signal})` : ` (code ${code})`}.`;
                request.updatedAt = now();
                void persist();
            }
        });
        child.once('error', closePlannerLog);
    } catch (error) {
        request.dispatchStatus = 'failed';
        request.dispatchError = String(error?.message || 'Unable to start Codex CLI.').slice(0, 500);
        request.updatedAt = now();
    }
}

function findHyperframeTemplate(templateId) {
    return hyperframeTemplates.find(template => template.id === templateId) || null;
}

function publicHyperframeTemplate(template) {
    if (!template) return null;
    return {
        id: template.id,
        name: template.name,
        nameZh: template.nameZh,
        description: template.description,
        useWhen: template.useWhen,
        tags: template.tags,
        catalogBlocks: template.catalogBlocks,
        preview: template.preview,
        defaults: template.defaults,
        presetId: template.presetId
    };
}

function findHyperframeAsset(assetId) {
    return hyperframeAssets.find(asset => asset.id === assetId) || null;
}

function publicHyperframeAsset(asset) {
    if (!asset) return null;
    return { id: asset.id, nameZh: asset.nameZh, catalogId: asset.catalogId, assetType: asset.assetType, category: asset.category, description: asset.description, narrativeReason: asset.narrativeReason || '', duration: asset.duration, presetId: asset.presetId };
}

function queueAction(project, action, input = {}, options = {}) {
    if (!supportedActions.has(action)) throw new Error(`Unsupported action: ${action}`);
    const jobId = `job_${randomUUID()}`;
    const commandId = `command_${randomUUID()}`;
    const job = {
        id: jobId,
        projectId: project.id,
        action,
        input,
        status: action === 'capture.start' || action === 'export.start' ? 'waiting_for_studio' : 'queued',
        createdAt: now(),
        updatedAt: now(),
        detail: 'Waiting for an OpenViscribe Studio connection.',
        result: null,
        commandId,
        workflowId: options.workflowId || null
    };
    const command = {
        id: commandId,
        jobId,
        projectId: project.id,
        action,
        input,
        status: 'queued',
        createdAt: now(),
        assignedClientId: null
    };
    store.jobs[jobId] = job;
    store.commands[commandId] = command;
    project.jobIds.push(jobId);
    project.updatedAt = now();
    project.status = 'running';
    return job;
}

function normalizeScript(rawScript = {}, fallback = {}) {
    const source = typeof rawScript === 'string' ? { instructions: rawScript } : (rawScript || {});
    const rawSteps = Array.isArray(source.steps)
        ? source.steps
        : String(source.instructions || source.script || '')
            .split(/\r?\n/)
            .map(line => line.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim())
            .filter(Boolean);
    if (!rawSteps.length) throw new Error('A UI script needs at least one step.');
    return {
        id: `script_${randomUUID()}`,
        title: String(source.title || fallback.title || 'Untitled UI tutorial').slice(0, 180),
        goal: String(source.goal || fallback.goal || '').slice(0, 1000),
        startUrl: String(source.startUrl || fallback.startUrl || '').slice(0, 2000),
        prerequisites: Array.isArray(source.prerequisites) ? source.prerequisites.map(value => String(value).slice(0, 500)) : [],
        narration: String(source.narration || '').slice(0, 5000),
        status: 'ready',
        createdAt: now(),
        updatedAt: now(),
        steps: rawSteps.map((step, index) => ({
            id: String(step?.id || `step_${index + 1}`),
            instruction: String(step?.instruction || step?.action || step || '').trim().slice(0, 2000),
            expected: String(step?.expected || '').trim().slice(0, 1200),
            evidence: [],
            status: 'pending',
            completedAt: null
        })).filter(step => step.instruction)
    };
}

function updateScriptStatus(script) {
    const steps = Array.isArray(script?.steps) ? script.steps : [];
    if (!steps.length) return 'ready';
    if (steps.some(step => step.status === 'failed')) return 'blocked';
    if (steps.every(step => step.status === 'completed' || step.status === 'skipped')) return 'completed';
    if (steps.some(step => step.status === 'completed' || step.status === 'running')) return 'in_progress';
    return 'ready';
}

function normalizeAllowedDomains(values, startUrl = '') {
    const domains = Array.isArray(values) ? values : String(values || '').split(/[\s,]+/);
    const normalized = domains.map(value => String(value || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '')).filter(Boolean);
    try {
        const hostname = new URL(startUrl).hostname.toLowerCase();
        if (hostname && !normalized.includes(hostname)) normalized.unshift(hostname);
    } catch { /* The agent will ask for a valid start URL before navigation. */ }
    return [...new Set(normalized)].slice(0, 30);
}

function publicBrowserTutorialRequest(request) {
    if (!request) return null;
    return {
        id: request.id,
        projectId: request.projectId,
        agent: request.agent,
        status: request.status,
        startUrl: request.startUrl,
        allowedDomains: request.allowedDomains,
        title: request.title,
        goal: request.goal,
        createdAt: request.createdAt,
        updatedAt: request.updatedAt,
        claimedBy: request.claimedBy || null,
        safety: request.safety
    };
}

function createBrowserTutorialRequest(project, input = {}) {
    const script = normalizeScript(input.script || input, { title: input.title || project.name, goal: input.goal || project.brief, startUrl: input.startUrl });
    project.script = script;
    const request = {
        id: `browser_tutorial_${randomUUID()}`,
        projectId: project.id,
        agent: String(input.agent || 'Codex').slice(0, 80),
        title: script.title,
        goal: script.goal,
        startUrl: script.startUrl,
        allowedDomains: normalizeAllowedDomains(input.allowedDomains, script.startUrl),
        status: 'pending',
        claimedBy: null,
        createdAt: now(),
        updatedAt: now(),
        safety: {
            requiresUserTakeover: ['login or password entry', 'CAPTCHA', 'payment or purchase', 'permanent deletion', 'security or permission changes', 'form submission with external impact'],
            rule: 'Do not navigate outside allowedDomains. Stop and ask the user to take over for any protected action.'
        }
    };
    project.browserTutorialRequest = request;
    project.updatedAt = now();
    const job = queueAction(project, 'script.prepare', { script });
    return { request, script, job };
}

function queueWorkflowStep(project) {
    const workflow = project?.workflow;
    if (!workflow || workflow.status !== 'running') return null;
    const step = workflow.steps[workflow.currentIndex];
    if (!step) {
        workflow.status = 'completed';
        workflow.completedAt = now();
        project.status = 'completed';
        return null;
    }
    const job = queueAction(project, step.action, step.input || {}, { workflowId: workflow.id });
    workflow.currentJobId = job.id;
    workflow.jobIds.push(job.id);
    workflow.updatedAt = now();
    return job;
}

function startTutorialWorkflow(project, input = {}) {
    if (project.workflow?.status === 'running') throw new Error('A tutorial production workflow is already running for this project.');
    if (project.script && project.script.status !== 'completed') throw new Error('Complete every UI script step before starting tutorial production.');
    const includeVoice = !!input.includeVoice;
    const workflow = {
        id: `workflow_${randomUUID()}`,
        kind: 'tutorial-production',
        status: 'running',
        createdAt: now(),
        updatedAt: now(),
        currentIndex: 0,
        currentJobId: null,
        jobIds: [],
        steps: [
            { action: 'subtitles.generate', input: {} },
            ...(includeVoice ? [{ action: 'voice.generate', input: {} }] : []),
            ...(input.autoContents === false ? [] : [{ action: 'contents.apply', input: { brief: String(input.contentsBrief || project.brief || project.topic || project.name) } }]),
            { action: 'design.apply', input: input.design || { mode: 'ai', presetId: 'signal', includeIntro: true, includeOutro: true, includeLowerThird: true } },
            { action: 'article.generate', input: {} },
            { action: 'export.start', input: input.export || { renderVideo: true, includeMarkdown: true, includeSubtitles: true, projectJson: true } }
        ]
    };
    project.workflow = workflow;
    return { workflow, job: queueWorkflowStep(project) };
}

function startAgentProductionWorkflow(project, input = {}) {
    if (project.workflow?.status === 'running') throw new Error('A production workflow is already running for this project.');
    if (project.script && project.script.status !== 'completed') throw new Error('Complete every UI script step before starting agent production.');
    const content = input.content && typeof input.content === 'object' ? input.content : null;
    const hasSubtitles = Array.isArray(content?.subtitles) && content.subtitles.length > 0;
    const hasArticle = String(content?.articleMarkdown || '').trim().length > 0;
    if (!content || (!hasSubtitles && !hasArticle)) {
        throw new Error('Agent production needs agent-authored subtitles or a finished Markdown article in content.');
    }
    const workflow = {
        id: `workflow_${randomUUID()}`,
        kind: 'agent-production',
        status: 'running',
        createdAt: now(),
        updatedAt: now(),
        currentIndex: 0,
        currentJobId: null,
        jobIds: [],
        steps: [
            { action: 'agent.content.apply', input: content },
            ...(input.autoContents === false ? [] : [{ action: 'contents.apply', input: { brief: String(input.contentsBrief || content.tutorialDescription || project.brief || project.topic || project.name) } }]),
            { action: 'design.apply', input: input.design || { mode: 'ai', presetId: 'signal', includeIntro: true, includeOutro: true, includeLowerThird: true } },
            { action: 'export.start', input: input.export || { renderVideo: true, includeMarkdown: true, includeSubtitles: true, projectJson: true } }
        ]
    };
    project.workflow = workflow;
    return { workflow, job: queueWorkflowStep(project) };
}

function updateProjectFromSnapshot(project, snapshot) {
    if (!project || !snapshot || typeof snapshot !== 'object') return;
    project.snapshot = snapshot;
    project.updatedAt = now();
    if (snapshot.phase) project.status = snapshot.phase;
}

function getNextCommand(clientId) {
    const commands = Object.values(store.commands)
        .filter(command => command.status === 'queued' && (!command.assignedClientId || command.assignedClientId === clientId))
        .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
    const command = commands[0];
    if (!command) return null;
    command.assignedClientId = clientId;
    command.status = 'delivered';
    const job = store.jobs[command.jobId];
    if (job) {
        job.status = command.action === 'capture.start' || command.action === 'export.start' ? 'waiting_for_user' : 'running';
        job.detail = command.action === 'capture.start'
            ? 'OpenViscribe is waiting for the user to approve browser capture.'
            : command.action === 'export.start'
                ? 'OpenViscribe is waiting for the user to select an export location.'
                : 'OpenViscribe is processing this action.';
        job.updatedAt = now();
    }
    return command;
}

function applyCommandResult(command, payload) {
    const job = store.jobs[command.jobId];
    if (!job) return;
    const status = String(payload.status || 'completed');
    const allowed = new Set(['completed', 'failed', 'cancelled', 'waiting_for_user', 'running']);
    job.status = allowed.has(status) ? status : 'failed';
    job.detail = String(payload.detail || '').slice(0, 1000) || job.detail;
    job.result = payload.result ?? job.result;
    job.updatedAt = now();
    command.status = job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled' ? job.status : 'delivered';
    const project = getProject(job.projectId);
    const workflow = project?.workflow;
    if (workflow && workflow.id === job.workflowId && workflow.currentJobId === job.id) {
        if (job.status === 'completed') {
            workflow.currentIndex += 1;
            workflow.updatedAt = now();
            queueWorkflowStep(project);
        } else if (job.status === 'failed' || job.status === 'cancelled') {
            workflow.status = job.status === 'cancelled' ? 'cancelled' : 'failed';
            workflow.updatedAt = now();
        }
    }
}

function openApiDocument() {
    return {
        openapi: '3.1.0',
        info: { title: 'OpenViscribe Automation API', version: '1.0.0' },
        servers: [{ url: `http://${host}:${port}` }],
        components: {
            securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer' } }
        },
        security: [{ bearerAuth: [] }],
        paths: {
            '/v1/projects': { get: { summary: 'List projects' }, post: { summary: 'Create a project and queue studio initialization' } },
            '/v1/projects/{projectId}': { get: { summary: 'Get project, jobs and latest studio snapshot' } },
            '/v1/projects/{projectId}/actions': { post: { summary: 'Queue an action for OpenViscribe Studio, including agent-authored copy and timed subtitles' } },
            '/v1/projects/{projectId}/script': { get: { summary: 'Read a UI tutorial script' }, post: { summary: 'Prepare a UI script for Computer Use recording' } },
            '/v1/projects/{projectId}/script/steps/{stepId}': { post: { summary: 'Report a Computer Use script step result' } },
            '/v1/browser-tutorial-requests': { get: { summary: 'List browser tutorial tasks waiting for an agent' } },
            '/v1/projects/{projectId}/browser-tutorial-request': { get: { summary: 'Read a browser tutorial task' }, post: { summary: 'Create a browser tutorial task from a user script' } },
            '/v1/projects/{projectId}/browser-tutorial-request/claim': { post: { summary: 'Claim a browser tutorial task before using a Browser or Computer Use tool' } },
            '/v1/projects/{projectId}/workflows/tutorial-production': { post: { summary: 'Run subtitles, narrative Contents, design, article and export in sequence' } },
            '/v1/projects/{projectId}/workflows/agent-production': { post: { summary: 'Apply agent-authored copy and subtitles, then Contents, design and export without a Studio AI provider' } },
            '/v1/hyperframes/templates': { get: { summary: 'List curated HyperFrames template recipes and preview descriptions' } },
            '/v1/hyperframes/assets': { get: { summary: 'List built-in animated HyperFrames assets such as maps, charts, console and code' } },
            '/v1/projects/{projectId}/hyperframes-template': { post: { summary: 'Apply a curated HyperFrames template recipe in Studio' } },
            '/v1/projects/{projectId}/hyperframes-assets': { post: { summary: 'Add a built-in animated HyperFrames asset to the Studio playhead' } },
            '/v1/jobs/{jobId}': { get: { summary: 'Get asynchronous job status' } },
            '/v1/jobs/{jobId}/cancel': { post: { summary: 'Cancel a queued job' } }
        }
    };
}

async function handleBridge(request, response, method, pathname, searchParams) {
    if (!isAuthorized(request)) return sendError(response, 401, 'A valid OpenViscribe API token is required for the Studio bridge.', 'unauthorized');
    if (method === 'POST' && pathname === '/v1/bridge/register') {
        const body = await readJson(request);
        const clientId = `studio_${randomUUID()}`;
        store.clients[clientId] = {
            id: clientId,
            name: String(body.name || 'OpenViscribe Studio').slice(0, 120),
            capabilities: Array.isArray(body.capabilities) ? body.capabilities : [],
            connectedAt: now(),
            lastSeenAt: now()
        };
        return sendJson(response, 201, { clientId, pollAfterMs: 700, apiVersion: '1.0.0' });
    }

    if (method === 'GET' && pathname === '/v1/bridge/commands') {
        const clientId = String(searchParams.get('clientId') || '');
        if (!store.clients[clientId]) return sendError(response, 404, 'Studio client was not found.', 'client_not_found');
        store.clients[clientId].lastSeenAt = now();
        const command = getNextCommand(clientId);
        await persist();
        return sendJson(response, 200, { command, pollAfterMs: command ? 50 : 700 });
    }

    const resultMatch = pathname.match(/^\/v1\/bridge\/commands\/([^/]+)\/result$/);
    if (method === 'POST' && resultMatch) {
        const body = await readJson(request);
        const command = store.commands[resultMatch[1]];
        if (!command) return sendError(response, 404, 'Command was not found.', 'command_not_found');
        if (command.assignedClientId && command.assignedClientId !== body.clientId) return sendError(response, 403, 'This command belongs to another studio client.', 'client_mismatch');
        applyCommandResult(command, body);
        const project = getProject(command.projectId);
        updateProjectFromSnapshot(project, body.snapshot);
        if (project) project.updatedAt = now();
        await persist();
        return sendJson(response, 200, { job: publicJob(store.jobs[command.jobId]) });
    }

    const snapshotMatch = pathname.match(/^\/v1\/bridge\/projects\/([^/]+)\/snapshot$/);
    if (method === 'POST' && snapshotMatch) {
        const body = await readJson(request);
        if (!store.clients[String(body.clientId || '')]) return sendError(response, 404, 'Studio client was not found.', 'client_not_found');
        const project = getProject(snapshotMatch[1]);
        if (!project) return sendError(response, 404, 'Project was not found.', 'project_not_found');
        updateProjectFromSnapshot(project, body.snapshot);
        await persist();
        return sendJson(response, 200, { project: publicProject(project) });
    }

    return sendError(response, 404, 'Bridge route was not found.', 'not_found');
}

async function handleApi(request, response, method, pathname, searchParams = new URLSearchParams()) {
    if (method === 'GET' && pathname === '/v1/health') {
        return sendJson(response, 200, { status: 'ok', connectedStudios: Object.keys(store.clients).length, time: now() });
    }
    if (method === 'GET' && pathname === '/v1/openapi.json') return sendJson(response, 200, openApiDocument());
    if (!isAuthorized(request)) return sendError(response, 401, 'A valid OpenViscribe API token is required.', 'unauthorized');

    // Uses the macOS speech engine on the same machine as the local API. Audio
    // stays on-device and is returned directly to the extension as WAV data.
    if (method === 'POST' && pathname === '/v1/local-tts') {
        const body = await readJson(request);
        const text = String(body.text || '').replace(/\s+/g, ' ').trim().slice(0, 800);
        if (!text) return sendError(response, 400, 'Text is required for local TTS.', 'missing_tts_text');
        const requestedVoice = String(body.voice || 'Ting-Ting').replace(/[^A-Za-z0-9_\- ]/g, '').trim();
        const voice = requestedVoice || 'Ting-Ting';
        const requestedRate = Number(body.rate);
        const rate = Number.isFinite(requestedRate) ? Math.max(110, Math.min(260, Math.round(requestedRate))) : 185;
        const temporaryDirectory = await mkdtemp(resolve(tmpdir(), 'openviscribe-tts-'));
        const outputPath = resolve(temporaryDirectory, 'speech.wav');
        try {
            await execFileAsync('/usr/bin/say', [
                '-v', voice,
                '-r', String(rate),
                '-o', outputPath,
                '--file-format=WAVE',
                '--data-format=LEI16@22050',
                text
            ], { timeout: 30_000, maxBuffer: 128 * 1024 });
            const audio = await readFile(outputPath);
            if (!audio.length) throw new Error('macOS speech engine returned an empty audio file.');
            return sendJson(response, 200, {
                audioBase64: audio.toString('base64'),
                mimeType: 'audio/wav',
                voice,
                rate
            });
        } catch (error) {
            return sendError(response, 500, `Local macOS TTS failed: ${String(error?.message || error).slice(0, 500)}`, 'local_tts_failed');
        } finally {
            await rm(temporaryDirectory, { recursive: true, force: true }).catch(() => {});
        }
    }

    if (method === 'GET' && pathname === '/v1/hyperframes/templates') {
        return sendJson(response, 200, { templates: hyperframeTemplates.map(publicHyperframeTemplate) });
    }
    if (method === 'GET' && pathname === '/v1/hyperframes/assets') {
        return sendJson(response, 200, { assets: hyperframeAssets.map(publicHyperframeAsset) });
    }

    if (method === 'GET' && pathname === '/v1/projects') {
        return sendJson(response, 200, { projects: Object.values(store.projects).map(publicProject) });
    }
    if (method === 'POST' && pathname === '/v1/projects') {
        const body = await readJson(request);
        const project = createProject(body);
        const initializationJob = body.initialize === false
            ? null
            : queueAction(project, 'project.initialize', {
                skillId: project.skillId,
                title: body.title || project.name,
                topic: body.topic || '',
                brief: body.brief || ''
            });
        await persist();
        return sendJson(response, 201, { project: publicProject(project), initializationJob: publicJob(initializationJob) });
    }

    const scriptMatch = pathname.match(/^\/v1\/projects\/([^/]+)\/script$/);
    if (scriptMatch) {
        const project = getProject(scriptMatch[1]);
        if (!project) return sendError(response, 404, 'Project was not found.', 'project_not_found');
        if (method === 'GET') return sendJson(response, 200, { script: project.script, project: publicProject(project) });
        if (method === 'POST') {
            const body = await readJson(request);
            const script = normalizeScript(body.script || body, { title: project.name, goal: body.goal, startUrl: body.startUrl });
            project.script = script;
            project.updatedAt = now();
            const job = queueAction(project, 'script.prepare', { script });
            await persist();
            return sendJson(response, 202, { script, job: publicJob(job) });
        }
    }

    const scriptStepMatch = pathname.match(/^\/v1\/projects\/([^/]+)\/script\/steps\/([^/]+)$/);
    if (method === 'POST' && scriptStepMatch) {
        const project = getProject(scriptStepMatch[1]);
        if (!project?.script) return sendError(response, 404, 'The project UI script was not found.', 'script_not_found');
        const step = project.script.steps.find(item => item.id === scriptStepMatch[2]);
        if (!step) return sendError(response, 404, 'Script step was not found.', 'script_step_not_found');
        const body = await readJson(request);
        const requestedStatus = String(body.status || 'completed');
        if (!['pending', 'running', 'completed', 'failed', 'skipped'].includes(requestedStatus)) return sendError(response, 400, 'Invalid script step status.', 'invalid_status');
        step.status = requestedStatus;
        step.evidence = Array.isArray(body.evidence) ? body.evidence.slice(0, 10).map(value => String(value).slice(0, 2000)) : step.evidence;
        step.note = String(body.note || '').slice(0, 2000);
        step.completedAt = requestedStatus === 'completed' ? now() : null;
        project.script.status = updateScriptStatus(project.script);
        project.script.updatedAt = now();
        project.updatedAt = now();
        await persist();
        return sendJson(response, 200, { script: project.script });
    }

    if (method === 'GET' && pathname === '/v1/browser-tutorial-requests') {
        const requests = Object.values(store.projects)
            .map(project => publicBrowserTutorialRequest(project.browserTutorialRequest))
            .filter(request => request && ['pending', 'claimed', 'running'].includes(request.status));
        return sendJson(response, 200, { requests });
    }

    const browserTutorialMatch = pathname.match(/^\/v1\/projects\/([^/]+)\/browser-tutorial-request$/);
    if (browserTutorialMatch) {
        const project = getProject(browserTutorialMatch[1]);
        if (!project) return sendError(response, 404, 'Project was not found.', 'project_not_found');
        if (method === 'GET') return sendJson(response, 200, { request: project.browserTutorialRequest, script: project.script, project: publicProject(project) });
        if (method === 'POST') {
            const body = await readJson(request);
            const { request: browserRequest, script, job } = createBrowserTutorialRequest(project, body);
            await persist();
            return sendJson(response, 202, { request: browserRequest, script, job: publicJob(job) });
        }
    }

    const browserTutorialClaimMatch = pathname.match(/^\/v1\/projects\/([^/]+)\/browser-tutorial-request\/claim$/);
    if (method === 'POST' && browserTutorialClaimMatch) {
        const project = getProject(browserTutorialClaimMatch[1]);
        const browserRequest = project?.browserTutorialRequest;
        if (!browserRequest) return sendError(response, 404, 'Browser tutorial request was not found.', 'browser_tutorial_not_found');
        if (browserRequest.status === 'completed' || browserRequest.status === 'cancelled') return sendError(response, 409, 'Browser tutorial request has already finished.', 'browser_tutorial_finished');
        const body = await readJson(request);
        browserRequest.status = 'claimed';
        browserRequest.claimedBy = String(body.agent || browserRequest.agent || 'Browser Agent').slice(0, 120);
        browserRequest.updatedAt = now();
        project.updatedAt = now();
        await persist();
        return sendJson(response, 200, { request: browserRequest, script: project.script });
    }

    const workflowMatch = pathname.match(/^\/v1\/projects\/([^/]+)\/workflows\/tutorial-production$/);
    if (method === 'POST' && workflowMatch) {
        const project = getProject(workflowMatch[1]);
        if (!project) return sendError(response, 404, 'Project was not found.', 'project_not_found');
        const body = await readJson(request);
        const { workflow, job } = startTutorialWorkflow(project, body);
        await persist();
        return sendJson(response, 202, { workflow, job: publicJob(job) });
    }

    const agentWorkflowMatch = pathname.match(/^\/v1\/projects\/([^/]+)\/workflows\/agent-production$/);
    if (method === 'POST' && agentWorkflowMatch) {
        const project = getProject(agentWorkflowMatch[1]);
        if (!project) return sendError(response, 404, 'Project was not found.', 'project_not_found');
        const body = await readJson(request);
        const { workflow, job } = startAgentProductionWorkflow(project, body);
        await persist();
        return sendJson(response, 202, { workflow, job: publicJob(job) });
    }

    const projectSnapshotMatch = pathname.match(/^\/v1\/projects\/([^/]+)\/snapshot$/);
    if (method === 'POST' && projectSnapshotMatch) {
        const project = getProject(projectSnapshotMatch[1]);
        if (!project) return sendError(response, 404, 'Project was not found.', 'project_not_found');
        const body = await readJson(request);
        if (!body.snapshot || typeof body.snapshot !== 'object') return sendError(response, 400, 'A project snapshot is required.', 'missing_snapshot');
        updateProjectFromSnapshot(project, body.snapshot);
        await persist();
        return sendJson(response, 200, { project: publicProject(project) });
    }

    const agentEditRequestMatch = pathname.match(/^\/v1\/projects\/([^/]+)\/agent-edit-request$/);
    if (agentEditRequestMatch) {
        const project = getProject(agentEditRequestMatch[1]);
        if (!project) return sendError(response, 404, 'Project was not found.', 'project_not_found');
        if (method === 'GET') return sendJson(response, 200, { request: project.agentEditRequest, project: publicProject(project) });
        if (method === 'POST') {
            const body = await readJson(request);
            const prompt = String(body.prompt || '').trim().slice(0, 6000);
            if (!prompt) return sendError(response, 400, 'An edit prompt is required.', 'missing_edit_prompt');
            project.agentEditRequest = {
                id: `agent_edit_${randomUUID()}`,
                prompt,
                status: 'pending',
                createdAt: now(),
                updatedAt: now(),
                requestedBy: String(body.requestedBy || 'OpenViscribe Studio').slice(0, 160),
                requestedAgent: String(body.agent || 'Codex').slice(0, 120)
            };
            project.updatedAt = now();
            await persist();
            dispatchCodexEditPlanner(project);
            await persist();
            return sendJson(response, 201, { request: project.agentEditRequest, project: publicProject(project) });
        }
    }

    // A local agent needs a discoverable queue rather than a project ID copied
    // manually from the Studio. Only pending requests are returned by default.
    if (method === 'GET' && pathname === '/v1/agent-edit-requests') {
        const requestedAgent = String(searchParams.get('agent') || '').trim().toLowerCase();
        const status = String(searchParams.get('status') || 'pending').trim().toLowerCase();
        const requests = Object.values(store.projects)
            .map(project => ({ projectId: project.id, projectName: project.name, request: project.agentEditRequest }))
            .filter(item => item.request && (!status || item.request.status === status))
            .filter(item => !requestedAgent || String(item.request.requestedAgent || 'Codex').toLowerCase() === requestedAgent)
            .sort((a, b) => String(a.request.createdAt).localeCompare(String(b.request.createdAt)));
        return sendJson(response, 200, { requests });
    }

    const agentEditClaimMatch = pathname.match(/^\/v1\/projects\/([^/]+)\/agent-edit-request\/claim$/);
    if (method === 'POST' && agentEditClaimMatch) {
        const project = getProject(agentEditClaimMatch[1]);
        const agentRequest = project?.agentEditRequest;
        if (!agentRequest) return sendError(response, 404, 'Agent edit request was not found.', 'agent_edit_not_found');
        if (agentRequest.status !== 'pending') return sendError(response, 409, 'Agent edit request has already been claimed or finished.', 'agent_edit_unavailable');
        const body = await readJson(request);
        const agent = String(body.agent || 'Codex').slice(0, 120);
        agentRequest.status = 'claimed';
        agentRequest.claimedBy = agent;
        agentRequest.claimedAt = now();
        agentRequest.updatedAt = now();
        project.updatedAt = now();
        await persist();
        return sendJson(response, 200, { project: publicProject(project), request: agentRequest });
    }

    const templateMatch = pathname.match(/^\/v1\/projects\/([^/]+)\/hyperframes-template$/);
    if (method === 'POST' && templateMatch) {
        const project = getProject(templateMatch[1]);
        if (!project) return sendError(response, 404, 'Project was not found.', 'project_not_found');
        const body = await readJson(request);
        const template = findHyperframeTemplate(String(body.templateId || ''));
        if (!template) return sendError(response, 400, 'Unknown HyperFrames template ID.', 'unknown_hyperframe_template');
        const mode = body.mode === 'manual' ? 'manual' : 'ai';
        const job = queueAction(project, 'design.apply', {
            ...template.defaults,
            presetId: template.presetId,
            templateId: template.id,
            mode,
            includeIntro: body.includeIntro ?? template.defaults.includeIntro,
            includeOutro: body.includeOutro ?? template.defaults.includeOutro,
            includeLowerThird: body.includeLowerThird ?? template.defaults.includeLowerThird,
            introDuration: body.introDuration ?? template.defaults.introDuration,
            outroDuration: body.outroDuration ?? template.defaults.outroDuration,
            cardDuration: body.cardDuration ?? template.defaults.cardDuration
        });
        await persist();
        return sendJson(response, 202, { template: publicHyperframeTemplate(template), job: publicJob(job) });
    }

    const assetMatch = pathname.match(/^\/v1\/projects\/([^/]+)\/hyperframes-assets$/);
    if (method === 'POST' && assetMatch) {
        const project = getProject(assetMatch[1]);
        if (!project) return sendError(response, 404, 'Project was not found.', 'project_not_found');
        const body = await readJson(request);
        const asset = findHyperframeAsset(String(body.assetId || ''));
        if (!asset) return sendError(response, 400, 'Unknown HyperFrames asset ID.', 'unknown_hyperframe_asset');
        const job = queueAction(project, 'design.apply', {
            assetId: asset.id,
            presetId: body.presetId || asset.presetId,
            startAt: Number.isFinite(Number(body.startAt)) ? Number(body.startAt) : undefined,
            duration: Number.isFinite(Number(body.duration)) ? Number(body.duration) : asset.duration,
            assetConfig: body.assetConfig && typeof body.assetConfig === 'object' ? body.assetConfig : undefined
        });
        await persist();
        return sendJson(response, 202, { asset: publicHyperframeAsset(asset), job: publicJob(job) });
    }

    const projectMatch = pathname.match(/^\/v1\/projects\/([^/]+)$/);
    if (method === 'GET' && projectMatch) {
        const project = getProject(projectMatch[1]);
        if (!project) return sendError(response, 404, 'Project was not found.', 'project_not_found');
        return sendJson(response, 200, { project: publicProject(project) });
    }

    const actionMatch = pathname.match(/^\/v1\/projects\/([^/]+)\/actions$/);
    if (method === 'POST' && actionMatch) {
        const project = getProject(actionMatch[1]);
        if (!project) return sendError(response, 404, 'Project was not found.', 'project_not_found');
        const body = await readJson(request);
        const action = String(body.action || '');
        if (!supportedActions.has(action) || action === 'project.initialize') return sendError(response, 400, 'Unsupported automation action.', 'invalid_action');
        if (action === 'agent.edit.propose' && project.agentEditRequest) {
            project.agentEditRequest = {
                ...project.agentEditRequest,
                status: 'proposed',
                proposedBy: String(body?.input?.agent || project.agentEditRequest.claimedBy || project.agentEditRequest.requestedAgent || 'Agent').slice(0, 120),
                dispatchStatus: 'completed',
                dispatchError: null,
                updatedAt: now()
            };
        }
        const job = queueAction(project, action, body.input || {});
        await persist();
        return sendJson(response, 202, { job: publicJob(job) });
    }

    const jobMatch = pathname.match(/^\/v1\/jobs\/([^/]+)$/);
    if (method === 'GET' && jobMatch) {
        const job = store.jobs[jobMatch[1]];
        if (!job) return sendError(response, 404, 'Job was not found.', 'job_not_found');
        return sendJson(response, 200, { job: publicJob(job) });
    }

    const cancelMatch = pathname.match(/^\/v1\/jobs\/([^/]+)\/cancel$/);
    if (method === 'POST' && cancelMatch) {
        const job = store.jobs[cancelMatch[1]];
        if (!job) return sendError(response, 404, 'Job was not found.', 'job_not_found');
        if (['completed', 'failed', 'cancelled'].includes(job.status)) return sendError(response, 409, 'This job has already finished.', 'job_finished');
        job.status = 'cancelled';
        job.detail = 'Cancelled by API client.';
        job.updatedAt = now();
        const command = store.commands[job.commandId];
        if (command) command.status = 'cancelled';
        await persist();
        return sendJson(response, 200, { job: publicJob(job) });
    }

    return sendError(response, 404, 'API route was not found.', 'not_found');
}

await loadStore();

const server = createServer(async (request, response) => {
    try {
        if (request.method === 'OPTIONS') return sendJson(response, 204, {});
        const url = new URL(request.url || '/', `http://${request.headers.host || `${host}:${port}`}`);
        if (url.pathname.startsWith('/v1/bridge/')) return await handleBridge(request, response, request.method, url.pathname, url.searchParams);
        return await handleApi(request, response, request.method, url.pathname, url.searchParams);
    } catch (error) {
        console.error('Automation API error:', error);
        return sendError(response, 500, error?.message || 'Unexpected automation API error.', 'internal_error');
    }
});

server.listen(port, host, () => {
    console.log(`OpenViscribe Automation API listening on http://${host}:${port}`);
    if (process.env.OPEN_VISCRIBE_API_TOKEN) {
        console.log('Using OPEN_VISCRIBE_API_TOKEN from the environment.');
    } else {
        console.log(`Generated API token for this session: ${apiToken}`);
        console.log('Set OPEN_VISCRIBE_API_TOKEN before starting the API to use a stable Codex MCP connection.');
    }
});
