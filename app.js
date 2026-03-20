/* ═══════════════════════════════════════════════════════════════
   YTTReborn — App Logic
   YouTube Data API v3 Integration
   ═══════════════════════════════════════════════════════════════ */

(() => {
  'use strict';

  // ─── Config ───
  const API_BASE        = 'https://www.googleapis.com/youtube/v3';
  const PER_PAGE        = 20;
  const REFRESH_MS      = 5 * 60 * 1000;
  const FALLBACK_REGION = 'GB';
  const STORAGE_KEY     = 'yttreborn_api_key';

  const SUPPORTED_REGIONS = new Set([
    'US','GB','CA','AU','DE','FR','JP','KR','IN','BR',
    'MX','RU','IT','ES','NL','SE','PL','ZA','NG','PH',
  ]);

  // ─── State ───
  const state = {
    apiKey:      '',
    region:      FALLBACK_REGION,
    categoryId:  '',
    pageToken:   '',
    categories:  [],
    loading:     false,
    rank:        0,
    refreshTimer: null,
  };

  // ─── DOM Refs ───
  const $grid        = document.getElementById('video-grid');
  const $catTrack    = document.getElementById('category-track');
  const $regionSel   = document.getElementById('region-select');
  const $loadBtn     = document.getElementById('load-more-btn');
  const $spinner     = document.getElementById('load-spinner');
  const $banner      = document.getElementById('status-banner');
  const $lastUpdated = document.getElementById('last-updated');
  const $modal       = document.getElementById('setup-modal');
  const $keyInput    = document.getElementById('api-key-input');
  const $keySubmit   = document.getElementById('api-key-submit');
  const $keyError    = document.getElementById('api-key-error');
  const $changeKey   = document.getElementById('change-key-btn');

  // ═══════════════════════════════════════════════════════════════
  //  API Key Management
  // ═══════════════════════════════════════════════════════════════

  function getStoredKey() {
    try { return localStorage.getItem(STORAGE_KEY) || ''; }
    catch { return ''; }
  }

  function storeKey(key) {
    try { localStorage.setItem(STORAGE_KEY, key); }
    catch { /* private mode fallback — key stays in state only */ }
  }

  function clearKey() {
    try { localStorage.removeItem(STORAGE_KEY); }
    catch {}
    state.apiKey = '';
  }

  function showModal() {
    $modal.classList.remove('hidden');
    $keyInput.value = '';
    $keyError.classList.add('hidden');
    $keyInput.focus();
  }

  function hideModal() {
    $modal.classList.add('hidden');
  }

  async function validateKey(key) {
    // Quick test: fetch a single category to verify the key works
    try {
      const url = `${API_BASE}/videoCategories?part=snippet&regionCode=US&key=${encodeURIComponent(key)}`;
      const res = await fetch(url);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const msg = data?.error?.message || `HTTP ${res.status}`;
        throw new Error(msg);
      }
      return { valid: true };
    } catch (err) {
      return { valid: false, error: err.message };
    }
  }

  // ═══════════════════════════════════════════════════════════════
  //  Geo Detection
  // ═══════════════════════════════════════════════════════════════

  async function detectRegion() {
    const geoApis = [
      { url: 'https://ipapi.co/json/',     parse: d => d.country_code },
      { url: 'https://api.country.is/',     parse: d => d.country },
      { url: 'https://ipinfo.io/json',      parse: d => d.country },
    ];
    for (const api of geoApis) {
      try {
        const res = await fetch(api.url, { signal: AbortSignal.timeout(3000) });
        if (!res.ok) continue;
        const data = await res.json();
        const code = api.parse(data);
        if (code && typeof code === 'string') {
          const upper = code.toUpperCase();
          if (SUPPORTED_REGIONS.has(upper)) return upper;
          return FALLBACK_REGION;
        }
      } catch { /* try next */ }
    }
    return FALLBACK_REGION;
  }

  // ═══════════════════════════════════════════════════════════════
  //  API Helpers
  // ═══════════════════════════════════════════════════════════════

  async function apiFetch(endpoint, params = {}) {
    params.key = state.apiKey;
    const qs  = new URLSearchParams(params).toString();
    const url = `${API_BASE}/${endpoint}?${qs}`;

    const res = await fetch(url);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const msg = err?.error?.message || `HTTP ${res.status}`;
      // If key is invalid/expired, prompt for a new one
      if (res.status === 400 || res.status === 403) {
        showBanner('API key error — please check your key.', true);
      }
      throw new Error(msg);
    }
    return res.json();
  }

  async function fetchCategories(regionCode) {
    const data = await apiFetch('videoCategories', {
      part: 'snippet', regionCode,
    });
    return (data.items || [])
      .filter(c => c.snippet.assignable)
      .map(c => ({ id: c.id, title: c.snippet.title }));
  }

  async function fetchTrending(regionCode, categoryId = '', pageToken = '') {
    const params = {
      part:       'snippet,statistics,contentDetails,liveStreamingDetails',
      chart:      'mostPopular',
      regionCode, maxResults: PER_PAGE,
    };
    if (categoryId) params.videoCategoryId = categoryId;
    if (pageToken)  params.pageToken       = pageToken;
    return apiFetch('videos', params);
  }

  // ═══════════════════════════════════════════════════════════════
  //  Formatting
  // ═══════════════════════════════════════════════════════════════

  function formatCount(n) {
    const num = parseInt(n, 10);
    if (isNaN(num) || num === 0) return null;
    if (num >= 1_000_000_000) return (num / 1_000_000_000).toFixed(1).replace(/\.0$/, '') + 'B';
    if (num >= 1_000_000)     return (num / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
    if (num >= 1_000)         return (num / 1_000).toFixed(1).replace(/\.0$/, '') + 'K';
    return num.toLocaleString();
  }

  function timeAgo(dateStr) {
    const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
    if (seconds < 0) return 'Premiering soon';
    const intervals = [
      { label: 'year',   secs: 31_536_000 },
      { label: 'month',  secs: 2_592_000  },
      { label: 'week',   secs: 604_800    },
      { label: 'day',    secs: 86_400     },
      { label: 'hour',   secs: 3_600      },
      { label: 'minute', secs: 60         },
    ];
    for (const { label, secs } of intervals) {
      const count = Math.floor(seconds / secs);
      if (count >= 1) return `${count} ${label}${count > 1 ? 's' : ''} ago`;
    }
    return 'Just now';
  }

  function parseDuration(iso) {
    if (!iso || iso === 'P0D') return null;
    const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!m) return null;
    const h = parseInt(m[1] || 0, 10);
    const min = parseInt(m[2] || 0, 10);
    const sec = parseInt(m[3] || 0, 10);
    if (h === 0 && min === 0 && sec === 0) return null;
    const sSec = sec.toString().padStart(2, '0');
    if (h > 0) return `${h}:${min.toString().padStart(2, '0')}:${sSec}`;
    return `${min}:${sSec}`;
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function isLive(video) {
    const lsd = video.liveStreamingDetails;
    return !!(lsd && lsd.actualStartTime && !lsd.actualEndTime);
  }

  function isUpcoming(video) {
    const lsd = video.liveStreamingDetails;
    return !!(lsd && lsd.scheduledStartTime && !lsd.actualStartTime);
  }

  function formatTime(date) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  // ═══════════════════════════════════════════════════════════════
  //  Rendering
  // ═══════════════════════════════════════════════════════════════

  function renderSkeletons(count = 12) {
    let html = '';
    for (let i = 0; i < count; i++) {
      html += `
        <div class="skeleton-card">
          <div class="skeleton-thumb"></div>
          <div class="skeleton-info">
            <div class="skeleton-line"></div>
            <div class="skeleton-line"></div>
            <div class="skeleton-line"></div>
          </div>
        </div>`;
    }
    $grid.innerHTML = html;
  }

  function renderCategories(categories) {
    const allPill = $catTrack.querySelector('#cat-all');
    $catTrack.innerHTML = '';
    $catTrack.appendChild(allPill);
    for (const cat of categories) {
      const btn = document.createElement('button');
      btn.className = 'cat-pill';
      btn.dataset.categoryId = cat.id;
      btn.textContent = cat.title;
      btn.id = `cat-${cat.id}`;
      $catTrack.appendChild(btn);
    }
  }

  function buildVideoCard(video, rank) {
    const { snippet, statistics, contentDetails } = video;
    const thumbHigh = snippet.thumbnails.high?.url   || '';
    const thumbMed  = snippet.thumbnails.medium?.url  || '';
    const thumbDef  = snippet.thumbnails.default?.url || '';
    const thumb     = thumbHigh || thumbMed || thumbDef;
    const title     = escapeHtml(snippet.title);
    const channel   = escapeHtml(snippet.channelTitle);
    const viewStr   = formatCount(statistics?.viewCount || 0);
    const ago       = timeAgo(snippet.publishedAt);
    const dur       = parseDuration(contentDetails?.duration || '');
    const url       = `https://www.youtube.com/watch?v=${video.id}`;
    const live      = isLive(video);
    const upcoming  = isUpcoming(video);

    let durationBadge = '';
    if (live)          durationBadge = '<span class="card-badge card-badge--live">● LIVE</span>';
    else if (upcoming) durationBadge = '<span class="card-badge card-badge--upcoming">UPCOMING</span>';
    else if (dur)      durationBadge = `<span class="card-duration">${dur}</span>`;

    let viewsMeta = '';
    if (live) {
      const concurrent = formatCount(statistics?.concurrentViewers || 0);
      viewsMeta = concurrent ? `${concurrent} watching` : 'Live now';
    } else if (viewStr) {
      viewsMeta = `${viewStr} views`;
    } else {
      viewsMeta = 'No views yet';
    }

    return `
      <a href="${url}" target="_blank" rel="noopener" class="video-card${live ? ' video-card--live' : ''}" data-video-id="${video.id}" style="animation-delay: ${rank * 0.04}s" title="${title}">
        <div class="card-thumb">
          <img src="${thumb}" data-fallback-med="${thumbMed}" data-fallback-def="${thumbDef}" alt="${title}" loading="lazy" width="480" height="270">
          ${durationBadge}
          <span class="card-rank">#${rank}</span>
        </div>
        <div class="card-info">
          <h3 class="card-title">${title}</h3>
          <p class="card-channel">${channel}</p>
          <p class="card-meta">
            <span>${viewsMeta}</span>
            <span class="dot"></span>
            <span>${ago}</span>
          </p>
        </div>
      </a>`;
  }

  function attachThumbFallbacks(container) {
    container.querySelectorAll('.card-thumb img').forEach(img => {
      if (img.dataset.fallbackAttached) return;
      img.dataset.fallbackAttached = '1';
      img.addEventListener('error', function handler() {
        const med = this.dataset.fallbackMed;
        const def = this.dataset.fallbackDef;
        if (med && this.src !== med) { this.src = med; }
        else if (def && this.src !== def) { this.src = def; }
        else {
          this.removeEventListener('error', handler);
          this.style.display = 'none';
          this.parentElement.style.background = 'linear-gradient(135deg, var(--bg-secondary), var(--bg-card-hover))';
        }
      });
    });
  }
  
  // ─── Hover Preview Feature ───
  const ytScript = document.createElement('script');
  ytScript.src = "https://www.youtube.com/iframe_api";
  document.head.appendChild(ytScript);

  let hoverTimer = null;
  let activePlayer = null;
  let progressInterval = null;

  const ICON_MUTE = `<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><line x1="23" y1="9" x2="17" y2="15"></line><line x1="17" y1="9" x2="23" y2="15"></line></svg>`;
  const ICON_UNMUTE = `<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>`;

  function attachHoverPreviews(container) {
    container.querySelectorAll('.video-card').forEach(card => {
      if (card.dataset.hoverAttached) return;
      card.dataset.hoverAttached = '1';
      
      const thumbWrap = card.querySelector('.card-thumb');
      const videoId = card.dataset.videoId;
      
      card.addEventListener('mouseenter', () => {
        hoverTimer = setTimeout(() => {
          if (!window.YT || !window.YT.Player) return;
          if (thumbWrap.querySelector('.player-overlay')) return;

          destroyActivePlayer();

          const playerWrap = document.createElement('div');
          playerWrap.className = 'player-overlay';
          
          const playerDiv = document.createElement('div');
          playerWrap.appendChild(playerDiv);
          
          const controlsHtml = `
            <button class="preview-mute-btn" aria-label="Toggle Sound">
              ${ICON_MUTE}
            </button>
            <div class="preview-progress">
              <div class="preview-progress-bar"></div>
            </div>
          `;
          playerWrap.insertAdjacentHTML('beforeend', controlsHtml);
          thumbWrap.appendChild(playerWrap);
          
          let duration = 0;
          const progressBar = playerWrap.querySelector('.preview-progress-bar');
          const muteBtn = playerWrap.querySelector('.preview-mute-btn');
          const progressContainer = playerWrap.querySelector('.preview-progress');
          
          activePlayer = new YT.Player(playerDiv, {
            videoId: videoId,
            playerVars: { autoplay: 1, controls: 0, modestbranding: 1, disablekb: 1, fs: 0, playsinline: 1, rel: 0 },
            events: {
              onReady: (e) => {
                e.target.mute();
                e.target.playVideo();
                duration = e.target.getDuration();
                
                progressInterval = setInterval(() => {
                  try {
                    if(e.target.getPlayerState() === YT.PlayerState.PLAYING) {
                      const curr = e.target.getCurrentTime();
                      const pct = (curr / duration) * 100;
                      progressBar.style.width = `${pct}%`;
                    }
                  } catch(err) {}
                }, 100);
              }
            }
          });
          
          muteBtn.addEventListener('click', (ev) => {
            ev.preventDefault(); ev.stopPropagation();
            if(!activePlayer) return;
            if(activePlayer.isMuted()) {
              activePlayer.unMute();
              muteBtn.innerHTML = ICON_UNMUTE;
            } else {
              activePlayer.mute();
              muteBtn.innerHTML = ICON_MUTE;
            }
          });
          
          progressContainer.addEventListener('click', (ev) => {
            ev.preventDefault(); ev.stopPropagation();
            if(!activePlayer || !duration) return;
            const rect = progressContainer.getBoundingClientRect();
            const clickX = ev.clientX - rect.left;
            const pct = clickX / rect.width;
            activePlayer.seekTo(duration * pct, true);
          });

        }, 800);
      });
      
      card.addEventListener('mouseleave', () => {
        clearTimeout(hoverTimer);
        setTimeout(() => {
          if (card.matches(':hover')) return; 
          destroyActivePlayer();
        }, 50);
      });
    });
  }

  function destroyActivePlayer() {
    if(activePlayer) {
      activePlayer.destroy();
      activePlayer = null;
    }
    if(progressInterval) {
      clearInterval(progressInterval);
      progressInterval = null;
    }
    document.querySelectorAll('.player-overlay').forEach(el => el.remove());
  }

  function renderVideos(videos, append = false) {
    const html = videos.map(v => {
      state.rank++;
      return buildVideoCard(v, state.rank);
    }).join('');
    if (append) $grid.insertAdjacentHTML('beforeend', html);
    else        $grid.innerHTML = html;
    
    attachThumbFallbacks($grid);
    attachHoverPreviews($grid);
  }

  function updateTimestamp() {
    $lastUpdated.textContent = `Updated ${formatTime(new Date())}`;
  }

  // ═══════════════════════════════════════════════════════════════
  //  Status / Error
  // ═══════════════════════════════════════════════════════════════

  function showBanner(msg, isError = false) {
    $banner.textContent = msg;
    $banner.className = `status-banner${isError ? ' error' : ''}`;
    $banner.classList.remove('hidden');
  }

  function hideBanner() { $banner.classList.add('hidden'); }

  function setLoading(on) {
    state.loading = on;
    $spinner.classList.toggle('hidden', !on);
    $loadBtn.disabled = on;
  }

  // ═══════════════════════════════════════════════════════════════
  //  Data Loading
  // ═══════════════════════════════════════════════════════════════

  async function loadTrending(append = false) {
    if (state.loading) return;
    setLoading(true);
    hideBanner();
    if (!append) { state.rank = 0; state.pageToken = ''; renderSkeletons(); }

    try {
      const data = await fetchTrending(state.region, state.categoryId, state.pageToken);
      const videos = data.items || [];
      if (videos.length === 0 && !append) {
        $grid.innerHTML = '';
        showBanner('No trending videos found for this region/category.');
        $loadBtn.classList.add('hidden');
      } else {
        renderVideos(videos, append);
        if (data.nextPageToken) {
          state.pageToken = data.nextPageToken;
          $loadBtn.classList.remove('hidden');
        } else {
          state.pageToken = '';
          $loadBtn.classList.add('hidden');
        }
      }
      updateTimestamp();
    } catch (err) {
      if (!append) $grid.innerHTML = '';
      showBanner(`Failed to load trending videos: ${err.message}`, true);
      $loadBtn.classList.add('hidden');
      console.error('[YTTReborn]', err);
    } finally {
      setLoading(false);
    }
  }

  async function loadCategories() {
    try {
      state.categories = await fetchCategories(state.region);
      renderCategories(state.categories);
    } catch (err) {
      console.warn('[YTTReborn] Could not load categories:', err.message);
    }
  }

  // ═══════════════════════════════════════════════════════════════
  //  Auto-Refresh
  // ═══════════════════════════════════════════════════════════════

  function startAutoRefresh() {
    stopAutoRefresh();
    state.refreshTimer = setInterval(() => loadTrending(), REFRESH_MS);
  }

  function stopAutoRefresh() {
    if (state.refreshTimer) { clearInterval(state.refreshTimer); state.refreshTimer = null; }
  }

  // ═══════════════════════════════════════════════════════════════
  //  Event Handlers
  // ═══════════════════════════════════════════════════════════════

  $catTrack.addEventListener('click', (e) => {
    const pill = e.target.closest('.cat-pill');
    if (!pill || pill.classList.contains('active') || state.loading) return;
    $catTrack.querySelectorAll('.cat-pill').forEach(p => p.classList.remove('active'));
    pill.classList.add('active');
    state.categoryId = pill.dataset.categoryId || '';
    loadTrending();
    startAutoRefresh();
  });

  $regionSel.addEventListener('change', () => {
    state.region = $regionSel.value;
    state.categoryId = '';
    $catTrack.querySelectorAll('.cat-pill').forEach(p => p.classList.remove('active'));
    $catTrack.querySelector('#cat-all')?.classList.add('active');
    loadCategories();
    loadTrending();
    startAutoRefresh();
  });

  $loadBtn.addEventListener('click', () => loadTrending(true));

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { stopAutoRefresh(); }
    else { startAutoRefresh(); loadTrending(); }
  });

  // ─── API Key Modal Handlers ───
  $keySubmit.addEventListener('click', handleKeySubmit);
  $keyInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') handleKeySubmit(); });

  $changeKey.addEventListener('click', () => {
    stopAutoRefresh();
    showModal();
  });

  async function handleKeySubmit() {
    const key = $keyInput.value.trim();
    if (!key) {
      $keyError.textContent = 'Please enter your API key.';
      $keyError.classList.remove('hidden');
      return;
    }

    $keySubmit.disabled = true;
    $keySubmit.textContent = 'Validating...';
    $keyError.classList.add('hidden');

    const result = await validateKey(key);
    if (result.valid) {
      state.apiKey = key;
      storeKey(key);
      hideModal();
      startApp();
    } else {
      $keyError.textContent = `Invalid key: ${result.error}`;
      $keyError.classList.remove('hidden');
    }

    $keySubmit.disabled = false;
    $keySubmit.textContent = 'Start Browsing';
  }

  // ═══════════════════════════════════════════════════════════════
  //  Init
  // ═══════════════════════════════════════════════════════════════

  async function startApp() {
    renderSkeletons();
    const detected = await detectRegion();
    state.region = detected;
    $regionSel.value = detected;
    await Promise.all([loadCategories(), loadTrending()]);
    startAutoRefresh();
  }

  function init() {
    const stored = getStoredKey();
    if (stored) {
      state.apiKey = stored;
      hideModal();
      startApp();
    } else {
      showModal();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
