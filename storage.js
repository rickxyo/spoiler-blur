// Config compartilhada entre popup e content script
const SB_DEFAULTS = {
  enabled: true,
  mode: 'blur',
  sites: { youtube: true, x: true },
  groups: [] // começa vazio: o usuário cria os próprios temas
};

const sbKey = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

function sbLoad(cb) {
  chrome.storage.sync.get(null, (raw) => {
    const s = { ...SB_DEFAULTS, ...raw };
    s.groups = Array.isArray(raw.groups) ? raw.groups : [];
    s.sites = { ...SB_DEFAULTS.sites, ...(raw.sites || {}) };
    cb(s);
  });
}
