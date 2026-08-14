let overlayContainer = null;
let statusEl = null;
let headerEl = null;
let lyricsListEl = null;

let currentTrackKey = '';
let isPlaying = false;
let parsedLines = [];
let activeLineIndex = -1;

// Core Clock State
let playbackClockMs = 0;
let lastDomSec = -1;
let lastFrameTimestamp = performance.now();
let syncOffsetMs = parseInt(localStorage.getItem('bl_sync_offset') || '0', 10);
let scriptMode = localStorage.getItem('bl_script_mode') || 'auto';

// 1. Indic (Devanagari/Hindi) Transliteration
const DEVA_MAP = {
  'अ': 'a', 'आ': 'aa', 'इ': 'i', 'ई': 'ee', 'उ': 'u', 'ऊ': 'oo', 'ऋ': 'ri',
  'ए': 'e', 'ऐ': 'ai', 'ओ': 'o', 'औ': 'au', 'अं': 'an', 'अः': 'ah',
  'क': 'k', 'ख': 'kh', 'ग': 'g', 'घ': 'gh', 'ङ': 'ng',
  'च': 'ch', 'छ': 'chh', 'ज': 'j', 'झ': 'jh', 'ञ': 'ny',
  'ट': 't', 'ठ': 'th', 'ड': 'd', 'ढ': 'dh', 'ण': 'n',
  'त': 't', 'थ': 'th', 'द': 'd', 'ध': 'dh', 'न': 'n',
  'प': 'p', 'फ': 'f', 'ब': 'b', 'भ': 'bh', 'म': 'm',
  'य': 'y', 'र': 'r', 'ल': 'l', 'व': 'v', 'श': 'sh',
  'ष': 'sh', 'स': 's', 'ह': 'h', 'क़': 'q', 'ख़': 'kh',
  'ग़': 'gh', 'ज़': 'z', 'ड़': 'r', 'ढ़': 'rh', 'फ़': 'f',
  'ा': 'a', 'ि': 'i', 'ी': 'ee', 'ु': 'u', 'ू': 'oo', 'ृ': 'ri',
  'े': 'e', 'ै': 'ai', 'ो': 'o', 'ौ': 'au', 'ं': 'n', 'ँ': 'n', 'ः': 'h',
  '्': '', '़': ''
};

function transliterateDevanagari(text) {
  let result = '';
  const len = text.length;
  for (let i = 0; i < len; i++) {
    const char = text[i];
    const code = char.charCodeAt(0);
    if (code >= 0x0900 && code <= 0x097f) {
      const nextChar = text[i + 1];
      const mapped = DEVA_MAP[char] !== undefined ? DEVA_MAP[char] : char;
      const isConsonant = (code >= 0x0915 && code <= 0x0939) || (code >= 0x0958 && code <= 0x095F);
      const nextIsMatraOrHalant = nextChar && (
        (nextChar.charCodeAt(0) >= 0x093E && nextChar.charCodeAt(0) <= 0x094D) || nextChar === '्'
      );

      result += mapped;
      if (isConsonant && !nextIsMatraOrHalant && nextChar !== ' ' && i < len - 1) {
        result += 'a';
      }
    } else {
      result += char;
    }
  }
  return result;
}

function isBengali(text) { return /[\u0980-\u09FF]/.test(text); }
function isDevanagari(text) { return /[\u0900-\u097F]/.test(text); }

function getDisplayWord(originalText) {
  if (scriptMode === 'native') return originalText;
  if (isBengali(originalText)) return originalText; // Keep Bangla in native script
  if (isDevanagari(originalText)) return transliterateDevanagari(originalText);
  return originalText;
}

// 2. Helpers
function cleanTitle(title) {
  return title
    .replace(/\s*\(with[^)]*\)/gi, '')
    .replace(/\s*\((feat|ft)\.[^)]*\)/gi, '')
    .replace(/\s*\[(feat|ft)\.[^\]]*\]/gi, '')
    .replace(/\s*-\s*(feat|ft)\..*/gi, '')
    .trim();
}

function cleanArtist(artist) {
  return artist.split(/[,/&|]/)[0].trim();
}

function parseTimeToMs(timeStr) {
  if (!timeStr) return 0;
  const parts = timeStr.trim().split(':');
  if (parts.length === 2) {
    return (parseFloat(parts[0]) * 60 + parseFloat(parts[1])) * 1000;
  }
  return 0;
}

function parseTimestampToMs(t) {
  if (!t) return 0;
  if (t.includes(':')) {
    const parts = t.split(':');
    return (parseFloat(parts[0]) * 60 + parseFloat(parts[1])) * 1000;
  }
  return parseFloat(t) * 1000;
}

// 3. Robust Parser with Dynamic Tempo Calculation
function parseLyricsData(raw) {
  if (!raw) return [];
  const lines = [];

  // A. TTML (True Word-by-Word Timings)
  if (typeof raw === 'string' && raw.includes('<tt') && raw.includes('<p')) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(raw, 'text/xml');
    doc.querySelectorAll('p').forEach((p) => {
      const lineBegin = parseTimestampToMs(p.getAttribute('begin'));
      const lineEnd = parseTimestampToMs(p.getAttribute('end')) || lineBegin + 4000;
      const spans = p.querySelectorAll('span');
      const words = [];

      if (spans.length > 0) {
        spans.forEach((span) => {
          const text = span.textContent;
          const begin = parseTimestampToMs(span.getAttribute('begin')) || lineBegin;
          const end = parseTimestampToMs(span.getAttribute('end')) || lineEnd;
          if (text) words.push({ text, startTime: begin, endTime: end });
        });
      } else {
        const text = p.textContent.trim();
        if (text) words.push({ text, startTime: lineBegin, endTime: lineEnd });
      }

      if (words.length > 0) {
        lines.push({ startTime: lineBegin, endTime: lineEnd, isTTML: true, words });
      }
    });
    if (lines.length > 0) return lines;
  }

  // B. LRC (Line-Synced with Proportional Word Scaling)
  const rawLines = raw.split('\n');
  const tempLrc = [];

  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i].trim();
    const timeMatch = line.match(/\[(\d+):(\d+(?:\.\d+)?)\](.*)/);
    if (timeMatch) {
      const lineTime = (parseInt(timeMatch[1], 10) * 60 + parseFloat(timeMatch[2])) * 1000;
      const content = timeMatch[3].trim();
      if (!content) continue;
      tempLrc.push({ startTime: lineTime, content });
    }
  }

  // Calculate actual duration for each line based on when next line arrives
  for (let i = 0; i < tempLrc.length; i++) {
    const current = tempLrc[i];
    const next = tempLrc[i + 1];
    
    // Line duration is time until next line, capped at 6 seconds to avoid stretching over interludes
    const gap = next ? next.startTime - current.startTime : 4000;
    const actualSingingDuration = Math.min(Math.max(gap - 400, 1200), 5500);
    const lineEndTime = current.startTime + actualSingingDuration;

    const splitWords = current.content.split(' ');
    const step = actualSingingDuration / Math.max(1, splitWords.length);
    const words = splitWords.map((w, idx) => ({
      text: w + (idx < splitWords.length - 1 ? ' ' : ''),
      startTime: current.startTime + idx * step,
      endTime: current.startTime + (idx + 1) * step,
    }));

    lines.push({
      startTime: current.startTime,
      endTime: lineEndTime,
      isTTML: false,
      words,
    });
  }

  return lines;
}

// 4. Draggable Panel
function makeDraggable(element, dragHandle) {
  let isDragging = false;
  let startX = 0, startY = 0, initialLeft = 0, initialTop = 0;

  const savedPos = localStorage.getItem('bl_position');
  if (savedPos) {
    try {
      const { left, top } = JSON.parse(savedPos);
      element.style.left = `${Math.max(10, Math.min(window.innerWidth - 470, left))}px`;
      element.style.top = `${Math.max(10, Math.min(window.innerHeight - 300, top))}px`;
      element.style.right = 'auto';
    } catch (_) {}
  }

  dragHandle.addEventListener('mousedown', (e) => {
    if (e.target.closest('button')) return;
    isDragging = true;
    startX = e.clientX;
    startY = e.clientY;

    const rect = element.getBoundingClientRect();
    initialLeft = rect.left;
    initialTop = rect.top;

    element.style.right = 'auto';
    element.style.left = `${initialLeft}px`;
    element.style.top = `${initialTop}px`;
    document.body.classList.add('bl-no-select');

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    e.preventDefault();
  });

  function onMouseMove(e) {
    if (!isDragging) return;
    element.style.left = `${Math.max(10, Math.min(window.innerWidth - element.offsetWidth - 10, initialLeft + (e.clientX - startX)))}px`;
    element.style.top = `${Math.max(10, Math.min(window.innerHeight - element.offsetHeight - 10, initialTop + (e.clientY - startY)))}px`;
  }

  function onMouseUp() {
    if (!isDragging) return;
    isDragging = false;
    document.body.classList.remove('bl-no-select');
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
    const rect = element.getBoundingClientRect();
    localStorage.setItem('bl_position', JSON.stringify({ left: rect.left, top: rect.top }));
  }
}

// 5. UI Overlay
function setupOverlay() {
  if (document.getElementById('bl-overlay-panel')) return;

  overlayContainer = document.createElement('div');
  overlayContainer.id = 'bl-overlay-panel';

  overlayContainer.innerHTML = `
    <div class="bl-header" title="Drag to move">
      <div class="bl-drag-handle">⠿</div>
      <div class="bl-meta">
        <div id="bl-song-title" class="bl-title">Waiting for track...</div>
        <div id="bl-song-artist" class="bl-artist">Spotify Web</div>
      </div>
      <div class="bl-controls">
        <button id="bl-script-btn" class="bl-btn bl-btn-small" title="Toggle Romanized / Native">${scriptMode === 'native' ? 'Orig' : 'Rom'}</button>
        <button id="bl-offset-minus" class="bl-btn bl-btn-small" title="Advance by 0.3s">-0.3s</button>
        <span id="bl-offset-display" class="bl-offset-val">${syncOffsetMs === 0 ? '0s' : (syncOffsetMs / 1000).toFixed(1) + 's'}</span>
        <button id="bl-offset-plus" class="bl-btn bl-btn-small" title="Delay by 0.3s">+0.3s</button>
        <button id="bl-toggle-btn" class="bl-btn" title="Minimize">—</button>
      </div>
    </div>
    <div id="bl-status" class="bl-status">Ready</div>
    <div id="bl-lyrics-list" class="bl-lyrics-list" style="display: none;"></div>
  `;

  document.body.appendChild(overlayContainer);

  lyricsListEl = document.getElementById('bl-lyrics-list');
  statusEl = document.getElementById('bl-status');
  headerEl = {
    title: document.getElementById('bl-song-title'),
    artist: document.getElementById('bl-song-artist'),
  };

  makeDraggable(overlayContainer, overlayContainer.querySelector('.bl-header'));

  // Toggle Script Mode
  const scriptBtn = document.getElementById('bl-script-btn');
  scriptBtn.addEventListener('click', () => {
    scriptMode = scriptMode === 'auto' || scriptMode === 'roman' ? 'native' : 'auto';
    localStorage.setItem('bl_script_mode', scriptMode);
    scriptBtn.textContent = scriptMode === 'native' ? 'Orig' : 'Rom';
    if (parsedLines.length > 0) renderLyricsDOM(parsedLines);
  });

  // Minimize
  document.getElementById('bl-toggle-btn').addEventListener('click', () => {
    overlayContainer.classList.toggle('bl-minimized');
    document.getElementById('bl-toggle-btn').textContent = overlayContainer.classList.contains('bl-minimized') ? '＋' : '—';
  });

  // Offset Buttons
  const offsetDisplay = document.getElementById('bl-offset-display');
  document.getElementById('bl-offset-minus').addEventListener('click', () => {
    syncOffsetMs -= 300;
    localStorage.setItem('bl_sync_offset', syncOffsetMs);
    offsetDisplay.textContent = `${(syncOffsetMs / 1000).toFixed(1)}s`;
  });

  document.getElementById('bl-offset-plus').addEventListener('click', () => {
    syncOffsetMs += 300;
    localStorage.setItem('bl_sync_offset', syncOffsetMs);
    offsetDisplay.textContent = `${(syncOffsetMs / 1000).toFixed(1)}s`;
  });
}

// 6. DOM Renderer
function renderLyricsDOM(lines) {
  lyricsListEl.innerHTML = '';
  parsedLines = lines;
  activeLineIndex = -1;

  lines.forEach((line, lineIdx) => {
    const lineEl = document.createElement('div');
    lineEl.className = 'bl-line';
    lineEl.dataset.idx = lineIdx;

    line.words.forEach((word, wordIdx) => {
      const wordEl = document.createElement('span');
      wordEl.className = 'bl-word';
      wordEl.dataset.lineIdx = lineIdx;
      wordEl.dataset.wordIdx = wordIdx;
      wordEl.textContent = getDisplayWord(word.text);
      wordEl.style.setProperty('--progress', '0%');
      lineEl.appendChild(wordEl);
    });

    lyricsListEl.appendChild(lineEl);
  });

  statusEl.style.display = 'none';
  lyricsListEl.style.display = 'block';
}

function fetchLyricsViaBackground(rawTitle, cleanTitleStr, artist, duration) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      { type: 'FETCH_LYRICS', rawTitle, cleanTitle: cleanTitleStr, artist, duration },
      (response) => {
        if (chrome.runtime.lastError) {
          resolve(null);
          return;
        }
        resolve(response);
      }
    );
  });
}

// 7. Spotify Track and State Monitor
async function checkTrackState() {
  const titleEl = document.querySelector(
    '[data-testid="context-item-info-title"] a, [data-testid="context-item-info-track-title"], [data-testid="context-item-link"]'
  );
  const artistEl = document.querySelector(
    '[data-testid="context-item-info-artist"] a, [data-testid="context-item-info-subtitles"]'
  );
  const durationEl = document.querySelector('[data-testid="playback-duration"]');
  const positionEl = document.querySelector('[data-testid="playback-position"]');
  const playButton = document.querySelector('[data-testid="control-button-playpause"]');

  if (!titleEl || !artistEl || !lyricsListEl) return;

  const rawTitle = titleEl.textContent.trim();
  const rawArtist = artistEl.textContent.trim();
  const durationMs = parseTimeToMs(durationEl?.textContent);
  const domMs = parseTimeToMs(positionEl?.textContent);
  const domSec = Math.floor(domMs / 1000);
  const trackKey = `${rawTitle} - ${rawArtist}`;

  const isNowPlaying = /pause/i.test(playButton?.getAttribute('aria-label') || '');

  // Handle Play/Pause transition
  if (isNowPlaying !== isPlaying) {
    isPlaying = isNowPlaying;
    playbackClockMs = domMs;
    lastFrameTimestamp = performance.now();
  }

  // Handle second rollover or user seek
  if (domSec !== lastDomSec) {
    lastDomSec = domSec;
    const drift = Math.abs(playbackClockMs - domMs);
    // Only snap clock if user manually jumped/scrubbed (> 1200ms jump)
    if (drift > 1200 || !isPlaying) {
      playbackClockMs = domMs;
      lastFrameTimestamp = performance.now();
    }
  }

  // Handle Track Change
  if (trackKey !== currentTrackKey && rawTitle) {
    currentTrackKey = trackKey;
    headerEl.title.textContent = rawTitle;
    headerEl.artist.textContent = rawArtist;

    const cleaned = cleanTitle(rawTitle);
    const artist = cleanArtist(rawArtist);

    statusEl.textContent = `Searching lyrics for "${rawTitle}"...`;
    statusEl.style.display = 'block';
    lyricsListEl.style.display = 'none';

    const res = await fetchLyricsViaBackground(rawTitle, cleaned, artist, durationMs / 1000);
    if (res && res.success && res.data) {
      const lines = parseLyricsData(res.data);
      if (lines.length > 0) {
        renderLyricsDOM(lines);
      } else {
        statusEl.textContent = 'Could not parse lyrics.';
        statusEl.style.display = 'block';
      }
    } else {
      statusEl.textContent = `No synced lyrics found for "${rawTitle}".`;
      statusEl.style.display = 'block';
    }
  }
}

// 8. 60 FPS Monotonic Animation & Smooth Centered Scroll
function animationLoop(now) {
  const dt = now - lastFrameTimestamp;
  lastFrameTimestamp = now;

  if (isPlaying) {
    playbackClockMs += dt;
  }

  const effectiveTime = playbackClockMs + syncOffsetMs;

  if (parsedLines.length > 0) {
    let targetLineIdx = -1;

    // Binary search / scan for exact active line
    for (let i = parsedLines.length - 1; i >= 0; i--) {
      if (effectiveTime >= parsedLines[i].startTime) {
        targetLineIdx = i;
        break;
      }
    }

    // Centered Smooth Scroll (Without page jitter)
    if (targetLineIdx !== -1 && targetLineIdx !== activeLineIndex) {
      activeLineIndex = targetLineIdx;

      const allLineEls = lyricsListEl.querySelectorAll('.bl-line');
      allLineEls.forEach((el, idx) => {
        if (idx === activeLineIndex) {
          el.classList.add('bl-active-line');
          // Smooth internal container scroll
          const targetScroll = el.offsetTop - (lyricsListEl.clientHeight / 2) + (el.clientHeight / 2);
          lyricsListEl.scrollTo({ top: Math.max(0, targetScroll), behavior: 'smooth' });
        } else {
          el.classList.remove('bl-active-line');
        }
      });
    }

    // Word Sweep Animation for active & past lines
    if (activeLineIndex !== -1 && parsedLines[activeLineIndex]) {
      const line = parsedLines[activeLineIndex];
      const lineEl = lyricsListEl.querySelector(`.bl-line[data-idx="${activeLineIndex}"]`);
      
      if (lineEl) {
        const wordEls = lineEl.querySelectorAll('.bl-word');
        line.words.forEach((w, wIdx) => {
          const wordEl = wordEls[wIdx];
          if (!wordEl) return;

          let progress = 0;
          if (effectiveTime >= w.endTime) {
            progress = 100;
          } else if (effectiveTime > w.startTime) {
            const wordDuration = Math.max(1, w.endTime - w.startTime);
            progress = Math.min(100, Math.max(0, ((effectiveTime - w.startTime) / wordDuration) * 100));
          }

          wordEl.style.setProperty('--progress', `${progress.toFixed(1)}%`);

          if (progress > 0 && progress < 100) {
            wordEl.classList.add('bl-singing');
          } else {
            wordEl.classList.remove('bl-singing');
          }
        });
      }
    }
  }

  requestAnimationFrame(animationLoop);
}

// Initialize
setupOverlay();
setInterval(checkTrackState, 250);
requestAnimationFrame(animationLoop);