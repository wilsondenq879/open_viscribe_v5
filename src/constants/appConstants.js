export const DEFAULT_SETTINGS = {
    aiProvider: 'azure',
    subtitleProvider: 'azure',
    articleProvider: 'azure',
    voiceProvider: 'azure',
    voiceoverSubtitleProvider: 'azure',
    uiDebugProvider: 'azure',
    apiKey: '',
    model: 'gemini-2.5-flash',
    geminiTtsModel: 'gemini-2.5-flash-preview-tts',
    lmStudioProtocol: 'http',
    lmStudioHost: '192.168.51.121',
    lmStudioPort: '1234',
    lmStudioEndpoint: 'http://192.168.51.121:1234',
    lmStudioApiKey: '',
    lmStudioTimeoutSeconds: 180,
    lmStudioVisionModel: '',
    lmStudioChatModel: '',
    lmStudioTtsModel: '',
    lmStudioSttModel: '',
    ollamaUseLocalhost: false,
    ollamaCustomEndpoint: 'http://192.168.51.148:11434',
    ollamaEndpoint: 'http://192.168.51.148:11434',
    ollamaTimeoutSeconds: 180,
    ollamaVisionModel: 'gemma4:e4b',
    ollamaChatModel: 'gemma4:e4b',
    ollamaTtsModel: 'kokoro',
    ollamaSttModel: 'faster-whisper',
    azureEndpoint: 'https://auto-teaching-resource.openai.azure.com/',
    azureVisionEndpoint: 'https://auto-teaching-resource.openai.azure.com/',
    azureChatEndpoint: 'https://auto-teaching-resource.openai.azure.com/',
    azureTtsEndpoint: 'https://SWRD-FAS-swedencentral.openai.azure.com/',
    azureDeployment: 'gpt-5.4-mini-wilson',
    azureChatDeployment: 'gpt-5.4-mini-wilson',
    azureTtsDeployment: 'tts-wilson',
    azureSttDeployment: '',
    azureVisionKey: '',
    azureChatKey: '',
    azureTtsKey: '',
    azureSttKey: '',
    temperature: 0.0,
    language: 'en',
    includeAudio: false,
    resolution: '1080p',
    aspectRatio: '16:9',
    clickRippleEnabled: true,
    automationApiEnabled: false,
    automationApiUrl: 'http://127.0.0.1:4318',
    automationApiToken: '',
    // Vertical pixel offset to compensate when the screen recording includes browser
    // chrome above the viewport (address bar, tabs).  Set to ~130 if your recording
    // source is the whole browser window; leave at 0 for tab-only capture.
    clickHighlightOffsetY: 0
};

export const BASE_PIXELS_PER_SECOND = 50;
export const TIMELINE_OFFSET = 20;
export const RENDER_FPS = 30;
export const RENDER_FRAME_STEP = 1 / RENDER_FPS;
export const HISTORY_LIMIT = 50;
export const MIN_TIMELINE_HEIGHT = 100;
export const RESERVED_EDITOR_HEIGHT = 200;
export const MIN_LEFT_PANEL_WIDTH = 280;
export const MAX_LEFT_PANEL_WIDTH = 520;
export const MIN_LIBRARY_PANEL_WIDTH = 240;
export const MAX_LIBRARY_PANEL_WIDTH = 680;
export const MIN_TIMELINE_ZOOM = 0.4;
export const MAX_TIMELINE_ZOOM = 3;
export const LOCAL_OLLAMA_ENDPOINT = 'http://localhost:11434';
export const AI_TASK_CANCELLED_MESSAGE = '已取消 AI 任務';

export function getDefaultTimelineHeight() {
    if (typeof window === 'undefined') return 360;
    const availableHeight = Math.max(MIN_TIMELINE_HEIGHT * 2, window.innerHeight - RESERVED_EDITOR_HEIGHT);
    return Math.max(
        MIN_TIMELINE_HEIGHT,
        Math.min(window.innerHeight - RESERVED_EDITOR_HEIGHT, Math.round(availableHeight / 2))
    );
}

export const DEFAULT_SUBTITLE_STYLE = {
    fontSize: 16,
    fontFamily: 'Arial',
    textColor: '#ffffff',
    backgroundColor: '#000000',
    backgroundOpacity: 0.8,
    x: 50,
    y: 88
};

// Motion-design packs are intentionally opinionated so an automatically styled
// tutorial looks designed instead of like a generic subtitle overlay.
export const MOTION_DESIGN_PRESETS = [
    {
        id: 'signal',
        name: 'Signal Studio',
        description: '深海藍、琥珀與細緻技術線條，適合產品教學與科技內容。',
        swatch: '#ffad5a',
        background: '#101a28',
        surface: '#16263a',
        foreground: '#f6f1e8',
        muted: '#b6c6d5',
        accent: '#ffad5a',
        accentAlt: '#64d7ff'
    },
    {
        id: 'editorial',
        name: 'Editorial Warmth',
        description: '暖白紙感、酒紅與墨黑，適合故事型教學與觀點影片。',
        swatch: '#b23d35',
        background: '#f4efe6',
        surface: '#e9ddcb',
        foreground: '#24201d',
        muted: '#655d55',
        accent: '#b23d35',
        accentAlt: '#d78a42'
    },
    {
        id: 'creator',
        name: 'Creator Pulse',
        description: '墨黑、酸萊姆與紫紅的節奏感，適合 Shorts 與創作者內容。',
        swatch: '#d9ff5a',
        background: '#15151b',
        surface: '#23232d',
        foreground: '#f6f4ee',
        muted: '#bdbbc7',
        accent: '#d9ff5a',
        accentAlt: '#fa4f9a'
    }
];

export const DEFAULT_MOTION_DESIGN = {
    enabled: false,
    aiAutoEnabled: false,
    presetId: 'signal',
    includeIntro: true,
    includeOutro: true,
    includeLowerThird: true,
    manualIntroEnabled: false,
    manualOutroEnabled: false,
    manualCards: [],
    introDuration: 2.6,
    outroDuration: 3.1,
    cardDuration: 3.5,
    title: '',
    creator: '',
    cta: '訂閱以取得更多教學'
};

export const SUBTITLE_TRACKS = [
    { key: 'user', label: '用戶字幕 S1', shortLabel: 'S1', colorClass: 'text-cyan-300', emptyHint: '手動新增的字幕與旁白轉字幕結果會顯示在這一列，避免和 AI 字幕軌混在一起。' },
    { key: 'ai', label: 'AI字幕 S2', shortLabel: 'S2', colorClass: 'text-amber-300', emptyHint: 'AI字幕結果固定顯示在這一列。若要手動補字，建議加在 S1 用戶字幕軌。' }
];

export const SUBTITLE_FONT_OPTIONS = [
    { label: 'Arial', value: 'Arial' },
    { label: 'Helvetica', value: 'Helvetica' },
    { label: 'Georgia', value: 'Georgia' },
    { label: 'Times New Roman', value: 'Times New Roman' },
    { label: 'Verdana', value: 'Verdana' },
    { label: 'Trebuchet MS', value: 'Trebuchet MS' },
    { label: 'Noto Sans TC', value: '"Noto Sans TC", sans-serif' },
    { label: 'Microsoft JhengHei', value: '"Microsoft JhengHei", sans-serif' }
];

export const BUILT_IN_TRANSITIONS = [
    { preset: 'fade', name: '淡入', color: 'rose' },
    { preset: 'slide-left', name: '左滑入', color: 'amber' },
    { preset: 'slide-right', name: '右滑入', color: 'sky' },
    { preset: 'zoom-in', name: '縮放淡入', color: 'emerald' },
    { preset: 'wipe-up', name: '上推擦拭', color: 'violet' }
];

export const TRANSITION_COLOR_MAP = {
    rose: '#fb7185',
    amber: '#f59e0b',
    sky: '#38bdf8',
    emerald: '#34d399',
    violet: '#a78bfa'
};

export const DEFAULT_CLIP_LAYOUT = { x: 0, y: 0, w: 100, h: 100 };
export const DEFAULT_KEN_BURNS_VIEWPORT = { scale: 1, x: 0, y: 0 };

export const KEN_BURNS_PRESETS = [
    {
        id: 'zoom-in',
        name: '慢速推近',
        config: { start: { scale: 1, x: 0, y: 0 }, end: { scale: 1.18, x: 0, y: 0 } }
    },
    {
        id: 'zoom-out',
        name: '慢速拉遠',
        config: { start: { scale: 1.2, x: 0, y: 0 }, end: { scale: 1, x: 0, y: 0 } }
    },
    {
        id: 'pan-right',
        name: '由左到右',
        config: { start: { scale: 1.14, x: -100, y: 0 }, end: { scale: 1.14, x: 100, y: 0 } }
    },
    {
        id: 'pan-left',
        name: '由右到左',
        config: { start: { scale: 1.14, x: 100, y: 0 }, end: { scale: 1.14, x: -100, y: 0 } }
    },
    {
        id: 'drift-down',
        name: '由上到下',
        config: { start: { scale: 1.16, x: 0, y: -100 }, end: { scale: 1.16, x: 0, y: 100 } }
    },
    {
        id: 'drift-up',
        name: '由下到上',
        config: { start: { scale: 1.16, x: 0, y: 100 }, end: { scale: 1.16, x: 0, y: -100 } }
    }
];

export const DEFAULT_UI_DEBUG_CHECKS = {
    ui: true,
    security: true,
    translation: true
};

export const UI_DEBUG_TRANSLATION_OPTIONS = [
    { code: 'tr', label: 'Turkce', script: 'latin' },
    { code: 'en', label: 'English', script: 'latin' },
    { code: 'pt-BR', label: 'Portugues (Brazil)', script: 'latin' },
    { code: 'zh-CN', label: '简体中文', script: 'han' },
    { code: 'cs', label: 'Cesky', script: 'latin' },
    { code: 'da', label: 'Dansk', script: 'latin' },
    { code: 'de', label: 'Deutsch', script: 'latin' },
    { code: 'es', label: 'Espanol', script: 'latin' },
    { code: 'fi', label: 'Suomi', script: 'latin' },
    { code: 'fr', label: 'Francais', script: 'latin' },
    { code: 'hu', label: 'Hungarian', script: 'latin' },
    { code: 'it', label: 'Italiano', script: 'latin' },
    { code: 'ja', label: '日本語', script: 'japanese' },
    { code: 'ko', label: '한국어', script: 'hangul' },
    { code: 'ms', label: 'Malay', script: 'latin' },
    { code: 'nl', label: 'Nederlands', script: 'latin' },
    { code: 'no', label: 'Norsk', script: 'latin' },
    { code: 'pl', label: 'Polski', script: 'latin' },
    { code: 'ro', label: 'Romanian', script: 'latin' },
    { code: 'ru', label: 'Русский', script: 'cyrillic' },
    { code: 'sk', label: 'Slovenscina', script: 'latin' },
    { code: 'sv', label: 'Svensk', script: 'latin' },
    { code: 'th', label: 'ไทย', script: 'thai' },
    { code: 'zh-TW', label: '繁體中文', script: 'han' },
    { code: 'uk', label: 'Українська', script: 'cyrillic' }
];

export const ARTICLE_PERSPECTIVE_OPTIONS = [
    {
        value: 'brand',
        label: '品牌官方（第一人稱）',
        hint: '用品牌/公司角度介紹自家產品，語氣更像官方內容或產品團隊說明。'
    },
    {
        value: 'kol',
        label: 'KOL 評測（第三人稱）',
        hint: '用開箱評測或科技媒體角度介紹產品，語氣更像第三方推薦。'
    },
    {
        value: 'brief',
        label: '精簡概要（一到兩句）',
        hint: '只產生一到兩句的精簡摘要說明，適合快速概述功能或步驟。'
    }
];

export const UI_DEBUG_MODULE_TAGS = {
    ui: [
        'page-exception',
        'openviscribe-exception',
        'warning-signal',
        'resource-failure',
        'network-failure',
        'slow-network',
        'main-thread-blocking',
        'ui-instability',
        'layout-break-risk',
        'slow-transition',
        'visual-tone-shift',
        'low-text-contrast'
    ],
    security: [
        'security-violation',
        'mixed-content',
        'insecure-form',
        'unsafe-blank-link',
        'sensitive-storage-exposure',
        'client-security-risk'
    ],
    translation: [
        'foreign-script-ui',
        'mixed-language-ui'
    ]
};

export const AI_PROVIDER_TABS = [
    { key: 'gemini', label: 'Gemini' },
    { key: 'azure', label: 'Azure' },
    { key: 'lmstudio', label: 'LM Studio' },
    { key: 'ollama', label: 'Ollama' }
];

export const AI_FEATURE_PROVIDER_FIELDS = [
    { key: 'subtitleProvider', label: 'AI字幕 (Vision)' },
    { key: 'articleProvider', label: '生成文章 (Chat)' },
    { key: 'voiceProvider', label: '生成語音 (TTS)' },
    { key: 'voiceoverSubtitleProvider', label: '旁白轉字幕 (STT)' },
    { key: 'uiDebugProvider', label: 'Web診斷' }
];

export const GEMINI_MODEL_OPTIONS = [
    { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash (預設)' },
    { value: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash (穩定版)' },
    { value: 'gemini-2.0-flash-exp', label: 'Gemini 2.0 Flash Exp' },
    { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' }
];
