(() => {
  "use strict";
  const SB_URL = "https://nesxcgymsgegkqjhfydx.supabase.co", SB_KEY = "sb_publishable_Tj4frYyU-iAylsH_--y3Qg_esNYqce-";
  const EDITOR_ROLES = ["Creator", "Community Studio Director", "Community Employee"];
  const $ = id => document.getElementById(id);
  function make(tag, attrs = {}, ...kids) { const n = document.createElement(tag); Object.entries(attrs).forEach(([k, v]) => { if (k === "text") n.textContent = v; else if (k === "class") n.className = v; else n.setAttribute(k, v); }); kids.forEach(c => n.append(c)); return n; }
  const btn = (label, fn, cls) => { const b = make("button", { type: "button", text: label }); if (cls) b.className = cls; b.addEventListener("click", async () => { b.disabled = true; try { await fn(); } finally { b.disabled = false; } }); return b; };
  const when = iso => { try { return new Date(iso).toLocaleString(); } catch { return ""; } };
  const say = (id, t, bad) => { const n = $(id); n.textContent = t; n.style.color = bad ? "var(--red)" : "var(--green)"; };
  let sb = null, account = null;
  const client = () => sb || (sb = window.supabase && location.protocol !== "file:" ? window.supabase.createClient(SB_URL, SB_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } }) : null);
  async function call(name, args) { const c = client(); if (!c) throw new Error("Open this page through your website address (not file://) and check your connection."); const { data, error } = await c.rpc(name, args || {}); if (error) throw new Error(/schema cache|Could not find the function/i.test(error.message) ? "Community is not set up yet. Run community-content.sql with npm run migrate in the server folder." : error.message); return data; }
  async function flash(fn, okMsg) { try { const r = await fn(); if (okMsg) { $("topMsg").textContent = okMsg; $("topMsg").style.color = "var(--green)"; setTimeout(() => { $("topMsg").textContent = ""; }, 4000); } return r; } catch (e) { $("topMsg").textContent = e.message; $("topMsg").style.color = "var(--red)"; alert(e.message); return undefined; } }

  /* ---------- navigation ---------- */
  const VIEWS = ["overview", "reports", "content", "members", "rules", "log", "tutorial"];
  function show(name) {
    document.querySelectorAll("[data-view]").forEach(b => { const on = b.dataset.view === name; b.classList.toggle("active", on); b.setAttribute("aria-selected", String(on)); });
    VIEWS.forEach(v => { const s = $("v-" + v), on = v === name; s.hidden = !on; s.classList.toggle("active", on); });
    ({ overview: loadOverview, reports: loadReports, content: () => { }, members: () => { }, rules: loadRules, log: loadLog, tutorial: () => { } })[name]();
  }
  document.querySelectorAll("[data-view]").forEach(b => b.addEventListener("click", () => show(b.dataset.view)));

  /* ---------- overview ---------- */
  async function loadOverview() {
    const o = await flash(() => call("rp_mod_overview")); if (!o) return;
    const tiles = [["Open reports", o.open_reports, "reports"], ["Posts today", o.posts_today, "content"], ["Comments today", o.comments_today, "content"], ["Removed by mods today", o.removed_today, "log"], ["Members", o.members, "members"], ["Restricted now", o.restricted, "members"], ["Slow mode", o.settings.slow_mode_seconds ? o.settings.slow_mode_seconds + "s" : "Off", "rules"], ["Read-only", o.settings.read_only ? "ON" : "Off", "rules"]];
    $("ovTiles").replaceChildren(...tiles.map(([l, v, view]) => { const b = make("button", { type: "button", class: "ed-tile" }, make("span", { text: l }), make("strong", { text: String(v) })); b.addEventListener("click", () => show(view)); return b; }));
    $("repCount").textContent = o.open_reports ? "(" + o.open_reports + ")" : "";
    const list = await flash(() => call("rp_mod_restrictions")) || []; const root = $("ovRestricted"); root.replaceChildren(); if (!list.length) root.append(make("p", { class: "ed-empty", text: "Nobody is restricted." }));
    list.forEach(r => root.append(make("article", { class: "ed-row" }, make("div", {}, make("strong", { text: r.username }), make("span", { class: "ed-badge" + (r.kind === "ban" ? " draft" : ""), text: r.kind }), make("span", { class: "meta", text: (r.until ? "until " + when(r.until) : "permanent") + (r.reason ? " · " + r.reason : "") })), make("div", { class: "acts" }, btn("Lift", async () => { if (confirm("Lift the restriction on " + r.username + "?") && await flash(() => call("rp_mod_unrestrict", { p_username: r.username }), "Restriction lifted")) loadOverview(); })))));
  }
  $("ovRefresh").addEventListener("click", loadOverview);

  /* ---------- reports ---------- */
  const REASONS = { spam: "Spam", harassment: "Harassment", hate: "Hate speech", sexual: "Sexual content", violence: "Violence", scam: "Scam", privacy: "Private info", other: "Other" };
  async function loadReports() {
    const root = $("repList"), list = await flash(() => call("rp_mod_reports", { p_status: $("repStatus").value, p_limit: 60 })); if (!list) return; root.replaceChildren();
    $("repCount").textContent = $("repStatus").value === "open" && list.length ? "(" + list.length + ")" : $("repCount").textContent;
    if (!list.length) root.append(make("p", { class: "ed-empty", text: $("repStatus").value === "open" ? "No open reports. 🎉" : "Nothing handled yet." }));
    list.forEach(r => {
      const t = r.target || {}, what = r.target_type === "user" ? "Member @" + (t.author || r.target_id) : (r.target_type === "post" ? "Post" : "Comment") + " by @" + (t.author || "?");
      const head = make("div", {}, make("strong", { text: what }), make("span", { class: "ed-badge", text: REASONS[r.reason] || r.reason }), r.open_for_target > 1 ? make("span", { class: "ed-badge paid", text: r.open_for_target + " reports" }) : "", t.removed ? make("span", { class: "ed-badge draft", text: "already removed" }) : "");
      const body = make("div", { class: "meta", style: "white-space:pre-wrap;display:block;margin:6px 0" }, t.text ? "“" + t.text.slice(0, 400) + "”" : "(content no longer exists)");
      const info = make("span", { class: "meta", text: "Reported by @" + r.reporter + " · " + when(r.created_at) + (r.details ? " · “" + r.details + "”" : "") + (r.status !== "open" ? " · " + r.status + " by @" + (r.handled_by || "?") + ": " + (r.resolution || "") : "") });
      const row = make("article", { class: "ed-row", style: "flex-direction:column;align-items:stretch" }, head, body, info);
      if (t.image) row.insertBefore(make("a", { class: "meta", href: t.image, target: "_blank", rel: "noopener noreferrer", text: "Attached image link ↗" }), info);
      if (r.status === "open") {
        const note = make("input", { type: "text", maxlength: "200", placeholder: "Note to the member (optional)", style: "flex:1;min-width:160px" }), hrs = make("input", { type: "number", min: "1", max: "8760", placeholder: "hours", style: "width:90px", "aria-label": "Duration in hours" });
        const doit = (action, label) => btn(label, async () => { if (["mute", "ban"].includes(action) && action === "mute" && !hrs.value) return alert("Enter the mute length in hours."); if (!confirm(label + "?")) return; if (await flash(() => call("rp_mod_resolve_report", { p_id: r.id, p_action: action, p_note: note.value, p_hours: hrs.value ? Number(hrs.value) : null }), "Report handled")) { loadReports(); loadOverview(); } }, action === "dismiss" ? "" : "danger");
        row.append(make("div", { class: "ed-actions", style: "margin-top:8px" }, note, hrs, r.target_type === "user" ? "" : doit("remove", "Remove content"), doit("warn", "Warn"), doit("mute", "Mute"), doit("ban", "Ban"), doit("dismiss", "Dismiss")));
        if (r.target_type !== "user" && t.author) row.append(btn("Open member @" + t.author, () => { show("members"); $("mbName").value = t.author; lookup(t.author); }, "ed-mini"));
      }
      root.append(row);
    });
  }
  $("repStatus").addEventListener("change", loadReports); $("repRefresh").addEventListener("click", loadReports);

  /* ---------- content ---------- */
  async function loadContent() {
    const type = $("ctType").value, removed = $("ctRemoved").value === "true", root = $("ctList");
    const list = await flash(() => call("rp_mod_content", { p_type: type, p_query: $("ctQuery").value.trim(), p_removed: removed, p_limit: 40 })); if (!list) return; root.replaceChildren(); if (!list.length) root.append(make("p", { class: "ed-empty", text: "No matching " + type + "s." }));
    list.forEach(c => {
      const head = make("div", {}, make("strong", { text: "@" + c.author }), c.pinned ? make("span", { class: "ed-badge paid", text: "pinned" }) : "", make("span", { class: "meta", text: when(c.created_at) + (type === "post" ? " · " + c.likes + " likes · " + c.comments + " comments" : "") + (c.removed_reason ? " · removed: " + c.removed_reason : "") }));
      const acts = make("div", { class: "acts" });
      if (removed) acts.append(btn("Restore", async () => { if (await flash(() => call("rp_mod_restore", { p_type: type, p_id: c.id }), "Restored")) loadContent(); }));
      else {
        acts.append(btn("Remove", async () => { const reason = prompt("Reason shown to the member (optional):", ""); if (reason === null) return; if (await flash(() => call("rp_mod_remove", { p_type: type, p_id: c.id, p_reason: reason }), "Removed")) loadContent(); }, "danger"));
        if (type === "post") acts.append(btn(c.pinned ? "Unpin" : "Pin", async () => { if (await flash(() => call("rp_mod_pin", { p_id: c.id, p_on: !c.pinned }), c.pinned ? "Unpinned" : "Pinned")) loadContent(); }));
      }
      acts.append(btn("Member", () => { show("members"); $("mbName").value = c.author; lookup(c.author); }));
      root.append(make("article", { class: "ed-row", style: "flex-direction:column;align-items:stretch" }, head, make("div", { class: "meta", style: "white-space:pre-wrap;display:block;margin:6px 0", text: c.text.slice(0, 500) }), c.image ? make("a", { class: "meta", href: c.image, target: "_blank", rel: "noopener noreferrer", text: "Attached image link ↗" }) : "", acts));
    });
  }
  $("ctForm").addEventListener("submit", e => { e.preventDefault(); loadContent(); });

  /* ---------- members ---------- */
  async function lookup(name) {
    const root = $("mbResult"); root.replaceChildren(); const m = await flash(() => call("rp_mod_member", { p_username: name })); if (m === undefined) return;
    if (!m) { root.append(make("p", { class: "ed-empty", text: "No Community member with that username. (Members appear after their first visit to Community.)" })); return; }
    const r = m.restriction && m.restriction.active ? m.restriction : null;
    const card = make("div", { class: "ed-card" }, make("h3", { text: m.emoji + " " + m.username + (m.staff ? " (staff)" : "") }), make("p", { class: "ed-muted", text: "Joined " + when(m.joined) + (m.bio ? " · “" + m.bio + "”" : "") }),
      make("p", { text: m.posts + " posts (" + m.removed_posts + " removed) · " + m.comments + " comments · " + m.reports_against + " reports against" }));
    if (r) card.append(make("p", { class: "ed-note bad", text: (r.kind === "ban" ? "Banned" : "Muted") + (r.until ? " until " + when(r.until) : " permanently") + (r.reason ? ": " + r.reason : "") }), btn("Lift restriction", async () => { if (await flash(() => call("rp_mod_unrestrict", { p_username: m.username }), "Restriction lifted")) lookup(m.username); }));
    const reason = make("input", { type: "text", maxlength: "200", placeholder: "Reason (shown to the member)", style: "flex:1;min-width:180px" }), hrs = make("input", { type: "number", min: "1", max: "8760", placeholder: "hours", style: "width:90px", "aria-label": "Duration in hours" }), purgeBox = make("input", { type: "checkbox" });
    const act = (kind, label) => btn(label, async () => { if (kind === "mute" && !hrs.value) return alert("Enter the mute length in hours."); if (!confirm(label + " " + m.username + "?")) return; if (await flash(() => call("rp_mod_restrict", { p_username: m.username, p_kind: kind, p_hours: hrs.value ? Number(hrs.value) : null, p_reason: reason.value, p_purge: purgeBox.checked }), label + " applied")) lookup(m.username); }, "danger");
    card.append(make("div", { class: "ed-actions", style: "margin-top:10px" }, reason, hrs, act("mute", "Mute"), act("ban", "Ban")), make("label", { class: "ed-inline" }, purgeBox, document.createTextNode(" Also remove all their posts and comments (ban only)")),
      make("div", { class: "ed-actions", style: "margin-top:10px" }, btn("Send a warning…", async () => { const msg = prompt("Warning message (3 to 250 characters):", ""); if (!msg) return; if (await flash(() => call("rp_mod_warn", { p_username: m.username, p_message: msg }), "Warning sent")) lookup(m.username); })));
    root.append(card);
    const recent = make("div", { class: "ed-card" }, make("h3", { text: "Recent posts" })); if (!m.recent.length) recent.append(make("p", { class: "ed-muted", text: "No posts." }));
    m.recent.forEach(p => recent.append(make("article", { class: "ed-row" }, make("div", {}, make("span", { class: "meta", style: "white-space:pre-wrap", text: (p.removed ? "[removed] " : "") + p.text }), make("span", { class: "meta", text: when(p.created_at) })), make("div", { class: "acts" }, p.removed ? btn("Restore", async () => { if (await flash(() => call("rp_mod_restore", { p_type: "post", p_id: p.id }), "Restored")) lookup(m.username); }) : btn("Remove", async () => { const why = prompt("Reason (optional):", ""); if (why === null) return; if (await flash(() => call("rp_mod_remove", { p_type: "post", p_id: p.id, p_reason: why }), "Removed")) lookup(m.username); }, "danger")))));
    root.append(recent);
    const notes = make("div", { class: "ed-card" }, make("h3", { text: "Notices sent to this member" })); if (!m.notices.length) notes.append(make("p", { class: "ed-muted", text: "None." })); m.notices.forEach(n => notes.append(make("p", { class: "ed-muted", text: when(n.created_at) + " · " + n.kind + " · " + n.message }))); root.append(notes);
  }
  $("mbForm").addEventListener("submit", e => { e.preventDefault(); lookup($("mbName").value.trim()); });

  /* ---------- rules ---------- */
  async function loadRules() {
    const o = await flash(() => call("rp_mod_overview")); if (o) { $("ruSlow").value = o.settings.slow_mode_seconds; $("ruRead").checked = o.settings.read_only; $("ruImages").checked = o.settings.images_allowed; $("ruAnn").value = o.settings.announcement || ""; }
    const words = await flash(() => call("rp_mod_words")) || []; const root = $("wdList"); root.replaceChildren(); if (!words.length) root.append(make("p", { class: "ed-empty", text: "No blocked words." }));
    words.forEach(w => root.append(make("article", { class: "ed-row" }, make("div", {}, make("strong", { text: w })), make("div", { class: "acts" }, btn("Remove", async () => { if (await flash(() => call("rp_mod_word_remove", { p_word: w }))) loadRules(); }, "danger")))));
  }
  $("ruForm").addEventListener("submit", async e => { e.preventDefault(); if (await flash(() => call("rp_mod_set_settings", { p_slow: Number($("ruSlow").value) || 0, p_read_only: $("ruRead").checked, p_images: $("ruImages").checked, p_announcement: $("ruAnn").value }), "Settings saved")) say("ruMsg", "Saved. Members see changes within a minute."); });
  $("wdForm").addEventListener("submit", async e => { e.preventDefault(); const w = $("wdWord").value.trim(); if (!w) return; if (await flash(() => call("rp_mod_word_add", { p_word: w }), "Word added")) { $("wdWord").value = ""; loadRules(); } });

  /* ---------- log ---------- */
  const LABELS = { community_removed_post: "removed a post by", community_removed_comment: "removed a comment by", community_restored_post: "restored a post by", community_restored_comment: "restored a comment by", community_mute: "muted", community_ban: "banned", community_restriction_lifted: "lifted the restriction on", community_warned: "warned", community_pinned: "pinned a post by", community_unpinned: "unpinned a post by", community_report_dismissed: "dismissed a report", community_settings_changed: "changed community settings", community_word_added: "blocked a word", community_word_removed: "unblocked a word" };
  async function loadLog() {
    const list = await flash(() => call("rp_mod_log", { p_limit: 100 })); if (!list) return; const root = $("logList"); root.replaceChildren(); if (!list.length) root.append(make("p", { class: "ed-empty", text: "No moderation actions yet." }));
    list.forEach(l => { const d = l.details || {}, extra = [d.reason && "reason: " + d.reason, d.hours && d.hours + "h", d.purged && "posts purged", d.note && "note: " + d.note, d.word && "word: " + d.word].filter(Boolean).join(" · ");
      root.append(make("article", { class: "ed-row" }, make("div", {}, make("strong", { text: "@" + (l.actor || "?") + " " + (LABELS[l.action] || l.action) + (l.target ? " @" + l.target : "") }), make("span", { class: "meta", text: when(l.created_at) + (extra ? " · " + extra : "") })))); });
  }
  $("logRefresh").addEventListener("click", loadLog);

  /* ---------- boot ---------- */
  async function boot() {
    const gate = $("gate"), chip = $("accChip"); const c = client();
    const deny = (cls, ...kids) => { gate.hidden = false; gate.className = "ed-note " + cls; gate.replaceChildren(...kids); };
    if (!c) { chip.textContent = "Not available"; chip.className = "ed-chip bad"; return deny("bad", location.protocol === "file:" ? "Open this page through your website address or localhost. It cannot run from a file:// page." : "The sign-in library could not load. Check your connection and reload."); }
    try {
      const { data: { session } } = await c.auth.getSession(); if (!session) { chip.textContent = "Signed out"; chip.className = "ed-chip bad"; return deny("bad", make("a", { href: "../index/index.html", text: "Sign in on the main page" }), " with your employee account, then reload this page."); }
      const { data, error } = await c.rpc("rp_get_account_context"); if (error) throw error; const roles = Array.isArray(data.roles) ? data.roles : [];
      if (!(data.status === "active" && roles.some(r => EDITOR_ROLES.includes(r)))) { chip.textContent = "No access"; chip.className = "ed-chip bad"; return deny("bad", "Signed in as " + data.username + ", but this account has no Community employee role (" + (roles.join(", ") || "none") + "). Ask the Creator to assign one."); }
      account = data; chip.textContent = "● " + data.username; chip.className = "ed-chip ok"; $("app").hidden = false; show("overview"); setInterval(() => { if (!document.hidden && !$("v-overview").hidden) loadOverview(); }, 60000);
    } catch (e) { chip.textContent = "Error"; chip.className = "ed-chip bad"; deny("bad", "Could not check your account: " + e.message); }
  }
  boot();
})();
