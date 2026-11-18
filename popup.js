let state = { ...SB_DEFAULTS, groups: [] };
const openGroups = new Set();
const $ = (s) => document.querySelector(s);

const splitTerms = (s) => s.split(',').map((t) => t.trim()).filter(Boolean);
const newId = () => 'g' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

function save() {
  chrome.storage.sync.set({ enabled: state.enabled, mode: state.mode, groups: state.groups, sites: state.sites });
  render();
}

function addTerms(group, list) {
  const seen = new Set([sbKey(group.name), ...group.terms.map(sbKey)]);
  list.forEach((t) => {
    if (!seen.has(sbKey(t))) { group.terms.push(t); seen.add(sbKey(t)); }
  });
}

function el(tag, props = {}, children = []) {
  const n = Object.assign(document.createElement(tag), props);
  children.forEach((c) => n.append(c));
  return n;
}

function countLabel(n) {
  if (!n) return 'sem variações';
  return n === 1 ? '1 variação' : `${n} variações`;
}

function renderGroup(g) {
  const isOpen = openGroups.has(g.id);
  const remove = el('button', { className: 'icon-btn', textContent: '×', title: 'Apagar tema' });
  remove.onclick = (e) => {
    e.stopPropagation();
    state.groups = state.groups.filter((x) => x.id !== g.id);
    openGroups.delete(g.id);
    save();
  };

  const head = el('div', { className: 'head' }, [
    el('span', { className: 'chev', textContent: '▶' }),
    el('span', { className: 'name', textContent: g.name, title: g.name }),
    el('span', { className: 'count', textContent: countLabel(g.terms.length) }),
    remove
  ]);
  head.onclick = () => {
    isOpen ? openGroups.delete(g.id) : openGroups.add(g.id);
    render();
  };

  const box = el('div', { className: 'group' + (isOpen ? ' open' : '') }, [head]);
  if (!isOpen) return box;

  const chips = el('div', { className: 'chips' });
  g.terms.forEach((t, i) => {
    const x = el('button', { className: 'icon-btn', textContent: '×', title: 'Remover variação' });
    x.onclick = () => { g.terms.splice(i, 1); save(); };
    chips.append(el('span', { className: 'chip' }, [t, x]));
  });

  const input = el('input', { type: 'text', placeholder: 'Adicionar variação', autocomplete: 'off' });
  const form = el('form', {}, [input, el('button', { type: 'submit', textContent: 'Adicionar' })]);
  form.onsubmit = (e) => {
    e.preventDefault();
    addTerms(g, splitTerms(input.value));
    save();
    const again = document.querySelector(`[data-gid="${g.id}"] input`);
    if (again) again.focus();
  };

  const body = el('div', { className: 'body' }, g.terms.length ? [chips, form] : [form]);
  box.append(body);
  return box;
}

function render() {
  $('#enabled').checked = state.enabled;
  document.querySelectorAll('input[name=mode]').forEach((r) => (r.checked = r.value === state.mode));
  document.querySelectorAll('input[data-site]').forEach((c) => (c.checked = state.sites[c.dataset.site] !== false));

  const list = $('#groups');
  list.textContent = '';
  if (!state.groups.length) {
    list.append(el('div', { className: 'muted', textContent: 'Nenhum tema ainda. Crie o primeiro acima.' }));
  }
  state.groups.forEach((g) => {
    const node = renderGroup(g);
    node.dataset.gid = g.id;
    list.append(node);
  });
}

sbLoad((s) => { state = s; render(); });

$('#form').addEventListener('submit', (e) => {
  e.preventDefault();
  const [name, ...terms] = splitTerms($('#kw').value);
  if (!name) return;

  let g = state.groups.find((x) => sbKey(x.name) === sbKey(name));
  if (!g) {
    g = { id: newId(), name, terms: [] };
    state.groups.push(g);
  }
  addTerms(g, terms);
  openGroups.add(g.id);
  $('#kw').value = '';
  save();
  const input = document.querySelector(`[data-gid="${g.id}"] input`);
  if (input) input.focus();
});

document.querySelectorAll('input[data-site]').forEach((c) =>
  c.addEventListener('change', (e) => { state.sites = { ...state.sites, [c.dataset.site]: e.target.checked }; save(); })
);

$('#enabled').addEventListener('change', (e) => { state.enabled = e.target.checked; save(); });

document.querySelectorAll('input[name=mode]').forEach((r) =>
  r.addEventListener('change', (e) => { state.mode = e.target.value; save(); })
);

$('#reset').addEventListener('click', (e) => {
  chrome.storage.local.set({ resetAt: Date.now() });
  const b = e.currentTarget;
  b.textContent = 'Pronto, tudo borrado';
  b.classList.add('done');
  setTimeout(() => { b.textContent = 'Borrar tudo'; b.classList.remove('done'); }, 1500);
});
