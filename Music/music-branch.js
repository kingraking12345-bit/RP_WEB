/* RP Music page: shows what Music employees published (visible to everyone on every device).
 * Loads after the main script in music.html and wraps its Studio / Showcase views. */
(() => {
  "use strict";
  const SB_URL = "https://nesxcgymsgegkqjhfydx.supabase.co", SB_KEY = "sb_publishable_Tj4frYyU-iAylsH_--y3Qg_esNYqce-";
  const CACHE_KEY = "rpMusicPublicCache.v1", SESSION_KEY = "sb-nesxcgymsgegkqjhfydx-auth-token", POLL_MS = 60000;
  const EDITOR_ROLES = ["Creator", "Music Studio Director", "Music Employee"];
  const DRUMS = ["kick", "snare", "hihat", "openhat", "clap", "tom"];
  const PREVIEW = new URLSearchParams(location.search).get("preview") === "local";
  const state = { snapshot: null, version: 0, offline: false };
  const read = (k, f) => { try { const v = JSON.parse(localStorage.getItem(k) || "null"); return v == null ? f : v; } catch { return f; } };
  const arr = v => Array.isArray(v) ? v : [];
  function el(tag, attrs = {}, ...kids) { const n = document.createElement(tag); Object.entries(attrs).forEach(([k, v]) => { if (k === "text") n.textContent = v; else if (k === "class") n.className = v; else n.setAttribute(k, v); }); kids.forEach(c => n.append(c)); return n; }
  const priceOf = v => { const n = Number(v); return Number.isSafeInteger(n) && n > 0 ? n : 0; };
  const priceLabel = v => priceOf(v) > 0 ? priceOf(v) + " Refane" : "Free";
  const DEFAULT_FEATURES = [["Beat Sequencer", "Studio", "Build drum beats with six drum voices and adjustable tempo."], ["Piano & Synth Voices", "Studio", "Play piano, bass and lead synth from the on-screen or computer keyboard."], ["Official Beat Presets", "Library", "Load beats made by the RP Music team into the Studio."], ["Featured Track Showcase", "Showcase", "Listen to tracks picked by RP Music."], ["Submit a Track", "Showcase", "Share a link to your own track in the Showcase."]];
  const safeHttp = v => { try { const u = new URL(v); return u.protocol === "https:" || u.protocol === "http:" ? u.href : ""; } catch { return ""; } };

  /* ---------- content source ---------- */
  function content() {
    if (PREVIEW) {
      const pub = a => arr(a).filter(x => x && x.status !== "draft");
      const b = read("rpMusicBanner.v1", {});
      return { tracks: pub(read("rpMusicTracks.v1", [])), beats: pub(read("rpMusicBeats.v1", [])), releases: pub(read("rpMusicReleases.v1", [])), features: (Array.isArray(read("rpMusicFeatures.v1", null)) ? read("rpMusicFeatures.v1", null) : DEFAULT_FEATURES.map(([name, category, description]) => ({ name, category, description, price: 0 }))).filter(f => f && f.name && f.enabled !== false), banner: b.enabled && b.message && !(b.expiresAt && new Date(b.expiresAt).getTime() <= Date.now()) ? b : null };
    }
    const s = state.snapshot || {};
    return { tracks: arr(s.tracks), beats: arr(s.beats), releases: arr(s.releases), features: arr(s.features), banner: s.banner && s.banner.enabled ? s.banner : null };
  }
  async function api(q) { const r = await fetch(SB_URL + "/rest/v1/rp_music_publications?" + q, { headers: { apikey: SB_KEY, Accept: "application/json" }, cache: "no-store" }); if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); }
  function saveCache() { try { localStorage.setItem(CACHE_KEY, JSON.stringify({ version: state.version, snapshot: state.snapshot })); } catch {} }
  function loadCache() { const c = read(CACHE_KEY, null); if (c && c.snapshot && typeof c.snapshot === "object") { state.snapshot = c.snapshot; state.version = Number(c.version) || 0; } }
  let loaded = false;
  async function syncLive(force) {
    if (PREVIEW) return;
    try {
      const head = await api("select=version&order=version.desc&limit=1"); state.offline = false;
      const latest = head.length ? Number(head[0].version) : 0;
      if (!force && loaded && latest === state.version) return decorate();
      if (!latest) { state.snapshot = null; state.version = 0; loaded = true; return decorate(); }
      const rows = await api("select=version,snapshot&version=eq." + latest + "&limit=1");
      if (rows.length && rows[0].snapshot && typeof rows[0].snapshot === "object") { state.snapshot = rows[0].snapshot; state.version = Number(rows[0].version); saveCache(); }
      loaded = true; decorate();
    } catch { state.offline = true; loaded = true; decorate(); }
  }

  /* ---------- rendering ---------- */
  const screen = document.getElementById("musicBranchScreen"), main = () => document.getElementById("musicMain");
  function clearInjected() { document.querySelectorAll("[data-rp-injected]").forEach(n => n.remove()); }
  const mark = n => { n.setAttribute("data-rp-injected", "1"); return n; };
  const panel = (title, sub) => mark(el("div", { class: "mu-panel" }, el("h2", { text: title }), el("p", { class: "mu-sub", text: sub })));

  function bannerNode(b) {
    const colors = { info: ["rgba(236,72,153,.15)", "#f9a8d4"], success: ["rgba(52,211,153,.15)", "#6ee7b7"], warning: ["rgba(251,191,36,.15)", "#fcd34d"] }[b.style] || ["rgba(236,72,153,.15)", "#f9a8d4"];
    const n = mark(el("div", { role: "status", text: String(b.message || "").slice(0, 160) }));
    n.style.cssText = "padding:10px 24px;text-align:center;font-size:14px;font-weight:600;background:" + colors[0] + ";color:" + colors[1];
    return n;
  }
  function trackCard(t, featured) {
    const card = el("div", { class: "mu-track-card" });
    card.append(el("span", { class: "mu-track-emoji", text: String(t.emoji || "🎧").slice(0, 8) }), el("div", { class: "mu-track-title", text: String(t.title || "") }), el("div", { class: "mu-track-artist", text: "by " + (t.artist || "") }), el("span", { class: "mu-track-genre", text: String(t.genre || "Other") }));
    if (featured) { const pr = el("span", { class: "mu-track-genre", text: priceLabel(t.price) }); pr.style.cssText = "margin-left:6px;" + (priceOf(t.price) > 0 ? "color:#fcd34d" : "color:#6ee7b7"); card.append(pr); }
    if (featured && t.note) card.append(el("div", { class: "mu-sub", text: t.note }));
    const link = safeHttp(t.link || ""), embed = link && embedFor(link);
    if (embed) card.append(embed);
    else if (link) { const a = el("a", { class: "mu-btn secondary", href: link, target: "_blank", rel: "noopener noreferrer", text: "🔗 Listen" }); a.style.cssText = "text-align:center;text-decoration:none"; card.append(a); }
    return card;
  }
  function embedFor(link) {
    try {
      const u = new URL(link), wrap = el("div", { class: "mu-track-embed" }); let src = "", h = 160;
      if (u.hostname.endsWith("youtube.com") || u.hostname === "youtu.be") { const id = u.hostname === "youtu.be" ? u.pathname.slice(1) : (u.searchParams.get("v") || ""); if (/^[\w-]{6,20}$/.test(id)) src = "https://www.youtube.com/embed/" + id; }
      else if (u.hostname.endsWith("soundcloud.com")) { src = "https://w.soundcloud.com/player/?url=" + encodeURIComponent(link); h = 120; }
      if (!src) return null;
      const f = el("iframe", { src, width: "100%", height: String(h), frameborder: "0", allowfullscreen: "", loading: "lazy", referrerpolicy: "no-referrer", sandbox: "allow-scripts allow-same-origin allow-presentation" }); wrap.append(f); return wrap;
    } catch { return null; }
  }
  function releasesPanel(list) {
    const p = panel("🚀 Coming soon", "Upcoming drops from RP Music.");
    const grid = el("div", { class: "mu-track-grid" });
    list.forEach(r => {
      const c = el("div", { class: "mu-track-card" });
      if (typeof r.banner === "string" && r.banner.startsWith("data:image/")) { const i = el("img", { src: r.banner, alt: String(r.name) + " banner" }); i.style.cssText = "width:100%;height:110px;object-fit:cover;border-radius:8px"; c.append(i); }
      c.append(el("div", { class: "mu-track-title", text: String(r.name || "") }));
      if (r.subtitle) c.append(el("div", { class: "mu-track-artist", text: r.subtitle }));
      c.append(el("div", { class: "mu-sub", text: String(r.description || "") }), el("span", { class: "mu-track-genre", text: r.releaseAt ? "Releases " + new Date(r.releaseAt).toLocaleString() : "Date to be announced" }));
      grid.append(c);
    });
    p.append(grid); return p;
  }
  function beatsPanel(list) {
    const p = panel("🎼 Official beats", "Made by RP Music. Load one into the sequencer above, press Play, then change it however you like.");
    const grid = el("div", { class: "mu-track-grid" });
    list.forEach(b => {
      const c = el("div", { class: "mu-track-card" }, el("div", { class: "mu-track-title", text: String(b.name || "") }), el("span", { class: "mu-track-genre", text: (Number(b.bpm) || 100) + " BPM · " + priceLabel(b.price) }));
      if (b.description) c.append(el("div", { class: "mu-sub", text: String(b.description) }));
      if (priceOf(b.price) > 0) c.append(el("div", { class: "mu-sub", text: "Costs " + priceOf(b.price) + " Refane. Purchases are not enabled yet, so you can try it for now." }));
      const load = el("button", { type: "button", class: "mu-btn", text: "Load into Studio" }); load.addEventListener("click", () => loadBeat(b)); c.append(load); grid.append(c);
    });
    p.append(grid); return p;
  }
  function featuresPanel(list) {
    const p = panel("💎 Features & Refane prices", "Refane is RP's virtual currency. Items marked Free cost nothing. Purchases are not enabled yet, so paid items show their price only.");
    const grid = el("div", { class: "mu-track-grid" });
    list.forEach(f => {
      const n = priceOf(f.price), c = el("div", { class: "mu-track-card" }, el("div", { class: "mu-track-title", text: String(f.name || "") }), el("span", { class: "mu-track-genre", text: String(f.category || "Other") }));
      if (f.description) c.append(el("div", { class: "mu-sub", text: String(f.description) }));
      const price = el("strong", { text: n > 0 ? n + " Refane" : "Free" }); price.style.color = n > 0 ? "#fcd34d" : "#6ee7b7"; c.append(price); grid.append(c);
    });
    p.append(grid); return p;
  }
  function loadBeat(b) {
    try {
      if (typeof musicStopSequencer === "function") musicStopSequencer();
      const p = {}; DRUMS.forEach(id => { p[id] = new Array(16).fill(false); if (b.pattern && Array.isArray(b.pattern[id])) for (let i = 0; i < 16; i++) p[id][i] = b.pattern[id][i] === true; });
      musicPattern = p; musicBpm = Math.max(60, Math.min(180, Number(b.bpm) || 100));
      const s = document.getElementById("musicBpmSlider"), v = document.getElementById("musicBpmValue"); if (s) s.value = musicBpm; if (v) v.textContent = musicBpm;
      musicRenderSequencer(); if (typeof showToast === "function") showToast("Loaded “" + b.name + "”. Press Play!");
      const seq = document.getElementById("musicSeqGrid"); if (seq) seq.scrollIntoView({ behavior: "smooth", block: "center" });
    } catch {}
  }
  function decorate() {
    clearInjected(); const m = main(); if (!m) return;
    const c = content(), onShowcase = document.getElementById("musicNavShowcase").classList.contains("active");
    const nav = screen.querySelector("nav"); if (c.banner) nav.after(bannerNode(c.banner));
    if (onShowcase) {
      if (c.tracks.length) { const p = panel("⭐ Featured by RP Music", "Hand-picked tracks from the RP Music team."), g = el("div", { class: "mu-track-grid" }); c.tracks.forEach(t => g.append(trackCard(t, true))); p.append(g); m.prepend(p); }
      if (c.releases.length) m.prepend(releasesPanel(c.releases));
    } else {
      if (c.beats.length && m.children[0]) m.children[0].after(beatsPanel(c.beats));
      if (c.releases.length) m.append(releasesPanel(c.releases));
      if (c.features.length) m.append(featuresPanel(c.features));
    }
    const note = mark(el("p", { class: "mu-sub", text: PREVIEW ? "Preview of your local drafts. Visitors only see what you publish." : state.offline ? "Offline: showing the last version saved on this device." : state.version ? "Live version " + state.version + "." : "" }));
    note.style.cssText = "text-align:center;margin:0 0 14px"; if (note.textContent) m.append(note);
  }

  /* ---------- safe replacement for the visitor-submitted track grid ---------- */
  window.musicRenderTrackGrid = function () {
    const grid = document.getElementById("musicTrackGrid"); if (!grid) return; grid.replaceChildren();
    const tracks = typeof MUSIC_TRACKS !== "undefined" ? MUSIC_TRACKS : [];
    if (!tracks.length) { grid.append(el("div", { class: "mu-empty", text: "No tracks submitted yet — be the first! 🎧" })); return; }
    tracks.slice().reverse().forEach(t => grid.append(trackCard(t, false)));
  };

  /* ---------- wrap the two views ---------- */
  const origStudio = window.musicGoStudio, origShowcase = window.musicGoShowcase;
  window.musicGoStudio = function () { origStudio(); decorate(); };
  window.musicGoShowcase = function () { origShowcase(); decorate(); };

  /* ---------- employee link ---------- */
  const link = el("a", { class: "mu-nav-btn", id: "musicEmployeeLink", href: "music-employee.html", text: "🎛 Employee workspace" });
  link.style.cssText = "display:none;text-decoration:none"; screen.querySelector("nav").insertBefore(link, document.getElementById("musicSubmitOpenBtn"));
  async function updateEmployeeLink() {
    if (PREVIEW) { link.style.display = ""; return; }
    let stored = null; try { stored = JSON.parse(localStorage.getItem(SESSION_KEY) || "null"); } catch {}
    const token = stored && typeof stored.access_token === "string" ? stored.access_token : "";
    if (!token || Number(stored.expires_at) * 1000 < Date.now()) return;
    try {
      const r = await fetch(SB_URL + "/rest/v1/rpc/rp_get_account_context", { method: "POST", headers: { apikey: SB_KEY, Authorization: "Bearer " + token, "Content-Type": "application/json" }, body: "{}" });
      if (!r.ok) return; const a = await r.json(), roles = Array.isArray(a.roles) ? a.roles : [];
      if (a.status === "active" && roles.some(x => EDITOR_ROLES.includes(x))) link.style.display = "";
    } catch {}
  }

  if (!PREVIEW) { loadCache(); loaded = !!state.snapshot; }
  updateEmployeeLink(); syncLive(true);
  if (!PREVIEW) { setInterval(() => { if (!document.hidden) syncLive(false); }, POLL_MS); window.addEventListener("online", () => syncLive(false)); }
  document.addEventListener("visibilitychange", () => { if (!document.hidden) PREVIEW ? decorate() : syncLive(false); });
  window.addEventListener("storage", () => { if (PREVIEW) decorate(); });
})();
