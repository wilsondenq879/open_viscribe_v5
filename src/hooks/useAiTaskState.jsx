import { useCallback, useMemo, useRef, useState } from 'react';
import { getProviderLabel } from '../lib/providerUtils';
import {
    createInitialAiSubtitleStatus,
    createInitialArticleStatus,
    createInitialTtsStatus,
    createInitialUiDebugStatus,
    createInitialUxResearchStatus,
    createProgressText,
    deriveAiSubtitleStatusFromProject
} from '../lib/projectState';

function getStatusCardClasses(phase) {
    return phase === 'success'
        ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-100'
        : phase === 'error'
            ? 'border-red-500/40 bg-red-500/10 text-red-100'
            : phase === 'warning'
                ? 'border-amber-500/40 bg-amber-500/10 text-amber-100'
                : phase === 'running'
                    ? 'border-sky-500/40 bg-sky-500/10 text-sky-100'
                    : 'border-gray-700 bg-gray-900/80 text-gray-200';
}

function formatStatusTime(value) {
    return value ? new Date(value).toLocaleTimeString() : '';
}

function getTaskAccent(task) {
    if (task === 'subtitle') {
        return {
            panel: 'bg-violet-950/95 border-violet-400/40',
            chip: 'text-violet-100/85',
            bar: 'bg-violet-400'
        };
    }
    if (task === 'article') {
        return {
            panel: 'bg-sky-950/95 border-sky-400/40',
            chip: 'text-sky-100/85',
            bar: 'bg-sky-400'
        };
    }
    if (task === 'voice') {
        return {
            panel: 'bg-emerald-950/95 border-emerald-400/40',
            chip: 'text-emerald-100/85',
            bar: 'bg-emerald-400'
        };
    }
    if (task === 'ui-debug') {
        return {
            panel: 'bg-amber-950/95 border-amber-400/40',
            chip: 'text-amber-100/85',
            bar: 'bg-amber-400'
        };
    }
    if (task === 'ux-research') {
        return {
            panel: 'bg-cyan-950/95 border-cyan-400/40',
            chip: 'text-cyan-100/85',
            bar: 'bg-cyan-400'
        };
    }
    return {
        panel: 'bg-slate-900/95 border-sky-400/40',
        chip: 'text-slate-100/85',
        bar: 'bg-sky-400'
    };
}

export default function useAiTaskState({ createAiTaskCancelledError }) {
    const [aiLoading, setAiLoading] = useState(false);
    const [aiProgress, setAiProgress] = useState('');
    const [activeAiTask, setActiveAiTask] = useState('');
    const [aiSubtitleStatus, setAiSubtitleStatus] = useState(createInitialAiSubtitleStatus);
    const [articleStatus, setArticleStatus] = useState(createInitialArticleStatus);
    const [ttsStatus, setTtsStatus] = useState(createInitialTtsStatus);
    const [uiDebugStatus, setUiDebugStatus] = useState(createInitialUiDebugStatus);
    const [uxResearchStatus, setUxResearchStatus] = useState(createInitialUxResearchStatus);
    const aiTaskAbortControllerRef = useRef(null);

    const updateAiSubtitleStatus = useCallback((patch) => {
        setAiSubtitleStatus(prev => ({
            ...prev,
            ...patch,
            updatedAt: Date.now()
        }));
    }, []);

    const updateArticleStatus = useCallback((patch) => {
        setArticleStatus(prev => ({
            ...prev,
            ...patch,
            updatedAt: Date.now()
        }));
    }, []);

    const updateTtsStatus = useCallback((patch) => {
        setTtsStatus(prev => ({
            ...prev,
            ...patch,
            updatedAt: Date.now()
        }));
    }, []);

    const updateUiDebugStatus = useCallback((patch) => {
        setUiDebugStatus(prev => ({
            ...prev,
            ...patch,
            updatedAt: Date.now()
        }));
    }, []);

    const updateUxResearchStatus = useCallback((patch) => {
        setUxResearchStatus(prev => ({
            ...prev,
            ...patch,
            updatedAt: Date.now()
        }));
    }, []);

    const clearAiTaskAbortController = useCallback((controller) => {
        if (!controller || aiTaskAbortControllerRef.current === controller) {
            aiTaskAbortControllerRef.current = null;
        }
    }, []);

    const beginAiTask = useCallback((task) => {
        const controller = new AbortController();
        aiTaskAbortControllerRef.current = controller;
        setActiveAiTask(task);
        setAiLoading(true);
        return controller;
    }, []);

    const finishAiTask = useCallback((controller) => {
        clearAiTaskAbortController(controller);
        setAiLoading(false);
        setAiProgress('');
        setActiveAiTask('');
    }, [clearAiTaskAbortController]);

    const cancelAiTask = useCallback(() => {
        const task = activeAiTask;
        const controller = aiTaskAbortControllerRef.current;
        if (!controller) return;
        controller.abort(createAiTaskCancelledError());
        if (task === 'subtitle') {
            updateAiSubtitleStatus({
                phase: 'warning',
                message: 'AI字幕已取消',
                detail: '本次 AI 字幕任務已手動取消。',
                stageLabel: '已取消'
            });
        } else if (task === 'article') {
            updateArticleStatus({
                phase: 'warning',
                message: '文章生成已取消',
                detail: '本次文章生成任務已手動取消。',
                stageLabel: '已取消'
            });
        } else if (task === 'voice') {
            updateTtsStatus({
                phase: 'warning',
                message: '語音生成已取消',
                detail: '本次 TTS 任務已手動取消。',
                stageLabel: '已取消'
            });
        } else if (task === 'ui-debug') {
            updateUiDebugStatus({
                phase: 'warning',
                message: 'Test Report 已取消',
                detail: '本次 Test Report 分析已手動取消。',
                stageLabel: '已取消'
            });
        } else if (task === 'ux-research') {
            updateUxResearchStatus({
                phase: 'warning',
                message: 'UX研究已取消',
                detail: '本次 UX 研究分析已手動取消。',
                stageLabel: '已取消'
            });
        }
        finishAiTask(controller);
    }, [activeAiTask, createAiTaskCancelledError, finishAiTask, updateAiSubtitleStatus, updateArticleStatus, updateTtsStatus, updateUiDebugStatus, updateUxResearchStatus]);

    const resetDerivedStatusesFromProject = useCallback((nextProjectState, source = 'project') => {
        setAiSubtitleStatus(deriveAiSubtitleStatusFromProject(nextProjectState, source));
        setArticleStatus(createInitialArticleStatus());
        setTtsStatus(createInitialTtsStatus());
        setUiDebugStatus(nextProjectState?.uiDebugMD ? {
            ...createInitialUiDebugStatus(),
            phase: 'success',
            message: '已載入 Test Report',
            detail: '此報告來自現有專案內容，尚未重新分析目前錄影。',
            aiLabel: nextProjectState?.uiDebugReport?.aiSummaryProvider && nextProjectState?.uiDebugReport?.aiSummaryModel
                ? `${getProviderLabel(nextProjectState.uiDebugReport.aiSummaryProvider)} / ${nextProjectState.uiDebugReport.aiSummaryModel}`
                : '',
            progressPercent: 100,
            currentStep: 1,
            totalSteps: 1,
            stageLabel: '已載入現有報告',
            issueCount: Array.isArray(nextProjectState?.uiDebugReport?.issues) ? nextProjectState.uiDebugReport.issues.length : 0,
            slowInteractionCount: Array.isArray(nextProjectState?.uiDebugReport?.interactions)
                ? nextProjectState.uiDebugReport.interactions.filter(item => item?.isProblematic || item?.isSlow).length
                : 0,
            consoleErrorCount: Number(nextProjectState?.uiDebugReport?.consoleErrorCount || 0),
            uiErrorCount: Number(nextProjectState?.uiDebugReport?.uiConsoleErrorCount || 0),
            networkSlowCount: Number(nextProjectState?.uiDebugReport?.networkSlowCount || 0),
            updatedAt: Date.now()
        } : createInitialUiDebugStatus());
        setUxResearchStatus(nextProjectState?.uxResearchMD ? {
            ...createInitialUxResearchStatus(),
            phase: 'success',
            message: '已載入 UX研究報告',
            detail: '此報告來自現有專案內容，尚未重新分析目前錄影。',
            aiLabel: nextProjectState?.uxResearchReport?.aiSummaryProvider && nextProjectState?.uxResearchReport?.aiSummaryModel
                ? `${getProviderLabel(nextProjectState.uxResearchReport.aiSummaryProvider)} / ${nextProjectState.uxResearchReport.aiSummaryModel}`
                : '',
            progressPercent: 100,
            currentStep: 1,
            totalSteps: 1,
            stageLabel: '已載入現有報告',
            frictionCount: Number(nextProjectState?.uxResearchReport?.frictionCount || 0),
            longDwellCount: Number(nextProjectState?.uxResearchReport?.longDwellCount || 0),
            readabilityIssueCount: Number(nextProjectState?.uxResearchReport?.readabilityIssueCount || 0),
            hesitationCount: Number(nextProjectState?.uxResearchReport?.hesitationCount || 0),
            updatedAt: Date.now()
        } : createInitialUxResearchStatus());
    }, []);

    const aiSubtitleStatusClasses = getStatusCardClasses(aiSubtitleStatus.phase);
    const articleStatusClasses = getStatusCardClasses(articleStatus.phase);
    const ttsStatusClasses = getStatusCardClasses(ttsStatus.phase);
    const uiDebugStatusClasses = getStatusCardClasses(uiDebugStatus.phase);
    const uxResearchStatusClasses = getStatusCardClasses(uxResearchStatus.phase);
    const aiSubtitleUpdatedLabel = formatStatusTime(aiSubtitleStatus.updatedAt);
    const articleUpdatedLabel = formatStatusTime(articleStatus.updatedAt);
    const ttsUpdatedLabel = formatStatusTime(ttsStatus.updatedAt);
    const uiDebugUpdatedLabel = formatStatusTime(uiDebugStatus.updatedAt);
    const uxResearchUpdatedLabel = formatStatusTime(uxResearchStatus.updatedAt);

    const activeProgressStatus = useMemo(() => (
        activeAiTask === 'article'
            ? articleStatus
            : activeAiTask === 'ui-debug'
                ? uiDebugStatus
                : activeAiTask === 'ux-research'
                    ? uxResearchStatus
                : activeAiTask === 'subtitle'
                    ? aiSubtitleStatus
                    : activeAiTask === 'voice'
                        ? ttsStatus
                        : null
    ), [activeAiTask, aiSubtitleStatus, articleStatus, ttsStatus, uiDebugStatus, uxResearchStatus]);

    const activeProgressPercent = Math.max(0, Math.min(100, Number(activeProgressStatus?.progressPercent) || 0));
    const hasStructuredProgress = Boolean(activeProgressStatus);
    const activeProgressLabel = activeProgressStatus?.stageLabel
        ? createProgressText(
            activeProgressStatus.currentStep,
            activeProgressStatus.totalSteps,
            activeProgressStatus.stageLabel,
            activeProgressPercent
        )
        : aiProgress;

    const activeTaskAccent = getTaskAccent(activeAiTask);

    const renderTaskProgress = useCallback((status) => {
        const progressPercent = Math.max(0, Math.min(100, Number(status?.progressPercent) || 0));
        if (progressPercent <= 0 && !status?.stageLabel && !status?.aiLabel) return null;
        const accent = getTaskAccent(
            status === aiSubtitleStatus
                ? 'subtitle'
                : status === articleStatus
                    ? 'article'
                    : status === ttsStatus
                        ? 'voice'
                        : status === uiDebugStatus
                            ? 'ui-debug'
                            : status === uxResearchStatus
                                ? 'ux-research'
                            : ''
        );
        return (
            <div className="space-y-1.5">
                {status?.aiLabel && (
                    <div className={`text-[11px] ${accent.chip}`}>AI: {status.aiLabel}</div>
                )}
                <div className="flex items-center justify-between text-[11px] opacity-80">
                    <span>{status?.stageLabel || '處理中'}</span>
                    <span>{progressPercent}%</span>
                </div>
                <div className="h-2 rounded-full bg-black/25 overflow-hidden">
                    <div
                        className={`h-full rounded-full transition-all duration-500 ${accent.bar}`}
                        style={{ width: `${progressPercent}%`, opacity: 0.9 }}
                    />
                </div>
                {status?.totalSteps > 0 && (
                    <div className="text-[11px] opacity-70">步驟 {status.currentStep}/{status.totalSteps}</div>
                )}
            </div>
        );
    }, [aiSubtitleStatus, articleStatus, ttsStatus, uiDebugStatus, uxResearchStatus]);

    return {
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
        aiTaskAbortControllerRef,
        updateAiSubtitleStatus,
        updateArticleStatus,
        updateTtsStatus,
        updateUiDebugStatus,
        updateUxResearchStatus,
        clearAiTaskAbortController,
        beginAiTask,
        finishAiTask,
        cancelAiTask,
        resetDerivedStatusesFromProject,
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
    };
}
