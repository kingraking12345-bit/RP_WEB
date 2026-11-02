/* RP site loader. Must be the FIRST script in <head> of every page.
   Applies Creator code overrides (saved from Creator > Code) to this page and to the scripts/styles it uses.
   Emergency exit: add ?rpsafe=1 to any page address to ignore all overrides. ?rpsafe=0 turns overrides back on. */
(function () {
  "use strict";
  var SB_URL = "https://nesxcgymsgegkqjhfydx.supabase.co", SB_KEY = "sb_publishable_Tj4frYyU-iAylsH_--y3Qg_esNYqce-", CACHE = "rpSiteCode.v1", DRAFT = "rpSiteDraft.v1";
  var applied = !!window.__rpSiteApplied, q;
  try { q = new URLSearchParams(location.search); } catch (e) { return; }
  var safe = false; try { if (q.get("rpsafe") === "1") sessionStorage.setItem("rpSafe", "1"); if (q.get("rpsafe") === "0") sessionStorage.removeItem("rpSafe"); safe = sessionStorage.getItem("rpSafe") === "1"; } catch (e) { safe = q.get("rpsafe") === "1"; }
  var draftMode = q.get("rpdraft") === "1";
  function read(k) { try { var v = JSON.parse(localStorage.getItem(k) || "null"); return v && typeof v === "object" ? v : null; } catch (e) { return null; } }
  function keyOf(u) { try { var p = new URL(u, location.href).pathname.split("/").filter(Boolean).map(decodeURIComponent); return p.slice(-2).join("/"); } catch (e) { return ""; } }
  var cache = read(CACHE) || { files: {} }; if (!cache.files || typeof cache.files !== "object") cache.files = {};
  var BLOCKED = "index/rp-site-loader.js";

  function apply() {
    var files = {}; Object.keys(cache.files).forEach(function (p) { if (cache.files[p] && typeof cache.files[p].c === "string") files[p] = cache.files[p].c; });
    if (draftMode) { var d = read(DRAFT); if (d && d.files) Object.keys(d.files).forEach(function (p) { if (d.files[p] && typeof d.files[p].c === "string") files[p] = d.files[p].c; }); }
    delete files[BLOCKED]; if (!Object.keys(files).length) return false;
    var page = keyOf(location.href), html = files[page], changed = html !== undefined;
    if (html === undefined) {
      try { var x = new XMLHttpRequest(); x.open("GET", location.href.split("#")[0], false); x.send(); if (x.status !== 200) return false; html = x.responseText; } catch (e) { return false; }
    }
    html = html.replace(/<script\b([^>]*?)\bsrc\s*=\s*(["'])(.*?)\2([^>]*)>\s*<\/script>/gi, function (m, a, qt, src, b) {
      var k = keyOf(src); if (/^https?:\/\//i.test(src) && src.indexOf(location.origin) !== 0) return m; if (!k || k === BLOCKED || files[k] === undefined || k === page) return m;
      changed = true; return "<script" + a + b + ">" + files[k].replace(/<\/script/gi, "<\\/script") + "</script>";
    });
    html = html.replace(/<link\b([^>]*)>/gi, function (m, attrs) {
      if (!/\brel\s*=\s*["']?stylesheet/i.test(attrs)) return m; var h = attrs.match(/\bhref\s*=\s*(["'])(.*?)\1/i); if (!h) return m; if (/^https?:\/\//i.test(h[2]) && h[2].indexOf(location.origin) !== 0) return m;
      var k = keyOf(h[2]); if (!k || files[k] === undefined) return m; changed = true; return "<style>" + files[k].replace(/<\/style/gi, "<\\/style") + "</style>";
    });
    if (!changed) return false;
    window.__rpSiteApplied = true;
    // Empty the half-parsed original first, then write the edited page on the next tick. Writing immediately lets the
    // browser's original parser keep running the rest of the old page next to the new one (double scripts, redeclared constants).
    document.documentElement.innerHTML = ""; setTimeout(function () { document.open(); document.write(html); document.close(); }, 0); return true;
  }
  if (!safe && !applied) { try { if (apply()) return; /* the page was rewritten; this loader runs again at the top of the new document */ } catch (e) { /* fall through to the normal page */ } }

  /* ---- keep the cache fresh (runs once per page load) ---- */
  if (safe || draftMode || window.__rpSiteChecked) return; window.__rpSiteChecked = true;
  function headers() { return { apikey: SB_KEY, Accept: "application/json" }; }
  function revalidate() {
    fetch(SB_URL + "/rest/v1/rp_site_files?select=path,version&enabled=eq.true", { headers: headers(), cache: "no-store" }).then(function (r) { return r.ok ? r.json() : null; }).then(function (rows) {
      if (!Array.isArray(rows)) return; var want = {}, changed = []; rows.forEach(function (r) { want[r.path] = r.version; if (!cache.files[r.path] || cache.files[r.path].v !== r.version) changed.push(r.path); });
      var removed = Object.keys(cache.files).filter(function (p) { return !(p in want); }); if (!changed.length && !removed.length) return;
      var get = changed.length ? fetch(SB_URL + "/rest/v1/rp_site_files?select=path,version,content&path=in." + encodeURIComponent("(" + changed.map(function (p) { return '"' + p + '"'; }).join(",") + ")"), { headers: headers(), cache: "no-store" }).then(function (r) { return r.ok ? r.json() : []; }) : Promise.resolve([]);
      get.then(function (full) {
        removed.forEach(function (p) { delete cache.files[p]; }); (full || []).forEach(function (f) { cache.files[f.path] = { v: f.version, c: f.content }; });
        try { localStorage.setItem(CACHE, JSON.stringify(cache)); } catch (e) { return; }
        var sig = JSON.stringify(want); try { if (sessionStorage.getItem("rpSiteSig") === sig) return; sessionStorage.setItem("rpSiteSig", sig); } catch (e) { return; }
        location.reload();
      });
    }).catch(function () { /* offline or not set up: keep what we have */ });
  }
  if (document.readyState === "complete") revalidate(); else window.addEventListener("load", revalidate);
})();
