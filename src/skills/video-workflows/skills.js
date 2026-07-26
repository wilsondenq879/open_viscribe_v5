const shared = {
    markdownField: 'tutorialMD',
    frameField: 'capturedFrames',
    editorMode: 'tutorial',
    articlePerspectiveEnabled: true,
    panelTitle: '影片工作流 & AI',
    primaryActionLabel: '產生字幕',
    articleActionLabel: '生成文案 / 文章',
    workflowCategory: 'video'
};

export const videoWorkflowSkills = [
    {
        ...shared,
        id: 'shorts', name: 'Shorts / Reels', shortName: 'Shorts',
        description: '直式短片工作流：先整理高密度字幕與節奏，再加入關鍵字、CTA 與精華 Contents。',
        exportFileName: 'shorts_copy.md', exportImagePrefix: 'shorts_frame', exportTitle: 'Shorts 文案 (.md) 與相關截圖',
        promptTitle: '短影音企劃', promptLabel: '1. 影片主題與觀眾', promptDescription: '輸入這支短片要讓觀眾立刻理解的重點、平台與 CTA。AI 會以短句字幕與高節奏內容為方向。',
        promptPlaceholder: '例如：30 秒說清楚如何把網站部署到全球節點；觀眾是剛入門的工程師；結尾引導訂閱。',
        workflowDefaults: { aspectRatio: '9:16', presetId: 'creator', templateId: 'hf-creator-cta', cardDuration: 2.4 }
    },
    {
        ...shared,
        id: 'long-form', name: 'YouTube 長片', shortName: '長片',
        description: '長片工作流：以章節、旁白、B-roll 與可重複使用的 Contents 整理完整敘事。',
        exportFileName: 'youtube_article.md', exportImagePrefix: 'youtube_frame', exportTitle: 'YouTube 影片文章 (.md) 與相關截圖',
        promptTitle: '長片企劃', promptLabel: '1. 主題、受眾與主張', promptDescription: '說明影片要回答的問題、受眾與章節脈絡；AI 會以可延展的字幕、段落與文章結構處理。',
        promptPlaceholder: '例如：比較三種 AI 影片工作流，受眾是內容創作者，需有開場觀點、三個章節與結論。',
        workflowDefaults: { aspectRatio: '16:9', presetId: 'signal', templateId: 'hf-clean-product', cardDuration: 3.8 }
    },
    {
        ...shared,
        id: 'product-launch', name: '產品發表', shortName: '產品發表',
        description: '產品／功能展示工作流：把功能、畫面、成效與 CTA 做成清晰、可剪輯的發表影片。',
        exportFileName: 'product_launch_copy.md', exportImagePrefix: 'product_frame', exportTitle: '產品發表文案 (.md) 與相關截圖',
        promptTitle: '產品發表 Brief', promptLabel: '1. 產品、亮點與 CTA', promptDescription: '輸入產品名稱、主要功能、受眾與想要的下一步行動；適合搭配產品展示、裝置與資料圖素材。',
        promptPlaceholder: '例如：推出 OpenViscribe Agent Workflow；受眾為影片團隊；亮點是 agent 直接編輯時間軸；CTA 是申請試用。',
        workflowDefaults: { aspectRatio: '16:9', presetId: 'editorial', templateId: 'hf-bold-announcement', cardDuration: 3.2 }
    },
    {
        ...shared,
        id: 'podcast', name: 'Podcast / 訪談', shortName: '訪談',
        description: '訪談工作流：整理說話重點、來賓識別、章節與可分享的精華段落。',
        exportFileName: 'podcast_show_notes.md', exportImagePrefix: 'podcast_frame', exportTitle: 'Podcast Show Notes (.md) 與相關截圖',
        promptTitle: '訪談主題', promptLabel: '1. 來賓、主題與精華方向', promptDescription: '填入受訪者、討論主題與希望剪出的觀點；可搭配乾淨 lower third 與章節卡。',
        promptPlaceholder: '例如：與產品設計師討論 AI 協作剪輯；保留三個可獨立分享的觀點與來賓介紹。',
        workflowDefaults: { aspectRatio: '16:9', presetId: 'editorial', templateId: 'hf-editorial-story', cardDuration: 4.2 }
    },
    {
        ...shared,
        id: 'social-ad', name: '社群廣告', shortName: '社群廣告',
        description: '社群廣告工作流：短句訊息、明確賣點與 CTA，可快速產生不同平台版本。',
        exportFileName: 'social_ad_copy.md', exportImagePrefix: 'social_ad_frame', exportTitle: '社群廣告文案 (.md) 與相關截圖',
        promptTitle: '廣告 Brief', promptLabel: '1. 受眾、賣點與行動', promptDescription: '描述受眾、單一核心賣點、優惠與 CTA。素材庫可加入產品卡、數字、跑馬燈與 CTA。',
        promptPlaceholder: '例如：面向新創團隊，主打不用 Azure 就能讓 agent 生成影片，CTA 為預約產品示範。',
        workflowDefaults: { aspectRatio: '9:16', presetId: 'creator', templateId: 'hf-creator-cta', cardDuration: 2.6 }
    },
    {
        ...shared,
        id: 'blank-video', name: '空白影片專案', shortName: '空白專案',
        description: '從空白時間軸開始。可以完全手動剪輯，或隨時交給 Codex／agent 建議字幕、文案與動態素材。',
        exportFileName: 'video_notes.md', exportImagePrefix: 'video_frame', exportTitle: '影片筆記 (.md) 與相關截圖',
        promptTitle: '影片 Brief', promptLabel: '1. 想做什麼影片？', promptDescription: '描述目的、觀眾與風格。這個模式不強制錄影、字幕或文章流程，所有工具都可選用。',
        promptPlaceholder: '例如：做一支 45 秒產品概念片，節奏要極簡、使用深色科技風與全球地圖素材。',
        workflowDefaults: { aspectRatio: '16:9', presetId: 'signal', templateId: 'hf-clean-product', cardDuration: 3.5, designEnabled: false }
    }
];
