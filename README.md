# 👾 Pixel Buddy

Pixel Buddy is a cute, customizable desktop companion and smart productivity break reminder app. Built with Electron, React, and TypeScript, it floats seamlessly in the corner of your screen to ensure you remember to take breaks, maintain a healthy posture, and stay productive.

---

## ✨ Key Features

- 👤 **Custom Companion Avatar**: Drag-and-drop any video (MP4/WebM) or image/GIF directly onto your buddy or settings panel to personalize your desktop companion.
- 🎨 **Real-Time Chroma Keyer**: Custom Canvas-based chroma-keying pipeline (using a BFS color search algorithm) automatically keys out solid-color backgrounds, making standard videos transparent.
- ⏱️ **Smart Activity Monitoring**: Monitors keyboard and mouse inputs globally (via `uiohook-napi`) to automatically track focused work, pause timers when you step away, and detect when you've taken a break offline.
- 🔄 **Smart Reset & Break States**: Tracks when you've been away for 5+ minutes and automatically resets your work timers so you don't get pestered upon returning.
- ⚙️ **Tailored Control Panel**: Slide to customize your Work, Break, Snooze, and Skip durations, or toggle sound effects and Always-on-Screen behavior.
- 🎨 **Dynamic Color Themes**: Custom UI color theme slider that alters the CSS hue variables dynamically to match your wallpaper and setup.
- 🔊 **Web Audio Synthesizer**: Generates gentle chime alerts and worried warning beeps dynamically using the Web Audio API (zero external audio file size overhead).
- ⚙️ **System Tray Integration**: Full-featured tray companion menu with state updates, time counters, and controls to pause, resume, reset, or quit.

---

## 🛠️ Tech Stack

- **Core**: Electron, Node.js, Vite (`electron-vite`)
- **Frontend**: React 19, TypeScript
- **Styling**: Vanilla CSS with dynamic CSS variables
- **Input Tracking**: `uiohook-napi` (fallback to Electron `powerMonitor`)
- **Compilation/Bundling**: `electron-builder`

---

## 🚀 Project Setup

### 1. Prerequisites
Ensure you have [Node.js](https://nodejs.org/) installed.

### 2. Install Dependencies
```bash
npm install
```

### 3. Run Development Server
```bash
npm run dev
```

### 4. Build Production Executables
To package the app for your current operating system:
```bash
# Windows
npm run build:win

# macOS
npm run build:mac

# Linux
npm run build:linux
```

---

## ⚠️ OS-Specific Permissions (macOS)

For the **Smart Activity Monitoring** (pause timer when away, auto-reset when returning) to work, Pixel Buddy uses global keyboard/mouse hooks which require **Accessibility Permissions** on macOS:
1. Open **System Settings** > **Privacy & Security** > **Accessibility**.
2. Enable permissions for **Pixel Buddy** (or your terminal/IDE when running in development mode).
3. If accessibility is disabled, Pixel Buddy will gracefully fall back to Electron's basic `powerMonitor` state.
