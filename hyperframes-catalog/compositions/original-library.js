(function () {
  var root = document.getElementById('root');
  if (!root || !window.gsap) return;
  var kind = root.dataset.kind;
  var tall = root.dataset.aspect === '9:16';
  var title = root.dataset.title || '讓每一步都有方向';
  var detail = root.dataset.detail || '把複雜內容整理成一句可採取的行動';
  var label = root.dataset.label || 'CHAPTER 01';
  var metric = root.dataset.metric || '+18.4%';
  root.classList.add('ov-material', tall ? 'is-tall' : 'is-wide');
  var shell = '<div class="ov-bg"></div><div class="ov-grid"></div><div class="clip" data-start="0" data-duration="' + root.dataset.duration + '" data-track-index="0"><div class="ov-stage">';
  if (kind === 'orbit') {
    shell += '<div class="ov-index material-label">' + label + '</div><div class="ov-title material-title" style="top:27%">' + detail + '</div><div class="ov-orbit material-orbit"></div><div class="ov-number material-number">72%<small>' + metric + '</small></div><div class="ov-signal material-signal"><i style="height:42%"></i><i style="height:67%"></i><i style="height:54%"></i><i style="height:88%"></i></div><div class="ov-footer material-footer">ASTER / CORE SIGNAL</div>';
  } else if (kind === 'cascade') {
    shell += '<div class="ov-index material-label">' + label + '</div><div class="ov-title material-title" style="top:26%">' + title + '</div><div class="ov-copy material-copy" style="top:48%">' + detail + '</div><div class="ov-cascade material-cascade"><div style="height:44%">導入</div><div style="height:64%">啟用</div><div style="height:52%">留存</div><div style="height:83%">' + metric + '</div></div><div class="ov-footer material-footer">HARBOR / CHANGE LOG</div>';
  } else if (kind === 'radar') {
    shell += '<div class="ov-index material-label">' + label + '</div><div class="ov-title material-title" style="top:27%">' + title + '</div><div class="ov-copy material-copy" style="top:48%">' + detail + '</div><div class="ov-radar material-radar"></div><div class="ov-radar-score material-score">' + metric + '</div><div class="ov-footer material-footer">PULSE / MATURITY MAP</div>';
  } else if (kind === 'ladder') {
    shell += '<div class="ov-index material-label">' + label + '</div><div class="ov-title material-title" style="top:27%">' + title + '</div><div class="ov-copy material-copy" style="top:48%">' + detail + '</div><div class="ov-ladder material-ladder"><div style="height:42%">03</div><div style="height:65%">02</div><div style="height:88%">01</div></div><div class="ov-footer material-footer">RANK / ASCENDING</div>';
  } else if (kind === 'heat') {
    shell += '<div class="ov-index material-label">' + label + '</div><div class="ov-title material-title" style="top:27%">' + title + '</div><div class="ov-copy material-copy" style="top:48%">' + detail + '</div><div class="ov-heat material-heat">' + Array.from({ length: 28 }, function (_, index) { return '<i style="opacity:' + (0.42 + (index % 6) * 0.1) + '"></i>'; }).join('') + '</div><div class="ov-footer material-footer">TIDE / ' + metric + '</div>';
  } else if (kind === 'scatter') {
    var dots = [[8,82],[17,73],[25,68],[34,62],[42,57],[49,48],[58,43],[66,34],[76,28],[85,18],[53,75]];
    shell += '<div class="ov-index material-label">' + label + '</div><div class="ov-title material-title" style="top:27%">' + title + '</div><div class="ov-copy material-copy" style="top:48%">' + detail + '</div><div class="ov-scatter material-scatter">' + dots.map(function (point) { return '<i style="left:' + point[0] + '%;bottom:' + point[1] + '%"></i>'; }).join('') + '</div><div class="ov-footer material-footer">CONSTELLATION / ' + metric + '</div>';
  } else if (kind === 'caption') {
    shell += '<div class="ov-caption material-caption"><b>' + label + '</b><strong>' + title + '</strong><em>' + detail + '</em></div><div class="ov-progress material-progress"></div>';
  } else {
    shell += '<div class="ov-paper material-paper"></div><div class="ov-rule material-rule"></div><div class="ov-index material-label">' + label + '</div><div class="ov-title material-title" style="top:32%">' + title + '</div><div class="ov-copy material-copy" style="top:57%">' + detail + '</div>';
    if (kind === 'fold') shell += '<div class="ov-fold material-fold"><span>原本</span><span>' + metric + '</span></div>';
    else shell += '<div class="ov-action material-action">' + metric + ' <span>→</span></div>';
  }
  root.innerHTML = shell + '</div></div>';
  window.__timelines = window.__timelines || {};
  var tl = gsap.timeline({ paused: true });
  var q = function (selector) { return root.querySelector(selector); };
  tl.fromTo(q('.ov-bg'), { opacity: 0 }, { opacity: 1, duration: 0.45, ease: 'sine.out' }, 0.1)
    .fromTo(q('.ov-grid'), { opacity: 0, scale: 1.05 }, { opacity: 0.22, scale: 1, duration: 0.65, ease: 'power2.out' }, 0.15);
  if (q('.material-label')) tl.fromTo(q('.material-label'), { opacity: 0, x: -36 }, { opacity: 1, x: 0, duration: 0.38, ease: 'expo.out' }, 0.25);
  if (q('.material-title')) tl.fromTo(q('.material-title'), { opacity: 0, y: 42 }, { opacity: 1, y: 0, duration: 0.58, ease: 'power3.out' }, 0.36);
  ['.material-copy', '.material-orbit', '.material-number', '.material-cascade', '.material-radar', '.material-score', '.material-ladder', '.material-heat', '.material-scatter', '.material-caption', '.material-paper', '.material-rule', '.material-action', '.material-fold', '.material-progress', '.material-signal', '.material-footer'].forEach(function (selector, index) {
    var element = q(selector); if (!element) return;
    tl.fromTo(element, { opacity: 0, scale: selector === '.material-paper' ? 0.9 : 1, y: selector === '.material-caption' ? 24 : 0 }, { opacity: 1, scale: 1, y: 0, duration: 0.45 + index * 0.02, ease: index % 2 ? 'back.out(1.4)' : 'power2.out' }, 0.55 + index * 0.07);
  });
  var ambient = q(kind === 'orbit' ? '.material-orbit' : kind === 'cascade' ? '.material-cascade' : kind === 'radar' ? '.material-radar' : kind === 'ladder' ? '.material-ladder' : kind === 'heat' ? '.material-heat' : kind === 'scatter' ? '.material-scatter' : kind === 'caption' ? '.material-progress' : '.material-paper');
  if (ambient) tl.to(ambient, { y: kind === 'caption' ? 0 : -10, scale: kind === 'orbit' ? 1.035 : 1, duration: 1.1, ease: 'sine.inOut', yoyo: true, repeat: 1 }, 1.4);
  tl.to(root.querySelector('.ov-stage'), { opacity: 0, duration: 0.3, ease: 'power2.in' }, Number(root.dataset.duration) - 0.35);
  window.__timelines[root.dataset.compositionId] = tl;
})();
