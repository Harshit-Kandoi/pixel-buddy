# 📋 Pixel Buddy Roadmap & TODO

This document tracks the current status of **Pixel Buddy**, key technical issues, and planned work.

---

## ✅ What is Done

- **Project Core**: Custom Electron, React 19, TypeScript, and Vite setup. Complete package and compiler configurations.
- **Companion Renderer Window**: Frameless, transparent, click-through window positioned in the bottom-right quadrant of the display with anchor-aware resizing.
- **Productivity State Machine**: State engine handling `WORKING`, `POPUP` (break alert), `BREAK` (countdown), `SNOOZE`, and `IDLE` states.
- **Smart Input Tracking**: Integrated `uiohook-napi` for global keyboard/mouse monitoring to compute focus scores.
- **Fallback Monitoring**: Utilizes Electron's native `powerMonitor.getSystemIdleTime()` when system accessibility permissions are missing.
- **Offline Break Recognition**: Detects when you step away from the PC for 5+ minutes, automatically resetting work timers to prevent alerts when you return.
- **Dynamic BFS Chroma Keyer**: Canvas-based frame processing pipeline that calibrates background colors from borders and keys them out dynamically.
- **Drag-and-Drop Ingestion**: Allows users to drop compatible media (MP4/WebM/GIF/PNG) directly onto the character to set a custom companion.
- **Audio Synthesizer**: Programmatic audio chimes generated via browser Web Audio API to notify transitions without static assets.
- **Dynamic Custom Theme**: Live slider adjusting CSS color hue variables dynamically across the application settings panel.
- **System Tray Companion**: Menu highlighting current status and time remaining with options to reset, pause, or quit.

---

## ⏳ What is Left

- `[ ]` **OS Code Signing & Notarization**: Configure production builds with developer certificates for macOS and Windows to prevent OS safety warning alerts on launch.
- `[ ]` **Multi-Monitor Support**: Extend window positioning logic to support moving the companion across multiple displays.
- `[ ]` **Avatar Library**: Pre-bundle a set of high-quality animated transparent GIFs/videos.
- `[ ]` **Automated Tests**: Write Jest/Vitest unit tests for the state machine, scheduling loops, and settings persistence.
- `[ ]` **Custom Sound Imports**: Allow importing custom MP3/WAV files for break alarm ringtones.

---

## ⚠️ Issues We Are Facing

1. **macOS Accessibility Prompts**:
   - *Detail*: Global hook input tracking (`uiohook-napi`) requires macOS Accessibility system permissions. Prompting the user can feel intrusive.
   - *Impact*: If denied, it falls back to basic `powerMonitor`, resulting in less granular monitoring of local interactions.
2. **CPU Overhead of JS Chroma Keying**:
   - *Detail*: Running canvas pixel scans and BFS traversal in Javascript for every frame causes elevated CPU usage (5%-15% depending on video resolution).
   - *Mitigation*: Needs WebGL-based chroma key shaders or hardware-accelerated filters.
3. **Media Format Alpha Limitations**:
   - *Detail*: Standard MP4 (H.264) does not support transparency natively, forcing the use of the chroma keyer. VP9 WebM and HEVC (H.265) files with native transparency channels have platform-specific decoding inconsistencies.
4. **Git Repository Setup**:
   - *Detail*: The workspace is not initialized as a git repository, leaving the project without local version tracking.

---

## 🚀 Future Milestones

- **Interactive Break Activities**: Add mini hydration check-ins, stretching guides, or light clicker pet games to engage users during breaks.
- **Productivity Dashboard**: Visual stats page indicating total focused time, break compliance rates, and count of skipped/snoozed notifications.
- **Dynamic Mood Expressions**: The companion changes expressions or animations dynamically based on work streaks (e.g. looks tired after 2 hours of focus, happy after a complete break).
- **Calendar & Focus Integrations**: Connect with Google/Outlook Calendars or Zoom/Slack APIs to auto-pause break alerts during live calls or scheduled meetings.
- **Configurable Idle Thresholds**: Let users choose the inactivity duration (currently hardcoded to 5 minutes) before the app transitions to `IDLE` state.
