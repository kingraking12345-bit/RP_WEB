/* Tools employee: publish drafts to everyone (Supabase). Mirrors the Games publish flow. */
(() => {
  "use strict";
  const SB_URL = "https://nesxcgymsgegkqjhfydx.supabase.co";
  const SB_KEY = "sb_publishable_Tj4frYyU-iAylsH_--y3Qg_esNYqce-";
  const EDITOR_ROLES = ["Creator", "Tool Studio Director", "Tool Employee"];
  const SECTIONS = [["tools", "Published tools"], ["events", "Tool announcements"], ["kignity", "Kignity AI scripts"]];
  const $ = id => document.getElementById(id);
  let sb = null, account = { state: "checking" }, live = null, liveError = "", publishing = false;

  const read = (k, f) => { try { const v = JSON.parse(localStorage.getItem(k) || "null"); return v == null ? f : v; } catch (e) { return f; } };
  const str = (v, max) => typeof v === "string" ? v.slice(0, max) : "";
  function make(tag, attrs = {}, ...kids) { const n = document.createElement(tag); Object.entries(attrs).forEach(([k, v]) => { if (k === "text") n.textContent = v; else if (k === "class") n.className = v; else n.setAttribute(k, v); }); kids.forEach(k => n.append(k)); return n; }
  const when = iso => { try { return new Date(iso).toLocaleString(); } catch (e) { return ""; } };
  const say = (id, text, bad) => { const n = $(id); n.textContent = text; n.style.color = bad ? "var(--te-red)" : "var(--te-accent)"; };
  function stable(v) {
    if (Array.isArray(v)) return "[" + v.map(stable).join(",") + "]";
    if (v && typeof v === "object") return "{" + Object.keys(v).sort().map(k => JSON.stringify(k) + ":" + stable(v[k])).join(",") + "}";
    return JSON.stringify(v === undefined ? null : v);
  }
  function client() {
    if (sb) return sb;
    if (location.protocol === "file:" || !window.supabase || !window.supabase.createClient) return null;
    sb = window.supabase.createClient(SB_URL, SB_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } });
    return sb;
  }
  const price = v => { const n = Number(v); return Number.isSafeInteger(n) && n >= 0 ? n : 0; };

  function buildSnapshot() {
    const tools = read("rpToolsManaged.v1", []).filter(t => t && t.published === true && t.id && t.name).map(t => ({
      id: str(t.id, 80), name: str(t.name, 64), description: str(t.description, 400), price: price(t.price),
      components: (Array.isArray(t.components) ? t.components : []).filter(c => c && typeof c.type === "string").slice(0, 200).map(c => ({ type: str(c.type, 16), text: str(c.text, 120), message: str(c.message, 180), color: str(c.color, 7), background: str(c.background, 7), fontSize: Number(c.fontSize) || 16 })),
      code: t.code && t.code.manual === true ? { manual: true, html: str(t.code.html, 400000), css: str(t.code.css, 200000), js: str(t.code.js, 400000) } : { manual: false }
    }));
    const events = read("rpToolsAnnouncements.v1", []).filter(e => e && e.published === true && e.name).map(e => ({
      id: str(e.id, 80), name: str(e.name, 100), subtitle: str(e.subtitle, 140), description: str(e.description, 1200), release: str(e.release, 40), notes: str(e.notes, 1000),
      banner: typeof e.banner === "string" && e.banner.startsWith("data:image/") ? e.banner : ""
    }));
    const proj = window.rpKignityStudio ? window.rpKignityStudio.getProject() : read("rpKignityProject.v1", { files: [] });
    const kignity = { files: (proj.files || []).filter(f => f && typeof f.path === "string").map(f => ({ path: str(f.path, 200), type: str(f.type, 8), content: str(f.content, 300000) })) };
    return { schema: 1, tools, events, kignity };
  }
  function sectionState(local, remote) {
    const count = (k, v) => k === "kignity" ? ((v && v.files) || []).length : Array.isArray(v) ? v.length : 0;
    return SECTIONS.map(([key, label]) => ({ key, label, count: count(key, local[key]), liveCount: remote ? count(key, remote[key]) : 0, same: remote ? stable(local[key]) === stable(remote[key] === undefined ? (key === "kignity" ? { files: [] } : []) : remote[key]) : false }));
  }
  const inSync = () => !!(live && live.snapshot && sectionState(buildSnapshot(), live.snapshot).every(r => r.same));

  function setChip(text, cls) { const c = $("tePubChip"); if (c) { c.textContent = text; c.className = "pro-chip " + (cls || ""); } }
  function updateStatus() {
    if (liveError && !live) setChip("Live site unreachable", "bad");
    else if (!live) setChip("Not published yet", "warn");
    else if (inSync()) setChip("● Live site in sync (v" + live.version + ")", "ok");
    else setChip("● Unpublished changes", "warn");
    renderPanel();
  }
  async function fetchLive() {
    try {
      const r = await fetch(SB_URL + "/rest/v1/rp_tools_publications?select=version,published_at,snapshot&order=version.desc&limit=1", { headers: { apikey: SB_KEY, Accept: "application/json" }, cache: "no-store" });
      if (!r.ok) throw new Error(r.status === 404 ? "setup" : "HTTP " + r.status);
      const rows = await r.json(); live = rows.length ? rows[0] : null; liveError = "";
    } catch (e) { liveError = e.message || "failed"; }
    updateStatus();
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
    } catch (e) { account = { state: "error", message: e.message }; }
  }
  async function loadHistory() {
    const root = $("pubHistory"); root.replaceChildren();
    if (account.state !== "editor") { root.append(make("li", { class: "pro-muted", text: "Sign in as a Tools employee to see history." })); return; }
    const { data, error } = await client().from("rp_tools_publications").select("version,published_at,note").order("version", { ascending: false }).limit(10);
    if (error || !data) { root.append(make("li", { class: "pro-muted", text: "History is unavailable." })); return; }
    if (!data.length) { root.append(make("li", { class: "pro-muted", text: "Nothing published yet." })); return; }
    data.forEach(row => {
      const b = make("button", { type: "button", text: "Restore" }); b.addEventListener("click", () => republish(row.version));
      root.append(make("li", { class: "pro-hist-row" }, make("span", { text: "v" + row.version + (row.note ? " · " + row.note : "") }), make("time", { text: when(row.published_at) }), live && row.version === live.version ? make("span", { class: "pro-muted", text: "live" }) : b));
    });
  }
  function explain(error) {
    const msg = (error && error.message) || String(error);
    if (/rp_publish_tools|rp_republish_tools|rp_tools_publications|schema cache|does not exist/i.test(msg)) return "The shared database is not set up yet. Run index/tools-content.sql with npm run migrate in the server folder, then try again.";
    if (/role required/i.test(msg)) return "Your account does not have the Tools employee role.";
    if (/JWT|not authenticated|permission denied/i.test(msg)) return "Your sign-in expired. Sign in again on the main page.";
    return msg;
  }
  function renderPanel() {
    const box = $("pubAccount"); if (!box) return;
    box.className = "te-intro"; box.replaceChildren();
    switch (account.state) {
      case "editor": box.className = "te-intro ok"; box.append("Signed in as " + account.username + ". You can publish."); break;
      case "signedout": box.className = "te-intro bad"; box.append(make("a", { href: "../index/index.html", text: "Sign in on the main page" }), " with your employee account, then come back and press Check live version."); break;
      case "noaccess": box.className = "te-intro bad"; box.append("Signed in as " + account.username + ", but this account has no Tools employee role (" + ((account.roles || []).join(", ") || "none") + "). Ask the Creator to assign one."); break;
      case "file": box.className = "te-intro bad"; box.append("Open this page through your website address or localhost. Publishing cannot run from a file:// page."); break;
      case "nolib": box.className = "te-intro bad"; box.append("The sign-in library could not load. Check your connection and reload."); break;
      case "error": box.className = "te-intro bad"; box.append("Could not check your account: " + account.message); break;
      default: box.append("Checking your sign-in…");
    }
    const local = buildSnapshot(), rows = sectionState(local, live ? live.snapshot : null);
    $("pubSummary").replaceChildren(...rows.map(r => make("li", {}, make("span", { text: r.label + ": " + r.count + (live && r.liveCount !== r.count ? " (live: " + r.liveCount + ")" : "") }), make("span", { class: "tag " + (r.same ? "same" : "changed"), text: r.same ? "Up to date" : (live ? "Changed" : "New") }))));
    const bytes = new Blob([JSON.stringify(local)]).size;
    $("pubSize").textContent = bytes > 1048576 ? (bytes / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(bytes / 1024)) + " KB";
    const same = live && inSync();
    $("pubPublish").disabled = account.state !== "editor" || publishing || !!same;
    $("pubPublish").textContent = same ? "Already live" : "Publish to everyone";
    $("pubLive").textContent = liveError && !live ? (liveError === "setup" ? "The shared database is not set up yet (run tools-content.sql)." : "Could not reach the live site (" + liveError + ").") : live ? "Version " + live.version + ", published " + when(live.published_at) + ". " + (same ? "Your drafts match it." : "Your drafts differ from it.") : "Nothing has been published yet.";
  }
  async function publish() {
    if (publishing || account.state !== "editor") return;
    const snap = buildSnapshot(), bytes = new Blob([JSON.stringify(snap)]).size;
    if (bytes > 7500000) return say("pubMessage", "Too large to publish (over 7.5 MB). Use smaller banners or fewer files.", true);
    const st = window.rpKignityStudio && window.rpKignityStudio.getStatus();
    const changed = sectionState(snap, live ? live.snapshot : null).filter(r => !r.same).map(r => r.label);
    const warn = st && st.errors ? "\n\nWarning: Kignity AI currently has " + st.errors + " script error(s) in the console." : "";
    if (!confirm("Publish to everyone?\n\nChanged: " + (changed.join(", ") || "nothing") + ".\nVisitors on every device will see this." + warn)) return;
    publishing = true; renderPanel(); say("pubMessage", "Publishing…");
    const { data, error } = await client().rpc("rp_publish_tools", { p_snapshot: snap, p_note: $("pubNote").value.trim() });
    publishing = false;
    if (error) { say("pubMessage", explain(error), true); renderPanel(); return; }
    $("pubNote").value = ""; say("pubMessage", "Published as version " + data + ". Visitors will see it within about a minute.");
    await fetchLive(); loadHistory();
  }
  async function republish(version) {
    if (!confirm("Make version " + version + " the live version again?")) return;
    const { data, error } = await client().rpc("rp_republish_tools", { p_version: version });
    if (error) return say("pubMessage", explain(error), true);
    say("pubMessage", "Version " + version + " is live again (as version " + data + ").");
    await fetchLive(); loadHistory();
  }
  async function refresh() { say("pubMessage", ""); await loadAccount(); await fetchLive(); renderPanel(); loadHistory(); }

  $("pubPublish").addEventListener("click", publish);
  $("pubRefresh").addEventListener("click", refresh);
  $("tePubChip").addEventListener("click", () => document.querySelector('[data-view="publish"]').click());
  document.addEventListener("visibilitychange", () => { if (!document.hidden) refresh(); });
  document.addEventListener("click", e => { if (e.target.closest && e.target.closest("[data-view=publish]")) renderPanel(); });
  window.addEventListener("storage", updateStatus);
  setInterval(() => { if (!document.hidden) renderPanel(); }, 4000);
  refresh();
})();
