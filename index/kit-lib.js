/* Shared helpers for the RP Branch Kit pages (news, info, apply, coder). Needs the supabase-js script tag before it. */
(() => {
  "use strict";
  const URL_ = "https://nesxcgymsgegkqjhfydx.supabase.co", KEY = "sb_publishable_Tj4frYyU-iAylsH_--y3Qg_esNYqce-";
  const BRANCHES = { rp: "Raking Productions", games: "Games", tools: "Tools", music: "Music", education: "Education", skills: "Skills", community: "Community", labs: "Labs" };
  const FOLDERS = { games: "Games", tools: "Tools", music: "Music", education: "Education", skills: "Skills", community: "Community", labs: "Labs" };
  const sb = window.supabase.createClient(URL_, KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } });
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const safeUrl = u => /^https:\/\/[^\s"'<>]+$/i.test(u || "") ? u : "";
  const inline = t => esc(t).replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>").replace(/\[([^\]]+)\]\((https:\/\/[^\s)"'<>&]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  function md(text) {
    const out = []; let list = false; const close = () => { if (list) { out.push("</ul>"); list = false; } };
    String(text || "").split(/\r?\n/).forEach(line => {
      if (/^\s*[-*] /.test(line)) { if (!list) { out.push("<ul>"); list = true; } out.push("<li>" + inline(line.replace(/^\s*[-*] /, "")) + "</li>"); return; }
      close(); if (/^### /.test(line)) out.push("<h3>" + inline(line.slice(4)) + "</h3>"); else if (/^## /.test(line)) out.push("<h2>" + inline(line.slice(3)) + "</h2>"); else if (/^# /.test(line)) out.push("<h2>" + inline(line.slice(2)) + "</h2>"); else if (line.trim()) out.push("<p>" + inline(line) + "</p>");
    }); close(); return '<div class="k-md">' + out.join("") + "</div>";
  }
  async function user() { const { data } = await sb.auth.getSession(); return data.session ? data.session.user : null; }
  async function rpc(name, args) { const { data, error } = await sb.rpc(name, args || {}); if (error) throw new Error(error.message || "Request failed"); return data; }
  let ctx = null;
  async function account() { if (ctx) return ctx; if (!(await user())) return null; try { ctx = await rpc("rp_get_account_context"); } catch { ctx = null; } return ctx; }
  const roles = a => (a && (a.roles || (a.account && a.account.roles))) || [];
  const params = () => Object.fromEntries(new URLSearchParams(location.search));
  const $ = (s, r = document) => r.querySelector(s);
  function topbar(active) {
    const b = new URLSearchParams(location.search).get("branch") || "rp"; const q = b !== "rp" ? "&branch=" + encodeURIComponent(b) : "";
    const link = (id, label, href) => `<a href="${href}" class="${active === id ? "on" : ""}">${label}</a>`;
    document.body.insertAdjacentHTML("afterbegin", `<header class="k-top"><a class="brand" href="index.html"><i class="rp-mark">RP</i>Raking Productions</a><nav>${link("policy", "Policy", "info.html?kind=policy" + q)}${link("about", "About RP", "info.html?kind=about" + q)}${link("contact", "Contact Us", "info.html?kind=contact" + q)}${link("news", "📰 News", "news.html")}${link("apply", "I want to apply", "apply.html" + (b !== "rp" ? "?branch=" + b : ""))}</nav><a class="k-pill" href="index.html">← Main site</a></header>`);
  }
  /* sub-branches from the branch tree join the list, indented under their parent; sub-branches use their main branch's folder and roles */
  const ready = (async () => { try { const { data } = await sb.from("rp_branches").select("slug,parent,name,sort").order("sort"); if (!data) return; const by = Object.fromEntries(data.map(b => [b.slug, b])); const mains = new Set(Object.keys(FOLDERS));
    Object.keys(BRANCHES).forEach(k => { if (k !== "rp") delete BRANCHES[k]; }); const walk = (p, d) => data.filter(b => (b.parent || null) === p).sort((a, b) => a.sort - b.sort).forEach(b => { BRANCHES[b.slug] = "\u00a0\u00a0".repeat(d) + b.name; walk(b.slug, d + 1); }); walk(null, 0);
    data.forEach(b => { let c = b, n = 0; while (c && !mains.has(c.slug) && n++ < 8) c = by[c.parent]; if (c && !FOLDERS[b.slug]) FOLDERS[b.slug] = FOLDERS[c.slug]; }); } catch (e) { /* keep the built-in list */ } })();
  window.RPK = { ready, sb, rpc, user, account, roles, esc, md, safeUrl, params, $, topbar, BRANCHES, FOLDERS };
})();
