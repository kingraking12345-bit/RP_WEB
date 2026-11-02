(() => {
  const KEY = "rpGamesScriptStudio.v1";
  const TYPES = {
    html: { label: "HTML", extension: ".html", starter: "<section>\n  <h2>Welcome</h2>\n  <p>Page content goes here.</p>\n</section>" },
    js: { label: "JavaScript", extension: ".js", starter: "// Start writing JavaScript here.\n" },
    ts: { label: "TypeScript", extension: ".ts", starter: "// Start writing TypeScript here.\n" },
    py: { label: "Python", extension: ".py", starter: "# Start writing Python here.\n" },
    css: { label: "CSS", extension: ".css", starter: "/* Add styles here */\n" },
    json: { label: "JSON", extension: ".json", starter: "{\n  \n}\n" },
    lua: { label: "Lua", extension: ".lua", starter: "-- Start writing Lua here.\n" },
    sql: { label: "SQL", extension: ".sql", starter: "-- Start writing SQL here.\n" },
    md: { label: "Markdown", extension: ".md", starter: "# New document\n" },
    xml: { label: "XML", extension: ".xml", starter: "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n" },
    yaml: { label: "YAML", extension: ".yaml", starter: "# Start writing YAML here.\n" },
    txt: { label: "Text", extension: ".txt", starter: "" }
  };
  const STANDARD = [
    ["index.html", "html", TYPES.html.starter],
    ["styles.css", "css", "/* Add styles here */\n"],
    ["script.js", "js", "// Optional page behavior\n"]
  ];
  const $ = id => document.getElementById(id);
  const editor = $("ssCode");
  let data = load();
  let saveTimer;

  function initialData() {
    const now = new Date().toISOString();
    return { folders: [], selectedFolder: "", selectedPath: "index.html", files: STANDARD.map(([path, type, content]) => ({ path, type, content, updatedAt: now })) };
  }
  function load() {
    try {
      const stored = JSON.parse(localStorage.getItem(KEY) || "null");
      if (stored && Array.isArray(stored.folders) && Array.isArray(stored.files)) {
        // Older workspaces only had index.html: add the other standard files so every tab has all three.
        STANDARD.forEach(([path, type, content]) => { if (!stored.files.some(file => file.path === path)) stored.files.push({ path, type, content, updatedAt: new Date().toISOString() }); });
        return stored;
      }
    } catch { /* Use a fresh workspace if stored data is unavailable. */ }
    return initialData();
  }
  function persist() {
    try { localStorage.setItem(KEY, JSON.stringify(data)); $("ssSaveState").textContent = "Saved"; return true; }
    catch { $("ssSaveState").textContent = "Storage full"; return false; }
  }
  function tell(message, error = false) {
    const node = $("ssMessage"); node.textContent = message; node.style.color = error ? "var(--ee-red)" : "var(--ee-green)";
  }
  function byPath(path) { return data.files.find(file => file.path === path); }
  function fileName(path) { return path.split("/").pop(); }
  function parentPath(path) { const parts = path.split("/"); parts.pop(); return parts.join("/"); }
  function validName(value) { return value.trim().replace(/[\\/:*?"<>|]/g, "-").replace(/^\.+|\.+$/g, "").trim(); }
  function makePath(parent, name) { return parent ? `${parent}/${name}` : name; }
  function uniqueFolderPath(parent, name) { return makePath(parent, name); }
  function selectedFile() { return byPath(data.selectedPath); }
  function setProjectFile(path, type, content) {
    let file = byPath(path);
    if (!file) { file = { path, type, content: "", updatedAt: new Date().toISOString() }; data.files.push(file); }
    file.type = type; file.content = content || ""; file.updatedAt = new Date().toISOString();
  }
  function loadTabFields(detail = {}) {
    setProjectFile("index.html", "html", detail.html || "");
    setProjectFile("styles.css", "css", detail.css || "");
    setProjectFile("script.js", "js", detail.js || "");
    data.selectedPath = "index.html"; data.selectedFolder = ""; persist(); renderTree(); renderManager();
    tell("Tab fields loaded into index.html, styles.css, and script.js.");
  }
  // Copies the workspace code into the tab. Returns true when there is HTML content.
  function applyProjectToTab(silent = false) {
    flushEditor();
    const html = byPath("index.html") || data.files.find(file => file.type === "html");
    const css = byPath("styles.css") || data.files.find(file => file.type === "css");
    const js = byPath("script.js") || data.files.find(file => file.type === "js");
    $("tabHtml").value = html?.content || ""; $("tabCss").value = css?.content || ""; $("tabJs").value = js?.content || "";
    const hasHtml = Boolean(html && html.content.trim());
    if (!silent) tell(hasHtml ? "HTML, CSS, and JavaScript applied to the tab. Save the tab above to keep the changes." : "Add HTML content to an HTML file before applying it.", !hasHtml);
    return hasHtml;
  }
  // After a tab is saved or cleared, start the next one from fresh index.html / styles.css / script.js (other files are kept).
  function resetStandardFiles() {
    STANDARD.forEach(([path, type, content]) => setProjectFile(path, type, content));
    data.selectedPath = "index.html"; data.selectedFolder = ""; persist(); renderTree(); renderManager();
  }
  window.rpGamesStudio = { applyToFields: applyProjectToTab, resetStandardFiles };

  function renderTree() {
    const tree = $("ssTree"); tree.replaceChildren();
    const root = document.createElement("button"); root.type = "button"; root.className = `ss-tree-item${data.selectedFolder === "" ? " active" : ""}`; root.setAttribute("role", "treeitem"); root.innerHTML = '<span class="ss-tree-icon" aria-hidden="true">▣</span><span class="ss-tree-name">NEW SCRIPT</span>';
    root.addEventListener("click", () => { flushEditor(); data.selectedFolder = ""; renderTree(); renderManager(); }); tree.append(root);
    const folders = [...data.folders].sort((a, b) => a.localeCompare(b));
    folders.forEach(path => {
      const depth = path.split("/").length; const button = document.createElement("button"); button.type = "button";
      button.className = `ss-tree-item${data.selectedFolder === path ? " active" : ""}`; button.setAttribute("role", "treeitem"); button.style.paddingLeft = `${7 + depth * 12}px`;
      const icon = document.createElement("span"); icon.className = "ss-tree-icon"; icon.setAttribute("aria-hidden", "true"); icon.textContent = "▰";
      const label = document.createElement("span"); label.className = "ss-tree-name"; label.textContent = path.split("/").pop(); button.append(icon, label);
      button.addEventListener("click", () => { flushEditor(); data.selectedFolder = path; renderTree(); renderManager(); }); tree.append(button);
    });
    const files = [...data.files].sort((a, b) => a.path.localeCompare(b.path));
    files.forEach(file => {
      const depth = file.path.split("/").length - 1; const button = document.createElement("button"); button.type = "button";
      button.className = `ss-tree-item file${data.selectedPath === file.path ? " active" : ""}`; button.setAttribute("role", "treeitem"); button.style.paddingLeft = `${7 + (depth + 1) * 12}px`;
      const icon = document.createElement("span"); icon.className = "ss-tree-icon"; icon.setAttribute("aria-hidden", "true"); icon.textContent = "⌘";
      const label = document.createElement("span"); label.className = "ss-tree-name"; label.textContent = fileName(file.path); button.append(icon, label);
      button.addEventListener("click", () => openFile(file.path)); tree.append(button);
    });
    if (!data.files.length && !data.folders.length) { const empty = document.createElement("div"); empty.className = "ss-tree-empty"; empty.textContent = "This project is empty."; tree.append(empty); }
  }
  function updateLines() {
    const count = Math.max(1, editor.value.split("\n").length);
    $("ssLineNumbers").textContent = Array.from({ length: count }, (_, index) => index + 1).join("\n");
    $("ssLineNumbers").scrollTop = editor.scrollTop;
    const before = editor.value.slice(0, editor.selectionStart); const lines = before.split("\n");
    $("ssCursor").textContent = `Line ${lines.length}, column ${lines[lines.length - 1].length + 1}`;
  }
  function renderManager() {
    const file = selectedFile();
    if (!file) {
      $("ssCurrentFile").textContent = "No file selected"; $("ssBreadcrumb").textContent = data.selectedFolder ? `NEW SCRIPT / ${data.selectedFolder}` : "NEW SCRIPT";
      $("ssManagerName").textContent = "—"; $("ssManagerLanguage").textContent = "—"; $("ssManagerSize").textContent = "—";
      $("ssManagerLocation").textContent = data.selectedFolder || "NEW SCRIPT"; $("ssLanguage").textContent = "NO FILE";
      editor.value = ""; editor.disabled = true; updateLines(); return;
    }
    editor.disabled = false; editor.value = file.content;
    const type = TYPES[file.type] || TYPES.txt; const location = parentPath(file.path) || "NEW SCRIPT";
    $("ssCurrentFile").textContent = fileName(file.path); $("ssBreadcrumb").textContent = `NEW SCRIPT / ${file.path}`;
    $("ssManagerName").textContent = fileName(file.path); $("ssManagerLanguage").textContent = type.label;
    $("ssManagerSize").textContent = `${new Blob([file.content]).size.toLocaleString()} bytes`; $("ssManagerLocation").textContent = location;
    $("ssLanguage").textContent = type.label.toUpperCase(); $("ssSaveState").textContent = "Saved"; updateLines();
  }
  function openFile(path) {
    flushEditor();
    data.selectedPath = path; data.selectedFolder = parentPath(path); renderTree(); renderManager();
  }
  function flushEditor() {
    clearTimeout(saveTimer);
    const file = selectedFile(); if (!file) return;
    file.content = editor.value; file.updatedAt = new Date().toISOString(); persist();
  }
  function scheduleSave() {
    $("ssSaveState").textContent = "Saving…";
    clearTimeout(saveTimer); saveTimer = setTimeout(() => {
      const file = selectedFile(); if (!file) return;
      const start = editor.selectionStart, end = editor.selectionEnd, scroll = editor.scrollTop;
      file.content = editor.value; file.updatedAt = new Date().toISOString(); persist(); renderManager();
      editor.setSelectionRange(start, end); editor.scrollTop = scroll; updateLines();
    }, 250);
  }
  function createFolder() {
    const name = validName($("ssFolderName").value); if (!name) { tell("Enter a folder name first.", true); return; }
    const path = uniqueFolderPath(data.selectedFolder, name);
    if (data.folders.includes(path) || data.files.some(file => file.path === path)) { tell("A folder or file with that name already exists here.", true); return; }
    data.folders.push(path); data.selectedFolder = path; $("ssFolderName").value = "";
    if (!persist()) { data.folders.pop(); tell("Browser storage is full; folder was not saved.", true); return; }
    renderTree(); renderManager(); tell(`Created NEW SCRIPT / ${path}`);
  }
  function createFile() {
    const typeKey = $("ssFileType").value; const type = TYPES[typeKey]; let name = validName($("ssFileName").value);
    if (!name) { tell("Enter a file name first.", true); return; }
    if (!name.toLowerCase().endsWith(type.extension)) name += type.extension;
    const path = makePath(data.selectedFolder, name);
    if (data.files.some(file => file.path === path) || data.folders.includes(path)) { tell("A folder or file with that name already exists here.", true); return; }
    const file = { path, type: typeKey, content: type.starter, updatedAt: new Date().toISOString() };
    data.files.push(file); data.selectedPath = path; $("ssFileName").value = "";
    if (!persist()) { data.files = data.files.filter(item => item !== file); tell("Browser storage is full; file was not saved.", true); return; }
    renderTree(); renderManager(); editor.focus(); tell(`Created ${path}`);
  }
  function download(name, content) {
    const url = URL.createObjectURL(new Blob([content], { type: "text/plain;charset=utf-8" })); const anchor = document.createElement("a");
    anchor.href = url; anchor.download = name; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function directoryFor(root, path) {
    return path.split("/").filter(Boolean).reduce((promise, segment) => promise.then(handle => handle.getDirectoryHandle(segment, { create: true })), Promise.resolve(root));
  }
  async function exportProject() {
    if (!window.showDirectoryPicker) { tell("Folder export is unavailable in this browser. Download the selected file instead.", true); return; }
    try {
      const parent = await window.showDirectoryPicker({ mode: "readwrite" }); const root = await parent.getDirectoryHandle("NEW SCRIPT", { create: true });
      for (const folder of data.folders) await directoryFor(root, folder);
      for (const file of data.files) {
        const path = file.path.split("/"); const name = path.pop(); const folder = await directoryFor(root, path.join("/"));
        const handle = await folder.getFileHandle(name, { create: true }); const writer = await handle.createWritable(); await writer.write(file.content); await writer.close();
      }
      tell("Project exported to the folder you selected.");
    } catch (error) { if (error.name !== "AbortError") tell(`Export failed: ${error.message}`, true); }
  }

  $("ssCreateFolder").addEventListener("click", createFolder);
  $("ssCreateFile").addEventListener("click", createFile);
  $("ssLoadFromTab").addEventListener("click", () => loadTabFields({ html: $("tabHtml").value, css: $("tabCss").value, js: $("tabJs").value }));
  $("ssApplyToTab").addEventListener("click", () => applyProjectToTab(false));
  window.addEventListener("rp-games-tab-cleared", resetStandardFiles);
  window.addEventListener("rp-games-tab-loaded", event => loadTabFields(event.detail));
  $("ssFolderName").addEventListener("keydown", event => { if (event.key === "Enter") createFolder(); });
  $("ssFileName").addEventListener("keydown", event => { if (event.key === "Enter") createFile(); });
  editor.addEventListener("input", () => { updateLines(); scheduleSave(); });
  editor.addEventListener("click", updateLines); editor.addEventListener("keyup", updateLines);
  editor.addEventListener("scroll", () => { $("ssLineNumbers").scrollTop = editor.scrollTop; });
  editor.addEventListener("keydown", event => {
    if (event.key === "Tab") { event.preventDefault(); const start = editor.selectionStart, end = editor.selectionEnd; editor.setRangeText("    ", start, end, "end"); editor.dispatchEvent(new Event("input", { bubbles: true })); }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") { event.preventDefault(); clearTimeout(saveTimer); const file = selectedFile(); if (file) { file.content = editor.value; file.updatedAt = new Date().toISOString(); persist(); renderManager(); tell("File saved in this browser."); } }
  });
  $("ssDownload").addEventListener("click", () => { const file = selectedFile(); if (!file) { tell("Select a file to download.", true); return; } download(fileName(file.path), editor.value); tell("File download started."); });
  $("ssExport").addEventListener("click", exportProject);
  $("ssDeleteFile").addEventListener("click", () => {
    const file = selectedFile(); if (!file) { tell("Select a file first.", true); return; }
    if (!confirm(`Delete ${file.path} from this browser workspace?`)) return;
    data.files = data.files.filter(item => item.path !== file.path); data.selectedPath = data.files[0]?.path || ""; persist(); renderTree(); renderManager(); tell("File deleted from this browser workspace.");
  });
  $("ssDeleteFolder").addEventListener("click", () => {
    const folder = data.selectedFolder; if (!folder) { tell("Select a folder first. The NEW SCRIPT project root cannot be deleted.", true); return; }
    const hasItems = data.folders.some(path => path === folder || path.startsWith(`${folder}/`)) || data.files.some(file => file.path.startsWith(`${folder}/`));
    if (!confirm(`Delete folder “${folder}”${hasItems ? " and everything inside it" : ""} from this browser workspace?`)) return;
    data.folders = data.folders.filter(path => path !== folder && !path.startsWith(`${folder}/`));
    data.files = data.files.filter(file => !file.path.startsWith(`${folder}/`));
    if (!data.files.some(file => file.path === data.selectedPath)) data.selectedPath = data.files[0]?.path || "";
    data.selectedFolder = parentPath(folder); persist(); renderTree(); renderManager(); tell("Folder removed from this browser workspace.");
  });
  renderTree(); renderManager(); persist();
})();
