// Config compartilhada entre popup e content script
const SB_GTA_TERMS = ['gta 6', 'gta vi', 'grand theft auto 6', 'grand theft auto vi', 'lucia gta', 'leonida'];

const SB_DEFAULTS = {
  enabled: true,
  mode: 'blur',
  sites: { youtube: true, x: true },
  // grupo de exemplo na primeira instalação (pode ser apagado)
  groups: [{ id: 'gta6', name: 'GTA 6', terms: SB_GTA_TERMS.filter((t) => t !== 'gta 6') }]
};

const sbKey = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

function sbLoad(cb) {
  chrome.storage.sync.get(null, (raw) => {
    const s = { ...SB_DEFAULTS, ...raw };

    // migra a versão antiga (lista solta de palavras) para grupos
    if (!raw.groups && Array.isArray(raw.keywords) && raw.keywords.length) {
      const gtaKeys = SB_GTA_TERMS.map(sbKey);
      const gta = raw.keywords.filter((k) => gtaKeys.includes(sbKey(k)));
      const others = raw.keywords.filter((k) => !gtaKeys.includes(sbKey(k)));
      s.groups = [];
      if (gta.length) {
        const name = gta.find((k) => sbKey(k) === 'gta 6') ? 'GTA 6' : gta[0];
        s.groups.push({ id: 'gta6', name, terms: gta.filter((k) => sbKey(k) !== sbKey(name)) });
      }
      others.forEach((k, i) => s.groups.push({ id: 'g' + Date.now() + i, name: k, terms: [] }));
      chrome.storage.sync.set({ groups: s.groups });
      chrome.storage.sync.remove('keywords');
    }

    s.sites = { ...SB_DEFAULTS.sites, ...(raw.sites || {}) };
    delete s.keywords;
    cb(s);
  });
}
