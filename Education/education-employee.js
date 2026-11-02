(() => {
  "use strict";
  const K = { courses: "rpEduCourses.v1", degrees: "rpEduDegrees.v1" };
  const SB_URL = "https://nesxcgymsgegkqjhfydx.supabase.co", SB_KEY = "sb_publishable_Tj4frYyU-iAylsH_--y3Qg_esNYqce-";
  const EDITOR_ROLES = ["Creator", "Education Studio Director", "Education Employee"];
  const LEVELS = [...Array.from({ length: 12 }, (_, i) => "Grade " + (i + 1)), "College", "University"];
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
    const s = String(v || "").trim(); if (!s) return "";
    if (/^[\w-]{11}$/.test(s)) return s;
    try {
      const u = new URL(s), h = u.hostname.replace(/^www\.|^m\./, "");
      if (h === "youtu.be") { const id = u.pathname.slice(1).split("/")[0]; return /^[\w-]{11}$/.test(id) ? id : ""; }
      if (h === "youtube.com" || h === "youtube-nocookie.com") {
        const v2 = u.searchParams.get("v"); if (v2 && /^[\w-]{11}$/.test(v2)) return v2;
        const m = u.pathname.match(/^\/(?:embed|shorts|live|v)\/([\w-]{11})/); if (m) return m[1];
      }
    } catch { /* not a URL */ }
    return "";
  }

  /* ---------- navigation ---------- */
  const VIEWS = { dashboard: "edDashboard", courses: "edCourses", degrees: "edDegrees", publish: "edPublish", tutorial: "edTutorial" };
  function showView(name) {
    document.querySelectorAll("[data-view]").forEach(b => { const on = b.dataset.view === name; b.classList.toggle("active", on); b.setAttribute("aria-selected", String(on)); });
    Object.entries(VIEWS).forEach(([v, id]) => { const s = $(id), on = v === name; s.hidden = !on; s.classList.toggle("active", on); });
    if (name === "publish") renderPublish();
  }
  document.querySelectorAll("[data-view]").forEach(b => b.addEventListener("click", () => showView(b.dataset.view)));

  /* ---------- selects ---------- */
  function fillLevels() {
    const opt = (v, t) => make("option", { value: v, text: t || v });
    const grades = LEVELS.filter(l => l.startsWith("Grade")), higher = LEVELS.filter(l => !l.startsWith("Grade"));
    [$("edLevel"), $("edDegLevel")].forEach(sel => {
      sel.replaceChildren(); const g = make("optgroup", { label: "School grades" }), h = make("optgroup", { label: "Higher education" });
      grades.forEach(l => g.append(opt(l))); higher.forEach(l => h.append(opt(l))); sel.append(g, h);
    });
    const f = $("edFilterLevel"); f.replaceChildren(opt("all", "all levels")); LEVELS.forEach(l => f.append(opt(l)));
  }
  function fillDegreeControls(selectedRequires, selectedDegree) {
    const degrees = list("degrees");
    const checks = $("edRequires"), req = new Set(selectedRequires !== undefined ? selectedRequires : [...document.querySelectorAll("#edRequires input:checked")].map(i => i.value));
    checks.replaceChildren();
    if (!degrees.length) checks.append(make("span", { class: "ed-muted", text: "No degrees yet. Create degrees in the Degrees tab first." }));
    degrees.forEach(d => { const i = make("input", { type: "checkbox", value: d.id }); i.checked = req.has(d.id); checks.append(make("label", {}, i, document.createTextNode(" " + (d.emoji || "📜") + " " + d.name))); });
    const sel = $("edDegree"), cur = selectedDegree !== undefined ? selectedDegree : sel.value; sel.replaceChildren(make("option", { value: "", text: "No degree (course only)" }));
    degrees.forEach(d => sel.append(make("option", { value: d.id, text: (d.emoji || "📜") + " " + d.name })));
    sel.value = degrees.some(d => d.id === cur) ? cur : "";
  }

  /* ---------- course editor ---------- */
  let draft = emptyDraft();
  function emptyDraft() { return { lessons: [], resources: [], exam: [] }; }
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
    const root = $("edLessons"); root.replaceChildren();
    if (!draft.lessons.length) root.append(make("p", { class: "ed-muted", text: "No lessons yet." }));
    draft.lessons.forEach((l, i) => {
      const title = make("input", { type: "text", maxlength: "120", value: l.title || "", placeholder: "Lesson title" });
      const video = make("input", { type: "url", maxlength: "300", value: l.video || "", placeholder: "https://www.youtube.com/watch?v=…" });
      const vnote = make("span", { class: "ed-muted" });
      const checkVideo = () => { vnote.textContent = !video.value.trim() ? "No video" : youtubeId(video.value) ? "✓ YouTube video recognised" : "⚠ Not a valid YouTube link"; vnote.style.color = !video.value.trim() || youtubeId(video.value) ? "var(--muted)" : "var(--amber)"; };
      const notes = make("textarea", { rows: "5", maxlength: "20000", placeholder: "Lesson notes, key points, worked examples…" }); notes.value = l.notes || "";
      const prev = make("input", { type: "checkbox" }); prev.checked = !!l.preview;
      title.addEventListener("input", () => { l.title = title.value; sum.firstChild.textContent = (i + 1) + ". " + (l.title || "Untitled lesson"); });
      video.addEventListener("input", () => { l.video = video.value; checkVideo(); }); notes.addEventListener("input", () => { l.notes = notes.value; }); prev.addEventListener("change", () => { l.preview = prev.checked; });
      const resRoot = make("div"); if (!Array.isArray(l.resources)) l.resources = [];
      const draw = () => resEditor(l.resources, resRoot, draw); draw();
      const sum = make("summary", {}, make("span", { text: (i + 1) + ". " + (l.title || "Untitled lesson") }));
      const body = make("div", { class: "body" },
        make("label", {}, "Lesson title", title), make("label", {}, "YouTube video link", video), vnote, make("label", {}, "Notes", notes),
        make("label", { class: "ed-inline" }, prev, document.createTextNode(" Free preview (anyone can open this lesson, even before paying)")),
        make("div", {}, make("span", { class: "ed-lbl", text: "Documents and links for this lesson" }), resRoot, btn("＋ Add document or link", () => { l.resources.push({ type: "doc", label: "", url: "" }); draw(); }, "ed-mini")),
        make("div", { class: "ed-actions" }, btn("↑ Move up", () => { if (i > 0) { [draft.lessons[i - 1], draft.lessons[i]] = [draft.lessons[i], draft.lessons[i - 1]]; renderLessons(); } }, "ed-mini"), btn("↓ Move down", () => { if (i < draft.lessons.length - 1) { [draft.lessons[i + 1], draft.lessons[i]] = [draft.lessons[i], draft.lessons[i + 1]]; renderLessons(); } }, "ed-mini"), btn("Remove lesson", () => { if (confirm("Remove this lesson?")) { draft.lessons.splice(i, 1); renderLessons(); } }, "ed-mini danger")));
      const d = make("details", { class: "ed-lesson" }, sum, body); if (l._open !== false && draft.lessons.length <= 3) d.open = true; d.addEventListener("toggle", () => { l._open = d.open; }); checkVideo(); root.append(d);
    });
  }
  function renderExam() {
    const root = $("edExam"); root.replaceChildren();
    if (!draft.exam.length) root.append(make("p", { class: "ed-muted", text: "No exam questions yet." }));
    draft.exam.forEach((q, qi) => {
      const text = make("textarea", { rows: "2", maxlength: "500", placeholder: "Question" }); text.value = q.q || ""; text.addEventListener("input", () => { q.q = text.value; });
      const opts = make("div");
      q.options.forEach((o, oi) => {
        const radio = make("input", { type: "radio", name: "ans-" + qi, "aria-label": "Correct answer" }); radio.checked = q.answer === oi; radio.addEventListener("change", () => { q.answer = oi; });
        const t = make("input", { type: "text", maxlength: "200", placeholder: "Option " + (oi + 1), value: o }); t.addEventListener("input", () => { q.options[oi] = t.value; });
        opts.append(make("div", { class: "ed-opt" }, radio, t, btn("✕", () => { if (q.options.length > 2) { q.options.splice(oi, 1); if (q.answer >= q.options.length) q.answer = 0; else if (q.answer > oi) q.answer--; renderExam(); } }, "ed-mini danger")));
      });
      root.append(make("div", { class: "ed-q" }, make("strong", { text: "Question " + (qi + 1) }), make("label", {}, "Question", text), make("span", { class: "ed-muted", text: "Select the circle next to the correct answer." }), opts,
        make("div", { class: "ed-actions" }, btn("＋ Add option", () => { if (q.options.length < 6) { q.options.push(""); renderExam(); } }, "ed-mini"), btn("Remove question", () => { draft.exam.splice(qi, 1); renderExam(); }, "ed-mini danger"))));
    });
  }
  const redrawCourseRes = () => resEditor(draft.resources, $("edCourseRes"), redrawCourseRes);
  $("edAddLesson").addEventListener("click", () => { draft.lessons.push({ id: newId("lesson"), title: "", video: "", notes: "", preview: false, resources: [] }); renderLessons(); });
  $("edAddCourseRes").addEventListener("click", () => { draft.resources.push({ type: "doc", label: "", url: "" }); redrawCourseRes(); });
  $("edAddQ").addEventListener("click", () => { draft.exam.push({ q: "", options: ["", "", "", ""], answer: 0 }); renderExam(); });
  function previewPrice() { const n = price($("edPrice").value), o = $("edPricePreview"); o.textContent = priceText(n); o.className = "ed-price-preview" + (n > 0 ? " paid" : ""); }
  $("edPrice").addEventListener("input", previewPrice);
  function resetCourse() {
    $("edCourseForm").reset(); $("edCourseId").value = ""; draft = emptyDraft(); fillDegreeControls([], ""); renderLessons(); redrawCourseRes(); renderExam(); previewPrice(); $("edCourseSave").textContent = "Add course"; say("edCourseMsg", "");
  }
  function editCourse(c) {
    $("edCourseId").value = c.id; $("edTitle").value = c.title; $("edLevel").value = c.level; $("edSubject").value = c.subject || ""; $("edEmoji").value = c.emoji || ""; $("edDesc").value = c.description || ""; $("edStatus2").value = c.status || "published"; $("edPrice").value = price(c.price); $("edPass").value = c.passMark || 70;
    draft = { lessons: JSON.parse(JSON.stringify(c.lessons || [])), resources: JSON.parse(JSON.stringify(c.resources || [])), exam: JSON.parse(JSON.stringify(c.exam || [])) };
    fillDegreeControls(c.requires || [], c.degree || ""); renderLessons(); redrawCourseRes(); renderExam(); previewPrice(); $("edCourseSave").textContent = "Save changes"; $("edCourseForm").scrollIntoView({ behavior: "smooth", block: "start" }); $("edTitle").focus();
  }
  function cleanRes(arr) { return (arr || []).map(r => ({ type: r.type === "link" ? "link" : "doc", label: str(r.label, 80).trim(), url: str(r.url, 500).trim() })).filter(r => r.label || r.url); }
  $("edCourseForm").addEventListener("submit", e => {
    e.preventDefault();
    const title = $("edTitle").value.trim(); if (!title) return say("edCourseMsg", "Enter a course title.", true);
    const id = $("edCourseId").value || newId("course");
    const item = {
      id, title, level: $("edLevel").value, subject: $("edSubject").value.trim(), emoji: $("edEmoji").value.trim() || "📘", description: $("edDesc").value.trim(), price: price($("edPrice").value),
      passMark: Math.max(1, Math.min(100, Math.floor(Number($("edPass").value)) || 70)), requires: [...document.querySelectorAll("#edRequires input:checked")].map(i => i.value), degree: $("edDegree").value, status: $("edStatus2").value,
      lessons: draft.lessons.map(l => ({ id: l.id || newId("lesson"), title: str(l.title, 120).trim(), video: str(l.video, 300).trim(), notes: str(l.notes, 20000), preview: !!l.preview, resources: cleanRes(l.resources) })),
      resources: cleanRes(draft.resources), exam: draft.exam.map(q => ({ q: str(q.q, 500).trim(), options: q.options.map(o => str(o, 200).trim()), answer: q.answer })), updatedAt: new Date().toISOString()
    };
    const all = list("courses"), i = all.findIndex(x => x.id === id); if (i >= 0) all[i] = item; else all.unshift(item);
    if (save("courses", all)) { resetCourse(); say("edCourseMsg", "Course saved. Open the Publish tab to send it live."); }
  });
  $("edCourseReset").addEventListener("click", resetCourse);

  /* ---------- course list ---------- */
  function renderCourseList() {
    const root = $("edCourseList"), lvl = $("edFilterLevel").value, degrees = list("degrees"), name = id => (degrees.find(d => d.id === id) || {}).name || "(deleted)";
    root.replaceChildren(); const items = list("courses").filter(c => lvl === "all" || c.level === lvl);
    if (!items.length) { root.append(make("p", { class: "ed-empty", text: "No courses here yet." })); return; }
    items.forEach(c => {
      const draftState = c.status === "draft", title = make("strong", { text: (c.emoji || "📘") + " " + c.title });
      title.append(make("span", { class: "ed-badge" + (draftState ? " draft" : ""), text: draftState ? "Draft" : "Published" }), make("span", { class: "ed-badge" + (price(c.price) > 0 ? " paid" : ""), text: priceText(price(c.price)) }));
      const bits = [c.level, c.subject, (c.lessons || []).length + " lessons", (c.exam || []).length + " exam questions"].filter(Boolean);
      if ((c.requires || []).length) bits.push("Requires: " + c.requires.map(name).join(", "));
      if (c.degree) bits.push("Awards: " + name(c.degree));
      root.append(make("article", { class: "ed-row" }, make("div", {}, title, make("span", { class: "meta", text: bits.join(" · ") })),
        make("div", { class: "acts" }, btn("Edit", () => editCourse(c)), btn(draftState ? "Publish" : "Make draft", () => save("courses", list("courses").map(x => x.id === c.id ? { ...x, status: draftState ? "published" : "draft" } : x))),
          btn("Duplicate", () => { const copy = JSON.parse(JSON.stringify(c)); copy.id = newId("course"); copy.title += " (copy)"; copy.status = "draft"; save("courses", [copy, ...list("courses")]); }),
          btn("Delete", () => { if (confirm("Delete this course from your drafts?")) save("courses", list("courses").filter(x => x.id !== c.id)); }, "danger"))));
    });
  }
  $("edFilterLevel").addEventListener("change", renderCourseList);

  /* ---------- degrees ---------- */
  function resetDegree() { $("edDegreeForm").reset(); $("edDegreeId").value = ""; $("edDegSave").textContent = "Add degree"; say("edDegMsg", ""); }
  $("edDegreeForm").addEventListener("submit", e => {
    e.preventDefault();
    const id = $("edDegreeId").value || newId("degree"), item = { id, name: $("edDegName").value.trim(), level: $("edDegLevel").value, emoji: $("edDegEmoji").value.trim() || "📜", description: $("edDegDesc").value.trim() };
    if (!item.name) return;
    const all = list("degrees"), i = all.findIndex(x => x.id === id); if (i >= 0) all[i] = item; else all.push(item);
    if (save("degrees", all)) { resetDegree(); say("edDegMsg", "Degree saved."); }
  });
  $("edDegReset").addEventListener("click", resetDegree);
  function renderDegreeList() {
    const root = $("edDegreeList"), courses = list("courses"); root.replaceChildren();
    if (!list("degrees").length) { root.append(make("p", { class: "ed-empty", text: "No degrees yet." })); return; }
    list("degrees").forEach(d => {
      const awardedBy = courses.filter(c => c.degree === d.id).length, requiredBy = courses.filter(c => (c.requires || []).includes(d.id)).length;
      root.append(make("article", { class: "ed-row" }, make("div", {}, make("strong", { text: (d.emoji || "📜") + " " + d.name }), make("span", { class: "meta", text: [d.level, "Awarded by " + awardedBy + " course(s)", "Required by " + requiredBy + " course(s)", d.description].filter(Boolean).join(" · ") })),
        make("div", { class: "acts" }, btn("Edit", () => { $("edDegreeId").value = d.id; $("edDegName").value = d.name; $("edDegLevel").value = d.level; $("edDegEmoji").value = d.emoji || ""; $("edDegDesc").value = d.description || ""; $("edDegSave").textContent = "Save changes"; $("edDegName").focus(); }),
          btn("Delete", () => {
            if (!confirm("Delete this degree?" + (awardedBy || requiredBy ? "\n\nIt will also be removed from the " + (awardedBy + requiredBy) + " course setting(s) that use it." : ""))) return;
            const cs = courses.map(c => ({ ...c, degree: c.degree === d.id ? "" : c.degree, requires: (c.requires || []).filter(x => x !== d.id) }));
            localStorage.setItem(K.courses, JSON.stringify(cs)); save("degrees", list("degrees").filter(x => x.id !== d.id));
          }, "danger"))));
    });
  }

  /* ---------- validation + snapshot ---------- */
  function problems() {
    const out = [], warn = [], degrees = new Set(list("degrees").map(d => d.id));
    list("courses").filter(c => c.status !== "draft").forEach(c => {
      const t = "“" + c.title + "”";
      if (c.degree && !(c.exam || []).length) out.push(t + " awards a degree but has no final exam.");
      if (c.degree && !degrees.has(c.degree)) out.push(t + " awards a degree that no longer exists.");
      (c.requires || []).forEach(r => { if (!degrees.has(r)) out.push(t + " requires a degree that no longer exists."); });
      (c.lessons || []).forEach((l, i) => {
        if (!str(l.title, 120).trim()) out.push(t + ": lesson " + (i + 1) + " needs a title.");
        if (l.video && !youtubeId(l.video)) out.push(t + ": lesson " + (i + 1) + " has an invalid YouTube link.");
        (l.resources || []).forEach(r => { if (r.url && !httpsUrl(r.url)) out.push(t + ": lesson " + (i + 1) + " has a link that is not https://."); });
      });
      (c.resources || []).forEach(r => { if (r.url && !httpsUrl(r.url)) out.push(t + ": a course material link is not https://."); });
      (c.exam || []).forEach((q, i) => { const filled = (q.options || []).filter(o => String(o).trim()); if (!String(q.q).trim()) out.push(t + ": exam question " + (i + 1) + " is empty."); if (filled.length < 2) out.push(t + ": exam question " + (i + 1) + " needs at least two options."); else if (!String((q.options || [])[q.answer] || "").trim()) out.push(t + ": exam question " + (i + 1) + " has a blank correct answer."); });
      if (!(c.lessons || []).length) warn.push(t + " has no lessons yet.");
      if ((price(c.price) > 0 || (c.requires || []).length) && !(c.lessons || []).some(l => l.preview)) warn.push(t + " is locked but has no free preview lesson.");
    });
    return { out, warn };
  }
  function buildSnapshot() {
    const res = arr => (arr || []).map(r => ({ type: r.type === "link" ? "link" : "doc", label: str(r.label, 80), url: httpsUrl(r.url) })).filter(r => r.url);
    return {
      schema: 1,
      degrees: list("degrees").map(d => ({ id: str(d.id, 80), name: str(d.name, 80), level: str(d.level, 20), emoji: str(d.emoji, 8) || "📜", description: str(d.description, 200) })),
      courses: list("courses").filter(c => c.status !== "draft" && c.title).map(c => ({
        id: str(c.id, 80), title: str(c.title, 120), level: LEVELS.includes(c.level) ? c.level : "Grade 1", subject: str(c.subject, 60), emoji: str(c.emoji, 8) || "📘", description: str(c.description, 1200), price: price(c.price), passMark: Math.max(1, Math.min(100, Number(c.passMark) || 70)),
        requires: (c.requires || []).map(x => str(x, 80)), degree: c.degree ? str(c.degree, 80) : "",
        lessons: (c.lessons || []).map(l => ({ id: str(l.id, 80), title: str(l.title, 120), video: youtubeId(l.video), notes: str(l.notes, 20000), preview: !!l.preview, resources: res(l.resources) })),
        resources: res(c.resources),
        exam: (c.exam || []).map(q => ({ q: str(q.q, 500), options: (q.options || []).map(o => str(o, 200)).filter(o => o.trim()), answer: Math.max(0, (q.options || []).slice(0, q.answer).filter(o => String(o).trim()).length) })).filter(q => q.q.trim() && q.options.length >= 2)
      }))
    };
  }

  /* ---------- dashboard ---------- */
  function renderDashboard() {
    const courses = list("courses"), live = courses.filter(c => c.status !== "draft"), gated = live.filter(c => price(c.price) > 0 || (c.requires || []).length), lessons = live.reduce((n, c) => n + (c.lessons || []).length, 0);
    const tiles = [["Courses", live.length + " / " + courses.length, "courses"], ["Degrees", String(list("degrees").length), "degrees"], ["Locked courses", String(gated.length), "courses"], ["Lessons", String(lessons), "courses"], ["Live version", liveSnap ? "v" + liveSnap.version : "—", "publish"]];
    $("edTiles").replaceChildren(...tiles.map(([l, v, view]) => { const b = make("button", { type: "button", class: "ed-tile" }, make("span", { text: l }), make("strong", { text: v })); b.addEventListener("click", () => showView(view)); return b; }));
    const steps = [["Create at least one degree", list("degrees").length > 0], ["Build a course with lessons", live.some(c => (c.lessons || []).length)], ["Add a final exam", live.some(c => (c.exam || []).length)], ["Publish to everyone", !!liveSnap], ["Everything is in sync", !!liveSnap && inSync()]];
    $("edChecklist").replaceChildren(...steps.map(([l, d]) => make("li", { class: d ? "done" : "" }, make("span", { class: "tick", text: d ? "✓" : "○" }), make("span", { text: l }))));
  }
  $("edExport").addEventListener("click", () => {
    const u = URL.createObjectURL(new Blob([JSON.stringify({ app: "rp-education-employee", exportedAt: new Date().toISOString(), courses: list("courses"), degrees: list("degrees") }, null, 2)], { type: "application/json" })), a = document.createElement("a"); a.href = u; a.download = "rp-education-drafts.json"; a.click(); setTimeout(() => URL.revokeObjectURL(u), 1000); $("edBackupMsg").textContent = "Backup downloaded.";
  });
  $("edImport").addEventListener("change", async e => {
    const f = e.target.files[0]; if (!f) return;
    try { const d = JSON.parse(await f.text()); if (!d || d.app !== "rp-education-employee") throw new Error("This is not an Education workspace backup."); if (!confirm("Replace your current drafts with this backup?")) return; localStorage.setItem(K.courses, JSON.stringify(Array.isArray(d.courses) ? d.courses : [])); localStorage.setItem(K.degrees, JSON.stringify(Array.isArray(d.degrees) ? d.degrees : [])); refreshAll(); $("edBackupMsg").textContent = "Backup restored."; }
    catch (err) { $("edBackupMsg").textContent = "Could not restore: " + err.message; } e.target.value = "";
  });

  /* ---------- publish ---------- */
  let sb = null, account = { state: "checking" }, liveSnap = null, liveError = "", publishing = false;
  function client() { if (sb) return sb; if (location.protocol === "file:" || !window.supabase || !window.supabase.createClient) return null; sb = window.supabase.createClient(SB_URL, SB_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } }); return sb; }
  // The server removes private content from the stored snapshot, so we compare the parts that stay public.
  const publicView = s => ({ degrees: s.degrees || [], courses: (s.courses || []).map(c => ({ id: c.id, title: c.title, level: c.level, subject: c.subject, emoji: c.emoji, description: c.description, price: c.price, passMark: c.passMark, requires: c.requires, degree: c.degree, outline: (c.lessons || c.outline || []).map(l => ({ id: l.id, title: l.title, preview: !!l.preview })) })) });
  const sectionState = (local, remote) => [["courses", "Courses"], ["degrees", "Degrees"]].map(([key, label]) => { const a = publicView(local)[key], b = remote ? publicView(remote)[key] : null; return { key, label, count: a.length, liveCount: b ? b.length : 0, same: remote ? stable(a) === stable(b) : false }; });
  const inSync = () => !!(liveSnap && liveSnap.snapshot && sectionState(buildSnapshot(), liveSnap.snapshot).every(r => r.same));
  function setChip(t, c) { const n = $("edPubChip"); n.textContent = t; n.className = "ed-chip " + (c || ""); }
  function updateStatus() {
    if (liveError && !liveSnap) setChip("Live site unreachable", "bad"); else if (!liveSnap) setChip("Not published yet", "warn"); else if (inSync()) setChip("● Live site in sync (v" + liveSnap.version + ")", "ok"); else setChip("● Unpublished changes", "warn");
    if (!$("edPublish").hidden) renderPublish(); renderDashboard();
  }
  async function fetchLive() {
    try { const r = await fetch(SB_URL + "/rest/v1/rp_education_publications?select=version,published_at,snapshot&order=version.desc&limit=1", { headers: { apikey: SB_KEY, Accept: "application/json" }, cache: "no-store" }); if (!r.ok) throw new Error(r.status === 404 ? "setup" : "HTTP " + r.status); const rows = await r.json(); liveSnap = rows.length ? rows[0] : null; liveError = ""; }
    catch (e) { liveError = e.message || "failed"; } updateStatus();
  }
  async function loadAccount() {
    const c = client(); if (!c) { account = { state: location.protocol === "file:" ? "file" : "nolib" }; return; }
    try { const { data: { session } } = await c.auth.getSession(); if (!session) { account = { state: "signedout" }; return; } const { data, error } = await c.rpc("rp_get_account_context"); if (error) { account = { state: "error", message: error.message }; return; } const roles = Array.isArray(data.roles) ? data.roles : []; account = { state: roles.some(r => EDITOR_ROLES.includes(r)) && data.status === "active" ? "editor" : "noaccess", username: data.username, roles, status: data.status }; }
    catch (e) { account = { state: "error", message: e.message }; }
  }
  async function loadHistory() {
    const root = $("pubHistory"); root.replaceChildren();
    if (account.state !== "editor") { root.append(make("li", { class: "ed-muted", text: "Sign in as an Education employee to see history." })); return; }
    const { data, error } = await client().from("rp_education_publications").select("version,published_at,note").order("version", { ascending: false }).limit(10);
    if (error || !data) { root.append(make("li", { class: "ed-muted", text: "History is unavailable." })); return; } if (!data.length) { root.append(make("li", { class: "ed-muted", text: "Nothing published yet." })); return; }
    data.forEach(row => root.append(make("li", {}, make("span", { text: "v" + row.version + (row.note ? " · " + row.note : "") }), make("time", { text: when(row.published_at) }), liveSnap && row.version === liveSnap.version ? make("span", { class: "ed-muted", text: "live" }) : btn("Restore", () => republish(row.version)))));
  }
  function explain(error) {
    const m = (error && error.message) || String(error);
    if (/rp_publish_education|rp_republish_education|rp_education_publications|schema cache|does not exist/i.test(m)) return "The shared database is not set up yet. Run index/education-content.sql with npm run migrate in the server folder, then try again.";
    if (/role required/i.test(m)) return "Your account does not have the Education employee role."; if (/JWT|not authenticated|permission denied/i.test(m)) return "Your sign-in expired. Sign in again on the main page."; return m;
  }
  function renderPublish() {
    const box = $("pubAccount"); box.className = "ed-note"; box.replaceChildren();
    switch (account.state) {
      case "editor": box.className = "ed-note ok"; box.append("Signed in as " + account.username + ". You can publish."); break;
      case "signedout": box.className = "ed-note bad"; box.append(make("a", { href: "../index/index.html", text: "Sign in on the main page" }), " with your employee account, then come back and press Check live version."); break;
      case "noaccess": box.className = "ed-note bad"; box.append("Signed in as " + account.username + ", but this account has no Education employee role (" + ((account.roles || []).join(", ") || "none") + "). Ask the Creator to assign one."); break;
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
    $("pubLive").textContent = liveError && !liveSnap ? (liveError === "setup" ? "The shared database is not set up yet (run education-content.sql)." : "Could not reach the live site (" + liveError + ").") : liveSnap ? "Version " + liveSnap.version + ", published " + when(liveSnap.published_at) + ". " + (same ? "Your drafts match it." : "Your drafts differ from it.") : "Nothing has been published yet.";
  }
  async function publish() {
    if (publishing || account.state !== "editor" || problems().out.length) return;
    const snap = buildSnapshot(), bytes = new Blob([JSON.stringify(snap)]).size; if (bytes > 7500000) return say("pubMessage", "Too large to publish (over 7.5 MB).", true);
    if (!confirm("Publish to everyone?\n\n" + snap.courses.length + " course(s) and " + snap.degrees.length + " degree(s) will be visible on every device.")) return;
    publishing = true; renderPublish(); say("pubMessage", "Publishing…");
    const { data, error } = await client().rpc("rp_publish_education", { p_snapshot: snap, p_note: $("pubNote").value.trim() }); publishing = false;
    if (error) { say("pubMessage", explain(error), true); renderPublish(); return; }
    $("pubNote").value = ""; say("pubMessage", "Published as version " + data + ". Visitors will see it within about a minute."); await fetchLive(); loadHistory();
  }
  async function republish(version) {
    if (!confirm("Make version " + version + " the live version again?")) return;
    const { data, error } = await client().rpc("rp_republish_education", { p_version: version }); if (error) return say("pubMessage", explain(error), true);
    say("pubMessage", "Version " + version + " is live again (as version " + data + ")."); await fetchLive(); loadHistory();
  }
  async function refreshPublish() { say("pubMessage", ""); await loadAccount(); await fetchLive(); renderPublish(); loadHistory(); }
  $("pubPublish").addEventListener("click", publish); $("pubRefresh").addEventListener("click", refreshPublish); $("edPubChip").addEventListener("click", () => showView("publish"));
  document.addEventListener("visibilitychange", () => { if (!document.hidden) refreshPublish(); });

  /* ---------- init ---------- */
  function refreshAll() { fillDegreeControls(); renderCourseList(); renderDegreeList(); renderDashboard(); if (liveSnap !== undefined && $("edPubChip")) updateChipOnly(); }
  function updateChipOnly() { if (liveError && !liveSnap) setChip("Live site unreachable", "bad"); else if (!liveSnap) setChip("Not published yet", "warn"); else if (inSync()) setChip("● Live site in sync (v" + liveSnap.version + ")", "ok"); else setChip("● Unpublished changes", "warn"); if (!$("edPublish").hidden) renderPublish(); }
  fillLevels(); resetCourse(); resetDegree(); refreshAll(); showView("dashboard"); refreshPublish();
})();
