import { DEFAULT_SUBTITLE_STYLE, SUBTITLE_TRACKS } from '../constants/appConstants';

export function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

export function normalizeHexColor(value, fallback) {
    const raw = String(value || '').trim();
    const candidate = raw.startsWith('#') ? raw : `#${raw}`;
    return /^#([0-9a-fA-F]{6})$/.test(candidate) ? candidate : fallback;
}

export function normalizeSubtitle(subtitle) {
    return {
        ...subtitle,
        trackIndex: Number.isInteger(subtitle?.trackIndex) ? clamp(Number(subtitle.trackIndex), 0, SUBTITLE_TRACKS.length - 1) : 1,
        fontSize: Number.isFinite(Number(subtitle?.fontSize)) ? clamp(Number(subtitle.fontSize), 16, 144) : DEFAULT_SUBTITLE_STYLE.fontSize,
        fontFamily: subtitle?.fontFamily || DEFAULT_SUBTITLE_STYLE.fontFamily,
        textColor: normalizeHexColor(subtitle?.textColor, DEFAULT_SUBTITLE_STYLE.textColor),
        backgroundColor: normalizeHexColor(subtitle?.backgroundColor, DEFAULT_SUBTITLE_STYLE.backgroundColor),
        backgroundOpacity: Number.isFinite(Number(subtitle?.backgroundOpacity))
            ? clamp(Number(subtitle.backgroundOpacity), 0, 1)
            : DEFAULT_SUBTITLE_STYLE.backgroundOpacity,
        x: Number.isFinite(Number(subtitle?.x)) ? clamp(Number(subtitle.x), 0, 100) : DEFAULT_SUBTITLE_STYLE.x,
        y: Number.isFinite(Number(subtitle?.y)) ? clamp(Number(subtitle.y), 0, 100) : DEFAULT_SUBTITLE_STYLE.y
    };
}

export function normalizeSceneType(value) {
    const normalized = String(value || '').trim().toLowerCase();
    if (['live_action', 'screen_recording', 'screen_recording_with_pip', 'mixed_overlay', 'uncertain'].includes(normalized)) {
        return normalized;
    }
    return 'uncertain';
}

export function normalizeInstructionRole(value) {
    const normalized = String(value || '').trim().toLowerCase();
    if (['setup', 'action', 'confirmation', 'warning', 'explanation', 'comparison', 'result'].includes(normalized)) {
        return normalized;
    }
    return 'action';
}

export function normalizeRelationType(value) {
    const normalized = String(value || '').trim().toLowerCase();
    if (['parallel', 'cause_and_effect', 'zoom_in_detail', 'real_world_correspondence', 'supplementary_hint', 'decorative_only'].includes(normalized)) {
        return normalized;
    }
    return 'supplementary_hint';
}

export function normalizePipRelevance(value) {
    const normalized = String(value || '').trim().toLowerCase();
    if (['critical', 'supporting', 'optional', 'ignore'].includes(normalized)) {
        return normalized;
    }
    return 'optional';
}

export function cleanAiText(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
}

export function buildCompositeSubtitleText(entry, fallbackText = '') {
    const subtitle = cleanAiText(entry?.subtitle);
    if (subtitle) return subtitle;
    const mainAction = cleanAiText(entry?.main_action);
    const pipAction = cleanAiText(entry?.pip_action);
    if (mainAction && pipAction) return `${mainAction}；${pipAction}`;
    if (mainAction) return mainAction;
    if (pipAction) return pipAction;
    return cleanAiText(fallbackText);
}

export function buildCompositeSummaryText(subtitles, language = 'zh-TW') {
    const candidates = [];
    const seen = new Set();

    subtitles.forEach((item) => {
        const text = cleanAiText(item?.text || item?.mainAction || item?.pipAction || '');
        if (!text) return;
        const key = text.toLowerCase();
        if (seen.has(key)) return;
        seen.add(key);
        candidates.push(text);
    });

    if (candidates.length === 0) {
        return language === 'zh-TW' ? '持續進行此段操作示範。' : 'Demonstrates this step throughout the clip.';
    }
    if (candidates.length === 1) return candidates[0];
    if (candidates.length === 2) {
        return language === 'zh-TW'
            ? `${candidates[0]}，接著${candidates[1]}。`
            : `${candidates[0]}, then ${candidates[1]}.`;
    }

    const middle = candidates[Math.floor(candidates.length / 2)];
    return language === 'zh-TW'
        ? `${candidates[0]}，接著${middle}，最後${candidates[candidates.length - 1]}。`
        : `${candidates[0]}, then ${middle}, and finally ${candidates[candidates.length - 1]}.`;
}

export function buildHybridCompositeSubtitles(parsedSubs, videoClips, clickPoints, language = 'zh-TW') {
    const safeSubs = [...(parsedSubs || [])].sort((a, b) => a.startAt - b.startAt);
    const safeClips = [...(videoClips || [])].sort((a, b) => a.startAt - b.startAt);
    const safeClicks = [...(clickPoints || [])].sort((a, b) => a.time - b.time);
    if (!safeSubs.length || !safeClips.length) return safeSubs;

    const clipAssignments = safeClips.map(() => []);
    safeSubs.forEach((sub) => {
        const subMidpoint = Number((((sub.startAt || 0) + (sub.endAt || sub.startAt || 0)) / 2).toFixed(2));
        let bestClipIndex = -1;
        let bestScore = -Infinity;

        safeClips.forEach((clip, index) => {
            const clipStart = Number(clip.startAt || 0);
            const clipEnd = Number((clip.startAt || 0) + (clip.duration || 0));
            if (clipEnd <= clipStart) return;

            const overlap = Math.max(0, Math.min(Number(sub.endAt || sub.startAt || 0), clipEnd) - Math.max(Number(sub.startAt || 0), clipStart));
            const midpointDistance = Math.abs(subMidpoint - ((clipStart + clipEnd) / 2));
            const containsMidpoint = subMidpoint >= clipStart && subMidpoint < clipEnd;
            const score = (containsMidpoint ? 100000 : 0) + overlap * 100 - midpointDistance;

            if (score > bestScore) {
                bestScore = score;
                bestClipIndex = index;
            }
        });

        if (bestClipIndex >= 0) {
            clipAssignments[bestClipIndex].push(sub);
        }
    });

    const rebuilt = [];

    safeClips.forEach((clip, clipIndex) => {
        const clipStart = Number((clip.startAt || 0).toFixed(2));
        const clipEnd = Number(((clip.startAt || 0) + (clip.duration || 0)).toFixed(2));
        if (clipEnd <= clipStart) return;

        const subsInClip = (clipAssignments[clipIndex] || [])
            .map((sub) => ({
                ...sub,
                startAt: Number(Math.max(sub.startAt, clipStart).toFixed(2)),
                endAt: Number(Math.min(sub.endAt, clipEnd).toFixed(2))
            }))
            .filter((sub) => sub.endAt > sub.startAt + 0.01);
        if (!subsInClip.length) return;

        const clicksInClip = safeClicks.filter((point) => point.time >= clipStart - 0.05 && point.time < clipEnd + 0.05);
        if (clicksInClip.length === 0) {
            const representative = subsInClip.find((sub) => sub.sceneType !== 'uncertain') || subsInClip[0];
            rebuilt.push({
                ...representative,
                startAt: clipStart,
                endAt: clipEnd,
                clickId: '',
                text: buildCompositeSummaryText(subsInClip, language)
            });
            return;
        }

        clicksInClip.forEach((point, index) => {
            const clickTime = Number(point.time.toFixed(2));
            const source = subsInClip.reduce((closest, candidate) => {
                if (!closest) return candidate;
                return Math.abs(candidate.startAt - clickTime) < Math.abs(closest.startAt - clickTime) ? candidate : closest;
            }, null) || subsInClip[Math.min(index, subsInClip.length - 1)];
            const nextStart = index < clicksInClip.length - 1
                ? Number(clicksInClip[index + 1].time.toFixed(2))
                : clipEnd;
            rebuilt.push({
                ...source,
                clickId: point.clickId || source.clickId || '',
                startAt: clickTime,
                endAt: Number(Math.max(Math.min(nextStart, clipEnd), clickTime + 0.5).toFixed(2))
            });
        });
    });

    return rebuilt.length ? rebuilt.sort((a, b) => a.startAt - b.startAt) : safeSubs;
}

export function createUiDebugIssueSubtitles(issues) {
    if (!Array.isArray(issues) || issues.length === 0) return [];

    return issues.map((issue, index) => {
        const eventIndex = Number.isFinite(Number(issue?.eventIndex)) ? Number(issue.eventIndex) : index + 1;
        const startAt = Number.isFinite(Number(issue?.clickTime)) ? Number(issue.clickTime) : 0;
        const rawEndAt = Number.isFinite(Number(issue?.settledTime)) ? Number(issue.settledTime) : startAt + 1.2;
        const endAt = Math.max(startAt + 0.8, rawEndAt);

        return normalizeSubtitle({
            id: `sub_ui_debug_issue_${eventIndex}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            trackIndex: 1,
            startAt: Number(startAt.toFixed(2)),
            endAt: Number(endAt.toFixed(2)),
            text: `E${eventIndex}`,
            fontSize: 18,
            fontFamily: '"Noto Sans TC", sans-serif',
            textColor: '#fff7ed',
            backgroundColor: '#b45309',
            backgroundOpacity: 0.92,
            x: 50,
            y: 14,
            uiDebugMarker: true
        });
    });
}

export function createUxResearchEventSubtitles(events) {
    if (!Array.isArray(events) || events.length === 0) return [];

    return events.map((event, index) => {
        const eventIndex = Number.isFinite(Number(event?.eventIndex)) ? Number(event.eventIndex) : index + 1;
        const startAt = Number.isFinite(Number(event?.clickTime)) ? Number(event.clickTime) : 0;
        const rawEndAt = Number.isFinite(Number(event?.settledTime)) ? Number(event.settledTime) : startAt + 1.2;
        const endAt = Math.max(startAt + 0.9, rawEndAt);
        const causeShort = String(event?.primaryCause || '').trim();
        const shortLabel = causeShort === 'navigation-friction'
            ? 'Nav'
            : causeShort === 'network'
                ? 'Net'
                : causeShort === 'ui-blocking'
                    ? 'Lag'
                    : causeShort === 'readability'
                        ? 'Read'
                        : causeShort === 'broken-state'
                            ? 'Err'
                            : causeShort === 'confusion'
                                ? 'UX'
                                : 'UX';

        return normalizeSubtitle({
            id: `sub_ux_research_event_${eventIndex}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            trackIndex: 1,
            startAt: Number(startAt.toFixed(2)),
            endAt: Number(endAt.toFixed(2)),
            text: `UX E${eventIndex} ${shortLabel}`,
            fontSize: 18,
            fontFamily: '"Noto Sans TC", sans-serif',
            textColor: '#ecfeff',
            backgroundColor: '#0f766e',
            backgroundOpacity: 0.92,
            x: 50,
            y: 20,
            uxResearchMarker: true
        });
    });
}
