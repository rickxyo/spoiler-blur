// SpoilerBlur — adaptador do YouTube
(() => {
  const SB = window.SB;

  const CARD_SEL = [
    'ytd-rich-item-renderer',
    'ytd-video-renderer',
    'ytd-compact-video-renderer',
    'ytd-grid-video-renderer',
    'ytd-playlist-video-renderer',
    'ytd-playlist-panel-video-renderer',
    'ytd-reel-item-renderer',
    'ytd-movie-renderer',
    'yt-lockup-view-model',
    'ytm-shorts-lockup-view-model',
    'ytm-shorts-lockup-view-model-v2',
    'ytd-compact-radio-renderer',
    'ytd-radio-renderer'
  ].join(',');

  const THUMB_SEL = 'ytd-thumbnail, yt-thumbnail-view-model, a#thumbnail, .shortsLockupViewModelHostThumbnailContainer';

  function videoIdFromHref(href) {
    if (!href) return null;
    const m = href.match(/[?&]v=([\w-]{6,})/) || href.match(/\/shorts\/([\w-]{6,})/);
    return m ? m[1] : null;
  }

  // ---------- página do vídeo / shorts ----------
  let guard = null; // { key, overlay, blocking }

  function watchTitle() {
    const parts = [document.title.replace(/^\(\d+\)\s*/, '').replace(/\s*-\s*YouTube\s*$/, '')];
    const h1 = document.querySelector('ytd-watch-metadata #title h1, ytd-watch-metadata h1');
    if (h1) parts.push(h1.textContent);
    const reel = document.querySelector('ytd-reel-video-renderer[is-active]');
    if (reel) parts.push(reel.textContent);
    return parts.join(' ');
  }

  function activePlayer() {
    if (location.pathname.startsWith('/shorts/')) {
      return document.querySelector('ytd-reel-video-renderer[is-active] #shorts-player') ||
             document.querySelector('#shorts-player');
    }
    return document.querySelector('ytd-watch-flexy #movie_player') || document.querySelector('#movie_player');
  }

  function pauseVideos() {
    document.querySelectorAll('video').forEach((v) => { if (!v.paused) v.pause(); });
  }

  function unguard() {
    if (guard && guard.overlay) guard.overlay.remove();
    guard = null;
    document.documentElement.classList.remove('sb-watch-guarded');
  }

  const swallow = (el) =>
    ['click', 'mousedown', 'mouseup', 'pointerdown', 'dblclick'].forEach((t) =>
      el.addEventListener(t, (e) => e.stopPropagation())
    );

  function processWatch() {
    const path = location.pathname;
    const onWatch = path === '/watch' || path.startsWith('/shorts/');
    const id = videoIdFromHref(path + location.search);
    const m = onWatch && id ? SB.findMatch(watchTitle()) : null;

    if (!m) { unguard(); return; }

    const isRevealed = SB.revealed.has(id);
    const key = id + (isRevealed ? ':revealed' : ':blocked');
    if (guard && guard.key === key && guard.overlay.isConnected) {
      if (guard.blocking) pauseVideos();
      return;
    }

    const player = activePlayer();
    if (!player) return;
    unguard();

    if (isRevealed) {
      const btn = document.createElement('button');
      btn.className = 'sb-player-rehide';
      btn.title = 'Ocultar de novo';
      const icon = document.createElement('span');
      icon.className = 'sb-icon';
      const label = document.createElement('span');
      label.textContent = 'Ocultar';
      btn.append(icon, label);
      swallow(btn);
      btn.addEventListener('click', () => SB.toggleReveal(id));
      player.appendChild(btn);
      guard = { key, overlay: btn, blocking: false };
      return;
    }

    const ov = document.createElement('div');
    ov.className = 'sb-player-overlay';
    const icon = document.createElement('div');
    icon.className = 'sb-icon sb-player-icon';
    const title = document.createElement('div');
    title.className = 'sb-player-title';
    title.textContent = 'Vídeo oculto';
    const sub = document.createElement('div');
    sub.className = 'sb-player-sub';
    sub.textContent = `Esse vídeo parece ser sobre "${m.label}".`;
    const btn = document.createElement('button');
    btn.className = 'sb-player-btn';
    btn.textContent = 'Assistir mesmo assim';
    btn.addEventListener('click', () => {
      SB.toggleReveal(id);
      const v = player.querySelector('video');
      if (v) v.play().catch(() => {});
    });
    swallow(ov);
    ov.append(icon, title, sub, btn);
    player.appendChild(ov);

    document.documentElement.classList.add('sb-watch-guarded');
    guard = { key, overlay: ov, blocking: true };
    pauseVideos();
  }

  // segura o autoplay enquanto o vídeo estiver bloqueado
  document.addEventListener('play', (e) => {
    if (guard && guard.blocking && guard.overlay.isConnected && e.target instanceof HTMLVideoElement) e.target.pause();
  }, true);

  SB.register({
    site: 'youtube',
    cardSel: CARD_SEL,
    navEvents: ['yt-navigate-finish'],
    getId(el) {
      const a = el.querySelector('a[href*="watch?v="], a[href*="/shorts/"]');
      return a ? videoIdFromHref(a.getAttribute('href')) : null;
    },
    badgeHost(el) {
      return el.querySelector(THUMB_SEL);
    },
    afterScan: processWatch,
    onSettings: unguard
  });
})();
