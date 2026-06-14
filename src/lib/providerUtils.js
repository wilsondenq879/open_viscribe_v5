import { AI_PROVIDER_TABS } from '../constants/appConstants';

export function normalizeOllamaTimeoutSeconds(value) {
    const num = Number(value);
    if (!Number.isFinite(num)) return 180;
    return Math.min(600, Math.max(30, Math.round(num)));
}

export function getProviderLabel(provider) {
    return AI_PROVIDER_TABS.find((item) => item.key === provider)?.label || provider;
}

export function getFeatureProvider(settings, field) {
    return settings?.[field] || settings?.aiProvider || 'azure';
}

export function getProviderModelLabel(settings, feature) {
    if (feature === 'subtitle') {
        const provider = getFeatureProvider(settings, 'subtitleProvider');
        if (provider === 'azure') return settings?.azureDeployment || '未設定 Vision 部署';
        if (provider === 'gemini') return settings?.model || '未設定 Gemini 模型';
        if (provider === 'lmstudio') return settings?.lmStudioVisionModel || '未設定 LM Studio Vision 模型';
        return settings?.ollamaVisionModel || '未設定 Ollama Vision 模型';
    }
    if (feature === 'article') {
        const provider = getFeatureProvider(settings, 'articleProvider');
        if (provider === 'azure') return settings?.azureChatDeployment || settings?.azureDeployment || '未設定 Azure Chat 部署';
        if (provider === 'gemini') return settings?.model || '未設定 Gemini 模型';
        if (provider === 'lmstudio') return settings?.lmStudioChatModel || '未設定 LM Studio Chat 模型';
        return settings?.ollamaChatModel || '未設定 Ollama Chat 模型';
    }
    if (feature === 'ui-debug') {
        const provider = getFeatureProvider(settings, 'uiDebugProvider');
        if (provider === 'azure') return settings?.azureDeployment || '未設定 Vision 部署';
        if (provider === 'gemini') return settings?.model || '未設定 Gemini 模型';
        if (provider === 'lmstudio') return settings?.lmStudioChatModel || '未設定 LM Studio Chat 模型';
        return settings?.ollamaChatModel || '未設定 Ollama Chat 模型';
    }
    return '';
}

export function buildOllamaApiUrl(endpoint, path) {
    return `${String(endpoint || '').trim().replace(/\/+$/, '')}${path}`;
}
