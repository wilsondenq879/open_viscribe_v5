import { useCallback, useEffect, useRef, useState } from 'react';

const DEFAULT_API_URL = 'http://127.0.0.1:4318';

function normalizeBaseUrl(value) {
    return String(value || DEFAULT_API_URL).trim().replace(/\/+$/, '') || DEFAULT_API_URL;
}

async function fetchJson(url, options = {}) {
    const response = await fetch(url, options);
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload?.error?.message || `Automation bridge HTTP ${response.status}`);
    return payload;
}

const wait = (milliseconds) => new Promise(resolve => setTimeout(resolve, milliseconds));

export default function useAutomationBridge({ enabled, baseUrl, token, clientName = 'OpenViscribe Studio' }) {
    const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
    const normalizedToken = String(token || '').trim();
    const [bridgeState, setBridgeState] = useState({ phase: 'disabled', detail: 'Automation API is disabled.', clientId: '' });
    const clientIdRef = useRef('');
    const commandHandlerRef = useRef(null);
    const latestBaseUrlRef = useRef(normalizedBaseUrl);
    const latestTokenRef = useRef(normalizedToken);

    useEffect(() => {
        latestBaseUrlRef.current = normalizedBaseUrl;
    }, [normalizedBaseUrl]);

    useEffect(() => {
        latestTokenRef.current = normalizedToken;
    }, [normalizedToken]);

    const bridgeHeaders = useCallback(() => ({
        'Content-Type': 'application/json',
        'X-OpenViscribe-Token': latestTokenRef.current
    }), []);

    const setCommandHandler = useCallback((handler) => {
        commandHandlerRef.current = handler;
    }, []);

    const reportCommandResult = useCallback(async (commandId, payload = {}) => {
        const clientId = clientIdRef.current;
        if (!clientId || !commandId) return null;
        return fetchJson(`${latestBaseUrlRef.current}/v1/bridge/commands/${encodeURIComponent(commandId)}/result`, {
            method: 'POST',
            headers: bridgeHeaders(),
            body: JSON.stringify({ clientId, ...payload })
        });
    }, [bridgeHeaders]);

    const reportSnapshot = useCallback(async (projectId, snapshot) => {
        const clientId = clientIdRef.current;
        if (!clientId || !projectId || !snapshot) return null;
        return fetchJson(`${latestBaseUrlRef.current}/v1/bridge/projects/${encodeURIComponent(projectId)}/snapshot`, {
            method: 'POST',
            headers: bridgeHeaders(),
            body: JSON.stringify({ clientId, snapshot })
        });
    }, [bridgeHeaders]);

    useEffect(() => {
        if (!enabled) {
            clientIdRef.current = '';
            setBridgeState({ phase: 'disabled', detail: 'Automation API is disabled.', clientId: '' });
            return undefined;
        }
        if (!normalizedToken) {
            clientIdRef.current = '';
            setBridgeState({ phase: 'offline', detail: 'Enter the local Automation API token in Settings to connect.', clientId: '' });
            return undefined;
        }

        let active = true;
        let pollAfterMs = 700;
        let clientId = '';

        const run = async () => {
            while (active) {
                try {
                    if (!clientId) {
                        setBridgeState({ phase: 'connecting', detail: 'Connecting to local Automation API…', clientId: '' });
                        const registration = await fetchJson(`${normalizedBaseUrl}/v1/bridge/register`, {
                            method: 'POST',
                            headers: bridgeHeaders(),
                            body: JSON.stringify({
                                name: clientName,
                                capabilities: ['recording', 'subtitles', 'article', 'voice', 'motion-design', 'export']
                            })
                        });
                        clientId = registration.clientId;
                        clientIdRef.current = clientId;
                        pollAfterMs = registration.pollAfterMs || 700;
                        setBridgeState({ phase: 'connected', detail: 'Connected to local Automation API.', clientId });
                    }

                    const next = await fetchJson(`${normalizedBaseUrl}/v1/bridge/commands?clientId=${encodeURIComponent(clientId)}`, { headers: bridgeHeaders() });
                    pollAfterMs = next.pollAfterMs || 700;
                    if (next.command && commandHandlerRef.current) {
                        const command = next.command;
                        try {
                            const result = await commandHandlerRef.current(command);
                            await reportCommandResult(command.id, result || { status: 'completed' });
                        } catch (error) {
                            await reportCommandResult(command.id, { status: 'failed', detail: error?.message || String(error) });
                        }
                    }
                } catch (error) {
                    clientId = '';
                    clientIdRef.current = '';
                    setBridgeState({ phase: 'offline', detail: error?.message || 'Automation API is not reachable.', clientId: '' });
                    pollAfterMs = 2500;
                }
                await wait(pollAfterMs);
            }
        };

        void run();
        return () => {
            active = false;
            clientIdRef.current = '';
        };
    }, [bridgeHeaders, clientName, enabled, normalizedBaseUrl, normalizedToken, reportCommandResult]);

    return { bridgeState, reportCommandResult, reportSnapshot, setCommandHandler };
}
