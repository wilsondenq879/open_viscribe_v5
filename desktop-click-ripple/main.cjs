const path = require('path');
const { app, BrowserWindow, Tray, Menu, nativeImage, globalShortcut, ipcMain, screen } = require('electron');
const { uIOhook } = require('uiohook-napi');

const overlayWindows = new Map();
let tray = null;
let rippleEnabled = true;
let quitting = false;

function createTray() {
  const emptyIcon = nativeImage.createEmpty();
  tray = new Tray(emptyIcon);
  tray.setToolTip('Desktop Click Ripple');
  rebuildTrayMenu();
}

function rebuildTrayMenu() {
  if (!tray) return;
  const contextMenu = Menu.buildFromTemplate([
    {
      label: rippleEnabled ? 'Disable Ripple' : 'Enable Ripple',
      click: () => {
        rippleEnabled = !rippleEnabled;
        rebuildTrayMenu();
      }
    },
    {
      label: 'Rebuild Overlays',
      click: () => {
        syncOverlayWindows();
      }
    },
    {
      type: 'separator'
    },
    {
      label: 'Quit',
      click: () => {
        quitting = true;
        app.quit();
      }
    }
  ]);

  tray.setContextMenu(contextMenu);
}

function createOverlayWindow(display) {
  const key = String(display.id);
  const existing = overlayWindows.get(key);
  if (existing && !existing.isDestroyed()) {
    existing.setBounds(display.bounds);
    return existing;
  }

  const win = new BrowserWindow({
    x: display.bounds.x,
    y: display.bounds.y,
    width: display.bounds.width,
    height: display.bounds.height,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    skipTaskbar: true,
    focusable: false,
    fullscreenable: false,
    hasShadow: false,
    alwaysOnTop: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false
    }
  });

  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.setAlwaysOnTop(true, 'screen-saver', 1);
  win.setIgnoreMouseEvents(true, { forward: true });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.on('closed', () => {
    overlayWindows.delete(key);
  });

  overlayWindows.set(key, win);
  return win;
}

function syncOverlayWindows() {
  const displays = screen.getAllDisplays();
  const activeIds = new Set(displays.map(display => String(display.id)));

  displays.forEach(display => {
    createOverlayWindow(display);
  });

  for (const [id, win] of overlayWindows.entries()) {
    if (activeIds.has(id)) continue;
    overlayWindows.delete(id);
    if (!win.isDestroyed()) {
      win.close();
    }
  }
}

function findWindowForPoint(point) {
  const display = screen.getDisplayNearestPoint(point);
  if (!display) return null;
  return overlayWindows.get(String(display.id)) || null;
}

function emitRipple(point, button = 1) {
  if (!rippleEnabled) return;

  const targetWindow = findWindowForPoint(point);
  if (!targetWindow || targetWindow.isDestroyed()) return;

  const bounds = targetWindow.getBounds();
  targetWindow.webContents.send('show-ripple', {
    x: point.x - bounds.x,
    y: point.y - bounds.y,
    button,
    ts: Date.now()
  });
}

function registerGlobalClickHook() {
  uIOhook.on('mousedown', event => {
    const cursorPoint = screen.getCursorScreenPoint();
    emitRipple(cursorPoint, event.button);
  });
  uIOhook.start();
}

function registerShortcuts() {
  globalShortcut.register('CommandOrControl+Shift+R', () => {
    rippleEnabled = !rippleEnabled;
    rebuildTrayMenu();
    overlayWindows.forEach(win => {
      if (!win.isDestroyed()) {
        win.webContents.send('ripple-state', { enabled: rippleEnabled });
      }
    });
  });

  globalShortcut.register('CommandOrControl+Shift+Q', () => {
    quitting = true;
    app.quit();
  });
}

function attachDisplayListeners() {
  screen.on('display-added', syncOverlayWindows);
  screen.on('display-removed', syncOverlayWindows);
  screen.on('display-metrics-changed', syncOverlayWindows);
}

app.whenReady().then(() => {
  createTray();
  syncOverlayWindows();
  registerShortcuts();
  registerGlobalClickHook();
  attachDisplayListeners();
});

app.on('before-quit', () => {
  quitting = true;
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  try {
    uIOhook.stop();
  } catch (error) {
    // Ignore shutdown race conditions from native hook cleanup.
  }
});

app.on('activate', () => {
  syncOverlayWindows();
});

ipcMain.handle('get-ripple-state', () => {
  return { enabled: rippleEnabled };
});

ipcMain.on('quit-app', () => {
  quitting = true;
  app.quit();
});
