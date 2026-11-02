/* RP Skills page: published skills and courses. A skill can require Education degrees; courses can also cost Refane. No grades, no exams. */
(() => {
  "use strict";
  const SB_URL = "https://nesxcgymsgegkqjhfydx.supabase.co", SB_KEY = "sb_publishable_Tj4frYyU-iAylsH_--y3Qg_esNYqce-";
  const CACHE_KEY = "rpSkillsPublicCache.v1", SESSION_KEY = "sb-nesxcgymsgegkqjhfydx-auth-token", PROGRESS_KEY = "rpSkillsCourseProgress.v1", POLL_MS = 60000;
  const EDITOR_ROLES = ["Creator", "Skills Studio Director", "Skills Employee"];
  const PREVIEW = new URLSearchParams(location.search).get("preview") === "local";
  const state = { snapshot: null, version: 0, offline: false, loaded: false, skill: "", course: "", enrolled: new Set(), myDegrees: new Set(), content: new Map(), view: "skills" };
  const arr = v => Array.isArray(v) ? v : [];
  const read = (k, f) => { try { const v = JSON.parse(localStorage.getItem(k) || "null"); return v == null ? f : v; } catch { return f; } };
  function el(tag, attrs = {}, ...kids) { const n = document.createElement(tag); Object.entries(attrs).forEach(([k, v]) => { if (k === "text") n.textContent = v; else if (k === "class") n.className = v; else n.setAttribute(k, v); }); kids.forEach(c => n.append(c)); return n; }
  const btn = (label, fn, cls) => { const b = el("button", { type: "button", text: label }); b.className = cls || "btn"; b.addEventListener("click", fn); return b; };
  const priceOf = v => { const n = Number(v); return Number.isSafeInteger(n) && n > 0 ? n : 0; };
  const httpsUrl = v => { try { const u = new URL(String(v)); return u.protocol === "https:" ? u.href : ""; } catch { return ""; } };
  const ytFrom = v => { const m = String(v || "").match(/(?:v=|youtu\.be\/|embed\/|shorts\/|live\/)([\w-]{11})/); return m ? m[1] : /^[\w-]{11}$/.test(String(v || "").trim()) ? String(v).trim() : ""; };
  const ytId = v => /^[\w-]{11}$/.test(String(v || "")) ? String(v) : "";

  document.head.append(el("style", { text: `
.sk-wrap{margin:0 0 28px}.sk-wrap h2{margin:0 0 12px}
.sk-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:14px}
.sk-card{background:var(--panel);border:1px solid var(--border);border-radius:12px;padding:16px;cursor:pointer;display:flex;flex-direction:column;gap:6px;text-align:left;color:var(--text);font:inherit}
.sk-card:hover,.sk-card:focus-visible{border-color:var(--cyan);outline:none}.sk-card .em{font-size:30px}.sk-card h3{margin:0;font-size:17px}.sk-card p{margin:0;color:var(--muted);font-size:13px}
.sk-tags{display:flex;gap:6px;flex-wrap:wrap}.sk-tag{font-size:12px;padding:3px 9px;border-radius:20px;background:rgba(255,255,255,.07);color:var(--muted)}
.sk-tag.paid{background:rgba(251,191,36,.15);color:#fcd34d}.sk-tag.ok{background:rgba(52,211,153,.15);color:var(--green)}.sk-tag.lock{background:rgba(248,113,113,.14);color:#f87171}
.sk-panel{background:var(--panel);border:1px solid var(--border);border-radius:12px;padding:20px;margin:0 0 14px}.sk-panel h3{margin-top:0}.sk-lock{border-color:rgba(251,191,36,.5)}
.sk-lessons{list-style:none;margin:0;padding:0;display:grid;gap:8px}
.sk-lessons button{width:100%;text-align:left;background:rgba(255,255,255,.04);border:1px solid var(--border);color:var(--text);padding:12px;border-radius:10px;cursor:pointer;font:inherit;display:flex;justify-content:space-between;gap:10px}
.sk-lessons button:disabled{opacity:.55;cursor:not-allowed}
.sk-video{position:relative;aspect-ratio:16/9;max-width:860px;background:#000;border-radius:12px;overflow:hidden;margin:0 0 14px}.sk-video iframe{position:absolute;inset:0;width:100%;height:100%;border:0}
.sk-notes{white-space:pre-wrap;line-height:1.65}.sk-res{display:flex;gap:8px;flex-wrap:wrap;margin:10px 0}.sk-res a{color:var(--cyan);border:1px solid var(--border);padding:7px 12px;border-radius:8px;text-decoration:none}
.sk-msg{margin:10px 0;font-size:14px}.sk-msg.bad{color:#f87171}.sk-msg.ok{color:var(--green)}.sk-banner{margin:0 0 14px;padding:9px 14px;border-radius:10px;background:rgba(251,191,36,.12);color:#fcd34d;font-size:13px}.sk-empty{color:var(--muted);padding:24px;text-align:center}
` }));

  /* ---------- content ---------- */
  function previewSnapshot() {
    const res = a => arr(a).filter(r => r && httpsUrl(r.url)).map(r => ({ type: r.type === "link" ? "link" : "doc", label: String(r.label || r.url), url: httpsUrl(r.url) })), skills = arr(read("rpSkillSkills.v1", []));
    return { skills, degrees: arr(read("rpSkillDegreeCache.v1", [])), courses: arr(read("rpSkillCourses.v1", [])).filter(c => c && c.status !== "draft" && c.title && skills.some(s => s.id === c.skill)).map(c => ({ id: c.id, title: c.title, skill: c.skill, emoji: c.emoji, description: c.description, price: priceOf(c.price), requires: arr(c.requires),
      lessons: arr(c.lessons).map(l => ({ id: l.id, title: l.title, video: ytFrom(l.video), notes: l.notes, preview: !!l.preview, resources: res(l.resources) })), resources: res(c.resources) })) };
  }
  const snap = () => PREVIEW ? previewSnapshot() : (state.snapshot || { skills: [], courses: [], degrees: [] });
  const skills = () => arr(snap().skills), courses = () => arr(snap().courses), skillById = id => skills().find(s => s.id === id), courseById = id => courses().find(c => c.id === id);
  const degName = id => { const d = arr(snap().degrees).find(x => x.id === id); return d ? (d.emoji || "📜") + " " + d.name : "a degree"; };
  const needs = c => { const s = skillById(c.skill); return [...new Set([...arr(s && s.requires), ...arr(c.requires)])]; };
  const gated = c => priceOf(c.price) > 0 || needs(c).length > 0 || !!c.gated;
  const outline = c => arr(c.outline).length ? arr(c.outline) : arr(c.lessons).map(l => ({ id: l.id, title: l.title, preview: !!l.preview }));
  const missing = c => needs(c).filter(id => !PREVIEW && !state.myDegrees.has(id));
  const canOpen = c => PREVIEW || !gated(c) || state.enrolled.has(c.id);
  async function api(q) { const r = await fetch(SB_URL + "/rest/v1/rp_skills_publications?" + q, { headers: { apikey: SB_KEY, Accept: "application/json" }, cache: "no-store" }); if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); }
  function saveCache() { try { localStorage.setItem(CACHE_KEY, JSON.stringify({ version: state.version, snapshot: state.snapshot })); } catch { /* full */ } }
  function loadCache() { const c = read(CACHE_KEY, null); if (c && c.snapshot && typeof c.snapshot === "object") { state.snapshot = c.snapshot; state.version = Number(c.version) || 0; } }
  async function syncLive(force) {
    if (PREVIEW) return;
    try {
      const head = await api("select=version&order=version.desc&limit=1"); state.offline = false; const latest = head.length ? Number(head[0].version) : 0;
      if (!force && state.loaded && latest === state.version) return;
      if (!latest) { state.snapshot = null; state.version = 0; } else { const rows = await api("select=version,snapshot&version=eq." + latest + "&limit=1"); if (rows.length && rows[0].snapshot && typeof rows[0].snapshot === "object") { state.snapshot = rows[0].snapshot; state.version = Number(rows[0].version); saveCache(); } }
      state.loaded = true; rerender();
    } catch { state.offline = true; state.loaded = true; rerender(); }
  }

  /* ---------- account ---------- */
  function auth() { let s = null; try { s = JSON.parse(localStorage.getItem(SESSION_KEY) || "null"); } catch { return { state: "out" }; } const token = s && typeof s.access_token === "string" ? s.access_token : ""; if (!token) return { state: "out" }; if (Number(s.expires_at) * 1000 < Date.now()) return { state: "expired" }; return { state: "in", token }; }
  async function rpc(name, body, token) {
    const r = await fetch(SB_URL + "/rest/v1/rpc/" + name, { method: "POST", headers: { apikey: SB_KEY, Authorization: "Bearer " + token, "Content-Type": "application/json" }, body: JSON.stringify(body || {}) });
    let data = null; try { data = await r.json(); } catch { /* none */ } if (!r.ok) throw new Error((data && (data.message || data.error)) || "HTTP " + r.status); return data;
  }
  async function getRows(table, cols) { const a = auth(); if (a.state !== "in") return null; const r = await fetch(SB_URL + "/rest/v1/" + table + "?select=" + cols, { headers: { apikey: SB_KEY, Authorization: "Bearer " + a.token, Accept: "application/json" }, cache: "no-store" }); return r.ok ? r.json() : null; }
  async function loadMine() { if (PREVIEW) return; state.enrolled = new Set(arr(await getRows("rp_skills_enrollments", "course_id")).map(r => r.course_id)); state.myDegrees = new Set(arr(await getRows("rp_education_degrees", "degree_id")).map(r => r.degree_id)); }
  const friendly = e => { const t = (e && e.message) || String(e); if (/Not enough Refane/i.test(t)) return t.replace(/^.*?(Not enough Refane)/i, "$1") + "."; if (/rp_unlock_skills|rp_get_skills|schema cache/i.test(t)) return "Skills are not set up yet. Ask an employee to run skills-content.sql."; if (/JWT|expired/i.test(t)) return "Your sign-in expired. Open the main page to sign in again."; return t; };
  const progress = () => read(PROGRESS_KEY, {});
  function markDone(cid, lid) { const p = progress(); p[cid] = p[cid] || {}; p[cid][lid] = true; try { localStorage.setItem(PROGRESS_KEY, JSON.stringify(p)); } catch { /* full */ } }

  /* ---------- views ---------- */
  const host = el("div", { class: "sk-wrap", id: "skPublished" });
  document.querySelector("main").insertBefore(host, document.querySelector("main .summary"));
  const tag = (t, c) => el("span", { class: "sk-tag" + (c ? " " + c : ""), text: t });
  function top() { host.replaceChildren(); if (PREVIEW) host.append(el("div", { class: "sk-banner", text: "Preview: showing your local drafts, with every course unlocked." })); else if (state.offline) host.append(el("div", { class: "sk-banner", text: state.snapshot ? "You are offline. Showing the last version saved on this device." : "Could not reach the skills library. Check your connection." })); }
  function skillsView() {
    state.view = "skills"; top(); host.append(el("h2", { text: "🛠️ Skills" })); const grid = el("div", { class: "sk-grid" });
    skills().forEach(s => { const n = courses().filter(c => c.skill === s.id).length, req = arr(s.requires), tags = el("div", { class: "sk-tags" }, tag(n + " course" + (n === 1 ? "" : "s")));
      if (req.length) { const miss = req.filter(id => !PREVIEW && !state.myDegrees.has(id)); tags.append(tag(miss.length ? "Needs: " + miss.map(degName).join(", ") : "✓ Degree held", miss.length ? "lock" : "ok")); }
      const c = el("button", { type: "button", class: "sk-card" }, el("span", { class: "em", text: s.emoji || "🛠️" }), el("h3", { text: s.name }), el("p", { text: s.description || "" }), tags); c.addEventListener("click", () => skillView(s.id)); grid.append(c); });
    if (!skills().length) grid.append(el("div", { class: "sk-empty", text: state.loaded || PREVIEW ? "No skills published yet." : "Loading skills…" })); host.append(grid);
  }
  function skillView(id) {
    state.view = "skill"; state.skill = id; const s = skillById(id); top(); if (!s) { host.append(el("div", { class: "sk-empty", text: "That skill is not available." }), btn("← All skills", skillsView)); return; }
    host.append(btn("← All skills", skillsView), el("h2", { text: (s.emoji || "🛠️") + " " + s.name }), el("p", { text: s.description || "" }));
    const req = arr(s.requires); if (req.length) host.append(el("p", { class: "sk-msg" + (req.every(x => PREVIEW || state.myDegrees.has(x)) ? " ok" : ""), text: "Degrees for this skill: " + req.map(x => ((PREVIEW || state.myDegrees.has(x)) ? "✓ " : "") + degName(x)).join(", ") }));
    const grid = el("div", { class: "sk-grid" });
    courses().filter(c => c.skill === id).forEach(c => { const open = canOpen(c), tags = el("div", { class: "sk-tags" }); if (priceOf(c.price) > 0 && !open) tags.append(tag(priceOf(c.price) + " Refane", "paid")); else if (gated(c) && open) tags.append(tag("Unlocked", "ok")); else if (!gated(c)) tags.append(tag("Free", "ok")); if (missing(c).length && !open) tags.append(tag("Needs degree", "lock"));
      const card = el("button", { type: "button", class: "sk-card" }, el("span", { class: "em", text: c.emoji || "🛠️" }), el("h3", { text: c.title }), el("p", { text: (c.description || "").slice(0, 140) }), tags, el("p", { text: outline(c).length + " lessons" })); card.addEventListener("click", () => courseView(c.id)); grid.append(card); });
    if (!grid.children.length) grid.append(el("div", { class: "sk-empty", text: "No courses in this skill yet." })); host.append(grid);
  }
  async function courseView(id) {
    state.view = "course"; state.course = id; top(); const c = courseById(id); if (!c) { host.append(el("div", { class: "sk-empty", text: "That course is not available." }), btn("← All skills", skillsView)); return; }
    host.append(btn("← " + ((skillById(c.skill) || {}).name || "Skill"), () => skillView(c.skill)), el("h2", { text: (c.emoji || "🛠️") + " " + c.title }), el("p", { text: c.description || "" })); const body = el("div"); host.append(body);
    if (canOpen(c)) return openCourse(c, body); lockedCourse(c, body);
  }
  function lockedCourse(c, body) {
    const a = auth(), miss = missing(c), price = priceOf(c.price), box = el("div", { class: "sk-panel sk-lock" }, el("h3", { text: "🔒 This course is locked" }));
    if (needs(c).length) box.append(el("p", { text: "Degrees required: " + needs(c).map(x => ((state.myDegrees.has(x)) ? "✓ " : "") + degName(x)).join(", ") + "." }));
    if (price) box.append(el("p", { text: "Unlock price: " + price + " Refane (one time, permanent for your account)." }));
    const msg = el("p", { class: "sk-msg" });
    if (a.state !== "in") box.append(el("p", { text: a.state === "expired" ? "Your sign-in expired." : "Sign in on the main page to unlock courses." }), el("a", { href: "../index/index.html", text: "Open main page", style: "color:var(--cyan)" }));
    else if (miss.length) box.append(el("p", { class: "sk-msg", text: "Earn " + miss.map(degName).join(", ") + " in Education first, then come back." }), el("a", { href: "../Education/education.html", text: "Open Education", style: "color:var(--cyan)" }));
    else box.append(btn(price ? "Unlock for " + price + " Refane" : "Enroll for free", async function () {
      if (!confirm(price ? "Pay " + price + " Refane to unlock “" + c.title + "”?" : "Enroll in “" + c.title + "”?")) return; this.disabled = true; msg.textContent = "Unlocking…"; msg.className = "sk-msg";
      try { const r = await rpc("rp_unlock_skills_course", { p_course_id: c.id }, a.token); state.enrolled.add(c.id); state.content.delete(c.id); if (state.course === c.id && state.view === "course") { await courseView(c.id); host.insertBefore(el("div", { class: "sk-msg ok", text: r && r.charged ? "Unlocked for " + r.charged + " Refane. Balance: " + r.balance + "." : "Unlocked." }), host.children[2] || null); } }
      catch (e) { this.disabled = false; msg.textContent = friendly(e); msg.className = "sk-msg bad"; }
    }));
    box.append(msg); body.append(box);
    const prev = arr(c.previewLessons);
    body.append(el("div", { class: "sk-panel" }, el("h3", { text: "Course outline" }), el("ul", { class: "sk-lessons" }, ...outline(c).map((l, i) => { const p = prev.find(x => x.id === l.id), b = el("button", { type: "button" }, el("span", { text: (i + 1) + ". " + l.title }), el("span", { class: "sk-tag " + (p ? "ok" : "lock"), text: p ? "Free preview" : "🔒" })); b.disabled = !p; if (p) b.addEventListener("click", () => showLesson(c, p, body)); return el("li", {}, b); }))), el("div", { id: "skLesson" }));
  }
  async function openCourse(c, body) {
    let data;
    if (!gated(c) || PREVIEW) data = { lessons: arr(c.lessons), resources: arr(c.resources) };
    else { data = state.content.get(c.id); const a = auth();
      if (!data) { if (a.state !== "in") { body.append(el("div", { class: "sk-panel sk-lock", text: "Sign in on the main page to open your course." })); return; } body.append(el("div", { class: "sk-msg", text: "Loading course…" })); try { data = await rpc("rp_get_skills_course", { p_course_id: c.id }, a.token); state.content.set(c.id, data); } catch (e) { body.replaceChildren(el("div", { class: "sk-panel sk-lock", text: friendly(e) })); return; } if (state.course !== c.id) return; body.replaceChildren(); } }
    const done = progress()[c.id] || {}, lessons = arr(data.lessons);
    body.append(el("div", { class: "sk-panel" }, el("h3", { text: "Lessons (" + lessons.filter(l => done[l.id]).length + "/" + lessons.length + " done)" }), lessons.length ? el("ul", { class: "sk-lessons" }, ...lessons.map((l, i) => { const b = el("button", { type: "button" }, el("span", { text: (i + 1) + ". " + l.title }), el("span", { class: "sk-tag" + (done[l.id] ? " ok" : ""), text: done[l.id] ? "✔ Done" : "Open" })); b.addEventListener("click", () => showLesson(c, l, body, true)); return el("li", {}, b); })) : el("p", { class: "sk-msg", text: "No lessons yet." })), el("div", { id: "skLesson" }));
    if (arr(data.resources).length) body.append(el("div", { class: "sk-panel" }, el("h3", { text: "📎 Course materials" }), resLinks(data.resources)));
  }
  function resLinks(list) { const w = el("div", { class: "sk-res" }); arr(list).forEach(r => { const u = httpsUrl(r.url); if (u) w.append(el("a", { href: u, target: "_blank", rel: "noopener noreferrer", text: (r.type === "link" ? "🔗 " : "📄 ") + (r.label || u) })); }); return w; }
  function showLesson(c, l, body, track) {
    const box = document.getElementById("skLesson") || body.appendChild(el("div", { id: "skLesson" })); box.replaceChildren(); const p = el("div", { class: "sk-panel" }, el("h3", { text: l.title }));
    if (ytId(l.video)) p.append(el("div", { class: "sk-video" }, el("iframe", { src: "https://www.youtube-nocookie.com/embed/" + ytId(l.video), title: l.title, allow: "accelerometer; encrypted-media; gyroscope; picture-in-picture", allowfullscreen: "", referrerpolicy: "strict-origin-when-cross-origin", loading: "lazy" })));
    if (l.notes) p.append(el("div", { class: "sk-notes", text: l.notes })); if (arr(l.resources).length) p.append(resLinks(l.resources));
    if (track) p.append(btn("Mark lesson as done", function () { markDone(c.id, l.id); this.textContent = "✔ Done"; this.disabled = true; })); box.append(p); p.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
  function rerender() { if (state.view === "skill") skillView(state.skill); else if (state.view === "course") { if (!host.querySelector(".sk-video")) courseView(state.course); } else skillsView(); }

  /* ---------- employee link + start ---------- */
  const link = el("a", { class: "btn", id: "skillsEmployeeLink", href: "skills-employee.html", text: "🛠️ Employee workspace" }); link.style.cssText = "display:none;margin-right:8px"; document.querySelector("header").insertBefore(link, document.querySelector("header .btn"));
  async function employeeLink() { if (PREVIEW) { link.style.display = ""; return; } const a = auth(); if (a.state !== "in") return; try { const x = await rpc("rp_get_account_context", {}, a.token), roles = Array.isArray(x.roles) ? x.roles : []; if (x.status === "active" && roles.some(r => EDITOR_ROLES.includes(r))) link.style.display = ""; } catch { /* ignore */ } }
  if (!PREVIEW) { loadCache(); state.loaded = !!state.snapshot; }
  skillsView(); employeeLink(); loadMine().then(rerender); syncLive(true);
  if (!PREVIEW) { setInterval(() => { if (!document.hidden) syncLive(false); }, POLL_MS); window.addEventListener("online", () => syncLive(false)); }
  document.addEventListener("visibilitychange", () => { if (!document.hidden && !PREVIEW) { syncLive(false); loadMine(); } });
  window.addEventListener("storage", () => { if (PREVIEW) rerender(); });
})();
