/* 街路樹診断システム・長野公園 — 撮った写真を画面いっぱいで見る（樹木点検・長野公園で共通）

   PhotoView.open(items, start)
     items: [{ title: "左15", sub: "全体", load: async () => Blob|null,
               tag: "前の木",                // 付けると見出しの前に小さな札（見比べ用の写真など）
               onDelete: async () => true }] // 付けると［削除］が出る（true を返したら一覧から外す）
   ・左右にスワイプ（または ◀ ▶）で次の写真　・2本指で拡大　・ダブルタップで拡大／元に戻す
   ・拡大中は1本指で動かす　・［閉じる］か Esc で閉じる
*/
(function (global) {
  "use strict";
  var VERSION = 1;
  var CSS =
    "#pvBox{position:fixed;inset:0;z-index:200;background:#111;display:none;flex-direction:column;color:#fff;" +
    "font-family:-apple-system,'Hiragino Sans','Yu Gothic UI',sans-serif;-webkit-user-select:none;user-select:none}" +
    "#pvBox.show{display:flex}" +
    "#pvBox .pvHd{position:relative;z-index:2;display:flex;align-items:center;gap:10px;padding:calc(env(safe-area-inset-top) + 8px) 12px 8px;background:rgba(0,0,0,.6)}" +
    "#pvBox .pvTt{flex:1;min-width:0;font-size:17px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}" +
    "#pvBox .pvTt small{font-size:13px;font-weight:400;opacity:.8;margin-left:8px}" +
    "#pvBox .pvTag{display:inline-block;font-size:12px;font-weight:700;background:#E8A33D;color:#111;border-radius:5px;padding:1px 6px;margin-right:8px;vertical-align:2px}" +
    "#pvBox .pvN{font-size:13px;opacity:.8;white-space:nowrap}" +
    "#pvBox button{font-family:inherit;touch-action:manipulation}" +
    "#pvBox .pvX{background:#fff;color:#111;border:none;border-radius:9px;font-size:15px;font-weight:700;padding:9px 16px}" +
    "#pvBox .pvSt{flex:1;position:relative;z-index:1;overflow:hidden;touch-action:none;contain:paint}" +
    "#pvBox .pvSt img{position:absolute;left:0;top:0;transform-origin:0 0;max-width:none;-webkit-user-drag:none;pointer-events:none}" +
    "#pvBox .pvMsg{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:15px;opacity:.75;text-align:center;padding:20px}" +
    "#pvBox .pvFt{position:relative;z-index:2;display:flex;align-items:center;gap:10px;padding:8px 12px calc(env(safe-area-inset-bottom) + 10px);background:rgba(0,0,0,.6)}" +
    "#pvBox .pvFt .pvNav{min-width:64px;min-height:46px;font-size:20px;border-radius:10px;border:1px solid #555;background:#222;color:#fff}" +
    "#pvBox .pvFt .pvNav:disabled{opacity:.3}" +
    "#pvBox .pvFt .pvHint{flex:1;text-align:center;font-size:12px;opacity:.7}" +
    "#pvBox .pvDel{min-height:42px;border-radius:9px;border:1px solid #E57373;background:transparent;color:#FF8A80;font-size:14px;padding:0 14px}";

  var box, st, img, tt, nn, msg, prevB, nextB, delB;
  var items = [], idx = 0, url = "", nat = { w: 0, h: 0 }, V = { s: 1, x: 0, y: 0, fit: 1 }, loadGen = 0;

  function el(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

  function build() {
    if (box) return;
    var css = document.createElement("style"); css.textContent = CSS; document.head.appendChild(css);
    box = el("div"); box.id = "pvBox";
    var hd = el("div", "pvHd"); tt = el("div", "pvTt"); nn = el("div", "pvN");
    var x = el("button", "pvX", "閉じる"); x.type = "button"; x.onclick = close;
    hd.appendChild(tt); hd.appendChild(nn); hd.appendChild(x);
    st = el("div", "pvSt"); img = el("img"); img.alt = ""; msg = el("div", "pvMsg");
    st.appendChild(img); st.appendChild(msg);
    var ft = el("div", "pvFt");
    prevB = el("button", "pvNav", "◀"); prevB.type = "button"; prevB.onclick = function () { go(-1); };
    nextB = el("button", "pvNav", "▶"); nextB.type = "button"; nextB.onclick = function () { go(1); };
    delB = el("button", "pvDel", "この写真を削除"); delB.type = "button"; delB.onclick = doDelete;
    var hint = el("div", "pvHint", "左右にスワイプで次の写真・2本指で拡大");
    ft.appendChild(prevB); ft.appendChild(hint); ft.appendChild(delB); ft.appendChild(nextB);
    box.appendChild(hd); box.appendChild(st); box.appendChild(ft);
    document.body.appendChild(box);
    img.onload = function () { nat = { w: img.naturalWidth, h: img.naturalHeight }; fit(); };
    gestures();
    document.addEventListener("keydown", function (e) {
      if (!box.classList.contains("show")) return;
      if (e.key === "Escape") close(); else if (e.key === "ArrowLeft") go(-1); else if (e.key === "ArrowRight") go(1);
    });
    window.addEventListener("resize", function () { if (box.classList.contains("show")) fit(); });
  }

  function apply() { img.style.transform = "translate(" + V.x + "px," + V.y + "px) scale(" + V.s + ")"; }
  function fit() {
    if (!nat.w) return;
    var r = st.getBoundingClientRect();
    V.fit = Math.min(r.width / nat.w, r.height / nat.h);
    V.s = V.fit; V.x = (r.width - nat.w * V.s) / 2; V.y = (r.height - nat.h * V.s) / 2;
    apply();
  }
  /* 拡大しても写真が画面の外へ行き過ぎないように */
  function clamp() {
    var r = st.getBoundingClientRect(), w = nat.w * V.s, h = nat.h * V.s;
    V.x = w <= r.width ? (r.width - w) / 2 : Math.min(0, Math.max(r.width - w, V.x));
    V.y = h <= r.height ? (r.height - h) / 2 : Math.min(0, Math.max(r.height - h, V.y));
  }
  function zoomAt(px, py, ns) {
    ns = Math.max(V.fit, Math.min(V.fit * 6, ns));
    var k = ns / V.s; V.x = px - (px - V.x) * k; V.y = py - (py - V.y) * k; V.s = ns; clamp(); apply();
  }

  function show() {
    var it = items[idx]; if (!it) return;
    tt.innerHTML = (it.tag ? '<span class="pvTag">' + esc(it.tag) + "</span>" : "") + esc(it.title || "") + (it.sub ? "<small>" + esc(it.sub) + "</small>" : "");
    nn.textContent = items.length > 1 ? (idx + 1) + " / " + items.length : "";
    prevB.disabled = idx <= 0; nextB.disabled = idx >= items.length - 1;
    prevB.style.visibility = nextB.style.visibility = items.length > 1 ? "" : "hidden";
    delB.style.display = it.onDelete ? "" : "none";
    if (url) { URL.revokeObjectURL(url); url = ""; }
    img.removeAttribute("src"); img.style.display = "none"; nat = { w: 0, h: 0 };
    msg.textContent = "読み込んでいます…";
    var g = ++loadGen;
    Promise.resolve().then(function () { return it.load ? it.load() : null; }).then(function (b) {
      if (g !== loadGen) return;
      if (!b) { msg.textContent = it.missing || "この写真は iPad にありません（事務所PCに送ったあとで消しました）"; return; }
      url = URL.createObjectURL(b); msg.textContent = ""; img.style.display = ""; img.src = url;
    }, function () { if (g === loadGen) msg.textContent = "写真を読めませんでした"; });
  }
  function go(d) { var j = idx + d; if (j < 0 || j >= items.length) return; idx = j; show(); }
  function doDelete() {
    var it = items[idx]; if (!it || !it.onDelete) return;
    Promise.resolve(it.onDelete()).then(function (ok) {
      if (!ok) return;
      items.splice(idx, 1);
      if (!items.length) { close(); return; }
      if (idx >= items.length) idx = items.length - 1;
      show();
    });
  }

  function gestures() {
    var P = new Map(), g = null, lastTap = 0;
    function pos(e) { var r = st.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
    st.addEventListener("pointerdown", function (e) {
      if (e.isPrimary) P.clear();
      try { st.setPointerCapture(e.pointerId); } catch (_) {}
      P.set(e.pointerId, pos(e));
      if (P.size === 1) { var p = pos(e); g = { m: "one", sx: p.x, sy: p.y, lx: p.x, ly: p.y, t: Date.now(), moved: false }; }
      else if (P.size === 2) {
        var a = Array.from(P.values());
        g = { m: "pinch", d0: Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y), s0: V.s, cx: (a[0].x + a[1].x) / 2, cy: (a[0].y + a[1].y) / 2, x0: V.x, y0: V.y };
      }
    });
    st.addEventListener("pointermove", function (e) {
      if (!P.has(e.pointerId) || !g) return;
      P.set(e.pointerId, pos(e));
      if (g.m === "one" && P.size === 1) {
        var p = pos(e);
        if (Math.hypot(p.x - g.sx, p.y - g.sy) > 8) g.moved = true;
        if (V.s > V.fit * 1.01) { V.x += p.x - g.lx; V.y += p.y - g.ly; clamp(); apply(); }
        else { V.x += p.x - g.lx; apply(); }                // 元の大きさ：横に引くと次の写真へ（指について動く）
        g.lx = p.x; g.ly = p.y;
      } else if (g.m === "pinch" && P.size >= 2) {
        var a = Array.from(P.values()), d = Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y);
        var ns = Math.max(V.fit, Math.min(V.fit * 6, g.s0 * d / g.d0)), k = ns / g.s0;
        var cx = (a[0].x + a[1].x) / 2, cy = (a[0].y + a[1].y) / 2;
        V.s = ns; V.x = cx - (g.cx - g.x0) * k; V.y = cy - (g.cy - g.y0) * k; clamp(); apply();
      }
    });
    function end(e) {
      if (!P.has(e.pointerId)) return;
      P.delete(e.pointerId);
      if (!g) return;
      if (g.m === "pinch") { if (!P.size) g = null; else g = { m: "idle" }; return; }
      if (P.size || g.m !== "one") { if (!P.size) g = null; return; }
      var gg = g; g = null;
      if (V.s <= V.fit * 1.01) {
        var dx = gg.lx - gg.sx;
        if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(gg.ly - gg.sy)) { var j = idx + (dx < 0 ? 1 : -1); if (j >= 0 && j < items.length) { idx = j; show(); return; } }
        fit();
      }
      if (!gg.moved) {
        var now = Date.now();
        if (now - lastTap < 300) { lastTap = 0; if (V.s > V.fit * 1.01) fit(); else zoomAt(gg.sx, gg.sy, V.fit * 2.5); }
        else lastTap = now;
      }
    }
    st.addEventListener("pointerup", end); st.addEventListener("pointercancel", end); st.addEventListener("lostpointercapture", end);
    st.addEventListener("wheel", function (e) { e.preventDefault(); var p = pos(e); zoomAt(p.x, p.y, V.s * Math.exp(-e.deltaY * 0.002)); }, { passive: false });
  }

  function open(list, start) {
    build();
    items = (list || []).slice(); idx = Math.max(0, Math.min(items.length - 1, start || 0));
    if (!items.length) return;
    box.classList.add("show");
    show();
  }
  function close() {
    if (!box) return;
    box.classList.remove("show");
    loadGen++;
    if (url) { URL.revokeObjectURL(url); url = ""; }
    img.removeAttribute("src");
    items = [];
  }

  global.PhotoView = { VERSION: VERSION, open: open, close: close };
})(window);
