/* 全データのバックアップ・復元（ランチャー・樹木点検・外観診断・事前調査で共通）
   ・このアプリから見えるデータを全部まとめてZIPにする：localStorage（点検記録・事前調査の結果・設定など）と
     IndexedDB（写真・台帳図面・事前調査の図面など）。iPadのホーム画面に別々に追加したアプリは、データの置き場所が
     分かれていることがあるので、使っているアプリそれぞれで書き出す
   ・写真が多いときは約100MBずつのZIPに分ける。iPadの共有は1回押すごとに1回しか開けないので、［保存する］を1個ずつ押す
   ・［復元する］でZIPを全部選ぶと、このアプリのデータをバックアップの内容に置き換える
   ・使い方：<div id="sysBackup" data-app="樹木点検"></div> を置いて、このファイルを読み込む */
(function(){
"use strict";
const BK_VER = 1, PART_MAX = 100 * 1048576;
const KNOWN_DBS = ["gj_photos", "gj_zumen", "gk_photos", "jizen"];   // indexedDB.databases() が使えないとき

/* ---------- 画面 ---------- */
const css = document.createElement("style");
css.textContent = `
.sbk{font-size:14px;line-height:1.6}
.sbk p{margin:0 0 8px}
.sbk .sbkNote{font-size:12px;color:#6b6a64}
.sbk .sbkRow{display:flex;gap:8px;flex-wrap:wrap;margin:8px 0}
.sbk button{min-height:44px;padding:8px 14px;border-radius:10px;border:1px solid #0F6E56;background:#fff;color:#0F6E56;font-size:15px;font-weight:600;font-family:inherit}
.sbk button.pri{background:#0F6E56;color:#fff}
.sbk button:disabled{opacity:.5}
.sbk label{display:flex;align-items:center;gap:6px;font-size:14px}
.sbk label input{width:auto}
.sbkPart{display:flex;align-items:center;gap:10px;padding:8px 0;border-top:1px solid #D8D6CC}
.sbkPart div{flex:1;font-size:13px}
.sbkPart button{min-width:110px}
.sbkPart button.done{border-color:#3B6D11;color:#3B6D11;background:#EAF3DE}
.sbkMsg{font-size:13px;font-weight:600;color:#185FA5;margin-top:6px;white-space:pre-line}`;
document.head.appendChild(css);

function mount(box){
  const app = box.dataset.app || "アプリ";
  box.classList.add("sbk");
  box.innerHTML =
    '<p>このアプリに入っているデータ（点検記録・写真・台帳図面・事前調査の結果・設定など）を、まとめてZIPに書き出します。' +
    'iPadのデータが消えた・iPadを替えたときは［復元する］で元に戻せます。</p>' +
    '<label><input type="checkbox" class="sbkPh" checked> 写真も入れる（多いとZIPが何個かに分かれます）</label>' +
    '<div class="sbkRow"><button type="button" class="pri sbkMake">バックアップを作る</button>' +
    '<button type="button" class="sbkRest">復元する</button>' +
    '<input type="file" class="sbkFile" accept=".zip,application/zip" multiple style="display:none"></div>' +
    '<div class="sbkMsg"></div><div class="sbkParts"></div>' +
    '<p class="sbkNote">保存先は「ファイル」→ OneDrive の「街路樹診断システム」の中の、写真ZIP（iPadから）とは別のフォルダ（例：iPadバックアップ）にしてください。' +
    'ホーム画面に別々に追加したアプリ（樹木点検・事前調査など）は、それぞれのアプリで書き出してください。</p>';
  const q = s => box.querySelector(s);
  const msg = t => { q(".sbkMsg").textContent = t || ""; };
  q(".sbkMake").onclick = () => makeBackup(app, q(".sbkPh").checked, q(".sbkParts"), msg, q(".sbkMake"));
  q(".sbkRest").onclick = () => q(".sbkFile").click();
  q(".sbkFile").addEventListener("change", e => {
    const fs = [...e.target.files]; e.target.value = "";
    if(fs.length) restore(fs, msg);
  });
}

/* ---------- ZIP（無圧縮）を作る ---------- */
const CRC_T = (() => { const t = new Uint32Array(256);
  for(let n = 0; n < 256; n++){ let c = n; for(let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t; })();
function crc32(d){ let c = 0xFFFFFFFF; for(let i = 0; i < d.length; i++) c = CRC_T[(c ^ d[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
async function makeZip(files){        // files: [{name, blob}]
  const enc = new TextEncoder(), parts = [], central = [];
  let offset = 0;
  for(const f of files){
    const data = new Uint8Array(await f.blob.arrayBuffer());
    const nb = enc.encode(f.name), crc = crc32(data);
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true);
    lh.setUint32(14, crc, true); lh.setUint32(18, data.length, true); lh.setUint32(22, data.length, true);
    lh.setUint16(26, nb.length, true);
    parts.push(lh.buffer, nb, data);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true);
    ch.setUint32(16, crc, true); ch.setUint32(20, data.length, true); ch.setUint32(24, data.length, true);
    ch.setUint16(28, nb.length, true); ch.setUint32(42, offset, true);
    central.push(ch.buffer, nb);
    offset += 30 + nb.length + data.length;
  }
  const cSize = central.reduce((s, b) => s + b.byteLength, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
  end.setUint32(12, cSize, true); end.setUint32(16, offset, true);
  return new Blob([...parts, ...central, end.buffer], {type: "application/zip"});
}
/* ---------- ZIPを読む（このファイルで作った無圧縮ZIP。中身は必要な所だけ切り出す） ---------- */
async function readZip(file){
  const tail = new Uint8Array(await file.slice(Math.max(0, file.size - 65557)).arrayBuffer());
  let e = -1;
  for(let i = tail.length - 22; i >= 0; i--){ if(tail[i] === 0x50 && tail[i+1] === 0x4b && tail[i+2] === 5 && tail[i+3] === 6){ e = i; break; } }
  if(e < 0) throw new Error(file.name + " はZIPとして読めません");
  const ev = new DataView(tail.buffer, e);
  const n = ev.getUint16(10, true), cSize = ev.getUint32(12, true), cOff = ev.getUint32(16, true);
  const cd = new DataView(await file.slice(cOff, cOff + cSize).arrayBuffer());
  const dec = new TextDecoder(), out = {};
  let p = 0;
  for(let k = 0; k < n; k++){
    const method = cd.getUint16(p + 10, true), size = cd.getUint32(p + 20, true);
    const nl = cd.getUint16(p + 28, true), xl = cd.getUint16(p + 30, true), cl = cd.getUint16(p + 32, true);
    const lo = cd.getUint32(p + 42, true);
    const name = dec.decode(new Uint8Array(cd.buffer, cd.byteOffset + p + 46, nl));
    out[name] = {file, lo, size, method};
    p += 46 + nl + xl + cl;
  }
  return out;
}
async function entryBlob(ent, type){
  if(ent.method !== 0) throw new Error("圧縮されたZIPは読めません（このアプリで作ったZIPを選んでください）");
  const lh = new DataView(await ent.file.slice(ent.lo, ent.lo + 30).arrayBuffer());
  const start = ent.lo + 30 + lh.getUint16(26, true) + lh.getUint16(28, true);
  return ent.file.slice(start, start + ent.size, type || "");
}

/* ---------- IndexedDB ---------- */
const req = r => new Promise((ok, ng) => { r.onsuccess = () => ok(r.result); r.onerror = () => ng(r.error); });
async function dbNames(){
  if(indexedDB.databases){
    try{ return (await indexedDB.databases()).map(d => d.name).filter(Boolean); }catch(e){}
  }
  const out = [];
  for(const n of KNOWN_DBS){ if(await openExisting(n).then(d => { d.close(); return true; }, () => false)) out.push(n); }
  return out;
}
function openExisting(name){
  return new Promise((ok, ng) => {
    const r = indexedDB.open(name);
    r.onupgradeneeded = () => { r.transaction.abort(); };     // 無いDBを作らない
    r.onsuccess = () => ok(r.result); r.onerror = () => ng(r.error || new Error("no db"));
  });
}
/* 値の中の Blob（写真・図面）を {__sbk: 番号} に置き換えて、Blob は別に集める */
function encode(v, blobs){
  if(v instanceof Blob){ blobs.push(v); return {__sbk: blobs.length - 1}; }
  if(Array.isArray(v)) return v.map(x => encode(x, blobs));
  if(v && typeof v === "object" && !(v instanceof Date)){
    const o = {}; for(const k of Object.keys(v)) o[k] = encode(v[k], blobs); return o;
  }
  return v;
}
function decode(v, getBlob){
  if(Array.isArray(v)) return v.map(x => decode(x, getBlob));
  if(v && typeof v === "object"){
    if(Object.keys(v).length === 1 && typeof v.__sbk === "number") return getBlob(v.__sbk);
    const o = {}; for(const k of Object.keys(v)) o[k] = decode(v[k], getBlob); return o;
  }
  return v;
}
const isPhotoDb = n => /_photos$/.test(n);

/* ---------- バックアップを作る ---------- */
let job = null;
async function makeBackup(app, withPhotos, partsBox, msg, btn){
  btn.disabled = true; msg("データを集めています…"); partsBox.innerHTML = "";
  try{
    const ls = {};
    for(let i = 0; i < localStorage.length; i++){ const k = localStorage.key(i); ls[k] = localStorage.getItem(k); }
    const blobs = [], dbs = [];
    for(const name of await dbNames()){
      if(!withPhotos && isPhotoDb(name)) continue;
      let d; try{ d = await openExisting(name); }catch(e){ continue; }
      const info = {name, version: d.version, stores: []};
      for(const sn of Array.from(d.objectStoreNames)){
        const st = d.transaction(sn, "readonly").objectStore(sn);
        const s = {name: sn, keyPath: st.keyPath, autoIncrement: st.autoIncrement, rows: []};
        await new Promise((ok, ng) => {
          const c = st.openCursor();
          c.onsuccess = () => { const cur = c.result; if(!cur){ ok(); return; } s.rows.push({k: cur.primaryKey, v: encode(cur.value, blobs)}); cur.continue(); };
          c.onerror = () => ng(c.error);
        });
        info.stores.push(s);
      }
      d.close();
      dbs.push(info);
    }
    // 写真・図面を約100MBずつのZIPに分ける（1個目にはデータ本体も入る）
    const binfo = [], partOf = [], partMax = window.SYS_BK_PART_BYTES || PART_MAX;   // 試験用に小さくできる
    let part = 1, size = 0;
    blobs.forEach((b, i) => {
      if(size > 0 && size + b.size > partMax){ part++; size = 0; }
      size += b.size; partOf.push(part);
      binfo.push({i, part, type: b.type || "", size: b.size});
    });
    const nParts = part;
    const d0 = new Date(), p2 = n => String(n).padStart(2, "0");
    const stamp = d0.getFullYear() + p2(d0.getMonth() + 1) + p2(d0.getDate()) + "_" + p2(d0.getHours()) + p2(d0.getMinutes()) + p2(d0.getSeconds());
    const id = "bk" + stamp + Math.random().toString(36).slice(2, 6);
    const main = {type: "gairoju-backup", version: BK_VER, id, created: d0.toISOString(), app, page: location.pathname,
                  photos: withPhotos, parts: nParts, ls, dbs, blobs: binfo};
    const totalMB = blobs.reduce((a, b) => a + b.size, 0) / 1048576;
    job = {id, app, stamp, nParts, main, blobs, partOf, st: new Array(nParts).fill("idle"), ready: null};
    msg("記録 " + Object.keys(ls).length + "件・写真や図面 " + blobs.length + "個（約" + Math.round(totalMB) + "MB）を、" + nParts + "個のZIPにします。\n" +
        (nParts > 1 ? "［保存する］を1個ずつ押してください（iPadでは続けて自動で保存できません）。" : "［保存する］を押してください。"));
    renderParts(partsBox, msg);
    prepPart(0, partsBox, msg);
  }catch(e){ msg("バックアップを作れませんでした：" + e.message); }
  finally{ btn.disabled = false; }
}
function partName(J, ci){ return ("全データバックアップ_" + J.app + "_" + J.stamp + "_" + (ci + 1) + "of" + J.nParts + ".zip").replace(/[\\/:*?"<>|]/g, ""); }
function renderParts(box, msg){
  const J = job; if(!J) return;
  box.innerHTML = J.st.map((st, ci) => {
    const n = J.partOf.filter(p => p === ci + 1).length;
    const lab = st === "building" ? "準備中…" : st === "ready" ? "保存する" : st === "done" ? "✓ 保存済み" : "準備する";
    return '<div class="sbkPart"><div><b>' + (ci + 1) + '/' + J.nParts + '</b>　' + (ci === 0 ? "データ本体＋" : "") + '写真・図面 ' + n + '個</div>' +
      '<button type="button" data-ci="' + ci + '" class="' + (st === "ready" ? "pri" : st) + '"' + (st === "building" ? " disabled" : "") + '>' + lab + '</button></div>';
  }).join("");
  box.querySelectorAll("button[data-ci]").forEach(b => b.onclick = () => savePart(+b.dataset.ci, box, msg));
}
async function prepPart(ci, box, msg){
  const J = job;
  if(!J || ci < 0 || ci >= J.nParts || J.st[ci] === "building") return;
  if(J.ready && J.ready.ci === ci) return;
  if(J.ready){ if(J.st[J.ready.ci] === "ready") J.st[J.ready.ci] = "idle"; J.ready = null; }   // 作り置きは1個だけ（メモリ節約）
  const was = J.st[ci];
  J.st[ci] = "building"; renderParts(box, msg);
  try{
    const files = [];
    if(ci === 0) files.push({name: "backup.json", blob: new Blob([JSON.stringify(J.main)], {type: "application/json"})});
    J.blobs.forEach((b, i) => { if(J.partOf[i] === ci + 1) files.push({name: "b/" + i, blob: b}); });
    const zip = await makeZip(files);
    if(job !== J) return;
    J.ready = {ci, file: new File([zip], partName(J, ci), {type: "application/zip"})};
    J.st[ci] = "ready";
  }catch(e){ J.st[ci] = was === "done" ? "done" : "idle"; msg("ZIPを作れませんでした：" + e.message); }
  renderParts(box, msg);
}
async function savePart(ci, box, msg){
  const J = job; if(!J) return;
  if(!(J.ready && J.ready.ci === ci)){ prepPart(ci, box, msg); return; }
  const f = J.ready.file;
  let ok = false;
  if(navigator.canShare && navigator.canShare({files: [f]})){
    try{ await navigator.share({files: [f], title: f.name}); ok = true; }
    catch(e){ if(e.name !== "AbortError"){ download(f); ok = true; } }
  } else { download(f); ok = true; }
  if(job !== J) return;
  if(ok){ J.st[ci] = "done"; J.ready = null; }
  renderParts(box, msg);
  const nx = J.st.findIndex(s => s !== "done");
  if(ok && nx >= 0) prepPart(nx, box, msg);
  else if(ok) msg("バックアップ（" + J.nParts + "個のZIP）をすべて保存しました。");
}
function download(f){
  const a = document.createElement("a");
  a.href = URL.createObjectURL(f); a.download = f.name;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 3000);
}

/* ---------- 復元 ---------- */
async function restore(files, msg){
  try{
    msg("ZIPを読んでいます…");
    const ents = {};
    let main = null;
    for(const f of files){
      const z = await readZip(f);
      Object.assign(ents, z);
      if(z["backup.json"]) main = JSON.parse(await (await entryBlob(z["backup.json"])).text());
    }
    if(!main || main.type !== "gairoju-backup") throw new Error("バックアップの1個目のZIP（データ本体が入ったもの）が選ばれていません");
    const missing = main.blobs.filter(b => !ents["b/" + b.i]).map(b => b.part);
    if(missing.length){
      const ps = [...new Set(missing)].sort((a, b) => a - b);
      throw new Error("足りないZIPがあります：" + ps.map(p => p + "of" + main.parts).join("、") + "\nバックアップのZIPを全部まとめて選んでください");
    }
    const when = new Date(main.created);
    if(!confirm("バックアップ（" + main.app + "、" + when.toLocaleString() + "）を復元します。\n" +
                "記録 " + Object.keys(main.ls).length + "件・写真や図面 " + main.blobs.length + "個" + (main.photos ? "" : "（写真なし）") + "\n\n" +
                "このアプリの今のデータは、バックアップの内容に置き換わります。よろしいですか？")) { msg(""); return; }
    if(!confirm("本当に置き換えますか？（バックアップより後に入力した内容は消えます）")) { msg(""); return; }
    msg("復元しています…");
    // 写真・図面
    const cache = {};
    for(const b of main.blobs) cache[b.i] = await entryBlob(ents["b/" + b.i], b.type);
    for(const info of main.dbs){
      // 無ければバックアップと同じ版で作る。あれば今の版のまま開く（足りない置き場があるときだけ版を1つ上げて作る）
      const openWith = ver => new Promise((ok, ng) => {
        const r = ver ? indexedDB.open(info.name, ver) : indexedDB.open(info.name, info.version);
        r.onupgradeneeded = () => {
          const db = r.result;
          info.stores.forEach(s => {
            if(db.objectStoreNames.contains(s.name)) return;
            const o = {};
            if(s.keyPath != null) o.keyPath = s.keyPath;
            if(s.autoIncrement) o.autoIncrement = true;
            db.createObjectStore(s.name, o);
          });
        };
        r.onsuccess = () => ok(r.result);
        r.onerror = () => ng(r.error || new Error(info.name + " を開けません"));
        r.onblocked = () => ng(new Error("ほかの画面がデータを使っています。アプリを一度閉じてから、もう一度やり直してください"));
      });
      let d;
      try{ d = await openWith(0); }
      catch(e){                                   // 今の版のほうが新しい（VersionError）→ 今の版で開く
        const cur = await openExisting(info.name);
        const v = cur.version; cur.close();
        d = await openWith(v);
      }
      if(info.stores.some(s => !d.objectStoreNames.contains(s.name))){
        const v = d.version + 1; d.close();
        d = await openWith(v);
      }
      for(const s of info.stores){
        if(!d.objectStoreNames.contains(s.name)) continue;
        await new Promise((ok, ng) => {
          const tx = d.transaction(s.name, "readwrite"), st = tx.objectStore(s.name);
          st.clear();
          s.rows.forEach(row => {
            const v = decode(row.v, i => cache[i]);
            if(st.keyPath != null) st.put(v); else st.put(v, row.k);
          });
          tx.oncomplete = () => ok(); tx.onerror = () => ng(tx.error); tx.onabort = () => ng(tx.error || new Error("保存できませんでした（空き容量を確認してください）"));
        });
      }
      d.close();
    }
    // 記録・設定（localStorage）
    let n = 0;
    for(const [k, v] of Object.entries(main.ls)){ try{ localStorage.setItem(k, v); n++; }catch(e){ throw new Error("記録を戻せませんでした（" + e.name + "）"); } }
    try{ if(navigator.storage && navigator.storage.persist) await navigator.storage.persist(); }catch(e){}
    msg("復元しました（記録 " + n + "件・写真や図面 " + main.blobs.length + "個）。画面を読み込み直します…");
    setTimeout(() => location.reload(), 1500);
  }catch(e){ msg("復元できませんでした：" + e.message); alert("復元できませんでした\n" + e.message); }
}

window.SysBackup = {VERSION: 1, mount};
document.querySelectorAll("#sysBackup").forEach(mount);
})();
