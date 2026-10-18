'use strict';
/* ===== Golden Hour - app.js =====
   Everything runs in your browser. Nothing is uploaded anywhere. */

const CASE_KEY = 'goldenHour_case_v1';
const RADAR_KEY = 'goldenHour_radar_v1';
const HOUR_MS = 60 * 60 * 1000;
const RING_LENGTH = 653.45; // 2 * PI * 104

const DEMO_TEXT =
  'Dear customer, your KYC will expire today. Pay Rs. 8,000 refund processing fee to ' +
  'refund.helpdesk@fakebank and update details at https://bit.ly/kyc-update-demo . ' +
  'Call +91 99999 00001 now. Your OTP is 482913.';

const STEPS = [
  { id: 'bank', title: 'Call your bank and ask them to freeze or flag the payment',
    how: "Use the number on the back of your card or inside your bank's official app. Tell them the time, the amount and the transaction ID. Don't use a number from a search result or a message." },
  { id: 'helpline', title: 'Call the national cybercrime helpline, 1930',
    how: 'Keep the transaction ID, the amount and the scammer\'s number ready. Check the number on the official cybercrime portal before you rely on it.',
    link: { label: 'Call 1930', href: 'tel:1930' } },
  { id: 'portal', title: 'File a report on the cybercrime portal',
    how: 'Use your draft from the Complaint tab. Type the portal address yourself or open it from an official site.',
    link: { label: 'Open cybercrime.gov.in', href: 'https://cybercrime.gov.in', external: true } },
  { id: 'evidence', title: 'Save your evidence',
    how: "Keep screenshots of the chat, the payment receipt, the caller's number and the transaction ID. Don't delete the chat.",
    tab: { label: 'Open Evidence', name: 'evidence' } },
  { id: 'block', title: 'Block the scammer',
    how: 'Block the number on calls and WhatsApp, and report the UPI ID inside your payment app.' },
  { id: 'secure', title: 'Secure your accounts',
    how: 'Change your banking and email passwords, log out of other devices and turn on two-step verification.' },
  { id: 'tell', title: 'Tell someone you trust',
    how: 'A family member or friend can make calls with you and help you stay calm.' }
];

const SEED_RADAR = {
  'upi:refund.helpdesk@fakebank': { type: 'upi', value: 'refund.helpdesk@fakebank', reports: 47, label: 'Fake refund' },
  'phone:9999900001': { type: 'phone', value: '9999900001', reports: 12, label: 'Fake KYC call' },
  'link:bit.ly/kyc-update-demo': { type: 'link', value: 'bit.ly/kyc-update-demo', reports: 8, label: 'Fake KYC link' }
};

/* <pure> */
function normalizeId(type, value) {
  if (type === 'phone') return String(value).replace(/\D/g, '').slice(-10);
  if (type === 'upi') return String(value).trim().toLowerCase();
  return String(value).trim().toLowerCase()
    .replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/[\s.,;:!?)\]]+$/, '').replace(/\/$/, '');
}

function redactSensitive(text) {
  let hits = 0;
  let out = text.replace(/\b\d(?:[ -]?\d){12,18}\b/g, () => { hits++; return '[card number hidden]'; });
  out = out.replace(/\b(otp|pin|cvv)\b(\s*(?:is|:|=|-)?\s*)(\d{3,8})\b/gi, (m, k, mid) => { hits++; return k + mid + '[hidden]'; });
  out = out.replace(/\b(\d{4,8})\b(\s+is\s+(?:your\s+)?(?:otp|one[- ]time password))/gi, (m, d, rest) => { hits++; return '[hidden]' + rest; });
  out = out.replace(/\b(password|passcode)\b(\s*(?:is|:|=)?\s*)(\S+)/gi, (m, k, mid) => { hits++; return k + mid + '[hidden]'; });
  return { text: out, hits };
}

function extractDetails(text) {
  const phones = new Set(), upis = new Set(), links = new Set(), amounts = new Set();

  for (const m of text.matchAll(/(?<!\d)(?:(?:\+|00)?91[\s-]?)?([6-9]\d{4})[\s-]?(\d{5})(?!\d)/g)) {
    phones.add(m[1] + m[2]);
  }
  for (const m of text.matchAll(/\b[\w.\-]{2,}@[a-zA-Z][a-zA-Z0-9]{1,}(?![a-zA-Z0-9]|\.[a-zA-Z0-9])/g)) {
    upis.add(m[0].toLowerCase());
  }
  const linkRe = /\b(?:https?:\/\/|www\.)[^\s<>"')]+|\b(?:bit\.ly|tinyurl\.com|t\.co|rb\.gy|cutt\.ly|is\.gd)\/[^\s<>"')]+/gi;
  for (const m of text.matchAll(linkRe)) {
    links.add(m[0].replace(/[.,;:!?]+$/, ''));
  }
  for (const m of text.matchAll(/(?:₹|rs\.?|inr)\s?(\d[\d,]*(?:\.\d{1,2})?)/gi)) {
    amounts.add('Rs. ' + m[1]);
  }
  return { phones: [...phones], upis: [...upis], links: [...links], amounts: [...amounts] };
}
/* </pure> */

/* ---------- small helpers ---------- */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

function load(key) { try { return JSON.parse(localStorage.getItem(key)); } catch (e) { return null; } }
function save(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { /* storage unavailable */ } }
function remove(key) { try { localStorage.removeItem(key); } catch (e) { /* ignore */ } }

function el(tag, props = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') n.className = v;
    else if (k === 'text') n.textContent = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v);
  }
  kids.forEach(kid => n.append(kid));
  return n;
}

let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
}

function fmtPhone(ten) { return '+91 ' + ten.slice(0, 5) + ' ' + ten.slice(5); }
function maskPhone(ten) { return '+91 ••••• ' + ten.slice(5); }
function fmtDate(ms) { return new Date(ms).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }); }

/* ---------- state ---------- */
let state = load(CASE_KEY);
let radar = load(RADAR_KEY) || JSON.parse(JSON.stringify(SEED_RADAR));
let useDemo = false;
let tickTimer = null;
const sessionThumbs = []; // object URLs live only in this tab
const sessionImages = []; // compressed screenshots, kept in memory only

function persist() { save(CASE_KEY, state); }

function wipeAll() {
  remove(CASE_KEY);
  state = null;
  sessionThumbs.forEach(u => URL.revokeObjectURL(u));
  sessionThumbs.length = 0;
  sessionImages.length = 0;
  clearInterval(tickTimer);
}

/* ---------- start screen ---------- */
$('#demoBtn').addEventListener('click', () => {
  $('#scamType').value = 'UPI or payment fraud';
  $('#amount').value = 8000;
  $('#minutesAgo').value = 12;
  $('#consent').checked = true;
  useDemo = true;
  toast('Demo data filled in. Press Start my case.');
});

$('#startForm').addEventListener('submit', e => {
  e.preventDefault();
  const f = new FormData(e.target);
  const minutes = Math.max(0, Math.min(1440, Number(f.get('minutesAgo')) || 0));
  state = {
    scamType: f.get('scamType'),
    amount: Number(f.get('amount')) || 0,
    incidentAt: Date.now() - minutes * 60000,
    expiresAt: Date.now() + Number(f.get('keep')) * HOUR_MS,
    done: [], text: useDemo ? DEMO_TEXT : '', found: null, redactions: 0,
    files: [], notes: '', txnId: '', yourName: '', shared: [], ai: null
  };
  persist();
  showDashboard();
});

/* ---------- screens ---------- */
function showStart() {
  $('#start').hidden = false;
  $('#dashboard').hidden = true;
  window.scrollTo({ top: 0 });
}

function showDashboard() {
  $('#start').hidden = true;
  $('#dashboard').hidden = false;
  $('#evidenceText').value = state.text || '';
  $('#txnId').value = state.txnId || '';
  $('#yourName').value = state.yourName || '';
  $('#notes').value = state.notes || '';
  renderSteps();
  renderProgress();
  renderThumbs();
  renderFound();
  renderAI();
  renderRadar();
  renderComplaint();
  tick();
  clearInterval(tickTimer);
  tickTimer = setInterval(tick, 1000);
  showTab('steps', false);
  window.scrollTo({ top: 0 });
}

/* ---------- countdown ---------- */
function tick() {
  if (!state) return;
  if (state.expiresAt && Date.now() > state.expiresAt) { wipeAll(); showStart(); return; }
  const left = state.incidentAt + HOUR_MS - Date.now();
  const card = $('#clockCard');
  const shown = Math.max(0, left);
  const mm = String(Math.floor(shown / 60000)).padStart(2, '0');
  const ss = String(Math.floor((shown % 60000) / 1000)).padStart(2, '0');
  $('#clockTime').textContent = mm + ':' + ss;
  $('#ringBar').style.strokeDashoffset = String(RING_LENGTH * (1 - Math.min(1, shown / HOUR_MS)));

  let st = 'calm';
  if (left <= 0) st = 'late';
  else if (left < 10 * 60000) st = 'urgent';
  else if (left < 30 * 60000) st = 'soon';
  card.dataset.state = st;

  if (left <= 0) {
    const over = Math.floor(-left / 60000);
    $('#clockLabel').textContent = 'first hour has passed';
    $('#clockNote').textContent = 'It passed ' + over + ' minutes ago. Do the steps now. Reporting late is still worth it.';
  } else {
    $('#clockLabel').textContent = 'left in the first hour';
    $('#clockNote').textContent = st === 'urgent'
      ? 'Under 10 minutes. Call your bank first.'
      : 'Start with step 1. Call your bank.';
  }
}

/* ---------- steps ---------- */
function renderSteps() {
  const list = $('#stepsList');
  list.replaceChildren();
  STEPS.forEach((s, i) => {
    const done = state.done.includes(s.id);
    const cb = el('input', { type: 'checkbox', id: 'step-' + s.id, 'aria-label': 'Mark done: ' + s.title });
    cb.checked = done;
    cb.addEventListener('change', () => {
      state.done = cb.checked ? [...new Set([...state.done, s.id])] : state.done.filter(x => x !== s.id);
      persist(); renderSteps(); renderProgress(); renderComplaint();
    });

    const body = el('div', {},
      el('label', { class: 'step-title', for: 'step-' + s.id, text: (i + 1) + '. ' + s.title }));
    const details = el('details', {}, el('summary', { text: 'How to do this' }), el('p', { class: 'how', text: s.how }));
    if (s.link) {
      const a = el('a', { class: 'step-link', href: s.link.href, text: s.link.label });
      if (s.link.external) { a.target = '_blank'; a.rel = 'noopener noreferrer'; }
      details.append(a);
    }
    if (s.tab) {
      details.append(el('button', { class: 'step-link', type: 'button', text: s.tab.label, onclick: () => showTab(s.tab.name) }));
    }
    body.append(details);
    list.append(el('li', { class: 'step' + (done ? ' done' : '') }, cb, body));
  });
}

function renderProgress() {
  const n = state.done.length;
  $('#progressText').textContent = n + ' of ' + STEPS.length + ' steps done';
  $('#progressBar').style.width = (n / STEPS.length * 100) + '%';
}

/* ---------- tabs ---------- */
const TAB_NAMES = ['steps', 'evidence', 'radar', 'complaint'];

function showTab(name, focus = true) {
  TAB_NAMES.forEach(n => {
    const on = n === name;
    const btn = $('#tab-' + n);
    btn.setAttribute('aria-selected', String(on));
    btn.tabIndex = on ? 0 : -1;
    $('#panel-' + n).hidden = !on;
  });
  if (name === 'radar') renderRadar();
  if (name === 'complaint') renderComplaint();
  if (focus) $('#tab-' + name).scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

$$('.tabs [role="tab"]').forEach(btn => {
  btn.addEventListener('click', () => showTab(btn.id.replace('tab-', '')));
  btn.addEventListener('keydown', e => {
    const i = TAB_NAMES.indexOf(btn.id.replace('tab-', ''));
    let j = null;
    if (e.key === 'ArrowRight') j = (i + 1) % TAB_NAMES.length;
    if (e.key === 'ArrowLeft') j = (i - 1 + TAB_NAMES.length) % TAB_NAMES.length;
    if (j !== null) { e.preventDefault(); showTab(TAB_NAMES[j]); $('#tab-' + TAB_NAMES[j]).focus(); }
  });
});

/* ---------- evidence ---------- */
$('#evidenceText').addEventListener('input', e => { state.text = e.target.value; persist(); });

$('#sampleBtn').addEventListener('click', () => {
  $('#evidenceText').value = DEMO_TEXT;
  state.text = DEMO_TEXT; persist();
  toast('Sample message added. Now press Find details.');
});

$('#findBtn').addEventListener('click', () => {
  const raw = $('#evidenceText').value.trim();
  if (!raw) { toast('Paste a message first.'); $('#evidenceText').focus(); return; }
  const { text, hits } = redactSensitive(raw);
  $('#evidenceText').value = text;
  state.text = text;
  state.redactions = hits;
  state.found = extractDetails(text);
  persist(); renderFound(); renderRadar(); renderComplaint();
});

function compressImage(file, maxSide = 1280, quality = 0.8) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', quality).split(',')[1]);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('bad image')); };
    img.src = url;
  });
}

$('#fileInput').addEventListener('change', async e => {
  const files = [...e.target.files];
  e.target.value = '';
  for (const file of files) {
    if (!state.files.includes(file.name)) state.files.push(file.name);
    sessionThumbs.push({ name: file.name, url: URL.createObjectURL(file) });
    try { sessionImages.push({ name: file.name, b64: await compressImage(file) }); }
    catch (err) { toast('Could not read ' + file.name + '. Try a JPG or PNG.'); }
  }
  persist(); renderThumbs(); renderComplaint();
});

function renderThumbs() {
  const ul = $('#thumbs');
  ul.replaceChildren();
  state.files.forEach(name => {
    const t = sessionThumbs.find(x => x.name === name);
    if (t) {
      const img = el('img', { src: t.url, alt: 'Screenshot: ' + name });
      ul.append(el('li', {}, img, el('span', { text: name })));
    } else {
      ul.append(el('li', { class: 'file-only', text: name }));
    }
  });
}

function chipGroup(title, items) {
  if (!items.length) return null;
  const chips = el('div', { class: 'chips' });
  items.forEach(x => chips.append(el('span', { class: 'chip', text: x })));
  return el('div', { class: 'found-group' }, el('h3', { text: title }), chips);
}

function renderFound() {
  const box = $('#found');
  const notice = $('#redactNotice');
  box.replaceChildren();
  if (state.redactions > 0) {
    notice.hidden = false;
    notice.textContent = 'We hid ' + state.redactions + ' item(s) that looked like a card number, OTP or password. Never share these with anyone.';
  } else { notice.hidden = true; }

  if (!state.found) return;
  const f = state.found;
  const groups = [
    chipGroup('Phone numbers', f.phones.map(fmtPhone)),
    chipGroup('UPI IDs', f.upis),
    chipGroup('Links', f.links),
    chipGroup('Amounts mentioned', f.amounts)
  ].filter(Boolean);

  if (!groups.length) {
    box.append(el('p', { class: 'empty', text: 'No phone numbers, UPI IDs or links found. Check the text you pasted and try again.' }));
    return;
  }
  groups.forEach(g => box.append(g));
  box.append(el('button', { class: 'btn btn-quiet', type: 'button', text: 'Check Scam Radar', onclick: () => showTab('radar') }));
}

/* ---------- scam radar ---------- */
/* Uses Supabase when config.js has your URL and anon key.
   If it is empty, or the network fails, it falls back to demo data on this device. */
const CFG = window.GH_CONFIG || {};
const sb = (window.supabase && CFG.SUPABASE_URL && CFG.SUPABASE_ANON_KEY)
  ? window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY)
  : null;
let radarOnline = Boolean(sb);

function identifiers() {
  if (!state.found) return [];
  const f = state.found;
  return [
    ...f.phones.map(v => ({ type: 'phone', raw: v, shown: fmtPhone(v), kind: 'Phone number' })),
    ...f.upis.map(v => ({ type: 'upi', raw: v, shown: v, kind: 'UPI ID' })),
    ...f.links.map(v => ({ type: 'link', raw: v, shown: v, kind: 'Link' }))
  ].map(x => ({ ...x, key: x.type + ':' + normalizeId(x.type, x.raw) }));
}

/* --- shared radar (Supabase) --- */
async function lookupRemote(ids) {
  const hits = {};
  for (const type of ['phone', 'upi', 'link']) {
    const values = ids.filter(x => x.type === type).map(x => normalizeId(type, x.raw));
    if (!values.length) continue;
    const { data, error } = await sb.from('radar')
      .select('type,value,reports,scam_type').eq('type', type).in('value', values);
    if (error) throw error;
    (data || []).forEach(r => { hits[type + ':' + r.value] = { type: r.type, value: r.value, reports: r.reports, label: r.scam_type }; });
  }
  return hits;
}

async function topRemote() {
  const { data, error } = await sb.from('radar')
    .select('type,value,reports,scam_type').order('reports', { ascending: false }).limit(15);
  if (error) throw error;
  return (data || []).map(r => ({ type: r.type, value: r.value, reports: r.reports, label: r.scam_type }));
}

/* --- local fallback --- */
function lookupLocal(ids) {
  const hits = {};
  ids.forEach(x => { if (radar[x.key]) hits[x.key] = radar[x.key]; });
  return hits;
}
function topLocal() { return Object.values(radar).sort((a, b) => b.reports - a.reports).slice(0, 15); }

let radarRenderId = 0;
async function renderRadar() {
  const myRender = ++radarRenderId;
  const ids = identifiers();
  let hits = null, top = null;

  if (sb && radarOnline) {
    try { hits = await lookupRemote(ids); top = await topRemote(); }
    catch (e) {
      radarOnline = false;
      toast("Couldn't reach the shared radar. Showing demo data.");
    }
  }
  if (!hits) { hits = lookupLocal(ids); top = topLocal(); }
  if (myRender !== radarRenderId) return; // a newer render has started

  const mode = $('#radarMode');
  const live = Boolean(sb && radarOnline);
  mode.textContent = live ? 'Connected to the shared radar' : 'Demo mode: radar data stays on this device';
  mode.className = 'mode ' + (live ? 'live' : 'demo');

  const out = $('#radarResults');
  out.replaceChildren();
  if (!ids.length) {
    out.append(el('p', { class: 'empty', text: 'Nothing to check yet. Add the scam message in Evidence and press Find details.' }));
  } else {
    ids.forEach(x => {
      const hit = hits[x.key];
      const badge = hit
        ? el('span', { class: 'badge hit', text: 'Reported ' + hit.reports + ' times' })
        : el('span', { class: 'badge none', text: 'No reports yet' });
      out.append(el('div', { class: 'lookup' },
        el('span', { class: 'what' }, x.shown, el('span', { class: 'kind', text: x.kind })), badge));
    });
    out.append(el('p', { class: 'muted small', text: 'Counts show how many people reported a detail. They are not proof that someone is a scammer.' }));
  }

  $('#shareBtn').disabled = !($('#shareToggle').checked && ids.length);

  const body = $('#radarBody');
  body.replaceChildren();
  top.forEach(r => {
    const shown = r.type === 'phone' ? maskPhone(r.value) : r.value;
    const kind = r.type === 'phone' ? 'Phone' : r.type === 'upi' ? 'UPI ID' : 'Link';
    body.append(el('tr', {}, el('td', { text: shown }), el('td', { text: kind }), el('td', { text: String(r.reports) })));
  });
}

$('#shareToggle').addEventListener('change', renderRadar);

$('#shareBtn').addEventListener('click', async () => {
  const btn = $('#shareBtn');
  btn.disabled = true;
  let added = 0, failed = false;

  for (const x of identifiers()) {
    if (state.shared.includes(x.key)) continue;
    const value = normalizeId(x.type, x.raw);
    if (sb && radarOnline) {
      const { error } = await sb.rpc('report_identifier', { p_type: x.type, p_value: value, p_scam: state.scamType });
      if (error) { failed = true; break; }
    } else {
      const prev = radar[x.key];
      radar[x.key] = { type: x.type, value, reports: (prev ? prev.reports : 0) + 1, label: prev ? prev.label : state.scamType };
      save(RADAR_KEY, radar);
    }
    state.shared.push(x.key);
    added++;
  }
  persist();
  await renderRadar();
  toast(failed ? "Couldn't add to the shared radar. Try again."
    : added ? "Added to Scam Radar. Only the scammer's details were shared."
    : 'Already added from this case.');
});

/* ---------- AI (Gemini, called through a Supabase Edge Function) ---------- */
function aiReady() { return Boolean(CFG.SUPABASE_URL && CFG.SUPABASE_ANON_KEY); }

async function callAI(payload) {
  const headers = { 'Content-Type': 'application/json', apikey: CFG.SUPABASE_ANON_KEY };
  if (CFG.SUPABASE_ANON_KEY.startsWith('eyJ')) headers.Authorization = 'Bearer ' + CFG.SUPABASE_ANON_KEY;
  const res = await fetch(CFG.SUPABASE_URL.replace(/\/$/, '') + '/functions/v1/analyze',
    { method: 'POST', headers, body: JSON.stringify(payload) });
  let data = null;
  try { data = await res.json(); } catch (e) { /* not JSON */ }
  if (!res.ok || !data || data.error) throw new Error((data && data.error) || ('http_' + res.status));
  return data;
}

function aiErrorMessage(err) {
  const m = String(err && err.message);
  if (m === 'busy') return 'The AI is busy. Wait a minute and try again, or use Find details without AI.';
  if (m === 'server_not_configured') return 'The AI key is missing on the server. Check the GEMINI_API_KEY secret.';
  if (m.startsWith('http_401') || m.startsWith('http_403')) return 'The server refused the request. Check the function\'s JWT setting.';
  if (m.startsWith('http_404')) return 'The AI function was not found. Deploy a function named analyze.';
  return "The AI isn't available right now. Use Find details without AI instead.";
}

function renderAI() {
  const box = $('#aiResult');
  box.replaceChildren();
  const a = state.ai;
  if (!a) return;
  const label = { high: 'High risk', medium: 'Medium risk', low: 'Low risk' }[a.risk] || 'Unclear';
  box.append(
    el('div', { class: 'ai-head' },
      el('span', { class: 'risk risk-' + a.risk, text: label }),
      el('span', { class: 'muted small', text: 'AI guidance, not proof' })),
    el('p', { class: 'ai-summary', text: a.summary }));
  if (a.red_flags.length) {
    const ul = el('ul', { class: 'flags' });
    a.red_flags.forEach(f => ul.append(el('li', { text: f })));
    box.append(el('h3', { text: 'Warning signs found' }), ul);
  }
  if (a.next_step) box.append(el('p', { class: 'ai-next' }, el('strong', { text: 'Next: ' }), a.next_step));
}

$('#aiBtn').addEventListener('click', async () => {
  if (!aiReady()) { toast('Add your Supabase details to config.js first.'); return; }
  const raw = $('#evidenceText').value.trim();
  if (!raw && !sessionImages.length) { toast('Paste a message or add a screenshot first.'); return; }

  const { text, hits } = redactSensitive(raw);
  $('#evidenceText').value = text;
  state.text = text;
  state.redactions = hits;

  const btn = $('#aiBtn');
  btn.disabled = true;
  btn.textContent = 'Analyzing...';
  try {
    const data = await callAI({
      mode: 'analyze', text,
      images: sessionImages.slice(0, 2).map(i => ({ mime_type: 'image/jpeg', data: i.b64 }))
    });
    state.ai = {
      risk: ['high', 'medium', 'low'].includes(data.risk) ? data.risk : 'medium',
      summary: String(data.summary || ''),
      red_flags: Array.isArray(data.red_flags) ? data.red_flags.map(String).slice(0, 5) : [],
      next_step: String(data.next_step || '')
    };
    // Merge: re-run our own pattern check over the AI's details so only valid-looking items survive.
    const d = data.details || {};
    const extra = [...(d.phones || []), ...(d.upis || []), ...(d.links || []),
      ...(d.amounts || []).map(a => /^(₹|rs|inr)/i.test(String(a).trim()) ? a : 'Rs. ' + a)];
    state.found = extractDetails(text + '\n' + extra.join('\n'));
    persist(); renderFound(); renderAI(); renderRadar(); renderComplaint();
    toast('AI analysis ready.');
  } catch (err) {
    toast(aiErrorMessage(err));
  } finally {
    btn.disabled = false;
    btn.textContent = 'Analyze with AI';
  }
});

$('#aiComplaintBtn').addEventListener('click', async () => {
  if (!aiReady()) { toast('Add your Supabase details to config.js first.'); return; }
  if (state.notes && !confirm('Replace what you wrote with an AI draft?')) return;
  const btn = $('#aiComplaintBtn');
  btn.disabled = true;
  btn.textContent = 'Drafting...';
  try {
    const facts = {
      fraud_type: state.scamType,
      approximate_time: fmtDate(state.incidentAt),
      amount_rupees: state.amount || null,
      warning_signs: state.ai ? state.ai.red_flags : [],
      scammer_details: state.found || {},
      user_notes: state.notes || ''
    };
    const data = await callAI({ mode: 'complaint', facts });
    state.notes = String(data.narrative || '');
    $('#notes').value = state.notes;
    persist(); renderComplaint();
    toast('Draft added. Read it and fix anything that is wrong.');
  } catch (err) {
    toast(aiErrorMessage(err));
  } finally {
    btn.disabled = false;
    btn.textContent = 'Draft this with AI';
  }
});

/* ---------- complaint ---------- */
function buildComplaint() {
  const s = state;
  const f = s.found || { phones: [], upis: [], links: [], amounts: [] };
  const stepDone = id => s.done.includes(id);
  const lines = [];
  lines.push('Subject: Report of online financial fraud', '');
  lines.push('I want to report an online financial fraud.', '');
  lines.push('Type of fraud: ' + s.scamType);
  lines.push('Date and time of incident (approximate): ' + fmtDate(s.incidentAt));
  lines.push('Amount lost: ' + (s.amount ? 'Rs. ' + s.amount.toLocaleString('en-IN') : 'Not entered'));
  lines.push('Transaction ID: ' + (s.txnId || 'Not entered'), '');

  lines.push('What happened:');
  lines.push(s.notes ? s.notes : 'Not entered. (Add a short description in your own words.)', '');

  const details = [];
  if (f.phones.length) details.push('- Phone numbers: ' + f.phones.map(fmtPhone).join(', '));
  if (f.upis.length) details.push('- UPI IDs: ' + f.upis.join(', '));
  if (f.links.length) details.push('- Links: ' + f.links.join(', '));
  if (f.amounts.length) details.push('- Amounts mentioned in messages: ' + f.amounts.join(', '));
  lines.push('Scammer details found in the messages I received:');
  lines.push(details.length ? details.join('\n') : '- None found yet', '');

  lines.push('Evidence saved: ' + (s.files.length ? s.files.length + ' screenshot(s): ' + s.files.join(', ') : 'No screenshots listed'), '');

  lines.push('Actions taken so far:');
  lines.push('- Contacted my bank: ' + (stepDone('bank') ? 'Yes' : 'Not yet'));
  lines.push('- Called helpline 1930: ' + (stepDone('helpline') ? 'Yes' : 'Not yet'));
  lines.push('- Blocked the scammer: ' + (stepDone('block') ? 'Yes' : 'Not yet'));
  lines.push('- Secured my accounts: ' + (stepDone('secure') ? 'Yes' : 'Not yet'), '');

  lines.push('I request that the transaction be flagged and the matter be investigated.', '');
  lines.push('Name: ' + (s.yourName || '____________'));
  lines.push('Phone: ____________');
  return lines.join('\n');
}

function renderComplaint() { $('#complaintOutput').textContent = buildComplaint(); }

$('#txnId').addEventListener('input', e => { state.txnId = e.target.value; persist(); renderComplaint(); });
$('#yourName').addEventListener('input', e => { state.yourName = e.target.value; persist(); renderComplaint(); });
$('#notes').addEventListener('input', e => { state.notes = e.target.value; persist(); renderComplaint(); });

$('#copyBtn').addEventListener('click', async () => {
  const text = buildComplaint();
  try { await navigator.clipboard.writeText(text); toast('Complaint copied.'); }
  catch (e) {
    const ta = el('textarea', { 'aria-hidden': 'true' }); ta.value = text; document.body.append(ta); ta.select();
    try { document.execCommand('copy'); toast('Complaint copied.'); } catch (err) { toast('Copy failed. Select the text and copy it.'); }
    ta.remove();
  }
});

$('#downloadBtn').addEventListener('click', () => {
  const blob = new Blob([buildComplaint()], { type: 'text/plain' });
  const a = el('a', { href: URL.createObjectURL(blob), download: 'golden-hour-complaint.txt' });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});

$('#printBtn').addEventListener('click', () => {
  showTab('complaint', false);
  document.body.classList.add('print-complaint');
  window.print();
});
window.addEventListener('afterprint', () => document.body.classList.remove('print-complaint'));

/* ---------- delete ---------- */
$('#deleteBtn').addEventListener('click', () => $('#deleteDialog').showModal());
$('#deleteDialog').addEventListener('close', () => {
  if ($('#deleteDialog').returnValue === 'delete') {
    wipeAll();
    $('#startForm').reset();
    useDemo = false;
    showStart();
    toast('Case deleted from this device.');
  }
});

/* ---------- boot ---------- */
if (state && state.expiresAt && Date.now() > state.expiresAt) { wipeAll(); }
if (state) showDashboard(); else showStart();
