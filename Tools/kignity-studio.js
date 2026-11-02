/* Kignity AI studio (Tools employee workspace).
 * Same coding system as the Games Script Studio: folders, files, languages, editor, manager, export.
 * The AI runs on the project scripts: every edit reloads the runtime and the test chat uses the new scripts.
 */
(() => {
  "use strict";
  const KEY = "rpKignityProject.v1";
  const ROOT = "KIGNITY AI";
  const TYPES = {
    js: ["JavaScript", ".js", "// Kignity skill\nKignity.skill({\n  name: \"my-skill\",\n  patterns: [\"example\"],\n  reply: () => \"This is my new skill.\"\n});\n"],
    json: ["JSON", ".json", "{\n  \n}\n"],
    md: ["Markdown", ".md", "# Notes\n"],
    txt: ["Text", ".txt", ""],
    html: ["HTML", ".html", ""],
    css: ["CSS", ".css", ""],
    ts: ["TypeScript", ".ts", "// Stored only. Kignity runs JavaScript.\n"],
    py: ["Python", ".py", "# Stored only. Kignity runs JavaScript.\n"],
    lua: ["Lua", ".lua", "-- Stored only. Kignity runs JavaScript.\n"],
    sql: ["SQL", ".sql", "-- Stored only.\n"],
    xml: ["XML", ".xml", "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n"],
    yaml: ["YAML", ".yaml", "# Stored only.\n"]
  };
  const RUNS = new Set(["js"]);
  const $ = id => document.getElementById(id);
  const host = $("kgStudio");
  if (!host || !window.KignityRuntime) return;

  const el = (tag, attrs = {}, ...kids) => {
    const n = document.createElement(tag);
    Object.entries(attrs).forEach(([k, v]) => { if (k === "text") n.textContent = v; else if (k in n && k !== "list") n[k] = v; else n.setAttribute(k, v); });
    kids.forEach(k => n.append(k));
    return n;
  };
  const typeOf = path => { const ext = "." + path.split(".").pop().toLowerCase(); return Object.keys(TYPES).find(k => TYPES[k][1] === ext) || "txt"; };

  /* ---------- state ---------- */
  function fresh() {
    return { folders: [], selectedFolder: "", selectedPath: "skills/01-greetings.js", files: window.KignityRuntime.starterFiles() };
  }
  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(KEY) || "null");
      if (s && Array.isArray(s.files) && Array.isArray(s.folders)) {
        s.files = s.files.filter(f => f && typeof f.path === "string");
        return s;
      }
    } catch (e) { /* fresh project */ }
    return fresh();
  }
  let data = load(), saveTimer, reloadTimer, runtime = null, runtimeInfo = null, logs = [];

  /* ---------- markup ---------- */
  host.innerHTML = "";
  const typeSelect = el("select", { id: "kgFileType" });
  Object.keys(TYPES).forEach(k => typeSelect.append(el("option", { value: k, text: TYPES[k][0] + " (" + TYPES[k][1] + ")" })));
  const ui = {
    folderName: el("input", { id: "kgFolderName", maxLength: 48, placeholder: "e.g. skills" }),
    fileName: el("input", { id: "kgFileName", maxLength: 48, placeholder: "e.g. opening-hours" }),
    tree: el("div", { id: "kgTree", className: "te-file-tree", role: "tree", ariaLabel: "Kignity AI files" }),
    current: el("strong", { id: "kgCurrentFile" }), crumb: el("span", { id: "kgBreadcrumb" }), save: el("span", { id: "kgSaveState", text: "Saved" }),
    lines: el("pre", { id: "kgLineNumbers", ariaHidden: "true", textContent: "1" }),
    code: el("textarea", { id: "kgCode", spellcheck: false, wrap: "off", ariaLabel: "Kignity AI source code" }),
    cursor: el("span", { id: "kgCursor" }), lang: el("span", { id: "kgLang" }),
    mName: el("dd", { id: "kgManagerName" }), mLang: el("dd", { id: "kgManagerLanguage" }), mSize: el("dd", { id: "kgManagerSize" }), mLoc: el("dd", { id: "kgManagerLocation" }),
    msg: el("p", { id: "kgMessage", className: "te-code-note", role: "status" }),
    status: el("div", { id: "kgRunStatus", className: "kg-run-status" }),
    chat: el("div", { id: "kgChat" }),
    console: el("div", { id: "kgConsole", className: "kg-console", role: "log" })
  };
  const btn = (id, text, cls) => el("button", { type: "button", id, textContent: text, className: cls || "" });
  const explorer = el("aside", { className: "te-code-explorer" },
    el("div", { className: "te-pane-head" }, el("strong", { text: "Project" }), el("span", { text: ROOT })),
    el("div", { className: "te-file-create" },
      el("label", { textContent: "Folder name" }, ui.folderName), btn("kgCreateFolder", "Create folder"),
      el("label", { textContent: "File name" }, ui.fileName), el("label", { textContent: "Script type" }, typeSelect), btn("kgCreateFile", "Create file")),
    el("div", { className: "te-file-tree-label", text: "Files" }), ui.tree);
  const editor = el("section", { className: "te-code-editor", ariaLabel: "Kignity source editor" },
    el("div", { className: "te-code-heading" }, el("div", {}, ui.current, ui.crumb), ui.save),
    el("div", { className: "te-editor" }, ui.lines, ui.code),
    el("div", { className: "te-editor-status" }, ui.cursor, ui.lang));
  const dl = el("dl", { className: "te-file-details" },
    el("dt", { text: "Selected file" }), ui.mName, el("dt", { text: "Language" }), ui.mLang, el("dt", { text: "Size" }), ui.mSize, el("dt", { text: "Location" }), ui.mLoc);
  const manager = el("aside", { className: "te-code-manager" },
    el("div", { className: "te-pane-head" }, el("strong", { text: "Script manager" })), dl,
    el("div", { className: "te-code-actions" }, btn("kgRerun", "Reload AI now"), btn("kgDownload", "Download file"), btn("kgExport", "Export project folder"), btn("kgDeleteFile", "Delete selected file", "danger"), btn("kgDeleteFolder", "Delete selected folder", "danger"), btn("kgReset", "Reset to starter project", "danger")),
    el("p", { className: "te-code-note", text: "JavaScript files run as the AI's scripts. JSON, Markdown and text files are knowledge you can read with Kignity.data(). Other languages are stored and exported but not run." }), ui.msg);
  const bottom = el("section", { className: "kg-bottom" },
    el("div", { className: "kg-test" }, el("div", { className: "te-pane-head" }, el("strong", { text: "Test chat" }), el("span", { text: "Runs your scripts" })), ui.status, ui.chat),
    el("div", { className: "kg-consolewrap" }, el("div", { className: "te-pane-head" }, el("strong", { text: "Script console" }), el("button", { type: "button", id: "kgClearLog", className: "kg-mini", textContent: "Clear" })), ui.console));
  host.append(el("div", { className: "te-code-workspace kg-workspace" }, explorer, editor, manager), bottom);
  const chat = window.KignityRuntime.mountChat(ui.chat, { title: "Kignity AI", tag: "test" });

  /* ---------- helpers ---------- */
  const byPath = p => data.files.find(f => f.path === p);
  const sel = () => byPath(data.selectedPath);
  const base = p => p.split("/").pop();
  const parent = p => p.split("/").slice(0, -1).join("/");
  const clean = v => v.trim().replace(/[\\/:*?"<>|]/g, "-").replace(/^\.+|\.+$/g, "").trim();
  const join = (a, b) => a ? a + "/" + b : b;
  function tell(text, bad) { ui.msg.textContent = text; ui.msg.style.color = bad ? "var(--te-red)" : "var(--te-accent)"; }
  function persist() {
    try { localStorage.setItem(KEY, JSON.stringify(data)); ui.save.textContent = "Saved"; return true; }
    catch (e) { ui.save.textContent = "Storage full"; return false; }
  }
  function flush() { clearTimeout(saveTimer); const f = sel(); if (f) { f.content = ui.code.value; f.updatedAt = new Date().toISOString(); } persist(); }

  /* ---------- runtime ---------- */
  function addLog(m) {
    logs.push({ level: m.level || "log", file: m.file || "", text: m.text || "", at: new Date() });
    if (logs.length > 200) logs.shift();
    renderLogs();
  }
  function renderLogs() {
    ui.console.replaceChildren();
    if (!logs.length) { ui.console.append(el("p", { className: "te-empty", text: "console.log(...) output and script errors appear here." })); return; }
    logs.forEach(l => {
      const row = el("div", { className: "kg-log " + l.level });
      row.append(el("time", { text: l.at.toLocaleTimeString() }), el("b", { text: l.file ? l.file + ": " : "" }), document.createTextNode(l.text));
      ui.console.append(row);
    });
    ui.console.scrollTop = ui.console.scrollHeight;
  }
  async function reload(keepChat) {
    clearTimeout(reloadTimer);
    if (runtime) runtime.stop();
    ui.status.textContent = "Loading scripts…"; ui.status.className = "kg-run-status";
    runtime = window.KignityRuntime.create(data.files, { context: { tools: sampleTools() }, onLog: addLog });
    const r = await runtime.ready();
    runtimeInfo = r.info;
    r.errors.forEach(e => addLog({ level: "error", file: e.path, text: e.message }));
    const n = r.info.skills.length;
    ui.status.textContent = r.errors.length ? r.errors.length + " error" + (r.errors.length === 1 ? "" : "s") + " · " + n + " skill" + (n === 1 ? "" : "s") + " running" : "Running · " + n + " skill" + (n === 1 ? "" : "s") + " loaded";
    ui.status.className = "kg-run-status " + (r.errors.length ? "bad" : "ok");
    chat.attach(runtime, r.info, { keep: keepChat });
    document.dispatchEvent(new CustomEvent("rp-kignity-reloaded", { detail: { errors: r.errors, skills: r.info.skills } }));
  }
  function sampleTools() {
    try {
      const t = JSON.parse(localStorage.getItem("rpToolsManaged.v1") || "[]");
      if (Array.isArray(t) && t.length) return t.filter(x => x && x.name).map(x => ({ name: String(x.name), description: String(x.description || ""), price: Number(x.price) || 0 }));
    } catch (e) { /* no tools yet */ }
    return [{ name: "Study Timer (example)", description: "Example tool shown while testing.", price: 0 }, { name: "Color Picker (example)", description: "Example tool shown while testing.", price: 25 }];
  }
  const scheduleReload = () => { clearTimeout(reloadTimer); reloadTimer = setTimeout(() => reload(true), 700); };

  /* ---------- rendering ---------- */
  function renderTree() {
    ui.tree.replaceChildren();
    const row = (label, depth, active, cls, onClick, title) => {
      const b = el("button", { type: "button", className: "te-file-row te-tree-item " + cls + (active ? " active" : ""), role: "treeitem", textContent: label, title: title || label });
      b.style.setProperty("--depth", depth); b.setAttribute("aria-selected", String(!!active)); b.addEventListener("click", onClick); ui.tree.append(b);
    };
    row("▣  " + ROOT, 0, data.selectedFolder === "" && !sel(), "te-tree-folder", () => { flush(); data.selectedFolder = ""; renderTree(); renderManager(); });
    [...data.folders].sort((a, b) => a.localeCompare(b)).forEach(p => row("▸  " + base(p), p.split("/").length, data.selectedFolder === p, "te-tree-folder", () => { flush(); data.selectedFolder = p; renderTree(); renderManager(); }, p));
    [...data.files].sort((a, b) => a.path.localeCompare(b.path)).forEach(f => {
      const runs = RUNS.has(f.type || typeOf(f.path));
      row((runs ? "▶  " : "▤  ") + base(f.path), f.path.split("/").length, data.selectedPath === f.path, "", () => openFile(f.path), f.path + (runs ? " (runs)" : ""));
    });
  }
  function lines() {
    const n = Math.max(1, ui.code.value.split("\n").length);
    ui.lines.textContent = Array.from({ length: n }, (_, i) => i + 1).join("\n"); ui.lines.scrollTop = ui.code.scrollTop;
    const b = ui.code.value.slice(0, ui.code.selectionStart).split("\n"); ui.cursor.textContent = "Line " + b.length + ", column " + (b[b.length - 1].length + 1);
  }
  function renderManager() {
    const f = sel();
    if (!f) {
      ui.current.textContent = "No file selected"; ui.crumb.textContent = ROOT + (data.selectedFolder ? " / " + data.selectedFolder : "");
      ui.mName.textContent = ui.mLang.textContent = ui.mSize.textContent = "—"; ui.mLoc.textContent = data.selectedFolder || ROOT; ui.lang.textContent = "NO FILE";
      ui.code.value = ""; ui.code.disabled = true; lines(); return;
    }
    ui.code.disabled = false; ui.code.value = f.content;
    const t = TYPES[f.type] || TYPES.txt;
    ui.current.textContent = base(f.path); ui.crumb.textContent = ROOT + " / " + f.path;
    ui.mName.textContent = base(f.path); ui.mLang.textContent = t[0] + (RUNS.has(f.type) ? " (runs)" : ""); ui.mSize.textContent = new Blob([f.content]).size.toLocaleString() + " bytes"; ui.mLoc.textContent = parent(f.path) || ROOT; ui.lang.textContent = t[0].toUpperCase(); ui.save.textContent = "Saved"; lines();
  }
  function openFile(path) { flush(); data.selectedPath = path; data.selectedFolder = parent(path); renderTree(); renderManager(); }

  /* ---------- actions ---------- */
  function createFolder() {
    const name = clean(ui.folderName.value); if (!name) return tell("Enter a folder name first.", true);
    const path = join(data.selectedFolder, name);
    if (data.folders.includes(path) || data.files.some(f => f.path === path)) return tell("A folder or file with that name already exists here.", true);
    data.folders.push(path); data.selectedFolder = path; ui.folderName.value = ""; persist(); renderTree(); renderManager(); tell("Created " + ROOT + " / " + path);
  }
  function createFile() {
    const key = typeSelect.value, t = TYPES[key]; let name = clean(ui.fileName.value); if (!name) return tell("Enter a file name first.", true);
    if (!name.toLowerCase().endsWith(t[1])) name += t[1];
    const path = join(data.selectedFolder, name);
    if (data.files.some(f => f.path === path) || data.folders.includes(path)) return tell("A folder or file with that name already exists here.", true);
    data.files.push({ path, type: key, content: t[2], updatedAt: new Date().toISOString() }); data.selectedPath = path; ui.fileName.value = "";
    persist(); renderTree(); renderManager(); ui.code.focus(); tell("Created " + path + (RUNS.has(key) ? ". It runs as an AI script." : ".")); scheduleReload();
  }
  function download(name, content) { const u = URL.createObjectURL(new Blob([content], { type: "text/plain;charset=utf-8" })), a = document.createElement("a"); a.href = u; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(u), 1000); }
  async function dirFor(root, path) { let cur = root; for (const s of path.split("/").filter(Boolean)) cur = await cur.getDirectoryHandle(s, { create: true }); return cur; }
  async function exportProject() {
    flush();
    if (!window.showDirectoryPicker) { download("kignity-project.json", JSON.stringify({ folders: data.folders, files: data.files }, null, 2)); return tell("Folder export is not available in this browser, so the project was downloaded as one JSON file."); }
    try {
      const top = await window.showDirectoryPicker({ mode: "readwrite" }), root = await top.getDirectoryHandle(ROOT, { create: true });
      for (const f of data.folders) await dirFor(root, f);
      for (const f of data.files) { const bits = f.path.split("/"), name = bits.pop(), d = await dirFor(root, bits.join("/")), h = await d.getFileHandle(name, { create: true }), w = await h.createWritable(); await w.write(f.content); await w.close(); }
      tell("Project exported to the folder you selected.");
    } catch (e) { if (e.name !== "AbortError") tell("Export failed: " + e.message, true); }
  }
  function deleteFile() {
    const f = sel(); if (!f) return tell("Select a file first.", true);
    if (!confirm("Delete " + f.path + " from the Kignity project?")) return;
    data.files = data.files.filter(x => x.path !== f.path); data.selectedPath = data.files[0] ? data.files[0].path : ""; persist(); renderTree(); renderManager(); tell("File deleted."); scheduleReload();
  }
  function deleteFolder() {
    const folder = data.selectedFolder; if (!folder) return tell("Select a folder first. The project root cannot be deleted.", true);
    if (!confirm("Delete folder “" + folder + "” and everything inside it?")) return;
    data.folders = data.folders.filter(p => p !== folder && !p.startsWith(folder + "/")); data.files = data.files.filter(f => !f.path.startsWith(folder + "/"));
    if (!byPath(data.selectedPath)) data.selectedPath = data.files[0] ? data.files[0].path : ""; data.selectedFolder = parent(folder); persist(); renderTree(); renderManager(); tell("Folder deleted."); scheduleReload();
  }
  function resetProject() {
    if (!confirm("Replace the whole Kignity project with the starter project? Your current scripts will be lost.")) return;
    data = fresh(); persist(); renderTree(); renderManager(); tell("Starter project restored."); reload(false);
  }

  /* ---------- events ---------- */
  $("kgCreateFolder").addEventListener("click", createFolder); $("kgCreateFile").addEventListener("click", createFile);
  ui.folderName.addEventListener("keydown", e => { if (e.key === "Enter") createFolder(); }); ui.fileName.addEventListener("keydown", e => { if (e.key === "Enter") createFile(); });
  $("kgDownload").addEventListener("click", () => { const f = sel(); if (!f) return tell("Select a file to download.", true); download(base(f.path), ui.code.value); });
  $("kgExport").addEventListener("click", exportProject); $("kgDeleteFile").addEventListener("click", deleteFile); $("kgDeleteFolder").addEventListener("click", deleteFolder); $("kgReset").addEventListener("click", resetProject);
  $("kgRerun").addEventListener("click", () => { flush(); reload(false); tell("AI reloaded with the current scripts."); });
  $("kgClearLog").addEventListener("click", () => { logs = []; renderLogs(); });
  ui.code.addEventListener("input", () => {
    lines(); ui.save.textContent = "Saving…"; clearTimeout(saveTimer);
    saveTimer = setTimeout(() => { const f = sel(); if (!f) return; f.content = ui.code.value; f.updatedAt = new Date().toISOString(); persist(); ui.mSize.textContent = new Blob([f.content]).size.toLocaleString() + " bytes"; }, 250);
    scheduleReload();
  });
  ui.code.addEventListener("click", lines); ui.code.addEventListener("keyup", lines); ui.code.addEventListener("scroll", () => { ui.lines.scrollTop = ui.code.scrollTop; });
  ui.code.addEventListener("keydown", e => {
    if (e.key === "Tab") { e.preventDefault(); ui.code.setRangeText("    ", ui.code.selectionStart, ui.code.selectionEnd, "end"); ui.code.dispatchEvent(new Event("input", { bubbles: true })); }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") { e.preventDefault(); flush(); tell("Saved in this browser."); }
  });
  window.addEventListener("rp-tools-changed", () => { if (runtime) scheduleReload(); });

  window.rpKignityStudio = {
    getProject() { flush(); return { folders: data.folders.slice(), files: data.files.map(f => ({ path: f.path, type: f.type || typeOf(f.path), content: f.content })) }; },
    getStatus() { return { errors: logs.filter(l => l.level === "error").length, skills: runtimeInfo ? runtimeInfo.skills.length : 0 }; },
    reload
  };

  renderTree(); renderManager(); renderLogs(); persist();
  if (!byPath(data.selectedPath)) { data.selectedPath = data.files[0] ? data.files[0].path : ""; renderTree(); renderManager(); }
  reload(false);
})();
