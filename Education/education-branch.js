/* RP Education page: courses by grade / college / university, Refane-locked courses, degrees, final exams.
 * Loads after the main script in education.html. Everything an employee publishes is read from Supabase. */
(() => {
  "use strict";
  const SB_URL = "https://nesxcgymsgegkqjhfydx.supabase.co", SB_KEY = "sb_publishable_Tj4frYyU-iAylsH_--y3Qg_esNYqce-";
  const CACHE_KEY = "rpEduPublicCache.v1", SESSION_KEY = "sb-nesxcgymsgegkqjhfydx-auth-token", PROGRESS_KEY = "rpEduCourseProgress.v1", POLL_MS = 60000;
  const EDITOR_ROLES = ["Creator", "Education Studio Director", "Education Employee"];
  const LEVELS = [...Array.from({ length: 12 }, (_, i) => "Grade " + (i + 1)), "College", "University"];
  const PREVIEW = new URLSearchParams(location.search).get("preview") === "local";
  const state = { snapshot: null, version: 0, offline: false, loaded: false, view: "", courseId: "", level: "all", enrolled: new Set(), degrees: new Map(), content: new Map(), balanceNote: "" };
  const arr = v => Array.isArray(v) ? v : [];
  const read = (k, f) => { try { const v = JSON.parse(localStorage.getItem(k) || "null"); return v == null ? f : v; } catch { return f; } };
  function el(tag, attrs = {}, ...kids) { const n = document.createElement(tag); Object.entries(attrs).forEach(([k, v]) => { if (k === "text") n.textContent = v; else if (k === "class") n.className = v; else n.setAttribute(k, v); }); kids.forEach(c => n.append(c)); return n; }
  const btn = (label, fn, cls) => { const b = el("button", { type: "button", text: label }); b.className = cls || "edu-btn"; b.addEventListener("click", fn); return b; };
  const priceOf = v => { const n = Number(v); return Number.isSafeInteger(n) && n > 0 ? n : 0; };
  const httpsUrl = v => { try { const u = new URL(String(v)); return u.protocol === "https:" ? u.href : ""; } catch { return ""; } };
  const ytFrom = v => { const m = String(v || "").match(/(?:v=|youtu\.be\/|embed\/|shorts\/|live\/)([\w-]{11})/); return m ? m[1] : /^[\w-]{11}$/.test(String(v || "").trim()) ? String(v).trim() : ""; };
  const ytId = v => /^[\w-]{11}$/.test(String(v || "")) ? String(v) : "";

  /* ---------- styles ---------- */
  document.head.append(el("style", { text: `
#eduBranchScreen nav{height:auto!important;min-height:60px;padding-top:8px!important;padding-bottom:8px!important}
.ec-bar{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin:0 0 16px}
.ec-bar select{background:var(--edu-card);color:var(--edu-text);border:1px solid var(--edu-border);padding:9px 12px;border-radius:8px}
.ec-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:14px}
.ec-card{background:var(--edu-card);border:1px solid var(--edu-border);border-radius:14px;padding:16px;cursor:pointer;display:flex;flex-direction:column;gap:6px;text-align:left;color:var(--edu-text);font:inherit}
.ec-card:hover,.ec-card:focus-visible{border-color:var(--edu-accent);outline:none}
.ec-card .em{font-size:30px}.ec-card h3{margin:0;font-size:17px}.ec-card p{margin:0;color:var(--edu-muted);font-size:13px}
.ec-tags{display:flex;gap:6px;flex-wrap:wrap}
.ec-tag{font-size:12px;padding:3px 9px;border-radius:20px;background:rgba(255,255,255,.07);color:var(--edu-muted)}
.ec-tag.paid{background:rgba(245,158,11,.15);color:var(--edu-gold)}.ec-tag.ok{background:rgba(34,197,94,.15);color:var(--edu-accent2)}.ec-tag.lock{background:rgba(248,113,113,.14);color:var(--edu-red)}
.ec-panel{background:var(--edu-card);border:1px solid var(--edu-border);border-radius:14px;padding:20px;margin:0 0 16px}
.ec-panel h2,.ec-panel h3{margin-top:0}
.ec-lock{border-color:rgba(245,158,11,.5)}
.ec-lessons{list-style:none;margin:0;padding:0;display:grid;gap:8px}
.ec-lessons button{width:100%;text-align:left;background:rgba(255,255,255,.04);border:1px solid var(--edu-border);color:var(--edu-text);padding:12px;border-radius:10px;cursor:pointer;font:inherit;display:flex;justify-content:space-between;gap:10px}
.ec-lessons button:disabled{opacity:.55;cursor:not-allowed}
.ec-video{position:relative;aspect-ratio:16/9;max-width:860px;background:#000;border-radius:12px;overflow:hidden;margin:0 0 14px}
.ec-video iframe{position:absolute;inset:0;width:100%;height:100%;border:0}
.ec-notes{white-space:pre-wrap;line-height:1.65}
.ec-res{display:flex;gap:8px;flex-wrap:wrap;margin:10px 0}
.ec-res a{color:var(--edu-accent2);border:1px solid var(--edu-border);padding:7px 12px;border-radius:8px;text-decoration:none}
.ec-msg{margin:10px 0;font-size:14px}.ec-msg.bad{color:var(--edu-red)}.ec-msg.ok{color:var(--edu-accent2)}
.ec-q{margin:0 0 14px;padding:12px;border:1px solid var(--edu-border);border-radius:10px}
.ec-q label{display:flex;gap:8px;padding:5px 0;cursor:pointer}
.ec-deg{display:flex;gap:12px;align-items:center}.ec-deg .em{font-size:34px}
.ec-banner{margin:0 0 14px;padding:9px 14px;border-radius:10px;background:rgba(245,158,11,.12);color:var(--edu-gold);font-size:13px}
.ec-empty{color:var(--edu-muted);padding:24px;text-align:center}
` }));

  /* ---------- content source ---------- */
  function previewSnapshot() {
    const degrees = arr(read("rpEduDegrees.v1", [])), res = a => arr(a).filter(r => r && httpsUrl(r.url)).map(r => ({ type: r.type === "link" ? "link" : "doc", label: String(r.label || r.url), url: httpsUrl(r.url) }));
    return { degrees, courses: arr(read("rpEduCourses.v1", [])).filter(c => c && c.status !== "draft" && c.title).map(c => ({ id: c.id, title: c.title, level: c.level, subject: c.subject, emoji: c.emoji, description: c.description, price: priceOf(c.price), passMark: Number(c.passMark) || 70, requires: arr(c.requires), degree: c.degree || "",
      lessons: arr(c.lessons).map(l => ({ id: l.id, title: l.title, video: ytFrom(l.video), notes: l.notes, preview: !!l.preview, resources: res(l.resources) })), resources: res(c.resources),
      exam: arr(c.exam).map(q => ({ q: q.q, options: arr(q.options).filter(o => String(o).trim()), answer: q.answer })).filter(q => q.q && q.options.length >= 2) })) };
  }
  const snap = () => PREVIEW ? previewSnapshot() : (state.snapshot || { degrees: [], courses: [] });
  const courses = () => arr(snap().courses), degrees = () => arr(snap().degrees);
  const degreeById = id => degrees().find(d => d.id === id);
  const courseById = id => courses().find(c => c.id === id);
  const isGated = c => !!c.gated || priceOf(c.price) > 0 || arr(c.requires).length > 0;
  const outline = c => arr(c.outline).length ? arr(c.outline) : arr(c.lessons).map(l => ({ id: l.id, title: l.title, preview: !!l.preview }));
  async function api(q) { const r = await fetch(SB_URL + "/rest/v1/rp_education_publications?" + q, { headers: { apikey: SB_KEY, Accept: "application/json" }, cache: "no-store" }); if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); }
  function saveCache() { try { localStorage.setItem(CACHE_KEY, JSON.stringify({ version: state.version, snapshot: state.snapshot })); } catch { /* full */ } }
  function loadCache() { const c = read(CACHE_KEY, null); if (c && c.snapshot && typeof c.snapshot === "object") { state.snapshot = c.snapshot; state.version = Number(c.version) || 0; } }
  async function syncLive(force) {
    if (PREVIEW) return;
    try {
      const head = await api("select=version&order=version.desc&limit=1"); state.offline = false;
      const latest = head.length ? Number(head[0].version) : 0;
      if (!force && state.loaded && latest === state.version) return;
      if (!latest) { state.snapshot = null; state.version = 0; }
      else { const rows = await api("select=version,snapshot&version=eq." + latest + "&limit=1"); if (rows.length && rows[0].snapshot && typeof rows[0].snapshot === "object") { state.snapshot = rows[0].snapshot; state.version = Number(rows[0].version); saveCache(); } }
      state.loaded = true; rerender();
    } catch { state.offline = true; state.loaded = true; rerender(); }
  }

  /* ---------- account ---------- */
  function auth() {
    let s = null; try { s = JSON.parse(localStorage.getItem(SESSION_KEY) || "null"); } catch { return { state: "out" }; }
    const token = s && typeof s.access_token === "string" ? s.access_token : ""; if (!token) return { state: "out" };
    if (Number(s.expires_at) * 1000 < Date.now()) return { state: "expired" }; return { state: "in", token };
  }
  async function rpc(name, body, token) {
    const r = await fetch(SB_URL + "/rest/v1/rpc/" + name, { method: "POST", headers: { apikey: SB_KEY, Authorization: "Bearer " + token, "Content-Type": "application/json" }, body: JSON.stringify(body || {}) });
    let data = null; try { data = await r.json(); } catch { /* none */ }
    if (!r.ok) throw new Error((data && (data.message || data.error)) || "HTTP " + r.status); return data;
  }
  async function getRows(table, cols) {
    const a = auth(); if (a.state !== "in") return null;
    const r = await fetch(SB_URL + "/rest/v1/" + table + "?select=" + cols, { headers: { apikey: SB_KEY, Authorization: "Bearer " + a.token, Accept: "application/json" }, cache: "no-store" });
    return r.ok ? r.json() : null;
  }
  async function loadMine() {
    if (PREVIEW) return;
    const en = await getRows("rp_education_enrollments", "course_id"), dg = await getRows("rp_education_degrees", "degree_id,course_id,score,earned_at");
    state.enrolled = new Set(arr(en).map(r => r.course_id)); state.degrees = new Map(arr(dg).map(r => [r.degree_id, r]));
  }
  const friendly = e => { const t = (e && e.message) || String(e); if (/Not enough Refane/i.test(t)) return t.replace(/^.*?(Not enough Refane)/i, "$1") + "."; if (/rp_unlock_education|rp_get_education|rp_submit_education|schema cache/i.test(t)) return "Courses are not set up yet. Ask an employee to run education-content.sql."; if (/JWT|expired/i.test(t)) return "Your sign-in expired. Open the main page to sign in again."; return t; };
  const ownsDegree = id => PREVIEW || state.degrees.has(id);
  const canOpen = c => PREVIEW || !isGated(c) || state.enrolled.has(c.id);
  const missingDegrees = c => arr(c.requires).filter(id => !ownsDegree(id));

  /* ---------- progress (local only) ---------- */
  const progress = () => read(PROGRESS_KEY, {});
  function markDone(cid, lid) { const p = progress(); p[cid] = p[cid] || {}; p[cid][lid] = true; try { localStorage.setItem(PROGRESS_KEY, JSON.stringify(p)); } catch { /* full */ } }

  /* ---------- views ---------- */
  const main = () => document.getElementById("eduMain"), hero = () => document.getElementById("eduHeroWrap");
  function setNav(id) { document.querySelectorAll(".edu-nav-btn").forEach(b => b.classList.toggle("active", b.id === id)); }
  function shell() {
    hero().style.display = "none"; const m = main(); m.replaceChildren();
    if (PREVIEW) m.append(el("div", { class: "ec-banner", text: "Preview: showing your local drafts, with every course unlocked." }));
    else if (state.offline) m.append(el("div", { class: "ec-banner", text: state.snapshot ? "You are offline. Showing the last version saved on this device." : "Could not reach the course library. Check your connection." }));
    return m;
  }
  const tag = (t, c) => el("span", { class: "ec-tag" + (c ? " " + c : ""), text: t });
  function courseCard(c) {
    const gated = isGated(c), open = canOpen(c), card = el("button", { type: "button", class: "ec-card" });
    const tags = el("div", { class: "ec-tags" }, tag(c.level), c.subject ? tag(c.subject) : "");
    if (priceOf(c.price) > 0 && !open) tags.append(tag(priceOf(c.price) + " Refane", "paid")); else if (gated && open) tags.append(tag("Unlocked", "ok")); else if (!gated) tags.append(tag("Free", "ok"));
    if (arr(c.requires).length && !open) tags.append(tag("Needs degree", "lock"));
    if (c.degree) { const d = degreeById(c.degree); if (d) tags.append(tag((ownsDegree(d.id) ? "✓ " : "") + (d.emoji || "📜") + " " + d.name)); }
    card.append(el("span", { class: "em", text: String(c.emoji || "📘") }), el("h3", { text: c.title }), el("p", { text: (c.description || "").slice(0, 140) }), tags, el("p", { text: outline(c).length + " lessons" + (c.examCount || arr(c.exam).length ? " · final exam" : "") }));
    card.addEventListener("click", () => goCourse(c.id)); return card;
  }
  function goCourses() {
    state.view = "courses"; setNav("eduNavCourses"); const m = shell();
    const sel = el("select", { "aria-label": "Level" }, el("option", { value: "all", text: "All levels" }));
    const present = new Set(courses().map(c => c.level)); LEVELS.filter(l => present.has(l)).forEach(l => sel.append(el("option", { value: l, text: l }))); if (!present.has(state.level)) state.level = "all"; sel.value = state.level;
    const q = el("input", { type: "search", placeholder: "Search courses…", "aria-label": "Search", class: "ec-search" }); q.style.cssText = "background:var(--edu-card);color:var(--edu-text);border:1px solid var(--edu-border);padding:9px 12px;border-radius:8px;min-width:200px";
    const grid = el("div", { class: "ec-grid" });
    const draw = () => { grid.replaceChildren(); const t = q.value.trim().toLowerCase(), list = courses().filter(c => (state.level === "all" || c.level === state.level) && (!t || (c.title + " " + (c.subject || "") + " " + (c.description || "")).toLowerCase().includes(t))); if (!list.length) grid.append(el("div", { class: "ec-empty", text: state.loaded || PREVIEW ? "No courses here yet." : "Loading courses…" })); list.forEach(c => grid.append(courseCard(c))); };
    sel.addEventListener("change", () => { state.level = sel.value; draw(); }); q.addEventListener("input", draw);
    m.append(el("h2", { text: "🎓 Courses" }), el("div", { class: "ec-bar" }, sel, q), grid); draw();
  }
  function goDegrees() {
    state.view = "degrees"; setNav("eduNavDegrees"); const m = shell(); m.append(el("h2", { text: "📜 My Degrees" }));
    if (!PREVIEW && auth().state !== "in") { m.append(el("div", { class: "ec-panel" }, "Sign in on the main page to earn and keep degrees. ", el("a", { href: "../index/index.html", text: "Open main page", style: "color:var(--edu-accent2)" }))); }
    const grid = el("div", { class: "ec-grid" });
    degrees().forEach(d => {
      const mine = state.degrees.get(d.id), by = courses().filter(c => c.degree === d.id), unlocks = courses().filter(c => arr(c.requires).includes(d.id));
      const card = el("div", { class: "ec-panel" }, el("div", { class: "ec-deg" }, el("span", { class: "em", text: d.emoji || "📜" }), el("div", {}, el("strong", { text: d.name }), el("div", { class: "ec-tags" }, tag(d.level), mine ? tag("Earned · " + mine.score + "%", "ok") : tag("Not earned yet", "lock")))), el("p", { class: "ec-msg", text: d.description || "" }));
      if (by.length) card.append(el("p", { class: "ec-msg", text: "Earn it by passing: " + by.map(c => c.title).join(", ") }));
      if (unlocks.length) card.append(el("p", { class: "ec-msg", text: "Unlocks: " + unlocks.map(c => c.title).join(", ") }));
      grid.append(card);
    });
    if (!degrees().length) grid.append(el("div", { class: "ec-empty", text: "No degrees available yet." })); m.append(grid);
  }
  async function goCourse(id) {
    state.view = "course"; state.courseId = id; setNav("eduNavCourses"); const m = shell(), c = courseById(id);
    if (!c) { m.append(el("div", { class: "ec-empty", text: "That course is not available." }), btn("← All courses", goCourses)); return; }
    m.append(btn("← All courses", goCourses, "edu-btn"), el("h2", { text: (c.emoji || "📘") + " " + c.title }), el("div", { class: "ec-tags" }, tag(c.level), c.subject ? tag(c.subject) : "", c.degree && degreeById(c.degree) ? tag("Awards " + degreeById(c.degree).emoji + " " + degreeById(c.degree).name) : ""), el("p", { text: c.description || "" }));
    const body = el("div"); m.append(body);
    if (canOpen(c)) return openCourse(c, body);
    lockedCourse(c, body);
  }
  function lockedCourse(c, body) {
    const a = auth(), missing = missingDegrees(c), price = priceOf(c.price), box = el("div", { class: "ec-panel ec-lock" }, el("h3", { text: "🔒 This course is locked" }));
    if (missing.length) box.append(el("p", { text: "You need these degrees first: " + missing.map(id => { const d = degreeById(id); return d ? d.emoji + " " + d.name : "a removed degree"; }).join(", ") + "." }));
    if (price) box.append(el("p", { text: "Unlock price: " + price + " Refane (one time, permanent for your account)." }));
    const msg = el("p", { class: "ec-msg" });
    if (a.state !== "in") { box.append(el("p", { text: a.state === "expired" ? "Your sign-in expired." : "Sign in on the main page to unlock courses." }), el("a", { href: "../index/index.html", text: "Open main page", style: "color:var(--edu-accent2)" })); }
    else if (missing.length) box.append(el("p", { class: "ec-msg", text: "Earn the missing degree(s) first, then come back." }));
    else box.append(btn("Unlock for " + price + " Refane", async function () {
      if (!confirm(price ? "Pay " + price + " Refane to unlock “" + c.title + "”?" : "Enroll in “" + c.title + "”?")) return; this.disabled = true; msg.textContent = "Unlocking…"; msg.className = "ec-msg";
      try { const r = await rpc("rp_unlock_education_course", { p_course_id: c.id }, a.token); state.enrolled.add(c.id); state.content.delete(c.id); if (state.courseId === c.id && state.view === "course") { await goCourse(c.id); const t = el("div", { class: "ec-msg ok", text: r && r.charged ? "Unlocked for " + r.charged + " Refane. Balance: " + r.balance + "." : "Unlocked." }); main().insertBefore(t, main().children[1] || null); } }
      catch (e) { this.disabled = false; msg.textContent = friendly(e); msg.className = "ec-msg bad"; }
    }));
    box.append(msg); body.append(box);
    const prev = arr(c.previewLessons); const ol = outline(c);
    body.append(el("div", { class: "ec-panel" }, el("h3", { text: "Course outline" }), el("ul", { class: "ec-lessons" }, ...ol.map((l, i) => { const p = prev.find(x => x.id === l.id); const b = el("button", { type: "button" }, el("span", { text: (i + 1) + ". " + l.title }), el("span", { class: "ec-tag " + (p ? "ok" : "lock"), text: p ? "Free preview" : "🔒" })); b.disabled = !p; if (p) b.addEventListener("click", () => showLesson(c, p, body)); return el("li", {}, b); }))));
    body.append(el("div", { id: "ecLesson" }));
  }
  async function openCourse(c, body) {
    let data = null;
    if (!isGated(c) || PREVIEW) data = { lessons: arr(c.lessons), resources: arr(c.resources), exam: arr(c.exam) };
    else {
      data = state.content.get(c.id); const a = auth();
      if (!data) { if (a.state !== "in") { body.append(el("div", { class: "ec-panel ec-lock" }, "Sign in on the main page to open your course.")); return; } body.append(el("div", { class: "ec-msg", text: "Loading course…" })); try { data = await rpc("rp_get_education_course", { p_course_id: c.id }, a.token); state.content.set(c.id, data); } catch (e) { body.replaceChildren(el("div", { class: "ec-panel ec-lock", text: friendly(e) })); return; } if (state.courseId !== c.id) return; body.replaceChildren(); }
    }
    const done = progress()[c.id] || {}, lessons = arr(data.lessons);
    body.append(el("div", { class: "ec-panel" }, el("h3", { text: "Lessons (" + lessons.filter(l => done[l.id]).length + "/" + lessons.length + " done)" }), lessons.length ? el("ul", { class: "ec-lessons" }, ...lessons.map((l, i) => { const b = el("button", { type: "button" }, el("span", { text: (i + 1) + ". " + l.title }), el("span", { class: "ec-tag" + (done[l.id] ? " ok" : ""), text: done[l.id] ? "✔ Done" : "Open" })); b.addEventListener("click", () => showLesson(c, l, body, data)); return el("li", {}, b); })) : el("p", { class: "ec-msg", text: "No lessons yet." })));
    body.append(el("div", { id: "ecLesson" }));
    if (arr(data.resources).length) body.append(el("div", { class: "ec-panel" }, el("h3", { text: "📎 Course materials" }), resLinks(data.resources)));
    if (arr(data.exam).length) body.append(examPanel(c, data.exam));
  }
  function resLinks(list) { const w = el("div", { class: "ec-res" }); arr(list).forEach(r => { const u = httpsUrl(r.url); if (u) w.append(el("a", { href: u, target: "_blank", rel: "noopener noreferrer", text: (r.type === "link" ? "🔗 " : "📄 ") + (r.label || u) })); }); return w; }
  function showLesson(c, l, body, data) {
    const box = document.getElementById("ecLesson") || body.appendChild(el("div", { id: "ecLesson" })); box.replaceChildren();
    const p = el("div", { class: "ec-panel" }, el("h3", { text: l.title }));
    if (ytId(l.video)) p.append(el("div", { class: "ec-video" }, el("iframe", { src: "https://www.youtube-nocookie.com/embed/" + ytId(l.video), title: l.title, allow: "accelerometer; encrypted-media; gyroscope; picture-in-picture", allowfullscreen: "", referrerpolicy: "strict-origin-when-cross-origin", loading: "lazy" })));
    if (l.notes) p.append(el("div", { class: "ec-notes", text: l.notes })); if (arr(l.resources).length) p.append(resLinks(l.resources));
    if (data) p.append(btn("Mark lesson as done", function () { markDone(c.id, l.id); this.textContent = "✔ Done"; this.disabled = true; }));
    box.append(p); p.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
  function examPanel(c, exam) {
    const box = el("div", { class: "ec-panel" }, el("h3", { text: "📝 Final exam" }), el("p", { class: "ec-msg", text: "Pass mark " + (c.passMark || 70) + "%." + (c.degree && degreeById(c.degree) ? " Passing awards " + degreeById(c.degree).emoji + " " + degreeById(c.degree).name + "." : "") }));
    const form = el("form"), msg = el("p", { class: "ec-msg" });
    exam.forEach((q, qi) => { const w = el("fieldset", { class: "ec-q" }, el("legend", { text: (qi + 1) + ". " + q.q })); q.options.forEach((o, oi) => { const r = el("input", { type: "radio", name: "q" + qi, value: String(oi) }); w.append(el("label", {}, r, el("span", { text: o }))); }); form.append(w); });
    const submit = el("button", { type: "submit", class: "edu-btn", text: "Submit exam" }); form.append(submit, msg);
    form.addEventListener("submit", async e => {
      e.preventDefault(); const answers = exam.map((_, qi) => { const x = form.querySelector('input[name="q' + qi + '"]:checked'); return x ? Number(x.value) : -1; });
      if (answers.includes(-1)) { msg.textContent = "Answer every question."; msg.className = "ec-msg bad"; return; }
      if (PREVIEW) { const right = answers.filter((a, i) => a === exam[i].answer).length, score = Math.round(100 * right / exam.length); msg.textContent = "Preview score: " + score + "% (" + right + "/" + exam.length + ")."; msg.className = "ec-msg ok"; return; }
      const a = auth(); if (a.state !== "in") { msg.textContent = "Sign in on the main page to take the exam."; msg.className = "ec-msg bad"; return; }
      submit.disabled = true; msg.textContent = "Grading…"; msg.className = "ec-msg";
      try { const r = await rpc("rp_submit_education_exam", { p_course_id: c.id, p_answers: answers }, a.token); msg.className = "ec-msg " + (r.passed ? "ok" : "bad");
        msg.textContent = (r.passed ? "🎉 Passed! " : "Not passed. ") + "Score " + r.score + "% (" + r.correct + "/" + r.total + ", pass mark " + r.passMark + "%)." + (r.degree ? " You earned the degree: " + r.degree + "." : ""); if (r.degree) await loadMine(); }
      catch (err) { msg.textContent = friendly(err); msg.className = "ec-msg bad"; } submit.disabled = false;
    });
    box.append(form); return box;
  }
  function rerender() { if (state.view === "courses") goCourses(); else if (state.view === "degrees") goDegrees(); else if (state.view === "course" && !document.querySelector("#eduMain form")) goCourse(state.courseId); }

  /* ---------- nav hook ---------- */
  const nav = document.querySelector("#eduBranchScreen nav"), pts = nav.querySelector(".edu-points");
  const bCourses = el("button", { class: "edu-nav-btn", id: "eduNavCourses", text: "Courses" }), bDeg = el("button", { class: "edu-nav-btn", id: "eduNavDegrees", text: "My Degrees" });
  bCourses.addEventListener("click", goCourses); bDeg.addEventListener("click", async () => { await loadMine(); goDegrees(); });
  nav.insertBefore(bCourses, document.getElementById("eduNavHome")); nav.insertBefore(bDeg, document.getElementById("eduNavHome"));
  const link = el("a", { class: "edu-nav-btn", id: "eduEmployeeLink", href: "education-employee.html", text: "🎓 Employee workspace" }); link.style.cssText = "display:none;text-decoration:none"; nav.insertBefore(link, pts);
  async function employeeLink() {
    if (PREVIEW) { link.style.display = ""; return; } const a = auth(); if (a.state !== "in") return;
    try { const x = await rpc("rp_get_account_context", {}, a.token), roles = Array.isArray(x.roles) ? x.roles : []; if (x.status === "active" && roles.some(r => EDITOR_ROLES.includes(r))) link.style.display = ""; } catch { /* ignore */ }
  }
  ["eduNavHome", "eduNavSubjects", "eduNavProgress"].forEach(id => document.getElementById(id).addEventListener("click", () => { state.view = ""; }, true));

  if (!PREVIEW) { loadCache(); state.loaded = !!state.snapshot; }
  const start = () => goCourses();
  if (document.readyState === "loading") window.addEventListener("DOMContentLoaded", start); else start();
  employeeLink(); loadMine().then(rerender); syncLive(true);
  if (!PREVIEW) { setInterval(() => { if (!document.hidden) syncLive(false); }, POLL_MS); window.addEventListener("online", () => syncLive(false)); }
  document.addEventListener("visibilitychange", () => { if (!document.hidden && !PREVIEW) { syncLive(false); loadMine(); } });
  window.addEventListener("storage", () => { if (PREVIEW) rerender(); });
})();
