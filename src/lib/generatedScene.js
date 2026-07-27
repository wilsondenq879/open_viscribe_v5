import proartLogoBlackUrl from '../../.media/images/proart-logo-black.png';
import rogLogoUrl from '../../.media/images/logo_002.png';

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const finite = (value, fallback, min, max) => Number.isFinite(Number(value)) ? clamp(Number(value), min, max) : fallback;
const cleanText = (value, fallback = '', max = 160) => String(value ?? fallback).replace(/\s+/g, ' ').trim().slice(0, max);
const choice = (value, fallback, values) => values.includes(value) ? value : fallback;

export const GENERATED_SCENE_ELEMENT_TYPES = ['rect', 'circle', 'text', 'image', 'line', 'polygon'];
export const GENERATED_SCENE_EASES = ['linear', 'out-cubic', 'in-cubic', 'in-out-cubic', 'out-back'];
export const GENERATED_SCENE_COLOR_TOKENS = ['background', 'surface', 'foreground', 'muted', 'accent', 'accentAlt', 'transparent'];

export function resolveGeneratedScenePromptImage(prompt, directUrl = '') {
    const source = String(prompt || '');
    if (/\brog\b|republic[ -]?of[ -]?gamers|rog-brandlogo/i.test(source)) return rogLogoUrl;
    if (/proart/i.test(source)) return proartLogoBlackUrl;
    return String(directUrl || '').trim();
}

const normalizeColor = (value, fallback = 'foreground') => {
    const source = String(value || '').trim();
    if (GENERATED_SCENE_COLOR_TOKENS.includes(source)) return source;
    if (/^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(source)) return source.toLowerCase();
    return fallback;
};

const normalizeGradient = (value) => {
    if (!value || typeof value !== 'object') return null;
    const stops = (Array.isArray(value.stops) ? value.stops : []).slice(0, 5).map((stop, index, source) => ({
        at: finite(stop?.at, source.length <= 1 ? 0 : index / (source.length - 1), 0, 1),
        color: normalizeColor(stop?.color, index ? 'accentAlt' : 'accent')
    })).sort((a, b) => a.at - b.at);
    if (stops.length < 2) return null;
    return {
        type: value.type === 'radial' ? 'radial' : 'linear',
        angle: finite(value.angle, 135, -360, 360),
        stops
    };
};

const KEYFRAME_CHANNELS = ['x', 'y', 'w', 'h', 'scale', 'scaleX', 'scaleY', 'rotate', 'opacity', 'blur', 'clipX', 'clipY', 'radius'];

const normalizeKeyframe = (value, fallbackAt) => {
    const raw = value && typeof value === 'object' ? value : {};
    const frame = {
        at: finite(raw.at, fallbackAt, 0, 1),
        ease: choice(raw.ease, 'in-out-cubic', GENERATED_SCENE_EASES)
    };
    KEYFRAME_CHANNELS.forEach(channel => {
        if (!Number.isFinite(Number(raw[channel]))) return;
        const ranges = {
            x: [-100, 200], y: [-100, 200], w: [0.1, 200], h: [0.1, 200],
            scale: [0, 8], scaleX: [-8, 8], scaleY: [-8, 8], rotate: [-1080, 1080],
            opacity: [0, 1], blur: [0, 80], clipX: [0, 100], clipY: [0, 100], radius: [0, 100]
        };
        frame[channel] = finite(raw[channel], 0, ranges[channel][0], ranges[channel][1]);
    });
    return frame;
};

const normalizeElement = (value, index) => {
    const raw = value && typeof value === 'object' ? value : {};
    const type = choice(raw.type, 'rect', GENERATED_SCENE_ELEMENT_TYPES);
    const keyframes = (Array.isArray(raw.keyframes) ? raw.keyframes : [])
        .slice(0, 8)
        .map((frame, frameIndex, source) => normalizeKeyframe(frame, source.length <= 1 ? 0 : frameIndex / (source.length - 1)))
        .sort((a, b) => a.at - b.at);
    return {
        id: cleanText(raw.id, `layer-${index + 1}`, 40).replace(/[^a-z0-9_-]+/gi, '-') || `layer-${index + 1}`,
        name: cleanText(raw.name, `圖層 ${index + 1}`, 40),
        type,
        x: finite(raw.x, 10, -100, 200),
        y: finite(raw.y, 10, -100, 200),
        w: finite(raw.w, type === 'text' ? 60 : 24, 0.1, 200),
        h: finite(raw.h, type === 'text' ? 14 : 24, 0.1, 200),
        scale: finite(raw.scale, 1, 0, 8),
        scaleX: finite(raw.scaleX, 1, -8, 8),
        scaleY: finite(raw.scaleY, 1, -8, 8),
        rotate: finite(raw.rotate, 0, -1080, 1080),
        opacity: finite(raw.opacity, 1, 0, 1),
        blur: finite(raw.blur, 0, 0, 80),
        clipX: finite(raw.clipX, 100, 0, 100),
        clipY: finite(raw.clipY, 100, 0, 100),
        radius: finite(raw.radius, type === 'circle' ? 50 : 0, 0, 100),
        fill: normalizeColor(raw.fill, type === 'text' ? 'foreground' : 'accent'),
        stroke: normalizeColor(raw.stroke, 'transparent'),
        strokeWidth: finite(raw.strokeWidth, 0, 0, 12),
        gradient: normalizeGradient(raw.gradient),
        blendMode: choice(raw.blendMode, 'normal', ['normal', 'screen', 'multiply', 'overlay', 'lighten']),
        shadow: finite(raw.shadow, 0, 0, 60),
        text: cleanText(raw.text, type === 'text' ? 'AI ORIGINAL' : '', 180),
        src: String(raw.src || '').trim().slice(0, 700),
        objectFit: choice(raw.objectFit, 'contain', ['contain', 'cover']),
        fontSize: finite(raw.fontSize, 6, 1.2, 24),
        fontWeight: Math.round(finite(raw.fontWeight, 800, 300, 950)),
        letterSpacing: finite(raw.letterSpacing, 0, -0.08, 1.2),
        align: choice(raw.align, 'left', ['left', 'center', 'right']),
        points: (Array.isArray(raw.points) ? raw.points : []).slice(0, 12).map(point => [finite(point?.[0], 0, -100, 200), finite(point?.[1], 0, -100, 200)]),
        zIndex: Math.round(finite(raw.zIndex, index, -50, 100)),
        keyframes
    };
};

export function normalizeGeneratedSceneConfig(value) {
    const raw = value && typeof value === 'object' ? value : {};
    const elements = (Array.isArray(raw.elements) ? raw.elements : []).slice(0, 24).map(normalizeElement);
    return {
        background: normalizeColor(raw.background, 'background'),
        elements: elements.length ? elements : normalizeGeneratedSceneConfig(buildProceduralScene('AI 原創動態素材')).elements,
        designIntent: cleanText(raw.designIntent, '由 AI 從空白畫布建立的圖層與關鍵影格。', 180)
    };
}

const hashPrompt = (value) => {
    let hash = 2166136261;
    for (const character of String(value || '')) {
        hash ^= character.codePointAt(0);
        hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
};

export function buildProceduralScene(prompt, options = {}) {
    const seed = hashPrompt(prompt);
    const promptWithoutUrl = String(prompt || '')
        .replace(/https?:\/\/\S+/gi, '')
        .replace(/^(?:請)?(?:幫我)?(?:設計|製作|建立|做)(?:一個|一款|一支)?/u, '')
        .trim();
    const title = cleanText(promptWithoutUrl.split(/[，,。.!！；;]/u)[0], 'AI ORIGINAL', 18);
    const direction = seed % 2 ? 1 : -1;
    const angle = 8 + (seed % 24);
    const imageSrc = String(options.imageSrc || '').trim();
    const elements = [
        { id: 'field-a', name: '主色場', type: 'polygon', x: -8, y: -12, w: 62, h: 130, fill: 'accent', opacity: .78, rotate: direction * angle, points: [[0, 0], [72, 0], [100, 100], [18, 100]], keyframes: [{ at: 0, x: -86, opacity: 0 }, { at: .24, x: -8, opacity: .78, ease: 'out-cubic' }, { at: .72, x: -8 }, { at: 1, x: 120, opacity: 0, ease: 'in-cubic' }] },
        { id: 'field-b', name: '輔助色場', type: 'polygon', x: 48, y: -16, w: 70, h: 138, fill: 'accentAlt', opacity: .5, rotate: direction * -angle, blendMode: 'screen', points: [[20, 0], [100, 0], [82, 100], [0, 100]], keyframes: [{ at: 0, x: 128, opacity: 0 }, { at: .3, x: 48, opacity: .5, ease: 'out-cubic' }, { at: .76, x: 48 }, { at: 1, x: -92, opacity: 0, ease: 'in-cubic' }] },
        { id: 'signal-a', name: '匯聚訊號 A', type: 'line', x: 5, y: 31 + (seed % 13), w: 34, h: .45, fill: 'accentAlt', opacity: .9, rotate: direction * 8, keyframes: [{ at: 0, x: -48, scaleX: .15, opacity: 0 }, { at: .34, x: 31, scaleX: 1, opacity: .9, ease: 'out-cubic' }, { at: .7, x: 31, opacity: .6 }, { at: 1, x: 112, scaleX: .25, opacity: 0, ease: 'in-cubic' }] },
        { id: 'signal-b', name: '匯聚訊號 B', type: 'line', x: 61, y: 57 + (seed % 9), w: 34, h: .45, fill: 'accent', opacity: .82, rotate: direction * -8, keyframes: [{ at: 0, x: 118, scaleX: .15, opacity: 0 }, { at: .42, x: 35, scaleX: 1, opacity: .82, ease: 'out-cubic' }, { at: .73, x: 35, opacity: .55 }, { at: 1, x: -46, scaleX: .25, opacity: 0, ease: 'in-cubic' }] },
        { id: 'signal-line', name: '動態訊號線', type: 'line', x: 8, y: 76, w: 84, h: .7, fill: 'foreground', opacity: .8, keyframes: [{ at: 0, scaleX: 0, opacity: 0 }, { at: .38, scaleX: 1, opacity: .8, ease: 'out-cubic' }, { at: .78, scaleX: 1 }, { at: 1, scaleX: 0, opacity: 0 }] },
        { id: 'title', name: '主標題', type: 'text', x: 12, y: 40, w: 76, h: 18, text: title, fill: 'foreground', fontSize: 7.2, fontWeight: 900, letterSpacing: -.025, align: 'center', keyframes: [{ at: 0, y: 54, opacity: 0, blur: 18, scale: .82 }, { at: .42, y: 40, opacity: 1, blur: 0, scale: 1, ease: 'out-back' }, { at: .78, y: 40, opacity: 1 }, { at: 1, y: 30, opacity: 0, blur: 10, scale: 1.08 }] },
        { id: 'microcopy', name: '識別文字', type: 'text', x: 22, y: 63, w: 56, h: 8, text: 'GENERATED FROM A BLANK CANVAS', fill: 'foreground', fontSize: 2.1, fontWeight: 700, letterSpacing: .28, align: 'center', keyframes: [{ at: 0, opacity: 0, clipX: 0 }, { at: .48, opacity: .78, clipX: 100, ease: 'out-cubic' }, { at: .8, opacity: .78 }, { at: 1, opacity: 0 }] }
    ];
    if (imageSrc) elements.splice(3, 0, { id: 'source-image', name: '來源圖片', type: 'image', x: 34, y: 23, w: 32, h: 34, src: imageSrc, objectFit: 'contain', shadow: 22, keyframes: [{ at: 0, scale: .3, rotate: direction * -35, opacity: 0, blur: 20 }, { at: .4, scale: 1, rotate: 0, opacity: 1, blur: 0, ease: 'out-back' }, { at: .78, scale: 1 }, { at: 1, scale: 1.5, rotate: direction * 12, opacity: 0, blur: 8 }] });
    const ratioAwareElements = options.aspectRatio === '9:16' ? elements.map(element => {
        if (element.id === 'field-a') return { ...element, x: -28, w: 94, keyframes: element.keyframes.map((frame, index) => ({ ...frame, x: index === 0 ? -118 : index === element.keyframes.length - 1 ? 126 : -28 })) };
        if (element.id === 'field-b') return { ...element, x: 38, w: 92, keyframes: element.keyframes.map((frame, index) => ({ ...frame, x: index === 0 ? 136 : index === element.keyframes.length - 1 ? -108 : 38 })) };
        if (element.id === 'signal-a') return { ...element, x: -4, y: 35, w: 58, rotate: direction * 18 };
        if (element.id === 'signal-b') return { ...element, x: 46, y: 58, w: 58, rotate: direction * -18 };
        if (element.id === 'signal-line') return { ...element, x: 12, y: 82, w: 76 };
        if (element.id === 'source-image') return { ...element, x: 16, y: 22, w: 68, h: 36 };
        if (element.id === 'title') {
            const targetY = imageSrc ? 62 : 42;
            return { ...element, x: 10, y: targetY, w: 80, h: 18, fontSize: 7.8, keyframes: element.keyframes.map((frame, index) => ({ ...frame, y: index === 0 ? targetY + 15 : index === element.keyframes.length - 1 ? targetY - 10 : targetY })) };
        }
        if (element.id === 'microcopy') return { ...element, x: 16, y: imageSrc ? 75 : 63, w: 68, fontSize: 2.5 };
        return element;
    }) : elements;
    return { background: 'background', elements: ratioAwareElements, designIntent: '本機依提示種子程序生成；未套用素材庫模板。' };
}

const applyEase = (value, ease) => {
    const t = clamp(value, 0, 1);
    if (ease === 'linear') return t;
    if (ease === 'in-cubic') return t * t * t;
    if (ease === 'out-cubic') return 1 - Math.pow(1 - t, 3);
    if (ease === 'out-back') {
        const c1 = 1.70158;
        const c3 = c1 + 1;
        return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
    }
    return t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
};

export function evaluateGeneratedSceneElement(element, progress) {
    const base = {};
    KEYFRAME_CHANNELS.forEach(channel => { base[channel] = element[channel]; });
    const frames = element.keyframes || [];
    if (!frames.length) return base;
    const t = clamp(progress, 0, 1);
    const previousIndex = Math.max(0, frames.findLastIndex(frame => frame.at <= t));
    const previous = frames[previousIndex] || frames[0];
    const next = frames.find(frame => frame.at > t) || previous;
    const span = Math.max(.0001, next.at - previous.at);
    const local = previous === next ? 0 : applyEase((t - previous.at) / span, next.ease);
    const state = { ...base };
    KEYFRAME_CHANNELS.forEach(channel => {
        const from = Number.isFinite(previous[channel]) ? previous[channel] : base[channel];
        const to = Number.isFinite(next[channel]) ? next[channel] : from;
        state[channel] = from + (to - from) * local;
    });
    return state;
}

export function resolveGeneratedSceneColor(value, palette) {
    if (value === 'transparent') return 'rgba(0,0,0,0)';
    return palette?.[value] || value || palette?.foreground || '#ffffff';
}

export function generatedSceneGradientCss(gradient, palette) {
    if (!gradient) return '';
    const stops = gradient.stops.map(stop => `${resolveGeneratedSceneColor(stop.color, palette)} ${Math.round(stop.at * 100)}%`).join(', ');
    return gradient.type === 'radial' ? `radial-gradient(circle, ${stops})` : `linear-gradient(${gradient.angle}deg, ${stops})`;
}
