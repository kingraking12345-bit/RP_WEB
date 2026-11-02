/* RP Games Employee Workspace - advanced modules
   Dashboard, Features & Refane pricing, Patch notes, Roadmap, Site banner, Backup.
   Loads after game-employee.js and script-studio.js. Data stays in this browser (localStorage). */
(() => {
  const KEYS = {
    tabs: "rpGamesManagedTabs.v1",
    events: "rpGamesEvents.v1",
    features: "rpGamesFeatures.v1",
    patches: "rpGamesPatchNotes.v1",
    roadmap: "rpGamesRoadmap.v1",
    banner: "rpGamesBanner.v1",
    checklist: "rpGamesChecklist.v1",
    activity: "rpGamesActivity.v1",
    studio: "rpGamesScriptStudio.v1",
    lastBackup: "rpGamesLastBackup.v1"
  };
  const BACKUP_KEYS = ["tabs", "events", "features", "patches", "roadmap", "banner", "checklist", "activity", "studio"];
  const ARRAY_KEYS = new Set(["tabs", "events", "features", "patches", "roadmap", "activity"]);
  const MAX_PRICE = 1000000;
  const REFANE_PER_DOLLAR = 100; // matches the pack table on refane.html ($1 = 100 Refane)

  const $ = id => document.getElementById(id);
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `rp-${Date.now()}-${Math.random().toString(36).slice(2)}`);

  function read(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (raw === null) return fallback;
      const value = JSON.parse(raw);
      if (Array.isArray(fallback)) return Array.isArray(value) ? value : fallback;
      return value && typeof value === "object" && !Array.isArray(value) ? value : fallback;
    } catch { return fallback; }
  }
  function write(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
  }
  function say(id, text, error = false) {
    const node = $(id); if (!node) return;
    node.textContent = text; node.style.color = error ? "var(--ee-red)" : "var(--ee-green)";
  }
  function make(tag, props = {}, ...children) {
    const node = document.createElement(tag);
    Object.entries(props).forEach(([k, v]) => {
      if (k === "class") node.className = v;
      else if (k === "text") node.textContent = v;
      else if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
      else node.setAttribute(k, v);
    });
    children.flat().forEach(c => { if (c !== null && c !== undefined) node.append(c); });
    return node;
  }
  function button(label, onClick, cls = "") { return make("button", { type: "button", class: cls, text: label, onclick: onClick }); }
  function emptyNote(text) { return make("p", { class: "ee-empty", text }); }
  function when(value) {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? "" : d.toLocaleString();
  }
  function day(value) {
    const d = new Date(`${value}T00:00:00`);
    return Number.isNaN(d.getTime()) ? "No date" : d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  }
  function todayInput() {
    const d = new Date();
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  }
  function normalizePrice(value) {
    const n = Math.floor(Number(value));
    if (!Number.isFinite(n) || n < 0) return 0;
    return Math.min(n, MAX_PRICE);
  }
  function priceLabel(price) { return price > 0 ? `${price.toLocaleString()} Refane` : "Free"; }
  function priceWithDollars(price) {
    if (price <= 0) return "Free";
    return `${price.toLocaleString()} Refane (≈ $${(price / REFANE_PER_DOLLAR).toFixed(2)} at pack rates)`;
  }
  const later = fn => setTimeout(fn, 0); // re-render after the current focus/blur events finish
  function goTo(panel) { const b = document.querySelector(`.ee-tabs [data-panel="${panel}"]`); if (b) b.click(); }

  /* ---------------- Activity log ---------------- */
  function log(message) {
    const items = read(KEYS.activity, []);
    items.unshift({ t: new Date().toISOString(), msg: String(message).slice(0, 160) });
    write(KEYS.activity, items.slice(0, 40));
    renderDashboard();
    if (typeof updatePublishStatus === "function") updatePublishStatus();
  }
  window.addEventListener("rp-ee-activity", e => log(e.detail));

  /* ---------------- Features & Refane pricing ---------------- */
  const DEFAULT_FEATURES = [
    ["Game Library", "Library", "Save, organise and revisit your published games.", "Studio"],
    ["Project Wizard", "Studio", "Guided setup for a new game project.", "Studio"],
    ["Script Studio", "Studio", "In-browser code editor with files and folders.", "Studio"],
    ["Game Design Document", "Planning", "Structured GDD with sections and export.", "Planning"],
    ["Quest & Mission Designer", "Planning", "Design quests, objectives and rewards.", "Planning"],
    ["Dialogue & Cutscene Planner", "Planning", "Plan branching dialogue and cutscenes.", "Planning"],
    ["Bug Tracker", "Production", "Track bugs by severity and status.", "Production"],
    ["Release Notes Generator", "Production", "Turn change lists into polished release notes.", "Production"],
    ["Project Analytics", "Analytics", "Charts and trends for your project.", "Analytics"],
    ["Roblox Game Linking", "Community", "Link a website project to a Roblox experience.", "Community"],
    ["Team Workspace", "Production", "Roles, tasks and discussions for your team.", "Production"],
    ["Asset Library", "Production", "Organise art, audio and file links.", "Production"]
  ].map(([name, , description, category]) => ({ id: uid(), name, category, description, price: 0, enabled: true, updatedAt: new Date().toISOString() }));

  function loadFeatures() {
    if (localStorage.getItem(KEYS.features) === null) write(KEYS.features, DEFAULT_FEATURES);
    return read(KEYS.features, []);
  }
  function saveFeatures(list) {
    if (!write(KEYS.features, list)) { say("featMessage", "Browser storage is full or unavailable.", true); return false; }
    return true;
  }
  function updateFeaturePreview() {
    const price = normalizePrice($("featPrice").value);
    $("featPricePreview").textContent = priceWithDollars(price);
    $("featPricePreview").classList.toggle("paid", price > 0);
  }
  function clearFeatureForm() {
    $("featForm").reset(); $("featId").value = ""; $("featEnabled").checked = true;
    $("featSave").textContent = "Add feature"; updateFeaturePreview();
  }
  function renderFeatureTiles() {
    const list = loadFeatures(), paid = list.filter(f => f.price > 0);
    const total = paid.reduce((sum, f) => sum + f.price, 0);
    const tiles = [
      ["Features", list.length], ["Free", list.length - paid.length], ["Paid", paid.length],
      ["Avg paid price", paid.length ? `${Math.round(total / paid.length).toLocaleString()} Refane` : "—"],
      ["Full catalog", total ? `${total.toLocaleString()} Refane` : "Free"]
    ];
    $("featTiles").replaceChildren(...tiles.map(([label, value]) => make("div", { class: "pro-tile" }, make("span", { text: label }), make("strong", { text: String(value) }))));
  }
  function renderFeatures() {
    const list = loadFeatures(), root = $("featList");
    root.replaceChildren();
    renderFeatureTiles();
    if (!list.length) { root.append(emptyNote("No features yet. Add one above or reset to defaults.")); return; }
    list.forEach(f => {
      const priceInput = make("input", { type: "number", min: "0", max: String(MAX_PRICE), step: "1", value: String(f.price), "aria-label": `Refane price for ${f.name}`, class: "pro-price-input" });
      const badge = make("span", { class: `pro-badge ${f.price > 0 ? "paid" : "free"}`, text: priceLabel(f.price) });
      priceInput.addEventListener("change", () => {
        const next = normalizePrice(priceInput.value);
        const all = loadFeatures(), target = all.find(x => x.id === f.id);
        if (!target) return;
        target.price = next; target.updatedAt = new Date().toISOString();
        if (saveFeatures(all)) { log(`Set price of “${f.name}” to ${priceLabel(next)}`); later(renderFeatures); }
      });
      const toggle = make("input", { type: "checkbox", "aria-label": `Show ${f.name} on the Games branch` });
      toggle.checked = f.enabled !== false;
      toggle.addEventListener("change", () => {
        const all = loadFeatures(), target = all.find(x => x.id === f.id);
        if (!target) return;
        target.enabled = toggle.checked;
        if (saveFeatures(all)) { log(`${toggle.checked ? "Showed" : "Hid"} feature “${f.name}”`); later(renderFeatures); }
      });
      const info = make("div", {}, make("strong", { text: f.name }), make("span", { text: `${f.category || "Other"} · ${f.description || "No description"}` }));
      const price = make("label", { class: "pro-price-cell" }, make("span", { text: "Refane" }), priceInput, badge);
      const show = make("label", { class: "pro-inline pro-show" }, toggle, " Visible");
      const actions = make("div", { class: "ee-list-actions" },
        button("Edit", () => {
          $("featId").value = f.id; $("featName").value = f.name; $("featCategory").value = f.category || "Other";
          $("featPrice").value = f.price; $("featDescription").value = f.description || ""; $("featEnabled").checked = f.enabled !== false;
          $("featSave").textContent = "Save feature"; updateFeaturePreview();
          document.querySelector('[data-panel="features"]').click(); window.scrollTo({ top: 0, behavior: "smooth" });
        }),
        button("Delete", () => {
          if (!confirm(`Delete the feature “${f.name}”?`)) return;
          if (saveFeatures(loadFeatures().filter(x => x.id !== f.id))) { log(`Deleted feature “${f.name}”`); renderFeatures(); }
        }, "ee-danger"));
      root.append(make("article", { class: "ee-list-item pro-feature-row" }, info, price, show, actions));
    });
  }
  $("featPrice").addEventListener("input", updateFeaturePreview);
  $("featForm").addEventListener("submit", event => {
    event.preventDefault();
    const rawPrice = Number($("featPrice").value);
    if (!Number.isFinite(rawPrice) || rawPrice < 0 || rawPrice > MAX_PRICE) { say("featMessage", `Price must be between 0 and ${MAX_PRICE.toLocaleString()}.`, true); return; }
    const list = loadFeatures(), id = $("featId").value || uid(), existing = list.find(f => f.id === id);
    const item = { id, name: $("featName").value.trim(), category: $("featCategory").value, description: $("featDescription").value.trim(), price: normalizePrice(rawPrice), enabled: $("featEnabled").checked, updatedAt: new Date().toISOString() };
    if (!item.name) { say("featMessage", "Enter a feature name.", true); return; }
    const next = existing ? list.map(f => (f.id === id ? item : f)) : [...list, item];
    if (!saveFeatures(next)) return;
    log(`${existing ? "Updated" : "Added"} feature “${item.name}” (${priceLabel(item.price)})`);
    renderFeatures(); clearFeatureForm(); say("featMessage", `Saved. “${item.name}” is ${item.price > 0 ? `${priceLabel(item.price)}` : "free"}.`);
  });
  $("featReset").addEventListener("click", () => { clearFeatureForm(); say("featMessage", ""); });
  $("featAllFree").addEventListener("click", () => {
    const list = loadFeatures();
    if (!list.some(f => f.price > 0)) { say("featMessage", "Everything is already free."); return; }
    if (!confirm("Set every feature price to 0 (free)?")) return;
    if (saveFeatures(list.map(f => ({ ...f, price: 0, updatedAt: new Date().toISOString() })))) { log("Made all features free"); renderFeatures(); say("featMessage", "All features are now free."); }
  });
  $("featDefaults").addEventListener("click", () => {
    if (!confirm("Replace the whole catalog with the default feature list (all free)? Your custom features and prices will be lost.")) return;
    if (saveFeatures(DEFAULT_FEATURES.map(f => ({ ...f, id: uid() })))) { log("Reset feature catalog to defaults"); renderFeatures(); say("featMessage", "Catalog reset to defaults."); }
  });

  /* ---------------- Patch notes ---------------- */
  function patchTags() { return [...document.querySelectorAll('input[name="patchTag"]:checked')].map(i => i.value); }
  function clearPatchForm() {
    $("patchForm").reset(); $("patchId").value = ""; $("patchDate").value = todayInput();
    $("patchSave").textContent = "Add patch notes";
  }
  function patchMarkdown(list) {
    return list.map(p => `## ${p.version} — ${p.title}\n*${day(p.date)}*${p.tags.length ? ` · ${p.tags.join(", ")}` : ""}\n\n${p.body.split("\n").map(l => l.trim()).filter(Boolean).map(l => `- ${l}`).join("\n")}\n`).join("\n");
  }
  function renderPatches() {
    const list = read(KEYS.patches, []).sort((a, b) => String(b.date).localeCompare(String(a.date)));
    const root = $("patchList"); root.replaceChildren();
    if (!list.length) { root.append(emptyNote("No patch notes yet.")); return; }
    list.forEach(p => {
      const info = make("div", {}, make("strong", { text: `${p.version} — ${p.title}${p.status === "draft" ? "  (DRAFT)" : ""}` }),
        make("span", { text: `${day(p.date)}${p.tags.length ? ` · ${p.tags.join(", ")}` : ""} · ${p.body.split("\n").filter(l => l.trim()).length} changes` }));
      const actions = make("div", { class: "ee-list-actions" },
        button(p.status === "draft" ? "Publish" : "Unpublish", () => {
          const all = read(KEYS.patches, []), t = all.find(x => x.id === p.id); if (!t) return;
          t.status = t.status === "draft" ? "published" : "draft"; t.updatedAt = new Date().toISOString();
          if (write(KEYS.patches, all)) { log(`${t.status === "published" ? "Published" : "Unpublished"} patch notes ${t.version}`); renderPatches(); }
        }),
        button("Edit", () => {
          $("patchId").value = p.id; $("patchVersion").value = p.version; $("patchDate").value = p.date; $("patchTitle").value = p.title;
          $("patchBody").value = p.body; $("patchStatus").value = p.status === "draft" ? "draft" : "published";
          document.querySelectorAll('input[name="patchTag"]').forEach(i => { i.checked = p.tags.includes(i.value); });
          $("patchSave").textContent = "Save patch notes"; document.querySelector('[data-panel="patch"]').click(); window.scrollTo({ top: 0, behavior: "smooth" });
        }),
        button("Delete", () => {
          if (!confirm(`Delete patch notes ${p.version}?`)) return;
          if (write(KEYS.patches, read(KEYS.patches, []).filter(x => x.id !== p.id))) { log(`Deleted patch notes ${p.version}`); renderPatches(); }
        }, "ee-danger"));
      root.append(make("article", { class: "ee-list-item" }, info, actions));
    });
  }
  $("patchForm").addEventListener("submit", event => {
    event.preventDefault();
    const list = read(KEYS.patches, []), id = $("patchId").value || uid(), existing = list.find(p => p.id === id);
    const item = { id, version: $("patchVersion").value.trim(), date: $("patchDate").value, title: $("patchTitle").value.trim(), tags: patchTags(), body: $("patchBody").value.trim(), status: $("patchStatus").value === "draft" ? "draft" : "published", updatedAt: new Date().toISOString() };
    if (!item.version || !item.title || !item.body || !item.date) { say("patchMessage", "Version, date, title and changes are required.", true); return; }
    const next = existing ? list.map(p => (p.id === id ? item : p)) : [...list, item];
    if (!write(KEYS.patches, next)) { say("patchMessage", "Browser storage is full or unavailable.", true); return; }
    log(`${existing ? "Updated" : "Added"} patch notes ${item.version}${item.status === "draft" ? " (draft)" : ""}`);
    renderPatches(); clearPatchForm(); say("patchMessage", "Patch notes saved.");
  });
  $("patchReset").addEventListener("click", () => { clearPatchForm(); say("patchMessage", ""); });
  $("patchExport").addEventListener("click", () => {
    const published = read(KEYS.patches, []).filter(p => p.status !== "draft").sort((a, b) => String(b.date).localeCompare(String(a.date)));
    if (!published.length) { say("patchMessage", "No published patch notes to export.", true); return; }
    download("rp-games-patch-notes.md", `# RP Games patch notes\n\n${patchMarkdown(published)}`, "text/markdown;charset=utf-8");
    say("patchMessage", "Markdown downloaded.");
  });

  /* ---------------- Roadmap ---------------- */
  const ROAD_LABEL = { planned: "Planned", progress: "In progress", shipped: "Shipped", paused: "Paused" };
  const ROAD_ORDER = { progress: 0, planned: 1, shipped: 2, paused: 3 };
  function clearRoadForm() { $("roadForm").reset(); $("roadId").value = ""; $("roadSave").textContent = "Add roadmap item"; }
  function renderRoadmap() {
    const list = read(KEYS.roadmap, []).sort((a, b) => (ROAD_ORDER[a.status] ?? 9) - (ROAD_ORDER[b.status] ?? 9) || String(a.quarter).localeCompare(String(b.quarter)));
    const root = $("roadList"); root.replaceChildren();
    if (!list.length) { root.append(emptyNote("No roadmap items yet.")); return; }
    list.forEach(r => {
      const info = make("div", {}, make("strong", { text: r.title }), make("span", { text: `${ROAD_LABEL[r.status] || "Planned"}${r.quarter ? ` · ${r.quarter}` : ""}${r.description ? ` · ${r.description}` : ""}` }));
      const select = make("select", { "aria-label": `Status of ${r.title}` }, ...Object.entries(ROAD_LABEL).map(([v, l]) => make("option", { value: v, text: l })));
      select.value = r.status;
      select.addEventListener("change", () => {
        const all = read(KEYS.roadmap, []), t = all.find(x => x.id === r.id); if (!t) return;
        t.status = select.value; t.updatedAt = new Date().toISOString();
        if (write(KEYS.roadmap, all)) { log(`Roadmap “${r.title}” → ${ROAD_LABEL[t.status]}`); later(renderRoadmap); }
      });
      const actions = make("div", { class: "ee-list-actions" }, select,
        button("Edit", () => {
          $("roadId").value = r.id; $("roadTitle").value = r.title; $("roadQuarter").value = r.quarter || ""; $("roadStatus").value = r.status; $("roadDescription").value = r.description || "";
          $("roadSave").textContent = "Save roadmap item"; document.querySelector('[data-panel="roadmap"]').click(); window.scrollTo({ top: 0, behavior: "smooth" });
        }),
        button("Delete", () => {
          if (!confirm(`Delete the roadmap item “${r.title}”?`)) return;
          if (write(KEYS.roadmap, read(KEYS.roadmap, []).filter(x => x.id !== r.id))) { log(`Deleted roadmap item “${r.title}”`); renderRoadmap(); }
        }, "ee-danger"));
      root.append(make("article", { class: "ee-list-item" }, info, actions));
    });
  }
  $("roadForm").addEventListener("submit", event => {
    event.preventDefault();
    const list = read(KEYS.roadmap, []), id = $("roadId").value || uid(), existing = list.find(r => r.id === id);
    const item = { id, title: $("roadTitle").value.trim(), quarter: $("roadQuarter").value.trim(), status: $("roadStatus").value, description: $("roadDescription").value.trim(), updatedAt: new Date().toISOString() };
    if (!item.title) { say("roadMessage", "Enter a title.", true); return; }
    if (!write(KEYS.roadmap, existing ? list.map(r => (r.id === id ? item : r)) : [...list, item])) { say("roadMessage", "Browser storage is full or unavailable.", true); return; }
    log(`${existing ? "Updated" : "Added"} roadmap item “${item.title}”`);
    renderRoadmap(); clearRoadForm(); say("roadMessage", "Roadmap item saved.");
  });
  $("roadReset").addEventListener("click", () => { clearRoadForm(); say("roadMessage", ""); });

  /* ---------------- Site banner ---------------- */
  function toLocalInput(value) {
    const d = new Date(value); if (Number.isNaN(d.getTime())) return "";
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  }
  function paintBanner() {
    const box = $("bannerPreviewBox"), text = $("bannerMessage").value.trim();
    box.className = `pro-banner-preview full ${$("bannerStyle").value}`;
    box.textContent = text || "Banner preview";
  }
  function loadBanner() {
    const b = read(KEYS.banner, {});
    $("bannerMessage").value = b.message || ""; $("bannerStyle").value = ["info", "success", "warning"].includes(b.style) ? b.style : "info";
    $("bannerExpires").value = b.expiresAt ? toLocalInput(b.expiresAt) : ""; $("bannerEnabled").checked = !!b.enabled; paintBanner();
  }
  ["bannerMessage", "bannerStyle"].forEach(id => $(id).addEventListener("input", paintBanner));
  $("bannerForm").addEventListener("submit", event => {
    event.preventDefault();
    const message = $("bannerMessage").value.trim(), expires = $("bannerExpires").value;
    if ($("bannerEnabled").checked && !message) { say("bannerMessageOut", "Enter a message before showing the banner.", true); return; }
    const b = { enabled: $("bannerEnabled").checked, message, style: $("bannerStyle").value, expiresAt: expires ? new Date(expires).toISOString() : "", updatedAt: new Date().toISOString() };
    if (!write(KEYS.banner, b)) { say("bannerMessageOut", "Browser storage is full or unavailable.", true); return; }
    log(b.enabled ? "Banner is now live" : "Banner saved (hidden)"); say("bannerMessageOut", b.enabled ? "Banner is live on the Games branch." : "Saved, but hidden.");
  });
  $("bannerClear").addEventListener("click", () => {
    try { localStorage.removeItem(KEYS.banner); } catch { /* ignore */ }
    loadBanner(); log("Removed site banner"); say("bannerMessageOut", "Banner removed.");
  });

  /* ---------------- Download helper ---------------- */
  function download(name, content, type) {
    const url = URL.createObjectURL(new Blob([content], { type })), a = document.createElement("a");
    a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  /* ---------------- Backup ---------------- */
  function storageBytes() {
    let total = 0;
    BACKUP_KEYS.forEach(k => { const v = localStorage.getItem(KEYS[k]); if (v) total += v.length * 2; });
    return total;
  }
  function renderBackup() {
    const bytes = storageBytes();
    $("backupSize").textContent = bytes > 1048576 ? `${(bytes / 1048576).toFixed(2)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
    const last = read(KEYS.lastBackup, {}).at;
    $("backupLast").textContent = last ? `Last backup: ${when(last)}` : "No backup yet";
  }
  $("backupExport").addEventListener("click", () => {
    const data = {};
    BACKUP_KEYS.forEach(k => {
      const raw = localStorage.getItem(KEYS[k]);
      if (raw !== null) { try { data[k] = JSON.parse(raw); } catch { /* skip unreadable */ } }
    });
    const payload = { app: "rp-games-employee", version: 1, exportedAt: new Date().toISOString(), data };
    download(`rp-games-backup-${todayInput()}.json`, JSON.stringify(payload, null, 2), "application/json");
    write(KEYS.lastBackup, { at: payload.exportedAt });
    log("Exported a backup"); say("backupMessage", "Backup downloaded. Keep it somewhere safe.");
  });
  $("backupImport").addEventListener("click", async () => {
    const file = $("backupFile").files?.[0];
    if (!file) { say("backupMessage", "Choose a backup .json file first.", true); return; }
    if (file.size > 20 * 1024 * 1024) { say("backupMessage", "That file is too large to be a backup.", true); return; }
    let payload;
    try { payload = JSON.parse(await file.text()); } catch { say("backupMessage", "That file is not valid JSON.", true); return; }
    if (!payload || payload.app !== "rp-games-employee" || typeof payload.data !== "object" || payload.data === null) { say("backupMessage", "That is not an RP Games backup file.", true); return; }
    const entries = Object.entries(payload.data).filter(([k]) => BACKUP_KEYS.includes(k));
    for (const [k, v] of entries) {
      const ok = ARRAY_KEYS.has(k) ? Array.isArray(v) : v && typeof v === "object" && !Array.isArray(v);
      if (!ok) { say("backupMessage", `Backup section “${k}” has the wrong format. Nothing was imported.`, true); return; }
    }
    if (!entries.length) { say("backupMessage", "The backup contains no data.", true); return; }
    if (!confirm(`Restore ${entries.length} section(s) from this backup? Matching data in this browser will be replaced.`)) return;
    for (const [k, v] of entries) { if (!write(KEYS[k], v)) { say("backupMessage", "Browser storage is full. Restore stopped part-way.", true); return; } }
    say("backupMessage", "Backup restored. Reloading…"); setTimeout(() => location.reload(), 700);
  });

  /* ---------------- Dashboard ---------------- */
  const MANUAL_CHECKS = [
    ["review-pricing", "I reviewed Refane pricing for every feature"],
    ["review-copy", "I proofread all public text (events, patch notes, roadmap)"],
    ["mobile-check", "I checked the Games branch on a phone-sized window"]
  ];
  function readiness() {
    const tabs = read(KEYS.tabs, []), events = read(KEYS.events, []), patches = read(KEYS.patches, []), road = read(KEYS.roadmap, []), feats = read(KEYS.features, []);
    const manual = read(KEYS.checklist, {});
    const lastBackup = read(KEYS.lastBackup, {}).at;
    const recentBackup = lastBackup && Date.now() - new Date(lastBackup).getTime() < 7 * 86400000;
    return [
      { label: "At least one custom Games tab", done: tabs.length > 0, go: "tabs" },
      { label: "A published event or announcement", done: events.some(e => e.status !== "draft"), go: "events" },
      { label: "Published patch notes", done: patches.some(p => p.status !== "draft"), go: "patch" },
      { label: "Roadmap with 3 or more items", done: road.filter(r => r.status !== "paused").length >= 3, go: "roadmap" },
      { label: "Feature catalog set up", done: feats.some(f => f.enabled !== false), go: "features" },
      { label: "Latest changes published to everyone", done: isInSync(), go: "publish" },
      { label: "Backup exported in the last 7 days", done: !!recentBackup, go: "backup" },
      ...MANUAL_CHECKS.map(([key, label]) => ({ label, done: !!manual[key], manualKey: key }))
    ];
  }
  function renderDashboard() {
    if (!$("proTiles")) return;
    const tabs = read(KEYS.tabs, []), events = read(KEYS.events, []), patches = read(KEYS.patches, []), road = read(KEYS.roadmap, []), feats = read(KEYS.features, []);
    const upcoming = events.filter(e => e.status !== "draft" && new Date(e.releaseAt).getTime() > Date.now()).length;
    const paid = feats.filter(f => f.price > 0).length;
    const tiles = [
      ["Games tabs", tabs.length, "tabs"], ["Upcoming events", upcoming, "events"], ["Drafts", events.filter(e => e.status === "draft").length + patches.filter(p => p.status === "draft").length, "events"],
      ["Patch notes live", patches.filter(p => p.status !== "draft").length, "patch"], ["Roadmap shipped", `${road.filter(r => r.status === "shipped").length}/${road.length}`, "roadmap"],
      ["Free features", feats.length - paid, "features"], ["Paid features", paid, "features"]
    ];
    $("proTiles").replaceChildren(...tiles.map(([label, value, go]) => make("button", { type: "button", class: "pro-tile", onclick: () => goTo(go) }, make("span", { text: label }), make("strong", { text: String(value) }))));

    const checks = readiness(), done = checks.filter(c => c.done).length, pct = Math.round((done / checks.length) * 100);
    $("proReadyPct").textContent = `${pct}%`; $("proReadyBar").style.width = `${pct}%`;
    $("proChecklist").replaceChildren(...checks.map(c => {
      if (c.manualKey) {
        const box = make("input", { type: "checkbox" }); box.checked = c.done;
        box.addEventListener("change", () => { const m = read(KEYS.checklist, {}); m[c.manualKey] = box.checked; write(KEYS.checklist, m); renderDashboard(); });
        return make("li", { class: c.done ? "done" : "" }, make("label", {}, box, ` ${c.label}`));
      }
      return make("li", { class: c.done ? "done" : "" }, make("span", { class: "pro-tick", text: c.done ? "✓" : "○" }), make("span", { text: c.label }), c.done ? null : button("Go", () => goTo(c.go), "pro-link"));
    }));

    const logItems = read(KEYS.activity, []);
    $("proLog").replaceChildren(...(logItems.length ? logItems.slice(0, 10).map(i => make("li", {}, make("span", { text: i.msg }), make("time", { text: when(i.t) }))) : [make("li", { class: "pro-muted", text: "No activity yet." })]));
  }
  $("proQuick").addEventListener("click", e => { const t = e.target.closest("[data-go]"); if (t) goTo(t.dataset.go); });
  $("proClearLog").addEventListener("click", () => { write(KEYS.activity, []); renderDashboard(); });

  document.querySelectorAll(".ee-tabs [data-panel]").forEach(b => b.addEventListener("click", () => {
    if (b.dataset.panel === "dashboard") renderDashboard();
    if (b.dataset.panel === "backup") renderBackup();
    if (b.dataset.panel === "publish") { renderPublishPanel(); }
  }));

  /* ---------------- Publish to everyone (Supabase) ---------------- */
  // Public values only. Never put a service_role key in browser code.
  const SB_URL = "https://nesxcgymsgegkqjhfydx.supabase.co";
  const SB_KEY = "sb_publishable_Tj4frYyU-iAylsH_--y3Qg_esNYqce-";
  const EDITOR_ROLES = ["Creator", "Games Studio Director", "Game Employee"];
  const SECTIONS = [["tabs", "Games tabs"], ["events", "Event announcements"], ["features", "Features & prices"], ["patches", "Patch notes"], ["roadmap", "Roadmap"], ["banner", "Site banner"]];
  let sb = null, account = { state: "checking" }, live = null, liveError = "", publishing = false;

  function client() {
    if (sb) return sb;
    if (location.protocol === "file:" || !window.supabase || !window.supabase.createClient) return null;
    sb = window.supabase.createClient(SB_URL, SB_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } });
    return sb;
  }
  function stable(v) {
    if (Array.isArray(v)) return `[${v.map(stable).join(",")}]`;
    if (v && typeof v === "object") return `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${stable(v[k])}`).join(",")}}`;
    return JSON.stringify(v === undefined ? null : v);
  }
  function str(v, max) { return typeof v === "string" ? v.slice(0, max) : ""; }
  function buildSnapshot() {
    const now = Date.now();
    const banner = read(KEYS.banner, {});
    const bannerLive = banner.enabled && banner.message && !(banner.expiresAt && new Date(banner.expiresAt).getTime() <= now);
    return {
      schema: 1,
      tabs: read(KEYS.tabs, []).filter(t => t && t.id && t.name).map(t => ({ id: t.id, name: str(t.name, 40), subtitle: str(t.subtitle, 120), price: normalizePrice(t.price), html: str(t.html, 400000), css: str(t.css, 200000), js: str(t.js, 400000) })),
      events: read(KEYS.events, []).filter(e => e && e.id && e.name && e.status !== "draft").map(e => ({ id: e.id, name: str(e.name, 100), subtitle: str(e.subtitle, 140), description: str(e.description, 1200), releaseAt: str(e.releaseAt, 40), banner: typeof e.banner === "string" && e.banner.startsWith("data:image/") ? e.banner : "" })),
      features: read(KEYS.features, []).filter(f => f && f.id && f.name && f.enabled !== false).map(f => ({ id: f.id, name: str(f.name, 60), category: str(f.category, 30), description: str(f.description, 300), price: normalizePrice(f.price) })),
      patches: read(KEYS.patches, []).filter(p => p && p.id && p.version && p.status !== "draft").map(p => ({ id: p.id, version: str(p.version, 20), date: str(p.date, 10), title: str(p.title, 100), tags: Array.isArray(p.tags) ? p.tags.slice(0, 8).map(t => str(t, 20)) : [], body: str(p.body, 4000) })),
      roadmap: read(KEYS.roadmap, []).filter(r => r && r.id && r.title && r.status !== "paused").map(r => ({ id: r.id, title: str(r.title, 80), quarter: str(r.quarter, 24), status: str(r.status, 12), description: str(r.description, 300) })),
      banner: bannerLive ? { enabled: true, message: str(banner.message, 160), style: ["info", "success", "warning"].includes(banner.style) ? banner.style : "info", expiresAt: str(banner.expiresAt, 40) } : { enabled: false }
    };
  }
  function sectionState(local, remote) {
    return SECTIONS.map(([key, label]) => {
      const a = local[key], b = remote ? remote[key] : undefined;
      const count = v => (Array.isArray(v) ? v.length : v && v.enabled ? 1 : 0);
      const same = remote ? stable(a === undefined ? (Array.isArray(b) ? [] : {}) : a) === stable(b === undefined ? (Array.isArray(a) ? [] : {}) : b) : false;
      return { key, label, count: count(a), liveCount: remote ? count(b) : 0, same };
    });
  }
  function isInSync() {
    if (!live || !live.snapshot) return false;
    const rows = sectionState(buildSnapshot(), live.snapshot);
    return rows.every(r => r.same);
  }

  function setChip(text, cls) { const chip = $("proPubChip"); chip.textContent = text; chip.className = `pro-chip ${cls || ""}`; }
  function updatePublishStatus() {
    if (!$("proPubChip")) return;
    if (liveError && !live) setChip("Live site unreachable", "bad");
    else if (!live) setChip("Not published yet", "warn");
    else if (isInSync()) setChip(`● Live site in sync (v${live.version})`, "ok");
    else setChip("● Unpublished changes", "warn");
    renderPublishPanel();
  }

  async function fetchLive() {
    try {
      const response = await fetch(`${SB_URL}/rest/v1/rp_games_publications?select=version,published_at,snapshot&order=version.desc&limit=1`, { headers: { apikey: SB_KEY, Accept: "application/json" }, cache: "no-store" });
      if (!response.ok) throw new Error(response.status === 404 ? "setup" : `HTTP ${response.status}`);
      const rows = await response.json();
      live = rows.length ? rows[0] : null; liveError = "";
    } catch (error) { liveError = error.message || "failed"; }
    updatePublishStatus();
  }
  async function loadAccount() {
    const c = client();
    if (!c) { account = { state: location.protocol === "file:" ? "file" : "nolib" }; return; }
    try {
      const { data: { session } } = await c.auth.getSession();
      if (!session) { account = { state: "signedout" }; return; }
      const { data, error } = await c.rpc("rp_get_account_context");
      if (error) { account = { state: "error", message: error.message }; return; }
      const roles = Array.isArray(data.roles) ? data.roles : [];
      account = { state: roles.some(r => EDITOR_ROLES.includes(r)) && data.status === "active" ? "editor" : "noaccess", username: data.username, roles, status: data.status };
    } catch (error) { account = { state: "error", message: error.message }; }
  }
  async function loadHistory() {
    const root = $("pubHistory"); root.replaceChildren();
    if (account.state !== "editor") { root.append(make("li", { class: "pro-muted", text: "Sign in as a Games employee to see history." })); return; }
    const { data, error } = await client().from("rp_games_publications").select("version,published_at,note").order("version", { ascending: false }).limit(10);
    if (error || !data) { root.append(make("li", { class: "pro-muted", text: "History is unavailable." })); return; }
    if (!data.length) { root.append(make("li", { class: "pro-muted", text: "Nothing published yet." })); return; }
    data.forEach(row => root.append(make("li", { class: "pro-hist-row" },
      make("span", { text: `v${row.version}${row.note ? ` · ${row.note}` : ""}` }), make("time", { text: when(row.published_at) }),
      live && row.version === live.version ? make("span", { class: "pro-muted", text: "live" }) : button("Restore", () => republish(row.version)))));
  }
  function explain(error) {
    const msg = (error && error.message) || String(error);
    if (/rp_publish_games|rp_republish_games|rp_games_publications|schema cache|does not exist/i.test(msg)) return "The shared database is not set up yet. Run index/games-content.sql with npm run migrate in the server folder, then try again.";
    if (/role required/i.test(msg)) return "Your account does not have the Games employee role.";
    if (/JWT|not authenticated|permission denied/i.test(msg)) return "Your sign-in expired. Sign in again on the main page.";
    return msg;
  }
  function renderPublishPanel() {
    if (!$("pubAccount")) return;
    const box = $("pubAccount");
    const link = make("a", { href: "../index/index.html", text: "Sign in on the main page" });
    box.className = "pro-note";
    box.replaceChildren();
    switch (account.state) {
      case "editor": box.className = "pro-note ok"; box.append(`Signed in as ${account.username}. You can publish.`); break;
      case "signedout": box.className = "pro-note bad"; box.append(link, " with your employee account, then come back and press Check live version."); break;
      case "noaccess": box.className = "pro-note bad"; box.append(`Signed in as ${account.username}, but this account has no Games employee role (${(account.roles || []).join(", ") || "none"}). Ask the Creator to assign one.`); break;
      case "file": box.className = "pro-note bad"; box.append("Open this page through your website address or localhost. Publishing cannot run from a file:// page."); break;
      case "nolib": box.className = "pro-note bad"; box.append("The sign-in library could not load. Check your connection and reload."); break;
      case "error": box.className = "pro-note bad"; box.append(`Could not check your account: ${account.message}`); break;
      default: box.append("Checking your sign-in…");
    }
    const local = buildSnapshot(), rows = sectionState(local, live ? live.snapshot : null);
    $("pubSummary").replaceChildren(...rows.map(r => make("li", {}, make("span", { text: `${r.label}: ${r.count}${live && r.liveCount !== r.count ? ` (live: ${r.liveCount})` : ""}` }), make("span", { class: `tag ${r.same ? "same" : "changed"}`, text: r.same ? "Up to date" : (live ? "Changed" : "New") }))));
    const bytes = new Blob([JSON.stringify(local)]).size;
    $("pubSize").textContent = bytes > 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
    $("pubPublish").disabled = account.state !== "editor" || publishing || (live && isInSync());
    $("pubPublish").textContent = live && isInSync() ? "Already live" : "Publish to everyone";
    $("pubLive").textContent = liveError && !live ? (liveError === "setup" ? "The shared database is not set up yet (run games-content.sql)." : `Could not reach the live site (${liveError}).`) : live ? `Version ${live.version}, published ${when(live.published_at)}. ${isInSync() ? "Your drafts match it." : "Your drafts differ from it."}` : "Nothing has been published yet.";
  }
  async function publish() {
    if (publishing || account.state !== "editor") return;
    const snapshot = buildSnapshot(), bytes = new Blob([JSON.stringify(snapshot)]).size;
    if (bytes > 7500000) { say("pubMessage", "Too large to publish (over 7.5 MB). Use smaller event banners.", true); return; }
    const rows = sectionState(snapshot, live ? live.snapshot : null).filter(r => !r.same).map(r => r.label);
    if (!confirm(`Publish to everyone?\n\nChanged: ${rows.join(", ") || "nothing"}.\nVisitors on every device will see this.`)) return;
    publishing = true; renderPublishPanel(); say("pubMessage", "Publishing…");
    const { data, error } = await client().rpc("rp_publish_games", { p_snapshot: snapshot, p_note: $("pubNote").value.trim() });
    publishing = false;
    if (error) { say("pubMessage", explain(error), true); renderPublishPanel(); return; }
    $("pubNote").value = ""; log(`Published to everyone (version ${data})`);
    say("pubMessage", `Published as version ${data}. Visitors will see it within about a minute.`);
    await fetchLive(); loadHistory();
  }
  async function republish(version) {
    if (!confirm(`Make version ${version} the live version again?`)) return;
    const { data, error } = await client().rpc("rp_republish_games", { p_version: version });
    if (error) { say("pubMessage", explain(error), true); return; }
    log(`Restored version ${version} as version ${data}`); say("pubMessage", `Version ${version} is live again (as version ${data}).`);
    await fetchLive(); loadHistory();
  }
  async function refreshPublish() {
    say("pubMessage", "");
    await loadAccount(); await fetchLive(); renderPublishPanel(); loadHistory(); renderDashboard();
  }
  $("pubPublish").addEventListener("click", publish);
  $("pubRefresh").addEventListener("click", refreshPublish);
  $("proPubChip").addEventListener("click", () => goTo("publish"));
  document.addEventListener("visibilitychange", () => { if (!document.hidden) refreshPublish(); });

  /* ---------------- Init ---------------- */
  $("patchDate").value = todayInput();
  updateFeaturePreview();
  renderFeatures(); renderPatches(); renderRoadmap(); loadBanner(); renderBackup(); renderDashboard();
  refreshPublish();
})();
