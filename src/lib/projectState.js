import {
    DEFAULT_CLIP_LAYOUT,
    DEFAULT_KEN_BURNS_VIEWPORT,
    DEFAULT_MOTION_DESIGN,
    DEFAULT_UI_DEBUG_CHECKS,
    SUBTITLE_TRACKS
} from '../constants/appConstants';
import { uiDebugSkill } from '../skills/ui-debug/skill';
import { uxResearchSkill } from '../skills/ux-research/skill';
import { clamp, normalizeSubtitle } from './subtitleUtils';

export function createEmptyProjectState() {
    return {
        tracks: [[], [], []],
        videoTransitions: [[], [], []],
        audioTracks: [[], []],
        subtitles: [],
        subtitleTransitions: [],
        assets: [],
        tutorialDescription: '',
        articleTopic: '',
        articlePerspective: 'kol',
        articleIncludeClickHighlight: true,
        motionDesign: { ...DEFAULT_MOTION_DESIGN },
        automationScript: null,
        uxResearchFlowName: '',
        uxResearchGoal: '',
        uxResearchAudience: '',
        uxResearchSuccessSignal: '',
        uxResearchFocusAreas: '',
        uxResearchIncludeEyeTracking: false,
        uxResearchCameraNotes: '',
        uxResearchPreset: 'default',
        uxResearchAutoWebcam: true,
        uxResearchThresholds: { ...uxResearchSkill.defaultThresholds },
        uiDebugChecks: { ...DEFAULT_UI_DEBUG_CHECKS },
        uiDebugTranslationLanguage: 'en',
        uiDebugThresholds: { ...uiDebugSkill.defaultThresholds },
        uiDebugUseAiSummary: true,
        tutorialMD: '',
        columnTopicMD: '',
        uiDebugMD: '',
        uxResearchMD: '',
        uiDebugFrames: [],
        uxResearchFrames: [],
        uiDebugReport: null,
        uxResearchReport: null,
        compositeTutorialReport: null,
        capturedFrames: [],
        clickEventLog: [],
        debugEventLog: [],
        recordingSessionId: '',
        recordingRange: { startEpochMs: null, endEpochMs: null },
        aiSubtitleTimelineSnapshot: '',
        aiSubtitleGeneratedAt: null,
        compositeSubtitleAnalysis: []
    };
}

export function roundTimelineSnapshotValue(value) {
    return Number.isFinite(Number(value)) ? Number(Number(value).toFixed(3)) : 0;
}

export function createAiSubtitleTimelineSnapshot(state) {
    const videoTracks = [0, 1, 2].map(trackIndex => (
        Array.isArray(state?.tracks?.[trackIndex])
            ? state.tracks[trackIndex]
                .filter(clip => clip?.type === 'video')
                .map(clip => ({
                    trackIndex,
                    id: String(clip?.id || ''),
                    assetId: String(clip?.assetId || clip?.blobId || clip?.src || ''),
                    startAt: roundTimelineSnapshotValue(clip?.startAt),
                    duration: roundTimelineSnapshotValue(clip?.duration),
                    trimStart: roundTimelineSnapshotValue(clip?.trimStart),
                    trimEnd: roundTimelineSnapshotValue(clip?.trimEnd),
                    playbackRate: roundTimelineSnapshotValue(clip?.playbackRate || 1)
                }))
                .sort((a, b) => a.startAt - b.startAt || a.id.localeCompare(b.id))
            : []
    ));

    const videoTransitions = [0, 1, 2].map(trackIndex => (
        Array.isArray(state?.videoTransitions?.[trackIndex])
            ? state.videoTransitions[trackIndex]
                .map(item => ({
                    trackIndex,
                    id: String(item?.id || ''),
                    startAt: roundTimelineSnapshotValue(item?.startAt),
                    duration: roundTimelineSnapshotValue(item?.duration),
                    transitionPreset: String(item?.transitionPreset || item?.preset || '')
                }))
                .sort((a, b) => a.startAt - b.startAt || a.id.localeCompare(b.id))
            : []
    ));

    return JSON.stringify({ videoTracks, videoTransitions });
}

export function getAiSubtitleTimelineWarning(state) {
    const savedSnapshot = String(state?.aiSubtitleTimelineSnapshot || '');
    if (!savedSnapshot) return '';
    const currentSnapshot = createAiSubtitleTimelineSnapshot(state);
    if (savedSnapshot === currentSnapshot) return '';
    return 'AI字幕生成後，時間軸上的影片片段已被調整，現在時間已和當時不同。生成文章或語音前，請先重跑一次 AI字幕。';
}

export function createInitialAiSubtitleStatus() {
    return {
        phase: 'idle',
        message: '尚未執行 AI字幕',
        detail: '錄完有紅圈的操作影片後，按下「AI字幕」就會在這裡看到掃描、上傳與生成結果。',
        aiLabel: '',
        progressPercent: 0,
        currentStep: 0,
        totalSteps: 0,
        stageLabel: '',
        clickCount: 0,
        frameCount: 0,
        subtitleCount: 0,
        uploaded: false,
        updatedAt: null
    };
}

export function createInitialArticleStatus() {
    return {
        phase: 'idle',
        message: '尚未生成文章',
        detail: '按下「生成文章」後，這裡會顯示標題、摘要與產生結果。',
        aiLabel: '',
        progressPercent: 0,
        currentStep: 0,
        totalSteps: 0,
        stageLabel: '',
        title: '',
        summary: '',
        stepCount: 0,
        referenceCount: 0,
        updatedAt: null
    };
}

export function createInitialTtsStatus() {
    return {
        phase: 'idle',
        message: '尚未生成語音',
        detail: '按下「AI 自動語音生成」後，這裡會列出每段語音的產生結果。',
        aiLabel: '',
        progressPercent: 0,
        currentStep: 0,
        totalSteps: 0,
        stageLabel: '',
        successCount: 0,
        totalCount: 0,
        clips: [],
        updatedAt: null
    };
}

export function createInitialUiDebugStatus() {
    return {
        phase: 'idle',
        message: '尚未執行 Test Report',
        detail: '切到 Test Report 模式後，按下「開始全面診斷」即可輸出工程檢查報告。',
        aiLabel: '',
        progressPercent: 0,
        currentStep: 0,
        totalSteps: 0,
        stageLabel: '',
        issueCount: 0,
        slowInteractionCount: 0,
        consoleErrorCount: 0,
        uiErrorCount: 0,
        networkSlowCount: 0,
        updatedAt: null
    };
}

export function createInitialUxResearchStatus() {
    return {
        phase: 'idle',
        message: '尚未執行 UX研究',
        detail: '填好本次 UX flow 與研究目標後，按下「開始 UX 研究分析」即可輸出研究報告。',
        aiLabel: '',
        progressPercent: 0,
        currentStep: 0,
        totalSteps: 0,
        stageLabel: '',
        frictionCount: 0,
        longDwellCount: 0,
        readabilityIssueCount: 0,
        hesitationCount: 0,
        updatedAt: null
    };
}

export function deriveAiSubtitleStatusFromProject(projectState, source = 'project') {
    const highlightSubs = (projectState?.subtitles || []).filter(sub => normalizeSubtitle(sub).trackIndex === 1);
    const frameCount = Array.isArray(projectState?.capturedFrames) ? projectState.capturedFrames.length : 0;
    if (highlightSubs.length === 0) {
        return createInitialAiSubtitleStatus();
    }

    const sourceLabel = source === 'draft' ? '暫存' : '專案';
    return {
        phase: frameCount > 0 ? 'success' : 'warning',
        message: `已載入${sourceLabel}字幕`,
        detail: `已從${sourceLabel}資料載入 ${highlightSubs.length} 條 S2 字幕。這些是既有結果，並非本次重新送出 OCR 的新結果。`,
        clickCount: 0,
        frameCount,
        subtitleCount: highlightSubs.length,
        uploaded: false,
        updatedAt: Date.now()
    };
}

export function normalizeKenBurnsViewport(viewport) {
    return {
        scale: Number.isFinite(Number(viewport?.scale)) ? Math.min(3, Math.max(1, Number(viewport.scale))) : DEFAULT_KEN_BURNS_VIEWPORT.scale,
        x: Number.isFinite(Number(viewport?.x)) ? Math.min(100, Math.max(-100, Number(viewport.x))) : DEFAULT_KEN_BURNS_VIEWPORT.x,
        y: Number.isFinite(Number(viewport?.y)) ? Math.min(100, Math.max(-100, Number(viewport.y))) : DEFAULT_KEN_BURNS_VIEWPORT.y
    };
}

export function createDefaultKenBurnsEffect() {
    return {
        enabled: false,
        easing: 'ease-in-out',
        start: { ...DEFAULT_KEN_BURNS_VIEWPORT },
        end: { ...DEFAULT_KEN_BURNS_VIEWPORT }
    };
}

export function normalizeKenBurnsEffect(effect) {
    return {
        ...createDefaultKenBurnsEffect(),
        ...effect,
        enabled: Boolean(effect?.enabled),
        easing: ['linear', 'ease-in', 'ease-out', 'ease-in-out'].includes(effect?.easing) ? effect.easing : 'ease-in-out',
        start: normalizeKenBurnsViewport(effect?.start),
        end: normalizeKenBurnsViewport(effect?.end)
    };
}

export function normalizeClipItem(clip) {
    return {
        ...clip,
        // AI rough cuts target a filled delivery frame. Keep user-imported
        // clips conservative (contain), while restoring older AI clips to the
        // same cover behavior as newly generated ones.
        mediaFit: clip?.mediaFit === 'cover' || clip?.mediaFit === 'contain'
            ? clip.mediaFit
            : (clip?.source === 'ai-editor' ? 'cover' : 'contain'),
        layout: {
            x: Number.isFinite(Number(clip?.layout?.x)) ? Number(clip.layout.x) : DEFAULT_CLIP_LAYOUT.x,
            y: Number.isFinite(Number(clip?.layout?.y)) ? Number(clip.layout.y) : DEFAULT_CLIP_LAYOUT.y,
            w: Number.isFinite(Number(clip?.layout?.w)) ? Number(clip.layout.w) : DEFAULT_CLIP_LAYOUT.w,
            h: Number.isFinite(Number(clip?.layout?.h)) ? Number(clip.layout.h) : DEFAULT_CLIP_LAYOUT.h
        },
        kenBurns: normalizeKenBurnsEffect(clip?.kenBurns)
    };
}

export function normalizeProjectState(state) {
    const safe = state || {};
    const normalizedSubtitles = Array.isArray(safe.subtitles) ? safe.subtitles.map(normalizeSubtitle) : [];
    const normalizedSubtitleTransitions = Array.isArray(safe.subtitleTransitions)
        ? safe.subtitleTransitions.map(item => ({
            ...item,
            trackIndex: Number.isInteger(item?.trackIndex) ? clamp(Number(item.trackIndex), 0, SUBTITLE_TRACKS.length - 1) : 1
        }))
        : [];
    return {
        ...createEmptyProjectState(),
        ...safe,
        tracks: [0, 1, 2].map(index => Array.isArray(safe.tracks?.[index]) ? safe.tracks[index].map(normalizeClipItem) : []),
        videoTransitions: [0, 1, 2].map(index => Array.isArray(safe.videoTransitions?.[index]) ? safe.videoTransitions[index] : []),
        audioTracks: [0, 1].map(index => Array.isArray(safe.audioTracks?.[index]) ? safe.audioTracks[index] : []),
        subtitles: normalizedSubtitles,
        subtitleTransitions: normalizedSubtitleTransitions,
        assets: Array.isArray(safe.assets) ? safe.assets : [],
        motionDesign: { ...DEFAULT_MOTION_DESIGN, ...(safe.motionDesign || {}) },
        clickEventLog: Array.isArray(safe.clickEventLog) ? safe.clickEventLog : [],
        debugEventLog: Array.isArray(safe.debugEventLog) ? safe.debugEventLog : []
    };
}

export function cloneProjectSnapshot(state) {
    try {
        return structuredClone(state);
    } catch (e) {
        return JSON.parse(JSON.stringify(state));
    }
}

export function createProgressText(step, totalSteps, label, percent) {
    const safeStep = Math.max(0, Number(step) || 0);
    const safeTotal = Math.max(0, Number(totalSteps) || 0);
    const safePercent = Math.max(0, Math.min(100, Math.round(Number(percent) || 0)));
    if (safeTotal > 0 && label) return `步驟 ${safeStep}/${safeTotal} - ${label} (${safePercent}%)`;
    if (label) return `${label} (${safePercent}%)`;
    return `進度 ${safePercent}%`;
}

export function getMediaBlobId(item) {
    return item?.blobId || item?.assetId || item?.id || null;
}

export function sanitizeExportBaseName(name, fallback = 'asset') {
    return (name || fallback)
        .replace(/\.[^/.]+$/, '')
        .replace(/[^\w\-]+/g, '_')
        .replace(/^_+|_+$/g, '') || fallback;
}

export function getMediaExportExtension(type) {
    return type === 'image' ? 'jpg' : 'webm';
}

export function buildProjectExportMetadata(state) {
    const videoItems = (state.tracks || []).flat().filter(item => item?.type === 'video' || item?.type === 'image');
    const audioItems = (state.audioTracks || []).flatMap(track => track || []).filter(Boolean);

    const videoByBlobId = new Map();
    videoItems.forEach((item, index) => {
        const blobId = getMediaBlobId(item);
        if (!blobId) return;
        videoByBlobId.set(blobId, `media_${index + 1}.${getMediaExportExtension(item.type)}`);
    });

    const audioByBlobId = new Map();
    audioItems.forEach((item, index) => {
        const blobId = getMediaBlobId(item);
        if (!blobId) return;
        const safeBaseName = sanitizeExportBaseName(item.name, `audio_${index + 1}`);
        audioByBlobId.set(blobId, `audio_${String(index + 1).padStart(2, '0')}_${safeBaseName}.wav`);
    });

    return { videoByBlobId, audioByBlobId };
}

export function annotateProjectWithExportFilenames(state) {
    const { videoByBlobId, audioByBlobId } = buildProjectExportMetadata(state);

    return {
        ...state,
        tracks: (state.tracks || []).map(track => track.map(item => {
            const blobId = getMediaBlobId(item);
            return blobId && videoByBlobId.has(blobId)
                ? { ...item, exportFileName: videoByBlobId.get(blobId) }
                : { ...item };
        })),
        audioTracks: (state.audioTracks || []).map(track => (track || []).map(item => {
            const blobId = getMediaBlobId(item);
            return blobId && audioByBlobId.has(blobId)
                ? { ...item, exportFileName: audioByBlobId.get(blobId) }
                : { ...item };
        })),
        assets: (state.assets || []).map(item => {
            const blobId = getMediaBlobId(item);
            if (blobId && videoByBlobId.has(blobId)) return { ...item, exportFileName: videoByBlobId.get(blobId) };
            if (blobId && audioByBlobId.has(blobId)) return { ...item, exportFileName: audioByBlobId.get(blobId) };
            return { ...item };
        })
    };
}

export function getProjectMissingMediaCount(state) {
    const trackItems = (state.tracks || []).flat();
    const audioItems = (state.audioTracks || []).flatMap(track => track || []);
    const assetItems = state.assets || [];
    return [...trackItems, ...audioItems, ...assetItems]
        .filter(item => item && !item.src && getMediaBlobId(item))
        .length;
}

export function getProjectVideoDuration(state) {
    return (state?.tracks || []).flat().reduce((maxDuration, item) => {
        if (!item || (item.type !== 'video' && item.type !== 'image')) return maxDuration;
        const clipEnd = Number(item.startAt || 0) + Number(item.duration || 0);
        return clipEnd > maxDuration ? clipEnd : maxDuration;
    }, 0);
}

export function sanitizeImportedRecordingRange(state) {
    if (!state?.recordingRange) return state;
    const startEpochMs = Number(state.recordingRange.startEpochMs);
    const endEpochMs = Number(state.recordingRange.endEpochMs);
    const videoDurationSec = getProjectVideoDuration(state);
    if (!Number.isFinite(startEpochMs) || !Number.isFinite(endEpochMs) || videoDurationSec <= 0) {
        return state;
    }

    const rangeSpanMs = Math.max(0, endEpochMs - startEpochMs);
    const expectedSpanMs = Math.round(videoDurationSec * 1000);
    if (rangeSpanMs <= expectedSpanMs + 15000) {
        return state;
    }

    return {
        ...state,
        recordingRange: {
            startEpochMs: Math.max(startEpochMs, endEpochMs - expectedSpanMs),
            endEpochMs
        }
    };
}

export function sanitizeImportedTimelineOffsets(state) {
    if (!state) return state;
    const videoDurationSec = getProjectVideoDuration(state);
    if (videoDurationSec <= 0) return state;

    const subtitleStarts = (state.subtitles || [])
        .map(item => Number(item?.startAt))
        .filter(Number.isFinite);
    const audioStarts = (state.audioTracks || [])
        .flatMap(track => track || [])
        .map(item => Number(item?.startAt))
        .filter(Number.isFinite);
    const candidateStarts = [...subtitleStarts, ...audioStarts];
    if (!candidateStarts.length) return state;

    const earliestOffset = Math.min(...candidateStarts);
    const latestTimedEnd = Math.max(
        0,
        ...(state.subtitles || []).map(item => Number(item?.endAt)).filter(Number.isFinite),
        ...(state.audioTracks || []).flatMap(track => track || []).map(item => Number(item?.startAt || 0) + Number(item?.duration || 0)).filter(Number.isFinite),
        ...((state.subtitleTransitions || []).map(item => Number(item?.startAt || 0) + Number(item?.duration || 0)).filter(Number.isFinite))
    );
    const timelineLooksOffset = earliestOffset > Math.max(30, videoDurationSec + 5) && latestTimedEnd > videoDurationSec + 30;
    if (!timelineLooksOffset) return state;

    const shiftTime = (value) => {
        const numeric = Number(value);
        if (!Number.isFinite(numeric)) return value;
        return Math.max(0, Number((numeric - earliestOffset).toFixed(2)));
    };

    return {
        ...state,
        subtitles: (state.subtitles || []).map(item => ({
            ...item,
            startAt: shiftTime(item.startAt),
            endAt: Math.max(shiftTime(item.endAt), shiftTime(item.startAt) + 0.1)
        })),
        audioTracks: (state.audioTracks || []).map(track => (track || []).map(item => ({
            ...item,
            startAt: shiftTime(item.startAt)
        }))),
        subtitleTransitions: (state.subtitleTransitions || []).map(item => ({
            ...item,
            startAt: shiftTime(item.startAt)
        }))
    };
}

export function normalizeTimedItemsToZero(items, getEndTime) {
    const validStarts = (items || [])
        .map(item => Number(item?.startAt))
        .filter(Number.isFinite);
    if (!validStarts.length) return items || [];

    const earliestOffset = Math.min(...validStarts);
    const latestEnd = Math.max(
        0,
        ...(items || []).map(item => Number(getEndTime(item))).filter(Number.isFinite)
    );
    if (!(earliestOffset > 30 && latestEnd > earliestOffset + 1)) {
        return items || [];
    }

    return (items || []).map(item => {
        const shiftedStart = Math.max(0, Number((Number(item.startAt) - earliestOffset).toFixed(2)));
        const rawEnd = Number(getEndTime(item));
        const shiftedEnd = Number.isFinite(rawEnd)
            ? Math.max(shiftedStart + 0.1, Number((rawEnd - earliestOffset).toFixed(2)))
            : shiftedStart;
        return {
            ...item,
            startAt: shiftedStart,
            ...(Number.isFinite(rawEnd) ? { endAt: shiftedEnd } : {})
        };
    });
}
