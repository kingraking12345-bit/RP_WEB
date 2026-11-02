/* Sets the branch accent and theme as early as possible, then applies the Creator's branch settings (colour, tone, corners, banner, maintenance, login). */
(function () {
  var p = location.pathname.toLowerCase(), m = p.match(/\/(games|tools|music|education|skills|community|labs)\//), b = m ? m[1] : /\/news\.html$/.test(p) ? "news" : /\/coder\.html$/.test(p) ? "coder" : "rp", Q = new URLSearchParams(location.search), root = document.documentElement;
  try { var q = Q.get("branch"); if (!m && q && /^[a-z0-9-]{2,31}$/.test(q) && q !== "rp") b = q; } catch (e) { /* ignore */ }
  var onBranchPage = /\/branch\.html$/.test(p), slug = onBranchPage ? (Q.get("b") || "") : (/^(news|coder|rp)$/.test(b) ? "" : b);
  root.setAttribute("data-branch", /^(games|tools|music|education|skills|community|labs|news|coder|rp)$/.test(b) ? b : "rp");
  var CK = "rp-branches-cache", SK = "sb-nesxcgymsgegkqjhfydx-auth-token", HOST = "https://nesxcgymsgegkqjhfydx.supabase.co", KEY = "sb_publishable_Tj4frYyU-iAylsH_--y3Qg_esNYqce-";
  function read() { try { var a = JSON.parse(localStorage.getItem(CK) || "null"); return Array.isArray(a) ? a : null; } catch (e) { return null; } }
  function hexRgb(h) { var n = parseInt(h.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
  function ink(h) { var c = hexRgb(h); return (c[0] * 299 + c[1] * 587 + c[2] * 114) / 1000 > 150 ? "#0a0d13" : "#ffffff"; }
  function find(list, s) { for (var i = 0; i < (list || []).length; i++) if (list[i].slug === s) return list[i]; return null; }
  /* a sub-branch inherits unset colour and look from the closest parent that has one */
  function resolve(list, s) { var n = 0, row = find(list, s), out = { accent: "", tone: "", radius: "" }, cur = row; while (cur && n++ < 8) { if (!out.accent && cur.accent) out.accent = cur.accent; if (!out.tone && cur.tone && cur.tone !== "graphite") out.tone = cur.tone; if (!out.radius && cur.radius && cur.radius !== "rounded") out.radius = cur.radius; cur = cur.parent ? find(list, cur.parent) : null; } return { row: row, theme: out }; }
  function apply(list) {
    if (!slug || !list) return; var r = resolve(list, slug); if (!r.row) return; var t = r.theme;
    if (/^#[0-9a-fA-F]{6}$/.test(t.accent)) { var c = hexRgb(t.accent); root.style.setProperty("--accent", t.accent); root.style.setProperty("--accent-soft", "rgba(" + c.join(",") + ",.14)"); root.style.setProperty("--accent-ink", ink(t.accent)); }
    if (t.tone) root.setAttribute("data-tone", t.tone); if (t.radius) root.setAttribute("data-radius", t.radius);
    root.__rpBranch = r.row; if (document.body) decorate(); else document.addEventListener("DOMContentLoaded", decorate);
  }
  function chain(list, s) { var out = [], n = 0, cur = find(list, s); while (cur && n++ < 8) { out.unshift(cur); cur = cur.parent ? find(list, cur.parent) : null; } return out; }
  function decorate() {
    var row = root.__rpBranch, list = read(); if (!row || document.getElementById("rpBranchBanner")) return;
    var trail = chain(list, row.slug), msg = trail.map(function (x) { return x.banner; }).filter(Boolean).pop();
    if (msg) { var d = document.createElement("div"); d.id = "rpBranchBanner"; d.textContent = msg; d.style.cssText = "background:var(--accent-soft);color:var(--text);border-bottom:1px solid var(--border);padding:8px 16px;text-align:center;font:600 .86rem system-ui,sans-serif"; document.body.insertBefore(d, document.body.firstChild); }
    var maint = trail.filter(function (x) { return x.maintenance; })[0], need = trail.some(function (x) { return x.requires_login; }), signed = false; try { signed = !!localStorage.getItem(SK); } catch (e) { /* ignore */ }
    if (Q.get("rpbypass") === "1") return;
    if (maint || (need && !signed)) {
      var o = document.createElement("div"); o.id = "rpBranchGate"; o.style.cssText = "position:fixed;inset:0;z-index:99998;background:var(--bg);display:grid;place-items:center;padding:24px;text-align:center;font-family:system-ui,sans-serif;color:var(--text)";
      var h = document.createElement("div"); h.style.maxWidth = "460px"; var t1 = document.createElement("h1"); t1.textContent = maint ? maint.name + " is under maintenance" : "Sign in to open " + row.name; var t2 = document.createElement("p"); t2.style.color = "var(--muted)"; t2.textContent = maint ? (maint.maintenance_note || "We are working on it. Please come back soon.") : "This branch is for signed-in members. Sign in on the main page, then come back.";
      var a = document.createElement("a"); a.href = (location.pathname.indexOf("/index/") >= 0 ? "" : "../index/") + "index.html"; a.textContent = "Go to the main page"; a.style.cssText = "display:inline-block;margin-top:10px;padding:10px 18px;border-radius:8px;background:var(--accent);color:var(--accent-ink);text-decoration:none;font-weight:700";
      h.append(t1, t2, a); o.append(h); document.body.appendChild(o);
    }
  }
  var cached = read(); apply(cached);
  /* refresh in the background; the new theme shows on the next page view (or at once if nothing was cached) */
  function refresh() {
    var h = { apikey: KEY, Accept: "application/json" }; try { var s = JSON.parse(localStorage.getItem(SK) || "null"); h.Authorization = "Bearer " + (s && s.access_token ? s.access_token : KEY); } catch (e) { h.Authorization = "Bearer " + KEY; }
    fetch(HOST + "/rest/v1/rp_branches?select=*&order=sort.asc", { headers: h }).then(function (r) { return r.ok ? r.json() : null; }).then(function (a) {
      if (!Array.isArray(a)) return; var before = localStorage.getItem(CK), now = JSON.stringify(a); try { localStorage.setItem(CK, now); } catch (e) { /* ignore */ }
      window.dispatchEvent(new CustomEvent("rp-branches", { detail: a })); if (!before) apply(a);
    }).catch(function () { /* offline: keep the cache */ });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", function () { setTimeout(refresh, 0); }); else setTimeout(refresh, 0);
  window.RPBranchUI = { read: read, chain: function (s) { return chain(read(), s); }, resolve: function (s) { return resolve(read(), s); } };
})();
