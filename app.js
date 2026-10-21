const $ = id => document.getElementById(id);
const peso = n => '₱' + (Number.isFinite(n) ? n : 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const val = id => { const v = Number($(id).value); return Number.isFinite(v) && v >= 0 ? v : 0; };
let method = 'reducing';
let rateType = 2.8;

// ---- Random example data for placeholders ----
const FIRST = ['Juan', 'Maria', 'Jose', 'Ana', 'Mark', 'Liza', 'Rico', 'Carla', 'Paolo', 'Grace'];
const LAST = ['Dela Cruz', 'Reyes', 'Santos', 'Garcia', 'Bautista', 'Ramos', 'Mendoza', 'Cruz', 'Navarro', 'Torres'];
const BRANDS = ['Honda', 'Yamaha', 'Suzuki', 'Kawasaki', 'TVS'];
const UNITS = ['Click 125', 'Mio Gear', 'Burgman Street', 'Rouser NS160', 'NMAX 155'];
const pick = a => a[Math.floor(Math.random() * a.length)];
const randHex = n => Array.from({ length: n }, () => '0123456789ABCDEF'[Math.floor(Math.random() * 16)]).join('');
const randName = () => `${pick(LAST).toUpperCase()}, ${pick(FIRST).toUpperCase()} ${pick(LAST).toUpperCase()}`;
const randEngine = () => `JA${randHex(1)}${randHex(1)}E${randHex(6)}`;
const randChassis = () => `K2${randHex(1)}${randHex(1)}${randHex(7)}`;

const EX = {
  customerName: randName(),
  engineNo: randEngine(),
  chassisNo: randChassis(),
  odometer: '21009',
  releaseDate: '2022-10-20',
  prevTerms: '36',
  paidMA: '0',
  prevMA: '2150',
  rebate: '400',
  newBuyer: randName(),
  brand: pick(BRANDS),
  unit: pick(UNITS),
  model: '2021–22',
  originalSRP: '77500',
  downPayment: '10000',
  terms: '36',
  mir: '2.8',
  monthlyRebate: '400',
  targetMA: '2211',
  empRate: '2.8'
};

// ---- Criteria sheet ----
const CRIT = [
  { id: 'age', name: 'Age', auto: true },
  { id: 'mileage', name: 'Mileage', auto: true },
  { id: 'recon', name: 'Reconditioning cost', opts: [['S', 'Reconditioned / SP / QC'], ['A', 'Minor reconditioning'], ['E', 'Major reconditioning']] },
  { id: 'owner', name: 'No. of previous owners', opts: [['S', '0–1 owner'], ['A', '2 owners'], ['E', '3+ owners']] },
  { id: 'year', name: 'Year model', opts: [['S', 'Current / 1 year older'], ['A', '2–3 years older'], ['E', '4+ years older']] },
  { id: 'docs', name: 'Documentation', opts: [['S', 'Completed docs'], ['A', 'For completion'], ['E', 'Incomplete / issue']] },
  { id: 'reg', name: 'For registration to new buyer?', opts: [['S', 'No'], ['A', 'Yes']] }
];
$('crit').innerHTML = CRIT.map(c => `<div class="n">${c.name}</div>` + (c.auto
  ? `<div class="auto" id="${c.id}Txt">—</div>`
  : `<select id="${c.id}Sel"><option value="">Select…</option>${c.opts.map(o => `<option value="${o[0]}">${o[1]}</option>`).join('')}</select>`)
  + `<div class="chip" id="${c.id}Chip">—</div>`).join('');

function setChip(id, l) { const e = $(id + 'Chip'); const k = l && l !== '-' ? l : ''; e.textContent = k || '—'; e.className = 'chip c' + (k || '-'); }

// ---- Loan math ----
// Reducing: standard amortization
function payReducing(P, r, n) {
  if (P <= 0 || n <= 0) return 0;
  const i = r / 100;
  return i === 0 ? P / n : P * i / (1 - Math.pow(1 + i, -n));
}
// Add-on: interest on full principal for all months
function payAddon(P, r, n) {
  if (P <= 0 || n <= 0) return 0;
  return (P + P * (r / 100) * n) / n;
}
function pay(P, r, n, m) { return m === 'addon' ? payAddon(P, r, n) : payReducing(P, r, n); }

// Inverse: given monthly target, back out principal (PV) for reducing
function pvReducing(pm, r, n) {
  if (pm <= 0 || n <= 0) return 0;
  const i = r / 100;
  return i === 0 ? pm * n : pm * (1 - Math.pow(1 + i, -n)) / i;
}
function pvAddon(pm, r, n) {
  if (pm <= 0 || n <= 0) return 0;
  return pm * n / (1 + (r / 100) * n);
}
function pv(pm, r, n, m) { return m === 'addon' ? pvAddon(pm, r, n) : pvReducing(pm, r, n); }

// Solve monthly IRR from cash flows (P borrowed, pm×n paid)
function monthlyIRR(P, pm, n) {
  if (P <= 0 || pm * n <= P) return 0;
  let lo = 0, hi = 1;
  for (let k = 0; k < 80; k++) {
    const mid = (lo + hi) / 2;
    const p = P * mid / (1 - Math.pow(1 + mid, -n));
    p > pm ? hi = mid : lo = mid;
  }
  return (lo + hi) / 2;
}

const RANK = { S: 0, A: 1, E: 2 };
let lastSell = 0;

// ---- Classification ----
function classes() {
  const rel = $('releaseDate').value;
  let ageL = '—', days = null;
  if (rel) {
    const t0 = new Date(rel + 'T00:00:00').getTime();
    const t1 = Date.now();
    days = Math.max(0, Math.floor((t1 - t0) / 864e5));
    ageL = days >= 721 ? 'E' : days >= 361 ? 'A' : 'S';
    $('ageTxt').textContent = `${days.toLocaleString()} days (${(days / 365.25).toFixed(2)} yr)`;
  } else {
    $('ageTxt').textContent = 'Enter release date';
  }
  setChip('age', ageL);

  const odom = $('odometer').value === '' ? null : val('odometer');
  let mL = '—';
  if (odom !== null) {
    mL = odom <= 12000 ? 'S' : odom <= 24000 ? 'A' : 'E';
    $('mileageTxt').textContent = `${odom.toLocaleString()} km`;
  } else {
    $('mileageTxt').textContent = 'Enter odometer';
  }
  setChip('mileage', mL);

  const letters = [];
  ['recon', 'owner', 'year', 'docs', 'reg'].forEach(id => {
    const v = $(id + 'Sel').value;
    setChip(id, v);
    if (v) letters.push(v);
  });
  if (mL !== '—') letters.push(mL);
  const crit = letters.length ? letters.reduce((a, b) => RANK[b] > RANK[a] ? b : a, 'S') : '—';
  $('overall').textContent = ageL === '—' ? '—' : (ageL + (crit === '—' ? '–' : crit));
  $('classDetail').textContent = `Age ${ageL} · Criteria ${crit}`;
}

// ---- Main update ----
function update() {
  const srp = val('originalSRP');
  const dpIn = val('downPayment');
  const n = Math.floor(val('terms'));
  const r = val('mir');
  const reb = val('monthlyRebate');
  const bMA = val('targetMA') || val('prevMA');
  const bLbl = val('targetMA') ? 'target MA' : 'previous MA';

  // Probable selling price from monthly target (so loan is solvable)
  const probable = (bMA && n) ? pv(bMA, r, n, method) + dpIn : 0;
  const sell = probable > 0 ? probable : (srp > 0 ? srp : 0);
  lastSell = sell;

  // Auto-compute selling price field (read-only)
  $('sellingPrice').value = probable > 0 ? probable.toFixed(2) : '';

  const dp = Math.min(dpIn, sell);
  const P = Math.max(0, sell - dp);

  // Monthly with chosen method (interest raises the monthly)
  const pm = pay(P, r, n, method);
  const net = Math.max(0, pm - reb);
  const tot = pm * n;

  if (probable > 0) {
    $('discount').textContent = srp > 0
      ? `Probable selling price ${peso(probable)} · ${((1 - probable / srp) * 100).toFixed(1)}% ${probable <= srp ? 'below' : 'above'} SRP · Down payment ${sell ? ((dp / sell) * 100).toFixed(0) : 0}%`
      : `Probable selling price ${peso(probable)} from ${bLbl} ${peso(bMA)} × ${n} mos`;
  } else {
    $('discount').textContent = 'Enter a target MA (or previous MA) to compute probable selling price.';
  }

  const ok = P > 0 && n > 0;
  const D = x => ok ? x : '—';

  $('probable').textContent = probable > 0 ? peso(probable) : '—';
  $('probNote').textContent = probable > 0 ? `From ${bLbl} ${peso(bMA)} × ${n} mos` : 'Enter a target MA to estimate';
  $('principal').textContent = D(peso(P));
  $('monthly').textContent = D(peso(pm));
  $('rebateOut').textContent = D('− ' + peso(Math.min(reb, pm)));
  $('net').textContent = D(peso(net));
  $('interest').textContent = D(peso(Math.max(0, tot - P)));
  const i = monthlyIRR(P, pm, n);
  $('eir').textContent = D((((Math.pow(1 + i, 12) - 1) * 100) || 0).toFixed(2) + '%');

  // Comparison — rate type (customer vs employee)
  const rem = Math.max(0, val('prevTerms') - val('paidMA'));
  const ma = val('prevMA');
  $('aMA').textContent = ma ? peso(ma) : '—';
  $('aRem').textContent = rem + ' mos';
  $('aTot').textContent = ma ? peso(ma * rem) : '—';

  const er = rateType;
  const ep = pay(P, er, n, 'reducing');
  $('rateOut').textContent = er.toFixed(2) + '% / mo';
  $('ePay').textContent = D(peso(ep));
  $('eTot').textContent = D(peso(ep * n));
  $('eInt').textContent = D(peso(Math.max(0, ep * n - P)));

  // Chips + term table
  document.querySelectorAll('#termChips button').forEach(b => b.classList.toggle('on', +b.dataset.t === n));
  $('termTable').innerHTML = P <= 0 ? '' : [12, 18, 24, 36, 48].map(t => {
    const p = pay(P, r, t, method);
    return `<tr data-t="${t}" class="${t === n ? 'on' : ''}"><td>${t} mos</td><td>${peso(p)}</td><td>${peso(Math.max(0, p - reb))}</td><td>${peso(Math.max(0, p * t - P))}</td></tr>`;
  }).join('');

  classes();
}

// ---- Chips ----
$('termChips').innerHTML = [12, 24, 36, 48].map(t => `<button type="button" data-t="${t}">${t}</button>`).join('');
$('dpChips').innerHTML = [0, 10, 20, 30].map(p => `<button type="button" data-p="${p}">${p}%</button>`).join('');

$('termChips').onclick = e => { if (e.target.dataset.t) { $('terms').value = e.target.dataset.t; $('terms').classList.remove('ex'); update(); } };
$('dpChips').onclick = e => {
  if (e.target.dataset.p !== undefined) {
    $('downPayment').value = (lastSell * e.target.dataset.p / 100).toFixed(2);
    $('downPayment').classList.remove('ex');
    update();
  }
};
$('termTable').onclick = e => {
  const tr = e.target.closest('tr');
  if (tr) { $('terms').value = tr.dataset.t; $('terms').classList.remove('ex'); update(); }
};
$('method').onclick = e => {
  const m = e.target.dataset.m; if (!m) return;
  method = m;
  document.querySelectorAll('#method button').forEach(b => b.classList.toggle('on', b.dataset.m === m));
  update();
};
$('rateType').onclick = e => {
  const r = e.target.dataset.r; if (!r) return;
  rateType = Number(r);
  document.querySelectorAll('#rateType button').forEach(b => b.classList.toggle('on', b.dataset.r === r));
  update();
};
$('rebate').addEventListener('input', () => {
  $('monthlyRebate').value = $('rebate').value;
  $('monthlyRebate').classList.remove('ex');
});

// ---- Reset / example / clear ----
['recon', 'owner', 'year', 'docs', 'reg'].forEach(k => { $(k + 'Sel').value = 'S'; });
const fields = [...document.querySelectorAll('input,select')];
fields.forEach(el => { if (el.tagName === 'INPUT' && el.type !== 'date') el.placeholder = EX[el.id] || ''; el.classList.add('ex'); });
// Also set examples as grey placeholders (not values)
Object.entries(EX).forEach(([id, v]) => {
  const el = $(id);
  if (!el) return;
  if (el.type === 'date') { el.value = v; el.classList.remove('ex'); }
  else { el.placeholder = v; }
});

function setMethod(m) {
  method = m;
  document.querySelectorAll('#method button').forEach(b => b.classList.toggle('on', b.dataset.m === m));
}
function loadExample() {
  Object.entries(EX).forEach(([id, v]) => {
    const el = $(id);
    if (!el) return;
    if (el.type === 'date') { el.value = v; el.classList.remove('ex'); }
    else { el.value = v; el.classList.add('ex'); }
  });
  setMethod('reducing');
  update();
}
function clearAll() {
  fields.forEach(el => { el.value = ''; el.classList.remove('ex'); });
  setMethod('reducing');
  update();
}
$('reset').onclick = () => { loadExample(); update(); };
$('clear').onclick = clearAll;

// Remove "ex" on user interaction
document.addEventListener('input', e => e.target.classList && e.target.classList.remove('ex'), true);
document.addEventListener('change', e => e.target.classList && e.target.classList.remove('ex'), true);
document.querySelectorAll('input,select').forEach(el => {
  el.addEventListener('input', update);
  el.addEventListener('change', update);
});

// ---- Theme ----
function applyTheme(t) {
  document.documentElement.dataset.theme = t;
  $('theme').textContent = t === 'dark' ? 'Light mode' : 'Dark mode';
}
applyTheme(matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
$('theme').onclick = () => applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');

// ---- Print / Save PDF ----
function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
function fnSafe(s) { return String(s || '').replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, '').slice(0, 40); }
function buildPrint() {
  update();
  const g = id => esc($(id).value.trim() || '—');
  const t = id => esc($(id).textContent);
  const sel = id => { const s = $(id); return esc(s.value ? s.options[s.selectedIndex].text : '—'); };
  const kv = (rows, cls = '') => `<table class="kv"><tbody>${rows.map(([k, v, c]) => `<tr class="${c || ''}"><th>${k}</th><td>${v}</td></tr>`).join('')}</tbody></table>`;
  const hasEx = fields.some(el => el.classList.contains('ex') && el.value !== '');
  const sellShown = $('sellingPrice').value ? peso(val('sellingPrice')) : ($('probable').textContent !== '—' ? t('probable') + ' (probable)' : '—');
  const evalRows = [
    ['Age', t('ageTxt'), t('ageChip')],
    ['Mileage', t('mileageTxt'), t('mileageChip')],
    ['Reconditioning cost', sel('reconSel'), t('reconChip')],
    ['No. of previous owners', sel('ownerSel'), t('ownerChip')],
    ['Year model', sel('yearSel'), t('yearChip')],
    ['Documentation', sel('docsSel'), t('docsChip')],
    ['For registration to new buyer?', sel('regSel'), t('regChip')]
  ].map(r => `<tr><td>${r[0]}</td><td>${r[1]}</td><td class="r"><b>${r[2]}</b></td></tr>`).join('');
  const termRows = [...$('termTable').rows].map(r => `<tr class="${r.classList.contains('on') ? 'on' : ''}">` + [...r.cells].map((c, i) => `<td class="${i ? 'r' : ''}">${esc(c.textContent)}</td>`).join('') + '</tr>').join('');
  const mth = document.querySelector('#method button.on').textContent;
  const rateName = document.querySelector('#rateType button.on').textContent;

  const client = $('customerName').value.trim() || 'Client';
  const unit = ($('unit').value.trim() || $('model').value.trim() || 'Unit');
  const d = new Date();
  const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}_${String(d.getHours()).padStart(2, '0')}-${String(d.getMinutes()).padStart(2, '0')}`;
  // Used by browser's Save-as-PDF dialog
  document.title = `${fnSafe(client)}_${fnSafe(unit)}_${stamp}`;

  $('printSheet').innerHTML = `
    <h1>Repo Pricing Summary</h1>
    <p class="pmeta">${esc(client)} · ${esc(unit)} · Printed ${d.toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })}${hasEx ? ' · <span class="pwarn">CONTAINS EXAMPLE DATA</span>' : ''}</p>
    <div class="pclass"><b>${t('overall')}</b><span>Overall class · ${t('classDetail')}</span></div>
    <div class="pgrid">
      <div><h3>Previous account</h3>${kv([
    ['Name', g('customerName')],
    ['Engine no.', g('engineNo')],
    ['Chassis no.', g('chassisNo')],
    ['Odometer (km)', g('odometer')],
    ['Released to 1st owner', g('releaseDate')],
    ['Previous terms', g('prevTerms')],
    ['No. of paid MA', g('paidMA')],
    ['Previous MA', $('prevMA').value ? peso(val('prevMA')) : '—'],
    ['Rebate', $('rebate').value ? peso(val('rebate')) : '—']
  ])}</div>
      <div><h3>Unit</h3>${kv([
    ['Brand', g('brand')],
    ['Unit', g('unit')],
    ['Model', g('model')],
    ['Original SRP', $('originalSRP').value ? peso(val('originalSRP')) : '—'],
    ['Selling price', esc(sellShown)],
    ['New buyer', g('newBuyer')]
  ])}
        <h3>Unit evaluation</h3><table class="grid"><tbody>${evalRows}</tbody></table></div>
    </div>
    <div class="pgrid">
      <div><h3>New computation</h3>${kv([
    ['Down payment', peso(val('downPayment'))],
    ['Amount financed', t('principal')],
    ['Terms', val('terms') ? val('terms') + ' months' : '—'],
    ['Monthly interest rate', val('mir').toFixed(2) + '%'],
    ['Method', mth],
    ['Monthly amortization', t('monthly')],
    ['Less: rebate', t('rebateOut')],
    ['Total interest', t('interest')],
    ['Effective annual rate', t('eir')],
    ['Net amortization', t('net'), 'key']
  ])}</div>
      <div><h3>Compare terms</h3>
        <table class="grid"><thead><tr><th>Terms</th><th class="r">Monthly</th><th class="r">Net</th><th class="r">Interest</th></tr></thead><tbody>${termRows}</tbody></table>
        <h3>Assume balance</h3>${kv([['Previous MA', t('aMA')], ['Remaining terms', t('aRem')], ['Remaining payments', t('aTot')]])}
        <h3>${esc(rateName)}</h3>${kv([['Rate', t('rateOut')], ['Monthly payment', t('ePay')], ['Total payments', t('eTot')], ['Interest', t('eInt')]])}
      </div>
    </div>
    <div class="sign"><div>Prepared by</div><div>Approved by</div><div>Buyer's signature</div></div>
    <p class="pfoot">Estimates use standard loan formulas and may differ from the original workbook. Verify company rules before operational use.</p>`;
}

$('print').onclick = () => { buildPrint(); window.print(); };
window.addEventListener('beforeprint', buildPrint);

update();