/* 樹木点検 — 台帳図面を見ながら入力する
   ・統合ハブで作った「点検データ（リスト＋図面）」(.json) を取り込むと、路線ごとの点検リストと台帳図面が入る
   ・図面の樹木をタップすると、その樹木の点検入力に切り替わる（リストの何番目かに飛ぶ）
   ・印の色：未点検＝橙の輪、良好＝緑、維持管理＝黄、外観診断が必要＝赤、空桝/桝無し＝灰、入力中＝青
   index.html の関数（listState, showListItem, routeKey, routeRecords, judgeOf …）をそのまま使う */
(function(){
"use strict";
const ZVER = 1;

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
.zBar select{flex:1;min-width:120px;font-size:15px;padding:7px 8px}
.zBar .miniBtn{padding:8px 11px}
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
.ztag{position:absolute;left:0;top:0;font-size:11px;font-weight:600;color:#7a2a00;background:rgba(255,255,255,.78);padding:0 3px;border-radius:3px;white-space:nowrap}
#zLegend{position:absolute;left:6px;bottom:6px;background:rgba(255,255,255,.9);border-radius:8px;padding:4px 8px;font-size:11px;line-height:1.6;pointer-events:none}
#zLegend i{display:inline-block;width:11px;height:11px;border-radius:50%;border:2px solid;vertical-align:-1px;margin:0 3px 0 8px}
#zLegend i:first-child{margin-left:0}
#zEmpty{position:absolute;inset:0;display:none;align-items:center;justify-content:center;text-align:center;color:#6b6a64;font-size:13px;padding:20px}
#zChoose{display:none;position:absolute;z-index:6;background:#fff;border:1px solid #D8D6CC;border-radius:10px;box-shadow:0 6px 18px rgba(0,0,0,.2);padding:6px;max-height:60%;overflow:auto}
#zChoose button{display:block;width:100%;text-align:left;font-size:14px;padding:9px 12px;border:none;background:none;border-radius:7px;font-family:inherit}
#zChoose button:active{background:#E6F1FB}
#zShowBtn{display:none;margin:0 0 10px}
body.zHas:not(.zOn) #zShowBtn{display:block}
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
    '<button type="button" class="miniBtn" id="zHide">隠す</button>' +
  '</div>' +
  '<div id="zView"><div id="zStage"><img id="zImg" alt=""></div><div id="zMarks"></div>' +
  '<div id="zLegend"></div><div id="zEmpty"></div><div id="zChoose"></div></div>';
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
const opt = Object.assign({hide: false}, load("gj_zopt", {}));

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
function posOnDrawing(z){ return R ? R.pos.filter(p => nz(p.z) === nz(z)) : []; }
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
async function showDrawing(z, fit){
  if(!R) return;
  const d = R.drawings.find(x => nz(x.zumen) === nz(z));
  if(!d) return;
  dz = d.zumen;
  $z("zSel").value = dz;
  const blob = await zget("imgs", rKey + "|" + d.zumen).catch(()=>null);
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
    const i = idxOf.get(keyOf(p.z, p.m, p.h));
    if(i == null) return;
    const s = statusOf(i, done);
    cnt[s]++;
    const k = Math.round(p.x) + "," + Math.round(p.y);
    const n = seen.get(k) || 0; seen.set(k, n + 1);
    let q = toScreen(p.x, p.y);
    q = {x: q.x + n * (d * 0.75), y: q.y};
    if(q.x < -40 || q.y < -40 || q.x > vs.w + 40 || q.y > vs.h + 40) return;
    const isCur = i === cur;
    const dd = isCur ? d + 8 : d;
    html += '<div class="zmk ' + s + (isCur ? " cur" : "") + '" style="width:' + dd + 'px;height:' + dd + 'px;transform:translate(' + (q.x - dd / 2) + 'px,' + (q.y - dd / 2) + 'px)"></div>';
    if(tags || isCur){
      const it = st.items[i];
      const lbl = treeLabel(it, false);
      html += '<div class="ztag" style="transform:translate(' + (q.x + dd / 2) + 'px,' + (q.y - dd / 2 - 8) + 'px)">' + esc(lbl) + '</div>';
    }
  });
  box.innerHTML = html;
  $z("zLegend").innerHTML =
    '<i style="border-color:#E07B00"></i>未点検 ' + cnt[""] +
    '<i style="border-color:#3B6D11;background:rgba(59,109,17,.45)"></i>良好 ' + cnt.ok +
    '<i style="border-color:#B07A00;background:rgba(240,190,40,.65)"></i>維持管理 ' + cnt.warn +
    '<i style="border-color:#C62828;background:rgba(198,40,40,.55)"></i>要外観 ' + cnt.ng +
    (cnt.none ? '<i style="border-color:#555;background:rgba(80,80,80,.45)"></i>空桝等 ' + cnt.none : "");
}

/* 印・一覧に出す番号。「左27#2」（同じ桝の2本目）は「左27（2本目）」と書く */
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
    const i = idxOf.get(keyOf(p.z, p.m, p.h)); if(i == null) return;
    const k = Math.round(p.x) + "," + Math.round(p.y);
    const n = seen.get(k) || 0; seen.set(k, n + 1);
    const q = toScreen(p.x, p.y);
    const dist = Math.hypot(q.x + n * (d * 0.75) - sx, q.y - sy);
    if(dist <= lim + n * d * 0.75) out.push({i, dist, k});
  });
  return out.sort((a, b) => a.dist - b.dist);
}
function tapAt(sx, sy){
  hideChoose();
  const near = treesNear(sx, sy);
  if(!near.length) return;
  const best = near[0].dist;
  // 同じ桝の樹木（同じ位置に並べた印）はまとめて選べるようにする
  const group = near.filter(x => x.k === near[0].k || x.dist <= best + 12);
  if(group.length === 1){ pick(group[0].i); return; }
  const st = listState(), done = new Map(routeRecords().map(r => [r.no, r]));
  const ch = $z("zChoose");
  ch.innerHTML = group.slice(0, 12).map(x => {
    const it = st.items[x.i];
    const s = statusOf(x.i, done);
    const lab = {"": "未点検", ok: "良好", warn: "維持管理", ng: "要外観診断", none: "空桝等"}[s];
    return '<button data-i="' + x.i + '"><b>' + esc(treeLabel(it, group.length > 1)) + '</b>　' +
           esc(it.sp || "") + '　<small style="color:#6b6a64">' + lab + '</small></button>';
  }).join("");
  const vs = vsize();
  ch.style.display = "block";
  ch.style.left = Math.min(sx + 8, vs.w - 230) + "px";
  ch.style.top = Math.max(6, Math.min(sy - 20, vs.h - 200)) + "px";
  ch.style.width = "220px";
  ch.querySelectorAll("button").forEach(b => b.onclick = ev => { ev.stopPropagation(); hideChoose(); pick(+b.dataset.i); });
}
function hideChoose(){ $z("zChoose").style.display = "none"; }

/* リストのその樹木を入力欄に出す */
function pick(i){
  if(getMode() !== "list"){ modes[routeKey()] = "list"; store("gj_modes", modes); updateModeUI(); }
  if(insertMode){ insertMode = false; $("insertBanner").style.display = "none"; }
  showListItem(i);
}

/* 入力中の樹木が見えるように（別の図面なら切り替える） */
async function sync(){
  if(!R) return;
  const it = curItem(); if(!it) { schedule(); return; }
  const b = it.base != null ? it.base : splitHojo(it.no).base;
  const p = R.pos.find(x => keyOf(x.z, x.m, x.h) === keyOf(it.zumen, b, it.hojo || ""));
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
  const i = R.drawings.findIndex(x => nz(x.zumen) === nz(dz));
  const j = Math.max(0, Math.min(R.drawings.length - 1, i + k));
  if(j !== i) showDrawing(R.drawings[j].zumen, true);
}
$z("zPrev").onclick = ()=> stepDrawing(-1);
$z("zNext").onclick = ()=> stepDrawing(1);
$z("zFit").onclick = ()=>{ fitView(); applyView(); };
$z("zRot").onclick = ()=>{ V.rot = (V.rot + 90) % 360; fitView(); applyView(); };
$z("zHide").onclick = ()=>{ opt.hide = true; store("gj_zopt", opt); document.body.classList.remove("zOn"); };
showBtn.onclick = ()=>{ opt.hide = false; store("gj_zopt", opt); document.body.classList.add("zOn"); layoutTop(); setTimeout(()=>{ fitView(); applyView(); sync(); }, 50); };

/* ヘッダーの下に図面を固定するため、ヘッダーの高さを測る */
function layoutTop(){
  const hd = document.querySelector("header");
  const bar = document.getElementById("sysBar");
  const h = (hd ? hd.getBoundingClientRect().height : 90) + (bar ? bar.getBoundingClientRect().height : 0);
  document.documentElement.style.setProperty("--zTop", Math.round(h) + "px");
}
let rsT = 0;
window.addEventListener("resize", ()=>{ clearTimeout(rsT); rsT = setTimeout(()=>{ layoutTop(); fitView(); applyView(); }, 150); });

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
    const zk = detectZumenKey(items);
    const cnt = {};
    items.forEach(it => { const b = it.base || it.no; cnt[b] = (cnt[b] || 0) + 1; });
    items.forEach(it => { it.no = composeNo(it.zumen, it.base, it.hojo, zk); it.solo = !it.hojo && cnt[it.base || it.no] === 1; });
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
window.showListItem = function(i){ _show(i); sync(); };
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
