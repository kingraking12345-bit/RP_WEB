/* Loads either the local in-browser backend or the PostgreSQL API client, depending on rp-config.js. Must be a plain blocking script in <head>, before rp-site-loader.js. */
(function () {
  var me = document.currentScript, base = me && me.src ? me.src.replace(/[^\/]*$/, "") : "", mode = window.RP_BACKEND || "local";
  try { var q = new URLSearchParams(location.search).get("backend"); if (q === "local" || q === "postgres") { mode = q; localStorage.setItem("rp-backend-override", q); } else { var o = localStorage.getItem("rp-backend-override"); if (o === "local" || o === "postgres") mode = o; } } catch (e) { /* ignore */ }
  if (mode === "supabase") mode = "postgres"; /* old bookmarks / saved choices */
  window.RP_MODE = mode;
  function s(u) { document.write('<script src="' + u + '"><\/script>'); }
  if (mode === "postgres") { s(base + "pg/client.js"); return; }
  ["core", "accounts", "publish", "kit", "community", "branches"].forEach(function (n) { s(base + "local/" + n + ".js"); });
  document.addEventListener("DOMContentLoaded", function () {
    if (document.getElementById("rpLocalBadge")) return; var b = document.createElement("div"); b.id = "rpLocalBadge";
    b.style.cssText = "position:fixed;left:10px;bottom:10px;z-index:99999;font:600 11px system-ui,sans-serif;background:#e3a63f;color:#1a1200;padding:4px 9px;border-radius:99px;opacity:.92;cursor:pointer";
    b.textContent = "LOCAL TEST MODE"; b.title = "Test mode: data is stored in this browser only. Click to reset all local data."; b.onclick = function () { if (confirm("Erase ALL local test data (accounts, content, posts) in this browser?")) RPLocal.reset(); }; document.body.appendChild(b);
  });
})();
