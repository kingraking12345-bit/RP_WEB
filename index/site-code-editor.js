/* Creator > Code: edit any HTML / JS / CSS file of the website. Saved edits become overrides that every page applies via rp-site-loader.js. */
(() => {
  "use strict";
  const root = document.getElementById("rpCreatorPanel-code"); if (!root) return;
  const DRAFT = "rpSiteDraft.v1", ROOT = "../";
  const el = (tag, attrs = {}, ...kids) => { const n = document.createElement(tag); Object.entries(attrs).forEach(([k, v]) => { if (k === "text") n.textContent = v; else if (k === "class") n.className = v; else n.setAttribute(k, v); }); kids.forEach(c => n.append(c)); return n; };
  const sb = () => (typeof rpSupabase !== "undefined" ? rpSupabase : null);
  const demo = () => typeof rpDemoMode !== "undefined" && rpDemoMode;
  const isCreator = () => typeof rpCurrentAccount !== "undefined" && rpCurrentAccount && Array.isArray(rpCurrentAccount.roles) && rpCurrentAccount.roles.includes("Creator");
  const pathOk = p => /^[A-Za-z0-9_-]+\/[A-Za-z0-9_.-]+\.(html|js|css)$/.test(p) && !p.includes("..") && p !== "index/rp-site-loader.js";
  const draftStore = () => { try { const v = JSON.parse(localStorage.getItem(DRAFT) || "null"); return v && v.files ? v : { files: {} }; } catch { return { files: {} }; } };
  const saveDraft = (p, c) => { try { const d = draftStore(); if (c === null) delete d.files[p]; else d.files[p] = { c }; localStorage.setItem(DRAFT, JSON.stringify(d)); } catch { /* full */ } };

  const st = { files: [], overrides: new Map(), path: "", original: "", live: null, busy: false, built: false };
  let ui = {};
  const msg = (t, bad) => { ui.msg.textContent = t; ui.msg.style.color = bad ? "#f87171" : "var(--green,#34d399)"; };

  function build() {
    if (st.built) return; st.built = true; root.replaceChildren();
    root.append(el("h3", { text: "Website code" }),
      el("p", { class: "rp-creator-note", text: "Edit any page, script or stylesheet of the whole website. Saving publishes your version as an override that every visitor gets on their next page load; the original file on your host is never changed, so you can always Reset to original. Only the Creator can do this, and every save is kept in history and in the audit log." }),
      el("p", { class: "rp-creator-note", text: "Emergency exit: if a bad edit breaks a page, open that page with ?rpsafe=1 at the end of its address (for example index.html?rpsafe=1). Overrides are ignored and you can fix or reset them here." }));
    ui.msg = el("p", { class: "rp-creator-note", role: "status", "aria-live": "polite" });
    ui.search = el("input", { type: "search", placeholder: "Filter files…", "aria-label": "Filter files" });
    ui.list = el("div", { class: "rp-code-files" });
    ui.open = el("input", { type: "text", placeholder: "Open other path, e.g. Games/new.js", "aria-label": "Open path" });
    ui.openBtn = el("button", { type: "button", class: "rp-account-btn", text: "Open" });
    const left = el("div", { class: "rp-code-side" }, ui.search, ui.list, el("div", { class: "rp-code-open" }, ui.open, ui.openBtn));
    ui.title = el("strong", { text: "No file open" }); ui.badge = el("span", { class: "rp-code-badge", text: "" });
    ui.area = el("textarea", { class: "rp-code-area", spellcheck: "false", wrap: "off", "aria-label": "File editor", disabled: "" });
    ui.status = el("span", { class: "rp-creator-note", text: "" }); ui.status.style.margin = "0";
    ui.find = el("input", { type: "text", placeholder: "Find", "aria-label": "Find" }); ui.repl = el("input", { type: "text", placeholder: "Replace with", "aria-label": "Replace with" });
    const b = (t, fn, cls) => { const x = el("button", { type: "button", class: "rp-account-btn" + (cls ? " " + cls : ""), text: t }); x.addEventListener("click", fn); return x; };
    ui.note = el("input", { type: "text", placeholder: "Note for the history (optional)", maxlength: "200", "aria-label": "History note" });
    ui.buttons = { find: b("Find next", findNext), all: b("Replace all", replaceAll), preview: b("Preview draft ↗", previewDraft), publish: b("Publish live", publish, "primary"), reset: b("Reset to original", resetFile), toggle: b("Disable override", toggle), orig: b("Load original", loadOriginal), dl: b("Download", download), hist: b("History", history) };
    const bar1 = el("div", { class: "rp-code-bar" }, ui.find, ui.buttons.find, ui.repl, ui.buttons.all), bar2 = el("div", { class: "rp-code-bar" }, ui.note, ui.buttons.preview, ui.buttons.publish), bar3 = el("div", { class: "rp-code-bar" }, ui.buttons.orig, ui.buttons.toggle, ui.buttons.reset, ui.buttons.dl, ui.buttons.hist);
    ui.hist = el("div", { class: "rp-code-hist" }); ui.hist.hidden = true;
    const main = el("div", { class: "rp-code-main" }, el("div", { class: "rp-code-title" }, ui.title, ui.badge), bar1, ui.area, ui.status, bar2, bar3, ui.hist);
    root.append(ui.msg, el("div", { class: "rp-code-layout" }, left, main));
    const css = el("style", { text: `
.rp-code-layout{display:grid;grid-template-columns:260px minmax(0,1fr);gap:14px;align-items:start}
@media(max-width:860px){.rp-code-layout{grid-template-columns:1fr}}
.rp-code-side{display:grid;gap:8px;min-width:0}.rp-code-side input,.rp-code-bar input{width:100%;padding:8px;box-sizing:border-box;border:1px solid var(--border);border-radius:6px;background:var(--panel2);color:var(--text);font:inherit;min-width:0}
.rp-code-files{max-height:520px;overflow:auto;border:1px solid var(--border);border-radius:8px;background:var(--panel2)}
.rp-code-dir{padding:6px 10px;font-size:.72rem;color:var(--muted);text-transform:uppercase;letter-spacing:.06em;border-bottom:1px solid var(--border)}
.rp-code-file{display:flex;justify-content:space-between;gap:6px;width:100%;text-align:left;padding:7px 10px;border:0;border-bottom:1px solid rgba(255,255,255,.04);background:none;color:var(--text);font:inherit;font-size:.82rem;cursor:pointer}
.rp-code-file:hover,.rp-code-file.on{background:rgba(46,230,230,.1)}.rp-code-file .dot{color:#fbbf24}.rp-code-file .dot.off{color:var(--muted)}
.rp-code-open{display:flex;gap:6px}.rp-code-open input{flex:1;min-width:0;width:auto}.rp-code-bar input{width:auto}
.rp-code-main{display:grid;gap:8px;min-width:0}.rp-code-title{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
.rp-code-badge{font-size:.72rem;padding:2px 8px;border-radius:20px;background:rgba(251,191,36,.15);color:#fcd34d}.rp-code-badge:empty{display:none}
.rp-code-bar{display:flex;gap:6px;flex-wrap:wrap;align-items:center}.rp-code-bar input{flex:1;min-width:140px}
.rp-code-area{width:100%;min-height:460px;padding:12px;border:1px solid var(--border);border-radius:8px;background:#030814;color:#c9e7ff;font:13px/1.5 Consolas,'Courier New',monospace;tab-size:2;white-space:pre;overflow:auto;resize:vertical}
.rp-code-hist{border:1px solid var(--border);border-radius:8px;padding:8px;display:grid;gap:6px;background:var(--panel2)}.rp-code-hist div{display:flex;gap:8px;justify-content:space-between;align-items:center;font-size:.82rem;flex-wrap:wrap}
` }); document.head.append(css);
    ui.search.addEventListener("input", renderList); ui.openBtn.addEventListener("click", () => { const p = ui.open.value.trim(); if (!pathOk(p)) return msg("Use a path like Folder/file.html (.html, .js or .css).", true); openFile(p); });
    ui.area.addEventListener("input", () => { updateStatus(); saveDraft(st.path, ui.area.value === st.original && !st.live ? null : ui.area.value); });
    ui.area.addEventListener("keyup", updateStatus); ui.area.addEventListener("click", updateStatus);
    ui.area.addEventListener("keydown", e => { if (e.key === "Tab" && !e.shiftKey) { e.preventDefault(); ui.area.setRangeText("  ", ui.area.selectionStart, ui.area.selectionEnd, "end"); ui.area.dispatchEvent(new Event("input")); } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") { e.preventDefault(); publish(); } });
    setButtons();
  }
  function setButtons() { const on = !!st.path && !st.busy; Object.values(ui.buttons).forEach(x => { x.disabled = !on; }); ui.area.disabled = !st.path; if (st.path) { ui.buttons.toggle.disabled = !st.overrides.has(st.path) || st.busy; ui.buttons.reset.disabled = !st.overrides.has(st.path) || st.busy; ui.buttons.toggle.textContent = st.overrides.has(st.path) && !st.overrides.get(st.path).enabled ? "Enable override" : "Disable override"; } }
  function updateStatus() { const a = ui.area, before = a.value.slice(0, a.selectionStart), line = before.split("\n").length, col = before.length - before.lastIndexOf("\n"); ui.status.textContent = "Line " + line + ", column " + col + " · " + a.value.length.toLocaleString() + " characters" + (a.value !== (st.live ? st.live.content : st.original) ? " · unpublished changes" : ""); }

  function renderList() {
    const f = ui.search.value.trim().toLowerCase(), groups = {}; st.files.filter(p => !f || p.toLowerCase().includes(f)).forEach(p => { const [d, n] = p.split("/"); (groups[d] = groups[d] || []).push([p, n]); });
    ui.list.replaceChildren(); Object.keys(groups).sort().forEach(d => { ui.list.append(el("div", { class: "rp-code-dir", text: d })); groups[d].forEach(([p, n]) => { const o = st.overrides.get(p), row = el("button", { type: "button", class: "rp-code-file" + (p === st.path ? " on" : "") }, el("span", { text: n }), o ? el("span", { class: "dot" + (o.enabled ? "" : " off"), text: o.enabled ? "● edited" : "○ off", title: "Version " + o.version }) : document.createTextNode("")); row.addEventListener("click", () => openFile(p)); ui.list.append(row); }); });
    if (!ui.list.children.length) ui.list.append(el("div", { class: "rp-code-dir", text: "No files match" }));
  }
  async function loadFileList() {
    try { const r = await fetch("site-files.json", { cache: "no-store" }); const j = await r.json(); st.files = Array.isArray(j.files) ? j.files.slice() : []; } catch { st.files = []; }
    if (!st.files.includes("index/site-code-editor.js")) st.files.push("index/site-code-editor.js");
    if (!demo() && sb() && isCreator()) { const { data, error } = await sb().rpc("rp_list_site_files"); if (!error && Array.isArray(data)) { st.overrides = new Map(data.map(o => [o.path, o])); data.forEach(o => { if (!st.files.includes(o.path)) st.files.push(o.path); }); } else if (error && /rp_list_site_files|schema cache|does not exist/i.test(error.message)) msg("Not set up yet. Run site-code.sql with npm run migrate in the server folder.", true); }
    st.files.sort(); renderList();
  }
  async function fetchOriginal(p) { const r = await fetch(ROOT + p, { cache: "no-store" }); if (!r.ok) throw new Error("Could not load " + p + " (HTTP " + r.status + ")"); return r.text(); }
  async function openFile(p) {
    if (st.busy) return; if (st.path && ui.area.value !== (st.live ? st.live.content : st.original) && !confirm("Switch files? Your unpublished edits in " + st.path + " stay saved as a local draft.")) return;
    st.busy = true; setButtons(); msg("Loading " + p + "…");
    try {
      st.path = p; st.live = null; st.original = ""; let origErr = "";
      try { st.original = await fetchOriginal(p); } catch (e) { origErr = e.message; }
      if (!demo() && sb() && isCreator() && st.overrides.has(p)) { const { data, error } = await sb().rpc("rp_get_site_file", { p_path: p }); if (!error && data) st.live = data; }
      const draft = draftStore().files[p], base = st.live ? st.live.content : st.original; let text = base, usedDraft = false;
      if (draft && typeof draft.c === "string" && draft.c !== base && confirm("You have an unpublished local draft of " + p + ". Restore it?")) { text = draft.c; usedDraft = true; }
      ui.area.value = text; ui.title.textContent = p; ui.badge.textContent = st.live ? "Override v" + st.live.version + (st.live.enabled ? " (live)" : " (disabled)") : (origErr ? "New file" : "Original"); ui.hist.hidden = true;
      msg(origErr && !st.live ? origErr + " You can still write the file from scratch." : usedDraft ? "Local draft restored." : "Loaded " + p + "."); renderList(); updateStatus();
    } finally { st.busy = false; setButtons(); }
  }
  function findNext() { const q = ui.find.value; if (!q) return; const a = ui.area, i = a.value.indexOf(q, a.selectionEnd); const j = i >= 0 ? i : a.value.indexOf(q); if (j < 0) return msg("Not found.", true); a.focus(); a.setSelectionRange(j, j + q.length); const line = a.value.slice(0, j).split("\n").length; a.scrollTop = Math.max(0, (line - 4) * 19.5); updateStatus(); msg(""); }
  function replaceAll() { const q = ui.find.value; if (!q) return; const parts = ui.area.value.split(q), n = parts.length - 1; if (!n) return msg("Not found.", true); if (!confirm("Replace " + n + " occurrence(s)?")) return; ui.area.value = parts.join(ui.repl.value); ui.area.dispatchEvent(new Event("input")); msg("Replaced " + n + " occurrence(s). Not published yet."); }
  function check(p, text) {
    if (/\.js$/.test(p)) { try { new Function(text); } catch (e) { return "JavaScript syntax problem: " + e.message; } }
    if (/\.html$/.test(p)) { if (!/<html[\s>]/i.test(text)) return "This does not look like a full HTML page (no <html> tag)."; if (!/rp-site-loader\.js/.test(text)) return "The page has no rp-site-loader.js script in its <head>, so it could not be edited again later."; }
    return "";
  }
  function previewDraft() {
    const t = ui.area.value; saveDraft(st.path, t); const [d, n] = st.path.split("/"); if (!/\.html$/.test(n)) return msg("Draft saved. Open any page that uses this file with ?rpdraft=1 at the end of its address to preview it.");
    window.open(ROOT + st.path + "?rpdraft=1", "_blank", "noopener"); msg("Opened a preview using your local draft. Nothing is published yet.");
  }
  async function publish() {
    if (st.busy || !st.path) return; if (demo()) return msg("Demo preview only. Sign in as the Creator to publish.", true); if (!sb() || !isCreator()) return msg("Creator role required.", true);
    const t = ui.area.value, problem = check(st.path, t); if (!t.trim()) return msg("The file is empty.", true); if (problem && !confirm(problem + "\n\nPublish anyway?")) return;
    if (!confirm("Publish " + st.path + " live for every visitor?")) return; st.busy = true; setButtons(); msg("Publishing…");
    const { data, error } = await sb().rpc("rp_save_site_file", { p_path: st.path, p_content: t, p_note: ui.note.value.trim() }); st.busy = false;
    if (error) { setButtons(); return msg(/rp_save_site_file|schema cache|does not exist/i.test(error.message) ? "Not set up yet. Run site-code.sql with npm run migrate in the server folder." : error.message, true); }
    ui.note.value = ""; saveDraft(st.path, null); await loadFileList(); st.live = { content: t, version: data, enabled: true }; ui.badge.textContent = "Override v" + data + " (live)"; setButtons(); updateStatus(); msg("Published as version " + data + ". Visitors get it on their next page load.");
  }
  async function toggle() {
    const o = st.overrides.get(st.path); if (!o || st.busy) return; const next = !o.enabled; st.busy = true; setButtons();
    const { error } = await sb().rpc("rp_set_site_file_enabled", { p_path: st.path, p_enabled: next }); st.busy = false; if (error) { setButtons(); return msg(error.message, true); }
    await loadFileList(); const n = st.overrides.get(st.path); ui.badge.textContent = n ? "Override v" + n.version + (n.enabled ? " (live)" : " (disabled)") : ""; setButtons(); msg(next ? "Override enabled." : "Override disabled: visitors get the original file.");
  }
  async function resetFile() {
    if (!st.overrides.has(st.path) || st.busy || !confirm("Remove your override of " + st.path + " and go back to the original file?")) return; st.busy = true; setButtons();
    const { error } = await sb().rpc("rp_reset_site_file", { p_path: st.path }); st.busy = false; if (error) { setButtons(); return msg(error.message, true); }
    st.live = null; saveDraft(st.path, null); await loadFileList(); ui.area.value = st.original; ui.badge.textContent = "Original"; setButtons(); updateStatus(); msg("Reset. Visitors get the original file again (history keeps your version).");
  }
  async function loadOriginal() { try { const t = await fetchOriginal(st.path); if (!confirm("Replace the editor text with the original file from your host?")) return; ui.area.value = t; st.original = t; ui.area.dispatchEvent(new Event("input")); msg("Original loaded. Not published."); } catch (e) { msg(e.message, true); } }
  function download() { const u = URL.createObjectURL(new Blob([ui.area.value], { type: "text/plain" })), a = el("a", { href: u, download: st.path.split("/")[1] }); a.click(); setTimeout(() => URL.revokeObjectURL(u), 1000); }
  async function history() {
    if (demo() || !sb()) return msg("History needs a signed-in Creator.", true); ui.hist.hidden = false; ui.hist.replaceChildren(el("div", { text: "Loading…" }));
    const { data, error } = await sb().rpc("rp_site_file_history", { p_path: st.path }); if (error) return ui.hist.replaceChildren(el("div", { text: error.message }));
    if (!data.length) return ui.hist.replaceChildren(el("div", { text: "No saved versions yet." }));
    ui.hist.replaceChildren(...data.map(h => { const r = el("div", {}, el("span", { text: "v" + h.version + " · " + h.action + " · " + new Date(h.saved_at).toLocaleString() + (h.note ? " · " + h.note : "") + " · " + h.size.toLocaleString() + " chars" })); const x = el("button", { type: "button", class: "rp-account-btn", text: "Load into editor" }); x.addEventListener("click", async () => { const { data: c, error: e2 } = await sb().rpc("rp_site_file_history_content", { p_id: h.id }); if (e2) return msg(e2.message, true); ui.area.value = c; ui.area.dispatchEvent(new Event("input")); msg("Loaded version " + h.version + " into the editor. Press Publish live to use it."); }); r.append(x); return r; }));
  }

  let started = false;
  function start() {
    build(); if (demo()) { msg("Demo preview only: you can browse and edit files here, but publishing is disabled.", false); }
    else if (!isCreator()) { msg("Creator role required.", true); } if (started) return; started = true; loadFileList();
  }
  document.querySelectorAll('[data-creator-tab="code"]').forEach(btn => btn.addEventListener("click", start));
})();
