export const compositeTutorialSkill = {
    id: 'composite-tutorial',
    workflowCategory: 'video',
    name: '綜合教學影片',
    shortName: '綜合教學',
    description: '理解螢幕錄影、實拍片段、PIP 與疊層說明，將混合教學素材整理成段落、字幕與文章。',
    exportFileName: 'composite_tutorial_article.md',
    exportImagePrefix: 'composite_screenshot',
    markdownField: 'tutorialMD',
    frameField: 'capturedFrames',
    panelTitle: '綜合教學工具 & AI',
    primaryActionLabel: 'AI 場景分析',
    articleActionLabel: '生成教學文章',
    exportTitle: '綜合教學文件 (.md) 與相關截圖',
    editorMode: 'tutorial',
    promptTitle: 'Composite Tutorial 模式',
    promptLabel: '1. 本次影片教學 brief',
    promptDescription: '描述影片中的螢幕操作、實拍示範、PIP 重點與希望保留的教學節奏，讓 AI 依段落整理主流程與輔助示範。',
    promptPlaceholder: '例如：先實拍插上電源與燈號亮起，再切到後台設定 Wi-Fi。右下角 PIP 會同步示範按住設備配對鍵。請把主畫面操作與實機示範的對應關係整理清楚，字幕保持簡短，文章步驟要可重做。',
    articlePerspectiveEnabled: true,
    subtitleWorkflow: 'composite-segmented',
    articleWorkflow: 'composite-tutorial',
    checks: [
        '將混合素材切成段落，而不是只做逐秒字幕',
        '判斷主畫面、PIP 與疊層說明之間的教學關係',
        '若是螢幕錄影，優先依滑鼠點擊與畫面變化整理主操作',
        '若 PIP 重要，將同步動作轉成字幕、旁白與文章步驟'
    ]
};
