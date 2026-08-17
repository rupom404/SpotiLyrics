# SpotiLyrics 🎵✨

[![Manifest V3](https://img.shields.io/badge/Manifest-V3-orange?style=flat-square)](https://developer.chrome.com/docs/extensions/mv3/intro/)
[![Vite](https://img.shields.io/badge/Bundled_with-Vite-646CFF?style=flat-square&logo=vite&logoColor=white)](https://vitejs.dev/)
[![Platform](https://img.shields.io/badge/Platform-Chrome%20%7C%20Brave%20%7C%20Edge-informational?style=flat-square)]()
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square)](LICENSE)

> A lightweight, draggable, Apple Music-style word-by-word synchronized karaoke lyrics overlay for **Spotify Web Player** (`open.spotify.com`).

---

## ✨ Features

* **Apple Music-Style Karaoke Glow:** Smooth, 60 FPS syllable and word-level gradient sweeps with real-time bloom glow.
* **Smart Language Transliteration:** Automatically transliterates Hindi / Devanagari lyrics into Romanized English while natively preserving Bengali (বাংলা) and other scripts. Includes a single-click `[Rom / Orig]` script switcher.
* **Rock-Solid Playback Synchronization:** Uses a monotonic, zero-latency clock that prevents drift, desyncs during long pauses, or artificial timing jumps.
* **Dynamic Tempo & Instrumental Gaps:** Dynamically scales word animations to the true tempo of each sentence and cleanly rests during guitar solos and instrumental interludes.
* **Draggable Glassmorphism UI:** Floating frosted-glass overlay that can be moved anywhere across the screen, minimized, and automatically remembers its position via `localStorage`.
* **Live Offset Adjustment:** Fine-tune audio-to-lyric synchronization on the fly with dedicated **`-0.3s`** and **`+0.3s`** controls.
* **Multi-Tier Lyrics Backend:** Fetches rich-sync and line-synced lyrics through a Manifest V3 background service worker (bypassing CSP/CORS) via **LRCLIB** and **BetterLyrics / Unison** APIs.
* **Resource Friendly:** Near **0% CPU usage** and no memory bloat compared to the Desktop Spotify client.

---

## 🛠️ Architecture

```text
┌────────────────────────────────────────────────────────┐
│             Spotify Web (open.spotify.com)             │
│   • Track Metadata (Title, Artist, Duration, Time)     │
│   • Play / Pause / Seek Events                         │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│            Background Service Worker (CSP Bypass)      │
│   1. LRCLIB Exact Match (Preserves Remixes/Acoustic)   │
│   2. BetterLyrics / Unison TTML API                    │
│   3. Ranked Duration-Matched Fuzzy Fallback Search     │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│                 Frontend Karaoke Engine                │
│   • Monotonic Frame Clock (60 FPS requestAnimationFrame)│
│   • Devanagari -> Latin Transliteration Layer          │
│   • Dynamic Line-Tempo Scaler                          │
│   • Draggable Glassmorphism Overlay                    │
└────────────────────────────────────────────────────────┘
```

---

## 🚀 Getting Started

### Prerequisites
* [Node.js](https://nodejs.org/) (v16 or newer)
* Any Chromium-based browser (**Google Chrome**, **Brave**, **Microsoft Edge**, **Arc**)

---

### Step-by-Step Installation

1. **Clone the Repository**
   ```bash
   git clone https://github.com/rupom404/SpotiLyrics.git
   cd SpotiLyrics
   ```

2. **Install Dependencies**
   ```bash
   npm install
   ```

3. **Build the Extension Bundle**
   ```bash
   npm run build
   ```
   *(Or run `npx vite build` to generate `dist/content.bundle.js`).*

4. **Load the Extension in Your Browser**
   * Open your browser's extensions page:
     * **Brave:** `brave://extensions`
     * **Chrome:** `chrome://extensions`
     * **Edge:** `edge://extensions`
   * Enable **Developer mode** (toggle in the top-right corner).
   * Click **Load unpacked** in the top-left corner.
   * Select the root `SpotiLyrics` project folder.

5. **Play on Spotify**
   * Open [open.spotify.com](https://open.spotify.com).
   * Play any track — the lyrics overlay will appear automatically.

---

## 🎮 Overlay Controls

| Control | Action |
| :--- | :--- |
| **`⠿` Drag Bar** | Click and hold the header to drag the panel anywhere on your screen. |
| **`Rom` / `Orig`** | Toggle between Romanized English transliteration and original native script. |
| **`-0.3s`** | Advance lyrics timing earlier by 300ms. |
| **`+0.3s`** | Delay lyrics timing by 300ms. |
| **`—` / `＋`** | Minimize or expand the overlay into a compact status pill. |

---

## 📁 Project Structure

```text
SpotiLyrics/
├── dist/
│   └── content.bundle.js     # Bundled content script
├── src/
│   ├── content.js            # Core karaoke engine & state listeners
│   └── styles.css            # Glassmorphism theme & CSS gradient sweep
├── background.js             # Service worker handling lyrics APIs (bypasses CORS/CSP)
├── manifest.json             # Manifest V3 configuration
├── vite.config.js            # Vite bundler configuration with ASCII sanitizer
├── package.json              # Project dependencies & build scripts
└── README.md
```

---

## 💡 Tech Stack

* **UI & Rendering:** Native DOM & CSS text-fill gradient masks (`-webkit-background-clip: text`)
* **Build Tooling:** [Vite](https://vitejs.dev/) with an automatic ASCII character sanitizer plugin for Chromium manifest compliance
* **API Providers:** [LRCLIB](https://lrclib.net/) and [BetterLyrics](https://betterlyrics.org/)
* **Platform:** Chrome Extension Manifest V3

---

## 🤝 Contributing

Contributions, issues, and feature requests are welcome!

1. Fork the Project.
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`).
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`).
4. Push to the Branch (`git push origin feature/AmazingFeature`).
5. Open a Pull Request.

---

## 📝 License

Distributed under the **MIT License**. See `LICENSE` for more details.
