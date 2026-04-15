/* ═══════════════════════════════════════
   PO Sizing V4 — Core Engine (db + data)
   ═══════════════════════════════════════ */

// ─── IndexedDB ───
const DB_NAME='POSizingV4',DB_VER=2;
let db=null;
function openDB(){return new Promise((res,rej)=>{const r=indexedDB.open(DB_NAME,DB_VER);r.onupgradeneeded=e=>{const d=e.target.result;if(!d.objectStoreNames.contains('csvdata'))d.createObjectStore('csvdata');if(!d.objectStoreNames.contains('config'))d.createObjectStore('config')};r.onsuccess=e=>{db=e.target.result;res(db)};r.onerror=e=>rej(e)})}
function dbPut(store,key,val){return new Promise((res,rej)=>{const tx=db.transaction(store,'readwrite');tx.objectStore(store).put(val,key);tx.oncomplete=()=>res();tx.onerror=e=>rej(e)})}
function dbGet(store,key){return new Promise((res,rej)=>{const tx=db.transaction(store,'readonly');const r=tx.objectStore(store).get(key);r.onsuccess=()=>res(r.result);r.onerror=e=>rej(e)})}
function dbDel(store,key){return new Promise((res,rej)=>{const tx=db.transaction(store,'readwrite');tx.objectStore(store).delete(key);tx.oncomplete=()=>res();tx.onerror=e=>rej(e)})}

// ─── CSV Parser ───
function parseCSV(t,hi){
  hi=hi||0;const rl=[];let c='',q=false,r=[];
  for(let i=0;i<t.length;i++){const ch=t[i];if(ch==='"'){if(q&&t[i+1]==='"'){c+='"';i++}else q=!q}else if(ch===','&&!q){r.push(c.trim());c=''}else if((ch==='\n'||ch==='\r')&&!q){if(ch==='\r'&&t[i+1]==='\n')i++;r.push(c.trim());if(r.length>1||(r.length===1&&r[0]!==''))rl.push(r);c='';r=[]}else c+=ch}
  if(c||r.length){r.push(c.trim());rl.push(r)}
  const f=rl.filter(x=>x.length>1);if(f.length<hi+1)return[];
  const h=f[hi].map(x=>x.replace(/^\uFEFF/,''));const res=[];
  for(let i=hi+1;i<f.length;i++){const o={};h.forEach((hh,idx)=>{o[hh]=f[i][idx]||''});res.push(o)}return res;
}

function findCol(row,cands){
  if(!row)return null;const keys=Object.keys(row);
  for(const c of cands){const f=keys.find(k=>k.toLowerCase()===c.toLowerCase());if(f)return f}
  for(const c of cands){const cl=c.toLowerCase();const f=keys.find(k=>k.toLowerCase().includes(cl));if(f)return f}
  return null;
}

function numP(v){if(!v)return 0;return parseInt(String(v).replace(/[^0-9\-]/g,''),10)||0}
function esc(s){const d=document.createElement('div');d.textContent=s;return d.innerHTML}
function fmt(n){return n.toLocaleString()}
function pct(n){return(n*100).toFixed(1)+'%'}

// ─── Size sort ───
const SO={XXS:1,XS:2,S:3,M:4,L:5,XL:6,XXL:7,XXXL:8,'2XL':7,'3XL':8,MT:5,LT:6,XLT:7,XXLT:8,OS:0};
function ssort(a,b){
  const oa=SO[a.toUpperCase()]??null,ob=SO[b.toUpperCase()]??null;
  if(oa!==null&&ob!==null)return oa-ob;if(oa!==null)return-1;if(ob!==null)return 1;
  const pa=a.match(/^(\d+)/),pb=b.match(/^(\d+)/);
  if(pa&&pb){const wa=+pa[1],wb=+pb[1];if(wa!==wb)return wa-wb;const la=a.match(/(\d+)L$/),lb=b.match(/(\d+)L$/);if(la&&lb)return+la[1]-+lb[1]}
  return a.localeCompare(b);
}

// ─── Toast ───
function toast(msg){const d=document.createElement('div');d.className='toast ok';d.textContent=msg;document.getElementById('toasts').appendChild(d);setTimeout(()=>{d.classList.add('out');setTimeout(()=>d.remove(),500)},3000)}

// ─── Delivery month calc ───
const MONTH_MAP={january:1,february:2,march:3,april:4,may:5,june:6,july:7,august:8,september:9,october:10,november:11,december:12};
function deliveryToWeeks(deliveryMonth,seasonCode){
  if(!deliveryMonth||!seasonCode)return 12;
  const base=deliveryMonth.toLowerCase().replace(/_\d+$/,'');
  const mo=MONTH_MAP[base];if(!mo)return 12;
  const yrMatch=seasonCode.match(/(\d{2})$/);if(!yrMatch)return 12;
  const yr=2000+parseInt(yrMatch[1]);
  const target=new Date(yr,mo-1,1);
  return Math.max(0,Math.round((target-new Date())/(7*24*60*60*1000)));
}

// ═══ APP STATE ═══
const A={
  raw:{inventory:null,sales:null,linelist:null,wip:null},
  rawCSV:{},uploadMeta:{},
  seasons:[],activeSeason:null,
  skus:{},selectedSKU:null,
  view:'grid',module:null,
  overrides:{},accepted:{},
  searchTerm:'',sortKey:'dtcBuy',
  filters:{type:'All',division:'All',category:'All',subcategory:'All'},
  presMins:{M3:{XS:.5,S:1,M:2,L:2,XL:1.5,XXL:.5},FM3:{XS:0,S:1,M:2,L:2,XL:1.5,XXL:0}},
  presMinsMeta:{M3:{div:'Mens',sizes:['XS','S','M','L','XL','XXL']},FM3:{div:'Mens',sizes:['XS','S','M','L','XL','XXL']}},
  scaleSizes:{},scaleSizeCount:{},hierSales:{},salSKU:{},cols:{},
  dvTab:'inventory',
  chartMetrics:null // per-sku chart toggle state
};

// ═══ UPLOAD ═══
function handleUpload(key,inp){
  const file=inp.files[0];if(!file)return;
  const reader=new FileReader();
  reader.onload=async function(ev){
    const text=ev.target.result;
    let hi=(key==='linelist'||key==='wip')?2:1;
    A.raw[key]=parseCSV(text,hi);
    A.rawCSV[key]=text;
    A.uploadMeta[key]={rows:A.raw[key].length,cols:A.raw[key][0]?Object.keys(A.raw[key][0]).length:0,date:new Date().toLocaleString(),fileName:file.name};
    updateChip(key);
    await dbPut('csvdata','raw_'+key,text);
    await dbPut('csvdata','meta_'+key,A.uploadMeta[key]);
    // Build scaleSizes from data whenever linelist or sales/inv is uploaded
    if(allUp())buildScaleSizes();
    toast(key.charAt(0).toUpperCase()+key.slice(1)+' uploaded · '+fmt(A.raw[key].length)+' rows');
    trySeasons();
  };reader.readAsText(file);
}

function updateChip(key){
  const chip=document.getElementById('uc-'+key);
  const meta=document.getElementById('um-'+key);
  if(A.raw[key]&&chip){chip.classList.add('ok');const m=A.uploadMeta[key];if(meta)meta.textContent=fmt(m.rows)+'r × '+m.cols+'c · '+m.date}
}

function allUp(){return A.raw.inventory&&A.raw.sales&&A.raw.linelist&&A.raw.wip}

function buildScaleSizes(){
  // Build scaleSizes from linelist + sales + inventory data
  const ll=A.raw.linelist,sales=A.raw.sales,inv=A.raw.inventory;
  if(!ll||!ll[0])return;
  const lSS=findCol(ll[0],['Size Scale']),lS=findCol(ll[0],['SKU']);
  const skuScale={};ll.forEach(r=>{skuScale[r[lS]]=r[lSS]||''});
  A.scaleSizes={};
  if(sales&&sales[0]){const sS=findCol(sales[0],['SKU']),sZ=findCol(sales[0],['Size']);sales.forEach(r=>{const sc=skuScale[r[sS]];if(sc&&r[sZ]){if(!A.scaleSizes[sc])A.scaleSizes[sc]=new Set();A.scaleSizes[sc].add(r[sZ])}})}
  if(inv&&inv[0]){const iS=findCol(inv[0],['SKU']),iZ=findCol(inv[0],['Size']);inv.forEach(r=>{const sc=skuScale[r[iS]];if(sc&&r[iZ]){if(!A.scaleSizes[sc])A.scaleSizes[sc]=new Set();A.scaleSizes[sc].add(r[iZ])}})}
  for(const s in A.scaleSizes){A.scaleSizes[s]=[...A.scaleSizes[s]].sort(ssort);A.scaleSizeCount[s]=A.scaleSizes[s].length}
  // Also populate presMinsMeta sizes from data
  for(const s in A.scaleSizes){
    if(!A.presMinsMeta[s])A.presMinsMeta[s]={div:'Mens',sizes:[...A.scaleSizes[s]]};
    else A.presMinsMeta[s].sizes=[...A.scaleSizes[s]];
  }
  // Persist
  dbPut('config','scaleSizes',Object.fromEntries(Object.entries(A.scaleSizes).map(([k,v])=>[k,Array.isArray(v)?v:[...v]])));
  dbPut('config','presMinsMeta',A.presMinsMeta);
}

async function loadPersistedData(){
  for(const key of['inventory','sales','linelist','wip']){
    const text=await dbGet('csvdata','raw_'+key);
    const meta=await dbGet('csvdata','meta_'+key);
    if(text&&meta){let hi=(key==='linelist'||key==='wip')?2:1;A.raw[key]=parseCSV(text,hi);A.rawCSV[key]=text;A.uploadMeta[key]=meta;updateChip(key)}
  }
  const pm=await dbGet('config','presMins');if(pm)A.presMins=pm;
  const pmm=await dbGet('config','presMinsMeta');if(pmm)A.presMinsMeta=pmm;
  const ss=await dbGet('config','scaleSizes');
  if(ss){for(const k in ss){A.scaleSizes[k]=ss[k];A.scaleSizeCount[k]=ss[k].length}}
  // Also rebuild from data if available
  if(allUp())buildScaleSizes();
  trySeasons();
}

function trySeasons(){
  const el=document.getElementById('s-area');if(!el)return;
  if(!allUp()){el.innerHTML='<div class="s-wait">Upload all 4 data sources to continue</div>';return}
  const ll=A.raw.linelist,sc=findCol(ll[0],['Season Code']);
  const ct={};ll.forEach(r=>{const s=r[sc]||'';if(s)ct[s]=(ct[s]||0)+1});
  A.seasons=Object.keys(ct).sort();
  let h='<div class="s-grid">';
  A.seasons.forEach(s=>{h+='<div class="s-btn" onclick="goSeason(\''+esc(s)+'\')"><div class="code">'+esc(s)+'</div><div class="ct">'+ct[s]+' SKUs</div></div>'});
  el.innerHTML=h+'</div>';
}

function goSeason(s){
  A.activeSeason=s;A.selectedSKU=null;A.view='grid';A.module=null;
  A.overrides={};A.accepted={};A.sortKey='dtcBuy';
  A.filters={type:'All',division:'All',category:'All',subcategory:'All'};
  processData();
  document.getElementById('welcome').classList.add('hidden');
  document.getElementById('dash').classList.add('active');
  document.getElementById('slbl').textContent=s;
  render();
}

// ═══ PROCESS DATA ═══
function processData(){
  const inv=A.raw.inventory,sales=A.raw.sales,ll=A.raw.linelist,wip=A.raw.wip;
  const c={};
  c.iS=findCol(inv[0],['SKU']);c.iZ=findCol(inv[0],['Size']);c.iO=findCol(inv[0],['On Hand Units - TY','On Hand Units','On Hand']);
  c.sS=findCol(sales[0],['SKU']);c.sZ=findCol(sales[0],['Size']);c.sU=findCol(sales[0],['Net Sales Units - TY','Net Sales Units']);
  c.sD=findCol(sales[0],['Merchandise Division','Division','Department']);c.sC=findCol(sales[0],['Category']);
  c.sSC=findCol(sales[0],['Sub-Category','SubCategory','Subcategory']);c.sSD=findCol(sales[0],['Style Description']);
  c.lS=findCol(ll[0],['SKU']);c.lSe=findCol(ll[0],['Season Code']);c.lDp=findCol(ll[0],['Department']);
  c.lCa=findCol(ll[0],['Category']);c.lSc=findCol(ll[0],['Subcategory','Sub-Category']);
  c.lSt=findCol(ll[0],['Style']);c.lSD=findCol(ll[0],['Style Description']);
  c.lCC=findCol(ll[0],['Color Code']);c.lCD=findCol(ll[0],['Color Description']);
  c.lSS=findCol(ll[0],['Size Scale']);c.lDB=findCol(ll[0],['Total DTC Buy']);
  c.lSn=findCol(ll[0],['Store Count']);c.lTr=findCol(ll[0],['Store Tier']);
  c.lLC=findCol(ll[0],['Seasonal Life Cycle']);c.lCm=findCol(ll[0],['Commit Coding']);
  c.lRo=findCol(ll[0],['Roll Out Code - Retail','Roll Out Code']);c.lPS=findCol(ll[0],['PST PLANNING ATTRIBUTE 1']);
  c.lDM=findCol(ll[0],['Delivery Month']);
  c.wS=findCol(wip[0],['SKU']);c.wZ=findCol(wip[0],['Size']);c.wO=findCol(wip[0],['Ordered']);
  c.wSt=findCol(wip[0],['Shipment Status']);c.wPS=findCol(wip[0],['PO Status']);
  c.wDC=findCol(wip[0],['New Expected in DC','Expected in DC']);
  A.cols=c;

  const invI={};inv.forEach(r=>{const k=r[c.iS];if(!invI[k])invI[k]={};invI[k][r[c.iZ]]=(invI[k][r[c.iZ]]||0)+numP(r[c.iO])});
  const salI={},hS={};A.salSKU={};
  sales.forEach(r=>{
    const sku=r[c.sS],sz=r[c.sZ],u=numP(r[c.sU]);
    if(!salI[sku])salI[sku]={};salI[sku][sz]=(salI[sku][sz]||0)+u;
    A.salSKU[sku]=(A.salSKU[sku]||0)+u;
    const d=(r[c.sD]||'').toLowerCase(),ca=(r[c.sC]||'').toLowerCase(),sc=(r[c.sSC]||'').toLowerCase(),pr=(r[c.sSD]||'').toLowerCase();
    ['prog|'+d+'|'+ca+'|'+sc+'|'+pr,'sub|'+d+'|'+ca+'|'+sc,'cat|'+d+'|'+ca,'div|'+d].forEach(k=>{if(!hS[k])hS[k]={};hS[k][sz]=(hS[k][sz]||0)+u});
  });
  A.hierSales=hS;

  const wipI={};
  wip.forEach(r=>{if(r[c.wPS]==='Dropped'||r[c.wSt]==='Received')return;const sku=r[c.wS],sz=r[c.wZ];if(!wipI[sku])wipI[sku]={};if(!wipI[sku][sz])wipI[sku][sz]={ordered:0,dc:''};wipI[sku][sz].ordered+=numP(r[c.wO]);if(r[c.wDC]&&!wipI[sku][sz].dc)wipI[sku][sz].dc=r[c.wDC]});

  A.skus={};
  ll.filter(r=>r[c.lSe]===A.activeSeason).forEach(r=>{
    const sku=r[c.lS],scale=r[c.lSS]||'',sizes=A.scaleSizes[scale]?[...A.scaleSizes[scale]]:[];
    const stCt=numP(r[c.lSn]),dtcBuy=numP(r[c.lDB]);
    const sI=invI[sku]||{},sS=salI[sku]||{},sW=wipI[sku]||{};
    let tOH=0,tSl=0,tWIP=0;const sd={};
    sizes.forEach(s=>{const oh=sI[s]||0,sl=sS[s]||0,wi=sW[s]||{ordered:0,dc:''};sd[s]={onHand:oh,sales:sl,wipOrd:wi.ordered,wipDC:wi.dc};tOH+=oh;tSl+=sl;tWIP+=wi.ordered});
    let sType=dtcBuy===0?'nosize':(tOH===0&&tSl===0?'initials':'cf');
    const div=r[c.lDp]||'',cat=r[c.lCa]||'',sub=r[c.lSc]||'',prog=r[c.lSD]||'',dm=r[c.lDM]||'';
    A.skus[sku]={
      sku,season:A.activeSeason,division:div,category:cat,subcategory:sub,
      style:r[c.lSt]||'',styleDescription:prog,
      colorCode:r[c.lCC]||'',colorDescription:r[c.lCD]||'',
      sizeScale:scale,sizeCount:A.scaleSizeCount[scale]||sizes.length,
      dtcBuy,storeCount:stCt,storeTier:r[c.lTr]||'',
      lifecycle:r[c.lLC]||'',commitCoding:r[c.lCm]||'',
      rollout:r[c.lRo]||'',pst:r[c.lPS]||'',deliveryMonth:dm,
      sizingType:sType,sizes,sizeData:sd,
      totalOH:tOH,totalSales:tSl,totalWIP:tWIP,skuSalesTotal:A.salSKU[sku]||0,
      _hk:{prog:'prog|'+div.toLowerCase()+'|'+cat.toLowerCase()+'|'+sub.toLowerCase()+'|'+prog.toLowerCase(),
           sub:'sub|'+div.toLowerCase()+'|'+cat.toLowerCase()+'|'+sub.toLowerCase(),
           cat:'cat|'+div.toLowerCase()+'|'+cat.toLowerCase(),
           div:'div|'+div.toLowerCase()}
    };
  });
}

// ═══ SIZE CURVE ═══
function buildCurve(rec){
  const eligible=new Set(rec.sizes),thresh=100*rec.sizeCount;
  const levels=[
    {key:rec._hk.prog,label:rec.styleDescription,level:'Program'},
    {key:rec._hk.sub,label:rec.subcategory,level:'Subcategory'},
    {key:rec._hk.cat,label:rec.category,level:'Category'},
    {key:rec._hk.div,label:rec.division,level:'Division'}
  ];
  const trail=[];
  for(const lv of levels){
    const sbs=A.hierSales[lv.key];
    if(!sbs){trail.push({...lv,total:0,thresh,pass:false});continue}
    let total=0;const filt={};for(const s in sbs){if(eligible.has(s)){filt[s]=sbs[s];total+=sbs[s]}}
    if(total>=thresh){trail.push({...lv,total,thresh,pass:true});const curve={};rec.sizes.forEach(s=>{curve[s]=total>0?(filt[s]||0)/total:1/rec.sizes.length});return{curve,level:lv.level+' ('+lv.label+')',total,trail}}
    trail.push({...lv,total,thresh,pass:false});
  }
  const curve={};rec.sizes.forEach(s=>{curve[s]=1/rec.sizes.length});return{curve,level:'Even distribution',total:0,trail};
}

function getPresMin(rec){
  const cfg=A.presMins[rec.sizeScale]||{};const fl={};
  rec.sizes.forEach(s=>{fl[s]=Math.ceil((cfg[s]!==undefined?cfg[s]:0)*rec.storeCount)});
  return fl;
}

function getPresMinRate(rec){
  const cfg=A.presMins[rec.sizeScale]||{};const r={};
  rec.sizes.forEach(s=>{r[s]=cfg[s]!==undefined?cfg[s]:0});return r;
}

function projBOP(rec){
  const w=deliveryToWeeks(rec.deliveryMonth,rec.season);const bop={};
  rec.sizes.forEach(s=>{const oh=rec.sizeData[s].onHand;const pending=rec.sizeData[s].wipOrd;const wr=rec.sizeData[s].sales/52;bop[s]=Math.max(0,Math.round(oh+pending-wr*w))});
  bop._w=w;return bop;
}

function computeAlloc(rec){
  if(!rec||rec.dtcBuy<=0||!rec.sizes.length)return null;
  const cr=buildCurve(rec),curve=cr.curve,pm=getPresMin(rec),pmRate=getPresMinRate(rec),pool=rec.dtcBuy;
  const ovr=A.overrides[rec.sku]||{},isCF=rec.sizingType==='cf';
  let bop={},wtr=0;
  if(isCF){const bp=projBOP(rec);wtr=bp._w;delete bp._w;bop=bp}
  const totalBOP=isCF?Object.values(bop).reduce((a,b)=>a+b,0):0;
  const totalTgt=totalBOP+pool;
  const ideal={},raw={};
  rec.sizes.forEach(s=>{ideal[s]=Math.round(curve[s]*totalTgt);raw[s]=isCF?Math.max(0,ideal[s]-bop[s]):Math.round(curve[s]*pool)});
  // Apply pres min floor
  const wf={};rec.sizes.forEach(s=>{wf[s]=Math.max(raw[s],pm[s])});
  const alloc={};const floorSum=Object.values(pm).reduce((a,b)=>a+b,0);const wfSum=Object.values(wf).reduce((a,b)=>a+b,0);
  if(wfSum<=pool){
    const rem=pool-floorSum;const above={};rec.sizes.forEach(s=>{above[s]=Math.max(0,raw[s]-pm[s])});
    const abSum=Object.values(above).reduce((a,b)=>a+b,0);
    rec.sizes.forEach(s=>{alloc[s]=pm[s]+(abSum>0&&rem>0?Math.round(above[s]/abSum*rem):0)});
  } else {rec.sizes.forEach(s=>{alloc[s]=Math.round(wf[s]/wfSum*pool)})}
  let hasOvr=false;rec.sizes.forEach(s=>{if(ovr[s]!==undefined){alloc[s]=ovr[s];hasOvr=true}});
  if(!hasOvr){const at=Object.values(alloc).reduce((a,b)=>a+b,0);if(at!==pool&&rec.sizes.length){const ms=rec.sizes.reduce((a,b)=>alloc[a]>=alloc[b]?a:b);alloc[ms]+=pool-at}}
  // Curve source sales
  const curveSales={};let acceptedKey=null;
  for(const t of cr.trail){if(t.pass){acceptedKey=t.key;break}}
  if(acceptedKey&&A.hierSales[acceptedKey]){const hs=A.hierSales[acceptedKey];rec.sizes.forEach(s=>{curveSales[s]=hs[s]||0})}
  else{rec.sizes.forEach(s=>{curveSales[s]=0})}
  return{alloc,curve,cr,pm,pmRate,bop:isCF?bop:null,wtr:isCF?wtr:null,ideal:isCF?ideal:null,pool,curveSales};
}

// ═══ NAV ═══
function goDetail(sku){A.selectedSKU=sku;A.view='detail';A.module=null;A.chartMetrics=null;render()}
function goGrid(){A.selectedSKU=null;A.view='grid';A.module=null;render()}
function goModule(m){A.module=m;document.getElementById('welcome').classList.add('hidden');document.getElementById('dash').classList.add('active');document.getElementById('slbl').textContent=A.activeSeason||'';render()}
function goBackFromModule(){A.module=null;if(!A.activeSeason){backToWelcome()}else{render()}}
function backToWelcome(){document.getElementById('dash').classList.remove('active');document.getElementById('welcome').classList.remove('hidden');A.activeSeason=null;A.view='grid';A.module=null;trySeasons()}
function setOvr(sku,sz,v){if(!A.overrides[sku])A.overrides[sku]={};A.overrides[sku][sz]=parseInt(v)||0;render()}
function clrOvr(sku){delete A.overrides[sku];render()}
function toggleAcc(sku){A.accepted[sku]?delete A.accepted[sku]:A.accepted[sku]=true;updateExpCt();render()}
function updateExpCt(){const n=Object.keys(A.accepted).length;const el=document.getElementById('exp-ct');if(el)el.textContent=n>0?n+' accepted':'';const btn=document.getElementById('exp-btn');if(btn)btn.disabled=n===0}

function exportCSV(){
  const acc=Object.keys(A.accepted);if(!acc.length)return;
  const lines=['Season Code,Sizing Type,SKU,Size,Quantity'];
  acc.forEach(sku=>{const r=A.skus[sku];if(!r||r.dtcBuy<=0)return;const res=computeAlloc(r);if(!res)return;
    const tl=r.sizingType==='initials'?'INITIALS':'CF';
    r.sizes.forEach(s=>{const q=res.alloc[s]||0;if(q>0)lines.push(A.activeSeason+','+tl+','+sku+','+s+','+q)})});
  const b=new Blob([lines.join('\n')],{type:'text/csv'});const u=URL.createObjectURL(b);
  const a=document.createElement('a');a.href=u;a.download='PO_Sizing_'+A.activeSeason+'.csv';a.click();URL.revokeObjectURL(u);
}
