// SpoilerBlur — núcleo compartilhado (temas, matching, blur, revelar/borrar)
(() => {
  const SB = (window.SB = window.SB || {});
  let adapter = null;
  let patterns = [];
  const cache = new WeakMap(); // card -> { text, ver }

  SB.settings = { ...SB_DEFAULTS };
  SB.version = 0;
  SB.revealed = new Set(); // ids que o usuário escolheu ver

  // ---------- matching ----------
  const norm = (s) =>
    (s || '')
      .toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();

  // "gta 6", "GTA6", "gta-6" casam entre si; "gta 60" e "gta vice" não casam com "gta vi"
  function buildPatterns() {
    patterns = [];
    (SB.settings.groups || []).forEach((g) => {
      [g.name, ...(g.terms || [])].forEach((term) => {
        const compact = norm(term).replace(/ /g, '');
        if (compact) patterns.push({ label: g.name, re: new RegExp('\\b' + compact.split('').join(' ?') + '\\b') });
      });
    });
  }

  SB.findMatch = (text) => {
    const s = SB.settings;
    if (!s.enabled || !patterns.length || !adapter) return null;
    if (s.sites && s.sites[adapter.site] === false) return null;
    const n = norm(text);
    return patterns.find((p) => p.re.test(n)) || null;
  };

  // ---------- cards ----------
  function defaultText(el) {
    // junta os nós de texto com espaço, senão "GTA VI" + "1h" vira "GTA VI1h"
    const parts = [];
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) parts.push(n.nodeValue);
    el.querySelectorAll('[title], [aria-label], img[alt]').forEach((n) => {
      if (n.closest('.sb-overlay, .sb-badge')) return;
      parts.push(n.getAttribute('title') || '', n.getAttribute('aria-label') || '', n.getAttribute('alt') || '');
    });
    return parts.join(' ');
  }

  function clearCard(el) {
    el.classList.remove('sb-match', 'sb-hide', 'sb-revealed');
    el.querySelectorAll(':scope > .sb-overlay, .sb-badge').forEach((o) => o.remove());
  }

  const swallowHover = (node) =>
    ['mousedown', 'mouseup', 'pointerdown', 'mouseover', 'mousemove'].forEach((t) =>
      node.addEventListener(t, (e) => e.stopPropagation(), true)
    );
  const block = (e) => { e.preventDefault(); e.stopPropagation(); };

  function processCard(el) {
    // evita processar um card dentro de outro (ex.: rich-item > lockup)
    if (el.parentElement && el.parentElement.closest(adapter.cardSel)) return;

    const text = defaultText(el);
    const prev = cache.get(el);
    if (prev && prev.text === text && prev.ver === SB.version) return;
    cache.set(el, { text, ver: SB.version });

    clearCard(el);
    const m = SB.findMatch(text);
    if (!m) return;

    const id = adapter.getId(el);
    el.classList.add('sb-match');
    if (SB.settings.mode === 'hide') {
      el.classList.add('sb-hide');
      return;
    }

    if (id && SB.revealed.has(id)) {
      // selo para borrar de novo, em cima da mídia quando houver
      el.classList.add('sb-revealed');
      const host = adapter.badgeHost(el);
      const badge = document.createElement('div');
      badge.className = 'sb-badge' + (host ? '' : ' sb-badge-card');
      badge.title = 'Borrar de novo';
      const icon = document.createElement('span');
      icon.className = 'sb-icon';
      badge.appendChild(icon);
      swallowHover(badge);
      badge.addEventListener('click', (e) => { block(e); SB.toggleReveal(id); }, true);
      (host || el).appendChild(badge);
      return;
    }

    const ov = document.createElement('div');
    ov.className = 'sb-overlay';
    const pill = document.createElement('span');
    pill.className = 'sb-pill';
    pill.dataset.kw = m.label; // texto vai via CSS, pra não "sujar" o textContent do card
    ov.appendChild(pill);
    swallowHover(ov);
    ov.addEventListener('click', (e) => {
      block(e);
      if (!id) { el.classList.toggle('sb-revealed'); ov.remove(); return; }
      SB.toggleReveal(id);
    }, true);
    el.appendChild(ov);
    el.querySelectorAll('video').forEach((v) => { if (!v.paused) v.pause(); });
  }

  // revela/borra de novo e atualiza tudo que for desse id
  SB.toggleReveal = (id) => {
    if (SB.revealed.has(id)) SB.revealed.delete(id);
    else SB.revealed.add(id);
    SB.version++;
    scan();
  };

  // vídeo dentro de card borrado não toca (autoplay do X, previews)
  document.addEventListener('play', (e) => {
    const v = e.target;
    if (v instanceof HTMLVideoElement && v.closest('.sb-match:not(.sb-revealed)')) v.pause();
  }, true);

  // ---------- loop ----------
  function scan() {
    if (!adapter) return;
    document.querySelectorAll(adapter.cardSel).forEach(processCard);
    if (adapter.afterScan) adapter.afterScan();
  }

  let scheduled = false;
  SB.schedule = () => {
    if (scheduled) return;
    scheduled = true;
    setTimeout(() => { scheduled = false; scan(); }, 80);
  };

  function applySettings(s) {
    SB.settings = s;
    buildPatterns();
    SB.version++;
    if (adapter && adapter.onSettings) adapter.onSettings();
    SB.schedule();
  }

  SB.register = (a) => {
    adapter = a;
    document.documentElement.dataset.sbSite = a.site;
    sbLoad(applySettings);

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'sync') sbLoad(applySettings);
      // botão "Borrar tudo" do popup
      if (area === 'local' && changes.resetAt) {
        SB.revealed.clear();
        SB.version++;
        scan();
      }
    });

    new MutationObserver(SB.schedule).observe(document.documentElement, { childList: true, subtree: true });
    window.addEventListener('popstate', SB.schedule);
    (a.navEvents || []).forEach((ev) => window.addEventListener(ev, SB.schedule));
  };
})();
