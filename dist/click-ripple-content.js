(function () {
  if (window.__openViscribeContentInstalled) return;
  window.__openViscribeContentInstalled = true;

  let rippleEnabled = false;
  let rippleSessionId = '';
  const MAX_CLICK_LOG = 5000;
  const MAX_DEBUG_LOG = 12000;
  const PAGE_BRIDGE_EVENT = '__openviscribe_page_debug__';
  const HOVER_LOG_MIN_MS = 500;
  const HOVER_LOG_COOLDOWN_MS = 900;
  let activeHover = null;
  let lastHoverSignature = '';
  let lastHoverLoggedAt = 0;
  let lastClickLoggedAt = 0;
  let lastClickLoggedX = null;
  let lastClickLoggedY = null;

  function normalizeText(value) {
    return String(value || '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function splitLines(value) {
    return String(value || '')
      .split(/\r?\n/)
      .map(s => normalizeText(s))
      .filter(Boolean);
  }

  function isLikelyDescription(text) {
    const t = normalizeText(text).toLowerCase();
    if (!t) return false;
    if (t.length > 42) return true;
    const patterns = [
      /^set up /,
      /^create /,
      /^provide /,
      /^plan /,
      /^easily /,
      /^establish /,
      /^enable /
    ];
    return patterns.some(re => re.test(t));
  }

  function getElementTextCandidates(node) {
    if (!node || node.nodeType !== 1) return [];
    const el = node;
    const out = [];

    const aria = normalizeText(el.getAttribute?.('aria-label') || '');
    if (aria) out.push(aria);
    const title = normalizeText(el.getAttribute?.('title') || '');
    if (title) out.push(title);

    const directLines = splitLines(el.innerText || el.textContent || '');
    if (directLines.length > 0) out.push(...directLines.slice(0, 2));

    return out
      .map(v => normalizeText(v))
      .filter(v => v && v.length <= 120);
  }

  function isClickableLike(node) {
    if (!node || node.nodeType !== 1) return false;
    const el = node;
    const tag = (el.tagName || '').toLowerCase();
    if (['button', 'a', 'label', 'summary', 'option', 'input', 'select', 'textarea'].includes(tag)) return true;
    const role = normalizeText(el.getAttribute?.('role') || '').toLowerCase();
    if (['button', 'link', 'tab', 'menuitem', 'menuitemcheckbox', 'option', 'switch', 'checkbox', 'combobox'].includes(role)) return true;
    const ariaHasPopup = normalizeText(el.getAttribute?.('aria-haspopup') || '').toLowerCase();
    if (ariaHasPopup && ariaHasPopup !== 'false') return true;
    if (el.hasAttribute?.('aria-expanded')) return true;
    if (typeof el.onclick === 'function') return true;
    try {
      if (window.getComputedStyle?.(el)?.cursor === 'pointer') return true;
    } catch { }
    return false;
  }

  function getClickTargetSelector() {
    return 'button, a, input, select, textarea, label, summary, option, [role="button"], [role="link"], [role="tab"], [role="menuitem"], [role="menuitemcheckbox"], [role="option"], [role="switch"], [role="checkbox"], [role="combobox"], [aria-haspopup]:not([aria-haspopup="false"]), [aria-expanded]';
  }

  function getNodeRect(node) {
    const rect = node?.getBoundingClientRect?.();
    if (!rect) return null;
    if (!Number.isFinite(rect.left) || !Number.isFinite(rect.top) || !Number.isFinite(rect.width) || !Number.isFinite(rect.height)) return null;
    if (rect.width <= 0 || rect.height <= 0) return null;
    return rect;
  }

  function pointInsideRect(x, y, rect) {
    if (!rect) return false;
    return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
  }

  function scoreClickTargetNode(node, event, depth = 0) {
    if (!node || node.nodeType !== 1) return -Infinity;
    const rect = getNodeRect(node);
    if (!rect) return -Infinity;

    const clickX = Number(event?.clientX);
    const clickY = Number(event?.clientY);
    const containsClick = Number.isFinite(clickX) && Number.isFinite(clickY) ? pointInsideRect(clickX, clickY, rect) : false;
    if (!containsClick) return -Infinity;

    const tag = normalizeText(node.tagName || '').toLowerCase();
    const role = normalizeText(node.getAttribute?.('role') || '').toLowerCase();
    const viewportArea = Math.max(1, window.innerWidth * window.innerHeight);
    const areaRatio = (rect.width * rect.height) / viewportArea;
    const texts = getElementTextCandidates(node);

    let score = 120 - depth * 8;
    if (isClickableLike(node)) score += 70;
    if (['button', 'a', 'label', 'summary'].includes(tag)) score += 65;
    if (['select', 'textarea'].includes(tag)) score += 48;
    if (tag === 'input') score += 34;
    if (['button', 'link', 'tab', 'menuitem', 'menuitemcheckbox', 'switch', 'combobox'].includes(role)) score += 55;
    if (texts.some(text => text.length <= 40)) score += 16;
    if (texts.some(text => text.length > 40)) score -= 12;

    if (rect.width >= 42 && rect.width <= 460) score += 18;
    if (rect.height >= 18 && rect.height <= 120) score += 18;
    if (rect.width < 18 || rect.height < 12) score -= 45;
    if (areaRatio > 0.2) score -= 80;
    else if (areaRatio > 0.08) score -= 30;

    const cursor = window.getComputedStyle?.(node)?.cursor || '';
    if (cursor === 'pointer') score += 14;

    return score;
  }

  function pickClickTargetNode(event) {
    const path = typeof event.composedPath === 'function' ? event.composedPath() : [];
    const candidates = [];
    const seen = new Set();
    const pushCandidate = (node, depth) => {
      if (!node || node.nodeType !== 1) return;
      if (seen.has(node)) return;
      seen.add(node);
      candidates.push({ node, depth });
    };

    for (let i = 0; i < path.length; i++) {
      const node = path[i];
      if (!node || node.nodeType !== 1) continue;
      if (isClickableLike(node)) pushCandidate(node, i);
    }
    const selector = getClickTargetSelector();
    for (let i = 0; i < path.length; i++) {
      const node = path[i];
      if (!node || node.nodeType !== 1 || typeof node.closest !== 'function') continue;
      const anchor = node.closest(selector);
      if (anchor) pushCandidate(anchor, i + 1);
    }

    let bestNode = null;
    let bestScore = -Infinity;
    candidates.forEach(({ node, depth }) => {
      const score = scoreClickTargetNode(node, event, depth);
      if (score > bestScore) {
        bestScore = score;
        bestNode = node;
      }
    });

    if (bestNode) return bestNode;
    return event?.target && event.target.nodeType === 1 ? event.target : null;
  }

  function getHighlightRectForNode(node, clickX, clickY) {
    const vpW = window.innerWidth || 1280;
    const vpH = window.innerHeight || 720;
    // Max acceptable rect area = 25% of viewport; rects larger than this are likely
    // ancestor containers rather than the actual click target.
    const maxArea = vpW * vpH * 0.25;

    let current = node && node.nodeType === 1 ? node : null;
    let bestRect = null;
    let depth = 0;

    while (current && depth < 5) {
      const rect = current.getBoundingClientRect?.();
      if (rect && rect.width >= 14 && rect.height >= 14) {
        const area = rect.width * rect.height;
        if (area <= maxArea) {
          bestRect = {
            left: Number(rect.left.toFixed(2)),
            top: Number(rect.top.toFixed(2)),
            width: Number(rect.width.toFixed(2)),
            height: Number(rect.height.toFixed(2))
          };
          break; // first acceptable rect wins
        }
        // rect is too large — if we haven't found anything yet, keep it as last-resort
        if (!bestRect) {
          bestRect = {
            left: Number(rect.left.toFixed(2)),
            top: Number(rect.top.toFixed(2)),
            width: Number(rect.width.toFixed(2)),
            height: Number(rect.height.toFixed(2))
          };
        }
      }
      current = current.parentElement;
      depth += 1;
    }

    // If the best rect we found is still oversized, synthesize a tighter box
    // centered on the actual click point instead.
    if (bestRect) {
      const area = bestRect.width * bestRect.height;
      if (area > maxArea && Number.isFinite(clickX) && Number.isFinite(clickY)) {
        const synthW = Math.min(Math.max(vpW * 0.12, 96), 260);
        const synthH = Math.min(Math.max(vpH * 0.07, 44), 120);
        return {
          left: Number((clickX - synthW / 2).toFixed(2)),
          top: Number((clickY - synthH / 2).toFixed(2)),
          width: Number(synthW.toFixed(2)),
          height: Number(synthH.toFixed(2))
        };
      }
    }

    return bestRect;
  }

  function pickClickLabel(event) {
    const path = typeof event.composedPath === 'function' ? event.composedPath() : [];
    const candidates = [];

    for (let i = 0; i < path.length; i++) {
      const node = path[i];
      const texts = getElementTextCandidates(node);
      const clickable = isClickableLike(node);
      for (const text of texts) {
        let score = 100 - i * 3;
        if (clickable) score += 30;
        if (isLikelyDescription(text)) score -= 30;
        if (text.length <= 24) score += 12;
        candidates.push({ text, score });
      }
    }

    if (candidates.length === 0) return '';
    candidates.sort((a, b) => b.score - a.score);
    return candidates[0].text.slice(0, 120);
  }

  function pickElementLabel(node) {
    if (!node || node.nodeType !== 1) return '';
    const candidates = [];
    let current = node;
    let depth = 0;
    while (current && current.nodeType === 1 && depth < 4) {
      const texts = getElementTextCandidates(current);
      const clickable = isClickableLike(current);
      for (const text of texts) {
        let score = 100 - depth * 8;
        if (clickable) score += 25;
        if (isLikelyDescription(text)) score -= 25;
        if (text.length <= 28) score += 10;
        candidates.push({ text, score });
      }
      current = current.parentElement;
      depth += 1;
    }
    if (!candidates.length) return '';
    candidates.sort((a, b) => b.score - a.score);
    return candidates[0].text.slice(0, 120);
  }

  function isHoverTrackable(node) {
    if (!node || node.nodeType !== 1) return false;
    if (isClickableLike(node)) return true;
    const el = node;
    if (typeof el.closest === 'function' && el.closest('button, a, [role="button"], [role="link"], [role="tab"], [role="menuitem"], [role="option"], label, summary')) {
      return true;
    }
    return false;
  }

  function getHoverAnchor(node) {
    if (!node || node.nodeType !== 1) return null;
    const el = node;
    if (isClickableLike(el)) return el;
    if (typeof el.closest === 'function') {
      return el.closest('button, a, [role="button"], [role="link"], [role="tab"], [role="menuitem"], [role="option"], label, summary');
    }
    return null;
  }

  function showClickRipple(x, y) {
    const rippleDurationMs = 1300; // 原本約 800ms，延長 0.5s
    const ripple = document.createElement('div');
    ripple.style.position = 'fixed';
    ripple.style.width = '54px';
    ripple.style.height = '54px';
    ripple.style.left = `${x - 27}px`;
    ripple.style.top = `${y - 27}px`;
    ripple.style.border = '7px solid rgba(255, 48, 48, 0.98)';
    ripple.style.borderRadius = '50%';
    ripple.style.pointerEvents = 'none';
    ripple.style.zIndex = '2147483647';
    ripple.style.opacity = '1';
    ripple.style.transform = 'scale(0.5)';
    ripple.style.boxShadow = '0 0 0 2px rgba(255,255,255,0.25), 0 0 16px rgba(255, 48, 48, 0.75)';
    ripple.style.transition = `all ${rippleDurationMs}ms ease-out`;

    (document.body || document.documentElement).appendChild(ripple);
    requestAnimationFrame(() => {
      ripple.style.transform = 'scale(1.6)';
      ripple.style.opacity = '0';
    });
    setTimeout(() => ripple.remove(), rippleDurationMs + 40);
  }

  function appendDebugEvent(payload) {
    if (typeof chrome === 'undefined' || !chrome.storage?.local || !payload) return;
    const event = {
      id: payload.id || `dbg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      sessionId: rippleSessionId || '',
      source: payload.source || 'page',
      href: window.location.href,
      title: document.title || '',
      timestamp: typeof payload.timestamp === 'number' ? payload.timestamp : Date.now(),
      type: payload.type || 'unknown',
      level: payload.level || '',
      text: payload.text || '',
      durationMs: Number.isFinite(Number(payload.durationMs)) ? Number(payload.durationMs) : null,
      status: Number.isFinite(Number(payload.status)) ? Number(payload.status) : null,
      method: payload.method || '',
      url: payload.url || '',
      detail: payload.detail && typeof payload.detail === 'object' ? payload.detail : null
    };
    chrome.storage.local.get({ debugEventLog: [] }, (res) => {
      const prev = Array.isArray(res.debugEventLog) ? res.debugEventLog : [];
      const next = [...prev, event];
      if (next.length > MAX_DEBUG_LOG) next.splice(0, next.length - MAX_DEBUG_LOG);
      chrome.storage.local.set({ debugEventLog: next });
    });
  }

  function finalizeHover(reason) {
    if (!activeHover) return;
    const hover = activeHover;
    activeHover = null;
    const durationMs = Date.now() - hover.startedAt;
    if (durationMs < HOVER_LOG_MIN_MS) return;
    const signature = `${hover.label}|${hover.href}|${reason}`;
    if (signature === lastHoverSignature && (Date.now() - lastHoverLoggedAt) < HOVER_LOG_COOLDOWN_MS) return;
    lastHoverSignature = signature;
    lastHoverLoggedAt = Date.now();
    appendDebugEvent({
      type: 'hover',
      level: 'info',
      text: hover.label || hover.href || 'hover',
      durationMs,
      detail: {
        label: hover.label,
        href: hover.href,
        tagName: hover.tagName,
        role: hover.role,
        reason
      }
    });
  }

  function hoverStartHandler(event) {
    const anchor = getHoverAnchor(event.target);
    if (!isHoverTrackable(anchor)) return;
    const label = pickElementLabel(anchor);
    if (!label && !anchor?.href) return;
    if (activeHover?.element === anchor) return;
    finalizeHover('switch');
    activeHover = {
      element: anchor,
      startedAt: Date.now(),
      label,
      href: normalizeText(anchor?.href || window.location.href),
      tagName: normalizeText(anchor?.tagName || '').toLowerCase(),
      role: normalizeText(anchor?.getAttribute?.('role') || '').toLowerCase()
    };
  }

  function hoverEndHandler(event) {
    if (!activeHover) return;
    const nextTarget = event.relatedTarget;
    if (nextTarget && activeHover.element?.contains?.(nextTarget)) return;
    finalizeHover('leave');
  }

  function installPageDebugBridge() {
    window.addEventListener(PAGE_BRIDGE_EVENT, (event) => {
      appendDebugEvent(event?.detail || null);
    });
  }

  function shouldSkipDuplicateClick(event) {
    const now = Date.now();
    const x = Number(event?.clientX);
    const y = Number(event?.clientY);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
    if (!lastClickLoggedAt) return false;
    const elapsed = now - lastClickLoggedAt;
    const dx = x - Number(lastClickLoggedX);
    const dy = y - Number(lastClickLoggedY);
    return elapsed >= 0 && elapsed <= 450 && Math.sqrt(dx * dx + dy * dy) <= 8;
  }

  function rememberLoggedClick(event) {
    lastClickLoggedAt = Date.now();
    lastClickLoggedX = Number(event?.clientX);
    lastClickLoggedY = Number(event?.clientY);
  }

  function pointerLikeClickHandler(event) {
    if (event?.button !== undefined && event.button !== 0) return;
    if (!Number.isFinite(Number(event?.clientX)) || !Number.isFinite(Number(event?.clientY))) return;
    if (shouldSkipDuplicateClick(event)) return;
    rememberLoggedClick(event);
    finalizeHover('click');
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      const targetNode = pickClickTargetNode(event);
      const targetRect = getHighlightRectForNode(targetNode, event.clientX, event.clientY);
      const clickEvent = {
        id: `clk_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        sessionId: rippleSessionId || '',
        epochMs: Date.now(),
        x: event.clientX,
        y: event.clientY,
        viewportW: window.innerWidth,
        viewportH: window.innerHeight,
        targetText: pickClickLabel(event),
        href: window.location.href,
        targetRect,
        targetTagName: normalizeText(targetNode?.tagName || '').toLowerCase(),
        targetRole: normalizeText(targetNode?.getAttribute?.('role') || '').toLowerCase(),
        eventType: normalizeText(event?.type || 'click').toLowerCase()
      };
      chrome.storage.local.get({ clickEventLog: [] }, (res) => {
        const prev = Array.isArray(res.clickEventLog) ? res.clickEventLog : [];
        const next = [...prev, clickEvent];
        if (next.length > MAX_CLICK_LOG) next.splice(0, next.length - MAX_CLICK_LOG);
        chrome.storage.local.set({ clickEventLog: next });
      });
    }
    // Keep logging click metadata, but render ripple later in the editor/export pipeline
    // so articles can reuse the same recording without baking the ripple into screenshots.
  }

  function setRippleEnabled(enabled) {
    const nextValue = !!enabled;
    if (nextValue === rippleEnabled) return;
    rippleEnabled = nextValue;
    if (rippleEnabled) {
      window.addEventListener('pointerdown', pointerLikeClickHandler, true);
      window.addEventListener('mousedown', pointerLikeClickHandler, true);
      window.addEventListener('click', pointerLikeClickHandler, true);
      window.addEventListener('mouseover', hoverStartHandler, true);
      window.addEventListener('mouseout', hoverEndHandler, true);
      return;
    }
    window.removeEventListener('pointerdown', pointerLikeClickHandler, true);
    window.removeEventListener('mousedown', pointerLikeClickHandler, true);
    window.removeEventListener('click', pointerLikeClickHandler, true);
    window.removeEventListener('mouseover', hoverStartHandler, true);
    window.removeEventListener('mouseout', hoverEndHandler, true);
    finalizeHover('disabled');
  }

  if (typeof chrome === 'undefined' || !chrome.storage?.local) return;

  installPageDebugBridge();

  chrome.storage.local.get({ clickRippleEnabled: false, clickRippleSessionId: '' }, (res) => {
    setRippleEnabled(res.clickRippleEnabled);
    rippleSessionId = normalizeText(res.clickRippleSessionId || '');
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes.clickRippleEnabled) {
      setRippleEnabled(changes.clickRippleEnabled.newValue);
    }
    if (changes.clickRippleSessionId) {
      rippleSessionId = normalizeText(changes.clickRippleSessionId.newValue || '');
    }
  });
})();
