const overlayRoot = document.getElementById('overlay-root');
const statusPill = document.getElementById('status-pill');

function showStatus(enabled) {
  statusPill.textContent = enabled ? 'Ripple Enabled' : 'Ripple Disabled';
  statusPill.classList.remove('is-hidden');
  statusPill.classList.toggle('is-disabled', !enabled);

  window.clearTimeout(showStatus.hideTimer);
  showStatus.hideTimer = window.setTimeout(() => {
    statusPill.classList.add('is-hidden');
  }, 1400);
}

function spawnRipple({ x, y, button }) {
  const ripple = document.createElement('div');
  ripple.className = 'click-ripple';
  ripple.style.left = `${x}px`;
  ripple.style.top = `${y}px`;
  ripple.dataset.button = String(button || 1);

  const inner = document.createElement('div');
  inner.className = 'click-ripple__inner';
  ripple.appendChild(inner);

  overlayRoot.appendChild(ripple);
  window.requestAnimationFrame(() => {
    ripple.classList.add('is-visible');
  });

  window.setTimeout(() => {
    ripple.remove();
  }, 1500);
}

window.desktopRipple.onShowRipple(payload => {
  spawnRipple(payload);
});

window.desktopRipple.onRippleState(payload => {
  showStatus(!!payload?.enabled);
});

window.desktopRipple.getRippleState().then(state => {
  showStatus(!!state?.enabled);
});
