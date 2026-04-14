/* ══════════════════════════════════════════
   PO Sizing Tool V2 — Core Engine
   ══════════════════════════════════════════ */

// ─── CSV Parser ───
function parseCSV(t, hi) {
  hi = hi || 0;
  const rl = []; let c = '', q = false, r = [];
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (ch === '"') { if (q && t[i+1] === '"') { c += '"'; i++; } else q = !q; }
    else if (ch === ',' && !q) { r.push(c.trim()); c = ''; }
    else if ((ch === '\n' || ch === '\r') && !q) {
      if (ch === '\r' && t[i+1] === '\n') i++;
      r.push(c.trim());
      if (r.length > 1 || (r.length === 1 && r[0] !== '')) rl.push(r);
      c = ''; r = [];
    } else c += ch;
  }
  if (c || r.length) { r.push(c.trim()); rl.push(r); }
  const f = rl.filter(x => x.length > 1);
  if (f.length < hi + 1) return [];
  const h = f[hi].map(x => x.replace(/^\uFEFF/, ''));
  const res = [];
  for (let i = hi + 1; i < f.length; i++) {
    const o = {}; h.forEach((hh, idx) => { o[hh] = f[i][idx] || ''; }); res.push(o);
  }
  return res;
}

function findCol(row, cands) {
  if (!row) return null;
  const keys = Object.keys(row);
  for (const c of cands) { const f = keys.find(k => k.toLowerCase() === c.toLowerCase()); if (f) return f; }
  for (const c of cands) { const cl = c.toLowerCase(); const f = keys.find(k => k.toLowerCase().includes(cl)); if (f) return f; }
  return null;
}

function numP(v) { if (!v) return 0; return parseInt(String(v).replace(/[^0-9\-]/g, ''), 10) || 0; }
function esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
function fmt(n) { return n.toLocaleString(); }
function pct(n) { return (n * 100).toFixed(1) + '%'; }

const SO = { XXS:1, XS:2, S:3, M:4, L:5, XL:6, XXL:7, XXXL:8, '2XL':7, '3XL':8, MT:5, LT:6, XLT:7, XXLT:8, OS:0 };
function ssort(a, b) {
  const oa = SO[a.toUpperCase()] ?? null, ob = SO[b.toUpperCase()] ?? null;
  if (oa !== null && ob !== null) return oa - ob;
  if (oa !== null) return -1; if (ob !== null) return 1;
  const pa = a.match(/^(\d+)/), pb = b.match(/^(\d+)/);
  if (pa && pb) { const wa = +pa[1], wb = +pb[1]; if (wa !== wb) return wa - wb; const la = a.match(/(\d+)L$/), lb = b.match(/(\d+)L$/); if (la && lb) return +la[1] - +lb[1]; }
  return a.localeCompare(b);
}

// ═══ STATE ═══
const A = {
  raw: { inventory: null, sales: null, linelist: null, wip: null },
  uploadDates: {},
  uploadMeta: {},
  seasons: [], activeSeason: null,
  skus: {}, selectedSKU: null,
  view: 'grid', // grid | detail | settings
  overrides: {}, accepted: {},
  searchTerm: '', sortKey: 'dtcBuy',
  filters: { type: 'All', division: 'All', category: 'All', subcategory: 'All' },
  presMins: {
    'M3': { XS: 0.5, S: 1, M: 2, L: 2, XL: 1.5, XXL: 0.5 },
    'FM3': { XS: 0, S: 1, M: 2, L: 2, XL: 1.5, XXL: 0 },
  },
  presMinsDirty: false,
  scaleSizes: {}, scaleSizeCount: {}, hierSales: {}, cols: {}
};

// ─── Persistent storage ───
function loadPresMins() {
  try { const s = localStorage.getItem('sce_presMins'); if (s) A.presMins = JSON.parse(s); } catch(e) {}
}
function savePresMins() {
  try { localStorage.setItem('sce_presMins', JSON.stringify(A.presMins)); } catch(e) {}
}

// ═══ UPLOAD ═══
function handleUpload(key, inp) {
  const file = inp.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = function(ev) {
    let hi = (key === 'linelist' || key === 'wip') ? 2 : 1;
    A.raw[key] = parseCSV(ev.target.result, hi);
    A.uploadDates[key] = new Date().toLocaleString();
    A.uploadMeta[key] = { rows: A.raw[key].length, cols: A.raw[key][0] ? Object.keys(A.raw[key][0]).length : 0 };
    updateChip(key);
    trySeasons();
  };
  reader.readAsText(file);
}

function updateChip(key) {
  const chip = document.getElementById('uc-' + key);
  const meta = document.getElementById('um-' + key);
  if (A.raw[key]) {
    chip.classList.add('ok');
    const m = A.uploadMeta[key];
    meta.innerHTML = fmt(m.rows) + 'r × ' + m.cols + 'c · ' + A.uploadDates[key];
  }
}

function allUp() { return A.raw.inventory && A.raw.sales && A.raw.linelist && A.raw.wip; }

function trySeasons() {
  const el = document.getElementById('s-area');
  if (!allUp()) { el.innerHTML = '<div class="s-wait">Upload all 4 data sources to continue</div>'; return; }
  const ll = A.raw.linelist, sc = findCol(ll[0], ['Season Code']);
  const ct = {};
  ll.forEach(r => { const s = r[sc] || ''; if (s) ct[s] = (ct[s]||0)+1; });
  A.seasons = Object.keys(ct).sort();
  let h = '<div class="s-grid">';
  A.seasons.forEach(s => { h += '<div class="s-btn" onclick="goSeason(\'' + esc(s) + '\')"><div class="code">' + esc(s) + '</div><div class="ct">' + ct[s] + ' SKUs</div></div>'; });
  el.innerHTML = h + '</div>';
}

function goSeason(s) {
  A.activeSeason = s; A.selectedSKU = null; A.overrides = {}; A.accepted = {};
  A.view = 'grid'; A.sortKey = 'dtcBuy';
  A.filters = { type: 'All', division: 'All', category: 'All', subcategory: 'All' };
  processData();
  document.getElementById('welcome').classList.add('hidden');
  document.getElementById('dash').classList.add('active');
  document.getElementById('slbl').textContent = s;
  render();
}

// ═══ PROCESS ═══
function processData() {
  const inv = A.raw.inventory, sales = A.raw.sales, ll = A.raw.linelist, wip = A.raw.wip;
  const c = {};
  c.iS = findCol(inv[0], ['SKU']); c.iZ = findCol(inv[0], ['Size']); c.iO = findCol(inv[0], ['On Hand Units - TY','On Hand Units','On Hand']);
  c.sS = findCol(sales[0], ['SKU']); c.sZ = findCol(sales[0], ['Size']); c.sU = findCol(sales[0], ['Net Sales Units - TY','Net Sales Units']);
  c.sD = findCol(sales[0], ['Merchandise Division','Division','Department']); c.sC = findCol(sales[0], ['Category']);
  c.sSC = findCol(sales[0], ['Sub-Category','SubCategory','Subcategory']); c.sSD = findCol(sales[0], ['Style Description']);
  c.lS = findCol(ll[0], ['SKU']); c.lSe = findCol(ll[0], ['Season Code']); c.lDp = findCol(ll[0], ['Department']);
  c.lCa = findCol(ll[0], ['Category']); c.lSc = findCol(ll[0], ['Subcategory','Sub-Category']);
  c.lSt = findCol(ll[0], ['Style']); c.lSD = findCol(ll[0], ['Style Description']);
  c.lCC = findCol(ll[0], ['Color Code']); c.lCD = findCol(ll[0], ['Color Description']);
  c.lSS = findCol(ll[0], ['Size Scale']); c.lDB = findCol(ll[0], ['Total DTC Buy']);
  c.lSn = findCol(ll[0], ['Store Count']); c.lTr = findCol(ll[0], ['Store Tier']);
  c.lLC = findCol(ll[0], ['Seasonal Life Cycle']); c.lCm = findCol(ll[0], ['Commit Coding']);
  c.lRo = findCol(ll[0], ['Roll Out Code - Retail','Roll Out Code']); c.lPS = findCol(ll[0], ['PST PLANNING ATTRIBUTE 1']);
  c.wS = findCol(wip[0], ['SKU']); c.wZ = findCol(wip[0], ['Size']); c.wO = findCol(wip[0], ['Ordered']);
  c.wSt = findCol(wip[0], ['Shipment Status']); c.wPS = findCol(wip[0], ['PO Status']);
  c.wDC = findCol(wip[0], ['New Expected in DC','Expected in DC']);
  A.cols = c;

  // Inventory index
  const invI = {};
  inv.forEach(r => { const k = r[c.iS]; if (!invI[k]) invI[k] = {}; invI[k][r[c.iZ]] = (invI[k][r[c.iZ]]||0) + numP(r[c.iO]); });

  // Sales index + hierarchy sales (CASE-NORMALIZED keys)
  const salI = {};
  const hS = {};
  sales.forEach(r => {
    const sku = r[c.sS], sz = r[c.sZ], u = numP(r[c.sU]);
    if (!salI[sku]) salI[sku] = {};
    salI[sku][sz] = (salI[sku][sz]||0) + u;
    const d = (r[c.sD]||'').toLowerCase(), ca = (r[c.sC]||'').toLowerCase();
    const sc = (r[c.sSC]||'').toLowerCase(), pr = (r[c.sSD]||'').toLowerCase();
    ['prog|'+d+'|'+ca+'|'+sc+'|'+pr, 'sub|'+d+'|'+ca+'|'+sc, 'cat|'+d+'|'+ca, 'div|'+d].forEach(k => {
      if (!hS[k]) hS[k] = {}; hS[k][sz] = (hS[k][sz]||0) + u;
    });
  });
  A.hierSales = hS;

  // Scale sizes from sales+inv
  const skuScale = {};
  ll.forEach(r => { skuScale[r[c.lS]] = r[c.lSS]||''; });
  A.scaleSizes = {};
  sales.forEach(r => { const sc = skuScale[r[c.sS]]; if (sc && r[c.sZ]) { if (!A.scaleSizes[sc]) A.scaleSizes[sc] = new Set(); A.scaleSizes[sc].add(r[c.sZ]); }});
  inv.forEach(r => { const sc = skuScale[r[c.iS]]; if (sc && r[c.iZ]) { if (!A.scaleSizes[sc]) A.scaleSizes[sc] = new Set(); A.scaleSizes[sc].add(r[c.iZ]); }});
  for (const s in A.scaleSizes) { A.scaleSizes[s] = [...A.scaleSizes[s]].sort(ssort); A.scaleSizeCount[s] = A.scaleSizes[s].length; }

  // WIP index (unreceived only)
  const wipI = {};
  wip.forEach(r => {
    if (r[c.wPS] === 'Dropped' || r[c.wSt] === 'Received') return;
    const sku = r[c.wS], sz = r[c.wZ];
    if (!wipI[sku]) wipI[sku] = {};
    if (!wipI[sku][sz]) wipI[sku][sz] = { ordered: 0, dc: '' };
    wipI[sku][sz].ordered += numP(r[c.wO]);
    if (r[c.wDC] && !wipI[sku][sz].dc) wipI[sku][sz].dc = r[c.wDC];
  });

  // Build SKU records for active season
  A.skus = {};
  ll.filter(r => r[c.lSe] === A.activeSeason).forEach(r => {
    const sku = r[c.lS], scale = r[c.lSS]||'';
    const sizes = A.scaleSizes[scale] ? [...A.scaleSizes[scale]] : [];
    const stCt = numP(r[c.lSn]), dtcBuy = numP(r[c.lDB]);
    const sI = invI[sku]||{}, sS = salI[sku]||{}, sW = wipI[sku]||{};
    let tOH = 0, tSl = 0, tWIP = 0;
    const sd = {};
    sizes.forEach(s => {
      const oh = sI[s]||0, sl = sS[s]||0, wi = sW[s] || { ordered: 0, dc: '' };
      sd[s] = { onHand: oh, sales: sl, wipOrd: wi.ordered, wipDC: wi.dc };
      tOH += oh; tSl += sl; tWIP += wi.ordered;
    });
    let sType = dtcBuy === 0 ? 'nosize' : (tOH === 0 && tSl === 0 ? 'initials' : 'cf');
    const div = r[c.lDp]||'', cat = r[c.lCa]||'', sub = r[c.lSc]||'', prog = r[c.lSD]||'';
    A.skus[sku] = {
      sku, season: A.activeSeason, division: div, category: cat, subcategory: sub,
      style: r[c.lSt]||'', styleDescription: prog,
      colorCode: r[c.lCC]||'', colorDescription: r[c.lCD]||'',
      sizeScale: scale, sizeCount: A.scaleSizeCount[scale] || sizes.length,
      dtcBuy, storeCount: stCt, storeTier: r[c.lTr]||'',
      lifecycle: r[c.lLC]||'', commitCoding: r[c.lCm]||'',
      rollout: r[c.lRo]||'', pst: r[c.lPS]||'',
      sizingType: sType, sizes, sizeData: sd,
      totalOH: tOH, totalSales: tSl, totalWIP: tWIP,
      _hk: { prog: 'prog|'+div.toLowerCase()+'|'+cat.toLowerCase()+'|'+sub.toLowerCase()+'|'+prog.toLowerCase(),
              sub: 'sub|'+div.toLowerCase()+'|'+cat.toLowerCase()+'|'+sub.toLowerCase(),
              cat: 'cat|'+div.toLowerCase()+'|'+cat.toLowerCase(),
              div: 'div|'+div.toLowerCase() }
    };
  });
}

// ═══ SIZE CURVE ═══
function buildCurve(rec) {
  const eligible = new Set(rec.sizes);
  const thresh = 100 * rec.sizeCount;
  const levels = [
    { key: rec._hk.prog, label: rec.styleDescription, level: 'Program' },
    { key: rec._hk.sub, label: rec.subcategory, level: 'Subcategory' },
    { key: rec._hk.cat, label: rec.category, level: 'Category' },
    { key: rec._hk.div, label: rec.division, level: 'Division' },
  ];
  const trail = []; // audit trail of rejected + accepted
  for (const lv of levels) {
    const sbs = A.hierSales[lv.key];
    if (!sbs) { trail.push({ ...lv, total: 0, thresh, pass: false }); continue; }
    let total = 0; const filt = {};
    for (const s in sbs) { if (eligible.has(s)) { filt[s] = sbs[s]; total += sbs[s]; } }
    if (total >= thresh) {
      trail.push({ ...lv, total, thresh, pass: true });
      const curve = {};
      rec.sizes.forEach(s => { curve[s] = total > 0 ? (filt[s]||0)/total : 1/rec.sizes.length; });
      return { curve, level: lv.level + ' (' + lv.label + ')', total, trail };
    }
    trail.push({ ...lv, total, thresh, pass: false });
  }
  const curve = {}; rec.sizes.forEach(s => { curve[s] = 1/rec.sizes.length; });
  return { curve, level: 'Even distribution (insufficient data)', total: 0, trail };
}

function getPresMin(rec) {
  const cfg = A.presMins[rec.sizeScale] || {};
  const fl = {};
  rec.sizes.forEach(s => { fl[s] = Math.ceil((cfg[s] !== undefined ? cfg[s] : 0) * rec.storeCount); });
  return fl;
}

function getWeeksToReceipt(rec) {
  let earliest = null;
  rec.sizes.forEach(s => { const dc = rec.sizeData[s].wipDC; if (dc) { const d = new Date(dc); if (!isNaN(d) && (!earliest || d < earliest)) earliest = d; }});
  if (!earliest) return 12;
  return Math.max(0, Math.ceil((earliest - new Date()) / (7*24*60*60*1000)));
}

function projBOP(rec) {
  const w = getWeeksToReceipt(rec);
  const bop = {};
  rec.sizes.forEach(s => { const oh = rec.sizeData[s].onHand; const wr = rec.sizeData[s].sales/52; bop[s] = Math.max(0, Math.round(oh - wr * w)); });
  bop._w = w; return bop;
}

function computeAlloc(rec) {
  if (!rec || rec.dtcBuy <= 0 || !rec.sizes.length) return null;
  const cr = buildCurve(rec), curve = cr.curve, pm = getPresMin(rec), pool = rec.dtcBuy;
  const ovr = A.overrides[rec.sku] || {}, isCF = rec.sizingType === 'cf';
  let bop = {}, wtr = 0;
  if (isCF) { const bp = projBOP(rec); wtr = bp._w; delete bp._w; bop = bp; }
  const totalBOP = isCF ? Object.values(bop).reduce((a,b)=>a+b,0) : 0;
  const totalTgt = totalBOP + pool;
  const ideal = {}, raw = {};
  rec.sizes.forEach(s => {
    ideal[s] = Math.round(curve[s] * totalTgt);
    raw[s] = isCF ? Math.max(0, ideal[s] - bop[s]) : Math.round(curve[s] * pool);
  });
  const wf = {}; rec.sizes.forEach(s => { wf[s] = Math.max(raw[s], pm[s]); });
  const alloc = {};
  const floorSum = Object.values(pm).reduce((a,b)=>a+b,0);
  const wfSum = Object.values(wf).reduce((a,b)=>a+b,0);
  if (wfSum <= pool) {
    const rem = pool - floorSum;
    const above = {}; rec.sizes.forEach(s => { above[s] = Math.max(0, raw[s] - pm[s]); });
    const abSum = Object.values(above).reduce((a,b)=>a+b,0);
    rec.sizes.forEach(s => { alloc[s] = pm[s] + (abSum > 0 && rem > 0 ? Math.round(above[s]/abSum*rem) : 0); });
  } else {
    rec.sizes.forEach(s => { alloc[s] = Math.round(wf[s]/wfSum*pool); });
  }
  let hasOvr = false;
  rec.sizes.forEach(s => { if (ovr[s] !== undefined) { alloc[s] = ovr[s]; hasOvr = true; }});
  if (!hasOvr) {
    const at = Object.values(alloc).reduce((a,b)=>a+b,0);
    if (at !== pool && rec.sizes.length) { const ms = rec.sizes.reduce((a,b)=>alloc[a]>=alloc[b]?a:b); alloc[ms] += pool - at; }
  }
  return { alloc, curve, cr, pm, bop: isCF?bop:null, wtr: isCF?wtr:null, ideal: isCF?ideal:null, pool };
}

// ═══ RENDER ═══
function render() {
  const main = document.getElementById('main-area');
  if (A.view === 'settings') { renderSettings(main); return; }
  if (A.view === 'detail' && A.selectedSKU && A.skus[A.selectedSKU]) { renderDetail(main, A.skus[A.selectedSKU]); return; }
  renderGrid(main);
}

function getFiltered() {
  let list = Object.values(A.skus);
  const f = A.filters;
  if (f.type !== 'All') list = list.filter(r => r.sizingType === f.type);
  if (f.division !== 'All') list = list.filter(r => r.division === f.division);
  if (f.category !== 'All') list = list.filter(r => r.category === f.category);
  if (f.subcategory !== 'All') list = list.filter(r => r.subcategory === f.subcategory);
  if (A.searchTerm) { const st = A.searchTerm.toLowerCase(); list = list.filter(r => r.sku.toLowerCase().includes(st) || r.styleDescription.toLowerCase().includes(st) || r.colorDescription.toLowerCase().includes(st)); }
  // Sort
  const sk = A.sortKey;
  list.sort((a, b) => {
    if (sk === 'dtcBuy') return b.dtcBuy - a.dtcBuy;
    if (sk === 'postBuy') { const aa = computeAlloc(a), bb = computeAlloc(b); const pa = a.totalOH + (aa?Object.values(aa.alloc).reduce((x,y)=>x+y,0):0); const pb = b.totalOH + (bb?Object.values(bb.alloc).reduce((x,y)=>x+y,0):0); return pb-pa; }
    if (sk === 'currentOH') return b.totalOH - a.totalOH;
    if (sk === 'projBOP') { const ba = a.sizingType==='cf'?Object.values(projBOP(a)).filter(x=>typeof x==='number').reduce((x,y)=>x+y,0):0; const bb2 = b.sizingType==='cf'?Object.values(projBOP(b)).filter(x=>typeof x==='number').reduce((x,y)=>x+y,0):0; return bb2-ba; }
    if (sk === 'storeCount') return b.storeCount - a.storeCount;
    if (sk === 'type') { const to = {cf:0,initials:1,nosize:2}; return (to[a.sizingType]||9)-(to[b.sizingType]||9); }
    if (sk === 'accepted') { const aa2 = A.accepted[a.sku]?0:1, bb3 = A.accepted[b.sku]?0:1; return aa2-bb3; }
    return 0;
  });
  return list;
}

function renderGrid(el) {
  const list = getFiltered();
  const all = Object.values(A.skus);
  // Build filter options from linelist
  const divs = [...new Set(all.map(r=>r.division).filter(Boolean))].sort();
  const cats = [...new Set(all.map(r=>r.category).filter(Boolean))].sort();
  const subs = [...new Set(all.map(r=>r.subcategory).filter(Boolean))].sort();

  function selOpts(arr, label, current) {
    let h = '<option value="All">' + label + ': All</option>';
    arr.forEach(v => { h += '<option value="'+esc(v)+'"'+(current===v?' selected':'')+'>'+esc(v)+'</option>'; });
    return h;
  }
  function sbtn(key, label) { return '<button class="sb'+(A.sortKey===key?' on':'')+'" onclick="setSort(\''+key+'\')">'+label+'</button>'; }

  let h = '<div class="gv"><div class="gc">' +
    '<div class="gc-row">' +
      '<span class="gc-lbl">Sort</span>' +
      sbtn('dtcBuy', A.activeSeason + ' Buy') +
      sbtn('postBuy', 'Post-Buy OH') +
      sbtn('currentOH', 'Current OH') +
      sbtn('projBOP', 'Proj. BOP') +
      sbtn('storeCount', 'Store Count') +
      sbtn('type', 'CF / Initials / No Buy') +
      sbtn('accepted', 'Accepted / Pending') +
      '<div style="flex:1"></div>' +
      '<input class="sbar" type="text" placeholder="Search SKU, style, color..." value="'+esc(A.searchTerm)+'" oninput="A.searchTerm=this.value;render()">' +
    '</div>' +
    '<div class="gc-row">' +
      '<span class="gc-lbl">Filter</span>' +
      '<select class="fsel" onchange="A.filters.type=this.value;render()"><option value="All">Type: All</option><option value="cf"'+(A.filters.type==='cf'?' selected':'')+'>CF</option><option value="initials"'+(A.filters.type==='initials'?' selected':'')+'>Initials</option><option value="nosize"'+(A.filters.type==='nosize'?' selected':'')+'>No Buy</option></select>' +
      '<select class="fsel'+(divs.length<=1?' dim':'')+'" onchange="A.filters.division=this.value;render()">' + selOpts(divs, 'Division', A.filters.division) + '</select>' +
      '<select class="fsel'+(cats.length<=1?' dim':'')+'" onchange="A.filters.category=this.value;render()">' + selOpts(cats, 'Category', A.filters.category) + '</select>' +
      '<select class="fsel'+(subs.length<=1?' dim':'')+'" onchange="A.filters.subcategory=this.value;render()">' + selOpts(subs, 'Subcategory', A.filters.subcategory) + '</select>' +
      '<span class="gc-lbl" style="margin-left:8px">' + list.length + ' SKUs</span>' +
    '</div>' +
  '</div>';

  h += '<div class="sg">';
  const show = list.slice(0, 500);
  show.forEach(r => {
    const acc = A.accepted[r.sku];
    const tc = r.sizingType==='cf'?'t-cf':r.sizingType==='initials'?'t-in':'t-ns';
    const bc = r.sizingType==='cf'?'bdg-cf':r.sizingType==='initials'?'bdg-in':'bdg-ns';
    const bl = r.sizingType==='cf'?'CF':r.sizingType==='initials'?'INITIALS':'NO BUY';
    h += '<div class="sc '+tc+(acc?' acc':'')+'" onclick="goDetail(\''+esc(r.sku)+'\')">' +
      (acc ? '<div class="chk">✓</div>' : '') +
      '<div class="sid">'+esc(r.sku)+'</div>' +
      '<div class="snm">'+esc(r.styleDescription)+(r.colorDescription?' · '+esc(r.colorDescription):'')+'</div>' +
      '<div class="sbu">'+fmt(r.dtcBuy)+' u</div>' +
      '<div class="ssb">OH: '+fmt(r.totalOH)+' · Stores: '+r.storeCount+'</div>' +
      '<div class="bdg '+bc+'">'+bl+'</div>' +
    '</div>';
  });
  if (list.length > 500) h += '<div class="gnote">Showing 500 of '+list.length+'</div>';
  if (!list.length) h += '<div class="gnote">No SKUs match filters</div>';
  h += '</div></div>';
  el.innerHTML = h;
}

function goDetail(sku) { A.selectedSKU = sku; A.view = 'detail'; render(); }
function goGrid() { A.selectedSKU = null; A.view = 'grid'; render(); }
function setSort(k) { A.sortKey = k; render(); }

function renderDetail(el, rec) {
  const res = computeAlloc(rec);
  if (!res && rec.sizingType !== 'nosize') { el.innerHTML = '<div class="gnote">Unable to compute</div>'; return; }
  if (rec.sizingType === 'nosize') {
    el.innerHTML = '<div class="dv anim"><button class="d-back" onclick="goGrid()">← Back to '+esc(A.activeSeason)+'</button>' +
      detailHeader(rec) + '<div class="stc" style="max-width:400px;margin-top:12px"><div class="sl">Total DTC Buy</div><div class="sv c-d" style="font-size:24px;font-weight:700">0</div><div class="ss">No buy — sizing not required</div></div></div>';
    return;
  }
  const { alloc, curve, cr, pm, bop, wtr, ideal, pool } = res;
  const isCF = rec.sizingType === 'cf';
  const locked = A.accepted[rec.sku]||false;

  // Chart
  const cvals = rec.sizes.map(s => Math.max(rec.sizeData[s].onHand, rec.sizeData[s].sales/4, alloc[s]||0));
  const mx = Math.max(1, ...cvals);
  let bars = '';
  rec.sizes.forEach(s => {
    const sd = rec.sizeData[s], a = alloc[s]||0;
    bars += '<div class="cc"><div class="ccb">' +
      '<div class="cbar" style="height:'+(sd.onHand/mx*100).toFixed(1)+'%;background:var(--blue);opacity:0.4" data-tip="OH: '+fmt(sd.onHand)+'"></div>' +
      '<div class="cbar" style="height:'+(sd.sales/4/mx*100).toFixed(1)+'%;background:var(--green);opacity:0.5" data-tip="Sales/qtr: '+fmt(Math.round(sd.sales/4))+'"></div>' +
      '<div class="cbar" style="height:'+(a/mx*100).toFixed(1)+'%;background:var(--orange);opacity:0.65" data-tip="Buy: '+fmt(a)+'"></div>' +
    '</div><div class="csl">'+esc(s)+'</div></div>';
  });

  // Stats
  let stats = '<div class="sr">';
  stats += stc('DTC Buy', fmt(pool), '', 'var(--navy)');
  stats += stc('Store Count', fmt(rec.storeCount), rec.storeTier, 'var(--navy)');
  if (isCF) {
    const tBOP = Object.values(bop).reduce((a,b)=>a+b,0);
    stats += stc('Current OH', fmt(rec.totalOH), '', 'var(--blue)');
    stats += stc('Proj. BOP', fmt(tBOP), wtr+'w to receipt', 'var(--teal)');
    stats += stc('L52W Sales', fmt(rec.totalSales), Math.round(rec.totalSales/52)+'/wk', 'var(--green)');
  } else {
    stats += stc('Size Scale', rec.sizeScale, rec.sizes.length+' sizes', 'var(--navy)');
  }
  stats += '</div>';

  // Rollup trail
  let trail = '<div class="rb"><span class="gc-lbl">Curve source: </span>';
  cr.trail.forEach(t => {
    if (t.pass) {
      trail += '<span class="rs rp">'+esc(t.level)+' ('+esc(t.label)+') ✓ ['+fmt(t.total)+' vs '+fmt(t.thresh)+' needed]</span>';
    } else {
      trail += '<span class="rs rf">'+esc(t.level)+' ('+esc(t.label)+') ✗ ['+fmt(t.total)+' vs '+fmt(t.thresh)+' needed]</span> → ';
    }
  });
  trail += '</div>';

  // Table with grouped headers & alternating column colors
  // Columns: Size | L52W Sales | Sales Curve | Wkly Rate | Current OH | Ideal Target | Size Break | Size Break % | Post-Buy Total
  // CF adds: Proj BOP after Current OH
  let tAlloc = 0, tPM = 0;
  let thead = '<tr class="gr"><th></th><th class="gs" colspan="3">Sales Metrics</th>';
  thead += isCF ? '<th class="gi" colspan="6">Inventory Metrics</th>' : '<th class="gi" colspan="5">Inventory Metrics</th>';
  thead += '</tr><tr><th style="text-align:left">Size</th>';
  thead += '<th class="cbl">L52W Sales</th><th class="cbd">Sales Curve</th><th class="cbl">Wkly Rate</th>';
  if (isCF) thead += '<th class="col">Current OH</th><th class="cod">Proj. BOP</th>';
  else thead += '<th class="col">Current OH</th>';
  thead += '<th class="'+(isCF?'col':'cod')+'">Ideal Target</th>';
  thead += '<th class="'+(isCF?'cod':'col')+'">Size Break</th>';
  thead += '<th class="'+(isCF?'col':'cod')+'">Size Break %</th>';
  thead += '<th class="'+(isCF?'cod':'col')+'">Post-Buy</th>';
  thead += '</tr>';

  let tbody = '';
  rec.sizes.forEach(s => {
    const sd = rec.sizeData[s], a = alloc[s]||0;
    tAlloc += a; tPM += pm[s];
    const wr = (sd.sales/52).toFixed(1);
    const cv = curve[s], aTotal = Object.values(alloc).reduce((x,y)=>x+y,0);
    const sbPct = aTotal > 0 ? a/aTotal : 0;
    const postBuy = (isCF ? (bop[s]||0) : 0) + a;
    const hasOv = A.overrides[rec.sku] && A.overrides[rec.sku][s] !== undefined;
    const inp = locked ? '<span class="c-o">'+fmt(a)+'</span>' :
      '<input class="ai'+(hasOv?' ov':'')+'" type="number" value="'+a+'" onchange="setOvr(\''+esc(rec.sku)+'\',\''+esc(s)+'\',this.value)">';

    tbody += '<tr><td>'+esc(s)+'</td>';
    tbody += '<td class="cbl">'+fmt(sd.sales)+'</td>';
    tbody += '<td class="cbd c-d">'+pct(cv)+'</td>';
    tbody += '<td class="cbl c-d">'+wr+'</td>';
    if (isCF) {
      tbody += '<td class="col">'+fmt(sd.onHand)+'</td>';
      tbody += '<td class="cod c-t">'+fmt(bop[s])+'</td>';
    } else {
      tbody += '<td class="col">'+fmt(sd.onHand)+'</td>';
    }
    tbody += '<td class="'+(isCF?'col':'cod')+'">'+fmt(isCF?ideal[s]:Math.round(cv*pool))+'</td>';
    tbody += '<td class="'+(isCF?'cod':'col')+'">'+inp+'</td>';
    tbody += '<td class="'+(isCF?'col':'cod')+' c-d">'+pct(sbPct)+'</td>';
    tbody += '<td class="'+(isCF?'cod':'col')+' c-g" style="font-weight:600">'+fmt(postBuy)+'</td>';
    tbody += '</tr>';
  });

  // Total row
  const totalPost = (isCF ? Object.values(bop).reduce((a,b)=>a+b,0) : 0) + tAlloc;
  tbody += '<tr class="rt"><td>TOTAL</td>';
  tbody += '<td class="cbl">'+fmt(rec.totalSales)+'</td><td class="cbd">100%</td><td class="cbl"></td>';
  if (isCF) { const tb = Object.values(bop).reduce((a,b)=>a+b,0); tbody += '<td class="col">'+fmt(rec.totalOH)+'</td><td class="cod c-t">'+fmt(tb)+'</td>'; }
  else tbody += '<td class="col">'+fmt(rec.totalOH)+'</td>';
  tbody += '<td class="'+(isCF?'col':'cod')+'">'+fmt(isCF?(Object.values(bop).reduce((a,b)=>a+b,0)+pool):pool)+'</td>';
  tbody += '<td class="'+(isCF?'cod':'col')+' c-o">'+fmt(tAlloc)+'</td>';
  tbody += '<td class="'+(isCF?'col':'cod')+'">100%</td>';
  tbody += '<td class="'+(isCF?'cod':'col')+' c-g" style="font-weight:700">'+fmt(totalPost)+'</td>';
  tbody += '</tr>';

  const variance = tAlloc - pool;
  const vNote = variance !== 0 ? '<span class="tbn c-r">Variance: '+(variance>0?'+':'')+variance+' vs '+fmt(pool)+'</span>' : '<span class="tbn c-g">Balanced — '+fmt(pool)+' units</span>';
  const lockBtn = locked ? '<button class="blk lkd" onclick="toggleAcc(\''+esc(rec.sku)+'\')">✓ Locked — click to unlock</button>'
    : '<button class="blk" onclick="toggleAcc(\''+esc(rec.sku)+'\')">Accept & Lock</button>';
  const hasOvrs = A.overrides[rec.sku] && Object.keys(A.overrides[rec.sku]).length > 0;
  const resetBtn = hasOvrs && !locked ? '<button class="btn btn-g" onclick="clrOvr(\''+esc(rec.sku)+'\')">Reset Overrides</button>' : '';

  el.innerHTML = '<div class="dv anim">' +
    '<button class="d-back" onclick="goGrid()">← Back to '+esc(A.activeSeason)+'</button>' +
    detailHeader(rec) +
    '<div class="ab"><div>'+lockBtn+'</div><div class="ab-r">'+resetBtn+'</div></div>' +
    stats + trail +
    '<div class="cb"><div class="slbl">Size Distribution</div><div class="ca">'+bars+'</div>' +
    '<div class="cl"><div class="cli"><div class="cld" style="background:var(--blue);opacity:0.4"></div>On Hand</div><div class="cli"><div class="cld" style="background:var(--green);opacity:0.5"></div>Sales/Qtr</div><div class="cli"><div class="cld" style="background:var(--orange);opacity:0.65"></div>Size Break</div></div></div>' +
    '<div class="tb"><div class="tbh"><div class="slbl" style="margin:0">Data Table</div>'+vNote+'</div>' +
    '<div class="tbs"><table class="dt"><thead>'+thead+'</thead><tbody>'+tbody+'</tbody></table></div></div>' +
  '</div>';
}

function detailHeader(rec) {
  const bc = rec.sizingType==='initials'?'bdg-in':rec.sizingType==='cf'?'bdg-cf':'bdg-ns';
  const bl = rec.sizingType==='nosize'?'NO BUY':rec.sizingType.toUpperCase();
  return '<div class="dh"><div class="dh-row"><h2>'+esc(rec.sku)+'</h2><span class="bdg '+bc+'">'+bl+'</span></div>' +
    '<div class="dm">'+esc(rec.styleDescription)+(rec.colorDescription?' · '+esc(rec.colorDescription):'')+'</div>' +
    '<div class="db">'+esc(rec.division)+'<span class="sp">→</span>'+esc(rec.category)+'<span class="sp">→</span>'+esc(rec.subcategory)+
    (rec.sizeScale?' · '+esc(rec.sizeScale):'')+(rec.storeTier?' · '+esc(rec.storeTier):'')+'</div></div>';
}

function stc(l, v, s, c) {
  return '<div class="stc"><div class="sl">'+l+'</div><div class="sv" style="color:'+c+'">'+v+'</div>'+(s?'<div class="ss">'+s+'</div>':'')+'</div>';
}

// ═══ SETTINGS ═══
function renderSettings(el) {
  let h = '<div class="sv anim">';
  // If coming from dashboard, show back
  if (A.activeSeason) h += '<button class="d-back" onclick="A.view=\'grid\';render()">← Back to '+esc(A.activeSeason)+'</button>';
  else h += '<button class="d-back" onclick="backToWelcome()">← Back</button>';
  h += '<h2 style="font-size:20px;font-weight:700;color:var(--navy);margin-bottom:6px">Presentation Minimums</h2>' +
    '<p style="font-size:12px;color:var(--text-secondary);margin-bottom:20px">Per-size units per store. Changes persist across sessions.</p>';

  const allScales = new Set(Object.keys(A.presMins));
  for (const s in A.scaleSizes) allScales.add(s);

  [...allScales].sort().forEach(scale => {
    const sizes = A.scaleSizes[scale] || [];
    if (!sizes.length) return;
    const cfg = A.presMins[scale] || {};
    h += '<div class="scd"><h3>'+esc(scale)+' <span style="font-weight:400;color:var(--text-dim)">('+sizes.length+' sizes)</span></h3>';
    h += '<table class="pt"><thead><tr>';
    sizes.forEach(s => { h += '<th>'+esc(s)+'</th>'; });
    h += '</tr></thead><tbody><tr>';
    sizes.forEach(s => {
      const v = cfg[s] !== undefined ? cfg[s] : '';
      h += '<td><input class="pi" type="number" step="0.5" min="0" value="'+v+'" onchange="setPM(\''+esc(scale)+'\',\''+esc(s)+'\',this.value)"></td>';
    });
    h += '</tr></tbody></table></div>';
  });

  const saved = !A.presMinsDirty;
  h += '<div class="svb'+(saved?' ok':'')+'" id="save-bar"><span class="st">'+(saved?'✓ All changes saved':'Unsaved changes — click Save')+'</span>';
  if (!saved) h += '<button class="btn btn-b" onclick="doSavePM()">Save Changes</button>';
  h += '</div></div>';
  el.innerHTML = h;
}

function setPM(scale, size, val) {
  if (!A.presMins[scale]) A.presMins[scale] = {};
  const v = parseFloat(val);
  if (isNaN(v) || v < 0) delete A.presMins[scale][size];
  else A.presMins[scale][size] = v;
  A.presMinsDirty = true;
  const bar = document.getElementById('save-bar');
  if (bar) { bar.className = 'svb'; bar.innerHTML = '<span class="st">Unsaved changes — click Save</span><button class="btn btn-b" onclick="doSavePM()">Save Changes</button>'; }
}

function doSavePM() {
  savePresMins();
  A.presMinsDirty = false;
  const bar = document.getElementById('save-bar');
  if (bar) { bar.className = 'svb ok'; bar.innerHTML = '<span class="st">✓ All changes saved</span>'; }
}

function goSettings() { A.view = 'settings'; if (A.activeSeason) { render(); } else { document.getElementById('welcome').classList.add('hidden'); document.getElementById('dash').classList.add('active'); document.getElementById('slbl').textContent = ''; render(); }}

// ═══ INTERACTIONS ═══
function setOvr(sku, sz, v) { if (!A.overrides[sku]) A.overrides[sku]={}; A.overrides[sku][sz]=parseInt(v)||0; render(); }
function clrOvr(sku) { delete A.overrides[sku]; render(); }
function toggleAcc(sku) { A.accepted[sku] ? delete A.accepted[sku] : A.accepted[sku]=true; updateExpCt(); render(); }
function updateExpCt() { const n = Object.keys(A.accepted).length; const el = document.getElementById('exp-ct'); if (el) el.textContent = n>0?n+' accepted':''; const btn = document.getElementById('exp-btn'); if (btn) btn.disabled = n===0; }

function exportCSV() {
  const acc = Object.keys(A.accepted); if (!acc.length) return;
  const lines = ['Season Code,Sizing Type,SKU,Size,Quantity'];
  acc.forEach(sku => {
    const r = A.skus[sku]; if (!r || r.dtcBuy<=0) return;
    const res = computeAlloc(r); if (!res) return;
    const tl = r.sizingType==='initials'?'INITIALS':r.sizingType==='cf'?'CF':'NO SIZE';
    r.sizes.forEach(s => { const q = res.alloc[s]||0; if (q>0) lines.push(A.activeSeason+','+tl+','+sku+','+s+','+q); });
  });
  const b = new Blob([lines.join('\n')], { type: 'text/csv' });
  const u = URL.createObjectURL(b);
  const a = document.createElement('a'); a.href = u; a.download = 'PO_Sizing_'+A.activeSeason+'.csv'; a.click();
  URL.revokeObjectURL(u);
}

function backToWelcome() {
  document.getElementById('dash').classList.remove('active');
  document.getElementById('welcome').classList.remove('hidden');
  A.activeSeason = null; A.view = 'grid';
}

// Init
loadPresMins();
