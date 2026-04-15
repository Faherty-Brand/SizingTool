/* ═══════════════════════════════════════
   PO Sizing V4 — UI Rendering
   ═══════════════════════════════════════ */

function render(){
  const main=document.getElementById('main-area');
  if(A.module==='presmins'){renderPresMins(main);return}
  if(A.module==='datasources'){renderDataSources(main);return}
  if(A.view==='detail'&&A.selectedSKU&&A.skus[A.selectedSKU]){renderDetail(main,A.skus[A.selectedSKU]);return}
  renderGrid(main);
}

// ═══ GRID ═══
function getFiltered(){
  let list=Object.values(A.skus).filter(r=>r.sizingType!=='nosize');const f=A.filters;
  if(f.type!=='All')list=list.filter(r=>r.sizingType===f.type);
  if(f.division!=='All')list=list.filter(r=>r.division===f.division);
  if(f.category!=='All')list=list.filter(r=>r.category===f.category);
  if(f.subcategory!=='All')list=list.filter(r=>r.subcategory===f.subcategory);
  if(A.searchTerm){const st=A.searchTerm.toLowerCase();list=list.filter(r=>r.sku.toLowerCase().includes(st)||r.styleDescription.toLowerCase().includes(st)||r.colorDescription.toLowerCase().includes(st))}
  const sk=A.sortKey;
  list.sort((a,b)=>{
    if(sk==='dtcBuy')return b.dtcBuy-a.dtcBuy;
    if(sk==='postBuy')return(b.totalOH+b.dtcBuy)-(a.totalOH+a.dtcBuy);
    if(sk==='currentOH')return b.totalOH-a.totalOH;
    if(sk==='storeCount')return b.storeCount-a.storeCount;
    if(sk==='type'){const to={cf:0,initials:1};return(to[a.sizingType]||9)-(to[b.sizingType]||9)}
    if(sk==='accepted'){return(A.accepted[a.sku]?0:1)-(A.accepted[b.sku]?0:1)}
    return 0;
  });return list;
}

function renderGrid(el){
  const list=getFiltered(),all=Object.values(A.skus).filter(r=>r.sizingType!=='nosize');
  const divs=[...new Set(all.map(r=>r.division).filter(Boolean))].sort();
  const cats=[...new Set(all.map(r=>r.category).filter(Boolean))].sort();
  const subs=[...new Set(all.map(r=>r.subcategory).filter(Boolean))].sort();
  function opts(arr,lbl,cur){let h='<option value="All">'+lbl+': All</option>';arr.forEach(v=>{h+='<option value="'+esc(v)+'"'+(cur===v?' selected':'')+'>'+esc(v)+'</option>'});return h}
  function sb(k,l){return'<button class="sb'+(A.sortKey===k?' on':'')+'" onclick="A.sortKey=\''+k+'\';render()">'+l+'</button>'}
  let h='<div class="gv"><div class="gc"><div class="gc-row">'+
    '<span class="gc-lbl">Sort</span>'+sb('dtcBuy',A.activeSeason+' Buy')+sb('postBuy','Post-Buy OH')+sb('currentOH','Current OH')+
    sb('storeCount','Store Count')+sb('type','CF / Initials')+sb('accepted','Accepted / Pending')+
    '<div style="flex:1"></div><input class="sbar" type="text" placeholder="Search..." value="'+esc(A.searchTerm)+'" oninput="A.searchTerm=this.value;render()">'+
  '</div><div class="gc-row"><span class="gc-lbl">Filter</span>'+
    '<select class="fsel" onchange="A.filters.type=this.value;render()"><option value="All">Type: All</option><option value="cf"'+(A.filters.type==='cf'?' selected':'')+'>CF</option><option value="initials"'+(A.filters.type==='initials'?' selected':'')+'>Initials</option></select>'+
    '<select class="fsel'+(divs.length<=1?' dim':'')+'" onchange="A.filters.division=this.value;render()">'+opts(divs,'Division',A.filters.division)+'</select>'+
    '<select class="fsel'+(cats.length<=1?' dim':'')+'" onchange="A.filters.category=this.value;render()">'+opts(cats,'Category',A.filters.category)+'</select>'+
    '<select class="fsel'+(subs.length<=1?' dim':'')+'" onchange="A.filters.subcategory=this.value;render()">'+opts(subs,'Subcategory',A.filters.subcategory)+'</select>'+
    '<span class="gc-lbl" style="margin-left:8px">'+list.length+' SKUs</span></div></div>';
  h+='<div class="sg">';
  list.slice(0,500).forEach(r=>{
    const acc=A.accepted[r.sku];
    const divCls=r.division==='Womens'?'dv-w':(r.division==='Non-Apparel'||r.division==='Accessories'||r.division==='Footwear')?'dv-n':'dv-m';
    const bc=r.sizingType==='cf'?'bdg-cf':'bdg-in';
    const bl=r.sizingType==='cf'?'CF':'INITIALS';
    h+='<div class="sc '+divCls+'" onclick="goDetail(\''+esc(r.sku)+'\')">';
    if(acc)h+='<div class="chk chk-g">✓</div>';else h+='<div class="chk chk-e"></div>';
    h+='<div class="sid">'+esc(r.sku)+'</div><div class="snm">'+esc(r.styleDescription)+(r.colorDescription?' · '+esc(r.colorDescription):'')+'</div>'+
    '<div class="sbu">'+fmt(r.dtcBuy)+' u</div><div class="ssb">OH: '+fmt(r.totalOH)+' · Stores: '+r.storeCount+'</div>'+
    '<div class="bdg '+bc+'" style="font-size:10px;padding:3px 8px">'+bl+'</div></div>';
  });
  if(list.length>500)h+='<div class="gnote">Showing 500 of '+list.length+'</div>';
  if(!list.length)h+='<div class="gnote">No SKUs match filters</div>';
  h+='</div></div>';el.innerHTML=h;
}

// ═══ DETAIL ═══
const CHART_COLORS={buy:'#c4572a',curveSales:'#3b7bc0',postBuy:'#2d8a5e',oh:'#6a7a8a',minRetail:'#b8960f'};
const CHART_LABELS={buy:'Buy Qty',curveSales:'Curve Sales',postBuy:'Post-Buy Qty',oh:'Current OH',minRetail:'Min Retail Pres'};

function getChartMetrics(isCF){
  if(A.chartMetrics)return A.chartMetrics;
  const defaults={buy:true,curveSales:true,postBuy:isCF,oh:false,minRetail:false};
  return defaults;
}

function toggleChartMetric(key){
  if(!A.chartMetrics)A.chartMetrics={...getChartMetrics(A.skus[A.selectedSKU]?.sizingType==='cf')};
  A.chartMetrics[key]=!A.chartMetrics[key];
  render();
}

function renderDetail(el,rec){
  const res=computeAlloc(rec);
  if(!res&&rec.sizingType!=='nosize'){el.innerHTML='<div class="gnote">Unable to compute</div>';return}
  if(rec.sizingType==='nosize'){
    el.innerHTML='<div class="dv anim"><button class="d-back" onclick="goGrid()">← Back to '+esc(A.activeSeason)+'</button><div class="detail-sticky"><div class="ds-row1"><div class="ds-left"><h2>'+esc(rec.sku)+'</h2><span class="bdg bdg-ns">NO BUY</span></div></div></div><p style="color:var(--txt3);margin-top:12px">No buy — sizing not required.</p></div>';return}
  const{alloc,curve,cr,pm,pmRate,bop,wtr,ideal,pool,curveSales}=res;
  const isCF=rec.sizingType==='cf';
  const locked=A.accepted[rec.sku]||false;
  const wks=isCF?wtr:deliveryToWeeks(rec.deliveryMonth,rec.season);
  const metrics=getChartMetrics(isCF);

  // ── Chart with toggleable metrics ──
  const chartData={};
  rec.sizes.forEach(s=>{
    chartData[s]={
      buy:alloc[s]||0,
      curveSales:curveSales[s]||0,
      postBuy:isCF?((bop[s]||0)+(alloc[s]||0)):(alloc[s]||0),
      oh:rec.sizeData[s].onHand,
      minRetail:pm[s]||0
    };
  });
  const activeKeys=Object.keys(metrics).filter(k=>metrics[k]);
  let maxVal=1;
  rec.sizes.forEach(s=>{activeKeys.forEach(k=>{const v=chartData[s][k]||0;if(v>maxVal)maxVal=v})});

  // Legend checkboxes
  let legend='<div class="chart-legend-bar">';
  for(const k in CHART_LABELS){
    const checked=metrics[k];
    legend+='<label class="chart-cb'+(checked?' on':'')+'" style="--cb-color:'+CHART_COLORS[k]+'"><input type="checkbox" '+(checked?'checked':'')+' onchange="toggleChartMetric(\''+k+'\')"><span class="cb-dot" style="background:'+CHART_COLORS[k]+'"></span>'+CHART_LABELS[k]+'</label>';
  }
  legend+='</div>';

  // Bars
  let bars='';
  rec.sizes.forEach(s=>{
    const cd=chartData[s];
    let barsInner='';
    activeKeys.forEach(k=>{
      const v=cd[k]||0;
      const hPct=(v/maxVal*100).toFixed(1);
      const total=Object.values(A.skus).length; // just for tooltip
      const allVals=rec.sizes.map(sz=>chartData[sz][k]||0);
      const totalForMetric=allVals.reduce((a,b)=>a+b,0);
      const pctOfTotal=totalForMetric>0?((v/totalForMetric)*100).toFixed(1)+'%':'0%';
      barsInner+='<div class="cbar" style="height:'+hPct+'%;background:'+CHART_COLORS[k]+'" data-tip="'+CHART_LABELS[k]+': '+fmt(v)+' ('+pctOfTotal+')"></div>';
    });
    bars+='<div class="chart-col-v4"><div class="chart-size-hdr">'+esc(s)+'</div><div class="chart-bars-v4">'+barsInner+'</div></div>';
  });

  // ── Rollup trail ──
  let trail='<div class="rb"><span class="gc-lbl">Curve source: </span>';
  cr.trail.forEach(t=>{if(t.pass)trail+='<span class="rs rp">'+esc(t.level)+' ('+esc(t.label)+') ✓ ['+fmt(t.total)+' vs '+fmt(t.thresh)+' needed]</span>';
    else trail+='<span class="rs rf">'+esc(t.level)+' ('+esc(t.label)+') ✗ ['+fmt(t.total)+' vs '+fmt(t.thresh)+' needed]</span> → '});
  trail+='</div>';

  // ── Data Table ──
  const curveSalesTotal=Object.values(curveSales).reduce((a,b)=>a+b,0);
  let tAlloc=0,tPM=0,tMinRetail=0;

  // Header
  let thead='<tr class="gr"><th></th><th class="gs" colspan="4">Sales Metrics</th>';
  thead+=isCF?'<th class="gi" colspan="9">Inventory Metrics</th>':'<th class="gi" colspan="7">Inventory Metrics</th>';
  thead+='</tr><tr><th style="text-align:left">Size</th>';
  thead+='<th class="cbl">SKU Sales</th><th class="cbd">Curve Sales</th><th class="cbl">Curve %</th><th class="cbd">Wkly Rate</th>';
  thead+='<th class="col">Current OH</th>';
  if(isCF)thead+='<th class="cod">Pending Rcpts</th><th class="col">Proj. BOP</th>';
  thead+='<th class="cod">Ideal Target</th><th class="col">Pres Min</th><th class="cod">Min Retail Pres</th>';
  thead+='<th class="col">Size Break</th><th class="cod">Break %</th>';
  thead+='<th class="col">Post-Buy</th></tr>';

  // Compute totals
  let totSkuSl=0,totCurveSl=0,totOH=0,totPend=0,totBOP=0,totIdeal=0,totAl=0,totPost=0,totMinRet=0;
  rec.sizes.forEach(s=>{
    const sd=rec.sizeData[s],a=alloc[s]||0;
    totSkuSl+=sd.sales;totCurveSl+=(curveSales[s]||0);totOH+=sd.onHand;
    if(isCF){totPend+=sd.wipOrd;totBOP+=(bop[s]||0)}
    totIdeal+=(isCF?(ideal[s]||0):Math.round(curve[s]*pool));
    totAl+=a;totPost+=(isCF?(bop[s]||0):0)+a;
    totMinRet+=pm[s];tPM+=(pmRate[s]||0);
  });

  // Totals row first
  let tBody='<tr class="rt"><td>TOTAL</td>';
  tBody+='<td class="cbl">'+fmt(totSkuSl)+'</td><td class="cbd">'+fmt(totCurveSl)+'</td><td class="cbl">100%</td><td class="cbd"></td>';
  tBody+='<td class="col">'+fmt(totOH)+'</td>';
  if(isCF)tBody+='<td class="cod">'+fmt(totPend)+'</td><td class="col c-t">'+fmt(totBOP)+'</td>';
  tBody+='<td class="cod">'+fmt(totIdeal)+'</td><td class="col"></td><td class="cod">'+fmt(totMinRet)+'</td>';
  tBody+='<td class="col c-o">'+fmt(totAl)+'</td><td class="cod">100%</td>';
  tBody+='<td class="col c-g" style="font-weight:700">'+fmt(totPost)+'</td></tr>';

  // Data rows
  rec.sizes.forEach(s=>{
    const sd=rec.sizeData[s],a=alloc[s]||0;
    const wr=(sd.sales/52).toFixed(1);const cv=curve[s];const sbPct=totAl>0?a/totAl:0;
    const postBuy=(isCF?(bop[s]||0):0)+a;
    const minRetail=pm[s];
    const hasOv=A.overrides[rec.sku]&&A.overrides[rec.sku][s]!==undefined;
    const inp=locked?'<span class="c-o">'+fmt(a)+'</span>':'<input class="ai'+(hasOv?' ov':'')+'" type="number" value="'+a+'" onchange="setOvr(\''+esc(rec.sku)+'\',\''+esc(s)+'\',this.value)">';
    tBody+='<tr><td>'+esc(s)+'</td>';
    tBody+='<td class="cbl">'+fmt(sd.sales)+'</td>';
    tBody+='<td class="cbd">'+fmt(curveSales[s]||0)+'</td>';
    tBody+='<td class="cbl c-d">'+pct(cv)+'</td>';
    tBody+='<td class="cbd c-d">'+wr+'</td>';
    tBody+='<td class="col">'+fmt(sd.onHand)+'</td>';
    if(isCF){tBody+='<td class="cod">'+fmt(sd.wipOrd)+'</td>';tBody+='<td class="col c-t">'+fmt(bop[s]||0)+'</td>'}
    tBody+='<td class="cod">'+fmt(isCF?(ideal[s]||0):Math.round(cv*pool))+'</td>';
    tBody+='<td class="col c-d">'+(pmRate[s]||'—')+'</td>';
    tBody+='<td class="cod'+(a<minRetail&&minRetail>0?' c-r':'')+'">'+fmt(minRetail)+'</td>';
    tBody+='<td class="col">'+inp+'</td>';
    tBody+='<td class="cod c-d">'+pct(sbPct)+'</td>';
    tBody+='<td class="col c-g" style="font-weight:600">'+fmt(postBuy)+'</td></tr>';
  });

  const variance=totAl-pool;
  const vNote=variance!==0?'<span class="tbn c-r">Variance: '+(variance>0?'+':'')+variance+'</span>':'<span class="tbn c-g">Balanced — '+fmt(pool)+' units</span>';
  const lockBtn=locked?'<button class="btn-grn" style="opacity:.6" onclick="toggleAcc(\''+esc(rec.sku)+'\')">✓ Accepted</button>':'<button class="btn-grn" onclick="toggleAcc(\''+esc(rec.sku)+'\')">Accept</button>';
  const hasOvrs=A.overrides[rec.sku]&&Object.keys(A.overrides[rec.sku]).length>0;
  const resetBtn=hasOvrs&&!locked?'<button class="btn btn-g btn-sm" onclick="clrOvr(\''+esc(rec.sku)+'\')">Reset</button>':'';
  const skuL52W=rec.skuSalesTotal;
  const totalBOPv=isCF?totBOP:0;

  el.innerHTML='<div class="dv anim">'+
    '<button class="d-back" onclick="goGrid()">← Back to '+esc(A.activeSeason)+'</button>'+
    '<div class="detail-sticky"><div class="ds-row1"><div class="ds-left"><h2>'+esc(rec.sku)+'</h2><span class="bdg '+(isCF?'bdg-cf':'bdg-in')+'">'+rec.sizingType.toUpperCase()+'</span></div>'+
    '<div class="ds-right">'+resetBtn+lockBtn+'</div></div>'+
    '<div class="attr-row">'+attrPills(rec)+'</div>'+
    '<div class="metric-row">'+
      '<span class="metric-pill">'+esc(rec.season)+' Buy: '+fmt(pool)+'</span>'+
      '<span class="metric-pill">Stores: '+fmt(rec.storeCount)+'</span>'+
      '<span class="metric-pill">Current OH: '+fmt(rec.totalOH)+'</span>'+
      (isCF?'<span class="metric-pill">Proj. BOP: '+fmt(totalBOPv)+' ('+wks+'w)</span>':'')+
      '<span class="metric-pill">L52W SKU Sales: '+fmt(skuL52W)+'</span>'+
    '</div></div>'+
    // Chart
    '<div class="cb"><div class="slbl">Size Distribution</div>'+legend+
    '<div class="chart-v4">'+bars+'</div></div>'+
    trail+
    // Table
    '<div class="tb"><div class="tbh"><div class="slbl" style="margin:0">Data Table</div>'+vNote+'</div>'+
    '<div class="tbs"><table class="dt"><thead>'+thead+'</thead><tbody>'+tBody+'</tbody></table></div></div></div>';
}

function attrPills(rec){
  return '<span class="attr-pill">'+esc(rec.division)+'</span>'+
    '<span class="attr-pill">'+esc(rec.category)+'</span>'+
    '<span class="attr-pill">'+esc(rec.subcategory)+'</span>'+
    '<span class="attr-pill">'+esc(rec.sizeScale)+'</span>'+
    '<span class="attr-pill">'+esc(rec.storeTier||'—')+'</span>'+
    (rec.deliveryMonth?'<span class="attr-pill">'+esc(rec.deliveryMonth)+'</span>':'');
}

// ═══ PRES MINS ═══
let pmStaged={};

function renderPresMins(el){
  // Combine scales from presMins config AND scaleSizes (data-derived) AND presMinsMeta
  const allScales=new Set();
  for(const s in A.presMins)allScales.add(s);
  for(const s in A.scaleSizes)allScales.add(s);
  for(const s in A.presMinsMeta)allScales.add(s);
  let scales=[...allScales].sort();

  let h='<div class="pm-page anim"><button class="d-back" onclick="goBackFromModule()">← Back</button>'+
    '<h2 style="font-size:20px;font-weight:700;color:var(--navy);margin-bottom:4px">Presentation Minimums</h2>'+
    '<p style="font-size:12px;color:var(--txt2);margin-bottom:14px">Per-size units per store. Persisted across sessions.</p>'+
    '<div class="pm-actions"><button class="btn btn-b btn-sm" onclick="openAddScaleModal()">+ Add Size Scale</button></div>'+
    '<div class="pm-cards">';

  scales.forEach(scale=>{
    // Get sizes from presMinsMeta first, then scaleSizes, then derive from presMins keys
    const metaSizes=(A.presMinsMeta[scale]&&A.presMinsMeta[scale].sizes)||[];
    const dataSizes=A.scaleSizes[scale]||[];
    const pmKeys=Object.keys(A.presMins[scale]||{});
    // Merge all known sizes
    const sizeSet=new Set([...metaSizes,...dataSizes,...pmKeys]);
    const sizes=[...sizeSet].sort(ssort);
    if(!sizes.length)return;

    const cfg=A.presMins[scale]||{};
    const staged=pmStaged[scale]||{};
    const meta=A.presMinsMeta[scale]||{};
    const divCls=meta.div==='Womens'?'div-w':meta.div==='Non-Apparel'?'div-n':'div-m';
    const divTag=meta.div==='Womens'?'pm-div-w':meta.div==='Non-Apparel'?'pm-div-n':'pm-div-m';
    const storeSizes=sizes.filter(s=>(cfg[s]||0)>0).length;
    const hasStagedChanges=Object.keys(staged).length>0&&Object.keys(staged).some(s=>{const sv=staged[s];const cv=cfg[s];return sv!==cv});

    h+='<div class="pm-card '+divCls+'" style="position:relative"><button class="pm-delete" onclick="deleteScale(\''+esc(scale)+'\')" title="Delete scale">✕</button>'+
      '<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px"><h3 style="margin:0">'+esc(scale)+' <span style="font-weight:400;color:var(--txt3)">('+sizes.length+' sizes · '+storeSizes+' store)</span></h3>'+
      '<button class="btn btn-g btn-sm" onclick="openEditScaleModal(\''+esc(scale)+'\')">Edit Sizes</button></div>';
    if(meta.div)h+='<span class="pm-div-tag '+divTag+'">'+esc(meta.div)+'</span>';
    h+='<table class="pm-tbl"><thead><tr><th></th>';
    sizes.forEach(s=>{h+='<th>'+esc(s)+'</th>'});
    h+='</tr></thead><tbody>';
    h+='<tr><td class="pm-row-lbl">Current</td>';
    sizes.forEach(s=>{const v=cfg[s]!==undefined?cfg[s]:'—';h+='<td><span class="pm-val">'+v+'</span></td>'});
    h+='</tr>';
    h+='<tr class="pm-sep"><td class="pm-row-lbl">Overwrite</td>';
    sizes.forEach(s=>{
      const sv=staged[s]!==undefined?staged[s]:(cfg[s]!==undefined?cfg[s]:'');
      h+='<td><input class="pm-input" type="number" step="0.5" min="0" value="'+sv+'" onchange="stagePM(\''+esc(scale)+'\',\''+esc(s)+'\',this.value)"></td>';
    });
    h+='</tr></tbody></table>';
    if(hasStagedChanges){
      h+='<div class="pm-dirty-bar"><span class="dt-text">Unsaved changes</span>'+
        '<button class="btn btn-grn btn-sm" onclick="acceptPMOverwrites(\''+esc(scale)+'\')">Accept Overwrites</button>'+
        '<button class="btn btn-g btn-sm" onclick="clearPMStaged(\''+esc(scale)+'\')">Discard</button></div>';
    }
    h+='</div>';
  });

  if(!scales.length)h+='<div class="gnote">No size scales configured. Click "+ Add Size Scale" to create one.</div>';
  h+='</div></div>';el.innerHTML=h;
}

function stagePM(scale,size,val){
  if(!pmStaged[scale])pmStaged[scale]={};
  const v=parseFloat(val);pmStaged[scale][size]=isNaN(v)||v<0?0:v;
  render();
}

async function acceptPMOverwrites(scale){
  const staged=pmStaged[scale]||{};
  if(!A.presMins[scale])A.presMins[scale]={};
  for(const s in staged)A.presMins[scale][s]=staged[s];
  delete pmStaged[scale];
  await dbPut('config','presMins',A.presMins);
  toast(scale+' pres mins updated');render();
}

function clearPMStaged(scale){delete pmStaged[scale];render()}

async function deleteScale(scale){
  if(!confirm('Delete size scale "'+scale+'"? This cannot be undone.'))return;
  delete A.presMins[scale];delete A.presMinsMeta[scale];delete A.scaleSizes[scale];delete A.scaleSizeCount[scale];
  await dbPut('config','presMins',A.presMins);
  await dbPut('config','presMinsMeta',A.presMinsMeta);
  await dbPut('config','scaleSizes',Object.fromEntries(Object.entries(A.scaleSizes).map(([k,v])=>[k,Array.isArray(v)?v:[...v]])));
  toast(scale+' deleted');render();
}

// ─── Add/Edit Scale Modal ───
let modalState={name:'',div:'Mens',copyFrom:'',sizes:[],sizeInput:'',editing:null};

function openAddScaleModal(){
  modalState={name:'',div:'Mens',copyFrom:'',sizes:[],sizeInput:'',editing:null};renderModal();
}

function openEditScaleModal(scale){
  const meta=A.presMinsMeta[scale]||{};
  const sizes=A.scaleSizes[scale]||meta.sizes||Object.keys(A.presMins[scale]||{});
  modalState={name:scale,div:meta.div||'Mens',copyFrom:'',sizes:[...sizes],sizeInput:'',editing:scale};
  renderModal();
}

function closeModal(){document.getElementById('modal-root').innerHTML=''}

function renderModal(){
  const ms=modalState;
  const existingScales=Object.keys(A.scaleSizes).filter(s=>(A.scaleSizes[s]||[]).length>0);
  const hasExisting=existingScales.length>0&&!ms.editing;
  const isEdit=!!ms.editing;
  const divBtns=[
    {val:'Mens',label:'Mens',cls:ms.div==='Mens'?'sel-m':''},
    {val:'Womens',label:'Womens',cls:ms.div==='Womens'?'sel-w':''},
    {val:'Non-Apparel',label:'Non-Apparel',cls:ms.div==='Non-Apparel'?'sel-n':''}
  ];

  let h='<div class="modal-bg" onclick="if(event.target===this)closeModal()"><div class="modal">'+
    '<h3>'+(isEdit?'Edit '+esc(ms.editing):'Add Size Scale')+'</h3>';
  if(!isEdit){
    h+='<div class="modal-label">Scale Name</div><input class="modal-input" type="text" placeholder="e.g. FM6" value="'+esc(ms.name)+'" oninput="modalState.name=this.value">';
  }
  h+='<div class="modal-label">Division</div><div class="modal-div-btns">';
  divBtns.forEach(b=>{h+='<button class="modal-div-btn '+b.cls+'" onclick="modalState.div=\''+b.val+'\';renderModal()">'+b.label+'</button>'});
  h+='</div>';
  if(hasExisting&&!ms.copyFrom){
    h+='<div class="modal-label">Copy Sizes From (optional)</div><div class="modal-copy-btns">';
    h+='<button class="modal-copy-btn sel" onclick="">None — enter manually</button>';
    existingScales.forEach(s=>{h+='<button class="modal-copy-btn" onclick="modalState.copyFrom=\''+esc(s)+'\';modalState.sizes=[...(A.scaleSizes[\''+esc(s)+'\']||[])];renderModal()">'+esc(s)+' ('+((A.scaleSizes[s]||[]).length)+')</button>'});
    h+='</div>';
  }
  if(hasExisting&&ms.copyFrom){
    h+='<div class="modal-label">Copied from '+esc(ms.copyFrom)+' <a href="#" onclick="modalState.copyFrom=\'\';renderModal();return false" style="color:var(--red);font-size:10px">clear</a></div>';
  }
  // Tag input for sizes
  h+='<div class="modal-label">Sizes</div><div class="tag-area" onclick="this.querySelector(\'.tag-input\')?.focus()">';
  ms.sizes.forEach((s,i)=>{h+='<span class="size-tag">'+esc(s)+'<span class="tag-x" onclick="event.stopPropagation();modalState.sizes.splice('+i+',1);renderModal()">×</span></span>'});
  h+='<input class="tag-input" type="text" placeholder="Type + Enter" value="'+esc(ms.sizeInput)+'" oninput="modalState.sizeInput=this.value" onkeydown="handleTagKey(event)">';
  h+='</div><div style="font-size:10px;color:var(--txt3);margin-top:4px">Press Enter or comma to add. Click × to remove.</div>';
  const canSave=(isEdit||ms.name.trim())&&ms.sizes.length>0;
  h+='<div class="modal-footer"><button class="btn btn-g" onclick="closeModal()">Cancel</button>'+
    '<button class="btn btn-b"'+(canSave?'':' disabled')+' onclick="saveScale()">'+(isEdit?'Save Changes':'Create Scale')+'</button></div></div></div>';
  document.getElementById('modal-root').innerHTML=h;
  if(!isEdit&&!ms.name){const inp=document.querySelector('.modal-input');if(inp)setTimeout(()=>inp.focus(),50)}
}

function handleTagKey(e){
  if(e.key==='Enter'||e.key===','){
    e.preventDefault();const val=modalState.sizeInput.replace(',','').trim().toUpperCase();
    if(val&&!modalState.sizes.includes(val))modalState.sizes.push(val);
    modalState.sizeInput='';renderModal();
    setTimeout(()=>{const inp=document.querySelector('.tag-input');if(inp)inp.focus()},50);
  }
}

async function saveScale(){
  const ms=modalState;
  const name=ms.editing||ms.name.trim().toUpperCase();if(!name||!ms.sizes.length)return;
  A.scaleSizes[name]=[...ms.sizes];A.scaleSizeCount[name]=ms.sizes.length;
  if(!A.presMins[name])A.presMins[name]={};
  A.presMinsMeta[name]={div:ms.div,sizes:[...ms.sizes]};
  if(!ms.editing&&ms.copyFrom&&A.presMins[ms.copyFrom])A.presMins[name]={...A.presMins[ms.copyFrom]};
  await dbPut('config','presMins',A.presMins);
  await dbPut('config','presMinsMeta',A.presMinsMeta);
  await dbPut('config','scaleSizes',Object.fromEntries(Object.entries(A.scaleSizes).map(([k,v])=>[k,Array.isArray(v)?v:[...v]])));
  closeModal();toast(name+(ms.editing?' updated':' created'));render();
}

// ═══ DATA SOURCES ═══
function renderDataSources(el){
  const tabs=['inventory','sales','linelist','wip'];
  let h='<div class="dv-page anim"><button class="d-back" onclick="goBackFromModule()">← Back</button>'+
    '<h2 style="font-size:20px;font-weight:700;color:var(--navy);margin-bottom:4px">Data Sources</h2>'+
    '<p style="font-size:12px;color:var(--txt2);margin-bottom:14px">Live view of ingested CSV data.</p><div class="dv-tabs">';
  tabs.forEach(t=>{const m=A.uploadMeta[t];h+='<button class="dv-tab'+(A.dvTab===t?' on':'')+'" onclick="A.dvTab=\''+t+'\';render()">'+t.charAt(0).toUpperCase()+t.slice(1)+(m?' ('+fmt(m.rows)+'r)':'')+'</button>'});
  h+='</div>';const data=A.raw[A.dvTab];const meta=A.uploadMeta[A.dvTab];
  if(!data)h+='<div class="gnote">No data loaded for '+A.dvTab+'</div>';
  else{
    h+='<div class="dv-info">'+fmt(meta.rows)+' rows × '+meta.cols+' cols · '+meta.date+' · '+esc(meta.fileName)+'</div>';
    h+='<div class="dv-table-wrap"><table class="dv-table"><thead><tr>';
    const cols=Object.keys(data[0]);cols.forEach(c=>{h+='<th>'+esc(c)+'</th>'});
    h+='</tr></thead><tbody>';data.slice(0,500).forEach(r=>{h+='<tr>';cols.forEach(c=>{h+='<td>'+esc(r[c]||'')+'</td>'});h+='</tr>'});
    h+='</tbody></table></div>';if(data.length>500)h+='<div class="gnote">Showing 500 of '+fmt(data.length)+'</div>';
  }
  h+='</div>';el.innerHTML=h;
}
