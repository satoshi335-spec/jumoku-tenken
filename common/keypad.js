/* 街路樹診断システム — 数字入力用のテンキー（事前調査アプリと同じ操作感）
   iPadの標準キーボードの代わりに、画面下に大きなテンキーを出す。
   株立ちは「＋幹」で各幹の周長を続けて入力（例 45+30 → 合計×0.7）。

   使い方:
     SysKeypad.attach(input, {
       label: "今回の幹周り", unit: "cm",
       kabu: true,                  // ＋幹キーを出す
       get: () => "45+30",          // 開いたときの入力値（省略時は input.value）
       set: raw => {...},           // キーを押すたびに呼ばれる（省略時は input.value に入れて input イベント）
       canEdit: () => true,         // false のときは開かない
       next: otherInput             // 決定キーを「次へ」にする
     });
*/
(function (global) {
  "use strict";

  var VERSION = 1;
  var CSS =
    "#sysPad{position:fixed;left:0;right:0;bottom:0;z-index:60;background:#F1F0EA;border-top:1px solid #C9C7BD;" +
    "box-shadow:0 -4px 16px rgba(0,0,0,.12);padding:8px 10px calc(env(safe-area-inset-bottom) + 8px);display:none;" +
    "font-family:-apple-system,'Hiragino Sans','Yu Gothic UI',sans-serif;-webkit-user-select:none;user-select:none}" +
    "#sysPad.show{display:block}" +
    "#sysPad .in{max-width:560px;margin:0 auto}" +
    "#sysPad .hd{display:flex;align-items:baseline;gap:8px;margin:0 2px 6px}" +
    "#sysPad .lb{font-size:13px;color:#6b6a64;white-space:nowrap}" +
    "#sysPad .dp{flex:1;font-size:26px;font-weight:700;color:#1c1c1a;background:#fff;border:2px solid #185FA5;border-radius:10px;" +
    "padding:4px 10px;min-height:46px;display:flex;align-items:baseline;gap:6px;overflow:hidden;white-space:nowrap}" +
    "#sysPad .dp small{font-size:14px;color:#6b6a64;font-weight:400}" +
    "#sysPad .nt{font-size:12px;color:#185FA5;font-weight:600;margin:0 2px 6px;min-height:15px}" +
    "#sysPad .ks{display:grid;grid-template-columns:repeat(4,1fr);gap:6px}" +
    "#sysPad .ks button{min-height:52px;font-size:22px;border-radius:10px;border:1px solid #D8D6CC;background:#fff;color:#1c1c1a;" +
    "font-family:inherit;-webkit-tap-highlight-color:transparent;touch-action:manipulation}" +
    "#sysPad .ks button:active{background:#E3E2DA}" +
    "#sysPad .ks button.fn{font-size:15px;background:#F7F6F1}" +
    "#sysPad .ks button.ok{grid-column:span 2;background:#0F6E56;color:#fff;border:none;font-size:17px;font-weight:600}" +
    "#sysPad .ks button.hid{visibility:hidden}" +
    "input.sysPadField{caret-color:transparent;cursor:pointer}" +
    "input.sysPadField.padOn{outline:3px solid #185FA5;outline-offset:1px}";

  var pad, dp, nt, lb, okBtn, plusBtn, cur = null, raw = "";

  function el(tag, cls, txt) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (txt != null) e.textContent = txt;
    return e;
  }

  function build() {
    if (pad) return;
    var st = document.createElement("style");
    st.textContent = CSS;
    document.head.appendChild(st);
    pad = el("div");
    pad.id = "sysPad";
    var inn = el("div", "in");
    var hd = el("div", "hd");
    lb = el("span", "lb");
    dp = el("div", "dp");
    hd.appendChild(lb); hd.appendChild(dp);
    nt = el("div", "nt");
    var ks = el("div", "ks");
    [["7"], ["8"], ["9"], ["⌫", "bs", "fn"],
     ["4"], ["5"], ["6"], ["＋幹", "plus", "fn"],
     ["1"], ["2"], ["3"], ["消去", "clr", "fn"],
     ["0"], ["."], ["決定", "ok", "ok"]].forEach(function (k) {
      var b = el("button", k[2] || "", k[0]);
      b.type = "button";
      if (k[1]) b.setAttribute("data-k", k[1]);
      if (k[1] === "ok") okBtn = b;
      if (k[1] === "plus") plusBtn = b;
      ks.appendChild(b);
    });
    // 指を離したときではなく押した瞬間に反応させる（連打しやすく、下の画面に抜けない）
    ks.addEventListener("pointerdown", function (e) {
      var b = e.target.closest("button");
      if (!b) return;
      e.preventDefault();
      press(b.getAttribute("data-k") || b.textContent);
    });
    inn.appendChild(hd); inn.appendChild(nt); inn.appendChild(ks);
    pad.appendChild(inn);
    document.body.appendChild(pad);
    // テンキーと入力欄以外に触れたら閉じる
    document.addEventListener("pointerdown", function (e) {
      if (!cur) return;
      if (pad.contains(e.target)) return;
      if (e.target.classList && e.target.classList.contains("sysPadField")) return;
      close();
    }, true);
  }

  function parts(s) {
    return String(s || "").split("+").map(function (x) { return parseFloat(x); }).filter(function (v) { return v > 0; });
  }
  /* 株立ち：2本以上なら合計×0.7（事前調査・樹木点検と同じ計算） */
  function girthOf(s) {
    var p = parts(s);
    if (p.length < 2) return { c: p.length ? p[0] : null, kabu: false, stems: p, note: "" };
    var c = Math.round(p.reduce(function (a, b) { return a + b; }, 0) * 0.7 * 10) / 10;
    return { c: c, kabu: true, stems: p,
             note: "株立ち" + p.length + "本立ち　幹周り＝(" + p.join("＋") + ")×0.7＝" + c + "cm" };
  }

  function render() {
    var o = cur.opts;
    var unit = o.unit ? "<small>" + o.unit + "</small>" : "";
    if (!raw) { dp.innerHTML = '<small>数字を入力</small>'; nt.textContent = ""; return; }
    var txt = raw.replace(/\+/g, " ＋ ");
    if (o.kabu) {
      var g = girthOf(raw);
      dp.innerHTML = esc(txt) + (g.kabu ? "<small>→ " + g.c + " " + (o.unit || "") + "</small>" : unit);
      nt.textContent = g.note;
    } else {
      dp.innerHTML = esc(txt) + unit;
      nt.textContent = "";
    }
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

  function apply() {
    var o = cur.opts;
    if (o.set) o.set(raw, o.kabu ? girthOf(raw) : null);
    else {
      cur.input.value = raw;
      cur.input.dispatchEvent(new Event("input", { bubbles: true }));
      cur.input.dispatchEvent(new Event("change", { bubbles: true }));
    }
    render();
  }

  function press(k) {
    if (!cur) return;
    var o = cur.opts;
    if (k === "ok") { var nx = o.next; close(); if (nx) open(nx); return; }
    if (o.canEdit && !o.canEdit()) { close(); return; }
    if (k === "bs") raw = raw.slice(0, -1);
    else if (k === "clr") raw = "";
    else if (k === "plus") { if (!o.kabu) return; if (raw && raw.slice(-1) !== "+" && parts(raw).length < 8) raw += "+"; }
    else if (/^[0-9.]$/.test(k)) {
      var last = raw.split("+").pop();
      if (k === "." && (last.indexOf(".") > -1 || !last)) return;
      if (last.replace(".", "").length >= (o.maxDigits || 4)) return;
      raw += k;
    } else return;
    apply();
  }

  function open(input) {
    var f = input && input._sysPad;
    if (!f) return;
    if (f.opts.canEdit && !f.opts.canEdit()) return;
    build();
    if (cur && cur !== f) cur.input.classList.remove("padOn");
    cur = f;
    raw = String(f.opts.get ? f.opts.get() : input.value || "");
    lb.textContent = f.opts.label || "";
    plusBtn.classList.toggle("hid", !f.opts.kabu);
    okBtn.textContent = f.opts.next ? "次へ ▶" : "決定";
    input.classList.add("padOn");
    pad.classList.add("show");
    render();
    // 入力欄がテンキーに隠れないよう、下に余白を作ってからスクロール
    document.body.style.paddingBottom = (pad.offsetHeight + 20) + "px";
    var r = input.getBoundingClientRect(), limit = window.innerHeight - pad.offsetHeight - 16;
    if (r.bottom > limit || r.top < 60) window.scrollBy({ top: r.bottom - limit + 40, behavior: "smooth" });
  }

  function close() {
    if (!cur) return;
    cur.input.classList.remove("padOn");
    if (cur.opts.onClose) cur.opts.onClose();
    cur = null;
    if (pad) pad.classList.remove("show");
    document.body.style.paddingBottom = "";
  }

  function attach(input, opts) {
    if (!input) return;
    input._sysPad = { input: input, opts: opts || {} };
    if (input.type === "number") input.type = "text";   // 入力途中の「3.」を消されないように
    input.readOnly = true;                    // iPadのキーボードを出さない
    input.setAttribute("inputmode", "none");
    input.classList.add("sysPadField");
    var go = function (e) { e.preventDefault(); input.blur(); open(input); };
    input.addEventListener("click", go);
    input.addEventListener("focus", function () { input.blur(); open(input); });
  }

  global.SysKeypad = { VERSION: VERSION, attach: attach, open: open, close: close, girthOf: girthOf };
})(window);
