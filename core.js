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

  // O estado fica num atributo data-sb (blur | revealed | hide), não em classes:
  // o React do X reescreve o className dos posts e apagaria as classes da extensão.
  const revealedNoId = new WeakSet(); // cards sem id que o usuário revelou

  function clearCard(el) {
    delete el.dataset.sb;
    el.querySelectorAll(':scope > .sb-overlay, .sb-badge').forEach((o) => o.remove());
  }

  // o DOM ainda está como a extensão deixou? (o site pode ter redesenhado o card)
  function intact(el, state) {
    if ((el.dataset.sb || '') !== state) return false;
    if (state === 'blur') return !!el.querySelector(':scope > .sb-overlay');
    if (state === 'revealed') return !!el.querySelector('.sb-badge');
    return true;
  }

  function makeBadge(id) {
    const badge = document.createElement('div');
    badge.className = 'sb-badge';
    badge.title = 'Borrar de novo';
    if (id) badge.dataset.sbId = id;
    const icon = document.createElement('span');
    icon.className = 'sb-icon';
    badge.appendChild(icon);
    return badge;
  }

  function processCard(el) {
    // evita processar um card dentro de outro (ex.: rich-item > lockup)
    if (el.parentElement && el.parentElement.closest(adapter.cardSel)) return;

    const text = defaultText(el);
    const prev = cache.get(el);
    if (prev && prev.text === text && prev.ver === SB.version && intact(el, prev.state)) return;

    clearCard(el);
    const m = SB.findMatch(text);
    let state = '';

    if (m) {
      const id = adapter.getId(el);
      if (SB.settings.mode === 'hide') {
        state = 'hide';
      } else if (id ? SB.revealed.has(id) : revealedNoId.has(el)) {
        // selo para borrar de novo, em cima da mídia quando houver
        state = 'revealed';
        const host = adapter.badgeHost(el);
        const badge = makeBadge(id);
        if (!host) badge.classList.add('sb-badge-card');
        (host || el).appendChild(badge);
      } else {
        state = 'blur';
        const ov = document.createElement('div');
        ov.className = 'sb-overlay';
        if (id) ov.dataset.sbId = id;
        const pill = document.createElement('span');
        pill.className = 'sb-pill';
        pill.dataset.kw = m.label; // texto vai via CSS, pra não "sujar" o textContent do card
        ov.appendChild(pill);
        el.appendChild(ov);
        el.querySelectorAll('video').forEach((v) => { if (!v.paused) v.pause(); });
      }
      if (state) el.dataset.sb = state;
    }

    cache.set(el, { text, ver: SB.version, state });
  }

  // revela/borra de novo e atualiza tudo que for desse id
  SB.toggleReveal = (id) => {
    if (SB.revealed.has(id)) SB.revealed.delete(id);
    else SB.revealed.add(id);
    SB.version++;
    scan();
  };

  // Cliques nos controles da extensão são tratados na fase de captura da janela,
  // antes de qualquer handler do site (o X captura cliques na raiz da página).
  const CONTROL_SEL = '.sb-overlay, .sb-badge';
  const controlOf = (e) => (e.target instanceof Element ? e.target.closest(CONTROL_SEL) : null);

  ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'touchstart', 'touchend', 'dblclick', 'auxclick',
   'mouseover', 'mouseout', 'mousemove', 'pointerover', 'pointermove'].forEach((t) =>
    window.addEventListener(t, (e) => { if (controlOf(e)) e.stopPropagation(); }, { capture: true })
  );

  window.addEventListener('click', (e) => {
    const ctrl = controlOf(e);
    if (!ctrl) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    const id = ctrl.dataset.sbId;
    if (id) { SB.toggleReveal(id); return; }
    const card = ctrl.closest('[data-sb]');
    if (!card) return;
    if (revealedNoId.has(card)) revealedNoId.delete(card);
    else revealedNoId.add(card);
    cache.delete(card);
    processCard(card);
  }, { capture: true });

  // vídeo dentro de card borrado não toca (autoplay do X, previews)
  document.addEventListener('play', (e) => {
    const v = e.target;
    if (v instanceof HTMLVideoElement && v.closest('[data-sb="blur"]')) v.pause();
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
