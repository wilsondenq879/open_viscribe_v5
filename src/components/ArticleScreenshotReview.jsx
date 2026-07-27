import React, { useState, useCallback, useRef } from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// HighlightBox — draggable + resizable red rectangle overlay
//
// Props:
//   rectPct  – { xPct, yPct, wPct, hPct } all in 0-1 fractions of the
//              image container dimensions (CSS percentage space).
//   onChange – (newRectPct) => void
// ─────────────────────────────────────────────────────────────────────────────
function HighlightBox({ rectPct, onChange }) {
    const boxRef = useRef(null);

    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

    const handleMouseDown = (e, handle) => {
        e.preventDefault();
        e.stopPropagation();

        const container = boxRef.current?.parentElement;
        if (!container) return;

        const cRect = container.getBoundingClientRect();
        const startX = e.clientX;
        const startY = e.clientY;
        const snap = { ...rectPct };
        const MIN_W = 0.025;
        const MIN_H = 0.025;

        const onMove = (me) => {
            const dx = (me.clientX - startX) / cRect.width;
            const dy = (me.clientY - startY) / cRect.height;
            let { xPct, yPct, wPct, hPct } = snap;

            if (handle === 'move') {
                xPct = clamp(xPct + dx, 0, 1 - wPct);
                yPct = clamp(yPct + dy, 0, 1 - hPct);
            } else {
                if (handle.includes('w')) {
                    const nx = clamp(xPct + dx, 0, xPct + wPct - MIN_W);
                    wPct = wPct - (nx - xPct);
                    xPct = nx;
                }
                if (handle.includes('e')) {
                    wPct = clamp(wPct + dx, MIN_W, 1 - xPct);
                }
                if (handle.includes('n')) {
                    const ny = clamp(yPct + dy, 0, yPct + hPct - MIN_H);
                    hPct = hPct - (ny - yPct);
                    yPct = ny;
                }
                if (handle.includes('s')) {
                    hPct = clamp(hPct + dy, MIN_H, 1 - yPct);
                }
            }

            onChange({ xPct, yPct, wPct, hPct });
        };

        const onUp = () => {
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
        };

        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
    };

    const HANDLES = [
        { id: 'nw', s: { top: -5,   left: -5 },                                cursor: 'nw-resize' },
        { id: 'n',  s: { top: -5,   left: '50%', transform: 'translateX(-50%)' }, cursor: 'n-resize' },
        { id: 'ne', s: { top: -5,   right: -5 },                                cursor: 'ne-resize' },
        { id: 'e',  s: { top: '50%', right: -5,  transform: 'translateY(-50%)' }, cursor: 'e-resize' },
        { id: 'se', s: { bottom: -5, right: -5 },                               cursor: 'se-resize' },
        { id: 's',  s: { bottom: -5, left: '50%', transform: 'translateX(-50%)' }, cursor: 's-resize' },
        { id: 'sw', s: { bottom: -5, left: -5 },                                cursor: 'sw-resize' },
        { id: 'w',  s: { top: '50%', left: -5,   transform: 'translateY(-50%)' }, cursor: 'w-resize' },
    ];

    return (
        <div
            ref={boxRef}
            style={{
                position: 'absolute',
                left:   `${rectPct.xPct * 100}%`,
                top:    `${rectPct.yPct * 100}%`,
                width:  `${rectPct.wPct * 100}%`,
                height: `${rectPct.hPct * 100}%`,
                border: '2.5px solid rgba(255, 40, 40, 0.95)',
                boxShadow: '0 0 0 1px rgba(0,0,0,0.55), 0 0 12px rgba(255,40,40,0.3)',
                cursor: 'move',
                userSelect: 'none',
                zIndex: 20,
                boxSizing: 'border-box',
            }}
            onMouseDown={(e) => handleMouseDown(e, 'move')}
        >
            {HANDLES.map(h => (
                <div
                    key={h.id}
                    style={{
                        position: 'absolute',
                        width: 10,
                        height: 10,
                        background: 'rgba(255, 40, 40, 0.9)',
                        border: '1.5px solid #fff',
                        borderRadius: 2,
                        cursor: h.cursor,
                        zIndex: 21,
                        ...h.s,
                    }}
                    onMouseDown={(e) => { e.stopPropagation(); handleMouseDown(e, h.id); }}
                />
            ))}
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// ArticleScreenshotReview — 右側滑出面板
//
// Props:
//   steps     – array of {
//                 subIndex, stepName, description, stepTime, effectiveClickId,
//                 candidates: CandidateWrapper[],   // { rawFrame, previewFrame, highlightRectPct, frameId, relativeTime, isLikelyLoading }
//                 selectedIdx: number
//               }
//   onConfirm – ({ rawFrame, adjustedRectPct }[]) => void
//   onCancel  – () => void
// ─────────────────────────────────────────────────────────────────────────────
export default function ArticleScreenshotReview({ steps, onConfirm, onCancel }) {
    const [stepIdx, setStepIdx] = useState(0);
    // per-step selected candidate index
    const [selections, setSelections] = useState(() =>
        steps.map(s => Math.max(0, s.selectedIdx ?? 0))
    );
    // per-step user-adjusted rect (null = use candidate's default highlightRectPct)
    const [adjustedRects, setAdjustedRects] = useState(() => steps.map(() => null));

    const currentStep     = steps[stepIdx] ?? null;
    const currentCandidates = currentStep?.candidates ?? [];
    const currentSelIdx   = selections[stepIdx] ?? 0;
    const currentCandidate = currentCandidates[currentSelIdx] ?? null;

    // Support both CandidateWrapper objects and legacy bare frame objects
    const rawFrame  = currentCandidate?.rawFrame || currentCandidate || null;
    const imgSrc    = rawFrame ? (rawFrame.hdData || rawFrame.aiData || '') : '';

    const baseHighlightRectPct   = currentCandidate?.highlightRectPct ?? null;
    const activeHighlightRectPct = adjustedRects[stepIdx] ?? baseHighlightRectPct;
    const hasAdjustment          = adjustedRects[stepIdx] !== null;
    const usesManualHighlightFallback = currentCandidate?.highlightSource === 'manual-fallback';

    // ── Navigation ──────────────────────────────────────────────────────────
    const prevStep = () => setStepIdx(i => Math.max(0, i - 1));
    const nextStep = () => setStepIdx(i => Math.min(steps.length - 1, i + 1));

    const prevCandidate = useCallback(() => {
        if (currentCandidates.length <= 1) return;
        setSelections(prev => {
            const next = [...prev];
            next[stepIdx] = (currentSelIdx - 1 + currentCandidates.length) % currentCandidates.length;
            return next;
        });
    }, [currentCandidates.length, currentSelIdx, stepIdx]);

    const nextCandidate = useCallback(() => {
        if (currentCandidates.length <= 1) return;
        setSelections(prev => {
            const next = [...prev];
            next[stepIdx] = (currentSelIdx + 1) % currentCandidates.length;
            return next;
        });
    }, [currentCandidates.length, currentSelIdx, stepIdx]);

    // ── Highlight box ────────────────────────────────────────────────────────
    const handleBoxChange = useCallback((newRect) => {
        setAdjustedRects(prev => {
            const next = [...prev];
            next[stepIdx] = newRect;
            return next;
        });
    }, [stepIdx]);

    const handleBoxReset = () => {
        setAdjustedRects(prev => {
            const next = [...prev];
            next[stepIdx] = null;
            return next;
        });
    };

    // ── Confirm ──────────────────────────────────────────────────────────────
    const handleConfirm = () => {
        const result = steps.map((step, i) => {
            const idx       = selections[i];
            const candidate = step.candidates[idx] ?? step.candidates[0] ?? null;
            // Support both wrapper and legacy bare-frame candidates
            const raw       = candidate?.rawFrame || candidate || null;
            const rectPct   = adjustedRects[i] ?? candidate?.highlightRectPct ?? null;
            return { rawFrame: raw, adjustedRectPct: rectPct };
        });
        onConfirm(result);
    };

    if (!currentStep) {
        return (
            <>
                <div className="fixed inset-0 z-[9998] bg-black/50" />
                <div className="fixed inset-y-0 right-0 z-[9999] flex w-[560px] max-w-[calc(100vw-24px)] flex-col border-l border-gray-800 bg-gray-950 shadow-2xl">
                    <div className="flex items-center justify-between gap-3 border-b border-gray-800 px-5 py-4">
                        <div>
                            <p className="text-sm font-semibold text-white">截圖選擇</p>
                            <p className="mt-0.5 text-xs text-gray-500">目前沒有可審核的教學步驟</p>
                        </div>
                        <button
                            onClick={onCancel}
                            className="rounded-lg p-2 text-gray-400 transition hover:bg-gray-800 hover:text-white"
                            aria-label="關閉"
                        >
                            <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M2 2l12 12M14 2L2 14" />
                            </svg>
                        </button>
                    </div>
                    <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
                        <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-amber-400/25 bg-amber-400/10 text-2xl text-amber-200">!</div>
                        <h2 className="mt-5 text-lg font-semibold text-white">沒有偵測到可用步驟</h2>
                        <p className="mt-2 max-w-sm text-sm leading-6 text-gray-400">
                            你仍可略過截圖審核並完成文章；文章會保留目前可取得的內容，不會讓流程停在等待狀態。
                        </p>
                    </div>
                    <div className="flex items-center justify-end gap-2 border-t border-gray-800 px-5 py-4">
                        <button
                            onClick={onCancel}
                            className="rounded-lg bg-gray-800 px-4 py-2 text-sm text-gray-300 transition hover:bg-gray-700"
                        >
                            取消
                        </button>
                        <button
                            onClick={() => onConfirm([])}
                            className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-blue-500"
                        >
                            略過審核並生成文章
                        </button>
                    </div>
                </div>
            </>
        );
    }

    return (
        <>
            {/* backdrop */}
            <div className="fixed inset-0 z-[9998] bg-black/40" onClick={onCancel} />

            {/* slide-out panel */}
            <div className="fixed top-0 right-0 bottom-0 z-[9999] w-[920px] max-w-[calc(100vw-24px)] flex flex-col bg-gray-950 border-l border-gray-800 shadow-2xl">

                {/* ── Header ── */}
                <div className="flex-none px-5 py-3 border-b border-gray-800 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                        <p className="text-white font-semibold text-sm">截圖選擇</p>
                        <p className="text-gray-500 text-xs mt-0.5">
                            {steps.length} 個步驟　選好後確認生成文章
                        </p>
                    </div>
                    <button
                        onClick={onCancel}
                        className="flex-none p-1.5 rounded-lg hover:bg-gray-800 text-gray-400 hover:text-white transition"
                        aria-label="關閉"
                    >
                        <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M2 2l12 12M14 2L2 14" />
                        </svg>
                    </button>
                </div>

                {/* ── Step navigator ── */}
                <div className="flex-none px-5 py-2 border-b border-gray-800 flex items-center gap-2">
                    <button
                        onClick={prevStep}
                        disabled={stepIdx === 0}
                        className="p-1 rounded hover:bg-gray-800 disabled:opacity-30 text-gray-400 hover:text-white transition"
                    >
                        <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M10 3L5 8l5 5" />
                        </svg>
                    </button>

                    <div className="flex-1 flex items-center gap-1.5 overflow-x-auto py-1 scrollbar-none">
                        {steps.map((s, i) => {
                            const hasCandidates = s.candidates.length > 0;
                            const isActive      = i === stepIdx;
                            return (
                                <button
                                    key={i}
                                    onClick={() => setStepIdx(i)}
                                    title={s.stepName || `步驟 ${s.subIndex}`}
                                    className={`flex-none w-6 h-6 rounded-full text-[10px] font-bold transition
                                        ${isActive
                                            ? 'bg-blue-600 text-white ring-2 ring-blue-400/50'
                                            : hasCandidates
                                                ? 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                                                : 'bg-gray-800 text-gray-600 hover:bg-gray-700'
                                        }`}
                                >
                                    {s.subIndex ?? i + 1}
                                </button>
                            );
                        })}
                    </div>

                    <button
                        onClick={nextStep}
                        disabled={stepIdx === steps.length - 1}
                        className="p-1 rounded hover:bg-gray-800 disabled:opacity-30 text-gray-400 hover:text-white transition"
                    >
                        <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M6 3l5 5-5 5" />
                        </svg>
                    </button>
                </div>

                {/* ── Current step info ── */}
                <div className="flex-none px-5 py-3 border-b border-gray-800">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="bg-blue-600 text-white text-[10px] font-bold px-2 py-0.5 rounded">
                            步驟 {currentStep.subIndex ?? stepIdx + 1}
                        </span>
                        <span className="text-gray-500 text-xs font-mono">
                            {Number(currentStep.stepTime || 0).toFixed(2)}s
                        </span>
                        {currentCandidates.length === 0 && (
                            <span className="text-amber-500 text-xs">無候選截圖</span>
                        )}
                        {activeHighlightRectPct && (
                            <span className={`${usesManualHighlightFallback ? 'text-amber-300' : 'text-red-400'} text-[10px] font-medium ml-auto flex items-center gap-1 shrink-0`}>
                                <svg className="w-3 h-3" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
                                    <rect x="2" y="2" width="12" height="12" rx="1.5" />
                                </svg>
                                {usesManualHighlightFallback ? '未取得點擊座標，請拖曳紅框定位' : '拖曳紅框微調位置'}
                            </span>
                        )}
                    </div>
                    <p className="text-white text-sm font-medium leading-snug line-clamp-2">
                        {currentStep.stepName || '（無標題）'}
                    </p>
                    {currentStep.description && (
                        <p className="text-gray-500 text-xs mt-0.5 line-clamp-2">
                            {currentStep.description}
                        </p>
                    )}
                </div>

                {/* ── Screenshot preview ── */}
                <div className="flex-1 min-h-0 flex flex-col items-center justify-center px-4 py-3 gap-3 overflow-y-auto">
                    {currentCandidates.length === 0 ? (
                        <div className="w-full flex flex-col items-center justify-center gap-2 py-10 rounded-xl bg-gray-900 border border-dashed border-gray-700">
                            <svg className="w-8 h-8 text-gray-700" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                                <rect x="3" y="3" width="18" height="18" rx="2" />
                                <path d="M3 15l5-5 4 4 3-3 6 6" />
                            </svg>
                            <p className="text-gray-500 text-xs text-center">
                                此步驟無候選截圖<br />生成時將自動從時間軸挑選
                            </p>
                        </div>
                    ) : (
                        <>
                            {/* main preview with interactive highlight overlay */}
                            <div className="relative w-full rounded-xl overflow-hidden bg-gray-900 border border-gray-800 select-none">
                                {imgSrc ? (
                                    <img
                                        key={`${stepIdx}-${currentSelIdx}`}
                                        src={`data:image/jpeg;base64,${imgSrc}`}
                                        alt={`${Number(rawFrame?.relativeTime || 0).toFixed(2)}s`}
                                        className="w-full h-auto block"
                                        draggable={false}
                                    />
                                ) : (
                                    <div className="w-full aspect-video flex items-center justify-center">
                                        <span className="text-gray-600 text-xs">無預覽</span>
                                    </div>
                                )}

                                {/* Interactive highlight box overlay */}
                                {imgSrc && activeHighlightRectPct && (
                                    <HighlightBox
                                        rectPct={activeHighlightRectPct}
                                        onChange={handleBoxChange}
                                    />
                                )}

                                {/* time badge */}
                                <div className="absolute bottom-2 left-2 bg-black/70 rounded px-2 py-0.5 pointer-events-none">
                                    <span className="text-[11px] text-gray-200 font-mono">
                                        {Number(rawFrame?.relativeTime || 0).toFixed(2)}s
                                    </span>
                                </div>

                                {/* loading warning */}
                                {rawFrame?.isLikelyLoading && (
                                    <div className="absolute top-2 left-2 bg-amber-600/90 text-white text-[10px] font-bold px-2 py-0.5 rounded pointer-events-none">
                                        ⚠ 載入中畫面
                                    </div>
                                )}

                                {/* AI recommended badge */}
                                {currentSelIdx === currentStep.selectedIdx && (
                                    <div className="absolute top-2 right-2 bg-blue-700/80 text-white text-[10px] font-bold px-2 py-0.5 rounded pointer-events-none">
                                        AI 推薦
                                    </div>
                                )}
                            </div>

                            {/* Highlight box status + reset */}
                            {baseHighlightRectPct && (
                                <div className="flex items-center gap-2 w-full">
                                    <span className="text-gray-500 text-xs flex-1">
                                        {hasAdjustment
                                            ? '✎ 已手動調整紅框'
                                            : usesManualHighlightFallback
                                                ? '● 已放入預設紅框 — 請拖曳到實際點擊位置'
                                                : '● AI 自動定位紅框 — 可拖曳或拉角微調'}
                                    </span>
                                    {hasAdjustment && (
                                        <button
                                            onClick={handleBoxReset}
                                            className="text-xs px-2.5 py-1 rounded bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white transition whitespace-nowrap"
                                        >
                                            重設 AI 定位
                                        </button>
                                    )}
                                </div>
                            )}

                            {/* candidate navigation */}
                            <div className="flex items-center gap-4 w-full">
                                <button
                                    onClick={prevCandidate}
                                    disabled={currentCandidates.length <= 1}
                                    className="flex-none flex items-center gap-1 px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 disabled:opacity-30 text-gray-300 text-xs transition"
                                >
                                    <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
                                        <path d="M10 3L5 8l5 5" />
                                    </svg>
                                    上一張
                                </button>

                                {/* dots */}
                                <div className="flex-1 flex items-center justify-center gap-1.5 flex-wrap">
                                    {currentCandidates.map((f, fi) => (
                                        <button
                                            key={fi}
                                            onClick={() => setSelections(prev => {
                                                const next = [...prev];
                                                next[stepIdx] = fi;
                                                return next;
                                            })}
                                            className={`w-2 h-2 rounded-full transition ${fi === currentSelIdx ? 'bg-blue-500 scale-125' : 'bg-gray-600 hover:bg-gray-400'}`}
                                        />
                                    ))}
                                </div>

                                <button
                                    onClick={nextCandidate}
                                    disabled={currentCandidates.length <= 1}
                                    className="flex-none flex items-center gap-1 px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 disabled:opacity-30 text-gray-300 text-xs transition"
                                >
                                    下一張
                                    <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
                                        <path d="M6 3l5 5-5 5" />
                                    </svg>
                                </button>
                            </div>

                            <p className="text-gray-600 text-xs">
                                {currentSelIdx + 1} / {currentCandidates.length} 張候選截圖
                            </p>
                        </>
                    )}
                </div>

                {/* ── Footer ── */}
                <div className="flex-none px-5 py-3 border-t border-gray-800 flex items-center gap-2">
                    {stepIdx < steps.length - 1 ? (
                        <button
                            onClick={nextStep}
                            className="flex-1 py-2 rounded-lg bg-gray-800 text-gray-200 text-sm font-medium hover:bg-gray-700 transition flex items-center justify-center gap-1"
                        >
                            下一步驟
                            <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M6 3l5 5-5 5" />
                            </svg>
                        </button>
                    ) : (
                        <div className="flex-1" />
                    )}
                    <button
                        onClick={onCancel}
                        className="px-4 py-2 rounded-lg bg-gray-800 text-gray-400 text-sm hover:bg-gray-700 transition"
                    >
                        取消
                    </button>
                    <button
                        onClick={handleConfirm}
                        className="px-5 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-500 transition whitespace-nowrap"
                    >
                        {currentCandidates.length === 0 ? '略過此截圖並生成文章' : '確認並生成文章'}
                    </button>
                </div>
            </div>
        </>
    );
}
