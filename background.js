// Background Service Worker with Duration Matching & Ranked Search
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'FETCH_LYRICS') {
    const { rawTitle, cleanTitle, artist, duration } = request;

    (async () => {
      // 1. Try LRCLIB Exact Match with full title (preserves Remix / Version)
      try {
        const url = `https://lrclib.net/api/get?track_name=${encodeURIComponent(rawTitle)}&artist_name=${encodeURIComponent(artist)}&duration=${Math.round(duration)}`;
        const res = await fetch(url, { headers: { 'Lrclib-Client': 'SpotifyBetterLyrics/1.2' } });
        if (res.ok) {
          const data = await res.json();
          if (data.syncedLyrics || data.plainLyrics) {
            sendResponse({ success: true, data: data.syncedLyrics || data.plainLyrics });
            return;
          }
        }
      } catch (_) {}

      // 2. Try Better Lyrics API with exact title
      try {
        const url = `https://lyrics-api.boidu.dev/getLyrics?s=${encodeURIComponent(rawTitle)}&a=${encodeURIComponent(artist)}`;
        const res = await fetch(url);
        if (res.ok) {
          const data = await res.json();
          if (data.ttml || data.lyrics) {
            sendResponse({ success: true, data: data.ttml || data.lyrics });
            return;
          }
        }
      } catch (_) {}

      // 3. Fallback: Ranked LRCLIB Search with Duration Matching
      const searchQueries = [
        `${rawTitle} ${artist}`,
        `${cleanTitle} ${artist}`,
        rawTitle
      ];

      for (const query of searchQueries) {
        try {
          const url = `https://lrclib.net/api/search?q=${encodeURIComponent(query)}`;
          const res = await fetch(url, { headers: { 'Lrclib-Client': 'SpotifyBetterLyrics/1.2' } });
          if (res.ok) {
            const list = await res.json();
            if (Array.isArray(list) && list.length > 0) {
              // Find best synced match closest to Spotify's song duration (within 4 seconds)
              const syncedMatches = list.filter(item => item.syncedLyrics);
              if (syncedMatches.length > 0) {
                syncedMatches.sort((a, b) => {
                  const diffA = Math.abs((a.duration || 0) - duration);
                  const diffB = Math.abs((b.duration || 0) - duration);
                  return diffA - diffB;
                });

                if (Math.abs(syncedMatches[0].duration - duration) <= 5) {
                  sendResponse({ success: true, data: syncedMatches[0].syncedLyrics });
                  return;
                }
              }

              // Fallback to top synced result
              const anySynced = list.find(item => item.syncedLyrics);
              if (anySynced) {
                sendResponse({ success: true, data: anySynced.syncedLyrics });
                return;
              }
            }
          }
        } catch (_) {}
      }

      sendResponse({ success: false, error: 'No synced lyrics found' });
    })();

    return true;
  }
});