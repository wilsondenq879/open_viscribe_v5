# Desktop Click Ripple

一個獨立於主編輯器的桌面安裝工具，用來在 `macOS / Windows` 桌面上顯示全域滑鼠點擊紅色漣漪。

它的設計目標是:

- 不和既有 `src/App.jsx` 混在一起
- 操作同仁可以單獨安裝
- 點擊任何桌面或其他應用程式時，都能顯示紅色漣漪 overlay
- 支援多螢幕

## 技術做法

- `Electron` 建立透明、永遠置頂、滑鼠穿透的 overlay 視窗
- `uiohook-napi` 監聽全域滑鼠點擊
- 每個螢幕各有一個 overlay window
- renderer 僅負責畫紅色漣漪，不耦合主專案編輯器

## 開發

在 `desktop-click-ripple` 目錄執行:

```bash
npm install
npm run dev
```

## 打包

```bash
npm run build:mac
npm run build:win
```

預設使用 `electron-builder`:

- macOS: `dmg`, `zip`
- Windows: `nsis`, `portable`

## 使用方式

- 啟動後會常駐於系統列 / 選單列
- 全域滑鼠點擊時會顯示紅色漣漪
- 快捷鍵 `CmdOrCtrl+Shift+R` 可切換啟用 / 停用
- 快捷鍵 `CmdOrCtrl+Shift+Q` 可直接結束

## macOS 注意事項

macOS 需要在系統設定中允許:

- `Accessibility`
- 視需要允許 `Input Monitoring`

否則全域滑鼠事件可能無法正常擷取。

## 目錄

- `main.cjs`: Electron 主程序，管理 overlay 視窗與全域事件
- `preload.cjs`: 安全地把 IPC 能力暴露給 renderer
- `renderer/index.html`: overlay 頁面
- `renderer/renderer.js`: 漣漪動畫
- `renderer/styles.css`: overlay 視覺樣式

## 備註

這個工具是獨立子專案，尚未和 repo 根目錄的 `package.json` 綁定，避免影響現有編輯器流程。
