(() => {
  "use strict";
  const K = { tracks: "rpMusicTracks.v1", beats: "rpMusicBeats.v1", releases: "rpMusicReleases.v1", features: "rpMusicFeatures.v1", banner: "rpMusicBanner.v1" };
  const SB_URL = "https://nesxcgymsgegkqjhfydx.supabase.co", SB_KEY = "sb_publishable_Tj4frYyU-iAylsH_--y3Qg_esNYqce-";
  const EDITOR_ROLES = ["Creator", "Music Studio Director", "Music Employee"];
  const DRUMS = [["kick", "🥁 Kick"], ["snare", "🪘 Snare"], ["hihat", "🎩 Hi-Hat"], ["openhat", "🔓 Open Hat"], ["clap", "👏 Clap"], ["tom", "🥁 Tom"]];
  const STEPS = 16;
  const SECTIONS = [["tracks", "Featured tracks"], ["beats", "Beat presets"], ["releases", "Upcoming releases"], ["features", "Features & prices"], ["banner", "Site banner"]];
  const $ = id => document.getElementById(id);
  const read = (k, f) => { try { const v = JSON.parse(localStorage.getItem(k) || "null"); return v == null ? f : v; } catch { return f; } };
  const list = k => { const v = read(K[k], []); return Array.isArray(v) ? v : []; };
  function save(key, value) { try { localStorage.setItem(K[key], JSON.stringify(value)); $("meStatus").textContent = "Saved in this browser"; refreshAll(); return true; } catch { $("meStatus").textContent = "Browser storage full"; return false; } }
  const newId = p => p + "-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7);
  const str = (v, n) => typeof v === "string" ? v.slice(0, n) : "";
  const say = (id, t, bad) => { const n = $(id); n.textContent = t; n.style.color = bad ? "var(--red)" : "var(--green)"; };
  const when = iso => { try { return new Date(iso).toLocaleString(); } catch { return ""; } };
  const price = v => { const n = Number(v); return Number.isSafeInteger(n) && n >= 0 && n <= 1000000 ? n : 0; };
  const priceText = n => n > 0 ? n + " Refane" : "Free";
  const safeLink = v => /^https?:\/\//i.test(v) ? v : "";
  function make(tag, attrs = {}, ...kids) { const n = document.createElement(tag); Object.entries(attrs).forEach(([k, v]) => { if (k === "text") n.textContent = v; else if (k === "class") n.className = v; else n.setAttribute(k, v); }); kids.forEach(c => n.append(c)); return n; }
  const btn = (label, fn, cls) => { const b = make("button", { type: "button", text: label }); if (cls) b.className = cls; b.addEventListener("click", fn); return b; };
  function stable(v) { if (Array.isArray(v)) return "[" + v.map(stable).join(",") + "]"; if (v && typeof v === "object") return "{" + Object.keys(v).sort().map(k => JSON.stringify(k) + ":" + stable(v[k])).join(",") + "}"; return JSON.stringify(v === undefined ? null : v); }

  /* ---------------- navigation ---------------- */
  const VIEWS = { dashboard: "meDashboard", tracks: "meTracks", beats: "meBeats", releases: "meReleases", features: "meFeatures", banner: "meBanner", publish: "mePublish", tutorial: "meTutorial" };
  function showView(name) {
    document.querySelectorAll("[data-view]").forEach(b => { const on = b.dataset.view === name; b.classList.toggle("active", on); b.setAttribute("aria-selected", String(on)); });
    Object.entries(VIEWS).forEach(([v, id]) => { const s = $(id), on = v === name; s.hidden = !on; s.classList.toggle("active", on); });
    if (name !== "beats") stopBeat();
    if (name === "publish") renderPublish();
  }
  document.querySelectorAll("[data-view]").forEach(b => b.addEventListener("click", () => showView(b.dataset.view)));

  /* ---------------- generic list rendering ---------------- */
  function renderRows(rootId, items, key, describe, onEdit, emptyText) {
    const root = $(rootId); root.replaceChildren();
    if (!items.length) { root.append(make("p", { class: "me-empty", text: emptyText })); return; }
    items.forEach(item => {
      const draft = item.status === "draft";
      const title = make("strong", { text: describe(item).title }); title.append(make("span", { class: "me-badge" + (draft ? " draft" : ""), text: draft ? "Draft" : "Published" }));
      const acts = make("div", { class: "acts" }, btn("Edit", () => onEdit(item)),
        btn(draft ? "Publish" : "Make draft", () => { const all = list(key).map(x => x.id === item.id ? { ...x, status: draft ? "published" : "draft" } : x); save(key, all); }),
        btn("Delete", () => { if (confirm("Delete this item from your drafts?")) save(key, list(key).filter(x => x.id !== item.id)); }, "danger"));
      root.append(make("article", { class: "me-row" }, make("div", {}, title, make("span", { class: "meta", text: describe(item).meta })), acts));
    });
  }

  /* ---------------- tracks ---------------- */
  function resetTrack() { $("meTrackForm").reset(); previewPrice("meTrackPrice", "meTrackPricePreview"); $("meTrackId").value = ""; $("meTrackSave").textContent = "Add track"; say("meTrackMsg", ""); }
  $("meTrackForm").addEventListener("submit", e => {
    e.preventDefault();
    const link = safeLink($("meTrackLink").value.trim()); if (!link) return say("meTrackMsg", "The link must start with http:// or https://", true);
    const id = $("meTrackId").value || newId("track");
    const item = { id, title: $("meTrackTitle").value.trim(), artist: $("meTrackArtist").value.trim(), genre: $("meTrackGenre").value, emoji: $("meTrackEmoji").value.trim() || "🎧", link, price: price($("meTrackPrice").value), note: $("meTrackNote").value.trim(), status: $("meTrackStatus").value };
    if (!item.title || !item.artist) return;
    const all = list("tracks"), i = all.findIndex(x => x.id === id); if (i >= 0) all[i] = item; else all.unshift(item);
    if (save("tracks", all)) { resetTrack(); say("meTrackMsg", "Track saved. Open the Publish tab to send it live."); }
  });
  $("meTrackReset").addEventListener("click", resetTrack);
  function editTrack(t) { $("meTrackId").value = t.id; $("meTrackTitle").value = t.title; $("meTrackArtist").value = t.artist; $("meTrackGenre").value = t.genre; $("meTrackEmoji").value = t.emoji; $("meTrackLink").value = t.link; $("meTrackNote").value = t.note || ""; $("meTrackStatus").value = t.status || "published"; $("meTrackPrice").value = price(t.price); previewPrice("meTrackPrice", "meTrackPricePreview"); $("meTrackSave").textContent = "Save changes"; $("meTrackTitle").focus(); }

  /* ---------------- beats + audition synth ---------------- */
  let editPattern = emptyPattern(), ctx = null, playing = false, step = 0, timer = null;
  function emptyPattern() { const p = {}; DRUMS.forEach(([id]) => { p[id] = new Array(STEPS).fill(false); }); return p; }
  function normPattern(p) { const out = emptyPattern(); if (p && typeof p === "object") DRUMS.forEach(([id]) => { if (Array.isArray(p[id])) for (let i = 0; i < STEPS; i++) out[id][i] = p[id][i] === true; }); return out; }
  function audio() { if (!ctx) { const AC = window.AudioContext || window.webkitAudioContext; ctx = new AC(); } if (ctx.state === "suspended") ctx.resume(); return ctx; }
  function noise(c, d) { const b = c.createBuffer(1, Math.floor(c.sampleRate * d), c.sampleRate), a = b.getChannelData(0); for (let i = 0; i < a.length; i++) a[i] = Math.random() * 2 - 1; const s = c.createBufferSource(); s.buffer = b; return s; }
  function env(c, g, t, peak, d) { g.gain.setValueAtTime(peak, t); g.gain.exponentialRampToValueAtTime(0.001, t + d); }
  const SYNTH = {
    kick(c, t) { const o = c.createOscillator(), g = c.createGain(); o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(0.01, t + 0.4); env(c, g, t, 1, 0.4); o.connect(g); g.connect(c.destination); o.start(t); o.stop(t + 0.4); },
    snare(c, t) { const n = noise(c, 0.2), f = c.createBiquadFilter(), g = c.createGain(); f.type = "highpass"; f.frequency.value = 1000; env(c, g, t, 1, 0.2); n.connect(f); f.connect(g); g.connect(c.destination); n.start(t); n.stop(t + 0.2); const o = c.createOscillator(), og = c.createGain(); o.type = "triangle"; o.frequency.value = 180; env(c, og, t, 0.7, 0.12); o.connect(og); og.connect(c.destination); o.start(t); o.stop(t + 0.12); },
    hihat(c, t, open) { const d = open ? 0.35 : 0.06, n = noise(c, d), f = c.createBiquadFilter(), g = c.createGain(); f.type = "highpass"; f.frequency.value = 7000; env(c, g, t, 0.5, d); n.connect(f); f.connect(g); g.connect(c.destination); n.start(t); n.stop(t + d); },
    openhat(c, t) { SYNTH.hihat(c, t, true); },
    clap(c, t) { [0, 0.015, 0.03].forEach(o => { const n = noise(c, 0.08), f = c.createBiquadFilter(), g = c.createGain(); f.type = "bandpass"; f.frequency.value = 1500; env(c, g, t + o, 0.6, 0.08); n.connect(f); f.connect(g); g.connect(c.destination); n.start(t + o); n.stop(t + o + 0.08); }); },
    tom(c, t) { const o = c.createOscillator(), g = c.createGain(); o.frequency.setValueAtTime(220, t); o.frequency.exponentialRampToValueAtTime(90, t + 0.3); env(c, g, t, 0.9, 0.3); o.connect(g); g.connect(c.destination); o.start(t); o.stop(t + 0.3); }
  };
  function renderSeq() {
    const root = $("meSeq"); root.replaceChildren();
    DRUMS.forEach(([id, label]) => {
      const row = make("div", { class: "me-seq-row" }, make("span", { class: "me-seq-label", text: label }));
      for (let i = 0; i < STEPS; i++) {
        const s = make("button", { type: "button", class: "me-step" + (editPattern[id][i] ? " on" : "") + (i % 4 === 0 ? " beat" : ""), "data-step": i, "aria-label": label + " step " + (i + 1), "aria-pressed": String(editPattern[id][i]) });
        s.addEventListener("click", () => { editPattern[id][i] = !editPattern[id][i]; s.classList.toggle("on"); s.setAttribute("aria-pressed", String(editPattern[id][i])); });
        row.append(s);
      }
      root.append(row);
    });
  }
  function loop() {
    if (!playing) return;
    const c = audio(), bpm = Number($("meBeatBpm").value) || 100;
    DRUMS.forEach(([id]) => { if (editPattern[id][step]) SYNTH[id](c, c.currentTime); });
    document.querySelectorAll("#meSeq .me-step.playing").forEach(x => x.classList.remove("playing"));
    document.querySelectorAll('#meSeq .me-step[data-step="' + step + '"]').forEach(x => x.classList.add("playing"));
    step = (step + 1) % STEPS; timer = setTimeout(loop, (60 / bpm / 4) * 1000);
  }
  function stopBeat() { playing = false; clearTimeout(timer); document.querySelectorAll("#meSeq .me-step.playing").forEach(x => x.classList.remove("playing")); const b = $("meBeatPlay"); if (b) b.textContent = "▶ Play"; }
  $("meBeatPlay").addEventListener("click", () => { if (playing) return stopBeat(); playing = true; step = 0; $("meBeatPlay").textContent = "⏸ Stop"; loop(); });
  $("meBeatClear").addEventListener("click", () => { editPattern = emptyPattern(); renderSeq(); });
  $("meBeatBpm").addEventListener("input", () => { $("meBeatBpmOut").textContent = $("meBeatBpm").value + " BPM"; });
  function resetBeat() { $("meBeatForm").reset(); previewPrice("meBeatPrice", "meBeatPricePreview"); $("meBeatId").value = ""; $("meBeatBpm").value = 100; $("meBeatBpmOut").textContent = "100 BPM"; editPattern = emptyPattern(); [0, 4, 8, 12].forEach(i => { editPattern.kick[i] = true; }); [4, 12].forEach(i => { editPattern.snare[i] = true; }); for (let i = 0; i < STEPS; i += 2) editPattern.hihat[i] = true; renderSeq(); $("meBeatSave").textContent = "Add beat"; say("meBeatMsg", ""); }
  $("meBeatForm").addEventListener("submit", e => {
    e.preventDefault();
    const bpm = Math.max(60, Math.min(180, Number($("meBeatBpm").value) || 100));
    if (!DRUMS.some(([id]) => editPattern[id].some(Boolean))) return say("meBeatMsg", "Click at least one step first.", true);
    const id = $("meBeatId").value || newId("beat");
    const item = { id, name: $("meBeatName").value.trim(), bpm, description: $("meBeatDesc").value.trim(), pattern: normPattern(editPattern), price: price($("meBeatPrice").value), status: $("meBeatStatus").value };
    if (!item.name) return;
    const all = list("beats"), i = all.findIndex(x => x.id === id); if (i >= 0) all[i] = item; else all.unshift(item);
    if (save("beats", all)) { resetBeat(); say("meBeatMsg", "Beat saved. Open the Publish tab to send it live."); }
  });
  $("meBeatReset").addEventListener("click", resetBeat);
  function editBeat(b) { stopBeat(); $("meBeatId").value = b.id; $("meBeatName").value = b.name; $("meBeatDesc").value = b.description || ""; $("meBeatBpm").value = b.bpm; $("meBeatBpmOut").textContent = b.bpm + " BPM"; $("meBeatStatus").value = b.status || "published"; $("meBeatPrice").value = price(b.price); previewPrice("meBeatPrice", "meBeatPricePreview"); editPattern = normPattern(b.pattern); renderSeq(); $("meBeatSave").textContent = "Save changes"; $("meBeatName").focus(); }

  /* ---------------- releases ---------------- */
  let relImage = "";
  function showRelImage() { const p = $("meRelPreview"); p.replaceChildren(); if (relImage) p.append(make("img", { src: relImage, alt: "Release banner preview" })); else p.textContent = "Banner preview"; }
  function resetRel() { $("meRelForm").reset(); $("meRelId").value = ""; relImage = ""; showRelImage(); $("meRelSave").textContent = "Add release"; say("meRelMsg", ""); }
  $("meRelBanner").addEventListener("change", e => {
    const f = e.target.files[0]; if (!f) return;
    if (f.size > 3 * 1024 * 1024) return say("meRelMsg", "Choose an image smaller than 3 MB.", true);
    if (!/^image\/(png|jpeg|webp)$/.test(f.type)) return say("meRelMsg", "Use a PNG, JPEG or WebP image.", true);
    const r = new FileReader(); r.onload = () => { relImage = String(r.result); showRelImage(); }; r.readAsDataURL(f);
  });
  $("meRelForm").addEventListener("submit", e => {
    e.preventDefault();
    const id = $("meRelId").value || newId("release");
    const item = { id, name: $("meRelName").value.trim(), subtitle: $("meRelSub").value.trim(), description: $("meRelDesc").value.trim(), releaseAt: $("meRelDate").value, banner: relImage, status: $("meRelStatus").value };
    if (!item.name || !item.description || !item.releaseAt) return;
    const all = list("releases"), i = all.findIndex(x => x.id === id); if (i >= 0) all[i] = item; else all.unshift(item);
    if (save("releases", all)) { resetRel(); say("meRelMsg", "Release saved. Open the Publish tab to send it live."); }
  });
  $("meRelReset").addEventListener("click", resetRel);
  function editRel(r) { $("meRelId").value = r.id; $("meRelName").value = r.name; $("meRelSub").value = r.subtitle || ""; $("meRelDesc").value = r.description; $("meRelDate").value = r.releaseAt || ""; $("meRelStatus").value = r.status || "published"; relImage = r.banner || ""; showRelImage(); $("meRelSave").textContent = "Save changes"; $("meRelName").focus(); }

  /* ---------------- features & pricing ---------------- */
  const DEFAULT_FEATURES = [["Beat Sequencer", "Studio", "Build drum beats with six drum voices and adjustable tempo."], ["Piano & Synth Voices", "Studio", "Play piano, bass and lead synth from the on-screen or computer keyboard."], ["Official Beat Presets", "Library", "Load beats made by the RP Music team into the Studio."], ["Featured Track Showcase", "Showcase", "Listen to tracks picked by RP Music."], ["Submit a Track", "Showcase", "Share a link to your own track in the Showcase."]];
  function defaultFeatures() { return DEFAULT_FEATURES.map(([name, category, description], i) => ({ id: "feature-default-" + i, name, category, description, price: 0, enabled: true })); }
  function features() { const v = read(K.features, null); return Array.isArray(v) ? v.filter(f => f && f.id && f.name) : defaultFeatures(); }
  function previewPrice(inputId, outId) { const n = price($(inputId).value), o = $(outId); o.textContent = priceText(n); o.className = "me-price-preview" + (n > 0 ? " paid" : ""); }
  function renderFeatures() {
    const all = features(), paid = all.filter(f => price(f.price) > 0);
    const tiles = [["Features", String(all.length)], ["Free", String(all.length - paid.length)], ["Paid", String(paid.length)], ["Highest price", paid.length ? Math.max(...paid.map(f => price(f.price))) + " Refane" : "—"]];
    $("meFeatTiles").replaceChildren(...tiles.map(([l, v]) => make("div", { class: "me-tile" }, make("span", { text: l }), make("strong", { text: v }))));
    const root = $("meFeatList"); root.replaceChildren();
    if (!all.length) { root.append(make("p", { class: "me-empty", text: "No features yet." })); return; }
    all.forEach(f => {
      const n = price(f.price), title = make("strong", { text: f.name }); title.append(make("span", { class: "me-badge" + (n > 0 ? " paid" : ""), text: priceText(n) }), f.enabled === false ? make("span", { class: "me-badge draft", text: "Hidden" }) : "");
      const input = make("input", { type: "number", min: "0", max: "1000000", step: "1", value: String(n), "aria-label": "Refane price for " + f.name });
      input.addEventListener("change", () => { const next = features().map(x => x.id === f.id ? { ...x, price: price(input.value) } : x); save("features", next); });
      root.append(make("article", { class: "me-row" }, make("div", {}, title, make("span", { class: "meta", text: f.category + (f.description ? " · " + f.description : "") })),
        make("div", { class: "acts" }, make("label", { class: "me-pricecell" }, "Refane", input),
          btn(f.enabled === false ? "Show" : "Hide", () => save("features", features().map(x => x.id === f.id ? { ...x, enabled: f.enabled === false } : x))),
          btn("Edit", () => { $("meFeatId").value = f.id; $("meFeatName").value = f.name; $("meFeatCategory").value = f.category; $("meFeatPrice").value = n; $("meFeatEnabled").checked = f.enabled !== false; $("meFeatDesc").value = f.description || ""; $("meFeatSave").textContent = "Save changes"; previewPrice("meFeatPrice", "meFeatPricePreview"); $("meFeatName").focus(); }),
          btn("Delete", () => { if (confirm("Delete this feature?")) save("features", features().filter(x => x.id !== f.id)); }, "danger"))));
    });
  }
  function resetFeat() { $("meFeatForm").reset(); $("meFeatId").value = ""; $("meFeatSave").textContent = "Add feature"; previewPrice("meFeatPrice", "meFeatPricePreview"); say("meFeatMsg", ""); }
  $("meFeatForm").addEventListener("submit", e => {
    e.preventDefault();
    const id = $("meFeatId").value || newId("feature"), item = { id, name: $("meFeatName").value.trim(), category: $("meFeatCategory").value, description: $("meFeatDesc").value.trim(), price: price($("meFeatPrice").value), enabled: $("meFeatEnabled").checked };
    if (!item.name) return;
    const all = features(), i = all.findIndex(x => x.id === id); if (i >= 0) all[i] = item; else all.push(item);
    if (save("features", all)) { resetFeat(); say("meFeatMsg", "Feature saved. Open the Publish tab to send it live."); }
  });
  $("meFeatReset").addEventListener("click", resetFeat);
  $("meFeatAllFree").addEventListener("click", () => { if (confirm("Set every feature price to 0 (free)?")) save("features", features().map(f => ({ ...f, price: 0 }))); });
  $("meFeatDefaults").addEventListener("click", () => { if (confirm("Replace the catalog with the default features?")) save("features", defaultFeatures()); });
  [["meFeatPrice", "meFeatPricePreview"], ["meTrackPrice", "meTrackPricePreview"], ["meBeatPrice", "meBeatPricePreview"]].forEach(([a, b]) => $(a).addEventListener("input", () => previewPrice(a, b)));

  /* ---------------- banner ---------------- */
  function renderBannerPreview() {
    const b = read(K.banner, {}), box = $("meBannerPreview");
    box.className = "me-bannerbar " + (["success", "warning"].includes(b.style) ? b.style : "info");
    box.textContent = b.enabled && b.message ? b.message : "Nothing to show (banner is off or empty).";
  }
  function loadBanner() { const b = read(K.banner, {}); $("meBannerMsgText").value = b.message || ""; $("meBannerStyle").value = b.style || "info"; $("meBannerExpires").value = b.expiresAt || ""; $("meBannerOn").checked = !!b.enabled; renderBannerPreview(); }
  $("meBannerForm").addEventListener("submit", e => {
    e.preventDefault();
    const b = { enabled: $("meBannerOn").checked, message: $("meBannerMsgText").value.trim(), style: $("meBannerStyle").value, expiresAt: $("meBannerExpires").value };
    if (b.enabled && !b.message) return say("meBannerMsg", "Write a message or turn the banner off.", true);
    if (save("banner", b)) say("meBannerMsg", "Banner saved. Open the Publish tab to send it live.");
  });

  /* ---------------- snapshot ---------------- */
  function buildSnapshot() {
    const now = Date.now(), b = read(K.banner, {});
    const live = b.enabled && b.message && !(b.expiresAt && new Date(b.expiresAt).getTime() <= now);
    return {
      schema: 1,
      tracks: list("tracks").filter(t => t && t.id && t.title && t.status !== "draft" && safeLink(t.link)).map(t => ({ id: str(t.id, 80), title: str(t.title, 80), artist: str(t.artist, 60), genre: str(t.genre, 20), emoji: str(t.emoji, 8) || "🎧", link: str(t.link, 400), price: price(t.price), note: str(t.note, 200) })),
      beats: list("beats").filter(x => x && x.id && x.name && x.status !== "draft").map(x => ({ id: str(x.id, 80), name: str(x.name, 50), bpm: Math.max(60, Math.min(180, Number(x.bpm) || 100)), description: str(x.description, 140), pattern: normPattern(x.pattern), price: price(x.price) })),
      features: features().filter(f => f.enabled !== false).map(f => ({ id: str(f.id, 80), name: str(f.name, 60), category: str(f.category, 20), description: str(f.description, 300), price: price(f.price) })),
      releases: list("releases").filter(r => r && r.id && r.name && r.status !== "draft").map(r => ({ id: str(r.id, 80), name: str(r.name, 100), subtitle: str(r.subtitle, 140), description: str(r.description, 1200), releaseAt: str(r.releaseAt, 40), banner: typeof r.banner === "string" && r.banner.startsWith("data:image/") ? r.banner : "" })),
      banner: live ? { enabled: true, message: str(b.message, 160), style: ["info", "success", "warning"].includes(b.style) ? b.style : "info", expiresAt: str(b.expiresAt, 40) } : { enabled: false }
    };
  }

  /* ---------------- dashboard ---------------- */
  function renderDashboard() {
    const t = list("tracks"), bt = list("beats"), r = list("releases"), pub = a => a.filter(x => x.status !== "draft").length;
    const tiles = [["Featured tracks", pub(t) + " / " + t.length, "tracks"], ["Beat presets", pub(bt) + " / " + bt.length, "beats"], ["Upcoming releases", pub(r) + " / " + r.length, "releases"], ["Features", features().filter(f => price(f.price) > 0).length + " paid / " + features().length, "features"], ["Banner", (read(K.banner, {}).enabled ? "On" : "Off"), "banner"], ["Live version", live ? "v" + live.version : "—", "publish"]];
    $("meTiles").replaceChildren(...tiles.map(([label, value, view]) => { const b = make("button", { type: "button", class: "me-tile" }, make("span", { text: label }), make("strong", { text: value })); b.addEventListener("click", () => showView(view)); return b; }));
    const steps = [["Feature at least one track", pub(t) > 0], ["Build at least one beat preset", pub(bt) > 0], ["Set Refane prices (0 = free)", read(K.features, null) !== null], ["Tease an upcoming release", pub(r) > 0], ["Publish to everyone", !!live], ["Everything is in sync", !!live && inSync()]];
    $("meChecklist").replaceChildren(...steps.map(([label, done]) => make("li", { class: done ? "done" : "" }, make("span", { class: "tick", text: done ? "✓" : "○" }), make("span", { text: label }))));
  }
  $("meExport").addEventListener("click", () => {
    const data = { app: "rp-music-employee", exportedAt: new Date().toISOString(), tracks: list("tracks"), beats: list("beats"), releases: list("releases"), features: read(K.features, null), banner: read(K.banner, {}) };
    const u = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" })), a = document.createElement("a"); a.href = u; a.download = "rp-music-drafts.json"; a.click(); setTimeout(() => URL.revokeObjectURL(u), 1000);
    $("meBackupMsg").textContent = "Backup downloaded.";
  });
  $("meImport").addEventListener("change", async e => {
    const f = e.target.files[0]; if (!f) return;
    try {
      const d = JSON.parse(await f.text());
      if (!d || d.app !== "rp-music-employee") throw new Error("This is not a Music workspace backup.");
      if (!confirm("Replace your current drafts with this backup?")) return;
      ["tracks", "beats", "releases"].forEach(k => localStorage.setItem(K[k], JSON.stringify(Array.isArray(d[k]) ? d[k] : [])));
      if (Array.isArray(d.features)) localStorage.setItem(K.features, JSON.stringify(d.features)); else localStorage.removeItem(K.features);
      localStorage.setItem(K.banner, JSON.stringify(d.banner && typeof d.banner === "object" ? d.banner : {}));
      refreshAll(); loadBanner(); $("meBackupMsg").textContent = "Backup restored.";
    } catch (err) { $("meBackupMsg").textContent = "Could not restore: " + err.message; }
    e.target.value = "";
  });

  /* ---------------- publish ---------------- */
  let sb = null, account = { state: "checking" }, live = null, liveError = "", publishing = false;
  function client() { if (sb) return sb; if (location.protocol === "file:" || !window.supabase || !window.supabase.createClient) return null; sb = window.supabase.createClient(SB_URL, SB_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } }); return sb; }
  function sectionState(local, remote) {
    const count = v => Array.isArray(v) ? v.length : v && v.enabled ? 1 : 0;
    return SECTIONS.map(([key, label]) => { const a = local[key], b = remote ? remote[key] : undefined; return { key, label, count: count(a), liveCount: remote ? count(b) : 0, same: remote ? stable(a) === stable(b === undefined ? (Array.isArray(a) ? [] : { enabled: false }) : b) : false }; });
  }
  const inSync = () => !!(live && live.snapshot && sectionState(buildSnapshot(), live.snapshot).every(r => r.same));
  function setChip(t, c) { const n = $("mePubChip"); n.textContent = t; n.className = "me-chip " + (c || ""); }
  function updateStatus() {
    if (liveError && !live) setChip("Live site unreachable", "bad"); else if (!live) setChip("Not published yet", "warn"); else if (inSync()) setChip("● Live site in sync (v" + live.version + ")", "ok"); else setChip("● Unpublished changes", "warn");
    renderPublish(); renderDashboard();
  }
  async function fetchLive() {
    try { const r = await fetch(SB_URL + "/rest/v1/rp_music_publications?select=version,published_at,snapshot&order=version.desc&limit=1", { headers: { apikey: SB_KEY, Accept: "application/json" }, cache: "no-store" }); if (!r.ok) throw new Error(r.status === 404 ? "setup" : "HTTP " + r.status); const rows = await r.json(); live = rows.length ? rows[0] : null; liveError = ""; }
    catch (e) { liveError = e.message || "failed"; }
    updateStatus();
  }
  async function loadAccount() {
    const c = client(); if (!c) { account = { state: location.protocol === "file:" ? "file" : "nolib" }; return; }
    try {
      const { data: { session } } = await c.auth.getSession(); if (!session) { account = { state: "signedout" }; return; }
      const { data, error } = await c.rpc("rp_get_account_context"); if (error) { account = { state: "error", message: error.message }; return; }
      const roles = Array.isArray(data.roles) ? data.roles : [];
      account = { state: roles.some(r => EDITOR_ROLES.includes(r)) && data.status === "active" ? "editor" : "noaccess", username: data.username, roles, status: data.status };
    } catch (e) { account = { state: "error", message: e.message }; }
  }
  async function loadHistory() {
    const root = $("pubHistory"); root.replaceChildren();
    if (account.state !== "editor") { root.append(make("li", { class: "me-muted", text: "Sign in as a Music employee to see history." })); return; }
    const { data, error } = await client().from("rp_music_publications").select("version,published_at,note").order("version", { ascending: false }).limit(10);
    if (error || !data) { root.append(make("li", { class: "me-muted", text: "History is unavailable." })); return; }
    if (!data.length) { root.append(make("li", { class: "me-muted", text: "Nothing published yet." })); return; }
    data.forEach(row => root.append(make("li", {}, make("span", { text: "v" + row.version + (row.note ? " · " + row.note : "") }), make("time", { text: when(row.published_at) }), live && row.version === live.version ? make("span", { class: "me-muted", text: "live" }) : btn("Restore", () => republish(row.version)))));
  }
  function explain(error) {
    const m = (error && error.message) || String(error);
    if (/rp_publish_music|rp_republish_music|rp_music_publications|schema cache|does not exist/i.test(m)) return "The shared database is not set up yet. Run index/music-content.sql with npm run migrate in the server folder, then try again.";
    if (/role required/i.test(m)) return "Your account does not have the Music employee role.";
    if (/JWT|not authenticated|permission denied/i.test(m)) return "Your sign-in expired. Sign in again on the main page.";
    return m;
  }
  function renderPublish() {
    const box = $("pubAccount"); box.className = "me-note"; box.replaceChildren();
    switch (account.state) {
      case "editor": box.className = "me-note ok"; box.append("Signed in as " + account.username + ". You can publish."); break;
      case "signedout": box.className = "me-note bad"; box.append(make("a", { href: "../index/index.html", text: "Sign in on the main page" }), " with your employee account, then come back and press Check live version."); break;
      case "noaccess": box.className = "me-note bad"; box.append("Signed in as " + account.username + ", but this account has no Music employee role (" + ((account.roles || []).join(", ") || "none") + "). Ask the Creator to assign one."); break;
      case "file": box.className = "me-note bad"; box.append("Open this page through your website address or localhost. Publishing cannot run from a file:// page."); break;
      case "nolib": box.className = "me-note bad"; box.append("The sign-in library could not load. Check your connection and reload."); break;
      case "error": box.className = "me-note bad"; box.append("Could not check your account: " + account.message); break;
      default: box.append("Checking your sign-in…");
    }
    const local = buildSnapshot(), rows = sectionState(local, live ? live.snapshot : null);
    $("pubSummary").replaceChildren(...rows.map(r => make("li", {}, make("span", { text: r.label + ": " + r.count + (live && r.liveCount !== r.count ? " (live: " + r.liveCount + ")" : "") }), make("span", { class: "tag " + (r.same ? "same" : "changed"), text: r.same ? "Up to date" : (live ? "Changed" : "New") }))));
    const bytes = new Blob([JSON.stringify(local)]).size; $("pubSize").textContent = bytes > 1048576 ? (bytes / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(bytes / 1024)) + " KB";
    const same = live && inSync(); $("pubPublish").disabled = account.state !== "editor" || publishing || !!same; $("pubPublish").textContent = same ? "Already live" : "Publish to everyone";
    $("pubLive").textContent = liveError && !live ? (liveError === "setup" ? "The shared database is not set up yet (run music-content.sql)." : "Could not reach the live site (" + liveError + ").") : live ? "Version " + live.version + ", published " + when(live.published_at) + ". " + (same ? "Your drafts match it." : "Your drafts differ from it.") : "Nothing has been published yet.";
  }
  async function publish() {
    if (publishing || account.state !== "editor") return;
    const snap = buildSnapshot(), bytes = new Blob([JSON.stringify(snap)]).size;
    if (bytes > 7500000) return say("pubMessage", "Too large to publish (over 7.5 MB). Use smaller release banners.", true);
    const changed = sectionState(snap, live ? live.snapshot : null).filter(r => !r.same).map(r => r.label);
    if (!confirm("Publish to everyone?\n\nChanged: " + (changed.join(", ") || "nothing") + ".\nVisitors on every device will see this.")) return;
    publishing = true; renderPublish(); say("pubMessage", "Publishing…");
    const { data, error } = await client().rpc("rp_publish_music", { p_snapshot: snap, p_note: $("pubNote").value.trim() });
    publishing = false; if (error) { say("pubMessage", explain(error), true); renderPublish(); return; }
    $("pubNote").value = ""; say("pubMessage", "Published as version " + data + ". Visitors will see it within about a minute."); await fetchLive(); loadHistory();
  }
  async function republish(version) {
    if (!confirm("Make version " + version + " the live version again?")) return;
    const { data, error } = await client().rpc("rp_republish_music", { p_version: version }); if (error) return say("pubMessage", explain(error), true);
    say("pubMessage", "Version " + version + " is live again (as version " + data + ")."); await fetchLive(); loadHistory();
  }
  async function refreshPublish() { say("pubMessage", ""); await loadAccount(); await fetchLive(); renderPublish(); loadHistory(); }
  $("pubPublish").addEventListener("click", publish); $("pubRefresh").addEventListener("click", refreshPublish); $("mePubChip").addEventListener("click", () => showView("publish"));
  document.addEventListener("visibilitychange", () => { if (!document.hidden) refreshPublish(); });

  /* ---------------- init ---------------- */
  function refreshAll() {
    renderRows("meTrackList", list("tracks"), "tracks", t => ({ title: t.emoji + " " + t.title, meta: t.artist + " · " + t.genre + " · " + priceText(price(t.price)) }), editTrack, "No featured tracks yet.");
    renderRows("meBeatList", list("beats"), "beats", b => ({ title: b.name, meta: priceText(price(b.price)) + " · " + b.bpm + " BPM" + (b.description ? " · " + b.description : "") }), editBeat, "No beat presets yet.");
    renderRows("meRelList", list("releases"), "releases", r => ({ title: r.name, meta: (r.subtitle ? r.subtitle + " · " : "") + (r.releaseAt ? new Date(r.releaseAt).toLocaleString() : "") }), editRel, "No upcoming releases yet.");
    renderFeatures(); renderBannerPreview(); renderDashboard(); if (live !== undefined) updateStatusOnly();
  }
  function updateStatusOnly() { if (liveError && !live) setChip("Live site unreachable", "bad"); else if (!live) setChip("Not published yet", "warn"); else if (inSync()) setChip("● Live site in sync (v" + live.version + ")", "ok"); else setChip("● Unpublished changes", "warn"); if (!$("mePublish").hidden) renderPublish(); }
  resetBeat(); resetRel(); loadBanner(); refreshAll(); showView("dashboard"); refreshPublish();
})();
