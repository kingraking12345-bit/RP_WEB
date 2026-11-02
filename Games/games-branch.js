(() => {
  const TABS_KEY = "rpGamesManagedTabs.v1";
  const EVENTS_KEY = "rpGamesEvents.v1";
  const SUBSCRIPTIONS_KEY = "rpGamesEventSubscriptions.v1";
  const SENT_KEY = "rpGamesEventNotifications.v1";
  const FEATURES_KEY = "rpGamesFeatures.v1";
  const PATCHES_KEY = "rpGamesPatchNotes.v1";
  const ROADMAP_KEY = "rpGamesRoadmap.v1";
  const BANNER_KEY = "rpGamesBanner.v1";
  const scheduled = new Map();
  const byId = id => document.getElementById(id);
  const readList = key => {
    try { const value = JSON.parse(localStorage.getItem(key) || "[]"); return Array.isArray(value) ? value : []; }
    catch { return []; }
  };
  const writeList = (key, value) => {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; }
    catch { return false; }
  };
  const readObject = key => {
    try { const value = JSON.parse(localStorage.getItem(key) || "{}"); return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
    catch { return {}; }
  };

  /* ---------- Live content (shared by every visitor) ----------
     Visitors read the newest published snapshot from Supabase. Employees can preview their
     unpublished local drafts with games.html?preview=local. Public key only; never put a service_role key here. */
  const RP_SUPABASE_URL = "https://nesxcgymsgegkqjhfydx.supabase.co";
  const RP_SUPABASE_PUBLIC_KEY = "sb_publishable_Tj4frYyU-iAylsH_--y3Qg_esNYqce-";
  const CACHE_KEY = "rpGamesPublicCache.v1";
  const POLL_MS = 60000;
  const PREVIEW = new URLSearchParams(location.search).get("preview") === "local";
  const LOCAL_KEYS = { tabs: TABS_KEY, events: EVENTS_KEY, features: FEATURES_KEY, patches: PATCHES_KEY, roadmap: ROADMAP_KEY };
  const state = { snapshot: null, version: 0, publishedAt: "", loaded: false, offline: false };
  let currentView = "updates";

  function content(name) {
    if (PREVIEW) return name === "banner" ? readObject(BANNER_KEY) : readList(LOCAL_KEYS[name]);
    const value = state.snapshot ? state.snapshot[name] : null;
    if (name === "banner") return value && typeof value === "object" && !Array.isArray(value) ? value : {};
    return Array.isArray(value) ? value : [];
  }
  function loadCache() {
    try {
      const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || "null");
      if (cached && cached.snapshot && typeof cached.snapshot === "object") {
        state.snapshot = cached.snapshot; state.version = Number(cached.version) || 0; state.publishedAt = cached.publishedAt || "";
        return true;
      }
    } catch { /* no usable cache */ }
    return false;
  }
  function saveCache() {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify({ version: state.version, publishedAt: state.publishedAt, snapshot: state.snapshot })); }
    catch { /* cache is optional (quota or private mode) */ }
  }
  async function api(query) {
    const response = await fetch(`${RP_SUPABASE_URL}/rest/v1/rp_games_publications?${query}`, {
      headers: { apikey: RP_SUPABASE_PUBLIC_KEY, Accept: "application/json" }, cache: "no-store"
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  }
  async function syncLive(force) {
    if (PREVIEW) return;
    try {
      const head = await api("select=version&order=version.desc&limit=1");
      state.offline = false;
      const latest = head.length ? Number(head[0].version) : 0;
      if (!force && state.loaded && latest === state.version) { renderSyncNote(); return; }
      if (!latest) { state.snapshot = null; state.version = 0; state.publishedAt = ""; state.loaded = true; refreshAll(); return; }
      const rows = await api(`select=version,published_at,snapshot&version=eq.${latest}&limit=1`);
      if (rows.length && rows[0].snapshot && typeof rows[0].snapshot === "object") {
        state.snapshot = rows[0].snapshot; state.version = Number(rows[0].version); state.publishedAt = rows[0].published_at || "";
        saveCache();
      }
      state.loaded = true; refreshAll();
    } catch {
      state.offline = true; state.loaded = true;
      refreshAll();
    }
  }
  const safeImage = value => typeof value === "string" && value.startsWith("data:image/") ? value : "";

  function makeButton(label, className, onClick) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    if (className) button.className = className;
    button.addEventListener("click", onClick);
    return button;
  }

  /* ---------- paid tabs ----------
     Paid tab content is never in the public snapshot. A signed-in account pays Refane through
     rp_unlock_games_tab and then reads the content through rp_get_games_tab (both checked on the server). */
  const SESSION_KEY_PAID = "sb-nesxcgymsgegkqjhfydx-auth-token";
  const paid = { unlocked: new Set(), loadedFor: "", content: new Map() };
  const tabPrice = tab => { const n = Number(tab && tab.price); return Number.isSafeInteger(n) && n > 0 ? n : 0; };
  const isLocked = tab => !PREVIEW && tabPrice(tab) > 0 && !paid.unlocked.has(tab.id);
  function authToken() {
    let stored = null;
    try { stored = JSON.parse(localStorage.getItem(SESSION_KEY_PAID) || "null"); } catch { return { state: "out" }; }
    const token = stored && typeof stored.access_token === "string" ? stored.access_token : "";
    if (!token) return { state: "out" };
    if (Number(stored.expires_at) * 1000 < Date.now()) return { state: "expired" };
    return { state: "in", token };
  }
  async function rpc(name, body, token) {
    const response = await fetch(`${RP_SUPABASE_URL}/rest/v1/rpc/${name}`, { method: "POST", headers: { apikey: RP_SUPABASE_PUBLIC_KEY, Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(body || {}) });
    let data = null; try { data = await response.json(); } catch { /* no body */ }
    if (!response.ok) throw new Error((data && (data.message || data.error)) || `HTTP ${response.status}`);
    return data;
  }
  async function loadUnlocks() {
    const auth = authToken();
    if (PREVIEW || auth.state !== "in") { paid.unlocked = new Set(); return; }
    try {
      const response = await fetch(`${RP_SUPABASE_URL}/rest/v1/rp_games_tab_unlocks?select=tab_id`, { headers: { apikey: RP_SUPABASE_PUBLIC_KEY, Authorization: `Bearer ${auth.token}`, Accept: "application/json" }, cache: "no-store" });
      if (response.ok) { const rows = await response.json(); paid.unlocked = new Set(rows.map(row => row.tab_id)); }
    } catch { /* keep what we know */ }
  }
  function frameDocument(tab) {
    const policy = "default-src 'none'; img-src data: blob:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'none'; font-src data:; media-src data: blob:; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";
    const css = String(tab.css || "").replace(/<\/style/gi, "<\\/style"), js = String(tab.js || "").replace(/<\/script/gi, "<\\/script");
    return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="${policy}"><style>${css}</style></head><body>${tab.html || ""}<script>${js}<\/script></body></html>`;
  }
  function lockPanel() {
    let panel = byId("geLockPanel");
    if (!panel) { panel = document.createElement("div"); panel.id = "geLockPanel"; panel.style.cssText = "max-width:520px;margin:24px 0;padding:22px;border:1px solid var(--line,#2c3c42);border-radius:8px;background:rgba(255,255,255,.04)"; byId("geCustomFrame").before(panel); }
    return panel;
  }
  function showLock(tab, message, canUnlock) {
    const panel = lockPanel(), frame = byId("geCustomFrame"); frame.hidden = true; frame.removeAttribute("srcdoc"); panel.hidden = false; panel.replaceChildren();
    const heading = document.createElement("h2"); heading.textContent = `🔒 ${tab.name}`; heading.style.margin = "0 0 6px";
    const price = document.createElement("p"); price.textContent = `Unlock for ${tabPrice(tab)} Refane. Unlocking is permanent for your account.`; price.style.margin = "0 0 12px";
    const note = document.createElement("p"); note.setAttribute("role", "status"); note.textContent = message || ""; note.style.cssText = "margin:0 0 12px;opacity:.85";
    panel.append(heading, price, note);
    if (canUnlock) {
      const button = makeButton(`Unlock for ${tabPrice(tab)} Refane`, "", async () => {
        if (!confirm(`Pay ${tabPrice(tab)} Refane to unlock “${tab.name}”?`)) return;
        button.disabled = true; note.textContent = "Processing…";
        try {
          const auth = authToken(); if (auth.state !== "in") throw new Error("Your sign-in expired. Open the main page to sign in again.");
          const result = await rpc("rp_unlock_games_tab", { p_tab_id: tab.id }, auth.token);
          paid.unlocked.add(tab.id); renderTabs(); await openPaid(tab, result && result.charged ? `Unlocked for ${result.charged} Refane. Balance: ${result.balance}.` : "");
        } catch (error) { button.disabled = false; note.textContent = friendly(error); }
      });
      panel.append(button);
    } else {
      const link = document.createElement("a"); link.href = "../index/index.html"; link.textContent = "Open the main page to sign in"; panel.append(link);
    }
  }
  function friendly(error) {
    const text = (error && error.message) || String(error);
    if (/Not enough Refane/i.test(text)) return text.replace(/^.*?(Not enough Refane)/i, "$1") + ".";
    if (/rp_unlock_games_tab|rp_get_games_tab|schema cache/i.test(text)) return "Paid tabs are not set up yet. Ask an employee to run games-paid-tabs.sql.";
    if (/JWT|expired/i.test(text)) return "Your sign-in expired. Open the main page to sign in again.";
    return text;
  }
  async function openPaid(tab, message) {
    const auth = authToken(), frame = byId("geCustomFrame");
    if (auth.state !== "in") return showLock(tab, auth.state === "expired" ? "Your sign-in expired. Open the main page to refresh it." : "Sign in on the main page to unlock paid tabs.", false);
    if (currentView !== tab.id) return;
    try {
      let data = paid.content.get(tab.id);
      if (!data) { data = await rpc("rp_get_games_tab", { p_tab_id: tab.id }, auth.token); paid.content.set(tab.id, data); }
      if (currentView !== tab.id) return;
      const panel = byId("geLockPanel"); if (panel) panel.hidden = true;
      frame.hidden = false; frame.srcdoc = frameDocument(data);
      if (message) { const note = byId("geCustomSubtitle"); note.textContent = [tab.subtitle, message].filter(Boolean).join(" · "); }
    } catch (error) {
      if (/locked/i.test(String(error.message))) { paid.unlocked.delete(tab.id); showLock(tab, "This tab costs Refane. Your balance is checked when you unlock it.", true); }
      else showLock(tab, friendly(error), false);
    }
  }
  function selectView(id) {
    currentView = id;
    byId("geUpdates").hidden = id !== "updates";
    byId("geCustomView").hidden = id === "updates";
    document.querySelectorAll(".ge-tabs button").forEach(button => button.classList.toggle("active", button.dataset.view === id));
    if (id === "updates") return;
    const tab = content("tabs").find(item => item && item.id === id);
    if (!tab) return selectView("updates");
    byId("geCustomTitle").textContent = tab.name;
    byId("geCustomSubtitle").textContent = tab.subtitle || "";
    const frame = byId("geCustomFrame"), panel = byId("geLockPanel");
    if (panel) panel.hidden = true; frame.hidden = false;
    if (tabPrice(tab) > 0 && !PREVIEW) {
      if (authToken().state === "in") { if (paid.unlocked.has(tab.id)) openPaid(tab); else showLock(tab, "This tab costs Refane. Your balance is checked when you unlock it.", true); }
      else showLock(tab, authToken().state === "expired" ? "Your sign-in expired. Open the main page to refresh it." : "Sign in on the main page to unlock paid tabs.", false);
      return;
    }
    if (PREVIEW && tabPrice(tab) > 0) byId("geCustomSubtitle").textContent = [tab.subtitle, `Preview: visitors pay ${tabPrice(tab)} Refane to open this tab`].filter(Boolean).join(" · ");
    frame.srcdoc = frameDocument(tab);
  }

  function renderTabs() {
    const root = byId("geTabs");
    const updates = makeButton("Updates", "active", () => selectView("updates"));
    updates.dataset.view = "updates";
    root.replaceChildren(updates);
    content("tabs").filter(tab => tab && tab.id).forEach(tab => {
      const label = (tab.name || "Untitled") + (tabPrice(tab) > 0 ? (isLocked(tab) ? ` 🔒 ${tabPrice(tab)}` : " ✓") : "");
      const button = makeButton(label, "", () => selectView(tab.id));
      button.dataset.view = tab.id;
      root.append(button);
    });
  }

  function notifyAtRelease(event) {
    const sent = readList(SENT_KEY);
    if (sent.includes(event.id) || new Date(event.releaseAt).getTime() > Date.now()) return;
    if ("Notification" in window && Notification.permission === "granted") {
      new Notification(event.name || "RP Games update", { body: event.subtitle || "The update is now available.", icon: safeImage(event.banner) || undefined });
    }
    writeList(SENT_KEY, [...sent, event.id]);
  }

  function scheduleNotification(event) {
    if (!readList(SUBSCRIPTIONS_KEY).includes(event.id) || readList(SENT_KEY).includes(event.id) || scheduled.has(event.id)) return;
    const releaseAt = new Date(event.releaseAt).getTime();
    if (!Number.isFinite(releaseAt)) return;
    const timer = setTimeout(() => {
      scheduled.delete(event.id);
      const current = content("events").find(item => item.id === event.id);
      if (!current) return;
      if (new Date(current.releaseAt).getTime() > Date.now()) { scheduleNotification(current); return; }
      notifyAtRelease(current); renderEvents();
    }, Math.min(Math.max(0, releaseAt - Date.now()), 2147480000));
    scheduled.set(event.id, timer);
  }

  function subscribe(event, status) {
    let subscriptions = readList(SUBSCRIPTIONS_KEY);
    if (!subscriptions.includes(event.id)) subscriptions.push(event.id);
    if (!writeList(SUBSCRIPTIONS_KEY, subscriptions)) { status.textContent = "Browser storage is unavailable. Open RP Games through its website URL."; return false; }
    const permission = "Notification" in window ? Notification.permission : "unsupported";
    status.textContent = permission === "granted"
      ? "Reminder saved on this browser. Keep RP Games open around the release date."
      : permission === "denied"
        ? "Saved here, but browser notifications are blocked. Check RP Games again on the release date."
        : "Saved on this browser. Browser notifications are not enabled.";
    scheduleNotification(event);
    notifyAtRelease(event);
    return true;
  }

  function renderEvents() {
    const root = byId("geEventList");
    root.replaceChildren();
    const events = content("events").filter(item => item && item.status !== "draft").sort((a, b) => new Date(a.releaseAt) - new Date(b.releaseAt));
    if (!events.length) {
      const empty = document.createElement("div");
      empty.className = "ge-empty";
      empty.textContent = !PREVIEW && !state.loaded ? "Loading the latest updates…" : !PREVIEW && state.offline && !state.snapshot ? "Could not reach the server. Check your connection and try again." : "No event announcements yet.";
      root.append(empty);
      return;
    }
    const subscriptions = readList(SUBSCRIPTIONS_KEY);
    events.forEach(event => {
      const article = document.createElement("article");
      article.className = "ge-event";
      const image = document.createElement("img");
      image.alt = `${event.name || "Event"} banner`;
      image.src = safeImage(event.banner) || "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='640' height='360'%3E%3Crect width='100%25' height='100%25' fill='%2318232c'/%3E%3C/svg%3E";
      const copy = document.createElement("div");
      copy.className = "ge-event-copy";
      const title = document.createElement("h2"); title.textContent = event.name || "Untitled event";
      const subtitle = document.createElement("div"); subtitle.className = "ge-event-subtitle"; subtitle.textContent = event.subtitle || "";
      const description = document.createElement("p"); description.textContent = event.description || "";
      const release = document.createElement("p"); release.className = "ge-event-date";
      const releaseDate = new Date(event.releaseAt);
      release.textContent = Number.isNaN(releaseDate.getTime()) ? "Release date to be announced" : `Release date: ${releaseDate.toLocaleString()}`;
      const status = document.createElement("span"); status.className = "ge-notify-status"; status.setAttribute("role", "status");
      const subscribed = subscriptions.includes(event.id);
      const button = makeButton(subscribed ? "Reminder saved" : "Notify me", "ge-notify", async () => {
        if ("Notification" in window && Notification.permission === "default") {
          try { await Notification.requestPermission(); } catch {}
        }
        const saved=subscribe(event, status);
        button.textContent = saved ? "Reminder saved" : "Notify me";
        button.disabled = saved;
      });
      if (subscribed) { button.disabled = true; status.textContent = "Reminder saved on this browser."; }
      copy.append(title, subtitle, description, release, button, status);
      article.append(image, copy);
      root.append(article);
      if (subscribed) scheduleNotification(event);
      notifyAtRelease(event);
    });
  }


  /* ---------- Banner, features (Refane pricing), roadmap, patch notes ---------- */
  const EXTRAS_CSS = `
#gamesEmployeeFacing .ge-banner{margin:0 0 18px;padding:11px 14px;border:1px solid #3d5a73;border-radius:5px;background:#101e29;color:#b9d8f0;font-size:14px}
#gamesEmployeeFacing .ge-banner.success{border-color:#456755;background:#13221b;color:#b5e8cd}
#gamesEmployeeFacing .ge-banner.warning{border-color:#7a6430;background:#2a2412;color:#f0dca0}
#gamesEmployeeFacing .ge-extra{margin-top:38px}
#gamesEmployeeFacing .ge-extra h2{margin:0 0 4px;font-size:20px}
#gamesEmployeeFacing .ge-extra>p{margin:0 0 14px;color:var(--ge-muted);font-size:13px}
#gamesEmployeeFacing .ge-feature-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:12px}
#gamesEmployeeFacing .ge-feature{display:flex;flex-direction:column;gap:6px;padding:14px;border:1px solid var(--ge-line);border-radius:6px;background:var(--ge-panel)}
#gamesEmployeeFacing .ge-feature h3{margin:0;font-size:15px}
#gamesEmployeeFacing .ge-feature small{color:var(--ge-muted)}
#gamesEmployeeFacing .ge-feature p{margin:0;flex:1;color:var(--ge-muted);font-size:13px}
#gamesEmployeeFacing .ge-feature-foot{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:6px}
#gamesEmployeeFacing .ge-price{padding:2px 9px;border-radius:10px;font-size:12px;font-weight:700;background:#16352a;color:var(--ge-green)}
#gamesEmployeeFacing .ge-price.paid{background:#3a2f12;color:#f0cf7a}
#gamesEmployeeFacing .ge-feature button{padding:6px 10px;border:1px solid var(--ge-line);border-radius:4px;background:var(--ge-raised);color:var(--ge-muted);font:inherit;font-size:12px}
#gamesEmployeeFacing .ge-feature button:disabled{cursor:not-allowed;opacity:.8}
#gamesEmployeeFacing .ge-road{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}
#gamesEmployeeFacing .ge-road-col{padding:12px;border:1px solid var(--ge-line);border-radius:6px;background:var(--ge-panel)}
#gamesEmployeeFacing .ge-road-col h3{margin:0 0 10px;font-size:13px;letter-spacing:.04em;text-transform:uppercase;color:var(--ge-green)}
#gamesEmployeeFacing .ge-road-item{padding:9px 0;border-top:1px solid #1d2a31}
#gamesEmployeeFacing .ge-road-item:first-of-type{border-top:0}
#gamesEmployeeFacing .ge-road-item strong{display:block;font-size:14px}
#gamesEmployeeFacing .ge-road-item span{display:block;color:var(--ge-muted);font-size:12px}
#gamesEmployeeFacing .ge-road-empty{color:var(--ge-muted);font-size:13px}
#gamesEmployeeFacing .ge-patch{margin-bottom:10px;border:1px solid var(--ge-line);border-radius:6px;background:var(--ge-panel)}
#gamesEmployeeFacing .ge-patch summary{display:flex;flex-wrap:wrap;align-items:center;gap:10px;padding:12px 14px;cursor:pointer}
#gamesEmployeeFacing .ge-patch summary b{color:var(--ge-green)}
#gamesEmployeeFacing .ge-patch time{margin-left:auto;color:var(--ge-muted);font-size:12px}
#gamesEmployeeFacing .ge-tag{padding:1px 8px;border-radius:10px;background:#1c2b35;color:var(--ge-blue);font-size:11px}
#gamesEmployeeFacing .ge-patch ul{margin:0;padding:0 14px 14px 34px;color:var(--ge-text);font-size:14px}
#gamesEmployeeFacing .ge-sync{margin:26px 0 0;color:var(--ge-muted);font-size:12px}
@media(max-width:760px){#gamesEmployeeFacing .ge-road{grid-template-columns:1fr}}`;

  function injectExtrasStyle() {
    if (byId("geExtrasStyle")) return;
    const style = document.createElement("style");
    style.id = "geExtrasStyle";
    style.textContent = EXTRAS_CSS;
    document.head.append(style);
  }
  function formatDay(value) {
    const date = new Date(`${value}T00:00:00`);
    return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  }
  function cleanPrice(value) {
    const n = Math.floor(Number(value));
    return Number.isFinite(n) && n > 0 ? Math.min(n, 1000000) : 0;
  }
  function extraSection(id, title, subtitle) {
    const section = document.createElement("div"); // not <section>: games.html hides every <section> globally
    section.className = "ge-extra"; section.id = id;
    const heading = document.createElement("h2"); heading.textContent = title;
    const sub = document.createElement("p"); sub.textContent = subtitle;
    section.append(heading, sub);
    return section;
  }

  function renderBanner() {
    const host = byId("geUpdates"); if (!host) return;
    let node = byId("geBanner");
    const banner = content("banner");
    const expired = banner.expiresAt && new Date(banner.expiresAt).getTime() <= Date.now();
    if (!banner.enabled || !banner.message || expired) { if (node) node.remove(); return; }
    if (!node) { node = document.createElement("div"); node.id = "geBanner"; node.setAttribute("role", "status"); host.prepend(node); }
    node.className = `ge-banner ${["success", "warning"].includes(banner.style) ? banner.style : "info"}`;
    node.textContent = banner.message;
  }

  function renderFeatures(root) {
    const features = content("features").filter(item => item && item.name && item.enabled !== false);
    if (!features.length) return;
    const section = extraSection("geFeatures", "Features", "Free features are included. Others unlock with Refane.");
    const grid = document.createElement("div"); grid.className = "ge-feature-grid";
    features.forEach(item => {
      const price = cleanPrice(item.price);
      const card = document.createElement("article"); card.className = "ge-feature";
      const title = document.createElement("h3"); title.textContent = item.name;
      const category = document.createElement("small"); category.textContent = item.category || "Other";
      const description = document.createElement("p"); description.textContent = item.description || "";
      const badge = document.createElement("span"); badge.className = `ge-price${price ? " paid" : ""}`;
      badge.textContent = price ? `${price.toLocaleString()} Refane` : "Free";
      const action = makeButton(price ? "Unlock" : "Included", "", () => {});
      action.disabled = true;
      if (price) action.title = "Refane purchases are not enabled yet.";
      const foot = document.createElement("div"); foot.className = "ge-feature-foot"; foot.append(badge, action);
      card.append(title, category, description, foot); grid.append(card);
    });
    section.append(grid); root.append(section);
  }

  function renderRoadmap(root) {
    const items = content("roadmap").filter(item => item && item.title && item.status !== "paused");
    if (!items.length) return;
    const section = extraSection("geRoadmap", "Roadmap", "What we are building and what has shipped.");
    const wrap = document.createElement("div"); wrap.className = "ge-road";
    [["progress", "In progress"], ["planned", "Planned"], ["shipped", "Shipped"]].forEach(([status, label]) => {
      const col = document.createElement("div"); col.className = "ge-road-col";
      const heading = document.createElement("h3"); heading.textContent = label; col.append(heading);
      const list = items.filter(item => item.status === status);
      if (!list.length) { const empty = document.createElement("div"); empty.className = "ge-road-empty"; empty.textContent = "Nothing here yet."; col.append(empty); }
      list.forEach(item => {
        const row = document.createElement("div"); row.className = "ge-road-item";
        const name = document.createElement("strong"); name.textContent = item.title; row.append(name);
        const meta = [item.quarter, item.description].filter(Boolean).join(" · ");
        if (meta) { const detail = document.createElement("span"); detail.textContent = meta; row.append(detail); }
        col.append(row);
      });
      wrap.append(col);
    });
    section.append(wrap); root.append(section);
  }

  function renderPatchNotes(root) {
    const notes = content("patches").filter(item => item && item.version && item.status !== "draft")
      .sort((a, b) => String(b.date).localeCompare(String(a.date)));
    if (!notes.length) return;
    const section = extraSection("gePatchNotes", "Patch notes", "Recent changes to RP Games.");
    notes.slice(0, 8).forEach((note, index) => {
      const details = document.createElement("details"); details.className = "ge-patch"; details.open = index === 0;
      const summary = document.createElement("summary");
      const version = document.createElement("b"); version.textContent = note.version;
      const title = document.createElement("span"); title.textContent = note.title || "";
      summary.append(version, title);
      (Array.isArray(note.tags) ? note.tags : []).forEach(tag => { const chip = document.createElement("span"); chip.className = "ge-tag"; chip.textContent = tag; summary.append(chip); });
      const time = document.createElement("time"); time.textContent = formatDay(note.date); summary.append(time);
      const list = document.createElement("ul");
      String(note.body || "").split("\n").map(line => line.trim()).filter(Boolean).forEach(line => { const li = document.createElement("li"); li.textContent = line; list.append(li); });
      details.append(summary, list); section.append(details);
    });
    root.append(section);
  }

  function renderExtras() {
    const updates = byId("geUpdates"); if (!updates) return;
    injectExtrasStyle();
    renderBanner();
    let root = byId("geExtras");
    if (!root) { root = document.createElement("div"); root.id = "geExtras"; updates.append(root); }
    root.replaceChildren();
    renderFeatures(root); renderRoadmap(root); renderPatchNotes(root);
    const note = document.createElement("p"); note.id = "geSyncNote"; note.className = "ge-sync"; root.append(note);
    renderSyncNote();
  }

  function renderSyncNote() {
    const note = byId("geSyncNote"); if (!note) return;
    if (PREVIEW) { note.textContent = "Local preview of your unpublished drafts. Visitors only see what you publish."; return; }
    const when = state.publishedAt ? new Date(state.publishedAt) : null;
    const stamp = when && !Number.isNaN(when.getTime()) ? ` · updated ${when.toLocaleString()}` : "";
    note.textContent = state.offline
      ? (state.snapshot ? `Offline. Showing the last saved copy (version ${state.version}).` : "Offline. Could not load the latest content.")
      : state.version ? `Live content, version ${state.version}${stamp}` : "";
  }

  /* ---------- Employee link: only employees see "Game Employee" ----------
     Reads the sign-in already stored by the main page and asks Supabase for the account roles.
     This only hides a link. The employee page and the publish function check the role again on the server. */
  const SESSION_KEY = "sb-nesxcgymsgegkqjhfydx-auth-token";
  const EDITOR_ROLES = ["Creator", "Games Studio Director", "Game Employee"];
  async function updateEmployeeLink() {
    const link = document.querySelector("#gamesEmployeeFacing .ge-employee");
    if (!link) return;
    link.style.display = "none";
    if (PREVIEW) { link.style.display = ""; return; }
    let stored = null;
    try { stored = JSON.parse(localStorage.getItem(SESSION_KEY) || "null"); } catch { /* not signed in */ }
    const token = stored && typeof stored.access_token === "string" ? stored.access_token : "";
    if (!token || (Number(stored.expires_at) * 1000 < Date.now())) return;
    try {
      const response = await fetch(`${RP_SUPABASE_URL}/rest/v1/rpc/rp_get_account_context`, {
        method: "POST",
        headers: { apikey: RP_SUPABASE_PUBLIC_KEY, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: "{}"
      });
      if (!response.ok) return;
      const account = await response.json();
      const roles = Array.isArray(account.roles) ? account.roles : [];
      if (account.status === "active" && roles.some(role => EDITOR_ROLES.includes(role))) link.style.display = "";
    } catch { /* stays hidden */ }
  }

  function refreshAll() {
    renderTabs();
    selectView(currentView);
    renderEvents();
    renderExtras();
  }

  byId("geBack").addEventListener("click", () => { location.href = "../index/index.html"; });
  byId("geBackToUpdates").addEventListener("click", () => selectView("updates"));
  if (!PREVIEW) {
    const oldNotice = document.querySelector("#gamesEmployeeFacing .ge-demo-notice"); // "edits stay in this browser" no longer applies to visitors
    if (oldNotice) oldNotice.remove();
    loadCache(); state.loaded = !!state.snapshot;
  }
  refreshAll();
  updateEmployeeLink();
  loadUnlocks().then(() => { renderTabs(); if (currentView !== "updates") selectView(currentView); });
  syncLive(true);
  if (!PREVIEW) {
    setInterval(() => { if (!document.hidden) syncLive(false); }, POLL_MS);
    window.addEventListener("online", () => syncLive(false));
  }
  document.addEventListener("visibilitychange", () => { if (!document.hidden) { if (PREVIEW) refreshAll(); else syncLive(false); } });
  window.addEventListener("storage", event => {
    if (PREVIEW && [TABS_KEY, EVENTS_KEY, FEATURES_KEY, PATCHES_KEY, ROADMAP_KEY, BANNER_KEY].includes(event.key)) refreshAll();
  });
})();
