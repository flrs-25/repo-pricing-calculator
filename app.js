const $ = id => document.getElementById(id);
const peso = n => '₱' + (Number.isFinite(n) ? n : 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const val = id => Math.max(0, Number($(id).value) || 0);
let method = 'reducing';

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

function setChip(id, l) { const e = $(id + 'Chip'); const k = l && l !== '-' ? l : ''; e.textContent = k || '—'; e.className = 'chip c' + (k || '-') }

function pay(P, r, n, m) {
  if (P <= 0 || n <= 0) return 0;
  if (m === 'addon') return (P + P * (r / 100) * n) / n;
  const i = r / 100; return i === 0 ? P / n : P * i / (1 - Math.pow(1 + i, -n));
}
function monthlyIRR(P, pm, n) { // solve actual monthly rate from the payment
  if (P <= 0 || pm * n <= P) return 0;
  let lo = 0, hi = 1;
  for (let k = 0; k < 60; k++) { const mid = (lo + hi) / 2; const p = P * mid / (1 - Math.pow(1 + mid, -n)); p > pm ? hi = mid : lo = mid }
  return (lo + hi) / 2;
}
const RANK = { S: 0, A: 1, E: 2 };
let lastSell = 0;
function pv(m, r, n, mt) { if (m <= 0 || n <= 0) return 0; if (mt === 'addon') return m * n / (1 + r / 100 * n); const i = r / 100; return i === 0 ? m * n : m * (1 - Math.pow(1 + i, -n)) / i }

function classes() {
  const rel = $('releaseDate').value;
  let ageL = '-', days = null;
  if (rel) { days = Math.floor((Date.now() - new Date(rel + 'T00:00:00').getTime()) / 864e5); ageL = days >= 721 ? 'E' : days >= 361 ? 'G' : 'A' }
  $('ageTxt').textContent = days === null ? 'Enter release date' : `${Math.max(0, days).toLocaleString()} days`;
  setChip('age', ageL);
  const km = val('odometer'), mL = $('odometer').value === '' ? '' : km <= 12000 ? 'S' : km <= 24000 ? 'A' : 'E';
  $('mileageTxt').textContent = mL ? `${km.toLocaleString()} km` : 'Enter odometer';
  setChip('mileage', mL);
  const letters = [mL];
  ['recon', 'owner', 'year', 'docs', 'reg'].forEach(id => { const v = $(id + 'Sel').value; setChip(id, v); letters.push(v) });
  const f = letters.filter(Boolean), crit = f.length ? f.reduce((a, b) => RANK[b] > RANK[a] ? b : a, 'S') : '–';
  $('overall').textContent = (ageL === '-' ? '–' : ageL) + crit;
  $('classDetail').textContent = `Age ${ageL} · Criteria ${crit}`;
}

function update() {
  const sellIn = val('sellingPrice'), srp = val('originalSRP'), n = Math.floor(val('terms')), r = val('mir'), reb = val('monthlyRebate'), dp0 = val('downPayment');
  const bMA = val('targetMA') || val('prevMA'), bLbl = val('targetMA') ? 'target MA' : 'previous MA';
  const probable = bMA && n ? pv(bMA, r, n, method) + dp0 : 0;
  const usingProb = !sellIn && probable > 0, sell = usingProb ? probable : sellIn;
  lastSell = sell;
  const dp = Math.min(val('downPayment'), sell), P = sell - dp;

  const pm = pay(P, r, n, method), net = Math.max(0, pm - reb), tot = pm * n;
  $('discount').textContent = usingProb ? `Selling price not entered — using the probable price of ${peso(probable)} (from ${bLbl}).` : srp > 0 ? `Selling price is ${((1 - sell / srp) * 100).toFixed(1)}% ${sell <= srp ? 'below' : 'above'} SRP · Down payment ${sell ? ((dp / sell) * 100).toFixed(0) : 0}%` : '';
  const ok = P > 0 && n > 0, D = x => ok ? x : '—';
  $('probable').textContent = probable > 0 ? peso(probable) : '—';
  $('probNote').textContent = probable > 0 ? `From ${bLbl} ${peso(bMA)} × ${n} mos` : 'Enter a target MA to estimate';
  $('sellingPrice').placeholder = usingProb ? probable.toFixed(2) + ' (probable)' : EX.sellingPrice;
  $('principal').textContent = D(peso(P)); $('monthly').textContent = D(peso(pm));
  $('rebateOut').textContent = D('− ' + peso(Math.min(reb, pm))); $('net').textContent = D(peso(net));
  $('interest').textContent = D(peso(Math.max(0, tot - P)));
  const i = monthlyIRR(P, pm, n); $('eir').textContent = D((((Math.pow(1 + i, 12) - 1) * 100) || 0).toFixed(2) + '%');

  // comparison
  const rem = Math.max(0, val('prevTerms') - val('paidMA')), ma = val('prevMA');
  $('aMA').textContent = ma ? peso(ma) : '—'; $('aRem').textContent = `${rem} mos`; $('aTot').textContent = ma ? peso(ma * rem) : '—';
  const ep = pay(P, val('empRate'), n, 'reducing');
  $('ePay').textContent = D(peso(ep)); $('eTot').textContent = D(peso(ep * n)); $('eInt').textContent = D(peso(Math.max(0, ep * n - P)));

  // chips + term table
  document.querySelectorAll('#termChips button').forEach(b => b.classList.toggle('on', +b.dataset.t === n));
  $('termTable').innerHTML = P <= 0 ? '' : [12, 18, 24, 36, 48].map(t => {
    const p = pay(P, r, t, method);
    return `<tr data-t="${t}" class="${t === n ? 'on' : ''}"><td>${t} mos</td><td>${peso(p)}</td><td>${peso(Math.max(0, p - reb))}</td><td>${peso(Math.max(0, p * t - P))}</td></tr>`
  }).join('');
  classes();
}

// chips
$('termChips').innerHTML = [12, 24, 36, 48].map(t => `<button type="button" data-t="${t}">${t}</button>`).join('');
$('dpChips').innerHTML = [0, 10, 20, 30].map(p => `<button type="button" data-p="${p}">${p}%</button>`).join('');
$('termChips').onclick = e => { if (e.target.dataset.t) { $('terms').value = e.target.dataset.t; $('terms').classList.remove('ex'); update() } };
$('dpChips').onclick = e => { if (e.target.dataset.p !== undefined) { $('downPayment').value = (lastSell * e.target.dataset.p / 100).toFixed(2); $('downPayment').classList.remove('ex'); update() } };
$('termTable').onclick = e => { const tr = e.target.closest('tr'); if (tr) { $('terms').value = tr.dataset.t; $('terms').classList.remove('ex'); update() } };
$('method').onclick = e => {
  const m = e.target.dataset.m; if (!m) return; method = m;
  document.querySelectorAll('#method button').forEach(b => b.classList.toggle('on', b.dataset.m === m)); update()
};
$('rebate').addEventListener('input', () => { $('monthlyRebate').value = $('rebate').value; $('monthlyRebate').classList.remove('ex') });

// snapshot defaults for reset
['recon', 'owner', 'year', 'docs', 'reg'].forEach(k => $(k + 'Sel').value = 'S');
const EX = {}; document.querySelectorAll('input,select').forEach(el => EX[el.id] = el.value);
Object.assign(EX, { prevMA: '2150', newBuyer: 'Juan Dela Cruz', targetMA: '2211' });
const fields = [...document.querySelectorAll('input,select')];
function setMethod(m) { method = m; document.querySelectorAll('#method button').forEach(b => b.classList.toggle('on', b.dataset.m === m)) }
function loadExample() { fields.forEach(el => { el.value = EX[el.id]; el.classList.add('ex') }); setMethod('reducing') }
function clearAll() { fields.forEach(el => { el.value = ''; el.classList.remove('ex') }); setMethod('reducing'); update() }
fields.forEach(el => { if (el.tagName === 'INPUT') el.placeholder = EX[el.id]; el.classList.add('ex'); el.addEventListener('focus', () => { if (el.classList.contains('ex') && el.tagName === 'INPUT') el.select() }) });
document.addEventListener('input', e => e.target.classList && e.target.classList.remove('ex'), true);
document.addEventListener('change', e => e.target.classList && e.target.classList.remove('ex'), true);
$('reset').onclick = () => { loadExample(); update() };
$('clear').onclick = clearAll;

document.querySelectorAll('input,select').forEach(el => { el.addEventListener('input', update); el.addEventListener('change', update) });
function applyTheme(t) { document.documentElement.dataset.theme = t; $('theme').textContent = t === 'dark' ? 'Light mode' : 'Dark mode' }
applyTheme(matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
$('theme').onclick = () => applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
// ---------- Print summary ----------
function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])) }
function buildPrint() {
  update();
  const g = id => esc($(id).value.trim() || '—');
  const t = id => esc($(id).textContent);
  const sel = id => { const s = $(id); return esc(s.value ? s.options[s.selectedIndex].text : '—') };
  const kv = (rows, cls = '') => `<table class="kv"><tbody>${rows.map(([k, v, c]) => `<tr class="${c || ''}"><th>${k}</th><td>${v}</td></tr>`).join('')}</tbody></table>`;
  const hasEx = fields.some(el => el.classList.contains('ex') && el.value !== '');
  const sellShown = $('sellingPrice').value ? peso(val('sellingPrice')) : ($('probable').textContent !== '—' ? t('probable') + ' (probable)' : '—');
  const evalRows = [
    ['Age', t('ageTxt'), t('ageChip')], ['Mileage', t('mileageTxt'), t('mileageChip')],
    ['Reconditioning cost', sel('reconSel'), t('reconChip')], ['No. of previous owners', sel('ownerSel'), t('ownerChip')],
    ['Year model', sel('yearSel'), t('yearChip')], ['Documentation', sel('docsSel'), t('docsChip')],
    ['For registration to new buyer?', sel('regSel'), t('regChip')]
  ].map(r => `<tr><td>${r[0]}</td><td>${r[1]}</td><td class="r"><b>${r[2]}</b></td></tr>`).join('');
  const termRows = [...$('termTable').rows].map(r => `<tr class="${r.classList.contains('on') ? 'on' : ''}">` + [...r.cells].map((c, i) => `<td class="${i ? 'r' : ''}">${esc(c.textContent)}</td>`).join('') + '</tr>').join('');
  const method = document.querySelector('#method button.on').textContent;
  $('printSheet').innerHTML = `
    <h1>Repo Pricing Summary</h1>
    <p class="pmeta">Printed ${new Date().toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })}${hasEx ? ' · <span class="pwarn">CONTAINS EXAMPLE DATA</span>' : ''}</p>
    <div class="pclass"><b>${t('overall')}</b><span>Overall class · ${t('classDetail')}</span></div>
    <div class="pgrid">
      <div><h3>Previous account</h3>${kv([['Name', g('customerName')], ['Engine no.', g('engineNo')], ['Chassis no.', g('chassisNo')], ['Odometer (km)', g('odometer')], ['Released to 1st owner', g('releaseDate')], ['Previous terms', g('prevTerms')], ['No. of paid MA', g('paidMA')], ['Previous MA', $('prevMA').value ? peso(val('prevMA')) : '—'], ['Rebate', $('rebate').value ? peso(val('rebate')) : '—']])}</div>
      <div><h3>Unit</h3>${kv([['Unit model', g('unitModel')], ['Original SRP', $('originalSRP').value ? peso(val('originalSRP')) : '—'], ['Selling price', esc(sellShown)], ['New buyer', g('newBuyer')]])}
        <h3>Unit evaluation</h3><table class="grid"><tbody>${evalRows}</tbody></table></div>
    </div>
    <div class="pgrid">
      <div><h3>New computation</h3>${kv([['Down payment', peso(val('downPayment'))], ['Amount financed', t('principal')], ['Terms', val('terms') ? val('terms') + ' months' : '—'], ['Monthly interest rate', val('mir').toFixed(2) + '%'], ['Method', method], ['Monthly amortization', t('monthly')], ['Less: rebate', t('rebateOut')], ['Total interest', t('interest')], ['Effective annual rate', t('eir')], ['Net amortization', t('net'), 'key']])}</div>
      <div><h3>Compare terms</h3><table class="grid"><thead><tr><th>Terms</th><th class="r">Monthly</th><th class="r">Net</th><th class="r">Interest</th></tr></thead><tbody>${termRows}</tbody></table>
        <h3>Assume balance</h3>${kv([['Previous MA', t('aMA')], ['Remaining terms', t('aRem')], ['Remaining payments', t('aTot')]])}
        <h3>Regular / employee rate (${val('empRate').toFixed(2)}%)</h3>${kv([['Monthly payment', t('ePay')], ['Total payments', t('eTot')], ['Interest', t('eInt')]])}</div>
    </div>
    <div class="sign"><div>Prepared by</div><div>Approved by</div><div>Buyer’s signature</div></div>
    <p class="pfoot">Estimates use a standard loan formula and may differ from the original workbook. Verify company rules before operational use.</p>`;
}
$('print').onclick = () => { buildPrint(); window.print() };
window.addEventListener('beforeprint', buildPrint);

update();