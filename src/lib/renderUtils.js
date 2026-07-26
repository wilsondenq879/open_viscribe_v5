import { BUILT_IN_TRANSITIONS, DEFAULT_KEN_BURNS_VIEWPORT } from '../constants/appConstants';
import { normalizeKenBurnsEffect } from './projectState';
import { clamp, normalizeSubtitle } from './subtitleUtils';

export function createBuiltInTransitionAssets() {
    return BUILT_IN_TRANSITIONS.map((transition, index) => ({
        id: `builtin_transition_${transition.preset}_${index}`,
        type: 'transition',
        transitionPreset: transition.preset,
        name: transition.name,
        color: transition.color,
        defaultDuration: 0.8
    }));
}

export function createTimelineTransitionItem(asset, startAt) {
    return {
        id: `transition_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        type: 'transition',
        transitionPreset: asset.transitionPreset,
        name: asset.name,
        color: asset.color || 'rose',
        startAt,
        duration: asset.defaultDuration || 0.8
    };
}

export function easeOutCubic(value) {
    return 1 - Math.pow(1 - clamp(value, 0, 1), 3);
}

export function easeInCubic(value) {
    return Math.pow(clamp(value, 0, 1), 3);
}

export function easeInOutCubic(value) {
    const normalized = clamp(value, 0, 1);
    return normalized < 0.5
        ? 4 * normalized * normalized * normalized
        : 1 - Math.pow(-2 * normalized + 2, 3) / 2;
}

export function applyMotionEasing(value, easing = 'ease-in-out') {
    switch (easing) {
        case 'linear':
            return clamp(value, 0, 1);
        case 'ease-in':
            return easeInCubic(value);
        case 'ease-out':
            return easeOutCubic(value);
        case 'ease-in-out':
        default:
            return easeInOutCubic(value);
    }
}

export function interpolateNumber(start, end, progress) {
    return start + (end - start) * progress;
}

export function getClipKenBurnsState(clip, time) {
    const effect = normalizeKenBurnsEffect(clip?.kenBurns);
    if (!effect.enabled) {
        return { ...DEFAULT_KEN_BURNS_VIEWPORT };
    }

    const duration = Math.max(clip?.duration || 0, 0.001);
    const rawProgress = clamp((time - (clip?.startAt || 0)) / duration, 0, 1);
    const eased = applyMotionEasing(rawProgress, effect.easing);
    return {
        scale: interpolateNumber(effect.start.scale, effect.end.scale, eased),
        x: interpolateNumber(effect.start.x, effect.end.x, eased),
        y: interpolateNumber(effect.start.y, effect.end.y, eased)
    };
}

export function getKenBurnsCssTranslatePercent(axisOffset, scale) {
    if (scale <= 1) return 0;
    return (axisOffset / 100) * ((scale - 1) / scale) * 50;
}

export function buildKenBurnsPreviewMediaStyle(clip, time) {
    const state = getClipKenBurnsState(clip, time);
    const translateX = getKenBurnsCssTranslatePercent(state.x, state.scale);
    const translateY = getKenBurnsCssTranslatePercent(state.y, state.scale);
    return {
        transform: `translate(${translateX}%, ${translateY}%) scale(${state.scale})`,
        transformOrigin: 'center center'
    };
}

export function getTransitionRenderState(transition, time) {
    if (!transition) {
        return {
            opacity: 1,
            scale: 1,
            translateXPercent: 0,
            translateYPercent: 0,
            clipInsets: null
        };
    }

    const progress = clamp((time - transition.startAt) / Math.max(transition.duration || 0.8, 0.1), 0, 1);
    const eased = easeOutCubic(progress);
    const state = {
        opacity: 1,
        scale: 1,
        translateXPercent: 0,
        translateYPercent: 0,
        clipInsets: null
    };

    switch (transition.transitionPreset) {
        case 'fade':
            state.opacity = 0.08 + eased * 0.92;
            break;
        case 'slide-left':
            state.opacity = 0.15 + eased * 0.85;
            state.translateXPercent = (1 - eased) * 18;
            break;
        case 'slide-right':
            state.opacity = 0.15 + eased * 0.85;
            state.translateXPercent = (1 - eased) * -18;
            break;
        case 'zoom-in':
            state.opacity = 0.1 + eased * 0.9;
            state.scale = 0.84 + eased * 0.16;
            break;
        case 'wipe-up':
            state.opacity = 1;
            state.clipInsets = {
                top: 0,
                right: 0,
                bottom: (1 - eased) * 100,
                left: 0
            };
            break;
        default:
            break;
    }

    return state;
}

export function findActiveTransition(transitions, time, itemStartAt, itemEndAt) {
    if (!Array.isArray(transitions) || transitions.length === 0) return null;
    return [...transitions]
        .filter(item => {
            const transitionEnd = item.startAt + item.duration;
            return time >= item.startAt
                && time <= transitionEnd
                && itemEndAt > item.startAt
                && itemStartAt < transitionEnd;
        })
        .sort((a, b) => b.startAt - a.startAt)[0] || null;
}

export function buildTransitionPreviewStyle(transition, time, baseTransform = '') {
    const state = getTransitionRenderState(transition, time);
    const transformParts = [];
    if (baseTransform) transformParts.push(baseTransform);
    transformParts.push(`translate(${state.translateXPercent}%, ${state.translateYPercent}%)`);
    transformParts.push(`scale(${state.scale})`);
    return {
        opacity: state.opacity,
        transform: transformParts.join(' '),
        transformOrigin: 'center center',
        clipPath: state.clipInsets
            ? `inset(${state.clipInsets.top}% ${state.clipInsets.right}% ${state.clipInsets.bottom}% ${state.clipInsets.left}%)`
            : undefined
    };
}

export function drawWithTransition(ctx, box, transition, time, drawFn) {
    const state = getTransitionRenderState(transition, time);
    ctx.save();
    ctx.globalAlpha *= state.opacity;

    const centerX = box.x + box.w / 2;
    const centerY = box.y + box.h / 2;
    const translateX = (state.translateXPercent / 100) * box.w;
    const translateY = (state.translateYPercent / 100) * box.h;

    ctx.translate(centerX, centerY);
    ctx.scale(state.scale, state.scale);
    ctx.translate(-centerX + translateX, -centerY + translateY);

    if (state.clipInsets) {
        const clipX = box.x + (state.clipInsets.left / 100) * box.w;
        const clipY = box.y + (state.clipInsets.top / 100) * box.h;
        const clipW = box.w - ((state.clipInsets.left + state.clipInsets.right) / 100) * box.w;
        const clipH = box.h - ((state.clipInsets.top + state.clipInsets.bottom) / 100) * box.h;
        ctx.beginPath();
        ctx.rect(clipX, clipY, Math.max(0, clipW), Math.max(0, clipH));
        ctx.clip();
    }

    drawFn();
    ctx.restore();
}

export function drawMediaWithKenBurns(ctx, el, clip, time, box) {
    const nw = el.videoWidth || el.naturalWidth || 1920;
    const nh = el.videoHeight || el.naturalHeight || 1080;
    const elAspect = nw / nh;
    const boxAspect = box.w / box.h;

    let drawW = box.w;
    let drawH = box.h;
    let drawX = box.x;
    let drawY = box.y;

    if (clip?.mediaFit === 'cover') {
        if (elAspect > boxAspect) {
            drawH = box.h;
            drawW = drawH * elAspect;
            drawX = box.x + (box.w - drawW) / 2;
        } else {
            drawW = box.w;
            drawH = drawW / elAspect;
            drawY = box.y + (box.h - drawH) / 2;
        }
    } else if (elAspect > boxAspect) {
        drawH = box.w / elAspect;
        drawY = box.y + (box.h - drawH) / 2;
    } else {
        drawW = box.h * elAspect;
        drawX = box.x + (box.w - drawW) / 2;
    }

    const motion = getClipKenBurnsState(clip, time);
    const extraWidth = Math.max(0, (drawW * motion.scale - drawW) / 2);
    const extraHeight = Math.max(0, (drawH * motion.scale - drawH) / 2);
    const translateX = extraWidth * (motion.x / 100);
    const translateY = extraHeight * (motion.y / 100);

    ctx.save();
    ctx.beginPath();
    ctx.rect(box.x, box.y, box.w, box.h);
    ctx.clip();

    const centerX = box.x + box.w / 2 + translateX;
    const centerY = box.y + box.h / 2 + translateY;
    ctx.translate(centerX, centerY);
    ctx.scale(motion.scale, motion.scale);
    ctx.translate(-(box.x + box.w / 2), -(box.y + box.h / 2));
    ctx.drawImage(el, drawX, drawY, drawW, drawH);
    ctx.restore();
}

export function hexToRgba(hex, alpha = 1) {
    const normalized = String(hex || '').replace('#', '').trim();
    const safeHex = normalized.length === 3
        ? normalized.split('').map(ch => ch + ch).join('')
        : normalized.padEnd(6, '0').slice(0, 6);
    const r = parseInt(safeHex.slice(0, 2), 16) || 0;
    const g = parseInt(safeHex.slice(2, 4), 16) || 0;
    const b = parseInt(safeHex.slice(4, 6), 16) || 0;
    return `rgba(${r}, ${g}, ${b}, ${clamp(alpha, 0, 1)})`;
}

function wrapSubtitleParagraph(ctx, paragraph, maxWidth) {
    const source = String(paragraph || '').trim();
    if (!source) return [];
    if (ctx.measureText(source).width <= maxWidth) return [source];

    // Keep Latin words together while allowing Chinese/Japanese characters to
    // fill the full safe width before wrapping. Explicit newlines are handled
    // by the caller and always remain hard breaks.
    const tokens = source.match(/[\u3400-\u9fff\u3040-\u30ff]|[^\s\u3400-\u9fff\u3040-\u30ff]+|\s+/g) || [source];
    const lines = [];
    let line = '';
    const pushLine = () => {
        const clean = line.trim();
        if (clean) lines.push(clean);
        line = '';
    };

    tokens.forEach(token => {
        const candidate = `${line}${token}`;
        if (!line || ctx.measureText(candidate.trim()).width <= maxWidth) {
            line = candidate;
            return;
        }
        pushLine();
        if (ctx.measureText(token.trim()).width <= maxWidth) {
            line = token.trimStart();
            return;
        }
        // A single URL or unbroken identifier can still exceed the safe area.
        [...token].forEach(character => {
            const characterCandidate = `${line}${character}`;
            if (line && ctx.measureText(characterCandidate).width > maxWidth) pushLine();
            line += character;
        });
    });
    pushLine();
    return lines;
}

function getWrappedSubtitleLines(ctx, canvas, subtitle) {
    const sub = normalizeSubtitle(subtitle);
    const paddingX = Math.max(28, Math.round(sub.fontSize * 0.9));
    const maxTextWidth = Math.max(80, canvas.width * 0.92 - paddingX);
    return String(sub.text || '')
        .split('\n')
        .flatMap(paragraph => wrapSubtitleParagraph(ctx, paragraph, maxTextWidth));
}

export function drawSubtitleOnCanvas(ctx, canvas, subtitle) {
    const sub = normalizeSubtitle(subtitle);
    const fontSize = sub.fontSize;
    const lineHeight = Math.round(fontSize * 1.25);
    const paddingX = Math.max(28, Math.round(fontSize * 0.9));
    const paddingY = Math.max(16, Math.round(fontSize * 0.45));
    const x = (sub.x / 100) * canvas.width;
    const y = (sub.y / 100) * canvas.height;

    ctx.font = `bold ${fontSize}px ${sub.fontFamily}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const lines = getWrappedSubtitleLines(ctx, canvas, sub);
    if (lines.length === 0) return;

    const textWidths = lines.map(line => ctx.measureText(line).width);
    const textBlockWidth = Math.max(...textWidths, 0);
    const textBlockHeight = lineHeight * lines.length;
    const rectW = textBlockWidth + paddingX;
    const rectH = textBlockHeight + paddingY;
    const rectX = x - rectW / 2;
    const rectY = y - rectH / 2;
    const radius = Math.max(10, Math.round(fontSize * 0.18));

    ctx.fillStyle = hexToRgba(sub.backgroundColor, sub.backgroundOpacity);
    ctx.beginPath();
    ctx.moveTo(rectX + radius, rectY);
    ctx.lineTo(rectX + rectW - radius, rectY);
    ctx.quadraticCurveTo(rectX + rectW, rectY, rectX + rectW, rectY + radius);
    ctx.lineTo(rectX + rectW, rectY + rectH - radius);
    ctx.quadraticCurveTo(rectX + rectW, rectY + rectH, rectX + rectW - radius, rectY + rectH);
    ctx.lineTo(rectX + radius, rectY + rectH);
    ctx.quadraticCurveTo(rectX, rectY + rectH, rectX, rectY + rectH - radius);
    ctx.lineTo(rectX, rectY + radius);
    ctx.quadraticCurveTo(rectX, rectY, rectX + radius, rectY);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = sub.textColor;
    lines.forEach((line, index) => {
        const lineY = y - ((lines.length - 1) * lineHeight) / 2 + index * lineHeight;
        ctx.fillText(line, x, lineY);
    });
}

export function getSubtitleCanvasBounds(ctx, canvas, subtitle) {
    const sub = normalizeSubtitle(subtitle);
    const fontSize = sub.fontSize;
    const lineHeight = Math.round(fontSize * 1.25);
    const paddingX = Math.max(28, Math.round(fontSize * 0.9));
    const paddingY = Math.max(16, Math.round(fontSize * 0.45));
    const x = (sub.x / 100) * canvas.width;
    const y = (sub.y / 100) * canvas.height;

    ctx.save();
    ctx.font = `bold ${fontSize}px ${sub.fontFamily}`;
    const lines = getWrappedSubtitleLines(ctx, canvas, sub);
    const safeLines = lines.length > 0 ? lines : [' '];
    const textWidths = safeLines.map(line => ctx.measureText(line).width);
    ctx.restore();

    const textBlockWidth = Math.max(...textWidths, 0);
    const textBlockHeight = lineHeight * safeLines.length;
    return {
        x: x - (textBlockWidth + paddingX) / 2,
        y: y - (textBlockHeight + paddingY) / 2,
        w: textBlockWidth + paddingX,
        h: textBlockHeight + paddingY
    };
}
