import React, { useState, useEffect, useRef, useCallback, useMemo, useId } from 'react';
import {
    Settings, HelpCircle, MonitorPlay, Square, Play, Pause, Scissors,
    Type, Mic, Download, Trash2, FolderOpen, Save, FileVideo,
    Image as ImageIcon, GripVertical, ChevronRight, ChevronLeft,
    MousePointerClick, AlertCircle, Upload, Music, Eye, EyeOff, Volume2, VolumeX, FastForward,
    Undo2, Redo2, Minus, Plus, Bug, Sparkles, Wand2
} from 'lucide-react';
import SettingsModal from './components/modals/SettingsModal';
import ArticleScreenshotReview from './components/ArticleScreenshotReview';
import useAiTaskState from './hooks/useAiTaskState';
import useAutomationBridge from './hooks/useAutomationBridge';
import {
    AI_TASK_CANCELLED_MESSAGE,
    ARTICLE_PERSPECTIVE_OPTIONS,
    BASE_PIXELS_PER_SECOND,
    DEFAULT_CLIP_LAYOUT,
    DEFAULT_MOTION_DESIGN,
    DEFAULT_SETTINGS,
    DEFAULT_SUBTITLE_STYLE,
    DEFAULT_UI_DEBUG_CHECKS,
    getDefaultTimelineHeight,
    HISTORY_LIMIT,
    KEN_BURNS_PRESETS,
    LOCAL_OLLAMA_ENDPOINT,
    MAX_LEFT_PANEL_WIDTH,
    MAX_LIBRARY_PANEL_WIDTH,
    MAX_TIMELINE_ZOOM,
    MIN_LEFT_PANEL_WIDTH,
    MIN_LIBRARY_PANEL_WIDTH,
    MIN_TIMELINE_HEIGHT,
    MIN_TIMELINE_ZOOM,
    MOTION_DESIGN_PRESETS,
    RENDER_FPS,
    RENDER_FRAME_STEP,
    RESERVED_EDITOR_HEIGHT,
    SUBTITLE_FONT_OPTIONS,
    SUBTITLE_TRACKS,
    TIMELINE_OFFSET,
    TRANSITION_COLOR_MAP,
    UI_DEBUG_MODULE_TAGS,
    UI_DEBUG_TRANSLATION_OPTIONS
} from './constants/appConstants';
import {
    buildOllamaApiUrl,
    getFeatureProvider,
    getProviderLabel,
    getProviderModelLabel,
    normalizeOllamaTimeoutSeconds
} from './lib/providerUtils';
import {
    areProjectSnapshotsEqual,
    extractRequestedArticleWordCount,
    isUsableArticleTopic,
    looksLikePromptInstruction,
    sanitizeGeneratedArticleTitle,
    stripPromptLikeFragments
} from './lib/articleUtils';
import {
    annotateProjectWithExportFilenames,
    buildProjectExportMetadata,
    cloneProjectSnapshot,
    createAiSubtitleTimelineSnapshot,
    createDefaultKenBurnsEffect,
    createEmptyProjectState,
    createInitialAiSubtitleStatus,
    createInitialArticleStatus,
    createInitialTtsStatus,
    createInitialUiDebugStatus,
    createInitialUxResearchStatus,
    createProgressText,
    getAiSubtitleTimelineWarning,
    getMediaBlobId,
    getProjectMissingMediaCount,
    normalizeClipItem,
    normalizeKenBurnsEffect,
    normalizeProjectState,
    normalizeTimedItemsToZero,
    sanitizeExportBaseName,
    sanitizeImportedRecordingRange,
    sanitizeImportedTimelineOffsets
} from './lib/projectState';
import {
    buildKenBurnsPreviewMediaStyle,
    buildTransitionPreviewStyle,
    createBuiltInTransitionAssets,
    createTimelineTransitionItem,
    drawMediaWithKenBurns,
    drawSubtitleOnCanvas,
    drawWithTransition,
    findActiveTransition,
    getClipKenBurnsState,
    getSubtitleCanvasBounds,
    hexToRgba
} from './lib/renderUtils';
import {
    drawMotionDesignToCanvas,
    getMotionDesignCopy,
    getMotionDesignLayers,
    getMotionDesignPreset,
    getMotionDesignSettings
} from './lib/motionDesignUtils';
import { HYPERFRAME_TEMPLATES, getHyperframeTemplate, getHyperframeTemplateDefaults } from './lib/hyperframeTemplates';
import { HYPERFRAME_ASSETS } from './lib/hyperframeAssets';
import {
    buildCompositeSubtitleText,
    clamp,
    cleanAiText,
    createUiDebugIssueSubtitles,
    createUxResearchEventSubtitles,
    normalizeInstructionRole,
    normalizePipRelevance,
    normalizeRelationType,
    normalizeSceneType,
    normalizeSubtitle
} from './lib/subtitleUtils';
import {
    analyzeFrameQuality,
    pickBestScreenshotFrame,
    rehydrateProjectMedia,
    relinkProjectFromDirectory,
    saveBlobToDB
} from './lib/mediaUtils';
import {
    appendMarkdownTable,
    computeFrameVisualMetrics,
    analyzeVisualToneShift,
    formatEpochMs,
    formatUiDebugEvidenceLog,
    getModuleSpecificIssueContent,
    getTranslationOption,
    parseBrowserInfo,
    parseOsInfo
} from './lib/uiDebugUtils';
import { DEFAULT_SKILL_ID, SKILL_REGISTRY, getSkillById } from './skills';
import { uiDebugSkill } from './skills/ui-debug/skill';
import { uxResearchSkill } from './skills/ux-research/skill';

function decodeBase64ToBytes(base64) {
    const normalized = String(base64 || '').replace(/\s+/g, '');
    const binaryString = atob(normalized);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
    return bytes;
}

function normalizeAudioMimeType(mimeType = '', fallback = 'audio/wav') {
    const normalized = String(mimeType || '').trim().toLowerCase();
    if (normalized.startsWith('audio/')) return normalized;
    if (normalized === 'wav') return 'audio/wav';
    if (normalized === 'mp3' || normalized === 'mpeg') return 'audio/mpeg';
    if (normalized === 'ogg') return 'audio/ogg';
    return fallback;
}

function formatAiSummaryItem(item) {
    if (typeof item === 'string') return item.trim();
    if (item == null) return '';
    if (typeof item === 'number' || typeof item === 'boolean') return String(item);
    if (Array.isArray(item)) {
        return item.map(formatAiSummaryItem).filter(Boolean).join(' / ');
    }
    if (typeof item === 'object') {
        const preferredKeys = ['title', 'label', 'finding', 'action', 'hypothesis', 'summary', 'text', 'description', 'detail', 'reason', 'recommendation'];
        const picked = preferredKeys
            .map((key) => item[key])
            .map(formatAiSummaryItem)
            .find(Boolean);
        if (picked) return picked;
        const pairs = Object.entries(item)
            .map(([key, value]) => {
                const text = formatAiSummaryItem(value);
                return text ? `${key}: ${text}` : '';
            })
            .filter(Boolean);
        return pairs.join(' | ');
    }
    return String(item);
}

function normalizeAiSummaryList(items) {
    if (!Array.isArray(items)) return [];
    return items.map(formatAiSummaryItem).filter(Boolean);
}

const ARTICLE_CLICK_CANDIDATE_OFFSETS = [-2.0, -1.6, -1.2, -1.0, -0.8, -0.6, -0.4, -0.2, 0, 0.2, 0.4, 0.6, 0.8, 1.0, 1.2, 1.6, 2.0];

function formatArticleCandidateOffsetLabel(offsetSeconds = 0) {
    const safeOffset = Number.isFinite(Number(offsetSeconds)) ? Number(offsetSeconds) : 0;
    const sign = safeOffset < -0.005 ? 'm' : 'p';
    const offsetCentiSeconds = String(Math.round(Math.abs(safeOffset) * 100)).padStart(3, '0');
    return `${sign}${offsetCentiSeconds}`;
}

function buildArticleCandidateExportFilename(filePrefix, stepIndex, candidateIndex, offsetSeconds, isSelected = false) {
    const safePrefix = String(filePrefix || 'screenshot').trim() || 'screenshot';
    const safeStepIndex = Math.max(1, Number(stepIndex) || 1);
    const safeCandidateIndex = Math.max(1, Number(candidateIndex) || 1);
    const selectedSuffix = isSelected ? '_selected' : '';
    return `${safePrefix}_step_${String(safeStepIndex).padStart(2, '0')}_candidate_${String(safeCandidateIndex).padStart(2, '0')}_${formatArticleCandidateOffsetLabel(offsetSeconds)}${selectedSuffix}.jpg`;
}

function normalizeClickTargetRect(clickEvent) {
    const rect = clickEvent?.targetRect;
    const left = Number(rect?.left ?? clickEvent?.targetLeft);
    const top = Number(rect?.top ?? clickEvent?.targetTop);
    const width = Number(rect?.width ?? clickEvent?.targetWidth);
    const height = Number(rect?.height ?? clickEvent?.targetHeight);
    if (![left, top, width, height].every(Number.isFinite)) return null;
    if (width <= 0 || height <= 0) return null;
    return { left, top, width, height };
}

function buildFallbackClickTargetRect(clickEvent) {
    const x = Number(clickEvent?.x);
    const y = Number(clickEvent?.y);
    const viewportW = Number(clickEvent?.viewportW);
    const viewportH = Number(clickEvent?.viewportH);
    if (![x, y, viewportW, viewportH].every(Number.isFinite)) return null;
    if (viewportW <= 0 || viewportH <= 0) return null;

    const width = Math.min(Math.max(viewportW * 0.11, 88), 220);
    const height = Math.min(Math.max(viewportH * 0.06, 44), 110);
    return {
        left: x - (width / 2),
        top: y - (height / 2),
        width,
        height
    };
}

// Compute the click target rect as 0-1 fractions of the viewport (for interactive overlay).
function computeHighlightRectPct(clickEvent) {
    if (!clickEvent) return null;
    const vw = Number(clickEvent.viewportW);
    const vh = Number(clickEvent.viewportH);
    if (!vw || !vh) return null;
    let sourceRect = normalizeClickTargetRect(clickEvent);
    if (sourceRect) {
        const areaRatio   = (sourceRect.width * sourceRect.height) / (vw * vh);
        const widthRatio  = sourceRect.width  / vw;
        const heightRatio = sourceRect.height / vh;
        // Reject rects that are large containers rather than the actual UI element:
        // area > 18%, or height > 35% of viewport (catches full-height sidebars),
        // or width > 55% of viewport (catches full-width banners).
        if (areaRatio > 0.18 || heightRatio > 0.35 || widthRatio > 0.55) sourceRect = null;
    }
    sourceRect = sourceRect || buildFallbackClickTargetRect(clickEvent);
    if (!sourceRect) return null;
    const xPct = Math.max(0, Math.min(0.97, sourceRect.left / vw));
    const yPct = Math.max(0, Math.min(0.97, sourceRect.top / vh));
    return {
        xPct,
        yPct,
        wPct: Math.max(0.01, Math.min(1 - xPct, sourceRect.width / vw)),
        hPct: Math.max(0.01, Math.min(1 - yPct, sourceRect.height / vh)),
    };
}

// Load the pixel dimensions of a base64 JPEG (used to map highlight coords into
// the captured frame's true resolution instead of assuming 1920×1080).
function loadHighlightImageDims(b64) {
    return new Promise((resolve) => {
        if (!b64) return resolve({ w: 0, h: 0 });
        const img = new Image();
        img.onload = () => resolve({ w: img.naturalWidth || img.width, h: img.naturalHeight || img.height });
        img.onerror = () => resolve({ w: 0, h: 0 });
        img.src = `data:image/jpeg;base64,${b64}`;
    });
}

// Accurate interactive-overlay rect.
// The review-panel red box must sit exactly where the box is finally baked, so this
// reuses the SAME mapping the bake uses — getArticleHighlightRectForCanvas — which
// corrects for capture letterboxing/scaling (captureMapping), browser-chrome height
// above the viewport (viewportOffsetY), element padding and the size floor. It then
// returns 0-1 fractions of the captured frame (the image the overlay is drawn over).
// Falls back to the naive viewport-fraction estimate only if mapping can't be resolved.
async function computeHighlightRectPctForFrame(clickEvent, frame, viewportOffsetY = 0) {
    if (!clickEvent || !frame) return null;
    const src = frame.hdData || frame.aiData || '';
    const dims = await loadHighlightImageDims(src);
    const canvasW = dims.w || 1920;
    const canvasH = dims.h || 1080;
    const rect = getArticleHighlightRectForCanvas(
        clickEvent,
        canvasW,
        canvasH,
        frame.captureMapping || null,
        viewportOffsetY
    );
    if (!rect) return computeHighlightRectPct(clickEvent);
    const xPct = Math.max(0, Math.min(0.999, rect.x / canvasW));
    const yPct = Math.max(0, Math.min(0.999, rect.y / canvasH));
    return {
        xPct,
        yPct,
        wPct: Math.max(0.005, Math.min(1 - xPct, rect.width / canvasW)),
        hPct: Math.max(0.005, Math.min(1 - yPct, rect.height / canvasH)),
    };
}

// Wrap a raw frame + optional pre-rendered highlight frame into a candidate object
// expected by ArticleScreenshotReview and the post-review highlight application step.
function makeCandidateWrapper(rawFrame, previewFrame, highlightRectPct) {
    const f = rawFrame || previewFrame;
    return {
        rawFrame: rawFrame || previewFrame,
        previewFrame: previewFrame || rawFrame,
        highlightRectPct: highlightRectPct || null,
        frameId: f?.frameId,
        relativeTime: f?.relativeTime,
        isLikelyLoading: f?.isLikelyLoading,
    };
}

function normalizeArticleCaptureMapping(captureMapping, canvasWidth, canvasHeight) {
    const sourceX = Number(captureMapping?.sourceX);
    const sourceY = Number(captureMapping?.sourceY);
    const sourceW = Number(captureMapping?.sourceW);
    const sourceH = Number(captureMapping?.sourceH);
    if (![sourceX, sourceY, sourceW, sourceH].every(Number.isFinite)) return null;

    const clipX = Number(captureMapping?.clipX);
    const clipY = Number(captureMapping?.clipY);
    const clipW = Number(captureMapping?.clipW);
    const clipH = Number(captureMapping?.clipH);

    return {
        sourceBounds: {
            x: sourceX * canvasWidth,
            y: sourceY * canvasHeight,
            width: sourceW * canvasWidth,
            height: sourceH * canvasHeight
        },
        clipBounds: ([clipX, clipY, clipW, clipH].every(Number.isFinite))
            ? {
                x: clipX * canvasWidth,
                y: clipY * canvasHeight,
                width: clipW * canvasWidth,
                height: clipH * canvasHeight
            }
            : null
    };
}

function getArticleHighlightRectForCanvas(clickEvent, canvasWidth, canvasHeight, captureMapping = null, viewportOffsetY = 0) {
    const viewportW = Number(clickEvent?.viewportW);
    const viewportH = Number(clickEvent?.viewportH);
    if (![viewportW, viewportH, canvasWidth, canvasHeight].every(Number.isFinite)) return null;
    if (viewportW <= 0 || viewportH <= 0 || canvasWidth <= 0 || canvasHeight <= 0) return null;

    let sourceRect = normalizeClickTargetRect(clickEvent);
    // Reject targetRect if it looks like a container rather than the actual UI element.
    // Checks: area > 18%, height > 35% of viewport (catches full-height sidebars/panels),
    // or width > 55% of viewport (catches full-width banners/rows).
    if (sourceRect) {
        const rectAreaRatio   = (sourceRect.width  * sourceRect.height) / (viewportW * viewportH);
        const rectWidthRatio  = sourceRect.width  / viewportW;
        const rectHeightRatio = sourceRect.height / viewportH;
        if (rectAreaRatio > 0.18 || rectHeightRatio > 0.35 || rectWidthRatio > 0.55) {
            sourceRect = null; // fall through to buildFallbackClickTargetRect
        }
    }
    sourceRect = sourceRect || buildFallbackClickTargetRect(clickEvent);
    if (!sourceRect) return null;

    const normalizedMapping = normalizeArticleCaptureMapping(captureMapping, canvasWidth, canvasHeight);
    const sourceBounds = normalizedMapping?.sourceBounds || {
        x: 0,
        y: 0,
        width: canvasWidth,
        height: canvasHeight
    };
    const clipBounds = normalizedMapping?.clipBounds || {
        x: 0,
        y: 0,
        width: canvasWidth,
        height: canvasHeight
    };
    const scaleX = sourceBounds.width / viewportW;
    const scaleY = sourceBounds.height / viewportH;
    const padding = Math.max(8, Math.round(Math.min(canvasWidth, canvasHeight) * 0.008));
    // viewportOffsetY: browser chrome height (px) above the viewport in the recording.
    // Subtract it from top before scaling so coords align with the captured frame.
    const adjustedTop = sourceRect.top - (Number.isFinite(viewportOffsetY) ? viewportOffsetY : 0);

    let x = sourceBounds.x + (sourceRect.left * scaleX) - padding;
    let y = sourceBounds.y + (adjustedTop * scaleY) - padding;
    let width = (sourceRect.width * scaleX) + (padding * 2);
    let height = (sourceRect.height * scaleY) + (padding * 2);

    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(width) || !Number.isFinite(height)) {
        return null;
    }

    width = Math.max(width, Math.max(48, canvasWidth * 0.045));
    height = Math.max(height, Math.max(28, canvasHeight * 0.035));
    x = Math.max(clipBounds.x, Math.min(x, (clipBounds.x + clipBounds.width) - 2));
    y = Math.max(clipBounds.y, Math.min(y, (clipBounds.y + clipBounds.height) - 2));
    width = Math.max(2, Math.min(width, (clipBounds.x + clipBounds.width) - x));
    height = Math.max(2, Math.min(height, (clipBounds.y + clipBounds.height) - y));

    return {
        x,
        y,
        width,
        height,
        strokeWidth: Math.max(3, Math.round(Math.min(canvasWidth, canvasHeight) * 0.004))
    };
}

function drawArticleHighlightBox(ctx, rect) {
    if (!ctx || !rect) return;
    const x = Math.round(rect.x) + 0.5;
    const y = Math.round(rect.y) + 0.5;
    const width = Math.max(1, Math.round(rect.width) - 1);
    const height = Math.max(1, Math.round(rect.height) - 1);

    ctx.save();
    ctx.strokeStyle = 'rgba(255, 32, 32, 0.98)';
    ctx.lineWidth = rect.strokeWidth || 4;
    ctx.shadowColor = 'rgba(255, 32, 32, 0.22)';
    ctx.shadowBlur = Math.max(0, Math.round((rect.strokeWidth || 4) * 1.5));
    ctx.strokeRect(x, y, width, height);
    ctx.restore();
}

function buildArticleClickCandidateTimes(targetTime, duration = 0) {
    const safeTargetTime = Number.isFinite(Number(targetTime)) ? Number(targetTime) : 0;
    const maxDuration = Number.isFinite(Number(duration)) ? Math.max(0, Number(duration)) : 0;
    const deduped = new Set();
    ARTICLE_CLICK_CANDIDATE_OFFSETS.forEach((offset) => {
        const time = Math.max(0, Math.min(maxDuration || safeTargetTime, safeTargetTime + offset));
        deduped.add(Number(time.toFixed(2)));
    });
    return [...deduped].sort((a, b) => a - b);
}

function measureArticleRegionDetail(base64, clickEvent, options = {}) {
    if (!base64) return Promise.resolve(0);
    const mimeType = options.mimeType || 'image/jpeg';
    const fallbackWidth = Number(options.width) || 0;
    const fallbackHeight = Number(options.height) || 0;
    const captureMapping = options.captureMapping || null;
    const viewportOffsetY = Number.isFinite(Number(options.viewportOffsetY)) ? Number(options.viewportOffsetY) : 0;

    return new Promise((resolve) => {
        const image = new Image();
        image.onload = () => {
            const width = fallbackWidth || image.naturalWidth || image.width || 0;
            const height = fallbackHeight || image.naturalHeight || image.height || 0;
            const highlightRect = getArticleHighlightRectForCanvas(clickEvent, width, height, captureMapping, viewportOffsetY);
            if (!highlightRect || !width || !height) {
                resolve(0);
                return;
            }

            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            if (!ctx) {
                resolve(0);
                return;
            }

            ctx.drawImage(image, 0, 0, width, height);
            const sampleX = Math.max(0, Math.floor(highlightRect.x));
            const sampleY = Math.max(0, Math.floor(highlightRect.y));
            const sampleW = Math.max(2, Math.min(width - sampleX, Math.ceil(highlightRect.width)));
            const sampleH = Math.max(2, Math.min(height - sampleY, Math.ceil(highlightRect.height)));
            const imageData = ctx.getImageData(sampleX, sampleY, sampleW, sampleH);
            const { data } = imageData;
            const step = Math.max(1, Math.floor(Math.max(sampleW, sampleH) / 80));

            let sampleCount = 0;
            let sum = 0;
            let sumSq = 0;
            let edgeSum = 0;

            const luminanceAt = (x, y) => {
                const idx = (y * sampleW + x) * 4;
                return (data[idx] * 0.299) + (data[idx + 1] * 0.587) + (data[idx + 2] * 0.114);
            };

            for (let y = 0; y < sampleH; y += step) {
                for (let x = 0; x < sampleW; x += step) {
                    const lum = luminanceAt(x, y);
                    sum += lum;
                    sumSq += lum * lum;
                    sampleCount += 1;

                    if (x + step < sampleW) edgeSum += Math.abs(lum - luminanceAt(x + step, y));
                    if (y + step < sampleH) edgeSum += Math.abs(lum - luminanceAt(x, y + step));
                }
            }

            if (!sampleCount) {
                resolve(0);
                return;
            }

            const mean = sum / sampleCount;
            const variance = Math.max(0, (sumSq / sampleCount) - (mean * mean));
            const normalizedVariance = Math.min(1, variance / 1800);
            const normalizedEdge = Math.min(1, edgeSum / (sampleCount * 45));
            resolve((normalizedVariance * 0.55) + (normalizedEdge * 0.45));
        };
        image.onerror = () => resolve(0);
        image.src = `data:${mimeType};base64,${base64}`;
    });
}

function createHighlightedImageData(base64, clickEvent, options = {}) {
    if (!base64) return Promise.resolve('');
    const mimeType = options.mimeType || 'image/jpeg';
    const fallbackWidth = Number(options.width) || 0;
    const fallbackHeight = Number(options.height) || 0;
    const quality = Number.isFinite(Number(options.quality)) ? Number(options.quality) : 0.85;
    const captureMapping = options.captureMapping || null;
    const viewportOffsetY = Number.isFinite(Number(options.viewportOffsetY)) ? Number(options.viewportOffsetY) : 0;
    // When provided, draw the box directly from percentage coords (0-1 fractions of image dims),
    // bypassing captureMapping / viewportOffsetY / size-filter — matches ReviewPanel overlay exactly.
    const directRectPct = options.directRectPct || null;

    return new Promise((resolve) => {
        const image = new Image();
        image.onload = () => {
            const width = fallbackWidth || image.naturalWidth || image.width || 0;
            const height = fallbackHeight || image.naturalHeight || image.height || 0;
            if (!width || !height) { resolve(base64); return; }

            let highlightRect;
            if (directRectPct) {
                const padding = Math.max(4, Math.round(Math.min(width, height) * 0.005));
                const strokeWidth = Math.max(3, Math.round(Math.min(width, height) * 0.004));
                const rx = Math.max(0, directRectPct.xPct * width - padding);
                const ry = Math.max(0, directRectPct.yPct * height - padding);
                const rw = Math.min(width - rx, directRectPct.wPct * width + padding * 2);
                const rh = Math.min(height - ry, directRectPct.hPct * height + padding * 2);
                highlightRect = { x: rx, y: ry, width: rw, height: rh, strokeWidth };
            } else {
                highlightRect = getArticleHighlightRectForCanvas(clickEvent, width, height, captureMapping, viewportOffsetY);
            }
            if (!highlightRect) {
                resolve(base64);
                return;
            }

            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            if (!ctx) {
                resolve(base64);
                return;
            }

            ctx.drawImage(image, 0, 0, width, height);
            drawArticleHighlightBox(ctx, highlightRect);
            resolve(canvas.toDataURL(mimeType, quality).split(',')[1]);
        };
        image.onerror = () => resolve(base64);
        image.src = `data:${mimeType};base64,${base64}`;
    });
}

// adjustedRectPct: when provided (user confirmed in ReviewPanel), draw the box directly from
// percentage coords — bypasses captureMapping / viewportOffsetY / size-filter so the baked
// image exactly matches what the ReviewPanel overlay showed.
async function createHighlightedArticleFrame(frame, clickEvent, nextFrameId, viewportOffsetY = 0, adjustedRectPct = null) {
    const captureMapping = frame?.captureMapping || null;

    // Resolve actual frame pixel dimensions from the stored image data so the
    // coordinate mapping never assumes a hardcoded 1920×1080 resolution.
    const getImageDims = (b64) => new Promise((resolve) => {
        if (!b64) return resolve({ w: 0, h: 0 });
        const img = new Image();
        img.onload = () => resolve({ w: img.naturalWidth || img.width, h: img.naturalHeight || img.height });
        img.onerror = () => resolve({ w: 0, h: 0 });
        img.src = `data:image/jpeg;base64,${b64}`;
    });
    const hdSrc = frame?.hdData || '';
    const aiSrc = frame?.aiData || '';
    const [hdDims, aiDims] = await Promise.all([getImageDims(hdSrc), getImageDims(aiSrc)]);
    const hdW = hdDims.w || 1920;
    const hdH = hdDims.h || 1080;
    const aiW = aiDims.w || 1280;
    const aiH = aiDims.h || 720;

    // Only run the auto-detection path (which can return null) when no user-confirmed rect is provided.
    if (!adjustedRectPct) {
        const hdRect = getArticleHighlightRectForCanvas(clickEvent, hdW, hdH, captureMapping, viewportOffsetY);
        if (!hdRect) {
            console.warn('[HighlightDebug] hdRect=null → no highlight. clickEvent=', JSON.stringify({ id: clickEvent?.id, x: clickEvent?.x, y: clickEvent?.y, viewportW: clickEvent?.viewportW, viewportH: clickEvent?.viewportH, targetRect: clickEvent?.targetRect }), 'captureMapping=', captureMapping);
            return null;
        }
    }

    const [hdData, aiData] = await Promise.all([
        createHighlightedImageData(hdSrc, clickEvent, { width: hdW, height: hdH, quality: 0.85, captureMapping, viewportOffsetY, directRectPct: adjustedRectPct }),
        aiSrc
            ? createHighlightedImageData(aiSrc, clickEvent, { width: aiW, height: aiH, quality: 0.72, captureMapping, viewportOffsetY, directRectPct: adjustedRectPct })
            : Promise.resolve(aiSrc)
    ]);

    return {
        ...frame,
        frameId: nextFrameId,
        sourceFrameId: frame?.frameId ?? null,
        articleHighlightForClickId: clickEvent?.id || '',
        hdData,
        aiData
    };
}

async function pickBestArticleClickCandidateFrame(frames, clickEvent) {
    if (!Array.isArray(frames) || !frames.length) return null;
    let bestFrame = null;
    let bestScore = -Infinity;

    for (const frame of frames) {
        const regionDetail = await measureArticleRegionDetail(frame?.aiData || frame?.hdData || '', clickEvent, {
            width: frame?.aiData ? 1280 : 1920,
            height: frame?.aiData ? 720 : 1080,
            quality: frame?.aiData ? 0.72 : 0.85,
            captureMapping: frame?.captureMapping || null
        });
        const clarity = Number(frame?.clarityScore || 0);
        const loadingPenalty = Number(frame?.loadingScore || 0) + (frame?.isLikelyLoading ? 0.5 : 0);
        // Prefer frames before the click (cursor not yet on target), max bonus at -1.5s, zero at click time
        const clickTime = Number(clickEvent?.time ?? clickEvent?.clickTime ?? 0);
        const frameTime = Number(frame?.relativeTime ?? 0);
        const preClickBonus = frameTime < clickTime ? Math.min(0.6, (clickTime - frameTime) * 0.3) : 0;
        const score = (regionDetail * 2.4) + (clarity * 0.35) - (loadingPenalty * 0.45) + preClickBonus;
        if (score > bestScore) {
            bestScore = score;
            bestFrame = frame;
        }
    }

    return bestFrame;
}

function getPreferredRecordingMimeType({ preferSeekable = false } = {}) {
    const candidates = preferSeekable
        ? [
            'video/webm; codecs=vp8,opus',
            'video/webm; codecs=vp8',
            'video/webm'
        ]
        : [
            'video/webm; codecs=vp9,opus',
            'video/webm; codecs=vp9',
            'video/webm; codecs=vp8,opus',
            'video/webm; codecs=vp8',
            'video/webm'
        ];

    return candidates.find((mimeType) => MediaRecorder.isTypeSupported(mimeType)) || '';
}

function drawVideoIntoRect(ctx, videoEl, box, fit = 'contain') {
    if (!ctx || !videoEl || !box) return;
    const sourceW = videoEl.videoWidth || 0;
    const sourceH = videoEl.videoHeight || 0;
    if (!sourceW || !sourceH || !box.w || !box.h) return;

    const sourceAspect = sourceW / sourceH;
    const targetAspect = box.w / box.h;

    let sx = 0;
    let sy = 0;
    let sw = sourceW;
    let sh = sourceH;
    let dx = box.x;
    let dy = box.y;
    let dw = box.w;
    let dh = box.h;

    if (fit === 'cover') {
        if (sourceAspect > targetAspect) {
            sw = sourceH * targetAspect;
            sx = (sourceW - sw) / 2;
        } else {
            sh = sourceW / targetAspect;
            sy = (sourceH - sh) / 2;
        }
    } else {
        if (sourceAspect > targetAspect) {
            dh = box.w / sourceAspect;
            dy = box.y + (box.h - dh) / 2;
        } else {
            dw = box.h * sourceAspect;
            dx = box.x + (box.w - dw) / 2;
        }
    }

    ctx.drawImage(videoEl, sx, sy, sw, sh, dx, dy, dw, dh);
}

async function waitForVideoReady(videoEl, stream, timeoutMs = 2500) {
    videoEl.srcObject = stream;
    videoEl.muted = true;
    videoEl.playsInline = true;
    videoEl.autoplay = true;
    await new Promise((resolve) => {
        let settled = false;
        const done = () => {
            if (settled) return;
            settled = true;
            resolve();
        };
        videoEl.onloadedmetadata = done;
        videoEl.oncanplay = done;
        setTimeout(done, timeoutMs);
        const tryPlay = () => {
            void videoEl.play().then(done).catch(() => { });
        };
        videoEl.onloadedmetadata = () => {
            tryPlay();
            done();
        };
        tryPlay();
    });

    const waitForFirstFrame = () => new Promise((resolve) => {
        let settled = false;
        const finish = () => {
            if (settled) return;
            settled = true;
            resolve();
        };

        const hasFrame = () => (
            videoEl.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA
            && videoEl.videoWidth > 0
            && videoEl.videoHeight > 0
        );

        if (hasFrame()) {
            finish();
            return;
        }

        let timeoutId = 0;
        const cleanup = () => {
            if (timeoutId) window.clearTimeout(timeoutId);
            videoEl.removeEventListener('loadeddata', handleMaybeReady);
            videoEl.removeEventListener('canplay', handleMaybeReady);
            videoEl.removeEventListener('playing', handleMaybeReady);
        };
        const handleMaybeReady = () => {
            if (!hasFrame()) return;
            cleanup();
            finish();
        };

        videoEl.addEventListener('loadeddata', handleMaybeReady);
        videoEl.addEventListener('canplay', handleMaybeReady);
        videoEl.addEventListener('playing', handleMaybeReady);

        if (typeof videoEl.requestVideoFrameCallback === 'function') {
            videoEl.requestVideoFrameCallback(() => {
                cleanup();
                finish();
            });
        }

        timeoutId = window.setTimeout(() => {
            cleanup();
            finish();
        }, timeoutMs);
    });

    void videoEl.play().catch(() => { });
    await waitForFirstFrame();
}

function extractOllamaAudioPayload(payload) {
    if (!payload || typeof payload !== 'object') return null;
    const candidates = [
        payload.audio,
        payload.audio_base64,
        payload.audioBase64,
        payload.data,
        payload.blob,
        payload.wav,
        payload.output?.audio,
        payload.output?.audio_base64,
        payload.output?.data
    ];
    const base64 = candidates.find((value) => typeof value === 'string' && value.trim());
    if (!base64) return null;
    const mimeType = normalizeAudioMimeType(
        payload.mimeType
        || payload.audioMimeType
        || payload.audio_mime_type
        || payload.output?.mimeType
        || payload.output?.audioMimeType
        || payload.output?.audio_mime_type
        || payload.format
        || payload.response_format
    );
    return new Blob([decodeBase64ToBytes(base64)], { type: mimeType });
}

function createSilentWavBlob(durationMs = 1000, sampleRate = 16000) {
    const frameCount = Math.max(1, Math.round((durationMs / 1000) * sampleRate));
    const pcmBytes = new Uint8Array(frameCount * 2);
    return pcmToWav(pcmBytes, sampleRate);
}

async function getAudioBlobDuration(blob, fallbackDuration = 3) {
    const url = URL.createObjectURL(blob);
    try {
        const audioObj = new Audio(url);
        return await new Promise((resolve) => {
            const fallback = setTimeout(() => resolve(fallbackDuration), 2000);
            audioObj.onloadedmetadata = () => {
                clearTimeout(fallback);
                const duration = Number(audioObj.duration);
                resolve(Number.isFinite(duration) && duration > 0 ? duration : fallbackDuration);
            };
            audioObj.onerror = () => {
                clearTimeout(fallback);
                resolve(fallbackDuration);
            };
        });
    } finally {
        URL.revokeObjectURL(url);
    }
}

async function getMediaUrlDuration(url, kind = 'video', fallbackDuration = 5) {
    if (!url) return fallbackDuration;
    const mediaEl = document.createElement(kind === 'audio' ? 'audio' : 'video');
    mediaEl.preload = 'metadata';
    mediaEl.muted = true;
    mediaEl.playsInline = true;
    mediaEl.src = url;

    return await new Promise((resolve) => {
        let settled = false;
        const readDuration = () => {
            const duration = Number(mediaEl.duration);
            return Number.isFinite(duration) && duration > 0 ? duration : null;
        };
        const finish = (duration) => {
            if (settled) return;
            settled = true;
            clearTimeout(fallback);
            mediaEl.onloadedmetadata = null;
            mediaEl.ondurationchange = null;
            mediaEl.onseeked = null;
            mediaEl.onerror = null;
            resolve(duration);
        };
        const fallback = setTimeout(() => finish(fallbackDuration), 4500);
        mediaEl.onloadedmetadata = () => {
            const directDuration = readDuration();
            if (directDuration) {
                finish(directDuration);
                return;
            }

            if (kind !== 'video') {
                finish(fallbackDuration);
                return;
            }

            const finalizeFromProbe = () => {
                const probedDuration = readDuration();
                if (probedDuration) {
                    finish(probedDuration);
                }
            };

            mediaEl.ondurationchange = finalizeFromProbe;
            mediaEl.onseeked = finalizeFromProbe;

            try {
                mediaEl.currentTime = 1e101;
            } catch (error) {
                finish(fallbackDuration);
            }
        };
        mediaEl.onerror = () => {
            finish(fallbackDuration);
        };
        mediaEl.load();
    });
}

function createAiTaskCancelledError() {
    const error = new Error(AI_TASK_CANCELLED_MESSAGE);
    error.name = 'AiTaskCancelledError';
    return error;
}

function isAiTaskCancelledError(error) {
    return error?.name === 'AiTaskCancelledError';
}

function throwIfAborted(signal) {
    if (signal?.aborted) {
        throw createAiTaskCancelledError();
    }
}

async function waitWithAbort(ms, signal) {
    throwIfAborted(signal);
    return await new Promise((resolve, reject) => {
        const timeoutId = setTimeout(() => {
            cleanup();
            resolve();
        }, ms);

        const cleanup = () => {
            clearTimeout(timeoutId);
            signal?.removeEventListener('abort', onAbort);
        };

        const onAbort = () => {
            cleanup();
            reject(createAiTaskCancelledError());
        };

        signal?.addEventListener('abort', onAbort, { once: true });
    });
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 60000, externalSignal) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    const onAbort = () => controller.abort(externalSignal?.reason || createAiTaskCancelledError());
    externalSignal?.addEventListener('abort', onAbort, { once: true });
    try {
        return await fetch(url, {
            ...options,
            signal: controller.signal
        });
    } catch (error) {
        if (error?.name === 'AbortError') {
            if (externalSignal?.aborted) {
                throw createAiTaskCancelledError();
            }
            throw new Error(`請求逾時（${Math.round(timeoutMs / 1000)} 秒），Ollama 可能尚未回應。`);
        }
        throw error;
    } finally {
        clearTimeout(timeoutId);
        externalSignal?.removeEventListener('abort', onAbort);
    }
}

async function extractHttpErrorMessage(response) {
    const fallback = `HTTP 錯誤 ${response?.status || ''}`.trim();
    if (!response) return fallback;

    try {
        const contentType = String(response.headers?.get('content-type') || '').toLowerCase();
        if (contentType.includes('application/json')) {
            const data = await response.json();
            const detail = data?.error?.message || data?.message || '';
            const code = data?.error?.code || '';
            const suffix = [code, detail].filter(Boolean).join(': ');
            return suffix ? `${fallback}: ${suffix}` : fallback;
        }
        const text = (await response.text()).trim();
        return text ? `${fallback}: ${text.slice(0, 400)}` : fallback;
    } catch (error) {
        return fallback;
    }
}

function extractOpenAiCompatibleText(data) {
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
        return content
            .map((item) => {
                if (typeof item === 'string') return item;
                if (typeof item?.text === 'string') return item.text;
                return '';
            })
            .join('\n')
            .trim();
    }
    return '';
}

async function callLmStudioChat({
    endpoint,
    apiKey,
    model,
    prompt,
    images = [],
    temperature = 0,
    format = 'json',
    timeoutMs = 180000,
    maxTokens,
    signal
}) {
    const headers = { 'Content-Type': 'application/json' };
    if (String(apiKey || '').trim()) {
        headers.Authorization = `Bearer ${String(apiKey).trim()}`;
    }

    const messageContent = images.length > 0
        ? [
            { type: 'text', text: prompt },
            ...images.map((image) => ({
                type: 'image_url',
                image_url: { url: `data:image/jpeg;base64,${image}` }
            }))
        ]
        : prompt;
    const basePayload = {
        model,
        messages: [{ role: 'user', content: messageContent }],
        temperature,
        stream: false
    };
    if (Number.isFinite(maxTokens) && maxTokens > 0) {
        basePayload.max_tokens = Math.round(maxTokens);
    }
    const payloadVariants = format === 'json'
        ? [
            { ...basePayload, response_format: { type: 'json_object' } },
            basePayload
        ]
        : [basePayload];
    const retryDelays = [1200, 2500];
    let lastError = null;

    for (const payload of payloadVariants) {
        for (let attempt = 0; attempt <= retryDelays.length; attempt++) {
            try {
                throwIfAborted(signal);
                const response = await fetchWithTimeout(buildOllamaApiUrl(endpoint, '/v1/chat/completions'), {
                    method: 'POST',
                    headers,
                    body: JSON.stringify(payload)
                }, timeoutMs, signal);
                if (!response.ok) {
                    const errText = await response.text().catch(() => '');
                    const errHint = errText ? `: ${errText.slice(0, 400)}` : '';
                    throw new Error(`LM Studio /v1/chat/completions HTTP 錯誤 ${response.status}${errHint}`);
                }
                const data = await response.json();
                const rawText = extractOpenAiCompatibleText(data);
                if (!rawText) throw new Error('LM Studio 沒有回傳可解析內容。');
                return rawText;
            } catch (error) {
                lastError = error;
                if (isAiTaskCancelledError(error)) throw error;
                if ((error?.name === 'TypeError' || /Failed to fetch/i.test(String(error?.message || ''))) && attempt < retryDelays.length) {
                    await waitWithAbort(retryDelays[attempt], signal);
                    continue;
                }
                if (format === 'json' && payload.response_format && /HTTP 錯誤 400/.test(String(error?.message || ''))) {
                    break;
                }
                if (attempt >= retryDelays.length) break;
                break;
            }
        }
    }

    throw new Error(`無法連線到 LM Studio 模型「${model}」。${String(lastError?.message || '未知錯誤')}。請確認 LM Studio Server 已啟動，且可從瀏覽器直接存取 ${endpoint}。`);
}

async function callOllamaChat({ endpoint, model, prompt, images = [], temperature = 0, format = 'json', numPredict, timeoutMs = 180000, signal }) {
    const options = { temperature };
    if (Number.isFinite(numPredict) && numPredict > 0) options.num_predict = Math.round(numPredict);
    const requestPayload = {
        model,
        stream: false,
        format,
        options
    };
    const retryDelays = [1200, 2500];
    let lastError = null;

    for (let attempt = 0; attempt <= retryDelays.length; attempt++) {
        try {
            throwIfAborted(signal);
            const response = await fetchWithTimeout(buildOllamaApiUrl(endpoint, '/api/chat'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...requestPayload,
                    messages: [
                        {
                            role: 'user',
                            content: prompt,
                            images
                        }
                    ]
                })
            }, timeoutMs, signal);

            if (!response.ok) {
                const errText = await response.text().catch(() => '');
                const errHint = errText ? `: ${errText.slice(0, 400)}` : '';
                throw new Error(`Ollama /api/chat HTTP 錯誤 ${response.status}${errHint}`);
            }

            const data = await response.json();
            const rawText = data?.message?.content || data?.response || '';
            if (!rawText) throw new Error('Ollama /api/chat 沒有回傳可解析內容。');
            return rawText;
        } catch (error) {
            lastError = error;
            if (isAiTaskCancelledError(error)) throw error;
            if ((error?.name === 'TypeError' || /Failed to fetch/i.test(String(error?.message || ''))) && attempt < retryDelays.length) {
                await waitWithAbort(retryDelays[attempt], signal);
                continue;
            }
            break;
        }
    }

    try {
            throwIfAborted(signal);
            const response = await fetchWithTimeout(buildOllamaApiUrl(endpoint, '/api/generate'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                ...requestPayload,
                prompt,
                images
            })
        }, timeoutMs, signal);

        if (!response.ok) {
            const errText = await response.text().catch(() => '');
            const errHint = errText ? `: ${errText.slice(0, 400)}` : '';
            throw new Error(`Ollama /api/generate HTTP 錯誤 ${response.status}${errHint}`);
        }

        const data = await response.json();
        const rawText = data?.response || data?.message?.content || '';
        if (!rawText) throw new Error('Ollama /api/generate 沒有回傳可解析內容。');
        return rawText;
    } catch (fallbackError) {
        const originalMessage = String(lastError?.message || '').trim();
        const fallbackMessage = String(fallbackError?.message || '').trim();
        if (originalMessage || fallbackMessage) {
            throw new Error(`無法連線到 Ollama 文章模型「${model}」。chat: ${originalMessage || '未知錯誤'}；generate: ${fallbackMessage || '未知錯誤'}。請確認 Ollama 服務仍在線、模型已下載完成，並且 endpoint 可直接從瀏覽器存取。`);
        }
        throw fallbackError;
    }
}

async function callOllamaTts({ endpoint, model, text, language = 'en', timeoutMs = 180000, signal }) {
    const endpointPaths = ['/api/tts', '/v1/audio/speech', '/audio/speech'];
    const errors = [];

    for (const path of endpointPaths) {
        try {
            throwIfAborted(signal);
            const response = await fetchWithTimeout(buildOllamaApiUrl(endpoint, path), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model,
                    input: text,
                    text,
                    voice: 'alloy',
                    format: 'wav',
                    response_format: 'wav',
                    language,
                    stream: false
                })
            }, timeoutMs, signal);

            if (!response.ok) {
                const errText = await response.text().catch(() => '');
                errors.push(`${path}: HTTP ${response.status}${errText ? ` ${errText.slice(0, 160)}` : ''}`);
                continue;
            }

            const contentType = String(response.headers.get('content-type') || '').toLowerCase();
            if (contentType.startsWith('audio/') || contentType.includes('octet-stream')) {
                const blob = await response.blob();
                return blob.size > 0 ? blob : new Blob([await blob.arrayBuffer()], { type: 'audio/wav' });
            }

            const data = await response.json().catch(() => null);
            const audioBlob = extractOllamaAudioPayload(data);
            if (audioBlob && audioBlob.size > 0) return audioBlob;

            errors.push(`${path}: 回應成功但沒有可解析的音訊資料`);
        } catch (error) {
            if (isAiTaskCancelledError(error)) throw error;
            errors.push(`${path}: ${error.message || '未知錯誤'}`);
        }
    }

    throw new Error(`Ollama TTS 無法使用模型「${model}」。${errors.join('；')}。請確認你的本地服務有提供 TTS endpoint，例如 Kokoro / Piper wrapper 或 OpenAI-compatible audio/speech。`);
}

async function callOllamaStt({ endpoint, model, file, language = 'en', allowEmptyText = false, timeoutMs = 180000, signal }) {
    const endpointPaths = ['/api/transcriptions', '/v1/audio/transcriptions', '/audio/transcriptions'];
    const errors = [];

    for (const path of endpointPaths) {
        try {
            throwIfAborted(signal);
            const formData = new FormData();
            formData.append('file', file);
            formData.append('model', model);
            formData.append('response_format', 'verbose_json');
            formData.append('timestamp_granularities[]', 'segment');
            if (language === 'zh-TW') formData.append('language', 'zh');
            if (language === 'en') formData.append('language', 'en');

            const response = await fetchWithTimeout(buildOllamaApiUrl(endpoint, path), {
                method: 'POST',
                body: formData
            }, timeoutMs, signal);

            if (!response.ok) {
                const errText = await response.text().catch(() => '');
                errors.push(`${path}: HTTP ${response.status}${errText ? ` ${errText.slice(0, 160)}` : ''}`);
                continue;
            }

            const contentType = String(response.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('application/json')) {
                const data = await response.json();
                const hasSegments = Array.isArray(data?.segments) && data.segments.length >= 0;
                const hasTextField = typeof data?.text === 'string';
                if (hasSegments || hasTextField || allowEmptyText) return data;
                errors.push(`${path}: 回應成功但沒有 text / segments`);
                continue;
            }

            const text = (await response.text().catch(() => '')).trim();
            if (text || allowEmptyText) return { text, segments: [] };
            errors.push(`${path}: 回應成功但內容為空`);
        } catch (error) {
            if (isAiTaskCancelledError(error)) throw error;
            errors.push(`${path}: ${error.message || '未知錯誤'}`);
        }
    }

    throw new Error(`Ollama STT 無法使用模型「${model}」。${errors.join('；')}。請確認你的本地服務有提供 STT endpoint，例如 faster-whisper wrapper 或 OpenAI-compatible audio/transcriptions。`);
}

// --- 本機 IndexedDB 實體檔案快取機制 ---
function pcmToWav(pcmBytes, sampleRate) {
    const numChannels = 1;
    const byteRate = sampleRate * numChannels * 2;
    const blockAlign = numChannels * 2;
    const buffer = new ArrayBuffer(44 + pcmBytes.length);
    const view = new DataView(buffer);

    const writeString = (view, offset, string) => {
        for (let i = 0; i < string.length; i++) view.setUint8(offset + i, string.charCodeAt(i));
    };

    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + pcmBytes.length, true);
    writeString(view, 8, 'WAVE');
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, 16, true);
    writeString(view, 36, 'data');
    view.setUint32(40, pcmBytes.length, true);

    const wavBytes = new Uint8Array(buffer);
    wavBytes.set(pcmBytes, 44);

    return new Blob([buffer], { type: 'audio/wav' });
}

function showClickRipple(x, y, zIndex = '999999') {
    const rippleDurationMs = 1300; // 原本約 800ms，延長 0.5s
    const ripple = document.createElement('div');
    ripple.style.position = 'fixed';
    ripple.style.width = '54px';
    ripple.style.height = '54px';
    ripple.style.left = `${x - 27}px`;
    ripple.style.top = `${y - 27}px`;
    ripple.style.border = '7px solid rgba(255, 48, 48, 0.98)';
    ripple.style.borderRadius = '50%';
    ripple.style.pointerEvents = 'none';
    ripple.style.zIndex = zIndex;
    ripple.style.opacity = '1';
    ripple.style.transform = 'scale(0.5)';
    ripple.style.boxShadow = '0 0 0 2px rgba(255,255,255,0.25), 0 0 16px rgba(255, 48, 48, 0.75)';
    ripple.style.transition = `all ${rippleDurationMs}ms ease-out`;

    document.body.appendChild(ripple);
    requestAnimationFrame(() => {
        ripple.style.transform = 'scale(1.6)';
        ripple.style.opacity = '0';
    });
    setTimeout(() => ripple.remove(), rippleDurationMs + 40);
}

const CLICK_RIPPLE_DURATION_MS = 1300;
const CLICK_RIPPLE_START_SCALE = 0.5;
const CLICK_RIPPLE_END_SCALE = 1.6;
const CLICK_RIPPLE_BASE_RADIUS_PX = 27;
const CLICK_RIPPLE_STROKE_PX = 7;

/**
 * Build clip epoch ranges from video clips + recording range start.
 * Used to map click epochMs → correct timeline time after trim/split/delete.
 * Returns [] if not enough data (caller falls back to legacy linear mapping).
 */
function buildClipEpochRanges(allVideoClips, rangeStartEpochMs, sessionId = '') {
    const safeRangeStart = Number(rangeStartEpochMs || 0);
    if (!safeRangeStart) return [];
    return (Array.isArray(allVideoClips) ? allVideoClips : [])
        .filter(clip => clip?.recordingSessionId && (!sessionId || String(clip.recordingSessionId) === sessionId))
        .map(clip => ({
            startAt: Number(clip.startAt || 0),
            epochStart: safeRangeStart + Number(clip.trimStart || 0) * 1000,
            epochEnd: safeRangeStart + Number(clip.trimEnd ?? (Number(clip.trimStart || 0) + Number(clip.duration || 0))) * 1000,
        }))
        .filter(r => Number.isFinite(r.epochStart) && Number.isFinite(r.epochEnd) && r.epochEnd > r.epochStart);
}

/**
 * Map a single click epochMs to timeline time using per-clip ranges.
 * Returns null if the click falls in a deleted/trimmed segment.
 */
function epochMsToTimelineTime(epochMs, clipEpochRanges, fallbackRangeStart = 0, fallbackOffset = 0) {
    if (clipEpochRanges.length > 0) {
        const clip = clipEpochRanges.find(r => epochMs >= r.epochStart && epochMs < r.epochEnd);
        if (!clip) return null;
        return Number((clip.startAt + (epochMs - clip.epochStart) / 1000).toFixed(3));
    }
    return Number(((epochMs - fallbackRangeStart) / 1000 + fallbackOffset).toFixed(3));
}

function buildRenderableClickPoints({
    clickEvents = [],
    rangeStartEpochMs = 0,
    rangeEndEpochMs = 0,
    allVideoClips = [],
    activeSessionId = ''
}) {
    if (!Array.isArray(clickEvents) || clickEvents.length === 0) return [];

    const safeRangeStart = Number(rangeStartEpochMs || 0);
    const safeRangeEnd = Number(rangeEndEpochMs || 0);
    const safeVideoClips = Array.isArray(allVideoClips) ? allVideoClips : [];

    // Build per-clip epoch ranges using trimStart/trimEnd relative to rangeStartEpochMs.
    // This ensures click events are mapped to the correct timeline position even after
    // clips have been split, trimmed, or deleted from the timeline.
    const clipEpochRanges = safeRangeStart > 0
        ? safeVideoClips
            .filter(clip => clip?.recordingSessionId && (!activeSessionId || String(clip.recordingSessionId) === activeSessionId))
            .map(clip => ({
                startAt: Number(clip.startAt || 0),
                epochStart: safeRangeStart + Number(clip.trimStart || 0) * 1000,
                epochEnd: safeRangeStart + Number(clip.trimEnd ?? (Number(clip.trimStart || 0) + Number(clip.duration || 0))) * 1000,
                sessionId: String(clip.recordingSessionId || ''),
                _dbg: { trimStart: clip.trimStart, trimEnd: clip.trimEnd, startAt: clip.startAt, recordingSessionId: clip.recordingSessionId }
            }))
            .filter(r => Number.isFinite(r.epochStart) && Number.isFinite(r.epochEnd) && r.epochEnd > r.epochStart)
        : [];

    console.log('[clickMap] safeRangeStart:', safeRangeStart, 'activeSessionId:', activeSessionId, 'clipEpochRanges:', JSON.stringify(clipEpochRanges), 'allVideoClips count:', safeVideoClips.length);

    // Fallback: legacy linear mapping for projects that lack per-clip epoch data
    const useLegacyMapping = clipEpochRanges.length === 0;
    let effectiveRangeStart = safeRangeStart;
    let recordingTimelineOffset = 0;
    if (useLegacyMapping) {
        const timelineSpanMs = Math.max(
            0,
            Math.round(
                safeVideoClips.reduce((maxValue, clip) => {
                    const clipEnd = Number(clip?.startAt || 0) + Number(clip?.duration || 0);
                    return Number.isFinite(clipEnd) ? Math.max(maxValue, clipEnd) : maxValue;
                }, 0) * 1000
            )
        );
        const recordedSpanMs = safeRangeEnd > safeRangeStart ? safeRangeEnd - safeRangeStart : 0;
        const shouldPreferRecentWindow = !activeSessionId
            && timelineSpanMs > 0
            && recordedSpanMs > timelineSpanMs + 15000;
        effectiveRangeStart = shouldPreferRecentWindow
            ? Math.max(safeRangeStart, safeRangeEnd - timelineSpanMs - 3000)
            : safeRangeStart;
        const recordingSessionClips = activeSessionId
            ? safeVideoClips.filter(clip => String(clip?.recordingSessionId || '') === activeSessionId)
            : [];
        recordingTimelineOffset = recordingSessionClips.length > 0
            ? Math.min(...recordingSessionClips.map(clip => Number(clip?.startAt || 0)).filter(Number.isFinite))
            : (activeSessionId && safeVideoClips.length > 0
                ? Math.max(...safeVideoClips.map(clip => Number(clip?.startAt || 0)).filter(Number.isFinite))
                : 0);
    }

    return clickEvents
        .filter(ev => typeof ev?.epochMs === 'number')
        .filter(ev => !activeSessionId || String(ev?.sessionId || '') === activeSessionId)
        .map(ev => {
            let time;
            if (!useLegacyMapping) {
                // Per-clip mapping: find the clip whose recording epoch range contains this click
                const matchingClip = clipEpochRanges.find(
                    r => ev.epochMs >= r.epochStart && ev.epochMs < r.epochEnd
                );
                if (!matchingClip) return null; // click belongs to a deleted/trimmed segment
                time = Number((matchingClip.startAt + (ev.epochMs - matchingClip.epochStart) / 1000).toFixed(3));
            } else {
                if (ev.epochMs < effectiveRangeStart) return null;
                if (safeRangeEnd && ev.epochMs > safeRangeEnd) return null;
                time = Number((((ev.epochMs - effectiveRangeStart) / 1000) + recordingTimelineOffset).toFixed(3));
            }
            return {
                ...ev,
                time,
                x: Number(ev?.x),
                y: Number(ev?.y),
                viewportW: Number(ev?.viewportW),
                viewportH: Number(ev?.viewportH)
            };
        })
        .filter(ev => ev && Number.isFinite(ev.time) && ev.time >= 0 && ev.viewportW > 0 && ev.viewportH > 0)
        .sort((a, b) => a.time - b.time);
}

function drawClickRippleOnCanvas(ctx, canvas, clickPoint, time) {
    if (!ctx || !canvas || !clickPoint) return;
    const elapsedMs = (time - Number(clickPoint.time || 0)) * 1000;
    if (elapsedMs < 0 || elapsedMs > CLICK_RIPPLE_DURATION_MS) return;

    const progress = clamp(elapsedMs / CLICK_RIPPLE_DURATION_MS, 0, 1);
    const scale = CLICK_RIPPLE_START_SCALE + (CLICK_RIPPLE_END_SCALE - CLICK_RIPPLE_START_SCALE) * progress;
    const opacity = 1 - progress;
    const radius = CLICK_RIPPLE_BASE_RADIUS_PX * scale;
    const strokeWidth = Math.max(2, CLICK_RIPPLE_STROKE_PX * (1 - progress * 0.18));
    const x = (clickPoint.x / clickPoint.viewportW) * canvas.width;
    const y = (clickPoint.y / clickPoint.viewportH) * canvas.height;

    if (!Number.isFinite(x) || !Number.isFinite(y)) return;

    ctx.save();
    ctx.globalAlpha *= opacity;
    ctx.shadowColor = `rgba(255, 48, 48, ${0.75 * opacity})`;
    ctx.shadowBlur = 16;

    ctx.beginPath();
    ctx.lineWidth = strokeWidth + 2;
    ctx.strokeStyle = `rgba(255, 255, 255, ${0.25 * opacity})`;
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.stroke();

    ctx.beginPath();
    ctx.lineWidth = strokeWidth;
    ctx.strokeStyle = `rgba(255, 48, 48, ${0.98 * opacity})`;
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
}

function createModelCatalogState(detail = '尚未讀取模型清單。') {
    return {
        phase: 'idle',
        detail,
        options: []
    };
}

function buildBaseEndpointUrl(endpoint, path) {
    return `${String(endpoint || '').trim().replace(/\/+$/, '')}${path}`;
}

function normalizeServerModelOptions(items, preferredKeys = []) {
    const seen = new Set();
    const options = [];

    items.forEach((item) => {
        if (!item || typeof item !== 'object') return;
        const value = preferredKeys
            .map((key) => item[key])
            .find((candidate) => typeof candidate === 'string' && candidate.trim());
        if (!value) return;
        const normalizedValue = value.trim();
        if (!normalizedValue || seen.has(normalizedValue)) return;
        seen.add(normalizedValue);

        const labelCandidates = [
            item.display_name,
            item.displayName,
            item.name,
            normalizedValue
        ];
        const label = labelCandidates.find((candidate) => typeof candidate === 'string' && candidate.trim()) || normalizedValue;

        options.push({
            value: normalizedValue,
            label: label.trim()
        });
    });

    return options.sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }));
}

function DesignMotionPreview({ preset, variant = 'lower-third', duration = 4.2, compact = false, templateId = 'hf-clean-product' }) {
    const template = getHyperframeTemplate(templateId);
    const isStrongCard = template.lowerThirdStyle === 'bold-block' || template.lowerThirdStyle === 'creator-cta';
    const isAccentUnderline = template.lowerThirdStyle === 'accent-underline';
    const title = variant === 'lower-third' ? '關鍵操作提示' : '快速完成設定';
    const previewSizeClass = compact === 'half'
        ? 'h-28 w-48 shrink-0 rounded-xl'
        : compact
            ? 'h-20 w-36 shrink-0 rounded-xl'
            : 'aspect-video rounded-xl';
    const densityClass = compact === 'half'
        ? 'design-motion-preview--half'
        : compact
            ? 'design-motion-preview--compact'
            : '';
    return (
        <div
            className={`design-motion-preview relative overflow-hidden border border-white/10 ${densityClass} ${previewSizeClass}`}
            style={{
                backgroundColor: preset.background,
                color: preset.foreground,
                '--design-preview-duration': `${Math.min(6, Math.max(1.2, Number(duration) || 4.2))}s`
            }}
            aria-label={`${preset.name} ${variant} 動態預覽`}
        >
            <div className="design-preview-glow absolute -right-[12%] -top-[45%] h-[120%] w-[62%] rounded-full blur-2xl" style={{ backgroundColor: `${preset.accent}66` }} />
            <div className="absolute inset-0 opacity-20" style={{ backgroundImage: `linear-gradient(112deg, transparent 0%, transparent 45%, ${preset.foreground} 45.35%, transparent 45.7%, transparent 66%, ${preset.foreground} 66.35%, transparent 66.7%)` }} />
            {variant === 'lower-third' ? (
                <div className="design-preview-lower-third absolute bottom-[13%] left-[8%] w-[76%] overflow-hidden shadow-xl" style={{ backgroundColor: isAccentUnderline ? 'transparent' : (isStrongCard ? preset.accent : `${preset.surface}f4`), borderLeft: isAccentUnderline ? 'none' : `4px solid ${isStrongCard ? preset.background : preset.accent}`, borderBottom: isAccentUnderline ? `3px solid ${preset.accent}` : 'none', borderRadius: template.lowerThirdStyle === 'soft-pill' ? 999 : 8 }}>
                    <div className="design-preview-lower-third-content px-3 py-2">
                        <div className="design-preview-accent-bar mb-1 h-0.5 w-12 rounded-full" style={{ backgroundColor: isStrongCard ? preset.background : preset.accent }} />
                        <div className="design-preview-eyebrow text-[7px] font-bold tracking-[0.16em]" style={{ color: isStrongCard ? preset.background : preset.muted }}>{isAccentUnderline ? 'OPEN VISCRIBE  ·  STEP' : (template.lowerThirdStyle === 'code-window' ? '● ● ●  RELEASE' : 'OPEN VISCRIBE')}</div>
                        <div className="design-preview-title mt-0.5 text-[11px] font-bold leading-tight" style={{ color: isStrongCard ? preset.background : preset.foreground }}>{title}</div>
                    </div>
                </div>
            ) : variant === 'outro' ? (
                <div className="design-preview-outro absolute left-1/2 top-1/2 w-[70%] -translate-x-1/2 -translate-y-1/2 rounded-xl border px-3 py-3 text-center shadow-xl" style={{ backgroundColor: `${preset.surface}ee`, borderColor: preset.accent }}>
                    <div className="design-preview-eyebrow text-[7px] font-bold tracking-[0.16em]" style={{ color: preset.accent }}>{template.outroStyle === 'creator-cta' ? 'FOLLOW FOR NEXT STEP' : 'THANKS FOR WATCHING'}</div>
                    <div className="design-preview-title mt-1 text-sm font-extrabold" style={{ color: preset.foreground }}>OPEN VISCRIBE</div>
                    <div className="design-preview-copy mt-1 text-[7px]" style={{ color: preset.muted }}>訂閱更多實用教學</div>
                </div>
            ) : (
                <div className="design-preview-intro absolute left-[10%] top-[25%] max-w-[78%]">
                    <div className="design-preview-accent-bar mb-2 h-1 w-12 rounded-full" style={{ backgroundColor: preset.accent }} />
                    <div className="design-preview-eyebrow text-[7px] font-bold tracking-[0.17em]" style={{ color: preset.accent }}>{template.introStyle === 'editorial-title' ? 'OPEN VISCRIBE / EXPLAINED' : 'OPEN VISCRIBE / VIDEO'}</div>
                    <div className="design-preview-title mt-1 text-lg font-extrabold leading-tight" style={{ color: preset.foreground }}>{title}</div>
                    <div className="design-preview-copy mt-2 text-[7px] tracking-[0.14em]" style={{ color: preset.muted }}>OPEN VISCRIBE</div>
                </div>
            )}
        </div>
    );
}

function HyperframeAssetPreview({ asset, className = '' }) {
    const preset = getMotionDesignPreset(asset.presetId);
    const accent = preset.accent;
    const alt = preset.accentAlt;
    const foreground = preset.foreground;
    const previewId = useId().replace(/:/g, '');
    const catalogLabel = String(asset.catalogId || '').replace(/^code-snippet-/, '').toUpperCase();
    const renderWorldMap = (showFlow = false) => {
        const nodes = [[132, 80, 'US'], [171, 75, 'EU'], [210, 101, 'APAC']];
        return (
            <svg viewBox="0 0 320 160" className="absolute inset-0 h-full w-full" aria-hidden="true">
                <defs>
                    <radialGradient id={`map-ocean-${previewId}`} cx="38%" cy="30%" r="78%">
                        <stop offset="0" stopColor={`${alt}42`} />
                        <stop offset="0.56" stopColor={`${preset.surface}e8`} />
                        <stop offset="1" stopColor={`${preset.background}f4`} />
                    </radialGradient>
                    <linearGradient id={`map-land-${previewId}`} x1="0" y1="0" x2="1" y2="1">
                        <stop offset="0" stopColor={foreground} stopOpacity="0.62" />
                        <stop offset="1" stopColor={alt} stopOpacity="0.25" />
                    </linearGradient>
                    <linearGradient id={`map-route-${previewId}`} x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0" stopColor={alt} stopOpacity="0.2" />
                        <stop offset="0.48" stopColor={accent} />
                        <stop offset="1" stopColor={alt} stopOpacity="0.4" />
                    </linearGradient>
                    <filter id={`map-shadow-${previewId}`} x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="4" /></filter>
                    <clipPath id={`map-globe-clip-${previewId}`}><circle cx="170" cy="92" r="62" /></clipPath>
                </defs>
                <text x="18" y="19" fill={foreground} opacity="0.92" fontSize="8" fontWeight="700" letterSpacing="1.45">{showFlow ? 'GLOBAL ROUTING' : 'GLOBAL INFRASTRUCTURE'}</text>
                <text x="18" y="31" fill={foreground} opacity="0.43" fontSize="6" letterSpacing="0.9">{showFlow ? 'LIVE PATH / MULTI-REGION' : 'LIVE COVERAGE / 03 REGIONS'}</text>
                <g transform="translate(0 1)">
                    <circle cx="170" cy="94" r="66" fill={accent} opacity="0.18" filter={`url(#map-shadow-${previewId})`} />
                    <circle cx="170" cy="92" r="64" fill={`url(#map-ocean-${previewId})`} stroke={`${foreground}44`} strokeWidth="1" />
                    <g className="hyperframe-preview-globe" clipPath={`url(#map-globe-clip-${previewId})`}>
                        <g className="hyperframe-preview-graticule" fill="none" stroke={`${foreground}22`} strokeWidth="0.7">
                            <ellipse cx="170" cy="92" rx="62" ry="19" />
                            <ellipse cx="170" cy="92" rx="62" ry="40" />
                            <path d="M108 92 H232 M113 69 H227 M113 115 H227" />
                            <ellipse cx="170" cy="92" rx="22" ry="62" />
                            <ellipse cx="170" cy="92" rx="44" ry="62" />
                        </g>
                        <g className="hyperframe-preview-world" fill={`url(#map-land-${previewId})`} stroke={`${foreground}48`} strokeWidth="0.7">
                            <path d="M115 57 C123 47 140 43 150 48 C153 54 148 61 142 65 L136 75 L127 72 L120 67 Z" />
                            <path d="M142 78 C150 81 156 91 154 101 C151 112 146 123 140 132 L134 122 L136 107 L130 95 Z" />
                            <path d="M160 58 C174 49 197 48 212 55 C224 60 231 70 235 81 L225 87 L214 83 L204 89 L192 84 L183 92 L171 84 L164 74 Z" />
                            <path d="M184 91 C196 91 204 99 207 109 L200 124 L189 119 L181 106 Z" />
                            <path d="M214 112 C224 108 233 114 236 121 L229 128 L218 125 Z" />
                        </g>
                        <path className="hyperframe-preview-terminator" d="M115 36 C149 55 180 83 226 150 L242 150 L242 35 Z" fill={`${preset.background}72`} />
                    </g>
                    <circle cx="170" cy="92" r="64" fill="none" stroke={`${foreground}26`} strokeWidth="1.25" />
                    <path d="M108 92 H232" stroke={`${foreground}1c`} />
                    <path d="M170 28 V156" stroke={`${foreground}16`} />
                    {showFlow && <g className="hyperframe-preview-flow" fill="none" stroke={`url(#map-route-${previewId})`} strokeWidth="2.1"><path d="M132 80 Q151 42 171 75" /><path d="M171 75 Q204 51 210 101" /></g>}
                    {!showFlow && <g fill="none" stroke={`${alt}5e`} strokeWidth="0.9" opacity="0.7"><path d="M132 80 Q151 59 171 75" /><path d="M171 75 Q193 70 210 101" /></g>}
                    {nodes.map(([cx, cy, label], index) => <g key={label} className="hyperframe-preview-node" style={{ '--node-delay': `${index * -0.34}s` }}><circle cx={cx} cy={cy} r="9" fill="none" stroke={index === 2 ? alt : accent} strokeWidth="0.8" opacity="0.55" /><circle cx={cx} cy={cy} r="4.1" fill={index === 2 ? alt : accent} stroke={preset.background} strokeWidth="1.5" /><text x={cx + 7} y={cy - 6} fill={foreground} opacity="0.9" fontSize="5.5" fontFamily="monospace" fontWeight="700">{label}</text></g>)}
                </g>
                <g transform="translate(18 133)"><rect width="86" height="12" rx="6" fill={`${preset.surface}d9`} stroke={`${foreground}24`} /><circle cx="9" cy="6" r="2.2" fill={accent} /><text x="15" y="8.2" fill={foreground} opacity="0.74" fontSize="5.5" fontWeight="700" letterSpacing="0.45">NETWORK ONLINE</text></g>
                <text x="270" y="143" fill={foreground} opacity="0.42" fontSize="5.5" textAnchor="end" letterSpacing="0.8">UTC · LIVE</text>
            </svg>
        );
    };
    const renderCodeWindow = () => {
        const isDiff = asset.assetType === 'code-diff';
        const isConsole = asset.assetType === 'console';
        const isTyping = asset.assetType === 'code-typing';
        return <div className="absolute inset-[9%] rounded-xl border border-white/15 bg-[#071019] p-3 shadow-inner shadow-black/40">
            <div className="mb-3 flex items-center gap-1.5">{[accent, alt, foreground].map((color, index) => <span key={index} className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />)}<span className="ml-2 font-mono text-[7px] text-white/45">{isConsole ? 'deploy@global:~' : isDiff ? 'release.diff' : 'deploy.config.ts'}</span></div>
            {isDiff ? <div className="grid grid-cols-2 gap-2"><div className="rounded-lg border border-rose-300/20 bg-rose-400/10 p-2"><span className="font-mono text-[8px] text-rose-200">− region: legacy</span><span className="mt-2 block h-1.5 w-4/5 rounded bg-rose-300/60" /><span className="mt-1.5 block h-1.5 w-3/5 rounded bg-rose-300/35" /></div><div className="rounded-lg border border-emerald-300/20 bg-emerald-400/10 p-2"><span className="font-mono text-[8px] text-emerald-200">+ region: apac</span><span className="mt-2 block h-1.5 w-4/5 rounded bg-emerald-300/60" /><span className="mt-1.5 block h-1.5 w-3/5 rounded bg-emerald-300/35" /></div></div> : <div className="space-y-2 font-mono text-[9px]">{isConsole && <div className="text-white/85"><span className="text-emerald-300">user@studio %</span> deploy --region apac</div>}{[0, 1, 2].map(index => <div key={index} className="hyperframe-preview-code-line flex gap-2" style={{ '--line-delay': `${index * -0.28}s` }}><span style={{ color: alt }}>{isConsole ? '✓' : `${index + 1}`}</span><span className="h-1.5 rounded" style={{ width: `${52 + index * 13}%`, backgroundColor: index % 2 ? alt : accent }} /></div>)}{isTyping && <span className="hyperframe-preview-cursor inline-block h-3 w-1.5" style={{ backgroundColor: foreground }} />}</div>}
        </div>;
    };
    const renderProduct = () => {
        const isDevice = asset.assetType === 'device-reveal';
        const isGlass = asset.assetType === 'liquid-glass';
        return <div className={`hyperframe-preview-product absolute ${isDevice ? 'left-[37%] top-[8%] h-[84%] w-[26%] rounded-[18px]' : 'inset-[15%] rounded-xl'} border shadow-2xl`} style={{ backgroundColor: isGlass ? `${foreground}18` : `${preset.surface}ee`, borderColor: `${accent}bb`, backdropFilter: isGlass ? 'blur(9px)' : undefined }}>
            <div className="mx-auto mt-[9%] h-2 w-1/3 rounded-full bg-white/25" />
            <div className="mx-[12%] mt-[11%] rounded-lg border border-white/10 p-2" style={{ backgroundColor: `${alt}66` }}><div className="flex items-center justify-between"><div className="h-2 w-2/5 rounded bg-white/80" /><div className="h-2 w-2 rounded-full" style={{ backgroundColor: accent }} /></div><div className="mt-3 grid grid-cols-3 gap-1"><span className="h-6 rounded bg-white/18" /><span className="h-6 rounded bg-white/10" /><span className="h-6 rounded bg-white/14" /></div><div className="mt-2 h-1.5 w-full rounded bg-white/45" /><div className="mt-1.5 h-1.5 w-4/5 rounded bg-white/30" /></div>
        </div>;
    };
    const renderDiagram = () => {
        if (asset.assetType === 'data-chart') return <svg viewBox="0 0 320 160" className="absolute inset-0 h-full w-full" aria-hidden="true"><text x="35" y="24" fill={foreground} opacity="0.85" fontSize="8" fontWeight="700">ADOPTION RATE</text><path d="M35 130 H290 M35 30 V130" stroke={`${foreground}4a`} strokeWidth="2" />{[0.32, 0.58, 0.43, 0.76, 0.92].map((bar, index) => <rect key={index} className="hyperframe-preview-bar" x={58 + index * 43} y={130 - bar * 88} width="22" height={bar * 88} rx="5" fill={index === 4 ? accent : `${alt}bb`} style={{ '--bar-delay': `${index * -0.16}s` }} />)}<path className="hyperframe-preview-chart-line" d="M69 94 L112 66 L155 80 L198 45 L241 36" fill="none" stroke={foreground} strokeWidth="3" /></svg>;
        const roadmap = asset.assetType === 'release-roadmap';
        return <div className="absolute inset-x-[9%] top-[26%] flex items-center justify-between"><div className="absolute left-[8%] right-[8%] top-1/2 h-0.5 -translate-y-1/2 bg-white/20" />{(roadmap ? ['v1.0', 'v1.5', 'v2.0'] : ['設定', '部署', '驗證']).map((label, index) => <div key={label} className="hyperframe-preview-step relative z-10 flex h-12 w-[27%] flex-col items-center justify-center rounded-lg border text-[8px] font-bold" style={{ backgroundColor: `${preset.surface}f2`, borderColor: index === 2 ? accent : `${foreground}55`, color: index === 2 ? accent : foreground, '--step-delay': `${index * -0.25}s` }}>{label}<span className="mt-1 h-1 w-5 rounded" style={{ backgroundColor: index === 2 ? accent : alt }} /></div>)}</div>;
    };
    const renderSocialOrText = () => {
        if (asset.assetType === 'news-ticker') return <div className="hyperframe-preview-ticker absolute inset-x-0 bottom-[18%] flex h-9 items-center whitespace-nowrap px-4 text-[9px] font-extrabold" style={{ backgroundColor: accent, color: preset.background }}>BREAKING · 部署狀態已更新 · 服務健康檢查完成 ·</div>;
        if (asset.assetType === 'caption-highlight') return <div className="absolute inset-0 flex flex-col items-center justify-center px-4 text-center font-extrabold leading-tight"><span className="text-sm" style={{ color: foreground }}>三步完成</span><span className="mt-1 text-base" style={{ color: accent }}>全球部署</span></div>;
        return <div className="absolute inset-x-[14%] top-[25%] rounded-xl border p-3" style={{ backgroundColor: `${preset.surface}ee`, borderColor: `${accent}99` }}><div className="flex items-center gap-2"><span className="h-8 w-8 rounded-full" style={{ backgroundColor: alt }} /><div><div className="text-[9px] font-extrabold" style={{ color: foreground }}>OPEN VISCRIBE</div><div className="mt-1 h-1.5 w-16 rounded bg-white/30" /></div></div><span className="mt-3 block w-full rounded py-1 text-center text-[8px] font-bold" style={{ backgroundColor: accent, color: preset.background }}>FOLLOW / 訂閱</span></div>;
    };
    return (
        <div className={`hyperframe-asset-preview relative overflow-hidden rounded-xl border border-white/10 ${className}`} style={{ backgroundColor: preset.background, '--hyperframe-accent': preset.accent, '--hyperframe-alt': preset.accentAlt, '--hyperframe-foreground': preset.foreground }} aria-label={`${asset.nameZh} 動態預覽`}>
            <div className="hyperframe-asset-glow absolute -right-6 -top-8 h-28 w-28 rounded-full blur-2xl" style={{ backgroundColor: `${preset.accent}55` }} />
            <div className="absolute right-3 top-2 z-10 rounded-full border border-white/10 bg-black/20 px-1.5 py-0.5 font-mono text-[6px] tracking-[0.12em] text-white/50">{catalogLabel}</div>
            {asset.assetType === 'world-map' && renderWorldMap()}
            {asset.assetType === 'world-flow' && renderWorldMap(true)}
            {['data-chart', 'flowchart', 'release-roadmap'].includes(asset.assetType) && renderDiagram()}
            {['console', 'code-diff', 'code-typing', 'neon-code'].includes(asset.assetType) && renderCodeWindow()}
            {['app-showcase', 'device-reveal', 'liquid-glass'].includes(asset.assetType) && renderProduct()}
            {['social-follow', 'news-ticker', 'caption-highlight'].includes(asset.assetType) && renderSocialOrText()}
            <div className="absolute bottom-2 left-3 rounded bg-black/35 px-1.5 py-0.5 text-[8px] font-bold tracking-[0.08em] text-white/80">{asset.category}</div>
        </div>
    );
}

function TransitionMotionPreview({ preset, color }) {
    const accent = TRANSITION_COLOR_MAP[color] || TRANSITION_COLOR_MAP.rose;
    const transitionLabel = {
        fade: 'FADE',
        'slide-left': 'PUSH',
        'slide-right': 'REVEAL',
        'zoom-in': 'ZOOM',
        'wipe-up': 'WIPE'
    }[preset] || 'CUT';
    return (
        <div
            className={`transition-motion-preview transition-motion-preview--${preset} relative h-14 w-24 shrink-0 overflow-hidden rounded-lg border border-white/10 bg-slate-950`}
            style={{ '--transition-preview-accent': accent }}
            aria-label="過場動態預覽"
        >
            <div className="absolute inset-0 bg-[linear-gradient(135deg,#101827_0%,#0b1220_52%,#23344e_100%)]" />
            <div className="absolute left-2 top-2 z-10 text-[6px] font-bold tracking-[0.18em] text-white/45">SCENE A</div>
            <div className="absolute bottom-2 left-2 z-10 h-1 w-8 rounded-full bg-white/25" />
            <div className="absolute right-2 top-2 z-10 text-[6px] font-bold tracking-[0.18em]" style={{ color: accent }}>{transitionLabel}</div>
            <div className="transition-preview-panel absolute inset-[7px] rounded-md shadow-[0_8px_20px_rgba(0,0,0,0.42)]" />
        </div>
    );
}

function MediaLibraryPreview({ asset }) {
    if (asset.type === 'image') {
        return <img src={asset.src} alt="" className="h-10 w-16 shrink-0 rounded-md border border-white/10 object-cover" />;
    }
    if (asset.type === 'video') {
        return <video src={asset.src} muted autoPlay loop playsInline preload="metadata" className="h-10 w-16 shrink-0 rounded-md border border-white/10 bg-slate-950 object-cover" />;
    }
    if (asset.type === 'audio') {
        return (
            <div className="audio-motion-preview flex h-10 w-16 shrink-0 items-center justify-center gap-1 rounded-md border border-teal-300/20 bg-teal-950/50 px-2" aria-label="音訊動態預覽">
                {[0, 1, 2, 3, 4].map(index => <span key={index} className="audio-motion-preview-bar w-1 rounded-full bg-teal-300" style={{ '--audio-preview-delay': `${index * -0.16}s` }} />)}
            </div>
        );
    }
    return <div className="flex h-10 w-16 shrink-0 items-center justify-center rounded-md border border-white/10 bg-slate-900 text-gray-500"><FileVideo size={15} /></div>;
}

function buildAutomationProjectSnapshot(projectState, activeSkillId, isRecording) {
    const tracks = Array.isArray(projectState?.tracks) ? projectState.tracks : [];
    const duration = Math.max(0, ...tracks.flatMap(track => (track || []).map(item => Number(item?.startAt || 0) + Number(item?.duration || 0))), ...((projectState?.subtitles || []).map(item => Number(item?.endAt || 0))), ...((projectState?.motionDesign?.manualCards || []).map(item => Number(item?.endAt || 0))));
    const activeSkill = getSkillById(activeSkillId);
    const markdown = String(projectState?.[activeSkill.markdownField] || '');
    return {
        phase: isRecording ? 'recording' : 'ready',
        skillId: activeSkillId,
        title: projectState?.articleTopic || projectState?.tutorialDescription || '',
        duration: Number(duration.toFixed(2)),
        mediaCount: tracks.flat().length,
        subtitleCount: Array.isArray(projectState?.subtitles) ? projectState.subtitles.length : 0,
        capturedFrameCount: Array.isArray(projectState?.[activeSkill.frameField]) ? projectState[activeSkill.frameField].length : 0,
        hasArticle: Boolean(markdown.trim()),
        motionDesign: projectState?.motionDesign || DEFAULT_MOTION_DESIGN,
        automationScript: projectState?.automationScript
            ? {
                id: projectState.automationScript.id,
                title: projectState.automationScript.title,
                status: projectState.automationScript.status,
                completedSteps: (projectState.automationScript.steps || []).filter(step => step.status === 'completed').length,
                stepCount: (projectState.automationScript.steps || []).length
            }
            : null,
        updatedAt: new Date().toISOString()
    };
}

export default function App() {
    const [activeSkillId, setActiveSkillId] = useState(() => {
        const saved = localStorage.getItem('openviscribe_active_skill');
        return getSkillById(saved || DEFAULT_SKILL_ID).id;
    });
    const [settings, setSettings] = useState(() => {
        const saved = localStorage.getItem('extension_settings');
        if (!saved) return DEFAULT_SETTINGS;
        const parsed = { ...DEFAULT_SETTINGS, ...JSON.parse(saved) };
        if (!parsed.lmStudioEndpoint) {
            const protocol = String(parsed.lmStudioProtocol || DEFAULT_SETTINGS.lmStudioProtocol || 'http').trim() || 'http';
            const host = String(parsed.lmStudioHost || DEFAULT_SETTINGS.lmStudioHost || '').trim();
            const port = String(parsed.lmStudioPort || DEFAULT_SETTINGS.lmStudioPort || '').trim();
            parsed.lmStudioEndpoint = `${protocol}://${host}${port ? `:${port}` : ''}`;
        } else {
            try {
                const parsedUrl = new URL(parsed.lmStudioEndpoint);
                parsed.lmStudioProtocol = parsedUrl.protocol.replace(/:$/, '') || parsed.lmStudioProtocol || DEFAULT_SETTINGS.lmStudioProtocol;
                parsed.lmStudioHost = parsedUrl.hostname || parsed.lmStudioHost || DEFAULT_SETTINGS.lmStudioHost;
                parsed.lmStudioPort = parsedUrl.port || parsed.lmStudioPort || DEFAULT_SETTINGS.lmStudioPort;
            } catch (error) {}
        }
        parsed.lmStudioTimeoutSeconds = normalizeOllamaTimeoutSeconds(parsed.lmStudioTimeoutSeconds);
        parsed.ollamaTimeoutSeconds = normalizeOllamaTimeoutSeconds(parsed.ollamaTimeoutSeconds);
        if (parsed.ollamaUseLocalhost) {
            parsed.ollamaEndpoint = LOCAL_OLLAMA_ENDPOINT;
        } else if (!parsed.ollamaCustomEndpoint) {
            parsed.ollamaCustomEndpoint = parsed.ollamaEndpoint || DEFAULT_SETTINGS.ollamaCustomEndpoint;
        }
        return parsed;
    });
    const [automationProjectId, setAutomationProjectId] = useState('');
    const pendingAutomationApprovalRef = useRef(null);
    const pendingAutomationRenderRef = useRef(null);
    const {
        bridgeState: automationBridgeState,
        reportCommandResult: reportAutomationCommandResult,
        reportSnapshot: reportAutomationSnapshot,
        setCommandHandler: setAutomationCommandHandler
    } = useAutomationBridge({
        enabled: !!settings.automationApiEnabled,
        baseUrl: settings.automationApiUrl,
        token: settings.automationApiToken,
        clientName: 'OpenViscribe Studio'
    });
    const [showSettings, setShowSettings] = useState(
        settings.aiProvider === 'azure'
            ? !(settings.azureVisionKey || settings.azureChatKey || settings.apiKey)
            : settings.aiProvider === 'gemini'
                ? !settings.apiKey
                : false
    );
    const [showHelp, setShowHelp] = useState(false);
    const [pendingScreenshotReview, setPendingScreenshotReview] = useState(null);
    const [lmStudioModelCatalog, setLmStudioModelCatalog] = useState(() => createModelCatalogState('尚未讀取 LM Studio 已安裝模型。'));
    const [ollamaModelCatalog, setOllamaModelCatalog] = useState(() => createModelCatalogState('尚未讀取 Ollama 已安裝模型。'));
    const azureVisionEndpoint = (settings.azureVisionEndpoint || settings.azureEndpoint || '').trim();
    const azureChatEndpoint = (settings.azureChatEndpoint || settings.azureEndpoint || settings.azureVisionEndpoint || '').trim();
    const azureTtsEndpoint = (settings.azureTtsEndpoint || settings.azureVisionEndpoint || settings.azureEndpoint || '').trim();
    const azureVisionKey = (settings.azureVisionKey || settings.apiKey || '').trim();
    const azureChatKey = (settings.azureChatKey || settings.azureVisionKey || settings.apiKey || '').trim();
    const azureTtsKey = (settings.azureTtsKey || settings.azureVisionKey || settings.apiKey || '').trim();
    const azureSttKey = (settings.azureSttKey || settings.azureVisionKey || settings.apiKey || '').trim();
    const azureChatDeployment = (settings.azureChatDeployment || settings.azureDeployment || '').trim();
    const lmStudioEndpoint = (settings.lmStudioEndpoint || '').trim();
    const lmStudioApiKey = (settings.lmStudioApiKey || '').trim();
    const lmStudioTimeoutSeconds = normalizeOllamaTimeoutSeconds(settings.lmStudioTimeoutSeconds);
    const lmStudioTimeoutMs = lmStudioTimeoutSeconds * 1000;
    const ollamaEndpoint = (settings.ollamaEndpoint || '').trim();
    const ollamaTimeoutSeconds = normalizeOllamaTimeoutSeconds(settings.ollamaTimeoutSeconds);
    const ollamaTimeoutMs = ollamaTimeoutSeconds * 1000;
    const subtitleProvider = getFeatureProvider(settings, 'subtitleProvider');
    const articleProvider = getFeatureProvider(settings, 'articleProvider');
    const voiceProvider = getFeatureProvider(settings, 'voiceProvider');
    const voiceoverSubtitleProvider = getFeatureProvider(settings, 'voiceoverSubtitleProvider');
    const uiDebugProvider = getFeatureProvider(settings, 'uiDebugProvider');
    const subtitleProviderLabel = getProviderLabel(subtitleProvider);
    const subtitleModelLabel = getProviderModelLabel(settings, 'subtitle');
    const articleProviderLabel = getProviderLabel(articleProvider);
    const articleModelLabel = getProviderModelLabel(settings, 'article');
    const uiDebugProviderLabel = getProviderLabel(uiDebugProvider);
    const uiDebugModelLabel = getProviderModelLabel(settings, 'ui-debug');
    const voiceProviderLabel = getProviderLabel(voiceProvider);
    const voiceModelLabel = voiceProvider === 'azure'
        ? (settings.azureTtsDeployment || '未設定 Azure TTS 部署')
        : voiceProvider === 'gemini'
            ? (settings.geminiTtsModel || '未設定 Gemini TTS 模型')
            : voiceProvider === 'lmstudio'
                ? (settings.lmStudioTtsModel || 'LM Studio TTS 尚未支援')
            : (settings.ollamaTtsModel || '未設定 Ollama TTS 模型');
    const subtitleAiLabel = `${subtitleProviderLabel} / ${subtitleModelLabel}`;
    const articleAiLabel = `${articleProviderLabel} / ${articleModelLabel}`;
    const uiDebugAiLabel = `${uiDebugProviderLabel} / ${uiDebugModelLabel}`;
    const voiceAiLabel = `${voiceProviderLabel} / ${voiceModelLabel}`;

    const sendBackgroundMessage = useCallback((message) => {
        return new Promise((resolve) => {
            try {
                if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) {
                    resolve(false);
                    return;
                }
                chrome.runtime.sendMessage(message, (response) => {
                    if (chrome.runtime.lastError) {
                        resolve(false);
                        return;
                    }
                    resolve(response?.ok !== false);
                });
            } catch (err) {
                resolve(false);
            }
        });
    }, []);

    const syncRippleSetting = useCallback(async (enabled) => {
        const nextEnabled = !!enabled;
        try {
            if (typeof chrome !== 'undefined' && chrome.storage?.local) {
                const sent = await sendBackgroundMessage({ type: 'set-click-ripple-enabled', enabled: nextEnabled });
                if (!sent) {
                    await new Promise((resolve) => chrome.storage.local.set({ clickRippleEnabled: nextEnabled }, resolve));
                }
            }
        } catch (err) {
            console.warn('sync ripple setting failed', err);
        }
    }, [sendBackgroundMessage]);

    const syncPageDebugSetting = useCallback(async (enabled, options = {}) => {
        const nextEnabled = !!enabled;
        try {
            if (typeof chrome !== 'undefined' && chrome.storage?.local) {
                const sent = await sendBackgroundMessage({
                    type: 'set-page-debug-enabled',
                    enabled: nextEnabled,
                    injectAllTabs: !!options.injectAllTabs
                });
                if (!sent) {
                    await new Promise((resolve) => chrome.storage.local.set({ pageDebugEnabled: nextEnabled }, resolve));
                }
            }
        } catch (err) {
            console.warn('sync page debug setting failed', err);
        }
    }, [sendBackgroundMessage]);

    const clearGlobalClickLog = useCallback(async () => {
        try {
            if (typeof chrome !== 'undefined' && chrome.storage?.local) {
                await new Promise((resolve) => chrome.storage.local.set({ clickEventLog: [] }, resolve));
            }
        } catch (err) {
            console.warn('clear click log failed', err);
        }
    }, []);

    const stopWebcamCapture = useCallback(() => {
        try {
            webcamStreamRef.current?.getTracks?.().forEach(track => track.stop());
        } catch (err) {
            console.warn('stop webcam failed', err);
        } finally {
            webcamStreamRef.current = null;
        }
    }, []);

    const loadGlobalClickLog = useCallback(async () => {
        // Merge projectState events (saved at recording-end) + any newer events in chrome.storage.
        // This handles the case where a new recording cleared chrome.storage but the old events
        // are still in the project state (and vice-versa).
        const projectEvents = Array.isArray(projectStateRef.current?.clickEventLog)
            ? projectStateRef.current.clickEventLog
            : [];
        let storageEvents = [];
        try {
            if (typeof chrome !== 'undefined' && chrome.storage?.local) {
                storageEvents = await new Promise((resolve) => {
                    chrome.storage.local.get({ clickEventLog: [] }, (res) => {
                        resolve(Array.isArray(res.clickEventLog) ? res.clickEventLog : []);
                    });
                });
            }
        } catch (err) {
            console.warn('load click log failed', err);
        }
        if (projectEvents.length === 0) return storageEvents;
        if (storageEvents.length === 0) return projectEvents;
        // Merge and deduplicate by id
        const seen = new Set(projectEvents.map(e => e?.id).filter(Boolean));
        const merged = [...projectEvents];
        for (const e of storageEvents) {
            if (e?.id && !seen.has(e.id)) { merged.push(e); seen.add(e.id); }
        }
        return merged;
    }, []);
    const clearGlobalDebugLog = useCallback(async () => {
        try {
            if (typeof chrome !== 'undefined' && chrome.storage?.local) {
                await new Promise((resolve) => chrome.storage.local.set({ debugEventLog: [] }, resolve));
            }
        } catch (err) {
            console.warn('clear debug log failed', err);
        }
    }, []);
    const loadGlobalDebugLog = useCallback(async () => {
        if (Array.isArray(projectStateRef.current?.debugEventLog) && projectStateRef.current.debugEventLog.length > 0) {
            return projectStateRef.current.debugEventLog;
        }
        try {
            if (typeof chrome !== 'undefined' && chrome.storage?.local) {
                return await new Promise((resolve) => {
                    chrome.storage.local.get({ debugEventLog: [] }, (res) => {
                        resolve(Array.isArray(res.debugEventLog) ? res.debugEventLog : []);
                    });
                });
            }
        } catch (err) {
            console.warn('load debug log failed', err);
        }
        return [];
    }, []);
    const appendGlobalDebugEvent = useCallback(async (payload) => {
        try {
            if (typeof chrome !== 'undefined' && chrome.storage?.local && payload) {
                const event = {
                    id: payload.id || `dbg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
                    sessionId: recordingSessionIdRef.current || '',
                    source: payload.source || 'openviscribe-ui',
                    href: window.location.href,
                    title: document.title || '',
                    timestamp: typeof payload.timestamp === 'number' ? payload.timestamp : Date.now(),
                    type: payload.type || 'console',
                    level: payload.level || 'error',
                    text: payload.text || '',
                    durationMs: Number.isFinite(Number(payload.durationMs)) ? Number(payload.durationMs) : null,
                    status: Number.isFinite(Number(payload.status)) ? Number(payload.status) : null,
                    method: payload.method || '',
                    url: payload.url || '',
                    detail: payload.detail && typeof payload.detail === 'object' ? payload.detail : null
                };
                await new Promise((resolve) => {
                    chrome.storage.local.get({ debugEventLog: [] }, (res) => {
                        const prev = Array.isArray(res.debugEventLog) ? res.debugEventLog : [];
                        const next = [...prev, event];
                        if (next.length > 12000) next.splice(0, next.length - 12000);
                        chrome.storage.local.set({ debugEventLog: next }, resolve);
                    });
                });
            }
        } catch (err) {
            console.warn('append debug log failed', err);
        }
    }, []);
    const setGlobalClickSession = useCallback(async (sessionId) => {
        try {
            if (typeof chrome !== 'undefined' && chrome.storage?.local) {
                await new Promise((resolve) => chrome.storage.local.set({ clickRippleSessionId: sessionId || '' }, resolve));
            }
        } catch (err) {
            console.warn('set click session failed', err);
        }
    }, []);

    const updateRippleEnabled = useCallback((enabled) => {
        const nextEnabled = !!enabled;
        setSettings(prev => {
            const nextSettings = { ...prev, clickRippleEnabled: nextEnabled };
            localStorage.setItem('extension_settings', JSON.stringify(nextSettings));
            return nextSettings;
        });
        void syncRippleSetting(nextEnabled);
    }, [syncRippleSetting]);
    const updateOllamaLocalhostMode = useCallback((enabled) => {
        const nextEnabled = !!enabled;
        setSettings(prev => {
            const currentEndpoint = String(prev.ollamaEndpoint || '').trim();
            const preservedCustomEndpoint = prev.ollamaUseLocalhost
                ? (prev.ollamaCustomEndpoint || DEFAULT_SETTINGS.ollamaCustomEndpoint)
                : (currentEndpoint || prev.ollamaCustomEndpoint || DEFAULT_SETTINGS.ollamaCustomEndpoint);
            const nextSettings = {
                ...prev,
                ollamaUseLocalhost: nextEnabled,
                ollamaCustomEndpoint: preservedCustomEndpoint,
                ollamaEndpoint: nextEnabled ? LOCAL_OLLAMA_ENDPOINT : preservedCustomEndpoint
            };
            localStorage.setItem('extension_settings', JSON.stringify(nextSettings));
            return nextSettings;
        });
    }, []);
    const updateOllamaEndpoint = useCallback((value) => {
        setSettings(prev => {
            const nextValue = value;
            const nextSettings = {
                ...prev,
                ollamaEndpoint: nextValue,
                ollamaCustomEndpoint: prev.ollamaUseLocalhost ? prev.ollamaCustomEndpoint : nextValue
            };
            localStorage.setItem('extension_settings', JSON.stringify(nextSettings));
            return nextSettings;
        });
    }, []);

    const refreshLmStudioModels = useCallback(async () => {
        const endpoint = String(settings.lmStudioEndpoint || '').trim();
        const apiKey = String(settings.lmStudioApiKey || '').trim();
        if (!endpoint) {
            setLmStudioModelCatalog(createModelCatalogState('請先填入 LM Studio Base URL。'));
            return;
        }

        setLmStudioModelCatalog(prev => ({
            ...prev,
            phase: 'loading',
            detail: '正在讀取 LM Studio 已安裝模型...'
        }));

        try {
            const response = await fetch(buildBaseEndpointUrl(endpoint, '/api/v1/models'), {
                headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {}
            });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok) {
                throw new Error(payload?.error?.message || payload?.message || `HTTP ${response.status}`);
            }

            const options = normalizeServerModelOptions(
                Array.isArray(payload?.models) ? payload.models : [],
                ['key', 'id', 'model']
            );

            setLmStudioModelCatalog({
                phase: 'success',
                detail: options.length
                    ? `已找到 ${options.length} 個 LM Studio 模型。`
                    : 'LM Studio 已連上，但目前沒有可用模型。',
                options
            });
        } catch (error) {
            setLmStudioModelCatalog(prev => ({
                ...prev,
                phase: 'error',
                detail: `LM Studio 模型清單讀取失敗：${String(error?.message || error)}`
            }));
        }
    }, [settings.lmStudioApiKey, settings.lmStudioEndpoint]);

    const refreshOllamaModels = useCallback(async () => {
        const endpoint = String(settings.ollamaEndpoint || '').trim();
        if (!endpoint) {
            setOllamaModelCatalog(createModelCatalogState('請先填入 Ollama Endpoint。'));
            return;
        }

        setOllamaModelCatalog(prev => ({
            ...prev,
            phase: 'loading',
            detail: '正在讀取 Ollama 已安裝模型...'
        }));

        try {
            const response = await fetch(buildOllamaApiUrl(endpoint, '/api/tags'));
            const payload = await response.json().catch(() => ({}));
            if (!response.ok) {
                throw new Error(payload?.error || payload?.message || `HTTP ${response.status}`);
            }

            const options = normalizeServerModelOptions(
                Array.isArray(payload?.models) ? payload.models : [],
                ['model', 'name']
            );

            setOllamaModelCatalog({
                phase: 'success',
                detail: options.length
                    ? `已找到 ${options.length} 個 Ollama 模型。`
                    : 'Ollama 已連上，但目前沒有已安裝模型。',
                options
            });
        } catch (error) {
            setOllamaModelCatalog(prev => ({
                ...prev,
                phase: 'error',
                detail: `Ollama 模型清單讀取失敗：${String(error?.message || error)}`
            }));
        }
    }, [settings.ollamaEndpoint]);

    useEffect(() => { document.title = "OpenViscribe"; }, []);

    useEffect(() => {
        if (!showSettings) return;
        if (settings.aiProvider === 'lmstudio') {
            void refreshLmStudioModels();
        }
        if (settings.aiProvider === 'ollama') {
            void refreshOllamaModels();
        }
    }, [showSettings, settings.aiProvider, refreshLmStudioModels, refreshOllamaModels]);

    useEffect(() => {
        localStorage.setItem('openviscribe_active_skill', activeSkillId);
    }, [activeSkillId]);

    useEffect(() => {
        const onError = (event) => {
            appendGlobalDebugEvent({
                source: 'openviscribe-ui',
                type: 'console',
                level: 'error',
                text: event?.message || 'OpenViscribe UI error',
                timestamp: Date.now(),
                detail: {
                    source: event?.filename || '',
                    lineno: event?.lineno || 0,
                    colno: event?.colno || 0
                }
            });
        };
        const onUnhandledRejection = (event) => {
            let text = 'OpenViscribe UI unhandled promise rejection';
            try {
                text = event?.reason?.message || String(event?.reason || text);
            } catch (err) {}
            appendGlobalDebugEvent({
                source: 'openviscribe-ui',
                type: 'console',
                level: 'error',
                text,
                timestamp: Date.now()
            });
        };
        window.addEventListener('error', onError);
        window.addEventListener('unhandledrejection', onUnhandledRejection);
        return () => {
            window.removeEventListener('error', onError);
            window.removeEventListener('unhandledrejection', onUnhandledRejection);
        };
    }, [appendGlobalDebugEvent]);

    useEffect(() => {
        try {
            if (typeof chrome !== 'undefined' && chrome.storage?.local) {
                chrome.storage.local.get(['clickRippleEnabled'], (res) => {
                    if (typeof res?.clickRippleEnabled === 'boolean') {
                        setSettings(prev => ({ ...prev, clickRippleEnabled: res.clickRippleEnabled }));
                    } else {
                        chrome.storage.local.set({ clickRippleEnabled: !!settings.clickRippleEnabled });
                    }
                });
            }
        } catch (err) {
            console.warn('load ripple setting failed', err);
        }
    }, []);

    const [isRecording, setIsRecording] = useState(false);
    const mediaRecorderRef = useRef(null);
    const recordedChunksRef = useRef([]);
    const streamRef = useRef(null);
    const recordingPreviewCanvasRef = useRef(null);
    const recordingPreviewAnimationRef = useRef(0);
    const recordingPreviewSourcesRef = useRef({
        screenVideo: null,
        webcamVideo: null,
        eyeBoxesRef: null,
        faceBoxRef: null
    });
    const webcamStreamRef = useRef(null);
    const recordingCompositeCleanupRef = useRef(null);
    const recordingSourceStreamsRef = useRef([]);
    const recordingAudioContextRef = useRef(null);
    const recordStartTimeRef = useRef(0);
    const recordEndTimeRef = useRef(0);
    const recordingSessionIdRef = useRef('');
    const cleanupRecordingUi = useCallback(() => {
        setIsRecording(false);
        if (recordingPreviewAnimationRef.current) {
            cancelAnimationFrame(recordingPreviewAnimationRef.current);
            recordingPreviewAnimationRef.current = 0;
        }
        recordingPreviewSourcesRef.current = {
            screenVideo: null,
            webcamVideo: null,
            eyeBoxesRef: null,
            faceBoxRef: null
        };
        mediaRecorderRef.current = null;
        streamRef.current = null;
        webcamStreamRef.current = null;
        recordingCompositeCleanupRef.current?.();
        recordingCompositeCleanupRef.current = null;
        recordingSourceStreamsRef.current = [];
        if (recordingAudioContextRef.current) {
            recordingAudioContextRef.current.close().catch(() => { });
            recordingAudioContextRef.current = null;
        }
    }, []);

    const [projectState, setProjectStateState] = useState(createEmptyProjectState);
    const undoStackRef = useRef([]);
    const redoStackRef = useRef([]);
    const dragHistorySnapshotRef = useRef(null);
    const canvasHistorySnapshotRef = useRef(null);
    const [canUndo, setCanUndo] = useState(false);
    const [canRedo, setCanRedo] = useState(false);

    const projectStateRef = useRef(projectState);
    useEffect(() => { projectStateRef.current = projectState; }, [projectState]);
    const getAutomationSnapshot = useCallback(() => (
        buildAutomationProjectSnapshot(projectStateRef.current, activeSkillId, isRecording)
    ), [activeSkillId, isRecording]);
    useEffect(() => {
        if (!isRecording) return;
        const canvas = recordingPreviewCanvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const drawPreviewFrame = () => {
            const { screenVideo, webcamVideo, eyeBoxesRef, faceBoxRef } = recordingPreviewSourcesRef.current;
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = '#000000';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            if (screenVideo) {
                try {
                    if (screenVideo.paused) void screenVideo.play().catch(() => { });
                    ctx.drawImage(screenVideo, 0, 0, canvas.width, canvas.height);
                } catch (err) { }
            }
            if (webcamVideo) {
                const webcamWidth = Math.round(canvas.width * 0.22);
                const webcamHeight = Math.round(webcamWidth * 9 / 16);
                const margin = Math.round(canvas.width * 0.02);
                const x = canvas.width - webcamWidth - margin;
                const y = canvas.height - webcamHeight - margin;
                ctx.save();
                ctx.shadowColor = 'rgba(0, 0, 0, 0.35)';
                ctx.shadowBlur = 18;
                ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
                ctx.strokeStyle = 'rgba(103, 232, 249, 0.85)';
                ctx.lineWidth = 4;
                ctx.beginPath();
                ctx.roundRect(x, y, webcamWidth, webcamHeight, 20);
                ctx.fill();
                ctx.stroke();
                ctx.clip();
                try {
                    if (webcamVideo.paused) void webcamVideo.play().catch(() => { });
                    ctx.drawImage(webcamVideo, x, y, webcamWidth, webcamHeight);
                } catch (err) { }
                const eyeBoxes = eyeBoxesRef?.current || [];
                const faceBox = faceBoxRef?.current || null;
                const scaleX = webcamVideo.videoWidth ? webcamWidth / webcamVideo.videoWidth : 1;
                const scaleY = webcamVideo.videoHeight ? webcamHeight / webcamVideo.videoHeight : 1;
                ctx.strokeStyle = 'rgba(74, 222, 128, 0.95)';
                ctx.lineWidth = 2.5;
                if (eyeBoxes.length > 0) {
                    eyeBoxes.forEach((box) => {
                        ctx.strokeRect(
                            x + box.x * scaleX,
                            y + box.y * scaleY,
                            Math.max(22, box.width * scaleX),
                            Math.max(16, box.height * scaleY)
                        );
                    });
                } else if (faceBox) {
                    const eyeY = y + faceBox.y * scaleY + Math.max(8, faceBox.height * scaleY * 0.18);
                    const eyeWidth = Math.max(28, faceBox.width * scaleX * 0.24);
                    const eyeHeight = Math.max(18, faceBox.height * scaleY * 0.12);
                    const leftX = x + faceBox.x * scaleX + faceBox.width * scaleX * 0.16;
                    const rightX = x + faceBox.x * scaleX + faceBox.width * scaleX * 0.58;
                    ctx.strokeRect(leftX, eyeY, eyeWidth, eyeHeight);
                    ctx.strokeRect(rightX, eyeY, eyeWidth, eyeHeight);
                } else {
                    const guideY = y + webcamHeight * 0.26;
                    const guideW = webcamWidth * 0.22;
                    const guideH = webcamHeight * 0.12;
                    ctx.strokeRect(x + webcamWidth * 0.24, guideY, guideW, guideH);
                    ctx.strokeRect(x + webcamWidth * 0.54, guideY, guideW, guideH);
                }
                ctx.restore();
                ctx.fillStyle = 'rgba(8, 51, 68, 0.88)';
                ctx.fillRect(x + 12, y + 12, 156, 28);
                ctx.fillStyle = '#ecfeff';
                ctx.font = '600 16px sans-serif';
                ctx.fillText('User Cam / Eye', x + 24, y + 31);
            }
            recordingPreviewAnimationRef.current = requestAnimationFrame(drawPreviewFrame);
        };

        recordingPreviewAnimationRef.current = requestAnimationFrame(drawPreviewFrame);
        return () => {
            if (recordingPreviewAnimationRef.current) {
                cancelAnimationFrame(recordingPreviewAnimationRef.current);
                recordingPreviewAnimationRef.current = 0;
            }
        };
    }, [isRecording]);
    const syncHistoryAvailability = useCallback(() => {
        setCanUndo(undoStackRef.current.length > 0);
        setCanRedo(redoStackRef.current.length > 0);
    }, []);
    const setProjectState = useCallback((updater, options = {}) => {
        const { recordHistory = true } = options;
        setProjectStateState(prev => {
            const previousSnapshot = cloneProjectSnapshot(prev);
            const next = typeof updater === 'function' ? updater(prev) : updater;
            if (next === prev) return prev;
            if (recordHistory) {
                undoStackRef.current.push(previousSnapshot);
                if (undoStackRef.current.length > HISTORY_LIMIT) {
                    undoStackRef.current.shift();
                }
                redoStackRef.current = [];
                syncHistoryAvailability();
            }
            return next;
        });
    }, [syncHistoryAvailability]);
    const resetProjectHistory = useCallback(() => {
        undoStackRef.current = [];
        redoStackRef.current = [];
        syncHistoryAvailability();
    }, [syncHistoryAvailability]);
    const pushUndoSnapshot = useCallback((snapshot) => {
        undoStackRef.current.push(cloneProjectSnapshot(snapshot));
        if (undoStackRef.current.length > HISTORY_LIMIT) {
            undoStackRef.current.shift();
        }
        redoStackRef.current = [];
        syncHistoryAvailability();
    }, [syncHistoryAvailability]);
    const handleUndo = useCallback(() => {
        if (undoStackRef.current.length === 0) return;
        const previousSnapshot = undoStackRef.current.pop();
        redoStackRef.current.push(cloneProjectSnapshot(projectStateRef.current));
        syncHistoryAvailability();
        setSelectedIds([]);
        setProjectStateState(previousSnapshot);
    }, [syncHistoryAvailability]);
    const handleRedo = useCallback(() => {
        if (redoStackRef.current.length === 0) return;
        const nextSnapshot = redoStackRef.current.pop();
        undoStackRef.current.push(cloneProjectSnapshot(projectStateRef.current));
        syncHistoryAvailability();
        setSelectedIds([]);
        setProjectStateState(nextSnapshot);
    }, [syncHistoryAvailability]);

    const totalDuration = useMemo(() => {
        let maxD = 0;
        projectState.tracks.forEach(track => track.forEach(clip => {
            if (clip.startAt + clip.duration > maxD) maxD = clip.startAt + clip.duration;
        }));
        (projectState.videoTransitions || []).forEach(track => track.forEach(item => {
            if (item.startAt + item.duration > maxD) maxD = item.startAt + item.duration;
        }));
        projectState.audioTracks.forEach(track => track.forEach(audio => {
            if (audio.startAt + audio.duration > maxD) maxD = audio.startAt + audio.duration;
        }));
        projectState.subtitles.forEach(sub => {
            if (sub.endAt > maxD) maxD = sub.endAt;
        });
        (projectState.subtitleTransitions || []).forEach(item => {
            if (item.startAt + item.duration > maxD) maxD = item.startAt + item.duration;
        });
        (projectState.motionDesign?.manualCards || []).forEach(card => {
            if (Number(card?.endAt) > maxD) maxD = Number(card.endAt);
        });
        return maxD;
    }, [projectState.tracks, projectState.videoTransitions, projectState.audioTracks, projectState.subtitles, projectState.subtitleTransitions, projectState.motionDesign?.manualCards]);

    const [currentTime, setCurrentTime] = useState(0);
    const [isPlaying, setIsPlaying] = useState(false);

    const motionDesign = useMemo(
        () => getMotionDesignSettings(projectState.motionDesign),
        [projectState.motionDesign]
    );
    const motionDesignFallbackTitle = useMemo(() => (
        projectState.articleTopic
        || projectState.tutorialDescription
        || projectState.tracks.flat().find(item => item?.name)?.name
        || 'Untitled Tutorial'
    ), [projectState.articleTopic, projectState.tutorialDescription, projectState.tracks]);
    const motionDesignCopy = useMemo(
        () => getMotionDesignCopy(motionDesign, { fallbackTitle: motionDesignFallbackTitle, fallbackCreator: 'OPEN VISCRIBE' }),
        [motionDesign, motionDesignFallbackTitle]
    );
    const motionDesignLayers = useMemo(
        () => getMotionDesignLayers({ design: motionDesign, time: currentTime, duration: totalDuration, subtitles: projectState.subtitles }),
        [motionDesign, currentTime, totalDuration, projectState.subtitles]
    );

    const [selectedIds, setSelectedIds] = useState([]);
    const [activeSubtitleTrackIndex, setActiveSubtitleTrackIndex] = useState(0);
    const subtitlesByTrack = useMemo(
        () => SUBTITLE_TRACKS.map((_, trackIndex) => projectState.subtitles.filter(sub => normalizeSubtitle(sub).trackIndex === trackIndex).map(normalizeSubtitle)),
        [projectState.subtitles]
    );
    const currentMissingMediaCount = useMemo(
        () => getProjectMissingMediaCount(projectState),
        [projectState]
    );
    const highlightSubtitles = subtitlesByTrack[1] || [];
    const compositeSegmentItems = useMemo(
        () => Array.isArray(projectState.compositeTutorialReport?.segments) && projectState.compositeTutorialReport.segments.length > 0
            ? projectState.compositeTutorialReport.segments
            : (Array.isArray(projectState.compositeSubtitleAnalysis) ? projectState.compositeSubtitleAnalysis : []),
        [projectState.compositeTutorialReport, projectState.compositeSubtitleAnalysis]
    );
    const compositeSummary = useMemo(() => {
        const segments = compositeSegmentItems;
        if (!segments.length) return null;
        const pipImportantCount = segments.filter(item => {
            const relevance = normalizePipRelevance(item?.pip_relevance);
            return relevance === 'critical' || relevance === 'supporting';
        }).length;
        const liveActionCount = segments.filter(item => normalizeSceneType(item?.scene_type) === 'live_action').length;
        const pipCount = segments.filter(item => normalizeSceneType(item?.scene_type) === 'screen_recording_with_pip').length;
        return {
            segmentCount: segments.length,
            pipImportantCount,
            liveActionCount,
            pipCount,
            title: projectState.compositeTutorialReport?.doc?.title || '',
            overview: projectState.compositeTutorialReport?.doc?.overview || ''
        };
    }, [compositeSegmentItems, projectState.compositeTutorialReport]);
    const aiSubtitleTimelineWarning = useMemo(
        () => getAiSubtitleTimelineWarning(projectState),
        [projectState.tracks, projectState.videoTransitions, projectState.aiSubtitleTimelineSnapshot]
    );
    const subtitleIds = useMemo(() => (subtitlesByTrack[activeSubtitleTrackIndex] || []).map(s => s.id), [subtitlesByTrack, activeSubtitleTrackIndex]);
    const subtitleTransitionsByTrack = useMemo(
        () => SUBTITLE_TRACKS.map((_, trackIndex) => (projectState.subtitleTransitions || []).filter(item => (Number.isInteger(item?.trackIndex) ? item.trackIndex : 1) === trackIndex)),
        [projectState.subtitleTransitions]
    );
    const areAllSubtitlesSelectedByTrack = useMemo(
        () => SUBTITLE_TRACKS.map((_, trackIndex) => {
            const ids = (subtitlesByTrack[trackIndex] || []).map(sub => sub.id);
            return ids.length > 0 && ids.every(id => selectedIds.includes(id));
        }),
        [subtitlesByTrack, selectedIds]
    );
    const transitionLibraryItems = useMemo(
        () => createBuiltInTransitionAssets(),
        []
    );
    const mediaLibraryItems = useMemo(
        () => projectState.assets,
        [projectState.assets]
    );

    const [isLibraryOpen, setIsLibraryOpen] = useState(true);
    const [leftPanelWidth, setLeftPanelWidth] = useState(288);
    const [libraryWidth, setLibraryWidth] = useState(460);
    const [isResizingLeftPanel, setIsResizingLeftPanel] = useState(false);
    const [isResizingLibrary, setIsResizingLibrary] = useState(false);
    const [libraryTab, setLibraryTab] = useState('transitions');
    const [manualCardText, setManualCardText] = useState('');
    const addManualLowerThird = useCallback((presetId = motionDesign.presetId) => {
        const subtitleAtPlayhead = projectState.subtitles
            .filter(item => currentTime >= Number(item?.startAt || 0) && currentTime <= Number(item?.endAt || 0))
            .sort((a, b) => Number(b?.startAt || 0) - Number(a?.startAt || 0))[0];
        const text = manualCardText.trim() || String(subtitleAtPlayhead?.text || '').trim() || '輸入這段影片的重點';
        const startAt = Math.max(0, Number(currentTime.toFixed(2)));
        const endAt = Number(Math.max(startAt + 0.5, Math.min(totalDuration || startAt + motionDesign.cardDuration, startAt + motionDesign.cardDuration)).toFixed(2));
        const newCard = {
            id: `manual_card_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
            text,
            creator: motionDesign.creator,
            presetId,
            startAt,
            endAt
        };
        setProjectState(prev => ({
            ...prev,
            motionDesign: {
                ...DEFAULT_MOTION_DESIGN,
                ...(prev.motionDesign || {}),
                manualCards: [...(prev.motionDesign?.manualCards || []), newCard]
            }
        }));
        setManualCardText('');
    }, [currentTime, manualCardText, motionDesign.cardDuration, motionDesign.creator, motionDesign.presetId, projectState.subtitles, setProjectState, totalDuration]);
    const addHyperframeAsset = useCallback((asset) => {
        const startAt = Math.max(0, Number(currentTime.toFixed(2)));
        const duration = Math.max(0.8, Math.min(10, Number(asset.duration) || 4));
        const endAt = Number(Math.max(startAt + 0.5, Math.min(totalDuration || startAt + duration, startAt + duration)).toFixed(2));
        const newAssetLayer = {
            id: `hyperframe_asset_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
            text: asset.nameZh,
            creator: 'HYPERFRAMES',
            presetId: asset.presetId || motionDesign.presetId,
            assetId: asset.id,
            startAt,
            endAt
        };
        setProjectState(prev => ({
            ...prev,
            motionDesign: {
                ...DEFAULT_MOTION_DESIGN,
                ...(prev.motionDesign || {}),
                manualCards: [...(prev.motionDesign?.manualCards || []), newAssetLayer]
            }
        }));
    }, [currentTime, motionDesign.presetId, setProjectState, totalDuration]);
    const applyAutomaticContents = useCallback((briefOverride = '') => {
        const context = [
            briefOverride,
            projectState.articleTopic,
            projectState.tutorialDescription,
            ...(projectState.automationScript?.steps || []).map(step => `${step.instruction || ''} ${step.expected || ''}`)
        ].join(' ').toLowerCase();
        const matchingRules = [
            { assetId: 'hf-world-map', terms: ['global', 'world', 'region', '跨區', '全球', '地圖', '部署', '節點'], reason: '用地圖說明跨區範圍或節點關係' },
            { assetId: 'hf-console', terms: ['console', 'terminal', 'cli', 'command', '指令', '終端機', '部署', 'health'], reason: '用終端機呈現可驗證的技術操作結果' },
            { assetId: 'hf-code-diff', terms: ['diff', 'pr', 'release', '版本', '差異', '程式碼'], reason: '用差異視圖說明程式變更' },
            { assetId: 'hf-data-chart', terms: ['metric', 'growth', 'data', 'chart', '數據', '成長', '圖表'], reason: '用圖表呈現可比較的數據' },
            { assetId: 'hf-flowchart', terms: ['flow', 'process', 'workflow', '流程', '步驟'], reason: '用流程圖整理多步驟邏輯' },
            { assetId: 'hf-device-reveal', terms: ['mobile', 'iphone', 'app', '手機', '行動'], reason: '用裝置畫面聚焦行動端操作' },
            { assetId: 'hf-app-showcase', terms: ['product', 'dashboard', 'ui', '介面', '後台', '功能'], reason: '用產品畫面聚焦功能介面' }
        ];
        const selectedRules = matchingRules.filter(rule => rule.terms.some(term => context.includes(term))).slice(0, 2);
        const selectedAssets = selectedRules
            .map(rule => ({ ...rule, asset: HYPERFRAME_ASSETS.find(asset => asset.id === rule.assetId) }))
            .filter(item => item.asset);
        if (!selectedAssets.length) return [];

        const safeDuration = Math.max(12, Number(totalDuration) || 24);
        const generatedCards = selectedAssets.map(({ asset, reason }, index) => {
            const duration = Math.max(0.8, Math.min(10, Number(asset.duration) || 4));
            const desiredStart = safeDuration * (index === 0 ? 0.3 : 0.62);
            const startAt = Number(Math.max(3, Math.min(Math.max(3, safeDuration - duration - 2), desiredStart)).toFixed(2));
            return {
                id: `auto_contents_${asset.id}`,
                text: asset.nameZh,
                creator: `CONTENTS · ${reason}`,
                presetId: asset.presetId || motionDesign.presetId,
                assetId: asset.id,
                startAt,
                endAt: Number(Math.min(safeDuration - 1, startAt + duration).toFixed(2)),
                source: 'auto-contents'
            };
        });
        setProjectState(prev => ({
            ...prev,
            motionDesign: {
                ...DEFAULT_MOTION_DESIGN,
                ...(prev.motionDesign || {}),
                manualCards: [
                    ...(prev.motionDesign?.manualCards || []).filter(card => card?.source !== 'auto-contents'),
                    ...generatedCards
                ]
            }
        }));
        return generatedCards.map(card => ({ assetId: card.assetId, reason: card.creator.replace('CONTENTS · ', '') }));
    }, [motionDesign.presetId, projectState.articleTopic, projectState.automationScript?.steps, projectState.tutorialDescription, setProjectState, totalDuration]);
    const createDeploymentHyperframeDemo = useCallback(() => {
        const demoCards = [
            { id: 'demo_world_map', text: '全球節點與區域流向', creator: 'DEPLOYMENT / MAP', presetId: 'signal', assetId: 'hf-world-map', startAt: 3.0, endAt: 7.5 },
            { id: 'demo_console', text: '部署指令與健康檢查', creator: 'DEPLOYMENT / CONSOLE', presetId: 'signal', assetId: 'hf-console', startAt: 7.8, endAt: 12.2 }
        ];
        setProjectState(prev => ({
            ...prev,
            articleTopic: '全球部署教學：從區域選擇到健康檢查',
            tutorialDescription: '示範如何規劃跨區部署，確認服務節點，並透過終端機完成部署與健康檢查。',
            motionDesign: {
                ...DEFAULT_MOTION_DESIGN,
                ...(prev.motionDesign || {}),
                enabled: false,
                aiAutoEnabled: false,
                hyperframeTemplateId: 'hf-dev-release',
                presetId: 'signal',
                title: '全球部署教學',
                creator: 'OPEN VISCRIBE DEMO',
                manualIntroEnabled: true,
                manualOutroEnabled: false,
                introDuration: 2.6,
                manualCards: demoCards
            }
        }));
        setCurrentTime(0);
        setIsPlaying(false);
    }, [setProjectState]);
    const removeManualLowerThird = useCallback((cardId) => {
        setProjectState(prev => ({
            ...prev,
            motionDesign: {
                ...DEFAULT_MOTION_DESIGN,
                ...(prev.motionDesign || {}),
                manualCards: (prev.motionDesign?.manualCards || []).filter(card => card.id !== cardId)
            }
        }));
    }, [setProjectState]);
    const {
        aiLoading,
        setAiLoading,
        aiProgress,
        setAiProgress,
        activeAiTask,
        setActiveAiTask,
        aiSubtitleStatus,
        setAiSubtitleStatus,
        articleStatus,
        setArticleStatus,
        ttsStatus,
        setTtsStatus,
        uiDebugStatus,
        setUiDebugStatus,
        uxResearchStatus,
        setUxResearchStatus,
        beginAiTask,
        finishAiTask,
        cancelAiTask,
        resetDerivedStatusesFromProject,
        updateAiSubtitleStatus,
        updateArticleStatus,
        updateTtsStatus,
        updateUiDebugStatus,
        updateUxResearchStatus,
        aiSubtitleStatusClasses,
        articleStatusClasses,
        ttsStatusClasses,
        uiDebugStatusClasses,
        uxResearchStatusClasses,
        aiSubtitleUpdatedLabel,
        articleUpdatedLabel,
        ttsUpdatedLabel,
        uiDebugUpdatedLabel,
        uxResearchUpdatedLabel,
        activeProgressStatus,
        activeProgressPercent,
        hasStructuredProgress,
        activeProgressLabel,
        activeTaskAccent,
        renderTaskProgress
    } = useAiTaskState({ createAiTaskCancelledError });
    const [ollamaTestState, setOllamaTestState] = useState({
        vision: { phase: 'idle', detail: '' },
        chat: { phase: 'idle', detail: '' },
        tts: { phase: 'idle', detail: '' },
        stt: { phase: 'idle', detail: '' }
    });
    const [lmStudioTestState, setLmStudioTestState] = useState({
        vision: { phase: 'idle', detail: '' },
        chat: { phase: 'idle', detail: '' }
    });
    const [statusPanels, setStatusPanels] = useState({
        subtitle: false,
        article: false,
        voice: false,
        debug: true,
        uxResearch: true,
        thresholds: false
    });
    const [isScrubbing, setIsScrubbing] = useState(false);

    const [selectionBox, setSelectionBox] = useState(null);
    const dragRef = useRef(null);

    const [trackState, setTrackState] = useState({
        subtitleHidden: [false, false],
        audioMuted: false,
        bgmMuted: false,
        videoHidden: [false, false, false]
    });

    const trackStateRef = useRef(trackState);
    useEffect(() => { trackStateRef.current = trackState; }, [trackState]);

    const [showExportModal, setShowExportModal] = useState(false);
    const [showRecordingModal, setShowRecordingModal] = useState(false);
    const [recordingOptions, setRecordingOptions] = useState({
        includeAudio: false,
        includeWebcam: false
    });

    const [exportSettings, setExportSettings] = useState({
        renderVideo: true,
        rawMedia: false,
        includeMarkdown: true,
        includeSubtitles: false,
        includeAudio: false,
        projectJson: false
    });

    const exportCanvasRef = useRef(null);
    const exportDirectoryRef = useRef(null);
    const isRenderingRef = useRef(false);
    const renderRecorderRef = useRef(null);
    const renderVideoTrackRef = useRef(null);
    const renderChunksRef = useRef([]);
    const audioCtxRef = useRef(null);
    const audioDestRef = useRef(null);
    const renderTimeRef = useRef(0);
    const renderAccumulatorRef = useRef(0);
    const renderLastTickRef = useRef(0);

    const videoRefs = useRef({});
    const audioRefs = useRef({});
    const imageRefs = useRef({});
    const audioPreviewStateRef = useRef({});
    const isPlayingRef = useRef(false);
    const isScrubbingRef = useRef(isScrubbing);
    const previewContainerRef = useRef(null);
    const [canvasDrag, setCanvasDrag] = useState(null);

    const [timelineHeight, setTimelineHeight] = useState(() => getDefaultTimelineHeight());
    const [timelineZoom, setTimelineZoom] = useState(1);
    const [isResizingTimeline, setIsResizingTimeline] = useState(false);

    const animationRef = useRef(null);

    useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);
    useEffect(() => { isScrubbingRef.current = isScrubbing; }, [isScrubbing]);

    const timelineRef = useRef(null);
    const timelineLeftPanelRef = useRef(null);
    const timelineZoomAnchorRef = useRef(null);
    const fileInputRef = useRef(null);
    const importProjectRef = useRef(null);
    const pixelsPerSecond = BASE_PIXELS_PER_SECOND * timelineZoom;

    const applyTimelineZoom = useCallback((nextZoom, anchorTime = currentTime, viewportX = null) => {
        const clampedZoom = clamp(nextZoom, MIN_TIMELINE_ZOOM, MAX_TIMELINE_ZOOM);
        const el = timelineRef.current;
        timelineZoomAnchorRef.current = {
            anchorTime,
            viewportX: viewportX ?? (el ? el.clientWidth / 2 : 0)
        };
        setTimelineZoom(clampedZoom);
    }, [currentTime]);
    useEffect(() => {
        const handleClick = (e) => {
            showClickRipple(e.clientX, e.clientY);
        };
        if (!settings.clickRippleEnabled) return;
        window.addEventListener('click', handleClick, true);
        return () => window.removeEventListener('click', handleClick, true);
    }, [settings.clickRippleEnabled]);

    useEffect(() => {
        const pendingAnchor = timelineZoomAnchorRef.current;
        if (!pendingAnchor || !timelineRef.current) return;

        timelineRef.current.scrollLeft = Math.max(
            0,
            pendingAnchor.anchorTime * pixelsPerSecond + TIMELINE_OFFSET - pendingAnchor.viewportX
        );
        timelineZoomAnchorRef.current = null;
    }, [pixelsPerSecond]);

    useEffect(() => {
        const loadDraft = async () => {
            const draft = localStorage.getItem('wilson_project_draft');
            if (draft) {
                try {
                    const parsed = sanitizeImportedTimelineOffsets(
                        sanitizeImportedRecordingRange(normalizeProjectState(JSON.parse(draft)))
                    );
                    await rehydrateProjectMedia(parsed);
                    resetProjectHistory();
                    const restoredProject = { ...parsed, capturedFrames: [], uiDebugFrames: [], uxResearchFrames: [] };
                    setProjectState(restoredProject, { recordHistory: false });
                    setSelectedIds([]);
                    resetDerivedStatusesFromProject(restoredProject, 'draft');
                } catch (e) {
                    console.warn("還原暫存失敗", e);
                }
            }
        };
        loadDraft();
    }, [resetDerivedStatusesFromProject, resetProjectHistory]);

    const handleDeleteItem = useCallback(() => {
        if (selectedIds.length === 0) return;
        setProjectState(prev => ({
            ...prev,
            tracks: prev.tracks.map(t => t.filter(c => !selectedIds.includes(c.id))),
            videoTransitions: (prev.videoTransitions || [[], [], []]).map(t => t.filter(item => !selectedIds.includes(item.id))),
            audioTracks: prev.audioTracks.map(t => t ? t.filter(a => !selectedIds.includes(a.id)) : []),
            subtitles: prev.subtitles.filter(s => !selectedIds.includes(s.id)),
            subtitleTransitions: (prev.subtitleTransitions || []).filter(item => !selectedIds.includes(item.id))
        }));
        setSelectedIds([]);
    }, [selectedIds]);

    useEffect(() => {
        const handleKeyDown = (e) => {
            if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;
            if (e.key === ' ') {
                e.preventDefault();
                if (totalDuration === 0) return;
                if (!isPlaying && currentTime >= totalDuration) {
                    setCurrentTime(0);
                }
                setIsPlaying(prev => !prev);
            } else if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === 'z') {
                e.preventDefault();
                handleUndo();
            } else if (((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'z') || (e.ctrlKey && e.key.toLowerCase() === 'y')) {
                e.preventDefault();
                handleRedo();
            } else if ((e.metaKey || e.ctrlKey) && e.key === 'b') {
                e.preventDefault();
                splitClipAtPlayhead();
            } else if (e.key === 'Backspace' || e.key === 'Delete') {
                e.preventDefault();
                handleDeleteItem();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [currentTime, isPlaying, totalDuration, handleDeleteItem, handleRedo, handleUndo]);

    const saveDraft = async () => {
        try {
            const clickEventLog = await loadGlobalClickLog();
            const debugEventLog = await loadGlobalDebugLog();
            const saveableState = {
                ...projectState,
                clickEventLog,
                debugEventLog,
                tracks: projectState.tracks.map(t => t.map(c => ({ ...c, src: '' }))),
                audioTracks: projectState.audioTracks.map(t => t ? t.map(a => ({ ...a, src: '' })) : []),
                assets: projectState.assets.map(a => ({ ...a, src: '' })),
                capturedFrames: [],
                uiDebugFrames: [],
                uxResearchFrames: []
            };
            localStorage.setItem('wilson_project_draft', JSON.stringify(saveableState));
            alert('✅ 專案已暫存！不小心重新整理網頁也會自動還原。');
        } catch (e) {
            console.error(e);
            alert('❌ 暫存失敗！專案檔案過大或瀏覽器容量受限。\n請使用「匯出選項 -> 打包專案原始檔」來備份到電腦中。');
        }
    };

    const clearDraft = useCallback(() => {
        if (confirm('確定要清空暫存嗎？這將會清除當前進度與所有素材。')) {
            localStorage.removeItem('wilson_project_draft');
            resetProjectHistory();
            setProjectState(createEmptyProjectState(), { recordHistory: false });
            setSelectedIds([]);
            setAiSubtitleStatus(createInitialAiSubtitleStatus());
            setArticleStatus(createInitialArticleStatus());
            setTtsStatus(createInitialTtsStatus());
            setUiDebugStatus(createInitialUiDebugStatus());
            setUxResearchStatus(createInitialUxResearchStatus());
            try { indexedDB.deleteDatabase('WilsonEditorDB'); } catch (e) { }
        }
    }, [resetProjectHistory, setUxResearchStatus]);

    const openRecordingModal = () => {
        setRecordingOptions({
            includeAudio: !!settings.includeAudio,
            includeWebcam: activeSkillId === 'ux-research' && projectState.uxResearchAutoWebcam !== false
        });
        setShowRecordingModal(true);
    };

    const startRecording = async (options = {}) => {
        const includeAudio = !!options.includeAudio;
        const includeWebcam = !!options.includeWebcam;
        const requireRealCapture = !!options.requireRealCapture;
        const needsPageDebugRecording = activeSkillId === 'ui-debug' || activeSkillId === 'ux-research';
        const needsClickSession = settings.clickRippleEnabled; // track clicks for any skill when ripple is enabled
        try {
            const newSessionId = `rec_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
            recordingSessionIdRef.current = newSessionId;
            if (needsClickSession) {
                // Re-inject the content script across all tabs so it is guaranteed to be
                // running (and has the latest rippleEnabled=true) when recording begins.
                await sendBackgroundMessage({ type: 'set-click-ripple-enabled', enabled: true });
                await setGlobalClickSession(newSessionId);
                await clearGlobalClickLog();
            } else {
                await setGlobalClickSession('');
            }
            if (needsPageDebugRecording) {
                await syncPageDebugSetting(true, { injectAllTabs: true });
                await clearGlobalDebugLog();
            } else {
                await syncPageDebugSetting(false);
            }
            const displayMediaOptions = {
                video: {
                    displaySurface: 'browser',
                    cursor: 'never',
                    width: settings.resolution === '1080p' ? 1920 : 1280,
                    height: settings.resolution === '1080p' ? 1080 : 720,
                    frameRate: { ideal: RENDER_FPS, max: RENDER_FPS }
                },
                audio: includeAudio
            };
            let stream;
            try {
                stream = await navigator.mediaDevices.getDisplayMedia(displayMediaOptions);
            } catch (mediaErr) {
                if (requireRealCapture) {
                    throw new Error('未取得真實畫面分享權限；腳本教學不會改用模擬錄影。');
                }
                alert("預覽環境受限，無法真實錄影。\n已啟動「模擬錄影」模式！");
                const canvas = document.createElement('canvas');
                canvas.width = settings.resolution === '1080p' ? 1920 : 1280;
                canvas.height = settings.resolution === '1080p' ? 1080 : 720;
                const ctx = canvas.getContext('2d');
                let frame = 0;
                const drawMock = () => {
                    ctx.fillStyle = '#0f172a'; ctx.fillRect(0, 0, canvas.width, canvas.height);
                    ctx.fillStyle = '#334155'; ctx.fillRect(0, 0, canvas.width, 60);
                    ctx.fillStyle = '#e2e8f0'; ctx.font = 'bold 40px sans-serif';
                    ctx.fillText('模擬操作畫面 (Mock Recording)', canvas.width / 2 - 300, canvas.height / 2 - 50);
                    const mouseX = canvas.width / 2 + Math.sin(frame / 20) * 250;
                    const mouseY = canvas.height / 2 + Math.cos(frame / 30) * 150 + 50;
                    ctx.fillStyle = 'white'; ctx.beginPath(); ctx.moveTo(mouseX, mouseY);
                    ctx.lineTo(mouseX + 15, mouseY + 40); ctx.lineTo(mouseX + 25, mouseY + 25);
                    ctx.lineTo(mouseX + 45, mouseY + 30); ctx.closePath(); ctx.fill();
                    frame++; stream.mockAnimationId = requestAnimationFrame(drawMock);
                };
                stream = canvas.captureStream(30); drawMock();
            }

            const sourceStreams = [stream];
            let webcamStream = null;
            let micStream = null;
            if (includeAudio) {
                try {
                    micStream = await navigator.mediaDevices.getUserMedia({
                        audio: {
                            echoCancellation: false,
                            noiseSuppression: false,
                            autoGainControl: false
                        }
                    });
                    sourceStreams.push(micStream);
                } catch (micErr) {
                    console.warn('microphone capture failed', micErr);
                    alert('麥克風權限未開啟或無法使用，將只錄製畫面分享本身的音訊。');
                }
            }

            if (includeWebcam) {
                try {
                    webcamStream = await navigator.mediaDevices.getUserMedia({
                        video: {
                            width: { ideal: 640 },
                            height: { ideal: 360 },
                            facingMode: 'user'
                        },
                        audio: false
                    });
                    webcamStreamRef.current = webcamStream;
                    sourceStreams.push(webcamStream);
                } catch (webcamErr) {
                    console.warn('webcam capture failed', webcamErr);
                    alert('Webcam 權限未開啟或無法使用，這次錄影會略過鏡頭畫面。');
                }
            }

            let recordingStream = stream;
            if (includeAudio) {
                const mixedStream = new MediaStream(stream.getVideoTracks());
                const allAudioTracks = sourceStreams.flatMap(item => item.getAudioTracks());
                if (allAudioTracks.length > 0) {
                    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
                    const mixContext = new AudioContextCtor();
                    const destination = mixContext.createMediaStreamDestination();
                    sourceStreams.forEach(item => {
                        if (!item.getAudioTracks().length) return;
                        try {
                            const source = mixContext.createMediaStreamSource(item);
                            source.connect(destination);
                        } catch (mixErr) {
                            console.warn('audio mix source failed', mixErr);
                        }
                    });
                    destination.stream.getAudioTracks().forEach(track => mixedStream.addTrack(track));
                    recordingAudioContextRef.current = mixContext;
                }
                recordingStream = mixedStream;
            }

            const screenVideo = document.createElement('video');
            await waitForVideoReady(screenVideo, stream);
            recordingPreviewSourcesRef.current = {
                screenVideo,
                webcamVideo: null,
                eyeBoxesRef: null,
                faceBoxRef: null
            };

            streamRef.current = recordingStream;
            recordingSourceStreamsRef.current = sourceStreams;
            const mimeType = getPreferredRecordingMimeType({ preferSeekable: false });
            const mediaRecorder = mimeType
                ? new MediaRecorder(recordingStream, {
                    mimeType,
                    videoBitsPerSecond: 6_000_000
                })
                : new MediaRecorder(recordingStream, {
                    videoBitsPerSecond: 6_000_000
                });
            mediaRecorderRef.current = mediaRecorder;
            recordedChunksRef.current = [];

            stream.getTracks().forEach(track => {
                track.onended = () => {
                    setIsRecording(false);
                    if (mediaRecorder.state !== 'inactive') {
                        mediaRecorder.stop();
                    } else {
                        cleanupRecordingUi();
                    }
                };
            });

            mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) recordedChunksRef.current.push(e.data); };

            mediaRecorder.onstart = () => {
                recordStartTimeRef.current = Date.now();
                recordEndTimeRef.current = 0;
            };

            mediaRecorder.onstop = async () => {
                cleanupRecordingUi();
                recordEndTimeRef.current = Date.now();
                const actualDuration = (Date.now() - recordStartTimeRef.current) / 1000;
                const blob = new Blob(recordedChunksRef.current, { type: mimeType });
                const url = URL.createObjectURL(blob);
                const clickEventLog = await loadGlobalClickLog();
                const debugEventLog = await loadGlobalDebugLog();

                const finalDuration = actualDuration;
                const clipId = `clip_${Date.now()}`;
                const linkedAudioId = includeAudio ? `audio_${Date.now()}_recording` : '';

                await saveBlobToDB(clipId, blob);

                const newClip = {
                    id: clipId, type: 'video', src: url, startAt: 0,
                    blobId: clipId,
                    duration: finalDuration, originalDuration: finalDuration,
                    trimStart: 0, trimEnd: finalDuration, playbackRate: 1.0,
                    recordingSessionId: newSessionId,
                    hasEmbeddedAudio: includeAudio,
                    hasWebcamOverlay: false,
                    linkedAudioId,
                    layout: { ...DEFAULT_CLIP_LAYOUT },
                    kenBurns: createDefaultKenBurnsEffect(),
                    name: '錄影檔 ' + new Date().toLocaleTimeString()
                };

                const linkedAudioClip = includeAudio ? {
                    id: linkedAudioId,
                    type: 'audio',
                    src: url,
                    blobId: clipId,
                    startAt: 0,
                    duration: finalDuration,
                    originalDuration: finalDuration,
                    playbackRate: 1.0,
                    recordingSessionId: newSessionId,
                    trimStart: 0,
                    trimEnd: finalDuration,
                    name: `${newClip.name} 音訊`,
                    volume: 1,
                    fadeIn: 0,
                    fadeOut: 0,
                    generatedFromVideoId: clipId
                } : null;

                setProjectState(prev => {
                    const currentTimelineEnd = Math.max(
                        0,
                        ...((prev.tracks || []).flat().map(item => Number(item?.startAt || 0) + Number(item?.duration || 0)).filter(Number.isFinite)),
                        ...((prev.audioTracks || []).flat().map(item => Number(item?.startAt || 0) + Number(item?.duration || 0)).filter(Number.isFinite)),
                        ...((prev.subtitles || []).map(item => Number(item?.endAt || 0)).filter(Number.isFinite))
                    );
                    const appendStart = Number(currentTimelineEnd.toFixed(2));
                    const appendedClip = {
                        ...newClip,
                        startAt: appendStart
                    };
                    const appendedAudioClip = linkedAudioClip
                        ? {
                            ...linkedAudioClip,
                            startAt: appendStart
                        }
                        : null;
                    const newTracks = (prev.tracks || [[], [], []]).map(track => [...(track || [])]);
                    while (newTracks.length < 3) newTracks.push([]);
                    newTracks[0] = [...newTracks[0], appendedClip];

                    const newAudioTracks = (prev.audioTracks || [[], []]).map(track => [...(track || [])]);
                    while (newAudioTracks.length < 2) newAudioTracks.push([]);
                    if (appendedAudioClip) {
                        newAudioTracks[0] = [...newAudioTracks[0], appendedAudioClip];
                    }
                    const resetRange = {
                        startEpochMs: recordStartTimeRef.current,
                        endEpochMs: recordEndTimeRef.current
                    };
                    const existingAssets = [...(prev.assets || [])];
                    const recordingAsset = { id: newClip.id, blobId: clipId, type: 'video', src: url, name: newClip.name };
                    return {
                        ...prev,
                        tracks: newTracks,
                        audioTracks: newAudioTracks,
                        capturedFrames: [],
                        assets: [...existingAssets, recordingAsset],
                        clickEventLog,
                        debugEventLog,
                        recordingSessionId: newSessionId,
                        recordingRange: resetRange
                    };
                });
                setSelectedIds([]);
                setAiSubtitleStatus(createInitialAiSubtitleStatus());
                setArticleStatus(createInitialArticleStatus());
                setTtsStatus(createInitialTtsStatus());
                setUiDebugStatus(createInitialUiDebugStatus());
                setUxResearchStatus(createInitialUxResearchStatus());

                recordingSourceStreamsRef.current.forEach(item => item.getTracks().forEach(track => track.stop()));
                stopWebcamCapture();
                recordingStream.__openViscribeCleanup?.();
                recordingStream.getTracks().forEach(track => track.stop());
                if (stream.mockAnimationId) cancelAnimationFrame(stream.mockAnimationId);
                recordingSessionIdRef.current = '';
                if (needsClickSession) await setGlobalClickSession('');
                if (needsPageDebugRecording) await syncPageDebugSetting(false);
            };

            mediaRecorder.start(1000);
            setIsRecording(true);
            return true;
        } catch (err) {
            recordingSessionIdRef.current = '';
            if (needsClickSession) await setGlobalClickSession('');
            if (needsPageDebugRecording) await syncPageDebugSetting(false);
            alert("啟動錄影失敗，請檢查瀏覽器權限。");
            return false;
        }
    };

    const handleConfirmRecording = async () => {
        const pendingApproval = pendingAutomationApprovalRef.current;
        setShowRecordingModal(false);
        setSettings(prev => ({ ...prev, includeAudio: recordingOptions.includeAudio }));
        const started = await startRecording({ ...recordingOptions, requireRealCapture: !!pendingApproval?.requireRealCapture });
        if (pendingApproval?.kind === 'capture') {
            pendingAutomationApprovalRef.current = null;
            await reportAutomationCommandResult(pendingApproval.commandId, {
                status: started ? 'completed' : 'failed',
                detail: started ? 'Browser recording was approved and started.' : 'Browser recording permission was not granted.',
                snapshot: getAutomationSnapshot()
            }).catch(() => {});
        }
    };

    const handleCancelRecordingModal = () => {
        const pendingApproval = pendingAutomationApprovalRef.current;
        setShowRecordingModal(false);
        if (pendingApproval?.kind === 'capture') {
            pendingAutomationApprovalRef.current = null;
            void reportAutomationCommandResult(pendingApproval.commandId, {
                status: 'cancelled',
                detail: 'Browser recording approval was cancelled by the user.',
                snapshot: getAutomationSnapshot()
            }).catch(() => {});
        }
    };

    const stopRecording = () => {
        if (mediaRecorderRef.current && isRecording) {
            setIsRecording(false);
            stopWebcamCapture();
            recordingCompositeCleanupRef.current?.();
            setTimeout(() => {
                if (mediaRecorderRef.current.state === "recording") {
                    mediaRecorderRef.current.stop();
                }
            }, 500);
        }
    };

    const handleUpdateSpeed = (id, type, newSpeed) => {
        setProjectState(prev => {
            const next = { ...prev };
            if (type === 'clip') {
                next.tracks = next.tracks.map(track => track.map(clip => {
                    if (clip.id === id) {
                        return { ...clip, playbackRate: newSpeed, duration: clip.originalDuration / newSpeed, trimEnd: clip.trimStart + (clip.duration * newSpeed) };
                    }
                    return clip;
                }));
            } else if (type === 'audio') {
                next.audioTracks = next.audioTracks.map(track => track ? track.map(audio => {
                    if (audio.id === id) {
                        return { ...audio, playbackRate: newSpeed, duration: audio.originalDuration / newSpeed, trimEnd: audio.trimStart + (audio.duration * newSpeed) };
                    }
                    return audio;
                }) : []);
            }
            return next;
        });
    };

    const handleUpdateAudioProperty = (id, prop, val) => {
        setProjectState(prev => {
            const next = { ...prev, audioTracks: prev.audioTracks.map(t => [...(t || [])]) };
            for (let i = 0; i < next.audioTracks.length; i++) {
                const idx = next.audioTracks[i].findIndex(a => a.id === id);
                if (idx !== -1) {
                    next.audioTracks[i][idx] = { ...next.audioTracks[i][idx], [prop]: val };
                    break;
                }
            }
            return next;
        });
    };

    const updateClipById = useCallback((id, updater) => {
        setProjectState(prev => ({
            ...prev,
            tracks: prev.tracks.map(track => track.map(rawClip => {
                if (rawClip.id !== id) return rawClip;
                const normalizedClip = normalizeClipItem(rawClip);
                const updatedClip = typeof updater === 'function' ? updater(normalizedClip) : { ...normalizedClip, ...updater };
                return normalizeClipItem(updatedClip);
            }))
        }));
    }, [setProjectState]);

    const handleUpdateKenBurns = useCallback((clipId, updater) => {
        updateClipById(clipId, clip => {
            const currentEffect = normalizeKenBurnsEffect(clip.kenBurns);
            const nextEffect = typeof updater === 'function'
                ? updater(currentEffect)
                : { ...currentEffect, ...updater };
            return {
                ...clip,
                kenBurns: normalizeKenBurnsEffect(nextEffect)
            };
        });
    }, [updateClipById]);

    const togglePlay = () => {
        if (totalDuration === 0) return;
        if (!isPlaying && currentTime >= totalDuration) {
            setCurrentTime(0);
        }
        setIsPlaying(!isPlaying);
    };

    const getPrimaryFrameCaptureMapping = useCallback((time, canvasWidth, canvasHeight) => {
        const activeCandidates = [];
        [0, 1, 2].forEach(trackIdx => {
            if (trackStateRef.current.videoHidden[trackIdx]) return;
            (projectStateRef.current.tracks[trackIdx] || []).forEach((clip) => {
                if (!(time >= clip.startAt && time < clip.startAt + clip.duration)) return;
                const el = clip.type === 'video' ? videoRefs.current[clip.id] : imageRefs.current[clip.id];
                if (!el) return;
                const normalizedClip = normalizeClipItem(clip);
                const layout = normalizedClip.layout;
                const box = {
                    x: (layout.x / 100) * canvasWidth,
                    y: (layout.y / 100) * canvasHeight,
                    w: (layout.w / 100) * canvasWidth,
                    h: (layout.h / 100) * canvasHeight
                };
                activeCandidates.push({
                    clip: normalizedClip,
                    el,
                    box,
                    area: box.w * box.h,
                    trackIdx
                });
            });
        });

        if (!activeCandidates.length) return null;
        activeCandidates.sort((a, b) => b.area - a.area || b.trackIdx - a.trackIdx);
        const primary = activeCandidates[0];
        const { clip, el, box } = primary;
        const naturalWidth = el.videoWidth || el.naturalWidth || canvasWidth;
        const naturalHeight = el.videoHeight || el.naturalHeight || canvasHeight;
        if (!naturalWidth || !naturalHeight || !box.w || !box.h) return null;

        const mediaAspect = naturalWidth / naturalHeight;
        const boxAspect = box.w / box.h;
        let drawW = box.w;
        let drawH = box.h;
        let drawX = box.x;
        let drawY = box.y;

        if (mediaAspect > boxAspect) {
            drawH = box.w / mediaAspect;
            drawY = box.y + (box.h - drawH) / 2;
        } else {
            drawW = box.h * mediaAspect;
            drawX = box.x + (box.w - drawW) / 2;
        }

        const motion = getClipKenBurnsState(clip, time);
        const extraWidth = Math.max(0, (drawW * motion.scale - drawW) / 2);
        const extraHeight = Math.max(0, (drawH * motion.scale - drawH) / 2);
        const translateX = extraWidth * (motion.x / 100);
        const translateY = extraHeight * (motion.y / 100);
        const boxCenterX = box.x + box.w / 2;
        const boxCenterY = box.y + box.h / 2;
        const centerX = boxCenterX + translateX;
        const centerY = boxCenterY + translateY;

        const sourceBounds = {
            x: centerX + motion.scale * (drawX - boxCenterX),
            y: centerY + motion.scale * (drawY - boxCenterY),
            width: drawW * motion.scale,
            height: drawH * motion.scale
        };

        return {
            sourceX: sourceBounds.x / canvasWidth,
            sourceY: sourceBounds.y / canvasHeight,
            sourceW: sourceBounds.width / canvasWidth,
            sourceH: sourceBounds.height / canvasHeight,
            clipX: box.x / canvasWidth,
            clipY: box.y / canvasHeight,
            clipW: box.w / canvasWidth,
            clipH: box.h / canvasHeight
        };
    }, []);

    const drawToExportCanvas = useCallback((time, options = {}) => {
        const canvas = exportCanvasRef.current;
        if (!canvas) return;
        const includeClickRipple = options.includeClickRipple !== false;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = 'black';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        [0, 1, 2].forEach(trackIdx => {
            if (trackStateRef.current.videoHidden[trackIdx]) return;
            projectStateRef.current.tracks[trackIdx].forEach(clip => {
                if (time >= clip.startAt && time < clip.startAt + clip.duration) {
                    const el = clip.type === 'video' ? videoRefs.current[clip.id] : imageRefs.current[clip.id];
                    if (el) {
                        const normalizedClip = normalizeClipItem(clip);
                        const layout = normalizedClip.layout;
                        const boxW = (layout.w / 100) * canvas.width;
                        const boxH = (layout.h / 100) * canvas.height;
                        const boxX = (layout.x / 100) * canvas.width;
                        const boxY = (layout.y / 100) * canvas.height;

                        try {
                            const activeTransition = findActiveTransition(
                                projectStateRef.current.videoTransitions?.[trackIdx],
                                time,
                                normalizedClip.startAt,
                                normalizedClip.startAt + normalizedClip.duration
                            );
                            drawWithTransition(ctx, { x: boxX, y: boxY, w: boxW, h: boxH }, activeTransition, time, () => {
                                drawMediaWithKenBurns(ctx, el, normalizedClip, time, { x: boxX, y: boxY, w: boxW, h: boxH });
                            });
                        } catch (e) { }
                    }
                }
            });
        });

        if (includeClickRipple) {
            const allVideoClips = projectStateRef.current.tracks.flat().filter(clip => clip?.type === 'video');
            const clickPoints = buildRenderableClickPoints({
                clickEvents: projectStateRef.current.clickEventLog,
                rangeStartEpochMs: projectStateRef.current.recordingRange?.startEpochMs || recordStartTimeRef.current || 0,
                rangeEndEpochMs: projectStateRef.current.recordingRange?.endEpochMs || recordEndTimeRef.current || 0,
                allVideoClips,
                activeSessionId: projectStateRef.current.recordingSessionId || recordingSessionIdRef.current || ''
            });
            clickPoints.forEach((clickPoint) => {
                drawClickRippleOnCanvas(ctx, canvas, clickPoint, time);
            });
        }

        if (!options.hideSubtitles) projectStateRef.current.subtitles.forEach(sub => {
            const normalizedSub = normalizeSubtitle(sub);
            if (trackStateRef.current.subtitleHidden[normalizedSub.trackIndex]) return;
            if (time >= normalizedSub.startAt && time <= normalizedSub.endAt) {
                const activeTransition = findActiveTransition(
                    (projectStateRef.current.subtitleTransitions || []).filter(item => (Number.isInteger(item?.trackIndex) ? item.trackIndex : 1) === normalizedSub.trackIndex),
                    time,
                    normalizedSub.startAt,
                    normalizedSub.endAt
                );
                const subtitleBounds = getSubtitleCanvasBounds(ctx, canvas, normalizedSub);
                drawWithTransition(ctx, subtitleBounds, activeTransition, time, () => {
                    drawSubtitleOnCanvas(ctx, canvas, normalizedSub);
                });
            }
        });

        drawMotionDesignToCanvas(ctx, canvas, {
            design: projectStateRef.current.motionDesign,
            time,
            duration: Math.max(
                0,
                ...projectStateRef.current.tracks.flat().map(item => Number(item?.startAt || 0) + Number(item?.duration || 0)),
                ...projectStateRef.current.audioTracks.flatMap(track => track || []).map(item => Number(item?.startAt || 0) + Number(item?.duration || 0)),
                ...projectStateRef.current.subtitles.map(item => Number(item?.endAt || 0)),
                ...(projectStateRef.current.motionDesign?.manualCards || []).map(item => Number(item?.endAt || 0))
            ),
            subtitles: projectStateRef.current.subtitles,
            fallbackTitle: projectStateRef.current.articleTopic || projectStateRef.current.tutorialDescription || 'Untitled Tutorial',
            fallbackCreator: 'OPEN VISCRIBE'
        });
    }, []);

    const syncPlaybackElementsForTime = useCallback((targetTime, options = {}) => {
        const safeTime = Number.isFinite(Number(targetTime)) ? Number(targetTime) : 0;
        const forceHardSync = Boolean(options.forceHardSync);
        const shouldPlayMedia = isPlayingRef.current || isRenderingRef.current;

        projectStateRef.current.tracks.forEach((track, trackIdx) => {
            track.forEach(clip => {
                const vEl = videoRefs.current[clip.id];
                if (!vEl) return;

                const isActive = safeTime >= clip.startAt && safeTime < (clip.startAt + clip.duration);
                const isHidden = trackStateRef.current.videoHidden[trackIdx];
                const shouldMuteVideoAudio = true;

                if (clip.type === 'video') {
                    vEl.muted = shouldMuteVideoAudio;
                    vEl.defaultMuted = shouldMuteVideoAudio;
                    vEl.volume = shouldMuteVideoAudio ? 0 : 1;

                    if (isActive && !isHidden) {
                        if (vEl.style.display === 'none') vEl.style.display = 'block';
                        vEl.playbackRate = clip.playbackRate || 1.0;
                        const clipTime = clip.trimStart + (safeTime - clip.startAt) * (clip.playbackRate || 1.0);
                        const seekThreshold = forceHardSync || isRenderingRef.current ? 0.03 : 0.1;
                        if (Math.abs(vEl.currentTime - clipTime) > seekThreshold) {
                            vEl.currentTime = clipTime;
                        }

                        if (shouldPlayMedia && vEl.paused) vEl.play().catch(() => { });
                        if (!shouldPlayMedia && !vEl.paused) vEl.pause();
                    } else if (vEl.style.display !== 'none') {
                        vEl.pause();
                        vEl.style.display = 'none';
                    }
                }
            });
        });

        projectStateRef.current.audioTracks.forEach((track, trackIdx) => {
            track?.forEach(audio => {
                const audioEl = audioRefs.current[audio.id];
                if (!audioEl) return;

                const isMuted = trackIdx === 0 ? trackStateRef.current.audioMuted : trackStateRef.current.bgmMuted;
                const prevState = audioPreviewStateRef.current[audio.id] || { active: false };
                audioEl.muted = isMuted;
                audioEl.playbackRate = audio.playbackRate || 1.0;

                if (safeTime >= audio.startAt && safeTime <= (audio.startAt + audio.duration)) {
                    const audioTime = (audio.trimStart || 0) + (safeTime - audio.startAt) * (audio.playbackRate || 1.0);
                    const drift = Math.abs(audioEl.currentTime - audioTime);
                    const isRecordedVoiceTrack = Boolean(audio.generatedFromVideoId);
                    const shouldHardSync = forceHardSync || !prevState.active || isScrubbingRef.current || isRenderingRef.current;
                    const driftThreshold = shouldHardSync
                        ? 0.08
                        : (isRecordedVoiceTrack ? 0.6 : 0.35);

                    if (drift > driftThreshold) {
                        audioEl.currentTime = audioTime;
                    }

                    let currentVol = audio.volume ?? 1;
                    const elapsed = safeTime - audio.startAt;
                    const remaining = audio.duration - elapsed;

                    if (audio.fadeIn && elapsed < audio.fadeIn) currentVol = currentVol * (elapsed / audio.fadeIn);
                    if (audio.fadeOut && remaining < audio.fadeOut) currentVol = currentVol * (remaining / audio.fadeOut);
                    audioEl.volume = Math.max(0, Math.min(1, currentVol));

                    if (shouldPlayMedia && audioEl.paused) audioEl.play().catch(() => { });
                    if (!shouldPlayMedia && !audioEl.paused) audioEl.pause();
                    audioPreviewStateRef.current[audio.id] = { active: true };
                } else {
                    audioEl.pause();
                    if (prevState.active || audioEl.currentTime > 0.05) {
                        audioEl.currentTime = 0;
                    }
                    audioPreviewStateRef.current[audio.id] = { active: false };
                }
            });
        });
    }, []);

    const captureFramesFromTimelineTargets = useCallback(async (targetTimes = [], options = {}) => {
        const exportCanvas = exportCanvasRef.current;
        if (!exportCanvas) return [];
        const settledDelaySeconds = Number.isFinite(Number(options?.settledDelaySeconds))
            ? Math.max(0, Number(options.settledDelaySeconds))
            : 0.45;
        const includeClickRipple = options?.includeClickRipple !== false;

        const normalizedTargets = [...new Set(
            (Array.isArray(targetTimes) ? targetTimes : [])
                .map(value => Number(value))
                .filter(Number.isFinite)
                .map(value => Math.max(0, Math.min(totalDuration || value, value)))
                .map(value => Number(value.toFixed(2)))
        )].sort((a, b) => a - b);
        if (!normalizedTargets.length) return [];

        const aiCanvas = document.createElement('canvas');
        aiCanvas.width = 1280;
        aiCanvas.height = 720;
        const aiCtx = aiCanvas.getContext('2d', { willReadFrequently: true });

        const hdCanvas = document.createElement('canvas');
        hdCanvas.width = 1920;
        hdCanvas.height = 1080;
        const hdCtx = hdCanvas.getContext('2d');

        const seekVideoElementForClipTime = async (videoEl, clipTime) => {
            if (!videoEl || !Number.isFinite(clipTime)) return;
            const targetTime = Math.max(0, clipTime);
            if (Math.abs((videoEl.currentTime || 0) - targetTime) <= 0.04) return;
            await new Promise((resolve) => {
                let done = false;
                const finish = () => {
                    if (done) return;
                    done = true;
                    videoEl.removeEventListener('seeked', finish);
                    resolve();
                };
                videoEl.addEventListener('seeked', finish, { once: true });
                videoEl.currentTime = targetTime;
                setTimeout(finish, 400);
            });
        };

        const waitForPaint = () => new Promise((resolve) => {
            requestAnimationFrame(() => requestAnimationFrame(resolve));
        });

        const rebuiltFrames = [];
        for (const targetTime of normalizedTargets) {
            const captureTime = Math.max(
                0,
                Math.min(totalDuration || targetTime, Number((targetTime + settledDelaySeconds).toFixed(2)))
            );
            const activeClips = projectStateRef.current.tracks
                .flatMap(track => track || [])
                .filter((clip) => clip?.type === 'video')
                .filter((clip) => captureTime >= clip.startAt && captureTime < clip.startAt + clip.duration);

            await Promise.all(activeClips.map(async (clip) => {
                const videoEl = videoRefs.current[clip.id];
                if (!videoEl) return;
                const clipTime = clip.trimStart + (captureTime - clip.startAt) * (clip.playbackRate || 1.0);
                await seekVideoElementForClipTime(videoEl, clipTime);
            }));

            syncPlaybackElementsForTime(captureTime, { forceHardSync: true });
            await waitForPaint();
            drawToExportCanvas(captureTime, { includeClickRipple, hideSubtitles: true });
            const captureMapping = getPrimaryFrameCaptureMapping(captureTime, hdCanvas.width, hdCanvas.height);

            hdCtx.clearRect(0, 0, hdCanvas.width, hdCanvas.height);
            hdCtx.drawImage(exportCanvas, 0, 0, hdCanvas.width, hdCanvas.height);
            aiCtx.clearRect(0, 0, aiCanvas.width, aiCanvas.height);
            aiCtx.drawImage(exportCanvas, 0, 0, aiCanvas.width, aiCanvas.height);

            const imageData = aiCtx.getImageData(0, 0, aiCanvas.width, aiCanvas.height);
            const quality = analyzeFrameQuality(imageData);
            rebuiltFrames.push({
                frameId: rebuiltFrames.length + 1,
                relativeTime: captureTime,
                relativeTimeMs: Math.round(captureTime * 1000),
                aiData: aiCanvas.toDataURL('image/jpeg', 0.72).split(',')[1],
                hdData: hdCanvas.toDataURL('image/jpeg', 0.85).split(',')[1],
                rippleForClickId: '',
                captureMapping,
                ...quality
            });
        }

        return rebuiltFrames;
    }, [drawToExportCanvas, getPrimaryFrameCaptureMapping, syncPlaybackElementsForTime, totalDuration]);

    const finishRendering = useCallback(() => {
        if (renderRecorderRef.current && renderRecorderRef.current.state !== 'inactive') {
            renderRecorderRef.current.stop();
        }
        isRenderingRef.current = false;
        renderVideoTrackRef.current = null;
        renderAccumulatorRef.current = 0;
        renderLastTickRef.current = 0;
        setIsPlaying(false);
        setAiLoading(false);
        setAiProgress('');
        const pendingRender = pendingAutomationRenderRef.current;
        if (pendingRender) {
            pendingAutomationRenderRef.current = null;
            void reportAutomationCommandResult(pendingRender.commandId, {
                status: 'completed',
                detail: 'Video rendering completed and the export was handed to the selected folder or browser download.',
                snapshot: getAutomationSnapshot()
            }).catch(() => {});
        }
        alert('✅ 影片即時渲染合成完畢！');
    }, [getAutomationSnapshot, reportAutomationCommandResult]);

    useEffect(() => {
        let lastTime = performance.now();
        const updatePlayhead = (time) => {
            if (isRenderingRef.current) {
                if (!renderLastTickRef.current) {
                    renderLastTickRef.current = time;
                }
                const elapsed = Math.max(0, (time - renderLastTickRef.current) / 1000);
                renderLastTickRef.current = time;
                renderAccumulatorRef.current += elapsed;

                if (renderAccumulatorRef.current < RENDER_FRAME_STEP) {
                    animationRef.current = requestAnimationFrame(updatePlayhead);
                    return;
                }

                const frameCount = Math.max(1, Math.floor(renderAccumulatorRef.current / RENDER_FRAME_STEP));
                renderAccumulatorRef.current -= frameCount * RENDER_FRAME_STEP;
                const nextTime = Math.min(totalDuration || 0, renderTimeRef.current + frameCount * RENDER_FRAME_STEP);
                renderTimeRef.current = nextTime;
                syncPlaybackElementsForTime(nextTime, { forceHardSync: true });
                drawToExportCanvas(nextTime);
                renderVideoTrackRef.current?.requestFrame?.();
                setCurrentTime(nextTime);

                if (totalDuration > 0 && nextTime >= totalDuration) {
                    setIsPlaying(false);
                    if (isRenderingRef.current) finishRendering();
                }
            } else if (isPlaying) {
                const delta = (time - lastTime) / 1000;
                setCurrentTime(prev => {
                    const nextTime = prev + delta;
                    drawToExportCanvas(nextTime);

                    if (totalDuration > 0 && nextTime >= totalDuration) {
                        setIsPlaying(false);
                        if (isRenderingRef.current) finishRendering();
                        return totalDuration;
                    }
                    return nextTime;
                });
            } else {
                drawToExportCanvas(currentTime);
            }
            lastTime = time;
            animationRef.current = requestAnimationFrame(updatePlayhead);
        };

        animationRef.current = requestAnimationFrame(updatePlayhead);
        return () => cancelAnimationFrame(animationRef.current);
    }, [isPlaying, totalDuration, currentTime, drawToExportCanvas, finishRendering, syncPlaybackElementsForTime]);

    useEffect(() => {
        syncPlaybackElementsForTime(currentTime);
        if (!isRenderingRef.current) {
            drawToExportCanvas(currentTime);
        }
    }, [currentTime, drawToExportCanvas, syncPlaybackElementsForTime]);

    const splitClipAtPlayhead = () => {
        if (selectedIds.length !== 1) return;
        const splitId = selectedIds[0];

        setProjectState(prev => {
            const newTracks = prev.tracks.map(track => {
                const clipIndex = track.findIndex(c => c.id === splitId);
                if (clipIndex === -1) return track;
                const clip = track[clipIndex];
                if (currentTime > clip.startAt && currentTime < (clip.startAt + clip.duration)) {
                    const playbackRate = clip.playbackRate || 1.0;
                    const splitPoint = clip.trimStart + (currentTime - clip.startAt) * playbackRate;

                    const clipA = { ...clip, id: `${clip.id}_a`, trimEnd: splitPoint, duration: (splitPoint - clip.trimStart) / playbackRate, originalDuration: splitPoint - clip.trimStart };
                    const clipB = { ...clip, id: `${clip.id}_b`, startAt: currentTime, trimStart: splitPoint, duration: (clip.trimEnd - splitPoint) / playbackRate, originalDuration: clip.trimEnd - splitPoint };
                    const newTrack = [...track]; newTrack.splice(clipIndex, 1, clipA, clipB);
                    return newTrack;
                }
                return track;
            });
            return { ...prev, tracks: newTracks };
        });
        setSelectedIds([]);
    };

    const addSubtitleAtPlayhead = () => {
        const newSub = {
            id: `sub_${Date.now()}_${Math.random()}`,
            startAt: currentTime,
            endAt: currentTime + 3,
            text: "新增字幕",
            trackIndex: 0,
            ...DEFAULT_SUBTITLE_STYLE
        };
        setProjectState(prev => ({
            ...prev,
            subtitles: [...prev.subtitles, normalizeSubtitle(newSub)]
        }));
        setActiveSubtitleTrackIndex(0);
        setSelectedIds([newSub.id]);
    };

    const updateSelectedSubtitles = useCallback((updater) => {
        const selectedSet = new Set(selectedIds);
        setProjectState(prev => ({
            ...prev,
            subtitles: prev.subtitles.map(sub => {
                if (!selectedSet.has(sub.id)) return sub;
                const normalized = normalizeSubtitle(sub);
                const patch = typeof updater === 'function' ? updater(normalized) : updater;
                return normalizeSubtitle({ ...normalized, ...patch });
            })
        }));
    }, [selectedIds, setProjectState]);

    const handleSubtitleStyleChange = useCallback((key, value) => {
        updateSelectedSubtitles({ [key]: value });
    }, [updateSelectedSubtitles]);

    const handleToggleSelectAllSubtitles = (trackIndex, checked) => {
        const targetIds = (subtitlesByTrack[trackIndex] || []).map(sub => sub.id);
        if (checked) {
            setSelectedIds(prev => [...new Set([...prev, ...targetIds])]);
            return;
        }
        setSelectedIds(prev => prev.filter(id => !targetIds.includes(id)));
    };

    const handleAlignSelectedSubtitles = (trackIndex) => {
        const targetIds = new Set((subtitlesByTrack[trackIndex] || []).map(sub => sub.id));
        const areAllSelected = targetIds.size > 0 && [...targetIds].every(id => selectedIds.includes(id));
        if (!areAllSelected) {
            alert("請先勾選「全選字幕」後再對齊。");
            return;
        }

        const selectedSubs = projectState.subtitles
            .map(normalizeSubtitle)
            .filter(sub => selectedIds.includes(sub.id) && targetIds.has(sub.id))
            .sort((a, b) => a.startAt - b.startAt);

        if (selectedSubs.length === 0) {
            alert("目前沒有可對齊的字幕。");
            return;
        }

        const input = window.prompt("請輸入第一條字幕要對齊的秒數（可小數）", String(selectedSubs[0].startAt.toFixed(2)));
        if (input === null) return;

        const targetSecond = Number(input.trim());
        if (!Number.isFinite(targetSecond) || targetSecond < 0) {
            alert("請輸入大於或等於 0 的數字秒數。");
            return;
        }

        const firstStart = selectedSubs[0].startAt;
        const minStart = selectedSubs[0].startAt;
        const shift = targetSecond - firstStart;
        const clampedShift = minStart + shift < 0 ? -minStart : shift;

        setProjectState(prev => ({
            ...prev,
            subtitles: prev.subtitles.map(sub => {
                if (!targetIds.has(sub.id)) return sub;
                return {
                    ...sub,
                    startAt: sub.startAt + clampedShift,
                    endAt: sub.endAt + clampedShift
                };
            })
        }));

        if (clampedShift !== shift) {
            alert("部分字幕原本會小於 0 秒，已自動限制到 0 秒。");
        }
    };

    const generateVoiceoverSubtitles = async () => {
        if (voiceoverSubtitleProvider === 'azure') {
            if (!azureVisionEndpoint) return alert("請先在設定中填寫 Azure Vision Endpoint。");
            if (!azureSttKey) return alert("請先在設定中輸入 Azure STT API Key（或至少填入 Vision API Key）。");
            if (!settings.azureSttDeployment) return alert("請先在設定中填寫 STT 部署名稱。");
        } else if (voiceoverSubtitleProvider === 'ollama') {
            if (!ollamaEndpoint) return alert("請先在設定中填寫 Ollama Endpoint。");
            if (!settings.ollamaSttModel?.trim()) return alert("請先在設定中填寫 Ollama STT 模型 / 服務。");
        } else if (voiceoverSubtitleProvider === 'lmstudio') {
            return alert('LM Studio 版本目前尚未支援 STT。請先改用 Azure 或 Ollama。');
        } else {
            return alert(`目前「旁白轉字幕」只支援 Azure 與 Ollama。你目前預設是 ${getProviderLabel(voiceoverSubtitleProvider)}。`);
        }

        const a1Clips = [...(projectState.audioTracks?.[0] || [])].filter(Boolean).sort((a, b) => a.startAt - b.startAt);
        if (a1Clips.length === 0) return alert('A1 語音軌目前沒有可轉文字的音訊片段。');

        const preferredClips = a1Clips.filter(clip => clip.generatedFromVideoId);
        const sourceClips = preferredClips.length > 0 ? preferredClips : a1Clips;

        const taskController = beginAiTask('voiceoverSubtitle');
        const taskSignal = taskController.signal;
        setAiProgress('正在將 A1 旁白送去語音轉文字...');

        try {
            const subtitleItems = [];

            for (let clipIndex = 0; clipIndex < sourceClips.length; clipIndex++) {
                throwIfAborted(taskSignal);
                const clip = sourceClips[clipIndex];
                setAiProgress(`旁白轉字幕中... (${clipIndex + 1}/${sourceClips.length})`);

                const response = await fetch(clip.src, { signal: taskSignal });
                if (!response.ok) throw new Error(`無法讀取 A1 音訊片段：${clip.name}`);
                const blob = await response.blob();
                const extension = blob.type.includes('wav') ? 'wav' : (blob.type.includes('mp4') ? 'mp4' : 'webm');
                const file = new File([blob], `${clip.id}.${extension}`, { type: blob.type || 'audio/webm' });

                let result = null;

                if (voiceoverSubtitleProvider === 'azure') {
                    const formData = new FormData();
                    formData.append('file', file);
                    formData.append('model', settings.azureSttDeployment);
                    formData.append('response_format', 'verbose_json');
                    formData.append('timestamp_granularities[]', 'segment');
                    if (settings.language === 'zh-TW') formData.append('language', 'zh');
                    if (settings.language === 'en') formData.append('language', 'en');

                    const azureUrl = `${azureVisionEndpoint.replace(/\/+$/, '')}/openai/deployments/${settings.azureSttDeployment}/audio/transcriptions?api-version=2024-02-01`;
                    const transcriptionResponse = await fetch(azureUrl, {
                        method: 'POST',
                        headers: { 'api-key': azureSttKey },
                        body: formData,
                        signal: taskSignal
                    });

                    if (!transcriptionResponse.ok) {
                        const errText = await transcriptionResponse.text().catch(() => '');
                        throw new Error(`旁白轉字幕失敗 (${transcriptionResponse.status})${errText ? `: ${errText.slice(0, 200)}` : ''}`);
                    }

                    result = await transcriptionResponse.json();
                } else {
                    result = await callOllamaStt({
                        endpoint: ollamaEndpoint,
                        model: settings.ollamaSttModel.trim(),
                        file,
                        language: settings.language,
                        timeoutMs: ollamaTimeoutMs,
                        signal: taskSignal
                    });
                }
                const rawSegments = Array.isArray(result.segments) ? result.segments : [];

                if (rawSegments.length > 0) {
                    rawSegments.forEach((segment, segmentIndex) => {
                        const text = String(segment?.text || '').trim();
                        const segStart = Number(segment?.start);
                        const segEnd = Number(segment?.end);
                        if (!text || !Number.isFinite(segStart)) return;
                        subtitleItems.push(normalizeSubtitle({
                            id: `sub_voice_${clip.id}_${segmentIndex}_${Date.now()}`,
                            trackIndex: 0,
                            startAt: Number((clip.startAt + segStart).toFixed(2)),
                            endAt: Number((clip.startAt + (Number.isFinite(segEnd) && segEnd > segStart ? segEnd : segStart + 2)).toFixed(2)),
                            text
                        }));
                    });
                } else {
                    const text = String(result.text || '').trim();
                    if (text) {
                        subtitleItems.push(normalizeSubtitle({
                            id: `sub_voice_${clip.id}_${Date.now()}`,
                            trackIndex: 0,
                            startAt: Number(clip.startAt.toFixed(2)),
                            endAt: Number((clip.startAt + clip.duration).toFixed(2)),
                            text
                        }));
                    }
                }
            }

            if (subtitleItems.length === 0) {
                throw new Error('STT 沒有回傳可用文字，請確認 A1 軌上的片段真的有旁白聲音。');
            }

            subtitleItems.sort((a, b) => a.startAt - b.startAt);
            setProjectState(prev => ({
                ...prev,
                subtitles: [
                    ...prev.subtitles.filter(sub => normalizeSubtitle(sub).trackIndex !== 0),
                    ...subtitleItems
                ]
            }));
            setActiveSubtitleTrackIndex(0);
            setSelectedIds(subtitleItems.map(item => item.id));
            alert(`旁白轉字幕完成，已將 ${subtitleItems.length} 條字幕寫入 S1 用戶字幕軌。`);
        } catch (error) {
            if (isAiTaskCancelledError(error) || error?.name === 'AbortError') {
                return;
            }
            alert(`旁白轉字幕失敗：${error.message || '未知錯誤'}`);
        } finally {
            finishAiTask(taskController);
        }
    };

    const testOllamaConnection = async (kind = 'chat') => {
        if (!ollamaEndpoint) {
            setOllamaTestState(prev => ({
                ...prev,
                [kind]: { phase: 'error', detail: '請先填入 Ollama Endpoint。' }
            }));
            return;
        }
        const targetModel = (
            kind === 'vision'
                ? settings.ollamaVisionModel
                : kind === 'chat'
                    ? settings.ollamaChatModel
                    : kind === 'tts'
                        ? settings.ollamaTtsModel
                        : settings.ollamaSttModel
            || ''
        ).trim();
        if (!targetModel) {
            setOllamaTestState(prev => ({
                ...prev,
                [kind]: {
                    phase: 'error',
                    detail: `請先填入 ${
                        kind === 'vision' ? 'Vision'
                            : kind === 'chat' ? 'Chat'
                                : kind === 'tts' ? 'TTS'
                                    : 'STT'
                    } 模型。`
                }
            }));
            return;
        }
        setOllamaTestState(prev => ({
            ...prev,
            [kind]: {
                phase: 'running',
                detail: `正在測試 ${
                    kind === 'vision' ? 'Vision'
                        : kind === 'chat' ? 'Chat'
                            : kind === 'tts' ? 'TTS'
                                : 'STT'
                } 模型 ${targetModel} 與 ${ollamaEndpoint} 的連線...`
            }
        }));
        try {
            if (kind === 'tts') {
                const audioBlob = await callOllamaTts({
                    endpoint: ollamaEndpoint,
                    model: targetModel,
                    text: settings.language === 'zh-TW' ? 'OpenViscribe 測試語音。' : 'OpenViscribe TTS test.',
                    language: settings.language,
                    timeoutMs: ollamaTimeoutMs
                });
                const duration = await getAudioBlobDuration(audioBlob, 1.5);
                setOllamaTestState(prev => ({
                    ...prev,
                    [kind]: { phase: 'success', detail: `連線成功：TTS 模型 ${targetModel} 已回傳 ${audioBlob.type || 'audio/wav'} 音訊，長度約 ${duration.toFixed(2)} 秒。` }
                }));
                return;
            }

            if (kind === 'stt') {
                const testFile = new File(
                    [createSilentWavBlob(900, 16000)],
                    'openviscribe-ollama-stt-test.wav',
                    { type: 'audio/wav' }
                );
                const result = await callOllamaStt({
                    endpoint: ollamaEndpoint,
                    model: targetModel,
                    file: testFile,
                    language: settings.language,
                    allowEmptyText: true,
                    timeoutMs: ollamaTimeoutMs
                });
                const segmentCount = Array.isArray(result?.segments) ? result.segments.length : 0;
                const text = String(result?.text || '').trim();
                setOllamaTestState(prev => ({
                    ...prev,
                    [kind]: {
                        phase: 'success',
                        detail: `連線成功：STT 模型 ${targetModel} 可接受音訊上傳。${text ? ` 回傳文字：${text.slice(0, 60)}。` : ` 測試音檔為靜音，${segmentCount > 0 ? `共 ${segmentCount} 段結果。` : '空白結果也算 endpoint 正常。'}`}`
                    }
                }));
                return;
            }

            const result = await callOllamaChat({
                endpoint: ollamaEndpoint,
                model: targetModel,
                temperature: 0,
                format: 'json',
                timeoutMs: ollamaTimeoutMs,
                prompt: kind === 'vision'
                    ? '請只回傳 JSON：{"ok":true,"message":"vision-pong"}'
                    : '請只回傳 JSON：{"ok":true,"message":"chat-pong"}'
            });
            const parsed = JSON.parse(String(result || '').replace(/```json/gi, '').replace(/```/g, '').trim());
            if (!parsed?.ok) throw new Error('模型有回應，但格式不是預期 JSON。');
            setOllamaTestState(prev => ({
                ...prev,
                [kind]: { phase: 'success', detail: `連線成功：${kind === 'vision' ? 'Vision' : 'Chat'} 模型 ${targetModel} 可正常回應。` }
            }));
        } catch (error) {
            setOllamaTestState(prev => ({
                ...prev,
                [kind]: { phase: 'error', detail: error.message || 'Ollama 連線失敗' }
            }));
        }
    };

    const testLmStudioConnection = async (kind = 'chat') => {
        if (!lmStudioEndpoint) {
            setLmStudioTestState(prev => ({
                ...prev,
                [kind]: { phase: 'error', detail: '請先填入 LM Studio Base URL。' }
            }));
            return;
        }
        const targetModel = (
            kind === 'vision'
                ? settings.lmStudioVisionModel
                : settings.lmStudioChatModel
            || ''
        ).trim();
        if (!targetModel) {
            setLmStudioTestState(prev => ({
                ...prev,
                [kind]: {
                    phase: 'error',
                    detail: `請先填入 ${kind === 'vision' ? 'Vision' : 'Chat'} 模型。`
                }
            }));
            return;
        }
        setLmStudioTestState(prev => ({
            ...prev,
            [kind]: {
                phase: 'running',
                detail: `正在測試 ${kind === 'vision' ? 'Vision' : 'Chat'} 模型 ${targetModel} 與 ${lmStudioEndpoint} 的連線...`
            }
        }));
        try {
            const result = await callLmStudioChat({
                endpoint: lmStudioEndpoint,
                apiKey: lmStudioApiKey,
                model: targetModel,
                temperature: 0,
                format: 'json',
                timeoutMs: lmStudioTimeoutMs,
                prompt: kind === 'vision'
                    ? '請只回傳 JSON：{"ok":true,"message":"vision-pong"}'
                    : '請只回傳 JSON：{"ok":true,"message":"chat-pong"}'
            });
            const parsed = JSON.parse(String(result || '').replace(/```json/gi, '').replace(/```/g, '').trim());
            if (!parsed?.ok) throw new Error('模型有回應，但格式不是預期 JSON。');
            setLmStudioTestState(prev => ({
                ...prev,
                [kind]: { phase: 'success', detail: `連線成功：LM Studio ${kind === 'vision' ? 'Vision' : 'Chat'} 模型 ${targetModel} 可正常回傳 JSON。` }
            }));
        } catch (error) {
            setLmStudioTestState(prev => ({
                ...prev,
                [kind]: { phase: 'error', detail: error.message || 'LM Studio 連線失敗。' }
            }));
        }
    };

    const updatePlayheadPosition = useCallback((e) => {
        if (!timelineRef.current) return;
        const rect = timelineRef.current.getBoundingClientRect();
        const scrollLeft = timelineRef.current.scrollLeft;
        let x = Math.max(0, e.clientX - rect.left + scrollLeft - TIMELINE_OFFSET);
        setCurrentTime(x / pixelsPerSecond);
    }, [pixelsPerSecond]);

    const handleTimelineWheel = useCallback((e) => {
        if (!(e.ctrlKey || e.metaKey) || !timelineRef.current) return;

        e.preventDefault();
        const rect = timelineRef.current.getBoundingClientRect();
        const viewportX = e.clientX - rect.left;
        const anchorTime = Math.max(
            0,
            (timelineRef.current.scrollLeft + viewportX - TIMELINE_OFFSET) / pixelsPerSecond
        );
        const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
        applyTimelineZoom(timelineZoom * zoomFactor, anchorTime, viewportX);
    }, [applyTimelineZoom, pixelsPerSecond, timelineZoom]);

    const handleTimelineMouseDown = (e) => {
        if (e.target.closest('.time-ruler')) {
            setIsScrubbing(true);
            updatePlayheadPosition(e);
        } else if (e.target.closest('.track-bg')) {
            const rect = timelineRef.current.getBoundingClientRect();
            const scrollLeft = timelineRef.current.scrollLeft;
            const scrollTop = timelineRef.current.scrollTop;
            const x = e.clientX - rect.left + scrollLeft;
            const y = e.clientY - rect.top + scrollTop;

            setSelectionBox({ startX: x, startY: y, x, y, w: 0, h: 0 });
        }
    };

    useEffect(() => {
        const handleMouseMove = (e) => {
            if (isScrubbing) {
                e.preventDefault();
                updatePlayheadPosition(e);
            } else if (selectionBox) {
                const rect = timelineRef.current.getBoundingClientRect();
                const currentX = e.clientX - rect.left + timelineRef.current.scrollLeft;
                const currentY = e.clientY - rect.top + timelineRef.current.scrollTop;

                setSelectionBox(prev => ({
                    ...prev,
                    x: Math.min(prev.startX, currentX),
                    y: Math.min(prev.startY, currentY),
                    w: Math.abs(currentX - prev.startX),
                    h: Math.abs(currentY - prev.startY)
                }));
            }
        };

        const handleMouseUp = (e) => {
            if (isScrubbing) {
                setIsScrubbing(false);
            } else if (selectionBox) {
                const boxEl = document.getElementById('selection-box-element');
                if (boxEl) {
                    const boxRect = boxEl.getBoundingClientRect();
                    const items = document.querySelectorAll('.timeline-item');
                    const newSelected = [];
                    items.forEach(el => {
                        const itemRect = el.getBoundingClientRect();
                        if (
                            itemRect.left < boxRect.right &&
                            itemRect.right > boxRect.left &&
                            itemRect.top < boxRect.bottom &&
                            itemRect.bottom > boxRect.top
                        ) {
                            newSelected.push(el.getAttribute('data-id'));
                        }
                    });

                    if (e.shiftKey || e.metaKey || e.ctrlKey) {
                        setSelectedIds(prev => [...new Set([...prev, ...newSelected])]);
                    } else {
                        setSelectedIds(newSelected);
                    }
                }
                setSelectionBox(null);
            }
        };

        if (isScrubbing || selectionBox) {
            window.addEventListener('mousemove', handleMouseMove, { passive: false });
            window.addEventListener('mouseup', handleMouseUp);
        }
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isScrubbing, updatePlayheadPosition, selectionBox]);

    const handleItemMouseDown = (e, item, type, trackIndex = 0, action = 'move') => {
        e.stopPropagation();

        let currentSelected = selectedIds;
        if (e.shiftKey || e.metaKey || e.ctrlKey) {
            if (currentSelected.includes(item.id)) {
                currentSelected = currentSelected.filter(id => id !== item.id);
            } else {
                currentSelected = [...currentSelected, item.id];
            }
            setSelectedIds(currentSelected);
        } else {
            if (!currentSelected.includes(item.id)) {
                currentSelected = [item.id];
                setSelectedIds(currentSelected);
            }
        }

        const draggedItems = [];
        projectState.tracks.forEach((track, tIdx) => track.forEach(c => {
            if (currentSelected.includes(c.id)) draggedItems.push({ ...c, originalTrackIdx: tIdx, itemType: 'clip' });
        }));
        projectState.audioTracks.forEach((track, tIdx) => track?.forEach(a => {
            if (currentSelected.includes(a.id)) draggedItems.push({ ...a, originalTrackIdx: tIdx, itemType: 'audio' });
        }));
        projectState.subtitles.forEach(s => {
            if (currentSelected.includes(s.id)) draggedItems.push({ ...s, itemType: 'subtitle' });
        });
        (projectState.videoTransitions || []).forEach((track, tIdx) => track.forEach(item => {
            if (currentSelected.includes(item.id)) draggedItems.push({ ...item, originalTrackIdx: tIdx, itemType: 'videoTransition' });
        }));
        (projectState.subtitleTransitions || []).forEach(item => {
            if (currentSelected.includes(item.id)) draggedItems.push({ ...item, itemType: 'subtitleTransition' });
        });

        const primaryItem = draggedItems.find(i => i.id === item.id);
        if (!primaryItem) return;

        dragRef.current = {
            primaryId: item.id,
            primaryItem,
            draggedItems,
            action: action,
            startX: e.clientX,
            startY: e.clientY
        };
        dragHistorySnapshotRef.current = cloneProjectSnapshot(projectStateRef.current);
    };

    useEffect(() => {
        const handleGlobalMouseMove = (e) => {
            if (!dragRef.current) return;
            const dragData = dragRef.current;
            const deltaX = e.clientX - dragData.startX;
            let rawDeltaTime = deltaX / pixelsPerSecond;

            setProjectState(prev => {
                const next = {
                    ...prev,
                    tracks: prev.tracks.map(t => [...t]),
                    videoTransitions: (prev.videoTransitions || [[], [], []]).map(t => [...(t || [])]),
                    audioTracks: prev.audioTracks.map(t => [...(t || [])]),
                    subtitles: [...prev.subtitles],
                    subtitleTransitions: [...(prev.subtitleTransitions || [])]
                };

                const draggedIds = dragData.draggedItems.map(i => i.id);
                const snapPoints = [currentTime];
                next.tracks.forEach(t => t.forEach(c => { if (!draggedIds.includes(c.id)) { snapPoints.push(c.startAt); snapPoints.push(c.startAt + c.duration); } }));
                next.videoTransitions.forEach(t => t.forEach(c => { if (!draggedIds.includes(c.id)) { snapPoints.push(c.startAt); snapPoints.push(c.startAt + c.duration); } }));
                next.audioTracks.forEach(t => t.forEach(c => { if (!draggedIds.includes(c.id)) { snapPoints.push(c.startAt); snapPoints.push(c.startAt + c.duration); } }));
                next.subtitles.forEach(s => { if (!draggedIds.includes(s.id)) { snapPoints.push(s.startAt); snapPoints.push(s.endAt); } });
                next.subtitleTransitions.forEach(s => { if (!draggedIds.includes(s.id)) { snapPoints.push(s.startAt); snapPoints.push(s.startAt + s.duration); } });

                if (dragData.action === 'move') {
                    let trackShift = 0;
                    if (dragData.primaryItem.itemType === 'clip' || dragData.primaryItem.itemType === 'videoTransition') {
                        const elements = document.elementsFromPoint(e.clientX, e.clientY);
                        const trackEl = elements?.find(el => el && el.hasAttribute && el.hasAttribute('data-video-track'));
                        if (trackEl) trackShift = parseInt(trackEl.getAttribute('data-video-track'), 10) - dragData.primaryItem.originalTrackIdx;
                    } else if (dragData.primaryItem.itemType === 'audio') {
                        const elements = document.elementsFromPoint(e.clientX, e.clientY);
                        const trackEl = elements?.find(el => el && el.hasAttribute && el.hasAttribute('data-audio-track'));
                        if (trackEl) trackShift = parseInt(trackEl.getAttribute('data-audio-track'), 10) - dragData.primaryItem.originalTrackIdx;
                    }

                    dragData.draggedItems.forEach(item => {
                        if (item.startAt + rawDeltaTime < 0) {
                            rawDeltaTime = -item.startAt;
                        }
                    });

                    let newPrimaryStart = dragData.primaryItem.startAt + rawDeltaTime;
                    let snappedPrimaryStart = newPrimaryStart;
                    let minDist = 0.5;

                    snapPoints.forEach(p => {
                        if (Math.abs(p - newPrimaryStart) < minDist) { minDist = Math.abs(p - newPrimaryStart); snappedPrimaryStart = p; }
                        if (Math.abs(p - (newPrimaryStart + dragData.primaryItem.duration)) < minDist) { minDist = Math.abs(p - (newPrimaryStart + dragData.primaryItem.duration)); snappedPrimaryStart = p - dragData.primaryItem.duration; }
                    });

                    const finalDeltaTime = snappedPrimaryStart - dragData.primaryItem.startAt;

                    const cleanTracks = prev.tracks.map(t => t.filter(c => !draggedIds.includes(c.id)));
                    const cleanVideoTransitions = (prev.videoTransitions || [[], [], []]).map(t => t.filter(item => !draggedIds.includes(item.id)));
                    const cleanAudio = prev.audioTracks.map(t => t ? t.filter(a => !draggedIds.includes(a.id)) : []);
                    let cleanSubs = prev.subtitles.filter(s => !draggedIds.includes(s.id));
                    let cleanSubtitleTransitions = (prev.subtitleTransitions || []).filter(item => !draggedIds.includes(item.id));

                    dragData.draggedItems.forEach(item => {
                        const newStart = Math.max(0, item.startAt + finalDeltaTime);
                        if (item.itemType === 'clip') {
                            const newTrackIdx = Math.max(0, Math.min(2, item.originalTrackIdx + trackShift));
                            cleanTracks[newTrackIdx].push({ ...item, startAt: newStart });
                        } else if (item.itemType === 'videoTransition') {
                            const newTrackIdx = Math.max(0, Math.min(2, item.originalTrackIdx + trackShift));
                            cleanVideoTransitions[newTrackIdx].push({ ...item, startAt: newStart });
                        } else if (item.itemType === 'audio') {
                            const newTrackIdx = Math.max(0, Math.min(1, item.originalTrackIdx + trackShift));
                            if (!cleanAudio[newTrackIdx]) cleanAudio[newTrackIdx] = [];
                            cleanAudio[newTrackIdx].push({ ...item, startAt: newStart });
                        } else if (item.itemType === 'subtitle') {
                            const duration = item.endAt - item.startAt;
                            cleanSubs.push({ ...item, startAt: newStart, endAt: newStart + duration });
                        } else if (item.itemType === 'subtitleTransition') {
                            cleanSubtitleTransitions.push({ ...item, startAt: newStart });
                        }
                    });

                    next.tracks = cleanTracks;
                    next.videoTransitions = cleanVideoTransitions;
                    next.audioTracks = cleanAudio;
                    next.subtitles = cleanSubs;
                    next.subtitleTransitions = cleanSubtitleTransitions;
                }
                else {
                    const item = dragData.primaryItem;
                    if (item.itemType === 'clip' || item.itemType === 'audio' || item.itemType === 'videoTransition') {
                        const cleanArr = item.itemType === 'clip'
                            ? next.tracks[item.originalTrackIdx]
                            : item.itemType === 'audio'
                                ? next.audioTracks[item.originalTrackIdx]
                                : next.videoTransitions[item.originalTrackIdx];
                        const idx = cleanArr.findIndex(c => c.id === item.id);
                        if (idx === -1) return prev;
                        let clip = cleanArr[idx];

                        if (dragData.action === 'resizeRight') {
                            let newEndAt = item.startAt + item.duration + rawDeltaTime;
                            let snapEnd = newEndAt;
                            let minDist = 0.5;
                            snapPoints.forEach(p => { if (Math.abs(p - newEndAt) < minDist) { minDist = Math.abs(p - newEndAt); snapEnd = p; } });

                            let delta = snapEnd - (item.startAt + item.duration);
                            let newDuration = item.duration + delta;
                            if (item.itemType === 'clip' || item.itemType === 'audio') {
                                let maxDuration = (item.originalDuration - (item.trimStart || 0)) / (item.playbackRate || 1);
                                if (newDuration > maxDuration) newDuration = maxDuration;
                            }
                            if (newDuration < 0.1) newDuration = 0.1;

                            clip.duration = newDuration;
                            if (item.itemType === 'clip' || item.itemType === 'audio') {
                                clip.trimEnd = (item.trimStart || 0) + newDuration * (item.playbackRate || 1);
                            }
                        } else if (dragData.action === 'resizeLeft') {
                            let newStartAt = item.startAt + rawDeltaTime;
                            let snapStart = newStartAt;
                            let minDist = 0.5;
                            snapPoints.forEach(p => { if (Math.abs(p - newStartAt) < minDist) { minDist = Math.abs(p - newStartAt); snapStart = p; } });

                            let delta = snapStart - item.startAt;
                            if (item.itemType === 'clip' || item.itemType === 'audio') {
                                let minDelta = -(item.trimStart || 0) / (item.playbackRate || 1);
                                if (delta < minDelta) delta = minDelta;
                            }

                            let newDuration = item.duration - delta;
                            if (newDuration < 0.1) {
                                newDuration = 0.1;
                                delta = item.duration - 0.1;
                            }

                            clip.startAt = item.startAt + delta;
                            clip.duration = newDuration;
                            if (item.itemType === 'clip' || item.itemType === 'audio') {
                                clip.trimStart = (item.trimStart || 0) + delta * (item.playbackRate || 1);
                            }
                        }
                    } else if (item.itemType === 'subtitle') {
                        let sub = next.subtitles.find(s => s.id === item.id);
                        if (!sub) return prev;

                        if (dragData.action === 'resizeRight') {
                            let newEndAt = item.endAt + rawDeltaTime;
                            let snapEnd = newEndAt;
                            let minDist = 0.5;
                            snapPoints.forEach(p => { if (Math.abs(p - newEndAt) < minDist) { minDist = Math.abs(p - newEndAt); snapEnd = p; } });
                            if (snapEnd < sub.startAt + 0.1) snapEnd = sub.startAt + 0.1;
                            sub.endAt = snapEnd;
                        } else if (dragData.action === 'resizeLeft') {
                            let newStartAt = item.startAt + rawDeltaTime;
                            let snapStart = newStartAt;
                            let minDist = 0.5;
                            snapPoints.forEach(p => { if (Math.abs(p - newStartAt) < minDist) { minDist = Math.abs(p - newStartAt); snapStart = p; } });
                            if (snapStart > sub.endAt - 0.1) snapStart = sub.endAt - 0.1;
                            if (snapStart < 0) snapStart = 0;
                            sub.startAt = snapStart;
                        }
                    } else if (item.itemType === 'subtitleTransition') {
                        let transition = next.subtitleTransitions.find(s => s.id === item.id);
                        if (!transition) return prev;

                        if (dragData.action === 'resizeRight') {
                            let newEndAt = item.startAt + item.duration + rawDeltaTime;
                            let snapEnd = newEndAt;
                            let minDist = 0.5;
                            snapPoints.forEach(p => { if (Math.abs(p - newEndAt) < minDist) { minDist = Math.abs(p - newEndAt); snapEnd = p; } });
                            transition.duration = Math.max(0.1, snapEnd - transition.startAt);
                        } else if (dragData.action === 'resizeLeft') {
                            let newStartAt = item.startAt + rawDeltaTime;
                            let snapStart = newStartAt;
                            let minDist = 0.5;
                            snapPoints.forEach(p => { if (Math.abs(p - newStartAt) < minDist) { minDist = Math.abs(p - newStartAt); snapStart = p; } });
                            if (snapStart > item.startAt + item.duration - 0.1) snapStart = item.startAt + item.duration - 0.1;
                            if (snapStart < 0) snapStart = 0;
                            transition.duration = Math.max(0.1, item.duration - (snapStart - item.startAt));
                            transition.startAt = snapStart;
                        }
                    }
                }
                return next;
            }, { recordHistory: false });
        };

        const handleGlobalMouseUp = () => {
            if (dragHistorySnapshotRef.current && !areProjectSnapshotsEqual(dragHistorySnapshotRef.current, projectStateRef.current)) {
                pushUndoSnapshot(dragHistorySnapshotRef.current);
            }
            dragHistorySnapshotRef.current = null;
            dragRef.current = null;
        };

        window.addEventListener('mousemove', handleGlobalMouseMove);
        window.addEventListener('mouseup', handleGlobalMouseUp);
        return () => {
            window.removeEventListener('mousemove', handleGlobalMouseMove);
            window.removeEventListener('mouseup', handleGlobalMouseUp);
        };
    }, [currentTime, pixelsPerSecond, pushUndoSnapshot, setProjectState]);

    const handleCanvasMouseDown = (e, clip, trackIndex, action) => {
        e.stopPropagation();
        if (e.button !== 0) return;
        setSelectedIds([clip.id]);

        const rect = previewContainerRef.current.getBoundingClientRect();
        setCanvasDrag({
            id: clip.id,
            trackIndex,
            action,
            startX: e.clientX,
            startY: e.clientY,
            origX: clip.layout?.x ?? 0,
            origY: clip.layout?.y ?? 0,
            origW: clip.layout?.w ?? 100,
            origH: clip.layout?.h ?? 100,
            containerW: rect.width,
            containerH: rect.height
        });
        canvasHistorySnapshotRef.current = cloneProjectSnapshot(projectStateRef.current);
    };

    const handleSubtitleCanvasMouseDown = (e, subtitle) => {
        e.stopPropagation();
        if (e.button !== 0) return;

        let currentSelected = selectedIds;
        if (e.shiftKey || e.metaKey || e.ctrlKey) {
            currentSelected = currentSelected.includes(subtitle.id)
                ? currentSelected.filter(id => id !== subtitle.id)
                : [...currentSelected, subtitle.id];
            setSelectedIds(currentSelected);
        } else if (!currentSelected.includes(subtitle.id)) {
            currentSelected = [subtitle.id];
            setSelectedIds(currentSelected);
        }

        const selectedSet = new Set(currentSelected);
        const draggedSubs = projectStateRef.current.subtitles
            .filter(sub => selectedSet.has(sub.id))
            .map(normalizeSubtitle);

        if (draggedSubs.length === 0) return;

        const rect = previewContainerRef.current.getBoundingClientRect();
        setCanvasDrag({
            entityType: 'subtitle',
            startX: e.clientX,
            startY: e.clientY,
            containerW: rect.width,
            containerH: rect.height,
            draggedSubs
        });
        canvasHistorySnapshotRef.current = cloneProjectSnapshot(projectStateRef.current);
    };

    useEffect(() => {
        if (!canvasDrag) return;

        const onMove = (e) => {
            if (canvasDrag?.entityType !== 'subtitle') {
                const deltaXPx = e.clientX - canvasDrag.startX;
                const deltaYPx = e.clientY - canvasDrag.startY;
                const deltaX = (deltaXPx / canvasDrag.containerW) * 100;
                const deltaY = (deltaYPx / canvasDrag.containerH) * 100;

                setProjectState(prev => {
                    const next = { ...prev, tracks: prev.tracks.map(t => [...t]) };
                    let clipIndex = next.tracks[canvasDrag.trackIndex].findIndex(c => c.id === canvasDrag.id);
                    if (clipIndex === -1) return prev;

                    const clip = { ...next.tracks[canvasDrag.trackIndex][clipIndex] };
                    if (!clip.layout) {
                        clip.layout = { x: 0, y: 0, w: 100, h: 100 };
                    }
                    clip.layout = { ...clip.layout };

                    if (canvasDrag.action === 'move') {
                        clip.layout.x = canvasDrag.origX + deltaX;
                        clip.layout.y = canvasDrag.origY + deltaY;
                    } else if (canvasDrag.action === 'resize-br') {
                        clip.layout.w = Math.max(5, canvasDrag.origW + deltaX);
                        clip.layout.h = Math.max(5, canvasDrag.origH + deltaY);
                    } else if (canvasDrag.action === 'resize-tl') {
                        clip.layout.x = canvasDrag.origX + deltaX;
                        clip.layout.y = canvasDrag.origY + deltaY;
                        clip.layout.w = Math.max(5, canvasDrag.origW - deltaX);
                        clip.layout.h = Math.max(5, canvasDrag.origH - deltaY);
                    } else if (canvasDrag.action === 'resize-tr') {
                        clip.layout.y = canvasDrag.origY + deltaY;
                        clip.layout.w = Math.max(5, canvasDrag.origW + deltaX);
                        clip.layout.h = Math.max(5, canvasDrag.origH - deltaY);
                    } else if (canvasDrag.action === 'resize-bl') {
                        clip.layout.x = canvasDrag.origX + deltaX;
                        clip.layout.w = Math.max(5, canvasDrag.origW - deltaX);
                        clip.layout.h = Math.max(5, canvasDrag.origH + deltaY);
                    }

                    next.tracks[canvasDrag.trackIndex][clipIndex] = clip;
                    return next;
                }, { recordHistory: false });
            } else if (canvasDrag?.entityType === 'subtitle') {
                const dragData = canvasDrag;
                const deltaXPx = e.clientX - dragData.startX;
                const deltaYPx = e.clientY - dragData.startY;
                const deltaX = (deltaXPx / dragData.containerW) * 100;
                const deltaY = (deltaYPx / dragData.containerH) * 100;

                setProjectState(prev => ({
                    ...prev,
                    subtitles: prev.subtitles.map(sub => {
                        const target = dragData.draggedSubs.find(item => item.id === sub.id);
                        if (!target) return sub;
                        return normalizeSubtitle({
                            ...sub,
                            x: clamp(target.x + deltaX, 0, 100),
                            y: clamp(target.y + deltaY, 0, 100)
                        });
                    })
                }), { recordHistory: false });
            }
        };

        const onUp = () => {
            if (canvasHistorySnapshotRef.current && !areProjectSnapshotsEqual(canvasHistorySnapshotRef.current, projectStateRef.current)) {
                pushUndoSnapshot(canvasHistorySnapshotRef.current);
            }
            canvasHistorySnapshotRef.current = null;
            setCanvasDrag(null);
        };

        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
        return () => {
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
        };
    }, [canvasDrag, pushUndoSnapshot, setProjectState]);

    useEffect(() => {
        if (!isResizingLeftPanel) return;

        const onMove = (e) => {
            setLeftPanelWidth(clamp(e.clientX, MIN_LEFT_PANEL_WIDTH, MAX_LEFT_PANEL_WIDTH));
        };

        const onUp = () => setIsResizingLeftPanel(false);

        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
        return () => {
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
        };
    }, [isResizingLeftPanel]);

    useEffect(() => {
        if (!isResizingLibrary) return;

        const onMove = (e) => {
            const nextWidth = window.innerWidth - e.clientX;
            setLibraryWidth(clamp(nextWidth, MIN_LIBRARY_PANEL_WIDTH, MAX_LIBRARY_PANEL_WIDTH));
        };

        const onUp = () => setIsResizingLibrary(false);

        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
        return () => {
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
        };
    }, [isResizingLibrary]);

    useEffect(() => {
        if (!isResizingTimeline) return;

        const onMove = (e) => {
            const newHeight = window.innerHeight - e.clientY;
            setTimelineHeight(Math.max(MIN_TIMELINE_HEIGHT, Math.min(window.innerHeight - RESERVED_EDITOR_HEIGHT, newHeight)));
        };

        const onUp = () => setIsResizingTimeline(false);

        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
        return () => {
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
        };
    }, [isResizingTimeline]);

    const captureUiDebugFrames = async (targetTimes) => {
        const allVideoClips = projectState.tracks
            .flat()
            .filter(c => c.type === 'video')
            .sort((a, b) => a.startAt - b.startAt);
        if (allVideoClips.length === 0) return [];

        const groupedTargets = new Map();
        [...new Set(targetTimes
            .filter(v => Number.isFinite(v) && v >= 0)
            .map(v => Number(v.toFixed(2))))]
            .forEach((time) => {
                const clip = allVideoClips.find(item => time >= item.startAt && time <= item.startAt + item.duration + 0.01);
                if (!clip) return;
                if (!groupedTargets.has(clip.id)) groupedTargets.set(clip.id, { clip, times: [] });
                groupedTargets.get(clip.id).times.push(time);
            });

        const frames = [];
        let frameSeq = 1;
        for (const { clip, times } of groupedTargets.values()) {
            const tempVid = document.createElement('video');
            tempVid.src = clip.src;
            await new Promise((resolve) => {
                tempVid.onloadeddata = resolve;
                tempVid.load();
                setTimeout(resolve, 2000);
            });

            const canvas = document.createElement('canvas');
            canvas.width = tempVid.videoWidth || 1280;
            canvas.height = tempVid.videoHeight || 720;
            const ctx = canvas.getContext('2d');

            for (const targetTime of times.sort((a, b) => a - b)) {
                const sourceTime = Number((clip.trimStart + ((targetTime - clip.startAt) * (clip.playbackRate || 1.0))).toFixed(3));
                const safeSourceTime = Math.max(clip.trimStart, Math.min(sourceTime, Math.max(clip.trimStart, clip.trimEnd - 0.01)));
                await new Promise((resolve) => {
                    let done = false;
                    const timeout = setTimeout(() => {
                        if (!done) {
                            done = true;
                            resolve();
                        }
                    }, 500);
                    tempVid.onseeked = () => {
                        if (!done) {
                            clearTimeout(timeout);
                            done = true;
                            resolve();
                        }
                    };
                    tempVid.currentTime = safeSourceTime;
                });
                ctx.drawImage(tempVid, 0, 0, canvas.width, canvas.height);
                const hdBase64 = canvas.toDataURL('image/jpeg', 0.88).split(',')[1];
                const visualMetrics = computeFrameVisualMetrics(canvas);
                frames.push({
                    frameId: frameSeq++,
                    relativeTime: Number(targetTime.toFixed(2)),
                    relativeTimeMs: Math.round(targetTime * 1000),
                    hdData: hdBase64,
                    visualMetrics
                });
            }
        }

        return frames;
    };

    const generateUxResearchReport = async () => {
        const flowName = String(projectState.uxResearchFlowName || '').trim();
        const researchGoal = String(projectState.uxResearchGoal || '').trim();
        const targetAudience = String(projectState.uxResearchAudience || '').trim();
        const successSignal = String(projectState.uxResearchSuccessSignal || '').trim();
        const focusAreas = String(projectState.uxResearchFocusAreas || '').trim();
        const includeEyeTracking = projectState.uxResearchIncludeEyeTracking === true;
        const cameraNotes = String(projectState.uxResearchCameraNotes || '').trim();
        const allVideoClips = projectState.tracks.flat().filter(c => c.type === 'video').sort((a, b) => a.startAt - b.startAt);
        const thresholds = {
            ...uxResearchSkill.defaultThresholds,
            ...(projectState.uxResearchThresholds || {})
        };

        if (!flowName) {
            updateUxResearchStatus({
                phase: 'error',
                message: '尚未填寫 UX flow',
                detail: '請先描述本次要研究的 UX flow，例如 iPhone 購買流程。'
            });
            return alert('請先填寫本次 UX flow。');
        }
        if (allVideoClips.length === 0) {
            updateUxResearchStatus({
                phase: 'error',
                message: '找不到可分析的影片',
                detail: '請先錄下一段使用者操作流程，再執行 UX 研究分析。'
            });
            return alert('時間軸上沒有可供分析的影片片段！請先錄影。');
        }
        if (uiDebugProvider === 'azure' && !azureVisionKey) return alert('請先在設定中輸入 Azure Vision API Key');
        if (uiDebugProvider === 'gemini' && !settings.apiKey) return alert('請先在設定中輸入 Gemini API Key');
        if (uiDebugProvider === 'lmstudio' && (!lmStudioEndpoint || !settings.lmStudioChatModel?.trim())) return alert('請先在設定中填入 LM Studio Base URL 與文字 / Chat 模型');
        if (uiDebugProvider === 'ollama' && (!ollamaEndpoint || !settings.ollamaChatModel?.trim())) return alert('請先在設定中填入 Ollama Endpoint 與文字 / Chat 模型');

        const progress = (currentStep, totalSteps, stageLabel, detail) => {
            const progressPercent = totalSteps > 0 ? Math.round((currentStep / totalSteps) * 100) : 0;
            setAiProgress(createProgressText(currentStep, totalSteps, stageLabel, progressPercent));
            updateUxResearchStatus({
                phase: 'running',
                message: 'UX研究分析中',
                detail,
                aiLabel: uiDebugAiLabel,
                currentStep,
                totalSteps,
                progressPercent,
                stageLabel
            });
        };

        setActiveAiTask('ux-research');
        setAiLoading(true);
        progress(1, 5, '整理研究資料', `正在整理「${flowName}」的 click timeline、等待訊號與 UX 摩擦線索...`);

        try {
            const rangeStart = Number(projectState.recordingRange?.startEpochMs || recordStartTimeRef.current || 0);
            const rangeEnd = Number(projectState.recordingRange?.endEpochMs || recordEndTimeRef.current || 0);
            const recordingSessionId = projectState.recordingSessionId || recordingSessionIdRef.current || '';
            const uxClipEpochRanges = buildClipEpochRanges(allVideoClips, rangeStart, recordingSessionId);
            const clickEvents = (await loadGlobalClickLog())
                .filter(ev => typeof ev?.epochMs === 'number')
                .filter(ev => !recordingSessionId || (ev?.sessionId || '') === recordingSessionId)
                .sort((a, b) => a.epochMs - b.epochMs)
                .map((ev, index) => {
                    const clickTime = epochMsToTimelineTime(ev.epochMs, uxClipEpochRanges, rangeStart);
                    if (clickTime === null || clickTime < 0) return null;
                    return {
                        clickId: ev.id || `click_${index + 1}`,
                        epochMs: ev.epochMs,
                        clickTime: Number(clickTime.toFixed(2)),
                        targetText: String(ev.targetText || '').trim(),
                        href: String(ev.href || '').trim()
                    };
                })
                .filter(Boolean);

            if (clickEvents.length === 0) {
                updateUxResearchStatus({
                    phase: 'error',
                    message: '沒有偵測到點擊事件',
                    detail: '請確認錄影時已開啟全域紅圈，這樣 UX 研究才能重建流程。'
                });
                throw new Error('沒有偵測到 click timeline，無法建立 UX flow 研究。');
            }

            progress(2, 5, '對齊行為與事件', `已載入 ${clickEvents.length} 筆點擊事件，正在對齊 console、network、performance 與可讀性訊號...`);
            const debugEvents = (await loadGlobalDebugLog())
                .filter(ev => typeof ev?.timestamp === 'number')
                .filter(ev => !recordingSessionId || (ev?.sessionId || '') === recordingSessionId)
                .filter(ev => !rangeStart || ev.timestamp >= rangeStart)
                .filter(ev => !rangeEnd || ev.timestamp <= rangeEnd)
                .sort((a, b) => a.timestamp - b.timestamp)
                .map((ev, index) => ({
                    id: ev.id || `dbg_${index + 1}`,
                    type: ev.type || 'unknown',
                    level: ev.level || '',
                    source: ev.source || 'page',
                    text: String(ev.text || '').trim(),
                    durationMs: Number.isFinite(Number(ev.durationMs)) ? Number(ev.durationMs) : 0,
                    status: Number.isFinite(Number(ev.status)) ? Number(ev.status) : null,
                    method: ev.method || '',
                    url: ev.url || '',
                    timestamp: ev.timestamp,
                    relativeTime: Number((((ev.timestamp - rangeStart) || 0) / 1000).toFixed(2)),
                    detail: ev.detail || null
                }));

            progress(3, 5, '判讀 UX 摩擦', '正在依停留時間、等待訊號、可讀性與互動結果推論摩擦原因...');
            const interactions = clickEvents.map((click, index) => {
                const nextClick = clickEvents[index + 1];
                const windowEndMs = Math.min(
                    nextClick?.epochMs || (click.epochMs + 7000),
                    rangeEnd || (click.epochMs + 7000)
                );
                const relatedEvents = debugEvents.filter(ev => ev.timestamp >= click.epochMs && ev.timestamp <= windowEndMs);
                const consoleEvents = relatedEvents.filter(ev => ev.type === 'console');
                const networkEvents = relatedEvents.filter(ev => ev.type === 'network');
                const performanceEvents = relatedEvents.filter(ev => ev.type === 'performance');
                const domEvents = relatedEvents.filter(ev => ev.type === 'dom');
                const hoverEvents = relatedEvents.filter(ev => ev.type === 'hover');
                const layoutEvents = relatedEvents.filter(ev => ev.type === 'layout');
                const contrastEvents = relatedEvents.filter(ev => ev.type === 'contrast');
                const resourceErrorEvents = relatedEvents.filter(ev => ev.type === 'resource-error');
                const settledCandidate = [
                    click.epochMs,
                    ...relatedEvents.map(ev => ev.timestamp + Math.max(0, ev.durationMs || 0))
                ];
                const settledEpoch = Math.max(...settledCandidate);
                const settledTime = Number((((settledEpoch - rangeStart) || 0) / 1000).toFixed(2));
                const transitionDurationMs = Math.max(0, Math.round(settledEpoch - click.epochMs));
                const observationDurationMs = Math.max(0, Math.round(windowEndMs - click.epochMs));
                const maxNetworkDurationMs = networkEvents.reduce((max, item) => Math.max(max, item.durationMs || 0), 0);
                const maxLongTaskMs = performanceEvents
                    .filter(item => (item.detail?.entryType || '') === 'longtask')
                    .reduce((max, item) => Math.max(max, item.durationMs || 0), 0);
                const pageConsoleErrorCount = consoleEvents.filter(item => item.level === 'error' && item.source !== 'openviscribe-ui').length;
                const consoleWarnCount = consoleEvents.filter(item => item.level === 'warn').length;
                const failedNetworkCount = networkEvents.filter(item => (item.status || 0) === 0 || (item.status || 0) >= 400).length;
                const slowNetworkCount = networkEvents.filter(item => (item.durationMs || 0) >= thresholds.slowNetworkMs).length;
                const longTaskCount = performanceEvents.filter(item => (item.detail?.entryType || '') === 'longtask' && (item.durationMs || 0) >= Math.min(200, thresholds.longTaskMs)).length;
                const domMutationCount = domEvents.reduce((sum, item) => sum + Number(item?.detail?.mutationCount || 0), 0);
                const hoverCount = hoverEvents.length;
                const repeatedHoverTargets = Array.from(new Set(hoverEvents.map(item => formatAiSummaryItem(item?.detail?.label || item?.text)).filter(Boolean)));
                const totalHoverDurationMs = hoverEvents.reduce((sum, item) => sum + Math.max(0, Number(item.durationMs || 0)), 0);
                const maxHoverDurationMs = hoverEvents.reduce((max, item) => Math.max(max, Number(item.durationMs || 0)), 0);
                const layoutAnomalyCount = layoutEvents.length;
                const lowContrastCount = contrastEvents.reduce((sum, item) => sum + Number(item?.detail?.lowContrastCount || 0), 0);
                const severeContrastCount = contrastEvents.reduce((sum, item) => sum + Number(item?.detail?.severeContrastCount || 0), 0);
                const resourceErrorCount = resourceErrorEvents.length;
                const readabilityIssue = lowContrastCount > 0 || severeContrastCount > 0 || layoutAnomalyCount > 0;
                const performanceIssue = failedNetworkCount > 0
                    || maxNetworkDurationMs >= thresholds.slowNetworkMs
                    || maxLongTaskMs >= thresholds.longTaskMs
                    || resourceErrorCount > 0;
                const hesitationLikely = observationDurationMs >= thresholds.hesitationMs
                    && failedNetworkCount === 0
                    && maxNetworkDurationMs < thresholds.slowNetworkMs
                    && maxLongTaskMs < thresholds.longTaskMs
                    && pageConsoleErrorCount === 0;
                const longDwell = observationDurationMs >= thresholds.longDwellMs;
                const visualClutterLikely = !performanceIssue
                    && pageConsoleErrorCount === 0
                    && (
                        (layoutAnomalyCount > 0 && (hoverCount >= thresholds.hoverCount || longDwell))
                        || (lowContrastCount + severeContrastCount >= 2 && (hoverCount >= thresholds.hoverCount || hesitationLikely))
                        || (readabilityIssue && repeatedHoverTargets.length >= 2 && observationDurationMs >= thresholds.readingOrComparisonMs)
                    );
                let primaryCause = 'thinking';
                if (failedNetworkCount > 0 || maxNetworkDurationMs >= thresholds.verySlowNetworkMs) primaryCause = 'network';
                else if (maxLongTaskMs >= thresholds.longTaskMs || longTaskCount >= 2) primaryCause = 'ui-blocking';
                else if (visualClutterLikely) primaryCause = 'visual-clutter';
                else if (readabilityIssue) primaryCause = 'readability';
                else if (pageConsoleErrorCount > 0 || resourceErrorCount > 0) primaryCause = 'broken-state';
                else if (hoverCount >= thresholds.hoverCount && totalHoverDurationMs >= thresholds.hoverDurationMs) primaryCause = 'navigation-friction';
                else if (consoleWarnCount > 0 || domMutationCount >= thresholds.domMutationBurst) primaryCause = 'confusion';
                else if (observationDurationMs >= thresholds.readingOrComparisonMs) primaryCause = 'reading-or-comparison';
                const causeLabel = primaryCause === 'network'
                    ? '較像在等待網頁或 API'
                    : primaryCause === 'ui-blocking'
                        ? '較像在等待前端渲染或主執行緒'
                        : primaryCause === 'visual-clutter'
                            ? '較像頁面排版、資訊層級或視覺焦點太凌亂，導致找不到重點'
                        : primaryCause === 'readability'
                            ? '較像資訊可讀性或視覺層級問題'
                            : primaryCause === 'broken-state'
                                ? '較像頁面錯誤或狀態損壞'
                                : primaryCause === 'navigation-friction'
                                    ? '較像選單、導覽或互動區設計讓使用者反覆試探'
                                : primaryCause === 'confusion'
                                    ? '較像介面訊號不清或操作困惑'
                                    : '較像使用者在閱讀、比較或思考';
                const evidence = [];
                if (observationDurationMs > 0) evidence.push(`停留 ${observationDurationMs}ms`);
                if (transitionDurationMs > 0) evidence.push(`畫面穩定花費 ${transitionDurationMs}ms`);
                if (failedNetworkCount > 0) evidence.push(`${failedNetworkCount} 筆失敗或異常請求`);
                if (slowNetworkCount > 0) evidence.push(`${slowNetworkCount} 筆慢請求`);
                if (maxLongTaskMs >= thresholds.longTaskMs) evidence.push(`最長 long task ${maxLongTaskMs}ms`);
                if (pageConsoleErrorCount > 0) evidence.push(`${pageConsoleErrorCount} 筆 page console error`);
                if (consoleWarnCount > 0) evidence.push(`${consoleWarnCount} 筆 console warning`);
                if (domMutationCount >= thresholds.domMutationBurst) evidence.push(`DOM mutation burst ${domMutationCount}`);
                if (layoutAnomalyCount > 0) evidence.push(`${layoutAnomalyCount} 筆 layout anomaly`);
                if (hoverCount > 0) evidence.push(`${hoverCount} 筆 hover 停留，累積 ${totalHoverDurationMs}ms`);
                if (repeatedHoverTargets.length > 0) evidence.push(`hover 區域: ${repeatedHoverTargets.slice(0, 3).join(' / ')}`);
                if (lowContrastCount > 0 || severeContrastCount > 0) evidence.push(`低對比訊號 ${lowContrastCount} / 嚴重低對比 ${severeContrastCount}`);
                if (resourceErrorCount > 0) evidence.push(`${resourceErrorCount} 筆資源載入失敗`);
                if (visualClutterLikely) evidence.push('排版 / 資訊層級凌亂候選訊號成立');
                let hypothesis = '使用者應該在完成這一步之前停下來觀察內容。';
                if (primaryCause === 'network') hypothesis = '主要等待比較像是系統回應慢，使用者停留不一定代表看不懂，而是頁面尚未準備好。';
                else if (primaryCause === 'ui-blocking') hypothesis = '主要等待較像前端卡頓或畫面重新渲染，這會打斷操作節奏並放大不確定感。';
                else if (primaryCause === 'visual-clutter') hypothesis = '這一步較像頁面中同時存在太多競爭資訊、區塊層級不清或視覺焦點分散，導致使用者需要花時間找重點與判斷下一步。';
                else if (primaryCause === 'readability') hypothesis = '畫面可能存在對比、字級、版面層級或內容辨識問題，使用者需要更久才能確認下一步。';
                else if (primaryCause === 'broken-state') hypothesis = '這一步可能遇到錯誤狀態或資源缺失，使用者停住是因為頁面沒有給出可靠回饋。';
                else if (primaryCause === 'navigation-friction') hypothesis = '使用者在點擊前反覆 hover 或停留在可互動區，常見於選單標示不清、hover 狀態不明顯，或點擊熱區太難判讀。';
                else if (primaryCause === 'confusion') hypothesis = '使用者可能已點擊，但介面回饋不夠清楚，因此停留並重新判斷是否操作成功。';
                else if (primaryCause === 'reading-or-comparison') hypothesis = '這段停留較像閱讀資訊、比對方案或思考決策，不一定是 bug，但可能存在決策負擔。';
                const recommendations = [];
                if (primaryCause === 'network') recommendations.push('優先縮短關鍵請求時間，並補上明確 loading / skeleton / progress 回饋。');
                if (primaryCause === 'ui-blocking') recommendations.push('減少主執行緒長任務，避免互動後整頁重繪或同步計算。');
                if (primaryCause === 'visual-clutter') recommendations.push('重整版面層級與資訊群組，減少同時競爭注意力的區塊，讓主 CTA、關鍵狀態與主要任務路徑更容易被一眼辨識。');
                if (primaryCause === 'readability') recommendations.push('提高文字與背景對比、放大關鍵字級，並強化 CTA 與資訊層級。');
                if (primaryCause === 'broken-state') recommendations.push('先排除錯誤狀態與資源載入失敗，避免把系統問題誤判成使用者理解問題。');
                if (primaryCause === 'navigation-friction') recommendations.push('檢查 hover 狀態、選單命名、點擊熱區與展開/收合規則，避免使用者必須多次試探才能找到可點元素。');
                if (primaryCause === 'confusion') recommendations.push('加強點擊後的回饋、狀態切換提示與表單欄位說明，降低操作猶豫。');
                if (primaryCause === 'reading-or-comparison') recommendations.push('精簡資訊密度，將比較成本高的內容拆成更易掃描的區塊與摘要。');
                if (includeEyeTracking) recommendations.push('若同步錄到眼睛或臉部鏡頭，可檢查是否出現來回掃視、長時間凝視或視線避開 CTA。');
                const frictionScore = [
                    observationDurationMs >= thresholds.hesitationMs ? 1 : 0,
                    performanceIssue ? 2 : 0,
                    readabilityIssue ? 2 : 0,
                    hoverCount >= thresholds.hoverCount ? 1 : 0,
                    hesitationLikely ? 1 : 0,
                    pageConsoleErrorCount > 0 ? 2 : 0
                ].reduce((sum, value) => sum + value, 0);
                const severity = frictionScore >= 4 ? 'high' : frictionScore >= 2 ? 'medium' : 'low';
                const confidence = performanceIssue || readabilityIssue || pageConsoleErrorCount > 0 ? 'high' : hesitationLikely || longDwell ? 'medium' : 'low';
                return {
                    eventIndex: index + 1,
                    clickId: click.clickId,
                    clickTime: click.clickTime,
                    settledTime,
                    observationDurationMs,
                    transitionDurationMs,
                    targetText: click.targetText,
                    href: click.href,
                    evidence,
                    hypothesis,
                    recommendations,
                    primaryCause,
                    causeLabel,
                    severity,
                    confidence,
                    frictionScore,
                    hesitationLikely,
                    readabilityIssue,
                    performanceIssue,
                    longDwell,
                    failedNetworkCount,
                    slowNetworkCount,
                    maxNetworkDurationMs,
                    maxLongTaskMs,
                    lowContrastCount,
                    severeContrastCount,
                    layoutAnomalyCount,
                    pageConsoleErrorCount,
                    consoleWarnCount,
                    domMutationCount,
                    hoverCount,
                    totalHoverDurationMs,
                    maxHoverDurationMs,
                    repeatedHoverTargets,
                    resourceErrorCount
                };
            });

            const screenshotTargets = interactions
                .filter(item => item.frictionScore > 0 || item.longDwell || item.readabilityIssue || item.hoverCount > 0)
                .flatMap(item => {
                    const settled = Math.min(item.settledTime || item.clickTime, item.clickTime + 2);
                    const hoverProbe = item.hoverCount > 0 ? Number(Math.max(item.clickTime - 0.4, 0).toFixed(2)) : null;
                    return [hoverProbe, item.clickTime, Number(settled.toFixed(2))].filter((value) => Number.isFinite(value));
                });
            const uxResearchFrames = await captureUiDebugFrames(screenshotTargets);
            const frameByTime = new Map(uxResearchFrames.map(frame => [frame.relativeTime.toFixed(2), frame]));

            const enrichedInteractions = interactions.map((item) => {
                const settledFrame = frameByTime.get(Number(Math.min(item.settledTime || item.clickTime, item.clickTime + 2).toFixed(2)).toFixed(2));
                return {
                    ...item,
                    hasScreenshot: Boolean(settledFrame)
                };
            });

            const flaggedInteractions = [...enrichedInteractions]
                .filter(item => item.frictionScore > 0 || item.longDwell || item.readabilityIssue || item.hoverCount > 0)
                .sort((a, b) => (b.frictionScore || 0) - (a.frictionScore || 0) || (b.observationDurationMs || 0) - (a.observationDurationMs || 0));
            const flaggedInteractionsByEvent = [...flaggedInteractions]
                .sort((a, b) => (a.eventIndex || 0) - (b.eventIndex || 0));
            const frictionInteractions = [...enrichedInteractions]
                .filter(item => item.frictionScore >= 2 || item.longDwell || item.readabilityIssue)
                .sort((a, b) => (b.frictionScore || 0) - (a.frictionScore || 0) || (b.observationDurationMs || 0) - (a.observationDurationMs || 0));
            const navigationFrictionInteractions = flaggedInteractions
                .filter(item => item.primaryCause === 'navigation-friction' || item.hoverCount >= 2)
                .sort((a, b) => (b.totalHoverDurationMs || 0) - (a.totalHoverDurationMs || 0) || (b.hoverCount || 0) - (a.hoverCount || 0));
            const navigationFrictionInteractionsByEvent = [...navigationFrictionInteractions]
                .sort((a, b) => (a.eventIndex || 0) - (b.eventIndex || 0));
            const longDwellCount = enrichedInteractions.filter(item => item.longDwell).length;
            const hesitationCount = enrichedInteractions.filter(item => item.hesitationLikely).length;
            const readabilityIssueCount = enrichedInteractions.filter(item => item.readabilityIssue).length;
            const uxResearchEventSubtitles = createUxResearchEventSubtitles(flaggedInteractions);
            const environmentInfo = {
                os: parseOsInfo(navigator.userAgent),
                browser: parseBrowserInfo(navigator.userAgent),
                protocol: window.location.protocol || '',
                host: window.location.host || '',
                url: window.location.href || '',
                pageTitle: document.title || '',
                sessionId: recordingSessionId || '-',
                recordingStart: formatEpochMs(rangeStart),
                recordingEnd: formatEpochMs(rangeEnd),
                userAgent: navigator.userAgent || ''
            };

            progress(4, 5, '生成研究摘要', `規則式分析已完成，正在使用 ${uiDebugProviderLabel} (${uiDebugModelLabel}) 生成 UX researcher 摘要...`);
            let aiGeneratedSummary = null;
            try {
                const aiSummaryInput = {
                    flowName,
                    researchGoal,
                    targetAudience,
                    successSignal,
                    focusAreas,
                    includeEyeTracking,
                    cameraNotes,
                    environment: environmentInfo,
                    totalInteractions: enrichedInteractions.length,
                    frictionCount: flaggedInteractions.length,
                    longDwellCount,
                    hesitationCount,
                    readabilityIssueCount,
                    topInteractions: flaggedInteractions.slice(0, 8).map(item => ({
                        eventIndex: item.eventIndex,
                        targetText: item.targetText,
                        clickTime: item.clickTime,
                        observationDurationMs: item.observationDurationMs,
                        primaryCause: item.primaryCause,
                        causeLabel: item.causeLabel,
                        severity: item.severity,
                        confidence: item.confidence,
                        hoverCount: item.hoverCount,
                        totalHoverDurationMs: item.totalHoverDurationMs,
                        evidence: item.evidence,
                        hypothesis: item.hypothesis
                    }))
                };
                const uxSystemText = settings.language === 'zh-TW'
                    ? '你是一位資深 UX researcher。請根據提供的使用者流程與行為訊號，回傳純 JSON，包含 overview, keyFindings(陣列), prioritizedActions(陣列), eyeTrackingHypotheses(陣列)。eyeTrackingHypotheses 內每一項請盡量回傳 {eventIndex, targetText, hypothesis}，讓假設可以對應到事件編號。只能根據輸入推論，不可捏造沒有證據的結論。'
                    : 'You are a senior UX researcher. Return pure JSON with overview, keyFindings (array), prioritizedActions (array), and eyeTrackingHypotheses (array). For eyeTrackingHypotheses, prefer objects shaped like {eventIndex, targetText, hypothesis} so each hypothesis maps to a concrete event. Ground conclusions only in the provided evidence.';
                const uxUserText = `請根據以下 UX 研究資料，整理專業摘要。\n\n${JSON.stringify(aiSummaryInput)}`;
                let rawAiSummaryText = '';
                if (uiDebugProvider === 'azure') {
                    if (!azureVisionEndpoint || !settings.azureDeployment) throw new Error('請至設定填寫完整的 Azure Vision Endpoint 與 Vision 部署名稱。');
                    const azureUrl = `${azureVisionEndpoint.replace(/\/+$/, '')}/openai/deployments/${settings.azureDeployment}/chat/completions?api-version=2024-02-15-preview`;
                    const response = await fetch(azureUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'api-key': azureVisionKey },
                        body: JSON.stringify({
                            messages: [
                                { role: 'system', content: uxSystemText },
                                { role: 'user', content: uxUserText }
                            ],
                            temperature: 0.1,
                            response_format: { type: 'json_object' }
                        })
                    });
                    if (!response.ok) throw new Error(`HTTP 錯誤 ${response.status}`);
                    const data = await response.json();
                    rawAiSummaryText = data.choices?.[0]?.message?.content || '';
                } else if (uiDebugProvider === 'gemini') {
                    const safeApiKey = encodeURIComponent(settings.apiKey.trim());
                    const responseSchema = {
                        type: 'OBJECT',
                        properties: {
                            overview: { type: 'STRING' },
                            keyFindings: { type: 'ARRAY', items: { type: 'STRING' } },
                            prioritizedActions: { type: 'ARRAY', items: { type: 'STRING' } },
                            eyeTrackingHypotheses: {
                                type: 'ARRAY',
                                items: {
                                    type: 'OBJECT',
                                    properties: {
                                        eventIndex: { type: 'NUMBER' },
                                        targetText: { type: 'STRING' },
                                        hypothesis: { type: 'STRING' }
                                    },
                                    required: ['eventIndex', 'hypothesis']
                                }
                            }
                        },
                        required: ['overview', 'keyFindings', 'prioritizedActions', 'eyeTrackingHypotheses']
                    };
                    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${settings.model}:generateContent?key=${safeApiKey}`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            contents: [{ parts: [{ text: `${uxSystemText}\n\n${uxUserText}` }] }],
                            generationConfig: { temperature: 0.1, responseMimeType: 'application/json', responseSchema }
                        })
                    });
                    if (!response.ok) throw new Error(`HTTP 錯誤 ${response.status}`);
                    const data = await response.json();
                    rawAiSummaryText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
                } else if (uiDebugProvider === 'lmstudio') {
                    rawAiSummaryText = await callLmStudioChat({
                        endpoint: lmStudioEndpoint,
                        apiKey: lmStudioApiKey,
                        model: settings.lmStudioChatModel.trim(),
                        temperature: 0.1,
                        format: 'json',
                        timeoutMs: lmStudioTimeoutMs,
                        prompt: `${uxSystemText}\n\n${uxUserText}`
                    });
                } else {
                    rawAiSummaryText = await callOllamaChat({
                        endpoint: ollamaEndpoint,
                        model: settings.ollamaChatModel.trim(),
                        temperature: 0.1,
                        format: 'json',
                        timeoutMs: ollamaTimeoutMs,
                        prompt: `${uxSystemText}\n\n${uxUserText}`
                    });
                }
                if (rawAiSummaryText) {
                    aiGeneratedSummary = JSON.parse(rawAiSummaryText.replace(/```json/gi, '').replace(/```/g, '').trim());
                }
            } catch (error) {
                console.warn('ux research ai summary failed', error);
            }

            progress(5, 5, '寫入研究報告', '正在整理 Markdown 報告、研究摘要與截圖引用...');
            let markdownDoc = `# UX Research Report\n\n`;
            markdownDoc += `## Research Brief\n`;
            markdownDoc += appendMarkdownTable(
                ['Field', 'Value'],
                [
                    ['UX flow', flowName],
                    ['Research goal', researchGoal || '-'],
                    ['Target audience', targetAudience || '-'],
                    ['Success criteria', successSignal || '-'],
                    ['Focus areas', focusAreas || '-'],
                    ['Eye tracking enabled', includeEyeTracking ? 'Yes' : 'No'],
                    ['Camera notes', cameraNotes || '-']
                ]
            );
            markdownDoc += `## Summary\n`;
            markdownDoc += appendMarkdownTable(
                ['Metric', 'Value'],
                [
                    ['總互動數', enrichedInteractions.length],
                    ['已標記事件數', flaggedInteractions.length],
                    ['高摩擦互動數', frictionInteractions.length],
                    ['長時間停留數', longDwellCount],
                    ['可讀性風險數', readabilityIssueCount],
                    ['猶豫 / 思考候選數', hesitationCount],
                    ['Hover 摩擦候選數', navigationFrictionInteractions.length],
                    ['AI 模型', `${uiDebugProviderLabel} / ${uiDebugModelLabel}`]
                ]
            );
            markdownDoc += `## Environment\n`;
            markdownDoc += appendMarkdownTable(
                ['Field', 'Value'],
                [
                    ['OS', environmentInfo.os],
                    ['Browser', environmentInfo.browser],
                    ['Protocol', environmentInfo.protocol],
                    ['Host', environmentInfo.host],
                    ['URL', environmentInfo.url],
                    ['Page title', environmentInfo.pageTitle],
                    ['Session ID', environmentInfo.sessionId],
                    ['Recording start', environmentInfo.recordingStart],
                    ['Recording end', environmentInfo.recordingEnd]
                ]
            );
            const normalizedKeyFindings = normalizeAiSummaryList(aiGeneratedSummary?.keyFindings);
            const normalizedPrioritizedActions = normalizeAiSummaryList(aiGeneratedSummary?.prioritizedActions);
            const normalizedEyeTrackingHypotheses = Array.isArray(aiGeneratedSummary?.eyeTrackingHypotheses)
                ? aiGeneratedSummary.eyeTrackingHypotheses
                    .map((item) => {
                        if (typeof item === 'string') {
                            return { eventIndex: null, targetText: '', hypothesis: item.trim() };
                        }
                        if (!item || typeof item !== 'object') return null;
                        const hypothesis = formatAiSummaryItem(item.hypothesis || item.summary || item.text || item.description);
                        if (!hypothesis) return null;
                        const eventIndex = Number.isFinite(Number(item.eventIndex)) ? Number(item.eventIndex) : null;
                        const targetText = formatAiSummaryItem(item.targetText || item.target || item.label || '');
                        return { eventIndex, targetText, hypothesis };
                    })
                    .filter(Boolean)
                : [];
            if (aiGeneratedSummary?.overview || normalizedKeyFindings.length) {
                markdownDoc += `## AI Research Synthesis\n`;
                const normalizedOverview = formatAiSummaryItem(aiGeneratedSummary?.overview);
                if (normalizedOverview) markdownDoc += `${normalizedOverview}\n\n`;
                if (normalizedKeyFindings.length) {
                    markdownDoc += `### Key Findings\n`;
                    normalizedKeyFindings.forEach(item => {
                        markdownDoc += `- ${item}\n`;
                    });
                    markdownDoc += `\n`;
                }
                if (normalizedPrioritizedActions.length) {
                    markdownDoc += `### Prioritized Actions\n`;
                    normalizedPrioritizedActions.forEach(item => {
                        markdownDoc += `- ${item}\n`;
                    });
                    markdownDoc += `\n`;
                }
                if (includeEyeTracking && normalizedEyeTrackingHypotheses.length) {
                    markdownDoc += `### Eye Tracking Hypotheses\n`;
                    normalizedEyeTrackingHypotheses.forEach(item => {
                        const eventPrefix = Number.isFinite(Number(item.eventIndex)) ? `E${Number(item.eventIndex)}` : '';
                        const targetSuffix = item.targetText ? ` ${item.targetText}` : '';
                        const prefix = `${eventPrefix}${targetSuffix}`.trim();
                        markdownDoc += prefix
                            ? `- ${prefix}: ${item.hypothesis}\n`
                            : `- ${item.hypothesis}\n`;
                    });
                    markdownDoc += `\n`;
                }
            }
            markdownDoc += `## Flow Timeline\n`;
            markdownDoc += appendMarkdownTable(
                ['Step', 'Target', 'Time', 'Dwell', 'Likely cause', 'Severity'],
                flaggedInteractionsByEvent.slice(0, 20).map(item => ([
                    `E${item.eventIndex}`,
                    item.targetText || item.href || '-',
                    `${item.clickTime.toFixed(2)}s`,
                    `${item.observationDurationMs}ms`,
                    item.causeLabel,
                    item.severity
                ]))
            );
            markdownDoc += `## Navigation Friction\n`;
            if (navigationFrictionInteractionsByEvent.length === 0) {
                markdownDoc += `目前沒有明顯的 hover 試探或導覽迷路訊號。\n\n`;
            } else {
                navigationFrictionInteractionsByEvent.slice(0, 8).forEach((item) => {
                    markdownDoc += `### Navigation E${item.eventIndex}: ${item.targetText || item.href || '-'}\n\n`;
                    markdownDoc += appendMarkdownTable(
                        ['Section', 'Detail'],
                        [
                            ['Hover count', String(item.hoverCount || 0)],
                            ['Hover duration', `${item.totalHoverDurationMs || 0}ms`],
                            ['Hover targets', item.repeatedHoverTargets?.length ? item.repeatedHoverTargets.slice(0, 4).join('<br />') : '-'],
                            ['Likely issue', item.causeLabel],
                            ['Hypothesis', item.hypothesis],
                            ['Recommendation', item.recommendations.join('<br />') || '-']
                        ]
                    );
                    const navFrame = frameByTime.get(Number(Math.min(item.clickTime, Math.max(item.clickTime - 0.4, 0)).toFixed(2)).toFixed(2))
                        || frameByTime.get(Number(Math.min(item.settledTime || item.clickTime, item.clickTime + 2).toFixed(2)).toFixed(2));
                    if (navFrame) {
                        markdownDoc += `\n![Navigation screenshot at ${navFrame.relativeTime.toFixed(2)}s](./${uxResearchSkill.exportImagePrefix}_${navFrame.frameId}.jpg)\n\n`;
                    }
                });
            }
            markdownDoc += `## Key Friction Points\n`;
            if (flaggedInteractionsByEvent.length === 0) {
                markdownDoc += `目前沒有明顯超過門檻的 UX friction，但仍建議檢查長時間閱讀與決策密度較高的頁面。\n\n`;
            } else {
                flaggedInteractionsByEvent.forEach((item, index) => {
                    markdownDoc += `### Finding E${item.eventIndex}: ${item.targetText || item.href || `Interaction ${index + 1}`}\n\n`;
                    markdownDoc += appendMarkdownTable(
                        ['Section', 'Detail'],
                        [
                            ['Click time', `${item.clickTime.toFixed(2)}s`],
                            ['Settled', `${item.settledTime.toFixed(2)}s`],
                            ['Observation window', `${item.observationDurationMs}ms`],
                            ['Likely cause', item.causeLabel],
                            ['Severity', item.severity],
                            ['Confidence', item.confidence],
                            ['Hover signals', item.hoverCount > 0 ? `${item.hoverCount} 次 / ${item.totalHoverDurationMs}ms${item.repeatedHoverTargets?.length ? ` / ${item.repeatedHoverTargets.slice(0, 3).join(' / ')}` : ''}` : '未檢出明顯 hover 摩擦' ],
                            ['Hypothesis', item.hypothesis],
                            ['Evidence', item.evidence.join('<br />') || '-'],
                            ['Recommendations', item.recommendations.join('<br />') || '-']
                        ]
                    );
                    const frame = frameByTime.get(Number(Math.min(item.settledTime || item.clickTime, item.clickTime + 2).toFixed(2)).toFixed(2))
                        || frameByTime.get(Number(Math.max(item.clickTime - 0.4, 0).toFixed(2)).toFixed(2));
                    if (frame) {
                        markdownDoc += `\n![Screenshot at ${frame.relativeTime.toFixed(2)}s](./${uxResearchSkill.exportImagePrefix}_${frame.frameId}.jpg)\n`;
                    }
                    markdownDoc += `\n`;
                });
            }
            markdownDoc += `## Research Recommendations\n`;
            const consolidatedRecommendations = Array.from(new Set(
                frictionInteractions.flatMap(item => item.recommendations || [])
            ));
            if (consolidatedRecommendations.length === 0) {
                markdownDoc += `- 建議補錄更多高風險流程，或同步蒐集鏡頭與使用者口述資料，以提高 UX 推論信心。\n\n`;
            } else {
                consolidatedRecommendations.slice(0, 10).forEach(item => {
                    markdownDoc += `- ${item}\n`;
                });
                markdownDoc += `\n`;
            }
            if (includeEyeTracking) {
                markdownDoc += `## Eye Tracking Cross-analysis\n`;
                markdownDoc += `${cameraNotes || '本次已啟用眼動 / 鏡頭輔助分析。提醒：目前工具不會自動開啟電腦鏡頭，若要做眼動交叉分析，請先用外部工具或畫中畫方式把臉部 / 眼睛畫面錄進影片，再交由本報告輔助判讀。'}\n\n`;
            }

            const uxResearchReport = {
                generatedAt: Date.now(),
                flowName,
                researchGoal,
                targetAudience,
                successSignal,
                focusAreas,
                includeEyeTracking,
                cameraNotes,
                frictionCount: flaggedInteractions.length,
                longDwellCount,
                readabilityIssueCount,
                hesitationCount,
                navigationFrictionCount: navigationFrictionInteractions.length,
                aiSummaryProvider: uiDebugProvider,
                aiSummaryModel: uiDebugModelLabel,
                aiSummary: aiGeneratedSummary,
                interactions: enrichedInteractions,
                topFindings: flaggedInteractions.slice(0, 10),
                navigationFindings: navigationFrictionInteractions.slice(0, 8)
            };

            setProjectState(prev => ({
                ...prev,
                uxResearchMD: markdownDoc,
                uxResearchFrames,
                uxResearchReport,
                subtitles: [
                    ...prev.subtitles.filter(sub => !normalizeSubtitle(sub).uxResearchMarker),
                    ...uxResearchEventSubtitles
                ]
            }));
            updateUxResearchStatus({
                phase: 'success',
                message: 'UX研究報告已建立',
                detail: `已分析 ${enrichedInteractions.length} 次互動，整理出 ${flaggedInteractions.length} 個已標記事件，並同步加入事件字幕與截圖。`,
                aiLabel: uiDebugAiLabel,
                progressPercent: 100,
                currentStep: 5,
                totalSteps: 5,
                stageLabel: '完成',
                frictionCount: flaggedInteractions.length,
                longDwellCount,
                readabilityIssueCount,
                hesitationCount
            });
        } catch (error) {
            updateUxResearchStatus({
                phase: 'error',
                message: 'UX研究失敗',
                detail: error.message || '分析失敗'
            });
            alert(`UX研究分析失敗: ${error.message || '分析失敗'}`);
        } finally {
            setAiLoading(false);
            setAiProgress('');
            setActiveAiTask('');
        }
    };

    const generateUiDebugReport = async () => {
        const allVideoClips = projectState.tracks.flat().filter(c => c.type === 'video').sort((a, b) => a.startAt - b.startAt);
        const enabledChecks = {
            ...DEFAULT_UI_DEBUG_CHECKS,
            ...(projectState.uiDebugChecks || {})
        };
        const selectedTranslationLanguage = getTranslationOption(projectState.uiDebugTranslationLanguage || 'en');
        const thresholds = {
            ...uiDebugSkill.defaultThresholds,
            ...(projectState.uiDebugThresholds || {})
        };
        const uiDebugUseAiSummary = projectState.uiDebugUseAiSummary !== false;
        if (!Object.values(enabledChecks).some(Boolean)) {
            updateUiDebugStatus({
                phase: 'error',
                message: '尚未選擇檢查項目',
                detail: '請至少勾選 UI 錯誤檢查、安全檢查或翻譯檢查其中一項。'
            });
            return alert('請先勾選至少一種檢查類型，再開始產生報告。');
        }
        if (allVideoClips.length === 0) {
            updateUiDebugStatus({
                phase: 'error',
                message: '找不到可分析的影片',
                detail: '請先錄下一段操作流程，再切換到 Test Report 產生報告。'
            });
            return alert("時間軸上沒有可供分析的影片片段！請先錄影。");
        }
        if (uiDebugProvider === 'azure' && !azureVisionKey) return alert("請先在設定中輸入 Azure Vision API Key");
        if (uiDebugProvider === 'gemini' && !settings.apiKey) return alert("請先在設定中輸入 Gemini API Key");
        if (uiDebugProvider === 'lmstudio' && (!lmStudioEndpoint || !settings.lmStudioChatModel?.trim())) return alert("請先在設定中填入 LM Studio Base URL 與文字 / Chat 模型");
        if (uiDebugProvider === 'ollama' && (!ollamaEndpoint || !settings.ollamaChatModel?.trim())) return alert("請先在設定中填入 Ollama Endpoint 與文字 / Chat 模型");

        const debugProgress = (currentStep, totalSteps, stageLabel, detail) => {
            const progressPercent = totalSteps > 0 ? Math.round((currentStep / totalSteps) * 100) : 0;
            setAiProgress(createProgressText(currentStep, totalSteps, stageLabel, progressPercent));
            updateUiDebugStatus({
                phase: 'running',
                message: 'Test Report 分析中',
                detail,
                aiLabel: uiDebugAiLabel,
                currentStep,
                totalSteps,
                progressPercent,
                stageLabel
            });
        };

        setActiveAiTask('ui-debug');
        setAiLoading(true);
        debugProgress(
            1,
            uiDebugUseAiSummary ? 6 : 5,
            '收集互動與診斷訊號',
            uiDebugUseAiSummary
                ? `正在整理 click timeline、console、network 與 performance 訊號，並準備交給 ${uiDebugProviderLabel} (${uiDebugModelLabel}) 生成 Test Report 摘要...`
                : '正在整理 click timeline、console、network 與 performance 訊號...'
        );

        try {
            const rangeStart = Number(projectState.recordingRange?.startEpochMs || recordStartTimeRef.current || 0);
            const rangeEnd = Number(projectState.recordingRange?.endEpochMs || recordEndTimeRef.current || 0);
            const recordingSessionId = projectState.recordingSessionId || recordingSessionIdRef.current || '';
            const uiDebugClipEpochRanges = buildClipEpochRanges(allVideoClips, rangeStart, recordingSessionId);
            const clickEvents = (await loadGlobalClickLog())
                .filter(ev => typeof ev?.epochMs === 'number')
                .filter(ev => !recordingSessionId || (ev?.sessionId || '') === recordingSessionId)
                .sort((a, b) => a.epochMs - b.epochMs)
                .map((ev, index) => {
                    const clickTime = epochMsToTimelineTime(ev.epochMs, uiDebugClipEpochRanges, rangeStart);
                    if (clickTime === null || clickTime < 0) return null;
                    return {
                        clickId: ev.id || `click_${index + 1}`,
                        epochMs: ev.epochMs,
                        clickTime: Number(clickTime.toFixed(2)),
                        targetText: String(ev.targetText || '').trim(),
                        href: ev.href || ''
                    };
                })
                .filter(Boolean);

            if (clickEvents.length === 0) {
                updateUiDebugStatus({
                    phase: 'error',
                    message: '沒有偵測到點擊事件',
                    detail: '請確認錄影時已開啟全域紅圈，這樣 Test Report 才能對齊互動時間。'
                });
                throw new Error('沒有偵測到 click timeline，無法建立 Test Report。');
            }

            debugProgress(
                2,
                uiDebugUseAiSummary ? 6 : 5,
                '對齊 click timeline 與 debug log',
                `已對齊 ${clickEvents.length} 筆點擊事件，正在整理 console、network、performance 與 DOM 訊號...`
            );
            const debugEvents = (await loadGlobalDebugLog())
                .filter(ev => typeof ev?.timestamp === 'number')
                .filter(ev => !recordingSessionId || (ev?.sessionId || '') === recordingSessionId)
                .filter(ev => !rangeStart || ev.timestamp >= rangeStart)
                .filter(ev => !rangeEnd || ev.timestamp <= rangeEnd)
                .sort((a, b) => a.timestamp - b.timestamp)
                .map((ev, index) => ({
                    id: ev.id || `dbg_${index + 1}`,
                    type: ev.type || 'unknown',
                    level: ev.level || '',
                    source: ev.source || 'page',
                    text: String(ev.text || '').trim(),
                    durationMs: Number.isFinite(Number(ev.durationMs)) ? Number(ev.durationMs) : 0,
                    status: Number.isFinite(Number(ev.status)) ? Number(ev.status) : null,
                    method: ev.method || '',
                    url: ev.url || '',
                    timestamp: ev.timestamp,
                    relativeTime: Number((((ev.timestamp - rangeStart) || 0) / 1000).toFixed(2)),
                    detail: ev.detail || null
                }));

            debugProgress(
                3,
                uiDebugUseAiSummary ? 6 : 5,
                '分析互動風險',
                `已載入 ${debugEvents.length} 筆診斷事件，正在計算可疑互動、錯誤與風險訊號...`
            );
            const interactions = clickEvents.map((click, index) => {
                const nextClick = clickEvents[index + 1];
                const windowEndMs = Math.min(
                    nextClick?.epochMs || (click.epochMs + 6000),
                    rangeEnd || (click.epochMs + 6000)
                );
                const relatedEvents = debugEvents.filter(ev => ev.timestamp >= click.epochMs && ev.timestamp <= windowEndMs);
                const consoleEvents = relatedEvents.filter(ev => ev.type === 'console');
                const networkEvents = relatedEvents.filter(ev => ev.type === 'network');
                const performanceEvents = relatedEvents.filter(ev => ev.type === 'performance');
                const domEvents = relatedEvents.filter(ev => ev.type === 'dom');
                const securityEvents = relatedEvents.filter(ev => ev.type === 'security');
                const securityAuditEvents = relatedEvents.filter(ev => ev.type === 'security-audit');
                const layoutEvents = relatedEvents.filter(ev => ev.type === 'layout');
                const translationEvents = relatedEvents.filter(ev => ev.type === 'translation');
                const contrastEvents = relatedEvents.filter(ev => ev.type === 'contrast');
                const resourceErrorEvents = relatedEvents.filter(ev => ev.type === 'resource-error');
                const firstVisualChangeTime = relatedEvents.length > 0
                    ? Number((((relatedEvents[0].timestamp - rangeStart) || 0) / 1000).toFixed(2))
                    : click.clickTime;
                const settledCandidate = [
                    click.epochMs,
                    ...relatedEvents.map(ev => ev.timestamp + Math.max(0, ev.durationMs || 0))
                ];
                const settledEpoch = Math.max(...settledCandidate);
                const settledTime = Number((((settledEpoch - rangeStart) || 0) / 1000).toFixed(2));
                const transitionDurationMs = Math.max(0, Math.round(settledEpoch - click.epochMs));
                const maxNetworkDurationMs = networkEvents.reduce((max, item) => Math.max(max, item.durationMs || 0), 0);
                const maxLongTaskMs = performanceEvents
                    .filter(item => (item.detail?.entryType || '') === 'longtask')
                    .reduce((max, item) => Math.max(max, item.durationMs || 0), 0);
                const consoleErrorCount = consoleEvents.filter(item => item.level === 'error').length;
                const consoleWarnCount = consoleEvents.filter(item => item.level === 'warn').length;
                const failedNetworkCount = networkEvents.filter(item => (item.status || 0) === 0 || (item.status || 0) >= 400).length;
                const slowNetworkCount = networkEvents.filter(item => (item.durationMs || 0) >= thresholds.slowNetworkMs).length;
                const longTaskCount = performanceEvents.filter(item => (item.detail?.entryType || '') === 'longtask' && (item.durationMs || 0) >= Math.min(200, thresholds.longTaskMs)).length;
                const domMutationCount = domEvents.reduce((sum, item) => sum + Number(item?.detail?.mutationCount || 0), 0);
                const highDomMutation = domMutationCount >= thresholds.domMutationBurst || domEvents.length >= thresholds.domEventBurst;
                const uiConsoleErrorCount = consoleEvents.filter(item => item.level === 'error' && item.source === 'openviscribe-ui').length;
                const pageConsoleErrorCount = consoleEvents.filter(item => item.level === 'error' && item.source !== 'openviscribe-ui').length;
                const securityViolationCount = securityEvents.length;
                const mixedContentCount = securityAuditEvents.reduce((sum, item) => sum + Number(item?.detail?.mixedContentCount || 0), 0);
                const insecureFormCount = securityAuditEvents.reduce((sum, item) => sum + Number(item?.detail?.insecureFormCount || 0), 0);
                const unsafeBlankLinkCount = securityAuditEvents.reduce((sum, item) => sum + Number(item?.detail?.unsafeBlankLinkCount || 0), 0);
                const sensitiveStorageCount = securityAuditEvents.reduce((sum, item) => sum + Number(item?.detail?.sensitiveStorageCount || 0), 0);
                const layoutAnomalyCount = layoutEvents.length;
                const translationEntries = translationEvents.flatMap(item => item?.detail?.entries || []).filter(Boolean);
                const translationPageLang = translationEvents.find(item => item?.detail?.pageLang)?.detail?.pageLang || (document.documentElement.lang || navigator.language || '');
                const translationNavigatorLang = translationEvents.find(item => item?.detail?.navigatorLanguage)?.detail?.navigatorLanguage || (navigator.language || '');
                const untranslatedEntries = translationEntries.filter(entry =>
                    entry.looksLikeRawKey
                    || (selectedTranslationLanguage.script && entry.category !== 'other' && entry.category !== selectedTranslationLanguage.script)
                );
                const translationIssueEntries = translationEntries.filter(entry => entry.hasMixedScripts);
                const foreignScriptCount = untranslatedEntries.filter(entry =>
                    selectedTranslationLanguage.script && entry.category !== 'other' && entry.category !== selectedTranslationLanguage.script
                ).length;
                const mixedLanguageCount = translationIssueEntries.length;
                const untranslatedCount = untranslatedEntries.length;
                const translationIssueCount = translationIssueEntries.length;
                const untranslatedSamples = Array.from(new Set(untranslatedEntries.map(entry => entry.text).filter(Boolean))).slice(0, 5);
                const translationIssueSamples = Array.from(new Set(translationIssueEntries.map(entry => entry.text).filter(Boolean))).slice(0, 5);
                const lowContrastCount = contrastEvents.reduce((sum, item) => sum + Number(item?.detail?.lowContrastCount || 0), 0);
                const severeContrastCount = contrastEvents.reduce((sum, item) => sum + Number(item?.detail?.severeContrastCount || 0), 0);
                const resourceErrorCount = resourceErrorEvents.length;
                const problemTags = [];
                if (enabledChecks.ui) {
                    if (pageConsoleErrorCount > 0) problemTags.push('page-exception');
                    if (uiConsoleErrorCount > 0) problemTags.push('openviscribe-exception');
                    if (consoleWarnCount >= thresholds.warningCount && (transitionDurationMs >= Math.max(500, thresholds.slowTransitionMs * 0.6) || highDomMutation || failedNetworkCount > 0)) problemTags.push('warning-signal');
                    if (resourceErrorCount > 0) problemTags.push('resource-failure');
                    if (failedNetworkCount > 0) problemTags.push('network-failure');
                    if (slowNetworkCount > 0) problemTags.push('slow-network');
                    if (maxLongTaskMs >= thresholds.longTaskMs || longTaskCount >= 2) problemTags.push('main-thread-blocking');
                    if (highDomMutation) problemTags.push('ui-instability');
                    if (layoutAnomalyCount > 0) problemTags.push('layout-break-risk');
                    if (severeContrastCount > 0 || lowContrastCount >= 2) problemTags.push('low-text-contrast');
                    if (transitionDurationMs >= thresholds.slowTransitionMs) problemTags.push('slow-transition');
                }
                if (enabledChecks.security) {
                    if (securityViolationCount > 0) problemTags.push('security-violation');
                    if (mixedContentCount > 0) problemTags.push('mixed-content');
                    if (insecureFormCount > 0) problemTags.push('insecure-form');
                    if (unsafeBlankLinkCount > 0) problemTags.push('unsafe-blank-link');
                    if (sensitiveStorageCount > 0) problemTags.push('sensitive-storage-exposure');
                    if (securityAuditEvents.length > 0 && (mixedContentCount > 0 || insecureFormCount > 0 || unsafeBlankLinkCount > 0 || sensitiveStorageCount > 0)) problemTags.push('client-security-risk');
                }
                if (enabledChecks.translation) {
                    if (foreignScriptCount > 0) problemTags.push('foreign-script-ui');
                    if (mixedLanguageCount > 0) problemTags.push('mixed-language-ui');
                }
                const isProblematic = problemTags.length > 0;
                const hasHighSecurityRisk = enabledChecks.security && (securityViolationCount > 0 || mixedContentCount > 0 || insecureFormCount > 0 || sensitiveStorageCount > 0);
                const hasHighUiRisk = enabledChecks.ui && (consoleErrorCount > 0 || failedNetworkCount > 0 || layoutAnomalyCount > 0 || severeContrastCount > 0 || transitionDurationMs >= thresholds.verySlowTransitionMs);
                const hasMediumSecurityRisk = enabledChecks.security && unsafeBlankLinkCount > 0;
                const hasMediumTranslationRisk = enabledChecks.translation && (foreignScriptCount > 0 || mixedLanguageCount > 0);
                const hasMediumUiRisk = enabledChecks.ui && (
                    transitionDurationMs >= Math.max(thresholds.slowTransitionMs + 300, thresholds.slowTransitionMs * 1.5)
                    || maxNetworkDurationMs >= thresholds.verySlowNetworkMs
                    || maxLongTaskMs >= Math.max(thresholds.longTaskMs + 200, thresholds.longTaskMs * 1.4)
                    || highDomMutation
                    || resourceErrorCount > 0
                    || lowContrastCount > 0
                    || consoleWarnCount >= thresholds.warningCount
                );
                const severity = hasHighUiRisk || hasHighSecurityRisk
                    ? 'high'
                    : hasMediumUiRisk
                        || hasMediumSecurityRisk
                        || hasMediumTranslationRisk
                        ? 'medium'
                        : 'low';
                const evidence = [];
                if (enabledChecks.ui) {
                    if (pageConsoleErrorCount > 0) evidence.push(`${pageConsoleErrorCount} 筆 page-level console error`);
                    if (uiConsoleErrorCount > 0) evidence.push(`${uiConsoleErrorCount} 筆 OpenViscribe UI error`);
                    if (consoleWarnCount > 0) evidence.push(`${consoleWarnCount} 筆 console warn`);
                    if (resourceErrorCount > 0) evidence.push(`${resourceErrorCount} 筆 resource load error`);
                    if (failedNetworkCount > 0) evidence.push(`${failedNetworkCount} 筆失敗或異常 network`);
                    if (maxNetworkDurationMs >= thresholds.slowNetworkMs) evidence.push(`最慢 network ${maxNetworkDurationMs}ms`);
                    if (maxLongTaskMs >= thresholds.longTaskMs) evidence.push(`最長 long task ${maxLongTaskMs}ms`);
                    if (highDomMutation) evidence.push(`DOM mutation burst ${domMutationCount}`);
                    if (layoutAnomalyCount > 0) evidence.push(`${layoutAnomalyCount} 筆 layout anomaly`);
                    if (lowContrastCount > 0) evidence.push(`${lowContrastCount} 筆低文字對比訊號`);
                    if (transitionDurationMs >= thresholds.slowTransitionMs) evidence.push(`整體切換耗時 ${transitionDurationMs}ms`);
                }
                if (enabledChecks.security) {
                    if (securityViolationCount > 0) evidence.push(`${securityViolationCount} 筆 CSP / security violation`);
                    if (mixedContentCount > 0) evidence.push(`${mixedContentCount} 筆 mixed content`);
                    if (insecureFormCount > 0) evidence.push(`${insecureFormCount} 筆不安全表單提交`);
                    if (unsafeBlankLinkCount > 0) evidence.push(`${unsafeBlankLinkCount} 筆 target=_blank 未加 noopener`);
                    if (sensitiveStorageCount > 0) evidence.push(`${sensitiveStorageCount} 筆敏感 storage key`);
                }
                if (enabledChecks.translation) {
                    if (untranslatedCount > 0) evidence.push(`${untranslatedCount} 筆疑似未翻譯字串`);
                    if (translationIssueCount > 0) evidence.push(`${translationIssueCount} 筆疑似翻譯異常`);
                    if (foreignScriptCount > 0) evidence.push(`${foreignScriptCount} 筆非預期語系文字`);
                    if (mixedLanguageCount > 0) evidence.push(`${mixedLanguageCount} 筆混雜語言 UI`);
                }
                let suspectedCause = '尚未找到明確瓶頸。';
                if (enabledChecks.ui && uiConsoleErrorCount > 0) suspectedCause = '這段互動期間連 OpenViscribe 自己的 UI 都拋出錯誤，先排除工具本身的例外，再判斷頁面問題。';
                else if (enabledChecks.ui && pageConsoleErrorCount > 0) suspectedCause = '互動期間出現頁面前端例外或未處理 promise，建議先檢查錯誤堆疊與對應元件事件。';
                else if (enabledChecks.security && securityViolationCount > 0) suspectedCause = '互動期間出現 CSP 或 security violation，部分 script 或資源可能被瀏覽器直接阻擋，導致畫面殘缺或功能失效。';
                else if (enabledChecks.security && (mixedContentCount > 0 || insecureFormCount > 0 || sensitiveStorageCount > 0)) suspectedCause = '頁面存在較明顯的前端安全風險，例如 mixed content、不安全表單或敏感資料暴露在 storage。';
                else if (enabledChecks.ui && layoutAnomalyCount > 0) suspectedCause = '互動期間偵測到 layout anomaly，畫面可能有 overflow、元素跑出 viewport 或 CSS/資源失效造成的排版崩壞。';
                else if (enabledChecks.ui && lowContrastCount > 0) suspectedCause = '互動期間偵測到低文字對比，某些文字與背景的亮度差過低，使用者可能看不清內容或狀態。';
                else if (enabledChecks.translation && (foreignScriptCount > 0 || mixedLanguageCount > 0)) suspectedCause = '頁面上出現非預期語系或混合語言字串，可能是翻譯遺漏、語系 fallback 錯誤，或部分文案根本未本地化。';
                else if (enabledChecks.ui && resourceErrorCount > 0) suspectedCause = '互動期間有資源載入失敗，可能導致 CSS、圖片或腳本缺失，進一步造成畫面跑版或功能異常。';
                else if (enabledChecks.ui && failedNetworkCount > 0) suspectedCause = '互動期間有請求失敗或回應異常，可能造成畫面資料不完整、重試或停住。';
                else if (enabledChecks.ui && maxNetworkDurationMs >= thresholds.slowNetworkMs) suspectedCause = '主要等待看起來集中在 network request，可能是 API、快取策略或後端回應偏慢。';
                else if (enabledChecks.ui && (maxLongTaskMs >= thresholds.longTaskMs || longTaskCount >= 2)) suspectedCause = '主要等待看起來集中在主執行緒阻塞，可能有同步計算、重複 render、過重 effect 或 layout thrash。';
                else if (enabledChecks.ui && highDomMutation) suspectedCause = '互動期間 DOM 變動量偏高，可能有畫面重建過多、狀態不穩定或多次重複 render。';
                else if (enabledChecks.ui && consoleWarnCount >= thresholds.warningCount) suspectedCause = '互動期間有 warning 訊號，雖不一定直接造成錯誤，但很可能是元件生命週期、資料狀態或棄用 API 的前兆。';
                else if (enabledChecks.ui && transitionDurationMs >= thresholds.slowTransitionMs) suspectedCause = '畫面穩定時間偏長，但暫時沒有足夠訊號指出單一原因，建議搭配 profiler 或 network waterfall 追查。';
                const recommendations = [];
                if (enabledChecks.ui && uiConsoleErrorCount > 0) recommendations.push('先排除 OpenViscribe 自己的 UI error，避免工具端錯誤干擾頁面診斷結果。');
                if (enabledChecks.ui && pageConsoleErrorCount > 0) recommendations.push('先依 page-level console error 與 unhandled rejection 對齊互動時間，確認是哪個元件或事件處理器拋錯。');
                if (enabledChecks.security && securityViolationCount > 0) recommendations.push('優先檢查 CSP / security violation，因為被阻擋的 script、style 或資源很可能直接造成 UI 殘缺。');
                if (enabledChecks.ui && layoutAnomalyCount > 0) recommendations.push('檢查這段互動後的 overflow、容器寬度與關鍵區塊 bounding box，確認是否有元素跑出 viewport。');
                if (enabledChecks.ui && lowContrastCount > 0) recommendations.push('檢查文字色、背景色、hover/disabled state 與透明度，確認對比至少符合可讀性需求，不要讓灰字壓在灰底上。');
                if (enabledChecks.security && mixedContentCount > 0) recommendations.push('移除 HTTPS 頁面中的 HTTP 資源，避免 mixed content 降低安全性或被瀏覽器直接封鎖。');
                if (enabledChecks.security && insecureFormCount > 0) recommendations.push('避免將含密碼或敏感欄位的表單送到 HTTP 端點，確保全程使用 HTTPS。');
                if (enabledChecks.security && unsafeBlankLinkCount > 0) recommendations.push('對 target=_blank 連結補上 rel=noopener noreferrer，避免 opener 劫持。');
                if (enabledChecks.security && sensitiveStorageCount > 0) recommendations.push('重新檢查 localStorage / sessionStorage 是否存了 token、secret 或敏感識別資訊，必要時改為更安全的儲存策略。');
                if (enabledChecks.translation && (foreignScriptCount > 0 || mixedLanguageCount > 0)) recommendations.push('檢查 i18n 字典、fallback 語系與文案覆蓋率，避免頁面夾雜韓文或其他未預期語系。');
                if (enabledChecks.ui && resourceErrorCount > 0) recommendations.push('檢查載入失敗的 CSS、script 或圖片資源，這些失敗常會直接導致樣式掉失與畫面跑版。');
                if (enabledChecks.ui && failedNetworkCount > 0) recommendations.push('檢查失敗請求的 status、重試策略與前端錯誤處理，避免 API 異常讓畫面停在不完整狀態。');
                if (enabledChecks.ui && maxNetworkDurationMs >= thresholds.slowNetworkMs) recommendations.push('查看慢請求是否可快取、合併、預取或延後到非關鍵路徑。');
                if (enabledChecks.ui && (maxLongTaskMs >= thresholds.longTaskMs || longTaskCount >= 2)) recommendations.push('用 profiler 檢查互動後的 render、effect 與同步計算，確認是否有主執行緒長任務。');
                if (enabledChecks.ui && highDomMutation) recommendations.push('檢查這段互動是否有不必要的整頁重繪、列表重建、條件渲染震盪或 key 不穩定。');
                if (enabledChecks.ui && consoleWarnCount >= thresholds.warningCount) recommendations.push('整理這段互動產生的 warning，很多時候它們是潛在 bug、狀態競爭或不穩定生命周期的前兆。');
                if (enabledChecks.ui && transitionDurationMs >= thresholds.slowTransitionMs && recommendations.length === 0) recommendations.push('補抓更細的 interaction trace，確認延遲是否來自 UI render、資料請求或第三方腳本。');
                return {
                    ...click,
                    eventIndex: index + 1,
                    firstVisualChangeTime,
                    settledTime,
                    transitionDurationMs,
                    consoleEvents,
                    networkEvents,
                    performanceEvents,
                    domEvents,
                    securityEvents,
                    securityAuditEvents,
                    layoutEvents,
                    translationEvents,
                    contrastEvents,
                    resourceErrorEvents,
                    consoleErrorCount,
                    consoleWarnCount,
                    failedNetworkCount,
                    slowNetworkCount,
                    longTaskCount,
                    domMutationCount,
                    uiConsoleErrorCount,
                    pageConsoleErrorCount,
                    securityViolationCount,
                    mixedContentCount,
                    insecureFormCount,
                    unsafeBlankLinkCount,
                    sensitiveStorageCount,
                    layoutAnomalyCount,
                    foreignScriptCount,
                    mixedLanguageCount,
                    untranslatedCount,
                    translationIssueCount,
                    untranslatedSamples,
                    translationIssueSamples,
                    translationPageLang,
                    translationNavigatorLang,
                    translationTargetLanguage: selectedTranslationLanguage.code,
                    translationTargetLabel: selectedTranslationLanguage.label,
                    lowContrastCount,
                    severeContrastCount,
                    resourceErrorCount,
                    maxNetworkDurationMs,
                    maxLongTaskMs,
                    problemTags,
                    evidence,
                    suspectedCause,
                    recommendations,
                    severity,
                    isProblematic,
                    isSlow: transitionDurationMs >= thresholds.slowTransitionMs
                };
            });

            const frameAnalysisTargets = interactions.flatMap(item => ([
                Number(item.clickTime.toFixed(2)),
                Number(Math.min(item.settledTime || item.clickTime, item.clickTime + 2).toFixed(2))
            ]));
            const initialIssues = interactions.filter(item => item.isProblematic);
            const screenshotTargets = (initialIssues.length > 0 ? initialIssues : interactions.slice(0, Math.min(3, interactions.length)))
                .map(item => Number(Math.min(item.settledTime || item.clickTime, item.clickTime + 2).toFixed(2)));
            const uiDebugFrames = await captureUiDebugFrames([...frameAnalysisTargets, ...screenshotTargets]);
            const frameByTime = new Map(uiDebugFrames.map(frame => [frame.relativeTime.toFixed(2), frame]));
            const enrichedInteractions = interactions.map((interaction) => {
                const beforeFrame = frameByTime.get(Number(interaction.clickTime.toFixed(2)).toFixed(2));
                const afterTargetTime = Number(Math.min(interaction.settledTime || interaction.clickTime, interaction.clickTime + 2).toFixed(2));
                const afterFrame = frameByTime.get(afterTargetTime.toFixed(2));
                const visualToneShift = enabledChecks.ui
                    ? analyzeVisualToneShift(beforeFrame?.visualMetrics, afterFrame?.visualMetrics, thresholds)
                    : null;
                const problemTags = [...interaction.problemTags];
                const evidence = [...interaction.evidence];
                const recommendations = [...interaction.recommendations];
                let suspectedCause = interaction.suspectedCause;
                let severity = interaction.severity;

                if (visualToneShift) {
                    problemTags.push('visual-tone-shift');
                    evidence.push(`畫面色調/亮度明顯跳變 (color Δ${visualToneShift.globalColorDelta}, region Δ${visualToneShift.maxCellColorDelta})`);
                    recommendations.push('檢查 theme token、背景層、overlay、狀態切換後的樣式套用，以及是否有局部區塊吃到錯誤的色盤或透明度。');
                    if (
                        suspectedCause === '尚未找到明確瓶頸。'
                        || suspectedCause.includes('畫面穩定時間偏長')
                        || suspectedCause.includes('DOM 變動量偏高')
                    ) {
                        suspectedCause = '互動前後的畫面亮度或主色分布跳變明顯，可能是 theme state、樣式覆蓋、overlay 疊層或局部區塊樣式未一致套用。';
                    }
                    if (severity === 'low') severity = 'medium';
                }

                return {
                    ...interaction,
                    problemTags: Array.from(new Set(problemTags)),
                    evidence: Array.from(new Set(evidence)),
                    recommendations: Array.from(new Set(recommendations)),
                    suspectedCause,
                    severity,
                    isProblematic: Array.from(new Set(problemTags)).length > 0,
                    visualToneShift
                };
            });
            const issues = enrichedInteractions.filter(item => item.isProblematic);
            const uiDebugIssueSubtitles = createUiDebugIssueSubtitles(issues);
            const debugBrief = String(projectState.tutorialDescription || '').trim();
            const currentHref = String(clickEvents[0]?.href || debugEvents[0]?.href || window.location.href || '').trim();
            let currentUrl = currentHref || '-';
            let protocol = '-';
            let host = '-';
            try {
                const parsedUrl = new URL(currentHref || window.location.href);
                currentUrl = parsedUrl.href;
                protocol = parsedUrl.protocol.replace(':', '').toUpperCase();
                host = parsedUrl.host || '-';
            } catch (err) {}
            const environmentInfo = {
                os: parseOsInfo(window.navigator?.userAgent, window.navigator?.platform),
                browser: parseBrowserInfo(window.navigator?.userAgent),
                userAgent: window.navigator?.userAgent || 'Unknown',
                url: currentUrl,
                host,
                protocol,
                pageTitle: document.title || '-',
                sessionId: recordingSessionId || '-',
                recordingStart: formatEpochMs(rangeStart),
                recordingEnd: formatEpochMs(rangeEnd)
            };
            const issueTagCounts = issues.reduce((acc, item) => {
                (item.problemTags || []).forEach(tag => {
                    acc[tag] = (acc[tag] || 0) + 1;
                });
                return acc;
            }, {});
            const aiSummaryInput = {
                clickCount: clickEvents.length,
                issueCount: issues.length,
                enabledChecks,
                issueTagCounts,
                topIssues: issues.slice(0, 5).map((item) => ({
                    eventIndex: item.eventIndex,
                    targetText: item.targetText || '',
                    severity: item.severity,
                    problemTags: item.problemTags || [],
                    suspectedCause: item.suspectedCause || '',
                    evidence: (item.evidence || []).slice(0, 5),
                    recommendations: (item.recommendations || []).slice(0, 4)
                }))
            };
            let aiGeneratedSummary = null;
            debugProgress(
                4,
                uiDebugUseAiSummary ? 6 : 5,
                uiDebugUseAiSummary ? '整理 issue 與關鍵畫面' : '組裝報告內容',
                uiDebugUseAiSummary
                    ? `已整理 ${issues.length} 個可疑互動，正在準備關鍵截圖與 AI 摘要輸入...`
                    : `已整理 ${issues.length} 個可疑互動，正在組裝 Test Report 內容...`
            );
            if (uiDebugUseAiSummary) {
                debugProgress(
                    5,
                    6,
                    '生成 AI 摘要',
                    `規則式分析已完成，正在使用 ${uiDebugProviderLabel} (${uiDebugModelLabel}) 生成摘要與建議...`
                );
                try {
                    const uiDebugSystemText = settings.language === 'zh-TW'
                        ? '你是資深前端測試與效能診斷工程師。請根據輸入的 Test Report 訊號回傳純 JSON，包含 overview, topRisks(陣列), nextActions(陣列)。不可捏造不存在的問題。'
                        : 'You are a senior frontend QA and performance diagnostics engineer. Return pure JSON with overview, topRisks (array), and nextActions (array). Do not invent issues not present in the input.';
                    const uiDebugUserText = `請根據以下結構化診斷資料，整理一段高階摘要。\n\n${JSON.stringify(aiSummaryInput)}`;
                    let rawAiSummaryText = '';
                    if (uiDebugProvider === 'azure') {
                        if (!azureVisionEndpoint || !settings.azureDeployment) throw new Error("請至設定填寫完整的 Azure Vision Endpoint 與 Vision 部署名稱。");
                        const azureUrl = `${azureVisionEndpoint.replace(/\/+$/, '')}/openai/deployments/${settings.azureDeployment}/chat/completions?api-version=2024-02-15-preview`;
                        const response = await fetch(azureUrl, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json', 'api-key': azureVisionKey },
                            body: JSON.stringify({
                                messages: [
                                    { role: "system", content: uiDebugSystemText },
                                    { role: "user", content: uiDebugUserText }
                                ],
                                temperature: 0.1,
                                response_format: { type: "json_object" }
                            })
                        });
                        if (!response.ok) throw new Error(`HTTP 錯誤 ${response.status}`);
                        const data = await response.json();
                        rawAiSummaryText = data.choices?.[0]?.message?.content || '';
                    } else if (uiDebugProvider === 'gemini') {
                        const safeApiKey = encodeURIComponent(settings.apiKey.trim());
                        const responseSchema = {
                            type: "OBJECT",
                            properties: {
                                overview: { type: "STRING" },
                                topRisks: { type: "ARRAY", items: { type: "STRING" } },
                                nextActions: { type: "ARRAY", items: { type: "STRING" } }
                            },
                            required: ["overview", "topRisks", "nextActions"]
                        };
                        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${settings.model}:generateContent?key=${safeApiKey}`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                contents: [{ parts: [{ text: `${uiDebugSystemText}\n\n${uiDebugUserText}` }] }],
                                generationConfig: { temperature: 0.1, responseMimeType: "application/json", responseSchema }
                            })
                        });
                        if (!response.ok) throw new Error(`HTTP 錯誤 ${response.status}`);
                        const data = await response.json();
                        rawAiSummaryText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
                    } else if (uiDebugProvider === 'lmstudio') {
                        rawAiSummaryText = await callLmStudioChat({
                            endpoint: lmStudioEndpoint,
                            apiKey: lmStudioApiKey,
                            model: settings.lmStudioChatModel.trim(),
                            temperature: 0.1,
                            format: 'json',
                            timeoutMs: lmStudioTimeoutMs,
                            prompt: `${uiDebugSystemText}\n\n${uiDebugUserText}`
                        });
                    } else {
                        rawAiSummaryText = await callOllamaChat({
                            endpoint: ollamaEndpoint,
                            model: settings.ollamaChatModel.trim(),
                            temperature: 0.1,
                            format: 'json',
                            timeoutMs: ollamaTimeoutMs,
                            prompt: `${uiDebugSystemText}\n\n${uiDebugUserText}`
                        });
                    }
                    if (rawAiSummaryText) {
                        aiGeneratedSummary = JSON.parse(rawAiSummaryText.replace(/```json/gi, '').replace(/```/g, '').trim());
                    }
                } catch (error) {
                    console.warn('ui debug ai summary failed', error);
                }
            }
            const recommendationsByModule = {
                ui: [],
                security: [],
                translation: []
            };
            if (issueTagCounts['openviscribe-exception']) recommendationsByModule.ui.push('先排除 OpenViscribe 自己的 UI error，不然很容易把工具端問題誤判成頁面問題。');
            if (issueTagCounts['page-exception']) recommendationsByModule.ui.push('先處理 page-level exception，因為它們最容易直接造成互動失敗或 UI 進入不一致狀態。');
            if (issueTagCounts['layout-break-risk']) recommendationsByModule.ui.push('優先檢查 layout anomaly 的互動，這通常就是工程師最想看的跑版、overflow 或關鍵樣式失效。');
            if (issueTagCounts['low-text-contrast']) recommendationsByModule.ui.push('若文字對比不足，請優先檢查字色、背景色、透明度與 disabled/hover 狀態，避免重要資訊雖存在但實際不可讀。');
            if (issueTagCounts['resource-failure']) recommendationsByModule.ui.push('把 resource load error 對齊到 CSS、圖片與 script 載入鏈，跑版常常不是 JS 錯，而是資源根本沒成功套用。');
            if (issueTagCounts['network-failure'] || issueTagCounts['slow-network']) recommendationsByModule.ui.push('針對失敗或偏慢的 request 補上 loading/error state，並檢查是否有可快取或可拆分的非關鍵請求。');
            if (issueTagCounts['main-thread-blocking']) recommendationsByModule.ui.push('把互動後的主執行緒工作拆小，避免大型同步計算、過度 render 或昂貴 layout。');
            if (issueTagCounts['ui-instability']) recommendationsByModule.ui.push('優先檢查 DOM mutation 特別高的互動，這通常代表畫面重建過多或狀態震盪。');
            if (issueTagCounts['visual-tone-shift']) recommendationsByModule.ui.push('若畫面主色、亮度或區塊色調突然跳變，優先檢查 theme 切換、容器背景、半透明遮罩與局部樣式覆蓋是否一致。');
            if (issueTagCounts['warning-signal']) recommendationsByModule.ui.push('清理 warning 明顯出現的互動，這通常是未來錯誤與不穩定狀態的前兆。');
            if (issueTagCounts['slow-transition'] && recommendationsByModule.ui.length === 0) recommendationsByModule.ui.push('針對慢互動補 trace 與 profiler，比單看錄影更容易定位實際瓶頸。');
            if (issueTagCounts['security-violation']) recommendationsByModule.security.push('有 CSP / security violation 時，先確認哪些資源或腳本被阻擋，這類問題很容易直接造成功能失效與畫面殘缺。');
            if (issueTagCounts['mixed-content']) recommendationsByModule.security.push('優先移除 mixed content，避免 HTTPS 頁面退化成可被攔截或直接遭瀏覽器封鎖。');
            if (issueTagCounts['insecure-form']) recommendationsByModule.security.push('所有含密碼或敏感欄位的表單都應只提交到 HTTPS 端點。');
            if (issueTagCounts['sensitive-storage-exposure']) recommendationsByModule.security.push('重新檢查是否將 token、secret 或 session 資料直接存入 localStorage / sessionStorage。');
            if (issueTagCounts['unsafe-blank-link']) recommendationsByModule.security.push('target=_blank 請補上 rel=noopener noreferrer，降低 opener 劫持風險。');
            if (issueTagCounts['foreign-script-ui']) recommendationsByModule.translation.push('把頁面上非預期語系的字串回頭對齊 i18n 字典與 fallback 邏輯，避免韓文或其他語系殘留在正式介面。');
            if (issueTagCounts['mixed-language-ui']) recommendationsByModule.translation.push('若同一區塊同時混雜多種語言，請確認翻譯資源版本一致，避免部分文案來自不同 locale。');
            const moduleDefinitions = [
                { key: 'ui', title: 'UI Error Check', fileName: 'test_report_ui.md', tags: UI_DEBUG_MODULE_TAGS.ui },
                { key: 'security', title: 'Security Check', fileName: 'test_report_security.md', tags: UI_DEBUG_MODULE_TAGS.security },
                { key: 'translation', title: 'Translation Check', fileName: 'test_report_translation.md', tags: UI_DEBUG_MODULE_TAGS.translation }
            ];
            const buildModuleReportMarkdown = (module, moduleIssues) => {
                let doc = `# Test Report\n\n`;
                doc += `## Report Type\n`;
                doc += appendMarkdownTable(
                    ['Field', 'Value'],
                    [
                        ['Module', module.title],
                        ['Issue count', moduleIssues.length],
                        ['Tag coverage', module.tags.filter(tag => issueTagCounts[tag] > 0).join(', ') || '-']
                    ]
                );
                doc += `## Summary\n`;
                doc += appendMarkdownTable(
                    ['Metric', 'Value'],
                    [
                        ['錄影點擊數', clickEvents.length],
                        ['可疑互動數', moduleIssues.length],
                        ['啟用檢查', uiDebugSkill.checkOptions.find(option => option.key === module.key)?.label || module.key]
                    ]
                );
                doc += `## Environment\n`;
                doc += appendMarkdownTable(
                    ['Field', 'Value'],
                    [
                        ['OS', environmentInfo.os],
                        ['Browser', environmentInfo.browser],
                        ['Protocol', environmentInfo.protocol],
                        ['Host', environmentInfo.host],
                        ['URL', environmentInfo.url],
                        ['Page title', environmentInfo.pageTitle],
                        ['Session ID', environmentInfo.sessionId],
                        ['Recording start', environmentInfo.recordingStart],
                        ['Recording end', environmentInfo.recordingEnd],
                        ['User agent', environmentInfo.userAgent]
                    ]
                );
                if (debugBrief) {
                    doc += `## Notes\n${debugBrief}\n\n`;
                }
                if (module.key === 'translation') {
                    const translationIssuePool = issues.filter(issue => issue.problemTags?.some(tag => module.tags.includes(tag)));
                    const pageLang = translationIssuePool.find(item => item.translationPageLang)?.translationPageLang || (document.documentElement.lang || navigator.language || 'unknown');
                    const navigatorLang = translationIssuePool.find(item => item.translationNavigatorLang)?.translationNavigatorLang || (navigator.language || 'unknown');
                    const targetLabel = translationIssuePool.find(item => item.translationTargetLabel)?.translationTargetLabel || selectedTranslationLanguage.label;
                    const targetCode = translationIssuePool.find(item => item.translationTargetLanguage)?.translationTargetLanguage || selectedTranslationLanguage.code;
                    const untranslatedList = Array.from(new Set(translationIssuePool.flatMap(item => item.untranslatedSamples || []).filter(Boolean))).slice(0, 10);
                    const translationIssueList = Array.from(new Set(translationIssuePool.flatMap(item => item.translationIssueSamples || []).filter(Boolean))).slice(0, 10);
                    doc += `## Translation Context\n`;
                    doc += appendMarkdownTable(
                        ['Field', 'Value'],
                        [
                            ['Target language', `${targetLabel} (${targetCode})`],
                            ['Page language', pageLang || 'unknown'],
                            ['Browser language', navigatorLang || 'unknown'],
                            ['疑似未翻譯數', translationIssuePool.reduce((sum, item) => sum + Number(item.untranslatedCount || 0), 0)],
                            ['疑似翻譯異常數', translationIssuePool.reduce((sum, item) => sum + Number(item.translationIssueCount || 0), 0)]
                        ]
                    );
                    doc += `## Untranslated Candidates\n`;
                    if (untranslatedList.length === 0) {
                        doc += `目前沒有明顯的未翻譯候選字串。\n\n`;
                    } else {
                        doc += appendMarkdownTable(
                            ['Candidate'],
                            untranslatedList.map(item => [item])
                        );
                    }
                    doc += `## Translation Issue Candidates\n`;
                    if (translationIssueList.length === 0) {
                        doc += `目前沒有明顯的翻譯異常候選字串。\n\n`;
                    } else {
                        doc += appendMarkdownTable(
                            ['Candidate'],
                            translationIssueList.map(item => [item])
                        );
                    }
                }
                doc += `## ${module.title}\n`;
                if (moduleIssues.length === 0) {
                    doc += `目前沒有偵測到明顯的 ${module.title} 問題。\n\n`;
                } else {
                    moduleIssues.forEach((issue, index) => {
                        const eventLabel = `E${issue.eventIndex || index + 1}`;
                        const moduleContent = getModuleSpecificIssueContent(module.key, issue);
                        const issueRows = [
                            ['Event index', eventLabel],
                            ['Severity', issue.severity],
                            ['Click time', `${issue.clickTime.toFixed(2)}s`],
                            ['First visible change', `${issue.firstVisualChangeTime.toFixed(2)}s`],
                            ['Settled', `${issue.settledTime.toFixed(2)}s`],
                            ['Total duration', `${issue.transitionDurationMs}ms`],
                            ['Symptoms', (moduleContent.symptoms.length > 0 ? moduleContent.symptoms : ['目前只有基礎訊號，尚未偵測到明顯問題。']).join('<br />')],
                            ['Suspected cause', moduleContent.suspectedCause],
                            ['Recommendations', moduleContent.recommendations?.length ? moduleContent.recommendations.join('<br />') : 'No specific recommendation']
                        ];
                        if (module.key === 'translation') {
                            issueRows.splice(7, 0,
                                ['非預期語系文字', issue.foreignScriptCount > 0 && issue.untranslatedSamples?.length ? issue.untranslatedSamples.join('<br />') : '未檢出'],
                                ['疑似未翻譯文字', issue.untranslatedSamples?.length ? issue.untranslatedSamples.join('<br />') : '未檢出'],
                                ['疑似翻譯異常文字', issue.translationIssueSamples?.length ? issue.translationIssueSamples.join('<br />') : '未檢出']
                            );
                        }
                        doc += `### Issue ${eventLabel}: ${issue.targetText || `Interaction ${index + 1}`}\n\n`;
                        doc += appendMarkdownTable(
                            ['Section', 'Detail'],
                            issueRows
                        );
                        doc += `#### Evidence\n`;
                        doc += `\`\`\`text\n${moduleContent.evidenceLog}\n\`\`\`\n`;
                        const frame = frameByTime.get(Number(Math.min(issue.settledTime || issue.clickTime, issue.clickTime + 2).toFixed(2)).toFixed(2));
                        if (frame) {
                            doc += `\n![Screenshot at ${frame.relativeTime.toFixed(2)}s](./debug_screenshot_${frame.frameId}.jpg)\n`;
                        }
                        doc += `\n---\n\n`;
                    });
                }
                if (recommendationsByModule[module.key]?.length) {
                    doc += `## Recommendations\n`;
                    recommendationsByModule[module.key].forEach(item => {
                        doc += `- ${item}\n`;
                    });
                    doc += `\n`;
                }
                return doc;
            };
            const moduleReports = Object.fromEntries(
                moduleDefinitions
                    .filter(module => enabledChecks[module.key])
                    .map((module) => {
                        const moduleIssues = issues.filter(issue => issue.problemTags?.some(tag => module.tags.includes(tag)));
                        return [module.key, {
                            title: module.title,
                            fileName: module.fileName,
                            markdown: buildModuleReportMarkdown(module, moduleIssues),
                            issueCount: moduleIssues.length
                        }];
                    })
            );

            debugProgress(
                4,
                uiDebugUseAiSummary ? 6 : 5,
                uiDebugUseAiSummary ? '生成 AI 摘要' : '組裝報告內容',
                uiDebugUseAiSummary
                    ? `規則式分析已完成，正在使用 ${uiDebugProviderLabel} (${uiDebugModelLabel}) 生成摘要與建議...`
                    : '規則式分析已完成，正在組裝 Test Report 內容...'
            );
            let markdownDoc = `# Test Report\n\n`;
            markdownDoc += `## Summary\n`;
            markdownDoc += appendMarkdownTable(
                ['Metric', 'Value'],
                [
                    ['錄影點擊數', clickEvents.length],
                    ['可疑互動數', issues.length],
                    ['啟用檢查', Object.entries(enabledChecks).filter(([, enabled]) => enabled).map(([key]) => uiDebugSkill.checkOptions.find(option => option.key === key)?.label || key).join(', ')],
                    ['Page-level console error 數', debugEvents.filter(item => item.type === 'console' && item.level === 'error' && item.source !== 'openviscribe-ui').length],
                    ['OpenViscribe UI error 數', debugEvents.filter(item => item.type === 'console' && item.level === 'error' && item.source === 'openviscribe-ui').length],
                    ['慢速 network 數', debugEvents.filter(item => item.type === 'network' && (item.durationMs || 0) >= thresholds.slowNetworkMs).length]
                ]
            );
            markdownDoc += `## Environment\n`;
            markdownDoc += appendMarkdownTable(
                ['Field', 'Value'],
                [
                    ['OS', environmentInfo.os],
                    ['Browser', environmentInfo.browser],
                    ['Protocol', environmentInfo.protocol],
                    ['Host', environmentInfo.host],
                    ['URL', environmentInfo.url],
                    ['Page title', environmentInfo.pageTitle],
                    ['Session ID', environmentInfo.sessionId],
                    ['Recording start', environmentInfo.recordingStart],
                    ['Recording end', environmentInfo.recordingEnd],
                    ['User agent', environmentInfo.userAgent]
                ]
            );
            if (Object.keys(issueTagCounts).length > 0) {
                markdownDoc += `## Diagnostic Signals\n`;
                markdownDoc += appendMarkdownTable(
                    ['Signal', 'Count'],
                    Object.entries(issueTagCounts).map(([tag, count]) => [tag, count])
                );
            }
            if (debugBrief) {
                markdownDoc += `## Debug Brief\n${debugBrief}\n\n`;
            }
            if (aiGeneratedSummary?.overview || (aiGeneratedSummary?.topRisks || []).length || (aiGeneratedSummary?.nextActions || []).length) {
                markdownDoc += `## AI Summary\n`;
                markdownDoc += `模型：${uiDebugProviderLabel} (${uiDebugModelLabel})\n\n`;
                if (aiGeneratedSummary?.overview) markdownDoc += `${aiGeneratedSummary.overview}\n\n`;
                if ((aiGeneratedSummary?.topRisks || []).length) {
                    markdownDoc += `### Top Risks\n`;
                    aiGeneratedSummary.topRisks.forEach((item) => {
                        markdownDoc += `- ${item}\n`;
                    });
                    markdownDoc += `\n`;
                }
                if ((aiGeneratedSummary?.nextActions || []).length) {
                    markdownDoc += `### Next Actions\n`;
                    aiGeneratedSummary.nextActions.forEach((item) => {
                        markdownDoc += `- ${item}\n`;
                    });
                    markdownDoc += `\n`;
                }
            }

            if (issues.length === 0) {
                markdownDoc += `目前沒有偵測到明顯超過門檻的診斷問題，但仍可檢查錄影期間的 network、warning 與 performance 訊號。\n`;
            }

            moduleDefinitions
                .filter(module => enabledChecks[module.key])
                .forEach((module) => {
                    const moduleIssues = issues.filter(issue => issue.problemTags?.some(tag => module.tags.includes(tag)));
                    markdownDoc += `## ${module.title}\n`;
                    markdownDoc += appendMarkdownTable(
                        ['Metric', 'Value'],
                        [
                            ['Issue count', moduleIssues.length],
                            ['Tag coverage', module.tags.filter(tag => issueTagCounts[tag] > 0).join(', ') || '-']
                        ]
                    );
                    if (moduleIssues.length === 0) {
                        markdownDoc += `目前沒有偵測到明顯的 ${module.title} 問題。\n\n`;
                        return;
                    }
                    moduleIssues.forEach((issue, index) => {
                        const eventLabel = `E${issue.eventIndex || index + 1}`;
                        markdownDoc += `### Issue ${eventLabel}: ${issue.targetText || `Interaction ${index + 1}`}\n\n`;
                        markdownDoc += appendMarkdownTable(
                            ['Section', 'Detail'],
                            [
                                ['Event index', eventLabel],
                                ['Severity', issue.severity],
                                ['Click time', `${issue.clickTime.toFixed(2)}s`],
                                ['First visible change', `${issue.firstVisualChangeTime.toFixed(2)}s`],
                                ['Settled', `${issue.settledTime.toFixed(2)}s`],
                                ['Total duration', `${issue.transitionDurationMs}ms`],
                                ['Symptoms', (issue.evidence.length > 0 ? issue.evidence : ['目前只有基礎訊號，尚未偵測到明顯的 error / warning burst / network 異常 / long task。']).join('<br />')],
                                ['Suspected cause', issue.suspectedCause],
                                ['Recommendations', issue.recommendations?.length ? issue.recommendations.join('<br />') : 'No specific recommendation']
                            ]
                        );
                        markdownDoc += `#### Evidence\n`;
                        markdownDoc += `\`\`\`text\n${formatUiDebugEvidenceLog(issue)}\n\`\`\`\n`;
                        const frame = frameByTime.get(Number(Math.min(issue.settledTime || issue.clickTime, issue.clickTime + 2).toFixed(2)).toFixed(2));
                        if (frame) {
                            markdownDoc += `\n![Screenshot at ${frame.relativeTime.toFixed(2)}s](./debug_screenshot_${frame.frameId}.jpg)\n`;
                        }
                        markdownDoc += `\n---\n\n`;
                    });
                });
            moduleDefinitions
                .filter(module => enabledChecks[module.key] && recommendationsByModule[module.key]?.length)
                .forEach((module) => {
                    markdownDoc += `## ${module.title} Recommendations\n`;
                    recommendationsByModule[module.key].forEach(item => {
                        markdownDoc += `- ${item}\n`;
                    });
                    markdownDoc += `\n`;
                });
            markdownDoc += `## Severity Criteria\n`;
            markdownDoc += appendMarkdownTable(
                ['Level', 'Rule'],
                [
                    ['high', `符合任一條件: page/openviscribe console error、network failure、security violation、layout anomaly，或總互動時間 >= ${thresholds.verySlowTransitionMs}ms`],
                    ['medium', `未達 high，但符合任一條件: 總互動時間 >= ${Math.max(thresholds.slowTransitionMs + 300, thresholds.slowTransitionMs * 1.5)}ms、最慢 network >= ${thresholds.verySlowNetworkMs}ms、最長 long task >= ${Math.max(thresholds.longTaskMs + 200, thresholds.longTaskMs * 1.4)}ms、DOM mutation 過高、resource load error、console warning >= ${thresholds.warningCount}`],
                    ['low', `未命中 high / medium 規則，但仍被列為 issue 的互動。通常代表有較輕微的慢速、訊號偏弱，或需要搭配上下文再判讀。`]
                ]
            );
            markdownDoc += `### Threshold Snapshot\n`;
            markdownDoc += appendMarkdownTable(
                ['Threshold', 'Value'],
                [
                    ['slowTransitionMs', thresholds.slowTransitionMs],
                    ['verySlowTransitionMs', thresholds.verySlowTransitionMs],
                    ['slowNetworkMs', thresholds.slowNetworkMs],
                    ['verySlowNetworkMs', thresholds.verySlowNetworkMs],
                    ['longTaskMs', thresholds.longTaskMs],
                    ['warningCount', thresholds.warningCount],
                    ['domMutationBurst', thresholds.domMutationBurst],
                    ['domEventBurst', thresholds.domEventBurst],
                    ['visualBrightnessDelta', thresholds.visualBrightnessDelta],
                    ['visualSaturationDelta', thresholds.visualSaturationDelta],
                    ['visualColorShift', thresholds.visualColorShift],
                    ['layoutOverflowRatio', thresholds.layoutOverflowRatio],
                    ['offscreenElementCount', thresholds.offscreenElementCount],
                    ['severeOffscreenElementCount', thresholds.severeOffscreenElementCount]
                ]
            );

            const uiDebugReport = {
                generatedAt: Date.now(),
                debugBrief,
                clickCount: clickEvents.length,
                issueCount: issues.length,
                consoleErrorCount: debugEvents.filter(item => item.type === 'console' && item.level === 'error' && item.source !== 'openviscribe-ui').length,
                uiConsoleErrorCount: debugEvents.filter(item => item.type === 'console' && item.level === 'error' && item.source === 'openviscribe-ui').length,
                networkSlowCount: debugEvents.filter(item => item.type === 'network' && (item.durationMs || 0) >= thresholds.slowNetworkMs).length,
                issueTagCounts,
                recommendationsByModule,
                moduleReports,
                thresholds,
                enabledChecks,
                aiSummaryProvider: uiDebugProvider,
                aiSummaryModel: uiDebugModelLabel,
                aiSummary: aiGeneratedSummary,
                interactions: enrichedInteractions,
                issues
            };

            debugProgress(
                uiDebugUseAiSummary ? 6 : 5,
                uiDebugUseAiSummary ? 6 : 5,
                '寫入報告結果',
                '報告內容已整理完成，正在寫入 Markdown、截圖與診斷結果...'
            );
            setProjectState(prev => ({
                ...prev,
                uiDebugMD: markdownDoc,
                uiDebugFrames,
                uiDebugReport,
                subtitles: [
                    ...prev.subtitles.filter(sub => !normalizeSubtitle(sub).uiDebugMarker),
                    ...uiDebugIssueSubtitles
                ]
            }));
            updateUiDebugStatus({
                phase: 'success',
                message: 'Test Report 已建立',
                detail: uiDebugUseAiSummary
                    ? `已分析 ${clickEvents.length} 次點擊，整理出 ${issues.length} 個可疑互動，並使用 ${uiDebugProviderLabel} (${uiDebugModelLabel}) 生成診斷摘要。`
                    : `已分析 ${clickEvents.length} 次點擊，整理出 ${issues.length} 個可疑互動。`,
                aiLabel: uiDebugAiLabel,
                progressPercent: 100,
                currentStep: uiDebugUseAiSummary ? 6 : 5,
                totalSteps: uiDebugUseAiSummary ? 6 : 5,
                stageLabel: '完成',
                issueCount: issues.length,
                slowInteractionCount: enrichedInteractions.filter(item => item.isProblematic || item.isSlow).length,
                consoleErrorCount: uiDebugReport.consoleErrorCount,
                uiErrorCount: uiDebugReport.uiConsoleErrorCount,
                networkSlowCount: uiDebugReport.networkSlowCount
            });
        } catch (error) {
            updateUiDebugStatus({
                phase: 'error',
                message: 'Test Report 失敗',
                detail: error.message || '分析失敗'
            });
            alert(`Test Report 分析失敗: ${error.message || '分析失敗'}`);
        } finally {
            setAiLoading(false);
            setAiProgress('');
            setActiveAiTask('');
        }
    };

    const generateAiSubtitles = async () => {
        const isCompositeTutorial = activeSkillId === 'composite-tutorial';
        const isColumnTopicMode = activeSkillId === 'column-topic';
        const activeMarkdownField = activeSkill.markdownField || 'tutorialMD';
        const subtitleProgress = (currentStep, totalSteps, stageLabel, detail, patch = {}) => {
            const progressPercent = totalSteps > 0 ? Math.round((currentStep / totalSteps) * 100) : 0;
            setAiProgress(createProgressText(currentStep, totalSteps, stageLabel, progressPercent));
            updateAiSubtitleStatus({
                phase: 'running',
                message: 'AI字幕執行中',
                detail,
                aiLabel: subtitleAiLabel,
                currentStep,
                totalSteps,
                progressPercent,
                stageLabel,
                ...patch
            });
        };

        if (subtitleProvider === 'azure' && !azureVisionKey) {
            updateAiSubtitleStatus({
                phase: 'error',
                message: 'AI字幕尚未開始',
                detail: '請先在設定中輸入 Azure Vision API Key。',
                uploaded: false
            });
            return alert("請先在設定中輸入 Azure Vision API Key");
        }
        if (subtitleProvider === 'gemini' && !settings.apiKey) {
            updateAiSubtitleStatus({
                phase: 'error',
                message: 'AI字幕尚未開始',
                detail: '請先在設定中輸入 Gemini API Key。',
                uploaded: false
            });
            return alert("請先在設定中輸入 Gemini API Key");
        }
        if (subtitleProvider === 'lmstudio' && (!lmStudioEndpoint || !settings.lmStudioVisionModel?.trim())) {
            updateAiSubtitleStatus({
                phase: 'error',
                message: 'AI字幕尚未開始',
                detail: '請先在設定中填入 LM Studio Base URL 與 Vision 模型。',
                uploaded: false
            });
            return alert("請先在設定中填入 LM Studio Base URL 與 Vision 模型");
        }
        if (subtitleProvider === 'ollama' && (!ollamaEndpoint || !settings.ollamaVisionModel?.trim())) {
            updateAiSubtitleStatus({
                phase: 'error',
                message: 'AI字幕尚未開始',
                detail: '請先在設定中填入 Ollama Endpoint 與 Vision 模型。',
                uploaded: false
            });
            return alert("請先在設定中填入 Ollama Endpoint 與 Vision 模型");
        }

        const allVideoClips = projectState.tracks.flat().filter(c => c.type === 'video').sort((a, b) => a.startAt - b.startAt);
        if (allVideoClips.length === 0) {
            updateAiSubtitleStatus({
                phase: 'error',
                message: '找不到可分析的影片',
                detail: '時間軸上目前沒有影片片段，請先錄影或拖曳影片到時間軸。',
                uploaded: false,
                frameCount: 0
            });
            return alert("時間軸上沒有可供分析的影片片段！請先錄影或從左側素材庫拖曳影片。");
        }

        const taskController = beginAiTask('subtitle');
        const taskSignal = taskController.signal;
        subtitleProgress(
            1,
            5,
            isColumnTopicMode ? '掃描內容與素材' : '掃描紅圈點擊與素材',
            isColumnTopicMode
                ? `正在使用 ${subtitleProviderLabel} (${subtitleModelLabel}) 進行內容判讀，先擷取高畫質畫面並整理瀏覽脈絡...`
                : `正在使用 ${subtitleProviderLabel} (${subtitleModelLabel}) 進行 AI字幕，先以高畫質過濾並掃描滑鼠點擊...`,
            {
                clickCount: 0,
                frameCount: 0,
                subtitleCount: highlightSubtitles.length,
                uploaded: false
            }
        );
        try {
            throwIfAborted(taskSignal);
            const aiCanvas = document.createElement('canvas');
            aiCanvas.width = 1280;
            aiCanvas.height = 720;
            const aiCtx = aiCanvas.getContext('2d', { willReadFrequently: true });

            const hdCanvas = document.createElement('canvas');
            hdCanvas.width = 1920;
            hdCanvas.height = 1080;
            const hdCtx = hdCanvas.getContext('2d');
            const seekVideoElementForClipTime = async (videoEl, clipTime) => {
                if (!videoEl) return;
                if (!Number.isFinite(clipTime)) return;
                const targetTime = Math.max(0, clipTime);
                if (Math.abs((videoEl.currentTime || 0) - targetTime) <= 0.04) return;
                await new Promise((resolve) => {
                    let done = false;
                    const finish = () => {
                        if (done) return;
                        done = true;
                        videoEl.removeEventListener('seeked', finish);
                        resolve();
                    };
                    videoEl.addEventListener('seeked', finish, { once: true });
                    videoEl.currentTime = targetTime;
                    setTimeout(finish, 400);
                });
            };
            const renderTimelineFrameToCanvases = async (targetTime) => {
                const activeClips = projectStateRef.current.tracks
                    .flatMap((track) => track || [])
                    .filter((clip) => clip?.type === 'video')
                    .filter((clip) => targetTime >= clip.startAt && targetTime < clip.startAt + clip.duration);

                await Promise.all(activeClips.map(async (clip) => {
                    const videoEl = videoRefs.current[clip.id];
                    if (!videoEl) return;
                    const clipTime = clip.trimStart + (targetTime - clip.startAt) * (clip.playbackRate || 1.0);
                    await seekVideoElementForClipTime(videoEl, clipTime);
                }));

                drawToExportCanvas(targetTime, { hideSubtitles: true });
                const exportCanvas = exportCanvasRef.current;
                if (!exportCanvas) return;

                hdCtx.clearRect(0, 0, hdCanvas.width, hdCanvas.height);
                hdCtx.drawImage(exportCanvas, 0, 0, hdCanvas.width, hdCanvas.height);
                aiCtx.clearRect(0, 0, aiCanvas.width, aiCanvas.height);
                aiCtx.drawImage(exportCanvas, 0, 0, aiCanvas.width, aiCanvas.height);
            };

            const rangeStart = projectState.recordingRange?.startEpochMs || recordStartTimeRef.current || 0;
            const rangeEnd = projectState.recordingRange?.endEpochMs || recordEndTimeRef.current || (rangeStart ? rangeStart + totalDuration * 1000 : 0);
            const timelineSpanMs = Math.max(0, Math.round(totalDuration * 1000));
            const recordedSpanMs = rangeEnd > rangeStart ? rangeEnd - rangeStart : 0;
            const shouldPreferRecentWindow = !recordingSessionIdRef.current
                && timelineSpanMs > 0
                && recordedSpanMs > timelineSpanMs + 15000;
            const effectiveRangeStart = shouldPreferRecentWindow
                ? Math.max(rangeStart, rangeEnd - timelineSpanMs - 3000)
                : rangeStart;
            const clickEvents = await loadGlobalClickLog();
            const activeSessionId = recordingSessionIdRef.current || '';
            const recordingSessionClips = activeSessionId
                ? allVideoClips.filter(clip => String(clip?.recordingSessionId || '') === activeSessionId)
                : [];
            const recordingTimelineOffset = recordingSessionClips.length > 0
                ? Math.min(...recordingSessionClips.map(clip => Number(clip?.startAt || 0)).filter(Number.isFinite))
                : (activeSessionId && allVideoClips.length > 0
                    ? Math.max(...allVideoClips.map(clip => Number(clip?.startAt || 0)).filter(Number.isFinite))
                    : 0);
            const cleanClickLabel = (value) => {
                return String(value || '')
                    .replace(/\s+/g, ' ')
                    .replace(/[^\S\r\n]+/g, ' ')
                    .trim()
                    .slice(0, 120);
            };
            const hasRedRippleNear = (imageData, cx, cy) => {
                if (!imageData || !Number.isFinite(cx) || !Number.isFinite(cy)) return false;
                const { data, width, height } = imageData;
                const radius = 40;
                const minX = Math.max(0, Math.floor(cx - radius));
                const maxX = Math.min(width - 1, Math.ceil(cx + radius));
                const minY = Math.max(0, Math.floor(cy - radius));
                const maxY = Math.min(height - 1, Math.ceil(cy + radius));
                let redCount = 0;
                let sampled = 0;
                for (let y = minY; y <= maxY; y += 2) {
                    for (let x = minX; x <= maxX; x += 2) {
                        const dx = x - cx;
                        const dy = y - cy;
                        const d = Math.sqrt(dx * dx + dy * dy);
                        if (d < 14 || d > 34) continue;
                        const idx = (y * width + x) * 4;
                        const r = data[idx];
                        const g = data[idx + 1];
                        const b = data[idx + 2];
                        if (r > 170 && g < 145 && b < 145 && r - g > 30 && r - b > 30) redCount++;
                        sampled++;
                    }
                }
                if (!sampled) return false;
                return redCount >= 14;
            };
            const subtitleClipEpochRanges = buildClipEpochRanges(allVideoClips, rangeStart, activeSessionId);
            const sortedClicks = clickEvents
                .filter(ev => typeof ev?.epochMs === 'number')
                .filter(ev => !activeSessionId || (ev?.sessionId || '') === activeSessionId)
                .map(ev => {
                    const time = epochMsToTimelineTime(ev.epochMs, subtitleClipEpochRanges, effectiveRangeStart, recordingTimelineOffset);
                    if (time === null || !Number.isFinite(time) || time < 0) return null;
                    return {
                        ...ev,
                        clickId: ev.id || `clk_${ev.epochMs}`,
                        time: Number(time.toFixed(2)),
                        label: cleanClickLabel(ev?.targetText || ''),
                        x: Number(ev?.x),
                        y: Number(ev?.y),
                        viewportW: Number(ev?.viewportW),
                        viewportH: Number(ev?.viewportH)
                    };
                })
                .filter(Boolean)
                .sort((a, b) => a.time - b.time);
            const clickPoints = [];
            for (const ev of sortedClicks) {
                const last = clickPoints[clickPoints.length - 1];
                if (!last || Math.abs(ev.time - last.time) >= 0.05) {
                    clickPoints.push(ev);
                } else if (!last.label && ev.label) {
                    last.label = ev.label;
                }
            }
            const clickTimes = clickPoints.map(ev => ev.time);
            const timelineContentEnd = Math.max(
                0,
                ...allVideoClips.map(clip => Number(clip?.startAt || 0) + Number(clip?.duration || 0)).filter(Number.isFinite)
            );
            const lastClickTime = clickTimes.length ? Math.max(...clickTimes) : 0;
            const minimumClickCountForShortcut = Math.max(3, Math.ceil(Math.max(timelineContentEnd, totalDuration || 0) / 25));
            const clickCoverageSufficient = clickTimes.length > 0
                && clickTimes.length >= minimumClickCountForShortcut
                && lastClickTime >= Math.max(1, timelineContentEnd * 0.65);
            const useVisualTutorialUnderstanding = !isCompositeTutorial && !isColumnTopicMode && !clickCoverageSufficient;
            subtitleProgress(
                2,
                5,
                '擷取關鍵畫面',
                isColumnTopicMode
                    ? `目前未依賴紅圈事件，將直接根據逐秒畫面理解擷取 ${allVideoClips.length} 段素材中的內容錨點。`
                    : isCompositeTutorial
                    ? (clickPoints.length > 0
                        ? `已偵測 ${clickPoints.length} 筆紅色漣漪點擊，並會搭配逐秒畫面理解抽取關鍵畫面。`
                        : '目前沒有紅色漣漪點擊，將改用逐秒畫面理解抽取關鍵畫面。')
                    : (useVisualTutorialUnderstanding
                        ? `已偵測 ${clickPoints.length} 筆點擊，但覆蓋不到完整影片，將改用逐秒畫面理解補齊後續步驟。`
                        : `已偵測 ${clickPoints.length} 筆點擊，正在抽取關鍵畫面。`),
                {
                    clickCount: clickPoints.length,
                    frameCount: 0,
                    uploaded: false
                }
            );

            const capturedFrames = [];
            const mandatoryFrames = [];
            const optionalFrames = [];
            let frameSeq = 0;
            const baseSampleInterval = 1.0;
            const clickOffsets = [-1.5, -1.0, -0.5, -0.2, -0.06, 0, 0.08, 0.16, 0.24, 0.4, 0.65, 0.95];
            let prevImageData = null;
            const rippleFrameByClickId = new Map();

            for (let i = 0; i < allVideoClips.length; i++) {
                const videoClip = allVideoClips[i];
                const clipStart = Number(videoClip.startAt.toFixed(2));
                const clipEnd = Number((videoClip.startAt + videoClip.duration).toFixed(2));
                const mandatoryTargetTimes = [];

                for (let t = clipStart; t < clipEnd; t += baseSampleInterval) {
                    mandatoryTargetTimes.push(Number(t.toFixed(2)));
                }
                if (!mandatoryTargetTimes.some(t => Math.abs(t - clipStart) < 0.01)) {
                    mandatoryTargetTimes.push(clipStart);
                }
                const mandatoryTimeSet = new Set(mandatoryTargetTimes.map(t => t.toFixed(2)));
                const optionalTargetTimes = [];
                const clickByTime = new Map();

                clickPoints.forEach(clickPoint => {
                    const clickTime = clickPoint.time;
                    if (clickTime < clipStart - 0.3 || clickTime > clipEnd + 0.3) return;
                    clickOffsets.forEach(offset => {
                        const t = Number((clickTime + offset).toFixed(2));
                        if (t >= clipStart && t <= clipEnd) {
                            optionalTargetTimes.push(t);
                            const key = t.toFixed(2);
                            if (!clickByTime.has(key)) clickByTime.set(key, clickPoint);
                        }
                    });
                });

                const dedupedTargetTimes = [...new Set([...mandatoryTargetTimes, ...optionalTargetTimes])]
                    .sort((a, b) => a - b);

                for (const targetTime of dedupedTargetTimes) {
                    const isMandatory = mandatoryTimeSet.has(targetTime.toFixed(2));
                    await renderTimelineFrameToCanvases(targetTime);

                    const currentImageData = aiCtx.getImageData(0, 0, aiCanvas.width, aiCanvas.height);
                    const mappedClick = clickByTime.get(targetTime.toFixed(2));
                    let rippleForClickId = '';
                    if (mappedClick && Number.isFinite(mappedClick.x) && Number.isFinite(mappedClick.y) && mappedClick.viewportW > 0 && mappedClick.viewportH > 0) {
                        const mappedX = (mappedClick.x / mappedClick.viewportW) * aiCanvas.width;
                        const mappedY = (mappedClick.y / mappedClick.viewportH) * aiCanvas.height;
                        if (hasRedRippleNear(currentImageData, mappedX, mappedY)) {
                            rippleForClickId = mappedClick.clickId;
                        }
                    }
                    let isDifferent = true;

                    if (prevImageData) {
                        let diffPixels = 0;
                        const data1 = currentImageData.data;
                        const data2 = prevImageData.data;
                        const totalSampled = data1.length / 40;

                        for (let j = 0; j < data1.length; j += 40) {
                            const rDiff = Math.abs(data1[j] - data2[j]);
                            const gDiff = Math.abs(data1[j + 1] - data2[j + 1]);
                            const bDiff = Math.abs(data1[j + 2] - data2[j + 2]);

                            if (rDiff > 20 || gDiff > 20 || bDiff > 20) {
                                diffPixels++;
                            }
                        }

                        if (diffPixels / totalSampled < 0.002) {
                            isDifferent = false;
                        }
                    }

                    if (isMandatory || isDifferent) {
                        prevImageData = currentImageData;
                        const aiBase64 = aiCanvas.toDataURL('image/jpeg', 0.7).split(',')[1];
                        const hdBase64 = hdCanvas.toDataURL('image/jpeg', 0.85).split(',')[1];
                        const captureMapping = getPrimaryFrameCaptureMapping(targetTime, hdCanvas.width, hdCanvas.height);

                        const relativeTime = Number(targetTime.toFixed(2));
                        const relativeTimeMs = Math.round(relativeTime * 1000);
                        const quality = analyzeFrameQuality(currentImageData);
                        const frame = {
                            frameId: ++frameSeq, relativeTime, relativeTimeMs, aiData: aiBase64, hdData: hdBase64, rippleForClickId,
                            captureMapping,
                            clarityScore: Number(quality.clarityScore.toFixed(4)),
                            loadingScore: Number(quality.loadingScore.toFixed(4)),
                            isBlurry: quality.isBlurry,
                            isLikelyLoading: quality.isLikelyLoading
                        };
                        if (isMandatory) mandatoryFrames.push(frame);
                        else optionalFrames.push(frame);
                        if (rippleForClickId) {
                            const prev = rippleFrameByClickId.get(rippleForClickId);
                            if (!prev || Math.abs(relativeTime - mappedClick.time) < Math.abs(prev.relativeTime - mappedClick.time)) {
                                rippleFrameByClickId.set(rippleForClickId, frame);
                            }
                        }
                    }
                }
            }

            mandatoryFrames.sort((a, b) => a.relativeTime - b.relativeTime);
            optionalFrames.sort((a, b) => a.relativeTime - b.relativeTime);
            const rippleFrames = Array.from(rippleFrameByClickId.values())
                .sort((a, b) => a.relativeTime - b.relativeTime);
            const maxFrames = subtitleProvider === 'azure' ? 48 : 50;
            const perClipRepresentatives = allVideoClips.map((clip) => {
                const clipStart = Number(clip.startAt || 0);
                const clipEnd = Number((clip.startAt || 0) + (clip.duration || 0));
                const framesInClip = [...mandatoryFrames, ...optionalFrames]
                    .filter((frame) => frame.relativeTime >= clipStart - 0.01 && frame.relativeTime < clipEnd - 0.01)
                    .sort((a, b) => Math.abs(a.relativeTime - (clipStart + clipEnd) / 2) - Math.abs(b.relativeTime - (clipStart + clipEnd) / 2));
                return framesInClip[0] || null;
            }).filter(Boolean);
            capturedFrames.push(...rippleFrames, ...perClipRepresentatives, ...mandatoryFrames, ...optionalFrames);
            const seenFrameIds = new Set();
            const deduped = [];
            for (const f of capturedFrames) {
                if (seenFrameIds.has(f.frameId)) continue;
                seenFrameIds.add(f.frameId);
                deduped.push(f);
            }
            capturedFrames.length = 0;
            capturedFrames.push(...deduped.slice(0, maxFrames));
            capturedFrames.sort((a, b) => a.relativeTime - b.relativeTime);
            subtitleProgress(
                3,
                5,
                isCompositeTutorial ? '準備畫面分析' : '準備 OCR 畫面',
                isCompositeTutorial
                    ? `正在使用 ${subtitleProviderLabel} (${subtitleModelLabel}) 進行綜合教學分析。已擷取 ${capturedFrames.length} 張畫面，其中 ${rippleFrames.length} 張含紅圈關鍵幀。`
                    : `正在使用 ${subtitleProviderLabel} (${subtitleModelLabel}) 進行 AI字幕辨識。已擷取 ${capturedFrames.length} 張畫面，包含 ${rippleFrames.length} 張紅圈關鍵幀。`,
                {
                    message: '關鍵畫面已準備完成',
                    clickCount: clickPoints.length,
                    frameCount: capturedFrames.length,
                    uploaded: false
                }
            );
            const hasLabelAt = (idx) => !!cleanClickLabel(clickPoints[idx]?.label);
            const buildStrictSubsFromClickLabels = () => {
                const actionPrefix = settings.language === 'zh-TW' ? "點擊 '" : "Click '";
                const actionSuffix = "'";
                return clickPoints.map((point, idx) => {
                    const textRaw = cleanClickLabel(point?.label);
                    if (!textRaw) return null;
                    const rippleFrame = rippleFrameByClickId.get(point.clickId);
                    const start = rippleFrame ? Number(rippleFrame.relativeTime.toFixed(2)) : point.time;
                    const nextStart = clickTimes[idx + 1];
                    const endAt = Number.isFinite(nextStart) ? Number(nextStart.toFixed(2)) : Number((start + 3).toFixed(2));
                    return {
                        id: `sub_${Math.random()}`,
                        clickId: point.clickId,
                        startAt: Number(start.toFixed(2)),
                        endAt: endAt > start ? endAt : Number((start + 0.5).toFixed(2)),
                        text: `${actionPrefix}${textRaw}${actionSuffix}`
                    };
                }).filter(Boolean);
            };
            if (!isCompositeTutorial && !isColumnTopicMode && !useVisualTutorialUnderstanding && clickPoints.every((_, idx) => hasLabelAt(idx))) {
                const strictSubs = buildStrictSubsFromClickLabels();
                if (strictSubs.length > 0) {
                    const normalizedStrictSubs = strictSubs.map(sub => normalizeSubtitle({ ...sub, trackIndex: 1 }));
                    subtitleProgress(
                        5,
                        5,
                        '完成字幕同步',
                        `已使用紅色漣漪點擊文字生成 ${strictSubs.length} 條精準字幕。`,
                        {
                            clickCount: clickPoints.length,
                            frameCount: capturedFrames.length,
                            subtitleCount: strictSubs.length,
                            uploaded: false
                        }
                    );
                    setProjectState(prev => ({
                        ...prev,
                        subtitles: [...prev.subtitles.filter(sub => normalizeSubtitle(sub).trackIndex !== 1), ...normalizedStrictSubs],
                        [activeMarkdownField]: prev[activeMarkdownField],
                        capturedFrames: capturedFrames,
                        compositeSubtitleAnalysis: [],
                        aiSubtitleTimelineSnapshot: createAiSubtitleTimelineSnapshot(prev),
                        aiSubtitleGeneratedAt: Date.now()
                    }));
                    updateAiSubtitleStatus({
                        phase: 'success',
                        message: 'AI字幕已完成',
                        detail: `已直接使用紅圈點擊文字生成 ${strictSubs.length} 條字幕，本次未送出雲端 OCR。`,
                        aiLabel: subtitleAiLabel,
                        progressPercent: 100,
                        currentStep: 5,
                        totalSteps: 5,
                        stageLabel: '完成',
                        clickCount: clickPoints.length,
                        frameCount: capturedFrames.length,
                        subtitleCount: strictSubs.length,
                        uploaded: false
                    });
                    return;
                }
            }

            const promptLanguage = settings.language === 'zh-TW' ? 'Traditional Chinese (繁體中文)' : 'English';
            const userDesc = projectState.tutorialDescription ? `影片背景：\n${projectState.tutorialDescription}\n` : '';
            const clickTimelineSummary = clickPoints.length
                ? clickPoints.map(point => {
                    const label = cleanClickLabel(point?.label);
                    return `${point.time.toFixed(2)}s${label ? ` (${label})` : ''}`;
                }).join(', ')
                : (settings.language === 'zh-TW' ? '無' : 'none');

            const baseStrictRules = `
【任務：極度嚴格的像素級 OCR 擷取】
這是一系列螢幕截圖，每張圖有 \`[Time: Xs]\` 標記。
你現在是一個「毫無聯想能力、死板的 OCR 掃描器」。你的唯一工作是擷取【發生真實點擊】處的文字。
${userDesc}
本次已偵測到紅色漣漪點擊總數：${clickTimes.length}。
點擊時間序列（秒）：${clickTimelineSummary}。

【核心辨識演算法 - 非常重要】
1. 尋找每張圖中的「紅色點擊波紋圈」(Red Click Ripple)。
2. 【只抓點擊】：如果畫面只有滑鼠游標(箭頭/手指)但沒有紅色圈圈，代表這只是「滑鼠滑過(Hover)」，請【完全忽略】該畫面，不要產生任何步驟與字幕！
3. 鎖定紅圈「正下方或內部」的文字。
4. 網頁介面按鈕密集，請務必只認準「被紅圈直接覆蓋」的那一個詞或按鈕，忽略周圍其他的字。
5. 「一字不漏」地複製該文字（包含 Icon、Emoji 或特殊符號）。

🛑 【絕對禁止行為（違反將導致嚴重錯誤）】
- 絕對禁止中英文夾雜：請統一使用指定的語言輸出。
- 禁止猜測或發想功能：就算按鈕長得像新增，只要文字寫「✨ 呼叫小幫手」，就只能輸出「✨ 呼叫小幫手」。
- 禁止同義詞替換或看錯：
  ❌ 錯誤示範：游標指在「Copilot」，你卻寫成「啟用輸出程序」。
  ❌ 錯誤示範：游標指在「啟動匯出程序 🚀」，你卻寫成「自動排序」。
  ❌ 錯誤示範：游標指在「抓取並輸出 Issue (MD)」，你卻寫成「新增任務」。
  ✅ 正確示範：完全照抄「Copilot」、「啟動匯出程序 🚀」與「抓取並輸出 Issue (MD)」。
- 畫面若沒有發生紅圈點擊，【絕對禁止】憑空捏造步驟或字幕！

【字幕輸出規定】
- subtitles 陣列中的 text 欄位，【只能】填入你 OCR 擷取到的真實字串，不可自己添加「點擊」等動詞。
- subtitles 陣列數量不得超過已偵測點擊總數（${clickTimes.length}）。
- subtitles 的每一項都必須對應一次真實紅色漣漪點擊，禁止加入任何無點擊事件的項目。
`;

            const visualTutorialRules = `
【任務：螢幕教學流程理解】
這是一系列依時間排序的螢幕錄影截圖，每張圖都有 \`[Time: Xs]\` 標記。
你要根據畫面中的真實 UI、表單、彈窗、狀態文字與頁面變化，整理出可重做的教學字幕與文章步驟。
${userDesc}
本次偵測到的點擊事件數：${clickTimes.length}。
點擊時間與文字（若有）：${clickTimelineSummary}。

【判讀原則】
1. 點擊事件只能當作時間錨點，不可把沒有覆蓋到的後續畫面忽略。
2. 若後續畫面出現表單填寫、選單展開、勾選、Continue/Apply、載入或設定完成等明確流程，必須產生對應字幕。
3. 沒有紅色 ripple 時，也要依照畫面內容與時間順序切段。
4. 字幕要短、可直接上字幕，不要每句都寫成「點擊...」。
5. \`doc.setupGuide\` 要寫成使用者可重做的步驟，並填入對應 \`screenshotTime\`。
6. 不確定時請保守描述可見畫面，不要捏造畫面中沒有出現的選項、完成結果或設備狀態。

【輸出要求】
- 必須回傳純 JSON。
- 最外層包含 \`subtitles\` 與 \`doc\`。
- subtitles 每項都要包含：\`startAt\`, \`endAt\`, \`text\`。
- doc 必須包含：\`title\`, \`whatIsIt\`, \`consumerBenefits\`(陣列，含 benefitName, description), \`setupGuide\`(陣列，含 stepName, description, screenshotTime), \`conclusion\`。
- 請輸出 4 到 10 個字幕/步驟，依時間排序。
`;

            const compositePromptRules = `
【任務：綜合教學影片理解】
這是一系列依時間排序的影片截圖，每張圖都有 \`[Time: Xs]\` 標記。
你現在只會看到「單一片段」的畫面。你必須只根據這個片段內可見的資訊做判斷，不可把前一段或下一段可能發生的事帶進來。
你要把這個片段整理成「段落級」教學事件，而不是逐秒流水帳。支援以下場景：
- \`live_action\`: 實拍真實世界動作，例如按電源、插線、手拿設備、燈號變化
- \`screen_recording\`: 螢幕錄影操作，以滑鼠點擊、UI 變化與頁面切換為主
- \`screen_recording_with_pip\`: 主畫面是螢幕錄影，但畫面中還有 picture in picture 或小視窗示範
- \`mixed_overlay\`: 疊加箭頭、文字卡、說明圖層或轉場圖文
- \`uncertain\`: 無法可靠判定

${userDesc}
本次已偵測到紅色漣漪點擊總數：${clickTimes.length}。
點擊時間序列（秒）：${clickTimelineSummary}。

【判斷原則】
1. 請輸出 \`segments\`，每個 segment 代表一段完整教學意圖。
2. 先判斷每個 segment 屬於哪種 \`scene_type\`。
3. 每個 segment 都要判斷 \`instruction_role\`，只能是 \`setup\`、\`action\`、\`confirmation\`、\`warning\`、\`explanation\`、\`comparison\`、\`result\`。
4. 若有 PIP 或輔助小窗，請判斷 \`relation_type\`，只能是 \`parallel\`、\`cause_and_effect\`、\`zoom_in_detail\`、\`real_world_correspondence\`、\`supplementary_hint\`、\`decorative_only\`。
5. 若有 PIP，請判斷 \`pip_relevance\`，只能是 \`critical\`、\`supporting\`、\`optional\`、\`ignore\`。
6. \`teaching_goal\` 要用一句短句說明這段到底在教什麼。
7. \`main_action\` 描述主畫面正在做的事。
8. 如果畫面中有 picture in picture、小窗教學、右下角示範框，請填 \`pip_action\`；沒有就留空字串。
9. 若主畫面是螢幕錄影且能看見紅圈點擊，\`subtitle\` 必須優先對應 red ripple 所代表的實際 UI 點擊動作，不要改寫成籠統摘要。
10. 若主畫面是實拍片段，不要硬套成滑鼠點擊流程。
11. \`subtitle\` 必須短，適合直接上字幕。
12. \`voiceover\` 要比字幕稍完整，適合口說。
13. \`article_step\` 要寫成可重做的教學步驟。
14. 不確定時請保守，不要捏造畫面中不存在的步驟、設備狀態或目的。

【文件輸出】
- 除了 \`segments\` 外，也請輸出 \`doc\` 物件。
- \`doc\` 必須包含：\`title\`, \`overview\`, \`preparation\`(陣列), \`steps\`(陣列), \`warnings\`(陣列), \`result_summary\`。
- \`doc.steps\` 每項都要包含：\`segment_index\`, \`step_title\`, \`description\`, \`screenshot_time\`。
- \`segment_index\` 以 1 開始，必須對應到上方 \`segments\` 的順序。

【輸出要求】
- 必須回傳純 JSON。
- 最外層要包含：\`segments\`, \`doc\`。
- \`segments\` 每項都要包含：\`time_start\`, \`time_end\`, \`scene_type\`, \`instruction_role\`, \`relation_type\`, \`teaching_goal\`, \`main_action\`, \`pip_action\`, \`pip_relevance\`, \`subtitle\`, \`voiceover\`, \`article_step\`。
- \`scene_type\` 只能使用上方五種值之一。
- \`pip_action\` 若不存在請回傳空字串，不要省略欄位。
`;

            const columnPromptRules = `
【任務：專欄主題內容判讀】
這是一系列依時間排序的瀏覽/錄影截圖，每張圖都有 \`[Time: Xs]\` 標記。
你要像一位科技專欄編輯，先理解使用者正在瀏覽什麼，再把整段錄影切成數個值得寫進文章的「內容錨點」。

${userDesc}

【判讀原則】
1. 不要依賴紅色 ripple，也不要把結果寫成點擊教學。
2. 優先判斷每個時間片段的主題、正在瀏覽的內容類型、畫面焦點與背後代表的議題。
3. 可以根據頁面標題、圖表、關鍵數字、產品資訊、新聞脈絡、比較畫面，整理成值得深入討論的觀點。
4. \`text\` 必須是可直接放進字幕軌的精簡主題句，不要寫成命令句，也不要只寫 UI 動詞。
5. \`scene_summary\` 要描述畫面到底在看什麼。
6. \`key_insight\` 要說明這個片段為什麼重要、可延伸成什麼觀點。
7. 不確定時請保守，不要捏造不存在的品牌承諾、測試數據或網站內容。

【輸出要求】
- 必須回傳純 JSON。
- subtitles 每項都要包含：\`startAt\`, \`endAt\`, \`text\`, \`scene_summary\`, \`key_insight\`。
- 可額外包含：\`visual_anchor\`, \`confidence\`。
- 請輸出 4 到 10 個內容錨點，依時間排序。
`;

            const promptText =
                `${isColumnTopicMode ? columnPromptRules : (isCompositeTutorial ? compositePromptRules : (useVisualTutorialUnderstanding ? visualTutorialRules : baseStrictRules))}
${(isCompositeTutorial || isColumnTopicMode) ? '' : `【文章撰寫要求】
- 你的角色是「專業的科技 KOL 與媒體評測編輯 (Tech Media Reviewer)」。
- 請用極具吸引力、有說服力的口吻來撰寫這篇產品介紹文章，讓讀者感到驚豔。
- 文章的 \`whatIsIt\` (這到底是什麼) 與 \`consumerBenefits\` (為何我們需要它/痛點解決) 必須基於畫面真實操作的功能，發想深度的行銷效益。文長不可太短，讓它成為一篇適合發布在科技網站上的深度介紹文章。
- \`setupGuide\` 的 \`stepName\` 與 \`description\` 必須嚴格依據畫面中實際出現的操作流程，不可腦補未操作的功能。
- 每個步驟的 \`screenshotTime\` 必須是從圖片標籤中取得的真實秒數。`}
語言：${promptLanguage}`;

            const buildStrictOcrPromptForClicks = (selectedClicks) => {
                const selectedTimes = selectedClicks.map(item => `${item.time.toFixed(2)}s`).join(', ');
                return `
【任務：極度嚴格的像素級 OCR 擷取】
這是一系列螢幕截圖，每張圖有 \`[Time: Xs]\` 標記。
你現在是一個「毫無聯想能力、死板的 OCR 掃描器」。你的唯一工作是擷取【發生真實點擊】處的文字。
${userDesc}
本次已偵測到紅色漣漪點擊總數：${selectedClicks.length}。
點擊時間序列（秒）：${selectedTimes}。

【核心辨識演算法 - 非常重要】
1. 尋找每張圖中的「紅色點擊波紋圈」(Red Click Ripple)。
2. 【只抓點擊】：如果畫面只有滑鼠游標但沒有紅色圈圈，請完全忽略。
3. 鎖定紅圈正下方或內部的文字。
4. 只認準被紅圈直接覆蓋的那一個詞或按鈕，忽略周圍其他文字。
5. 一字不漏地複製該文字。

【輸出要求】
- 必須回傳純 JSON。
- subtitles 陣列數量應與點擊數相同，並依附圖順序排列。
- subtitles 每項都要包含：startAt, endAt, text。
- text 只能填 OCR 到的真實字串，不可自己添加「點擊」等動詞。
`.trim();
            };

            const analyzeStrictScreenClickTexts = async (selectedClicks) => {
                if (!selectedClicks.length) return new Map();
                const textByClickId = new Map();

                for (const point of selectedClicks) {
                    const rippleFrame = rippleFrameByClickId.get(point.clickId)
                        || capturedFrames.find(frame => Math.abs(frame.relativeTime - point.time) <= 0.3)
                        || null;
                    if (!rippleFrame) continue;

                    const ocrPromptText = buildStrictOcrPromptForClicks([point]);
                    let ocrRawText = '';

                    if (subtitleProvider === 'azure') {
                        if (!azureVisionEndpoint || !settings.azureDeployment) throw new Error("請至設定填寫完整的 Azure Vision Endpoint 與 Vision 部署名稱。");
                        const azureUrl = `${azureVisionEndpoint.replace(/\/+$/, '')}/openai/deployments/${settings.azureDeployment}/chat/completions?api-version=2024-02-15-preview`;
                        const response = await fetch(azureUrl, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json', 'api-key': azureVisionKey },
                            body: JSON.stringify({
                                messages: [
                                    { role: "system", content: '你必須回傳純 JSON 物件。包含 subtitles 陣列，每一項都要有 startAt, endAt, text。' },
                                    {
                                        role: "user",
                                        content: [
                                            { type: "text", text: ocrPromptText },
                                            { type: "image_url", image_url: { url: `data:image/jpeg;base64,${rippleFrame.aiData}` } }
                                        ]
                                    }
                                ],
                                temperature: 0,
                                response_format: { type: "json_object" }
                            }),
                            signal: taskSignal
                        });
                        if (!response.ok) throw new Error(`HTTP 錯誤 ${response.status}`);
                        const data = await response.json();
                        ocrRawText = data.choices?.[0]?.message?.content || '';
                    } else if (subtitleProvider === 'gemini') {
                        const safeApiKey = encodeURIComponent(settings.apiKey.trim());
                        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${settings.model}:generateContent?key=${safeApiKey}`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                contents: [{
                                    parts: [
                                        { text: ocrPromptText },
                                        { text: `[Time: ${rippleFrame.relativeTime.toFixed(2)}s]` },
                                        { inlineData: { data: rippleFrame.aiData, mimeType: "image/jpeg" } }
                                    ]
                                }],
                                generationConfig: {
                                    temperature: 0,
                                    responseMimeType: "application/json",
                                    responseSchema: {
                                        type: "OBJECT",
                                        properties: {
                                            subtitles: {
                                                type: "ARRAY",
                                                items: {
                                                    type: "OBJECT",
                                                    properties: {
                                                        startAt: { type: "NUMBER" },
                                                        endAt: { type: "NUMBER" },
                                                        text: { type: "STRING" }
                                                    },
                                                    required: ["startAt", "endAt", "text"]
                                                }
                                            }
                                        },
                                        required: ["subtitles"]
                                    }
                                }
                            }),
                            signal: taskSignal
                        });
                        if (!response.ok) throw new Error(`HTTP 錯誤 ${response.status}`);
                        const data = await response.json();
                        ocrRawText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
                    } else if (subtitleProvider === 'lmstudio') {
                        ocrRawText = await callLmStudioChat({
                            endpoint: lmStudioEndpoint,
                            apiKey: lmStudioApiKey,
                            model: settings.lmStudioVisionModel.trim(),
                            temperature: 0,
                            format: 'json',
                            timeoutMs: lmStudioTimeoutMs,
                            signal: taskSignal,
                            images: [rippleFrame.aiData],
                            prompt: `${ocrPromptText}

【附圖順序與時間】
#1: ${rippleFrame.relativeTime.toFixed(2)}s

請根據附圖順序解析畫面，並嚴格回傳 JSON。`
                        });
                    } else {
                        ocrRawText = await callOllamaChat({
                            endpoint: ollamaEndpoint,
                            model: settings.ollamaVisionModel.trim(),
                            temperature: 0,
                            format: 'json',
                            timeoutMs: ollamaTimeoutMs,
                            signal: taskSignal,
                            images: [rippleFrame.aiData],
                            prompt: `${ocrPromptText}

【附圖順序與時間】
#1: ${rippleFrame.relativeTime.toFixed(2)}s

請根據附圖順序解析畫面，並嚴格回傳 JSON。`
                        });
                    }

                    const parsed = JSON.parse(String(ocrRawText || '').replace(/```json/gi, '').replace(/```/g, '').trim());
                    const text = cleanAiText(parsed?.subtitles?.[0]?.text || '');
                    if (text) textByClickId.set(point.clickId, text);
                }

                return textByClickId;
            };

            const temperature = 0.0;
            let rawText = '';

            let retryCount = 0;
            let success = false;
            const visionDelays = [3000, 6000, 12000];
            subtitleProgress(
                4,
                5,
                isColumnTopicMode ? '送交 AI 內容判讀' : ((isCompositeTutorial || useVisualTutorialUnderstanding) ? '送交 AI 畫面理解' : '送交 AI OCR'),
                isColumnTopicMode
                    ? `正在使用 ${subtitleProviderLabel} (${subtitleModelLabel}) 進行專欄主題分析，準備送出 ${capturedFrames.length} 張畫面。`
                    : isCompositeTutorial
                    ? `正在使用 ${subtitleProviderLabel} (${subtitleModelLabel}) 進行綜合教學分析，準備送出 ${capturedFrames.length} 張畫面。`
                    : useVisualTutorialUnderstanding
                    ? `正在使用 ${subtitleProviderLabel} (${subtitleModelLabel}) 進行教學流程畫面理解，準備送出 ${capturedFrames.length} 張畫面。`
                    : `正在使用 ${subtitleProviderLabel} (${subtitleModelLabel}) 進行 AI字幕辨識，準備將 ${capturedFrames.length} 張畫面送出。`,
                {
                    message: isColumnTopicMode ? '正在上傳畫面給 AI 做內容判讀' : ((isCompositeTutorial || useVisualTutorialUnderstanding) ? '正在上傳畫面給 AI 分析' : '正在上傳畫面給 AI OCR'),
                    clickCount: clickPoints.length,
                    frameCount: capturedFrames.length,
                    uploaded: true
                }
            );

            const compositeClipSchema = {
                type: "OBJECT",
                properties: {
                    segments: {
                        type: "ARRAY",
                        items: {
                            type: "OBJECT",
                            properties: {
                                time_start: { type: "NUMBER" },
                                time_end: { type: "NUMBER" },
                                scene_type: { type: "STRING", enum: ["live_action", "screen_recording", "screen_recording_with_pip", "mixed_overlay", "uncertain"] },
                                instruction_role: { type: "STRING", enum: ["setup", "action", "confirmation", "warning", "explanation", "comparison", "result"] },
                                relation_type: { type: "STRING", enum: ["parallel", "cause_and_effect", "zoom_in_detail", "real_world_correspondence", "supplementary_hint", "decorative_only"] },
                                teaching_goal: { type: "STRING" },
                                main_visual: { type: "STRING" },
                                pip_visual: { type: "STRING" },
                                main_action: { type: "STRING" },
                                pip_action: { type: "STRING" },
                                ui_focus: { type: "STRING" },
                                click_based: { type: "BOOLEAN" },
                                pip_relevance: { type: "STRING", enum: ["critical", "supporting", "optional", "ignore"] },
                                subtitle: { type: "STRING" },
                                voiceover: { type: "STRING" },
                                article_step: { type: "STRING" },
                                confidence: { type: "NUMBER" },
                                evidence: { type: "ARRAY", items: { type: "STRING" } }
                            },
                            required: ["time_start", "time_end", "scene_type", "instruction_role", "relation_type", "teaching_goal", "main_action", "pip_action", "pip_relevance", "subtitle", "voiceover", "article_step"]
                        }
                    }
                },
                required: ["segments"]
            };
            const compositeAzureSystemPrompt = '你必須回傳純 JSON 物件。最外層只包含 segments。segments 陣列每一項都要有 time_start, time_end, scene_type, instruction_role, relation_type, teaching_goal, main_action, pip_action, pip_relevance, subtitle, voiceover, article_step，可額外包含 main_visual, pip_visual, ui_focus, click_based, confidence, evidence。scene_type 只能是 live_action, screen_recording, screen_recording_with_pip, mixed_overlay, uncertain。instruction_role 只能是 setup, action, confirmation, warning, explanation, comparison, result。relation_type 只能是 parallel, cause_and_effect, zoom_in_detail, real_world_correspondence, supplementary_hint, decorative_only。pip_relevance 只能是 critical, supporting, optional, ignore。';
            const selectCompositeFramesForClip = (frames, clipStart, clipEnd, maxCount = 12) => {
                const inClip = frames
                    .filter(frame => frame.relativeTime >= clipStart - 0.01 && frame.relativeTime <= clipEnd + 0.01)
                    .sort((a, b) => a.relativeTime - b.relativeTime);
                if (inClip.length <= maxCount) return inClip;
                const chosen = [];
                const pushIfMissing = (frame) => {
                    if (!frame || chosen.some(item => item.frameId === frame.frameId)) return;
                    chosen.push(frame);
                };
                pushIfMissing(inClip[0]);
                pushIfMissing(inClip[inClip.length - 1]);
                inClip.filter(frame => frame.rippleForClickId).forEach(pushIfMissing);
                if (chosen.length < maxCount) {
                    for (let i = 1; i < maxCount - 1; i++) {
                        const idx = Math.round((i / (maxCount - 1)) * (inClip.length - 1));
                        pushIfMissing(inClip[idx]);
                    }
                }
                return chosen
                    .sort((a, b) => a.relativeTime - b.relativeTime)
                    .slice(0, maxCount);
            };
            const analyzeCompositeClip = async (clip, clipIndex, totalClips, clipFrames, clipClicks) => {
                const clipStart = Number(clip.startAt || 0);
                const clipEnd = Number((clip.startAt || 0) + (clip.duration || 0));
                const clipClickSummary = clipClicks.length
                    ? clipClicks.map(point => `${point.time.toFixed(2)}s`).join(', ')
                    : (settings.language === 'zh-TW' ? '無' : 'none');
                const clipPromptText = `${compositePromptRules}

【本次片段資訊】
- 片段序號：${clipIndex + 1}/${totalClips}
- 片段時間範圍：${clipStart.toFixed(2)}s - ${clipEnd.toFixed(2)}s
- 本片段紅色漣漪點擊數：${clipClicks.length}
- 本片段點擊時間：${clipClickSummary}

【片段獨立判斷規則】
- 只根據本片段畫面做判斷。
- 若本片段前後脈絡不明，請保守描述本片段可見內容。
- 不要因為整支影片看起來像教學流程，就替本片段補上未出現的操作。
- 若本片段只有單一主要事件，可以只輸出 1 個 segment。`;

                let localRetryCount = 0;
                while (localRetryCount < 3) {
                    try {
                        let response;
                        let clipRawText = '';
                        if (subtitleProvider === 'azure') {
                            if (!azureVisionEndpoint || !settings.azureDeployment) throw new Error("請至設定填寫完整的 Azure Vision Endpoint 與 Vision 部署名稱。");
                            const messages = [
                                { role: "system", content: compositeAzureSystemPrompt },
                                {
                                    role: "user",
                                    content: [
                                        { type: "text", text: clipPromptText },
                                        ...clipFrames.map(frame => ({
                                            type: "image_url",
                                            image_url: { url: `data:image/jpeg;base64,${frame.aiData}` }
                                        }))
                                    ]
                                }
                            ];
                            const azureUrl = `${azureVisionEndpoint.replace(/\/+$/, '')}/openai/deployments/${settings.azureDeployment}/chat/completions?api-version=2024-02-15-preview`;
                            response = await fetch(azureUrl, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json', 'api-key': azureVisionKey },
                                body: JSON.stringify({
                                    messages,
                                    temperature,
                                    response_format: { type: "json_object" }
                                }),
                                signal: taskSignal
                            });
                        } else if (subtitleProvider === 'gemini') {
                            const apiParts = [{ text: clipPromptText }];
                            clipFrames.forEach(frame => {
                                apiParts.push({ text: `[Time: ${frame.relativeTime.toFixed(2)}s]` });
                                apiParts.push({ inlineData: { data: frame.aiData, mimeType: "image/jpeg" } });
                            });
                            const safeApiKey = encodeURIComponent(settings.apiKey.trim());
                            response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${settings.model}:generateContent?key=${safeApiKey}`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    contents: [{ parts: apiParts }],
                                    generationConfig: {
                                        temperature,
                                        responseMimeType: "application/json",
                                        responseSchema: compositeClipSchema
                                    }
                                }),
                                signal: taskSignal
                            });
                        } else if (subtitleProvider === 'lmstudio') {
                            const orderedFramesText = clipFrames
                                .map((frame, index) => `#${index + 1}: ${frame.relativeTime.toFixed(2)}s`)
                                .join('\n');
                            clipRawText = await callLmStudioChat({
                                endpoint: lmStudioEndpoint,
                                apiKey: lmStudioApiKey,
                                model: settings.lmStudioVisionModel.trim(),
                                temperature,
                                format: 'json',
                                timeoutMs: lmStudioTimeoutMs,
                                signal: taskSignal,
                                images: clipFrames.map(frame => frame.aiData),
                                prompt: `${clipPromptText}

【附圖順序與時間】
${orderedFramesText}

請根據附圖順序解析這個單一片段，並嚴格回傳 JSON。`
                            });
                        } else {
                            const orderedFramesText = clipFrames
                                .map((frame, index) => `#${index + 1}: ${frame.relativeTime.toFixed(2)}s`)
                                .join('\n');
                            clipRawText = await callOllamaChat({
                                endpoint: ollamaEndpoint,
                                model: settings.ollamaVisionModel.trim(),
                                temperature,
                                format: 'json',
                                timeoutMs: ollamaTimeoutMs,
                                signal: taskSignal,
                                images: clipFrames.map(frame => frame.aiData),
                                prompt: `${clipPromptText}

【附圖順序與時間】
${orderedFramesText}

請根據附圖順序解析這個單一片段，並嚴格回傳 JSON。`
                            });
                        }

                        if (response && (response.status === 429 || response.status >= 500)) {
                            const waitTime = visionDelays[localRetryCount];
                            if (waitTime) {
                                await waitWithAbort(waitTime, taskSignal);
                            }
                            localRetryCount++;
                            continue;
                        }
                        if (response && !response.ok) {
                            const errText = await response.text().catch(() => '');
                            const errHint = errText ? `: ${errText.slice(0, 400)}` : '';
                            throw new Error(`HTTP 錯誤 ${response.status}${errHint}`);
                        }
                        if (response) {
                            const data = await response.json();
                            if (data.error) throw new Error(data.error.message);
                            clipRawText = subtitleProvider === 'azure'
                                ? (data.choices?.[0]?.message?.content || '')
                                : (data.candidates?.[0]?.content?.parts?.[0]?.text || '');
                        }
                        if (!clipRawText) throw new Error('AI 沒有回傳可解析內容。');
                        const parsedClip = JSON.parse(clipRawText.replace(/```json/gi, '').replace(/```/g, '').trim());
                        return Array.isArray(parsedClip?.segments) ? parsedClip.segments : [];
                    } catch (err) {
                        if ((err.message.includes('Failed to fetch') || err.name === 'TypeError') && localRetryCount < 2) {
                            const waitTime = visionDelays[localRetryCount];
                            if (waitTime) await waitWithAbort(waitTime, taskSignal);
                            localRetryCount++;
                            continue;
                        }
                        throw err;
                    }
                }
                return [];
            };

            if (isCompositeTutorial) {
                const compositeClipGroups = allVideoClips.map((clip, clipIndex) => {
                    const clipStart = Number(clip.startAt || 0);
                    const clipEnd = Number((clip.startAt || 0) + (clip.duration || 0));
                    return {
                        clip,
                        clipIndex,
                        clipFrames: selectCompositeFramesForClip(capturedFrames, clipStart, clipEnd),
                        clipClicks: clickPoints.filter(point => point.time >= clipStart - 0.2 && point.time <= clipEnd + 0.2)
                    };
                }).filter(item => item.clipFrames.length > 0);

                const mergedSegments = [];
                for (const group of compositeClipGroups) {
                    subtitleProgress(
                        4,
                        5,
                        '逐片段 AI 分析',
                        `正在分析片段 ${group.clipIndex + 1}/${compositeClipGroups.length}，只使用這個片段內的 ${group.clipFrames.length} 張畫面。`,
                        {
                            message: `片段 ${group.clipIndex + 1}/${compositeClipGroups.length}`,
                            clickCount: group.clipClicks.length,
                            frameCount: group.clipFrames.length,
                            uploaded: true
                        }
                    );
                    const clipSegments = await analyzeCompositeClip(group.clip, group.clipIndex, compositeClipGroups.length, group.clipFrames, group.clipClicks);
                    if (clipSegments.length > 0) {
                        mergedSegments.push(...clipSegments);
                    } else {
                        const clipStart = Number(group.clip.startAt || 0);
                        const clipEnd = Number((group.clip.startAt || 0) + (group.clip.duration || 0));
                        mergedSegments.push({
                            time_start: clipStart,
                            time_end: clipEnd,
                            scene_type: 'uncertain',
                            instruction_role: 'action',
                            relation_type: 'supplementary_hint',
                            teaching_goal: settings.language === 'zh-TW' ? '片段內容待確認' : 'Clip content needs review',
                            main_action: settings.language === 'zh-TW' ? '無法可靠判定此片段的主要操作' : 'Unable to determine the main action for this clip',
                            pip_action: '',
                            pip_relevance: 'ignore',
                            subtitle: settings.language === 'zh-TW' ? '此片段內容需人工確認。' : 'This clip needs manual review.',
                            voiceover: settings.language === 'zh-TW' ? '這個片段的內容不夠明確，建議人工確認後再使用。' : 'This clip is ambiguous and should be reviewed manually.',
                            article_step: settings.language === 'zh-TW' ? '此片段內容不夠明確，建議人工確認。' : 'This clip is ambiguous and should be reviewed manually.'
                        });
                    }
                }
                rawText = JSON.stringify({ segments: mergedSegments });
                success = true;
            }

            while (retryCount < 3 && !success) {
                try {
                    let response;
                    if (subtitleProvider === 'azure') {
                        if (!azureVisionEndpoint || !settings.azureDeployment) throw new Error("請至設定填寫完整的 Azure Vision Endpoint 與 Vision 部署名稱。");

                        // Interleave [Time: Xs] text labels before each image so Azure
                        // uses the actual video timestamp instead of guessing from UI content
                        // (e.g. router dashboard showing uptime "48 min" causing wrong startAt).
                        const azureImageContent = capturedFrames.flatMap(f => [
                            { type: "text", text: `[Time: ${f.relativeTime.toFixed(2)}s]` },
                            { type: "image_url", image_url: { url: `data:image/jpeg;base64,${f.aiData}` } }
                        ]);
                        const messages = [
                            {
                                role: "user",
                                content: [
                                    { type: "text", text: promptText },
                                    ...azureImageContent
                                ]
                            }
                        ];

                        const azureSystemPrompt = isColumnTopicMode
                            ? '你必須回傳純 JSON 物件。包含 subtitles 陣列，每一項都要有 startAt, endAt, text, scene_summary, key_insight，可額外包含 visual_anchor, confidence。'
                            : isCompositeTutorial
                                ? '你必須回傳純 JSON 物件。最外層包含 segments 與 doc。segments 陣列每一項都要有 time_start, time_end, scene_type, instruction_role, relation_type, teaching_goal, main_action, pip_action, pip_relevance, subtitle, voiceover, article_step，可額外包含 main_visual, pip_visual, ui_focus, click_based, confidence, evidence。scene_type 只能是 live_action, screen_recording, screen_recording_with_pip, mixed_overlay, uncertain。instruction_role 只能是 setup, action, confirmation, warning, explanation, comparison, result。relation_type 只能是 parallel, cause_and_effect, zoom_in_detail, real_world_correspondence, supplementary_hint, decorative_only。pip_relevance 只能是 critical, supporting, optional, ignore。doc 物件必須包含 title, overview, preparation, steps, warnings, result_summary，steps 每項都要有 segment_index, step_title, description, screenshot_time。'
                                : useVisualTutorialUnderstanding
                                ? '你必須回傳純 JSON 物件。包含 subtitles 陣列 (含 startAt, endAt, text) 與 doc 物件 (包含 title, whatIsIt, consumerBenefits(陣列，含 benefitName, description), setupGuide(陣列，含 stepName, description, screenshotTime), conclusion)。設定步驟必須依據畫面中實際出現的 UI 流程與時間標籤。'
                                : '你必須回傳純 JSON 物件。包含 subtitles 陣列 (含 startAt, endAt, text) 與 doc 物件 (包含 title, whatIsIt, consumerBenefits(陣列，含 benefitName, description), setupGuide(陣列，含 stepName, description, screenshotTime), conclusion)。設定步驟請完全依賴紅圈進行 OCR 辨識，文章主體需展現 KOL 專業口吻。';

                        messages.unshift({ role: "system", content: azureSystemPrompt });

                        const azureUrl = `${azureVisionEndpoint.replace(/\/+$/, '')}/openai/deployments/${settings.azureDeployment}/chat/completions?api-version=2024-02-15-preview`;
                        response = await fetch(azureUrl, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json', 'api-key': azureVisionKey },
                            body: JSON.stringify({
                                messages: messages,
                                temperature: temperature,
                                response_format: { type: "json_object" }
                            }),
                            signal: taskSignal
                        });
                    } else if (subtitleProvider === 'gemini') {
                        const apiParts = [{ text: promptText }];
                        capturedFrames.forEach(f => {
                            apiParts.push({ text: `[Time: ${f.relativeTime.toFixed(2)}s]` });
                            apiParts.push({ inlineData: { data: f.aiData, mimeType: "image/jpeg" } });
                        });

                        const responseSchema = isColumnTopicMode
                            ? {
                                type: "OBJECT",
                                properties: {
                                    subtitles: {
                                        type: "ARRAY",
                                        items: {
                                            type: "OBJECT",
                                            properties: {
                                                startAt: { type: "NUMBER" },
                                                endAt: { type: "NUMBER" },
                                                text: { type: "STRING" },
                                                scene_summary: { type: "STRING" },
                                                key_insight: { type: "STRING" },
                                                visual_anchor: { type: "STRING" },
                                                confidence: { type: "NUMBER" }
                                            },
                                            required: ["startAt", "endAt", "text", "scene_summary", "key_insight"]
                                        }
                                    }
                                },
                                required: ["subtitles"]
                            }
                            : isCompositeTutorial
                                ? {
                                    type: "OBJECT",
                                    properties: {
                                        segments: {
                                            type: "ARRAY",
                                            items: {
                                                type: "OBJECT",
                                                properties: {
                                                    time_start: { type: "NUMBER" },
                                                    time_end: { type: "NUMBER" },
                                                    scene_type: { type: "STRING", enum: ["live_action", "screen_recording", "screen_recording_with_pip", "mixed_overlay", "uncertain"] },
                                                    instruction_role: { type: "STRING", enum: ["setup", "action", "confirmation", "warning", "explanation", "comparison", "result"] },
                                                    relation_type: { type: "STRING", enum: ["parallel", "cause_and_effect", "zoom_in_detail", "real_world_correspondence", "supplementary_hint", "decorative_only"] },
                                                    teaching_goal: { type: "STRING" },
                                                    main_visual: { type: "STRING" },
                                                    pip_visual: { type: "STRING" },
                                                    main_action: { type: "STRING" },
                                                    pip_action: { type: "STRING" },
                                                    ui_focus: { type: "STRING" },
                                                    click_based: { type: "BOOLEAN" },
                                                    pip_relevance: { type: "STRING", enum: ["critical", "supporting", "optional", "ignore"] },
                                                    subtitle: { type: "STRING" },
                                                    voiceover: { type: "STRING" },
                                                    article_step: { type: "STRING" },
                                                    confidence: { type: "NUMBER" },
                                                    evidence: { type: "ARRAY", items: { type: "STRING" } }
                                                },
                                                required: ["time_start", "time_end", "scene_type", "instruction_role", "relation_type", "teaching_goal", "main_action", "pip_action", "pip_relevance", "subtitle", "voiceover", "article_step"]
                                            }
                                        },
                                        doc: {
                                            type: "OBJECT",
                                            properties: {
                                                title: { type: "STRING" },
                                                overview: { type: "STRING" },
                                                preparation: { type: "ARRAY", items: { type: "STRING" } },
                                                steps: {
                                                    type: "ARRAY",
                                                    items: {
                                                        type: "OBJECT",
                                                        properties: {
                                                            segment_index: { type: "NUMBER" },
                                                            step_title: { type: "STRING" },
                                                            description: { type: "STRING" },
                                                            screenshot_time: { type: "NUMBER" }
                                                        },
                                                        required: ["segment_index", "step_title", "description", "screenshot_time"]
                                                    }
                                                },
                                                warnings: { type: "ARRAY", items: { type: "STRING" } },
                                                result_summary: { type: "STRING" }
                                            },
                                            required: ["title", "overview", "steps", "result_summary"]
                                        }
                                    },
                                    required: ["segments", "doc"]
                                }
                                : { type: "OBJECT", properties: { subtitles: { type: "ARRAY", items: { type: "OBJECT", properties: { startAt: { type: "NUMBER" }, endAt: { type: "NUMBER" }, text: { type: "STRING" } }, required: ["startAt", "endAt", "text"] } }, doc: { type: "OBJECT", properties: { title: { type: "STRING" }, whatIsIt: { type: "STRING" }, consumerBenefits: { type: "ARRAY", items: { type: "OBJECT", properties: { benefitName: { type: "STRING" }, description: { type: "STRING" } }, required: ["benefitName", "description"] } }, setupGuide: { type: "ARRAY", items: { type: "OBJECT", properties: { stepName: { type: "STRING" }, description: { type: "STRING" }, screenshotTime: { type: "NUMBER" } }, required: ["stepName", "description", "screenshotTime"] } }, conclusion: { type: "STRING" } }, required: ["title", "whatIsIt", "consumerBenefits", "setupGuide", "conclusion"] } }, required: ["subtitles", "doc"] };

                        const safeApiKey = encodeURIComponent(settings.apiKey.trim());
                        response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${settings.model}:generateContent?key=${safeApiKey}`, {
                            method: 'POST', headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                contents: [{ parts: apiParts }],
                                generationConfig: { temperature: temperature, responseMimeType: "application/json", responseSchema: responseSchema }
                            }),
                            signal: taskSignal
                        });
                    } else if (subtitleProvider === 'lmstudio') {
                        const orderedFramesText = capturedFrames
                            .map((frame, index) => `#${index + 1}: ${frame.relativeTime.toFixed(2)}s`)
                            .join('\n');
                        rawText = await callLmStudioChat({
                            endpoint: lmStudioEndpoint,
                            apiKey: lmStudioApiKey,
                            model: settings.lmStudioVisionModel.trim(),
                            temperature,
                            format: 'json',
                            timeoutMs: lmStudioTimeoutMs,
                            signal: taskSignal,
                            images: capturedFrames.map((frame) => frame.aiData),
                            prompt: `${promptText}

【附圖順序與時間】
${orderedFramesText}

請根據附圖順序解析畫面，並嚴格回傳 JSON。`
                        });
                        success = true;
                        break;
                    } else {
                        const orderedFramesText = capturedFrames
                            .map((frame, index) => `#${index + 1}: ${frame.relativeTime.toFixed(2)}s`)
                            .join('\n');
                        rawText = await callOllamaChat({
                            endpoint: ollamaEndpoint,
                            model: settings.ollamaVisionModel.trim(),
                            temperature,
                            format: 'json',
                            timeoutMs: ollamaTimeoutMs,
                            signal: taskSignal,
                            images: capturedFrames.map((frame) => frame.aiData),
                            prompt: `${promptText}

【附圖順序與時間】
${orderedFramesText}

請根據附圖順序解析畫面，並嚴格回傳 JSON。`
                        });
                        success = true;
                        break;
                    }

                    if (response && (response.status === 429 || response.status >= 500)) {
                            const waitTime = visionDelays[retryCount];
                            if (waitTime) {
                                subtitleProgress(
                                    4,
                                    5,
                                    isColumnTopicMode ? '等待 AI 內容判讀重試' : (isCompositeTutorial ? '等待 AI 分析重試' : '等待 AI OCR 重試'),
                                    isColumnTopicMode
                                        ? `正在使用 ${subtitleProviderLabel} (${subtitleModelLabel}) 進行專欄主題分析，伺服器忙碌，等待 ${waitTime / 1000} 秒後重試...`
                                        : isCompositeTutorial
                                        ? `正在使用 ${subtitleProviderLabel} (${subtitleModelLabel}) 進行綜合教學分析，伺服器忙碌，等待 ${waitTime / 1000} 秒後重試...`
                                        : `正在使用 ${subtitleProviderLabel} (${subtitleModelLabel}) 進行 AI字幕辨識，伺服器忙碌，等待 ${waitTime / 1000} 秒後重試...`,
                                    {
                                        clickCount: clickPoints.length,
                                        frameCount: capturedFrames.length,
                                        uploaded: true
                                    }
                                );
                                await waitWithAbort(waitTime, taskSignal);
                            }
                            retryCount++;
                            continue;
                        }

                    if (!response.ok) {
                        const errText = await response.text().catch(() => '');
                        const errHint = errText ? `: ${errText.slice(0, 400)}` : '';
                        throw new Error(`HTTP 錯誤 ${response.status}${errHint}`);
                    }

                    const data = await response.json();
                    if (data.error) throw new Error(data.error.message);

                    if (subtitleProvider === 'azure') {
                        rawText = data.choices?.[0]?.message?.content || '';
                    } else {
                        rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
                    }
                    if (!rawText) throw new Error('AI 沒有回傳可解析內容，請確認 Vision deployment 與 endpoint 是否正確。');
                    success = true;

                } catch (err) {
                    if (err.message.includes('Failed to fetch') || err.name === 'TypeError') {
                        const waitTime = visionDelays[retryCount];
                        if (waitTime) {
                            subtitleProgress(
                                4,
                                5,
                                isColumnTopicMode ? '等待 AI 內容判讀重試' : (isCompositeTutorial ? '等待 AI 分析重試' : '等待 AI OCR 重試'),
                                isColumnTopicMode
                                    ? `正在使用 ${subtitleProviderLabel} (${subtitleModelLabel}) 進行專欄主題分析，網路連線異常，等待 ${waitTime / 1000} 秒後重試...`
                                    : isCompositeTutorial
                                    ? `正在使用 ${subtitleProviderLabel} (${subtitleModelLabel}) 進行綜合教學分析，網路連線異常，等待 ${waitTime / 1000} 秒後重試...`
                                    : `正在使用 ${subtitleProviderLabel} (${subtitleModelLabel}) 進行 AI字幕辨識，網路連線異常，等待 ${waitTime / 1000} 秒後重試...`,
                                {
                                    clickCount: clickPoints.length,
                                    frameCount: capturedFrames.length,
                                    uploaded: true
                                }
                            );
                            await waitWithAbort(waitTime, taskSignal);
                            retryCount++;
                            continue;
                        }
                    }
                    throw err;
                }
            }

            if (!success) {
                throw new Error("重試多次後仍無法連線 (Failed to fetch)。可能原因：1. API Key 無效 2. 請求頻率觸發防火牆封鎖。");
            }

            subtitleProgress(
                5,
                5,
                '同步字幕與文件',
                isColumnTopicMode
                    ? `正在使用 ${subtitleProviderLabel} (${subtitleModelLabel}) 完成專欄主題後處理，同步內容錨點與截圖素材...`
                    : isCompositeTutorial
                    ? `正在使用 ${subtitleProviderLabel} (${subtitleModelLabel}) 完成綜合教學字幕後處理，同步字幕與畫面分析結果...`
                    : `正在使用 ${subtitleProviderLabel} (${subtitleModelLabel}) 完成 AI字幕後處理，同步字幕與組裝高畫質截圖文件...`,
                {
                    clickCount: clickPoints.length,
                    frameCount: capturedFrames.length,
                    uploaded: true
                }
            );

            if (rawText) {
                const jsonStr = rawText.replace(/```json/gi, '').replace(/```/g, '').trim();
                const parsedData = JSON.parse(jsonStr);
                const jsonSubs = Array.isArray(parsedData.subtitles) ? parsedData.subtitles : [];
                const compositeSegments = isCompositeTutorial && Array.isArray(parsedData.segments) ? parsedData.segments : [];
                const doc = parsedData.doc && typeof parsedData.doc === 'object' ? parsedData.doc : null;
                const toNumber = (value) => {
                    const n = typeof value === 'number' ? value : parseFloat(String(value ?? '').replace(/[^\d.-]/g, ''));
                    return Number.isFinite(n) ? n : null;
                };
                const getRippleFrameByIndex = (idx) => {
                    const point = clickPoints[idx];
                    if (!point) return null;
                    return rippleFrameByClickId.get(point.clickId) || null;
                };

                const guideDerivedSubs = (doc?.setupGuide || [])
                    .map((step, idx) => {
                        const text = String(step?.stepName || step?.description || '').trim();
                        if (!text) return null;
                        const rippleFrame = getRippleFrameByIndex(idx);
                        return {
                            startAt: (rippleFrame ? Number(rippleFrame.relativeTime.toFixed(2)) : null) ?? toNumber(step?.screenshotTime) ?? (clickTimes[idx] ?? idx * 0.6),
                            endAt: null,
                            text
                        };
                    })
                    .filter(Boolean);
                const compositeDerivedSubs = compositeSegments.map((segment, index) => ({
                    startAt: toNumber(segment?.time_start) ?? toNumber(segment?.startAt) ?? (index * 0.8),
                    endAt: toNumber(segment?.time_end) ?? toNumber(segment?.endAt),
                    scene_type: segment?.scene_type,
                    instruction_role: segment?.instruction_role,
                    relation_type: segment?.relation_type,
                    teaching_goal: segment?.teaching_goal,
                    main_visual: segment?.main_visual,
                    pip_visual: segment?.pip_visual,
                    main_action: segment?.main_action,
                    pip_action: segment?.pip_action,
                    ui_focus: segment?.ui_focus,
                    click_based: segment?.click_based,
                    pip_relevance: segment?.pip_relevance,
                    subtitle: segment?.subtitle,
                    voiceover: segment?.voiceover,
                    article_step: segment?.article_step,
                    confidence: segment?.confidence,
                    evidence: Array.isArray(segment?.evidence) ? segment.evidence : []
                }));
                const sourceSubs = isCompositeTutorial
                    ? (compositeDerivedSubs.length > 0 ? compositeDerivedSubs : jsonSubs)
                    : (jsonSubs.length > 0 ? jsonSubs : guideDerivedSubs);
                const isUsableTimeline = (arr) => {
                    if (!arr || arr.length === 0) return false;
                    if (arr.some(v => v === null || !Number.isFinite(v))) return false;
                    const nums = arr.map(v => Number(v));
                    const uniqueCount = new Set(nums.map(v => v.toFixed(2))).size;
                    const spread = Math.max(...nums) - Math.min(...nums);
                    return uniqueCount >= Math.max(2, Math.ceil(nums.length * 0.5)) && spread >= 0.2;
                };
                const hasClickAnchors = !isCompositeTutorial && !isColumnTopicMode && !useVisualTutorialUnderstanding && isUsableTimeline(clickTimes);
                const workingSubs = hasClickAnchors
                    ? sourceSubs.slice(0, clickTimes.length)
                    : sourceSubs;
                const pickFrameAnchors = (count) => {
                    const anchors = [];
                    if (!capturedFrames.length) return anchors;
                    const times = [...new Set(capturedFrames.map(f => Number(f.relativeTime.toFixed(2))))].sort((a, b) => a - b);
                    if (!times.length) return anchors;
                    if (count === 1) return [times[0]];
                    for (let i = 0; i < count; i++) {
                        const idx = Math.round((i / (count - 1)) * (times.length - 1));
                        anchors.push(times[idx]);
                    }
                    return anchors;
                };

                const guideTimes = (doc?.setupGuide || [])
                    .map(step => toNumber(step.screenshotTime))
                    .filter(v => v !== null)
                    .map(v => Number(v.toFixed(2)));
                const compositeGuideTimes = (doc?.steps || [])
                    .map(step => toNumber(step?.screenshot_time))
                    .filter(v => v !== null)
                    .map(v => Number(v.toFixed(2)));

                const rawStarts = workingSubs.map(sub => toNumber(sub.startAt ?? sub.time_start));
                let normalizedStarts = [];
                if (hasClickAnchors) {
                    normalizedStarts = clickTimes.slice(0, workingSubs.length);
                } else if (isUsableTimeline(rawStarts)) {
                    normalizedStarts = rawStarts.map(v => Number(v.toFixed(2)));
                } else if (isCompositeTutorial && compositeGuideTimes.length >= workingSubs.length && isUsableTimeline(compositeGuideTimes.slice(0, workingSubs.length))) {
                    normalizedStarts = compositeGuideTimes.slice(0, workingSubs.length);
                } else if (guideTimes.length >= workingSubs.length && isUsableTimeline(guideTimes.slice(0, workingSubs.length))) {
                    normalizedStarts = guideTimes.slice(0, workingSubs.length);
                } else {
                    normalizedStarts = pickFrameAnchors(workingSubs.length);
                }
                if (!hasClickAnchors && normalizedStarts.length < workingSubs.length) {
                    const base = normalizedStarts.length ? normalizedStarts[normalizedStarts.length - 1] : 0;
                    for (let i = normalizedStarts.length; i < workingSubs.length; i++) {
                        normalizedStarts.push(Number((base + (i - normalizedStarts.length + 1) * 0.6).toFixed(2)));
                    }
                }

                const normalizeMatchText = (value) => cleanAiText(value)
                    .toLowerCase()
                    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
                    .replace(/\s+/g, ' ')
                    .trim();
                const hasActionIntent = (value) => /\b(click|tap|select|choose|open|move|go|enter|sign in|apply|continue|review|check)\b/i.test(value);
                const isPassiveStatusText = (value) => /\b(loads?|overview|status|shows?|progress|wait|applying)\b/i.test(value);
                const usedVisualClickIds = new Set();
                const findVisualClickPointForSubtitle = (sub, index) => {
                    // OCR mode: keep simple index mapping (timing already correct
                    // because normalizedStarts = clickTimes in this path).
                    if (!useVisualTutorialUnderstanding) return clickPoints[index] ?? null;

                    // Visual Understanding mode: text match + strong time proximity
                    const anchorTime = Number.isFinite(Number(normalizedStarts[index]))
                        ? Number(normalizedStarts[index])
                        : null;
                    const text = normalizeMatchText([
                        sub?.text,
                        sub?.stepName,
                        sub?.main_action,
                        sub?.teaching_goal
                    ].filter(Boolean).join(' '));
                    if (!text) return null;

                    let best = null;
                    let bestScore = -Infinity;
                    clickPoints.forEach((point) => {
                        if (!point?.clickId || usedVisualClickIds.has(point.clickId)) return;
                        const label = normalizeMatchText(point.label || point.targetText || '');
                        if (!label) return;
                        let score = 0;
                        if (text.includes(label)) score += 5;
                        const labelTokens = label.split(' ').filter(token => token.length >= 2);
                        if (labelTokens.length && labelTokens.every(token => text.includes(token))) score += 3;
                        if (hasActionIntent(text)) score += 3;
                        if (isPassiveStatusText(text)) score -= 3;
                        // Strengthened time penalty: each second of gap costs 1.2 pts,
                        // capped at 10. A 5 s gap now costs 6 pts (was 0.5 pts before).
                        const rawDelta = anchorTime !== null
                            ? Math.abs(anchorTime - Number(point.time || 0))
                            : 0;
                        score -= Math.min(10, rawDelta * 1.2);
                        if (score > bestScore) {
                            bestScore = score;
                            best = point;
                        }
                    });
                    if (best && bestScore >= 3) {
                        usedVisualClickIds.add(best.clickId);
                        return best;
                    }
                    return null;
                };
                const estimateVisualSubtitleDuration = (text) => {
                    const clean = cleanAiText(text);
                    if (!clean) return 2;
                    const readingSeconds = 1.35 + clean.length / 23;
                    return Number(clamp(readingSeconds, 1.8, 4.2).toFixed(2));
                };

                let parsedSubs = workingSubs.map((sub, index) => {
                    const clickPoint = findVisualClickPointForSubtitle(sub, index);
                    const rippleFrame = clickPoint ? rippleFrameByClickId.get(clickPoint.clickId) : null;
                    const clickStart = clickPoint && Number.isFinite(Number(clickPoint.time))
                        ? Number(Number(clickPoint.time).toFixed(2))
                        : null;
                    const start = rippleFrame
                        ? Number(rippleFrame.relativeTime.toFixed(2))
                        : (clickStart ?? normalizedStarts[index]);
                    const rawEnd = toNumber(sub.endAt ?? sub.time_end);
                    let end = rawEnd;
                    if (end === null || end <= start) {
                        if (index < workingSubs.length - 1) {
                            const nextStart = normalizedStarts[index + 1];
                            end = Number.isFinite(nextStart) ? nextStart : start + 3;
                        } else {
                            end = start + 3;
                        }
                    }
                    const sceneType = normalizeSceneType(sub.scene_type);
                    const mainAction = cleanAiText(sub.main_action || sub.key_insight || sub.text || '');
                    const pipAction = cleanAiText(sub.pip_action || '');
                    const instructionRole = normalizeInstructionRole(sub.instruction_role);
                    const relationType = normalizeRelationType(sub.relation_type);
                    const pipRelevance = normalizePipRelevance(sub.pip_relevance);
                    const teachingGoal = cleanAiText(sub.teaching_goal || mainAction || sub.text || '');
                    const voiceover = cleanAiText(sub.voiceover || '');
                    const articleStep = cleanAiText(sub.article_step || '');
                    const subtitleText = isColumnTopicMode
                        ? cleanAiText(sub.text || sub.key_insight || sub.scene_summary || '')
                        : isCompositeTutorial
                        ? buildCompositeSubtitleText(sub, mainAction)
                        : cleanAiText(sub.text || sub.stepName || mainAction || '');
                    const actionPrefix = settings.language === 'zh-TW' ? "點擊 '" : "Click '";
                    const actionSuffix = settings.language === 'zh-TW' ? "'" : "'";
                    return {
                        id: `sub_${Math.random()}`,
                        clickId: clickPoint?.clickId || '',
                        startAt: Number(start.toFixed(2)),
                        endAt: Number(end.toFixed(2)),
                        text: isColumnTopicMode
                            ? subtitleText
                            : (isCompositeTutorial || useVisualTutorialUnderstanding
                                ? subtitleText
                                : `${actionPrefix}${String(sub.text || '').trim()}${actionSuffix}`),
                        sceneType,
                        mainAction,
                        pipAction: isColumnTopicMode ? cleanAiText(sub.scene_summary || pipAction) : pipAction,
                        instructionRole,
                        relationType,
                        teachingGoal,
                        pipRelevance,
                        voiceover,
                        articleStep,
                        clickBased: Boolean(sub.click_based),
                        screenFocus: cleanAiText(sub.screen_focus || sub.visual_anchor || sub.ui_focus || ''),
                        mainVisual: cleanAiText(sub.main_visual || ''),
                        pipVisual: cleanAiText(sub.pip_visual || ''),
                        confidence: Number.isFinite(Number(sub.confidence)) ? Number(Number(sub.confidence).toFixed(3)) : null,
                        evidence: Array.isArray(sub.evidence) ? sub.evidence.map(cleanAiText).filter(Boolean) : []
                    };
                }).filter(s => (isCompositeTutorial || isColumnTopicMode || useVisualTutorialUnderstanding) ? !!cleanAiText(s.text) : s.text !== `${settings.language === 'zh-TW' ? "點擊 ''" : "Click ''"}`);
                if (!isCompositeTutorial && !isColumnTopicMode && !useVisualTutorialUnderstanding) {
                    const actionPrefix = settings.language === 'zh-TW' ? "點擊 '" : "Click '";
                    const actionSuffix = "'";
                    parsedSubs = parsedSubs.map((sub, idx) => {
                        const forced = cleanClickLabel(clickPoints[idx]?.label);
                        if (!forced) return sub;
                        return { ...sub, text: `${actionPrefix}${forced}${actionSuffix}` };
                    });
                }

                parsedSubs.sort((a, b) => a.startAt - b.startAt);
                if (hasClickAnchors && parsedSubs.length > clickTimes.length) {
                    parsedSubs.length = clickTimes.length;
                }
                for (let i = 1; i < parsedSubs.length; i++) {
                    const minimumStartGap = useVisualTutorialUnderstanding
                        ? Math.min(1.2, estimateVisualSubtitleDuration(parsedSubs[i - 1].text) * 0.45)
                        : 0.05;
                    if (parsedSubs[i].startAt <= parsedSubs[i - 1].startAt + minimumStartGap) {
                        parsedSubs[i].startAt = Number((parsedSubs[i - 1].startAt + minimumStartGap).toFixed(2));
                    }
                }
                for (let i = 0; i < parsedSubs.length; i++) {
                    if (!Number.isFinite(parsedSubs[i].endAt) || parsedSubs[i].endAt <= parsedSubs[i].startAt) {
                        const nextStart = i < parsedSubs.length - 1 ? parsedSubs[i + 1].startAt : parsedSubs[i].startAt + 3;
                        parsedSubs[i].endAt = Number((Math.max(nextStart, parsedSubs[i].startAt + 0.5)).toFixed(2));
                    }
                }
                if (useVisualTutorialUnderstanding) {
                    parsedSubs = parsedSubs.map((sub, index) => {
                        const start = Number(sub.startAt || 0);
                        const nextStart = index < parsedSubs.length - 1 ? Number(parsedSubs[index + 1].startAt) : null;
                        const idealEnd = start + estimateVisualSubtitleDuration(sub.text);
                        let end = Math.min(Number(sub.endAt || idealEnd), idealEnd);
                        if (Number.isFinite(nextStart)) {
                            end = Math.min(end, nextStart - 0.12);
                        }
                        const minimumDuration = Number.isFinite(nextStart)
                            ? Math.min(1.4, Math.max(0.45, nextStart - start - 0.08))
                            : 1.4;
                        if (end < start + minimumDuration) {
                            end = start + minimumDuration;
                        }
                        if (Number.isFinite(nextStart) && end >= nextStart) {
                            end = Math.max(start + 0.45, nextStart - 0.05);
                        }
                        const timelineEnd = Number(totalDuration || timelineContentEnd || 0);
                        if (timelineEnd > 0) {
                            end = Math.min(end, timelineEnd);
                        }
                        return {
                            ...sub,
                            endAt: Number(Math.max(start + 0.45, end).toFixed(2))
                        };
                    });
                }

                if (isCompositeTutorial) {
                    const actionPrefix = settings.language === 'zh-TW' ? "點擊 '" : "Click '";
                    const actionSuffix = "'";
                    const isScreenScene = (sceneType) => sceneType === 'screen_recording' || sceneType === 'screen_recording_with_pip';
                    const screenWindows = parsedSubs
                        .filter(sub => isScreenScene(sub.sceneType))
                        .map(sub => ({
                            startAt: sub.startAt,
                            endAt: sub.endAt,
                            pipAction: sub.pipAction,
                            relationType: sub.relationType,
                            pipRelevance: sub.pipRelevance,
                            voiceover: sub.voiceover,
                            articleStep: sub.articleStep,
                            screenFocus: sub.screenFocus,
                            mainVisual: sub.mainVisual,
                            pipVisual: sub.pipVisual,
                            confidence: sub.confidence,
                            evidence: sub.evidence
                        }))
                        .sort((a, b) => a.startAt - b.startAt);
                    const nonScreenSubs = parsedSubs.filter(sub => !isScreenScene(sub.sceneType));
                    const screenRelatedClicks = clickPoints.filter(point => {
                        const rippleFrame = rippleFrameByClickId.get(point.clickId);
                        const clickTime = rippleFrame ? rippleFrame.relativeTime : point.time;
                        return Number.isFinite(clickTime) && clickTime >= -0.05 && clickTime <= totalDuration + 0.5;
                    });
                    const clicksNeedOcr = screenRelatedClicks.filter(point => !cleanClickLabel(point.label));
                    let ocrTextByClickId = new Map();
                    if (clicksNeedOcr.length > 0) {
                        subtitleProgress(
                            4,
                            5,
                            '紅圈 OCR 校正',
                            `正在針對 ${clicksNeedOcr.length} 個沒有 click label 的螢幕錄影紅圈點擊做嚴格 OCR 校正。`,
                            {
                                clickCount: clicksNeedOcr.length,
                                frameCount: capturedFrames.length,
                                uploaded: true
                            }
                        );
                        ocrTextByClickId = await analyzeStrictScreenClickTexts(clicksNeedOcr);
                    }

                    const screenClickSubs = clickPoints.flatMap((clickPoint, index) => {
                        const rippleFrame = rippleFrameByClickId.get(clickPoint.clickId);
                        const anchoredStart = rippleFrame ? Number(rippleFrame.relativeTime.toFixed(2)) : Number(clickPoint.time.toFixed(2));
                        const window = screenWindows.find(item => anchoredStart >= item.startAt - 0.35 && anchoredStart <= item.endAt + 0.35)
                            || screenWindows.reduce((best, item) => {
                                if (!best) return item;
                                const bestDistance = Math.min(Math.abs(best.startAt - anchoredStart), Math.abs(best.endAt - anchoredStart));
                                const nextDistance = Math.min(Math.abs(item.startAt - anchoredStart), Math.abs(item.endAt - anchoredStart));
                                return nextDistance < bestDistance ? item : best;
                            }, null);

                        const forcedLabel = cleanClickLabel(clickPoint.label) || cleanAiText(ocrTextByClickId.get(clickPoint.clickId));
                        const nextClick = clickPoints[index + 1];
                        const boundedNextStart = nextClick
                            ? Number(nextClick.time.toFixed(2))
                            : Number((window?.endAt ?? (anchoredStart + 1.2)).toFixed(2));
                        const anchoredEnd = Number(Math.max(
                            Math.min(boundedNextStart, window?.endAt ?? (anchoredStart + 1.2)),
                            anchoredStart + 0.5
                        ).toFixed(2));

                        return [{
                            id: `sub_${Math.random()}`,
                            clickId: clickPoint.clickId || '',
                            startAt: anchoredStart,
                            endAt: anchoredEnd,
                            text: forcedLabel ? `${actionPrefix}${forcedLabel}${actionSuffix}` : `${actionPrefix}${settings.language === 'zh-TW' ? '操作項目' : 'UI item'}${actionSuffix}`,
                            sceneType: 'screen_recording',
                            mainAction: forcedLabel || '',
                            pipAction: window?.pipAction || '',
                            instructionRole: 'action',
                            relationType: window?.relationType || 'supplementary_hint',
                            teachingGoal: forcedLabel || '',
                            pipRelevance: window?.pipRelevance || 'optional',
                            voiceover: window?.voiceover || '',
                            articleStep: forcedLabel || window?.articleStep || '',
                            clickBased: true,
                            screenFocus: window?.screenFocus || '',
                            mainVisual: window?.mainVisual || '',
                            pipVisual: window?.pipVisual || '',
                            confidence: window?.confidence ?? null,
                            evidence: Array.isArray(window?.evidence) ? window.evidence : []
                        }];
                    });

                    parsedSubs = [...nonScreenSubs, ...screenClickSubs];

                    parsedSubs.sort((a, b) => a.startAt - b.startAt);
                    for (let i = 1; i < parsedSubs.length; i++) {
                        if (parsedSubs[i].startAt <= parsedSubs[i - 1].startAt) {
                            parsedSubs[i].startAt = Number((parsedSubs[i - 1].startAt + 0.05).toFixed(2));
                        }
                        if (parsedSubs[i].endAt <= parsedSubs[i].startAt) {
                            parsedSubs[i].endAt = Number((parsedSubs[i].startAt + 0.8).toFixed(2));
                        }
                    }
                }

                if (parsedSubs.length === 0) {
                    throw new Error(isColumnTopicMode
                        ? 'AI 未回傳可用的內容錨點，請重試或檢查畫面是否能看出主題脈絡。'
                        : (isCompositeTutorial
                            ? 'AI 未回傳可用字幕，請重試或檢查畫面是否能清楚看出主動作。'
                            : (useVisualTutorialUnderstanding
                                ? 'AI 未回傳可用字幕，請重試或檢查畫面是否能清楚看出教學流程。'
                                : 'AI 未回傳可用字幕，請重試或檢查畫面是否有紅圈點擊。')));
                }
                parsedSubs = parsedSubs.map(sub => normalizeSubtitle({ ...sub, trackIndex: 1 }));
                const compositeReport = isCompositeTutorial
                    ? {
                        segments: parsedSubs.map((sub, index) => ({
                            segment_index: index + 1,
                            time_start: sub.startAt,
                            time_end: sub.endAt,
                            scene_type: sub.sceneType,
                            instruction_role: sub.instructionRole,
                            relation_type: sub.relationType,
                            teaching_goal: sub.teachingGoal,
                            main_visual: sub.mainVisual || '',
                            pip_visual: sub.pipVisual || '',
                            main_action: sub.mainAction,
                            pip_action: sub.pipAction,
                            ui_focus: sub.screenFocus || '',
                            click_based: Boolean(sub.clickBased),
                            pip_relevance: sub.pipRelevance,
                            subtitle: sub.text,
                            voiceover: sub.voiceover || sub.text,
                            article_step: sub.articleStep || sub.text,
                            confidence: sub.confidence,
                            evidence: Array.isArray(sub.evidence) ? sub.evidence : []
                        })),
                        doc,
                        generatedAt: Date.now(),
                        aiProvider: subtitleProvider,
                        aiModel: subtitleModelLabel
                    }
                    : null;

                setProjectState(prev => ({
                    ...prev,
                    subtitles: [...prev.subtitles.filter(sub => normalizeSubtitle(sub).trackIndex !== 1), ...parsedSubs],
                    [activeMarkdownField]: prev[activeMarkdownField],
                    capturedFrames: capturedFrames,
                    compositeSubtitleAnalysis: (isCompositeTutorial || isColumnTopicMode)
                        ? parsedSubs.map(sub => ({
                            startAt: sub.startAt,
                            endAt: sub.endAt,
                            text: sub.text,
                            scene_type: sub.sceneType,
                            main_action: sub.mainAction,
                            pip_action: sub.pipAction,
                            instruction_role: sub.instructionRole,
                            relation_type: sub.relationType,
                            teaching_goal: sub.teachingGoal,
                            pip_relevance: sub.pipRelevance,
                            voiceover: sub.voiceover,
                            article_step: sub.articleStep,
                            click_based: sub.clickBased,
                            screen_focus: sub.screenFocus,
                            main_visual: sub.mainVisual,
                            pip_visual: sub.pipVisual,
                            confidence: sub.confidence,
                            evidence: sub.evidence
                        }))
                        : [],
                    compositeTutorialReport: isCompositeTutorial ? compositeReport : prev.compositeTutorialReport,
                    aiSubtitleTimelineSnapshot: createAiSubtitleTimelineSnapshot(prev),
                    aiSubtitleGeneratedAt: Date.now()
                }));
                updateAiSubtitleStatus({
                    phase: 'success',
                    message: 'AI字幕已完成',
                    detail: isColumnTopicMode
                        ? `已完成內容判讀並生成 ${parsedSubs.length} 條內容錨點，可直接拿來生成專欄文章。`
                        : (isCompositeTutorial
                            ? `已完成綜合場景分析並生成 ${parsedSubs.length} 個段落，包含 scene_type、instruction_role、relation_type 與多模態教學內容。`
                            : `已完成 OCR 並生成 ${parsedSubs.length} 條字幕，時間軸字幕軌已同步更新。`),
                    aiLabel: subtitleAiLabel,
                    progressPercent: 100,
                    currentStep: 5,
                    totalSteps: 5,
                    stageLabel: '完成',
                    clickCount: clickPoints.length,
                    frameCount: capturedFrames.length,
                    subtitleCount: parsedSubs.length,
                    uploaded: true
                });
            }
        } catch (error) {
            if (isAiTaskCancelledError(error) || error?.name === 'AbortError') {
                updateAiSubtitleStatus({
                    phase: 'warning',
                    message: 'AI字幕已取消',
                    detail: '本次 AI 字幕任務已手動取消。',
                    stageLabel: '已取消'
                });
                return;
            }
            updateAiSubtitleStatus({
                phase: 'error',
                message: 'AI字幕失敗',
                detail: error.message || '解析錯誤'
            });
            alert("AI 分析失敗: " + (error.message || "解析錯誤"));
        }
        finally {
            finishAiTask(taskController);
        }
    };

    const generateArticleFromSubtitles = async (subtitleOverride = null) => {
        const isColumnTopicMode = activeSkillId === 'column-topic';
        const isCompositeTutorial = activeSkillId === 'composite-tutorial';
        const frameField = activeSkill.frameField || 'capturedFrames';
        let activeFrames = Array.isArray(projectState[frameField]) ? projectState[frameField] : [];
        const activeMarkdownField = activeSkill.markdownField || 'tutorialMD';
        const exportImagePrefix = activeSkill.exportImagePrefix || 'screenshot';
        const compositeReport = isCompositeTutorial && projectState.compositeTutorialReport && Array.isArray(projectState.compositeTutorialReport.segments)
            ? projectState.compositeTutorialReport
            : null;
        const compositeSegments = isCompositeTutorial
            ? (Array.isArray(compositeReport?.segments) && compositeReport.segments.length > 0
                ? compositeReport.segments
                : (Array.isArray(projectState.compositeSubtitleAnalysis) ? projectState.compositeSubtitleAnalysis : []))
            : [];
        const articleSubtitles = Array.isArray(subtitleOverride) && subtitleOverride.length > 0
            ? subtitleOverride.map(normalizeSubtitle)
            : highlightSubtitles;
        const isScriptDerivedArticle = Array.isArray(subtitleOverride) && subtitleOverride.length > 0;
        if (articleProvider === 'azure' && !azureChatKey) return alert("請先在設定中輸入 Azure Chat API Key");
        if (articleProvider === 'gemini' && !settings.apiKey) return alert("請先在設定中輸入 Gemini API Key");
        if (articleProvider === 'lmstudio' && (!lmStudioEndpoint || !settings.lmStudioChatModel?.trim())) return alert("請先在設定中填入 LM Studio Base URL 與文字 / Chat 模型");
        if (articleProvider === 'ollama' && (!ollamaEndpoint || !settings.ollamaChatModel?.trim())) return alert("請先在設定中填入 Ollama Endpoint 與文字 / Chat 模型");
        if (isCompositeTutorial) {
            if (!compositeSegments.length) return alert("請先執行 AI 場景分析，建立綜合教學段落後再生成文章。");
        } else if (!articleSubtitles || articleSubtitles.length === 0) {
            return alert("請先生成或編輯 S2 AI字幕，再生成文章。");
        }
        if (aiSubtitleTimelineWarning) {
            setStatusPanels(prev => ({ ...prev, subtitle: true, article: true }));
            updateArticleStatus({
                phase: 'warning',
                message: '請先重跑 AI字幕',
                detail: aiSubtitleTimelineWarning
            });
            return alert(aiSubtitleTimelineWarning);
        }

        const articleProgress = (currentStep, totalSteps, stageLabel, detail) => {
            const progressPercent = totalSteps > 0 ? Math.round((currentStep / totalSteps) * 100) : 0;
            setAiProgress(createProgressText(currentStep, totalSteps, stageLabel, progressPercent));
            updateArticleStatus({
                phase: 'running',
                message: '文章生成中',
                detail,
                aiLabel: articleAiLabel,
                currentStep,
                totalSteps,
                progressPercent,
                stageLabel
            });
        };

        setStatusPanels(prev => ({ ...prev, article: true }));
        const taskController = beginAiTask('article');
        const taskSignal = taskController.signal;
        const rebuildTargets = isCompositeTutorial
            ? compositeSegments
                .map(segment => Number(segment?.time_start ?? segment?.startAt ?? 0))
                .filter(Number.isFinite)
            : articleSubtitles
                .map(sub => Number(normalizeSubtitle(sub).startAt || 0))
                .filter(Number.isFinite);
        const shouldRebuildArticleFrames = rebuildTargets.length > 0 && (!isColumnTopicMode || !activeFrames || activeFrames.length === 0);
        if (shouldRebuildArticleFrames) {
            articleProgress(
                1,
                5,
                '重建文章截圖',
                isColumnTopicMode
                    ? '已載入既有 AI字幕，正在從時間軸影片重建文章用截圖...'
                    : '正在從時間軸影片重建文章用截圖，這批畫面不會疊加 ripple layer...'
            );
            const rebuiltFrames = await captureFramesFromTimelineTargets(rebuildTargets, {
                settledDelaySeconds: 0.45,
                includeClickRipple: false
            });
            if (rebuiltFrames.length > 0) {
                activeFrames = rebuiltFrames;
                setProjectState(prev => ({ ...prev, [frameField]: rebuiltFrames }));
            }
        }
        if (!activeFrames || activeFrames.length === 0) return alert(
            isColumnTopicMode
                ? "目前沒有可用截圖，請先執行 AI主題分析建立內容截圖。"
                : isCompositeTutorial
                    ? "目前沒有可用截圖，請先執行 AI 場景分析建立綜合教學截圖。"
                    : "目前沒有可用截圖，且無法從時間軸重建步驟截圖。"
        );
        // ── Storage probe (temporary) ──────────────────────────────────────────
        if (typeof chrome !== 'undefined' && chrome.storage?.local) {
            chrome.storage.local.get(
                { clickRippleEnabled: null, clickRippleSessionId: null, clickEventLog: [] },
                (raw) => {
                    console.warn('[ClickStorageProbe] clickRippleEnabled=', raw.clickRippleEnabled,
                        'sessionId=', raw.clickRippleSessionId,
                        'rawStorageEventCount=', Array.isArray(raw.clickEventLog) ? raw.clickEventLog.length : 'NOT_ARRAY');
                }
            );
        }
        console.warn('[ClickStorageProbe] projectState.clickEventLog length=',
            Array.isArray(projectStateRef.current?.clickEventLog) ? projectStateRef.current.clickEventLog.length : 'none');
        // ──────────────────────────────────────────────────────────────────────
        const articleClickEvents = await loadGlobalClickLog();
        const articleClickEventById = new Map(
            (Array.isArray(articleClickEvents) ? articleClickEvents : [])
                .flatMap(event => {
                    const id = String(event?.id || '').trim();
                    const fallbackKey = event?.epochMs ? `clk_${event.epochMs}` : '';
                    const entries = [];
                    if (id) entries.push([id, event]);
                    if (fallbackKey && fallbackKey !== id) entries.push([fallbackKey, event]);
                    return entries;
                })
                .filter(([id]) => id)
        );
        // Time-based fallback: find nearest click event when subtitle.clickId is empty.
        // Convert click epochMs → timeline seconds using the same rangeStart + timeline offset
        // logic used during subtitle generation.
        const _articleRangeStart = Number(projectState.recordingRange?.startEpochMs || recordStartTimeRef.current || 0);
        const _articleSessionId = projectState.recordingSessionId || '';
        const _articleAllClips = projectState.tracks.flat().filter(c => c?.type === 'video');
        const _articleSessionClips = _articleSessionId
            ? _articleAllClips.filter(c => String(c?.recordingSessionId || '') === _articleSessionId)
            : [];
        const _articleTimelineOffset = _articleSessionClips.length > 0
            ? Math.min(..._articleSessionClips.map(c => Number(c?.startAt || 0)).filter(Number.isFinite))
            : 0;
        console.log('[HighlightDebug] rangeStart=', _articleRangeStart, 'sessionId=', _articleSessionId, 'totalClickEvents=', articleClickEvents.length, 'clickMapSize=', articleClickEventById.size, 'timelineOffset=', _articleTimelineOffset);
        const _buildSortedClicks = (events, sessionIdFilter) => {
            if (_articleRangeStart <= 0) return [];
            return events
                .filter(ev => typeof ev?.epochMs === 'number' && String(ev?.id || '').trim()
                    && (!sessionIdFilter || (ev?.sessionId || '') === sessionIdFilter))
                .map(ev => ({
                    id: String(ev.id).trim(),
                    timeS: (ev.epochMs - _articleRangeStart) / 1000 + _articleTimelineOffset
                }))
                .filter(ev => ev.timeS >= -1)
                .sort((a, b) => a.timeS - b.timeS);
        };
        // Try strict session-ID match first; if no results, fall back to time-range-only match.
        let _sortedArticleClicksByTime = _buildSortedClicks(
            Array.isArray(articleClickEvents) ? articleClickEvents : [],
            _articleSessionId
        );
        if (_sortedArticleClicksByTime.length === 0 && _articleSessionId) {
            _sortedArticleClicksByTime = _buildSortedClicks(
                Array.isArray(articleClickEvents) ? articleClickEvents : [],
                '' // no session filter — rely on time range only
            );
        }
        console.log('[HighlightDebug] sortedClicksByTime count=', _sortedArticleClicksByTime.length, _sortedArticleClicksByTime.slice(0, 3).map(e => `${e.id.slice(0,16)}@${e.timeS.toFixed(2)}s`));
        const findNearestArticleClickId = (targetTimeS, maxGapS = 3) => {
            if (!_sortedArticleClicksByTime.length) return '';
            let best = null;
            let bestGap = Infinity;
            for (const ev of _sortedArticleClicksByTime) {
                const gap = Math.abs(ev.timeS - targetTimeS);
                if (gap < bestGap) { bestGap = gap; best = ev; }
                if (ev.timeS > targetTimeS + maxGapS) break;
            }
            return (best && bestGap <= maxGapS) ? best.id : '';
        };
        const articleFramePool = [...activeFrames];
        let nextArticleFrameId = articleFramePool.reduce(
            (maxFrameId, frame) => Math.max(maxFrameId, Number(frame?.frameId) || 0),
            0
        );
        const includeArticleClickHighlight = projectState.articleIncludeClickHighlight !== false;
        const articleHighlightFrameCache = new Map();
        const articleCandidateFrameCache = new Map();
        const articleCandidateExports = [];
        const articleCandidateExportKeys = new Set();
        const ensureArticleFrameInPool = (frame) => {
            if (!frame) return frame;
            const frameId = Number(frame?.frameId || 0);
            if (!frameId) return frame;
            if (!articleFramePool.some(item => Number(item?.frameId || 0) === frameId)) {
                articleFramePool.push(frame);
            }
            return frame;
        };
        const registerArticleCandidateExport = ({ stepIndex, stepTitle = '', clickId = '', targetTime = 0, candidateBundle = null }) => {
            const normalizedStepIndex = Math.max(1, Number(stepIndex) || 1);
            const normalizedClickId = String(clickId || '').trim();
            const normalizedTargetTime = Number.isFinite(Number(targetTime)) ? Number(targetTime) : 0;
            const candidateFrames = Array.isArray(candidateBundle?.candidateFrames) ? candidateBundle.candidateFrames : [];
            if (!candidateFrames.length) return;

            const exportKey = `${normalizedStepIndex}:${normalizedClickId}:${normalizedTargetTime.toFixed(2)}`;
            if (articleCandidateExportKeys.has(exportKey)) return;
            articleCandidateExportKeys.add(exportKey);

            const candidates = candidateFrames
                .map((candidate, candidateIndex) => {
                    const frame = candidate?.frame || null;
                    const frameId = Number(frame?.frameId || 0);
                    if (!frameId || !frame?.hdData) return null;
                    const offsetSeconds = Number.isFinite(Number(candidate?.offsetSeconds)) ? Number(candidate.offsetSeconds) : 0;
                    return {
                        frameId,
                        relativeTime: Number(Number(frame?.relativeTime || 0).toFixed(2)),
                        offsetSeconds: Number(offsetSeconds.toFixed(2)),
                        candidateIndex: candidateIndex + 1,
                        isSelected: !!candidate?.isSelected,
                        fileName: buildArticleCandidateExportFilename(
                            exportImagePrefix,
                            normalizedStepIndex,
                            candidateIndex + 1,
                            offsetSeconds,
                            !!candidate?.isSelected
                        )
                    };
                })
                .filter(Boolean);

            if (!candidates.length) return;
            articleCandidateExports.push({
                stepIndex: normalizedStepIndex,
                stepTitle: String(stepTitle || '').trim(),
                clickId: normalizedClickId,
                targetTime: Number(normalizedTargetTime.toFixed(2)),
                filePrefix: exportImagePrefix,
                candidates
            });
        };
        const ensureArticleFrameHighlight = async (frame, clickId = '') => {
            const normalizedClickId = String(clickId || '').trim();
            if (!frame) return frame;
            ensureArticleFrameInPool(frame);
            if (!includeArticleClickHighlight || !normalizedClickId) {
                console.log('[HighlightDebug] skip: includeHighlight=', includeArticleClickHighlight, 'clickId=', normalizedClickId);
                return frame;
            }
            if (frame?.articleHighlightForClickId === normalizedClickId) return frame;

            const clickEvent = articleClickEventById.get(normalizedClickId);
            if (!clickEvent) {
                console.warn('[HighlightDebug] clickEvent not found for clickId=', normalizedClickId, '— map size=', articleClickEventById.size);
                return frame;
            }

            const sourceFrameId = Number(frame?.sourceFrameId || frame?.frameId || 0);
            const cacheKey = `${sourceFrameId}:${normalizedClickId}`;
            if (articleHighlightFrameCache.has(cacheKey)) {
                return articleHighlightFrameCache.get(cacheKey);
            }

            const highlightedFrame = await createHighlightedArticleFrame(frame, clickEvent, nextArticleFrameId + 1, Number(settings.clickHighlightOffsetY) || 0);
            if (!highlightedFrame) return frame;

            nextArticleFrameId += 1;
            ensureArticleFrameInPool(highlightedFrame);
            articleHighlightFrameCache.set(cacheKey, highlightedFrame);
            return highlightedFrame;
        };
        const resolveArticleClickFrameCandidates = async (targetTime, clickId = '') => {
            const normalizedClickId = String(clickId || '').trim();
            if (!normalizedClickId) return null;
            const clickEvent = articleClickEventById.get(normalizedClickId);
            if (!clickEvent) return null;

            const cacheKey = `${normalizedClickId}:${Number(targetTime || 0).toFixed(2)}`;
            if (articleCandidateFrameCache.has(cacheKey)) {
                return articleCandidateFrameCache.get(cacheKey);
            }

            const candidateTimes = buildArticleClickCandidateTimes(targetTime, totalDuration || 0);
            const candidateFrames = await captureFramesFromTimelineTargets(candidateTimes, {
                settledDelaySeconds: 0,
                includeClickRipple: false
            });
            const bestFrame = await pickBestArticleClickCandidateFrame(candidateFrames, clickEvent);
            const bestSourceFrameId = Number(bestFrame?.sourceFrameId || bestFrame?.frameId || 0);
            const candidateBundle = {
                selectedFrame: null,
                candidateFrames: []
            };

            // Browser-chrome height above the viewport in the recording (same value the bake uses).
            const highlightViewportOffsetY = Number(settings.clickHighlightOffsetY) || 0;

            for (let candidateIndex = 0; candidateIndex < candidateFrames.length; candidateIndex++) {
                const candidateFrame = candidateFrames[candidateIndex];
                const highlightedCandidateFrame = await ensureArticleFrameHighlight(candidateFrame, normalizedClickId);
                // Per-candidate so the overlay rect matches each frame's own resolution / capture mapping,
                // and lands exactly where the highlight is finally baked.
                const highlightRectPct = await computeHighlightRectPctForFrame(
                    clickEvent,
                    candidateFrame,
                    highlightViewportOffsetY
                );
                const sourceFrameId = Number(candidateFrame?.sourceFrameId || candidateFrame?.frameId || 0);
                const captureTime = Number.isFinite(Number(candidateTimes[candidateIndex]))
                    ? Number(candidateTimes[candidateIndex])
                    : Number(candidateFrame?.relativeTime || targetTime || 0);
                const offsetSeconds = Number((captureTime - Number(targetTime || 0)).toFixed(2));
                const isSelected = !!bestSourceFrameId && sourceFrameId === bestSourceFrameId;
                candidateBundle.candidateFrames.push({
                    frame: highlightedCandidateFrame || candidateFrame,
                    rawFrame: candidateFrame,       // original, no highlight baked in
                    highlightRectPct,               // 0-1 fractions for interactive overlay
                    captureTime: Number(captureTime.toFixed(2)),
                    offsetSeconds,
                    sourceFrameId,
                    isSelected
                });
                if (isSelected && !candidateBundle.selectedFrame) {
                    candidateBundle.selectedFrame = highlightedCandidateFrame || candidateFrame;
                }
            }

            articleCandidateFrameCache.set(cacheKey, candidateBundle);
            return candidateBundle;
        };
        const resolveBestArticleClickFrame = async (targetTime, clickId = '') => {
            const candidateBundle = await resolveArticleClickFrameCandidates(targetTime, clickId);
            return candidateBundle?.selectedFrame || null;
        };
        articleProgress(
            1,
            5,
            '整理字幕與文章需求',
            isColumnTopicMode
                ? `正在使用 ${articleProviderLabel} (${articleModelLabel}) 根據內容錨點、寫作 prompt 與參考資料組裝專欄...`
                : isCompositeTutorial
                    ? '正在根據綜合教學段落、主副畫面關係與文章步驟組裝多模態教學文件...'
                : `正在使用 ${articleProviderLabel} (${articleModelLabel}) 根據字幕、介紹欄 brief 與參考資料組裝文章...`
        );
        updateArticleStatus({ stepCount: isCompositeTutorial ? (articleSubtitles.length || compositeSegments.length) : articleSubtitles.length });
        try {
            if (isCompositeTutorial) {
                const doc = compositeReport?.doc && typeof compositeReport.doc === 'object' ? compositeReport.doc : {};
                const usedFrameIds = new Set();
                const articlePerspective = projectState.articlePerspective || 'brief';
                const baseSegments = compositeSegments.map((segment, index) => ({
                    ...segment,
                    segment_index: Number.isFinite(Number(segment?.segment_index)) ? Number(segment.segment_index) : index + 1,
                    time_start: Number.isFinite(Number(segment?.time_start)) ? Number(segment.time_start) : Number(segment?.startAt || 0),
                    time_end: Number.isFinite(Number(segment?.time_end)) ? Number(segment.time_end) : Number(segment?.endAt || segment?.startAt || 0),
                    teaching_goal: cleanAiText(segment?.teaching_goal || segment?.main_action || segment?.text || ''),
                    subtitle: cleanAiText(segment?.subtitle || segment?.text || ''),
                    article_step: cleanAiText(segment?.article_step || segment?.text || ''),
                    voiceover: cleanAiText(segment?.voiceover || segment?.subtitle || segment?.text || ''),
                    instruction_role: normalizeInstructionRole(segment?.instruction_role),
                    relation_type: normalizeRelationType(segment?.relation_type),
                    pip_relevance: normalizePipRelevance(segment?.pip_relevance),
                    main_action: cleanAiText(segment?.main_action || ''),
                    pip_action: cleanAiText(segment?.pip_action || '')
                }));
                const currentCompositeSubtitles = articleSubtitles
                    .map(normalizeSubtitle)
                    .sort((a, b) => a.startAt - b.startAt);
                const safeSegments = currentCompositeSubtitles.length > 0
                    ? currentCompositeSubtitles.map((subtitle, index) => {
                        const linkedSegment = baseSegments.find(segment => segment.clickId && subtitle.clickId && segment.clickId === subtitle.clickId)
                            || baseSegments.reduce((best, segment) => {
                                if (!best) return segment;
                                const bestDistance = Math.abs(Number(best.time_start || 0) - Number(subtitle.startAt || 0));
                                const nextDistance = Math.abs(Number(segment.time_start || 0) - Number(subtitle.startAt || 0));
                                return nextDistance < bestDistance ? segment : best;
                            }, null)
                            || {};
                        const subtitleText = cleanAiText(subtitle.text || '');
                        return {
                            ...linkedSegment,
                            segment_index: index + 1,
                            clickId: subtitle.clickId || linkedSegment.clickId || '',
                            time_start: Number(subtitle.startAt || 0),
                            time_end: Number(subtitle.endAt || subtitle.startAt || 0),
                            subtitle: subtitleText || cleanAiText(linkedSegment.subtitle || ''),
                            teaching_goal: subtitleText || cleanAiText(linkedSegment.teaching_goal || linkedSegment.main_action || ''),
                            article_step: subtitleText || cleanAiText(linkedSegment.article_step || linkedSegment.voiceover || linkedSegment.subtitle || ''),
                            voiceover: subtitleText || cleanAiText(linkedSegment.voiceover || linkedSegment.subtitle || ''),
                            main_action: subtitleText || cleanAiText(linkedSegment.main_action || ''),
                            instruction_role: normalizeInstructionRole(linkedSegment.instruction_role),
                            relation_type: normalizeRelationType(linkedSegment.relation_type),
                            pip_relevance: normalizePipRelevance(linkedSegment.pip_relevance),
                            pip_action: cleanAiText(linkedSegment.pip_action || '')
                        };
                    })
                    : baseSegments;
                const pickCompositeFrame = async (targetTime, preferredClickId = '') => {
                    const clickSelectedFrame = await resolveBestArticleClickFrame(targetTime, preferredClickId);
                    if (clickSelectedFrame) {
                        return clickSelectedFrame;
                    }
                    if (preferredClickId) {
                        const directRippleFrame = activeFrames.find((frame) => (
                            frame?.rippleForClickId === preferredClickId && !usedFrameIds.has(frame.frameId)
                        ));
                        if (directRippleFrame) {
                            usedFrameIds.add(directRippleFrame.frameId);
                            return await ensureArticleFrameHighlight(directRippleFrame, preferredClickId);
                        }
                    }
                    const frame = pickBestScreenshotFrame(activeFrames, Number(targetTime || 0), usedFrameIds, preferredClickId);
                    if (frame) {
                        usedFrameIds.add(frame.frameId);
                        return await ensureArticleFrameHighlight(frame, preferredClickId);
                    }
                    const fallback = activeFrames.find(item => !usedFrameIds.has(item.frameId)) || activeFrames[0];
                    if (fallback) usedFrameIds.add(fallback.frameId);
                    return await ensureArticleFrameHighlight(fallback || null, preferredClickId);
                };
                const derivedSteps = safeSegments
                    .filter(segment => segment.instruction_role !== 'explanation' || segment.article_step)
                    .map((segment) => ({
                        segment_index: segment.segment_index,
                        click_id: segment.clickId || '',
                        step_title: segment.teaching_goal || segment.main_action || segment.subtitle || `${settings.language === 'zh-TW' ? '步驟' : 'Step'} ${segment.segment_index}`,
                        description: segment.article_step || segment.voiceover || segment.subtitle,
                        screenshot_time: Number(segment.time_start || 0)
                    }));
                const docSteps = Array.isArray(doc.steps) && doc.steps.length > 0
                    ? doc.steps
                        .map((step, index) => {
                            const requestedIndex = Math.max(1, Number(step?.segment_index || index + 1));
                            const linkedSegment = safeSegments.find(item => item.segment_index === requestedIndex) || safeSegments[index];
                            if (!linkedSegment) return null;
                            return {
                                segment_index: linkedSegment.segment_index,
                                click_id: linkedSegment.clickId || '',
                                step_title: cleanAiText(step?.step_title || linkedSegment.teaching_goal || linkedSegment.main_action || linkedSegment.subtitle || ''),
                                description: cleanAiText(step?.description || linkedSegment.article_step || linkedSegment.voiceover || linkedSegment.subtitle),
                                screenshot_time: Number(linkedSegment.time_start || 0),
                                time_start: Number(linkedSegment.time_start || 0)
                            };
                        })
                        .filter(Boolean)
                        .sort((a, b) => a.time_start - b.time_start)
                    : derivedSteps
                        .map(step => ({
                            ...step,
                            time_start: Number(step.screenshot_time || 0)
                        }))
                        .sort((a, b) => a.time_start - b.time_start);
                const preparation = Array.isArray(doc.preparation) && doc.preparation.length > 0
                    ? doc.preparation
                    : safeSegments
                        .filter(segment => segment.instruction_role === 'setup')
                        .map(segment => segment.article_step || segment.voiceover || segment.subtitle)
                        .filter(Boolean);
                const warnings = Array.isArray(doc.warnings) && doc.warnings.length > 0
                    ? doc.warnings
                    : safeSegments
                        .filter(segment => segment.instruction_role === 'warning')
                        .map(segment => segment.article_step || segment.voiceover || segment.subtitle)
                        .filter(Boolean);
                articleProgress(
                    2,
                    5,
                    '生成介紹文字',
                    `正在使用 ${articleProviderLabel} (${articleModelLabel}) 為綜合教學文件撰寫介紹文字與摘要...`
                );
                const perspectiveInstruction = settings.language === 'zh-TW'
                    ? (articlePerspective === 'brand'
                        ? '請使用第一人稱品牌/團隊口吻撰寫，可使用「我們」來介紹這段錄影示範的內容與目的。'
                        : articlePerspective === 'brief'
                            ? '【精簡概要模式】opening 只能寫一到兩句話，直接點出這段錄影做了什麼，不得超過兩句。overview 同樣一到兩句。result_summary 一句話收尾。全文不得展開細節或多段落。'
                            : '請使用第三人稱介紹口吻撰寫，像教學文章編輯或觀察者在描述這段錄影示範的流程與重點。')
                    : (articlePerspective === 'brand'
                        ? 'Write in first person from the brand/team perspective. You may use "we" to introduce what this recording demonstrates and why it matters.'
                        : articlePerspective === 'brief'
                            ? '[BRIEF MODE] opening: exactly one to two sentences stating what this recording demonstrates. overview: one to two sentences max. result_summary: one sentence. No paragraphs, no bullet expansion, no elaboration anywhere.'
                            : 'Write in third person, like an editor or observer describing what this recording demonstrates and why it matters.');
                const compositeArticleInput = safeSegments.map((segment) => ({
                    index: segment.segment_index,
                    startAt: Number(segment.time_start || 0),
                    endAt: Number(segment.time_end || 0),
                    subtitle: segment.subtitle,
                    teaching_goal: segment.teaching_goal,
                    article_step: segment.article_step,
                    instruction_role: segment.instruction_role,
                    relation_type: segment.relation_type
                }));
                const compositeSystemText = settings.language === 'zh-TW'
                    ? '你是專業教學內容編輯。請回傳純 JSON，包含 title, overview, opening, result_summary。overview 用 2 到 3 句總結這段錄影在做什麼。opening 要像 md 文件開頭的介紹文字，不是步驟清單。result_summary 要總結這支錄影最後完成了哪些示範內容。'
                    : 'You are a professional instructional content editor. Return pure JSON with title, overview, opening, and result_summary. overview should summarize what the recording demonstrates in 2-3 sentences. opening should read like an intro paragraph for the markdown document, not a step list. result_summary should summarize what the recording ultimately demonstrated.';
                const compositeUserText = `
${perspectiveInstruction}

使用者補充 brief：
${(projectState.tutorialDescription || '').trim() || '(無)'}

錄影段落(JSON)：
${JSON.stringify(compositeArticleInput)}

規則：
1. title 要像可發表的教學文件標題。
2. opening 必須是介紹文字，不可只是重複步驟。
3. overview 要總結這段錄影在示範什麼流程。
4. result_summary 要描述錄影最後完成了哪些操作或展示。
5. 語言：${settings.language === 'zh-TW' ? 'Traditional Chinese (繁體中文)' : 'English'}
`.trim();
                let compositeArticleMeta = {
                    title: sanitizeGeneratedArticleTitle(doc.title, settings.language === 'zh-TW' ? '綜合教學指南' : 'Composite Tutorial Guide'),
                    overview: doc.overview || '',
                    opening: '',
                    result_summary: doc.result_summary || ''
                };
                try {
                    let compositeMetaRaw = '';
                    if (articleProvider === 'azure') {
                        if (!azureChatEndpoint || !azureChatDeployment) throw new Error("請至設定填寫完整的 Azure Chat Endpoint 與 Chat 部署名稱。");
                        const azureUrl = `${azureChatEndpoint.replace(/\/+$/, '')}/openai/deployments/${azureChatDeployment}/chat/completions?api-version=2024-02-15-preview`;
                        const response = await fetch(azureUrl, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json', 'api-key': azureChatKey },
                            body: JSON.stringify({
                                messages: [
                                    { role: "system", content: compositeSystemText },
                                    { role: "user", content: compositeUserText }
                                ],
                                temperature: 0.2,
                                response_format: { type: "json_object" }
                            }),
                            signal: taskSignal
                        });
                        if (!response.ok) throw new Error(await extractHttpErrorMessage(response));
                        const data = await response.json();
                        compositeMetaRaw = data.choices?.[0]?.message?.content || '';
                    } else if (articleProvider === 'gemini') {
                        const safeApiKey = encodeURIComponent(settings.apiKey.trim());
                        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${settings.model}:generateContent?key=${safeApiKey}`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                contents: [{ parts: [{ text: `${compositeSystemText}\n\n${compositeUserText}` }] }],
                                generationConfig: {
                                    temperature: 0.2,
                                    responseMimeType: "application/json",
                                    responseSchema: {
                                        type: "OBJECT",
                                        properties: {
                                            title: { type: "STRING" },
                                            overview: { type: "STRING" },
                                            opening: { type: "STRING" },
                                            result_summary: { type: "STRING" }
                                        },
                                        required: ["title", "overview", "opening", "result_summary"]
                                    }
                                }
                            }),
                            signal: taskSignal
                        });
                        if (!response.ok) throw new Error(`HTTP 錯誤 ${response.status}`);
                        const data = await response.json();
                        compositeMetaRaw = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
                    } else if (articleProvider === 'lmstudio') {
                        compositeMetaRaw = await callLmStudioChat({
                            endpoint: lmStudioEndpoint,
                            apiKey: lmStudioApiKey,
                            model: settings.lmStudioChatModel.trim(),
                            temperature: 0.2,
                            format: 'json',
                            timeoutMs: lmStudioTimeoutMs,
                            signal: taskSignal,
                            prompt: `${compositeSystemText}\n\n${compositeUserText}`
                        });
                    } else {
                        compositeMetaRaw = await callOllamaChat({
                            endpoint: ollamaEndpoint,
                            model: settings.ollamaChatModel.trim(),
                            temperature: 0.2,
                            format: 'json',
                            timeoutMs: ollamaTimeoutMs,
                            numPredict: 1200,
                            signal: taskSignal,
                            prompt: `${compositeSystemText}\n\n${compositeUserText}`
                        });
                    }
                    if (compositeMetaRaw) {
                        const parsedMeta = JSON.parse(String(compositeMetaRaw).replace(/```json/gi, '').replace(/```/g, '').trim());
                        compositeArticleMeta = {
                            title: sanitizeGeneratedArticleTitle(parsedMeta.title, compositeArticleMeta.title),
                            overview: cleanAiText(parsedMeta.overview || compositeArticleMeta.overview),
                            opening: cleanAiText(parsedMeta.opening || ''),
                            result_summary: cleanAiText(parsedMeta.result_summary || compositeArticleMeta.result_summary)
                        };
                    }
                } catch (metaError) {
                    console.warn('Composite article intro generation failed, using fallback text.', metaError);
                }
                const finalTitle = compositeArticleMeta.title;

                articleProgress(
                    3,
                    5,
                    '組裝綜合教學文章',
                    '已使用段落分析結果產生教學文件，正在整理準備事項、步驟與關鍵截圖...'
                );

                let markdownDoc = `# ${finalTitle}\n\n`;
                if (compositeArticleMeta.opening) {
                    markdownDoc += `${compositeArticleMeta.opening}\n\n`;
                }
                markdownDoc += `## ${settings.language === 'zh-TW' ? '概覽' : 'Overview'}\n${compositeArticleMeta.overview || doc.overview || safeSegments.map(item => item.teaching_goal).filter(Boolean).slice(0, 3).join(settings.language === 'zh-TW' ? '、' : ', ') || ''}\n\n`;
                if (preparation.length) {
                    markdownDoc += `## ${settings.language === 'zh-TW' ? '事前準備' : 'Preparation'}\n`;
                    preparation.forEach((item) => {
                        markdownDoc += `- ${item}\n`;
                    });
                    markdownDoc += '\n';
                }

                markdownDoc += `## ${settings.language === 'zh-TW' ? '操作步驟' : 'Steps'}\n\n`;
                for (let index = 0; index < docSteps.length; index++) {
                    const step = docSteps[index];
                    const segmentIndex = Math.max(1, Number(step?.segment_index || index + 1));
                    const segment = safeSegments.find(item => item.segment_index === segmentIndex) || safeSegments[index];
                    const stepTitle = cleanAiText(step?.step_title || segment?.teaching_goal || segment?.main_action || segment?.subtitle || `${settings.language === 'zh-TW' ? '步驟' : 'Step'} ${index + 1}`);
                    const description = cleanAiText(step?.description || segment?.article_step || segment?.voiceover || segment?.subtitle);
                    const screenshotTime = Number(segment?.time_start || step?.time_start || step?.screenshot_time || 0);
                    const rawClickId = segment?.clickId || step?.click_id || '';
                    const effectiveStepClickId = rawClickId || (includeArticleClickHighlight ? findNearestArticleClickId(screenshotTime) : '');
                    const candidateBundle = await resolveArticleClickFrameCandidates(screenshotTime, effectiveStepClickId);
                    registerArticleCandidateExport({
                        stepIndex: index + 1,
                        stepTitle,
                        clickId: effectiveStepClickId,
                        targetTime: screenshotTime,
                        candidateBundle
                    });
                    markdownDoc += `### ${settings.language === 'zh-TW' ? '步驟' : 'Step'} ${index + 1}: ${stepTitle}\n${description}\n`;
                    if (segment?.pip_action && segment?.pip_relevance !== 'ignore') {
                        markdownDoc += `\n${settings.language === 'zh-TW' ? 'PIP 補充' : 'PIP note'}: ${segment.pip_action}\n`;
                    }
                    const frame = candidateBundle?.selectedFrame || await pickCompositeFrame(screenshotTime, effectiveStepClickId);
                    if (frame) {
                        markdownDoc += `\n![Screenshot at ${frame.relativeTime.toFixed(2)}s](./${exportImagePrefix}_${frame.frameId}.jpg)\n\n`;
                    } else {
                        markdownDoc += '\n';
                    }
                }

                if (warnings.length) {
                    markdownDoc += `## ${settings.language === 'zh-TW' ? '注意事項' : 'Warnings'}\n`;
                    warnings.forEach((item) => {
                        markdownDoc += `- ${item}\n`;
                    });
                    markdownDoc += '\n';
                }

                markdownDoc += `## ${settings.language === 'zh-TW' ? '結果' : 'Result'}\n${compositeArticleMeta.result_summary || doc.result_summary || safeSegments.filter(item => item.instruction_role === 'result' || item.instruction_role === 'confirmation').map(item => item.voiceover || item.subtitle).filter(Boolean).join('\n') || ''}\n`;

                articleProgress(
                    5,
                    5,
                    '寫入文章結果',
                    '綜合教學文章與對應截圖已整理完成，正在寫入專案結果...'
                );
                setProjectState(prev => ({ ...prev, [activeMarkdownField]: markdownDoc, [frameField]: articleFramePool, articleCandidateExports }));
                updateArticleStatus({
                    phase: 'success',
                    message: '文章已生成',
                    detail: '已根據綜合教學段落與文章步驟整理出多模態教學 markdown。',
                    aiLabel: compositeReport?.aiProvider && compositeReport?.aiModel
                        ? `${getProviderLabel(compositeReport.aiProvider)} / ${compositeReport.aiModel}`
                        : articleAiLabel,
                    progressPercent: 100,
                    currentStep: 5,
                    totalSteps: 5,
                    stageLabel: '完成',
                    title: finalTitle,
                    summary: compositeArticleMeta.overview || doc.overview || '',
                    stepCount: docSteps.length,
                    referenceCount: 0
                });
                return;
            }

            const allSubtitlesSorted = [...articleSubtitles].sort((a, b) => a.startAt - b.startAt);
            // For tutorial skill: only keep subtitles that coincide with a click event.
            // Non-action narration subtitles have no corresponding click and should be skipped.
            const isTutorialOnlyMode = activeSkillId === 'tutorial';
            const subtitles = isTutorialOnlyMode && !isScriptDerivedArticle
                ? allSubtitlesSorted.filter(sub => {
                    const id = sub.clickId || findNearestArticleClickId(Number(sub.startAt || 0));
                    return !!id;
                })
                : allSubtitlesSorted;
            const subtitlePayload = subtitles.map((s, idx) => ({
                index: idx + 1,
                startAt: Number((s.startAt || 0).toFixed(2)),
                endAt: Number((s.endAt || 0).toFixed(2)),
                text: (s.text || '').trim()
            }));

            const promptLanguage = settings.language === 'zh-TW' ? 'Traditional Chinese (繁體中文)' : 'English';
            const userDesc = (projectState.tutorialDescription || '').trim();
            const articlePerspective = projectState.articlePerspective || 'brief';
            const referenceLinks = Array.from(new Set((userDesc.match(/https?:\/\/[^\s)]+/g) || []).map(v => v.trim())));
            const briefWithoutLinks = userDesc
                .replace(/https?:\/\/[^\s)]+/g, ' ')
                .replace(/\n{3,}/g, '\n\n')
                .trim();
            const requestedWordCount = extractRequestedArticleWordCount(briefWithoutLinks);
            const targetWordCount = requestedWordCount || (isColumnTopicMode ? 1400 : 900);
            const minimumWhatIsWords = Math.max(180, Math.round(targetWordCount * 0.24));
            const minimumBenefitWords = Math.max(120, Math.round(targetWordCount * 0.14));
            const minimumStepWords = Math.max(55, Math.round(targetWordCount * 0.07));
            const minimumConclusionWords = Math.max(120, Math.round(targetWordCount * 0.12));
            const suggestedOllamaNumPredict = Math.max(1200, Math.round(targetWordCount * 3.2));
            articleProgress(
                2,
                5,
                '建立文章結構',
                isColumnTopicMode
                    ? `已整理 ${subtitlePayload.length} 個內容錨點與 ${referenceLinks.length} 個參考連結，正在建立專欄結構...`
                    : `已整理 ${subtitlePayload.length} 個步驟與 ${referenceLinks.length} 個參考連結，正在建立文章結構...`
            );
            const extractArticleTopic = (text) => {
                const lines = String(text || '')
                    .split('\n')
                    .map(line => line.trim())
                    .filter(Boolean);
                for (const line of lines) {
                    if (looksLikePromptInstruction(line) || line.length > 60) continue;

                    let candidate = line
                        .replace(/^(介紹|說明|教學|請介紹|請說明|主題|產品|功能|文章方向)\s*/i, '')
                        .replace(/^(about|intro(?:duction)?|guide|topic|product)\s*[:：-]?\s*/i, '')
                        .replace(/(設定|教學|介紹|指南|說明|功能介紹|情境介紹|setup guide|guide)$/i, '')
                        .replace(/[：:。.!?？]+$/g, '')
                        .trim();

                    const quoted = candidate.match(/["']([^"']{2,80})["']/);
                    if (quoted?.[1]) candidate = quoted[1].trim();

                    const keywordMatches = candidate.match(/[A-Za-z0-9][A-Za-z0-9 +/_-]{1,40}/g) || [];
                    const preferred = keywordMatches
                        .map(v => v.trim())
                        .find(v =>
                            /[A-Z]/.test(v) ||
                            /(QoE|WiFi|Wi-Fi|Router|VPN|SSID|Adaptive|AiMesh|ProArt|ExpertWiFi|BE\d+)/i.test(v)
                        );
                    if (preferred) {
                        const cleanedPreferred = stripPromptLikeFragments(preferred.replace(/\s{2,}/g, ' ').trim());
                        if (isUsableArticleTopic(cleanedPreferred)) return cleanedPreferred;
                    }
                    const cleanedCandidate = stripPromptLikeFragments(candidate);
                    if (isUsableArticleTopic(cleanedCandidate)) return cleanedCandidate;
                }
                return '';
            };
            const manualArticleTopic = String(projectState.articleTopic || '').trim();
            const articleTopic = (manualArticleTopic && isUsableArticleTopic(manualArticleTopic))
                ? manualArticleTopic
                : (extractArticleTopic(briefWithoutLinks) || extractArticleTopic(subtitlePayload.map(s => s.text).join('\n')));
            const safeArticleTopic = isUsableArticleTopic(articleTopic) ? articleTopic : '';
            // topicCore strips leading and trailing action words so headings read naturally.
            // Examples:
            //   "如何設定AiMesh的LED排程" → "AiMesh的LED排程"
            //   "Adaptive QoE設定"       → "Adaptive QoE"
            //   "How to set up Wi-Fi 7"  → "Wi-Fi 7"
            const topicCore = safeArticleTopic
                // Strip leading action phrases (Chinese): 如何設定/怎麼設定/如何/設定/安裝/…
                .replace(/^(?:如何(?:進行|操作|設定|設置|安裝|配置|使用|開啟|調整|完成)?|怎麼(?:設定|設置|安裝|配置|使用)?|設定|設置|安裝|配置|使用|開啟|開始)\s*/i, '')
                // Strip leading action phrases (English): How to set up / configure / install / use
                .replace(/^how\s+to\s+(?:set\s+up\s+|configure\s+|install\s+|use\s+|enable\s+)?/i, '')
                // Strip trailing config/action words
                .replace(/\s*(設定|設置|安裝|配置|系統|功能|操作|教學|介紹|使用|管理)\s*$/i, '')
                .trim() || safeArticleTopic;
            const whatIsHeading = topicCore
                ? (settings.language === 'zh-TW' ? `${topicCore}是什麼？` : `What is ${topicCore}?`)
                : (settings.language === 'zh-TW' ? '這是什麼？' : 'What is it?');
            const benefitsHeading = topicCore
                ? (settings.language === 'zh-TW' ? `${topicCore}的優點？` : `What are the benefits of ${topicCore}?`)
                : (settings.language === 'zh-TW' ? '為何你需要它？核心優勢' : 'Why you need it? Benefits');
            // defaultTitle falls back to the topic name if available, so the article isn't
            // titled "產品介紹與設定指南" when we know the actual subject.
            const defaultTitle = safeArticleTopic
                ? safeArticleTopic
                : (settings.language === 'zh-TW'
                    ? (isColumnTopicMode ? '今日專欄' : '產品介紹與設定指南')
                    : (isColumnTopicMode ? 'Column Notebook' : 'Product Overview and Setup Guide'));
            const perspectiveInstruction = isColumnTopicMode
                ? (settings.language === 'zh-TW'
                    ? '寫作視角：請固定使用第一人稱深入專欄口吻，像作者親自觀察、親自比較、親自推敲，不要寫成教學，也不要寫成品牌官方公告。'
                    : 'Writing perspective: use a first-person columnist voice throughout. It should feel like the author personally observed, compared, and reflected on the material, not like a tutorial or brand announcement.')
                : (settings.language === 'zh-TW'
                    ? articlePerspective === 'brand'
                        ? '寫作視角：請以品牌 / 公司官方第一人稱撰寫，適度使用「我們」、「我們的產品」、「我們提供」等說法，語氣要像官方內容團隊，但避免空泛官話。'
                        : articlePerspective === 'brief'
                            ? '【精簡概要模式】所有欄位一律精簡：whatIsIt 只能一到兩句話，直接說明這個功能是什麼；每個 consumerBenefits 的 description 不超過兩句；每個 setupGuide 的 description 不超過一句；conclusion 一到兩句收尾。全文不得有長段落或展開說明。'
                            : '寫作視角：請以 KOL / 科技媒體第三人稱撰寫，語氣要像開箱評測或產品推薦文章，可以直接點出產品亮點，但不要寫成品牌官方自述。'
                    : articlePerspective === 'brand'
                        ? 'Writing perspective: write in first person from the brand/company perspective. You may use phrases like "we", "our product", and "we provide", but keep the tone concrete rather than generic marketing fluff.'
                        : articlePerspective === 'brief'
                            ? '[BRIEF MODE] All fields must be short: whatIsIt = one to two sentences only; each consumerBenefits description = max two sentences; each setupGuide description = max one sentence; conclusion = one to two sentences. No long paragraphs or elaboration anywhere in the output.'
                            : 'Writing perspective: write in third person from a KOL / tech reviewer perspective. The tone should feel like a product review or recommendation article, not a brand speaking about itself.');

            const systemText = isColumnTopicMode
                ? (settings.language === 'zh-TW'
                    ? '你是專業科技專欄編輯。你必須回傳純 JSON 物件，包含 title, dek, opening, keyThemes(字串陣列), pullQuote, sections(陣列), closing, references(陣列)。sections 每項都要有 heading, narrative, takeaway, subtitleIndices(陣列), chart(物件，可為 none/pie/bar)。使用者輸入的是寫作 brief、觀點方向、補充背景與參考資料，不可逐字貼成標題。若使用者提供網址，只有在你真的能確認內容時才可當成參考；不能確認就把它當作使用者提供的背景，不要捏造網站內容。'
                    : 'You are a professional technology columnist. Return pure JSON with title, dek, opening, keyThemes (string array), pullQuote, sections (array), closing, and references (array). Each section must include heading, narrative, takeaway, subtitleIndices, and chart (object with type none/pie/bar). The user input is a writing brief and background, not text to copy verbatim into the article title or body. If URLs are provided, only treat them as references when you can truly verify them; otherwise do not invent website details.')
                : (settings.language === 'zh-TW'
                    ? '你是專業科技編輯。你必須回傳純 JSON 物件，包含 title, whatIsIt, consumerBenefits(陣列，含 benefitName, description), setupGuide(陣列，含 subtitleIndex, stepName, description), conclusion。使用者在介紹欄輸入的是寫作 brief、補充背景、語氣要求與可參考資料，不是產品名稱，絕對不可把介紹欄的任何文字直接用作 title、whatIsIt 的主詞或任何章節標題。產品名稱請從影片字幕與操作內容自行判斷。若使用者提供網址，僅在你確實能讀取並確認內容時再引用；若無法讀取，請忽略網址本身，不可捏造網站內容。若主題已明確，不要使用「一個名為...」、「一款叫做...」、「某個...功能」這類疏離、百科式開頭，請直接進入產品或功能本身。'
                    : 'You are a professional tech editor. Return pure JSON with title, whatIsIt, consumerBenefits (array of benefitName/description), setupGuide (array of subtitleIndex/stepName/description), conclusion. The user description field is a writing brief, tone guide, and reference material — it is NOT the product name. Never use any text from the description field as the title, as the subject of whatIsIt, or as any section heading. Derive the product/feature name from the video subtitles and actions shown. If URLs are provided, only reference them when you can truly verify them. When the topic is clear, avoid distant phrasing like "a feature called" or encyclopedia-style introductions.');

            const userText = isColumnTopicMode
                ? `
請根據以下「已確認的內容錨點字幕（使用者可已手動修改）」生成第一人稱深度專欄。
${perspectiveInstruction}

文章主題（產品 / 功能名稱）：
${safeArticleTopic || '(依字幕與 brief 自行推斷)'}

寫作 brief / 補充背景：
${briefWithoutLinks || '(無)'}

參考連結：
${referenceLinks.length ? referenceLinks.join('\n') : '(無)'}

內容錨點(JSON)：
${JSON.stringify(subtitlePayload)}

規則：
1. 回傳格式必須是 JSON，不可加入 markdown 或註解。
2. title 必須是可發表的專欄標題，不能把提示詞命令直接抄進去。
3. dek 要像副標，濃縮整篇觀點。
4. opening 至少 ${Math.max(180, Math.round(targetWordCount * 0.18))} 字，要用第一人稱帶出我為何關注這個主題。
5. sections 至少 3 段，每段 narrative 至少 ${Math.max(160, Math.round(targetWordCount * 0.16))} 字，必須深入討論，不要寫成操作教學。
6. 每個 section 的 subtitleIndices 必須引用上方內容錨點 index，可多選，但不可引用不存在的 index。
7. takeaway 要簡短有力，像段落的小結論。
8. chart.type 只能是 none、pie、bar 其中之一。若沒有可靠可量化資訊就用 none；若有資料脈絡才產生 chart。
9. chart.data 若存在，每筆都要有 label 與 value，value 必須是數字。
10. closing 至少 ${Math.max(160, Math.round(targetWordCount * 0.14))} 字，要回到作者觀點與產業意義。
11. keyThemes 至少 3 個，適合放在文章頁首當重點主題。
12. pullQuote 要像文章中間可拉出來的引言句。
13. 語言：${promptLanguage}
14. 若使用者 brief 中提到「不要教學」，就絕對不要產出步驟、步驟號或教學語氣。
15. 文章篇幅目標：約 ${targetWordCount} 字。請盡量接近。
`.trim()
                : `
請根據以下「已確認字幕（使用者可已手動修改）」生成介紹文章。
${perspectiveInstruction}

文章主題（產品 / 功能名稱）：
${safeArticleTopic || '(依字幕與 brief 自行推斷)'}

介紹欄寫作 brief / 補充背景：
${briefWithoutLinks || '(無)'}

參考連結：
${referenceLinks.length ? referenceLinks.join('\n') : '(無)'}

字幕資料(JSON)：
${JSON.stringify(subtitlePayload)}

規則：
1. setupGuide 的 subtitleIndex 必須對應到上方字幕 index，不可憑空新增或遺漏任何 index。
2. setupGuide 必須完整涵蓋 1 到 ${subtitlePayload.length} 的所有 index，且每個 index 只能出現一次。
3. stepName 與 description 要貼近字幕內容與操作意圖。
4. 回傳格式必須是 JSON，不可加入 markdown 或註解。
5. 標題、whatIsIt、consumerBenefits 應以畫面操作、字幕內容與使用者 brief 綜合生成，不可把 brief 第一行直接照抄進標題。
6. 如果 brief 中包含外部連結，該連結屬於可參考資料來源，不代表要把網址文字直接寫進文章。
7. 若使用者 brief 中有明確產品/功能主題，例如 Adaptive QoE、AiMesh、VPN，請把文章寫作焦點集中在該主題，並確實遵守上方指定的寫作視角。
8. 語言：${promptLanguage}
9. 若主題已明確，禁止用「一個名為...」或「一款叫做...」這種開頭，請直接介紹該功能或產品的價值。
10. title 只能是乾淨、可發表的文章標題，不可把「請特別強調」「不要寫成」「要提到 edge 運算」這類提示詞指令原封不動寫進 title。
11. brief 裡若同時包含「產品主題」與「寫作要求」，title 只能保留產品主題與價值主張，不能保留命令句。
12. 文章篇幅目標：約 ${targetWordCount} 字。這不是可忽略建議，請盡量接近。
13. whatIsIt 至少寫 ${minimumWhatIsWords} 字，要有完整背景、使用情境、核心價值。
14. consumerBenefits 至少列出 3 點；每一點 description 至少 ${minimumBenefitWords} 字，不要只寫一句短句。
15. setupGuide 每一步 description 至少 ${minimumStepWords} 字，要把操作目的、畫面變化與使用者收益講清楚。
16. conclusion 至少 ${minimumConclusionWords} 字，要有整體評價、適合誰、實際使用價值。
`.trim();

            let rawText = '';
            articleProgress(
                3,
                5,
                '呼叫 AI 模型',
                `正在使用 ${articleProviderLabel} (${articleModelLabel}) 生成文章內容...`
            );
            if (articleProvider === 'azure') {
                if (!azureChatEndpoint || !azureChatDeployment) throw new Error("請至設定填寫完整的 Azure Chat Endpoint 與 Chat 部署名稱。");
                const azureUrl = `${azureChatEndpoint.replace(/\/+$/, '')}/openai/deployments/${azureChatDeployment}/chat/completions?api-version=2024-02-15-preview`;
                const response = await fetch(azureUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'api-key': azureChatKey },
                    body: JSON.stringify({
                        messages: [
                            { role: "system", content: systemText },
                            { role: "user", content: userText }
                        ],
                        temperature: 0.2,
                        response_format: { type: "json_object" }
                    }),
                    signal: taskSignal
                });
                if (!response.ok) throw new Error(await extractHttpErrorMessage(response));
                const data = await response.json();
                rawText = data.choices?.[0]?.message?.content || '';
            } else if (articleProvider === 'gemini') {
                const safeApiKey = encodeURIComponent(settings.apiKey.trim());
                const responseSchema = isColumnTopicMode
                    ? {
                        type: "OBJECT",
                        properties: {
                            title: { type: "STRING" },
                            dek: { type: "STRING" },
                            opening: { type: "STRING" },
                            keyThemes: { type: "ARRAY", items: { type: "STRING" } },
                            pullQuote: { type: "STRING" },
                            sections: {
                                type: "ARRAY",
                                items: {
                                    type: "OBJECT",
                                    properties: {
                                        heading: { type: "STRING" },
                                        narrative: { type: "STRING" },
                                        takeaway: { type: "STRING" },
                                        subtitleIndices: { type: "ARRAY", items: { type: "NUMBER" } },
                                        chart: {
                                            type: "OBJECT",
                                            properties: {
                                                type: { type: "STRING" },
                                                title: { type: "STRING" },
                                                data: {
                                                    type: "ARRAY",
                                                    items: {
                                                        type: "OBJECT",
                                                        properties: {
                                                            label: { type: "STRING" },
                                                            value: { type: "NUMBER" }
                                                        },
                                                        required: ["label", "value"]
                                                    }
                                                }
                                            },
                                            required: ["type"]
                                        }
                                    },
                                    required: ["heading", "narrative", "takeaway", "subtitleIndices", "chart"]
                                }
                            },
                            closing: { type: "STRING" },
                            references: { type: "ARRAY", items: { type: "STRING" } }
                        },
                        required: ["title", "dek", "opening", "keyThemes", "pullQuote", "sections", "closing", "references"]
                    }
                    : {
                        type: "OBJECT",
                        properties: {
                            title: { type: "STRING" },
                            whatIsIt: { type: "STRING" },
                            consumerBenefits: {
                                type: "ARRAY",
                                items: {
                                    type: "OBJECT",
                                    properties: {
                                        benefitName: { type: "STRING" },
                                        description: { type: "STRING" }
                                    },
                                    required: ["benefitName", "description"]
                                }
                            },
                            setupGuide: {
                                type: "ARRAY",
                                items: {
                                    type: "OBJECT",
                                    properties: {
                                        subtitleIndex: { type: "NUMBER" },
                                        stepName: { type: "STRING" },
                                        description: { type: "STRING" }
                                    },
                                    required: ["subtitleIndex", "stepName", "description"]
                                }
                            },
                            conclusion: { type: "STRING" }
                        },
                        required: ["title", "whatIsIt", "consumerBenefits", "setupGuide", "conclusion"]
                    };
                const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${settings.model}:generateContent?key=${safeApiKey}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{ parts: [{ text: `${systemText}\n\n${userText}` }] }],
                        generationConfig: { temperature: 0.2, responseMimeType: "application/json", responseSchema }
                    }),
                    signal: taskSignal
                });
                if (!response.ok) throw new Error(`HTTP 錯誤 ${response.status}`);
                const data = await response.json();
                rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
            } else if (articleProvider === 'lmstudio') {
                articleProgress(
                    3,
                    5,
                    '連線 LM Studio 模型',
                    `正在使用 ${articleProviderLabel} (${articleModelLabel}) 連線 LM Studio 文章模型...`
                );
                rawText = await callLmStudioChat({
                    endpoint: lmStudioEndpoint,
                    apiKey: lmStudioApiKey,
                    model: settings.lmStudioChatModel.trim(),
                    temperature: 0.2,
                    format: 'json',
                    timeoutMs: lmStudioTimeoutMs,
                    maxTokens: suggestedOllamaNumPredict,
                    signal: taskSignal,
                    prompt: `${systemText}\n\n${userText}`
                });
            } else {
                articleProgress(
                    3,
                    5,
                    '連線 Ollama 模型',
                    `正在使用 ${articleProviderLabel} (${articleModelLabel}) 連線 Ollama 文章模型，若模型尚未載入會自動重試...`
                );
                rawText = await callOllamaChat({
                    endpoint: ollamaEndpoint,
                    model: settings.ollamaChatModel.trim(),
                    temperature: 0.2,
                    format: 'json',
                    timeoutMs: ollamaTimeoutMs,
                    numPredict: suggestedOllamaNumPredict,
                    signal: taskSignal,
                    prompt: `${systemText}\n\n${userText}`
                });
            }

            if (!rawText) throw new Error('AI 回傳內容為空');
            articleProgress(
                4,
                5,
                '解析回傳並組裝 Markdown',
                isColumnTopicMode ? 'AI 已回傳內容，正在解析 JSON 並組裝專欄版型、截圖與 Mermaid 圖表...' : 'AI 已回傳內容，正在解析 JSON 並組裝文章段落與截圖...'
            );
            const parsed = JSON.parse(rawText.replace(/```json/gi, '').replace(/```/g, '').trim());
            const finalTitle = sanitizeGeneratedArticleTitle(parsed.title, defaultTitle);
            const sanitizeMermaidLabel = (value) => String(value || '')
                .replace(/"/g, "'")
                .replace(/\r?\n+/g, ' ')
                .replace(/\s{2,}/g, ' ')
                .trim();
            const buildMermaidChart = (chart) => {
                if (!chart || String(chart.type || '').toLowerCase() === 'none') return '';
                const items = Array.isArray(chart.data)
                    ? chart.data
                        .map(item => ({
                            label: sanitizeMermaidLabel(item?.label || ''),
                            value: Number(item?.value)
                        }))
                        .filter(item => item.label && Number.isFinite(item.value))
                    : [];
                if (!items.length) return '';
                if (String(chart.type).toLowerCase() === 'pie') {
                    return [
                        '```mermaid',
                        'pie showData',
                        ...items.map(item => `    "${item.label}" : ${item.value}`),
                        '```'
                    ].join('\n');
                }
                const labels = items.map(item => item.label.replace(/[^\w\u4e00-\u9fff-]/g, '_'));
                const values = items.map(item => item.value);
                const maxValue = Math.max(...values, 1);
                return [
                    '```mermaid',
                    'xychart-beta',
                    `    title "${sanitizeMermaidLabel(chart.title || 'Data View')}"`,
                    `    x-axis [${labels.join(', ')}]`,
                    `    y-axis "Value" 0 --> ${Math.ceil(maxValue * 1.15)}`,
                    `    bar [${values.join(', ')}]`,
                    '```'
                ].join('\n');
            };

            let markdownDoc = '';
            if (isColumnTopicMode) {
                const articleDate = new Date().toLocaleDateString(
                    settings.language === 'zh-TW' ? 'zh-TW' : 'en-US',
                    settings.language === 'zh-TW'
                        ? { year: 'numeric', month: 'long', day: 'numeric' }
                        : { year: 'numeric', month: 'long', day: 'numeric' }
                );
                const keyThemes = Array.isArray(parsed.keyThemes) ? parsed.keyThemes.filter(Boolean).slice(0, 5) : [];
                const usedFrameIds = new Set();
                const pickFrameForIndices = (indices = []) => {
                    const validIndices = (Array.isArray(indices) ? indices : [])
                        .map(value => Math.max(1, Number(value || 0)))
                        .filter(Number.isFinite);
                    for (const idx of validIndices) {
                        const sub = subtitles[idx - 1];
                        if (!sub) continue;
                        const frame = pickBestScreenshotFrame(activeFrames, Number(sub.startAt || 0), usedFrameIds, sub.clickId || '');
                        if (frame) {
                            usedFrameIds.add(frame.frameId);
                            return frame;
                        }
                    }
                    const fallback = activeFrames.find(frame => !usedFrameIds.has(frame.frameId)) || activeFrames[0];
                    if (fallback) usedFrameIds.add(fallback.frameId);
                    return fallback || null;
                };

                markdownDoc += `# ${finalTitle}\n\n`;
                if (parsed.dek) markdownDoc += `> ${parsed.dek}\n\n`;
                markdownDoc += `| ${settings.language === 'zh-TW' ? '作者視角' : 'Perspective'} | ${settings.language === 'zh-TW' ? '日期' : 'Date'} |\n| --- | --- |\n| ${settings.language === 'zh-TW' ? '第一人稱專欄' : 'First-person column'} | ${articleDate} |\n\n`;
                if (keyThemes.length) {
                    markdownDoc += `## ${settings.language === 'zh-TW' ? '重點主題' : 'Key Themes'}\n`;
                    keyThemes.forEach((theme) => {
                        markdownDoc += `- ${theme}\n`;
                    });
                    markdownDoc += '\n';
                }
                const heroFrame = pickFrameForIndices([1]);
                if (heroFrame) {
                    markdownDoc += `![Hero frame](./${exportImagePrefix}_${heroFrame.frameId}.jpg)\n\n`;
                }
                markdownDoc += `## ${settings.language === 'zh-TW' ? '開場觀點' : 'Opening'}\n${parsed.opening || ''}\n\n`;
                if (parsed.pullQuote) {
                    markdownDoc += `> ${parsed.pullQuote}\n\n`;
                }

                (parsed.sections || []).forEach((section, idx) => {
                    const frame = pickFrameForIndices(section?.subtitleIndices);
                    markdownDoc += `## ${idx + 1}. ${section?.heading || (settings.language === 'zh-TW' ? `主題段落 ${idx + 1}` : `Section ${idx + 1}`)}\n\n`;
                    if (frame) {
                        markdownDoc += `![Section frame at ${frame.relativeTime.toFixed(2)}s](./${exportImagePrefix}_${frame.frameId}.jpg)\n\n`;
                    }
                    markdownDoc += `${section?.narrative || ''}\n\n`;
                    const chartBlock = buildMermaidChart(section?.chart);
                    if (chartBlock) {
                        if (section?.chart?.title) markdownDoc += `### ${section.chart.title}\n\n`;
                        markdownDoc += `${chartBlock}\n\n`;
                    }
                    if (section?.takeaway) {
                        markdownDoc += `**${settings.language === 'zh-TW' ? '我的結論' : 'My takeaway'}**: ${section.takeaway}\n\n`;
                    }
                });

                markdownDoc += `## ${settings.language === 'zh-TW' ? '收束' : 'Closing'}\n${parsed.closing || ''}\n\n`;
                const finalReferences = Array.from(new Set([
                    ...(Array.isArray(parsed.references) ? parsed.references.filter(Boolean) : []),
                    ...referenceLinks
                ]));
                if (finalReferences.length) {
                    markdownDoc += `## ${settings.language === 'zh-TW' ? '參考資料' : 'References'}\n`;
                    finalReferences.forEach((item) => {
                        markdownDoc += `- ${item}\n`;
                    });
                    markdownDoc += '\n';
                }
            } else {
                markdownDoc = `# ${finalTitle}\n\n`;
                markdownDoc += `## ${whatIsHeading}\n${parsed.whatIsIt || ''}\n\n`;
                markdownDoc += `## ${benefitsHeading}\n`;
                (parsed.consumerBenefits || []).forEach(item => {
                    markdownDoc += `* **${item.benefitName || ''}**: ${item.description || ''}\n`;
                });
                markdownDoc += `\n## ${settings.language === 'zh-TW' ? '快速上手教學' : 'Setup Guide'}\n\n`;

                const aiStepMap = new Map();
                (parsed.setupGuide || []).forEach((step, idx) => {
                    const subIndex = Math.max(1, Number(step?.subtitleIndex || idx + 1));
                    if (!Number.isFinite(subIndex)) return;
                    aiStepMap.set(subIndex, {
                        stepName: String(step?.stepName || '').trim(),
                        description: String(step?.description || '').trim()
                    });
                });

                // ── Pass 1: collect candidate screenshots for all steps ──────────
                articleProgress(4, 6, '蒐集候選截圖', '正在為每個步驟擷取候選截圖，供審核選擇...');
                const stepReviewData = [];
                for (let idx = 0; idx < subtitles.length; idx++) {
                    taskSignal.throwIfAborted();
                    const sub = subtitles[idx];
                    const subIndex = idx + 1;
                    const aiStep = aiStepMap.get(subIndex);
                    const defaultName = String(sub.text || '').trim();
                    const stepName = aiStep?.stepName || defaultName || `${settings.language === 'zh-TW' ? '步驟' : 'Step'} ${subIndex}`;
                    const description = aiStep?.description || defaultName;
                    const stepTime = Number(sub.startAt || 0);
                    const effectiveClickId = sub.clickId || (includeArticleClickHighlight ? findNearestArticleClickId(stepTime) : '');
                    const candidateBundle = await resolveArticleClickFrameCandidates(stepTime, effectiveClickId);
                    // Normalize to CandidateWrapper objects: { rawFrame, previewFrame, highlightRectPct, frameId, ... }
                    let candidates = candidateBundle?.candidateFrames?.length
                        ? candidateBundle.candidateFrames
                            .map(cf => makeCandidateWrapper(cf.rawFrame, cf.frame, cf.highlightRectPct))
                            .filter(c => c.rawFrame || c.previewFrame)
                        : (candidateBundle?.selectedFrame
                            ? [makeCandidateWrapper(
                                candidateBundle.selectedFrame,
                                candidateBundle.selectedFrame,
                                computeHighlightRectPct(articleClickEventById.get(effectiveClickId))
                              )]
                            : []);
                    // No click-based candidates → capture multiple time-based candidates so the
                    // user still gets a meaningful set of frames to choose from.
                    if (candidates.length === 0) {
                        const candidateTimes = buildArticleClickCandidateTimes(stepTime, totalDuration || 0);
                        const timeFrames = await captureFramesFromTimelineTargets(candidateTimes, {
                            settledDelaySeconds: 0,
                            includeClickRipple: false
                        });
                        // De-duplicate by sourceFrameId so near-identical frames don't pad the list.
                        const seenIds = new Set();
                        for (const f of timeFrames) {
                            const fid = Number(f?.sourceFrameId || f?.frameId || 0);
                            if (fid && seenIds.has(fid)) continue;
                            if (fid) seenIds.add(fid);
                            if (f) candidates.push(makeCandidateWrapper(f, f, null));
                        }
                    }
                    // Final single-frame fallback if video seek also produced nothing.
                    if (candidates.length === 0) {
                        const fallbackFrame = pickBestScreenshotFrame(activeFrames, stepTime, new Set(), effectiveClickId);
                        if (fallbackFrame) candidates.push(makeCandidateWrapper(fallbackFrame, fallbackFrame, null));
                    }
                    const selectedFrame = candidateBundle?.selectedFrame;
                    // selectedFrame is the highlighted frame; its sourceFrameId = raw frame's frameId
                    // which is what wrapper.frameId stores.
                    const selectedRawId = selectedFrame?.sourceFrameId || selectedFrame?.frameId;
                    const selectedIdx = selectedRawId
                        ? Math.max(0, candidates.findIndex(c => c?.frameId === selectedRawId))
                        : (() => {
                            let bestI = 0;
                            let bestDiff = Infinity;
                            candidates.forEach((c, i) => {
                                const diff = Math.abs(Number(c?.relativeTime || 0) - stepTime);
                                if (diff < bestDiff) { bestDiff = diff; bestI = i; }
                            });
                            return bestI;
                        })();
                    stepReviewData.push({
                        subIndex, stepName, description, stepTime, effectiveClickId,
                        candidates, selectedIdx, sub, candidateBundle
                    });
                }

                // ── Screenshot review: pause and let the user pick ────────────────
                articleProgress(5, 6, '等待截圖審核', '請在截圖審核介面選擇每個步驟的截圖，完成後按「確認並生成文章」。');
                let userSelectedFrames;
                try {
                    userSelectedFrames = await Promise.race([
                        new Promise((resolve, reject) => {
                            setPendingScreenshotReview({
                                steps: stepReviewData,
                                onConfirm: resolve,
                                onCancel: () => reject(new Error(AI_TASK_CANCELLED_MESSAGE))
                            });
                        }),
                        new Promise((_, reject) => {
                            taskSignal.addEventListener('abort', () =>
                                reject(new Error(AI_TASK_CANCELLED_MESSAGE))
                            );
                        })
                    ]);
                } finally {
                    setPendingScreenshotReview(null);
                }

                // ── Apply adjusted highlights from user's review ─────────────────
                // userSelectedFrames is now { rawFrame, adjustedRectPct }[] from review confirm.
                // Apply the user-corrected rect to bake the final red box into each frame.
                // IMPORTANT: process sequentially (not Promise.all) to avoid a race condition
                // where multiple concurrent tasks read the same nextArticleFrameId before any
                // of them increments it, producing duplicate frameIds (and therefore duplicate
                // filenames) for different steps.
                const finalFrames = [];
                for (let fIdx = 0; fIdx < (userSelectedFrames || []).length; fIdx++) {
                    const sel = userSelectedFrames[fIdx];
                    if (!sel?.rawFrame) { finalFrames.push(null); continue; }
                    const { rawFrame, adjustedRectPct } = sel;
                    if (!adjustedRectPct) { finalFrames.push(rawFrame); continue; } // no click event
                    const step = stepReviewData[fIdx];
                    const origClickEvent = step?.effectiveClickId
                        ? articleClickEventById.get(step.effectiveClickId)
                        : null;
                    const vw = Number(origClickEvent?.viewportW) || 1920;
                    const vh = Number(origClickEvent?.viewportH) || 1080;
                    // Build a synthetic click event that uses the user-adjusted rect
                    const syntheticEvent = {
                        ...(origClickEvent || {}),
                        id: origClickEvent?.id || step?.effectiveClickId || `adj_${fIdx}`,
                        x: (adjustedRectPct.xPct + adjustedRectPct.wPct / 2) * vw,
                        y: (adjustedRectPct.yPct + adjustedRectPct.hPct / 2) * vh,
                        targetRect: {
                            left: adjustedRectPct.xPct * vw,
                            top: adjustedRectPct.yPct * vh,
                            width: adjustedRectPct.wPct * vw,
                            height: adjustedRectPct.hPct * vh,
                        },
                        viewportW: vw,
                        viewportH: vh,
                    };
                    const highlighted = await createHighlightedArticleFrame(
                        rawFrame, syntheticEvent, nextArticleFrameId + 1,
                        Number(settings.clickHighlightOffsetY) || 0,
                        adjustedRectPct  // direct pct → bypasses captureMapping/offsetY/size-filter
                    );
                    if (highlighted) {
                        nextArticleFrameId += 1;
                        ensureArticleFrameInPool(highlighted);
                    }
                    finalFrames.push(highlighted || rawFrame);
                }

                // ── Pass 2: build markdown from user-confirmed selections ─────────
                const usedFrameIds = new Set();
                for (let idx = 0; idx < stepReviewData.length; idx++) {
                    taskSignal.throwIfAborted();
                    const { subIndex, stepName, description, effectiveClickId, candidateBundle } = stepReviewData[idx];
                    markdownDoc += `### ${settings.language === 'zh-TW' ? '步驟' : 'Step'} ${subIndex}: ${stepName}\n${description}\n`;
                    // finalFrames[idx] is already highlighted with the user-adjusted rect
                    // (or the raw frame if the step had no click event).
                    const chosenFrame = finalFrames?.[idx] || null;
                    const frame = chosenFrame || pickBestScreenshotFrame(activeFrames, stepReviewData[idx].stepTime, usedFrameIds, effectiveClickId);
                    registerArticleCandidateExport({
                        stepIndex: subIndex,
                        stepTitle: stepName,
                        clickId: effectiveClickId,
                        targetTime: stepReviewData[idx].stepTime,
                        candidateBundle
                    });
                    if (frame) {
                        usedFrameIds.add(frame.frameId);
                        // chosenFrame already has the highlight baked in; only apply
                        // ensureArticleFrameHighlight for the auto-fallback path.
                        const displayFrame = chosenFrame
                            ? frame
                            : await ensureArticleFrameHighlight(frame, effectiveClickId);
                        const exportFrame = displayFrame || frame;
                        markdownDoc += `\n![Screenshot at ${Number(exportFrame.relativeTime || 0).toFixed(2)}s](./${exportImagePrefix}_${exportFrame.frameId}.jpg)\n\n`;
                    } else {
                        markdownDoc += '\n';
                    }
                }

                markdownDoc += `## ${settings.language === 'zh-TW' ? '總結評價' : 'Conclusion'}\n${parsed.conclusion || ''}\n`;
            }

            articleProgress(
                isColumnTopicMode ? 5 : 6,
                isColumnTopicMode ? 5 : 6,
                '寫入文章結果',
                isColumnTopicMode ? '專欄內容、截圖與 Mermaid 圖表已整理完成，正在寫入專案結果...' : '文章內容與步驟截圖已整理完成，正在寫入專案結果...'
            );
            setProjectState(prev => ({ ...prev, [activeMarkdownField]: markdownDoc, [frameField]: articleFramePool, articleCandidateExports }));
            updateArticleStatus({
                phase: 'success',
                message: '文章已生成',
                detail: isColumnTopicMode ? '已產生專欄 markdown，可直接匯出或調整內容錨點後重生。' : '已產生 markdown 文章，可直接匯出或再編修字幕後重生。',
                aiLabel: articleAiLabel,
                progressPercent: 100,
                currentStep: 5,
                totalSteps: 5,
                stageLabel: '完成',
                title: finalTitle,
                summary: isColumnTopicMode ? (parsed.dek || parsed.opening || '') : (parsed.whatIsIt || ''),
                stepCount: subtitles.length,
                referenceCount: referenceLinks.length
            });
        } catch (error) {
            if (isAiTaskCancelledError(error) || error?.name === 'AbortError') {
                updateArticleStatus({
                    phase: 'warning',
                    message: '文章生成已取消',
                    detail: '本次文章生成任務已手動取消。',
                    stageLabel: '已取消'
                });
                return;
            }
            updateArticleStatus({
                phase: 'error',
                message: '文章生成失敗',
                detail: error.message || '解析錯誤'
            });
            alert("生成文章失敗: " + (error.message || "解析錯誤"));
        } finally {
            finishAiTask(taskController);
        }
    };

    const generateAiVoice = async () => {
        const voiceProgress = (currentStep, totalSteps, stageLabel, detail, patch = {}) => {
            const progressPercent = totalSteps > 0 ? Math.round((currentStep / totalSteps) * 100) : 0;
            setAiProgress(createProgressText(currentStep, totalSteps, stageLabel, progressPercent));
            updateTtsStatus({
                phase: 'running',
                message: '語音生成中',
                detail,
                aiLabel: voiceAiLabel,
                currentStep,
                totalSteps,
                progressPercent,
                stageLabel,
                ...patch
            });
        };

        if (voiceProvider === 'azure' && !azureTtsKey) return alert("請先輸入 Azure TTS API Key");
        if (voiceProvider === 'gemini' && !settings.apiKey) return alert("請先輸入 Gemini API Key");
        if (voiceProvider === 'lmstudio') return alert("LM Studio 版本目前尚未支援 TTS，請先改用 Azure、Gemini 或 Ollama。");
        if (voiceProvider === 'ollama' && !ollamaEndpoint) return alert("請先在設定中填入 Ollama Endpoint");
        if (voiceProvider === 'ollama' && !settings.ollamaTtsModel?.trim()) return alert("請先在設定中填入 Ollama TTS 模型 / 服務");
        if (highlightSubtitles.length === 0) return alert("請先生成或建立 S2 AI字幕，才能產生語音！");
        if (aiSubtitleTimelineWarning) {
            setStatusPanels(prev => ({ ...prev, subtitle: true, voice: true }));
            updateTtsStatus({
                phase: 'warning',
                message: '請先重跑 AI字幕',
                detail: aiSubtitleTimelineWarning
            });
            return alert(aiSubtitleTimelineWarning);
        }

        const normalizedHighlightSubtitles = normalizeTimedItemsToZero(
            highlightSubtitles,
            (item) => item?.endAt
        ).map(normalizeSubtitle);
        const subtitlesNeedRebase = normalizedHighlightSubtitles.some((item, index) => {
            const original = highlightSubtitles[index];
            return original && Math.abs(Number(original.startAt || 0) - Number(item.startAt || 0)) > 0.01;
        });
        const ttsSubtitles = subtitlesNeedRebase ? normalizedHighlightSubtitles : highlightSubtitles;

        if (subtitlesNeedRebase) {
            setProjectState(prev => ({
                ...prev,
                subtitles: prev.subtitles.map(sub => {
                    const normalized = normalizeSubtitle(sub);
                    if (normalized.trackIndex !== 1) return sub;
                    const corrected = normalizedHighlightSubtitles.find(item => item.id === normalized.id);
                    return corrected ? corrected : sub;
                })
            }));
        }

        setStatusPanels(prev => ({ ...prev, voice: true }));
        const taskController = beginAiTask('voice');
        const taskSignal = taskController.signal;
        voiceProgress(1, 3, '準備字幕與語音任務', `正在使用 ${voiceProviderLabel} (${voiceModelLabel}) 逐段產生 TTS 音檔...`, {
            successCount: 0,
            totalCount: ttsSubtitles.length,
            clips: []
        });
        try {
            const newAudioClips = [];
            let successCount = 0;
            const ttsClipReports = [];

            const delays = [2000, 5000, 10000, 20000, 30000];

            for (let i = 0; i < ttsSubtitles.length; i++) {
            const sub = ttsSubtitles[i];
            if (!sub.text || sub.text.trim() === '') continue;

            voiceProgress(
                2,
                3,
                `生成第 ${i + 1}/${ttsSubtitles.length} 段語音`,
                `正在使用 ${voiceProviderLabel} (${voiceModelLabel}) 生成第 ${i + 1} 段語音...`,
                {
                    successCount,
                    totalCount: ttsSubtitles.length,
                    clips: [...ttsClipReports]
                }
            );

            let retryCount = 0;
            let success = false;

            while (retryCount < 5 && !success) {
                try {
                    throwIfAborted(taskSignal);
                    const safeApiKey = encodeURIComponent(settings.apiKey.trim());

                    const ttsLanguagePrompt = settings.language === 'zh-TW'
                        ? `請用繁體中文、專業的教學語氣朗讀以下文字：${sub.text}`
                        : `Please read the following text in a professional tutorial tone in English: ${sub.text}`;

                    let wavBlob = null;
                    let actualAudioDuration = 3;

                    if (voiceProvider === 'azure') {
                        if (!azureTtsEndpoint || !settings.azureTtsDeployment) throw new Error("請設定完整的 Azure TTS Endpoint 與部署名稱。");
                        const azureUrl = `${azureTtsEndpoint.replace(/\/+$/, '')}/openai/deployments/${settings.azureTtsDeployment}/audio/speech?api-version=2024-02-15-preview`;
                        const response = await fetch(azureUrl, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json', 'api-key': azureTtsKey },
                            body: JSON.stringify({ model: settings.azureTtsDeployment, input: sub.text, voice: "alloy", response_format: "wav" }),
                            signal: taskSignal
                        });

                        if (response.status === 429 || response.status >= 500) {
                            const waitTime = delays[retryCount];
                            if (waitTime) {
                                voiceProgress(
                                    2,
                                    3,
                                    `等待第 ${i + 1} 段重試`,
                                    `API 限流 (429)，正在等待 ${waitTime / 1000} 秒後重試第 ${i + 1}/${ttsSubtitles.length} 段...`,
                                    {
                                        successCount,
                                        totalCount: ttsSubtitles.length,
                                        clips: [...ttsClipReports]
                                    }
                                );
                                await waitWithAbort(waitTime, taskSignal);
                            }
                            retryCount++; continue;
                        }
                        if (!response.ok) break;

                        const arrayBuffer = await response.arrayBuffer();
                        wavBlob = new Blob([arrayBuffer], { type: 'audio/wav' });
                        actualAudioDuration = await getAudioBlobDuration(wavBlob, 3);
                    } else if (voiceProvider === 'ollama') {
                        wavBlob = await callOllamaTts({
                            endpoint: ollamaEndpoint,
                            model: settings.ollamaTtsModel.trim(),
                            text: sub.text,
                            language: settings.language,
                            timeoutMs: ollamaTimeoutMs,
                            signal: taskSignal
                        });
                        actualAudioDuration = await getAudioBlobDuration(wavBlob, Math.max(1.5, sub.text.length / 8));
                    } else {
                        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${settings.geminiTtsModel}:generateContent?key=${safeApiKey}`, {
                            method: 'POST', headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ contents: [{ parts: [{ text: ttsLanguagePrompt }] }], generationConfig: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: "Aoede" } } } } }),
                            signal: taskSignal
                        });

                        if (response.status === 429 || response.status >= 500) {
                            const waitTime = delays[retryCount];
                            if (waitTime) {
                                setAiProgress(`API 限流 (429)，等待 ${waitTime / 1000} 秒後重試 (${i + 1}/${ttsSubtitles.length})...`);
                                await waitWithAbort(waitTime, taskSignal);
                            }
                            retryCount++; continue;
                        }
                        if (!response.ok) break;

                        const contentType = response.headers.get("content-type");
                        if (!contentType || !contentType.includes("application/json")) break;

                        const data = await response.json();
                        const inlineData = data.candidates?.[0]?.content?.parts?.[0]?.inlineData;
                        if (!inlineData || !inlineData.data) break;

                        const sampleRateMatch = inlineData.mimeType?.match(/rate=(\d+)/);
                        const sampleRate = sampleRateMatch ? parseInt(sampleRateMatch[1]) : 24000;
                        const pcmBytes = decodeBase64ToBytes(inlineData.data);
                        actualAudioDuration = pcmBytes.length / (sampleRate * 2);
                        wavBlob = pcmToWav(pcmBytes, sampleRate);
                    }

                    if (wavBlob) {
                        const audioId = `audio_${Date.now()}_${i}`;
                        await saveBlobToDB(audioId, wavBlob);
                        const url = URL.createObjectURL(wavBlob);
                        const clipReport = {
                            index: i + 1,
                            text: sub.text,
                            duration: Number((actualAudioDuration || 0).toFixed(2)),
                            sizeKb: Number((wavBlob.size / 1024).toFixed(1)),
                            status: 'success'
                        };
                        newAudioClips.push({
                            id: audioId, type: 'audio', src: url,
                            startAt: sub.startAt,
                            duration: actualAudioDuration,
                            originalDuration: actualAudioDuration,
                            playbackRate: 1.0, trimStart: 0, trimEnd: actualAudioDuration,
                            name: sub.text, volume: 1, fadeIn: 0, fadeOut: 0
                        });
                        ttsClipReports.push(clipReport);
                        success = true;
                        successCount++;
                        updateTtsStatus({
                            phase: 'running',
                            message: '語音生成中',
                            detail: `已完成 ${successCount}/${ttsSubtitles.length} 段語音。`,
                            aiLabel: voiceAiLabel,
                            progressPercent: Math.round(((i + 1) / Math.max(ttsSubtitles.length, 1)) * 100),
                            currentStep: 2,
                            totalSteps: 3,
                            stageLabel: `生成第 ${Math.min(i + 1, ttsSubtitles.length)}/${ttsSubtitles.length} 段語音`,
                            successCount,
                            totalCount: ttsSubtitles.length,
                            clips: [...ttsClipReports]
                        });
                    }
                } catch (err) {
                    if (isAiTaskCancelledError(err) || err?.name === 'AbortError') throw err;
                    if (retryCount >= delays.length - 1) {
                        ttsClipReports.push({
                            index: i + 1,
                            text: sub.text,
                            duration: 0,
                            sizeKb: 0,
                            status: 'error',
                            error: err.message || '網路異常'
                        });
                    }
                    const waitTime = delays[retryCount];
                    if (waitTime) {
                        voiceProgress(
                            2,
                            3,
                            `等待第 ${i + 1} 段重試`,
                            `網路異常，正在等待 ${waitTime / 1000} 秒後重試第 ${i + 1}/${ttsSubtitles.length} 段...`,
                            {
                                successCount,
                                totalCount: ttsSubtitles.length,
                                clips: [...ttsClipReports]
                            }
                        );
                        await waitWithAbort(waitTime, taskSignal);
                    }
                    retryCount++;
                }
            }

            if (i < ttsSubtitles.length - 1) {
                await waitWithAbort(3000, taskSignal);
            }
        }

            setProjectState(prev => {
                const nextTracks = [...prev.audioTracks];
                nextTracks[0] = newAudioClips;
                return { ...prev, audioTracks: nextTracks };
            });

            updateTtsStatus({
            phase: successCount > 0 ? (successCount === ttsSubtitles.length ? 'success' : 'warning') : 'error',
            message: successCount === ttsSubtitles.length
                ? '語音已生成'
                : successCount > 0
                    ? '語音部分完成'
                    : '語音生成失敗',
            detail: successCount === ttsSubtitles.length
                ? `全部 ${successCount} 段語音已建立。`
                : successCount > 0
                    ? `成功 ${successCount}/${ttsSubtitles.length} 段，請檢查異常段落。`
                    : '所有語音段落都生成失敗，請檢查 API 或異常段落。',
            aiLabel: voiceAiLabel,
            progressPercent: 100,
            currentStep: 3,
            totalSteps: 3,
            stageLabel: '完成',
            successCount,
            totalCount: ttsSubtitles.length,
            clips: [...ttsClipReports]
        });

            if (successCount === ttsSubtitles.length && successCount > 0) {
            } else if (successCount > 0 && successCount < ttsSubtitles.length) {
                alert(`語音生成完畢！成功: ${successCount} / ${ttsSubtitles.length}。\n部分失敗可能為 API 頻率限制 (429)，請稍後重試。`);
            } else if (ttsSubtitles.length > 0) {
                alert('語音生成全數失敗，請檢查 API Key 或網路連線狀態。');
            }
        } catch (error) {
        if (isAiTaskCancelledError(error) || error?.name === 'AbortError') {
            updateTtsStatus({
                phase: 'warning',
                message: '語音生成已取消',
                detail: '本次 TTS 任務已手動取消。',
                stageLabel: '已取消'
            });
            return;
        }
        updateTtsStatus({
            phase: 'error',
            message: '語音生成失敗',
            detail: error.message || '未知錯誤'
        });
        alert(`語音生成失敗：${error.message || '未知錯誤'}`);
        } finally {
            finishAiTask(taskController);
        }
    };

    const handleImportAssets = async (e) => {
        const files = Array.from(e.target.files);
        if (files.length === 0) return;

        const newAssets = [];
        for (const file of files) {
            const id = `asset_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            await saveBlobToDB(id, file);

            const fileType = file.type.startsWith('video/') ? 'video' : (file.type.startsWith('image/') ? 'image' : (file.type.startsWith('audio/') ? 'audio' : 'unknown'));
            const objectUrl = URL.createObjectURL(file);
            let duration = null;
            if (fileType === 'video' || fileType === 'audio') {
                duration = await getMediaUrlDuration(objectUrl, fileType, 5);
            }

            newAssets.push({
                id, blobId: id, type: fileType,
                src: objectUrl, name: file.name, duration
            });
        }

        setProjectState(prev => ({
            ...prev,
            assets: [...prev.assets, ...newAssets.filter(a => a.type !== 'unknown')]
        }));
        e.target.value = '';
    };

    const handleLibraryDragStart = (e, item) => {
        const payload = item.type === 'transition'
            ? { kind: 'transition', transitionPreset: item.transitionPreset, name: item.name, color: item.color, defaultDuration: item.defaultDuration || 0.8 }
            : { kind: 'asset', id: item.id };
        e.dataTransfer.setData('application/library_item', JSON.stringify(payload));
        if (payload.kind === 'asset') {
            e.dataTransfer.setData('application/asset_id', item.id);
        }
    };

    const getLibraryDropPayload = (e) => {
        const rawPayload = e.dataTransfer.getData('application/library_item');
        if (rawPayload) {
            try {
                return JSON.parse(rawPayload);
            } catch (err) {
                console.warn('invalid library payload', err);
            }
        }
        const assetId = e.dataTransfer.getData('application/asset_id');
        return assetId ? { kind: 'asset', id: assetId } : null;
    };

    const handleDropOnTrack = async (e, trackIndex) => {
        e.preventDefault();
        if (!timelineRef.current) return;
        const rect = timelineRef.current.getBoundingClientRect();
        const scrollLeft = timelineRef.current.scrollLeft;
        const x = Math.max(0, e.clientX - rect.left + scrollLeft - TIMELINE_OFFSET);
        const dropTime = x / pixelsPerSecond;

        const payload = getLibraryDropPayload(e);
        if (!payload) return;

        if (payload.kind === 'transition') {
            const newTransition = createTimelineTransitionItem(payload, dropTime);
            setProjectState(prev => {
                const nextTransitions = [...(prev.videoTransitions || [[], [], []])];
                nextTransitions[trackIndex] = [...(nextTransitions[trackIndex] || []), newTransition];
                return { ...prev, videoTransitions: nextTransitions };
            });
            return;
        }

        const asset = projectState.assets.find(a => a.id === payload.id);
        if (!asset || asset.type === 'audio') return;

        let clipDuration = asset.type === 'image'
            ? 5
            : Number.isFinite(Number(asset.duration)) && Number(asset.duration) > 0
                ? Number(asset.duration)
                : await getMediaUrlDuration(asset.src, 'video', 5);

        clipDuration = Math.max(0.1, Number(clipDuration.toFixed(3)));

        if (asset.type === 'video' && (!Number.isFinite(Number(asset.duration)) || Number(asset.duration) <= 0)) {
            setProjectState(prev => ({
                ...prev,
                assets: prev.assets.map(item => item.id === asset.id ? { ...item, duration: clipDuration } : item)
            }));
        }

        const newClip = {
            id: `clip_${Date.now()}`, type: asset.type, src: asset.src,
            blobId: getMediaBlobId(asset),
            startAt: dropTime, duration: clipDuration, originalDuration: clipDuration, playbackRate: 1.0,
            trimStart: 0, trimEnd: clipDuration, name: asset.name,
            layout: { ...DEFAULT_CLIP_LAYOUT },
            kenBurns: createDefaultKenBurnsEffect()
        };

        setProjectState(prev => {
            const newTracks = [...prev.tracks];
            newTracks[trackIndex] = [...newTracks[trackIndex], newClip];
            return { ...prev, tracks: newTracks };
        });
    };

    const handleDropOnSubtitleTrack = (e, trackIndex) => {
        e.preventDefault();
        if (!timelineRef.current) return;
        const payload = getLibraryDropPayload(e);
        if (!payload || payload.kind !== 'transition') return;
        const rect = timelineRef.current.getBoundingClientRect();
        const scrollLeft = timelineRef.current.scrollLeft;
        const x = Math.max(0, e.clientX - rect.left + scrollLeft - TIMELINE_OFFSET);
        const dropTime = x / pixelsPerSecond;
        const newTransition = { ...createTimelineTransitionItem(payload, dropTime), trackIndex };
        setProjectState(prev => ({
            ...prev,
            subtitleTransitions: [...(prev.subtitleTransitions || []), newTransition]
        }));
    };

    const handleDropOnAudioTrack = async (e, trackIndex) => {
        e.preventDefault();
        const assetId = e.dataTransfer.getData('application/asset_id');
        if (!assetId) return;
        const asset = projectState.assets.find(a => a.id === assetId);
        if (!asset || asset.type !== 'audio') return;

        if (!timelineRef.current) return;
        const rect = timelineRef.current.getBoundingClientRect();
        const scrollLeft = timelineRef.current.scrollLeft;
        const x = Math.max(0, e.clientX - rect.left + scrollLeft - TIMELINE_OFFSET);
        const dropTime = x / pixelsPerSecond;

        const duration = Number.isFinite(Number(asset.duration)) && Number(asset.duration) > 0
            ? Number(asset.duration)
            : await getMediaUrlDuration(asset.src, 'audio', 5);
        const safeDuration = Math.max(0.1, Number(duration.toFixed(3)));
        if (!Number.isFinite(Number(asset.duration)) || Number(asset.duration) <= 0) {
            setProjectState(prev => ({
                ...prev,
                assets: prev.assets.map(item => item.id === asset.id ? { ...item, duration: safeDuration } : item)
            }));
        }
        const newAudio = {
            id: `audio_${Date.now()}`, type: 'audio', src: asset.src,
            blobId: getMediaBlobId(asset),
            startAt: dropTime, duration: safeDuration, originalDuration: safeDuration, playbackRate: 1.0,
            trimStart: 0, trimEnd: safeDuration, name: asset.name,
            volume: 1, fadeIn: 0, fadeOut: 0
        };
        setProjectState(prev => {
            const newATracks = [...prev.audioTracks];
            newATracks[trackIndex] = [...(newATracks[trackIndex] || []), newAudio];
            return { ...prev, audioTracks: newATracks };
        });
    };

    const executeExport = async () => {
        setShowExportModal(false);

        if (exportSettings.renderVideo) {
            try {
                if (!audioCtxRef.current) {
                    const AudioContext = window.AudioContext || window.webkitAudioContext;
                    audioCtxRef.current = new AudioContext();
                    audioDestRef.current = audioCtxRef.current.createMediaStreamDestination();
                } else if (audioCtxRef.current.state === 'suspended') {
                    audioCtxRef.current.resume();
                }
            } catch (e) { console.warn("AudioContext initialization warning:", e); }
        }

        const hasStaticDownloads = exportSettings.rawMedia || exportSettings.includeMarkdown || exportSettings.includeSubtitles || exportSettings.includeAudio || exportSettings.projectJson;

        let exportDirHandle = null;
        if ('showDirectoryPicker' in window) {
            try {
                exportDirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
                exportDirectoryRef.current = exportDirHandle;
            } catch (err) {
                if (err?.name === 'AbortError') return false;
                console.warn('directory picker unavailable', err);
            }
        }

        if (hasStaticDownloads) {
            alert("【匯出提示】\n系統將為您「逐一下載」勾選的檔案。\n⚠️ 為了避免瀏覽器阻擋，檔案會依序緩慢下載，若跳出「允許下載多個檔案」提示，請務必點擊「允許」！");
        }

        const saveBlobToUserPath = async (blob, filename) => {
            if (exportDirHandle) {
                const fileHandle = await exportDirHandle.getFileHandle(filename, { create: true });
                const writable = await fileHandle.createWritable();
                await writable.write(blob);
                await writable.close();
                return;
            }
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            await new Promise(r => setTimeout(r, 800));
        };

        const fetchBlobFromSrc = async (src) => {
            const res = await fetch(src);
            if (!res.ok) throw new Error(`無法讀取匯出來源: ${src}`);
            return await res.blob();
        };

        if (exportSettings.includeSubtitles && projectState.subtitles.length > 0) {
            let srtContent = '';
            const formatTime = (seconds) => new Date(seconds * 1000).toISOString().substr(11, 12).replace('.', ',');
            projectState.subtitles.forEach((sub, i) => { srtContent += `${i + 1}\n${formatTime(sub.startAt)} --> ${formatTime(sub.endAt)}\n${sub.text}\n\n`; });
            const blob = new Blob([srtContent], { type: 'text/plain' });
            await saveBlobToUserPath(blob, 'subtitles.srt');
        }

        const activeMarkdown = projectState[activeSkill.markdownField] || '';
        const activeFrames = Array.isArray(projectState[activeSkill.frameField]) ? projectState[activeSkill.frameField] : [];
        const articleCandidateExports = Array.isArray(projectState.articleCandidateExports) ? projectState.articleCandidateExports : [];
        const markdownExtraImageExports = activeSkill.editorMode === 'tutorial' ? articleCandidateExports : [];
        const activeExportName = activeSkill.exportFileName || 'export.md';
        if (exportSettings.includeMarkdown) {
            const saveMarkdownWithAssets = async (markdown, filename, frames, extraImageExports = [], inlineImageExports = []) => {
                if (!markdown) return;
                const mdBlob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
                await saveBlobToUserPath(mdBlob, filename);
                const saveFrameAsJpeg = async (frame, outputName) => {
                    if (!frame?.hdData || !outputName) return;
                    const byteString = atob(frame.hdData);
                    const arrayBuffer = new ArrayBuffer(byteString.length);
                    const int8Array = new Uint8Array(arrayBuffer);
                    for (let i = 0; i < byteString.length; i++) int8Array[i] = byteString.charCodeAt(i);
                    const blob = new Blob([int8Array], { type: 'image/jpeg' });
                    await saveBlobToUserPath(blob, outputName);
                    await new Promise(resolve => setTimeout(resolve, 0));
                };
                if (frames.length > 0) {
                    const imageRegex = /!\[(.*?)\]\(\.\/([a-z0-9_-]+)_(\d+)\.jpg\)/gi;
                    let match;
                    while ((match = imageRegex.exec(markdown)) !== null) {
                        const frameId = parseInt(match[3], 10);
                        const filePrefix = match[2];
                        const frame = frames.find(f => f.frameId === frameId);
                        if (frame && frame.hdData) {
                            try {
                                await saveFrameAsJpeg(frame, `${filePrefix}_${frameId}.jpg`);
                            } catch (e) {
                                console.warn('markdown asset export failed', { filename, frameId, filePrefix, error: e });
                            }
                        }
                    }
                    for (const exportEntry of extraImageExports) {
                        const candidates = Array.isArray(exportEntry?.candidates) ? exportEntry.candidates : [];
                        for (const candidate of candidates) {
                            const frameId = Number(candidate?.frameId || 0);
                            const outputName = String(candidate?.fileName || '').trim();
                            const frame = frames.find(f => Number(f?.frameId || 0) === frameId);
                            if (!frame || !frame.hdData || !outputName) continue;
                            try {
                                await saveFrameAsJpeg(frame, outputName);
                            } catch (e) {
                                console.warn('article candidate export failed', { filename, frameId, outputName, error: e });
                            }
                        }
                    }
                }
                for (const imageExport of inlineImageExports) {
                    const frame = imageExport?.frame;
                    const outputName = String(imageExport?.fileName || '').trim();
                    if (!frame?.hdData || !outputName) continue;
                    try {
                        await saveFrameAsJpeg(frame, outputName);
                    } catch (e) {
                        console.warn('inline markdown image export failed', { filename, outputName, error: e });
                    }
                }
            };

            const prepareTutorialMarkdownImages = async (markdown, frames) => {
                const imagePattern = /!\[([^\]]*)\]\(\.\/([^\)]+\.jpg)\)/gi;
                const references = [...String(markdown || '').matchAll(imagePattern)];
                if (!references.length) return { markdown, inlineImageExports: [] };

                const existingFrames = Array.isArray(frames) ? frames.filter(frame => frame?.hdData) : [];
                const findFrameForReference = (reference) => {
                    const legacyMatch = String(reference[2] || '').match(/_([0-9]+)\.jpg$/i);
                    const legacyFrameId = legacyMatch ? Number(legacyMatch[1]) : 0;
                    return legacyFrameId
                        ? existingFrames.find(frame => Number(frame?.frameId) === legacyFrameId) || null
                        : null;
                };
                const extractScreenshotTime = (reference) => {
                    const match = String(reference[1] || '').match(/(?:screenshot\s+at|截圖(?:時間)?\s*(?:於|at)?)\s*(\d+(?:\.\d+)?)\s*s?/i);
                    return match ? Number(match[1]) : NaN;
                };
                const missingTimes = references
                    .filter(reference => !findFrameForReference(reference))
                    .map(extractScreenshotTime)
                    .filter(Number.isFinite);
                const rebuiltFrames = missingTimes.length > 0
                    ? await captureFramesFromTimelineTargets([...new Set(missingTimes)], {
                        settledDelaySeconds: 0.35,
                        includeClickRipple: false
                    })
                    : [];
                const allFrames = [...existingFrames, ...rebuiltFrames.filter(frame => frame?.hdData)];
                const inlineImageExports = [];
                let imageIndex = 0;
                const preparedMarkdown = String(markdown).replace(imagePattern, (fullMatch, altText, originalPath) => {
                    const reference = references[imageIndex++];
                    const targetTime = extractScreenshotTime(reference);
                    const directFrame = findFrameForReference(reference);
                    const frame = directFrame || allFrames
                        .filter(candidate => Number.isFinite(Number(candidate?.relativeTime)))
                        .sort((a, b) => Math.abs(Number(a.relativeTime) - targetTime) - Math.abs(Number(b.relativeTime) - targetTime))[0];
                    if (!frame?.hdData) return fullMatch;
                    const fileName = `article_step_${String(imageIndex).padStart(2, '0')}.jpg`;
                    inlineImageExports.push({ frame, fileName });
                    return `![${altText}](./${fileName})`;
                });
                return { markdown: preparedMarkdown, inlineImageExports };
            };

            if (activeSkillId === 'ui-debug') {
                const moduleReports = projectState.uiDebugReport?.moduleReports || {};
                const reportEntries = Object.values(moduleReports);
                if (reportEntries.length > 0) {
                    for (const report of reportEntries) {
                        await saveMarkdownWithAssets(report.markdown, report.fileName, activeFrames);
                    }
                } else if (activeMarkdown) {
                    await saveMarkdownWithAssets(activeMarkdown, activeExportName, activeFrames);
                }
            } else if (activeMarkdown) {
                const preparedArticle = activeSkill.editorMode === 'tutorial'
                    ? await prepareTutorialMarkdownImages(activeMarkdown, activeFrames)
                    : { markdown: activeMarkdown, inlineImageExports: [] };
                await saveMarkdownWithAssets(
                    preparedArticle.markdown,
                    activeExportName,
                    activeFrames,
                    markdownExtraImageExports,
                    preparedArticle.inlineImageExports
                );
            }
        }

        if (exportSettings.rawMedia) {
            const allVideoClips = projectState.tracks.flat().filter(c => c.type === 'video' || c.type === 'image');
            for (let index = 0; index < allVideoClips.length; index++) {
                const v = allVideoClips[index];
                const blob = await fetchBlobFromSrc(v.src);
                await saveBlobToUserPath(blob, `media_${index + 1}.${v.type === 'image' ? 'jpg' : 'webm'}`);
            }
        }

        const clickEventLog = await loadGlobalClickLog();
        const debugEventLog = await loadGlobalDebugLog();
        const exportAnnotatedState = annotateProjectWithExportFilenames({
            ...projectState,
            clickEventLog,
            debugEventLog
        });

        if (exportSettings.includeAudio) {
            const allAudioClips = projectState.audioTracks
                .flatMap(track => track || [])
                .filter(audio => audio?.src);
            for (let index = 0; index < allAudioClips.length; index++) {
                const audio = allAudioClips[index];
                const blob = await fetchBlobFromSrc(audio.src);
                const safeBaseName = sanitizeExportBaseName(audio.name, `audio_${index + 1}`);
                await saveBlobToUserPath(blob, `audio_${String(index + 1).padStart(2, '0')}_${safeBaseName}.wav`);
            }
        }

        if (exportSettings.projectJson) {
            const saveableState = {
                ...exportAnnotatedState,
                tracks: exportAnnotatedState.tracks.map(t => t.map(c => ({ ...c, src: '' }))),
                audioTracks: exportAnnotatedState.audioTracks.map(t => t ? t.map(a => ({ ...a, src: '' })) : []),
                assets: exportAnnotatedState.assets.map(a => ({ ...a, src: '' })),
                capturedFrames: [],
                uiDebugFrames: [],
                uxResearchFrames: []
            };
            const blob = new Blob([JSON.stringify(saveableState, null, 2)], { type: 'application/json' });
            await saveBlobToUserPath(blob, 'project.json');
        }

        if (exportSettings.renderVideo) {
            setTimeout(() => {
                startRendering(exportDirHandle);
            }, 800);
        }
        return true;
    };

    const handleConfirmExport = async () => {
        const pendingApproval = pendingAutomationApprovalRef.current;
        const didStartExport = await executeExport();
        if (pendingApproval?.kind === 'export') {
            pendingAutomationApprovalRef.current = null;
            const waitForRender = didStartExport !== false && exportSettings.renderVideo;
            if (waitForRender) pendingAutomationRenderRef.current = pendingApproval;
            await reportAutomationCommandResult(pendingApproval.commandId, {
                status: didStartExport === false ? 'cancelled' : waitForRender ? 'running' : 'completed',
                detail: didStartExport === false ? 'Export location selection was cancelled.' : waitForRender ? 'Export was approved; video rendering is in progress.' : 'Export was approved and selected files are being produced.',
                snapshot: getAutomationSnapshot()
            }).catch(() => {});
        }
    };

    const handleCancelExportModal = () => {
        const pendingApproval = pendingAutomationApprovalRef.current;
        setShowExportModal(false);
        if (pendingApproval?.kind === 'export') {
            pendingAutomationApprovalRef.current = null;
            void reportAutomationCommandResult(pendingApproval.commandId, {
                status: 'cancelled',
                detail: 'Export approval was cancelled by the user.',
                snapshot: getAutomationSnapshot()
            }).catch(() => {});
        }
    };

    const startRendering = (exportDirHandle = null) => {
        if (totalDuration === 0) return alert('時間軸上沒有內容！');
        setShowExportModal(false);
        setAiProgress('正在即時渲染影片中... 請勿切換分頁');
        setAiLoading(true);
        setCurrentTime(0);
        renderTimeRef.current = 0;
        renderAccumulatorRef.current = 0;
        renderLastTickRef.current = 0;
        isRenderingRef.current = true;

        const canvas = exportCanvasRef.current;
        const stream = canvas.captureStream(0);
        renderVideoTrackRef.current = stream.getVideoTracks()[0] || null;

        try {
            if (!audioCtxRef.current) {
                const AudioContext = window.AudioContext || window.webkitAudioContext;
                audioCtxRef.current = new AudioContext();
                audioDestRef.current = audioCtxRef.current.createMediaStreamDestination();
            }

            projectStateRef.current.tracks.flat().forEach(clip => {
                const el = videoRefs.current[clip.id];
                if (el && !el.captured && !clip.linkedAudioId) {
                    try {
                        const source = audioCtxRef.current.createMediaElementSource(el);
                        source.connect(audioDestRef.current);
                        el.captured = true;
                    } catch (e) { }
                }
            });
            Object.values(audioRefs.current).forEach(el => {
                if (el && !el.captured) {
                    try {
                        const source = audioCtxRef.current.createMediaElementSource(el);
                        source.connect(audioDestRef.current);
                        el.captured = true;
                    } catch (e) { }
                }
            });

            const audioTracks = audioDestRef.current.stream.getAudioTracks();
            if (audioTracks.length > 0) {
                stream.addTrack(audioTracks[0]);
            }
        } catch (e) { console.warn("音訊混合處理受限，將匯出純影像與字幕的合成影片", e); }

        const mimeType = getPreferredRecordingMimeType({ preferSeekable: true });
        const recorder = mimeType
            ? new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 8_000_000 })
            : new MediaRecorder(stream, { videoBitsPerSecond: 8_000_000 });
        renderRecorderRef.current = recorder;
        renderChunksRef.current = [];

        recorder.ondataavailable = (e) => {
            if (e.data.size > 0) renderChunksRef.current.push(e.data);
        };

        recorder.onstop = async () => {
            const blob = new Blob(renderChunksRef.current, { type: mimeType });
            if (exportDirHandle) {
                try {
                    const fileHandle = await exportDirHandle.getFileHandle('Composed_Tutorial_Video.webm', { create: true });
                    const writable = await fileHandle.createWritable();
                    await writable.write(blob);
                    await writable.close();
                    return;
                } catch (err) {
                    console.warn('render export fallback to browser download', err);
                }
            }
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'Composed_Tutorial_Video.webm';
            a.click();
        };

        syncPlaybackElementsForTime(0, { forceHardSync: true });
        drawToExportCanvas(0);
        renderVideoTrackRef.current?.requestFrame?.();
        recorder.start();
        setIsPlaying(true);
    };

    const handleImportProject = useCallback(async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async (evt) => {
            try {
                const loaded = sanitizeImportedTimelineOffsets(
                    sanitizeImportedRecordingRange(normalizeProjectState(JSON.parse(evt.target.result)))
                );
                await rehydrateProjectMedia(loaded);
                resetProjectHistory();
                setProjectState(loaded, { recordHistory: false });
                setSelectedIds([]);
                resetDerivedStatusesFromProject(loaded, 'project');
                const remainingMissing = getProjectMissingMediaCount(loaded);
                if (remainingMissing === 0) {
                    alert("專案匯入成功！\n(本機暫存的影片與音軌已自動從資料庫還原。)");
                } else {
                    alert(`專案 JSON 已匯入，但仍有 ${remainingMissing} 個媒體檔尚未連結。\n請再按一次上方的「匯入素材資料夾」，選擇包含 project.json、media_*.webm、audio_*.wav 的同一個匯出資料夾。`);
                }
            } catch (err) { alert("專案檔讀取失敗！"); }
        };
        reader.readAsText(file);
        e.target.value = '';
    }, [resetDerivedStatusesFromProject, resetProjectHistory]);
    const handleImportProjectMediaFolder = useCallback(async () => {
        if (currentMissingMediaCount <= 0) {
            alert('目前專案沒有待重連的媒體檔。');
            return;
        }
        if (!('showDirectoryPicker' in window)) {
            alert('這個瀏覽器不支援資料夾選擇器，請改用 Chromium 系瀏覽器操作。');
            return;
        }

        try {
            const dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
            const loaded = cloneProjectSnapshot(projectStateRef.current);
            const restoredFromFolder = await relinkProjectFromDirectory(loaded, dirHandle);
            setProjectState(loaded, { recordHistory: false });
            setSelectedIds([]);
            const remainingMissing = getProjectMissingMediaCount(loaded);
            if (remainingMissing === 0) {
                alert(`素材重連完成！\n已從資料夾重新連結 ${restoredFromFolder} 個媒體檔。`);
            } else {
                alert(`已重新連結 ${restoredFromFolder} 個媒體檔，但仍有 ${remainingMissing} 個檔案尚未連結。\n請確認你選的是包含所有匯出媒體的同一個資料夾。`);
            }
        } catch (err) {
            if (err?.name !== 'AbortError') {
                console.warn('專案媒體重連失敗', err);
                alert('匯入素材資料夾失敗，請再試一次。');
            }
        }
    }, [currentMissingMediaCount, setProjectState]);

    const selectedSubtitles = useMemo(
        () => projectState.subtitles.filter(sub => selectedIds.includes(sub.id)).map(normalizeSubtitle),
        [projectState.subtitles, selectedIds]
    );
    const hasOnlySubtitleSelection = selectedIds.length > 0 && selectedSubtitles.length === selectedIds.length;
    const primarySelectedId = selectedIds.length > 0 ? selectedIds[0] : null;
    const isMultiSelect = selectedIds.length > 1;
    const isMultiSubtitleSelect = hasOnlySubtitleSelection && selectedSubtitles.length > 1;
    const activeSub = !isMultiSubtitleSelect && primarySelectedId
        ? (projectState.subtitles.find(s => s.id === primarySelectedId) ? normalizeSubtitle(projectState.subtitles.find(s => s.id === primarySelectedId)) : null)
        : null;
    const activeClip = primarySelectedId
        ? (() => {
            const found = projectState.tracks.flat().find(c => c.id === primarySelectedId);
            return found ? normalizeClipItem(found) : null;
        })()
        : null;
    const activeAudio = primarySelectedId ? projectState.audioTracks.flat().find(a => a?.id === primarySelectedId) : null;
    const activeTransition = primarySelectedId
        ? (
            (projectState.videoTransitions || []).flat().find(item => item.id === primarySelectedId)
            || (projectState.subtitleTransitions || []).find(item => item.id === primarySelectedId)
        )
        : null;
    const subtitleBatchDraft = useMemo(() => {
        if (!hasOnlySubtitleSelection || selectedSubtitles.length === 0) return null;
        const first = selectedSubtitles[0];
        const sharedValue = (key) => selectedSubtitles.every(sub => sub[key] === first[key]) ? first[key] : '';
        return {
            fontSize: sharedValue('fontSize'),
            fontFamily: sharedValue('fontFamily'),
            textColor: sharedValue('textColor'),
            backgroundColor: sharedValue('backgroundColor'),
            backgroundOpacity: sharedValue('backgroundOpacity'),
            x: sharedValue('x'),
            y: sharedValue('y')
        };
    }, [hasOnlySubtitleSelection, selectedSubtitles]);
    const activeSkill = getSkillById(activeSkillId);
    const markdownExportTitle = activeSkill.exportTitle || 'Markdown (.md) 與相關截圖';
    const uiDebugIssues = Array.isArray(projectState.uiDebugReport?.issues) ? projectState.uiDebugReport.issues : [];
    const uiDebugTopInteractions = Array.isArray(projectState.uiDebugReport?.interactions)
        ? [...projectState.uiDebugReport.interactions]
            .sort((a, b) => (b.transitionDurationMs || 0) - (a.transitionDurationMs || 0))
            .slice(0, 3)
        : [];
    const uiDebugThresholds = {
        ...uiDebugSkill.defaultThresholds,
        ...(projectState.uiDebugThresholds || {})
    };
    const uxResearchThresholds = {
        ...uxResearchSkill.defaultThresholds,
        ...(projectState.uxResearchThresholds || {})
    };
    const uxResearchPresetOptions = uxResearchSkill.thresholdPresets || [];
    const selectedUxResearchPreset = uxResearchPresetOptions.find(
        (preset) => preset.key === (projectState.uxResearchPreset || 'default')
    ) || uxResearchPresetOptions[0] || null;
    const uxResearchFieldExamples = selectedUxResearchPreset?.fieldExamples || {};
    const applyUxResearchPreset = useCallback((presetKey) => {
        const preset = uxResearchPresetOptions.find((item) => item.key === presetKey);
        if (!preset) return;
        setProjectState(prev => ({
            ...prev,
            uxResearchPreset: preset.key,
            uxResearchThresholds: { ...preset.values },
            uxResearchCameraNotes: preset.cameraNotesTemplate || ''
        }));
    }, [uxResearchPresetOptions, setProjectState]);
    const uiDebugCheckSelection = {
        ...DEFAULT_UI_DEBUG_CHECKS,
        ...(projectState.uiDebugChecks || {})
    };
    const uiDebugRecommendationGroups = projectState.uiDebugReport?.recommendationsByModule || {};
    const uxResearchFindings = Array.isArray(projectState.uxResearchReport?.topFindings) ? projectState.uxResearchReport.topFindings : [];
    const uxResearchTopFindings = uxResearchFindings.slice(0, 3);
    const handleAutomationCommand = useCallback(async (command) => {
        const input = command?.input && typeof command.input === 'object' ? command.input : {};
        const projectId = String(command?.projectId || '');
        if (!projectId) throw new Error('Automation command does not include a project ID.');

        if (command.action === 'project.initialize') {
            const skillId = getSkillById(input.skillId || 'tutorial').id;
            const nextProject = {
                ...createEmptyProjectState(),
                articleTopic: String(input.topic || input.title || '').trim(),
                tutorialDescription: String(input.brief || '').trim()
            };
            resetProjectHistory();
            setActiveSkillId(skillId);
            setProjectState(nextProject, { recordHistory: false });
            setSelectedIds([]);
            setAutomationProjectId(projectId);
            return {
                status: 'completed',
                detail: 'A new OpenViscribe project is ready in Studio.',
                result: { projectId, skillId }
            };
        }

        if (automationProjectId && automationProjectId !== projectId) {
            throw new Error('This Studio is currently open on another automation project. Initialize or finish that project first.');
        }
        if (!automationProjectId) setAutomationProjectId(projectId);

        if (command.action === 'capture.start') {
            pendingAutomationApprovalRef.current = { commandId: command.id, kind: 'capture', requireRealCapture: input.requireRealCapture !== false };
            setRecordingOptions({
                includeAudio: input.includeAudio ?? !!settings.includeAudio,
                includeWebcam: input.includeWebcam ?? false
            });
            setShowRecordingModal(true);
            return { status: 'waiting_for_user', detail: 'Choose the recording source and confirm browser capture in OpenViscribe Studio.' };
        }

        if (command.action === 'script.prepare') {
            const script = input.script && typeof input.script === 'object' ? input.script : null;
            if (!script?.steps?.length) throw new Error('The automation UI script is empty.');
            setProjectState(prev => ({ ...prev, automationScript: script }));
            return {
                status: 'completed',
                detail: `UI script “${script.title || 'Untitled'}” is ready. Start a real recording, then execute its steps with Computer Use.`,
                result: { scriptId: script.id, stepCount: script.steps.length }
            };
        }

        if (command.action === 'capture.stop') {
            if (!isRecording) throw new Error('There is no active recording to stop.');
            stopRecording();
            return { status: 'completed', detail: 'Recording stop was requested. The clip is being finalized in Studio.', result: getAutomationSnapshot() };
        }

        if (command.action === 'subtitles.generate') {
            await generateAiSubtitles();
            return { status: 'completed', detail: 'Subtitle generation finished.', result: getAutomationSnapshot() };
        }

        if (command.action === 'article.generate') {
            const existingAiSubtitles = (projectStateRef.current.subtitles || [])
                .map(normalizeSubtitle)
                .filter(subtitle => subtitle.trackIndex === 1 && String(subtitle.text || '').trim());
            const scriptSteps = Array.isArray(projectStateRef.current.automationScript?.steps)
                ? projectStateRef.current.automationScript.steps.filter(step => String(step?.instruction || '').trim())
                : [];
            const shouldUseScriptSteps = existingAiSubtitles.length === 0 && scriptSteps.length > 0;
            const scriptSubtitles = shouldUseScriptSteps
                ? scriptSteps.map((step, index) => {
                    const videoDuration = Math.max(3, Number(totalDuration) || scriptSteps.length * 6);
                    const slotDuration = Math.max(3, Math.min(12, videoDuration / scriptSteps.length));
                    const startAt = Number(Math.min(videoDuration - 0.8, 1.2 + index * slotDuration).toFixed(2));
                    const endAt = Number(Math.min(videoDuration, Math.max(startAt + 1.8, startAt + slotDuration - 0.8)).toFixed(2));
                    const instruction = String(step.instruction || '').trim();
                    const expected = String(step.expected || '').trim();
                    return normalizeSubtitle({
                        id: `sub_script_${Date.now()}_${index + 1}`,
                        trackIndex: 1,
                        startAt,
                        endAt,
                        text: expected ? `${instruction}（確認：${expected}）` : instruction,
                        scriptDerived: true
                    });
                })
                : null;

            if (scriptSubtitles) {
                setProjectState(prev => ({
                    ...prev,
                    subtitles: [...prev.subtitles.filter(sub => !normalizeSubtitle(sub).scriptDerived), ...scriptSubtitles]
                }));
            }
            await generateArticleFromSubtitles(scriptSubtitles);
            return {
                status: 'completed',
                detail: scriptSubtitles
                    ? 'Article generation finished using the completed UI script because this recording has no speech track.'
                    : 'Article generation finished.',
                result: getAutomationSnapshot()
            };
        }

        if (command.action === 'voice.generate') {
            await generateAiVoice();
            return { status: 'completed', detail: 'Voice generation finished.', result: getAutomationSnapshot() };
        }

        if (command.action === 'contents.apply') {
            const appliedContents = applyAutomaticContents(String(input.brief || input.topic || ''));
            return {
                status: 'completed',
                detail: appliedContents.length
                    ? `Automatically added ${appliedContents.length} narrative Contents layer(s).`
                    : 'No Contents layer was added because the brief did not require a supporting visual.',
                result: { ...getAutomationSnapshot(), contents: appliedContents }
            };
        }

        if (command.action === 'design.apply') {
            const requestedAsset = HYPERFRAME_ASSETS.find(asset => asset.id === input.assetId);
            if (requestedAsset) {
                const startAt = Math.max(0, Number.isFinite(Number(input.startAt)) ? Number(input.startAt) : Number(currentTime.toFixed(2)));
                const duration = Math.max(0.8, Math.min(10, Number(input.duration) || requestedAsset.duration || 4));
                const endAt = Number(Math.max(startAt + 0.5, Math.min(totalDuration || startAt + duration, startAt + duration)).toFixed(2));
                setProjectState(prev => ({
                    ...prev,
                    motionDesign: {
                        ...DEFAULT_MOTION_DESIGN,
                        ...(prev.motionDesign || {}),
                        manualCards: [...(prev.motionDesign?.manualCards || []), {
                            id: `hyperframe_asset_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
                            text: requestedAsset.nameZh,
                            creator: 'HYPERFRAMES',
                            presetId: input.presetId || requestedAsset.presetId,
                            assetId: requestedAsset.id,
                            startAt,
                            endAt
                        }]
                    }
                }));
                return { status: 'completed', detail: `${requestedAsset.nameZh} was added to the timeline.`, result: { assetId: requestedAsset.id, startAt, endAt } };
            }
            const preset = getMotionDesignPreset(input.presetId || projectStateRef.current.motionDesign?.presetId);
            const template = getHyperframeTemplate(input.templateId || projectStateRef.current.motionDesign?.hyperframeTemplateId);
            const mode = input.mode === 'manual' ? 'manual' : 'ai';
            const nextDuration = (value, fallback) => Math.max(0.8, Math.min(10, Number(value) || fallback));
            setProjectState(prev => ({
                ...prev,
                motionDesign: {
                    ...DEFAULT_MOTION_DESIGN,
                    ...(prev.motionDesign || {}),
                    presetId: preset.id,
                    hyperframeTemplateId: template.id,
                    enabled: mode === 'ai' ? true : prev.motionDesign?.enabled,
                    aiAutoEnabled: mode === 'ai',
                    includeIntro: input.includeIntro ?? prev.motionDesign?.includeIntro ?? true,
                    includeOutro: input.includeOutro ?? prev.motionDesign?.includeOutro ?? true,
                    includeLowerThird: input.includeLowerThird ?? prev.motionDesign?.includeLowerThird ?? true,
                    manualIntroEnabled: mode === 'manual' ? (input.includeIntro ?? true) : prev.motionDesign?.manualIntroEnabled,
                    manualOutroEnabled: mode === 'manual' ? (input.includeOutro ?? true) : prev.motionDesign?.manualOutroEnabled,
                    introDuration: nextDuration(input.introDuration, prev.motionDesign?.introDuration || DEFAULT_MOTION_DESIGN.introDuration),
                    outroDuration: nextDuration(input.outroDuration, prev.motionDesign?.outroDuration || DEFAULT_MOTION_DESIGN.outroDuration),
                    cardDuration: nextDuration(input.cardDuration, prev.motionDesign?.cardDuration || DEFAULT_MOTION_DESIGN.cardDuration)
                }
            }));
            return { status: 'completed', detail: `${preset.name} / ${template.nameZh} design pack was applied.`, result: { presetId: preset.id, templateId: template.id, mode } };
        }

        if (command.action === 'export.start') {
            pendingAutomationApprovalRef.current = { commandId: command.id, kind: 'export' };
            setExportSettings(prev => ({
                ...prev,
                renderVideo: input.renderVideo ?? true,
                includeMarkdown: input.includeMarkdown ?? true,
                includeSubtitles: input.includeSubtitles ?? true,
                includeAudio: input.includeAudio ?? false,
                rawMedia: input.rawMedia ?? false,
                projectJson: input.projectJson ?? true
            }));
            setShowExportModal(true);
            return { status: 'waiting_for_user', detail: 'Choose an export folder and confirm export in OpenViscribe Studio.' };
        }

        throw new Error(`Unsupported automation action: ${command.action}`);
    }, [applyAutomaticContents, automationProjectId, currentTime, generateAiSubtitles, generateAiVoice, generateArticleFromSubtitles, getAutomationSnapshot, isRecording, resetProjectHistory, setProjectState, settings.includeAudio, stopRecording, totalDuration]);

    useEffect(() => {
        setAutomationCommandHandler(handleAutomationCommand);
        return () => setAutomationCommandHandler(null);
    }, [handleAutomationCommand, setAutomationCommandHandler]);

    useEffect(() => {
        if (!automationProjectId || !settings.automationApiEnabled) return undefined;
        const timer = setTimeout(() => {
            void reportAutomationSnapshot(automationProjectId, getAutomationSnapshot()).catch(() => {});
        }, 350);
        return () => clearTimeout(timer);
    }, [automationProjectId, getAutomationSnapshot, projectState, reportAutomationSnapshot, settings.automationApiEnabled]);

    return (
        <div className="flex flex-col h-screen bg-gray-900 text-white font-sans overflow-hidden">

            {/* 🌟 隱藏的渲染畫布 (不能用 display:none，改用 opacity:0 並移出可視區以確保 captureStream 正常擷取) */}
            <canvas ref={exportCanvasRef} width={1920} height={1080} className="fixed top-[-9999px] left-[-9999px] opacity-0 pointer-events-none" />

            {projectState.audioTracks.flatMap(t => t || []).map(audio => (
                <audio key={audio.id} ref={el => audioRefs.current[audio.id] = el} src={audio.src} />
            ))}

            <div className="bg-blue-900 border-b border-blue-700 text-blue-100 px-4 py-2 text-sm flex items-center justify-between z-50">
                <div className="flex items-center space-x-2">
                    <AlertCircle size={18} className="text-yellow-400" />
                    <span><strong>全域點擊紅圈已改為開關控制：</strong> 請到右上角「設定」啟用「全域點擊紅色漣漪」。開啟後所有網頁分頁都會生效。</span>
                </div>
                <button
                    type="button"
                    onClick={() => updateRippleEnabled(!settings.clickRippleEnabled)}
                    className={`px-3 py-1 rounded-full text-xs font-bold border transition ${settings.clickRippleEnabled ? 'bg-red-600/90 border-red-300 text-white hover:bg-red-500' : 'bg-gray-700 border-gray-500 text-gray-200 hover:bg-gray-600'}`}
                    title="點擊可切換全域紅圈"
                >
                    <MousePointerClick size={14} className="inline mr-1" />
                    {settings.clickRippleEnabled ? '全域紅圈：開啟' : '全域紅圈：關閉'}
                </button>
            </div>

            <header className="flex items-center justify-between px-4 py-2 bg-gray-800 border-b border-gray-700">
                <div className="flex items-center space-x-2">
                    <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center shadow-inner">
                        <MonitorPlay size={20} className="text-white" />
                    </div>
                    <div>
                        <h1 className="text-lg font-bold tracking-wide">OpenViscribe</h1>
                        {settings.automationApiEnabled && (
                            <div className={`text-[10px] ${automationBridgeState.phase === 'connected' ? 'text-emerald-300' : automationBridgeState.phase === 'offline' ? 'text-amber-300' : 'text-gray-400'}`}>
                                Codex API：{automationBridgeState.phase === 'connected' ? '已連線' : automationBridgeState.phase === 'connecting' ? '連線中' : automationBridgeState.phase === 'offline' ? '離線' : '未啟用'}
                            </div>
                        )}
                    </div>
                </div>

                <div className="flex items-center space-x-4">
                    <div className="flex items-center space-x-2 rounded-lg border border-gray-700 bg-gray-900/80 px-3 py-1.5">
                        <span className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">Skill:</span>
                        {activeSkillId === 'ui-debug'
                            ? <Bug size={14} className="text-amber-300" />
                            : activeSkillId === 'ux-research'
                                ? <Eye size={14} className="text-cyan-300" />
                                : <MonitorPlay size={14} className="text-sky-300" />}
                        <select
                            value={activeSkillId}
                            onChange={(e) => setActiveSkillId(getSkillById(e.target.value).id)}
                            className="bg-transparent text-sm text-white focus:outline-none"
                            title="切換 Skill"
                        >
                            {SKILL_REGISTRY.map(skill => (
                                <option key={skill.id} value={skill.id} className="bg-gray-900 text-white">
                                    {skill.name}
                                </option>
                            ))}
                        </select>
                    </div>

                    {!isRecording ? (
                        <button onClick={openRecordingModal} className="flex items-center space-x-2 bg-red-600 hover:bg-red-700 px-4 py-1.5 rounded-md text-sm font-medium transition shadow-md">
                            <div className="w-2.5 h-2.5 bg-white rounded-full animate-pulse"></div><span>開始錄影</span>
                        </button>
                    ) : (
                        <button onClick={stopRecording} className="flex items-center space-x-2 bg-gray-700 hover:bg-gray-600 px-4 py-1.5 rounded-md text-sm font-medium text-red-400 transition">
                            <Square size={16} fill="currentColor" /><span>停止錄影</span>
                        </button>
                    )}

                    <div className="h-6 w-px bg-gray-700"></div>

                    <input type="file" ref={importProjectRef} accept=".json" style={{ display: 'none' }} onChange={handleImportProject} />
                    <button onClick={() => importProjectRef.current?.click()} className="flex items-center space-x-1 hover:text-blue-400 transition text-sm">
                        <Upload size={16} className="mr-1" /> 匯入專案 JSON
                    </button>
                    <button
                        onClick={handleImportProjectMediaFolder}
                        className={`flex items-center space-x-1 transition text-sm ${currentMissingMediaCount > 0 ? 'text-amber-300 hover:text-amber-200' : 'text-gray-500 hover:text-gray-300'}`}
                        title={currentMissingMediaCount > 0 ? `尚有 ${currentMissingMediaCount} 個媒體檔待重連` : '目前沒有待重連的媒體檔'}
                    >
                        <FolderOpen size={16} className="mr-1" /> 匯入素材資料夾
                        {currentMissingMediaCount > 0 && <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] text-amber-100">{currentMissingMediaCount}</span>}
                    </button>

                    <button onClick={saveDraft} className="flex items-center space-x-1 hover:text-green-400 transition text-sm">
                        <Save size={16} className="mr-1" /> 暫存
                    </button>
                    <button onClick={clearDraft} className="flex items-center space-x-1 hover:text-red-400 transition text-sm">
                        <Trash2 size={16} className="mr-1" /> 清空
                    </button>

                    <button
                        onClick={() => setShowHelp(true)}
                        className="p-2 hover:bg-gray-700 rounded-full transition"
                        title="如何使用"
                    >
                        <HelpCircle size={18} />
                    </button>

                    <button
                        onClick={() => setShowSettings(true)}
                        className="p-2 hover:bg-gray-700 rounded-full transition"
                        title="設定"
                    >
                        <Settings size={18} />
                    </button>

                    <button onClick={() => setShowExportModal(true)} className="flex items-center space-x-1 bg-blue-600 hover:bg-blue-700 px-3 py-1.5 rounded-md text-sm transition shadow-md">
                        <Download size={16} /><span>匯出選項</span>
                    </button>
                </div>
            </header>

            <div className="flex flex-1 overflow-hidden relative">

                {isMultiSelect && !hasOnlySubtitleSelection ? (
                    <div style={{ width: `${leftPanelWidth}px` }} className="shrink-0 bg-gray-800 border-r border-gray-700 flex flex-col z-10 shadow-xl">
                        <div className="p-3 border-b border-gray-700 flex justify-between items-center bg-gray-900">
                            <span className="font-bold text-sm">已選擇多個片段 ({selectedIds.length})</span>
                            <button onClick={() => setSelectedIds([])} className="text-xs text-gray-400 hover:text-white">取消選取</button>
                        </div>
                        <div className="flex-1 p-4 space-y-4">
                            <p className="text-xs text-gray-400">您可以直接在時間軸上拖拉移動這些片段。</p>
                            <button onClick={handleDeleteItem} className="w-full p-2 bg-red-600/80 hover:bg-red-600 rounded flex items-center justify-center transition">
                                <Trash2 size={16} className="mr-2" /> 刪除所選項目
                            </button>
                        </div>
                    </div>
                ) : hasOnlySubtitleSelection && subtitleBatchDraft ? (
                    <div style={{ width: `${leftPanelWidth}px` }} className="shrink-0 bg-gray-800 border-r border-gray-700 flex flex-col z-10 shadow-xl">
                        <div className="p-3 border-b border-gray-700 flex justify-between items-center bg-gray-900">
                            <span className="font-bold text-sm">{isMultiSubtitleSelect ? `批次編輯字幕 (${selectedSubtitles.length})` : '編輯字幕'}</span>
                            <button onClick={() => setSelectedIds([])} className="text-xs text-gray-400 hover:text-white">關閉</button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-4 space-y-4">
                            <div className={`p-3 rounded-lg border transition border-orange-500 bg-gray-900`}>
                                {activeSub ? (
                                    <>
                                        <div className="flex justify-between text-xs text-gray-400 mb-2 font-mono">
                                            <span>{new Date(activeSub.startAt * 1000).toISOString().substr(14, 5)}</span>
                                            <span>-</span>
                                            <span>{new Date(activeSub.endAt * 1000).toISOString().substr(14, 5)}</span>
                                        </div>
                                        <textarea
                                            value={activeSub.text}
                                            onChange={(e) => {
                                                setProjectState(prev => ({
                                                    ...prev,
                                                    subtitles: prev.subtitles.map(s => s.id === activeSub.id ? { ...s, text: e.target.value } : s)
                                                }))
                                            }}
                                            className="w-full bg-gray-700 text-sm p-2 rounded focus:outline-none border resize-none h-20 text-white border-transparent"
                                        />
                                    </>
                                ) : (
                                    <div className="text-xs text-gray-300 leading-5">
                                        已選取 {selectedSubtitles.length} 條字幕。文字內容維持各自獨立，下面的大小、字型、顏色、底色與位置會一次套用到全部選取的字幕。
                                    </div>
                                )}
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs text-gray-400 mb-2">字體大小</label>
                                    <input
                                        type="number"
                                        min="16"
                                        max="144"
                                        value={subtitleBatchDraft.fontSize}
                                        placeholder={subtitleBatchDraft.fontSize === '' ? '多種數值' : ''}
                                        onChange={(e) => {
                                            const value = Number(e.target.value);
                                            if (Number.isFinite(value)) handleSubtitleStyleChange('fontSize', clamp(value, 16, 144));
                                        }}
                                        className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 text-sm focus:border-orange-500 focus:outline-none"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs text-gray-400 mb-2">底色透明度</label>
                                    <input
                                        type="range"
                                        min="0"
                                        max="1"
                                        step="0.05"
                                        value={subtitleBatchDraft.backgroundOpacity === '' ? DEFAULT_SUBTITLE_STYLE.backgroundOpacity : subtitleBatchDraft.backgroundOpacity}
                                        onChange={(e) => handleSubtitleStyleChange('backgroundOpacity', Number(e.target.value))}
                                        className="w-full accent-orange-500"
                                    />
                                    <div className="text-[11px] text-gray-500 mt-1">
                                        {subtitleBatchDraft.backgroundOpacity === '' ? '多種數值' : `${Math.round(subtitleBatchDraft.backgroundOpacity * 100)}%`}
                                    </div>
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs text-gray-400 mb-2">字型</label>
                                <select
                                    value={subtitleBatchDraft.fontFamily}
                                    onChange={(e) => handleSubtitleStyleChange('fontFamily', e.target.value)}
                                    className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 text-sm focus:border-orange-500 focus:outline-none"
                                >
                                    {subtitleBatchDraft.fontFamily === '' && <option value="">多種字型</option>}
                                    {SUBTITLE_FONT_OPTIONS.map(option => (
                                        <option key={option.value} value={option.value}>{option.label}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs text-gray-400 mb-2">文字顏色</label>
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="color"
                                            value={subtitleBatchDraft.textColor || DEFAULT_SUBTITLE_STYLE.textColor}
                                            onChange={(e) => handleSubtitleStyleChange('textColor', e.target.value)}
                                            className="h-10 w-14 rounded bg-transparent border border-gray-600"
                                        />
                                        <input
                                            type="text"
                                            value={subtitleBatchDraft.textColor}
                                            placeholder={subtitleBatchDraft.textColor === '' ? '多種顏色' : '#ffffff'}
                                            onChange={(e) => {
                                                const nextValue = e.target.value.trim();
                                                if (/^#?[0-9a-fA-F]{6}$/.test(nextValue)) {
                                                    handleSubtitleStyleChange('textColor', nextValue.startsWith('#') ? nextValue : `#${nextValue}`);
                                                }
                                            }}
                                            className="flex-1 bg-gray-900 border border-gray-600 rounded px-3 py-2 text-sm focus:border-orange-500 focus:outline-none"
                                        />
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-xs text-gray-400 mb-2">底色</label>
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="color"
                                            value={subtitleBatchDraft.backgroundColor || DEFAULT_SUBTITLE_STYLE.backgroundColor}
                                            onChange={(e) => handleSubtitleStyleChange('backgroundColor', e.target.value)}
                                            className="h-10 w-14 rounded bg-transparent border border-gray-600"
                                        />
                                        <input
                                            type="text"
                                            value={subtitleBatchDraft.backgroundColor}
                                            placeholder={subtitleBatchDraft.backgroundColor === '' ? '多種顏色' : '#000000'}
                                            onChange={(e) => {
                                                const nextValue = e.target.value.trim();
                                                if (/^#?[0-9a-fA-F]{6}$/.test(nextValue)) {
                                                    handleSubtitleStyleChange('backgroundColor', nextValue.startsWith('#') ? nextValue : `#${nextValue}`);
                                                }
                                            }}
                                            className="flex-1 bg-gray-900 border border-gray-600 rounded px-3 py-2 text-sm focus:border-orange-500 focus:outline-none"
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-3">
                                <div>
                                    <label className="block text-xs text-gray-400 mb-2">水平位置 X: {subtitleBatchDraft.x === '' ? '多種位置' : `${Math.round(subtitleBatchDraft.x)}%`}</label>
                                    <input
                                        type="range"
                                        min="0"
                                        max="100"
                                        step="1"
                                        value={subtitleBatchDraft.x === '' ? DEFAULT_SUBTITLE_STYLE.x : subtitleBatchDraft.x}
                                        onChange={(e) => handleSubtitleStyleChange('x', Number(e.target.value))}
                                        className="w-full accent-orange-500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs text-gray-400 mb-2">垂直位置 Y: {subtitleBatchDraft.y === '' ? '多種位置' : `${Math.round(subtitleBatchDraft.y)}%`}</label>
                                    <input
                                        type="range"
                                        min="0"
                                        max="100"
                                        step="1"
                                        value={subtitleBatchDraft.y === '' ? DEFAULT_SUBTITLE_STYLE.y : subtitleBatchDraft.y}
                                        onChange={(e) => handleSubtitleStyleChange('y', Number(e.target.value))}
                                        className="w-full accent-orange-500"
                                    />
                                </div>
                            </div>

                            <div className="rounded-lg border border-gray-700 bg-gray-900/70 p-3 text-xs text-gray-400 leading-5">
                                預覽畫面中的字幕可直接拖曳移動。若同時選到多條字幕，拖曳其中一條時會一起移動所有已選字幕。
                            </div>
                        </div>
                    </div>
                ) : activeTransition ? (
                    <div style={{ width: `${leftPanelWidth}px` }} className="shrink-0 bg-gray-800 border-r border-gray-700 flex flex-col z-10 shadow-xl">
                        <div className="p-3 border-b border-gray-700 flex justify-between items-center bg-gray-900">
                            <span className="font-bold text-sm">編輯過場動畫</span>
                            <button onClick={() => setSelectedIds([])} className="text-xs text-gray-400 hover:text-white">關閉</button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-4 space-y-6">
                            <div className="rounded-lg border border-gray-700 bg-gray-900/70 p-3">
                                <div className="text-xs text-gray-400 mb-2">過場名稱</div>
                                <div className="text-sm font-semibold text-white">{activeTransition.name}</div>
                                <div className="text-[11px] text-gray-500 mt-2">可直接在時間軸拖曳移動，左右邊緣可調整長度。</div>
                            </div>
                            <div>
                                <label className="block text-xs text-gray-400 mb-2">動畫長度: {activeTransition.duration.toFixed(2)}s</label>
                                <input
                                    type="range"
                                    min="0.2"
                                    max="3"
                                    step="0.1"
                                    value={activeTransition.duration}
                                    onChange={(e) => {
                                        const nextDuration = clamp(parseFloat(e.target.value), 0.2, 3);
                                        setProjectState(prev => ({
                                            ...prev,
                                            videoTransitions: (prev.videoTransitions || [[], [], []]).map(track => track.map(item => item.id === activeTransition.id ? { ...item, duration: nextDuration } : item)),
                                            subtitleTransitions: (prev.subtitleTransitions || []).map(item => item.id === activeTransition.id ? { ...item, duration: nextDuration } : item)
                                        }));
                                    }}
                                    className="w-full accent-orange-500"
                                />
                            </div>
                        </div>
                    </div>
                ) : activeClip ? (
                    <div style={{ width: `${leftPanelWidth}px` }} className="shrink-0 bg-gray-800 border-r border-gray-700 flex flex-col z-10 shadow-xl">
                        <div className="p-3 border-b border-gray-700 flex justify-between items-center bg-gray-900">
                            <span className="font-bold text-sm flex items-center"><FastForward size={16} className="mr-2" /> 編輯片段</span>
                            <button onClick={() => setSelectedIds([])} className="text-xs text-gray-400 hover:text-white">關閉</button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-4 space-y-6">
                            <div className="rounded-lg border border-gray-700 bg-gray-900/70 p-3 space-y-2">
                                <div className="text-sm font-semibold text-white break-all">{activeClip.name}</div>
                                <div className="text-[11px] text-gray-400">
                                    類型: {activeClip.type === 'video' ? '影片' : '圖片'} / 長度: {activeClip.duration.toFixed(2)}s
                                </div>
                                <div className="text-[11px] text-gray-500 leading-5">
                                    Ken Burns 會在這個片段的畫面框內做慢速平移與縮放，預覽與匯出都會同步套用。
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs text-gray-400 mb-2">播放速度: {activeClip.playbackRate || 1.0}x</label>
                                <input
                                    type="range" min="0.5" max="2.0" step="0.1"
                                    value={activeClip.playbackRate || 1.0}
                                    onChange={(e) => handleUpdateSpeed(activeClip.id, 'clip', parseFloat(e.target.value))}
                                    className="w-full accent-orange-500"
                                />
                            </div>
                            <div className="rounded-lg border border-gray-700 bg-gray-900/70 p-3 space-y-4">
                                <label className="flex items-center justify-between gap-3">
                                    <span className="text-sm font-semibold text-white">Ken Burns</span>
                                    <input
                                        type="checkbox"
                                        checked={activeClip.kenBurns.enabled}
                                        onChange={(e) => handleUpdateKenBurns(activeClip.id, effect => ({ ...effect, enabled: e.target.checked }))}
                                        className="h-4 w-4 accent-orange-500"
                                    />
                                </label>
                                <div className="grid grid-cols-2 gap-2">
                                    {KEN_BURNS_PRESETS.map(preset => (
                                        <button
                                            key={preset.id}
                                            type="button"
                                            onClick={() => handleUpdateKenBurns(activeClip.id, effect => ({
                                                ...effect,
                                                enabled: true,
                                                ...preset.config
                                            }))}
                                            className="rounded-lg border border-gray-600 bg-gray-800 px-2 py-2 text-[11px] text-gray-200 hover:border-orange-500 hover:text-white transition"
                                        >
                                            {preset.name}
                                        </button>
                                    ))}
                                </div>
                                <div className="flex gap-2">
                                    <button
                                        type="button"
                                        onClick={() => handleUpdateKenBurns(activeClip.id, effect => ({ ...effect, start: { ...effect.end } }))}
                                        className="flex-1 rounded-lg border border-gray-600 bg-gray-800 px-2 py-2 text-[11px] text-gray-200 hover:border-orange-500 hover:text-white transition"
                                    >
                                        終點複製到起點
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => handleUpdateKenBurns(activeClip.id, effect => ({ ...effect, end: { ...effect.start } }))}
                                        className="flex-1 rounded-lg border border-gray-600 bg-gray-800 px-2 py-2 text-[11px] text-gray-200 hover:border-orange-500 hover:text-white transition"
                                    >
                                        起點複製到終點
                                    </button>
                                </div>
                                <div className="flex gap-2">
                                    <button
                                        type="button"
                                        onClick={() => handleUpdateKenBurns(activeClip.id, effect => ({ ...effect, start: { ...effect.end }, end: { ...effect.start } }))}
                                        className="flex-1 rounded-lg border border-gray-600 bg-gray-800 px-2 py-2 text-[11px] text-gray-200 hover:border-orange-500 hover:text-white transition"
                                    >
                                        交換起終點
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => handleUpdateKenBurns(activeClip.id, createDefaultKenBurnsEffect())}
                                        className="flex-1 rounded-lg border border-gray-600 bg-gray-800 px-2 py-2 text-[11px] text-gray-200 hover:border-orange-500 hover:text-white transition"
                                    >
                                        重設
                                    </button>
                                </div>
                                <div>
                                    <label className="block text-xs text-gray-400 mb-2">插值曲線</label>
                                    <select
                                        value={activeClip.kenBurns.easing}
                                        onChange={(e) => handleUpdateKenBurns(activeClip.id, effect => ({ ...effect, easing: e.target.value }))}
                                        className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 text-sm focus:border-orange-500 focus:outline-none"
                                    >
                                        <option value="linear">Linear</option>
                                        <option value="ease-in">Ease In</option>
                                        <option value="ease-out">Ease Out</option>
                                        <option value="ease-in-out">Ease In Out</option>
                                    </select>
                                </div>
                                {[
                                    { key: 'start', label: '起始視角' },
                                    { key: 'end', label: '結束視角' }
                                ].map(section => (
                                    <div key={section.key} className="rounded-lg border border-gray-700 bg-black/20 p-3 space-y-3">
                                        <div className="text-xs font-semibold tracking-wide text-gray-300">{section.label}</div>
                                        <div>
                                            <label className="block text-[11px] text-gray-400 mb-1">
                                                縮放: {activeClip.kenBurns[section.key].scale.toFixed(2)}x
                                            </label>
                                            <input
                                                type="range"
                                                min="1"
                                                max="3"
                                                step="0.01"
                                                value={activeClip.kenBurns[section.key].scale}
                                                onChange={(e) => handleUpdateKenBurns(activeClip.id, effect => ({
                                                    ...effect,
                                                    enabled: true,
                                                    [section.key]: {
                                                        ...effect[section.key],
                                                        scale: parseFloat(e.target.value)
                                                    }
                                                }))}
                                                className="w-full accent-orange-500"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-[11px] text-gray-400 mb-1">
                                                水平偏移: {Math.round(activeClip.kenBurns[section.key].x)}
                                            </label>
                                            <input
                                                type="range"
                                                min="-100"
                                                max="100"
                                                step="1"
                                                value={activeClip.kenBurns[section.key].x}
                                                onChange={(e) => handleUpdateKenBurns(activeClip.id, effect => ({
                                                    ...effect,
                                                    enabled: true,
                                                    [section.key]: {
                                                        ...effect[section.key],
                                                        x: parseFloat(e.target.value)
                                                    }
                                                }))}
                                                className="w-full accent-orange-500"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-[11px] text-gray-400 mb-1">
                                                垂直偏移: {Math.round(activeClip.kenBurns[section.key].y)}
                                            </label>
                                            <input
                                                type="range"
                                                min="-100"
                                                max="100"
                                                step="1"
                                                value={activeClip.kenBurns[section.key].y}
                                                onChange={(e) => handleUpdateKenBurns(activeClip.id, effect => ({
                                                    ...effect,
                                                    enabled: true,
                                                    [section.key]: {
                                                        ...effect[section.key],
                                                        y: parseFloat(e.target.value)
                                                    }
                                                }))}
                                                className="w-full accent-orange-500"
                                            />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                ) : activeAudio ? (
                    <div style={{ width: `${leftPanelWidth}px` }} className="shrink-0 bg-gray-800 border-r border-gray-700 flex flex-col z-10 shadow-xl">
                        <div className="p-3 border-b border-gray-700 flex justify-between items-center bg-gray-900">
                            <span className="font-bold text-sm flex items-center"><Volume2 size={16} className="mr-2" /> 音訊編輯</span>
                            <button onClick={() => setSelectedIds([])} className="text-xs text-gray-400 hover:text-white">關閉</button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-4 space-y-6">
                            <div>
                                <label className="block text-xs text-gray-400 mb-2">音量 (Volume): {Math.round((activeAudio.volume ?? 1) * 100)}%</label>
                                <input type="range" min="0" max="2" step="0.1" value={activeAudio.volume ?? 1} onChange={(e) => handleUpdateAudioProperty(activeAudio.id, 'volume', parseFloat(e.target.value))} className="w-full accent-orange-500" />
                            </div>
                            <div>
                                <label className="block text-xs text-gray-400 mb-2">淡入 (Fade In): {activeAudio.fadeIn ?? 0}s</label>
                                <input type="range" min="0" max="5" step="0.5" value={activeAudio.fadeIn ?? 0} onChange={(e) => handleUpdateAudioProperty(activeAudio.id, 'fadeIn', parseFloat(e.target.value))} className="w-full accent-orange-500" />
                            </div>
                            <div>
                                <label className="block text-xs text-gray-400 mb-2">淡出 (Fade Out): {activeAudio.fadeOut ?? 0}s</label>
                                <input type="range" min="0" max="5" step="0.5" value={activeAudio.fadeOut ?? 0} onChange={(e) => handleUpdateAudioProperty(activeAudio.id, 'fadeOut', parseFloat(e.target.value))} className="w-full accent-orange-500" />
                            </div>
                            <div className="pt-4 border-t border-gray-700">
                                <label className="block text-xs text-gray-400 mb-2">語音速度: {activeAudio.playbackRate || 1.0}x</label>
                                <input type="range" min="0.5" max="2.0" step="0.1" value={activeAudio.playbackRate || 1.0} onChange={(e) => handleUpdateSpeed(activeAudio.id, 'audio', parseFloat(e.target.value))} className="w-full accent-orange-500" />
                            </div>
                        </div>
                    </div>
                ) : (
                    <div style={{ width: `${leftPanelWidth}px` }} className="shrink-0 bg-gray-800 border-r border-gray-700 flex flex-col z-10 shadow-xl">
                        <div className="p-3 border-b border-gray-700 flex justify-between items-center bg-gray-900">
                            <div>
                                <div className="font-bold text-sm">{activeSkill.name}</div>
                                <div className="text-[11px] text-gray-400 mt-1">{activeSkill.description}</div>
                            </div>
                        </div>
                        <div className="flex-1 overflow-y-auto p-4 space-y-6">
                            {activeSkill.editorMode === 'tutorial' ? (
                                <>
                                    <div>
                                        <label className="block text-xs text-gray-400 mb-2">{activeSkill.promptLabel || '1. 本次文章提示詞'}</label>
                                        <div className="text-sm font-semibold text-white mb-2">{activeSkill.promptTitle || '介紹文章模式'}</div>
                                        <div className="text-[11px] text-gray-400 leading-5 mb-3">
                                            {activeSkill.promptDescription || '這裡直接填本次要介紹的功能、使用情境、關鍵亮點，或貼上參考連結給 AI 當成寫作提示。'}
                                        </div>
                                        <div className="mb-3">
                                            <label className="block text-xs text-gray-400 mb-1">文章主題 <span className="text-gray-500">（產品 / 功能名稱，AI 會以此作為文章焦點）</span></label>
                                            <input
                                                type="text"
                                                value={projectState.articleTopic || ''}
                                                onChange={(e) => setProjectState(prev => ({ ...prev, articleTopic: e.target.value }))}
                                                placeholder="例如：AiMesh、Adaptive QoE、家長監控、VPN Fusion"
                                                className="w-full bg-gray-900 text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-blue-500 border border-gray-700 text-white"
                                            />
                                        </div>
                                        <textarea
                                            value={projectState.tutorialDescription || ''}
                                            onChange={(e) => setProjectState(prev => ({ ...prev, tutorialDescription: e.target.value }))}
                                            placeholder={activeSkill.promptPlaceholder || '例如：這次重點介紹 QoS / 家長監控 / VPN 設定流程，文章語氣希望像科技 KOL 開箱，也可貼入產品頁連結作為參考。'}
                                            className="w-full bg-gray-900 text-sm p-3 rounded-xl focus:outline-none focus:border-blue-500 border border-gray-700 resize-none h-28 text-white"
                                        />
                                        {activeSkill.articlePerspectiveEnabled && (
                                        <div className="mt-3">
                                            <label className="block text-xs text-gray-400 mb-2">寫作視角</label>
                                            <select
                                                value={projectState.articlePerspective || 'brief'}
                                                onChange={(e) => setProjectState(prev => ({ ...prev, articlePerspective: e.target.value }))}
                                                className="w-full bg-gray-900 border border-gray-700 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500"
                                            >
                                                {ARTICLE_PERSPECTIVE_OPTIONS.map((option) => (
                                                    <option key={option.value} value={option.value}>{option.label}</option>
                                                ))}
                                            </select>
                                            <div className="text-[11px] text-gray-400 leading-5 mt-2">
                                                {(ARTICLE_PERSPECTIVE_OPTIONS.find(option => option.value === (projectState.articlePerspective || 'kol')) || ARTICLE_PERSPECTIVE_OPTIONS[1]).hint}
                                            </div>
                                        </div>
                                        )}
                                    </div>
                                    <div className="space-y-3">
                                        <label className="block text-xs text-gray-400 mb-2">2. AI 智慧生成</label>
                                        <button onClick={generateAiSubtitles} className="w-full p-3 bg-gray-700 hover:bg-purple-600 rounded-xl flex items-center space-x-3 transition shadow-sm">
                                            {aiLoading && activeAiTask === 'subtitle' ? <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-white"></div> : <Type size={20} />}
                                            <span className="text-sm font-medium">{activeSkill.primaryActionLabel || 'AI字幕'}</span>
                                        </button>
                                        <div className={`rounded-xl border px-3 py-2 space-y-2 ${aiSubtitleStatusClasses}`}>
                                            <button
                                                type="button"
                                                onClick={() => setStatusPanels(prev => ({ ...prev, subtitle: !prev.subtitle }))}
                                                className="w-full flex items-center justify-between text-left"
                                            >
                                                <div>
                                                    <div className="text-sm font-semibold">AI字幕狀態</div>
                                                    <div className="text-[11px] opacity-80">{aiSubtitleStatus.message}</div>
                                                </div>
                                                <span className="text-[11px] opacity-80">{statusPanels.subtitle ? '收合' : '展開'}</span>
                                            </button>
                                            {statusPanels.subtitle && (
                                                <>
                                                    <div className="text-xs leading-5 opacity-90">{aiSubtitleStatus.detail}</div>
                                                    {renderTaskProgress(aiSubtitleStatus)}
                                                    <div className="grid grid-cols-2 gap-2 text-[11px]">
                                                        <div className="rounded-lg bg-black/20 px-2 py-1.5">{activeSkill.id === 'column-topic' ? '內容錨點' : '紅圈點擊'}: {aiSubtitleStatus.clickCount}</div>
                                                        <div className="rounded-lg bg-black/20 px-2 py-1.5">字幕數量: {aiSubtitleStatus.subtitleCount}</div>
                                                        <div className="rounded-lg bg-black/20 px-2 py-1.5">擷取畫面: {aiSubtitleStatus.frameCount}</div>
                                                        <div className="rounded-lg bg-black/20 px-2 py-1.5">上傳狀態: {aiSubtitleStatus.uploaded ? '已送出 OCR' : '未送出 OCR'}</div>
                                                    </div>
                                                    {aiSubtitleUpdatedLabel && (
                                                        <div className="text-[11px] opacity-70">最後更新: {aiSubtitleUpdatedLabel}</div>
                                                    )}
                                                </>
                                            )}
                                        </div>
                                        {activeSkill.id === 'composite-tutorial' && compositeSummary && (
                                            <div className="rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-3 py-3 space-y-3 text-cyan-50">
                                                <div>
                                                    <div className="text-sm font-semibold">Composite 分析摘要</div>
                                                    <div className="text-[11px] opacity-80">這次已保留段落級教學事件，可直接拿來生成多模態教學文章。</div>
                                                </div>
                                                <div className="grid grid-cols-2 gap-2 text-[11px]">
                                                    <div className="rounded-lg bg-black/20 px-2 py-1.5">段落數: {compositeSummary.segmentCount}</div>
                                                    <div className="rounded-lg bg-black/20 px-2 py-1.5">PIP 關鍵段: {compositeSummary.pipImportantCount}</div>
                                                    <div className="rounded-lg bg-black/20 px-2 py-1.5">實拍段落: {compositeSummary.liveActionCount}</div>
                                                    <div className="rounded-lg bg-black/20 px-2 py-1.5">PIP 場景: {compositeSummary.pipCount}</div>
                                                </div>
                                                {compositeSummary.title && (
                                                    <div className="text-[11px] leading-5 opacity-90">
                                                        <span className="font-semibold">文件標題：</span>{compositeSummary.title}
                                                    </div>
                                                )}
                                                {compositeSummary.overview && (
                                                    <div className="text-[11px] leading-5 opacity-90">{compositeSummary.overview}</div>
                                                )}
                                            </div>
                                        )}
                                        {aiSubtitleTimelineWarning && (
                                            <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs leading-5 text-amber-50">
                                                <div className="flex items-start gap-2">
                                                    <AlertCircle size={15} className="mt-0.5 shrink-0 text-amber-300" />
                                                    <div>{aiSubtitleTimelineWarning}</div>
                                                </div>
                                            </div>
                                        )}
                                        <button onClick={generateArticleFromSubtitles} className="w-full p-3 bg-gray-700 hover:bg-indigo-600 rounded-xl flex items-center space-x-3 transition shadow-sm">
                                            {aiLoading && activeAiTask === 'article' ? <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-white"></div> : <FileVideo size={20} />}
                                            <span className="text-sm font-medium">{activeSkill.articleActionLabel || '生成文章'}</span>
                                        </button>
                                        <label className="flex items-center justify-between gap-4 rounded-xl border border-gray-700 bg-gray-900/70 px-3 py-2 cursor-pointer">
                                            <div className="pr-3">
                                                <div className="text-sm text-white">是否加入點擊紅匡</div>
                                                <div className="text-[11px] text-gray-400 mt-1">取消勾選後，文章截圖與匯出的 11 張候選圖都不會加上紅色框線。</div>
                                            </div>
                                            <input
                                                type="checkbox"
                                                checked={projectState.articleIncludeClickHighlight !== false}
                                                onChange={(e) => setProjectState(prev => ({ ...prev, articleIncludeClickHighlight: e.target.checked }))}
                                                className="h-4 w-4 rounded accent-indigo-500"
                                            />
                                        </label>
                                        <div className={`rounded-xl border px-3 py-2 space-y-2 ${articleStatusClasses}`}>
                                            <button
                                                type="button"
                                                onClick={() => setStatusPanels(prev => ({ ...prev, article: !prev.article }))}
                                                className="w-full flex items-center justify-between text-left"
                                            >
                                                <div>
                                                    <div className="text-sm font-semibold">文章生成結果</div>
                                                    <div className="text-[11px] opacity-80">{articleStatus.message}</div>
                                                </div>
                                                <span className="text-[11px] opacity-80">{statusPanels.article ? '收合' : '展開'}</span>
                                            </button>
                                            {statusPanels.article && (
                                                <>
                                                    <div className="text-xs leading-5 opacity-90">{articleStatus.detail}</div>
                                                    {renderTaskProgress(articleStatus)}
                                                    <div className="grid grid-cols-2 gap-2 text-[11px]">
                                                        <div className="rounded-lg bg-black/20 px-2 py-1.5">文章步驟: {articleStatus.stepCount}</div>
                                                        <div className="rounded-lg bg-black/20 px-2 py-1.5">參考連結: {articleStatus.referenceCount}</div>
                                                    </div>
                                                    {articleStatus.title && (
                                                        <div className="rounded-lg bg-black/20 px-2 py-2 text-[11px]">
                                                            <div className="opacity-70 mb-1">標題</div>
                                                            <div className="font-medium text-xs">{articleStatus.title}</div>
                                                        </div>
                                                    )}
                                                    {articleStatus.summary && (
                                                        <div className="rounded-lg bg-black/20 px-2 py-2 text-[11px] leading-5">
                                                            <div className="opacity-70 mb-1">摘要預覽</div>
                                                            <div>{articleStatus.summary.slice(0, 160)}{articleStatus.summary.length > 160 ? '...' : ''}</div>
                                                        </div>
                                                    )}
                                                    {articleUpdatedLabel && (
                                                        <div className="text-[11px] opacity-70">最後更新: {articleUpdatedLabel}</div>
                                                    )}
                                                </>
                                            )}
                                        </div>
                                        <button onClick={generateAiVoice} className="w-full p-3 bg-gray-700 hover:bg-green-600 rounded-xl flex items-center space-x-3 transition shadow-sm">
                                            {aiLoading && activeAiTask === 'voice' ? <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-white"></div> : <Mic size={20} />}
                                            <span className="text-sm font-medium">AI 自動語音生成</span>
                                        </button>
                                        <div className={`rounded-xl border px-3 py-2 space-y-2 ${ttsStatusClasses}`}>
                                            <button
                                                type="button"
                                                onClick={() => setStatusPanels(prev => ({ ...prev, voice: !prev.voice }))}
                                                className="w-full flex items-center justify-between text-left"
                                            >
                                                <div>
                                                    <div className="text-sm font-semibold">TTS 生成結果</div>
                                                    <div className="text-[11px] opacity-80">{ttsStatus.message}</div>
                                                </div>
                                                <span className="text-[11px] opacity-80">{statusPanels.voice ? '收合' : '展開'}</span>
                                            </button>
                                            {statusPanels.voice && (
                                                <>
                                                    <div className="text-xs leading-5 opacity-90">{ttsStatus.detail}</div>
                                                    {renderTaskProgress(ttsStatus)}
                                                    <div className="grid grid-cols-2 gap-2 text-[11px]">
                                                        <div className="rounded-lg bg-black/20 px-2 py-1.5">成功段數: {ttsStatus.successCount}</div>
                                                        <div className="rounded-lg bg-black/20 px-2 py-1.5">總段數: {ttsStatus.totalCount}</div>
                                                    </div>
                                                    <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                                                        {ttsStatus.clips.length === 0 ? (
                                                            <div className="text-[11px] opacity-70">尚未有段落結果。</div>
                                                        ) : ttsStatus.clips.map((clip, idx) => (
                                                            <div key={`${clip.index}_${idx}`} className={`rounded-lg px-2 py-2 text-[11px] leading-5 ${clip.status === 'success' ? 'bg-black/20' : 'bg-red-950/40 border border-red-500/30'}`}>
                                                                <div className="font-medium">第 {clip.index} 段: {clip.status === 'success' ? '成功' : '異常'}</div>
                                                                <div className="opacity-90 truncate">{clip.text}</div>
                                                                <div className="opacity-70">長度: {clip.duration}s / 大小: {clip.sizeKb} KB</div>
                                                                {clip.error && <div className="text-red-200 opacity-90">錯誤: {clip.error}</div>}
                                                            </div>
                                                        ))}
                                                    </div>
                                                    {ttsUpdatedLabel && (
                                                        <div className="text-[11px] opacity-70">最後更新: {ttsUpdatedLabel}</div>
                                                    )}
                                                </>
                                            )}
                                        </div>
                                        <button onClick={generateVoiceoverSubtitles} className="w-full p-3 bg-gray-700 hover:bg-cyan-600 rounded-xl flex items-center space-x-3 transition shadow-sm">
                                            <Mic size={20} />
                                            <span className="text-sm font-medium">旁白轉字幕</span>
                                        </button>
                                        {activeSkill.checks?.length ? (
                                            <div className="rounded-xl border border-gray-700 bg-gray-900/70 p-4 text-xs leading-6 text-gray-300">
                                                <div className="font-semibold text-white mb-2">目前第一版會處理</div>
                                                {activeSkill.checks.map((item) => (
                                                    <div key={item}>- {item}</div>
                                                ))}
                                            </div>
                                        ) : null}
                                    </div>
                                </>
                            ) : activeSkill.editorMode === 'ux-research' ? (
                                <>
                                    <div className="rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-4 py-3 text-sm leading-6 text-cyan-50">
                                        這個 skill 會用專業 UX researcher 的角度，重建使用者 flow，分析停留、等待、閱讀、猶豫與可讀性問題，並把效能與介面理解成本分開判讀。
                                    </div>
                                    <div className="space-y-3">
                                        <div className="rounded-xl border border-gray-700 bg-gray-900/70 p-4 space-y-4">
                                            <label className="block text-xs text-gray-400">{activeSkill.promptLabel || '1. 本次 UX Flow'}</label>
                                            <div className="space-y-3">
                                                <div className="min-w-0">
                                                    <div className="text-xl font-semibold leading-tight text-white">{activeSkill.promptTitle || 'UX Flow 研究模式'}</div>
                                                    <div className="mt-1 text-[11px] text-gray-400">先選 preset，再填 flow 與研究目標。</div>
                                                </div>
                                                <label className="block min-w-0">
                                                    <div className="text-[11px] text-cyan-200 mb-1">Preset</div>
                                                    <select
                                                        value={selectedUxResearchPreset?.key || 'default'}
                                                        onChange={(e) => applyUxResearchPreset(e.target.value)}
                                                        className="w-full rounded-xl border border-cyan-500/40 bg-gray-950 px-3 py-2.5 text-sm text-white focus:outline-none focus:border-cyan-400"
                                                    >
                                                        {uxResearchPresetOptions.map((preset) => (
                                                            <option key={preset.key} value={preset.key}>{preset.label}</option>
                                                        ))}
                                                    </select>
                                                    <div className="mt-1 text-[10px] leading-4 text-gray-400">
                                                        {selectedUxResearchPreset?.description || '選擇適合這次流程的研究 preset。'}
                                                    </div>
                                                </label>
                                            </div>
                                            <label className="block">
                                                <div className="text-[11px] text-gray-400 mb-1">UX flow 名稱</div>
                                                <input
                                                    type="text"
                                                    value={projectState.uxResearchFlowName || ''}
                                                    onChange={(e) => setProjectState(prev => ({ ...prev, uxResearchFlowName: e.target.value }))}
                                                    placeholder={uxResearchFieldExamples.flowName || activeSkill.promptPlaceholder}
                                                    className="w-full bg-gray-950 border border-gray-700 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-cyan-500"
                                                />
                                            </label>
                                            <label className="block">
                                                <div className="text-[11px] text-gray-400 mb-1">研究目標</div>
                                                <textarea
                                                    value={projectState.uxResearchGoal || ''}
                                                    onChange={(e) => setProjectState(prev => ({ ...prev, uxResearchGoal: e.target.value }))}
                                                    placeholder={uxResearchFieldExamples.goal || '例如：找出使用者在這段流程裡停留、猶豫或流失的主要原因。'}
                                                    className="w-full bg-gray-950 border border-gray-700 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-cyan-500 resize-none h-20"
                                                />
                                            </label>
                                            <div className="grid grid-cols-2 gap-3">
                                                <label className="block">
                                                    <div className="text-[11px] text-gray-400 mb-1">目標使用者</div>
                                                    <input
                                                        type="text"
                                                        value={projectState.uxResearchAudience || ''}
                                                        onChange={(e) => setProjectState(prev => ({ ...prev, uxResearchAudience: e.target.value }))}
                                                        placeholder={uxResearchFieldExamples.audience || '例如：第一次接觸這段流程的使用者'}
                                                        className="w-full bg-gray-950 border border-gray-700 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-cyan-500"
                                                    />
                                                </label>
                                                <label className="block">
                                                    <div className="text-[11px] text-gray-400 mb-1">成功任務定義</div>
                                                    <input
                                                        type="text"
                                                        value={projectState.uxResearchSuccessSignal || ''}
                                                        onChange={(e) => setProjectState(prev => ({ ...prev, uxResearchSuccessSignal: e.target.value }))}
                                                        placeholder={uxResearchFieldExamples.successSignal || '例如：順利完成主要任務並抵達下一步'}
                                                        className="w-full bg-gray-950 border border-gray-700 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-cyan-500"
                                                    />
                                                </label>
                                            </div>
                                            <label className="block">
                                                <div className="text-[11px] text-gray-400 mb-1">特別想觀察的頁面 / 風險</div>
                                                <textarea
                                                    value={projectState.uxResearchFocusAreas || ''}
                                                    onChange={(e) => setProjectState(prev => ({ ...prev, uxResearchFocusAreas: e.target.value }))}
                                                    placeholder={uxResearchFieldExamples.focusAreas || '例如：關鍵 CTA、提示訊息、欄位驗證、價格區塊或導航切換。'}
                                                    className="w-full bg-gray-950 border border-gray-700 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-cyan-500 resize-none h-20"
                                                />
                                            </label>
                                        </div>
                                        <button
                                            onClick={generateUxResearchReport}
                                            className="w-full rounded-2xl border border-cyan-300/20 bg-gradient-to-r from-cyan-500 to-sky-500 px-5 py-4 text-left text-white shadow-[0_18px_40px_rgba(6,182,212,0.18)] transition hover:from-cyan-400 hover:to-sky-400"
                                        >
                                            <div className="flex items-center gap-3">
                                                {aiLoading && activeAiTask === 'ux-research'
                                                    ? <div className="h-5 w-5 animate-spin rounded-full border-t-2 border-white"></div>
                                                    : <Eye size={20} />}
                                                <div>
                                                    <div className="text-lg font-semibold">{activeSkill.primaryActionLabel || '開始 UX 研究分析'}</div>
                                                    <div className="mt-1 text-xs text-cyan-50/90">整理 click timeline、停留、等待與摩擦假設，直接產出 UX 研究報告。</div>
                                                </div>
                                            </div>
                                        </button>
                                        <div className="rounded-xl border border-gray-700 bg-gray-900/70 p-4 space-y-3">
                                            <label className="flex items-center justify-between gap-4 rounded-lg border border-gray-700 bg-black/20 px-3 py-2 cursor-pointer">
                                                <div className="pr-3">
                                                    <div className="text-sm text-white">錄影時自動開 Webcam</div>
                                                    <div className="text-[11px] text-gray-400 mt-1">在 UX研究模式開始錄影時，自動請求 webcam 權限，但不會再把鏡頭疊進錄影影片，避免影響預覽與截圖穩定性。</div>
                                                </div>
                                                <input
                                                    type="checkbox"
                                                    checked={projectState.uxResearchAutoWebcam !== false}
                                                    onChange={(e) => setProjectState(prev => ({ ...prev, uxResearchAutoWebcam: e.target.checked }))}
                                                    className="h-4 w-4 rounded accent-cyan-500"
                                                />
                                            </label>
                                            <label className="flex items-center justify-between gap-4 rounded-lg border border-gray-700 bg-black/20 px-3 py-2 cursor-pointer">
                                                <div className="pr-3">
                                                    <div className="text-sm text-white">納入鏡頭 / 眼動交叉分析</div>
                                                    <div className="text-[11px] text-gray-400 mt-1">
                                                        {selectedUxResearchPreset?.cameraNotesTemplate || '若同步錄到臉部或眼睛畫面，AI 會把它視為輔助證據來源，但不會過度武斷。'}
                                                    </div>
                                                </div>
                                                <input
                                                    type="checkbox"
                                                    checked={projectState.uxResearchIncludeEyeTracking === true}
                                                    onChange={(e) => setProjectState(prev => ({ ...prev, uxResearchIncludeEyeTracking: e.target.checked }))}
                                                    className="h-4 w-4 rounded accent-cyan-500"
                                                />
                                            </label>
                                            <label className="block">
                                                <div className="text-[11px] text-gray-400 mb-1">鏡頭 / 眼動補充說明</div>
                                                <textarea
                                                    value={projectState.uxResearchCameraNotes || ''}
                                                    onChange={(e) => setProjectState(prev => ({ ...prev, uxResearchCameraNotes: e.target.value }))}
                                                    placeholder={selectedUxResearchPreset?.cameraNotesTemplate || '例如：右上角畫中畫有錄到使用者眼睛與臉部，想觀察他是否在比對價格、找 CTA、或看不懂規格說明。'}
                                                    className="w-full bg-gray-950 border border-gray-700 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-cyan-500 resize-none h-20"
                                                />
                                                <div className="mt-2 text-[10px] leading-4 text-gray-500">
                                                    套用 preset 時會同步帶入建議觀察重點，你也可以再依這次測試情境微調。
                                                </div>
                                            </label>
                                        </div>
                                        <div className={`rounded-xl border px-3 py-2 space-y-2 ${uxResearchStatusClasses}`}>
                                            <button
                                                type="button"
                                                onClick={() => setStatusPanels(prev => ({ ...prev, uxResearch: !prev.uxResearch }))}
                                                className="w-full flex items-center justify-between text-left"
                                            >
                                                <div>
                                                    <div className="text-sm font-semibold">UX研究狀態</div>
                                                    <div className="text-[11px] opacity-80">{uxResearchStatus.message}</div>
                                                </div>
                                                <span className="text-[11px] opacity-80">{statusPanels.uxResearch ? '收合' : '展開'}</span>
                                            </button>
                                            {statusPanels.uxResearch && (
                                                <>
                                                    <div className="text-xs leading-5 opacity-90">{uxResearchStatus.detail}</div>
                                                    {renderTaskProgress(uxResearchStatus)}
                                                    <div className="grid grid-cols-2 gap-2 text-[11px]">
                                                        <div className="rounded-lg bg-black/20 px-2 py-1.5">摩擦候選: {uxResearchStatus.frictionCount}</div>
                                                        <div className="rounded-lg bg-black/20 px-2 py-1.5">長停留: {uxResearchStatus.longDwellCount}</div>
                                                        <div className="rounded-lg bg-black/20 px-2 py-1.5">可讀性風險: {uxResearchStatus.readabilityIssueCount}</div>
                                                        <div className="rounded-lg bg-black/20 px-2 py-1.5">猶豫候選: {uxResearchStatus.hesitationCount}</div>
                                                    </div>
                                                    {uxResearchUpdatedLabel && (
                                                        <div className="text-[11px] opacity-70">最後更新: {uxResearchUpdatedLabel}</div>
                                                    )}
                                                </>
                                            )}
                                        </div>
                                        <div className="rounded-xl border border-gray-700 bg-gray-900/70 p-4 text-xs leading-6 text-gray-300">
                                            <div className="font-semibold text-white mb-2">目前第一版會分析</div>
                                            {activeSkill.checks?.map((item) => (
                                                <div key={item}>- {item}</div>
                                            ))}
                                        </div>
                                        {(projectState.uxResearchReport || projectState.uxResearchMD) && (
                                            <div className="rounded-xl border border-gray-700 bg-gray-900/70 p-4 space-y-4">
                                                <div>
                                                    <div className="text-sm font-semibold text-white">研究摘要</div>
                                                    <div className="text-[11px] text-gray-400 mt-1">
                                                        {projectState.uxResearchReport?.flowName || '未填寫 flow 名稱'}
                                                    </div>
                                                </div>
                                                <div className="grid grid-cols-2 gap-2 text-[11px] text-gray-200">
                                                <div className="rounded-lg bg-black/20 px-2 py-2">高摩擦候選: {projectState.uxResearchReport?.frictionCount || 0}</div>
                                                <div className="rounded-lg bg-black/20 px-2 py-2">已抓截圖: {(projectState.uxResearchFrames || []).length}</div>
                                                <div className="rounded-lg bg-black/20 px-2 py-2">可讀性風險: {projectState.uxResearchReport?.readabilityIssueCount || 0}</div>
                                                <div className="rounded-lg bg-black/20 px-2 py-2">眼動交叉分析: {projectState.uxResearchReport?.includeEyeTracking ? '有，需自行錄入鏡頭' : '無'}</div>
                                            </div>
                                                <div className="space-y-2">
                                                    <div className="text-xs font-semibold text-white">Top Findings</div>
                                                    {uxResearchTopFindings.length === 0 ? (
                                                        <div className="text-[11px] text-gray-400">尚未有 UX friction 分析結果。</div>
                                                    ) : uxResearchTopFindings.map((item, idx) => (
                                                        <div key={`${item.clickId || idx}_${idx}`} className="rounded-lg border border-gray-700 bg-black/20 px-3 py-2 text-[11px] leading-5">
                                                            <div className="font-medium text-white">{item.targetText || `Finding ${idx + 1}`}</div>
                                                            <div className="text-gray-300">{item.clickTime?.toFixed?.(2) || '0.00'}s / 停留 {item.observationDurationMs || 0}ms</div>
                                                            <div className="text-cyan-100 mt-1">{item.causeLabel}</div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                        <div className="rounded-xl border border-gray-700 bg-gray-900/70 p-4 space-y-4">
                                            <button
                                                type="button"
                                                onClick={() => setStatusPanels(prev => ({ ...prev, thresholds: !prev.thresholds }))}
                                                className="w-full flex items-center justify-between text-left"
                                            >
                                                <div>
                                                    <div className="text-sm font-semibold text-white">UX Thresholds</div>
                                                    <div className="text-[11px] text-gray-400 mt-1">依任務複雜度調整猶豫、長停留、hover 試探與等待門檻。</div>
                                                </div>
                                                <span className="text-[11px] text-gray-300">{statusPanels.thresholds ? '收合' : '展開'}</span>
                                            </button>
                                            {statusPanels.thresholds && (
                                                <>
                                                    <div className="flex justify-end">
                                                        <button
                                                            type="button"
                                                            onClick={() => setProjectState(prev => ({ ...prev, uxResearchThresholds: { ...uxResearchSkill.defaultThresholds } }))}
                                                            className="text-[11px] rounded border border-gray-600 px-2 py-1 text-gray-300 hover:text-white hover:border-gray-400"
                                                        >
                                                            重設預設
                                                        </button>
                                                    </div>
                                                    <div className="grid grid-cols-2 gap-3">
                                                        {[
                                                            { key: 'hesitationMs', label: '猶豫停留 ms', min: 500, max: 10000, step: 100 },
                                                            { key: 'longDwellMs', label: '長停留 ms', min: 1000, max: 15000, step: 100 },
                                                            { key: 'readingOrComparisonMs', label: '閱讀 / 比較 ms', min: 1000, max: 15000, step: 100 },
                                                            { key: 'hoverCount', label: 'Hover 次數', min: 1, max: 10, step: 1 },
                                                            { key: 'hoverDurationMs', label: 'Hover 累積 ms', min: 200, max: 10000, step: 100 },
                                                            { key: 'slowNetworkMs', label: '慢請求 ms', min: 100, max: 5000, step: 50 },
                                                            { key: 'verySlowNetworkMs', label: '極慢請求 ms', min: 300, max: 8000, step: 100 },
                                                            { key: 'longTaskMs', label: 'Long task ms', min: 50, max: 3000, step: 50 },
                                                            { key: 'domMutationBurst', label: 'DOM burst', min: 5, max: 200, step: 5 }
                                                        ].map((field) => (
                                                            <label key={field.key} className="block">
                                                                <div className="text-[11px] text-gray-400 mb-1">{field.label}</div>
                                                                <input
                                                                    type="number"
                                                                    min={field.min}
                                                                    max={field.max}
                                                                    step={field.step}
                                                                    value={uxResearchThresholds[field.key]}
                                                                    onChange={(e) => {
                                                                        const raw = e.target.value;
                                                                        const value = field.step < 1 ? parseFloat(raw) : parseInt(raw, 10);
                                                                        if (!Number.isFinite(value)) return;
                                                                        setProjectState(prev => ({
                                                                            ...prev,
                                                                            uxResearchThresholds: {
                                                                                ...uxResearchThresholds,
                                                                                [field.key]: value
                                                                            }
                                                                        }));
                                                                    }}
                                                                    className="w-full bg-gray-950 border border-gray-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500"
                                                                />
                                                            </label>
                                                        ))}
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                </>
                            ) : (
                                <>
                                    <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm leading-6 text-amber-50">
                                        這個 skill 會保留錄影與剪輯能力，但把分析目標改成工程偵錯。它會用資深 UI 工程師的角度交叉檢查例外、警告、請求、主執行緒阻塞與可疑互動，再產出 Markdown 報告。
                                    </div>
                                    <div className="space-y-3">
                                    <div>
                                        <label className="block text-xs text-gray-400 mb-2">Debug Brief</label>
                                        <textarea
                                            value={projectState.tutorialDescription || ''}
                                            onChange={(e) => setProjectState(prev => ({ ...prev, tutorialDescription: e.target.value }))}
                                                placeholder="可補充這次想關注的頁面、可疑 API、容易卡住的路徑，之後會納入報告上下文。"
                                                className="w-full bg-gray-900 text-sm p-3 rounded focus:outline-none focus:border-amber-500 border border-gray-700 resize-none h-24 text-white"
                                            />
                                        </div>
                                        <div className="rounded-xl border border-gray-700 bg-gray-900/70 p-4 space-y-3">
                                            <div>
                                                <div className="text-sm font-semibold text-white">診斷模組</div>
                                                <div className="text-[11px] text-gray-400 mt-1">只會產出你勾選的報告 section，避免 UI / 安全 / 翻譯混在一起。</div>
                                            </div>
                                            <label className="flex items-center justify-between gap-4 rounded-lg border border-gray-700 bg-black/20 px-3 py-2 cursor-pointer">
                                                <div className="pr-3">
                                                    <div className="text-sm text-white">AI Summary</div>
                                                    <div className="text-[11px] text-gray-400 mt-1">開啟後會在規則式診斷完成後，再用你設定的模型生成高階摘要與建議。</div>
                                                </div>
                                                <input
                                                    type="checkbox"
                                                    checked={projectState.uiDebugUseAiSummary !== false}
                                                    onChange={(e) => {
                                                        const checked = e.target.checked;
                                                        setProjectState(prev => ({
                                                            ...prev,
                                                            uiDebugUseAiSummary: checked
                                                        }));
                                                    }}
                                                    className="h-4 w-4 rounded accent-amber-500"
                                                />
                                            </label>
                                            <div className="space-y-2">
                                                {uiDebugSkill.checkOptions.map((option) => (
                                                    <label key={option.key} className="flex items-start gap-3 rounded-lg border border-gray-700 bg-black/20 px-3 py-2 cursor-pointer">
                                                        <input
                                                            type="checkbox"
                                                            checked={!!uiDebugCheckSelection[option.key]}
                                                            onChange={(e) => {
                                                                const checked = e.target.checked;
                                                                setProjectState(prev => ({
                                                                    ...prev,
                                                                    uiDebugChecks: {
                                                                        ...DEFAULT_UI_DEBUG_CHECKS,
                                                                        ...(prev.uiDebugChecks || {}),
                                                                        [option.key]: checked
                                                                    }
                                                                }));
                                                            }}
                                                            className="mt-0.5 h-4 w-4 rounded accent-amber-500"
                                                        />
                                                        <div className="flex-1">
                                                            <div className="flex items-center justify-between gap-3">
                                                                <div className="text-sm text-white">{option.label}</div>
                                                                {option.key === 'translation' && (
                                                                    <select
                                                                        value={projectState.uiDebugTranslationLanguage || 'en'}
                                                                        onChange={(e) => {
                                                                            const value = e.target.value;
                                                                            setProjectState(prev => ({
                                                                                ...prev,
                                                                                uiDebugTranslationLanguage: value
                                                                            }));
                                                                        }}
                                                                        onClick={(e) => e.stopPropagation()}
                                                                        className="rounded-md border border-gray-600 bg-gray-950 px-2 py-1 text-[11px] text-gray-200 focus:outline-none focus:border-amber-500"
                                                                    >
                                                                        {UI_DEBUG_TRANSLATION_OPTIONS.map((language) => (
                                                                            <option key={language.code} value={language.code}>{language.label}</option>
                                                                        ))}
                                                                    </select>
                                                                )}
                                                            </div>
                                                            <div className="text-[11px] text-gray-400 mt-1">{option.description}</div>
                                                        </div>
                                                    </label>
                                                ))}
                                            </div>
                                        </div>
                                        <div className="rounded-xl border border-gray-700 bg-gray-900/70 p-4 space-y-4">
                                            <button
                                                type="button"
                                                onClick={() => setStatusPanels(prev => ({ ...prev, thresholds: !prev.thresholds }))}
                                                className="w-full flex items-center justify-between text-left"
                                            >
                                                <div>
                                                    <div className="text-sm font-semibold text-white">Thresholds</div>
                                                    <div className="text-[11px] text-gray-400 mt-1">先用預設值，工程師可依產品特性微調。</div>
                                                </div>
                                                <span className="text-[11px] text-gray-300">{statusPanels.thresholds ? '收合' : '展開'}</span>
                                            </button>
                                            {statusPanels.thresholds && (
                                                <>
                                                    <div className="flex justify-end">
                                                        <button
                                                            type="button"
                                                            onClick={() => setProjectState(prev => ({ ...prev, uiDebugThresholds: { ...uiDebugSkill.defaultThresholds } }))}
                                                            className="text-[11px] rounded border border-gray-600 px-2 py-1 text-gray-300 hover:text-white hover:border-gray-400"
                                                        >
                                                            重設預設
                                                        </button>
                                                    </div>
                                                    <div className="grid grid-cols-2 gap-3">
                                                        {[
                                                            { key: 'slowTransitionMs', label: '慢切換 ms', min: 100, max: 5000, step: 50 },
                                                            { key: 'verySlowTransitionMs', label: '極慢切換 ms', min: 300, max: 8000, step: 100 },
                                                            { key: 'slowNetworkMs', label: '慢請求 ms', min: 100, max: 5000, step: 50 },
                                                            { key: 'verySlowNetworkMs', label: '極慢請求 ms', min: 300, max: 8000, step: 100 },
                                                            { key: 'longTaskMs', label: 'Long task ms', min: 50, max: 2000, step: 50 },
                                                            { key: 'warningCount', label: 'Warning 門檻', min: 1, max: 10, step: 1 },
                                                            { key: 'domMutationBurst', label: 'DOM burst', min: 5, max: 200, step: 5 },
                                                            { key: 'domEventBurst', label: 'DOM 事件數', min: 1, max: 20, step: 1 },
                                                            { key: 'visualBrightnessDelta', label: '亮度跳變', min: 0.05, max: 1, step: 0.01 },
                                                            { key: 'visualSaturationDelta', label: '飽和度跳變', min: 0.05, max: 1, step: 0.01 },
                                                            { key: 'visualColorShift', label: '色調偏移', min: 0.05, max: 1, step: 0.01 },
                                                            { key: 'layoutOverflowRatio', label: 'Overflow Ratio', min: 1, max: 2, step: 0.01 },
                                                            { key: 'offscreenElementCount', label: 'Offscreen 元素', min: 1, max: 20, step: 1 }
                                                        ].map((field) => (
                                                            <label key={field.key} className="block">
                                                                <div className="text-[11px] text-gray-400 mb-1">{field.label}</div>
                                                                <input
                                                                    type="number"
                                                                    min={field.min}
                                                                    max={field.max}
                                                                    step={field.step}
                                                                    value={uiDebugThresholds[field.key]}
                                                                    onChange={(e) => {
                                                                        const raw = e.target.value;
                                                                        const value = field.step < 1 ? parseFloat(raw) : parseInt(raw, 10);
                                                                        if (!Number.isFinite(value)) return;
                                                                        setProjectState(prev => ({
                                                                            ...prev,
                                                                            uiDebugThresholds: {
                                                                                ...uiDebugThresholds,
                                                                                [field.key]: value
                                                                            }
                                                                        }));
                                                                    }}
                                                                    className="w-full bg-gray-950 border border-gray-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
                                                                />
                                                            </label>
                                                        ))}
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                        <button onClick={generateUiDebugReport} className="w-full p-3 bg-gray-700 hover:bg-amber-600 rounded-xl flex items-center space-x-3 transition shadow-sm">
                                            {aiLoading && activeAiTask === 'ui-debug' ? <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-white"></div> : <Bug size={20} />}
                                            <span className="text-sm font-medium">{activeSkill.primaryActionLabel || '開始全面診斷'}</span>
                                        </button>
                                        <div className={`rounded-xl border px-3 py-2 space-y-2 ${uiDebugStatusClasses}`}>
                                            <button
                                                type="button"
                                                onClick={() => setStatusPanels(prev => ({ ...prev, debug: !prev.debug }))}
                                                className="w-full flex items-center justify-between text-left"
                                            >
                                                <div>
                                                    <div className="text-sm font-semibold">診斷狀態</div>
                                                    <div className="text-[11px] opacity-80">{uiDebugStatus.message}</div>
                                                </div>
                                                <span className="text-[11px] opacity-80">{statusPanels.debug ? '收合' : '展開'}</span>
                                            </button>
                                            {statusPanels.debug && (
                                                <>
                                                    <div className="text-xs leading-5 opacity-90">{uiDebugStatus.detail}</div>
                                                    {renderTaskProgress(uiDebugStatus)}
                                                    <div className="grid grid-cols-2 gap-2 text-[11px]">
                                                        <div className="rounded-lg bg-black/20 px-2 py-1.5">診斷發現: {uiDebugStatus.issueCount}</div>
                                                        <div className="rounded-lg bg-black/20 px-2 py-1.5">已標記互動: {uiDebugStatus.slowInteractionCount}</div>
                                                        <div className="rounded-lg bg-black/20 px-2 py-1.5">Page error: {uiDebugStatus.consoleErrorCount}</div>
                                                        <div className="rounded-lg bg-black/20 px-2 py-1.5">Tool error: {uiDebugStatus.uiErrorCount}</div>
                                                        <div className="rounded-lg bg-black/20 px-2 py-1.5 col-span-2">慢速 network: {uiDebugStatus.networkSlowCount}</div>
                                                    </div>
                                                    {uiDebugUpdatedLabel && (
                                                        <div className="text-[11px] opacity-70">最後更新: {uiDebugUpdatedLabel}</div>
                                                    )}
                                                </>
                                            )}
                                        </div>
                                        <div className="rounded-xl border border-gray-700 bg-gray-900/70 p-4 text-xs leading-6 text-gray-300">
                                            <div className="font-semibold text-white mb-2">目前第一版會檢查</div>
                                            {activeSkill.checks?.map((item) => (
                                                <div key={item}>- {item}</div>
                                            ))}
                                        </div>
                                        {(projectState.uiDebugReport || projectState.uiDebugMD) && (
                                            <div className="rounded-xl border border-gray-700 bg-gray-900/70 p-4 space-y-4">
                                                <div>
                                                    <div className="text-sm font-semibold text-white">報告摘要</div>
                                                    <div className="text-[11px] text-gray-400 mt-1">
                                                        {projectState.uiDebugReport?.debugBrief
                                                            ? `Brief: ${projectState.uiDebugReport.debugBrief.slice(0, 120)}${projectState.uiDebugReport.debugBrief.length > 120 ? '...' : ''}`
                                                            : '未填寫 Debug Brief'}
                                                    </div>
                                                </div>
                                                <div className="grid grid-cols-2 gap-2 text-[11px] text-gray-200">
                                                    <div className="rounded-lg bg-black/20 px-2 py-2">總點擊: {projectState.uiDebugReport?.clickCount || 0}</div>
                                                    <div className="rounded-lg bg-black/20 px-2 py-2">已抓截圖: {(projectState.uiDebugFrames || []).length}</div>
                                                </div>
                                                <div className="space-y-2">
                                                    <div className="text-xs font-semibold text-white">Priority Interactions</div>
                                                    {uiDebugTopInteractions.length === 0 ? (
                                                        <div className="text-[11px] text-gray-400">尚未有 interaction 分析結果。</div>
                                                    ) : uiDebugTopInteractions.map((item, idx) => (
                                                        <div key={`${item.clickId}_${idx}`} className="rounded-lg border border-gray-700 bg-black/20 px-3 py-2 text-[11px] leading-5">
                                                            <div className="font-medium text-white">
                                                                {item.targetText || `Interaction ${idx + 1}`}
                                                            </div>
                                                            <div className="text-gray-300">
                                                                {item.clickTime?.toFixed?.(2) || '0.00'}s {'->'} {item.settledTime?.toFixed?.(2) || '0.00'}s / {item.transitionDurationMs || 0}ms
                                                            </div>
                                                            <div className={`mt-1 inline-flex rounded-full px-2 py-0.5 ${item.severity === 'high' ? 'bg-red-500/20 text-red-200' : item.severity === 'medium' ? 'bg-amber-500/20 text-amber-100' : 'bg-sky-500/20 text-sky-100'}`}>
                                                                {item.severity || 'low'}
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                                {Object.entries(uiDebugRecommendationGroups).some(([, items]) => Array.isArray(items) && items.length > 0) && (
                                                    <div className="space-y-3">
                                                        <div className="text-xs font-semibold text-white">Module Recommendations</div>
                                                        {Object.entries(uiDebugRecommendationGroups).map(([moduleKey, items]) => {
                                                            if (!Array.isArray(items) || items.length === 0) return null;
                                                            const moduleLabel = uiDebugSkill.checkOptions.find(option => option.key === moduleKey)?.label || moduleKey;
                                                            return (
                                                                <div key={moduleKey} className="space-y-2">
                                                                    <div className="text-[11px] text-gray-400">{moduleLabel}</div>
                                                                    {items.map((item, idx) => (
                                                                        <div key={`${moduleKey}_${idx}_${item}`} className="rounded-lg border border-gray-700 bg-black/20 px-3 py-2 text-[11px] leading-5 text-gray-300">
                                                                            {item}
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                )}
                                                <div className="space-y-2">
                                                    <div className="text-xs font-semibold text-white">診斷發現</div>
                                                    {uiDebugIssues.length === 0 ? (
                                                        <div className="text-[11px] text-gray-400">目前沒有超過門檻的診斷問題。</div>
                                                    ) : uiDebugIssues.slice(0, 5).map((item, idx) => (
                                                        <div key={`${item.clickId || idx}_issue`} className="rounded-lg border border-gray-700 bg-black/20 px-3 py-2 text-[11px] leading-5">
                                                            <div className="font-medium text-white">
                                                                {`E${item.eventIndex || idx + 1}`} {item.targetText || `Issue ${idx + 1}`}
                                                            </div>
                                                            <div className="text-gray-300">{item.suspectedCause}</div>
                                                            {Array.isArray(item.evidence) && item.evidence.length > 0 && (
                                                                <div className="text-gray-400 mt-1">{item.evidence.join(' / ')}</div>
                                                            )}
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                )}

                <div
                    className={`group relative w-2 shrink-0 cursor-col-resize border-r border-gray-700/80 bg-gray-800/70 transition hover:bg-blue-500/30 ${isResizingLeftPanel ? 'bg-blue-500/40' : ''}`}
                    onMouseDown={() => setIsResizingLeftPanel(true)}
                    title="拖拉調整左側面板寬度"
                >
                    <div className="pointer-events-none absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-gray-500/80 group-hover:bg-blue-300" />
                </div>

                <div className="flex-1 bg-[#12141A] flex flex-col items-center justify-center relative p-8">

                    {aiLoading && aiProgress && (
                        <div className={`fixed top-24 left-1/2 -translate-x-1/2 z-[2500] min-w-[320px] max-w-[520px] text-white px-5 py-3 rounded-2xl shadow-2xl text-sm space-y-2 border pointer-events-auto ${activeTaskAccent.panel}`}>
                            <div className="flex items-start justify-between gap-3">
                                <div className="flex items-center gap-3 min-w-0">
                                    <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-white shrink-0"></div>
                                    <span className="font-medium">{activeProgressLabel || aiProgress}</span>
                                </div>
                                <button
                                    type="button"
                                    onClick={cancelAiTask}
                                    className="shrink-0 rounded-lg border border-white/20 bg-black/20 px-3 py-1 text-[11px] font-semibold text-white hover:bg-black/35 transition"
                                >
                                    取消
                                </button>
                            </div>
                            {activeProgressStatus?.aiLabel && (
                                <div className={`text-[11px] ${activeTaskAccent.chip}`}>
                                    正在與 AI 協作: {activeProgressStatus.aiLabel}
                                </div>
                            )}
                            {hasStructuredProgress && (
                                <>
                                    <div className="h-2 rounded-full bg-white/15 overflow-hidden">
                                        <div
                                            className={`h-full rounded-full transition-all duration-500 ${activeTaskAccent.bar}`}
                                            style={{ width: `${activeProgressPercent}%` }}
                                        />
                                    </div>
                                    <div className="flex items-center justify-between text-[11px] text-slate-200/80">
                                        <span>{activeProgressStatus?.stageLabel || '處理中'}</span>
                                        <span>{activeProgressPercent}%</span>
                                    </div>
                                </>
                            )}
                        </div>
                    )}

                    <div
                        ref={previewContainerRef}
                        className="w-full max-w-4xl aspect-video bg-black rounded-lg shadow-2xl overflow-hidden relative border border-gray-800"
                    >
                        {isRecording && (
                            <div className="absolute inset-0 z-[1400] bg-black">
                                <canvas
                                    ref={recordingPreviewCanvasRef}
                                    width={1920}
                                    height={1080}
                                    className="h-full w-full object-contain"
                                />
                                <div className="absolute left-4 top-4 rounded-full border border-red-400/40 bg-red-500/15 px-3 py-1 text-xs font-semibold tracking-[0.18em] text-red-100">
                                    REC LIVE
                                </div>
                            </div>
                        )}

                        {projectState.tracks.flatMap((track, trackIndex) =>
                            track.map(rawClip => {
                                const clip = normalizeClipItem(rawClip);
                                const isActive = currentTime >= clip.startAt && currentTime < (clip.startAt + clip.duration);
                                const isHidden = trackState.videoHidden[trackIndex];
                                const isSelected = selectedIds.includes(clip.id);
                                const activeTransitionForClip = findActiveTransition(
                                    projectState.videoTransitions?.[trackIndex],
                                    currentTime,
                                    clip.startAt,
                                    clip.startAt + clip.duration
                                );

                                const layout = clip.layout || { x: 0, y: 0, w: 100, h: 100 };

                                return (
                                    <div
                                        key={clip.id}
                                        className="absolute canvas-interactive"
                                        style={{
                                            display: !isRecording && isActive && !isHidden ? 'block' : 'none',
                                            left: `${layout.x}%`, top: `${layout.y}%`,
                                            width: `${layout.w}%`, height: `${layout.h}%`,
                                            zIndex: trackIndex === 0 ? 10 : (trackIndex === 1 ? 100 : 1000),
                                            ...buildTransitionPreviewStyle(activeTransitionForClip, currentTime)
                                        }}


                                        onMouseDown={(e) => handleCanvasMouseDown(e, clip, trackIndex, 'move')}
                                    >
                                        <div className="w-full h-full overflow-hidden flex items-center justify-center">
                                            {clip.type === 'video' ? (
                                                <video
                                                    ref={el => videoRefs.current[clip.id] = el}
                                                    src={clip.src}
                                                    playsInline
                                                    muted={true}
                                                    className="w-full h-full object-contain pointer-events-none"
                                                    style={buildKenBurnsPreviewMediaStyle(clip, currentTime)}
                                                />
                                            ) : (
                                                <img
                                                    ref={el => imageRefs.current[clip.id] = el}
                                                    src={clip.src}
                                                    className="w-full h-full object-contain pointer-events-none"
                                                    style={buildKenBurnsPreviewMediaStyle(clip, currentTime)}
                                                    alt={clip.name}
                                                />
                                            )}
                                        </div>


                                        {isSelected && (
                                            <div className="absolute inset-0 border-2 border-orange-500 z-50 shadow-[0_0_8px_rgba(249,115,22,0.8)]">
                                                <div className="absolute -top-1.5 -left-1.5 w-3 h-3 bg-orange-500 rounded-full cursor-nwse-resize" onMouseDown={(e) => handleCanvasMouseDown(e, clip, trackIndex, 'resize-tl')} />
                                                <div className="absolute -top-1.5 -right-1.5 w-3 h-3 bg-orange-500 rounded-full cursor-nesw-resize" onMouseDown={(e) => handleCanvasMouseDown(e, clip, trackIndex, 'resize-tr')} />
                                                <div className="absolute -bottom-1.5 -left-1.5 w-3 h-3 bg-orange-500 rounded-full cursor-nesw-resize" onMouseDown={(e) => handleCanvasMouseDown(e, clip, trackIndex, 'resize-bl')} />
                                                <div className="absolute -bottom-1.5 -right-1.5 w-3 h-3 bg-orange-500 rounded-full cursor-nwse-resize" onMouseDown={(e) => handleCanvasMouseDown(e, clip, trackIndex, 'resize-br')} />
                                            </div>
                                        )}
                                    </div>
                                );
                            })
                        )}

                        {projectState.tracks.flat().length === 0 && (
                            <div className="absolute inset-0 text-gray-600 flex flex-col items-center justify-center z-0">
                                <MonitorPlay size={48} className="mb-4 opacity-20" />
                                <p>點擊右上角「開始錄影」擷取操作畫面</p>
                            </div>
                        )}

                        <div className="absolute inset-0 z-[1600]">
                            {projectState.subtitles.map(rawSub => {
                                const sub = normalizeSubtitle(rawSub);
                                if (trackState.subtitleHidden[sub.trackIndex]) return null;
                                const isSelected = selectedIds.includes(sub.id);
                                const activeTransitionForSub = findActiveTransition(
                                    (projectState.subtitleTransitions || []).filter(item => (Number.isInteger(item?.trackIndex) ? item.trackIndex : 1) === sub.trackIndex),
                                    currentTime,
                                    sub.startAt,
                                    sub.endAt
                                );
                                if (!isRecording && currentTime >= sub.startAt && currentTime <= sub.endAt) {
                                    const subtitleStyle = {
                                        left: `${sub.x}%`,
                                        top: `${sub.y}%`,
                                        fontSize: `${sub.fontSize}px`,
                                        fontFamily: sub.fontFamily,
                                        color: sub.textColor,
                                        backgroundColor: hexToRgba(sub.backgroundColor, sub.backgroundOpacity),
                                        ...buildTransitionPreviewStyle(activeTransitionForSub, currentTime, 'translate(-50%, -50%)')
                                    };
                                    return (
                                        <div
                                            key={sub.id}
                                            className="absolute max-w-[80%] cursor-move pointer-events-auto"
                                            style={subtitleStyle}
                                            onMouseDown={(e) => handleSubtitleCanvasMouseDown(e, sub)}
                                        >
                                            <div
                                                className={`px-4 py-2 rounded text-center font-bold tracking-wide drop-shadow-[0_4px_4px_rgba(0,0,0,0.8)] border whitespace-pre-wrap ${isSelected ? 'border-orange-400 shadow-[0_0_0_2px_rgba(251,146,60,0.85)]' : 'border-white/20'}`}
                                            >
                                                {sub.text}
                                            </div>
                                        </div>
                                    );
                                }
                                return null;
                            })}
                        </div>

                        {!isRecording && motionDesignLayers.map((layer) => {
                            const easedProgress = 1 - Math.pow(1 - Math.min(1, layer.progress || 0), 3);
                            const layerPreset = getMotionDesignPreset(layer.presetId || motionDesign.presetId);
                            const layerCreator = layer.creator || motionDesignCopy.creator;
                            if (layer.kind === 'hyperframe-asset') {
                                const asset = HYPERFRAME_ASSETS.find(item => item.id === layer.assetId);
                                if (!asset) return null;
                                return (
                                    <div key={`motion_${layer.kind}_${layer.id}`} className="absolute inset-0 z-[1725] flex items-center justify-center px-[12%] py-[8%]" style={{ opacity: easedProgress * (1 - (layer.exitProgress || 0)), transform: `translateY(${(1 - easedProgress + (layer.exitProgress || 0)) * 32}px)` }}>
                                        <HyperframeAssetPreview asset={asset} className="h-full w-full max-h-[66%] max-w-[76%] shadow-2xl" />
                                    </div>
                                );
                            }
                            if (layer.kind === 'lower-third') {
                                const offset = (1 - easedProgress + (layer.exitProgress || 0)) * 24;
                                return (
                                    <div
                                        key={`motion_${layer.kind}_${layer.text}`}
                                        className="absolute left-[6.5%] bottom-[11%] z-[1700] w-[53%] overflow-hidden rounded-xl border border-white/10 shadow-2xl"
                                        style={{
                                            backgroundColor: `${layerPreset.surface}ee`,
                                            borderLeft: `6px solid ${layerPreset.accent}`,
                                            opacity: easedProgress * (1 - (layer.exitProgress || 0)),
                                            transform: `translateX(${offset}%)`
                                        }}
                                    >
                                        <div className="px-5 py-3">
                                            <div className="mb-1 h-1 w-12 rounded-full" style={{ backgroundColor: layerPreset.accentAlt }} />
                                            <div className="text-[10px] font-bold tracking-[0.16em]" style={{ color: layerPreset.accent }}>{layerCreator.toUpperCase()}</div>
                                            <div className="mt-1 text-base font-bold leading-snug" style={{ color: layerPreset.foreground }}>{layer.text}</div>
                                        </div>
                                    </div>
                                );
                            }

                            const isIntro = layer.kind === 'intro';
                            const verticalOffset = (1 - easedProgress) * 32;
                            return (
                                <div
                                    key={`motion_${layer.kind}`}
                                    className="absolute inset-0 z-[1750] overflow-hidden"
                                    style={{ backgroundColor: layerPreset.background, opacity: isIntro && layer.progress > 0.84 ? Math.max(0.28, 1 - (layer.progress - 0.84) / 0.16) : 0.98 }}
                                >
                                    <div className="absolute -right-[12%] -top-[32%] h-[86%] w-[56%] rounded-full blur-3xl" style={{ backgroundColor: `${layerPreset.accent}55` }} />
                                    <div className="absolute inset-0 opacity-15" style={{ backgroundImage: `linear-gradient(112deg, transparent 0%, transparent 45%, ${layerPreset.foreground} 45.15%, transparent 45.3%, transparent 62%, ${layerPreset.foreground} 62.15%, transparent 62.3%)` }} />
                                    {isIntro ? (
                                        <div className="absolute left-[10.5%] top-[33%] max-w-[74%]" style={{ transform: `translateY(${verticalOffset}px)`, opacity: easedProgress }}>
                                            <div className="mb-5 h-1.5 w-24 rounded-full" style={{ backgroundColor: layerPreset.accent }} />
                                            <div className="text-[11px] font-bold tracking-[0.18em]" style={{ color: layerPreset.accent }}>OPEN VISCRIBE / VIDEO DESIGN</div>
                                            <div className="mt-3 text-4xl font-extrabold leading-tight" style={{ color: layerPreset.foreground }}>{motionDesignCopy.title}</div>
                                            <div className="mt-7 text-sm font-medium tracking-[0.14em]" style={{ color: layerPreset.muted }}>{layerCreator.toUpperCase()}</div>
                                        </div>
                                    ) : (
                                        <div className="absolute left-1/2 top-1/2 w-[66%] -translate-x-1/2 -translate-y-1/2 rounded-3xl border-2 px-8 py-9 text-center shadow-2xl" style={{ backgroundColor: `${layerPreset.surface}ee`, borderColor: layerPreset.accent, transform: `translate(-50%, calc(-50% + ${verticalOffset}px))`, opacity: easedProgress }}>
                                            <div className="text-[11px] font-bold tracking-[0.18em]" style={{ color: layerPreset.accent }}>THANKS FOR WATCHING</div>
                                            <div className="mt-4 text-3xl font-extrabold" style={{ color: layerPreset.foreground }}>{layerCreator}</div>
                                            <div className="mt-4 text-sm" style={{ color: layerPreset.muted }}>{motionDesignCopy.cta}</div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>

                    <div className="absolute bottom-4 left-4 bg-gray-900/80 backdrop-blur px-4 py-2 rounded-lg flex items-center space-x-4 border border-gray-700 z-50 shadow-xl text-xs">
                        <button onClick={togglePlay} className="hover:text-blue-400 transition" title="空白鍵播放/暫停">
                            {isPlaying ? <Pause size={16} /> : <Play size={16} fill="currentColor" />}
                        </button>
                        <div className="font-mono tracking-wider text-gray-300">
                            {new Date(currentTime * 1000).toISOString().substring(14, 19)} / {new Date(totalDuration * 1000).toISOString().substring(14, 19)}
                        </div>
                    </div>
                </div>

                {isLibraryOpen && (
                    <div
                        className={`group relative w-2 shrink-0 cursor-col-resize border-l border-gray-700/80 bg-gray-800/70 transition hover:bg-blue-500/30 ${isResizingLibrary ? 'bg-blue-500/40' : ''}`}
                        onMouseDown={() => setIsResizingLibrary(true)}
                        title="拖拉調整素材庫寬度"
                    >
                        <div className="pointer-events-none absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-gray-500/80 group-hover:bg-blue-300" />
                    </div>
                )}

                {!isLibraryOpen && (
                    <button
                        onClick={() => setIsLibraryOpen(true)}
                        className="shrink-0 self-center bg-gray-700 p-1 rounded-l-md z-10 border border-r-0 border-gray-600 hover:bg-gray-600 shadow-md"
                        title="展開素材庫"
                    >
                        <ChevronLeft size={16} />
                    </button>
                )}

                <div
                    style={{ width: isLibraryOpen ? `${libraryWidth}px` : '0px' }}
                    className="bg-gray-800 border-l border-gray-700 transition-[width] duration-300 flex flex-col overflow-hidden relative z-10 shrink-0"
                >
                    <button
                        onClick={() => setIsLibraryOpen(!isLibraryOpen)}
                        className="absolute -left-6 top-1/2 bg-gray-700 p-1 rounded-l-md z-10 border border-r-0 border-gray-600 hover:bg-gray-600 shadow-md"
                    >
                        {isLibraryOpen ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
                    </button>

                    <div className="p-4 border-b border-gray-700 flex justify-between items-center w-full min-w-0">
                        <div>
                            <h2 className="font-semibold text-sm">素材庫</h2>
                            <div className="mt-1 text-[10px] text-gray-500">素材、轉場與影片設計</div>
                        </div>

                        <input type="file" ref={fileInputRef} style={{ display: 'none' }} multiple accept="video/*,image/*,audio/*" onChange={handleImportAssets} />

                        <button
                            className="p-1.5 hover:bg-gray-700 rounded transition tooltip-trigger relative group"
                            onClick={() => fileInputRef.current?.click()}
                        >
                            <FolderOpen size={16} />
                            <span className="absolute -bottom-8 right-0 bg-gray-800 text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 whitespace-nowrap z-50 pointer-events-none transition border border-gray-600">匯入電腦檔案</span>
                        </button>
                    </div>

                    <div className="px-2 pt-2 w-full min-w-0">
                        <div className="flex flex-wrap gap-1 rounded-xl bg-gray-900/80 p-1 border border-gray-700">
                            {[
                                ['transitions', '過場'],
                                ['assets', '素材'],
                                ['cards', 'Cards'],
                                ['intro-outro', 'Intro / Outro'],
                                ['hyperframes', 'Contents'],
                                ['ai-design', 'AI 設計']
                            ].map(([key, label]) => (
                                <button
                                    key={key}
                                    type="button"
                                    onClick={() => setLibraryTab(key)}
                                    className={`rounded-lg px-2.5 py-2 text-[11px] font-medium transition ${libraryTab === key ? 'bg-fuchsia-600 text-white shadow-sm' : 'text-gray-300 hover:bg-gray-800'}`}
                                >
                                    {label}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="flex-1 p-3 space-y-3 overflow-y-auto w-full min-w-0">
                        {(libraryTab === 'transitions' || libraryTab === 'assets') && (libraryTab === 'transitions' ? transitionLibraryItems : mediaLibraryItems).map((asset, i) => (
                            <div
                                key={i}
                                draggable
                                onDragStart={(e) => handleLibraryDragStart(e, asset)}
                                className="bg-gray-700 p-2 rounded cursor-grab active:cursor-grabbing hover:bg-gray-600 flex items-center space-x-2 text-xs truncate transition border border-transparent hover:border-gray-500"
                                title={asset.type === 'transition' ? '可拖到字幕列或任一影片軌道' : '可按住拖拉到下方軌道'}
                            >
                                {asset.type === 'transition'
                                    ? <TransitionMotionPreview preset={asset.transitionPreset} color={asset.color} />
                                    : <MediaLibraryPreview asset={asset} />}
                                <span className="min-w-0 flex-1 truncate">{asset.name}</span>
                                {asset.type === 'transition' && <span className="rounded bg-black/20 px-1.5 py-0.5 text-[10px] text-gray-300">過場</span>}
                                {asset.type !== 'transition' && asset.type !== 'image' && Number.isFinite(Number(asset.duration)) && Number(asset.duration) > 0 && (
                                    <span className="rounded bg-black/20 px-1.5 py-0.5 text-[10px] text-gray-300">{Number(asset.duration).toFixed(1)}s</span>
                                )}
                                <GripVertical size={12} className="text-gray-500 ml-auto flex-shrink-0 opacity-50" />
                            </div>
                        ))}
                        {(libraryTab === 'transitions' || libraryTab === 'assets') && (libraryTab === 'transitions' ? transitionLibraryItems : mediaLibraryItems).length === 0 && (
                            <div className="text-center text-xs text-gray-500 mt-10 pointer-events-none">
                                {libraryTab === 'transitions'
                                    ? <>暫無過場</>
                                    : <>暫無素材<br />點擊上方資料夾圖示匯入</>}
                            </div>
                        )}

                        {libraryTab === 'cards' && (
                            <>
                                <div className="rounded-2xl border border-cyan-400/25 bg-cyan-500/10 p-4">
                                    <div className="flex items-center gap-2 text-sm font-semibold text-white"><Type size={16} className="text-cyan-300" /> 手動 Lower Third</div>
                                    <div className="mt-1 text-[11px] leading-5 text-gray-300">在目前播放頭加入一張可獨立保留、刪除的設計字卡，不需要啟用 AI。</div>
                                    <textarea
                                        value={manualCardText}
                                        onChange={(e) => setManualCardText(e.target.value)}
                                        placeholder="輸入字卡重點；留白時會使用目前字幕"
                                        className="mt-3 h-20 w-full resize-none rounded-xl border border-gray-700 bg-gray-950/80 px-3 py-2 text-xs text-white placeholder:text-gray-500 focus:border-cyan-400 focus:outline-none"
                                    />
                                    <label className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-gray-700 bg-gray-950/60 px-3 py-2">
                                        <span className="text-[11px] text-gray-300">新字卡持續秒數</span>
                                        <span className="flex items-center gap-1 text-xs text-cyan-100"><input type="number" min="0.8" max="10" step="0.1" value={motionDesign.cardDuration} onChange={(e) => setProjectState(prev => ({ ...prev, motionDesign: { ...DEFAULT_MOTION_DESIGN, ...(prev.motionDesign || {}), cardDuration: Number(e.target.value) } }))} className="w-14 rounded border border-gray-600 bg-gray-900 px-2 py-1 text-right text-xs text-white focus:border-cyan-300 focus:outline-none" /> 秒</span>
                                    </label>
                                    <div className="mt-3 grid grid-cols-1 gap-3">
                                        {MOTION_DESIGN_PRESETS.map(preset => (
                                            <button
                                                key={preset.id}
                                                type="button"
                                                onClick={() => addManualLowerThird(preset.id)}
                                                className="flex items-center gap-3 overflow-hidden rounded-xl border border-gray-600 bg-gray-900 p-2 text-left transition hover:border-cyan-300 hover:bg-gray-800"
                                            >
                                                <DesignMotionPreview preset={preset} variant="lower-third" duration={motionDesign.cardDuration} compact="half" />
                                                <div className="min-w-0 flex-1">
                                                    <span className="block truncate text-xs font-semibold text-white"><span className="mr-1.5 inline-block h-2 w-2 rounded-full" style={{ backgroundColor: preset.swatch }} />{preset.name}</span>
                                                    <span className="mt-1 block text-[10px] text-cyan-200">加入播放頭</span>
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <div className="text-[11px] font-medium text-gray-400">已加入的 Cards</div>
                                    {motionDesign.manualCards.length === 0 ? (
                                        <div className="rounded-xl border border-dashed border-gray-700 px-3 py-6 text-center text-xs text-gray-500">尚未加入手動字卡</div>
                                    ) : motionDesign.manualCards.map(card => (
                                        <div key={card.id} className="rounded-xl border border-gray-700 bg-gray-900/70 p-3">
                                            <div className="flex items-start gap-2">
                                                <span className="mt-1 h-2.5 w-2.5 rounded-full" style={{ backgroundColor: getMotionDesignPreset(card.presetId).accent }} />
                                                <div className="min-w-0 flex-1">
                                                    <div className="truncate text-xs font-semibold text-white">{card.text}</div>
                                                    <label className="mt-1 flex items-center gap-1 text-[10px] text-gray-400">{card.startAt.toFixed(1)}s 起，持續 <input type="number" min="0.8" max="10" step="0.1" value={Number((card.endAt - card.startAt).toFixed(1))} onChange={(e) => { const nextDuration = Math.max(0.8, Math.min(10, Number(e.target.value) || motionDesign.cardDuration)); setProjectState(prev => ({ ...prev, motionDesign: { ...DEFAULT_MOTION_DESIGN, ...(prev.motionDesign || {}), manualCards: (prev.motionDesign?.manualCards || []).map(item => item.id === card.id ? { ...item, endAt: Number((item.startAt + nextDuration).toFixed(2)) } : item) } })); }} className="w-12 rounded border border-gray-600 bg-gray-950 px-1 py-0.5 text-right text-[10px] text-white focus:border-cyan-300 focus:outline-none" /> 秒</label>
                                                </div>
                                                <button type="button" onClick={() => removeManualLowerThird(card.id)} className="rounded px-2 py-1 text-[10px] text-gray-400 hover:bg-red-500/20 hover:text-red-200">移除</button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </>
                        )}

                        {libraryTab === 'intro-outro' && (
                            <>
                                <div className="rounded-2xl border border-amber-400/25 bg-amber-500/10 p-4">
                                    <div className="flex items-center gap-2 text-sm font-semibold text-white"><MonitorPlay size={16} className="text-amber-300" /> 手動 Intro / Outro</div>
                                    <div className="mt-1 text-[11px] leading-5 text-gray-300">選一套設計後，直接把片頭或片尾加到影片首尾；不會開啟 AI 自動字卡。</div>
                                    <div className="mt-3 grid grid-cols-2 gap-2">
                                        <label className="rounded-xl border border-gray-700 bg-gray-950/60 px-3 py-2 text-[10px] text-gray-400">片頭秒數<input type="number" min="0.8" max="10" step="0.1" value={motionDesign.introDuration} onChange={(e) => setProjectState(prev => ({ ...prev, motionDesign: { ...DEFAULT_MOTION_DESIGN, ...(prev.motionDesign || {}), introDuration: Number(e.target.value) } }))} className="mt-1 w-full rounded border border-gray-600 bg-gray-900 px-2 py-1 text-right text-xs text-white focus:border-amber-300 focus:outline-none" /></label>
                                        <label className="rounded-xl border border-gray-700 bg-gray-950/60 px-3 py-2 text-[10px] text-gray-400">片尾秒數<input type="number" min="0.8" max="10" step="0.1" value={motionDesign.outroDuration} onChange={(e) => setProjectState(prev => ({ ...prev, motionDesign: { ...DEFAULT_MOTION_DESIGN, ...(prev.motionDesign || {}), outroDuration: Number(e.target.value) } }))} className="mt-1 w-full rounded border border-gray-600 bg-gray-900 px-2 py-1 text-right text-xs text-white focus:border-amber-300 focus:outline-none" /></label>
                                    </div>
                                    <div className="mt-3 space-y-3">
                                        {MOTION_DESIGN_PRESETS.map(preset => (
                                            <div
                                                key={preset.id}
                                                className={`overflow-hidden rounded-xl border p-2 ${motionDesign.presetId === preset.id ? 'border-amber-300 bg-white/10' : 'border-gray-700 bg-gray-950/40'}`}
                                            >
                                                <div className="flex gap-2">
                                                    <DesignMotionPreview preset={preset} variant="intro" duration={motionDesign.introDuration} compact />
                                                    <DesignMotionPreview preset={preset} variant="outro" duration={motionDesign.outroDuration} compact />
                                                </div>
                                                <div className="mt-2 flex items-center gap-2">
                                                    <button type="button" onClick={() => setProjectState(prev => ({ ...prev, motionDesign: { ...DEFAULT_MOTION_DESIGN, ...(prev.motionDesign || {}), presetId: preset.id } }))} className="min-w-0 flex-1 text-left">
                                                        <span className="mr-2 inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: preset.swatch }} />
                                                        <span className="text-xs font-semibold text-white">{preset.name}</span>
                                                        <span className="mt-1 block text-[10px] leading-4 text-gray-400">{preset.description}</span>
                                                    </button>
                                                    <div className="flex shrink-0 gap-1.5">
                                                        <button type="button" onClick={() => setProjectState(prev => ({ ...prev, motionDesign: { ...DEFAULT_MOTION_DESIGN, ...(prev.motionDesign || {}), presetId: preset.id, manualIntroEnabled: true } }))} className="rounded-md border border-amber-300/50 px-2 py-1.5 text-[10px] font-semibold text-amber-100 hover:bg-amber-400 hover:text-gray-950">加片頭</button>
                                                        <button type="button" onClick={() => setProjectState(prev => ({ ...prev, motionDesign: { ...DEFAULT_MOTION_DESIGN, ...(prev.motionDesign || {}), presetId: preset.id, manualOutroEnabled: true } }))} className="rounded-md border border-amber-300/50 px-2 py-1.5 text-[10px] font-semibold text-amber-100 hover:bg-amber-400 hover:text-gray-950">加片尾</button>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                    <div className="mt-3 grid grid-cols-2 gap-2">
                                        <button type="button" onClick={() => setProjectState(prev => ({ ...prev, motionDesign: { ...DEFAULT_MOTION_DESIGN, ...(prev.motionDesign || {}), manualIntroEnabled: !motionDesign.manualIntroEnabled } }))} className={`rounded-lg px-3 py-2 text-xs font-semibold ${motionDesign.manualIntroEnabled ? 'bg-amber-400 text-gray-950' : 'border border-amber-300/50 text-amber-100 hover:bg-amber-400/10'}`}>{motionDesign.manualIntroEnabled ? '移除已加入片頭' : '目前未加入片頭'}</button>
                                        <button type="button" onClick={() => setProjectState(prev => ({ ...prev, motionDesign: { ...DEFAULT_MOTION_DESIGN, ...(prev.motionDesign || {}), manualOutroEnabled: !motionDesign.manualOutroEnabled } }))} className={`rounded-lg px-3 py-2 text-xs font-semibold ${motionDesign.manualOutroEnabled ? 'bg-amber-400 text-gray-950' : 'border border-amber-300/50 text-amber-100 hover:bg-amber-400/10'}`}>{motionDesign.manualOutroEnabled ? '移除已加入片尾' : '目前未加入片尾'}</button>
                                    </div>
                                </div>
                                <input value={motionDesign.title} onChange={(e) => setProjectState(prev => ({ ...prev, motionDesign: { ...DEFAULT_MOTION_DESIGN, ...(prev.motionDesign || {}), title: e.target.value } }))} placeholder={`片頭標題（預設：${motionDesignFallbackTitle.slice(0, 24)}）`} className="w-full rounded-xl border border-gray-700 bg-gray-950 px-3 py-2.5 text-xs text-white placeholder:text-gray-500 focus:border-amber-300 focus:outline-none" />
                                <input value={motionDesign.creator} onChange={(e) => setProjectState(prev => ({ ...prev, motionDesign: { ...DEFAULT_MOTION_DESIGN, ...(prev.motionDesign || {}), creator: e.target.value } }))} placeholder="頻道 / 創作者名稱" className="w-full rounded-xl border border-gray-700 bg-gray-950 px-3 py-2.5 text-xs text-white placeholder:text-gray-500 focus:border-amber-300 focus:outline-none" />
                            </>
                        )}

                        {libraryTab === 'hyperframes' && (
                            <div className="space-y-3">
                                <div className="rounded-2xl border border-violet-300/25 bg-gradient-to-br from-violet-500/15 via-slate-900 to-cyan-500/10 p-4">
                                    <div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2 text-sm font-semibold text-white"><Sparkles size={16} className="text-violet-200" /> Contents 動態素材庫</div><button type="button" onClick={createDeploymentHyperframeDemo} className="rounded-lg bg-violet-300 px-2 py-1.5 text-[10px] font-bold text-gray-950 hover:bg-violet-200">建立部署教學示範</button></div>
                                    <p className="mt-1 text-[11px] leading-5 text-gray-300">每個內容素材都有清楚的敘事用途與動態預覽；可手動加入，也能依主題自動挑選最多兩個必要視覺。</p>
                                    <button type="button" onClick={() => applyAutomaticContents()} className="mt-3 w-full rounded-xl border border-violet-200/45 bg-violet-300/10 px-3 py-2 text-left text-[11px] font-semibold text-violet-100 transition hover:bg-violet-300 hover:text-gray-950">依目前主題自動加入 Contents <span className="ml-1 font-normal opacity-80">只選有敘事理由的素材</span></button>
                                </div>
                                <div>
                                    <div className="mb-2 flex items-center justify-between text-[11px] font-semibold text-violet-100"><span>動態 Contents</span><span className="rounded bg-violet-400/10 px-2 py-0.5 text-violet-200">{HYPERFRAME_ASSETS.length} 種</span></div>
                                    <div className="grid grid-cols-2 gap-2">
                                        {HYPERFRAME_ASSETS.map(asset => (
                                            <button key={asset.id} type="button" onClick={() => addHyperframeAsset(asset)} className="overflow-hidden rounded-xl border border-gray-700 bg-gray-950/55 p-2 text-left transition hover:border-violet-300 hover:bg-violet-500/10" title={`加入播放頭：${asset.description}`}>
                                                <HyperframeAssetPreview asset={asset} className="h-32 w-full" />
                                                <div className="mt-2 flex items-center justify-between gap-2"><span className="truncate text-[12px] font-semibold text-white">{asset.nameZh}</span><span className="shrink-0 rounded bg-violet-400/10 px-1.5 py-0.5 text-[9px] text-violet-100">{asset.category}</span></div>
                                                <p className="mt-1 line-clamp-2 min-h-8 text-[10px] leading-4 text-gray-400">{asset.description}</p>
                                                <div className="mt-2 flex items-center justify-between text-[9px]"><span className="font-mono text-gray-500">{asset.catalogId}</span><span className="font-semibold text-violet-200">加入 · {asset.duration.toFixed(1)}s</span></div>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <div className="border-t border-gray-700/80 pt-3 text-[11px] font-semibold text-gray-300">整套影片風格</div>
                                {HYPERFRAME_TEMPLATES.map(template => {
                                    const templatePreset = getMotionDesignPreset(template.presetId);
                                    const selected = motionDesign.hyperframeTemplateId === template.id;
                                    return (
                                        <div key={template.id} className={`overflow-hidden rounded-2xl border p-2 ${selected ? 'border-violet-300 bg-violet-500/10' : 'border-gray-700 bg-gray-950/45'}`}>
                                            <div className="flex gap-3">
                                                <DesignMotionPreview preset={templatePreset} variant="lower-third" duration={template.defaults.cardDuration} compact="half" templateId={template.id} />
                                                <div className="min-w-0 flex-1">
                                                    <div className="text-xs font-semibold text-white">{template.nameZh}</div>
                                                    <div className="mt-1 text-[10px] leading-4 text-gray-400">{template.description}</div>
                                                    <div className="mt-2 flex flex-wrap gap-1">{template.catalogBlocks.slice(0, 3).map(block => <span key={block} className="rounded bg-violet-400/10 px-1.5 py-0.5 font-mono text-[9px] text-violet-100">{block}</span>)}</div>
                                                </div>
                                            </div>
                                            <div className="mt-2 flex gap-2">
                                                <button type="button" onClick={() => setProjectState(prev => ({ ...prev, motionDesign: { ...DEFAULT_MOTION_DESIGN, ...(prev.motionDesign || {}), hyperframeTemplateId: template.id, presetId: template.presetId } }))} className="flex-1 rounded-lg border border-violet-300/40 px-2 py-1.5 text-[10px] font-semibold text-violet-100 hover:bg-violet-400 hover:text-gray-950">選擇風格</button>
                                                <button type="button" onClick={() => setProjectState(prev => ({ ...prev, motionDesign: { ...DEFAULT_MOTION_DESIGN, ...(prev.motionDesign || {}), hyperframeTemplateId: template.id, presetId: template.presetId, enabled: true, aiAutoEnabled: true, manualIntroEnabled: false, manualOutroEnabled: false, ...getHyperframeTemplateDefaults(template.id) } }))} className="flex-1 rounded-lg bg-violet-400 px-2 py-1.5 text-[10px] font-bold text-gray-950 hover:bg-violet-300">套用整套</button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        {libraryTab === 'ai-design' && (
                            <div className="rounded-2xl border border-fuchsia-400/25 bg-gradient-to-br from-fuchsia-500/10 via-slate-900/70 to-cyan-500/10 p-4 space-y-4">
                                <div className="flex items-start gap-3">
                                    <div className="rounded-xl bg-fuchsia-400/15 p-2 text-fuchsia-200"><Sparkles size={18} /></div>
                                    <div><div className="text-sm font-semibold text-white">AI 自動設計</div><div className="mt-1 text-[11px] leading-5 text-gray-300">讀取影片主題與 AI 字幕，自動套用片頭、片尾及每段 lower third。</div></div>
                                </div>
                                <label className="flex cursor-pointer items-center justify-between gap-4 rounded-xl border border-white/10 bg-black/20 px-3 py-3">
                                    <div><div className="flex items-center gap-2 text-sm font-semibold text-white"><Wand2 size={15} className="text-fuchsia-300" /> 啟用 AI 自動套用</div><div className="mt-1 text-[11px] text-gray-400">手動 Cards 與 Intro / Outro 不受此開關影響。</div></div>
                                    <input type="checkbox" checked={motionDesign.aiAutoEnabled} onChange={(e) => setProjectState(prev => ({ ...prev, motionDesign: { ...DEFAULT_MOTION_DESIGN, ...(prev.motionDesign || {}), enabled: e.target.checked, aiAutoEnabled: e.target.checked } }))} className="h-4 w-4 shrink-0 rounded accent-fuchsia-500" />
                                </label>
                                <div className="grid grid-cols-3 gap-2 text-[11px]">{[['includeIntro', '片頭'], ['includeOutro', '片尾'], ['includeLowerThird', '字卡']].map(([key, label]) => <label key={key} className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-gray-700 bg-black/20 px-2 py-2 text-gray-300"><input type="checkbox" checked={motionDesign[key] !== false} onChange={(e) => setProjectState(prev => ({ ...prev, motionDesign: { ...DEFAULT_MOTION_DESIGN, ...(prev.motionDesign || {}), [key]: e.target.checked } }))} className="h-3.5 w-3.5 rounded accent-fuchsia-500" />{label}</label>)}</div>
                                <div className="space-y-3">
                                    {MOTION_DESIGN_PRESETS.map(preset => (
                                        <button key={preset.id} type="button" onClick={() => setProjectState(prev => ({ ...prev, motionDesign: { ...DEFAULT_MOTION_DESIGN, ...(prev.motionDesign || {}), presetId: preset.id } }))} className={`flex w-full items-center gap-3 overflow-hidden rounded-xl border p-2 text-left ${motionDesign.presetId === preset.id ? 'border-fuchsia-300 bg-white/10' : 'border-gray-700 bg-black/20 hover:border-fuchsia-300/60'}`}>
                                            <DesignMotionPreview preset={preset} variant="lower-third" duration={motionDesign.cardDuration} compact="half" />
                                            <div className="min-w-0"><span className="mr-2 inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: preset.swatch }} /><span className="text-xs font-semibold text-white">{preset.name}</span><span className="mt-1 block text-[10px] text-gray-400">動態預覽</span></div>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>

            </div>

            {/* --- 分隔線 (Divider) --- */}
            <div
                className="h-2 bg-gray-800 hover:bg-blue-600 cursor-row-resize transition-all z-50 flex items-center justify-center relative border-y border-gray-700"
                onMouseDown={() => setIsResizingTimeline(true)}
            >
                <div className="pointer-events-none absolute right-4 bottom-3 z-50 flex items-center rounded-2xl border border-gray-600/80 bg-gray-900/90 p-1.5 shadow-[0_10px_30px_rgba(0,0,0,0.35)] backdrop-blur">
                    <button
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={handleUndo}
                        disabled={!canUndo}
                        className={`group pointer-events-auto relative flex h-10 w-10 items-center justify-center rounded-xl border border-transparent transition ${canUndo ? 'bg-transparent text-gray-200 hover:border-sky-400/60 hover:bg-sky-600 hover:text-white' : 'bg-transparent text-gray-500 cursor-not-allowed opacity-50'}`}
                        title="復原 (Ctrl/Cmd+Z)"
                    >
                        <Undo2 size={18} />
                        <span className="absolute -top-9 right-0 rounded border border-gray-600 bg-gray-800 px-2 py-1 text-[10px] whitespace-nowrap text-white opacity-0 pointer-events-none transition group-hover:opacity-100">
                            復原 (Ctrl/Cmd+Z)
                        </span>
                    </button>
                    <button
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={handleRedo}
                        disabled={!canRedo}
                        className={`group pointer-events-auto relative flex h-10 w-10 items-center justify-center rounded-xl border border-transparent transition ${canRedo ? 'bg-transparent text-gray-200 hover:border-emerald-400/60 hover:bg-emerald-600 hover:text-white' : 'bg-transparent text-gray-500 cursor-not-allowed opacity-50'}`}
                        title="重做 (Ctrl+Y / Cmd+Shift+Z)"
                    >
                        <Redo2 size={18} />
                        <span className="absolute -top-9 right-0 rounded border border-gray-600 bg-gray-800 px-2 py-1 text-[10px] whitespace-nowrap text-white opacity-0 pointer-events-none transition group-hover:opacity-100">
                            重做 (Ctrl+Y / Cmd+Shift+Z)
                        </span>
                    </button>
                    <div className="mx-1 h-6 w-px bg-gray-700" />
                    <button
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={splitClipAtPlayhead}
                        className="group pointer-events-auto relative flex h-10 w-10 items-center justify-center rounded-xl border border-transparent bg-transparent text-gray-200 transition hover:border-blue-400/60 hover:bg-blue-600 hover:text-white"
                        title="裁切片段 (Cmd+B)"
                    >
                        <Scissors size={18} />
                        <span className="absolute -top-9 right-0 rounded border border-gray-600 bg-gray-800 px-2 py-1 text-[10px] whitespace-nowrap text-white opacity-0 pointer-events-none transition group-hover:opacity-100">
                            裁切片段 (Cmd+B)
                        </span>
                    </button>
                    <button
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={addSubtitleAtPlayhead}
                        className="group pointer-events-auto relative flex h-10 w-10 items-center justify-center rounded-xl border border-transparent bg-transparent text-gray-200 transition hover:border-yellow-400/60 hover:bg-yellow-500 hover:text-gray-950"
                        title="新增字幕到 S1 用戶字幕軌 (游標位置)"
                    >
                        <Type size={18} />
                        <span className="absolute -top-9 right-0 rounded border border-gray-600 bg-gray-800 px-2 py-1 text-[10px] whitespace-nowrap text-white opacity-0 pointer-events-none transition group-hover:opacity-100">
                            新增字幕到 S1 (游標位置)
                        </span>
                    </button>
                </div>
                <div className="w-16 h-1 bg-blue-500/50 rounded-full" />
            </div>


            {/* --- 時間軸 --- */}
            <div
                style={{ height: `${timelineHeight}px` }}
                className="shrink-0 bg-gray-900 border-t border-gray-700 flex flex-col relative z-20"
            >

                <div className="flex flex-1 overflow-hidden relative">

                    <div className="w-52 flex-shrink-0 bg-gray-800 border-r border-gray-700 flex flex-col z-30 shadow-lg relative select-none">
                        <div className="h-8 shrink-0 border-b border-gray-700 flex items-center px-4 font-bold text-gray-200 text-xs bg-gradient-to-r from-gray-800 via-gray-800 to-gray-700/80 backdrop-blur">
                            時間軸軌道
                        </div>

                        <div ref={timelineLeftPanelRef} className="flex-1 overflow-hidden flex flex-col">

                        {SUBTITLE_TRACKS.map((track, trackIndex) => (
                            <div
                                key={track.key}
                                className={`h-12 shrink-0 border-b border-gray-700 px-3 text-xs transition ${
                                    activeSubtitleTrackIndex === trackIndex
                                        ? 'bg-gray-700/70 text-white shadow-[inset_3px_0_0_rgba(249,115,22,0.95)]'
                                        : 'text-gray-400 hover:bg-gray-700/40'
                                }`}
                            >
                                <div className="grid h-full grid-cols-[minmax(0,1fr)_auto_auto_auto] items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setActiveSubtitleTrackIndex(trackIndex)}
                                        className="flex min-w-0 items-center gap-2 text-left"
                                        title={trackIndex === 0 ? '手動新增字幕固定放到 S1 用戶字幕軌' : 'S2 保留給 AI字幕結果'}
                                    >
                                        <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border ${trackIndex === 0 ? 'border-cyan-400/30 bg-cyan-400/10' : 'border-amber-400/30 bg-amber-400/10'}`}>
                                            <Type size={14} className={track.colorClass} />
                                        </span>
                                        <span className="min-w-0 flex items-center gap-2">
                                            <span className="truncate font-semibold text-[12px]">{track.label.replace(` ${track.shortLabel}`, '')}</span>
                                            <span className="shrink-0 rounded bg-gray-900/60 px-1.5 py-0.5 text-[9px] uppercase tracking-[0.18em] text-gray-400">
                                                {track.shortLabel}
                                            </span>
                                        </span>
                                    </button>

                                    <label
                                        className="flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border border-gray-600/80 bg-gray-900/40 px-2 text-[11px] font-medium text-gray-200 transition hover:border-gray-400 hover:bg-gray-700/60"
                                        title="全選本軌字幕"
                                    >
                                        <input
                                            type="checkbox"
                                            checked={areAllSubtitlesSelectedByTrack[trackIndex]}
                                            onChange={(e) => handleToggleSelectAllSubtitles(trackIndex, e.target.checked)}
                                            className="h-3.5 w-3.5 shrink-0 accent-orange-500 bg-gray-900 border-gray-600 rounded"
                                        />
                                        <span>全選</span>
                                    </label>

                                    <button
                                        onClick={() => handleAlignSelectedSubtitles(trackIndex)}
                                        className="flex h-8 min-w-[3.25rem] shrink-0 items-center justify-center rounded-lg border border-gray-600/80 bg-gray-900/40 px-3 text-[11px] font-semibold text-gray-200 transition hover:border-gray-400 hover:bg-gray-700/70"
                                        title="將本軌已選字幕對齊到指定秒數"
                                    >
                                        對齊
                                    </button>

                                    <button
                                        onClick={() => setTrackState(prev => {
                                            const nextHidden = [...prev.subtitleHidden];
                                            nextHidden[trackIndex] = !nextHidden[trackIndex];
                                            return { ...prev, subtitleHidden: nextHidden };
                                        })}
                                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border transition ${
                                            trackState.subtitleHidden[trackIndex]
                                                ? 'border-gray-600 text-gray-500 hover:border-gray-500 hover:text-gray-200'
                                                : 'border-gray-500/80 text-gray-300 hover:border-gray-300 hover:text-white'
                                        }`}
                                        title={trackState.subtitleHidden[trackIndex] ? '顯示字幕軌道' : '隱藏字幕軌道'}
                                    >
                                        {trackState.subtitleHidden[trackIndex] ? <EyeOff size={14} /> : <Eye size={14} />}
                                    </button>
                                </div>
                            </div>
                        ))}

                        {[2, 1, 0].map(i => (
                            <div key={i} className="h-16 shrink-0 border-b border-gray-700 flex items-center justify-between px-3 text-xs text-gray-400 hover:bg-gray-700/50 transition">
                                <div className="flex items-center">
                                    {i === 0 ? <MonitorPlay size={14} className="mr-1.5 text-blue-400" /> : <FileVideo size={14} className="mr-1.5 text-blue-400" />} V{i + 1}
                                </div>
                                <button onClick={() => setTrackState(prev => {
                                    const newHidden = [...prev.videoHidden];
                                    newHidden[i] = !newHidden[i];
                                    return { ...prev, videoHidden: newHidden };
                                })} className="p-1 hover:text-white transition">
                                    {trackState.videoHidden[i] ? <EyeOff size={14} /> : <Eye size={14} />}
                                </button>
                            </div>
                        ))}

                        <div className="h-12 shrink-0 border-b border-gray-700 flex items-center justify-between px-3 text-xs text-gray-400 hover:bg-gray-700/50 transition">
                            <div className="flex items-center"><Music size={14} className="mr-1.5 text-green-500" /> 語音 A1</div>
                            <button onClick={() => setTrackState(prev => ({ ...prev, audioMuted: !prev.audioMuted }))} className="p-1 hover:text-white transition">
                                {trackState.audioMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}
                            </button>
                        </div>

                        <div className="h-12 shrink-0 border-b border-gray-700 flex items-center justify-between px-3 text-xs text-gray-400 hover:bg-gray-700/50 transition">
                            <div className="flex items-center"><Music size={14} className="mr-1.5 text-teal-500" /> 音樂 A2</div>
                            <button onClick={() => setTrackState(prev => ({ ...prev, bgmMuted: !prev.bgmMuted }))} className="p-1 hover:text-white transition">
                                {trackState.bgmMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}
                            </button>
                        </div>

                        </div>{/* end timelineLeftPanelRef wrapper */}
                    </div>

                    <div className="flex-1 min-w-0 relative bg-gray-900 track-bg">

                        <div className="pointer-events-none absolute right-3 top-3 z-30">
                            <div className="pointer-events-auto flex items-center gap-1 rounded-xl border border-gray-600/80 bg-gray-900/90 px-2 py-1.5 text-[10px] text-gray-200 shadow-lg backdrop-blur">
                                <button
                                    type="button"
                                    onMouseDown={(e) => e.stopPropagation()}
                                    onClick={() => applyTimelineZoom(timelineZoom / 1.25)}
                                    className="flex h-6 w-6 items-center justify-center rounded border border-transparent transition hover:border-gray-500 hover:bg-gray-700"
                                    title="縮小時間軸"
                                >
                                    <Minus size={12} />
                                </button>
                                <span className="min-w-[3rem] text-center font-semibold tabular-nums">
                                    {Math.round(timelineZoom * 100)}%
                                </span>
                                <button
                                    type="button"
                                    onMouseDown={(e) => e.stopPropagation()}
                                    onClick={() => applyTimelineZoom(timelineZoom * 1.25)}
                                    className="flex h-6 w-6 items-center justify-center rounded border border-transparent transition hover:border-gray-500 hover:bg-gray-700"
                                    title="放大時間軸"
                                >
                                    <Plus size={12} />
                                </button>
                                <button
                                    type="button"
                                    onMouseDown={(e) => e.stopPropagation()}
                                    onClick={() => applyTimelineZoom(1)}
                                    className="rounded border border-transparent px-2 py-1 transition hover:border-gray-500 hover:bg-gray-700"
                                    title="重設縮放"
                                >
                                    重設
                                </button>
                            </div>
                        </div>

                        <div
                            className="h-full overflow-auto relative"
                            ref={timelineRef}
                            onMouseDown={handleTimelineMouseDown}
                            onWheel={handleTimelineWheel}
                            onScroll={(e) => {
                                if (timelineLeftPanelRef.current) {
                                    timelineLeftPanelRef.current.scrollTop = e.currentTarget.scrollTop;
                                }
                            }}
                        >

                            {selectionBox && (
                                <div
                                    id="selection-box-element"
                                    className="absolute border border-blue-400 bg-blue-500/20 z-50 pointer-events-none"
                                    style={{
                                        left: selectionBox.x,
                                        top: selectionBox.y,
                                        width: selectionBox.w,
                                        height: selectionBox.h
                                    }}
                                />
                            )}

                            <div className="relative min-h-full" style={{ width: `${Math.max(1200, totalDuration * pixelsPerSecond + 400)}px` }}>

                                <div className="h-8 shrink-0 border-b border-gray-700 bg-gray-800/40 sticky top-0 z-10 time-ruler cursor-text">
                                {Array.from({ length: Math.max(10, Math.ceil(totalDuration + 5)) }).map((_, i) => (
                                    <div key={i} className="absolute h-full border-l border-gray-600" style={{ left: `${i * pixelsPerSecond + TIMELINE_OFFSET}px` }}>
                                        <span className="text-[10px] opacity-50 text-gray-400 pointer-events-none absolute -translate-x-1/2" style={{ left: 0 }}>{i}s</span>
                                    </div>
                                ))}
                                {/* ── Click event markers ─────────────────────────────────────── */}
                                {(() => {
                                    const rangeStart = Number(projectState.recordingRange?.startEpochMs || 0);
                                    const sessionId = projectState.recordingSessionId || '';
                                    const events = Array.isArray(projectState.clickEventLog) ? projectState.clickEventLog : [];
                                    if (!rangeStart || !events.length) return null;
                                    // Build per-clip epoch ranges so markers shift correctly after trim/split/delete
                                    const allVideoClips = (projectState.tracks || []).flat().filter(c => c?.type === 'video');
                                    const clipEpochRanges = allVideoClips
                                        .filter(clip => clip?.recordingSessionId && (!sessionId || String(clip.recordingSessionId) === sessionId))
                                        .map(clip => ({
                                            startAt: Number(clip.startAt || 0),
                                            epochStart: rangeStart + Number(clip.trimStart || 0) * 1000,
                                            epochEnd: rangeStart + Number(clip.trimEnd ?? (Number(clip.trimStart || 0) + Number(clip.duration || 0))) * 1000,
                                        }))
                                        .filter(r => r.epochEnd > r.epochStart);
                                    return events
                                        .filter(ev => ev?.epochMs && (!sessionId || (ev.sessionId || '') === sessionId))
                                        .map((ev, i) => {
                                            let timeS;
                                            if (clipEpochRanges.length > 0) {
                                                const clip = clipEpochRanges.find(r => ev.epochMs >= r.epochStart && ev.epochMs < r.epochEnd);
                                                if (!clip) return null; // in a deleted/trimmed segment
                                                timeS = clip.startAt + (ev.epochMs - clip.epochStart) / 1000;
                                            } else {
                                                timeS = (ev.epochMs - rangeStart) / 1000;
                                            }
                                            if (timeS < 0 || timeS > totalDuration + 5) return null;
                                            const left = timeS * pixelsPerSecond + TIMELINE_OFFSET;
                                            const label = ev.targetText ? ev.targetText.slice(0, 24) : `${timeS.toFixed(2)}s`;
                                            return (
                                                <div
                                                    key={`clk-${i}`}
                                                    className="absolute top-0 bottom-0 flex flex-col items-center pointer-events-auto group z-20"
                                                    style={{ left: `${left}px`, transform: 'translateX(-50%)' }}
                                                    title={`點擊 ${timeS.toFixed(2)}s${ev.targetText ? ` — ${ev.targetText}` : ''}`}
                                                >
                                                    {/* triangle marker */}
                                                    <div className="w-0 h-0 mt-0.5 flex-none"
                                                        style={{ borderLeft: '4px solid transparent', borderRight: '4px solid transparent', borderTop: '6px solid rgba(255,60,60,0.9)' }} />
                                                    {/* stem */}
                                                    <div className="w-px flex-1 bg-red-500/60" />
                                                    {/* hover tooltip */}
                                                    <div className="absolute top-7 left-1/2 -translate-x-1/2 hidden group-hover:flex bg-gray-900 border border-red-500/50 text-red-300 text-[10px] px-1.5 py-0.5 rounded whitespace-nowrap z-30 pointer-events-none shadow-lg">
                                                        {label}
                                                    </div>
                                                </div>
                                            );
                                        });
                                })()}
                                </div>

                            {SUBTITLE_TRACKS.map((track, trackIndex) => (
                                <div
                                    key={`subtitle-track-${track.key}`}
                                    className={`h-12 shrink-0 border-b border-gray-800 relative ${trackIndex === 0 ? 'bg-cyan-950/10' : 'bg-amber-950/10'} ${trackState.subtitleHidden[trackIndex] ? 'opacity-30' : ''}`}
                                    onDragOver={(e) => e.preventDefault()}
                                    onDrop={(e) => handleDropOnSubtitleTrack(e, trackIndex)}
                                >
                                    {subtitlesByTrack[trackIndex].length === 0 && (
                                        <div className="absolute inset-0 flex items-center px-3 text-[11px] text-gray-500 pointer-events-none">
                                            {trackIndex === 1 && aiSubtitleStatus.phase === 'error'
                                                ? `AI字幕未建立：${aiSubtitleStatus.detail}`
                                                : track.emptyHint}
                                        </div>
                                    )}
                                    {subtitleTransitionsByTrack[trackIndex].map(item => (
                                        <div
                                            key={item.id}
                                            data-id={item.id}
                                            onMouseDown={(e) => handleItemMouseDown(e, item, 'subtitleTransition')}
                                            className={`absolute top-0.5 bottom-0.5 rounded border text-[10px] flex items-center overflow-hidden cursor-grab active:cursor-grabbing timeline-item ${selectedIds.includes(item.id) ? 'bg-orange-500/90 border-white shadow-[0_0_8px_rgba(249,115,22,0.8)] z-30' : 'bg-fuchsia-500/25 border-fuchsia-300/60 text-fuchsia-100 z-10'}`}
                                            style={{ left: `${item.startAt * pixelsPerSecond + TIMELINE_OFFSET}px`, width: `${item.duration * pixelsPerSecond}px` }}
                                            title={`${item.name} 過場`}
                                        >
                                            {selectedIds.length === 1 && selectedIds.includes(item.id) && <div className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize z-50 hover:bg-white/40" onMouseDown={(e) => handleItemMouseDown(e, item, 'subtitleTransition', 0, 'resizeLeft')} />}
                                            <div className="px-2 truncate w-full pointer-events-none">{item.name}</div>
                                            {selectedIds.length === 1 && selectedIds.includes(item.id) && <div className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize z-50 hover:bg-white/40" onMouseDown={(e) => handleItemMouseDown(e, item, 'subtitleTransition', 0, 'resizeRight')} />}
                                        </div>
                                    ))}
                                    {subtitlesByTrack[trackIndex].map(sub => {
                                        const isSelected = selectedIds.includes(sub.id);
                                        return (
                                            <div
                                                key={sub.id}
                                                data-id={sub.id}
                                                onMouseDown={(e) => handleItemMouseDown(e, sub, 'subtitle')}
                                                className={`absolute top-1 bottom-1 rounded transition-colors cursor-grab active:cursor-grabbing shadow-sm z-20 flex items-center overflow-hidden timeline-item ${isSelected ? 'bg-orange-500/90 border-2 border-white shadow-[0_0_8px_rgba(249,115,22,0.8)]' : (trackIndex === 0 ? 'bg-cyan-700/70 border border-cyan-500/60 hover:bg-cyan-600' : 'bg-amber-700/70 border border-amber-500/60 hover:bg-amber-600')}`}
                                                style={{ left: `${sub.startAt * pixelsPerSecond + TIMELINE_OFFSET}px`, width: `${(sub.endAt - sub.startAt) * pixelsPerSecond}px` }}
                                            >
                                                {selectedIds.length === 1 && isSelected && <div className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize z-50 hover:bg-white/40" onMouseDown={(e) => handleItemMouseDown(e, sub, 'subtitle', 0, 'resizeLeft')} />}
                                                <div className="px-2 text-[11px] font-medium text-white truncate w-full pointer-events-none">{sub.text}</div>
                                                {selectedIds.length === 1 && isSelected && <div className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize z-50 hover:bg-white/40" onMouseDown={(e) => handleItemMouseDown(e, sub, 'subtitle', 0, 'resizeRight')} />}
                                            </div>
                                        );
                                    })}
                                </div>
                            ))}

                            {[2, 1, 0].map(trackIndex => {
                                const track = projectState.tracks[trackIndex];
                                return (
                                    <div key={trackIndex} data-video-track={trackIndex} className={`h-16 shrink-0 border-b border-gray-800 relative bg-gray-800/20 ${trackState.videoHidden[trackIndex] ? 'opacity-30' : ''}`} onDragOver={(e) => e.preventDefault()} onDrop={(e) => handleDropOnTrack(e, trackIndex)}>
                                        {(projectState.videoTransitions?.[trackIndex] || []).map(item => (
                                            <div
                                                key={item.id}
                                                data-id={item.id}
                                                onMouseDown={(e) => handleItemMouseDown(e, item, 'videoTransition', trackIndex)}
                                                className={`absolute right-auto top-1 bottom-9 rounded border text-[10px] flex items-center overflow-hidden cursor-grab active:cursor-grabbing timeline-item ${selectedIds.includes(item.id) ? 'bg-orange-500/90 border-white shadow-[0_0_8px_rgba(249,115,22,0.8)] z-30' : 'bg-cyan-500/20 border-cyan-300/50 text-cyan-100 z-10'}`}
                                                style={{ left: `${item.startAt * pixelsPerSecond + TIMELINE_OFFSET}px`, width: `${item.duration * pixelsPerSecond}px` }}
                                                title={`${item.name} 過場`}
                                            >
                                                {selectedIds.length === 1 && selectedIds.includes(item.id) && <div className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize z-50 hover:bg-white/40" onMouseDown={(e) => handleItemMouseDown(e, item, 'videoTransition', trackIndex, 'resizeLeft')} />}
                                                <div className="px-2 truncate w-full pointer-events-none">{item.name}</div>
                                                {selectedIds.length === 1 && selectedIds.includes(item.id) && <div className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize z-50 hover:bg-white/40" onMouseDown={(e) => handleItemMouseDown(e, item, 'videoTransition', trackIndex, 'resizeRight')} />}
                                            </div>
                                        ))}
                                        {track.map(clip => {
                                            const width = clip.duration * pixelsPerSecond;
                                            const left = clip.startAt * pixelsPerSecond + TIMELINE_OFFSET;
                                            const isSelected = selectedIds.includes(clip.id);

                                            const baseColor = clip.type === 'image' ? 'bg-purple-600/60' : 'bg-blue-600/60';
                                            const selectedColor = 'bg-orange-500/90 border-2 border-white z-30 shadow-[0_0_10px_rgba(249,115,22,0.8)]';
                                            const unselectedColor = `${baseColor} border border-${clip.type === 'image' ? 'purple' : 'blue'}-400/50 hover:bg-${clip.type === 'image' ? 'purple' : 'blue'}-500`;

                                            return (
                                                <div
                                                    key={clip.id}
                                                    data-id={clip.id}
                                                    onMouseDown={(e) => handleItemMouseDown(e, clip, 'clip', trackIndex)}
                                                    className={`absolute top-1 bottom-1 rounded flex items-center overflow-hidden transition-colors cursor-grab active:cursor-grabbing timeline-item ${isSelected ? selectedColor : unselectedColor}`}
                                                    style={{ left: `${left}px`, width: `${width}px` }}
                                                >
                                                    {selectedIds.length === 1 && isSelected && <div className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize z-50 hover:bg-white/40" onMouseDown={(e) => handleItemMouseDown(e, clip, 'clip', trackIndex, 'resizeLeft')} />}

                                                    <div className="px-2 text-[11px] font-medium truncate drop-shadow z-10 flex items-center w-full pointer-events-none">
                                                        {clip.playbackRate && clip.playbackRate !== 1 ? <FastForward size={10} className="mr-1" /> : null}
                                                        {clip.type === 'image' ? <ImageIcon size={10} className="mr-1" /> : null}
                                                        {clip.name}
                                                    </div>
                                                    <div className="absolute inset-0 flex space-x-0.5 opacity-30 pointer-events-none">
                                                        {Array.from({ length: Math.max(1, Math.floor(width / 40)) }).map((_, i) => (
                                                            <div key={i} className="h-full w-10 border-r border-white/20 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIzMiIgaGVpZ2h0PSIzMiI+PHJlY3Qgd2lkdGg9IjMyIiBoZWlnaHQ9IjMyIiBmaWxsPSIjNDQ0Ii8+PC9zdmc+')] bg-cover"></div>
                                                        ))}
                                                    </div>

                                                    {selectedIds.length === 1 && isSelected && <div className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize z-50 hover:bg-white/40" onMouseDown={(e) => handleItemMouseDown(e, clip, 'clip', trackIndex, 'resizeRight')} />}
                                                </div>
                                            );
                                        })}
                                    </div>
                                );
                            })}

                            {[0, 1].map(trackIndex => (
                                <div key={`audio-track-${trackIndex}`} data-audio-track={trackIndex} className={`h-12 shrink-0 border-b border-gray-800 relative bg-gray-900/30 ${trackIndex === 0 ? (trackState.audioMuted ? 'opacity-30' : '') : (trackState.bgmMuted ? 'opacity-30' : '')}`} onDragOver={(e) => e.preventDefault()} onDrop={(e) => handleDropOnAudioTrack(e, trackIndex)}>
                                    {projectState.audioTracks[trackIndex]?.map(audio => {
                                        const isSelected = selectedIds.includes(audio.id);
                                        const baseColor = trackIndex === 0 ? 'bg-green-600/60' : 'bg-teal-600/60';
                                        const selectedColor = 'bg-orange-500/90 border-2 border-white z-30 shadow-[0_0_10px_rgba(249,115,22,0.8)]';
                                        const unselectedColor = `${baseColor} border border-${trackIndex === 0 ? 'green' : 'teal'}-500 hover:bg-${trackIndex === 0 ? 'green' : 'teal'}-500/80`;

                                        return (
                                            <div
                                                key={audio.id}
                                                data-id={audio.id}
                                                onMouseDown={(e) => handleItemMouseDown(e, audio, 'audio', trackIndex)}
                                                className={`absolute top-1 bottom-1 rounded flex items-center overflow-hidden cursor-grab active:cursor-grabbing shadow-sm z-20 text-white transition-colors timeline-item ${isSelected ? selectedColor : unselectedColor}`}
                                                style={{ left: `${audio.startAt * pixelsPerSecond + TIMELINE_OFFSET}px`, width: `${audio.duration * pixelsPerSecond}px` }}
                                            >
                                                {selectedIds.length === 1 && isSelected && <div className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize z-50 hover:bg-white/40" onMouseDown={(e) => handleItemMouseDown(e, audio, 'audio', trackIndex, 'resizeLeft')} />}

                                                <div className="absolute inset-0 flex items-center opacity-30 px-1 pointer-events-none space-x-0.5">
                                                    {Array.from({ length: Math.max(1, Math.floor(audio.duration * 10)) }).map((_, i) => (
                                                        <div key={i} className="w-1 bg-white rounded-full" style={{ height: `${Math.random() * 60 + 20}%` }}></div>
                                                    ))}
                                                </div>
                                                <span className="relative z-10 drop-shadow flex items-center pointer-events-none text-[11px] px-2 truncate w-full">
                                                    {audio.playbackRate && audio.playbackRate !== 1 ? <FastForward size={10} className="mr-1" /> : null}
                                                    {audio.volume && audio.volume < 1 ? <Volume2 size={10} className="mr-1 opacity-70" /> : null}
                                                    {audio.name}
                                                </span>

                                                {selectedIds.length === 1 && isSelected && <div className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize z-50 hover:bg-white/40" onMouseDown={(e) => handleItemMouseDown(e, audio, 'audio', trackIndex, 'resizeRight')} />}
                                            </div>
                                        )
                                    })}
                                </div>
                            ))}

                            <div className="absolute top-0 bottom-0 w-px bg-red-500 z-30 pointer-events-none" style={{ left: `${currentTime * pixelsPerSecond + TIMELINE_OFFSET}px` }}>
                                <div className="absolute top-0 w-3 h-3 bg-red-500 rounded-full shadow-lg border border-white" style={{ transform: 'translate(-50%, -4px)' }}></div>
                            </div>

                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Export Modal */}
            {showExportModal && (
                <div className="fixed inset-0 bg-black/80 z-[4000] flex items-center justify-center backdrop-blur-sm">
                    <div className="bg-gray-800 p-6 rounded-xl w-96 shadow-2xl border border-gray-700">
                        <h2 className="text-xl font-bold mb-4 flex items-center"><Download className="mr-2" /> 匯出選項</h2>

                        <div className="space-y-4 mb-6">
                            <div className="bg-gray-900/50 p-4 rounded text-sm text-gray-300 border border-gray-700">
                                <AlertCircle size={16} className="text-blue-400 mb-2" />
                                系統將為您分別下載勾選的獨立檔案。<br />若瀏覽器跳出「允許下載多個檔案」提示，請點擊「允許」。
                            </div>

                            <label className="flex items-center space-x-3 cursor-pointer p-2 hover:bg-gray-700 rounded transition">
                                <input
                                    type="checkbox"
                                    checked={exportSettings.renderVideo}
                                    onChange={e => setExportSettings({ ...exportSettings, renderVideo: e.target.checked })}
                                    className="w-4 h-4 accent-blue-500 bg-gray-900 border-gray-600 rounded"
                                />
                                <span className="text-sm font-bold text-white">渲染合成影片 (MP4/WebM)</span>
                            </label>

                            <label className="flex items-center space-x-3 cursor-pointer p-2 hover:bg-gray-700 rounded transition">
                                <input
                                    type="checkbox"
                                    checked={exportSettings.rawMedia}
                                    onChange={e => setExportSettings({ ...exportSettings, rawMedia: e.target.checked })}
                                    className="w-4 h-4 accent-blue-500 bg-gray-900 border-gray-600 rounded"
                                />
                                <span className="text-sm">匯出原始媒體素材 (影片/圖片)</span>
                            </label>

                            <label className="flex items-center space-x-3 cursor-pointer p-2 hover:bg-gray-700 rounded transition">
                                <input
                                    type="checkbox"
                                    checked={exportSettings.includeMarkdown}
                                    onChange={e => setExportSettings({ ...exportSettings, includeMarkdown: e.target.checked })}
                                    className="w-4 h-4 accent-blue-500 bg-gray-900 border-gray-600 rounded"
                                />
                                <span className="text-sm">{markdownExportTitle}</span>
                            </label>

                            <label className="flex items-center space-x-3 cursor-pointer p-2 hover:bg-gray-700 rounded transition">
                                <input
                                    type="checkbox"
                                    checked={exportSettings.includeAudio}
                                    onChange={e => setExportSettings({ ...exportSettings, includeAudio: e.target.checked })}
                                    className="w-4 h-4 accent-blue-500 bg-gray-900 border-gray-600 rounded"
                                />
                                <span className="text-sm">包含獨立語音檔 (.wav)</span>
                            </label>

                            <label className="flex items-center space-x-3 cursor-pointer p-2 hover:bg-gray-700 rounded transition">
                                <input
                                    type="checkbox"
                                    checked={exportSettings.includeSubtitles}
                                    onChange={e => setExportSettings({ ...exportSettings, includeSubtitles: e.target.checked })}
                                    className="w-4 h-4 accent-blue-500 bg-gray-900 border-gray-600 rounded"
                                />
                                <span className="text-sm">包含外掛字幕檔 (.srt)</span>
                            </label>

                            <label className="flex items-center space-x-3 cursor-pointer p-2 hover:bg-gray-700 rounded transition">
                                <input
                                    type="checkbox"
                                    checked={exportSettings.projectJson}
                                    onChange={e => setExportSettings({ ...exportSettings, projectJson: e.target.checked })}
                                    className="w-4 h-4 accent-blue-500 bg-gray-900 border-gray-600 rounded"
                                />
                                <span className="text-sm">包含編輯器專案檔 (.json)</span>
                            </label>
                        </div>

                        <div className="flex justify-end pt-2 border-t border-gray-700 space-x-3">
                            <button onClick={handleCancelExportModal} className="px-4 py-2 rounded text-sm text-gray-400 hover:text-white transition">取消</button>
                            <button onClick={handleConfirmExport} className="bg-blue-600 hover:bg-blue-700 px-6 py-2 rounded text-sm font-medium transition">確認匯出</button>
                        </div>
                    </div>
                </div>
            )}

            {showRecordingModal && (
                <div className="fixed inset-0 bg-black/80 z-[4000] flex items-center justify-center backdrop-blur-sm">
                    <div className="bg-gray-800 p-6 rounded-xl w-[26rem] shadow-2xl border border-gray-700">
                        <h2 className="text-xl font-bold mb-2 flex items-center">
                            <MonitorPlay className="mr-2" /> 開始錄影
                        </h2>
                        <p className="text-sm text-gray-300 leading-6 mb-5">
                            這次錄影前先決定是否一併錄製系統聲音。之後按下確認才會開啟瀏覽器的畫面分享視窗。
                        </p>
                        <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/10 px-4 py-3 text-xs leading-5 text-cyan-100 mb-4">
                            若你要做 UX研究裡的眼動 / 鏡頭交叉分析，目前版本不會自動開啟電腦鏡頭。請先用外部錄影工具、會議軟體畫中畫，或系統層級方式把 webcam 一起錄進畫面。
                        </div>

                        <label className="flex items-center justify-between cursor-pointer rounded-xl border border-gray-700 bg-gray-900/70 px-4 py-3 hover:border-gray-500 transition">
                            <div className="pr-4">
                                <div className="text-sm font-semibold text-white">錄製聲音</div>
                                <div className="text-xs text-gray-400 mt-1">開啟後會一起嘗試錄進分頁或系統音訊。</div>
                            </div>
                            <input
                                type="checkbox"
                                checked={recordingOptions.includeAudio}
                                onChange={(e) => setRecordingOptions(prev => ({ ...prev, includeAudio: e.target.checked }))}
                                className="w-4 h-4 accent-red-500 bg-gray-900 border-gray-600 rounded"
                            />
                        </label>

                        <label className="mt-3 flex items-center justify-between cursor-pointer rounded-xl border border-gray-700 bg-gray-900/70 px-4 py-3 hover:border-cyan-500/60 transition">
                            <div className="pr-4">
                                <div className="text-sm font-semibold text-white">自動開啟 Webcam</div>
                                <div className="text-xs text-gray-400 mt-1">錄影開始時會自動請求鏡頭權限，成功後把使用者鏡頭疊在右下角，特別適合 UX研究模式。</div>
                            </div>
                            <input
                                type="checkbox"
                                checked={recordingOptions.includeWebcam}
                                onChange={(e) => setRecordingOptions(prev => ({ ...prev, includeWebcam: e.target.checked }))}
                                className="w-4 h-4 accent-cyan-500 bg-gray-900 border-gray-600 rounded"
                            />
                        </label>

                        <div className="mt-6 flex justify-end space-x-3">
                            <button
                                onClick={handleCancelRecordingModal}
                                className="px-4 py-2 rounded text-sm text-gray-400 hover:text-white transition"
                            >
                                取消
                            </button>
                            <button
                                onClick={handleConfirmRecording}
                                className="bg-red-600 hover:bg-red-700 px-5 py-2 rounded text-sm font-medium transition"
                            >
                                確認開始
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {showHelp && (
                <div className="fixed inset-0 bg-black/80 z-[4000] flex items-center justify-center backdrop-blur-sm">
                    <div className="bg-gray-800 p-6 rounded-xl w-[32rem] shadow-2xl border border-gray-700">
                        <h2 className="text-xl font-bold mb-4 flex items-center"><HelpCircle className="mr-2" /> 如何使用 OpenViscribe</h2>

                        <div className="space-y-4 text-sm text-gray-200 leading-6">
                            <div className="rounded-xl border border-gray-700 bg-gray-900/70 p-4">
                                <div className="font-semibold text-white mb-2">快速開始</div>
                                <ol className="list-decimal list-inside space-y-2 text-gray-300">
                                    <li>按右上角「開始錄影」，錄下你的操作流程。</li>
                                    <li>把影片、圖片或音訊素材加入時間軸做編輯。</li>
                                    <li>需要時可使用 AI 字幕、文章與語音功能整理內容。</li>
                                    <li>完成後按「匯出選項」輸出影片、字幕或專案檔。</li>
                                </ol>
                            </div>

                            <div className="rounded-xl border border-gray-700 bg-gray-900/70 p-4">
                                <div className="font-semibold text-white mb-2">常用功能</div>
                                <ul className="list-disc list-inside space-y-2 text-gray-300">
                                    <li>「匯入專案」可讀回之前匯出的專案內容。</li>
                                    <li>「暫存」會把目前進度保存在本機瀏覽器。</li>
                                    <li>「設定」可調整 AI 金鑰、模型、錄影解析度與全域點擊紅圈。</li>
                                    <li>時間軸上的片段可拖曳移動、調整長度，並加入字幕或過場。</li>
                                </ul>
                            </div>

                            <div className="rounded-xl border border-blue-500/30 bg-blue-500/10 p-4 text-gray-200">
                                建議第一次使用時先開啟「設定」填好 AI 相關資訊，之後再開始錄影與生成內容，流程會更順。
                            </div>
                        </div>

                        <div className="mt-6 flex justify-end">
                            <button
                                onClick={() => setShowHelp(false)}
                                className="bg-blue-600 hover:bg-blue-700 px-6 py-2 rounded text-sm font-medium transition"
                            >
                                關閉
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <SettingsModal
                show={showSettings}
                settings={settings}
                setSettings={setSettings}
                lmStudioModelCatalog={lmStudioModelCatalog}
                ollamaTimeoutSeconds={ollamaTimeoutSeconds}
                lmStudioTimeoutSeconds={lmStudioTimeoutSeconds}
                ollamaTestState={ollamaTestState}
                lmStudioTestState={lmStudioTestState}
                ollamaModelCatalog={ollamaModelCatalog}
                refreshLmStudioModels={refreshLmStudioModels}
                refreshOllamaModels={refreshOllamaModels}
                updateOllamaEndpoint={updateOllamaEndpoint}
                updateOllamaLocalhostMode={updateOllamaLocalhostMode}
                updateRippleEnabled={updateRippleEnabled}
                testLmStudioConnection={testLmStudioConnection}
                testOllamaConnection={testOllamaConnection}
                onSave={() => {
                    localStorage.setItem('extension_settings', JSON.stringify(settings));
                    void syncRippleSetting(settings.clickRippleEnabled);
                    setShowSettings(false);
                }}
            />

            {pendingScreenshotReview && (
                <ArticleScreenshotReview
                    steps={pendingScreenshotReview.steps}
                    onConfirm={pendingScreenshotReview.onConfirm}
                    onCancel={pendingScreenshotReview.onCancel}
                />
            )}
        </div>
    );
}
