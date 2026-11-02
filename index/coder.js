/* RP Coder: per-branch code workspace (Explorer, editor, Script manager). Files are saved on the server; developers only. */
(async () => {
  "use strict";
  const { rpc, user, esc, $, params, BRANCHES } = RPK, app = $("#app"), br = params().branch;
  const TYPES = { html: "HTML page", css: "Stylesheet", js: "JavaScript", ts: "TypeScript", json: "JSON data", md: "Markdown", txt: "Text", xml: "XML", svg: "SVG image", csv: "CSV table", yml: "YAML", py: "Python", lua: "Lua", cs: "C#", java: "Java", cpp: "C++", c: "C", php: "PHP", sql: "SQL", sh: "Shell", go: "Go", rs: "Rust", rb: "Ruby", kt: "Kotlin", bat: "Batch" };
  const FOLDER = { games: "Games", tools: "Tools", music: "Music", education: "Education", skills: "Skills", community: "Community", labs: "Labs" }[br];
  $("#back").href = FOLDER ? "../" + FOLDER + "/" + FOLDER.toLowerCase() + ".html" : "index.html";
  if (!FOLDER) { app.innerHTML = '<div class="k-card">Open the Coder from a branch menu (☰ RP → Coder). Missing ?branch=.</div>'; return; }
  $("#ttl").textContent = BRANCHES[br] + " Coder"; document.title = BRANCHES[br] + " Coder";
  if (!(await user())) { app.innerHTML = '<div class="k-card">Sign in on the <a href="index.html">main page</a> first.</div>'; return; }
  let files = new Map(), live = new Map(), cur = null, open = [], dirty = new Set(), buf = new Map();
  try { const ok = await rpc("rp_is_branch_dev", { p_branch: br }); if (!ok) throw new Error("You need the " + BRANCHES[br] + " Developer role for the Coder. Apply on the I want to apply page."); } catch (e) { app.innerHTML = '<div class="k-card">' + esc(e.message) + '</div>'; return; }
  app.innerHTML = '<section class="c-pane"><div class="c-head">Explorer<span style="flex:1"></span><button class="k-btn ghost c-sm" id="nf">+ File</button><button class="k-btn ghost c-sm" id="nd">+ Folder</button></div><div class="c-tree" id="tree"></div></section>' +
    '<section class="c-pane"><div class="c-tabs" id="tabs"></div><textarea class="c-ed" id="ed" spellcheck="false" wrap="off" disabled aria-label="Code editor"></textarea><div class="c-foot"><span id="pos">Ln 1, Col 1</span><span id="kind"></span><span id="sv" class="sv">Saved</span><span style="flex:1"></span><span id="msg" role="status"></span></div></section>' +
    '<section class="c-pane"><div class="c-head">Script manager</div><div class="c-list" id="mgr"></div><div class="c-head"><button class="k-btn c-sm" id="exp">⬇ Export project folder</button></div></section>';
  const msg = (t, bad) => { const m = $("#msg"); m.textContent = t; m.style.color = bad ? "var(--red)" : "var(--green)"; };
  const extOf = p => (p.split(".").pop() || "").toLowerCase(), nameOf = p => p.split("/").pop();
  async function refresh() {
    const rows = await rpc("rp_coder_list", { p_branch: br }); files = new Map(rows.map(r => [r.path, r]));
    try { live = new Map((await rpc("rp_coder_live", { p_branch: br })).map(r => [r.path, r])); } catch { live = new Map(); }
    tree(); mgr();
  }
  function tree() {
    const dirs = new Set(); [...files.keys()].forEach(p => { const parts = p.split("/"); for (let i = 1; i < parts.length; i++) dirs.add(parts.slice(0, i).join("/")); });
    const all = [...[...dirs].map(d => ({ p: d, dir: 1 })), ...[...files.keys()].filter(p => nameOf(p) !== ".folder").map(p => ({ p }))].sort((a, b) => a.p.localeCompare(b.p));
    $("#tree").innerHTML = all.length ? all.map(n => '<div class="c-node' + (n.p === cur ? " on" : "") + '" data-p="' + esc(n.p) + '" data-d="' + (n.dir ? 1 : 0) + '" style="padding-left:' + (8 + 14 * (n.p.split("/").length - 1)) + 'px">' + (n.dir ? "📁" : "📄") + " " + esc(nameOf(n.p)) + (dirty.has(n.p) ? " ●" : "") + '<button class="x" title="Delete" aria-label="Delete ' + esc(n.p) + '">✕</button></div>').join("") : '<p class="k-muted" style="padding:10px">Empty workspace. Create a file or folder.</p>';
    $("#tree").querySelectorAll(".c-node").forEach(d => { d.onclick = e => { if (e.target.closest(".x")) return del(d.dataset.p, d.dataset.d === "1"); if (d.dataset.d !== "1") openFile(d.dataset.p); }; });
  }
  function mgr() {
    const list = [...files.keys()].filter(p => nameOf(p) !== ".folder");
    $("#mgr").innerHTML = list.length ? list.map(p => { const top = !p.includes("/") && /\.(html|js|css)$/.test(p), l = live.get(p); return '<div class="c-it"><strong>' + esc(p) + '</strong> <span class="k-badge">' + esc(TYPES[extOf(p)] || extOf(p)) + "</span>" + (l ? '<span class="k-badge accepted">live v' + l.version + "</span>" : "") + '<div class="k-row">' + (top ? '<button class="k-btn" data-a="apply" data-p="' + esc(p) + '">Apply</button>' : "") + (l ? '<button class="k-btn ghost" data-a="un" data-p="' + esc(p) + '">Unapply</button>' : "") + '<button class="k-btn ghost" data-a="dl" data-p="' + esc(p) + '">Download</button><button class="k-btn danger" data-a="rm" data-p="' + esc(p) + '">Delete</button></div></div>'; }).join("") : '<p class="k-muted">No scripts yet. Top-level .html, .js and .css files can be applied to the live ' + esc(BRANCHES[br]) + ' pages.</p>';
    $("#mgr").querySelectorAll("button").forEach(b => b.onclick = () => act(b.dataset.a, b.dataset.p));
  }
  async function get(p) { if (buf.has(p)) return buf.get(p); const t = await rpc("rp_coder_get", { p_branch: br, p_path: p }); buf.set(p, t || ""); return t || ""; }
  async function openFile(p) { try { await get(p); } catch (e) { return msg(e.message, true); } if (!open.includes(p)) open.push(p); cur = p; show(); }
  function show() {
    $("#tabs").innerHTML = open.map(p => '<div class="c-tab' + (p === cur ? " on" : "") + '" data-p="' + esc(p) + '">' + esc(nameOf(p)) + (dirty.has(p) ? " ●" : "") + ' <span data-c="1" aria-label="Close">×</span></div>').join("");
    $("#tabs").querySelectorAll(".c-tab").forEach(t => t.onclick = e => { if (e.target.dataset.c) { open = open.filter(x => x !== t.dataset.p); if (cur === t.dataset.p) cur = open[open.length - 1] || null; } else cur = t.dataset.p; show(); });
    const ed = $("#ed"); ed.disabled = !cur; ed.value = cur ? buf.get(cur) : ""; $("#kind").textContent = cur ? TYPES[extOf(cur)] || extOf(cur) : ""; pos(); mark(); tree();
  }
  const pos = () => { const ed = $("#ed"), t = ed.value.slice(0, ed.selectionStart).split("\n"); $("#pos").textContent = "Ln " + t.length + ", Col " + (t[t.length - 1].length + 1); };
  const mark = () => { const s = $("#sv"); const d = cur && dirty.has(cur); s.textContent = d ? "Unsaved" : "Saved"; s.className = d ? "un" : "sv"; };
  let timer = 0;
  async function save(p) { try { await rpc("rp_coder_save", { p_branch: br, p_path: p, p_content: buf.get(p) }); dirty.delete(p); files.set(p, files.get(p) || { path: p }); msg("Saved " + p); mark(); show(); mgr(); } catch (e) { msg(e.message, true); } }
  $("#ed").addEventListener("input", () => { if (!cur) return; buf.set(cur, $("#ed").value); dirty.add(cur); mark(); clearTimeout(timer); const p = cur; timer = setTimeout(() => save(p), 1200); pos(); });
  $("#ed").addEventListener("keyup", pos); $("#ed").addEventListener("click", pos);
  $("#ed").addEventListener("keydown", e => { if (e.key === "Tab") { e.preventDefault(); const t = e.target; t.setRangeText("  ", t.selectionStart, t.selectionEnd, "end"); t.dispatchEvent(new Event("input")); } if ((e.ctrlKey || e.metaKey) && e.key === "s") { e.preventDefault(); if (cur) save(cur); } });
  const valid = p => /^[A-Za-z0-9_-]+(\/[A-Za-z0-9_-]+)*(\/[A-Za-z0-9_.-]+\.[A-Za-z0-9]{1,8})?$|^[A-Za-z0-9_.-]+\.[A-Za-z0-9]{1,8}$/.test(p) && !p.includes("..");
  $("#nf").onclick = async () => { const ex = Object.keys(TYPES).join(", "); let p = prompt("New file path, for example app.js or scripts/main.lua\nScript types: " + ex); if (!p) return; p = p.trim().replace(/^\/+/, ""); if (!valid(p) || !p.includes(".")) return msg("Use letters, numbers, - _ . and a file type such as .js", true); if (!TYPES[extOf(p)]) return msg("Unknown script type ." + extOf(p), true); buf.set(p, ""); try { await rpc("rp_coder_save", { p_branch: br, p_path: p, p_content: "" }); files.set(p, { path: p }); await openFile(p); mgr(); } catch (e) { msg(e.message, true); } };
  $("#nd").onclick = async () => { let p = prompt("New folder path, for example scripts or scripts/ui"); if (!p) return; p = p.trim().replace(/^\/+|\/+$/g, ""); if (!/^[A-Za-z0-9_-]+(\/[A-Za-z0-9_-]+)*$/.test(p)) return msg("Folder names: letters, numbers, - and _", true); try { await rpc("rp_coder_save", { p_branch: br, p_path: p + "/.folder", p_content: "" }); await refresh(); } catch (e) { msg(e.message, true); } };
  async function del(p, dir) { if (!confirm("Delete " + (dir ? "folder " : "") + p + (dir ? " and everything inside" : "") + "? This cannot be undone.")) return; try { await rpc("rp_coder_delete", { p_branch: br, p_path: p, p_folder: dir }); [...buf.keys()].filter(k => k === p || (dir && k.startsWith(p + "/"))).forEach(k => { buf.delete(k); dirty.delete(k); open = open.filter(o => o !== k); }); if (cur && !open.includes(cur)) cur = open[0] || null; await refresh(); show(); msg("Deleted " + p); } catch (e) { msg(e.message, true); } }
  async function act(a, p) {
    try {
      if (a === "rm") return del(p, false);
      if (a === "dl") { const t = await get(p), u = URL.createObjectURL(new Blob([t], { type: "text/plain" })), l = document.createElement("a"); l.href = u; l.download = nameOf(p); l.click(); setTimeout(() => URL.revokeObjectURL(u), 1500); return; }
      if (a === "apply") { if (dirty.has(p)) await save(p); if (!confirm("Apply " + p + " to the live " + BRANCHES[br] + " site? Every visitor gets this version on their next page load. (Emergency exit: add ?rpsafe=1 to the page address.)")) return; const v = await rpc("rp_coder_apply", { p_branch: br, p_path: p, p_note: "Applied from the " + BRANCHES[br] + " Coder" }); msg(p + " is live (v" + v + ")."); await refresh(); }
      if (a === "un") { if (!confirm("Remove the live version of " + p + " and go back to the original file?")) return; await rpc("rp_coder_unapply", { p_branch: br, p_path: p }); msg("Back to the original."); await refresh(); }
    } catch (e) { msg(e.message, true); }
  }
  $("#exp").onclick = async () => { if (!window.JSZip) return msg("The zip library did not load. Check your connection.", true); const z = new JSZip(); try { for (const p of files.keys()) if (nameOf(p) !== ".folder") z.file(p, await get(p)); else z.folder(p.replace(/\/\.folder$/, "")); const b = await z.generateAsync({ type: "blob" }), u = URL.createObjectURL(b), l = document.createElement("a"); l.href = u; l.download = br + "-project.zip"; l.click(); setTimeout(() => URL.revokeObjectURL(u), 3000); msg("Project exported."); } catch (e) { msg(e.message, true); } };
  window.addEventListener("beforeunload", e => { if (dirty.size) { e.preventDefault(); e.returnValue = ""; } });
  await refresh(); show();
})();
