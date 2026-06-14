export function stripPromptLikeFragments(text) {
    return String(text || '')
        .replace(/^(請|麻煩|記得|務必|幫我|生成|撰寫|寫一篇|寫成)\s*/gi, '')
        .replace(/(請特別強調|特別強調|請強調|強調|請注意|不要寫成|不要提到|不要用|避免用|改成|寫成|描述成).*/gi, '')
        .replace(/(超過|至少|不少於)\s*\d+\s*(字|word|words).*/gi, '')
        .replace(/(文章|內容|段落|標題|語氣|口吻|篇幅|字數|SEO|關鍵字).*/gi, '')
        .replace(/[，,、；;:：]\s*(請特別強調|特別強調|請強調|強調|請注意|不要寫成|不要提到|不要用|避免用|改成|寫成|描述成).*/gi, '')
        .replace(/\s{2,}/g, ' ')
        .replace(/[。.!?？]+$/g, '')
        .trim();
}

export function looksLikePromptInstruction(text) {
    const normalized = String(text || '').trim();
    if (!normalized) return true;
    return /^(請|麻煩|記得|務必|幫我|生成|撰寫|寫一篇|寫成)/i.test(normalized)
        || /(超過|至少|不少於)\s*\d+\s*(字|word|words)/i.test(normalized)
        || /(文章|內容|段落|標題|語氣|口吻|篇幅|字數|SEO|關鍵字)/i.test(normalized)
        || /(不要|避免|改成|寫成|提到|強調|保留|加入|使用)/i.test(normalized);
}

export function looksLikeUiActionTopic(text) {
    const normalized = String(text || '').trim();
    if (!normalized) return true;
    return /^(關閉|開啟|打開|點擊|按下|選擇|切換|返回|分享|下一步|下一張|上一張|確認|完成|送出|儲存|刪除|新增|編輯|觀看|查看|前往|進入|退出|登入|登出)$/i.test(normalized)
        || /^(關閉|開啟|打開|點擊|按下|選擇|切換|返回|分享|下一步|下一張|上一張|確認|完成|送出|儲存|刪除|新增|編輯|觀看|查看|前往|進入|退出|登入|登出)(至|到)?[\u4e00-\u9fffA-Za-z0-9 ]{0,20}$/i.test(normalized)
        || /^(close|open|click|tap|select|switch|back|share|next|previous|confirm|save|delete|add|edit|view|go to|enter|exit|login|logout)$/i.test(normalized);
}

export function isUsableArticleTopic(topic) {
    const cleaned = stripPromptLikeFragments(topic);
    if (!cleaned || cleaned.length < 2 || cleaned.length > 32) return false;
    if (looksLikePromptInstruction(cleaned)) return false;
    if (looksLikeUiActionTopic(cleaned)) return false;
    return true;
}

export function extractRequestedArticleWordCount(text) {
    const normalized = String(text || '');
    const rangeMatch = normalized.match(/(\d{3,5})\s*(?:字|words?)\s*(?:左右|上下|以內|內|附近)?/i);
    if (rangeMatch) {
        const count = Number(rangeMatch[1]);
        if (Number.isFinite(count) && count >= 300 && count <= 5000) return count;
    }
    return null;
}

export function sanitizeGeneratedArticleTitle(title, fallbackTitle = '產品介紹與設定指南') {
    let cleaned = stripPromptLikeFragments(title);
    if (!cleaned) return fallbackTitle;

    cleaned = cleaned
        .replace(/\s{2,}/g, ' ')
        .replace(/[。.!?？]+$/g, '')
        .trim();

    if (!cleaned || cleaned.length < 2 || looksLikePromptInstruction(cleaned)) return fallbackTitle;
    return cleaned;
}

export function areProjectSnapshotsEqual(a, b) {
    try {
        return JSON.stringify(a) === JSON.stringify(b);
    } catch (e) {
        return false;
    }
}
