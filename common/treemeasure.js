/* 樹高・枝張りの測定と推定樹齢（長野公園・樹木点検・外観診断の現場アプリで共通）
   「大きな木」アプリ（tree-height-app.vercel.app）の測り方を現場アプリ用にしたもの。
   ・木までの距離を入れる（メジャー・レーザーが基本。補助に歩数×歩幅）
   ・カメラの画面で根元をタップ、頂点をタップ → 樹高＝距離×(tan 頂点の仰角 − tan 根元の仰角)
   ・仰角＝iPad の傾き（センサー）＋タップした位置の画角。「大きな木」は画面の中心を水平とみなしていたので、
     iPad を上に傾けると値が狂った。ここではタップしたときの傾きを足すので、根元を撮ってから上に向けて頂点をタップできる
   ・枝張り＝2×距離×tan(左端と右端の間の角度÷2)
   ・推定樹齢＝幹周 ÷ 樹種別の年間成長量（「大きな木」と同じ表）。参考値なので画面に出すだけで、どこにも保存しない

   使い方：TreeMeasure.open({kind: "h" または "w", title: "番号 樹種", onResult: (値m, 内訳) => {...}})
           TreeMeasure.ageText(樹種, 幹周cm) → "推定樹齢 約40年（参考）"（出せないときは ""） */
(function(){
  "use strict";
  const LS_FOV = "tm_fov", LS_STRIDE = "tm_stride";
  const DEF_FOV = 64;                     // カメラの長い辺の視野角（度）。iPad の広角の目安。［カメラの校正］で実測に置き換わる
  const rad = d => d * Math.PI / 180, deg = r => r * 180 / Math.PI;
  const lsGet = k => { try{ return localStorage.getItem(k); }catch(_){ return null; } };
  const lsSet = (k, v) => { try{ localStorage.setItem(k, v); }catch(_){} };
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const esc = s => String(s).replace(/[&<>"]/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;"}[c]));

  /* ---- 推定樹齢 ---- 年間の幹周の成長量（cm/年）。国総研・日本緑化センター資料に基づく概算（「大きな木」と同じ） */
  const RATE = {クスノキ:3.5,スギ:2,ケヤキ:2.5,イチョウ:2,シイノキ:2.2,タブノキ:2.8,カツラ:3,トチノキ:2.5,ムクノキ:2.8,エノキ:2.5,ミズナラ:2,コナラ:1.8,
    アラカシ:2,シラカシ:2.5,アカガシ:2.2,ウラジロガシ:2,サクラ:3,サワラ:1.8,コウヤマキ:1.2,ビャクシン:1,スダジイ:2.2,ツブラジイ:2,ヒノキ:1.8,アスナロ:1.5,
    コウヤヒノキ:1.5,マツ:1.5,アカマツ:1.5,クロマツ:1.5,カラマツ:2.5,トドマツ:1.5,エゾマツ:1.5,モミ:1.8,ウラジロモミ:1.5,ツガ:1.5,プラタナス:4,メタセコイア:4,
    ヒマラヤスギ:3.5,トウカエデ:2.8,ユリノキ:3.5,センダン:3.5,シンジュ:5,ポプラ:5,ニレ:2.5,ハルニレ:2.5,アキニレ:2,ホオノキ:2.5,コブシ:2,ハクモクレン:2.5,
    クヌギ:2.2,イヌシデ:1.8,アオシデ:1.8,サワグルミ:3,ハンノキ:2.5,カキノキ:1.5,クリ:2};
  const OTHER_RATE = 2.5;
  const ALIAS = [[/サクラ|ザクラ|ヨシノ/, "サクラ"], [/^コジイ$/, "ツブラジイ"], [/^シイ$/, "シイノキ"], [/スズカケ/, "プラタナス"]];
  function rateOf(sp){
    const s = String(sp || "").replace(/[（(].*?[）)]/g, "").trim();
    if(RATE[s]) return {rate: RATE[s], known: true};
    for(const [re, k] of ALIAS) if(re.test(s)) return {rate: RATE[k], known: true};
    return {rate: OTHER_RATE, known: false};
  }
  function age(sp, girth){
    const g = parseFloat(girth);
    if(!String(sp || "").trim() || !(g > 0)) return null;
    const r = rateOf(sp);
    return {years: Math.round(g / r.rate), rate: r.rate, known: r.known};
  }
  function ageText(sp, girth){
    const a = age(sp, girth);
    return a ? "推定樹齢 約" + a.years + "年（参考" + (a.known ? "" : "・樹種の値が無いので標準値") + "）" : "";
  }

  /* ---- 角度の計算 ---- */
  /* カメラ（iPad の裏）の向きの仰角。iPad を縦・横どちらに持っても同じ式でよい（回転行列の鉛直成分） */
  const elevOf = (b, g) => deg(Math.asin(Math.max(-1, Math.min(1, -Math.cos(rad(b)) * Math.cos(rad(g))))));
  /* カメラの向きの方位（度・右回りが＋） */
  function headOf(a, b, g){
    const sa = Math.sin(rad(a)), ca = Math.cos(rad(a)), sb = Math.sin(rad(b)), sg = Math.sin(rad(g)), cg = Math.cos(rad(g));
    return deg(Math.atan2(-(ca * sg + sa * sb * cg), -(sa * sg - ca * sb * cg)));
  }
  const fov = ()=> parseFloat(lsGet(LS_FOV)) || DEF_FOV;
  const focal = (vw, vh, L) => (Math.max(vw, vh) / 2) / Math.tan(rad(L) / 2);          // 画素で表した焦点距離
  const heightOf = (d, top, base) => d * (Math.tan(rad(top)) - Math.tan(rad(base)));
  const spreadOf = (d, delta) => 2 * d * Math.tan(rad(Math.abs(delta)) / 2);
  const wrap = d => ((d + 540) % 360) - 180;

  /* ---- 画面 ---- */
  const CSS = `
#tmBox{position:fixed;inset:0;z-index:9000;background:#000;display:none;flex-direction:column;font-family:inherit;color:#fff}
#tmBox.show{display:flex}
#tmForm{flex:1;overflow:auto;background:#f5f6f4;color:#222;padding:calc(env(safe-area-inset-top) + 14px) 16px 24px}
#tmForm h3{margin:0 0 2px;font-size:19px}
#tmForm .sub{font-size:13px;color:#666;margin:0 0 12px}
#tmForm label{display:block;font-size:13px;font-weight:600;margin:12px 0 4px}
#tmForm input{width:100%;box-sizing:border-box;font-size:22px;padding:9px 10px;border:1px solid #bbb;border-radius:9px;text-align:center;background:#fff;color:#222}
#tmForm .tmChips{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px}
#tmForm .tmChips button{font-size:15px;padding:8px 14px;border-radius:16px;border:1px solid #bbb;background:#fff;color:#222}
#tmForm .tmChips button.on{background:#1b6b5f;border-color:#1b6b5f;color:#fff}
#tmForm .tmNote{font-size:12px;color:#666;line-height:1.6;margin:6px 0 0}
#tmForm details{margin-top:14px;background:#fff;border:1px solid #ddd;border-radius:10px;padding:8px 12px}
#tmForm summary{font-size:14px;font-weight:600}
#tmForm .tmTwo{display:grid;grid-template-columns:1fr 1fr;gap:8px}
#tmForm .tmBtns{display:grid;grid-template-columns:1fr 2fr;gap:8px;margin-top:18px}
#tmForm .tmBtns button{min-height:50px;font-size:16px;font-weight:700;border-radius:11px;border:1px solid #1b6b5f;background:#fff;color:#1b6b5f}
#tmForm .tmBtns button.p{background:#1b6b5f;color:#fff}
#tmForm a{display:inline-block;margin-top:16px;font-size:13px;color:#777}
#tmCam{flex:1;display:none;flex-direction:column;min-height:0}
#tmTop{padding:calc(env(safe-area-inset-top) + 8px) 12px 8px;font-size:18px;font-weight:700;text-align:center;background:#123;line-height:1.35}
#tmTop small{display:block;font-size:12px;font-weight:400;color:#ffd400}
#tmView{flex:1;position:relative;overflow:hidden;min-height:0;touch-action:none}
#tmVideo{position:absolute;inset:0;width:100%;height:100%;object-fit:contain}
#tmMsg{position:absolute;inset:0;display:none;align-items:center;justify-content:center;text-align:center;padding:20px;line-height:1.8;color:#ddd}
.tmL{position:absolute;pointer-events:none;display:none}
.tmL.h{left:0;right:0;border-top:2px dashed}
.tmL.v{top:0;bottom:0;border-left:2px dashed}
.tmL span{position:absolute;left:6px;top:2px;font-size:13px;font-weight:700;background:rgba(0,0,0,.6);padding:1px 6px;border-radius:6px;white-space:nowrap}
#tmBot{display:flex;align-items:center;gap:8px;padding:8px 10px calc(env(safe-area-inset-bottom) + 10px);background:#123;flex-wrap:wrap}
#tmRes{flex:1;min-width:180px;font-size:13px;line-height:1.4}
#tmRes b{font-size:24px;color:#ffd400}
#tmRes em{font-style:normal;color:#ffb0a0;display:block}
#tmBot button{min-height:46px;padding:6px 14px;font-size:15px;font-weight:700;border-radius:10px;border:none;background:rgba(255,255,255,.2);color:#fff}
#tmBot button.p{background:#1b6b5f}`;

  let box = null;
  const $t = id => document.getElementById(id);
  const S = {kind: "h", opts: null, calib: false, slope: false, stream: null, gen: 0, taps: [], d: 0, known: 0, buf: [], on: false, res: null, vis: 0};

  function build(){
    if(box) return;
    const st = document.createElement("style"); st.textContent = CSS; document.head.appendChild(st);
    box = document.createElement("div"); box.id = "tmBox";
    box.innerHTML = `
<div id="tmForm">
  <h3 id="tmTitle"></h3><p class="sub" id="tmSub"></p>
  <div id="tmKnownBox" style="display:none"><label>目標の実際の高さ（m）</label><input id="tmK" type="text" inputmode="decimal" autocomplete="off" placeholder="例）2.0">
    <p class="tmNote">高さの分かっている物（ポール・電柱の目盛りなど）を、iPad を動かさずに下端と上端をタップして、この iPad のカメラの視野角を求めます。画面の上下いっぱいに入る距離で行うと正確です。1回で覚えます。</p></div>
  <label id="tmDLbl">木までの距離（m）</label>
  <input id="tmD" type="text" inputmode="decimal" autocomplete="off" placeholder="例）15">
  <div class="tmChips" id="tmDChips"></div>
  <div id="tmTypeBox"><label>距離の取り方</label>
    <div class="tmChips" id="tmType"><button data-v="0">水平距離</button><button data-v="1">斜距離（レーザーで根元まで）</button></div></div>
  <details id="tmWalk"><summary>👣 歩数から距離を出す（補助）</summary>
    <div class="tmTwo"><div><label>歩数</label><input id="tmSteps" type="text" inputmode="numeric" autocomplete="off"></div>
    <div><label>歩幅（cm）</label><input id="tmStride" type="text" inputmode="numeric" autocomplete="off" placeholder="例）65"></div></div>
    <p class="tmNote">歩幅は 10 歩歩いた距離（cm）÷10 で測ります（覚えます）。斜面や藪では誤差が大きいので、目安にしてください。</p></details>
  <p class="tmNote" id="tmHint"></p>
  <div class="tmBtns"><button id="tmCancel">やめる</button><button class="p" id="tmGo">カメラへ</button></div>
  <a href="#" id="tmCalib"></a>
</div>
<div id="tmCam">
  <div id="tmTop"></div>
  <div id="tmView"><video id="tmVideo" autoplay playsinline muted></video><div class="tmL" id="tmL0"><span></span></div><div class="tmL" id="tmL1"><span></span></div><div id="tmMsg"></div></div>
  <div id="tmBot"><div id="tmRes"></div><button id="tmBack">戻る</button><button id="tmRedo">やり直す</button><button class="p" id="tmOk" style="display:none">この値を入れる</button></div>
</div>`;
    document.body.appendChild(box);
    $t("tmDChips").innerHTML = [5, 8, 10, 12, 15, 20, 25, 30].map(v => "<button>" + v + "</button>").join("");
    $t("tmDChips").querySelectorAll("button").forEach(b => b.onclick = ()=>{ $t("tmD").value = b.textContent; });
    $t("tmType").querySelectorAll("button").forEach(b => b.onclick = ()=>{ S.slope = b.dataset.v === "1"; paintType(); });
    const walk = ()=>{
      const n = parseFloat($t("tmSteps").value), w = parseFloat($t("tmStride").value);
      if(w > 0) lsSet(LS_STRIDE, String(w));
      if(n > 0 && w > 0) $t("tmD").value = (n * w / 100).toFixed(1);
    };
    $t("tmSteps").addEventListener("input", walk); $t("tmStride").addEventListener("input", walk);
    $t("tmCancel").onclick = close;
    $t("tmGo").onclick = goCam;
    $t("tmCalib").onclick = e => { e.preventDefault(); S.calib = !S.calib; paintForm(); };
    $t("tmBack").onclick = backForm;
    $t("tmRedo").onclick = redo;
    $t("tmOk").onclick = accept;
    $t("tmView").addEventListener("click", onTap);
    window.addEventListener("resize", ()=>{ if(camShown()){ S.gen++; openStream(); } });
    document.addEventListener("visibilitychange", ()=>{
      clearTimeout(S.vis);
      if(!camShown()) return;
      if(document.hidden){ S.gen++; stopStream(); }
      else S.vis = setTimeout(()=>{ if(camShown() && !document.hidden) openStream(); }, 600);      // 戻った直後はカメラをまだ使えないことがある
    });
  }
  const camShown = ()=> !!box && box.classList.contains("show") && $t("tmCam").style.display === "flex";
  function paintType(){ $t("tmType").querySelectorAll("button").forEach(b => b.classList.toggle("on", (b.dataset.v === "1") === S.slope)); }
  function paintForm(){
    const c = S.calib;
    $t("tmTitle").textContent = c ? "カメラの校正" : S.kind === "w" ? "枝張りを測る" : "樹高を測る";
    $t("tmSub").textContent = c ? "いまの視野角 " + fov().toFixed(1) + "°" + (lsGet(LS_FOV) ? "（校正済み）" : "（標準値）") : (S.opts.title || "");
    $t("tmKnownBox").style.display = c ? "" : "none";
    $t("tmDLbl").textContent = c ? "目標までの水平距離（m）" : "木までの距離（m）";
    $t("tmTypeBox").style.display = S.kind === "h" && !c ? "" : "none";
    $t("tmWalk").style.display = c ? "none" : "";
    $t("tmHint").textContent = c ? "" : S.kind === "w" ? "幹までの水平距離を入れます。枝張りの左右の端が見える所から測ります。" :
      "メジャーかレーザーで測った距離を入れます。距離は樹高と同じくらい離れると誤差が小さくなります。";
    $t("tmCalib").textContent = c ? "測定に戻る" : "カメラの校正（最初に1回）";
    paintType();
  }

  function open(opts){
    build();
    S.opts = opts || {}; S.kind = S.opts.kind === "w" ? "w" : "h"; S.calib = false; S.slope = false; S.taps = []; S.res = null;
    $t("tmSteps").value = ""; $t("tmStride").value = lsGet(LS_STRIDE) || ""; $t("tmD").value = ""; $t("tmK").value = "";
    $t("tmWalk").open = false;
    $t("tmForm").style.display = ""; $t("tmCam").style.display = "none";
    paintForm();
    box.classList.add("show");
  }
  function close(){
    S.gen++; stopStream(); clearTimeout(S.vis);
    window.removeEventListener("deviceorientation", onSensor, true);
    S.on = false; S.buf = [];
    if(box) box.classList.remove("show");
  }
  function backForm(){
    S.gen++; stopStream();
    $t("tmCam").style.display = "none"; $t("tmForm").style.display = "";
  }
  const num = v => parseFloat(String(v).replace(/[０-９．]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0)));

  function goCam(){
    const d = num($t("tmD").value);
    if(!(d > 0)){ alert("距離を入れてください"); return; }
    if(S.calib){
      S.known = num($t("tmK").value);
      if(!(S.known > 0)){ alert("目標の実際の高さを入れてください"); return; }
    }
    S.d = d; S.taps = []; S.res = null;
    // iPad のセンサーの許可は、ボタンを押した処理の中で求める必要がある
    let ask = Promise.resolve("granted");
    try{
      if(window.DeviceOrientationEvent && typeof DeviceOrientationEvent.requestPermission === "function") ask = DeviceOrientationEvent.requestPermission().catch(()=> "denied");
    }catch(_){}
    $t("tmForm").style.display = "none"; $t("tmCam").style.display = "flex";
    paintCam();
    S.denied = false;
    ask.then(st => {
      S.denied = st !== "granted";
      if(!S.denied){ window.removeEventListener("deviceorientation", onSensor, true); window.addEventListener("deviceorientation", onSensor, true); }
      paintCam();
    });
    openStream();
  }

  /* ---- センサー（手ぶれをならすため直近の平均を使う） ---- */
  function onSensor(e){
    if(e.beta == null || e.gamma == null) return;
    S.on = true;
    S.buf.push({el: elevOf(e.beta, e.gamma), hd: e.alpha == null ? null : headOf(e.alpha, e.beta, e.gamma)});
    if(S.buf.length > 12) S.buf.shift();
    paintMarks(); paintTilt();
  }
  function reading(){
    if(!S.on || !S.buf.length) return {el: 0, hd: 0};
    const el = S.buf.reduce((a, b) => a + b.el, 0) / S.buf.length;
    const hs = S.buf.filter(b => b.hd != null);
    let x = 0, y = 0; hs.forEach(b => { x += Math.sin(rad(b.hd)); y += Math.cos(rad(b.hd)); });
    return {el, hd: hs.length ? deg(Math.atan2(x, y)) : 0};
  }

  /* ---- カメラ ---- */
  function stopStream(){
    if(S.stream) S.stream.getTracks().forEach(t => { try{ t.stop(); }catch(_){} });
    S.stream = null;
    const v = $t("tmVideo"); if(v) v.srcObject = null;
  }
  async function openStream(){
    const gen = ++S.gen, had = !!S.stream;
    stopStream();
    $t("tmMsg").style.display = "none";
    if(had) await wait(300);
    // 縦向きなら縦長の映像を求める（横長を求めると iPad は上下を切り抜いて視野が狭くなる）
    const port = window.innerHeight > window.innerWidth;
    const c = {facingMode: "environment", width: {ideal: port ? 1440 : 1920}, height: {ideal: port ? 1920 : 1440}, aspectRatio: {ideal: port ? 3 / 4 : 4 / 3}};
    let s = null, err = null;
    for(let k = 0; k < 4 && !s; k++){
      if(gen !== S.gen || !camShown()) return;
      if(document.hidden){ await wait(500); continue; }
      if(!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia){ err = {name: "NoMediaDevices"}; break; }
      try{ s = await navigator.mediaDevices.getUserMedia({video: c, audio: false}); }
      catch(e){ err = e; await wait([400, 900, 1600, 0][k]); }
    }
    if(!s){
      if(gen === S.gen && camShown()){
        $t("tmMsg").innerHTML = "<div>カメラを開けませんでした（" + esc((err && err.name) || "不明") + "）<br>ほかのアプリがカメラを使っていないか確かめて、［戻る］→［カメラへ］を押してください。</div>";
        $t("tmMsg").style.display = "flex";
      }
      return;
    }
    if(gen !== S.gen || !camShown()){ s.getTracks().forEach(t => t.stop()); return; }
    S.stream = s;
    $t("tmVideo").srcObject = s;
    try{ await $t("tmVideo").play(); }catch(_){}
    paintMarks();
  }

  /* 映像は切り抜かずに全部見せ、画面の位置を映像の位置に直す */
  function frame(){
    const v = $t("tmVideo"), W = $t("tmView").clientWidth, H = $t("tmView").clientHeight, vw = v.videoWidth, vh = v.videoHeight;
    if(!vw || !vh) return null;
    const s = Math.min(W / vw, H / vh), dw = vw * s, dh = vh * s;
    return {vw, vh, dw, dh, ox: (W - dw) / 2, oy: (H - dh) / 2, f: focal(vw, vh, fov())};
  }
  const LAB = {h: ["根元", "頂点"], w: ["左端", "右端"], c: ["下端", "上端"]};
  const mode = ()=> S.calib ? "c" : S.kind;
  function onTap(e){
    if(S.taps.length >= 2) return;
    const f = frame(); if(!f) return;
    const r = $t("tmView").getBoundingClientRect();
    const u = (e.clientX - r.left - f.ox) / f.dw, v = (e.clientY - r.top - f.oy) / f.dh;
    if(u < 0 || u > 1 || v < 0 || v > 1) return;
    const now = reading();
    const pv = deg(Math.atan((0.5 - v) * f.vh / f.f)), pu = deg(Math.atan((u - 0.5) * f.vw / f.f));
    S.taps.push({u, v, el: now.el + pv, az: now.hd + pu, base: now.el});
    if(S.taps.length === 2) calc();
    paintCam(); paintMarks();
  }
  /* タップしたあとに iPad を動かしても、線がその場所に付いていくようにする */
  function paintMarks(){
    if(!camShown()) return;
    const f = frame(), now = reading(), m = mode();
    [0, 1].forEach(i => {
      const L = $t("tmL" + i), t = S.taps[i];
      if(!t || !f){ L.style.display = "none"; return; }
      L.className = "tmL " + (m === "w" ? "v" : "h");
      L.style.borderColor = i ? "#ffd400" : "#ff5a4a";
      L.querySelector("span").textContent = LAB[m][i];
      L.querySelector("span").style.color = i ? "#ffd400" : "#ff9a8a";
      if(m === "w"){
        const x = 0.5 + Math.tan(rad(wrap(t.az - now.hd))) * f.f / f.vw;
        L.style.left = f.ox + x * f.dw + "px"; L.style.display = x >= 0 && x <= 1 ? "block" : "none";
      } else {
        const y = 0.5 - Math.tan(rad(t.el - now.el)) * f.f / f.vh;
        L.style.top = f.oy + y * f.dh + "px"; L.style.display = y >= 0 && y <= 1 ? "block" : "none";
      }
    });
  }
  function paintTilt(){
    if(S.res || !camShown()) return;
    $t("tmRes").textContent = "iPad の傾き " + (reading().el >= 0 ? "＋" : "－") + Math.abs(reading().el).toFixed(0) + "°　距離 " + S.d + "m";
  }
  function paintCam(){
    const m = mode(), n = S.taps.length, up = m === "h" ? "（iPad を上に傾けてかまいません）" : m === "w" ? "（iPad を右に向けてかまいません）" : "（iPad を動かさないで）";
    const msg = n >= 2 ? "測定しました" : n === 1 ? "② " + LAB[m][1] + "をタップ" + up : "① " + LAB[m][0] + "をタップ";
    const warn = S.on || n >= 2 ? "" : S.denied ? "傾きセンサーが許可されていません。2点が1画面に入る所で iPad を動かさずにタップしてください（許可するには、アプリを開き直して確認の画面で［許可］）" :
      "傾きセンサーが届いていないときは、2点が1画面に入る所で iPad を動かさずにタップしてください";
    $t("tmTop").innerHTML = esc(msg) + (warn ? "<small>" + esc(warn) + "</small>" : "");
    $t("tmOk").style.display = S.res && !S.res.err ? "" : "none";
    $t("tmOk").textContent = S.calib ? "この視野角を使う" : "この値を入れる";
    if(S.res){
      $t("tmRes").innerHTML = S.res.err ? "<em>" + esc(S.res.err) + "</em>" :
        "<b>" + esc(S.res.label) + "</b><br>" + esc(S.res.note) + (S.res.warn ? "<em>" + esc(S.res.warn) + "</em>" : "");
    } else $t("tmRes").textContent = "距離 " + S.d + "m";
  }
  function redo(){ S.taps = []; S.res = null; paintCam(); paintMarks(); }

  function calc(){
    const [a, b] = S.taps, sg = v => (v >= 0 ? "＋" : "－") + Math.abs(v).toFixed(0) + "°";
    if(S.calib){
      const f = frame();
      // 上端と下端の高さの差が実際の高さになる視野角を二分法で求める
      const hAt = L => { const F = focal(f.vw, f.vh, L);
        return heightOf(S.d, b.base + deg(Math.atan((0.5 - b.v) * f.vh / F)), a.base + deg(Math.atan((0.5 - a.v) * f.vh / F))); };
      let lo = 25, hi = 110;
      if(!(hAt(lo) > 0)){ S.res = {err: "下端を先に、上端をあとにタップしてください"}; return; }
      for(let i = 0; i < 40; i++){ const mid = (lo + hi) / 2; if(hAt(mid) > S.known) hi = mid; else lo = mid; }
      const L = (lo + hi) / 2;
      S.res = L < 26 || L > 109 ? {err: "校正できません。距離・高さ・タップの位置を確かめてください"} :
        {value: +L.toFixed(1), label: "視野角 " + L.toFixed(1) + "°", note: "長い辺の視野角（いままで " + fov().toFixed(1) + "°）"};
      return;
    }
    if(S.kind === "w"){
      const delta = wrap(b.az - a.az);
      const W = spreadOf(S.d, delta);
      S.res = delta <= 0 ? {err: "左端を先に、右端をあとにタップしてください"} :
        delta >= 150 ? {err: "左右の角度が大きすぎます。もっと離れて測ってください"} :
        {value: +W.toFixed(1), label: "枝張り " + W.toFixed(1) + " m", note: "距離 " + S.d + "m・左右の角度 " + delta.toFixed(0) + "°",
         warn: delta > 110 ? "木に近いので誤差が大きくなります。もっと離れて測ると正確です" : ""};
      return;
    }
    if(b.el >= 85){ S.res = {err: "頂点の角度が大きすぎます。もっと離れて測ってください"}; return; }
    const dh = S.slope ? S.d * Math.cos(rad(a.el)) : S.d;
    const H = heightOf(dh, b.el, a.el);
    S.res = !(H > 0) ? {err: "根元を先に、頂点をあとにタップしてください"} :
      {value: +H.toFixed(1), label: "樹高 " + H.toFixed(1) + " m", note: "水平距離 " + dh.toFixed(1) + "m・根元 " + sg(a.el) + "・頂点 " + sg(b.el),
       warn: b.el > 65 ? "木に近いので誤差が大きくなります。樹高と同じくらい離れると正確です" : ""};
  }
  function accept(){
    if(!S.res || S.res.err) return;
    if(S.calib){ lsSet(LS_FOV, String(S.res.value)); S.calib = false; S.taps = []; S.res = null; backForm(); paintForm(); return; }
    const v = S.res.value, cb = S.opts.onResult, info = {d: S.d};
    close();
    if(cb) cb(v, info);
  }

  window.TreeMeasure = {open, close, age, ageText, _t: {elevOf, headOf, heightOf, spreadOf, focal, rateOf, S}};
})();
