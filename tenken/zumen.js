/* 樹木点検 — 台帳図面を見ながら入力する
   ・統合ハブで作った「点検データ（リスト＋図面）」(.json) を取り込むと、路線ごとの点検リストと台帳図面が入る
   ・図面の樹木をタップすると、その樹木の点検入力に切り替わる（リストの何番目かに飛ぶ）
   ・印の色：未点検＝橙の輪、良好＝緑、維持管理＝黄、外観診断が必要＝赤、空桝/桝無し＝灰、入力中＝青
   index.html の関数（listState, showListItem, routeKey, routeRecords, judgeOf …）をそのまま使う */
(function(){
"use strict";
const ZVER = 3;

/* ================= 保存（IndexedDB） ================= */
let zdbP = null;
function zdb(){
  if(!zdbP) zdbP = new Promise((res, rej)=>{
    const q = indexedDB.open("gj_zumen", 1);
    q.onupgradeneeded = ()=>{
      const d = q.result;
      if(!d.objectStoreNames.contains("routes")) d.createObjectStore("routes");
      if(!d.objectStoreNames.contains("imgs")) d.createObjectStore("imgs");
    };
    q.onsuccess = ()=> res(q.result);
    q.onerror = ()=> rej(q.error);
  });
  return zdbP;
}
async function zget(store, key){
  const d = await zdb();
  return new Promise((res, rej)=>{
    const r = d.transaction(store, "readonly").objectStore(store).get(key);
    r.onsuccess = ()=> res(r.result); r.onerror = ()=> rej(r.error);
  });
}
async function zput(store, key, val){
  const d = await zdb();
  return new Promise((res, rej)=>{
    const t = d.transaction(store, "readwrite");
    t.objectStore(store).put(val, key);
    t.oncomplete = ()=> res(); t.onerror = ()=> rej(t.error);
  });
}

/* ================= 画面の部品 ================= */
const css = document.createElement("style");
css.textContent = `
#zCard{padding:8px;display:none}
body.zOn #zCard{display:block}
.zBar{display:flex;gap:6px;align-items:center;margin-bottom:6px;flex-wrap:wrap}
.zBar select{flex:1;min-width:96px;font-size:15px;padding:7px 8px}
.zBar .miniBtn{padding:8px 9px}
#zView{position:relative;overflow:hidden;touch-action:none;background:#E9E8E2;border-radius:10px;height:42vh;min-height:260px}
#zStage{position:absolute;left:0;top:0;transform-origin:0 0}
#zImg{display:block;user-select:none;-webkit-user-drag:none;pointer-events:none}
#zMarks{position:absolute;inset:0;pointer-events:none;overflow:hidden}
.zmk{position:absolute;left:0;top:0;border-radius:50%;border:3px solid #E07B00;background:rgba(224,123,0,.10)}
.zmk.ok{border-color:#3B6D11;background:rgba(59,109,17,.45)}
.zmk.warn{border-color:#B07A00;background:rgba(240,190,40,.65)}
.zmk.ng{border-color:#C62828;background:rgba(198,40,40,.55)}
.zmk.none{border-color:#555;background:rgba(80,80,80,.45)}
.zmk.cur{border-color:#185FA5;border-width:4px;box-shadow:0 0 0 4px rgba(24,95,165,.35)}
.zmk.unsure{border-style:dashed}
.zmk.sel{border-color:#185FA5;border-width:4px;animation:zBlink .9s ease-in-out infinite alternate}
@keyframes zBlink{from{box-shadow:0 0 0 2px rgba(24,95,165,.25)}to{box-shadow:0 0 0 9px rgba(24,95,165,.55)}}
.zmk.added::before{content:"+";position:absolute;left:-7px;top:-9px;font-size:13px;font-weight:700;color:#3B6D11}
.zFlash{animation:zFl 1.2s ease-out}
@keyframes zFl{from{box-shadow:0 0 0 4px rgba(24,95,165,.7)}to{box-shadow:0 0 0 0 rgba(24,95,165,0)}}
.zmk.newpt{border-color:#3B6D11;border-style:dashed;background:rgba(59,109,17,.25)}
.ztag{position:absolute;left:0;top:0;font-size:11px;font-weight:600;color:#7a2a00;background:rgba(255,255,255,.78);padding:0 3px;border-radius:3px;white-space:nowrap}
#zLegend{position:absolute;left:6px;bottom:6px;background:rgba(255,255,255,.9);border-radius:8px;padding:4px 8px;font-size:11px;line-height:1.6;pointer-events:none}
#zLegend i{display:inline-block;width:11px;height:11px;border-radius:50%;border:2px solid;vertical-align:-1px;margin:0 3px 0 8px}
#zLegend i:first-child{margin-left:0}
#zEmpty{position:absolute;inset:0;display:none;align-items:center;justify-content:center;text-align:center;color:#6b6a64;font-size:13px;padding:20px}
#zChoose{display:none;position:absolute;z-index:6;background:#fff;border:1px solid #D8D6CC;border-radius:10px;box-shadow:0 6px 18px rgba(0,0,0,.2);padding:6px;max-height:60%;overflow:auto}
#zChoose button{display:block;width:100%;text-align:left;font-size:14px;padding:9px 12px;border:none;background:none;border-radius:7px;font-family:inherit}
#zChoose button:active{background:#E6F1FB}
#zShowBtn{display:none;margin:0 0 10px}
.zmk.moved::after{content:"";position:absolute;right:-4px;top:-4px;width:8px;height:8px;border-radius:50%;background:#185FA5;border:1px solid #fff}
#zFixBar{display:none;position:absolute;left:6px;right:6px;top:6px;z-index:7;background:#185FA5;color:#fff;border-radius:9px;padding:8px 10px;font-size:13px;align-items:center;gap:8px;flex-wrap:wrap}
body.zAdding #zFixBar{display:flex;background:#3B6D11}
body.zAdding #zView{outline:3px solid #3B6D11;cursor:crosshair}
#zFixBar input{font-size:15px;padding:6px 7px;border:none;border-radius:6px;width:76px;font-family:inherit}
#zFixBar input#zAddS{width:120px}
#zFixBar label{display:flex;align-items:center;gap:4px;white-space:nowrap}
#zAddBtn.on{background:#3B6D11;color:#fff;border-color:#3B6D11}
#zInpBtn.on{background:#5F5E5A;color:#fff;border-color:#5F5E5A}
#zFixBar b{font-size:14px}
#zFixBar button{background:#fff;color:#185FA5;border:none;border-radius:7px;padding:6px 10px;font-size:13px;font-weight:600;font-family:inherit}
body.zFixing #zFixBar{display:flex}
body.zFixing #zView{outline:3px solid #185FA5;cursor:crosshair}
#zFixBtn.on{background:#185FA5;color:#fff;border-color:#185FA5}
body.zHas:not(.zOn) #zShowBtn{display:block}
/* 入力を隠す：図面を大きく */
body.zOn.zNoInp #view-input > *:not(#zCard){display:none !important}
body.zOn.zNoInp #view-input{grid-template-columns:minmax(0,1fr) !important}
body.zOn.zNoInp #zCard{position:sticky !important;top:var(--zTop,120px) !important}
body.zOn.zNoInp #zView{height:calc(100vh - var(--zTop,120px) - 74px) !important}
/* iPad 横向き：図面を左、入力を右に並べる */
@media (min-width:1000px) and (orientation:landscape){
  body.zOn #view-input{display:grid;grid-template-columns:minmax(0,1.25fr) minmax(0,1fr);column-gap:14px;align-items:start}
  body.zOn #view-input > *{grid-column:2}
  body.zOn #zCard{grid-column:1;grid-row:1 / span 20;position:sticky;top:calc(var(--zTop,120px) + 6px);margin-bottom:0}
  body.zOn #zView{height:calc(100vh - var(--zTop,120px) - 74px)}
}
/* iPad 縦向き・スマホ：図面を上に固定して、その下で入力 */
@media not all and (min-width:1000px) and (orientation:landscape){
  body.zOn #zCard{position:sticky;top:var(--zTop,120px);z-index:5;box-shadow:0 4px 10px rgba(0,0,0,.08)}
  body.zOn #zView{height:34vh}
}
`;
document.head.appendChild(css);

const card = document.createElement("div");
card.id = "zCard"; card.className = "card";
card.innerHTML =
  '<div class="zBar">' +
    '<button type="button" class="miniBtn" id="zPrev">◀</button>' +
    '<select id="zSel"></select>' +
    '<button type="button" class="miniBtn" id="zNext">▶</button>' +
    '<button type="button" class="miniBtn" id="zFit">全体</button>' +
    '<button type="button" class="miniBtn" id="zRot">↻</button>' +
    '<button type="button" class="miniBtn" id="zFixBtn">位置を直す</button>' +
    '<button type="button" class="miniBtn" id="zAddBtn">＋樹木</button>' +
    '<button type="button" class="miniBtn" id="zInpBtn">入力を隠す</button>' +
    '<button type="button" class="miniBtn" id="zHide">図面を隠す</button>' +
  '</div>' +
  '<div id="zView"><div id="zStage"><img id="zImg" alt=""></div><div id="zMarks"></div>' +
  '<div id="zLegend"></div><div id="zEmpty"></div><div id="zChoose"></div><div id="zFixBar"></div></div>';
const showBtn = document.createElement("button");
showBtn.type = "button"; showBtn.id = "zShowBtn"; showBtn.className = "miniBtn pri";
showBtn.textContent = "🗺 図面を表示する";
const vi = document.getElementById("view-input");
vi.insertBefore(showBtn, vi.firstChild);
vi.insertBefore(card, vi.firstChild);

/* 取込ボタン（入力の設定の中） */
(function addImport(){
  const lp = document.getElementById("listPanel");
  const wrap = document.createElement("div");
  wrap.style.cssText = "margin:4px 0 12px;padding:10px;background:#F1F7F4;border-radius:10px";
  wrap.innerHTML = '<div class="rowFlex"><span style="font-size:14px;font-weight:600">点検データ（リスト＋台帳図面）</span>' +
    '<button type="button" class="miniBtn pri" id="zImpBtn">取り込む</button></div>' +
    '<p class="note" id="zImpNote">統合ハブの［樹木点検アプリ用データ］で作った .json を取り込むと、案件の全路線の点検リストと台帳図面が入ります。図面の樹木をタップして入力できます。</p>' +
    '<input type="file" id="zImpFile" accept=".json,application/json" style="display:none">';
  lp.parentNode.insertBefore(wrap, lp);
})();

const $z = id => document.getElementById(id);

/* ================= 状態 ================= */
const V = {s: 0, tx: 0, ty: 0, w: 0, h: 0, rot: 0};
let R = null;          // 今の路線の図面データ {drawings, pos}
let rKey = "";
let dz = "";           // 表示中の図面番号
let imgUrl = "";
let idxOf = new Map(); // "図面|桝|補助" → リストの何番目か
const opt = Object.assign({hide: false, noInp: false}, load("gj_zopt", {}));

function nz(z){ z = String(z == null ? "" : z).trim(); return /^\d+$/.test(z) ? String(parseInt(z, 10)) : z; }
function keyOf(z, m, h){ return nz(z) + "|" + String(m || "").trim() + "|" + String(h || "").trim(); }

function buildIndex(){
  idxOf = new Map();
  const st = listState();
  if(!st) return;
  st.items.forEach((it, i)=>{
    const b = it.base != null ? it.base : splitHojo(it.no).base;
    const h = it.base != null ? (it.hojo || "") : splitHojo(it.no).hojo;
    idxOf.set(keyOf(it.zumen, b, h), i);
  });
}
/* 現場で直した位置（路線ごと・樹木ごと）。{路線キー: {"図面|桝|補助": {z,x,y,m,h}}} */
let FIX = load("gj_zfix", {});
function fixesFor(){ return FIX[rKey] || {}; }
/* 図面上の位置の一覧（現場で直した位置があればそちらを使う。図面に無かった樹木も、置けば出る） */
function allPos(){
  if(!R) return [];
  const fx = fixesFor(), seen = new Set();
  const out = R.pos.map(p => {
    const k = keyOf(p.kz || p.z, p.m, p.h); seen.add(k);   // kz … 台帳の図面番号（隣の図面に描かれた樹木）
    const f = fx[k];
    return f ? {z: f.z, m: p.m, h: p.h, x: f.x, y: f.y, k, moved: true} : Object.assign({k}, p);
  });
  Object.keys(fx).forEach(k => { if(!seen.has(k)){ const f = fx[k]; out.push({z: f.z, m: f.m, h: f.h, x: f.x, y: f.y, k, moved: !f.add, added: !!f.add}); } });
  return out;
}
/* 現場で追加した樹木（図面・リストに無かった樹木）。点検データを取り込み直しても残すため別に持つ
   {路線キー: {"図面|桝|補助": {item: リストの1行, after: "直前の樹木のキー"}}} */
let ADD = load("gj_zadd", {});
function itemKey(it){
  const b = it.base != null ? it.base : splitHojo(it.no).base;
  const h = it.base != null ? (it.hojo || "") : splitHojo(it.no).hojo;
  return {k: keyOf(it.zumen, b, h), m: b, h};
}
function posOnDrawing(z){ return allPos().filter(p => nz(p.z) === nz(z)); }
function curItem(){ const st = listState(); return st && st.items[st.idx]; }

function statusOf(i, doneMap){
  const st = listState(); if(!st) return "";
  const it = st.items[i];
  const r = doneMap.get(it.no);
  if(!r) return "";
  const j = judgeOf(r.items || [], r.sp);
  if(isNoTree(r.sp)) return "none";
  if(j.indexOf("外観") > -1) return "ng";
  if(j.indexOf("維持") > -1) return "warn";
  return "ok";
}

/* ================= 路線の図面を読む ================= */
async function loadRoute(){
  const k = routeKey();
  if(k !== rKey){ if(fixing) setFixing(false); if(addMode) setAdding(false); }
  rKey = k;
  let d = null;
  try{ d = await zget("routes", k); }catch(e){ d = null; }
  if(k !== rKey) return;
  R = d || null;
  document.body.classList.toggle("zHas", !!(R && R.drawings && R.drawings.length));
  document.body.classList.toggle("zOn", !!(R && R.drawings && R.drawings.length) && !opt.hide);
  buildIndex();
  fillSel();
  if(!R || !R.drawings.length){ return; }
  const it = curItem();
  const z = it && R.drawings.some(x => nz(x.zumen) === nz(it.zumen)) ? it.zumen : R.drawings[0].zumen;
  await showDrawing(z, true);
  layoutTop();
}
function fillSel(){
  const sel = $z("zSel");
  sel.innerHTML = "";
  if(!R) return;
  R.drawings.forEach(d => {
    const n = posOnDrawing(d.zumen).length;
    const o = document.createElement("option");
    o.value = d.zumen; o.textContent = (d.label || d.zumen) + (n ? "（" + n + "本）" : "");
    sel.appendChild(o);
  });
  sel.value = dz;
}
let showTok = 0, pendingZ = "";
async function showDrawing(z, fit){
  if(!R) return;
  const d = R.drawings.find(x => nz(x.zumen) === nz(z));
  if(!d) return;
  // 続けて切り替えたとき、後から届いた古い図面の画像で上書きしない（画像と印の図面が食い違うとタップが効かなくなる）
  const tok = ++showTok;
  pendingZ = d.zumen;
  $z("zSel").value = d.zumen;
  hideChoose();
  const blob = await zget("imgs", rKey + "|" + d.zumen).catch(()=>null);
  if(tok !== showTok) return;
  pendingZ = "";
  if(nz(dz) !== nz(d.zumen)){ fixSel = null; addPt = null; updateBar(); }
  dz = d.zumen;
  if(imgUrl) URL.revokeObjectURL(imgUrl);
  imgUrl = blob ? URL.createObjectURL(blob) : "";
  const img = $z("zImg");
  V.w = d.w; V.h = d.h;
  img.style.width = d.w + "px"; img.style.height = d.h + "px";
  img.src = imgUrl;
  $z("zEmpty").style.display = blob ? "none" : "flex";
  $z("zEmpty").textContent = blob ? "" : "図面の画像がありません。点検データを取り込み直してください";
  if(fit || !V.s) fitView();
  applyView();
}

/* ================= 拡大・移動 ================= */
function vsize(){ const r = $z("zView").getBoundingClientRect(); return {w: r.width, h: r.height}; }
function rdim(){ return (V.rot % 180) ? {w: V.h, h: V.w} : {w: V.w, h: V.h}; }
function fitView(){
  const vs = vsize(), rd = rdim();
  if(!rd.w || !vs.w) return;
  V.s = Math.min(vs.w / rd.w, vs.h / rd.h) * 0.97;
  V.tx = vs.w / 2; V.ty = vs.h / 2;
}
function applyView(){
  $z("zStage").style.transform = "translate(" + V.tx + "px," + V.ty + "px) scale(" + V.s + ") rotate(" + V.rot + "deg) translate(" + (-V.w / 2) + "px," + (-V.h / 2) + "px)";
  schedule();
}
function toScreen(x, y){
  const dx = x - V.w / 2, dy = y - V.h / 2, a = V.rot * Math.PI / 180;
  return {x: V.tx + V.s * (dx * Math.cos(a) - dy * Math.sin(a)), y: V.ty + V.s * (dx * Math.sin(a) + dy * Math.cos(a))};
}
function toImage(sx, sy){
  const px = (sx - V.tx) / V.s, py = (sy - V.ty) / V.s, a = -V.rot * Math.PI / 180;
  return {x: px * Math.cos(a) - py * Math.sin(a) + V.w / 2, y: px * Math.sin(a) + py * Math.cos(a) + V.h / 2};
}
function zoomAt(sx, sy, f){
  const ns = Math.max(0.03, Math.min(4, V.s * f)), k = ns / V.s;
  V.tx = sx - (sx - V.tx) * k; V.ty = sy - (sy - V.ty) * k; V.s = ns;
  applyView();
}
function centerOnPos(p, minScale){
  const vs = vsize();
  if(minScale && V.s < minScale) V.s = minScale;
  const q = toScreen(p.x, p.y);
  V.tx += vs.w / 2 - q.x; V.ty += vs.h / 2 - q.y;
  applyView();
}

/* ================= 印 ================= */
let raf = 0;
function schedule(){
  if(raf) return;
  const run = ()=>{ if(!raf) return; cancelAnimationFrame(raf.a); clearTimeout(raf.b); raf = 0; renderMarks(); };
  raf = {a: requestAnimationFrame(run), b: setTimeout(run, 60)};
}
function markSize(){ return Math.max(14, Math.min(30, V.s * 40)); }
function renderMarks(){
  const box = $z("zMarks");
  if(!R || !dz){ box.innerHTML = ""; $z("zLegend").innerHTML = ""; return; }
  const st = listState();
  const done = new Map(routeRecords().map(r => [r.no, r]));
  const cur = st ? st.idx : -1;
  const d = markSize(), vs = vsize(), tags = V.s > 0.55;
  const cnt = {"": 0, ok: 0, warn: 0, ng: 0, none: 0};
  let html = "";
  const seen = new Map();   // 同じ位置に複数の樹木（1つの桝に数本）→ 少しずらして並べる
  posOnDrawing(dz).forEach(p => {
    const i = idxOf.get(p.k);
    if(i == null) return;
    const s = statusOf(i, done);
    cnt[s]++;
    if(p.u && !p.moved) cnt.u = (cnt.u || 0) + 1;
    const k = Math.round(p.x) + "," + Math.round(p.y);
    const n = seen.get(k) || 0; seen.set(k, n + 1);
    let q = toScreen(p.x, p.y);
    q = {x: q.x + n * (d * 0.75), y: q.y};
    if(q.x < -40 || q.y < -40 || q.x > vs.w + 40 || q.y > vs.h + 40) return;
    const isCur = i === cur && !fixing && !addMode, isSel = !!(fixSel && fixSel.k === p.k);
    const dd = (isCur || isSel) ? d + 8 : d;
    html += '<div class="zmk ' + s + (isCur ? " cur" : "") + (isSel ? " sel" : "") + (p.moved ? " moved" : "") +
            (p.added ? " added" : "") + (p.u && !p.moved ? " unsure" : "") +
            '" style="width:' + dd + 'px;height:' + dd + 'px;transform:translate(' + (q.x - dd / 2) + 'px,' + (q.y - dd / 2) + 'px)"></div>';
    if(tags || isCur || isSel){
      const it = st.items[i];
      const lbl = treeLabel(it, false);
      html += '<div class="ztag" style="transform:translate(' + (q.x + dd / 2) + 'px,' + (q.y - dd / 2 - 8) + 'px)">' + esc(lbl) + '</div>';
    }
  });
  if(addMode && addPt){
    const q = toScreen(addPt.x, addPt.y), dd = d + 6;
    html += '<div class="zmk newpt" style="width:' + dd + 'px;height:' + dd + 'px;transform:translate(' + (q.x - dd / 2) + 'px,' + (q.y - dd / 2) + 'px)"></div>';
  }
  box.innerHTML = html;
  $z("zLegend").innerHTML =
    '<i style="border-color:#E07B00"></i>未点検 ' + cnt[""] +
    '<i style="border-color:#3B6D11;background:rgba(59,109,17,.45)"></i>良好 ' + cnt.ok +
    '<i style="border-color:#B07A00;background:rgba(240,190,40,.65)"></i>維持管理 ' + cnt.warn +
    '<i style="border-color:#C62828;background:rgba(198,40,40,.55)"></i>要外観 ' + cnt.ng +
    (cnt.none ? '<i style="border-color:#555;background:rgba(80,80,80,.45)"></i>空桝等 ' + cnt.none : "") +
    (cnt.u ? '<i style="border-color:#E07B00;border-style:dashed"></i>位置未確定 ' + cnt.u : "");
}

/* 印・一覧に出す番号。「左27#2」（同じ桝の2本目）は「左27（2本目）」と書く。many … 同じ桝の樹木が並ぶ一覧 */
function treeLabel(it, many){
  const b = String(it.base != null ? it.base : it.no);
  const m = b.match(/^(.*)#(\d+)$/);
  let s = m ? m[1] : b;
  if(it.hojo) s += "-" + it.hojo;
  if(m) s += "（" + m[2] + "本目）";
  else if(many && !it.hojo) s += "（1本目）";
  return s;
}

/* タップした位置の近くの樹木（同じ桝の数本は一覧から選ぶ） */
function treesNear(sx, sy){
  if(!R) return [];
  const d = markSize(), lim = Math.max(22, d * 0.9);
  const out = [], seen = new Map();
  posOnDrawing(dz).forEach(p => {
    const i = idxOf.get(p.k); if(i == null) return;
    const k = Math.round(p.x) + "," + Math.round(p.y);
    const n = seen.get(k) || 0; seen.set(k, n + 1);
    const q = toScreen(p.x, p.y);
    const dist = Math.hypot(q.x + n * (d * 0.75) - sx, q.y - sy);
    if(dist <= lim + n * d * 0.75) out.push({i, dist, k, key: p.k});
  });
  return out.sort((a, b) => a.dist - b.dist);
}
/* 近くの樹木を1本に決める（数本あれば一覧から選ぶ）→ done(リストの何番目か) */
function chooseNear(sx, sy, done){
  const near = treesNear(sx, sy);
  if(!near.length) return false;
  const best = near[0].dist;
  // 同じ桝の樹木（同じ位置に並べた印）はまとめて選べるようにする
  const group = near.filter(x => x.k === near[0].k || x.dist <= best + 12);
  if(group.length === 1){ done(group[0].i); return true; }
  const st = listState(), recs = new Map(routeRecords().map(r => [r.no, r]));
  const baseOf = it => String(it.base != null ? it.base : it.no).replace(/#\d+$/, "");
  const bases = {};
  group.forEach(x => { const b = baseOf(st.items[x.i]); bases[b] = (bases[b] || 0) + 1; });
  const ch = $z("zChoose");
  ch.innerHTML = group.slice(0, 12).map(x => {
    const it = st.items[x.i];
    const s = statusOf(x.i, recs);
    const lab = {"": "未点検", ok: "良好", warn: "維持管理", ng: "要外観診断", none: "空桝等"}[s];
    return '<button data-i="' + x.i + '"><b>' + esc(treeLabel(it, bases[baseOf(it)] > 1)) + '</b>　' +
           esc(it.sp || "") + '　<small style="color:#6b6a64;white-space:nowrap">' + lab + '</small></button>';
  }).join("");
  const vs = vsize(), w = Math.min(280, vs.w - 12);
  ch.style.display = "block";
  ch.style.width = w + "px";
  ch.style.left = Math.max(6, Math.min(sx + 8, vs.w - w - 6)) + "px";
  ch.style.top = Math.max(6, Math.min(sy - 20, vs.h - 200)) + "px";
  ch.querySelectorAll("button").forEach(b => b.onclick = ev => { ev.stopPropagation(); hideChoose(); done(+b.dataset.i); });
  return true;
}
function tapAt(sx, sy){
  hideChoose();
  if(addMode){ placeAdd(sx, sy); return; }
  if(fixing){
    if(fixSel){ placeFix(sx, sy); return; }
    if(!chooseNear(sx, sy, i => selectFix(i))) toast("動かす樹木の印をタップしてください");
    return;
  }
  chooseNear(sx, sy, i => pick(i));
}
function hideChoose(){ $z("zChoose").style.display = "none"; }

/* ================= 位置を直す（続けて何本でも直せる。直すたびにiPadに保存） ================= */
let fixing = false, fixSel = null;
let addMode = false, addPt = null;
function setFixing(on){
  if(on && addMode) setAdding(false);
  fixing = on; fixSel = null;
  document.body.classList.toggle("zFixing", on);
  $z("zFixBtn").classList.toggle("on", on);
  if(on){
    // 入力中の樹木がこの図面にあれば、その樹木から直せるようにしておく
    const st = listState(), it = curItem();
    if(it && st){ const c = itemKey(it); if(posOnDrawing(dz).some(p => p.k === c.k)) selectFix(st.idx); }
  }
  updateBar(); schedule();
}
function selectFix(i){
  const st = listState(); if(!st) return;
  const it = st.items[i]; if(!it) return;
  fixSel = Object.assign({it, i}, itemKey(it));
  updateBar(); schedule();
}
function updateBar(){
  const bar = $z("zFixBar");
  document.body.classList.toggle("zAdding", addMode);
  if(addMode){
    if(!addPt){
      bar.innerHTML = '<span><b>樹木を追加</b>：図面・リストに無い樹木の位置をタップしてください</span><span style="flex:1"></span>' +
                      '<button type="button" data-a="addEnd">やめる</button>';
    } else {
      bar.innerHTML = '<label>桝No.<input id="zAddM" value="' + esc(addPt.m) + '"></label>' +
        '<label>樹木No.<input id="zAddH" value="' + esc(addPt.h) + '" placeholder="なし"></label>' +
        '<label>樹種<input id="zAddS" list="zSpList" value="' + esc(addPt.sp) + '"></label>' +
        '<datalist id="zSpList">' + spList().map(v => '<option value="' + esc(v) + '">').join("") + '</datalist>' +
        '<span style="flex:1"></span><button type="button" data-a="addOk">追加する</button><button type="button" data-a="addEnd">やめる</button>';
    }
  } else if(fixing){
    if(!fixSel){
      bar.innerHTML = '<span><b>位置を直す</b>：動かす樹木の印をタップ → 正しい位置をタップ（続けて直せます）</span><span style="flex:1"></span>' +
                      '<button type="button" data-a="fixEnd">終わる</button>';
    } else {
      const f = fixesFor()[fixSel.k];
      bar.innerHTML = '<span><b>' + esc(treeLabel(fixSel.it, false)) + '</b> の正しい位置をタップ（拡大すると正確です）</span><span style="flex:1"></span>' +
        (f && f.add ? '<button type="button" data-a="addDel">追加を取り消す</button>'
                    : (f ? '<button type="button" data-a="fixUndo">元の位置に戻す</button>' : '')) +
        '<button type="button" data-a="fixOther">別の樹木</button><button type="button" data-a="fixEnd">終わる</button>';
    }
  } else bar.innerHTML = "";
  bar.querySelectorAll("button[data-a]").forEach(b => b.onclick = ev => { ev.stopPropagation(); barAction(b.dataset.a); });
}
function barAction(a){
  if(a === "fixEnd") setFixing(false);
  else if(a === "fixOther"){ fixSel = null; updateBar(); schedule(); }
  else if(a === "fixUndo"){
    const f = FIX[rKey] || {}; delete f[fixSel.k]; FIX[rKey] = f; store("gj_zfix", FIX);
    toast(treeLabel(fixSel.it, false) + " を元の位置に戻しました");
    fixSel = null; updateBar(); schedule();
  }
  else if(a === "addDel") removeAdded(fixSel);
  else if(a === "addEnd") setAdding(false);
  else if(a === "addOk") commitAdd();
}
function placeFix(sx, sy){
  if(!fixSel) return;
  const ip = toImage(sx, sy);
  if(ip.x < 0 || ip.y < 0 || ip.x > V.w || ip.y > V.h){ toast("図面の中をタップしてください"); return; }
  const f = FIX[rKey] || {}, old = f[fixSel.k] || {};
  f[fixSel.k] = Object.assign({}, old, {z: dz, x: Math.round(ip.x * 10) / 10, y: Math.round(ip.y * 10) / 10, m: fixSel.m, h: fixSel.h, t: Date.now()});
  FIX[rKey] = f; store("gj_zfix", FIX);
  toast(treeLabel(fixSel.it, false) + " の位置を保存しました");
  fixSel = null; updateBar(); schedule();
}
$z("zFixBar").addEventListener("pointerdown", e => e.stopPropagation());

/* ================= 樹木を追加（図面・数量表に無い樹木） ================= */
function setAdding(on){
  if(on && fixing){ fixing = false; fixSel = null; document.body.classList.remove("zFixing"); $z("zFixBtn").classList.remove("on"); }
  addMode = on; addPt = null;
  $z("zAddBtn").classList.toggle("on", on);
  updateBar(); schedule();
}
function spList(){
  const st = listState(), s = new Set();
  if(st) st.items.forEach(it => { if(it.sp && !isNoTree(it.sp)) s.add(it.sp); });
  return [...s];
}
function placeAdd(sx, sy){
  const ip = toImage(sx, sy);
  if(ip.x < 0 || ip.y < 0 || ip.x > V.w || ip.y > V.h){ toast("図面の中をタップしてください"); return; }
  // いちばん近い樹木の桝番号・樹種を初めの値にする（樹木No.は、その桝の次の番号）
  const st = listState();
  let near = null, nd = 1e9;
  posOnDrawing(dz).forEach(p => {
    const d = Math.hypot(p.x - ip.x, p.y - ip.y);
    if(d < nd && idxOf.has(p.k)){ nd = d; near = p; }
  });
  let m = "", h = "", sp = "", ni = -1;
  if(near && st){
    ni = idxOf.get(near.k);
    const it = st.items[ni];
    m = String(it.base != null ? it.base : splitHojo(it.no).base).replace(/#\d+$/, "");
    sp = it.sp || "";
    const hs = st.items.filter(x => String(x.base != null ? x.base : "").replace(/#\d+$/, "") === m && x.hojo).map(x => x.hojo);
    h = hs.length ? (nextHojo(hs[hs.length - 1]) || "") : "1";
  }
  addPt = {x: Math.round(ip.x * 10) / 10, y: Math.round(ip.y * 10) / 10, m, h, sp, near: near ? near.k : "", ni};
  updateBar(); schedule();
}
function commitAdd(){
  const st = listState();
  if(!st || !addPt){ setAdding(false); return; }
  const m = $z("zAddM").value.trim(), h = $z("zAddH").value.trim(), sp = $z("zAddS").value.trim();
  if(!m){ toast("桝No.を入れてください"); return; }
  const near = addPt.ni >= 0 ? st.items[addPt.ni] : null;
  const zumen = near ? near.zumen : dz;
  const k = keyOf(zumen, m, h);
  if(idxOf.has(k)){ toast(m + (h ? "-" + h : "") + " はもうリストにあります。樹木No.を変えてください"); return; }
  const it = {no: "", base: m, hojo: h, sp, zumen, city: near ? near.city : "", town: near ? near.town : "",
              bikou: "現場で追加", girth: "", added: true, solo: false};
  it.no = composeNo(zumen, m, h, st.zumenKey);
  if(st.items.some(x => x.no === it.no)){ toast(it.no + " はもうリストにあります。樹木No.を変えてください"); return; }
  const at = addPt.ni >= 0 ? addPt.ni + 1 : st.items.length;
  // 同じ桝に樹木が増えたので、元の樹木を「枝番付きで保存されたら済」とみなさない
  st.items.forEach(x => { if(String(x.base != null ? x.base : x.no).replace(/#\d+$/, "") === m) x.solo = false; });
  st.items.splice(at, 0, it);
  if(st.idx >= at) st.idx++;
  store("gj_imports", imports);
  const f = FIX[rKey] || {};
  f[k] = {z: dz, x: addPt.x, y: addPt.y, m, h, t: Date.now(), add: 1};
  FIX[rKey] = f; store("gj_zfix", FIX);
  const a = ADD[rKey] || {};
  a[k] = {item: it, after: addPt.near};
  ADD[rKey] = a; store("gj_zadd", ADD);
  buildIndex();
  setAdding(false);
  fillSel();
  pick(at);
  toast(treeLabel(it, false) + " を追加しました。続けて点検を入力できます");
}
function removeAdded(sel){
  const st = listState(); if(!st || !sel) return;
  const it = st.items[sel.i];
  const saved = routeRecords().some(r => r.no === (it && it.no));
  if(!confirm(treeLabel(sel.it, false) + " の追加を取り消しますか？" + (saved ? "\n（入力した点検結果は消えません）" : ""))) return;
  if(it && it.added){
    st.items.splice(sel.i, 1);
    if(st.idx > sel.i) st.idx--;
    if(st.idx >= st.items.length) st.idx = st.items.length - 1;
    store("gj_imports", imports);
  }
  const f = FIX[rKey] || {}; delete f[sel.k]; store("gj_zfix", FIX);
  const a = ADD[rKey] || {}; delete a[sel.k]; store("gj_zadd", ADD);
  fixSel = null; buildIndex(); updateBar(); schedule(); fillSel();
  toast("追加を取り消しました");
}

/* リストのその樹木を入力欄に出す */
function pick(i){
  if(getMode() !== "list"){ modes[routeKey()] = "list"; store("gj_modes", modes); updateModeUI(); }
  if(insertMode){ insertMode = false; $("insertBanner").style.display = "none"; }
  showListItem(i);
  const st = listState(), it = st && st.items[i];
  if(document.body.classList.contains("zNoInp")){
    if(it) toast(treeLabel(it, false) + "（" + (it.sp || "") + "）を選びました。［入力を表示］で入力できます");
  } else revealInput();
}
/* 入力欄の樹木番号が画面に見えるようにする（入力欄を下までスクロールしていた場合など） */
function revealInput(){
  const el = document.getElementById("listInfo") && document.getElementById("listInfo").classList.contains("show")
           ? document.getElementById("listInfo") : document.getElementById("tno");
  if(!el) return;
  const r = el.getBoundingClientRect();
  const top = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--zTop")) || 120;
  const wide = window.matchMedia("(min-width:1000px) and (orientation:landscape)").matches;
  const minY = wide ? top + 8 : $z("zCard").getBoundingClientRect().bottom + 8;
  if(r.top < minY || r.bottom > window.innerHeight - 20) window.scrollBy({top: r.top - minY - 70, behavior: "smooth"});
  el.classList.remove("zFlash"); void el.offsetWidth; el.classList.add("zFlash");
}

/* 入力中の樹木が見えるように（別の図面なら切り替える） */
async function sync(){
  if(!R) return;
  const it = curItem(); if(!it) { schedule(); return; }
  const b = it.base != null ? it.base : splitHojo(it.no).base;
  const p = allPos().find(x => x.k === keyOf(it.zumen, b, it.hojo || ""));
  if(!p){ schedule(); return; }
  if(nz(p.z) !== nz(dz)) await showDrawing(p.z, false);
  const q = toScreen(p.x, p.y), vs = vsize(), m = 50;
  if(q.x < m || q.y < m || q.x > vs.w - m || q.y > vs.h - m) centerOnPos(p, null);
  else schedule();
}

/* ================= 指の操作（1本指で移動、2本指で拡大、タップで選択） ================= */
const view = $z("zView");
const ptrs = new Map();
let gest = null, lastTap = {t: 0, x: 0, y: 0};
function vpos(e){ const r = view.getBoundingClientRect(); return {x: e.clientX - r.left, y: e.clientY - r.top}; }
view.addEventListener("pointerdown", e => {
  if(e.target.closest("#zChoose")) return;
  if(e.isPrimary) ptrs.clear();           // 離した通知が抜けて残った指を消す
  try{ view.setPointerCapture(e.pointerId); }catch(_){}
  ptrs.set(e.pointerId, vpos(e));
  if(ptrs.size === 1){
    const p = vpos(e);
    gest = {mode: "pan", sx: p.x, sy: p.y, lx: p.x, ly: p.y, moved: false, multi: false};
  } else if(ptrs.size === 2){
    const [a, b] = [...ptrs.values()];
    gest = {mode: "pinch", d0: Math.hypot(a.x - b.x, a.y - b.y), s0: V.s,
            m0: {x: (a.x + b.x) / 2, y: (a.y + b.y) / 2}, t0x: V.tx, t0y: V.ty, multi: true, moved: true};
  }
});
view.addEventListener("pointermove", e => {
  if(!ptrs.has(e.pointerId) || !gest) return;
  ptrs.set(e.pointerId, vpos(e));
  if(gest.mode === "pan" && ptrs.size === 1){
    const p = vpos(e);
    if(!gest.moved && Math.hypot(p.x - gest.sx, p.y - gest.sy) > 8) gest.moved = true;
    if(gest.moved){ V.tx += p.x - gest.lx; V.ty += p.y - gest.ly; applyView(); }
    gest.lx = p.x; gest.ly = p.y;
  } else if(gest.mode === "pinch" && ptrs.size >= 2){
    const [a, b] = [...ptrs.values()];
    const d = Math.hypot(a.x - b.x, a.y - b.y), m = {x: (a.x + b.x) / 2, y: (a.y + b.y) / 2};
    const ns = Math.max(0.03, Math.min(4, gest.s0 * d / gest.d0));
    const px = (gest.m0.x - gest.t0x) / gest.s0, py = (gest.m0.y - gest.t0y) / gest.s0;
    V.s = ns; V.tx = m.x - ns * px; V.ty = m.y - ns * py;
    applyView();
  }
});
function ptrEnd(e){
  if(!ptrs.has(e.pointerId)) return;
  ptrs.delete(e.pointerId);
  if(!gest) return;
  if(gest.mode === "pinch"){
    if(ptrs.size === 1){ const p = [...ptrs.values()][0]; gest = {mode: "pan", sx: p.x, sy: p.y, lx: p.x, ly: p.y, moved: true, multi: true}; }
    else if(!ptrs.size) gest = null;
    return;
  }
  if(ptrs.size) return;
  const g = gest; gest = null;
  if(g.moved || g.multi || e.type === "pointercancel") return;
  const now = Date.now();
  if(now - lastTap.t < 300 && Math.hypot(g.sx - lastTap.x, g.sy - lastTap.y) < 30){ lastTap.t = 0; zoomAt(g.sx, g.sy, 2); return; }
  lastTap = {t: now, x: g.sx, y: g.sy};
  tapAt(g.sx, g.sy);
}
view.addEventListener("pointerup", ptrEnd);
view.addEventListener("pointercancel", ptrEnd);
view.addEventListener("lostpointercapture", ptrEnd);
let touchN = 0;
["touchstart", "touchend", "touchcancel"].forEach(t => document.addEventListener(t, e => {
  touchN = e.touches.length;
  if(t !== "touchstart" && !touchN) setTimeout(()=>{ if(!touchN && ptrs.size){ ptrs.clear(); gest = null; } }, 120);
}, {capture: true, passive: true}));
view.addEventListener("wheel", e => { e.preventDefault(); const p = vpos(e); zoomAt(p.x, p.y, Math.exp(-e.deltaY * 0.0015)); }, {passive: false});

/* ================= ボタン ================= */
$z("zSel").onchange = ()=> showDrawing($z("zSel").value, true);
function stepDrawing(k){
  if(!R) return;
  const i = R.drawings.findIndex(x => nz(x.zumen) === nz(pendingZ || dz));
  const j = Math.max(0, Math.min(R.drawings.length - 1, i + k));
  if(j !== i) showDrawing(R.drawings[j].zumen, true);
}
$z("zPrev").onclick = ()=> stepDrawing(-1);
$z("zNext").onclick = ()=> stepDrawing(1);
$z("zFit").onclick = ()=>{ fitView(); applyView(); };
$z("zRot").onclick = ()=>{ V.rot = (V.rot + 90) % 360; fitView(); applyView(); };
$z("zFixBtn").onclick = ()=> setFixing(!fixing);
$z("zAddBtn").onclick = ()=>{
  if(!listState()){ toast("先に点検データを取り込んでください"); return; }
  setAdding(!addMode);
};
/* 右（縦向きは下）の入力を隠して図面を大きく見る */
function applyInp(){
  document.body.classList.toggle("zNoInp", !!opt.noInp);
  $z("zInpBtn").textContent = opt.noInp ? "入力を表示" : "入力を隠す";
  $z("zInpBtn").classList.toggle("on", !!opt.noInp);
}
$z("zInpBtn").onclick = ()=>{
  opt.noInp = !opt.noInp; store("gj_zopt", opt); applyInp();
  layoutTop();
  setTimeout(()=>{ fitView(); applyView(); sync(); if(!opt.noInp) revealInput(); }, 60);
};
applyInp();
$z("zHide").onclick = ()=>{ opt.hide = true; store("gj_zopt", opt); document.body.classList.remove("zOn"); };
showBtn.onclick = ()=>{ opt.hide = false; store("gj_zopt", opt); document.body.classList.add("zOn"); layoutTop(); setTimeout(()=>{ fitView(); applyView(); sync(); }, 50); };

/* ヘッダーの下に図面を固定するため、ヘッダーの高さを測る */
function layoutTop(){
  const hd = document.querySelector("header");
  const bar = document.getElementById("sysBar");
  const h = (hd ? hd.getBoundingClientRect().height : 90) + (bar ? bar.getBoundingClientRect().height : 0);
  document.documentElement.style.setProperty("--zTop", Math.round(h) + "px");
}
let rsT = 0, lastW = window.innerWidth;
// iPad では文字入力のキーボードやスクロールでも resize が来る。幅が変わったとき（回転）だけ全体表示に戻す
window.addEventListener("resize", ()=>{ clearTimeout(rsT); rsT = setTimeout(()=>{
  layoutTop();
  if(Math.abs(window.innerWidth - lastW) > 40){ lastW = window.innerWidth; fitView(); }
  applyView();
}, 150); });

/* ================= 取込 ================= */
$z("zImpBtn").onclick = ()=> $z("zImpFile").click();
$z("zImpFile").addEventListener("change", async e => {
  const f = e.target.files[0]; e.target.value = "";
  if(!f) return;
  try{ await importPack(f); }catch(err){ alert("取り込めませんでした\n" + err.message); }
});
async function importPack(f){
  toast("読み込んでいます…");
  const data = JSON.parse(await f.text());
  if(data.type !== "gairoju-tenken-pack") throw new Error("樹木点検アプリ用の点検データではありません");
  const proj = (window.SysProject && SysProject.current()) || null;
  const office = (proj && proj.office) || data.office || $("office").value.trim();
  if(!office) throw new Error("点検事務所が分かりません。基本設定で点検事務所を入れてから取り込んでください");
  const n = data.routes.reduce((a, r) => a + r.items.length, 0);
  const nd = data.routes.reduce((a, r) => a + r.drawings.length, 0);
  const had = data.routes.filter(r => imports[office + "|" + r.name]).map(r => r.name);
  if(!confirm(data.name + "\n" + data.routes.length + "路線・" + n + "本の点検リストと、台帳図面 " + nd + "枚を取り込みます。" +
              (had.length ? "\n\n次の路線は点検リストを入れ替えます（保存済みの点検結果は消えません）：\n" + had.join("\n") : ""))) return;
  for(const r of data.routes){
    const key = office + "|" + r.name;
    // 点検リスト（Excel/CSVのリスト取込と同じ形にする）
    const items = r.items.map(o => {
      const base = String(o.masu || "").trim(), hojo = String(o.hojo || "").trim();
      return {no: hojo && !base.endsWith("-" + hojo) ? base + "-" + hojo : base, base, hojo,
              sp: o.sp || "", zumen: o.zumen || "", city: o.city || "", town: o.town || "",
              bikou: o.bikou || "", girth: o.girth || ""};
    });
    // 現場で追加した樹木は、取り込み直しても残す（リストに同じ番号が入っていれば、そちらを使う）
    const adds = ADD[key] || {};
    Object.keys(adds).forEach(k => {
      const a = adds[k], it0 = a.item;
      if(items.some(x => keyOf(x.zumen, x.base, x.hojo) === k)){ delete adds[k]; return; }
      const j = items.findIndex(x => keyOf(x.zumen, x.base, x.hojo) === a.after);
      const it = {no: "", base: it0.base, hojo: it0.hojo, sp: it0.sp, zumen: it0.zumen, city: it0.city, town: it0.town,
                  bikou: it0.bikou || "現場で追加", girth: "", added: true};
      if(j >= 0) items.splice(j + 1, 0, it); else items.push(it);
    });
    store("gj_zadd", ADD);
    const zk = detectZumenKey(items);
    const cnt = {};
    items.forEach(it => { const b = it.base || it.no; cnt[b] = (cnt[b] || 0) + 1; });
    const addBase = new Set(items.filter(x => x.added).map(x => x.base));
    items.forEach(it => { it.no = composeNo(it.zumen, it.base, it.hojo, zk); it.solo = !it.added && !addBase.has(it.base) && !it.hojo && cnt[it.base || it.no] === 1; });
    imports[key] = {items, idx: 0, zumenKey: zk};
    modes[key] = "list";
    // 図面
    for(const d of r.drawings){
      const blob = await (await fetch(d.img)).blob();
      await zput("imgs", key + "|" + d.zumen, blob);
    }
    await zput("routes", key, {name: data.name, created: data.created, ver: ZVER,
      drawings: r.drawings.map(d => ({zumen: d.zumen, label: d.label, w: d.w, h: d.h})), pos: r.pos});
    if(recents.route.indexOf(r.name) < 0) recents.route.push(r.name);
  }
  store("gj_imports", imports); store("gj_modes", modes); store("gj_recents", recents);
  // 今の路線が取り込んだ中に無ければ、最初の路線にする
  const names = data.routes.map(r => r.name);
  $("office").value = office;
  if(names.indexOf($("route").value.trim()) < 0) $("route").value = names[0];
  routeChanged();
  toast(data.routes.length + "路線・" + n + "本を取り込みました。図面の樹木をタップして入力できます");
}

/* ================= 既存の処理につなぐ ================= */
const _show = window.showListItem;
window.showListItem = function(i){ _show(i); if(fixing) setFixing(false); sync(); };
const _save = window.saveAndMove;
window.saveAndMove = function(m){ _save(m); schedule(); };
const _route = window.routeChanged;
window.routeChanged = function(){
  _route(); loadRoute();
  // 案件ごとに最後に使った路線を覚える（案件を切り替えて戻ったときに使う）
  try{
    const p = window.SysProject && SysProject.current(), v = $("route").value.trim();
    if(p && v){ const lp = load("gj_last_p", {}); lp[p.id] = v; store("gj_last_p", lp); }
  }catch(e){}
};
const _import = window.applyImport;
window.applyImport = function(items){ _import(items); buildIndex(); schedule(); };

// 点検事務所・路線名の欄は元の routeChanged を直接呼ぶので、こちらでも変化を拾う
$("office").addEventListener("change", ()=> loadRoute());
$("route").addEventListener("change", ()=> loadRoute());

window.SysZumen = {VERSION: ZVER, reload: loadRoute, sync};
layoutTop();
loadRoute().then(()=> sync());
})();
