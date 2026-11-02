/* Site footer for every page: Company, Explore and Work with us links, plus the Coder link for developers. */
(() => {
  "use strict";
  const path = location.pathname.toLowerCase();
  if (window.__rpFoot || /\/(index\.html|coder\.html)$/.test(path) || /\/index\/?$/.test(path) || /-employee\.html$/.test(path)) return; window.__rpFoot = 1;
  const URL_ = "https://nesxcgymsgegkqjhfydx.supabase.co", KEY = "sb_publishable_Tj4frYyU-iAylsH_--y3Qg_esNYqce-";
  const m = path.match(/\/(games|tools|music|education|skills|community|labs)\//), branch = m ? m[1] : (new URLSearchParams(location.search).get("branch") || "rp");
  const base = m ? "../index/" : "", q = branch === "rp" ? "" : "&branch=" + encodeURIComponent(branch);
  const token = () => { try { const v = JSON.parse(localStorage.getItem("sb-nesxcgymsgegkqjhfydx-auth-token") || "null"); return v && v.access_token || ""; } catch { return ""; } };
  const call = async (fn, args) => { const t = token(); if (!t) return null; try { const r = await fetch(URL_ + "/rest/v1/rpc/" + fn, { method: "POST", headers: { apikey: KEY, Authorization: "Bearer " + t, "Content-Type": "application/json" }, body: JSON.stringify(args || {}) }); return r.ok ? r.json() : null; } catch { return null; } };
  const mk = () => {
    if (!document.querySelector('link[href$="rp-ui.css"]')) { const l = document.createElement("link"); l.rel = "stylesheet"; l.href = base + "rp-ui.css"; document.head.append(l); }
    const f = document.createElement("footer"); f.className = "rp-foot";
    f.innerHTML = '<div class="rp-foot-in"><div><a class="rp-wordmark" href="' + base + 'index.html"><i class="rp-mark">RP</i>Raking Productions</a><p style="margin:14px 0 0;max-width:34ch">One studio making games, tools, music and ways to learn.</p></div>' +
      '<div><b>Company</b><a href="' + base + 'info.html?kind=about' + q + '">About RP</a><a href="' + base + 'info.html?kind=contact' + q + '">Contact us</a><a href="' + base + 'info.html?kind=policy' + q + '">Policies</a></div>' +
      '<div><b>Explore</b><a href="' + base + 'news.html">RP News</a><a href="' + base + 'index.html">All branches</a></div>' +
      '<div><b>Work with us</b><a href="' + base + 'apply.html' + (branch === "rp" ? "" : "?branch=" + encodeURIComponent(branch)) + '" data-apply>Careers<span class="rp-dot" hidden></span></a></div></div>' +
      '<div class="rp-fine"><span>© ' + new Date().getFullYear() + ' Raking Productions. All rights reserved.</span><span>Refane is the virtual currency of Raking Productions.</span></div>';
    document.body.append(f);
    if (!token()) return;
    if (branch !== "rp") call("rp_is_branch_dev", { p_branch: branch }).then(ok => { if (ok === true) f.querySelector(".rp-foot-in > div:nth-child(4)").insertAdjacentHTML("beforeend", '<a href="' + base + 'coder.html?branch=' + branch + '">Coder (Dev Team)</a>'); });
    call("rp_my_notifications", { p_limit: 20 }).then(rows => { const n = (rows || []).filter(r => !r.read).length; const d = f.querySelector(".rp-dot"); if (n && d) { d.textContent = n; d.hidden = false; } });
  };
  if (document.body) mk(); else document.addEventListener("DOMContentLoaded", mk);
})();
