import { DEFAULT_MOTION_DESIGN, MOTION_DESIGN_PRESETS } from '../constants/appConstants';
import { getHyperframeTemplate } from './hyperframeTemplates';
import { getHyperframeAsset } from './hyperframeAssets';
import { getHyperframeAssetConfig, getMapNodePosition } from './hyperframeAssetConfig';
import { evaluateGeneratedSceneElement, resolveGeneratedSceneColor } from './generatedScene';

const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));
const easeOutCubic = (value) => 1 - Math.pow(1 - clamp(value), 3);
const staggeredMotion = (progress, index = 0, delay = 0.1, span = 0.32) => easeOutCubic(clamp((progress - index * delay) / span));
const normalizeDuration = (value, fallback) => clamp(Number.isFinite(Number(value)) ? Number(value) : fallback, 0.8, 10);
const canvasImageCache = new Map();
const getCanvasImage = (src) => {
    if (!src || typeof Image === 'undefined') return null;
    if (!canvasImageCache.has(src)) {
        const image = new Image();
        image.crossOrigin = 'anonymous';
        image.src = src;
        canvasImageCache.set(src, image);
    }
    const image = canvasImageCache.get(src);
    return image.complete && image.naturalWidth > 0 ? image : null;
};
const normalizeLayout = (value, fallback) => {
    const raw = value || {};
    const valueOr = (key, min, max) => Number.isFinite(Number(raw[key])) ? clamp(Number(raw[key]), min, max) : fallback[key];
    return {
        x: valueOr('x', 0, 95),
        y: valueOr('y', 0, 95),
        w: valueOr('w', 8, 100),
        h: valueOr('h', 6, 100),
        opacity: valueOr('opacity', 15, 100)
    };
};
const isLegacyInsetAssetLayout = (layout) => {
    if (!layout) return false;
    const closeTo = (key, expected) => Math.abs((Number(layout[key]) || 0) - expected) < 0.05;
    return (closeTo('x', 12) && closeTo('y', 17) && closeTo('w', 76) && closeTo('h', 66))
        || (closeTo('x', 9) && closeTo('y', 7) && closeTo('w', 82) && closeTo('h', 86));
};
export function getMotionDesignSettings(value) {
    const raw = value || {};
    const presetId = MOTION_DESIGN_PRESETS.some(item => item.id === raw.presetId)
        ? raw.presetId
        : DEFAULT_MOTION_DESIGN.presetId;
    const template = getHyperframeTemplate(raw.hyperframeTemplateId || DEFAULT_MOTION_DESIGN.hyperframeTemplateId);
    const generatedAssets = Array.isArray(raw.generatedAssets)
        ? raw.generatedAssets.filter(asset => asset?.generated && asset?.id && asset?.assetType).slice(0, 80).map(asset => {
            if (asset.assetType !== 'generated-scene' && /((logo|wordmark|標誌|商標|brandlogo).*(轉場|transition|sting|wipe|片頭動畫))|rog.*(轉場|transition|sting|wipe|動畫)/i.test(String(asset.prompt || '')) && asset.assetType !== 'brand-transition') {
                const isRog = /\brog\b|republic[ -]?of[ -]?gamers|rog-brandlogo/i.test(String(asset.prompt || ''));
                const corrected = {
                    ...asset,
                    assetType: 'brand-transition',
                    category: '片頭／片尾',
                    nameZh: `${isRog ? 'ROG 戰術斜切轉場' : '品牌動態轉場'}${asset.aspectRatio === '9:16' ? '（直式）' : ''}`,
                    palette: isRog
                        ? { background: '#050609', surface: '#15171d', foreground: '#ffffff', muted: '#858b96', accent: '#ff003c', accentAlt: '#e4002b' }
                        : asset.palette
                };
                return {
                    ...corrected,
                    config: getHyperframeAssetConfig(corrected, {
                        brandName: isRog ? 'ROG' : asset.config?.brandName || 'BRAND',
                        tagline: isRog ? 'FOR THOSE WHO DARE' : asset.config?.tagline || 'BRAND IN MOTION',
                        entrance: 'diagonal-slices',
                        reveal: 'slice-assemble',
                        exit: 'slash-wipe',
                        direction: 'left-to-right',
                        sliceCount: 6,
                        angle: -18,
                        intensity: 92,
                        logoScale: 56,
                        holdPercent: 30
                    })
                };
            }
            if (asset.assetType !== 'generated-scene' && /((logo|wordmark|標誌|商標).*(loading|progress|載入|進度|填滿|填色|fill|reveal))|proart.*(填滿|填色|loading|progress|載入|進度)/i.test(String(asset.prompt || '')) && asset.assetType !== 'logo-fill') {
                const corrected = {
                    ...asset,
                    assetType: 'logo-fill',
                    category: '片頭／片尾',
                    nameZh: asset.aspectRatio === '9:16' ? 'ProArt Logo 填滿 Loading（直式）' : 'ProArt Logo 填滿 Loading',
                    palette: { background: '#f4f1eb', surface: '#e4ded4', foreground: '#111111', muted: '#81786e', accent: '#111111', accentAlt: '#b89b72' }
                };
                return { ...corrected, config: getHyperframeAssetConfig(corrected, { brandName: 'ProArt', label: 'POWER UP YOUR IMAGINATION', startPercent: 1, endPercent: 100, direction: 'left-to-right' }) };
            }
            if (asset.assetType !== 'generated-scene' && /dataviz-stacked-bar|stacked[-_\s]?(bar|column)|堆疊.*(長條|直條|柱)/i.test(String(asset.prompt || '')) && asset.assetType !== 'stacked-bars') {
                const corrected = { ...asset, assetType: 'stacked-bars', nameZh: asset.aspectRatio === '9:16' ? '堆疊動態直條圖（直式）' : '堆疊動態直條圖' };
                return { ...corrected, config: getHyperframeAssetConfig(corrected, {}) };
            }
            return asset;
        })
        : [];
    const generatedAssetById = new Map(generatedAssets.map(asset => [asset.id, asset]));
    const normalizedManualCards = Array.isArray(raw.manualCards)
        ? raw.manualCards
            .map((card, index) => {
                const assetDefinition = getHyperframeAsset(card?.assetId)
                    || generatedAssetById.get(card?.assetId)
                    || (card?.assetDefinition?.generated ? card.assetDefinition : null);
                const layoutValue = assetDefinition && isLegacyInsetAssetLayout(card?.layout) ? null : card?.layout;
                return {
                    id: String(card?.id || `card_${index}`),
                    text: String(card?.text || '').trim().slice(0, 92),
                    creator: String(card?.creator || '').trim().slice(0, 44),
                    presetId: MOTION_DESIGN_PRESETS.some(item => item.id === card?.presetId) ? card.presetId : presetId,
                    assetId: assetDefinition?.id || '',
                    assetDefinition: assetDefinition?.generated ? assetDefinition : undefined,
                    assetConfig: getHyperframeAssetConfig(assetDefinition, card?.assetConfig || assetDefinition?.config),
                    startAt: Math.max(0, Number(card?.startAt) || 0),
                    endAt: Math.max(0, Number(card?.endAt) || 0),
                    trackIndex: Math.max(0, Math.min(7, Math.round(Number(card?.trackIndex) || 0))),
                    visualTrackIndex: Math.max(0, Math.min(11, Math.round(Number(card?.visualTrackIndex) || 0))),
                    layout: normalizeLayout(layoutValue, assetDefinition
                        ? { x: 0, y: 0, w: 100, h: 100, opacity: 100 }
                        : { x: 6.5, y: 73.5, w: 53, h: 15, opacity: 100 }),
                    // Keep the origin so automated editorial layers can obey
                    // stricter collision rules than intentionally hand-built
                    // manual designs.
                    source: ['auto-contents', 'ai-editor', 'ai-material'].includes(card?.source) ? card.source : 'manual'
                };
            })
            .filter(card => card.text && card.endAt > card.startAt)
        : [];
    const highestTrackIndex = normalizedManualCards.reduce((max, card) => Math.max(max, card.trackIndex), 0);
    return {
        ...DEFAULT_MOTION_DESIGN,
        ...raw,
        enabled: Boolean(raw.enabled),
        aiAutoEnabled: raw.aiAutoEnabled === undefined ? Boolean(raw.enabled) : Boolean(raw.aiAutoEnabled),
        presetId,
        hyperframeTemplateId: template.id,
        includeIntro: raw.includeIntro !== false,
        includeOutro: raw.includeOutro !== false,
        includeLowerThird: raw.includeLowerThird !== false,
        title: String(raw.title || '').trim(),
        creator: String(raw.creator || '').trim(),
        cta: String(raw.cta || DEFAULT_MOTION_DESIGN.cta).trim() || DEFAULT_MOTION_DESIGN.cta,
        manualIntroEnabled: Boolean(raw.manualIntroEnabled),
        manualOutroEnabled: Boolean(raw.manualOutroEnabled),
        introDuration: normalizeDuration(raw.introDuration, DEFAULT_MOTION_DESIGN.introDuration),
        outroDuration: normalizeDuration(raw.outroDuration, DEFAULT_MOTION_DESIGN.outroDuration),
        cardDuration: normalizeDuration(raw.cardDuration, DEFAULT_MOTION_DESIGN.cardDuration),
        generatedAssets,
        designTrackCount: Math.max(1, Math.min(8, Math.max(
            Math.round(Number(raw.designTrackCount) || DEFAULT_MOTION_DESIGN.designTrackCount),
            highestTrackIndex + 1
        ))),
        manualCards: normalizedManualCards
    };
}

export function getMotionDesignPreset(presetId) {
    return MOTION_DESIGN_PRESETS.find(item => item.id === presetId) || MOTION_DESIGN_PRESETS[0];
}

export function getMotionDesignCopy(design, { fallbackTitle = '', fallbackCreator = '' } = {}) {
    const cleanTitle = String(design?.title || fallbackTitle || 'Untitled Tutorial').trim();
    const cleanCreator = String(design?.creator || fallbackCreator || 'OPEN VISCRIBE').trim();
    return {
        title: cleanTitle.slice(0, 84),
        creator: cleanCreator.slice(0, 44),
        cta: String(design?.cta || DEFAULT_MOTION_DESIGN.cta).slice(0, 64)
    };
}

export function getMotionDesignLayers({ design, time, duration, subtitles = [] }) {
    const settings = getMotionDesignSettings(design);
    const autoEnabled = settings.aiAutoEnabled;
    const hasManualLayers = settings.manualIntroEnabled || settings.manualOutroEnabled || settings.manualCards.length > 0;
    if ((!autoEnabled && !hasManualLayers) || duration <= 0) return [];
    const layers = [];
    const safeTime = Math.max(0, Number(time) || 0);
    const introEnabled = (autoEnabled && settings.includeIntro) || settings.manualIntroEnabled;
    const outroEnabled = (autoEnabled && settings.includeOutro) || settings.manualOutroEnabled;
    const introDuration = Math.min(settings.introDuration, duration);
    const outroDuration = Math.min(settings.outroDuration, duration);

    if (outroEnabled && safeTime >= Math.max(0, duration - outroDuration)) {
        const startAt = Math.max(0, duration - outroDuration);
        layers.push({ kind: 'outro', progress: clamp((safeTime - startAt) / outroDuration), presetId: settings.presetId, templateId: settings.hyperframeTemplateId });
        return layers;
    }
    if (introEnabled && safeTime <= introDuration) {
        layers.push({ kind: 'intro', progress: clamp(safeTime / introDuration), presetId: settings.presetId, templateId: settings.hyperframeTemplateId });
        // The opening title owns the frame. Captions, lower-thirds and Contents
        // must wait until it has cleared instead of stacking text on text.
        return layers;
    }
    const hasNarration = subtitles.some(item => Boolean(item?.narration) || Number(item?.trackIndex) === 1);
    const activeManualCards = settings.manualCards
        .filter(card => safeTime >= card.startAt && safeTime <= card.endAt);
    // AI text cards merely repeat the narration. Hide them for a narration-led
    // edit; a curated visual Contents layer remains useful but only one may be
    // active at a time.
    const eligibleManualCards = (hasNarration
        ? activeManualCards.filter(card => card.source !== 'ai-editor' || Boolean(card.assetId))
        : activeManualCards);
    // Each design track contributes at most one active visual. Different tracks
    // are intentionally composited together, with higher track indexes rendered
    // later (visually on top). This turns the timeline lanes into real layers.
    const visibleManualCards = [...eligibleManualCards
        .sort((a, b) => a.startAt - b.startAt)
        .reduce((byTrack, card) => byTrack.set(card.visualTrackIndex || 0, card), new Map())
        .values()]
        .sort((a, b) => (a.visualTrackIndex || 0) - (b.visualTrackIndex || 0));
    const hasManualLayer = visibleManualCards.length > 0;
    if (autoEnabled && settings.includeLowerThird && !hasNarration && !hasManualLayer && (!introEnabled || safeTime > introDuration)) {
        const activeSubtitle = subtitles
            .filter(item => Number.isFinite(Number(item?.startAt)) && String(item?.text || '').trim())
            .sort((a, b) => Number(b.startAt) - Number(a.startAt))
            .find(item => safeTime >= Number(item.startAt) && safeTime <= Math.min(Number(item.endAt) || Infinity, Number(item.startAt) + settings.cardDuration));
        if (activeSubtitle) {
            const elapsed = safeTime - Number(activeSubtitle.startAt);
            const visibleDuration = Math.max(0.2, Math.min(Number(activeSubtitle.endAt) || Infinity, Number(activeSubtitle.startAt) + settings.cardDuration) - Number(activeSubtitle.startAt));
            const exitProgress = visibleDuration > 0.5 ? clamp((elapsed - (visibleDuration - 0.35)) / 0.35) : 0;
            layers.push({
                kind: 'lower-third',
                progress: clamp(elapsed / 0.38),
                exitProgress,
                text: String(activeSubtitle.text || '').trim().slice(0, 92),
                presetId: settings.presetId,
                templateId: settings.hyperframeTemplateId
            });
        }
    }
    visibleManualCards
        .forEach(card => {
            const duration = Math.max(0.2, card.endAt - card.startAt);
            const elapsed = safeTime - card.startAt;
            layers.push({
                kind: card.assetId ? 'hyperframe-asset' : 'lower-third',
                id: card.id,
                progress: clamp(elapsed / 0.38),
                timelineProgress: clamp(elapsed / duration),
                elapsed,
                duration,
                exitProgress: duration > 0.5 ? clamp((elapsed - (duration - 0.35)) / 0.35) : 0,
                text: card.text,
                creator: card.creator,
                presetId: card.presetId,
                templateId: settings.hyperframeTemplateId,
                assetId: card.assetId,
                assetDefinition: card.assetDefinition,
                assetConfig: card.assetConfig,
                layout: card.layout,
                trackIndex: card.trackIndex || 0,
                visualTrackIndex: card.visualTrackIndex || 0,
                manual: true
            });
        });
    return layers;
}

function roundedRect(ctx, x, y, width, height, radius) {
    const safeRadius = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x + safeRadius, y);
    ctx.lineTo(x + width - safeRadius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + safeRadius);
    ctx.lineTo(x + width, y + height - safeRadius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - safeRadius, y + height);
    ctx.lineTo(x + safeRadius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - safeRadius);
    ctx.lineTo(x, y + safeRadius);
    ctx.quadraticCurveTo(x, y, x + safeRadius, y);
    ctx.closePath();
}

function drawWrappedText(ctx, text, x, y, maxWidth, lineHeight, maxLines = 2) {
    const source = String(text || '').trim();
    const hasSpaces = /\s/.test(source);
    const words = hasSpaces ? source.split(/\s+/).filter(Boolean) : Array.from(source);
    const lines = [];
    let line = '';
    words.forEach(word => {
        const candidate = line ? `${line}${hasSpaces ? ' ' : ''}${word}` : word;
        if (ctx.measureText(candidate).width > maxWidth && line) {
            lines.push(line);
            line = word;
        } else {
            line = candidate;
        }
    });
    if (line) lines.push(line);
    const visibleLines = lines.slice(0, maxLines);
    if (lines.length > maxLines && visibleLines.length) visibleLines[visibleLines.length - 1] = `${visibleLines[visibleLines.length - 1].replace(/[.,;:!?]$/, '')}…`;
    visibleLines.forEach((lineText, index) => ctx.fillText(lineText, x, y + index * lineHeight));
    return visibleLines.length;
}

function drawAtmosphere(ctx, canvas, preset, intensity = 1) {
    const { width, height } = canvas;
    ctx.fillStyle = preset.background;
    ctx.fillRect(0, 0, width, height);

    const glow = ctx.createRadialGradient(width * 0.82, height * 0.2, 0, width * 0.82, height * 0.2, width * 0.55);
    glow.addColorStop(0, `${preset.accent}55`);
    glow.addColorStop(1, `${preset.accent}00`);
    ctx.fillStyle = glow;
    ctx.globalAlpha = 0.8 * intensity;
    ctx.fillRect(0, 0, width, height);
    ctx.globalAlpha = 1;

    ctx.strokeStyle = `${preset.foreground}26`;
    ctx.lineWidth = 2;
    for (let index = 0; index < 6; index += 1) {
        const x = width * (0.06 + index * 0.18);
        ctx.beginPath();
        ctx.moveTo(x, height * 0.07);
        ctx.lineTo(x - height * 0.13, height * 0.93);
        ctx.stroke();
    }
}

function drawIntro(ctx, canvas, layer, preset, copy, template) {
    const { width, height } = canvas;
    const entrance = easeOutCubic(clamp(layer.progress / 0.42));
    const holdExit = layer.progress > 0.84 ? clamp((layer.progress - 0.84) / 0.16) : 0;
    ctx.save();
    ctx.globalAlpha = 0.98 - holdExit * 0.72;
    drawAtmosphere(ctx, canvas, preset, entrance);

    const contentX = width * 0.105;
    const eyebrowY = height * 0.29 + (1 - entrance) * 38;
    const titleY = eyebrowY + width * 0.07;
    ctx.globalAlpha = Math.min(1, entrance * 1.35) * (1 - holdExit);
    ctx.fillStyle = template.introStyle === 'pulse-title' ? preset.accentAlt : preset.accent;
    ctx.fillRect(contentX, eyebrowY - 28, width * 0.075 * entrance, 7);
    ctx.font = `700 ${Math.round(width * 0.014)}px "Arial", "Noto Sans TC", sans-serif`;
    ctx.fillStyle = preset.accent;
    ctx.fillText(template.introStyle === 'editorial-emphasis' ? 'OPEN VISCRIBE  /  YOUTUBE WORKFLOW' : 'OPEN VISCRIBE  /  AI EDITED', contentX, eyebrowY);

    ctx.font = `800 ${Math.round(width * 0.058)}px "Arial", "Noto Sans TC", sans-serif`;
    ctx.fillStyle = preset.foreground;
    const titleLines = drawWrappedText(ctx, copy.title, contentX, titleY, width * 0.76, width * 0.07, 2);

    ctx.font = `600 ${Math.round(width * 0.016)}px "Arial", "Noto Sans TC", sans-serif`;
    ctx.fillStyle = preset.muted;
    ctx.fillText(copy.creator.toUpperCase(), contentX, titleY + titleLines * width * 0.07 + height * 0.065);
    ctx.restore();
}

function drawOutro(ctx, canvas, layer, preset, copy, template) {
    const { width, height } = canvas;
    const entrance = easeOutCubic(clamp(layer.progress / 0.36));
    ctx.save();
    ctx.globalAlpha = 0.98;
    drawAtmosphere(ctx, canvas, preset, entrance);

    const panelW = width * 0.67;
    const panelH = height * 0.42;
    const panelX = (width - panelW) / 2;
    const panelY = height * 0.29 + (1 - entrance) * 48;
    ctx.globalAlpha = entrance;
    ctx.fillStyle = template.outroStyle === 'creator-cta' ? `${preset.background}f4` : `${preset.surface}eb`;
    roundedRect(ctx, panelX, panelY, panelW, panelH, 36);
    ctx.fill();
    ctx.strokeStyle = `${preset.accent}cc`;
    ctx.lineWidth = 3;
    roundedRect(ctx, panelX, panelY, panelW, panelH, 36);
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.font = `700 ${Math.round(width * 0.023)}px Arial, sans-serif`;
    ctx.fillStyle = preset.accent;
    ctx.fillText(template.outroStyle === 'creator-cta' ? 'FOLLOW FOR THE NEXT STEP' : 'THANKS FOR WATCHING', width / 2, panelY + panelH * 0.27);
    ctx.font = `800 ${Math.round(width * 0.043)}px "Arial", "Noto Sans TC", sans-serif`;
    ctx.fillStyle = preset.foreground;
    ctx.fillText(copy.creator, width / 2, panelY + panelH * 0.52);
    ctx.font = `500 ${Math.round(width * 0.022)}px "Arial", "Noto Sans TC", sans-serif`;
    ctx.fillStyle = preset.muted;
    ctx.fillText(copy.cta, width / 2, panelY + panelH * 0.74);
    ctx.textAlign = 'start';
    ctx.restore();
}

function drawLowerThird(ctx, canvas, layer, preset, copy, template) {
    const { width, height } = canvas;
    const entered = easeOutCubic(layer.progress);
    const layout = layer.layout || { x: 6.5, y: template.lowerThirdStyle === 'soft-pill' ? 76 : 73.5, w: template.lowerThirdStyle === 'soft-pill' ? 46 : 53, h: 15, opacity: 100 };
    const x = width * (layout.x / 100) + (1 - entered + layer.exitProgress) * width * 0.22;
    const y = height * (layout.y / 100);
    const cardW = width * (layout.w / 100);
    const cardH = height * (layout.h / 100);
    ctx.save();
    ctx.globalAlpha = entered * (1 - layer.exitProgress) * ((layout.opacity ?? 100) / 100);
    if (template.lowerThirdStyle === 'accent-underline') {
        const textX = x + 4;
        const nameY = y + height * 0.052;
        ctx.font = `800 ${Math.round(width * 0.027)}px "Arial", "Noto Sans TC", sans-serif`;
        const ruleW = Math.min(width * 0.34, Math.max(width * 0.16, ctx.measureText(layer.text).width));
        ctx.fillStyle = preset.foreground;
        drawWrappedText(ctx, layer.text, textX, nameY, width * 0.58, width * 0.033, 2);
        ctx.fillStyle = preset.accent;
        ctx.fillRect(textX, nameY + height * 0.026, ruleW * entered, 6);
        ctx.font = `600 ${Math.round(width * 0.014)}px "Arial", "Noto Sans TC", sans-serif`;
        ctx.fillStyle = preset.muted;
        ctx.fillText(`${copy.creator.toUpperCase()}  ·  STEP`, textX, nameY + height * 0.062);
        ctx.restore();
        return;
    }
    ctx.fillStyle = template.lowerThirdStyle === 'bold-block' || template.lowerThirdStyle === 'creator-cta' ? preset.accent : `${preset.surface}ee`;
    roundedRect(ctx, x, y, cardW, cardH, template.lowerThirdStyle === 'soft-pill' ? cardH / 2 : 22);
    ctx.fill();
    if (template.lowerThirdStyle === 'code-window') {
        ctx.fillStyle = `${preset.foreground}20`;
        roundedRect(ctx, x + 14, y + 14, cardW - 28, cardH - 28, 12);
        ctx.fill();
        [0, 1, 2].forEach(index => {
            ctx.fillStyle = [preset.accent, preset.accentAlt, preset.foreground][index];
            ctx.beginPath(); ctx.arc(x + 34 + index * 17, y + 34, 5, 0, Math.PI * 2); ctx.fill();
        });
    } else {
        ctx.fillStyle = template.lowerThirdStyle === 'bold-block' || template.lowerThirdStyle === 'creator-cta' ? preset.background : preset.accent;
        roundedRect(ctx, x, y, 12, cardH, 8);
        ctx.fill();
        ctx.fillStyle = template.lowerThirdStyle === 'bold-block' || template.lowerThirdStyle === 'creator-cta' ? preset.background : preset.accentAlt;
        ctx.fillRect(x + 34, y + 30, width * 0.055, 5);
    }
    ctx.font = `700 ${Math.round(width * 0.018)}px Arial, sans-serif`;
    ctx.fillStyle = template.lowerThirdStyle === 'bold-block' || template.lowerThirdStyle === 'creator-cta' ? preset.background : preset.accent;
    ctx.fillText(template.lowerThirdStyle === 'creator-cta' ? 'OPEN VISCRIBE / FOLLOW' : copy.creator.toUpperCase(), x + 34, y + 65);
    ctx.font = `700 ${Math.round(width * 0.026)}px "Arial", "Noto Sans TC", sans-serif`;
    ctx.fillStyle = template.lowerThirdStyle === 'bold-block' || template.lowerThirdStyle === 'creator-cta' ? preset.background : preset.foreground;
    drawWrappedText(ctx, layer.text, x + 34, y + 109, cardW - 72, width * 0.031, 2);
    ctx.restore();
}

function drawAssetPanel(ctx, x, y, width, height, preset, entered) {
    ctx.globalAlpha = entered;
    ctx.fillStyle = `${preset.background}f2`;
    roundedRect(ctx, x, y, width, height, 30);
    ctx.fill();
    ctx.strokeStyle = `${preset.accent}b8`;
    ctx.lineWidth = 3;
    roundedRect(ctx, x, y, width, height, 30);
    ctx.stroke();
}

function drawCodeRows(ctx, x, y, width, count, preset, progress, mode = 'normal') {
    for (let index = 0; index < count; index += 1) {
        const ratio = [0.72, 0.48, 0.82, 0.59, 0.68][index % 5];
        const rowProgress = clamp((progress * count - index) * 1.8);
        ctx.fillStyle = index % 3 === 0 ? preset.accent : index % 3 === 1 ? preset.accentAlt : preset.foreground;
        ctx.globalAlpha = 0.22 + rowProgress * 0.68;
        ctx.fillRect(x, y + index * 26, width * ratio * rowProgress, mode === 'neon' ? 8 : 10);
    }
    ctx.globalAlpha = 1;
}

function drawHyperframeAsset(ctx, canvas, layer, preset) {
    const asset = getHyperframeAsset(layer.assetId) || layer.assetDefinition;
    if (!asset) return;
    const assetConfig = getHyperframeAssetConfig(asset, layer.assetConfig);
    const { width, height } = canvas;
    const entered = easeOutCubic(layer.progress) * (1 - layer.exitProgress);
    const timelineProgress = clamp(Number(layer.timelineProgress ?? layer.progress) || 0);
    const buildProgress = easeOutCubic(clamp(timelineProgress / 0.3));
    const breatheProgress = clamp((timelineProgress - 0.3) / 0.42);
    const resolveProgress = clamp((timelineProgress - 0.72) / 0.28);
    const ambientWave = Math.sin(breatheProgress * Math.PI * 4) * (1 - resolveProgress);
    const ambientPulse = (0.5 + 0.5 * Math.sin(breatheProgress * Math.PI * 4)) * (1 - resolveProgress);
    const layout = layer.layout || { x: 0, y: 0, w: 100, h: 100, opacity: 100 };
    const x = width * (layout.x / 100);
    const y = height * (layout.y / 100) + (1 - entered) * 42;
    const panelW = width * (layout.w / 100);
    const panelH = height * (layout.h / 100);
    const layerOpacity = (layout.opacity ?? 100) / 100;
    ctx.save();
    if (asset.assetType === 'generated-scene') {
        const sceneX = width * (layout.x / 100);
        const sceneY = height * (layout.y / 100);
        const sceneW = width * (layout.w / 100);
        const sceneH = height * (layout.h / 100);
        ctx.globalAlpha = layerOpacity;
        if (assetConfig.backgroundGradient?.stops?.length) {
            const backgroundGradient = assetConfig.backgroundGradient.type === 'radial'
                ? ctx.createRadialGradient(sceneX + sceneW * .5, sceneY + sceneH * .45, 0, sceneX + sceneW * .5, sceneY + sceneH * .45, Math.max(sceneW, sceneH) * .72)
                : (() => {
                    const radians = (assetConfig.backgroundGradient.angle * Math.PI) / 180;
                    const dx = Math.cos(radians) * sceneW * .5;
                    const dy = Math.sin(radians) * sceneH * .5;
                    return ctx.createLinearGradient(sceneX + sceneW * .5 - dx, sceneY + sceneH * .5 - dy, sceneX + sceneW * .5 + dx, sceneY + sceneH * .5 + dy);
                })();
            assetConfig.backgroundGradient.stops.forEach(stop => backgroundGradient.addColorStop(stop.at, resolveGeneratedSceneColor(stop.color, preset)));
            ctx.fillStyle = backgroundGradient;
        } else {
            ctx.fillStyle = resolveGeneratedSceneColor(assetConfig.background, preset);
        }
        ctx.fillRect(sceneX, sceneY, sceneW, sceneH);
        const elements = [...assetConfig.elements].sort((a, b) => a.zIndex - b.zIndex);
        elements.forEach(element => {
            const state = evaluateGeneratedSceneElement(element, timelineProgress);
            const elementX = sceneX + sceneW * (state.x / 100);
            const elementY = sceneY + sceneH * (state.y / 100);
            const elementW = sceneW * (state.w / 100);
            const elementH = sceneH * (state.h / 100);
            if (elementW <= 0 || elementH <= 0 || state.opacity <= 0) return;
            ctx.save();
            ctx.globalAlpha = layerOpacity * state.opacity;
            ctx.globalCompositeOperation = ['screen', 'multiply', 'overlay', 'lighten'].includes(element.blendMode) ? element.blendMode : 'source-over';
            ctx.translate(elementX + elementW / 2, elementY + elementH / 2);
            ctx.rotate((state.rotate * Math.PI) / 180);
            ctx.scale(state.scale * state.scaleX, state.scale * state.scaleY);
            ctx.filter = state.blur > 0 ? `blur(${state.blur}px)` : 'none';
            if (element.shadow > 0) {
                ctx.shadowColor = resolveGeneratedSceneColor(element.shadowColor || element.fill, preset);
                ctx.shadowBlur = element.shadow * (sceneW / 320);
                ctx.shadowOffsetX = (element.shadowX || 0) * (sceneW / 320);
                ctx.shadowOffsetY = (element.shadowY || 0) * (sceneH / 180);
            }
            const left = -elementW / 2;
            const top = -elementH / 2;
            ctx.beginPath();
            ctx.rect(left, top, elementW * (state.clipX / 100), elementH * (state.clipY / 100));
            ctx.clip();
            let fillStyle = resolveGeneratedSceneColor(element.fill, preset);
            if (element.gradient?.stops?.length) {
                let gradient;
                if (element.gradient.type === 'radial') {
                    gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, Math.max(elementW, elementH) * .62);
                } else {
                    const radians = (element.gradient.angle * Math.PI) / 180;
                    const extent = Math.hypot(elementW, elementH) / 2;
                    const dx = Math.cos(radians) * extent;
                    const dy = Math.sin(radians) * extent;
                    gradient = ctx.createLinearGradient(-dx, -dy, dx, dy);
                }
                element.gradient.stops.forEach(stop => gradient.addColorStop(stop.at, resolveGeneratedSceneColor(stop.color, preset)));
                fillStyle = gradient;
            }
            ctx.fillStyle = fillStyle;
            ctx.strokeStyle = resolveGeneratedSceneColor(element.stroke, preset);
            ctx.lineWidth = element.strokeWidth * (sceneW / 320);
            ctx.lineCap = element.lineCap || 'round';
            ctx.lineJoin = element.lineJoin || 'round';
            if (element.type === 'text') {
                const fontSize = Math.max(8, sceneW * (element.fontSize / 100));
                ctx.font = `${element.fontWeight} ${fontSize}px Arial, sans-serif`;
                ctx.textAlign = element.align;
                ctx.textBaseline = 'middle';
                const textX = element.align === 'center' ? 0 : element.align === 'right' ? elementW / 2 : -elementW / 2;
                ctx.fillStyle = fillStyle;
                drawWrappedText(ctx, element.text, textX, 0, elementW, fontSize * 1.05, Math.max(1, Math.floor(elementH / (fontSize * 1.05))));
            } else if (element.type === 'image') {
                const image = getCanvasImage(element.src);
                if (image) {
                    const imageRatio = image.naturalWidth / Math.max(1, image.naturalHeight);
                    const boxRatio = elementW / Math.max(1, elementH);
                    let drawW = elementW;
                    let drawH = elementH;
                    if (element.objectFit === 'contain') {
                        if (imageRatio > boxRatio) drawH = elementW / imageRatio;
                        else drawW = elementH * imageRatio;
                    } else if (imageRatio > boxRatio) drawW = elementH * imageRatio;
                    else drawH = elementW / imageRatio;
                    ctx.drawImage(image, -drawW / 2, -drawH / 2, drawW, drawH);
                }
            } else if (element.type === 'polygon') {
                const points = element.points.length ? element.points : [[0, 0], [100, 0], [100, 100], [0, 100]];
                ctx.beginPath();
                points.forEach(([px, py], index) => {
                    const pointX = left + elementW * (px / 100);
                    const pointY = top + elementH * (py / 100);
                    if (index) ctx.lineTo(pointX, pointY); else ctx.moveTo(pointX, pointY);
                });
                ctx.closePath();
                ctx.fill();
                if (element.strokeWidth > 0) ctx.stroke();
            } else if (element.type === 'path') {
                try {
                    const path = new Path2D(element.path || 'M0 100 L50 0 L100 100 Z');
                    ctx.save();
                    ctx.translate(left, top);
                    ctx.scale(elementW / 100, elementH / 100);
                    ctx.fill(path);
                    if (element.strokeWidth > 0) ctx.stroke(path);
                    ctx.restore();
                } catch (error) {
                    // A malformed AI path should not abort the frame export.
                }
            } else if (element.type === 'line') {
                ctx.fillRect(left, -Math.max(1, elementH) / 2, elementW, Math.max(1, elementH));
            } else {
                const radius = element.type === 'circle' ? Math.min(elementW, elementH) / 2 : Math.min(elementW, elementH) * (state.radius / 100);
                roundedRect(ctx, left, top, elementW, elementH, radius);
                ctx.fill();
                if (element.strokeWidth > 0) ctx.stroke();
            }
            ctx.restore();
        });
        ctx.restore();
        return;
    }
    if (asset.assetType === 'brand-transition') {
        const isTall = asset.aspectRatio === '9:16';
        const holdOffset = (assetConfig.holdPercent - 15) / 1000;
        const entranceProgress = easeOutCubic(clamp(timelineProgress / 0.28));
        const revealProgress = easeOutCubic(clamp((timelineProgress - 0.14) / 0.3));
        const exitProgress = easeOutCubic(clamp((timelineProgress - (0.68 + holdOffset)) / Math.max(0.12, 0.32 - holdOffset)));
        const directionSign = assetConfig.direction === 'right-to-left' || assetConfig.direction === 'bottom-to-top' ? -1 : 1;
        ctx.globalAlpha = layerOpacity;
        ctx.fillStyle = preset.background;
        ctx.fillRect(x, y, panelW, panelH);

        const sliceCount = assetConfig.sliceCount;
        const angleShift = Math.tan((assetConfig.angle * Math.PI) / 180) * panelH * 0.32;
        for (let index = 0; index < sliceCount; index += 1) {
            const sliceProgress = staggeredMotion(timelineProgress, index, 0.018, 0.22);
            const color = index % 3 === 0 ? preset.accent : index % 3 === 1 ? preset.surface : preset.accentAlt;
            ctx.globalAlpha = layerOpacity * (0.2 + assetConfig.intensity / 160) * sliceProgress;
            ctx.fillStyle = color;
            if (assetConfig.entrance === 'radial-burst') {
                const startAngle = (index / sliceCount) * Math.PI * 2 - Math.PI / 2;
                const endAngle = ((index + 0.72) / sliceCount) * Math.PI * 2 - Math.PI / 2;
                const radius = Math.hypot(panelW, panelH) * 0.72 * sliceProgress;
                ctx.beginPath();
                ctx.moveTo(x + panelW / 2, y + panelH / 2);
                ctx.arc(x + panelW / 2, y + panelH / 2, radius, startAngle, endAngle);
                ctx.closePath();
                ctx.fill();
            } else if (assetConfig.entrance === 'shutter') {
                const sliceH = panelH / sliceCount + 2;
                const sourceY = index % 2 === 0 ? y - sliceH : y + panelH;
                const targetY = y + index * (panelH / sliceCount);
                const drawY = sourceY + (targetY - sourceY) * sliceProgress;
                ctx.fillRect(x, drawY, panelW, sliceH);
            } else if (assetConfig.entrance === 'split-panels') {
                const sliceW = panelW / sliceCount + 3;
                const targetX = x + index * (panelW / sliceCount);
                const sourceX = index % 2 === 0 ? x - panelW : x + panelW;
                const drawX = sourceX + (targetX - sourceX) * sliceProgress;
                ctx.beginPath();
                ctx.moveTo(drawX - angleShift, y);
                ctx.lineTo(drawX + sliceW - angleShift, y);
                ctx.lineTo(drawX + sliceW + angleShift, y + panelH);
                ctx.lineTo(drawX + angleShift, y + panelH);
                ctx.closePath();
                ctx.fill();
            } else {
                const sliceW = panelW / sliceCount + 3;
                const targetX = x + index * (panelW / sliceCount);
                const travel = (1 - sliceProgress) * panelH * 1.45 * directionSign;
                ctx.beginPath();
                ctx.moveTo(targetX - angleShift, y + travel);
                ctx.lineTo(targetX + sliceW - angleShift, y + travel);
                ctx.lineTo(targetX + sliceW + angleShift, y + panelH + travel);
                ctx.lineTo(targetX + angleShift, y + panelH + travel);
                ctx.closePath();
                ctx.fill();
            }
        }

        const logoImage = getCanvasImage(assetConfig.logoSrc);
        const maxLogoW = panelW * (assetConfig.logoScale / 100);
        const maxLogoH = panelH * (isTall ? 0.42 : 0.6);
        const imageRatio = logoImage ? logoImage.naturalWidth / Math.max(1, logoImage.naturalHeight) : 1.8;
        const logoW = Math.min(maxLogoW, maxLogoH * imageRatio);
        const logoH = Math.min(maxLogoH, logoW / imageRatio);
        const logoX = x + (panelW - logoW) / 2;
        const logoY = y + panelH * (isTall ? 0.31 : 0.2) + (maxLogoH - logoH) / 2;
        ctx.globalAlpha = layerOpacity * revealProgress * (1 - exitProgress * 0.72);
        if (logoImage) {
            if (assetConfig.reveal === 'slice-assemble') {
                const stripCount = Math.max(3, assetConfig.sliceCount);
                for (let index = 0; index < stripCount; index += 1) {
                    const stripProgress = staggeredMotion(clamp((timelineProgress - 0.12) / 0.42), index, 0.035, 0.42);
                    const sourceY = (logoImage.naturalHeight / stripCount) * index;
                    const sourceH = logoImage.naturalHeight / stripCount + 1;
                    const destY = logoY + (logoH / stripCount) * index;
                    const offset = (1 - stripProgress) * panelW * 0.16 * (index % 2 === 0 ? -1 : 1);
                    ctx.globalAlpha = layerOpacity * stripProgress * (1 - exitProgress * 0.72);
                    ctx.drawImage(logoImage, 0, sourceY, logoImage.naturalWidth, sourceH, logoX + offset, destY, logoW, logoH / stripCount + 1);
                }
            } else if (assetConfig.reveal === 'mask-scan') {
                ctx.save();
                ctx.beginPath();
                if (assetConfig.direction === 'right-to-left') ctx.rect(logoX + logoW * (1 - revealProgress), logoY, logoW * revealProgress, logoH);
                else if (assetConfig.direction === 'top-to-bottom') ctx.rect(logoX, logoY, logoW, logoH * revealProgress);
                else if (assetConfig.direction === 'bottom-to-top') ctx.rect(logoX, logoY + logoH * (1 - revealProgress), logoW, logoH * revealProgress);
                else ctx.rect(logoX, logoY, logoW * revealProgress, logoH);
                ctx.clip();
                ctx.drawImage(logoImage, logoX, logoY, logoW, logoH);
                ctx.restore();
            } else {
                const punchScale = assetConfig.reveal === 'scale-punch'
                    ? 0.68 + revealProgress * 0.32 + Math.sin(revealProgress * Math.PI) * 0.14
                    : 0.82 + revealProgress * 0.18;
                ctx.save();
                ctx.translate(logoX + logoW / 2, logoY + logoH / 2);
                ctx.scale(punchScale, punchScale);
                if (assetConfig.reveal === 'stroke-flash' && revealProgress < 0.72) {
                    ctx.shadowColor = preset.foreground;
                    ctx.shadowBlur = panelW * 0.035 * (1 - revealProgress);
                }
                ctx.drawImage(logoImage, -logoW / 2, -logoH / 2, logoW, logoH);
                ctx.restore();
            }
        } else {
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.font = `900 italic ${Math.round(panelW * 0.12)}px Arial, sans-serif`;
            ctx.fillStyle = preset.foreground;
            ctx.fillText(assetConfig.brandName, x + panelW / 2, y + panelH / 2);
        }

        const flashProgress = clamp((timelineProgress - 0.23) / 0.16);
        if (flashProgress > 0 && flashProgress < 1) {
            const scanX = logoX + logoW * flashProgress;
            ctx.globalAlpha = layerOpacity * Math.sin(flashProgress * Math.PI) * 0.9;
            ctx.fillStyle = preset.foreground;
            ctx.shadowColor = preset.accent;
            ctx.shadowBlur = panelW * 0.025;
            ctx.fillRect(scanX, logoY - logoH * 0.08, Math.max(2, panelW * 0.0025), logoH * 1.16);
            ctx.shadowBlur = 0;
        }
        ctx.globalAlpha = layerOpacity * revealProgress * (1 - exitProgress);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'alphabetic';
        ctx.font = `700 ${Math.round(panelW * (isTall ? 0.025 : 0.014))}px "SF Mono", Menlo, monospace`;
        ctx.fillStyle = preset.foreground;
        ctx.fillText(assetConfig.tagline, x + panelW / 2, y + panelH * (isTall ? 0.72 : 0.78));

        if (exitProgress > 0) {
            ctx.globalAlpha = layerOpacity;
            ctx.fillStyle = assetConfig.exit === 'iris' ? preset.surface : preset.accent;
            if (assetConfig.exit === 'split-away') {
                const half = panelH / 2;
                ctx.fillRect(x, y, panelW, half * exitProgress);
                ctx.fillRect(x, y + panelH - half * exitProgress, panelW, half * exitProgress);
            } else if (assetConfig.exit === 'glitch-cut') {
                const bands = 9;
                for (let index = 0; index < bands; index += 1) {
                    const bandProgress = clamp(exitProgress * 1.35 - index * 0.035);
                    const bandH = panelH / bands + 2;
                    const fromX = index % 2 === 0 ? x - panelW : x + panelW;
                    const drawX = fromX + (x - fromX) * bandProgress;
                    ctx.fillStyle = index % 3 === 0 ? preset.accent : preset.surface;
                    ctx.fillRect(drawX, y + index * (panelH / bands), panelW, bandH);
                }
            } else if (assetConfig.exit === 'iris') {
                ctx.beginPath();
                ctx.rect(x, y, panelW, panelH);
                ctx.arc(x + panelW / 2, y + panelH / 2, Math.hypot(panelW, panelH) * 0.7 * (1 - exitProgress), 0, Math.PI * 2);
                ctx.fill('evenodd');
            } else {
                const wipeX = x - panelW * 1.25 + panelW * 2.5 * exitProgress;
                ctx.beginPath();
                ctx.moveTo(wipeX - angleShift - panelW * 0.16, y);
                ctx.lineTo(wipeX + panelW * 0.64 - angleShift, y);
                ctx.lineTo(wipeX + panelW * 0.64 + angleShift, y + panelH);
                ctx.lineTo(wipeX + angleShift - panelW * 0.16, y + panelH);
                ctx.closePath();
                ctx.fill();
            }
        }
        ctx.restore();
        return;
    }
    if (asset.assetType === 'logo-fill') {
        const logoBuild = easeOutCubic(clamp((timelineProgress - 0.035) / 0.72));
        const startPercent = Math.min(assetConfig.startPercent, assetConfig.endPercent);
        const endPercent = Math.max(assetConfig.startPercent, assetConfig.endPercent);
        const displayedPercent = Math.round(startPercent + (endPercent - startPercent) * logoBuild);
        const reveal = clamp(displayedPercent / 100);
        const isTall = asset.aspectRatio === '9:16';
        ctx.globalAlpha = entered * layerOpacity;
        ctx.fillStyle = preset.background;
        roundedRect(ctx, x, y, panelW, panelH, Math.max(12, Math.min(panelW, panelH) * 0.025));
        ctx.fill();
        ctx.strokeStyle = `${preset.foreground}20`;
        ctx.lineWidth = Math.max(1, width * 0.0012);
        roundedRect(ctx, x, y, panelW, panelH, Math.max(12, Math.min(panelW, panelH) * 0.025));
        ctx.stroke();
        const sidePadding = panelW * (isTall ? 0.11 : 0.17);
        const logoW = panelW - sidePadding * 2;
        const logoH = Math.min(panelH * (isTall ? 0.18 : 0.29), logoW * (175 / 487));
        const logoX = x + sidePadding;
        const logoY = y + panelH * (isTall ? 0.35 : 0.32);
        const logoImage = getCanvasImage(assetConfig.logoSrc);
        ctx.font = `700 ${Math.round(panelW * (isTall ? 0.13 : 0.11))}px Arial, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        if (logoImage) {
            ctx.globalAlpha = entered * layerOpacity * 0.12;
            ctx.drawImage(logoImage, logoX, logoY, logoW, logoH);
            ctx.save();
            const clipW = Math.max(1, logoW * reveal);
            ctx.beginPath();
            if (assetConfig.direction === 'right-to-left') ctx.rect(logoX + logoW - clipW, logoY - 2, clipW, logoH + 4);
            else ctx.rect(logoX, logoY - 2, clipW, logoH + 4);
            ctx.clip();
            ctx.globalAlpha = entered * layerOpacity;
            ctx.drawImage(logoImage, logoX, logoY, logoW, logoH);
            ctx.restore();
        } else {
            ctx.globalAlpha = entered * layerOpacity * 0.12;
            ctx.fillStyle = preset.foreground;
            ctx.fillText(assetConfig.brandName, x + panelW / 2, logoY + logoH / 2);
            ctx.save();
            const clipW = Math.max(1, logoW * reveal);
            ctx.beginPath();
            if (assetConfig.direction === 'right-to-left') ctx.rect(logoX + logoW - clipW, logoY - 8, clipW, logoH + 16);
            else ctx.rect(logoX, logoY - 8, clipW, logoH + 16);
            ctx.clip();
            ctx.globalAlpha = entered * layerOpacity;
            ctx.fillText(assetConfig.brandName, x + panelW / 2, logoY + logoH / 2);
            ctx.restore();
        }
        const cursorX = assetConfig.direction === 'right-to-left' ? logoX + logoW * (1 - reveal) : logoX + logoW * reveal;
        if (reveal < 0.995) {
            ctx.globalAlpha = entered * layerOpacity * (0.55 + ambientPulse * 0.4);
            ctx.fillStyle = preset.accentAlt;
            ctx.fillRect(cursorX - 1, logoY - logoH * 0.18, Math.max(2, width * 0.0015), logoH * 1.36);
        }
        ctx.globalAlpha = entered * layerOpacity;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
        ctx.font = `700 ${Math.round(width * 0.009)}px "SF Mono", Menlo, monospace`;
        ctx.fillStyle = `${preset.foreground}88`;
        ctx.fillText('BRAND SYSTEM / LOADING', x + panelW * 0.07, y + panelH * 0.12);
        ctx.textAlign = 'center';
        ctx.font = `800 ${Math.round(width * (isTall ? 0.028 : 0.022))}px "SF Mono", Menlo, monospace`;
        ctx.fillStyle = preset.foreground;
        ctx.fillText(`${displayedPercent}%`, x + panelW / 2, y + panelH * (isTall ? 0.68 : 0.72));
        ctx.font = `700 ${Math.round(width * 0.0075)}px Arial, sans-serif`;
        ctx.fillStyle = preset.muted;
        ctx.fillText(assetConfig.label, x + panelW / 2, y + panelH * (isTall ? 0.73 : 0.78));
        const progressX = x + panelW * 0.07;
        const progressY = y + panelH * 0.89;
        const progressW = panelW * 0.86;
        ctx.fillStyle = `${preset.foreground}1f`;
        ctx.fillRect(progressX, progressY, progressW, Math.max(1, height * 0.0015));
        ctx.fillStyle = preset.foreground;
        if (assetConfig.direction === 'right-to-left') ctx.fillRect(progressX + progressW * (1 - reveal), progressY, progressW * reveal, Math.max(2, height * 0.002));
        else ctx.fillRect(progressX, progressY, progressW * reveal, Math.max(2, height * 0.002));
        ctx.restore();
        return;
    }
    drawAssetPanel(ctx, x, y, panelW, panelH, preset, entered * layerOpacity);
    ctx.globalAlpha = entered * layerOpacity;
    const assetTitle = String(layer.text || asset.nameZh).trim();
    const assetSubtitle = String(layer.creator || asset.description || '').trim();
    ctx.font = `700 ${Math.round(width * 0.018)}px Arial, sans-serif`;
    ctx.fillStyle = preset.accent;
    ctx.fillText(assetTitle.toUpperCase(), x + 44, y + 52);
    ctx.font = `500 ${Math.round(width * 0.011)}px Arial, sans-serif`;
    ctx.fillStyle = preset.muted;
    ctx.fillText(assetSubtitle.slice(0, 64), x + 44, y + 76);
    const contentX = x + 46;
    const contentY = y + 102;
    const contentW = panelW - 92;

    if (asset.assetType === 'world-map' || asset.assetType === 'world-flow') {
        ctx.font = `600 ${Math.round(width * 0.013)}px Arial, sans-serif`;
        ctx.fillStyle = preset.muted;
        ctx.fillText(assetConfig.heading.toUpperCase(), contentX, contentY + 2);
        const mapTop = contentY + 32;
        const mapHeight = panelH * 0.52;
        ctx.strokeStyle = `${preset.foreground}24`; ctx.lineWidth = 1.5;
        [0.2, 0.42, 0.64].forEach(row => { ctx.beginPath(); ctx.moveTo(contentX, mapTop + mapHeight * row); ctx.lineTo(contentX + contentW, mapTop + mapHeight * row); ctx.stroke(); });
        [0.18, 0.42, 0.66, 0.86].forEach(column => { ctx.beginPath(); ctx.moveTo(contentX + contentW * column, mapTop); ctx.lineTo(contentX + contentW * column, mapTop + mapHeight); ctx.stroke(); });
        const continents = [
            [[0.04, 0.12], [0.17, 0.04], [0.29, 0.13], [0.25, 0.26], [0.18, 0.34], [0.08, 0.28]],
            [[0.29, 0.34], [0.38, 0.31], [0.43, 0.46], [0.39, 0.71], [0.32, 0.64]],
            [[0.48, 0.16], [0.64, 0.07], [0.82, 0.17], [0.91, 0.33], [0.76, 0.39], [0.61, 0.31]],
            [[0.69, 0.46], [0.8, 0.51], [0.86, 0.73], [0.78, 0.82], [0.71, 0.66]]
        ];
        continents.forEach(points => { ctx.beginPath(); points.forEach(([px, py], index) => { const cx = contentX + contentW * px; const cy = mapTop + mapHeight * py; index ? ctx.lineTo(cx, cy) : ctx.moveTo(cx, cy); }); ctx.closePath(); ctx.fillStyle = `${preset.foreground}24`; ctx.fill(); ctx.strokeStyle = `${preset.foreground}56`; ctx.stroke(); });
        const nodes = assetConfig.nodes.map(node => getMapNodePosition(node));
        const nodeById = new Map(nodes.map(node => [node.id, node]));
        ctx.strokeStyle = asset.assetType === 'world-flow' ? preset.accent : `${preset.accentAlt}aa`; ctx.lineWidth = asset.assetType === 'world-flow' ? 4 : 2;
        assetConfig.routes.forEach((route, routeIndex) => {
            const from = nodeById.get(route.from);
            const to = nodeById.get(route.to);
            if (!from || !to) return;
            const ax = contentX + contentW * (from.x / 100);
            const ay = mapTop + mapHeight * (from.y / 100);
            const bx = contentX + contentW * (to.x / 100);
            const by = mapTop + mapHeight * (to.y / 100);
            const controlX = (ax + bx) / 2;
            const controlY = Math.min(ay, by) - mapHeight * 0.28;
            const routeProgress = staggeredMotion(timelineProgress, routeIndex, 0.055, 0.22);
            const segmentCount = 28;
            ctx.beginPath();
            for (let step = 0; step <= Math.ceil(segmentCount * routeProgress); step += 1) {
                const t = Math.min(routeProgress, step / segmentCount);
                const inverse = 1 - t;
                const px = inverse * inverse * ax + 2 * inverse * t * controlX + t * t * bx;
                const py = inverse * inverse * ay + 2 * inverse * t * controlY + t * t * by;
                step ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
            }
            ctx.stroke();
            if (asset.assetType === 'world-flow' && routeProgress > 0.9 && breatheProgress > 0) {
                const packetT = (breatheProgress * 1.85 + routeIndex * 0.31) % 1;
                const inverse = 1 - packetT;
                const packetX = inverse * inverse * ax + 2 * inverse * packetT * controlX + packetT * packetT * bx;
                const packetY = inverse * inverse * ay + 2 * inverse * packetT * controlY + packetT * packetT * by;
                ctx.fillStyle = preset.accentAlt;
                ctx.beginPath();
                ctx.arc(packetX, packetY, 7 + ambientPulse * 3, 0, Math.PI * 2);
                ctx.fill();
            }
        });
        if (asset.assetType === 'world-map' && breatheProgress > 0) {
            const scanX = contentX + contentW * breatheProgress;
            const scanGradient = ctx.createLinearGradient(scanX - 28, 0, scanX + 28, 0);
            scanGradient.addColorStop(0, `${preset.accent}00`);
            scanGradient.addColorStop(0.5, `${preset.accent}72`);
            scanGradient.addColorStop(1, `${preset.accent}00`);
            ctx.fillStyle = scanGradient;
            ctx.fillRect(scanX - 28, mapTop, 56, mapHeight);
        }
        nodes.forEach((node, index) => {
            const nodeProgress = staggeredMotion(timelineProgress, index, 0.045, 0.17);
            const cx = contentX + contentW * (node.x / 100);
            const cy = mapTop + mapHeight * (node.y / 100);
            const activePulse = 0.5 + 0.5 * Math.sin((breatheProgress * 4 + index * 0.36) * Math.PI * 2);
            ctx.globalAlpha = nodeProgress * entered;
            ctx.fillStyle = index === nodes.length - 1 ? preset.accentAlt : preset.accent;
            ctx.beginPath();
            ctx.arc(cx, cy, (5 + nodeProgress * 4) * (1 + ambientPulse * 0.08), 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = nodeProgress * entered * (0.2 + activePulse * 0.42) * (1 - resolveProgress * 0.55);
            ctx.beginPath();
            ctx.arc(cx, cy, 15 + activePulse * 10, 0, Math.PI * 2);
            ctx.strokeStyle = ctx.fillStyle;
            ctx.stroke();
            ctx.globalAlpha = entered;
        });
        ctx.font = `600 ${Math.round(width * 0.012)}px Arial, sans-serif`;
        ctx.fillStyle = preset.muted;
        nodes.forEach(node => ctx.fillText(node.label, contentX + contentW * (node.x / 100) + 12, mapTop + mapHeight * (node.y / 100) - 12));
        ctx.fillStyle = preset.accent; ctx.font = `700 ${Math.round(width * 0.011)}px Arial, sans-serif`; ctx.fillText(assetConfig.status.toUpperCase(), contentX, mapTop + mapHeight + 36);
    } else if (asset.assetType === 'data-chart') {
        const values = assetConfig.values;
        ctx.font = `700 ${Math.round(width * 0.013)}px Arial, sans-serif`; ctx.fillStyle = preset.muted; ctx.fillText(`${assetConfig.heading.toUpperCase()} (${assetConfig.unit})`, contentX, contentY + 2);
        values.forEach((item, index) => { const bw = contentW / Math.max(9, values.length * 1.65); const bar = item.value / 100; const bh = panelH * 0.42 * bar * entered; const bx = contentX + index * (contentW / values.length); const by = contentY + panelH * 0.45 - bh; ctx.fillStyle = index === values.length - 1 ? preset.accent : `${preset.accentAlt}aa`; roundedRect(ctx, bx, by, bw, bh, 8); ctx.fill(); ctx.font = `500 ${Math.round(width * 0.01)}px Arial`; ctx.fillStyle = preset.muted; ctx.fillText(item.label.slice(0, 9), bx, contentY + panelH * 0.5); });
        ctx.strokeStyle = preset.foreground; ctx.lineWidth = 3; ctx.beginPath(); values.forEach((item, index) => { const px = contentX + index * (contentW / values.length) + contentW / Math.max(18, values.length * 3.3); const py = contentY + panelH * (0.5 - (item.value / 100) * 0.32); index ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }); ctx.stroke();
    } else if (asset.assetType === 'flowchart' || asset.assetType === 'release-roadmap') {
        const labels = asset.assetType === 'release-roadmap' ? assetConfig.milestones : assetConfig.steps;
        labels.forEach((label, index) => { const bx = contentX + index * (contentW / 3.4); const by = contentY + panelH * 0.25; ctx.fillStyle = `${preset.surface}ee`; roundedRect(ctx, bx, by, contentW * 0.22, panelH * 0.2, 16); ctx.fill(); ctx.strokeStyle = index === 2 ? preset.accent : `${preset.foreground}66`; ctx.stroke(); ctx.fillStyle = preset.foreground; ctx.font = `700 ${Math.round(width * 0.024)}px Arial`; ctx.fillText(label, bx + 24, by + panelH * 0.12); if (index < 2) { ctx.strokeStyle = preset.accent; ctx.beginPath(); ctx.moveTo(bx + contentW * 0.23, by + panelH * 0.1); ctx.lineTo(bx + contentW * 0.29, by + panelH * 0.1); ctx.stroke(); } });
    } else if (asset.assetType === 'code-diff') {
        const columnGap = contentW * 0.035;
        const columnW = (contentW - columnGap) / 2;
        const columnY = contentY + 10;
        const columnH = panelH * 0.52;
        [[`− ${assetConfig.beforeTitle}`, '#fb7185', assetConfig.beforeCode.split('\n').slice(0, 4)], [`+ ${assetConfig.afterTitle}`, '#86efac', assetConfig.afterCode.split('\n').slice(0, 4)]].forEach(([label, color, lines], columnIndex) => {
            const columnX = contentX + columnIndex * (columnW + columnGap);
            ctx.fillStyle = '#0a0d12'; roundedRect(ctx, columnX, columnY, columnW, columnH, 16); ctx.fill();
            ctx.fillStyle = `${color}24`; roundedRect(ctx, columnX, columnY, columnW, 44, 16); ctx.fill(); ctx.fillRect(columnX, columnY + 24, columnW, 20);
            ctx.fillStyle = color; ctx.font = `700 ${Math.round(width * 0.014)}px "SF Mono", Menlo, monospace`; ctx.fillText(label, columnX + 22, columnY + 28);
            lines.forEach((line, lineIndex) => {
                const lineProgress = clamp((entered * lines.length * 1.25) - lineIndex);
                ctx.globalAlpha = 0.22 + lineProgress * 0.78;
                ctx.fillStyle = lineIndex === 0 ? color : '#c7d2df';
                ctx.font = `500 ${Math.round(width * 0.015)}px "SF Mono", Menlo, monospace`;
                ctx.fillText(line, columnX + 24, columnY + 84 + lineIndex * 42);
            });
        });
        ctx.globalAlpha = entered;
    } else if (asset.assetType === 'console' || asset.assetType === 'code-typing' || asset.assetType === 'neon-code') {
        const terminalH = panelH * 0.55;
        ctx.fillStyle = '#07090d'; roundedRect(ctx, contentX, contentY, contentW, terminalH, 16); ctx.fill();
        ctx.fillStyle = '#1b1e24'; roundedRect(ctx, contentX, contentY, contentW, 46, 16); ctx.fill(); ctx.fillRect(contentX, contentY + 25, contentW, 21);
        [['#ff5f57', 0], ['#febc2e', 1], ['#28c840', 2]].forEach(([color, index]) => { ctx.fillStyle = color; ctx.beginPath(); ctx.arc(contentX + 24 + index * 19, contentY + 23, 6, 0, Math.PI * 2); ctx.fill(); });
        const terminalTitle = asset.assetType === 'console' ? assetConfig.windowTitle : assetConfig.fileName;
        ctx.font = `500 ${Math.round(width * 0.012)}px "SF Mono", Menlo, monospace`; ctx.fillStyle = '#a5abb4'; ctx.textAlign = 'center'; ctx.fillText(terminalTitle, contentX + contentW / 2, contentY + 28); ctx.textAlign = 'start';
        const terminalLines = asset.assetType === 'console' ? [`$ ${assetConfig.command}`, ...assetConfig.lines] : assetConfig.code.split('\n').slice(0, 5);
        terminalLines.forEach((line, index) => {
            const lineProgress = clamp((entered * terminalLines.length * 1.35) - index);
            ctx.globalAlpha = 0.18 + lineProgress * 0.82;
            ctx.font = `500 ${Math.round(width * 0.014)}px "SF Mono", Menlo, monospace`;
            ctx.fillStyle = index === 0 ? '#e5e7eb' : index === terminalLines.length - 1 ? '#88ff67' : '#a5abb4';
            ctx.fillText(line, contentX + 30, contentY + 84 + index * 34);
        });
        ctx.globalAlpha = entered;
        if (asset.assetType === 'code-typing' || asset.assetType === 'console') { ctx.fillStyle = '#88ff67'; ctx.fillRect(contentX + Math.min(contentW * 0.84, 30 + entered * contentW * 0.54), contentY + 68, 4, 20); }
    } else if (asset.assetType === 'app-showcase' || asset.assetType === 'device-reveal' || asset.assetType === 'liquid-glass') {
        const deviceW = asset.assetType === 'device-reveal' ? contentW * 0.3 : contentW * 0.64;
        const deviceX = contentX + (contentW - deviceW) / 2;
        ctx.fillStyle = asset.assetType === 'liquid-glass' ? `${preset.foreground}22` : `${preset.surface}f2`;
        roundedRect(ctx, deviceX, contentY + 12, deviceW, panelH * 0.47, asset.assetType === 'device-reveal' ? 42 : 20); ctx.fill();
        ctx.strokeStyle = preset.accent; ctx.lineWidth = 3; roundedRect(ctx, deviceX, contentY + 12, deviceW, panelH * 0.47, asset.assetType === 'device-reveal' ? 42 : 20); ctx.stroke();
        ctx.fillStyle = `${preset.accentAlt}99`; roundedRect(ctx, deviceX + deviceW * 0.12, contentY + 70, deviceW * 0.76, 34, 12); ctx.fill();
        ctx.font = `700 ${Math.round(width * 0.016)}px Arial`; ctx.fillStyle = preset.foreground; ctx.fillText(assetConfig.productName, deviceX + deviceW * 0.12, contentY + 94); ctx.font = `500 ${Math.round(width * 0.012)}px Arial`; ctx.fillStyle = preset.muted; ctx.fillText(assetConfig.headline, deviceX + deviceW * 0.12, contentY + 126); ctx.fillStyle = preset.accent; ctx.fillText(assetConfig.metric, deviceX + deviceW * 0.12, contentY + 154);
    } else if (asset.assetType === 'social-follow') {
        ctx.fillStyle = `${preset.surface}f5`; roundedRect(ctx, contentX + contentW * 0.12, contentY + 35, contentW * 0.76, panelH * 0.32, 22); ctx.fill();
        ctx.fillStyle = preset.accentAlt; ctx.beginPath(); ctx.arc(contentX + contentW * 0.22, contentY + 112, 34, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = preset.foreground; ctx.font = `700 ${Math.round(width * 0.031)}px Arial`; ctx.fillText(assetConfig.handle, contentX + contentW * 0.3, contentY + 105);
        ctx.fillStyle = preset.accent; roundedRect(ctx, contentX + contentW * 0.3, contentY + 128, contentW * 0.25, 42, 14); ctx.fill(); ctx.fillStyle = preset.background; ctx.font = `700 ${Math.round(width * 0.018)}px Arial`; ctx.fillText(assetConfig.cta.toUpperCase(), contentX + contentW * 0.36, contentY + 156);
    } else if (asset.assetType === 'news-ticker') {
        ctx.fillStyle = preset.accent; ctx.fillRect(contentX, contentY + panelH * 0.3, contentW, 76); ctx.fillStyle = preset.background; ctx.font = `800 ${Math.round(width * 0.032)}px Arial`; ctx.fillText(`${assetConfig.prefix}  •  ${assetConfig.message}`, contentX + 32 - (1 - entered) * 180, contentY + panelH * 0.3 + 49);
    } else if (asset.assetType === 'caption-highlight') {
        ctx.textAlign = 'center'; ctx.font = `800 ${Math.round(width * 0.048)}px "Noto Sans TC", Arial`; ctx.fillStyle = preset.foreground; ctx.fillText(assetConfig.line, width / 2, contentY + 125); ctx.fillStyle = preset.accent; ctx.fillText(assetConfig.highlight, width / 2, contentY + 194); ctx.textAlign = 'start';
    } else if (asset.assetType === 'stacked-bars') {
        const isTall = asset.aspectRatio === '9:16';
        const categories = assetConfig.categories || ['Q1', 'Q2', 'Q3', 'Q4'];
        const series = assetConfig.series || [];
        const chartX = isTall ? contentX + contentW * 0.06 : contentX + contentW * 0.47;
        const chartY = contentY + panelH * (isTall ? 0.3 : 0.13);
        const chartW = isTall ? contentW * 0.88 : contentW * 0.48;
        const chartH = panelH * (isTall ? 0.5 : 0.58);
        const totals = categories.map((_, categoryIndex) => series.reduce((sum, item) => sum + (Number(item.values?.[categoryIndex]) || 0), 0));
        const maxTotal = Math.max(1, ...totals) * 1.12;
        const stackColors = [preset.accent, preset.accentAlt, `${preset.foreground}9c`, `${preset.muted}9c`];
        ctx.font = `800 ${Math.round(width * 0.014)}px Arial`;
        ctx.fillStyle = preset.accent;
        ctx.fillText(assetConfig.eyebrow, contentX, contentY + 10);
        ctx.font = `800 ${Math.round(width * 0.026)}px "Noto Sans TC", Arial`;
        ctx.fillStyle = preset.foreground;
        ctx.fillText(assetConfig.headline, contentX, contentY + 58);
        ctx.font = `500 ${Math.round(width * 0.014)}px "Noto Sans TC", Arial`;
        ctx.fillStyle = preset.muted;
        drawWrappedText(ctx, assetConfig.detail, contentX, contentY + 94, isTall ? contentW : contentW * 0.4, width * 0.018, 3);
        [0, .25, .5, .75, 1].forEach((ratio, gridIndex) => {
            const gridProgress = staggeredMotion(timelineProgress, gridIndex, .025, .16);
            const gy = chartY + chartH * ratio;
            ctx.globalAlpha = entered * gridProgress * .6;
            ctx.strokeStyle = `${preset.foreground}38`;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(chartX, gy);
            ctx.lineTo(chartX + chartW * gridProgress, gy);
            ctx.stroke();
        });
        ctx.globalAlpha = entered;
        const slotW = chartW / Math.max(1, categories.length);
        const barW = Math.min(slotW * .58, isTall ? contentW * .13 : contentW * .09);
        const activeBar = Math.min(categories.length - 1, Math.floor(breatheProgress * categories.length));
        categories.forEach((category, categoryIndex) => {
            const barProgress = staggeredMotion(timelineProgress, categoryIndex, .055, .19);
            const bx = chartX + slotW * categoryIndex + (slotW - barW) / 2;
            let renderedStack = 0;
            series.forEach((item, seriesIndex) => {
                const segmentReveal = staggeredMotion(timelineProgress, categoryIndex * .6 + seriesIndex, .035, .16);
                const targetHeight = chartH * ((Number(item.values?.[categoryIndex]) || 0) / maxTotal);
                const segmentHeight = targetHeight * segmentReveal;
                const by = chartY + chartH - renderedStack - segmentHeight;
                ctx.globalAlpha = entered * barProgress;
                ctx.fillStyle = stackColors[seriesIndex % stackColors.length];
                roundedRect(ctx, bx, by, barW, Math.max(0, segmentHeight + .6), Math.min(7, segmentHeight / 2));
                ctx.fill();
                renderedStack += segmentHeight;
            });
            if (categoryIndex === activeBar && breatheProgress > 0 && resolveProgress < 1) {
                ctx.globalAlpha = entered * (0.38 + ambientPulse * .5);
                ctx.strokeStyle = preset.foreground;
                ctx.lineWidth = 2 + ambientPulse * 2;
                roundedRect(ctx, bx - 5, chartY + chartH - renderedStack - 5, barW + 10, renderedStack + 10, 10);
                ctx.stroke();
            }
            ctx.globalAlpha = entered * barProgress;
            ctx.font = `700 ${Math.round(width * 0.011)}px Arial`;
            ctx.fillStyle = preset.muted;
            ctx.textAlign = 'center';
            ctx.fillText(category, bx + barW / 2, chartY + chartH + 24);
            ctx.font = `800 ${Math.round(width * 0.011)}px Arial`;
            ctx.fillStyle = preset.foreground;
            ctx.fillText(String(Math.round(totals[categoryIndex] * barProgress)), bx + barW / 2, chartY + chartH - renderedStack - 12);
        });
        ctx.textAlign = 'start';
        ctx.globalAlpha = entered;
        if (breatheProgress > 0) {
            const scanY = chartY + chartH * (1 - breatheProgress);
            const scanGradient = ctx.createLinearGradient(chartX, 0, chartX + chartW, 0);
            scanGradient.addColorStop(0, `${preset.accent}00`);
            scanGradient.addColorStop(.5, `${preset.accent}bb`);
            scanGradient.addColorStop(1, `${preset.accent}00`);
            ctx.fillStyle = scanGradient;
            ctx.fillRect(chartX, scanY - 2, chartW, 4);
        }
        series.forEach((item, index) => {
            const legendX = isTall ? contentX + (index % 2) * contentW * .45 : contentX;
            const legendY = isTall ? contentY + panelH * .88 + Math.floor(index / 2) * 22 : contentY + panelH * (.52 + index * .075);
            ctx.fillStyle = stackColors[index % stackColors.length];
            roundedRect(ctx, legendX, legendY, 16, 8, 4);
            ctx.fill();
            ctx.font = `600 ${Math.round(width * 0.01)}px "Noto Sans TC", Arial`;
            ctx.fillStyle = preset.muted;
            ctx.fillText(item.label, legendX + 23, legendY + 8);
        });
        ctx.font = `800 ${Math.round(width * 0.026)}px Arial`;
        ctx.fillStyle = preset.accent;
        ctx.fillText(assetConfig.metric, contentX, isTall ? contentY + panelH * .98 : contentY + panelH * .86);
    } else if (asset.assetType === 'aster-orbit') {
        const isTall = asset.aspectRatio === '9:16';
        const cx = isTall ? contentX + contentW / 2 : contentX + contentW * 0.7;
        const cy = contentY + panelH * (isTall ? 0.42 : 0.3);
        const radius = Math.min(contentW * (isTall ? 0.22 : 0.15), panelH * 0.2);
        const orbitProgress = staggeredMotion(timelineProgress, 0, 0.08, 0.22);
        ctx.strokeStyle = `${preset.foreground}2c`; ctx.lineWidth = 13; ctx.beginPath(); ctx.arc(cx, cy, radius, 0, Math.PI * 2); ctx.stroke();
        ctx.strokeStyle = preset.accent; ctx.lineWidth = 13; ctx.lineCap = 'round'; ctx.beginPath(); ctx.arc(cx, cy, radius, -Math.PI / 2, -Math.PI / 2 + Math.PI * 1.44 * orbitProgress); ctx.stroke(); ctx.lineCap = 'butt';
        ctx.fillStyle = `${preset.accentAlt}33`; ctx.beginPath(); ctx.arc(cx, cy, radius * (0.32 + orbitProgress * 0.24), 0, Math.PI * 2); ctx.fill();
        [0, 1, 2].forEach(index => { const tickProgress = staggeredMotion(timelineProgress, index, 0.07, 0.18); const angle = -Math.PI / 2 + index * Math.PI * 2 / 3 + breatheProgress * Math.PI * 2; ctx.globalAlpha = tickProgress; ctx.fillStyle = index === 2 ? preset.accentAlt : preset.accent; ctx.beginPath(); ctx.arc(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius, 7 + tickProgress * 5 + ambientPulse * 3, 0, Math.PI * 2); ctx.fill(); }); ctx.globalAlpha = entered;
        ctx.textAlign = 'center'; ctx.font = `800 ${Math.round(width * 0.048)}px Arial`; ctx.fillStyle = preset.foreground; ctx.fillText(assetConfig.headline, cx, cy + 14); ctx.font = `700 ${Math.round(width * 0.012)}px Arial`; ctx.fillStyle = preset.accent; ctx.fillText(assetConfig.metric, cx, cy + radius + 36); ctx.textAlign = 'start';
        ctx.font = `800 ${Math.round(width * 0.014)}px Arial`; ctx.fillStyle = preset.accent; ctx.fillText(assetConfig.eyebrow, contentX, contentY + 10); ctx.font = `700 ${Math.round(width * 0.025)}px "Noto Sans TC", Arial`; ctx.fillStyle = preset.foreground; drawWrappedText(ctx, assetConfig.detail, contentX, contentY + 58, isTall ? contentW : contentW * 0.48, width * 0.029, 3);
    } else if (asset.assetType === 'harbor-cascade') {
        const isTall = asset.aspectRatio === '9:16'; const values = [0.36, 0.58, 0.46, 0.74];
        ctx.font = `800 ${Math.round(width * 0.014)}px Arial`; ctx.fillStyle = preset.accent; ctx.fillText(assetConfig.eyebrow, contentX, contentY + 10); ctx.font = `800 ${Math.round(width * 0.026)}px "Noto Sans TC", Arial`; ctx.fillStyle = preset.foreground; ctx.fillText(assetConfig.headline, contentX, contentY + 58);
        values.forEach((value, index) => { const reveal = staggeredMotion(timelineProgress, index, 0.055, 0.15); const activeLift = breatheProgress > index * .18 && breatheProgress < index * .18 + .28 ? 8 * Math.sin(((breatheProgress - index * .18) / .28) * Math.PI) : 0; const bw = isTall ? contentW * 0.72 : contentW * 0.16; const bx = isTall ? contentX + contentW * 0.22 : contentX + index * contentW * 0.21; const bh = (isTall ? panelH * 0.07 : value * panelH * 0.34) * reveal; const by = (isTall ? contentY + 105 + index * panelH * 0.105 : contentY + panelH * 0.57 - bh) - activeLift; ctx.fillStyle = index === values.length - 1 ? preset.accent : `${preset.accentAlt}${['aa','cc','99'][index % 3]}`; roundedRect(ctx, bx, by, bw * reveal, bh, 10); ctx.fill(); ctx.globalAlpha = reveal; ctx.font = `700 ${Math.round(width * 0.011)}px Arial`; ctx.fillStyle = preset.foreground; ctx.fillText(['導入','啟用','留存','完成'][index], bx + 12, by + bh * 0.68); }); ctx.globalAlpha = entered;
        ctx.font = `800 ${Math.round(width * 0.03)}px Arial`; ctx.fillStyle = preset.accent; ctx.fillText(assetConfig.metric, isTall ? contentX + contentW * 0.25 : contentX + contentW * 0.7, isTall ? contentY + panelH * 0.72 : contentY + panelH * 0.8);
    } else if (['pulse-radar', 'rank-ladder', 'tide-heatmap', 'constellation'].includes(asset.assetType)) {
        const isTall = asset.aspectRatio === '9:16'; const chartX = isTall ? contentX + contentW * 0.14 : contentX + contentW * 0.54; const chartY = contentY + panelH * 0.16; const chartW = isTall ? contentW * 0.72 : contentW * 0.38; const chartH = panelH * (isTall ? 0.56 : 0.56);
        ctx.font = `800 ${Math.round(width * 0.014)}px Arial`; ctx.fillStyle = preset.accent; ctx.fillText(assetConfig.eyebrow, contentX, contentY + 10); ctx.font = `800 ${Math.round(width * 0.026)}px "Noto Sans TC", Arial`; ctx.fillStyle = preset.foreground; ctx.fillText(assetConfig.headline, contentX, contentY + 58); ctx.font = `500 ${Math.round(width * 0.016)}px "Noto Sans TC", Arial`; ctx.fillStyle = preset.muted; drawWrappedText(ctx, assetConfig.detail, contentX, contentY + 98, isTall ? contentW : contentW * 0.43, width * 0.02, 3);
        if (asset.assetType === 'pulse-radar') { const cx = chartX + chartW / 2; const cy = chartY + chartH / 2; const radius = Math.min(chartW, chartH) * 0.38; const radarProgress = staggeredMotion(timelineProgress, 0, .06, .2); [1, .68, .38].forEach((scale, ringIndex) => { ctx.globalAlpha = radarProgress * (0.72 + ringIndex * .1); ctx.beginPath(); for (let index = 0; index < 5; index += 1) { const angle = -Math.PI / 2 + index * Math.PI * 2 / 5; const px = cx + Math.cos(angle) * radius * scale; const py = cy + Math.sin(angle) * radius * scale; index ? ctx.lineTo(px, py) : ctx.moveTo(px, py); } ctx.closePath(); ctx.strokeStyle = `${preset.foreground}3b`; ctx.stroke(); }); ctx.beginPath(); [0.82, .52, .72, .64, .9].forEach((scale, index) => { const vertexProgress = staggeredMotion(timelineProgress, index, .04, .16); const breatheScale = 1 + ambientWave * .035; const angle = -Math.PI / 2 + index * Math.PI * 2 / 5; const px = cx + Math.cos(angle) * radius * scale * vertexProgress * breatheScale; const py = cy + Math.sin(angle) * radius * scale * vertexProgress * breatheScale; index ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }); ctx.closePath(); ctx.fillStyle = `${preset.accent}55`; ctx.fill(); ctx.strokeStyle = preset.accent; ctx.lineWidth = 4; ctx.stroke(); const scanAngle = -Math.PI / 2 + breatheProgress * Math.PI * 2; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(scanAngle) * radius, cy + Math.sin(scanAngle) * radius); ctx.strokeStyle = `${preset.accentAlt}aa`; ctx.lineWidth = 3; ctx.stroke(); ctx.globalAlpha = entered; }
        if (asset.assetType === 'rank-ladder') [0.4, .62, .86].forEach((value, index) => { const reveal = staggeredMotion(timelineProgress, index, .06, .16); const podiumPulse = index === 2 ? ambientPulse * 9 : 0; const bw = chartW / 3.8; const bh = chartH * value * reveal + podiumPulse; const bx = chartX + index * chartW * .32; const by = chartY + chartH - bh; ctx.fillStyle = index === 2 ? preset.accent : `${preset.accentAlt}${index ? 'cc' : '88'}`; roundedRect(ctx, bx, by, bw, bh, 12); ctx.fill(); ctx.globalAlpha = reveal; ctx.fillStyle = preset.foreground; ctx.font = `800 ${Math.round(width * 0.016)}px Arial`; ctx.fillText(`0${3 - index}`, bx + 14, by + 32); if (index === 2) { ctx.fillStyle = preset.accentAlt; ctx.beginPath(); ctx.arc(bx + bw / 2, by - 14, 5 + ambientPulse * 6, 0, Math.PI * 2); ctx.fill(); } }); ctx.globalAlpha = entered;
        if (asset.assetType === 'tide-heatmap') { const cell = Math.min(chartW / 7.8, chartH / 4.8); const hotCell = Math.min(27, Math.floor(breatheProgress * 28)); for (let index = 0; index < 28; index += 1) { const cellProgress = staggeredMotion(timelineProgress, index, .008, .12); const col = index % 7; const row = Math.floor(index / 7); const isHot = index === hotCell; ctx.globalAlpha = cellProgress * entered; ctx.fillStyle = isHot || index % 5 === 0 ? preset.accent : index % 3 === 0 ? `${preset.accentAlt}cc` : `${preset.foreground}25`; const cellScale = cellProgress * (isHot ? 1.08 + ambientPulse * .08 : 1); const offset = cell * (1 - cellScale) / 2; roundedRect(ctx, chartX + col * cell * 1.12 + offset, chartY + row * cell * 1.12 + offset + (1 - cellProgress) * 12, cell * cellScale, cell * cellScale, 9); ctx.fill(); } ctx.globalAlpha = entered; }
        if (asset.assetType === 'constellation') { const points = [[.08,.82],[.2,.7],[.31,.62],[.44,.48],[.58,.42],[.69,.28],[.83,.15],[.55,.75]]; const lineProgress = staggeredMotion(timelineProgress, 0, .06, .2); ctx.strokeStyle = `${preset.foreground}4c`; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(chartX, chartY); ctx.lineTo(chartX, chartY + chartH); ctx.lineTo(chartX + chartW, chartY + chartH); ctx.stroke(); ctx.strokeStyle = `${preset.accent}88`; ctx.beginPath(); ctx.moveTo(chartX + chartW * .06, chartY + chartH * .86); ctx.lineTo(chartX + chartW * (.06 + .82 * lineProgress), chartY + chartH * (.86 - .75 * lineProgress)); ctx.stroke(); points.forEach(([px, py], index) => { const pointProgress = staggeredMotion(timelineProgress, index, .035, .14); const isOutlier = index === 7; ctx.globalAlpha = pointProgress * entered; ctx.fillStyle = isOutlier ? preset.accent : preset.accentAlt; ctx.beginPath(); ctx.arc(chartX + chartW * px, chartY + chartH * py + (isOutlier ? ambientWave * 5 : 0), (isOutlier ? 13 + ambientPulse * 4 : 8) * pointProgress, 0, Math.PI * 2); ctx.fill(); if (isOutlier) { ctx.strokeStyle = `${preset.accent}88`; ctx.beginPath(); ctx.arc(chartX + chartW * px, chartY + chartH * py, 20 + ambientPulse * 10, 0, Math.PI * 2); ctx.stroke(); } }); ctx.globalAlpha = entered; }
        ctx.font = `800 ${Math.round(width * 0.024)}px Arial`; ctx.fillStyle = preset.accent; ctx.fillText(assetConfig.metric, contentX, isTall ? contentY + panelH * 0.86 : contentY + panelH * 0.78);
    } else if (['aperture-open', 'aperture-close', 'margin-note', 'folded-proof'].includes(asset.assetType)) {
        const isTall = asset.aspectRatio === '9:16';
        const left = contentX + (isTall ? 0 : contentW * 0.05);
        const top = contentY + panelH * 0.13;
        const paperProgress = staggeredMotion(timelineProgress, 0, .06, .22);
        const copyProgress = staggeredMotion(timelineProgress, 1, .065, .2);
        const ruleLength = isTall ? 16 : 92;
        const paperX = isTall ? contentX + contentW * 0.72 : contentX + contentW * 0.83;
        ctx.fillStyle = `${preset.accentAlt}55`;
        ctx.save();
        ctx.translate(
            paperX + (1 - paperProgress) * panelW * .18 + ambientWave * 8,
            top - (1 - paperProgress) * 54 + ambientWave * 5
        );
        ctx.rotate(-0.7 + paperProgress * .35 + ambientWave * 0.025);
        roundedRect(ctx, -panelH * 0.18, 0, panelH * 0.36, panelH * 0.92, 36);
        ctx.fill();
        if (breatheProgress > 0) {
            const sheenY = panelH * (0.08 + breatheProgress * 0.72);
            ctx.fillStyle = `${preset.foreground}18`;
            roundedRect(ctx, -panelH * 0.16, sheenY, panelH * 0.32, 18, 9);
            ctx.fill();
        }
        ctx.restore();
        ctx.fillStyle = preset.accent;
        ctx.fillRect(left, top, ruleLength * copyProgress, 6);
        if (copyProgress > 0.9) {
            const ruleX = left + ruleLength * breatheProgress;
            ctx.fillStyle = preset.accentAlt;
            ctx.beginPath();
            ctx.arc(ruleX, top + 3, 5 + ambientPulse * 3, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = copyProgress;
        ctx.font = `800 ${Math.round(width * 0.014)}px Arial`;
        ctx.fillStyle = preset.accent;
        ctx.fillText(assetConfig.eyebrow, left, top + 36);
        ctx.font = `800 ${Math.round(width * 0.04)}px "Noto Sans TC", Arial`;
        ctx.fillStyle = preset.foreground;
        drawWrappedText(ctx, assetConfig.headline, left, top + 92 + (1 - copyProgress) * 28, isTall ? contentW * 0.9 : contentW * 0.65, width * 0.048, 3);
        ctx.font = `500 ${Math.round(width * 0.018)}px "Noto Sans TC", Arial`;
        ctx.fillStyle = preset.muted;
        drawWrappedText(ctx, assetConfig.detail, left, top + (isTall ? 270 : 205) + (1 - copyProgress) * 18, isTall ? contentW * 0.76 : contentW * 0.56, width * 0.022, 3);
        ctx.globalAlpha = entered;
        if (asset.assetType === 'margin-note') {
            const registrationY = top + 72 + breatheProgress * panelH * 0.42;
            ctx.fillStyle = preset.accentAlt;
            ctx.fillRect(left - 14, top + 56, 3, panelH * 0.48 * buildProgress);
            ctx.beginPath();
            ctx.arc(left - 12.5, registrationY, 6 + ambientPulse * 3, 0, Math.PI * 2);
            ctx.fill();
        }
        if (asset.assetType === 'aperture-close') {
            const cueX = left + (isTall ? contentW * 0.72 : contentW * 0.57);
            const cueY = top + (isTall ? panelH * 0.58 : panelH * 0.5);
            ctx.strokeStyle = preset.accent;
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(cueX, cueY, 18 + ambientPulse * 8, 0, Math.PI * 2);
            ctx.stroke();
            ctx.fillStyle = preset.accent;
            ctx.beginPath();
            ctx.moveTo(cueX - 4, cueY - 7);
            ctx.lineTo(cueX + 7 + ambientPulse * 5, cueY);
            ctx.lineTo(cueX - 4, cueY + 7);
            ctx.closePath();
            ctx.fill();
        }
        if (asset.assetType === 'folded-proof') {
            const foldProgress = staggeredMotion(timelineProgress, 2, .07, .18);
            const foldWidth = (isTall ? contentW * 0.82 : contentW * 0.58) * foldProgress;
            const foldY = top + (isTall ? panelH * 0.46 : panelH * 0.5);
            ctx.fillStyle = `${preset.surface}ee`;
            roundedRect(ctx, left, foldY, foldWidth, panelH * 0.16, 18);
            ctx.fill();
            ctx.save();
            roundedRect(ctx, left, foldY, foldWidth, panelH * 0.16, 18);
            ctx.clip();
            const wipeX = left - 70 + (foldWidth + 140) * breatheProgress;
            const wipeGradient = ctx.createLinearGradient(wipeX - 40, 0, wipeX + 40, 0);
            wipeGradient.addColorStop(0, `${preset.accent}00`);
            wipeGradient.addColorStop(0.5, `${preset.accent}52`);
            wipeGradient.addColorStop(1, `${preset.accent}00`);
            ctx.fillStyle = wipeGradient;
            ctx.fillRect(wipeX - 40, foldY, 80, panelH * 0.16);
            ctx.restore();
            ctx.globalAlpha = foldProgress;
            ctx.fillStyle = preset.accent;
            ctx.font = `800 ${Math.round(width * 0.018)}px Arial`;
            ctx.fillText(assetConfig.secondary, left + 24, top + (isTall ? panelH * 0.56 : panelH * 0.6));
            ctx.globalAlpha = entered;
        }
    } else if (asset.assetType === 'echo-caption' || asset.assetType === 'dual-rail') {
        const isTall = asset.aspectRatio === '9:16';
        const baseY = contentY + panelH * (isTall ? 0.45 : 0.44);
        const captionProgress = staggeredMotion(timelineProgress, 0, .08, .2);
        const wordsProgress = staggeredMotion(timelineProgress, 1, .065, .2);
        const captionW = contentW * captionProgress;
        const captionHeight = asset.assetType === 'dual-rail' ? 154 : 108;
        ctx.fillStyle = `${preset.background}dd`;
        roundedRect(ctx, contentX, baseY - 46 + ambientWave * 3, captionW, captionHeight, 22);
        ctx.fill();
        ctx.strokeStyle = `${preset.foreground}4d`;
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.globalAlpha = wordsProgress;
        ctx.font = `800 ${Math.round(width * 0.013)}px Arial`;
        ctx.fillStyle = preset.accent;
        ctx.fillText(assetConfig.eyebrow, contentX + 30, baseY - 16);
        ctx.font = `800 ${Math.round(width * 0.032)}px "Noto Sans TC", Arial`;
        ctx.fillStyle = preset.foreground;
        drawWrappedText(ctx, assetConfig.headline, contentX + 30, baseY + 32 + (1 - wordsProgress) * 22, contentW - 60, width * 0.038, 2);
        if (asset.assetType === 'dual-rail') {
            const railBlend = 0.45 + ambientPulse * 0.55;
            ctx.font = `600 ${Math.round(width * 0.02)}px Arial`;
            ctx.fillStyle = preset.accentAlt;
            ctx.globalAlpha = wordsProgress * railBlend;
            ctx.fillText(assetConfig.detail, contentX + 30, baseY + 104);
            ctx.globalAlpha = entered;
            const railY = baseY + 128;
            ctx.fillStyle = `${preset.accent}55`;
            ctx.fillRect(contentX + 20, railY, contentW - 40, 3);
            ctx.fillStyle = preset.accentAlt;
            ctx.fillRect(contentX + 20 + (contentW - 88) * breatheProgress, railY - 4, 48, 11);
        } else {
            ctx.font = `600 ${Math.round(width * 0.018)}px "Noto Sans TC", Arial`;
            ctx.fillStyle = preset.muted;
            ctx.fillText(assetConfig.detail, contentX + 30, baseY + 76);
            const emphasisWidth = contentW * (0.18 + ambientPulse * 0.2);
            ctx.fillStyle = `${preset.accentAlt}9c`;
            ctx.fillRect(contentX + 30, baseY + 42, emphasisWidth, 7);
        }
        ctx.globalAlpha = entered;
        ctx.fillStyle = preset.accent;
        ctx.fillRect(contentX, baseY + (asset.assetType === 'dual-rail' ? 140 : 88), contentW * timelineProgress, 4);
    }
    ctx.restore();
}

export function drawMotionDesignToCanvas(ctx, canvas, { design, time, duration, subtitles, fallbackTitle, fallbackCreator, hiddenVisualTrackIndexes = [], onlyVisualTrackIndex = null }) {
    const settings = getMotionDesignSettings(design);
    const layers = getMotionDesignLayers({ design: settings, time, duration, subtitles });
    if (!layers.length) return;
    const copy = getMotionDesignCopy(settings, { fallbackTitle, fallbackCreator });
    const template = getHyperframeTemplate(settings.hyperframeTemplateId);
    layers.filter(layer => {
        const visualTrackIndex = Math.max(0, Number(layer.visualTrackIndex) || 0);
        return !hiddenVisualTrackIndexes.includes(visualTrackIndex)
            && (onlyVisualTrackIndex === null || visualTrackIndex === onlyVisualTrackIndex);
    }).forEach(layer => {
        const basePreset = getMotionDesignPreset(layer.presetId || settings.presetId);
        const preset = layer.assetDefinition?.palette
            ? { ...basePreset, ...layer.assetDefinition.palette }
            : basePreset;
        const layerCopy = layer.creator ? { ...copy, creator: layer.creator } : copy;
        const layerTemplate = getHyperframeTemplate(layer.templateId || template.id);
        if (layer.kind === 'intro') drawIntro(ctx, canvas, layer, preset, layerCopy, layerTemplate);
        if (layer.kind === 'outro') drawOutro(ctx, canvas, layer, preset, layerCopy, layerTemplate);
        if (layer.kind === 'lower-third') drawLowerThird(ctx, canvas, layer, preset, layerCopy, layerTemplate);
        if (layer.kind === 'hyperframe-asset') drawHyperframeAsset(ctx, canvas, layer, preset);
    });
}

export const MOTION_DESIGN_TIMINGS = { minimumDuration: 0.8, maximumDuration: 10 };
