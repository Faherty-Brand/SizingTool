/* ══════════════════════════════════════════
   SCE — Size Curve Engine · Core Logic
   ══════════════════════════════════════════ */

// ─── CSV Parser ───
function parseCSV(text, headerRowIndex) {
  headerRowIndex = headerRowIndex || 0;
  const rawLines = [];
  let cur = '', inQ = false, row = [];
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      if (inQ && text[i+1] === '"') { cur += '"'; i++; }
      else inQ = !inQ;
    } else if (ch === ',' && !inQ) {
      row.push(cur.trim()); cur = '';
    } else if ((ch === '\n' || ch === '\r') && !inQ) {
      if (ch === '\r' && text[i+1] === '\n') i++;
      row.push(cur.trim());
      if (row.length > 1 || (row.length === 1 && row[0] !== '')) rawLines.push(row);
      cur = ''; row = [];
    } else { cur += ch; }
  }
  if (cur || row.length) { row.push(cur.trim()); rawLines.push(row); }
  const filtered = rawLines.filter(r => r.length > 1);
  if (filtered.length < headerRowIndex + 1) return [];
  const headers = filtered[headerRowIndex].map(h => h.replace(/^\uFEFF/, ''));
  const result = [];
  for (let i = headerRowIndex + 1; i < filtered.length; i++) {
    const obj = {};
    headers.forEach((h, idx) => { obj[h] = filtered[i][idx] || ''; });
    result.push(obj);
  }
  return result;
}

// ─── Dynamic column finder ───
function findCol(row, candidates) {
  if (!row) return null;
  const keys = Object.keys(row);
  for (const c of candidates) {
    const found = keys.find(k => k.toLowerCase() === c.toLowerCase());
    if (found) return found;
  }
  for (const c of candidates) {
    const cl = c.toLowerCase();
    const found = keys.find(k => k.toLowerCase().includes(cl));
    if (found) return found;
  }
  return null;
}

function numP(v) {
  if (!v) return 0;
  return parseInt(String(v).replace(/[^0-9\-]/g, ''), 10) || 0;
}

function esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

// ─── Size sort ───
const SIZE_ORD = { XXS:1, XS:2, S:3, M:4, L:5, XL:6, XXL:7, XXXL:8, '2XL':7, '3XL':8, '4XL':9, MT:5, LT:6, XLT:7, XXLT:8, OS:0 };

function sizeSort(a, b) {
  const oa = SIZE_ORD[a.toUpperCase()] ?? null, ob = SIZE_ORD[b.toUpperCase()] ?? null;
  if (oa !== null && ob !== null) return oa - ob;
  if (oa !== null) return -1;
  if (ob !== null) return 1;
  // Numeric waist sizes (28, 29, 30...) or waist x length (28WX30L)
  const pa = a.match(/^(\d+)/), pb = b.match(/^(\d+)/);
  if (pa && pb) {
    const wa = parseInt(pa[1]), wb = parseInt(pb[1]);
    if (wa !== wb) return wa - wb;
    // Same waist, sort by length
    const la = a.match(/(\d+)L$/), lb = b.match(/(\d+)L$/);
    if (la && lb) return parseInt(la[1]) - parseInt(lb[1]);
  }
  return a.localeCompare(b);
}

// ══════════════════════════════════════════
// APP STATE
// ══════════════════════════════════════════
const APP = {
  raw: { inventory: null, sales: null, linelist: null, wip: null },
  seasons: [],
  activeSeason: null,
  skus: {},           // processed SKU records for active season
  selectedSKU: null,
  activeTab: 'cf',    // initials | cf | core | nosize
  overrides: {},      // { sku: { size: qty } }
  accepted: {},       // { sku: true }
  searchTerm: '',

  // Pres min config: { scaleKey: { size: value } }
  presMins: {
    'M3':  { XS: 0.5, S: 1, M: 2, L: 2, XL: 1.5, XXL: 0.5 },
    'FM3': { XS: 0, S: 1, M: 2, L: 2, XL: 1.5, XXL: 0 },
    'M6':  {},
    'M10': {},
    'MS':  {},
    'MT':  {},
  },

  // Derived: size sets per scale (populated from sales data)
  scaleSizes: {},
  // Derived: size count per scale for significance threshold
  scaleSizeCount: {},

  // Column references (set during processing)
  cols: {},
};

// ══════════════════════════════════════════
// FILE UPLOAD
// ══════════════════════════════════════════
function handleUpload(key, input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(ev) {
    let hdrRow = 0;
    if (key === 'linelist' || key === 'wip') hdrRow = 2;
    else hdrRow = 1;
    APP.raw[key] = parseCSV(ev.target.result, hdrRow);
    updateUploadChip(key);
    tryShowSeasons();
  };
  reader.readAsText(file);
}

function updateUploadChip(key) {
  const chip = document.getElementById('chip-' + key);
  const count = document.getElementById('count-' + key);
  if (APP.raw[key]) {
    chip.classList.add('loaded');
    count.textContent = APP.raw[key].length.toLocaleString() + ' rows';
  }
}

function allUploaded() {
  return APP.raw.inventory && APP.raw.sales && APP.raw.linelist && APP.raw.wip;
}

// ══════════════════════════════════════════
// SEASON PICKER
// ══════════════════════════════════════════
function tryShowSeasons() {
  const container = document.getElementById('season-area');
  if (!allUploaded()) {
    container.innerHTML = '<div class="sp-waiting">Upload all 4 data sources to continue</div>';
    return;
  }

  // Extract seasons from linelist
  const ll = APP.raw.linelist;
  const seasonCol = findCol(ll[0], ['Season Code']);
  const skuCol = findCol(ll[0], ['SKU']);
  const seasonCounts = {};
  ll.forEach(r => {
    const s = r[seasonCol] || '';
    if (s) seasonCounts[s] = (seasonCounts[s] || 0) + 1;
  });

  APP.seasons = Object.keys(seasonCounts).sort();

  let html = '<div class="season-grid">';
  APP.seasons.forEach(s => {
    html += '<div class="season-btn" onclick="selectSeason(\'' + esc(s) + '\')">' +
      '<div class="sb-code">' + esc(s) + '</div>' +
      '<div class="sb-count">' + seasonCounts[s] + ' SKUs</div>' +
    '</div>';
  });
  html += '</div>';
  container.innerHTML = html;
}

function selectSeason(season) {
  APP.activeSeason = season;
  APP.selectedSKU = null;
  APP.overrides = {};
  APP.accepted = {};
  processSeasonData();
  document.getElementById('welcome-screen').classList.add('hidden');
  document.getElementById('dashboard-screen').classList.add('active');
  document.getElementById('season-label').textContent = season;
  determineDefaultTab();
  renderSidebar();
  renderMain();
}

// ══════════════════════════════════════════
// DATA PROCESSING
// ══════════════════════════════════════════
function processSeasonData() {
  const inv = APP.raw.inventory;
  const sales = APP.raw.sales;
  const ll = APP.raw.linelist;
  const wip = APP.raw.wip;

  // Column mapping
  const c = {};
  c.invSKU = findCol(inv[0], ['SKU']);
  c.invSize = findCol(inv[0], ['Size']);
  c.invOH = findCol(inv[0], ['On Hand Units - TY', 'On Hand Units', 'On Hand']);

  c.saleSKU = findCol(sales[0], ['SKU']);
  c.saleSize = findCol(sales[0], ['Size']);
  c.saleUnits = findCol(sales[0], ['Net Sales Units - TY', 'Net Sales Units']);
  c.saleDivision = findCol(sales[0], ['Merchandise Division', 'Division', 'Department']);
  c.saleCategory = findCol(sales[0], ['Category']);
  c.saleSubCat = findCol(sales[0], ['Sub-Category', 'SubCategory', 'Subcategory']);
  c.saleStyleDesc = findCol(sales[0], ['Style Description']);
  c.saleColor = findCol(sales[0], ['Color Description']);

  c.llSKU = findCol(ll[0], ['SKU']);
  c.llSeason = findCol(ll[0], ['Season Code']);
  c.llDept = findCol(ll[0], ['Department']);
  c.llCat = findCol(ll[0], ['Category']);
  c.llSubCat = findCol(ll[0], ['Subcategory', 'Sub-Category']);
  c.llStyle = findCol(ll[0], ['Style']);
  c.llStyleDesc = findCol(ll[0], ['Style Description']);
  c.llColorCode = findCol(ll[0], ['Color Code']);
  c.llColorDesc = findCol(ll[0], ['Color Description']);
  c.llSizeScale = findCol(ll[0], ['Size Scale']);
  c.llDTCBuy = findCol(ll[0], ['Total DTC Buy']);
  c.llStoreCount = findCol(ll[0], ['Store Count']);
  c.llStoreTier = findCol(ll[0], ['Store Tier']);
  c.llLifecycle = findCol(ll[0], ['Seasonal Life Cycle']);
  c.llCommit = findCol(ll[0], ['Commit Coding']);
  c.llRollout = findCol(ll[0], ['Roll Out Code - Retail', 'Roll Out Code']);
  c.llPST = findCol(ll[0], ['PST PLANNING ATTRIBUTE 1']);

  c.wipSKU = findCol(wip[0], ['SKU']);
  c.wipSize = findCol(wip[0], ['Size']);
  c.wipOrdered = findCol(wip[0], ['Ordered']);
  c.wipStatus = findCol(wip[0], ['Shipment Status']);
  c.wipPOStatus = findCol(wip[0], ['PO Status']);
  c.wipExpDC = findCol(wip[0], ['New Expected in DC', 'Expected in DC']);
  c.wipDept = findCol(wip[0], ['Department']);
  c.wipCat = findCol(wip[0], ['Category']);
  c.wipSubCat = findCol(wip[0], ['Sub Category', 'SubCategory']);
  c.wipStyleDesc = findCol(wip[0], ['STYLE Description', 'Style Description']);
  APP.cols = c;

  // ── Build inventory index: SKU → { size → oh } ──
  const invIdx = {};
  inv.forEach(r => {
    const sku = r[c.invSKU], size = r[c.invSize], oh = numP(r[c.invOH]);
    if (!invIdx[sku]) invIdx[sku] = {};
    invIdx[sku][size] = (invIdx[sku][size] || 0) + oh;
  });

  // ── Build sales index: SKU → { size → units } ──
  // Also build hierarchy sales index for curve rollup
  const salesIdx = {};
  const hierSales = {}; // key: div|cat|subcat|program → { size → units }
  sales.forEach(r => {
    const sku = r[c.saleSKU], size = r[c.saleSize], units = numP(r[c.saleUnits]);
    if (!salesIdx[sku]) salesIdx[sku] = {};
    salesIdx[sku][size] = (salesIdx[sku][size] || 0) + units;

    const div = r[c.saleDivision] || '';
    const cat = r[c.saleCategory] || '';
    const sub = r[c.saleSubCat] || '';
    const prog = r[c.saleStyleDesc] || '';

    // Build aggregates at each hierarchy level
    const keys = [
      'prog|' + div + '|' + cat + '|' + sub + '|' + prog,
      'sub|' + div + '|' + cat + '|' + sub,
      'cat|' + div + '|' + cat,
      'div|' + div,
    ];
    keys.forEach(k => {
      if (!hierSales[k]) hierSales[k] = {};
      hierSales[k][size] = (hierSales[k][size] || 0) + units;
    });
  });

  // ── Determine size sets per scale from sales data ──
  // Map SKU → scale from linelist
  const skuScaleMap = {};
  ll.forEach(r => { skuScaleMap[r[c.llSKU]] = r[c.llSizeScale] || ''; });

  APP.scaleSizes = {};
  sales.forEach(r => {
    const scale = skuScaleMap[r[c.saleSKU]];
    if (scale && r[c.saleSize]) {
      if (!APP.scaleSizes[scale]) APP.scaleSizes[scale] = new Set();
      APP.scaleSizes[scale].add(r[c.saleSize]);
    }
  });
  // Also add sizes from inventory
  inv.forEach(r => {
    const scale = skuScaleMap[r[c.invSKU]];
    if (scale && r[c.invSize]) {
      if (!APP.scaleSizes[scale]) APP.scaleSizes[scale] = new Set();
      APP.scaleSizes[scale].add(r[c.invSize]);
    }
  });

  // Convert sets to sorted arrays and compute counts
  for (const scale in APP.scaleSizes) {
    APP.scaleSizes[scale] = [...APP.scaleSizes[scale]].sort(sizeSort);
    APP.scaleSizeCount[scale] = APP.scaleSizes[scale].length;
  }

  // ── Build WIP index: SKU → { size → { ordered, expectedDC } } ──
  const wipIdx = {};
  wip.forEach(r => {
    if (r[c.wipPOStatus] === 'Dropped') return;
    if (r[c.wipStatus] === 'Received') return;
    const sku = r[c.wipSKU], size = r[c.wipSize];
    const ordered = numP(r[c.wipOrdered]);
    const expDC = r[c.wipExpDC] || '';
    if (!wipIdx[sku]) wipIdx[sku] = {};
    if (!wipIdx[sku][size]) wipIdx[sku][size] = { ordered: 0, expectedDC: '' };
    wipIdx[sku][size].ordered += ordered;
    if (expDC && !wipIdx[sku][size].expectedDC) wipIdx[sku][size].expectedDC = expDC;
  });

  // ── Build SKU records from Linelist for active season ──
  APP.skus = {};
  const seasonRows = ll.filter(r => r[c.llSeason] === APP.activeSeason);

  seasonRows.forEach(r => {
    const sku = r[c.llSKU];
    const scale = r[c.llSizeScale] || '';
    const eligibleSizes = APP.scaleSizes[scale] ? [...APP.scaleSizes[scale]] : [];
    const storeCount = numP(r[c.llStoreCount]);
    const dtcBuy = numP(r[c.llDTCBuy]);

    // Gather OH and sales for this SKU, filtered to eligible sizes
    const skuInv = invIdx[sku] || {};
    const skuSales = salesIdx[sku] || {};
    const skuWip = wipIdx[sku] || {};

    let totalOH = 0, totalSales = 0, totalWIP = 0;
    const sizeData = {};

    eligibleSizes.forEach(s => {
      const oh = skuInv[s] || 0;
      const sl = skuSales[s] || 0;
      const wipInfo = skuWip[s] || { ordered: 0, expectedDC: '' };
      sizeData[s] = {
        onHand: oh,
        sales: sl,
        wipOrdered: wipInfo.ordered,
        wipExpectedDC: wipInfo.expectedDC,
      };
      totalOH += oh;
      totalSales += sl;
      totalWIP += wipInfo.ordered;
    });

    // Determine sizing type dynamically
    let sizingType;
    if (dtcBuy === 0) {
      sizingType = 'nosize';
    } else if (totalOH === 0 && totalSales === 0) {
      sizingType = 'initials';
    } else {
      sizingType = 'cf';
    }

    // Build hierarchy keys for curve lookup
    const div = r[c.llDept] || '';
    const cat = r[c.llCat] || '';
    const sub = r[c.llSubCat] || '';
    const prog = r[c.llStyleDesc] || '';

    APP.skus[sku] = {
      sku,
      season: APP.activeSeason,
      division: div,
      category: cat,
      subcategory: sub,
      style: r[c.llStyle] || '',
      styleDescription: prog,
      colorCode: r[c.llColorCode] || '',
      colorDescription: r[c.llColorDesc] || '',
      sizeScale: scale,
      sizeCount: APP.scaleSizeCount[scale] || eligibleSizes.length,
      dtcBuy: dtcBuy,
      storeCount: storeCount,
      storeTier: r[c.llStoreTier] || '',
      lifecycle: r[c.llLifecycle] || '',
      commitCoding: r[c.llCommit] || '',
      rollout: r[c.llRollout] || '',
      pstAttribute: r[c.llPST] || '',
      sizingType,
      sizes: eligibleSizes,
      sizeData,
      totalOH,
      totalSales,
      totalWIP,
      // Hierarchy keys for curve lookup
      _hierKeys: {
        prog: 'prog|' + div + '|' + cat + '|' + sub + '|' + prog,
        sub: 'sub|' + div + '|' + cat + '|' + sub,
        cat: 'cat|' + div + '|' + cat,
        div: 'div|' + div,
      },
    };
  });

  // Store hierarchy sales for curve building
  APP.hierSales = hierSales;
}

// ══════════════════════════════════════════
// SIZE CURVE BUILDER
// ══════════════════════════════════════════
function buildSizeCurve(rec) {
  // Returns { curve: { size: pct }, level: 'program'|'subcategory'|..., totalUnits: N }
  const eligibleSizes = new Set(rec.sizes);
  const threshold = 100 * rec.sizeCount;

  const levels = [
    { key: rec._hierKeys.prog, label: 'Program (' + rec.styleDescription + ')' },
    { key: rec._hierKeys.sub,  label: 'Subcategory (' + rec.subcategory + ')' },
    { key: rec._hierKeys.cat,  label: 'Category (' + rec.category + ')' },
    { key: rec._hierKeys.div,  label: 'Division (' + rec.division + ')' },
  ];

  for (const level of levels) {
    const salesBySize = APP.hierSales[level.key];
    if (!salesBySize) continue;

    // Filter to eligible sizes only
    let total = 0;
    const filtered = {};
    for (const s in salesBySize) {
      if (eligibleSizes.has(s)) {
        filtered[s] = salesBySize[s];
        total += salesBySize[s];
      }
    }

    if (total >= threshold) {
      const curve = {};
      rec.sizes.forEach(s => {
        curve[s] = total > 0 ? (filtered[s] || 0) / total : 1 / rec.sizes.length;
      });
      return { curve, level: level.label, totalUnits: total };
    }
  }

  // Fallback: even distribution
  const curve = {};
  rec.sizes.forEach(s => { curve[s] = 1 / rec.sizes.length; });
  return { curve, level: 'Even distribution (insufficient data)', totalUnits: 0 };
}

// ══════════════════════════════════════════
// PRES MIN CALCULATION
// ══════════════════════════════════════════
function getPresMinFloor(rec) {
  // Returns { size: minUnits }
  const scaleConfig = APP.presMins[rec.sizeScale] || {};
  const floor = {};
  rec.sizes.forEach(s => {
    const pmVal = scaleConfig[s] !== undefined ? scaleConfig[s] : 0;
    floor[s] = Math.ceil(pmVal * rec.storeCount);
  });
  return floor;
}

// ══════════════════════════════════════════
// CF: BOP PROJECTION
// ══════════════════════════════════════════
function getWeeksToReceipt(rec) {
  // Find earliest unreceived WIP expected DC date for this SKU
  let earliest = null;
  rec.sizes.forEach(s => {
    const dc = rec.sizeData[s].wipExpectedDC;
    if (dc) {
      const d = new Date(dc);
      if (!isNaN(d) && (!earliest || d < earliest)) earliest = d;
    }
  });
  if (!earliest) return 12; // default assumption: 12 weeks out
  const now = new Date();
  const diffMs = earliest - now;
  const weeks = Math.max(0, Math.ceil(diffMs / (7 * 24 * 60 * 60 * 1000)));
  return weeks;
}

function projectBOP(rec) {
  // Returns { size: projectedBOP }
  const weeksToReceipt = getWeeksToReceipt(rec);
  const bop = {};
  rec.sizes.forEach(s => {
    const oh = rec.sizeData[s].onHand;
    const weeklyRate = rec.sizeData[s].sales / 52;
    const projected = Math.max(0, Math.round(oh - weeklyRate * weeksToReceipt));
    bop[s] = projected;
  });
  bop._weeks = weeksToReceipt;
  return bop;
}

// ══════════════════════════════════════════
// ALLOCATION ENGINE
// ══════════════════════════════════════════
function computeAllocation(rec) {
  if (!rec || rec.dtcBuy <= 0 || rec.sizes.length === 0) return null;

  const curveResult = buildSizeCurve(rec);
  const curve = curveResult.curve;
  const presMinFloor = getPresMinFloor(rec);
  const totalPool = rec.dtcBuy;
  const skuOvr = APP.overrides[rec.sku] || {};
  const isCF = rec.sizingType === 'cf';

  let bop = {};
  let weeksToReceipt = 0;
  if (isCF) {
    const bopResult = projectBOP(rec);
    weeksToReceipt = bopResult._weeks;
    delete bopResult._weeks;
    bop = bopResult;
  }

  // Calculate total projected inventory for CF
  const totalBOP = isCF ? Object.values(bop).reduce((a, b) => a + b, 0) : 0;
  const totalTarget = totalBOP + totalPool;

  // Step 1: Calculate ideal target per size
  const idealTarget = {};
  rec.sizes.forEach(s => {
    idealTarget[s] = Math.round(curve[s] * totalTarget);
  });

  // Step 2: Calculate raw buy need
  const rawNeed = {};
  rec.sizes.forEach(s => {
    if (isCF) {
      rawNeed[s] = Math.max(0, idealTarget[s] - bop[s]);
    } else {
      rawNeed[s] = Math.round(curve[s] * totalPool);
    }
  });

  // Step 3: Apply pres min floor
  const withFloor = {};
  rec.sizes.forEach(s => {
    withFloor[s] = Math.max(rawNeed[s], presMinFloor[s]);
  });

  // Step 4: Normalize to match total pool
  const alloc = {};
  const floorTotal = Object.values(withFloor).reduce((a, b) => a + b, 0);

  if (floorTotal <= totalPool) {
    // We have room after floors — distribute remainder by curve
    const remainder = totalPool - Object.values(presMinFloor).reduce((a, b) => a + b, 0);
    const aboveFloor = {};
    rec.sizes.forEach(s => { aboveFloor[s] = Math.max(0, rawNeed[s] - presMinFloor[s]); });
    const aboveTotal = Object.values(aboveFloor).reduce((a, b) => a + b, 0);

    rec.sizes.forEach(s => {
      const floor = presMinFloor[s];
      if (aboveTotal > 0 && remainder > 0) {
        alloc[s] = floor + Math.round((aboveFloor[s] / aboveTotal) * remainder);
      } else {
        alloc[s] = floor;
      }
    });
  } else {
    // Floor total exceeds pool — just use floors, proportionally scaled down
    rec.sizes.forEach(s => {
      alloc[s] = Math.round((withFloor[s] / floorTotal) * totalPool);
    });
  }

  // Apply manual overrides
  let hasOverride = false;
  rec.sizes.forEach(s => {
    if (skuOvr[s] !== undefined) {
      alloc[s] = skuOvr[s];
      hasOverride = true;
    }
  });

  // Reconcile rounding to match total (only for non-overridden sizes)
  if (!hasOverride) {
    const allocTotal = Object.values(alloc).reduce((a, b) => a + b, 0);
    if (allocTotal !== totalPool && rec.sizes.length > 0) {
      const diff = totalPool - allocTotal;
      // Add/subtract from the size with highest allocation
      const maxS = rec.sizes.reduce((a, b) => alloc[a] >= alloc[b] ? a : b);
      alloc[maxS] += diff;
    }
  }

  return {
    allocation: alloc,
    curve: curve,
    curveLevel: curveResult.level,
    curveTotalUnits: curveResult.totalUnits,
    presMinFloor,
    bop: isCF ? bop : null,
    weeksToReceipt: isCF ? weeksToReceipt : null,
    idealTarget: isCF ? idealTarget : null,
    totalPool,
  };
}

// ══════════════════════════════════════════
// RENDERING
// ══════════════════════════════════════════
function determineDefaultTab() {
  const counts = getTabCounts();
  if (counts.cf > 0) APP.activeTab = 'cf';
  else if (counts.initials > 0) APP.activeTab = 'initials';
  else if (counts.core > 0) APP.activeTab = 'core';
  else APP.activeTab = 'nosize';
}

function getTabCounts() {
  const all = Object.values(APP.skus);
  return {
    initials: all.filter(r => r.sizingType === 'initials').length,
    cf: all.filter(r => r.sizingType === 'cf').length,
    core: 0, // future
    nosize: all.filter(r => r.sizingType === 'nosize').length,
  };
}

function renderSidebar() {
  const counts = getTabCounts();

  // Tabs
  const tabs = document.getElementById('sidebar-tabs');
  tabs.innerHTML =
    navTab('initials', 'Initials', counts.initials) +
    navTab('cf', 'CF', counts.cf) +
    navTab('core', 'Core', counts.core) +
    navTab('nosize', 'No Size', counts.nosize);

  renderSKUList();
  updateExportCount();
}

function navTab(id, label, count) {
  const active = APP.activeTab === id ? ' active' : '';
  return '<button class="nav-tab' + active + '" onclick="switchTab(\'' + id + '\')">' +
    label + '<span class="tab-count">' + count + '</span></button>';
}

function switchTab(tab) {
  APP.activeTab = tab;
  APP.selectedSKU = null;
  renderSidebar();
  renderMain();
}

function renderSKUList() {
  const list = document.getElementById('sku-list');
  const filtered = getFilteredSKUs();
  const show = filtered.slice(0, 300);

  let html = '';
  show.forEach(rec => {
    const isActive = APP.selectedSKU === rec.sku ? ' active' : '';
    const isLocked = APP.accepted[rec.sku] ? true : false;
    html += '<div class="sku-item' + isActive + '" onclick="selectSKU(\'' + esc(rec.sku) + '\')">' +
      '<div class="sku-item-row">' +
        '<div>' +
          '<div class="sku-id">' + esc(rec.sku) + '</div>' +
          '<div class="sku-name">' + esc(rec.styleDescription) + (rec.colorDescription ? ' · ' + esc(rec.colorDescription) : '') + '</div>' +
        '</div>' +
        (isLocked ? '<span class="badge badge-locked"><span class="lock-icon">✓</span>Locked</span>' : '') +
      '</div>' +
      '<div class="sku-stats">' +
        '<span>Buy: ' + rec.dtcBuy.toLocaleString() + '</span>' +
        '<span>OH: ' + rec.totalOH.toLocaleString() + '</span>' +
        '<span>Sales: ' + rec.totalSales.toLocaleString() + '</span>' +
      '</div>' +
    '</div>';
  });

  if (filtered.length > 300) {
    html += '<div class="sku-list-note">' + filtered.length + ' SKUs — showing 300</div>';
  }
  if (filtered.length === 0) {
    html += '<div class="sku-list-note">No SKUs in this category</div>';
  }

  list.innerHTML = html;
}

function getFilteredSKUs() {
  let records = Object.values(APP.skus).filter(r => r.sizingType === APP.activeTab);
  if (APP.searchTerm) {
    const st = APP.searchTerm.toLowerCase();
    records = records.filter(r =>
      r.sku.toLowerCase().includes(st) ||
      r.styleDescription.toLowerCase().includes(st) ||
      r.colorDescription.toLowerCase().includes(st)
    );
  }
  return records;
}

function selectSKU(sku) {
  APP.selectedSKU = sku;
  renderSKUList();
  renderMain();
}

function renderMain() {
  const panel = document.getElementById('main-panel');

  if (APP.activeTab === 'nosize' && !APP.selectedSKU) {
    panel.innerHTML = '<div class="empty-state"><div class="empty-icon">—</div>' +
      '<div>SKUs with 0 DTC Buy — no sizing needed</div>' +
      '<div style="font-size:11px">Select one to view details</div></div>';
    return;
  }

  if (!APP.selectedSKU || !APP.skus[APP.selectedSKU]) {
    panel.innerHTML = '<div class="empty-state"><div class="empty-icon">◉</div>' +
      '<div>Select a SKU from the sidebar</div></div>';
    return;
  }

  const rec = APP.skus[APP.selectedSKU];

  if (rec.sizingType === 'nosize') {
    renderNoSizeDetail(panel, rec);
    return;
  }

  const result = computeAllocation(rec);
  if (!result) {
    panel.innerHTML = '<div class="empty-state">Unable to compute allocation</div>';
    return;
  }

  renderSKUDetail(panel, rec, result);
}

function renderNoSizeDetail(panel, rec) {
  panel.innerHTML = '<div class="anim-fade">' +
    renderDetailHeader(rec) +
    '<div class="stat-card" style="max-width:400px;margin-top:16px">' +
      '<div class="stat-label">Total DTC Buy</div>' +
      '<div class="stat-value c-dim">0</div>' +
      '<div class="stat-sub">This SKU has no buy units — sizing not required</div>' +
    '</div></div>';
}

function renderDetailHeader(rec) {
  const badgeCls = rec.sizingType === 'initials' ? 'badge-initial' :
                   rec.sizingType === 'cf' ? 'badge-cf' :
                   rec.sizingType === 'core' ? 'badge-core' : 'badge-nosizing';
  const badgeLabel = rec.sizingType === 'nosize' ? 'No Size' : rec.sizingType.toUpperCase();

  return '<div class="detail-header">' +
    '<div class="detail-header-row">' +
      '<h2>' + esc(rec.sku) + '</h2>' +
      '<span class="badge ' + badgeCls + '">' + badgeLabel + '</span>' +
    '</div>' +
    '<div class="detail-meta">' + esc(rec.styleDescription) +
      (rec.colorDescription ? ' · ' + esc(rec.colorDescription) : '') + '</div>' +
    '<div class="detail-breadcrumb">' +
      esc(rec.division) + '<span class="sep">→</span>' +
      esc(rec.category) + '<span class="sep">→</span>' +
      esc(rec.subcategory) +
      (rec.sizeScale ? ' · ' + esc(rec.sizeScale) : '') +
      (rec.storeTier ? ' · ' + esc(rec.storeTier) : '') +
    '</div>' +
  '</div>';
}

function renderSKUDetail(panel, rec, result) {
  const { allocation, curve, curveLevel, curveTotalUnits, presMinFloor, bop, weeksToReceipt, idealTarget, totalPool } = result;
  const isCF = rec.sizingType === 'cf';
  const isLocked = APP.accepted[rec.sku] || false;

  // Max value for chart
  const chartVals = rec.sizes.map(s => {
    const vals = [rec.sizeData[s].onHand, rec.sizeData[s].sales / 4, allocation[s]];
    if (isCF && bop) vals.push(bop[s]);
    return Math.max(...vals);
  });
  const maxVal = Math.max(1, ...chartVals);

  // ── Chart bars ──
  let barsHTML = '';
  rec.sizes.forEach(s => {
    const sd = rec.sizeData[s];
    const a = allocation[s] || 0;
    const ohPct = (sd.onHand / maxVal * 100).toFixed(1);
    const slPct = ((sd.sales / 4) / maxVal * 100).toFixed(1); // quarterly scale for visibility
    const alPct = (a / maxVal * 100).toFixed(1);

    barsHTML += '<div class="chart-col">' +
      '<div class="chart-col-bars">' +
        '<div class="chart-bar" style="height:' + ohPct + '%;background:var(--accent);opacity:0.45" data-tip="OH: ' + sd.onHand.toLocaleString() + '"></div>' +
        '<div class="chart-bar" style="height:' + slPct + '%;background:var(--green);opacity:0.55" data-tip="Sales/qtr: ' + Math.round(sd.sales/4).toLocaleString() + '"></div>' +
        '<div class="chart-bar" style="height:' + alPct + '%;background:var(--amber);opacity:0.7" data-tip="Buy: ' + a.toLocaleString() + '"></div>' +
      '</div>' +
      '<div class="chart-size-label">' + esc(s) + '</div>' +
    '</div>';
  });

  // ── Stats ──
  let statsHTML = '<div class="stats-row">';
  statsHTML += statCard('DTC Buy', totalPool.toLocaleString(), '', 'var(--text)');
  statsHTML += statCard('Store Count', rec.storeCount.toLocaleString(), rec.storeTier, 'var(--text)');

  if (isCF) {
    const totalBOP = Object.values(bop).reduce((a, b) => a + b, 0);
    statsHTML += statCard('Current OH', rec.totalOH.toLocaleString(), '', 'var(--accent)');
    statsHTML += statCard('Proj. BOP', totalBOP.toLocaleString(), weeksToReceipt + 'w to receipt', 'var(--cyan)');
    statsHTML += statCard('L52W Sales', rec.totalSales.toLocaleString(), Math.round(rec.totalSales/52) + '/wk avg', 'var(--green)');
  } else {
    statsHTML += statCard('Size Scale', rec.sizeScale, rec.sizes.length + ' sizes', 'var(--text)');
  }
  statsHTML += '</div>';

  // ── Rollup info ──
  const rollupHTML = '<div class="rollup-info">' +
    '<span>Curve source:</span> <span class="ri-level">' + esc(curveLevel) + '</span>' +
    '<span class="ri-units">' + curveTotalUnits.toLocaleString() + ' units</span>' +
  '</div>';

  // ── Table ──
  let thRow, tdRows = '';
  if (isCF) {
    thRow = '<th style="text-align:left">Size</th><th>Current OH</th><th>Wkly Rate</th><th>Proj. BOP</th>' +
      '<th>Curve %</th><th>Ideal Target</th><th>Pres Min</th><th>Buy Alloc</th><th>Post-Buy Total</th>';
  } else {
    thRow = '<th style="text-align:left">Size</th><th>Curve %</th><th>Curve</th><th>Pres Min</th><th>Buy Alloc</th>';
  }

  let totalAlloc = 0, totalPresMin = 0;
  rec.sizes.forEach(s => {
    const a = allocation[s] || 0;
    totalAlloc += a;
    totalPresMin += presMinFloor[s];
    const hasOvr = APP.overrides[rec.sku] && APP.overrides[rec.sku][s] !== undefined;
    const inputCls = hasOvr ? 'alloc-input has-override' : 'alloc-input';
    const inputHTML = isLocked
      ? '<span class="c-amber">' + a.toLocaleString() + '</span>'
      : '<input class="' + inputCls + '" type="number" value="' + a + '" onchange="setOverride(\'' + esc(rec.sku) + '\',\'' + esc(s) + '\',this.value)">';

    if (isCF) {
      const wkRate = (rec.sizeData[s].sales / 52).toFixed(1);
      const projBOP = bop[s];
      const idealT = idealTarget[s];
      const postBuy = projBOP + a;
      tdRows += '<tr>' +
        '<td>' + esc(s) + '</td>' +
        '<td>' + rec.sizeData[s].onHand.toLocaleString() + '</td>' +
        '<td class="c-dim">' + wkRate + '</td>' +
        '<td class="c-cyan">' + projBOP.toLocaleString() + '</td>' +
        '<td class="c-dim">' + (curve[s] * 100).toFixed(1) + '%</td>' +
        '<td>' + idealT.toLocaleString() + '</td>' +
        '<td class="c-dim">' + presMinFloor[s].toLocaleString() + '</td>' +
        '<td>' + inputHTML + '</td>' +
        '<td class="c-green" style="font-weight:600">' + postBuy.toLocaleString() + '</td>' +
      '</tr>';
    } else {
      const curvePct = (curve[s] * 100).toFixed(1);
      tdRows += '<tr>' +
        '<td>' + esc(s) + '</td>' +
        '<td class="c-dim">' + curvePct + '%</td>' +
        '<td><div class="curve-bar-wrap"><div class="curve-bar-fill" style="width:' + (curve[s] * 100) + '%"></div></div></td>' +
        '<td class="c-dim">' + presMinFloor[s].toLocaleString() + '</td>' +
        '<td>' + inputHTML + '</td>' +
      '</tr>';
    }
  });

  // Total row
  if (isCF) {
    const totalBOP = Object.values(bop).reduce((a, b) => a + b, 0);
    tdRows += '<tr class="row-total">' +
      '<td>TOTAL</td>' +
      '<td>' + rec.totalOH.toLocaleString() + '</td>' +
      '<td></td>' +
      '<td class="c-cyan">' + totalBOP.toLocaleString() + '</td>' +
      '<td>100%</td>' +
      '<td>' + (totalBOP + totalPool).toLocaleString() + '</td>' +
      '<td class="c-dim">' + totalPresMin.toLocaleString() + '</td>' +
      '<td class="c-amber">' + totalAlloc.toLocaleString() + '</td>' +
      '<td class="c-green" style="font-weight:600">' + (totalBOP + totalAlloc).toLocaleString() + '</td>' +
    '</tr>';
  } else {
    tdRows += '<tr class="row-total">' +
      '<td>TOTAL</td>' +
      '<td>100%</td><td></td>' +
      '<td class="c-dim">' + totalPresMin.toLocaleString() + '</td>' +
      '<td class="c-amber">' + totalAlloc.toLocaleString() + '</td>' +
    '</tr>';
  }

  // Variance check
  const variance = totalAlloc - totalPool;
  const varianceHTML = variance !== 0
    ? '<span class="table-note c-red">Variance: ' + (variance > 0 ? '+' : '') + variance + ' vs pool of ' + totalPool.toLocaleString() + '</span>'
    : '<span class="table-note c-green">Balanced — ' + totalPool.toLocaleString() + ' units</span>';

  // Lock button
  const lockBtnHTML = isLocked
    ? '<button class="btn-lock locked" onclick="toggleAccept(\'' + esc(rec.sku) + '\')">✓ Locked — click to unlock</button>'
    : '<button class="btn-lock" onclick="toggleAccept(\'' + esc(rec.sku) + '\')">Accept & Lock</button>';

  const hasOverrides = APP.overrides[rec.sku] && Object.keys(APP.overrides[rec.sku]).length > 0;
  const resetHTML = hasOverrides && !isLocked
    ? '<button class="btn-sm btn-ghost" onclick="clearOverrides(\'' + esc(rec.sku) + '\')">Reset Overrides</button>'
    : '';

  panel.innerHTML = '<div class="anim-fade">' +
    renderDetailHeader(rec) +

    '<div class="action-bar">' +
      '<div>' + lockBtnHTML + '</div>' +
      '<div class="action-bar-right">' + resetHTML + '</div>' +
    '</div>' +

    statsHTML +
    rollupHTML +

    '<div class="chart-box">' +
      '<div class="section-label">Size Distribution</div>' +
      '<div class="chart-area">' + barsHTML + '</div>' +
      '<div class="chart-legend">' +
        '<div class="legend-item"><div class="legend-dot" style="background:var(--accent);opacity:0.45"></div>On Hand</div>' +
        '<div class="legend-item"><div class="legend-dot" style="background:var(--green);opacity:0.55"></div>Sales/Qtr</div>' +
        '<div class="legend-item"><div class="legend-dot" style="background:var(--amber);opacity:0.7"></div>Buy Alloc</div>' +
      '</div>' +
    '</div>' +

    '<div class="table-box">' +
      '<div class="table-header">' +
        '<div class="section-label" style="margin-bottom:0">Allocation Detail</div>' +
        varianceHTML +
      '</div>' +
      '<div style="overflow-x:auto">' +
        '<table class="data-table"><thead><tr>' + thRow + '</tr></thead>' +
        '<tbody>' + tdRows + '</tbody></table>' +
      '</div>' +
    '</div>' +
  '</div>';
}

function statCard(label, value, sub, color) {
  return '<div class="stat-card">' +
    '<div class="stat-label">' + label + '</div>' +
    '<div class="stat-value" style="color:' + color + '">' + value + '</div>' +
    (sub ? '<div class="stat-sub">' + sub + '</div>' : '') +
  '</div>';
}

// ══════════════════════════════════════════
// INTERACTIONS
// ══════════════════════════════════════════
function setOverride(sku, size, val) {
  const v = parseInt(val) || 0;
  if (!APP.overrides[sku]) APP.overrides[sku] = {};
  APP.overrides[sku][size] = v;
  renderMain();
}

function clearOverrides(sku) {
  delete APP.overrides[sku];
  renderMain();
}

function toggleAccept(sku) {
  if (APP.accepted[sku]) {
    delete APP.accepted[sku];
  } else {
    APP.accepted[sku] = true;
  }
  renderSKUList();
  renderMain();
  updateExportCount();
}

function updateExportCount() {
  const ct = Object.keys(APP.accepted).length;
  const el = document.getElementById('export-count');
  if (el) el.textContent = ct > 0 ? ct + ' accepted' : '';
  const btn = document.getElementById('export-btn');
  if (btn) btn.disabled = ct === 0;
}

// ══════════════════════════════════════════
// SETTINGS (PRES MIN EDITOR)
// ══════════════════════════════════════════
function showSettings() {
  APP.selectedSKU = null;
  const panel = document.getElementById('main-panel');

  let html = '<div class="anim-fade"><h2 style="font-size:18px;font-weight:600;margin-bottom:18px">Pres Min Configuration</h2>' +
    '<div style="font-size:12px;color:var(--text-secondary);margin-bottom:20px">' +
      'Set per-size presentation minimums for each size scale. Values represent units per store.' +
    '</div>' +
    '<div class="settings-grid">';

  for (const scale in APP.scaleSizes) {
    const sizes = APP.scaleSizes[scale];
    if (!sizes || sizes.length === 0) continue;
    const config = APP.presMins[scale] || {};

    html += '<div class="settings-card"><h3>' + esc(scale) + ' <span style="font-weight:400;color:var(--text-dim)">(' + sizes.length + ' sizes)</span></h3>';
    html += '<table class="pres-min-table"><thead><tr>';
    sizes.forEach(s => { html += '<th>' + esc(s) + '</th>'; });
    html += '</tr></thead><tbody><tr>';
    sizes.forEach(s => {
      const val = config[s] !== undefined ? config[s] : '';
      html += '<td><input class="pm-input" type="number" step="0.5" min="0" value="' + val + '" ' +
        'onchange="setPresMin(\'' + esc(scale) + '\',\'' + esc(s) + '\',this.value)"></td>';
    });
    html += '</tr></tbody></table></div>';
  }

  html += '</div></div>';
  panel.innerHTML = html;
}

function setPresMin(scale, size, val) {
  if (!APP.presMins[scale]) APP.presMins[scale] = {};
  const v = parseFloat(val);
  if (isNaN(v) || v < 0) {
    delete APP.presMins[scale][size];
  } else {
    APP.presMins[scale][size] = v;
  }
}

// ══════════════════════════════════════════
// EXPORT
// ══════════════════════════════════════════
function exportCSV() {
  const acceptedSKUs = Object.keys(APP.accepted);
  if (acceptedSKUs.length === 0) return;

  const lines = ['Season Code,Sizing Type,SKU,Size,Quantity'];
  acceptedSKUs.forEach(sku => {
    const rec = APP.skus[sku];
    if (!rec || rec.dtcBuy <= 0) return;
    const result = computeAllocation(rec);
    if (!result) return;
    const typeLabel = rec.sizingType === 'initials' ? 'INITIALS' :
                      rec.sizingType === 'cf' ? 'CF' :
                      rec.sizingType === 'core' ? 'CORE' : 'NO SIZE';
    rec.sizes.forEach(s => {
      const qty = result.allocation[s] || 0;
      if (qty > 0) {
        lines.push(APP.activeSeason + ',' + typeLabel + ',' + sku + ',' + s + ',' + qty);
      }
    });
  });

  const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'SCE_' + APP.activeSeason + '_allocation.csv';
  a.click();
  URL.revokeObjectURL(url);
}

// ══════════════════════════════════════════
// NAVIGATION
// ══════════════════════════════════════════
function resetToWelcome() {
  document.getElementById('dashboard-screen').classList.remove('active');
  document.getElementById('welcome-screen').classList.remove('hidden');
  APP.activeSeason = null;
  APP.selectedSKU = null;
  APP.skus = {};
  APP.overrides = {};
  APP.accepted = {};
}

function handleSearch(val) {
  APP.searchTerm = val;
  renderSKUList();
}
