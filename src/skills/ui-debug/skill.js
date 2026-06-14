export const uiDebugSkill = {
    id: 'ui-debug',
    name: 'Web診斷',
    shortName: 'Web診斷',
    description: '以資深 UI 工程師視角診斷例外、警告、請求、卡頓與可疑互動。',
    exportFileName: 'test_report.md',
    exportImagePrefix: 'debug_screenshot',
    markdownField: 'uiDebugMD',
    frameField: 'uiDebugFrames',
    panelTitle: 'Web診斷工具',
    primaryActionLabel: '開始全面診斷',
    checkOptions: [
        { key: 'ui', label: 'UI 錯誤檢查', description: '例外、跑版、效能、可讀性與互動異常。' },
        { key: 'security', label: '安全檢查', description: '混合內容、敏感資料暴露與可疑安全風險。' },
        { key: 'translation', label: '翻譯檢查', description: '非預期語系、未翻譯字串與混雜語言。' }
    ],
    checks: [
        'console error / warn / unhandled rejection',
        'fetch / XHR 失敗與慢請求',
        'performance long task 與主執行緒阻塞',
        '點擊後可疑等待與穩定時間',
        '對應畫面截圖、診斷摘要與 Markdown 匯出'
    ],
    defaultThresholds: {
        slowTransitionMs: 800,
        verySlowTransitionMs: 3000,
        slowNetworkMs: 1000,
        verySlowNetworkMs: 1500,
        longTaskMs: 500,
        warningCount: 1,
        domMutationBurst: 20,
        domEventBurst: 3,
        layoutOverflowRatio: 1.08,
        visualBrightnessDelta: 0.18,
        visualSaturationDelta: 0.16,
        visualColorShift: 0.22,
        offscreenElementCount: 3,
        severeOffscreenElementCount: 1
    }
};
