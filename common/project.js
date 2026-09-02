/* 街路樹診断システム — 案件（プロジェクト）共有ライブラリ
   同一オリジンの launcher / tenken / gaikan で案件情報を共有する。
   localStorage:
     sys_projects : 案件の配列
     sys_current  : 現在の案件ID
   既存アプリのロジックには触れず、読み込み後に値を流し込むだけの設計。 */
(function (global) {
  "use strict";

  var VERSION = 5;   // project.js を直したら1つ増やす（画面下に表示される）
  var KEY_P = "sys_projects", KEY_C = "sys_current";

  var TERM_PRESETS = {
    A: { key: "A", label: "樹木点検 / 外観診断 / 機器診断", s1: "樹木点検", s2: "外観診断", s3: "機器診断" },
    B: { key: "B", label: "簡易診断 / 初期診断 / 精密診断", s1: "簡易診断", s2: "初期診断", s3: "精密診断" }
  };

  function load(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch (e) { return d; } }
  function store(k, v) { localStorage.setItem(k, JSON.stringify(v)); }

  function all() { return load(KEY_P, []); }
  function saveAll(list) { store(KEY_P, list); }

  function current() {
    var id = load(KEY_C, null);
    var list = all();
    return list.find(function (p) { return p.id === id; }) || null;
  }

  function setCurrent(id) { store(KEY_C, id); }

  function newId() { return "p" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

  function upsert(p) {
    var list = all();
    if (!p.id) { p.id = newId(); p.created = Date.now(); }
    var i = list.findIndex(function (x) { return x.id === p.id; });
    if (i > -1) list[i] = p; else list.push(p);
    saveAll(list);
    return p;
  }

  function remove(id) {
    saveAll(all().filter(function (p) { return p.id !== id; }));
    if (load(KEY_C, null) === id) store(KEY_C, null);
  }

  function terms(p) {
    if (!p) return TERM_PRESETS.A;
    if (p.terms && p.terms.s1) return p.terms;
    return TERM_PRESETS[p.termPreset || "A"] || TERM_PRESETS.A;
  }

  /* 案件が持つ路線名の一覧（事務所PCで街路樹台帳を取り込むと入る） */
  function routeNames(p) {
    var rs = (p && p.routes) || [];
    return rs.map(function (r) { return typeof r === "string" ? r : (r && r.name) || ""; })
             .filter(function (n) { return !!n; });
  }

  /* 案件をエクスポート（PCハブへの受け渡し用） */
  function exportJson() {
    return JSON.stringify({ type: "gairoju-projects", version: 1, projects: all() }, null, 2);
  }

  function importJson(text) {
    var d = JSON.parse(text);
    var incoming = Array.isArray(d) ? d : (d.projects || []);
    if (!incoming.length) throw new Error("案件データが見つかりません");
    var list = all();
    incoming.forEach(function (p) {
      if (!p.id) p.id = newId();
      var i = list.findIndex(function (x) { return x.id === p.id; });
      if (i > -1) list[i] = p; else list.push(p);
    });
    saveAll(list);
    return incoming.length;
  }

  /* ===== 現場アプリ側に差し込む案件バー =====
     app: "tenken" | "gaikan"
     opts.apply(project) : そのアプリ固有の値流し込み処理 */
  function attachBar(app, opts) {
    opts = opts || {};
    var p = current();
    var t = terms(p);
    var stage = app === "gaikan" ? t.s2 : t.s1;

    var bar = document.createElement("div");
    bar.id = "sysBar";
    bar.style.cssText =
      "display:flex;align-items:center;gap:8px;padding:7px 12px;background:#08403A;color:#fff;" +
      "font-size:13px;font-family:-apple-system,'Hiragino Sans','Yu Gothic UI',sans-serif;" +
      "position:sticky;top:0;z-index:30;min-height:34px;box-sizing:border-box";

    var nameHtml = p
      ? '<b style="font-weight:600">' + esc(p.name) + "</b>" +
        '<span style="opacity:.75;margin-left:8px">' + esc(stage) + "</span>"
      : '<span style="color:#FFD9A0">案件が未選択です</span>';

    bar.innerHTML =
      '<span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + nameHtml + "</span>" +
      '<a href="../" style="color:#fff;background:rgba(255,255,255,.16);border-radius:7px;' +
      'padding:6px 12px;text-decoration:none;white-space:nowrap">案件切替</a>';

    function insert() {
      document.body.insertBefore(bar, document.body.firstChild);
      if (p && typeof opts.apply === "function") {
        try { opts.apply(p, t); } catch (e) { console.warn("案件の流し込みに失敗:", e); }
      }
    }
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", insert);
    else insert();
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  /* 入力欄に値を入れて、アプリ側の change/input ハンドラを起動する */
  function setField(id, value, evt) {
    var el = document.getElementById(id);
    if (!el || value == null || value === "") return false;
    if (el.value === value) return false;
    el.value = value;
    el.dispatchEvent(new Event(evt || "change", { bubbles: true }));
    return true;
  }

  global.SysProject = {
    VERSION: VERSION,
    TERM_PRESETS: TERM_PRESETS,
    all: all, current: current, setCurrent: setCurrent, upsert: upsert, remove: remove,
    terms: terms, exportJson: exportJson, importJson: importJson,
    routeNames: routeNames, attachBar: attachBar, setField: setField, esc: esc
  };
})(window);
