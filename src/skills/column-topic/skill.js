export const columnTopicSkill = {
    id: 'column-topic',
    name: '專欄主題模式',
    shortName: '專欄主題',
    description: '不依賴紅色 ripple，改由 AI 判讀瀏覽內容與使用者 prompt，輸出第一人稱深度專欄文章。',
    exportFileName: 'column_topic_article.md',
    exportImagePrefix: 'column_screenshot',
    markdownField: 'columnTopicMD',
    frameField: 'capturedFrames',
    panelTitle: '專欄主題工具 & AI',
    primaryActionLabel: 'AI主題分析',
    articleActionLabel: '生成專欄',
    exportTitle: '專欄主題文章 (.md) 與相關截圖',
    editorMode: 'tutorial',
    promptTitle: '專欄主題模式',
    promptLabel: '1. 本次專欄題目 / 寫作 prompt',
    promptDescription: 'AI 會先看你錄到的瀏覽內容與畫面脈絡，再結合這裡的 prompt 組裝第一人稱深度專欄。可以直接指定觀點、立場、對比對象、讀者族群，或貼上參考連結。',
    promptPlaceholder: '例如：我想從「AI 摘要正在改變資訊消費方式」這個角度切入，文章改用第一人稱科技專欄寫法，深入談我剛剛瀏覽到的產品頁、媒體頁與使用情境，不要寫成教學步驟；如果有數據脈絡可補 Mermaid 圖表更好。',
    articlePerspectiveEnabled: false,
    subtitleWorkflow: 'semantic-column',
    articleWorkflow: 'editorial-column',
    checks: [
        '逐秒擷取畫面並判讀瀏覽內容，不依賴紅色 ripple 點擊',
        '把錄影過程切成數個主題片段，產生可編修的內容錨點字幕',
        '文章固定走第一人稱深度專欄，不輸出教學步驟',
        '若 AI 有整理到可量化資訊，會盡量附上 Mermaid 圖表與資料摘要'
    ]
};
