(function () {
  if (window.__openViscribePageBridgeInstalled) return;
  window.__openViscribePageBridgeInstalled = true;

  const PAGE_BRIDGE_EVENT = '__openviscribe_page_debug__';

  function emit(payload) {
    try {
      window.dispatchEvent(new CustomEvent(PAGE_BRIDGE_EVENT, {
        detail: {
          source: 'page',
          ...payload
        }
      }));
    } catch (err) {}
  }

  function toText(args) {
    try {
      return args.map((item) => {
        if (typeof item === 'string') return item;
        return JSON.stringify(item);
      }).join(' ').slice(0, 2000);
    } catch (err) {
      return String(args && args[0] ? args[0] : '');
    }
  }

  ['log', 'warn', 'error'].forEach((level) => {
    const original = console[level];
    console[level] = function (...args) {
      emit({
        type: 'console',
        level,
        text: toText(args),
        timestamp: Date.now()
      });
      return original.apply(this, args);
    };
  });

  window.addEventListener('error', (event) => {
    const target = event?.target;
    const isResourceError = target && target !== window && typeof target.tagName === 'string';
    if (isResourceError) {
      emit({
        type: 'resource-error',
        level: 'error',
        text: `${target.tagName} failed to load`,
        timestamp: Date.now(),
        detail: {
          tagName: target.tagName || '',
          sourceUrl: target.src || target.href || ''
        }
      });
      return;
    }
    emit({
      type: 'console',
      level: 'error',
      text: event.message || 'Unhandled error',
      timestamp: Date.now(),
      detail: {
        source: event.filename || '',
        lineno: event.lineno || 0,
        colno: event.colno || 0
      }
    });
  }, true);

  window.addEventListener('unhandledrejection', (event) => {
    let text = 'Unhandled promise rejection';
    try {
      text = event?.reason?.message || String(event.reason);
    } catch (err) {}
    emit({
      type: 'console',
      level: 'error',
      text,
      timestamp: Date.now()
    });
  });

  window.addEventListener('securitypolicyviolation', (event) => {
    emit({
      type: 'security',
      level: 'error',
      text: event.violatedDirective || 'securitypolicyviolation',
      timestamp: Date.now(),
      detail: {
        blockedURI: event.blockedURI || '',
        effectiveDirective: event.effectiveDirective || '',
        originalPolicy: event.originalPolicy || '',
        sourceFile: event.sourceFile || '',
        disposition: event.disposition || ''
      }
    });
  });

  if (window.fetch) {
    const originalFetch = window.fetch.bind(window);
    window.fetch = async (...args) => {
      const startedAt = performance.now();
      const startedEpoch = Date.now();
      const requestUrl = String(args?.[0]?.url || args?.[0] || '');
      const method = String(args?.[1]?.method || args?.[0]?.method || 'GET').toUpperCase();
      try {
        const response = await originalFetch(...args);
        emit({
          type: 'network',
          level: response.ok ? 'info' : 'warn',
          method,
          url: requestUrl,
          status: response.status,
          durationMs: Math.round(performance.now() - startedAt),
          timestamp: startedEpoch
        });
        return response;
      } catch (error) {
        emit({
          type: 'network',
          level: 'error',
          method,
          url: requestUrl,
          status: 0,
          durationMs: Math.round(performance.now() - startedAt),
          timestamp: startedEpoch,
          text: error?.message || 'Fetch failed'
        });
        throw error;
      }
    };
  }

  if (window.XMLHttpRequest) {
    const OriginalXHR = window.XMLHttpRequest;
    function WrappedXHR() {
      const xhr = new OriginalXHR();
      let startedAt = 0;
      let startedEpoch = 0;
      let method = 'GET';
      let url = '';
      const open = xhr.open;
      xhr.open = function (...args) {
        method = String(args?.[0] || 'GET').toUpperCase();
        url = String(args?.[1] || '');
        return open.apply(this, args);
      };
      xhr.addEventListener('loadstart', () => {
        startedAt = performance.now();
        startedEpoch = Date.now();
      });
      xhr.addEventListener('loadend', () => {
        emit({
          type: 'network',
          level: xhr.status >= 400 ? 'warn' : 'info',
          method,
          url,
          status: xhr.status,
          durationMs: startedAt ? Math.round(performance.now() - startedAt) : null,
          timestamp: startedEpoch || Date.now()
        });
      });
      xhr.addEventListener('error', () => {
        emit({
          type: 'network',
          level: 'error',
          method,
          url,
          status: xhr.status || 0,
          durationMs: startedAt ? Math.round(performance.now() - startedAt) : null,
          timestamp: startedEpoch || Date.now(),
          text: 'XHR failed'
        });
      });
      return xhr;
    }
    WrappedXHR.prototype = OriginalXHR.prototype;
    window.XMLHttpRequest = WrappedXHR;
  }

  if (window.PerformanceObserver) {
    try {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          emit({
            type: 'performance',
            level: entry.entryType === 'longtask' ? 'warn' : 'info',
            text: entry.name || entry.entryType,
            durationMs: Math.round(entry.duration || 0),
            timestamp: Date.now(),
            detail: {
              entryType: entry.entryType,
              startTime: Math.round(entry.startTime || 0)
            }
          });
        }
      });
      observer.observe({ entryTypes: ['longtask', 'resource', 'paint'] });
    } catch (err) {}
  }

  let mutationCount = 0;
  let addedNodes = 0;
  let removedNodes = 0;
  let attributeChanges = 0;
  let textChanges = 0;
  let flushTimer = null;

  function flushMutations() {
    flushTimer = null;
    if (!mutationCount) return;
    emit({
      type: 'dom',
      level: mutationCount >= 20 ? 'warn' : 'info',
      text: 'DOM mutation burst',
      timestamp: Date.now(),
      detail: {
        mutationCount,
        addedNodes,
        removedNodes,
        attributeChanges,
        textChanges
      }
    });
    mutationCount = 0;
    addedNodes = 0;
    removedNodes = 0;
    attributeChanges = 0;
    textChanges = 0;
  }

  try {
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutationCount += 1;
        if (mutation.type === 'childList') {
          addedNodes += mutation.addedNodes?.length || 0;
          removedNodes += mutation.removedNodes?.length || 0;
        } else if (mutation.type === 'attributes') {
          attributeChanges += 1;
        } else if (mutation.type === 'characterData') {
          textChanges += 1;
        }
      });
      if (!flushTimer) flushTimer = setTimeout(flushMutations, 400);
    });
    observer.observe(document.documentElement || document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      characterData: true
    });
  } catch (err) {}

  let lastLayoutSignature = '';
  let lastLayoutEmitAt = 0;

  function rectArea(rect) {
    const width = Math.max(0, rect?.width || 0);
    const height = Math.max(0, rect?.height || 0);
    return width * height;
  }

  function intersectionArea(a, b) {
    const left = Math.max(a.left, b.left);
    const right = Math.min(a.right, b.right);
    const top = Math.max(a.top, b.top);
    const bottom = Math.min(a.bottom, b.bottom);
    return Math.max(0, right - left) * Math.max(0, bottom - top);
  }

  function isAncestorOf(ancestor, node) {
    if (!ancestor || !node || ancestor === node) return false;
    try {
      return ancestor.contains(node);
    } catch (err) {
      return false;
    }
  }

  function isVisibleCandidate(el, rect, viewportW, viewportH) {
    if (!(el instanceof HTMLElement)) return false;
    if (rect.width < 24 || rect.height < 16) return false;
    if (rect.bottom < -viewportH * 0.35 || rect.top > viewportH * 1.35) return false;
    const style = window.getComputedStyle(el);
    if (!style) return false;
    if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity || '1') < 0.05) return false;
    if (style.position === 'fixed' && rect.width < 120 && rect.height < 80) return false;
    return true;
  }

  function getMediaDistortionScore(el, rect) {
    try {
      const tagName = String(el?.tagName || '').toLowerCase();
      if (!['img', 'video', 'canvas', 'iframe'].includes(tagName)) return 0;
      if (rect.width < 120 || rect.height < 80) return 0;
      let naturalRatio = 0;
      if (tagName === 'img') {
        naturalRatio = (el.naturalWidth > 0 && el.naturalHeight > 0) ? (el.naturalWidth / el.naturalHeight) : 0;
      } else if (tagName === 'video') {
        naturalRatio = (el.videoWidth > 0 && el.videoHeight > 0) ? (el.videoWidth / el.videoHeight) : 0;
      } else if (tagName === 'canvas') {
        naturalRatio = (el.width > 0 && el.height > 0) ? (el.width / el.height) : 0;
      }
      if (!naturalRatio || !Number.isFinite(naturalRatio)) return 0;
      const renderedRatio = rect.width / Math.max(rect.height, 1);
      return Math.abs(renderedRatio - naturalRatio) / naturalRatio;
    } catch (err) {
      return 0;
    }
  }

  function parseColorToRgb(color) {
    const raw = String(color || '').trim();
    const match = raw.match(/rgba?\(([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+))?\)/i);
    if (!match) return null;
    return {
      r: Number(match[1]) / 255,
      g: Number(match[2]) / 255,
      b: Number(match[3]) / 255,
      a: match[4] == null ? 1 : Number(match[4])
    };
  }

  function toLinear(value) {
    return value <= 0.03928 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4);
  }

  function getRelativeLuminance(rgb) {
    if (!rgb) return 1;
    return 0.2126 * toLinear(rgb.r) + 0.7152 * toLinear(rgb.g) + 0.0722 * toLinear(rgb.b);
  }

  function getContrastRatio(foreground, background) {
    const l1 = getRelativeLuminance(foreground);
    const l2 = getRelativeLuminance(background);
    const lighter = Math.max(l1, l2);
    const darker = Math.min(l1, l2);
    return (lighter + 0.05) / (darker + 0.05);
  }

  function getEffectiveBackgroundColor(el) {
    let current = el;
    let depth = 0;
    while (current && depth < 6) {
      const style = window.getComputedStyle(current);
      const bg = parseColorToRgb(style?.backgroundColor);
      if (bg && bg.a > 0.9) return bg;
      current = current.parentElement;
      depth += 1;
    }
    const bodyBg = parseColorToRgb(window.getComputedStyle(document.body)?.backgroundColor);
    return bodyBg || { r: 1, g: 1, b: 1, a: 1 };
  }

  function analyzeTextContrast() {
    try {
      const candidates = Array.from(document.querySelectorAll('body *')).slice(0, 900);
      let lowContrastCount = 0;
      let severeContrastCount = 0;
      const samples = [];

      candidates.forEach((el) => {
        if (!(el instanceof HTMLElement)) return;
        const text = String(el.innerText || el.textContent || '').trim().replace(/\s+/g, ' ');
        if (!text || text.length < 2) return;
        if (el.children.length > 0 && text.length > 80) return;

        const style = window.getComputedStyle(el);
        if (!style || style.display === 'none' || style.visibility === 'hidden') return;
        const fontSize = parseFloat(style.fontSize || '0');
        if (!Number.isFinite(fontSize) || fontSize < 11) return;
        const rect = el.getBoundingClientRect();
        if (rect.width < 24 || rect.height < 12) return;

        const fg = parseColorToRgb(style.color);
        const bg = getEffectiveBackgroundColor(el);
        if (!fg || !bg) return;

        const ratio = getContrastRatio(fg, bg);
        if (ratio < 3.2) {
          lowContrastCount += 1;
          if (ratio < 2.4) severeContrastCount += 1;
          if (samples.length < 3) {
            samples.push({
              text: text.slice(0, 60),
              ratio: Number(ratio.toFixed(2)),
              fontSize: Number(fontSize.toFixed(1))
            });
          }
        }
      });

      if (lowContrastCount === 0) return;

      emit({
        type: 'contrast',
        level: severeContrastCount > 0 ? 'warn' : 'info',
        text: 'Possible low text contrast',
        timestamp: Date.now(),
        detail: {
          lowContrastCount,
          severeContrastCount,
          samples
        }
      });
    } catch (err) {}
  }

  function analyzeSecurityRisks() {
    try {
      const samples = [];
      let mixedContentCount = 0;
      let insecureFormCount = 0;
      let unsafeBlankLinkCount = 0;
      let sensitiveStorageCount = 0;

      if (window.location.protocol === 'https:') {
        const resourceNodes = Array.from(document.querySelectorAll('script[src], link[href], img[src], iframe[src], audio[src], video[src]'));
        resourceNodes.forEach((node) => {
          const url = node.getAttribute('src') || node.getAttribute('href') || '';
          if (/^http:\/\//i.test(url)) {
            mixedContentCount += 1;
            if (samples.length < 3) samples.push(`mixed-content: ${url.slice(0, 120)}`);
          }
        });
      }

      Array.from(document.forms || []).forEach((form) => {
        const hasPassword = !!form.querySelector('input[type="password"]');
        const action = form.getAttribute('action') || '';
        if (hasPassword && /^http:\/\//i.test(action)) {
          insecureFormCount += 1;
          if (samples.length < 3) samples.push(`insecure-form: ${action.slice(0, 120)}`);
        }
      });

      Array.from(document.querySelectorAll('a[target="_blank"]')).forEach((link) => {
        const rel = String(link.getAttribute('rel') || '').toLowerCase();
        if (!rel.includes('noopener') && !rel.includes('noreferrer')) {
          unsafeBlankLinkCount += 1;
          if (samples.length < 3) samples.push(`target=_blank without rel: ${(link.href || '').slice(0, 120)}`);
        }
      });

      const sensitivePattern = /(token|secret|password|passwd|auth|bearer|session|jwt|apikey|api_key|cookie)/i;
      [window.localStorage, window.sessionStorage].forEach((storage) => {
        if (!storage) return;
        for (let i = 0; i < storage.length; i += 1) {
          const key = storage.key(i) || '';
          if (!sensitivePattern.test(key)) continue;
          const value = String(storage.getItem(key) || '');
          if (!value) continue;
          sensitiveStorageCount += 1;
          if (samples.length < 3) samples.push(`storage: ${key.slice(0, 80)}`);
        }
      });

      if (!mixedContentCount && !insecureFormCount && !unsafeBlankLinkCount && !sensitiveStorageCount) return;

      emit({
        type: 'security-audit',
        level: (mixedContentCount > 0 || insecureFormCount > 0 || sensitiveStorageCount > 0) ? 'warn' : 'info',
        text: 'Possible client-side security risks',
        timestamp: Date.now(),
        detail: {
          mixedContentCount,
          insecureFormCount,
          unsafeBlankLinkCount,
          sensitiveStorageCount,
          samples
        }
      });
    } catch (err) {}
  }

  function detectScriptCategory(text) {
    if (/[\uac00-\ud7af]/.test(text)) return 'hangul';
    if (/[\u3040-\u30ff]/.test(text)) return 'japanese';
    if (/[\u0400-\u04ff]/.test(text)) return 'cyrillic';
    if (/[\u0600-\u06ff]/.test(text)) return 'arabic';
    if (/[\u0E00-\u0E7F]/.test(text)) return 'thai';
    if (/[\u4e00-\u9fff]/.test(text)) return 'han';
    if (/[A-Za-z]/.test(text)) return 'latin';
    return 'other';
  }

  function expectedScriptFromLang(lang) {
    const normalized = String(lang || '').toLowerCase();
    if (normalized.startsWith('ko')) return 'hangul';
    if (normalized.startsWith('ja')) return 'japanese';
    if (normalized.startsWith('zh')) return 'han';
    if (normalized.startsWith('en')) return 'latin';
    return '';
  }

  function analyzeTranslationQuality() {
    try {
      const pageLang = document.documentElement.lang || navigator.language || '';
      const expectedScript = expectedScriptFromLang(pageLang);
      const candidates = Array.from(document.querySelectorAll('body *')).slice(0, 900);
      const samples = [];
      const untranslatedSamples = [];
      const translationIssueSamples = [];
      const entries = [];
      let foreignScriptCount = 0;
      let mixedLanguageCount = 0;
      let untranslatedCount = 0;
      let translationIssueCount = 0;

      candidates.forEach((el) => {
        if (!(el instanceof HTMLElement)) return;
        const style = window.getComputedStyle(el);
        if (!style || style.display === 'none' || style.visibility === 'hidden') return;
        const rect = el.getBoundingClientRect();
        if (rect.width < 30 || rect.height < 14) return;
        const text = String(el.innerText || el.textContent || '').trim().replace(/\s+/g, ' ');
        if (!text || text.length < 2 || text.length > 80) return;

        const category = detectScriptCategory(text);
        const hasMixedScripts = /[\uac00-\ud7af]/.test(text) && /[A-Za-z]/.test(text)
          || /[\u4e00-\u9fff]/.test(text) && /[A-Za-z]{4,}/.test(text)
          || /[\u3040-\u30ff]/.test(text) && /[A-Za-z]{4,}/.test(text);
        const looksLikeRawKey = /^[a-z0-9]+([._-][a-z0-9]+){1,}$/i.test(text) || /\{\{.+\}\}/.test(text) || /\b(todo|lorem ipsum|tbd)\b/i.test(text);

        if (expectedScript && category !== 'other' && category !== expectedScript) {
          foreignScriptCount += 1;
          untranslatedCount += 1;
          if (samples.length < 3) samples.push(`foreign-script: ${text.slice(0, 60)}`);
          if (untranslatedSamples.length < 5) untranslatedSamples.push(text.slice(0, 80));
        } else if (!expectedScript && ['hangul', 'japanese', 'cyrillic', 'arabic'].includes(category)) {
          foreignScriptCount += 1;
          untranslatedCount += 1;
          if (samples.length < 3) samples.push(`foreign-script: ${text.slice(0, 60)}`);
          if (untranslatedSamples.length < 5) untranslatedSamples.push(text.slice(0, 80));
        }

        if (hasMixedScripts) {
          mixedLanguageCount += 1;
          translationIssueCount += 1;
          if (samples.length < 3) samples.push(`mixed-language: ${text.slice(0, 60)}`);
          if (translationIssueSamples.length < 5) translationIssueSamples.push(text.slice(0, 80));
        }

        if (looksLikeRawKey) {
          untranslatedCount += 1;
          if (samples.length < 3) samples.push(`raw-key: ${text.slice(0, 60)}`);
          if (untranslatedSamples.length < 5) untranslatedSamples.push(text.slice(0, 80));
        }

        if (entries.length < 20) {
          entries.push({
            text: text.slice(0, 80),
            category,
            hasMixedScripts,
            looksLikeRawKey
          });
        }
      });

      if (!foreignScriptCount && !mixedLanguageCount && !untranslatedCount && !translationIssueCount) return;

      emit({
        type: 'translation',
        level: (foreignScriptCount >= 2 || untranslatedCount >= 2 || translationIssueCount >= 1) ? 'warn' : 'info',
        text: 'Possible untranslated or mixed-language UI',
        timestamp: Date.now(),
        detail: {
          pageLang,
          navigatorLanguage: navigator.language || '',
          expectedScript: expectedScript || 'unknown',
          foreignScriptCount,
          mixedLanguageCount,
          untranslatedCount,
          translationIssueCount,
          samples,
          untranslatedSamples,
          translationIssueSamples,
          entries
        }
      });
    } catch (err) {}
  }

  function analyzeLayout() {
    try {
      const viewportW = window.innerWidth || 0;
      const viewportH = window.innerHeight || 0;
      const docEl = document.documentElement;
      const body = document.body;
      if (!viewportW || !viewportH || !docEl || !body) return;

      const scrollWidth = Math.max(docEl.scrollWidth || 0, body.scrollWidth || 0);
      const scrollHeight = Math.max(docEl.scrollHeight || 0, body.scrollHeight || 0);
      const overflowRatio = viewportW > 0 ? scrollWidth / viewportW : 1;
      const verticalOverflowRatio = viewportH > 0 ? scrollHeight / viewportH : 1;
      const candidates = Array.from(document.querySelectorAll('body *')).slice(0, 700);
      let offscreenWideCount = 0;
      let veryWideCount = 0;
      let offscreenTallCount = 0;
      let clippedLargeCount = 0;
      let distortedMediaCount = 0;
      const overlapCandidates = [];
      const viewportRect = {
        left: 0,
        top: 0,
        right: viewportW,
        bottom: viewportH,
        width: viewportW,
        height: viewportH
      };

      candidates.forEach((el) => {
        if (!(el instanceof HTMLElement)) return;
        const rect = el.getBoundingClientRect();
        if (!isVisibleCandidate(el, rect, viewportW, viewportH)) return;
        if (rect.right > viewportW + 80 || rect.left < -80) offscreenWideCount += 1;
        if (rect.width > viewportW * 0.95 && rect.left < -20) veryWideCount += 1;
        if (rect.bottom > viewportH + 120 || rect.top < -120) offscreenTallCount += 1;

        const visibleArea = intersectionArea(rect, viewportRect);
        const totalArea = rectArea(rect);
        const visibleRatio = totalArea > 0 ? visibleArea / totalArea : 0;
        const isLargeBlock = rect.width >= viewportW * 0.28 && rect.height >= viewportH * 0.12;
        if (isLargeBlock && visibleRatio > 0 && visibleRatio < 0.55) clippedLargeCount += 1;

        const distortion = getMediaDistortionScore(el, rect);
        if (distortion >= 0.35) distortedMediaCount += 1;

        if (isLargeBlock && visibleRatio > 0.2) {
          overlapCandidates.push({ el, rect, area: totalArea });
        }
      });

      let overlapCount = 0;
      for (let i = 0; i < overlapCandidates.length; i += 1) {
        for (let j = i + 1; j < overlapCandidates.length; j += 1) {
          const a = overlapCandidates[i];
          const b = overlapCandidates[j];
          if (isAncestorOf(a.el, b.el) || isAncestorOf(b.el, a.el)) continue;
          const overlapArea = intersectionArea(a.rect, b.rect);
          if (overlapArea <= 0) continue;
          const smallerArea = Math.min(a.area, b.area);
          const overlapRatio = smallerArea > 0 ? overlapArea / smallerArea : 0;
          if (overlapRatio >= 0.28) overlapCount += 1;
          if (overlapCount >= 2) break;
        }
        if (overlapCount >= 2) break;
      }

      const reasons = [];
      if (overflowRatio > 1.04) reasons.push('horizontal-overflow');
      if (verticalOverflowRatio > 4.5) reasons.push('vertical-overflow');
      if (offscreenWideCount >= 2) reasons.push('offscreen-horizontal-blocks');
      if (offscreenTallCount >= 3) reasons.push('offscreen-vertical-blocks');
      if (veryWideCount >= 1) reasons.push('oversized-wide-block');
      if (clippedLargeCount >= 2) reasons.push('clipped-large-blocks');
      if (overlapCount >= 1) reasons.push('overlapping-large-blocks');
      if (distortedMediaCount >= 1) reasons.push('distorted-media');

      const signature = [
        reasons.join(','),
        Math.round(overflowRatio * 100),
        Math.round(verticalOverflowRatio * 100),
        offscreenWideCount,
        offscreenTallCount,
        clippedLargeCount,
        overlapCount,
        distortedMediaCount
      ].join('|');
      const isDuplicate = signature === lastLayoutSignature && Date.now() - lastLayoutEmitAt < 5000;
      const isSuspicious = reasons.length > 0;
      if (!isSuspicious) return;
      if (isDuplicate) return;

      lastLayoutSignature = signature;
      lastLayoutEmitAt = Date.now();

      emit({
        type: 'layout',
        level: 'warn',
        text: `Possible layout anomaly: ${reasons.join(', ')}`,
        timestamp: lastLayoutEmitAt,
        detail: {
          viewportW,
          viewportH,
          scrollWidth,
          scrollHeight,
          overflowRatio: Number(overflowRatio.toFixed(2)),
          verticalOverflowRatio: Number(verticalOverflowRatio.toFixed(2)),
          offscreenWideCount,
          offscreenTallCount,
          veryWideCount,
          clippedLargeCount,
          overlapCount,
          distortedMediaCount,
          reasons
        }
      });
    } catch (err) {}
  }

  window.addEventListener('load', () => setTimeout(analyzeLayout, 300), true);
  window.addEventListener('load', () => setTimeout(analyzeTextContrast, 500), true);
  window.addEventListener('load', () => setTimeout(analyzeSecurityRisks, 700), true);
  window.addEventListener('load', () => setTimeout(analyzeTranslationQuality, 900), true);
  window.addEventListener('resize', () => setTimeout(analyzeLayout, 100), true);
  window.addEventListener('resize', () => setTimeout(analyzeTextContrast, 250), true);
  window.addEventListener('resize', () => setTimeout(analyzeTranslationQuality, 400), true);
  window.addEventListener('click', () => setTimeout(analyzeLayout, 500), true);
  window.addEventListener('click', () => setTimeout(analyzeTextContrast, 700), true);
  window.addEventListener('click', () => setTimeout(analyzeSecurityRisks, 900), true);
  window.addEventListener('click', () => setTimeout(analyzeTranslationQuality, 1100), true);
  setTimeout(analyzeLayout, 1200);
  setTimeout(analyzeTextContrast, 1400);
  setTimeout(analyzeSecurityRisks, 1600);
  setTimeout(analyzeTranslationQuality, 1800);
})();
