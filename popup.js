let state = { ...SB_DEFAULTS, groups: [] };
const openGroups = new Set();

// marcações de animação: valem só para o próximo render
const motion = { opened: null, closed: null, created: null, eye: null };
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

// ---------- helpers de DOM ----------
function el(tag, props = {}, children = []) {
  const { attrs, ...rest } = props;
  const n = Object.assign(document.createElement(tag), rest);
  if (attrs) Object.entries(attrs).forEach(([k, v]) => n.setAttribute(k, v));
  children.forEach((c) => n.append(c));
  return n;
}

const icon = (name, size = '') => el('span', { className: `icon ${size} i-${name}`.trim(), attrs: { 'aria-hidden': 'true' } });

function iconButton(name, label, onClick, extra = '') {
  const b = el('button', { type: 'button', className: `icon-btn ${extra}`.trim(), title: label, attrs: { 'aria-label': label } }, [icon(name, 'sm')]);
  b.addEventListener('click', (e) => { e.stopPropagation(); onClick(); });
  return b;
}

function countLabel(n) {
  if (!n) return 'sem variações';
  return n === 1 ? '1 variação' : `${n} variações`;
}

// ---------- toast "Desfazer" ----------
let toastTimer = null;
let toastUndo = null;

function showToast(message, undo) {
  $('#toast-msg').textContent = message;
  toastUndo = undo;
  $('#toast').hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hideToast, 5000);
}

function hideToast() {
  $('#toast').hidden = true;
  toastUndo = null;
}

$('#toast-undo').addEventListener('click', () => {
  const undo = toastUndo;
  hideToast();
  if (undo) undo();
});

// ---------- temas ----------
function deleteGroup(g) {
  const index = state.groups.findIndex((x) => x.id === g.id);
  if (index < 0) return;
  const [removed] = state.groups.splice(index, 1);
  const wasOpen = openGroups.delete(g.id);
  save();
  showToast(`"${removed.name}" apagado`, () => {
    state.groups.splice(Math.min(index, state.groups.length), 0, removed);
    if (wasOpen) openGroups.add(removed.id);
    save();
  });
}

function renderGroup(g) {
  const isOpen = openGroups.has(g.id);
  const on = g.enabled !== false;

  const toggle = el('button', {
    type: 'button',
    className: 'head-toggle',
    attrs: { 'aria-expanded': String(isOpen), 'data-focus': `${g.id}:toggle` }
  }, [
    icon('chevron', 'sm chev'),
    el('span', { className: 'name', textContent: g.name, title: g.name }),
    el('span', { className: 'count', textContent: on ? countLabel(g.terms.length) : 'pausado' })
  ]);
  toggle.addEventListener('click', () => {
    if (isOpen) { openGroups.delete(g.id); motion.closed = g.id; }
    else { openGroups.add(g.id); motion.opened = g.id; }
    render();
  });

  // olho: riscado = borrando, aberto = pausado
  const eye = iconButton(on ? 'eye-off' : 'eye', on ? `Pausar "${g.name}"` : `Ativar "${g.name}"`, () => {
    g.enabled = !on;
    motion.eye = g.id;
    save();
  }, (on ? 'eye-on' : '') + (motion.eye === g.id ? ' popping' : ''));
  eye.setAttribute('aria-pressed', String(on));
  eye.dataset.focus = `${g.id}:eye`;

  const remove = iconButton('x', `Apagar "${g.name}"`, () => deleteGroup(g));

  const anim = motion.opened === g.id ? ' entering' : motion.closed === g.id ? ' leaving' : motion.created === g.id ? ' created' : '';
  const box = el('div', { className: 'group' + (isOpen ? ' open' : '') + (on ? '' : ' off') + anim }, [
    el('div', { className: 'head' }, [toggle, eye, remove])
  ]);
  if (!isOpen) return box;

  const chips = el('div', { className: 'chips' });
  g.terms.forEach((t, i) => {
    chips.append(el('span', { className: 'chip' }, [
      el('span', { className: 'chip-text', textContent: t, title: t }),
      iconButton('x', `Remover "${t}"`, () => { g.terms.splice(i, 1); save(); })
    ]));
  });

  const input = el('input', {
    type: 'text',
    className: 'input input-sm',
    placeholder: 'Adicionar variação',
    autocomplete: 'off',
    attrs: { 'aria-label': `Nova variação de "${g.name}"`, 'data-focus': `${g.id}:input` }
  });
  const add = el('button', {
    type: 'submit',
    className: 'btn btn-outline btn-sm btn-icon',
    title: 'Adicionar',
    attrs: { 'aria-label': 'Adicionar variação' }
  }, [icon('plus', 'sm')]);
  const form = el('form', { className: 'field-row' }, [input, add]);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    addTerms(g, splitTerms(input.value));
    save();
    focusKey(`${g.id}:input`);
  });

  box.append(el('div', { className: 'body' }, g.terms.length ? [chips, form] : [form]));
  return box;
}

function focusKey(key) {
  const target = key && document.querySelector(`[data-focus="${key}"]`);
  if (target) target.focus();
}

function render() {
  // mantém o foco do teclado no mesmo controle depois de redesenhar a lista
  const focused = document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.focus : null;

  $('#enabled').checked = state.enabled;
  document.querySelectorAll('input[name=mode]').forEach((r) => (r.checked = r.value === state.mode));
  document.querySelectorAll('input[data-site]').forEach((c) => (c.checked = state.sites[c.dataset.site] !== false));

  const list = $('#groups');
  list.textContent = '';
  if (!state.groups.length) {
    list.append(el('div', { className: 'empty' }, [
      el('strong', { textContent: 'Nenhum tema ainda' }),
      'Crie um acima. Depois, clique nele para adicionar variações.'
    ]));
  }
  state.groups.forEach((g) => list.append(renderGroup(g)));

  focusKey(focused);
  motion.opened = motion.closed = motion.created = motion.eye = null;
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
    motion.created = g.id;
  }
  addTerms(g, terms);
  openGroups.add(g.id);
  $('#kw').value = '';
  save();
  focusKey(`${g.id}:input`);
});

document.querySelectorAll('input[data-site]').forEach((c) =>
  c.addEventListener('change', (e) => { state.sites = { ...state.sites, [c.dataset.site]: e.target.checked }; save(); })
);

$('#enabled').addEventListener('change', (e) => { state.enabled = e.target.checked; save(); });

document.querySelectorAll('input[name=mode]').forEach((r) =>
  r.addEventListener('change', (e) => { state.mode = e.target.value; save(); })
);
