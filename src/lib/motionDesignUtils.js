import { DEFAULT_MOTION_DESIGN, MOTION_DESIGN_PRESETS } from '../constants/appConstants';

const INTRO_DURATION = 2.6;
const OUTRO_DURATION = 3.1;
const LOWER_THIRD_MAX_DURATION = 3.4;

const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));
const easeOutCubic = (value) => 1 - Math.pow(1 - clamp(value), 3);
export function getMotionDesignSettings(value) {
    const raw = value || {};
    const presetId = MOTION_DESIGN_PRESETS.some(item => item.id === raw.presetId)
        ? raw.presetId
        : DEFAULT_MOTION_DESIGN.presetId;
    return {
        ...DEFAULT_MOTION_DESIGN,
        ...raw,
        enabled: Boolean(raw.enabled),
        presetId,
        includeIntro: raw.includeIntro !== false,
        includeOutro: raw.includeOutro !== false,
        includeLowerThird: raw.includeLowerThird !== false,
        title: String(raw.title || '').trim(),
        creator: String(raw.creator || '').trim(),
        cta: String(raw.cta || DEFAULT_MOTION_DESIGN.cta).trim() || DEFAULT_MOTION_DESIGN.cta
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
    if (!settings.enabled || duration <= 0) return [];
    const layers = [];
    const safeTime = Math.max(0, Number(time) || 0);

    if (settings.includeOutro && safeTime >= Math.max(0, duration - OUTRO_DURATION)) {
        const startAt = Math.max(0, duration - OUTRO_DURATION);
        layers.push({ kind: 'outro', progress: clamp((safeTime - startAt) / OUTRO_DURATION) });
        return layers;
    }
    if (settings.includeIntro && safeTime <= Math.min(INTRO_DURATION, duration)) {
        layers.push({ kind: 'intro', progress: clamp(safeTime / Math.min(INTRO_DURATION, duration)) });
    }
    if (settings.includeLowerThird && (!settings.includeIntro || safeTime > Math.min(INTRO_DURATION, duration))) {
        const activeSubtitle = subtitles
            .filter(item => Number.isFinite(Number(item?.startAt)) && String(item?.text || '').trim())
            .sort((a, b) => Number(b.startAt) - Number(a.startAt))
            .find(item => safeTime >= Number(item.startAt) && safeTime <= Math.min(Number(item.endAt) || Infinity, Number(item.startAt) + LOWER_THIRD_MAX_DURATION));
        if (activeSubtitle) {
            const elapsed = safeTime - Number(activeSubtitle.startAt);
            const visibleDuration = Math.max(0.2, Math.min(Number(activeSubtitle.endAt) || Infinity, Number(activeSubtitle.startAt) + LOWER_THIRD_MAX_DURATION) - Number(activeSubtitle.startAt));
            const exitProgress = visibleDuration > 0.5 ? clamp((elapsed - (visibleDuration - 0.35)) / 0.35) : 0;
            layers.push({
                kind: 'lower-third',
                progress: clamp(elapsed / 0.38),
                exitProgress,
                text: String(activeSubtitle.text || '').trim().slice(0, 92)
            });
        }
    }
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

function drawIntro(ctx, canvas, layer, preset, copy) {
    const { width, height } = canvas;
    const entrance = easeOutCubic(clamp(layer.progress / 0.42));
    const holdExit = layer.progress > 0.84 ? clamp((layer.progress - 0.84) / 0.16) : 0;
    ctx.save();
    ctx.globalAlpha = 0.98 - holdExit * 0.72;
    drawAtmosphere(ctx, canvas, preset, entrance);

    const contentX = width * 0.105;
    const contentY = height * 0.36 + (1 - entrance) * 54;
    ctx.globalAlpha = Math.min(1, entrance * 1.35) * (1 - holdExit);
    ctx.fillStyle = preset.accent;
    ctx.fillRect(contentX, contentY - 83, width * 0.09 * entrance, 9);
    ctx.font = `700 ${Math.round(width * 0.018)}px "Arial", sans-serif`;
    ctx.letterSpacing = '0.16em';
    ctx.fillStyle = preset.accent;
    ctx.fillText('OPEN VISCRIBE / AI EDITED', contentX, contentY - 42);
    ctx.letterSpacing = '0px';

    ctx.font = `800 ${Math.round(width * 0.068)}px "Arial", "Noto Sans TC", sans-serif`;
    ctx.fillStyle = preset.foreground;
    drawWrappedText(ctx, copy.title, contentX, contentY + 28, width * 0.72, width * 0.076, 2);

    ctx.font = `500 ${Math.round(width * 0.023)}px "Arial", "Noto Sans TC", sans-serif`;
    ctx.fillStyle = preset.muted;
    ctx.fillText(copy.creator.toUpperCase(), contentX, height * 0.81);
    ctx.restore();
}

function drawOutro(ctx, canvas, layer, preset, copy) {
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
    ctx.fillStyle = `${preset.surface}eb`;
    roundedRect(ctx, panelX, panelY, panelW, panelH, 36);
    ctx.fill();
    ctx.strokeStyle = `${preset.accent}cc`;
    ctx.lineWidth = 3;
    roundedRect(ctx, panelX, panelY, panelW, panelH, 36);
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.font = `700 ${Math.round(width * 0.023)}px Arial, sans-serif`;
    ctx.fillStyle = preset.accent;
    ctx.fillText('THANKS FOR WATCHING', width / 2, panelY + panelH * 0.27);
    ctx.font = `800 ${Math.round(width * 0.043)}px "Arial", "Noto Sans TC", sans-serif`;
    ctx.fillStyle = preset.foreground;
    ctx.fillText(copy.creator, width / 2, panelY + panelH * 0.52);
    ctx.font = `500 ${Math.round(width * 0.022)}px "Arial", "Noto Sans TC", sans-serif`;
    ctx.fillStyle = preset.muted;
    ctx.fillText(copy.cta, width / 2, panelY + panelH * 0.74);
    ctx.textAlign = 'start';
    ctx.restore();
}

function drawLowerThird(ctx, canvas, layer, preset, copy) {
    const { width, height } = canvas;
    const entered = easeOutCubic(layer.progress);
    const x = width * 0.065 + (1 - entered + layer.exitProgress) * width * 0.22;
    const y = height * 0.735;
    const cardW = width * 0.53;
    const cardH = height * 0.15;
    ctx.save();
    ctx.globalAlpha = entered * (1 - layer.exitProgress);
    ctx.fillStyle = `${preset.surface}ee`;
    roundedRect(ctx, x, y, cardW, cardH, 22);
    ctx.fill();
    ctx.fillStyle = preset.accent;
    roundedRect(ctx, x, y, 12, cardH, 8);
    ctx.fill();
    ctx.fillStyle = preset.accentAlt;
    ctx.fillRect(x + 34, y + 30, width * 0.055, 5);
    ctx.font = `700 ${Math.round(width * 0.018)}px Arial, sans-serif`;
    ctx.fillStyle = preset.accent;
    ctx.fillText(copy.creator.toUpperCase(), x + 34, y + 65);
    ctx.font = `700 ${Math.round(width * 0.026)}px "Arial", "Noto Sans TC", sans-serif`;
    ctx.fillStyle = preset.foreground;
    drawWrappedText(ctx, layer.text, x + 34, y + 109, cardW - 72, width * 0.031, 2);
    ctx.restore();
}

export function drawMotionDesignToCanvas(ctx, canvas, { design, time, duration, subtitles, fallbackTitle, fallbackCreator }) {
    const settings = getMotionDesignSettings(design);
    const layers = getMotionDesignLayers({ design: settings, time, duration, subtitles });
    if (!layers.length) return;
    const preset = getMotionDesignPreset(settings.presetId);
    const copy = getMotionDesignCopy(settings, { fallbackTitle, fallbackCreator });
    layers.forEach(layer => {
        if (layer.kind === 'intro') drawIntro(ctx, canvas, layer, preset, copy);
        if (layer.kind === 'outro') drawOutro(ctx, canvas, layer, preset, copy);
        if (layer.kind === 'lower-third') drawLowerThird(ctx, canvas, layer, preset, copy);
    });
}

export const MOTION_DESIGN_TIMINGS = { INTRO_DURATION, OUTRO_DURATION, LOWER_THIRD_MAX_DURATION };
