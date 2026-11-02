(() => {
  "use strict";
  const K = { courses: "rpSkillCourses.v1", skills: "rpSkillSkills.v1", degrees: "rpSkillDegreeCache.v1" };
  const SB_URL = "https://nesxcgymsgegkqjhfydx.supabase.co", SB_KEY = "sb_publishable_Tj4frYyU-iAylsH_--y3Qg_esNYqce-";
  const EDITOR_ROLES = ["Creator", "Skills Studio Director", "Skills Employee"];
  const $ = id => document.getElementById(id);
  const read = (k, f) => { try { const v = JSON.parse(localStorage.getItem(k) || "null"); return v == null ? f : v; } catch { return f; } };
  const list = k => { const v = read(K[k], []); return Array.isArray(v) ? v.filter(x => x && x.id) : []; };
  function save(key, value) { try { localStorage.setItem(K[key], JSON.stringify(value)); $("edStatus").textContent = "Saved in this browser"; refreshAll(); return true; } catch { $("edStatus").textContent = "Browser storage full"; return false; } }
  const newId = p => p + "-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 6);
  const str = (v, n) => typeof v === "string" ? v.slice(0, n) : "";
  const price = v => { const n = Number(v); return Number.isSafeInteger(n) && n >= 0 && n <= 1000000 ? n : 0; };
  const priceText = n => n > 0 ? n + " Refane" : "Free";
  const say = (id, t, bad) => { const n = $(id); n.textContent = t; n.style.color = bad ? "var(--red)" : "var(--green)"; };
  const when = iso => { try { return new Date(iso).toLocaleString(); } catch { return ""; } };
  function make(tag, attrs = {}, ...kids) { const n = document.createElement(tag); Object.entries(attrs).forEach(([k, v]) => { if (k === "text") n.textContent = v; else if (k === "class") n.className = v; else n.setAttribute(k, v); }); kids.forEach(c => n.append(c)); return n; }
  const btn = (label, fn, cls) => { const b = make("button", { type: "button", text: label }); if (cls) b.className = cls; b.addEventListener("click", fn); return b; };
  const stable = v => Array.isArray(v) ? "[" + v.map(stable).join(",") + "]" : v && typeof v === "object" ? "{" + Object.keys(v).sort().map(k => JSON.stringify(k) + ":" + stable(v[k])).join(",") + "}" : JSON.stringify(v === undefined ? null : v);
  const httpsUrl = v => { try { const u = new URL(String(v).trim()); return u.protocol === "https:" ? u.href : ""; } catch { return ""; } };
  function youtubeId(v) {
    const s = String(v || "").trim(); if (!s) return ""; if (/^[\w-]{11}$/.test(s)) return s;
    try { const u = new URL(s), h = u.hostname.replace(/^www\.|^m\./, "");
      if (h === "youtu.be") { const id = u.pathname.slice(1).split("/")[0]; return /^[\w-]{11}$/.test(id) ? id : ""; }
      if (h === "youtube.com" || h === "youtube-nocookie.com") { const v2 = u.searchParams.get("v"); if (v2 && /^[\w-]{11}$/.test(v2)) return v2; const m = u.pathname.match(/^\/(?:embed|shorts|live|v)\/([\w-]{11})/); if (m) return m[1]; }
    } catch { /* not a URL */ }
    return "";
  }

  /* ---------- degrees (published by Education) ---------- */
  let degrees = read(K.degrees, []); if (!Array.isArray(degrees)) degrees = [];
  async function loadDegrees() {
    try { const r = await fetch(SB_URL + "/rest/v1/rp_education_publications?select=snapshot&order=version.desc&limit=1", { headers: { apikey: SB_KEY, Accept: "application/json" }, cache: "no-store" }); if (!r.ok) throw new Error("HTTP " + r.status);
      const rows = await r.json(); degrees = rows.length && rows[0].snapshot && Array.isArray(rows[0].snapshot.degrees) ? rows[0].snapshot.degrees.map(d => ({ id: String(d.id), name: String(d.name), emoji: String(d.emoji || "📜") })) : []; try { localStorage.setItem(K.degrees, JSON.stringify(degrees)); } catch { /* full */ }
      $("edDegreeNote").textContent = degrees.length ? "" : "No degrees are published in Education yet.";
    } catch { $("edDegreeNote").textContent = degrees.length ? "Could not reach Education; showing the last degrees seen on this device." : "Could not load degrees from Education."; }
    fillDegreeControls(); renderSkillList(); renderCourseList();
  }
  const degName = id => (degrees.find(d => d.id === id) || {}).name || "(unknown degree)";
  function checksInto(root, selected, emptyText) {
    const keep = selected !== undefined ? new Set(selected) : new Set([...root.querySelectorAll("input:checked")].map(i => i.value)); root.replaceChildren();
    if (!degrees.length) root.append(make("span", { class: "ed-muted", text: emptyText }));
    degrees.forEach(d => { const i = make("input", { type: "checkbox", value: d.id }); i.checked = keep.has(d.id); root.append(make("label", {}, i, document.createTextNode(" " + d.emoji + " " + d.name))); });
  }
  function fillDegreeControls(skillSel, courseSel) { checksInto($("edSkillRequires"), skillSel, "No degrees available yet."); checksInto($("edRequires"), courseSel, "No degrees available yet."); fillSkillSelects(); }
  function fillSkillSelects() {
    const s = $("edSkill"), cur = s.value; s.replaceChildren(); const skills = list("skills"); if (!skills.length) s.append(make("option", { value: "", text: "Create a skill first" }));
    skills.forEach(k => s.append(make("option", { value: k.id, text: (k.emoji || "🛠️") + " " + k.name }))); if (skills.some(k => k.id === cur)) s.value = cur;
    const f = $("edFilterSkill"), fc = f.value; f.replaceChildren(make("option", { value: "all", text: "all skills" })); skills.forEach(k => f.append(make("option", { value: k.id, text: k.name }))); f.value = skills.some(k => k.id === fc) ? fc : "all";
  }

  /* ---------- navigation ---------- */
  const VIEWS = { dashboard: "edDashboard", skills: "edSkills", courses: "edCourses", publish: "edPublish", tutorial: "edTutorial" };
  function showView(name) {
    document.querySelectorAll("[data-view]").forEach(b => { const on = b.dataset.view === name; b.classList.toggle("active", on); b.setAttribute("aria-selected", String(on)); });
    Object.entries(VIEWS).forEach(([v, id]) => { const s = $(id), on = v === name; s.hidden = !on; s.classList.toggle("active", on); });
    if (name === "publish") renderPublish();
  }
  document.querySelectorAll("[data-view]").forEach(b => b.addEventListener("click", () => showView(b.dataset.view)));

  /* ---------- skills ---------- */
  function resetSkill() { $("edSkillForm").reset(); $("edSkillId").value = ""; checksInto($("edSkillRequires"), [], "No degrees available yet."); $("edSkillSave").textContent = "Add skill"; say("edSkillMsg", ""); }
  $("edSkillForm").addEventListener("submit", e => {
    e.preventDefault(); const name = $("edSkillName").value.trim(); if (!name) return say("edSkillMsg", "Enter a skill name.", true);
    const id = $("edSkillId").value || newId("skill"), item = { id, name, emoji: $("edSkillEmoji").value.trim() || "🛠️", description: $("edSkillDesc").value.trim(), requires: [...document.querySelectorAll("#edSkillRequires input:checked")].map(i => i.value) };
    const all = list("skills"), i = all.findIndex(x => x.id === id); if (i >= 0) all[i] = item; else all.push(item);
    if (save("skills", all)) { resetSkill(); say("edSkillMsg", "Skill saved."); }
  });
  $("edSkillReset").addEventListener("click", resetSkill);
  function renderSkillList() {
    const root = $("edSkillList"), courses = list("courses"); root.replaceChildren();
    if (!list("skills").length) { root.append(make("p", { class: "ed-empty", text: "No skills yet." })); return; }
    list("skills").forEach(k => {
      const n = courses.filter(c => c.skill === k.id).length;
      root.append(make("article", { class: "ed-row" }, make("div", {}, make("strong", { text: (k.emoji || "🛠️") + " " + k.name }), make("span", { class: "meta", text: [n + " course(s)", (k.requires || []).length ? "Requires: " + k.requires.map(degName).join(", ") : "No degree required", k.description].filter(Boolean).join(" · ") })),
        make("div", { class: "acts" }, btn("Edit", () => { $("edSkillId").value = k.id; $("edSkillName").value = k.name; $("edSkillEmoji").value = k.emoji || ""; $("edSkillDesc").value = k.description || ""; checksInto($("edSkillRequires"), k.requires || [], "No degrees available yet."); $("edSkillSave").textContent = "Save changes"; $("edSkillName").focus(); }),
          btn("Delete", () => { if (n) return alert("Delete or move this skill's " + n + " course(s) first."); if (confirm("Delete this skill?")) save("skills", list("skills").filter(x => x.id !== k.id)); }, "danger"))));
    });
  }

  /* ---------- course editor ---------- */
  let draft = { lessons: [], resources: [] };
  function resEditor(arr, root, onChange) {
    root.replaceChildren();
    arr.forEach((r, i) => {
      const type = make("select", { "aria-label": "Type" }, make("option", { value: "doc", text: "Document" }), make("option", { value: "link", text: "Link" })); type.value = r.type === "link" ? "link" : "doc";
      const label = make("input", { type: "text", maxlength: "80", placeholder: "Title", value: r.label || "", "aria-label": "Title" });
      const url = make("input", { type: "url", maxlength: "500", placeholder: "https://…", value: r.url || "", "aria-label": "Address" }); url.className = "wide2";
      type.addEventListener("change", () => { r.type = type.value; }); label.addEventListener("input", () => { r.label = label.value; }); url.addEventListener("input", () => { r.url = url.value; });
      root.append(make("div", { class: "ed-res" }, type, label, url, btn("✕", () => { arr.splice(i, 1); onChange(); }, "ed-mini danger")));
    });
  }
  function renderLessons() {
    const root = $("edLessons"); root.replaceChildren(); if (!draft.lessons.length) root.append(make("p", { class: "ed-muted", text: "No lessons yet." }));
    draft.lessons.forEach((l, i) => {
      const title = make("input", { type: "text", maxlength: "120", value: l.title || "", placeholder: "Lesson title" });
      const video = make("input", { type: "url", maxlength: "300", value: l.video || "", placeholder: "https://www.youtube.com/watch?v=…" }), vnote = make("span", { class: "ed-muted" });
      const checkVideo = () => { vnote.textContent = !video.value.trim() ? "No video" : youtubeId(video.value) ? "✓ YouTube video recognised" : "⚠ Not a valid YouTube link"; vnote.style.color = !video.value.trim() || youtubeId(video.value) ? "var(--muted)" : "var(--amber)"; };
      const notes = make("textarea", { rows: "5", maxlength: "20000", placeholder: "Lesson notes, steps, tips…" }); notes.value = l.notes || "";
      const prev = make("input", { type: "checkbox" }); prev.checked = !!l.preview;
      const sum = make("summary", {}, make("span", { text: (i + 1) + ". " + (l.title || "Untitled lesson") }));
      title.addEventListener("input", () => { l.title = title.value; sum.firstChild.textContent = (i + 1) + ". " + (l.title || "Untitled lesson"); });
      video.addEventListener("input", () => { l.video = video.value; checkVideo(); }); notes.addEventListener("input", () => { l.notes = notes.value; }); prev.addEventListener("change", () => { l.preview = prev.checked; });
      const resRoot = make("div"); if (!Array.isArray(l.resources)) l.resources = []; const draw = () => resEditor(l.resources, resRoot, draw); draw();
      const body = make("div", { class: "body" }, make("label", {}, "Lesson title", title), make("label", {}, "YouTube video link", video), vnote, make("label", {}, "Notes", notes),
        make("label", { class: "ed-inline" }, prev, document.createTextNode(" Free preview (anyone can open this lesson before unlocking)")),
        make("div", {}, make("span", { class: "ed-lbl", text: "Documents and links for this lesson" }), resRoot, btn("＋ Add document or link", () => { l.resources.push({ type: "doc", label: "", url: "" }); draw(); }, "ed-mini")),
        make("div", { class: "ed-actions" }, btn("↑ Move up", () => { if (i > 0) { [draft.lessons[i - 1], draft.lessons[i]] = [draft.lessons[i], draft.lessons[i - 1]]; renderLessons(); } }, "ed-mini"), btn("↓ Move down", () => { if (i < draft.lessons.length - 1) { [draft.lessons[i + 1], draft.lessons[i]] = [draft.lessons[i], draft.lessons[i + 1]]; renderLessons(); } }, "ed-mini"), btn("Remove lesson", () => { if (confirm("Remove this lesson?")) { draft.lessons.splice(i, 1); renderLessons(); } }, "ed-mini danger")));
      const d = make("details", { class: "ed-lesson" }, sum, body); if (l._open !== false && draft.lessons.length <= 3) d.open = true; d.addEventListener("toggle", () => { l._open = d.open; }); checkVideo(); root.append(d);
    });
  }
  const redrawCourseRes = () => resEditor(draft.resources, $("edCourseRes"), redrawCourseRes);
  $("edAddLesson").addEventListener("click", () => { draft.lessons.push({ id: newId("lesson"), title: "", video: "", notes: "", preview: false, resources: [] }); renderLessons(); });
  $("edAddCourseRes").addEventListener("click", () => { draft.resources.push({ type: "doc", label: "", url: "" }); redrawCourseRes(); });
  function previewPrice() { const n = price($("edPrice").value), o = $("edPricePreview"); o.textContent = priceText(n); o.className = "ed-price-preview" + (n > 0 ? " paid" : ""); }
  $("edPrice").addEventListener("input", previewPrice);
  function resetCourse() { $("edCourseForm").reset(); $("edCourseId").value = ""; draft = { lessons: [], resources: [] }; checksInto($("edRequires"), [], "No degrees available yet."); renderLessons(); redrawCourseRes(); previewPrice(); $("edCourseSave").textContent = "Add course"; say("edCourseMsg", ""); }
  function editCourse(c) {
    $("edCourseId").value = c.id; $("edTitle").value = c.title; $("edSkill").value = c.skill; $("edEmoji").value = c.emoji || ""; $("edDesc").value = c.description || ""; $("edStatus2").value = c.status || "published"; $("edPrice").value = price(c.price);
    draft = { lessons: JSON.parse(JSON.stringify(c.lessons || [])), resources: JSON.parse(JSON.stringify(c.resources || [])) }; checksInto($("edRequires"), c.requires || [], "No degrees available yet."); renderLessons(); redrawCourseRes(); previewPrice();
    $("edCourseSave").textContent = "Save changes"; $("edCourseForm").scrollIntoView({ behavior: "smooth", block: "start" }); $("edTitle").focus();
  }
  const cleanRes = arr => (arr || []).map(r => ({ type: r.type === "link" ? "link" : "doc", label: str(r.label, 80).trim(), url: str(r.url, 500).trim() })).filter(r => r.label || r.url);
  $("edCourseForm").addEventListener("submit", e => {
    e.preventDefault(); const title = $("edTitle").value.trim(); if (!title) return say("edCourseMsg", "Enter a course title.", true); if (!$("edSkill").value) return say("edCourseMsg", "Create a skill first, then pick it here.", true);
    const id = $("edCourseId").value || newId("course");
    const item = { id, title, skill: $("edSkill").value, emoji: $("edEmoji").value.trim() || "🛠️", description: $("edDesc").value.trim(), price: price($("edPrice").value), requires: [...document.querySelectorAll("#edRequires input:checked")].map(i => i.value), status: $("edStatus2").value,
      lessons: draft.lessons.map(l => ({ id: l.id || newId("lesson"), title: str(l.title, 120).trim(), video: str(l.video, 300).trim(), notes: str(l.notes, 20000), preview: !!l.preview, resources: cleanRes(l.resources) })), resources: cleanRes(draft.resources), updatedAt: new Date().toISOString() };
    const all = list("courses"), i = all.findIndex(x => x.id === id); if (i >= 0) all[i] = item; else all.unshift(item);
    if (save("courses", all)) { resetCourse(); say("edCourseMsg", "Course saved. Open the Publish tab to send it live."); }
  });
  $("edCourseReset").addEventListener("click", resetCourse);
  function renderCourseList() {
    const root = $("edCourseList"), f = $("edFilterSkill").value, skills = list("skills"), sname = id => (skills.find(s => s.id === id) || {}).name || "(deleted skill)"; root.replaceChildren();
    const items = list("courses").filter(c => f === "all" || c.skill === f); if (!items.length) { root.append(make("p", { class: "ed-empty", text: "No courses here yet." })); return; }
    items.forEach(c => {
      const isDraft = c.status === "draft", title = make("strong", { text: (c.emoji || "🛠️") + " " + c.title });
      title.append(make("span", { class: "ed-badge" + (isDraft ? " draft" : ""), text: isDraft ? "Draft" : "Published" }), make("span", { class: "ed-badge" + (price(c.price) > 0 ? " paid" : ""), text: priceText(price(c.price)) }));
      const bits = [sname(c.skill), (c.lessons || []).length + " lessons"]; if ((c.requires || []).length) bits.push("Extra degrees: " + c.requires.map(degName).join(", "));
      root.append(make("article", { class: "ed-row" }, make("div", {}, title, make("span", { class: "meta", text: bits.join(" · ") })), make("div", { class: "acts" }, btn("Edit", () => editCourse(c)),
        btn(isDraft ? "Publish" : "Make draft", () => save("courses", list("courses").map(x => x.id === c.id ? { ...x, status: isDraft ? "published" : "draft" } : x))),
        btn("Duplicate", () => { const copy = JSON.parse(JSON.stringify(c)); copy.id = newId("course"); copy.title += " (copy)"; copy.status = "draft"; save("courses", [copy, ...list("courses")]); }),
        btn("Delete", () => { if (confirm("Delete this course from your drafts?")) save("courses", list("courses").filter(x => x.id !== c.id)); }, "danger"))));
    });
  }
  $("edFilterSkill").addEventListener("change", renderCourseList);

  /* ---------- validation + snapshot ---------- */
  function problems() {
    const out = [], warn = [], dset = new Set(degrees.map(d => d.id)), skills = list("skills"), sset = new Set(skills.map(s => s.id));
    skills.forEach(s => (s.requires || []).forEach(r => { if (!dset.has(r)) out.push("Skill “" + s.name + "” requires a degree that is not published in Education."); }));
    list("courses").filter(c => c.status !== "draft").forEach(c => {
      const t = "“" + c.title + "”"; if (!sset.has(c.skill)) out.push(t + " belongs to a skill that no longer exists.");
      (c.requires || []).forEach(r => { if (!dset.has(r)) out.push(t + " requires a degree that is not published in Education."); });
      (c.lessons || []).forEach((l, i) => { if (!str(l.title, 120).trim()) out.push(t + ": lesson " + (i + 1) + " needs a title."); if (l.video && !youtubeId(l.video)) out.push(t + ": lesson " + (i + 1) + " has an invalid YouTube link.");
        (l.resources || []).forEach(r => { if (r.url && !httpsUrl(r.url)) out.push(t + ": lesson " + (i + 1) + " has a link that is not https://."); }); });
      (c.resources || []).forEach(r => { if (r.url && !httpsUrl(r.url)) out.push(t + ": a course material link is not https://."); });
      if (!(c.lessons || []).length) warn.push(t + " has no lessons yet.");
      const gated = price(c.price) > 0 || (c.requires || []).length || ((skills.find(s => s.id === c.skill) || {}).requires || []).length;
      if (gated && !(c.lessons || []).some(l => l.preview)) warn.push(t + " is locked but has no free preview lesson.");
    });
    return { out, warn };
  }
  function buildSnapshot() {
    const res = arr => (arr || []).map(r => ({ type: r.type === "link" ? "link" : "doc", label: str(r.label, 80), url: httpsUrl(r.url) })).filter(r => r.url), skills = list("skills");
    return { schema: 1,
      skills: skills.map(s => ({ id: str(s.id, 80), name: str(s.name, 80), emoji: str(s.emoji, 8) || "🛠️", description: str(s.description, 400), requires: (s.requires || []).map(x => str(x, 80)) })),
      courses: list("courses").filter(c => c.status !== "draft" && c.title && skills.some(s => s.id === c.skill)).map(c => ({ id: str(c.id, 80), title: str(c.title, 120), skill: str(c.skill, 80), emoji: str(c.emoji, 8) || "🛠️", description: str(c.description, 1200), price: price(c.price), requires: (c.requires || []).map(x => str(x, 80)),
        lessons: (c.lessons || []).map(l => ({ id: str(l.id, 80), title: str(l.title, 120), video: youtubeId(l.video), notes: str(l.notes, 20000), preview: !!l.preview, resources: res(l.resources) })), resources: res(c.resources) })) };
  }

  /* ---------- dashboard ---------- */
  function renderDashboard() {
    const courses = list("courses"), live = courses.filter(c => c.status !== "draft"), skills = list("skills"), lessons = live.reduce((n, c) => n + (c.lessons || []).length, 0);
    const tiles = [["Skills", String(skills.length), "skills"], ["Courses", live.length + " / " + courses.length, "courses"], ["Lessons", String(lessons), "courses"], ["Degrees available", String(degrees.length), "skills"], ["Live version", liveSnap ? "v" + liveSnap.version : "—", "publish"]];
    $("edTiles").replaceChildren(...tiles.map(([l, v, view]) => { const b = make("button", { type: "button", class: "ed-tile" }, make("span", { text: l }), make("strong", { text: v })); b.addEventListener("click", () => showView(view)); return b; }));
    const steps = [["Create a skill", skills.length > 0], ["Require a degree for a skill", skills.some(s => (s.requires || []).length)], ["Build a course with lessons", live.some(c => (c.lessons || []).length)], ["Publish to everyone", !!liveSnap], ["Everything is in sync", !!liveSnap && inSync()]];
    $("edChecklist").replaceChildren(...steps.map(([l, d]) => make("li", { class: d ? "done" : "" }, make("span", { class: "tick", text: d ? "✓" : "○" }), make("span", { text: l }))));
  }
  $("edExport").addEventListener("click", () => { const u = URL.createObjectURL(new Blob([JSON.stringify({ app: "rp-skills-employee", exportedAt: new Date().toISOString(), courses: list("courses"), skills: list("skills") }, null, 2)], { type: "application/json" })), a = document.createElement("a"); a.href = u; a.download = "rp-skills-drafts.json"; a.click(); setTimeout(() => URL.revokeObjectURL(u), 1000); $("edBackupMsg").textContent = "Backup downloaded."; });
  $("edImport").addEventListener("change", async e => {
    const f = e.target.files[0]; if (!f) return;
    try { const d = JSON.parse(await f.text()); if (!d || d.app !== "rp-skills-employee") throw new Error("This is not a Skills workspace backup."); if (!confirm("Replace your current drafts with this backup?")) return; localStorage.setItem(K.courses, JSON.stringify(Array.isArray(d.courses) ? d.courses : [])); localStorage.setItem(K.skills, JSON.stringify(Array.isArray(d.skills) ? d.skills : [])); refreshAll(); $("edBackupMsg").textContent = "Backup restored."; }
    catch (err) { $("edBackupMsg").textContent = "Could not restore: " + err.message; } e.target.value = "";
  });

  /* ---------- publish ---------- */
  let sb = null, account = { state: "checking" }, liveSnap = null, liveError = "", publishing = false;
  function client() { if (sb) return sb; if (location.protocol === "file:" || !window.supabase || !window.supabase.createClient) return null; sb = window.supabase.createClient(SB_URL, SB_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } }); return sb; }
  // The stored public snapshot hides locked lessons and adds the skill's degrees to each course, so compare the shared public parts only.
  const publicView = s => ({ skills: (s.skills || []).map(k => ({ id: k.id, name: k.name, emoji: k.emoji, description: k.description, requires: k.requires || [] })), courses: (s.courses || []).map(c => ({ id: c.id, title: c.title, skill: c.skill, emoji: c.emoji, description: c.description, price: c.price, outline: (c.lessons || c.outline || []).map(l => ({ id: l.id, title: l.title, preview: !!l.preview })) })) });
  const sectionState = (local, remote) => [["skills", "Skills"], ["courses", "Courses"]].map(([key, label]) => { const a = publicView(local)[key], b = remote ? publicView(remote)[key] : null; return { label, count: a.length, liveCount: b ? b.length : 0, same: remote ? stable(a) === stable(b) : false }; });
  const inSync = () => !!(liveSnap && liveSnap.snapshot && sectionState(buildSnapshot(), liveSnap.snapshot).every(r => r.same));
  function setChip(t, c) { const n = $("edPubChip"); n.textContent = t; n.className = "ed-chip " + (c || ""); }
  function updateChip() { if (liveError && !liveSnap) setChip("Live site unreachable", "bad"); else if (!liveSnap) setChip("Not published yet", "warn"); else if (inSync()) setChip("● Live site in sync (v" + liveSnap.version + ")", "ok"); else setChip("● Unpublished changes", "warn"); if (!$("edPublish").hidden) renderPublish(); }
  async function fetchLive() {
    try { const r = await fetch(SB_URL + "/rest/v1/rp_skills_publications?select=version,published_at,snapshot&order=version.desc&limit=1", { headers: { apikey: SB_KEY, Accept: "application/json" }, cache: "no-store" }); if (!r.ok) throw new Error(r.status === 404 ? "setup" : "HTTP " + r.status); const rows = await r.json(); liveSnap = rows.length ? rows[0] : null; liveError = ""; }
    catch (e) { liveError = e.message || "failed"; } updateChip(); renderDashboard();
  }
  async function loadAccount() {
    const c = client(); if (!c) { account = { state: location.protocol === "file:" ? "file" : "nolib" }; return; }
    try { const { data: { session } } = await c.auth.getSession(); if (!session) { account = { state: "signedout" }; return; } const { data, error } = await c.rpc("rp_get_account_context"); if (error) { account = { state: "error", message: error.message }; return; } const roles = Array.isArray(data.roles) ? data.roles : []; account = { state: roles.some(r => EDITOR_ROLES.includes(r)) && data.status === "active" ? "editor" : "noaccess", username: data.username, roles, status: data.status }; }
    catch (e) { account = { state: "error", message: e.message }; }
  }
  async function loadHistory() {
    const root = $("pubHistory"); root.replaceChildren(); if (account.state !== "editor") { root.append(make("li", { class: "ed-muted", text: "Sign in as a Skills employee to see history." })); return; }
    const { data, error } = await client().from("rp_skills_publications").select("version,published_at,note").order("version", { ascending: false }).limit(10);
    if (error || !data) { root.append(make("li", { class: "ed-muted", text: "History is unavailable." })); return; } if (!data.length) { root.append(make("li", { class: "ed-muted", text: "Nothing published yet." })); return; }
    data.forEach(row => root.append(make("li", {}, make("span", { text: "v" + row.version + (row.note ? " · " + row.note : "") }), make("time", { text: when(row.published_at) }), liveSnap && row.version === liveSnap.version ? make("span", { class: "ed-muted", text: "live" }) : btn("Restore", () => republish(row.version)))));
  }
  function explain(error) {
    const m = (error && error.message) || String(error);
    if (/rp_publish_skills|rp_republish_skills|rp_skills_publications|schema cache|does not exist/i.test(m) && !/degree|skill "/i.test(m)) return "The shared database is not set up yet. Run skills-content.sql with npm run migrate in the server folder, then try again.";
    if (/role required/i.test(m)) return "Your account does not have the Skills employee role."; if (/JWT|not authenticated|permission denied/i.test(m)) return "Your sign-in expired. Sign in again on the main page."; return m;
  }
  function renderPublish() {
    const box = $("pubAccount"); box.className = "ed-note"; box.replaceChildren();
    switch (account.state) {
      case "editor": box.className = "ed-note ok"; box.append("Signed in as " + account.username + ". You can publish."); break;
      case "signedout": box.className = "ed-note bad"; box.append(make("a", { href: "../index/index.html", text: "Sign in on the main page" }), " with your employee account, then come back and press Check live version."); break;
      case "noaccess": box.className = "ed-note bad"; box.append("Signed in as " + account.username + ", but this account has no Skills employee role (" + ((account.roles || []).join(", ") || "none") + "). Ask the Creator to assign one."); break;
      case "file": box.className = "ed-note bad"; box.append("Open this page through your website address or localhost. Publishing cannot run from a file:// page."); break;
      case "nolib": box.className = "ed-note bad"; box.append("The sign-in library could not load. Check your connection and reload."); break;
      case "error": box.className = "ed-note bad"; box.append("Could not check your account: " + account.message); break; default: box.append("Checking your sign-in…");
    }
    const p = problems(), pr = $("pubProblems"); pr.replaceChildren();
    if (p.out.length) pr.append(make("div", { class: "ed-problems" }, make("strong", { text: "Fix these before publishing:" }), make("ul", {}, ...p.out.slice(0, 12).map(t => make("li", { text: t })))));
    if (p.warn.length) pr.append(make("div", { class: "ed-warn" }, make("strong", { text: "Worth a look:" }), make("ul", {}, ...p.warn.slice(0, 8).map(t => make("li", { text: t })))));
    const local = buildSnapshot(), rows = sectionState(local, liveSnap ? liveSnap.snapshot : null);
    $("pubSummary").replaceChildren(...rows.map(r => make("li", {}, make("span", { text: r.label + ": " + r.count + (liveSnap && r.liveCount !== r.count ? " (live: " + r.liveCount + ")" : "") }), make("span", { class: "tag " + (r.same ? "same" : "changed"), text: r.same ? "Up to date" : (liveSnap ? "Changed" : "New") }))));
    const bytes = new Blob([JSON.stringify(local)]).size; $("pubSize").textContent = bytes > 1048576 ? (bytes / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(bytes / 1024)) + " KB";
    const same = liveSnap && inSync(); $("pubPublish").disabled = account.state !== "editor" || publishing || p.out.length > 0; $("pubPublish").textContent = publishing ? "Publishing…" : same ? "Publish again" : "Publish to everyone";
    $("pubLive").textContent = liveError && !liveSnap ? (liveError === "setup" ? "The shared database is not set up yet (run skills-content.sql)." : "Could not reach the live site (" + liveError + ").") : liveSnap ? "Version " + liveSnap.version + ", published " + when(liveSnap.published_at) + ". " + (same ? "Your drafts match it." : "Your drafts differ from it.") : "Nothing has been published yet.";
  }
  async function publish() {
    if (publishing || account.state !== "editor" || problems().out.length) return; const snap = buildSnapshot(), bytes = new Blob([JSON.stringify(snap)]).size; if (bytes > 7500000) return say("pubMessage", "Too large to publish (over 7.5 MB).", true);
    if (!confirm("Publish to everyone?\n\n" + snap.skills.length + " skill(s) and " + snap.courses.length + " course(s) will be visible on every device.")) return;
    publishing = true; renderPublish(); say("pubMessage", "Publishing…");
    const { data, error } = await client().rpc("rp_publish_skills", { p_snapshot: snap, p_note: $("pubNote").value.trim() }); publishing = false;
    if (error) { say("pubMessage", explain(error), true); renderPublish(); return; }
    $("pubNote").value = ""; say("pubMessage", "Published as version " + data + ". Visitors will see it within about a minute."); await fetchLive(); loadHistory();
  }
  async function republish(version) {
    if (!confirm("Make version " + version + " the live version again?")) return;
    const { data, error } = await client().rpc("rp_republish_skills", { p_version: version }); if (error) return say("pubMessage", explain(error), true);
    say("pubMessage", "Version " + version + " is live again (as version " + data + ")."); await fetchLive(); loadHistory();
  }
  async function refreshPublish() { say("pubMessage", ""); await loadAccount(); await fetchLive(); renderPublish(); loadHistory(); }
  $("pubPublish").addEventListener("click", publish); $("pubRefresh").addEventListener("click", refreshPublish); $("edPubChip").addEventListener("click", () => showView("publish"));
  document.addEventListener("visibilitychange", () => { if (!document.hidden) refreshPublish(); });

  function refreshAll() { fillDegreeControls(); renderSkillList(); renderCourseList(); renderDashboard(); updateChip(); }
  resetSkill(); resetCourse(); refreshAll(); showView("dashboard"); loadDegrees(); refreshPublish();
})();
