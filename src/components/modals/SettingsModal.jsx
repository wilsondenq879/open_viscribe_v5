import { RefreshCw, Settings } from 'lucide-react';
import {
    AI_FEATURE_PROVIDER_FIELDS,
    AI_PROVIDER_TABS,
    GEMINI_MODEL_OPTIONS,
    LOCAL_OLLAMA_ENDPOINT
} from '../../constants/appConstants';
import { getFeatureProvider, normalizeOllamaTimeoutSeconds } from '../../lib/providerUtils';

function ModelSelectField({
    label,
    value,
    options,
    state,
    onRefresh,
    onChange,
    placeholder,
    emptyLabel
}) {
    const hasCurrentValue = !!String(value || '').trim();
    const currentOptionMissing = hasCurrentValue && !options.some((option) => option.value === value);
    const toneClass = state?.phase === 'error'
        ? 'text-rose-200'
        : state?.phase === 'success'
            ? 'text-emerald-200'
            : 'text-gray-400';

    return (
        <div>
            <div className="mb-1.5 flex items-center justify-between gap-3">
                <label className="block text-xs text-gray-400">{label}</label>
                <button
                    type="button"
                    onClick={onRefresh}
                    disabled={state?.phase === 'loading'}
                    className={`inline-flex items-center gap-1 rounded-lg border border-gray-600 px-2.5 py-1 text-[11px] text-gray-300 transition hover:border-blue-500 hover:text-white ${state?.phase === 'loading' ? 'cursor-wait opacity-70' : ''}`}
                >
                    <RefreshCw className={`h-3.5 w-3.5 ${state?.phase === 'loading' ? 'animate-spin' : ''}`} />
                    {state?.phase === 'loading' ? '讀取中' : '重新整理'}
                </button>
            </div>
            <select
                value={currentOptionMissing ? `__current__:${value}` : (value || '')}
                onChange={(e) => {
                    const nextValue = e.target.value.startsWith('__current__:') ? value : e.target.value;
                    onChange(nextValue);
                }}
                className="w-full bg-gray-900 border border-gray-600 rounded-xl px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none"
            >
                <option value="">{emptyLabel}</option>
                {currentOptionMissing && (
                    <option value={`__current__:${value}`}>目前值: {value}</option>
                )}
                {options.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                ))}
            </select>
            <input
                type="text"
                value={value || ''}
                onChange={(e) => onChange(e.target.value)}
                placeholder={placeholder}
                className="mt-2 w-full bg-gray-900 border border-gray-600 rounded-xl px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none"
            />
            <div className={`mt-1 text-[11px] leading-5 ${toneClass}`}>
                {state?.detail || '可從 server 端模型清單選擇，也可手動輸入模型 ID。'}
            </div>
        </div>
    );
}

export default function SettingsModal({
    show,
    settings,
    setSettings,
    lmStudioModelCatalog,
    lmStudioTimeoutSeconds,
    lmStudioTestState,
    ollamaModelCatalog,
    ollamaTimeoutSeconds,
    ollamaTestState,
    refreshLmStudioModels,
    refreshOllamaModels,
    updateOllamaEndpoint,
    updateOllamaLocalhostMode,
    updateRippleEnabled,
    testLmStudioConnection,
    testOllamaConnection,
    onSave
}) {
    if (!show) return null;

    const updateLmStudioConnectionField = (field, value) => {
        const nextSettings = {
            ...settings,
            [field]: value
        };
        const protocol = String(field === 'lmStudioProtocol' ? value : (nextSettings.lmStudioProtocol || 'http')).trim() || 'http';
        const host = String(field === 'lmStudioHost' ? value : (nextSettings.lmStudioHost || '')).trim();
        const port = String(field === 'lmStudioPort' ? value : (nextSettings.lmStudioPort || '')).trim();
        nextSettings.lmStudioEndpoint = `${protocol}://${host}${port ? `:${port}` : ''}`;
        setSettings(nextSettings);
    };

    const updateLmStudioEndpoint = (value) => {
        const nextSettings = {
            ...settings,
            lmStudioEndpoint: value
        };
        try {
            const parsed = new URL(String(value || '').trim());
            nextSettings.lmStudioProtocol = parsed.protocol.replace(/:$/, '') || nextSettings.lmStudioProtocol || 'http';
            nextSettings.lmStudioHost = parsed.hostname || nextSettings.lmStudioHost || '';
            nextSettings.lmStudioPort = parsed.port || nextSettings.lmStudioPort || '';
        } catch (error) {}
        setSettings(nextSettings);
    };

    return (
        <div className="fixed inset-0 bg-black/80 z-[4000] flex items-center justify-center backdrop-blur-sm">
            <div className="bg-gray-800 p-6 rounded-2xl w-[44rem] max-w-[calc(100vw-2rem)] max-h-[calc(100vh-2rem)] overflow-y-auto shadow-2xl border border-gray-700">
                <h2 className="text-xl font-bold mb-5 flex items-center"><Settings className="mr-2" /> 專案與 AI 設定</h2>

                <div className="space-y-5">
                    <div className="rounded-2xl border border-gray-700 bg-gray-900/50 p-4">
                        <div className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-400 mb-3">AI 功能預設供應商</div>
                        <div className="grid grid-cols-2 gap-4">
                            {AI_FEATURE_PROVIDER_FIELDS.map((feature) => (
                                <div key={feature.key}>
                                    <label className="block text-xs text-gray-400 mb-1.5">{feature.label}</label>
                                    <select
                                        value={getFeatureProvider(settings, feature.key)}
                                        onChange={(e) => setSettings({ ...settings, [feature.key]: e.target.value })}
                                        className="w-full bg-gray-900 border border-gray-600 rounded-xl px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none"
                                    >
                                        {AI_PROVIDER_TABS.map((provider) => (
                                            <option key={provider.key} value={provider.key}>{provider.label}</option>
                                        ))}
                                    </select>
                                </div>
                            ))}
                        </div>
                        <div className="mt-3 rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs leading-5 text-amber-100">
                            這裡決定每個功能真正執行時要用哪個 AI。上方 Provider 分頁只是在切換你現在要編輯哪一組設定。
                        </div>
                    </div>

                    <div className="rounded-2xl border border-gray-700 bg-gray-900/50 p-4">
                        <div className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-400 mb-3">AI Provider</div>
                        <div className="inline-flex w-full rounded-2xl border border-gray-700 bg-gray-950/70 p-1 mb-4">
                            {AI_PROVIDER_TABS.map((provider) => {
                                const isActive = (settings.aiProvider || 'azure') === provider.key;
                                return (
                                    <button
                                        key={provider.key}
                                        type="button"
                                        onClick={() => setSettings({ ...settings, aiProvider: provider.key })}
                                        className={`flex-1 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${isActive ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/30' : 'text-gray-300 hover:bg-gray-800 hover:text-white'}`}
                                    >
                                        {provider.label}
                                    </button>
                                );
                            })}
                        </div>

                        {settings.aiProvider === 'gemini' && (
                            <div className="space-y-4">
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs text-gray-400 mb-1.5">Gemini API Key</label>
                                        <input
                                            type="password"
                                            value={settings.apiKey || ''}
                                            onChange={(e) => setSettings({ ...settings, apiKey: e.target.value })}
                                            className="w-full bg-gray-900 border border-gray-600 rounded-xl px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none"
                                            placeholder="輸入 Gemini API Key"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs text-gray-400 mb-1.5">AI 模型</label>
                                        <select value={settings.model} onChange={(e) => setSettings({ ...settings, model: e.target.value })} className="w-full bg-gray-900 border border-gray-600 rounded-xl px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none">
                                            {GEMINI_MODEL_OPTIONS.map((option) => (
                                                <option key={option.value} value={option.value}>{option.label}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-xs text-gray-400 mb-1.5">Gemini TTS 模型</label>
                                    <input
                                        type="text"
                                        value={settings.geminiTtsModel || ''}
                                        onChange={(e) => setSettings({ ...settings, geminiTtsModel: e.target.value })}
                                        className="w-full bg-gray-900 border border-gray-600 rounded-xl px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none"
                                        placeholder="例如: gemini-2.5-flash-preview-tts"
                                    />
                                </div>
                                <div className="rounded-xl border border-blue-500/20 bg-blue-500/10 px-3 py-2 text-xs leading-5 text-blue-100">
                                    Gemini 的文字 / Vision 與 TTS 可分開設定。AI字幕、文章、語音會各自讀取你上方設定的預設供應商。
                                </div>
                            </div>
                        )}

                        {settings.aiProvider === 'azure' && (
                            <div className="space-y-4">
                                <div className="grid grid-cols-3 gap-4">
                                    <div>
                                        <label className="block text-xs text-gray-400 mb-1.5">Azure Vision API Key</label>
                                        <input type="password" value={settings.azureVisionKey || settings.apiKey || ''} onChange={(e) => setSettings({ ...settings, azureVisionKey: e.target.value })} placeholder="輸入 Azure Vision API Key" className="w-full bg-gray-900 border border-gray-600 rounded-xl px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none" />
                                    </div>
                                    <div>
                                        <label className="block text-xs text-gray-400 mb-1.5">Azure Chat API Key</label>
                                        <input type="password" value={settings.azureChatKey || ''} onChange={(e) => setSettings({ ...settings, azureChatKey: e.target.value })} placeholder="未填則沿用 Vision Key" className="w-full bg-gray-900 border border-gray-600 rounded-xl px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none" />
                                    </div>
                                    <div>
                                        <label className="block text-xs text-gray-400 mb-1.5">Azure TTS API Key</label>
                                        <input type="password" value={settings.azureTtsKey || ''} onChange={(e) => setSettings({ ...settings, azureTtsKey: e.target.value })} placeholder="未填則沿用 Chat / Vision Key" className="w-full bg-gray-900 border border-gray-600 rounded-xl px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none" />
                                    </div>
                                </div>
                                <div className="grid grid-cols-3 gap-4">
                                    <div>
                                        <label className="block text-xs text-gray-400 mb-1.5">Vision Endpoint</label>
                                        <input type="text" value={settings.azureVisionEndpoint || settings.azureEndpoint || ''} onChange={(e) => setSettings({ ...settings, azureVisionEndpoint: e.target.value })} placeholder="https://vision-resource.openai.azure.com/" className="w-full bg-gray-900 border border-gray-600 rounded-xl px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none" />
                                    </div>
                                    <div>
                                        <label className="block text-xs text-gray-400 mb-1.5">Chat Endpoint</label>
                                        <input type="text" value={settings.azureChatEndpoint || settings.azureEndpoint || settings.azureVisionEndpoint || ''} onChange={(e) => setSettings({ ...settings, azureChatEndpoint: e.target.value })} placeholder="https://chat-resource.openai.azure.com/" className="w-full bg-gray-900 border border-gray-600 rounded-xl px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none" />
                                    </div>
                                    <div>
                                        <label className="block text-xs text-gray-400 mb-1.5">TTS Endpoint</label>
                                        <input type="text" value={settings.azureTtsEndpoint || ''} onChange={(e) => setSettings({ ...settings, azureTtsEndpoint: e.target.value })} placeholder="https://tts-resource.openai.azure.com/" className="w-full bg-gray-900 border border-gray-600 rounded-xl px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none" />
                                    </div>
                                </div>
                                <div className="grid grid-cols-3 gap-4">
                                    <div>
                                        <label className="block text-xs text-gray-400 mb-1.5">Vision 部署名稱</label>
                                        <input type="text" value={settings.azureDeployment || ''} onChange={(e) => setSettings({ ...settings, azureDeployment: e.target.value })} placeholder="如: gpt-4o" className="w-full bg-gray-900 border border-gray-600 rounded-xl px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none" />
                                    </div>
                                    <div>
                                        <label className="block text-xs text-gray-400 mb-1.5">Chat 部署名稱</label>
                                        <input type="text" value={settings.azureChatDeployment || settings.azureDeployment || ''} onChange={(e) => setSettings({ ...settings, azureChatDeployment: e.target.value })} placeholder="如: gpt-4.1 / gpt-5-mini" className="w-full bg-gray-900 border border-gray-600 rounded-xl px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none" />
                                    </div>
                                    <div>
                                        <label className="block text-xs text-gray-400 mb-1.5">TTS 部署名稱</label>
                                        <input type="text" value={settings.azureTtsDeployment || ''} onChange={(e) => setSettings({ ...settings, azureTtsDeployment: e.target.value })} placeholder="如: tts-1" className="w-full bg-gray-900 border border-gray-600 rounded-xl px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none" />
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs text-gray-400 mb-1.5">STT 部署名稱</label>
                                        <input type="text" value={settings.azureSttDeployment || ''} onChange={(e) => setSettings({ ...settings, azureSttDeployment: e.target.value })} placeholder="如: whisper-1" className="w-full bg-gray-900 border border-gray-600 rounded-xl px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none" />
                                    </div>
                                    <div>
                                        <label className="block text-xs text-gray-400 mb-1.5">Azure STT API Key</label>
                                        <input type="password" value={settings.azureSttKey || ''} onChange={(e) => setSettings({ ...settings, azureSttKey: e.target.value })} placeholder="未填則沿用 Vision Key" className="w-full bg-gray-900 border border-gray-600 rounded-xl px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none" />
                                    </div>
                                </div>
                                <div className="rounded-xl border border-blue-500/20 bg-blue-500/10 px-3 py-2 text-xs leading-5 text-blue-100">
                                    AI 字幕會使用 Vision 設定；文章生成會優先使用 Chat 設定。若 Chat 欄位留空，會自動 fallback 到既有 Vision / Azure 預設值。
                                </div>
                            </div>
                        )}

                        {settings.aiProvider === 'lmstudio' && (
                            <div className="space-y-4">
                                <div className="grid grid-cols-3 gap-4">
                                    <div>
                                        <label className="block text-xs text-gray-400 mb-1.5">Protocol</label>
                                        <select
                                            value={settings.lmStudioProtocol || 'http'}
                                            onChange={(e) => updateLmStudioConnectionField('lmStudioProtocol', e.target.value)}
                                            className="w-full bg-gray-900 border border-gray-600 rounded-xl px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none"
                                        >
                                            <option value="http">http</option>
                                            <option value="https">https</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-xs text-gray-400 mb-1.5">LM Studio Host</label>
                                        <input
                                            type="text"
                                            value={settings.lmStudioHost || ''}
                                            onChange={(e) => updateLmStudioConnectionField('lmStudioHost', e.target.value)}
                                            placeholder="192.168.51.121"
                                            className="w-full bg-gray-900 border border-gray-600 rounded-xl px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs text-gray-400 mb-1.5">LM Studio Port</label>
                                        <input
                                            type="text"
                                            value={settings.lmStudioPort || ''}
                                            onChange={(e) => updateLmStudioConnectionField('lmStudioPort', e.target.value)}
                                            placeholder="1234"
                                            className="w-full bg-gray-900 border border-gray-600 rounded-xl px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none"
                                        />
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs text-gray-400 mb-1.5">Base URL</label>
                                        <input
                                            type="text"
                                            value={settings.lmStudioEndpoint || ''}
                                            onChange={(e) => updateLmStudioEndpoint(e.target.value)}
                                            placeholder="http://192.168.51.121:1234"
                                            className="w-full bg-gray-900 border border-gray-600 rounded-xl px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none"
                                        />
                                        <div className="mt-1 text-[11px] text-gray-500 leading-5">
                                            目前會用 OpenAI-compatible `/v1/chat/completions`。
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-xs text-gray-400 mb-1.5">API Key（選填）</label>
                                        <input
                                            type="password"
                                            value={settings.lmStudioApiKey || ''}
                                            onChange={(e) => setSettings({ ...settings, lmStudioApiKey: e.target.value })}
                                            placeholder="留空通常也可用"
                                            className="w-full bg-gray-900 border border-gray-600 rounded-xl px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none"
                                        />
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <ModelSelectField
                                        label="Vision 模型"
                                        value={settings.lmStudioVisionModel || ''}
                                        options={lmStudioModelCatalog?.options || []}
                                        state={lmStudioModelCatalog}
                                        onRefresh={refreshLmStudioModels}
                                        onChange={(value) => setSettings({ ...settings, lmStudioVisionModel: value })}
                                        placeholder="例如: qwen2.5-vl-7b-instruct"
                                        emptyLabel="請選擇 LM Studio 模型"
                                    />
                                    <ModelSelectField
                                        label="文字 / Chat 模型"
                                        value={settings.lmStudioChatModel || ''}
                                        options={lmStudioModelCatalog?.options || []}
                                        state={lmStudioModelCatalog}
                                        onRefresh={refreshLmStudioModels}
                                        onChange={(value) => setSettings({ ...settings, lmStudioChatModel: value })}
                                        placeholder="例如: qwen2.5-7b-instruct"
                                        emptyLabel="請選擇 LM Studio 模型"
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs text-gray-400 mb-1.5">Timeout（秒）</label>
                                        <input
                                            type="number"
                                            min="30"
                                            max="600"
                                            step="10"
                                            value={lmStudioTimeoutSeconds}
                                            onChange={(e) => setSettings({ ...settings, lmStudioTimeoutSeconds: normalizeOllamaTimeoutSeconds(e.target.value) })}
                                            className="w-full bg-gray-900 border border-gray-600 rounded-xl px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none"
                                        />
                                        <div className="mt-1 text-[11px] text-gray-500 leading-5">
                                            預設 180 秒。多圖 Vision 或模型冷啟動時可調高。
                                        </div>
                                    </div>
                                    <div className="rounded-xl border border-sky-500/20 bg-sky-500/10 px-3 py-2.5 text-xs leading-5 text-sky-100">
                                        第一版先支援 Chat / Vision。TTS 與 STT 目前仍會保留為未支援狀態，避免設定與實際能力不一致。
                                    </div>
                                </div>
                                <div className="flex flex-wrap items-center gap-3">
                                    <button
                                        type="button"
                                        onClick={() => testLmStudioConnection('vision')}
                                        className="rounded-xl bg-sky-600 hover:bg-sky-700 px-4 py-2 text-sm font-semibold text-white transition"
                                    >
                                        測試 Vision 模型
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => testLmStudioConnection('chat')}
                                        className="rounded-xl bg-emerald-600 hover:bg-emerald-700 px-4 py-2 text-sm font-semibold text-white transition"
                                    >
                                        測試 Chat 模型
                                    </button>
                                    <div className="text-xs text-gray-400">
                                        會測試目前設定的 LM Studio Base URL 與模型是否可回傳 JSON。
                                    </div>
                                </div>
                                {lmStudioTestState.vision.phase !== 'idle' && (
                                    <div className={`rounded-xl px-3 py-2.5 text-xs leading-5 ${
                                        lmStudioTestState.vision.phase === 'success'
                                            ? 'border border-sky-500/20 bg-sky-500/10 text-sky-100'
                                            : lmStudioTestState.vision.phase === 'error'
                                                ? 'border border-rose-500/20 bg-rose-500/10 text-rose-100'
                                                : 'border border-amber-500/20 bg-amber-500/10 text-amber-100'
                                    }`}>
                                        {lmStudioTestState.vision.detail}
                                    </div>
                                )}
                                {lmStudioTestState.chat.phase !== 'idle' && (
                                    <div className={`rounded-xl px-3 py-2.5 text-xs leading-5 ${
                                        lmStudioTestState.chat.phase === 'success'
                                            ? 'border border-emerald-500/20 bg-emerald-500/10 text-emerald-100'
                                            : lmStudioTestState.chat.phase === 'error'
                                                ? 'border border-rose-500/20 bg-rose-500/10 text-rose-100'
                                                : 'border border-amber-500/20 bg-amber-500/10 text-amber-100'
                                    }`}>
                                        {lmStudioTestState.chat.detail}
                                    </div>
                                )}
                            </div>
                        )}

                        {settings.aiProvider === 'ollama' && (
                            <div className="space-y-4">
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs text-gray-400 mb-1.5">Ollama Endpoint</label>
                                        <input
                                            type="text"
                                            value={settings.ollamaEndpoint || ''}
                                            onChange={(e) => updateOllamaEndpoint(e.target.value)}
                                            placeholder="http://192.168.51.148:11434"
                                            disabled={!!settings.ollamaUseLocalhost}
                                            className={`w-full bg-gray-900 border border-gray-600 rounded-xl px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none ${settings.ollamaUseLocalhost ? 'opacity-60 cursor-not-allowed' : ''}`}
                                        />
                                        <label className="mt-2 flex items-center gap-2 text-xs text-gray-300">
                                            <input
                                                type="checkbox"
                                                checked={!!settings.ollamaUseLocalhost}
                                                onChange={(e) => updateOllamaLocalhostMode(e.target.checked)}
                                                className="h-4 w-4 rounded accent-blue-500"
                                            />
                                            <span>本機 Ollama</span>
                                        </label>
                                        <div className="mt-1 text-[11px] text-gray-500 leading-5">
                                            勾選後會自動改用 `{LOCAL_OLLAMA_ENDPOINT}`；取消勾選會恢復你原本的自訂 Endpoint。
                                        </div>
                                    </div>
                                    <ModelSelectField
                                        label="Vision 模型"
                                        value={settings.ollamaVisionModel || ''}
                                        options={ollamaModelCatalog?.options || []}
                                        state={ollamaModelCatalog}
                                        onRefresh={refreshOllamaModels}
                                        onChange={(value) => setSettings({ ...settings, ollamaVisionModel: value })}
                                        placeholder="例如: gemma4:e4b"
                                        emptyLabel="請選擇 Ollama 模型"
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <ModelSelectField
                                        label="文字 / Chat 模型"
                                        value={settings.ollamaChatModel || ''}
                                        options={ollamaModelCatalog?.options || []}
                                        state={ollamaModelCatalog}
                                        onRefresh={refreshOllamaModels}
                                        onChange={(value) => setSettings({ ...settings, ollamaChatModel: value })}
                                        placeholder="例如: gemma4:e4b"
                                        emptyLabel="請選擇 Ollama 模型"
                                    />
                                    <div>
                                        <label className="block text-xs text-gray-400 mb-1.5">Timeout（秒）</label>
                                        <input
                                            type="number"
                                            min="30"
                                            max="600"
                                            step="10"
                                            value={ollamaTimeoutSeconds}
                                            onChange={(e) => setSettings({ ...settings, ollamaTimeoutSeconds: normalizeOllamaTimeoutSeconds(e.target.value) })}
                                            className="w-full bg-gray-900 border border-gray-600 rounded-xl px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none"
                                        />
                                        <div className="mt-1 text-[11px] text-gray-500 leading-5">
                                            預設 180 秒。Vision 多圖分析或模型首次載入較慢時可適度調高。
                                        </div>
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-2.5 text-xs leading-5 text-emerald-100">
                                        建議把 Vision 與文字模型拆開設定，未來串接本地 AI 流程時會比較好維護。
                                    </div>
                                </div>
                                <div className="flex flex-wrap items-center gap-3">
                                    <button
                                        type="button"
                                        onClick={() => testOllamaConnection('vision')}
                                        className="rounded-xl bg-sky-600 hover:bg-sky-700 px-4 py-2 text-sm font-semibold text-white transition"
                                    >
                                        測試 Vision 模型
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => testOllamaConnection('chat')}
                                        className="rounded-xl bg-emerald-600 hover:bg-emerald-700 px-4 py-2 text-sm font-semibold text-white transition"
                                    >
                                        測試 Chat 模型
                                    </button>
                                    <div className="text-xs text-gray-400">
                                        兩個按鈕會分別測目前設定的 Vision 與 Chat 模型。
                                    </div>
                                </div>
                                {ollamaTestState.vision.phase !== 'idle' && (
                                    <div className={`rounded-xl px-3 py-2.5 text-xs leading-5 ${
                                        ollamaTestState.vision.phase === 'success'
                                            ? 'border border-sky-500/20 bg-sky-500/10 text-sky-100'
                                            : ollamaTestState.vision.phase === 'error'
                                                ? 'border border-rose-500/20 bg-rose-500/10 text-rose-100'
                                                : 'border border-amber-500/20 bg-amber-500/10 text-amber-100'
                                    }`}>
                                        {ollamaTestState.vision.detail}
                                    </div>
                                )}
                                {ollamaTestState.chat.phase !== 'idle' && (
                                    <div className={`rounded-xl px-3 py-2.5 text-xs leading-5 ${
                                        ollamaTestState.chat.phase === 'success'
                                            ? 'border border-emerald-500/20 bg-emerald-500/10 text-emerald-100'
                                            : ollamaTestState.chat.phase === 'error'
                                                ? 'border border-rose-500/20 bg-rose-500/10 text-rose-100'
                                                : 'border border-amber-500/20 bg-amber-500/10 text-amber-100'
                                    }`}>
                                        {ollamaTestState.chat.detail}
                                    </div>
                                )}
                                <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2.5 text-xs leading-5 text-amber-100">
                                    本地 Ollama 推論會直接吃你的 CPU / RAM。若模型太大、第一次載入或資源不足，Edge 可能整個變慢、風扇狂轉，這通常是本地模型忙碌，不只是前端畫面卡住。
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="rounded-2xl border border-gray-700 bg-gray-900/50 p-4">
                        <div className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-400 mb-3">Global</div>
                        <div className="space-y-4">
                            <div className="grid grid-cols-[1.4fr_1fr_1fr] gap-4">
                                <div>
                                    <label className="block text-xs text-gray-400 mb-1.5">AI 語言預設</label>
                                    <select value={settings.language} onChange={(e) => setSettings({ ...settings, language: e.target.value })} className="w-full bg-gray-900 border border-gray-600 rounded-xl px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none">
                                        <option value="en">English (英文)</option>
                                        <option value="zh-TW">繁體中文</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs text-gray-400 mb-1.5">錄影解析度</label>
                                    <select value={settings.resolution} onChange={(e) => setSettings({ ...settings, resolution: e.target.value })} className="w-full bg-gray-900 border border-gray-600 rounded-xl px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none">
                                        <option value="1080p">1080p</option>
                                        <option value="720p">720p</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs text-gray-400 mb-1.5">畫布比例</label>
                                    <select value={settings.aspectRatio} onChange={(e) => setSettings({ ...settings, aspectRatio: e.target.value })} className="w-full bg-gray-900 border border-gray-600 rounded-xl px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none">
                                        <option value="16:9">16:9</option>
                                        <option value="9:16">9:16</option>
                                    </select>
                                </div>
                            </div>

                            <label className="flex items-center justify-between gap-4 rounded-xl border border-gray-700 bg-gray-950/50 px-4 py-3 cursor-pointer hover:bg-gray-900 transition">
                                <div className="pr-3">
                                    <div className="text-sm font-semibold text-white">全域點擊追蹤</div>
                                    <div className="text-xs text-gray-400 leading-5 mt-1">開啟後靜默記錄所有點擊事件（不影響錄影畫面），供生成文章截圖時自動標注紅色框框。</div>
                                </div>
                                <input
                                    type="checkbox"
                                    checked={!!settings.clickRippleEnabled}
                                    onChange={(e) => {
                                        updateRippleEnabled(e.target.checked);
                                    }}
                                    className="w-4 h-4 shrink-0 accent-red-500 bg-gray-900 border-gray-600 rounded"
                                />
                            </label>
                            <div className="mt-3">
                                <label className="block text-xs text-gray-400 mb-1">
                                    點擊框框 Y 軸偏移補正 <span className="text-gray-500">（像素，解決紅框位置偏移問題）</span>
                                </label>
                                <div className="flex items-center gap-3">
                                    <input
                                        type="range"
                                        min="-60"
                                        max="200"
                                        step="1"
                                        value={Number(settings.clickHighlightOffsetY) || 0}
                                        onChange={(e) => setSettings({ ...settings, clickHighlightOffsetY: Number(e.target.value) })}
                                        className="flex-1 accent-red-500"
                                    />
                                    <span className="text-xs text-white w-12 text-right">{Number(settings.clickHighlightOffsetY) || 0} px</span>
                                </div>
                                <div className="text-[11px] text-gray-500 mt-1">
                                    若錄影來源是整個瀏覽器視窗（含網址列），約設 120–140。只錄分頁內容則設 0。
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="mt-6 border-t border-gray-700 pt-4">
                    <div className="flex justify-end space-x-3">
                        <button onClick={onSave} className="bg-blue-600 hover:bg-blue-700 px-6 py-2 rounded text-sm font-medium transition">儲存設定</button>
                    </div>
                    <div className="mt-4 text-center text-xs text-gray-400 space-y-1">
                        <div>Version 4.0</div>
                        <div>Author: Wilsondenq879</div>
                    </div>
                </div>
            </div>
        </div>
    );
}
