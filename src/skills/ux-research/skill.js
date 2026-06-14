export const uxResearchSkill = {
    id: 'ux-research',
    name: 'UX研究',
    shortName: 'UX研究',
    description: '以專業 UX researcher 視角分析使用者流程、停留、猶豫、可讀性與潛在摩擦點。',
    exportFileName: 'ux_research_report.md',
    exportImagePrefix: 'ux_research_screenshot',
    markdownField: 'uxResearchMD',
    frameField: 'uxResearchFrames',
    panelTitle: 'UX 研究工具',
    primaryActionLabel: '開始 UX 研究分析',
    editorMode: 'ux-research',
    promptTitle: 'UX Flow 研究模式',
    promptLabel: '1. 本次 UX Flow',
    promptDescription: '請明確描述本次研究流程、研究目標、目標使用者與成功任務定義，讓 AI 依照 UX researcher 的角度分析停留、困惑、等待、可讀性與設計摩擦。',
    promptPlaceholder: '例如：iPhone 購買流程。研究目標是找出從商品頁到結帳之間的摩擦點。目標使用者為第一次購買的消費者。成功任務定義為順利加入購物袋、完成付款資訊與送出訂單。',
    defaultThresholds: {
        slowNetworkMs: 1000,
        verySlowNetworkMs: 1500,
        longTaskMs: 500,
        domMutationBurst: 20,
        hesitationMs: 2500,
        longDwellMs: 3500,
        readingOrComparisonMs: 3000,
        hoverCount: 2,
        hoverDurationMs: 1200
    },
    thresholdPresets: [
        {
            key: 'default',
            label: '一般流程',
            description: '適合多數網站與標準任務流程。',
            cameraNotesTemplate: '若有同步錄到臉部或眼睛畫面，建議觀察使用者是否在關鍵 CTA、主要資訊區、提示訊息與導航之間反覆來回掃視。',
            fieldExamples: {
                flowName: '帳號註冊與首次登入流程',
                goal: '找出使用者在建立帳號、驗證信箱與首次登入時的停留點與困惑來源。',
                audience: '第一次接觸此服務的新使用者',
                successSignal: '順利完成註冊、驗證並進入首頁',
                focusAreas: '註冊表單、密碼規則、驗證提示、登入錯誤訊息與首頁引導'
            },
            values: {
                slowNetworkMs: 1000,
                verySlowNetworkMs: 1500,
                longTaskMs: 500,
                domMutationBurst: 20,
                hesitationMs: 2500,
                longDwellMs: 3500,
                readingOrComparisonMs: 3000,
                hoverCount: 2,
                hoverDurationMs: 1200
            }
        },
        {
            key: 'ecommerce',
            label: '電商流程',
            description: '允許比價、閱讀規格與決策停留稍長。',
            cameraNotesTemplate: '若有同步錄到臉部或眼睛畫面，建議特別觀察使用者是否在價格、規格、優惠、運費、交期與 CTA 之間來回比對。',
            fieldExamples: {
                flowName: '筆電選購與加入購物車流程',
                goal: '找出使用者從商品列表到加入購物車之間猶豫或流失的主要原因。',
                audience: '第一次購買高單價商品的消費者',
                successSignal: '順利完成規格比較並加入購物車',
                focusAreas: '價格區塊、規格表、優惠資訊、運費與交期、加入購物車 CTA'
            },
            values: {
                slowNetworkMs: 1200,
                verySlowNetworkMs: 1800,
                longTaskMs: 600,
                domMutationBurst: 24,
                hesitationMs: 3200,
                longDwellMs: 4500,
                readingOrComparisonMs: 4200,
                hoverCount: 2,
                hoverDurationMs: 1500
            }
        },
        {
            key: 'form',
            label: '表單流程',
            description: '更容易抓出欄位理解與提交猶豫。',
            cameraNotesTemplate: '若有同步錄到臉部或眼睛畫面，建議觀察使用者是否在欄位標籤、錯誤訊息、必填提示與送出按鈕之間來回確認。',
            fieldExamples: {
                flowName: '企業帳號申請表單流程',
                goal: '找出使用者在填寫欄位、理解規則與送出申請時的主要阻力。',
                audience: '第一次申請企業帳號的後台管理者',
                successSignal: '順利填完表單並成功送出',
                focusAreas: '欄位標籤、必填提示、驗證錯誤、附件上傳與送出按鈕'
            },
            values: {
                slowNetworkMs: 900,
                verySlowNetworkMs: 1400,
                longTaskMs: 450,
                domMutationBurst: 18,
                hesitationMs: 1800,
                longDwellMs: 2600,
                readingOrComparisonMs: 2400,
                hoverCount: 2,
                hoverDurationMs: 900
            }
        },
        {
            key: 'industrial-automation',
            label: '工業自動化',
            description: '適合 HMI、SCADA、機台控制與參數設定流程，容許操作核對與閱讀較久。',
            cameraNotesTemplate: '若有同步錄到臉部或眼睛畫面，建議觀察操作員是否在警示燈號、設備狀態、參數欄位、趨勢圖與確認按鈕之間反覆核對，判斷是正常安全確認還是真正的操作摩擦。',
            fieldExamples: {
                flowName: '機台配方切換與參數確認流程',
                goal: '找出操作員在切換配方、核對參數與啟動機台前容易停留或誤判的環節。',
                audience: '產線操作員或現場工程師',
                successSignal: '正確完成配方切換、參數確認並成功下發設定',
                focusAreas: '設備狀態、警示訊息、參數表格、趨勢圖、確認按鈕與權限提示'
            },
            values: {
                slowNetworkMs: 1500,
                verySlowNetworkMs: 2500,
                longTaskMs: 800,
                domMutationBurst: 35,
                hesitationMs: 4200,
                longDwellMs: 6500,
                readingOrComparisonMs: 6000,
                hoverCount: 3,
                hoverDurationMs: 2200
            }
        }
    ],
    checks: [
        '依點擊順序重建 UX flow 與關鍵任務路徑',
        '觀察 click 前的 hover 試探與停留，找出選單或熱區設計不清的地方',
        '分析停留時間較長的頁面與互動，區分等待、閱讀、思考與困惑',
        '判斷問題較像效能瓶頸、資訊不清、決策負擔或互動設計摩擦',
        '檢查文字對比、字體大小、版面層級與關鍵 CTA 是否清楚',
        '若有鏡頭或眼動輔助資訊，納入交叉推論但不過度武斷'
    ]
};
