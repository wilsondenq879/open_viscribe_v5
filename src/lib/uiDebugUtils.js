import { UI_DEBUG_TRANSLATION_OPTIONS } from '../constants/appConstants';

export function escapeMarkdownTableCell(value) {
    return String(value ?? '')
        .replace(/\|/g, '\\|')
        .replace(/\n/g, '<br />');
}

export function appendMarkdownTable(headers, rows) {
    const safeHeaders = headers.map(escapeMarkdownTableCell);
    const safeRows = rows.map(row => row.map(escapeMarkdownTableCell));
    let output = `| ${safeHeaders.join(' | ')} |\n`;
    output += `| ${safeHeaders.map(() => '---').join(' | ')} |\n`;
    safeRows.forEach(row => {
        output += `| ${row.join(' | ')} |\n`;
    });
    return `${output}\n`;
}

export function parseBrowserInfo(userAgent) {
    const ua = String(userAgent || '');
    const matchers = [
        { name: 'Edge', regex: /Edg\/([\d.]+)/i },
        { name: 'Chrome', regex: /Chrome\/([\d.]+)/i },
        { name: 'Safari', regex: /Version\/([\d.]+).*Safari/i },
        { name: 'Firefox', regex: /Firefox\/([\d.]+)/i }
    ];
    const matched = matchers.find(item => item.regex.test(ua));
    if (!matched) return 'Unknown';
    const version = ua.match(matched.regex)?.[1] || '';
    return version ? `${matched.name} ${version}` : matched.name;
}

export function parseOsInfo(userAgent, platform) {
    const ua = String(userAgent || '');
    const pf = String(platform || '');
    if (/Windows NT 10\.0/i.test(ua)) return 'Windows 10/11';
    if (/Windows NT 6\.3/i.test(ua)) return 'Windows 8.1';
    if (/Windows/i.test(ua)) return 'Windows';
    const macMatch = ua.match(/Mac OS X ([\d_]+)/i);
    if (macMatch) return `macOS ${macMatch[1].replace(/_/g, '.')}`;
    const iosMatch = ua.match(/OS ([\d_]+) like Mac OS X/i);
    if (iosMatch) return `iOS ${iosMatch[1].replace(/_/g, '.')}`;
    const androidMatch = ua.match(/Android ([\d.]+)/i);
    if (androidMatch) return `Android ${androidMatch[1]}`;
    if (/Linux/i.test(ua) || /Linux/i.test(pf)) return 'Linux';
    return pf || 'Unknown';
}

export function formatEpochMs(epochMs) {
    if (!Number.isFinite(Number(epochMs)) || Number(epochMs) <= 0) return '-';
    return new Date(Number(epochMs)).toISOString();
}

export function formatUiDebugEvidenceLog(issue) {
    const lines = [];
    if (issue.visualToneShift) {
        lines.push(`[visual-tone-shift][brightness=${issue.visualToneShift.globalBrightnessDelta}][saturation=${issue.visualToneShift.globalSaturationDelta}][globalColor=${issue.visualToneShift.globalColorDelta}][maxRegion=${issue.visualToneShift.maxCellColorDelta}] frame palette changed sharply`);
    }
    issue.securityAuditEvents.slice(0, 3).forEach(item => {
        lines.push(`[security-audit][${item.relativeTime.toFixed(2)}s][mixed=${item.detail?.mixedContentCount || 0}][form=${item.detail?.insecureFormCount || 0}][blank=${item.detail?.unsafeBlankLinkCount || 0}][storage=${item.detail?.sensitiveStorageCount || 0}] ${(item.detail?.samples || []).join(' ; ') || item.text || 'security risk'}`);
    });
    issue.translationEvents.slice(0, 3).forEach(item => {
        lines.push(`[translation][${item.relativeTime.toFixed(2)}s][pageLang=${item.detail?.pageLang || 'unknown'}][navLang=${item.detail?.navigatorLanguage || 'unknown'}][untranslated=${item.detail?.untranslatedCount || 0}][translationIssue=${item.detail?.translationIssueCount || 0}] ${(item.detail?.samples || []).join(' ; ') || item.text || 'translation risk'}`);
    });
    issue.contrastEvents.slice(0, 3).forEach(item => {
        lines.push(`[contrast][${item.relativeTime.toFixed(2)}s][low=${item.detail?.lowContrastCount || 0}][severe=${item.detail?.severeContrastCount || 0}] ${(item.detail?.samples || []).map(sample => `${sample.text} (ratio=${sample.ratio})`).join(' ; ') || item.text || 'low text contrast'}`);
    });
    issue.consoleEvents.slice(0, 4).forEach(item => {
        lines.push(`[console][${item.relativeTime.toFixed(2)}s][${item.level || 'log'}][${item.source || 'page'}] ${item.text || '(empty)'}`);
    });
    issue.networkEvents
        .sort((a, b) => (b.durationMs || 0) - (a.durationMs || 0))
        .slice(0, 4)
        .forEach(item => {
            lines.push(`[network][${item.relativeTime.toFixed(2)}s][${item.method || 'GET'}][status=${item.status || ''}][duration=${item.durationMs || 0}ms] ${item.url || '(unknown url)'}`);
        });
    issue.performanceEvents
        .filter(item => (item.detail?.entryType || '') === 'longtask')
        .slice(0, 3)
        .forEach(item => {
            lines.push(`[performance][${item.relativeTime.toFixed(2)}s][longtask=${item.durationMs || 0}ms] ${item.text || 'main thread blocking'}`);
        });
    issue.domEvents
        .slice(0, 3)
        .forEach(item => {
            lines.push(`[dom][${item.relativeTime.toFixed(2)}s][mutations=${item.detail?.mutationCount || 0}] ${item.text || 'high DOM churn'}`);
        });
    issue.layoutEvents
        .slice(0, 3)
        .forEach(item => {
            lines.push(`[layout][${item.relativeTime.toFixed(2)}s][overflow=${item.detail?.overflowRatio || ''}][offscreen=${item.detail?.offscreenWideCount || 0}] ${item.text || 'layout anomaly'}`);
        });
    issue.securityEvents
        .slice(0, 3)
        .forEach(item => {
            lines.push(`[security][${item.relativeTime.toFixed(2)}s][directive=${item.detail?.effectiveDirective || 'violation'}] ${item.text || ''}`);
        });
    issue.resourceErrorEvents
        .slice(0, 3)
        .forEach(item => {
            lines.push(`[resource][${item.relativeTime.toFixed(2)}s][${item.detail?.tagName || 'resource-error'}] ${item.detail?.sourceUrl || item.text || ''}`);
        });
    return lines.length > 0 ? lines.join('\n') : '[info] no detailed evidence log';
}

export function getModuleSpecificIssueContent(moduleKey, issue) {
    if (moduleKey === 'translation') {
        const symptoms = [];
        if (issue.untranslatedCount > 0) symptoms.push(`${issue.untranslatedCount} 筆疑似未翻譯字串`);
        if (issue.translationIssueCount > 0) symptoms.push(`${issue.translationIssueCount} 筆疑似翻譯異常`);
        if (issue.foreignScriptCount > 0) symptoms.push(`${issue.foreignScriptCount} 筆非預期語系文字`);
        if (issue.mixedLanguageCount > 0) symptoms.push(`${issue.mixedLanguageCount} 筆混雜語言 UI`);
        const recommendations = [];
        if (issue.foreignScriptCount > 0 || issue.untranslatedCount > 0) recommendations.push('檢查 i18n 字典覆蓋率與目標語言資源是否完整，避免介面殘留未翻譯字串。');
        if (issue.translationIssueCount > 0 || issue.mixedLanguageCount > 0) recommendations.push('檢查 fallback 語言與文案來源是否一致，避免同一區塊混用不同 locale。');
        const evidenceLines = [];
        issue.translationEvents.slice(0, 3).forEach(item => {
            evidenceLines.push(`[translation][${item.relativeTime.toFixed(2)}s][pageLang=${item.detail?.pageLang || 'unknown'}][navLang=${item.detail?.navigatorLanguage || 'unknown'}][untranslated=${item.detail?.untranslatedCount || 0}][translationIssue=${item.detail?.translationIssueCount || 0}] ${(item.detail?.samples || []).join(' ; ') || item.text || 'translation risk'}`);
        });
        return {
            symptoms,
            suspectedCause: issue.translationIssueCount > 0 || issue.mixedLanguageCount > 0
                ? '頁面上出現混雜語言或不一致文案，可能是 fallback 語系錯誤、翻譯資源版本不同步，或局部字串未走 i18n。'
                : '頁面上出現非預期語系或未翻譯字串，可能是目標語言資源缺漏，或頁面仍顯示原始語言文案。',
            recommendations,
            evidenceLog: evidenceLines.length > 0 ? evidenceLines.join('\n') : '[translation] no module-specific evidence log'
        };
    }

    if (moduleKey === 'security') {
        const symptoms = [];
        if (issue.securityViolationCount > 0) symptoms.push(`${issue.securityViolationCount} 筆 CSP / security violation`);
        if (issue.mixedContentCount > 0) symptoms.push(`${issue.mixedContentCount} 筆 mixed content`);
        if (issue.insecureFormCount > 0) symptoms.push(`${issue.insecureFormCount} 筆不安全表單提交`);
        if (issue.unsafeBlankLinkCount > 0) symptoms.push(`${issue.unsafeBlankLinkCount} 筆 target=_blank 未加 noopener`);
        if (issue.sensitiveStorageCount > 0) symptoms.push(`${issue.sensitiveStorageCount} 筆敏感 storage key`);
        const recommendations = [];
        if (issue.securityViolationCount > 0) recommendations.push('優先檢查 CSP / security violation，確認哪些 script、style 或資源被阻擋。');
        if (issue.mixedContentCount > 0) recommendations.push('移除 HTTPS 頁面中的 HTTP 資源，避免 mixed content 風險。');
        if (issue.insecureFormCount > 0) recommendations.push('避免將含密碼或敏感欄位的表單送到 HTTP 端點，確保全程使用 HTTPS。');
        if (issue.unsafeBlankLinkCount > 0) recommendations.push('對 target=_blank 連結補上 rel=noopener noreferrer。');
        if (issue.sensitiveStorageCount > 0) recommendations.push('重新檢查 localStorage / sessionStorage 是否存了 token、secret 或敏感識別資訊。');
        const evidenceLines = [];
        issue.securityEvents.slice(0, 3).forEach(item => {
            evidenceLines.push(`[security][${item.relativeTime.toFixed(2)}s][directive=${item.detail?.effectiveDirective || 'violation'}] ${item.text || ''}`);
        });
        issue.securityAuditEvents.slice(0, 3).forEach(item => {
            evidenceLines.push(`[security-audit][${item.relativeTime.toFixed(2)}s][mixed=${item.detail?.mixedContentCount || 0}][form=${item.detail?.insecureFormCount || 0}][blank=${item.detail?.unsafeBlankLinkCount || 0}][storage=${item.detail?.sensitiveStorageCount || 0}] ${(item.detail?.samples || []).join(' ; ') || item.text || 'security risk'}`);
        });
        return {
            symptoms,
            suspectedCause: issue.securityViolationCount > 0
                ? '頁面出現安全政策違規，部分腳本或資源可能已被瀏覽器阻擋。'
                : '頁面存在 client-side 安全風險，例如 mixed content、不安全表單、target=_blank 保護不足或敏感資料暴露。',
            recommendations,
            evidenceLog: evidenceLines.length > 0 ? evidenceLines.join('\n') : '[security] no module-specific evidence log'
        };
    }

    const symptoms = [];
    if (issue.pageConsoleErrorCount > 0) symptoms.push(`${issue.pageConsoleErrorCount} 筆 page-level console error`);
    if (issue.uiConsoleErrorCount > 0) symptoms.push(`${issue.uiConsoleErrorCount} 筆 OpenViscribe UI error`);
    if (issue.consoleWarnCount > 0) symptoms.push(`${issue.consoleWarnCount} 筆 console warn`);
    if (issue.resourceErrorCount > 0) symptoms.push(`${issue.resourceErrorCount} 筆 resource load error`);
    if (issue.failedNetworkCount > 0) symptoms.push(`${issue.failedNetworkCount} 筆失敗或異常 network`);
    if (issue.maxNetworkDurationMs > 0) symptoms.push(`最慢 network ${issue.maxNetworkDurationMs}ms`);
    if (issue.maxLongTaskMs > 0) symptoms.push(`最長 long task ${issue.maxLongTaskMs}ms`);
    if (issue.domMutationCount > 0 && issue.problemTags?.includes('ui-instability')) symptoms.push(`DOM mutation burst ${issue.domMutationCount}`);
    if (issue.layoutAnomalyCount > 0) symptoms.push(`${issue.layoutAnomalyCount} 筆 layout anomaly`);
    if (issue.lowContrastCount > 0) symptoms.push(`${issue.lowContrastCount} 筆低文字對比訊號`);
    if (issue.visualToneShift) symptoms.push(`畫面色調/亮度明顯跳變 (color Δ${issue.visualToneShift.globalColorDelta})`);
    if (issue.transitionDurationMs > 0 && issue.problemTags?.includes('slow-transition')) symptoms.push(`整體切換耗時 ${issue.transitionDurationMs}ms`);
    const recommendations = [];
    if (issue.uiConsoleErrorCount > 0) recommendations.push('先排除 OpenViscribe 自己的 UI error，避免工具端錯誤干擾頁面診斷結果。');
    if (issue.pageConsoleErrorCount > 0) recommendations.push('先依 page-level console error 與 unhandled rejection 對齊互動時間。');
    if (issue.layoutAnomalyCount > 0) recommendations.push('檢查 overflow、容器寬度與關鍵區塊 bounding box。');
    if (issue.lowContrastCount > 0) recommendations.push('檢查文字色、背景色與透明度，確保可讀性。');
    if (issue.resourceErrorCount > 0) recommendations.push('檢查載入失敗的 CSS、script 或圖片資源。');
    if (issue.failedNetworkCount > 0) recommendations.push('檢查失敗請求的 status、重試策略與前端錯誤處理。');
    if (issue.maxNetworkDurationMs > 0 && issue.problemTags?.includes('slow-network')) recommendations.push('查看慢請求是否可快取、合併、預取或延後。');
    if ((issue.maxLongTaskMs > 0 || issue.longTaskCount > 0) && issue.problemTags?.includes('main-thread-blocking')) recommendations.push('用 profiler 檢查互動後的 render、effect 與同步計算。');
    if (issue.domMutationCount > 0 && issue.problemTags?.includes('ui-instability')) recommendations.push('檢查是否有不必要的整頁重繪、列表重建或條件渲染震盪。');
    if (issue.visualToneShift) recommendations.push('檢查 theme token、背景層、overlay 與局部區塊樣式覆蓋是否一致。');
    const evidenceLines = [];
    if (issue.visualToneShift) {
        evidenceLines.push(`[visual-tone-shift][brightness=${issue.visualToneShift.globalBrightnessDelta}][saturation=${issue.visualToneShift.globalSaturationDelta}][globalColor=${issue.visualToneShift.globalColorDelta}][maxRegion=${issue.visualToneShift.maxCellColorDelta}] frame palette changed sharply`);
    }
    issue.contrastEvents.slice(0, 3).forEach(item => {
        evidenceLines.push(`[contrast][${item.relativeTime.toFixed(2)}s][low=${item.detail?.lowContrastCount || 0}][severe=${item.detail?.severeContrastCount || 0}] ${(item.detail?.samples || []).map(sample => `${sample.text} (ratio=${sample.ratio})`).join(' ; ') || item.text || 'low text contrast'}`);
    });
    issue.consoleEvents.slice(0, 4).forEach(item => {
        evidenceLines.push(`[console][${item.relativeTime.toFixed(2)}s][${item.level || 'log'}][${item.source || 'page'}] ${item.text || '(empty)'}`);
    });
    issue.networkEvents
        .sort((a, b) => (b.durationMs || 0) - (a.durationMs || 0))
        .slice(0, 4)
        .forEach(item => {
            evidenceLines.push(`[network][${item.relativeTime.toFixed(2)}s][${item.method || 'GET'}][status=${item.status || ''}][duration=${item.durationMs || 0}ms] ${item.url || '(unknown url)'}`);
        });
    issue.performanceEvents
        .filter(item => (item.detail?.entryType || '') === 'longtask')
        .slice(0, 3)
        .forEach(item => {
            evidenceLines.push(`[performance][${item.relativeTime.toFixed(2)}s][longtask=${item.durationMs || 0}ms] ${item.text || 'main thread blocking'}`);
        });
    issue.domEvents.slice(0, 3).forEach(item => {
        evidenceLines.push(`[dom][${item.relativeTime.toFixed(2)}s][mutations=${item.detail?.mutationCount || 0}] ${item.text || 'high DOM churn'}`);
    });
    issue.layoutEvents.slice(0, 3).forEach(item => {
        evidenceLines.push(`[layout][${item.relativeTime.toFixed(2)}s][overflow=${item.detail?.overflowRatio || ''}][offscreen=${item.detail?.offscreenWideCount || 0}] ${item.text || 'layout anomaly'}`);
    });
    return {
        symptoms,
        suspectedCause: issue.suspectedCause,
        recommendations,
        evidenceLog: evidenceLines.length > 0 ? evidenceLines.join('\n') : '[ui] no module-specific evidence log'
    };
}

export function computeFrameVisualMetrics(canvas) {
    if (!canvas) return null;
    const sampleCanvas = document.createElement('canvas');
    sampleCanvas.width = 48;
    sampleCanvas.height = 27;
    const sampleCtx = sampleCanvas.getContext('2d', { willReadFrequently: true });
    if (!sampleCtx) return null;
    sampleCtx.drawImage(canvas, 0, 0, sampleCanvas.width, sampleCanvas.height);
    const imageData = sampleCtx.getImageData(0, 0, sampleCanvas.width, sampleCanvas.height);
    const data = imageData.data;
    const cellsX = 4;
    const cellsY = 3;
    const cellWidth = sampleCanvas.width / cellsX;
    const cellHeight = sampleCanvas.height / cellsY;
    const cells = Array.from({ length: cellsX * cellsY }, () => ({
        count: 0,
        r: 0,
        g: 0,
        b: 0,
        luma: 0,
        sat: 0
    }));
    let totalCount = 0;
    let totalR = 0;
    let totalG = 0;
    let totalB = 0;
    let totalLuma = 0;
    let totalSat = 0;

    for (let y = 0; y < sampleCanvas.height; y += 1) {
        for (let x = 0; x < sampleCanvas.width; x += 1) {
            const idx = (y * sampleCanvas.width + x) * 4;
            const alpha = data[idx + 3] / 255;
            if (alpha < 0.2) continue;
            const r = data[idx] / 255;
            const g = data[idx + 1] / 255;
            const b = data[idx + 2] / 255;
            const max = Math.max(r, g, b);
            const min = Math.min(r, g, b);
            const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
            const sat = max === 0 ? 0 : (max - min) / max;
            const cellX = Math.min(cellsX - 1, Math.floor(x / cellWidth));
            const cellY = Math.min(cellsY - 1, Math.floor(y / cellHeight));
            const cell = cells[cellY * cellsX + cellX];

            totalCount += 1;
            totalR += r;
            totalG += g;
            totalB += b;
            totalLuma += luma;
            totalSat += sat;

            cell.count += 1;
            cell.r += r;
            cell.g += g;
            cell.b += b;
            cell.luma += luma;
            cell.sat += sat;
        }
    }

    if (totalCount === 0) return null;

    return {
        avgR: totalR / totalCount,
        avgG: totalG / totalCount,
        avgB: totalB / totalCount,
        avgLuma: totalLuma / totalCount,
        avgSat: totalSat / totalCount,
        cells: cells.map(cell => ({
            avgR: cell.count > 0 ? cell.r / cell.count : 0,
            avgG: cell.count > 0 ? cell.g / cell.count : 0,
            avgB: cell.count > 0 ? cell.b / cell.count : 0,
            avgLuma: cell.count > 0 ? cell.luma / cell.count : 0,
            avgSat: cell.count > 0 ? cell.sat / cell.count : 0
        }))
    };
}

export function analyzeVisualToneShift(beforeMetrics, afterMetrics, thresholds) {
    if (!beforeMetrics || !afterMetrics) return null;

    const globalBrightnessDelta = Math.abs(afterMetrics.avgLuma - beforeMetrics.avgLuma);
    const globalSaturationDelta = Math.abs(afterMetrics.avgSat - beforeMetrics.avgSat);
    const globalColorDelta = Math.sqrt(
        Math.pow(afterMetrics.avgR - beforeMetrics.avgR, 2) +
        Math.pow(afterMetrics.avgG - beforeMetrics.avgG, 2) +
        Math.pow(afterMetrics.avgB - beforeMetrics.avgB, 2)
    );

    let maxCellColorDelta = 0;
    let maxCellBrightnessDelta = 0;
    for (let i = 0; i < Math.min(beforeMetrics.cells.length, afterMetrics.cells.length); i += 1) {
        const beforeCell = beforeMetrics.cells[i];
        const afterCell = afterMetrics.cells[i];
        const cellColorDelta = Math.sqrt(
            Math.pow(afterCell.avgR - beforeCell.avgR, 2) +
            Math.pow(afterCell.avgG - beforeCell.avgG, 2) +
            Math.pow(afterCell.avgB - beforeCell.avgB, 2)
        );
        const cellBrightnessDelta = Math.abs(afterCell.avgLuma - beforeCell.avgLuma);
        maxCellColorDelta = Math.max(maxCellColorDelta, cellColorDelta);
        maxCellBrightnessDelta = Math.max(maxCellBrightnessDelta, cellBrightnessDelta);
    }

    const isSignificant =
        globalBrightnessDelta >= thresholds.visualBrightnessDelta
        || globalSaturationDelta >= thresholds.visualSaturationDelta
        || globalColorDelta >= thresholds.visualColorShift
        || maxCellColorDelta >= thresholds.visualColorShift * 1.2
        || maxCellBrightnessDelta >= thresholds.visualBrightnessDelta * 1.2;

    if (!isSignificant) return null;

    return {
        globalBrightnessDelta: Number(globalBrightnessDelta.toFixed(3)),
        globalSaturationDelta: Number(globalSaturationDelta.toFixed(3)),
        globalColorDelta: Number(globalColorDelta.toFixed(3)),
        maxCellColorDelta: Number(maxCellColorDelta.toFixed(3)),
        maxCellBrightnessDelta: Number(maxCellBrightnessDelta.toFixed(3))
    };
}

export function getTranslationOption(code) {
    return UI_DEBUG_TRANSLATION_OPTIONS.find(option => option.code === code) || UI_DEBUG_TRANSLATION_OPTIONS[0];
}
