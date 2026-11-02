/* RP local backend, part 3: content publishing (Games, Tools, Music, Education, Skills, Labs), paid unlocks, exams. Port of the *-content.sql files. */
(function () {
  "use strict";
  var L = window.RPLocal, T = L.T, fail = L.fail, now = L.now, clone = L.clone, KEEP = 8;
  var EDIT = {
    games: ["Creator", "Games Studio Director", "Game Employee"], tools: ["Creator", "Tool Studio Director", "Tool Employee"], music: ["Creator", "Music Studio Director", "Music Employee"],
    education: ["Creator", "Education Studio Director", "Education Employee"], skills: ["Creator", "Skills Studio Director", "Skills Employee"], labs: ["Creator", "Lab Studio Director", "Lab Scientist", "Labs Employee"]
  };
  var NAME = { games: "Games", tools: "Tools", music: "Music", education: "Education", skills: "Skills", labs: "Labs" };
  var isArr = Array.isArray, isObj = function (x) { return x && typeof x === "object" && !isArr(x); };
  function editor(b, ctx) { return L.hasRole(ctx, EDIT[b]); }
  function need(b, ctx) { if (!editor(b, ctx)) fail(NAME[b] + " employee role required"); }
  function pubs(b) { return T("rp_" + b + "_publications"); }
  function latest(b) { var p = pubs(b); return p.length ? p.reduce(function (m, x) { return x.version > m.version ? x : m; }) : null; }
  function size(o) { return JSON.stringify(o).length; }
  function checkBase(s, lim) { if (!isObj(s)) fail("Snapshot must be a JSON object"); if (size(s) > lim) fail("Snapshot is too large (limit " + (lim / 1000000) + " MB)"); }
  function addPub(b, snap, note, uid) {
    var p = pubs(b), v = L.nid("rp_" + b + "_publications"); p.push({ version: v, snapshot: snap, note: String(note || "").slice(0, 200), published_by: uid, published_at: now() });
    return v;
  }
  function prune(b, v, extraTables) {
    var cut = v - KEEP, t = T("rp_" + b + "_publications"); for (var i = t.length - 1; i >= 0; i--) if (t[i].version <= cut) t.splice(i, 1);
    (extraTables || []).forEach(function (n) { var x = T(n); for (var j = x.length - 1; j >= 0; j--) if (x[j].version <= cut) x.splice(j, 1); });
  }
  function pubTable(b) { L.table("rp_" + b + "_publications", { cols: { anon: ["version", "snapshot", "published_at"], authenticated: ["version", "snapshot", "published_at", "note"] } }); }
  Object.keys(EDIT).forEach(pubTable);
  Object.keys(EDIT).forEach(function (b) { L.rpc("rp_is_" + b + "_editor", function (a, ctx) { return editor(b, ctx); }); });

  function simple(b, keys, objKeys, limit, hint) {
    L.rpc("rp_publish_" + b, function (a, ctx) {
      need(b, ctx); var s = a.p_snapshot; checkBase(s, limit);
      keys.forEach(function (k) { if (k in s && !isArr(s[k])) fail('Snapshot section "' + k + '" must be a list'); });
      (objKeys || []).forEach(function (k) { if (s[k] != null && !isObj(s[k])) fail('Snapshot section "' + k + '" must be an object'); });
      var v = addPub(b, clone(s), a.p_note, ctx.uid); L.audit(ctx.uid, b + "_content_published", null, { version: v, note: String(a.p_note || "").slice(0, 200) }); prune(b, v); return v;
    });
    L.rpc("rp_republish_" + b, function (a, ctx) {
      need(b, ctx); var o = pubs(b).filter(function (x) { return x.version === Number(a.p_version); })[0]; if (!o) fail("That version no longer exists");
      var v = addPub(b, clone(o.snapshot), "Restored version " + a.p_version, ctx.uid); L.audit(ctx.uid, b + "_content_restored", null, { restored_version: a.p_version, version: v }); prune(b, v); return v;
    });
  }
  simple("tools", ["tools", "events"], [], 8000000);
  simple("music", ["tracks", "beats", "releases", "features"], [], 8000000);

  /* ---------- Labs ---------- */
  L.rpc("rp_publish_labs", function (a, ctx) {
    need("labs", ctx); var s = a.p_snapshot; checkBase(s, 6000000);
    var labs = s.labs || [], exps = s.experiments || [], papers = s.papers || [];
    if (!isArr(labs) || !isArr(exps) || !isArr(papers)) fail("Labs, experiments and papers must be lists");
    if (labs.length > 20 || exps.length > 200 || papers.length > 200) fail("Too many labs, experiments or papers");
    labs.forEach(function (x) { if (!isObj(x) || !x.id || !x.name) fail("Every lab needs an id and a name"); if (String(x.name).length > 80) fail('Lab name "' + String(x.name).slice(0, 30) + '" is too long'); });
    var ids = labs.map(function (x) { return x.id; }); if (L.uniq(ids).length !== ids.length) fail("Lab ids must be unique");
    exps.forEach(function (x) {
      if (!isObj(x) || !x.id || !x.title) fail("Every experiment needs an id and a title"); if (ids.indexOf(x.lab) < 0) fail('Experiment "' + x.title + '" belongs to a lab that does not exist');
      if (x.params != null && (!isArr(x.params) || x.params.length > 12)) fail('Experiment "' + x.title + '" can have at most 12 parameters');
      if (typeof x.script !== "string" || x.script.length > 20000) fail('Experiment "' + x.title + '" needs a script of at most 20000 characters');
    });
    var v = addPub("labs", clone(s), a.p_note, ctx.uid); L.audit(ctx.uid, "labs_content_published", null, { version: v }); prune("labs", v); return v;
  });
  L.rpc("rp_republish_labs", function (a, ctx) {
    need("labs", ctx); var o = pubs("labs").filter(function (x) { return x.version === Number(a.p_version); })[0]; if (!o) fail("That version no longer exists");
    var v = addPub("labs", clone(o.snapshot), "Restored version " + a.p_version, ctx.uid); prune("labs", v); return v;
  });

  /* ---------- Games with paid tabs ---------- */
  function price(o, label) { var r = o.price; if (r == null || r === "") return 0; r = String(r); if (!/^[0-9]{1,7}$/.test(r)) fail(label + " has an invalid Refane price"); var n = Number(r); if (n > 1000000) fail(label + " price is too high (max 1,000,000)"); return n; }
  L.table("rp_games_tab_unlocks", { cols: { authenticated: "*" }, rls: function (r, c) { return r.account_id === c.uid; } });
  L.rpc("rp_publish_games", function (a, ctx) {
    need("games", ctx); var s = a.p_snapshot; checkBase(s, 8000000);
    ["tabs", "events", "features", "patches", "roadmap"].forEach(function (k) { if (k in s && !isArr(s[k])) fail('Snapshot section "' + k + '" must be a list'); });
    if (s.banner != null && !isObj(s.banner)) fail('Snapshot section "banner" must be an object');
    var pub = clone(s), priv = [];
    if (s.tabs) {
      s.tabs.forEach(function (t) { if (!isObj(t) || !t.id) fail("Every tab needs an id"); price(t, 'Tab "' + (t.name || "?") + '"'); });
      pub.tabs = s.tabs.map(function (t) { var p = price(t, ""); if (p > 0) { var c = clone(t); priv.push({ tab_id: t.id, html: t.html || "", css: t.css || "", js: t.js || "" }); delete c.html; delete c.css; delete c.js; c.locked = true; c.price = p; return c; } return clone(t); });
    }
    var v = addPub("games", pub, a.p_note, ctx.uid); priv.forEach(function (p) { p.version = v; T("rp_games_tab_content").push(p); });
    L.audit(ctx.uid, "games_content_published", null, { version: v }); prune("games", v, ["rp_games_tab_content"]); return v;
  });
  L.rpc("rp_republish_games", function (a, ctx) {
    need("games", ctx); var o = pubs("games").filter(function (x) { return x.version === Number(a.p_version); })[0]; if (!o) fail("That version no longer exists");
    var v = addPub("games", clone(o.snapshot), "Restored version " + a.p_version, ctx.uid);
    T("rp_games_tab_content").filter(function (r) { return r.version === Number(a.p_version); }).forEach(function (r) { var c = clone(r); c.version = v; T("rp_games_tab_content").push(c); });
    prune("games", v, ["rp_games_tab_content"]); return v;
  });
  L.rpc("rp_unlock_games_tab", function (a, ctx) {
    var acc = L.me(ctx); if (!ctx.uid) fail("Sign in to unlock tabs"); if (!acc || acc.status !== "active") fail("Your account cannot make purchases right now");
    if (T("rp_games_tab_unlocks").some(function (u) { return u.account_id === ctx.uid && u.tab_id === a.p_tab_id; })) return { unlocked: true, charged: 0, balance: acc.refane_balance };
    var p = latest("games"), tab = p && (p.snapshot.tabs || []).filter(function (t) { return t.id === a.p_tab_id; })[0]; if (!tab) fail("That tab is not published");
    var pr = price(tab, 'Tab "' + (tab.name || "?") + '"'); if (pr <= 0) fail("That tab is free");
    if (acc.refane_balance < pr) fail("Not enough Refane (you need " + pr + ", you have " + acc.refane_balance + ")");
    acc.refane_balance -= pr; acc.updated_at = now(); T("rp_games_tab_unlocks").push({ account_id: ctx.uid, tab_id: a.p_tab_id, price: pr, unlocked_at: now() });
    L.audit(ctx.uid, "games_tab_unlocked", acc.account_number, { tab_id: a.p_tab_id, price: pr }); return { unlocked: true, charged: pr, balance: acc.refane_balance };
  });
  L.rpc("rp_get_games_tab", function (a, ctx) {
    if (!ctx.uid) fail("Sign in to view this tab"); if (!L.active(ctx)) fail("Your account cannot view this tab right now");
    if (!editor("games", ctx) && !T("rp_games_tab_unlocks").some(function (u) { return u.account_id === ctx.uid && u.tab_id === a.p_tab_id; })) fail("This tab is locked. Unlock it with Refane first");
    var p = latest("games"), r = p && T("rp_games_tab_content").filter(function (x) { return x.tab_id === a.p_tab_id && x.version === p.version; })[0]; if (!r) fail("That tab has no content");
    return { html: r.html, css: r.css, js: r.js };
  });

  /* ---------- Education ---------- */
  var LEVELS = ["Grade 1", "Grade 2", "Grade 3", "Grade 4", "Grade 5", "Grade 6", "Grade 7", "Grade 8", "Grade 9", "Grade 10", "Grade 11", "Grade 12", "College", "University"];
  L.table("rp_education_enrollments", { cols: { authenticated: "*" }, rls: function (r, c) { return r.account_id === c.uid; } });
  L.table("rp_education_degrees", { cols: { authenticated: "*" }, rls: function (r, c) { return r.account_id === c.uid; } });
  L.table("rp_skills_enrollments", { cols: { authenticated: "*" }, rls: function (r, c) { return r.account_id === c.uid; } });
  function eduPrice(c) { return price(c, 'Course "' + (c.title || "?") + '"'); }
  function eduGated(c) { return eduPrice(c) > 0 || (c.requires || []).length > 0; }
  function examQ(c) { return (c.exam || []).map(function (e) { return { q: e.q, options: e.options }; }); }
  function eduPublic(c) {
    var g = eduGated(c), lessons = c.lessons || [], ex = examQ(c);
    var base = { id: c.id, title: String(c.title).slice(0, 120), level: c.level, subject: String(c.subject || "").slice(0, 60), emoji: String(c.emoji || "📘").slice(0, 8), description: String(c.description || "").slice(0, 1200), price: eduPrice(c), requires: c.requires || [], degree: c.degree || "", passMark: c.passMark != null ? parseInt(c.passMark, 10) : 70, gated: g, examCount: ex.length,
      outline: lessons.map(function (l) { return { id: l.id, title: l.title, preview: !!l.preview }; }) };
    if (!g) { base.lessons = lessons; base.resources = c.resources || []; base.exam = ex; return base; }
    base.previewLessons = lessons.filter(function (l) { return l.preview; }); return base;
  }
  L.rpc("rp_publish_education", function (a, ctx) {
    need("education", ctx); var s = a.p_snapshot; checkBase(s, 8000000);
    var courses = s.courses || [], degrees = s.degrees || [];
    if (!isArr(courses) || !isArr(degrees)) fail("Courses and degrees must be lists"); if (courses.length > 300 || degrees.length > 200) fail("Too many courses or degrees");
    var ids = degrees.map(function (d) { return d.id; }); if (ids.some(function (i) { return !i; })) fail("Every degree needs an id");
    courses.forEach(function (c) {
      var t = c && c.title; if (!isObj(c) || !c.id || !c.title) fail("Every course needs an id and a title");
      if (LEVELS.indexOf(c.level) < 0) fail('Course "' + t + '" has an invalid level'); eduPrice(c);
      var pm = c.passMark == null || c.passMark === "" ? "70" : String(c.passMark); if (!/^[0-9]{1,3}$/.test(pm) || +pm < 1 || +pm > 100) fail('Course "' + t + '" has an invalid pass mark');
      if (c.requires != null && !isArr(c.requires)) fail('Course "' + t + '" requires must be a list');
      (c.requires || []).forEach(function (r) { if (ids.indexOf(r) < 0) fail('Course "' + t + '" requires a degree that does not exist'); });
      if (c.degree && ids.indexOf(c.degree) < 0) fail('Course "' + t + '" awards a degree that does not exist');
      if ((c.lessons != null && !isArr(c.lessons)) || (c.exam != null && !isArr(c.exam))) fail('Course "' + t + '" lessons and exam must be lists');
      (c.exam || []).forEach(function (q) { var n = isArr(q.options) ? q.options.length : 0; if (!isArr(q.options)) fail('Course "' + t + '" has an exam question without options'); if (n < 2 || n > 6 || !/^[0-9]$/.test(String(q.answer == null ? "" : q.answer)) || +q.answer >= n) fail('Course "' + t + '" has an exam question with an invalid answer'); });
      if (c.degree && !(c.exam || []).length) fail('Course "' + t + '" awards a degree, so it needs a final exam');
    });
    var pub = { schema: 1, degrees: clone(degrees), courses: courses.map(eduPublic) };
    var v = addPub("education", pub, a.p_note, ctx.uid);
    courses.forEach(function (c) { T("rp_education_private").push({ version: v, course_id: c.id, content: eduGated(c) ? { lessons: c.lessons || [], resources: c.resources || [], exam: examQ(c) } : {}, answers: (c.exam || []).map(function (e) { return e.answer; }) }); });
    L.audit(ctx.uid, "education_content_published", null, { version: v }); prune("education", v, ["rp_education_private"]); return v;
  });
  L.rpc("rp_republish_education", function (a, ctx) {
    need("education", ctx); var o = pubs("education").filter(function (x) { return x.version === Number(a.p_version); })[0]; if (!o) fail("That version no longer exists");
    var v = addPub("education", clone(o.snapshot), "Restored version " + a.p_version, ctx.uid);
    T("rp_education_private").filter(function (r) { return r.version === Number(a.p_version); }).forEach(function (r) { var c = clone(r); c.version = v; T("rp_education_private").push(c); }); prune("education", v, ["rp_education_private"]); return v;
  });
  function live(b, id) { var p = latest(b); return p && (p.snapshot.courses || []).filter(function (c) { return c.id === id; })[0] || null; }
  function degName(snap, id) { var d = ((snap || {}).degrees || []).filter(function (x) { return x.id === id; })[0]; return d && d.name; }
  function unlock(b, enrollTable, degSource) {
    return function (a, ctx) {
      if (!ctx.uid) fail("Sign in to enroll"); var acc = L.active(ctx); if (!acc) fail("Your account cannot enroll right now");
      if (T(enrollTable).some(function (e) { return e.account_id === ctx.uid && e.course_id === a.p_course_id; })) return { enrolled: true, charged: 0, balance: acc.refane_balance };
      var c = live(b, a.p_course_id); if (!c) fail("That course is not published");
      (c.requires || []).forEach(function (r) { if (!T("rp_education_degrees").some(function (d) { return d.account_id === ctx.uid && d.degree_id === r; })) fail("Missing required degree: " + (degName(latest(degSource).snapshot, r) || r)); });
      var pr = Number(c.price || 0); if (pr > acc.refane_balance) fail("Not enough Refane (you need " + pr + ", you have " + acc.refane_balance + ")");
      if (pr > 0) { acc.refane_balance -= pr; acc.updated_at = now(); }
      T(enrollTable).push({ account_id: ctx.uid, course_id: a.p_course_id, price: pr, enrolled_at: now() }); L.audit(ctx.uid, b + "_course_unlocked", acc.account_number, { course_id: a.p_course_id, price: pr });
      return { enrolled: true, charged: pr, balance: acc.refane_balance };
    };
  }
  function getPriv(b, enrollTable, privTable) {
    return function (a, ctx) {
      if (!ctx.uid) fail("Sign in to open this course"); if (!L.active(ctx)) fail("Your account cannot open this course right now");
      if (!editor(b, ctx) && !T(enrollTable).some(function (e) { return e.account_id === ctx.uid && e.course_id === a.p_course_id; })) fail("This course is locked. Enroll first");
      var p = latest(b), r = p && T(privTable).filter(function (x) { return x.course_id === a.p_course_id && x.version === p.version; })[0];
      if (!r || !Object.keys(r.content || {}).length) fail("That course has no private content"); return clone(r.content);
    };
  }
  L.rpc("rp_unlock_education_course", unlock("education", "rp_education_enrollments", "education"));
  L.rpc("rp_get_education_course", getPriv("education", "rp_education_enrollments", "rp_education_private"));
  L.rpc("rp_submit_education_exam", function (a, ctx) {
    if (!ctx.uid) fail("Sign in to take the exam"); if (!L.active(ctx)) fail("Your account cannot take exams right now");
    var c = live("education", a.p_course_id); if (!c) fail("That course is not published");
    if (c.gated && !T("rp_education_enrollments").some(function (e) { return e.account_id === ctx.uid && e.course_id === a.p_course_id; })) fail("Enroll in this course before taking the exam");
    var p = latest("education"), r = T("rp_education_private").filter(function (x) { return x.course_id === a.p_course_id && x.version === p.version; })[0]; if (!r) fail("This course has no exam");
    var total = r.answers.length; if (!total) fail("This course has no exam"); var ans = a.p_answers; if (!isArr(ans) || ans.length !== total) fail("Answer every question");
    var recent = T("rp_education_attempts").filter(function (x) { return x.account_id === ctx.uid && x.course_id === a.p_course_id && new Date(x.attempted_at) > Date.now() - 3600000; }).length; if (recent >= 5) fail("Too many attempts. Try again in an hour");
    var ok = 0; for (var i = 0; i < total; i++) if (String(ans[i]) === String(r.answers[i])) ok++;
    var score = Math.round(100 * ok / total), pass = c.passMark != null ? Number(c.passMark) : 70, passed = score >= pass;
    T("rp_education_attempts").push({ account_id: ctx.uid, course_id: a.p_course_id, score: score, passed: passed, attempted_at: now() });
    var deg = c.degree || "", dn = null;
    if (passed && deg) { var d = T("rp_education_degrees"), ex = d.filter(function (x) { return x.account_id === ctx.uid && x.degree_id === deg; })[0]; if (ex) ex.score = Math.max(ex.score, score); else d.push({ account_id: ctx.uid, degree_id: deg, course_id: a.p_course_id, score: score, earned_at: now() }); dn = degName(p.snapshot, deg) || deg; }
    return { score: score, correct: ok, total: total, passMark: pass, passed: passed, degree: passed && deg ? dn : null };
  });

  /* ---------- Skills ---------- */
  function sklRequires(snap, c) { var s = (snap.skills || []).filter(function (x) { return x.id === c.skill; })[0]; return L.uniq((c.requires || []).concat(s && s.requires || [])); }
  function sklPublic(snap, c) {
    var req = sklRequires(snap, c), pr = price(c, 'Course "' + c.title + '"'), g = pr > 0 || req.length > 0, lessons = c.lessons || [];
    var base = { id: c.id, title: String(c.title).slice(0, 120), skill: c.skill, emoji: String(c.emoji || "🛠️").slice(0, 8), description: String(c.description || "").slice(0, 1200), price: pr, requires: req, gated: g, outline: lessons.map(function (l) { return { id: l.id, title: l.title, preview: !!l.preview }; }) };
    if (!g) { base.lessons = lessons; base.resources = c.resources || []; return base; } base.previewLessons = lessons.filter(function (l) { return l.preview; }); return base;
  }
  L.rpc("rp_publish_skills", function (a, ctx) {
    need("skills", ctx); var s = a.p_snapshot; checkBase(s, 8000000); var courses = s.courses || [], skills = s.skills || [];
    if (!isArr(courses) || !isArr(skills)) fail("Skills and courses must be lists"); if (courses.length > 400 || skills.length > 100) fail("Too many skills or courses");
    var sk = skills.map(function (x) { return x.id; }), edu = latest("education"), degs = edu ? (edu.snapshot.degrees || []) : [], dids = degs.map(function (d) { return d.id; });
    skills.forEach(function (x) { if (!isObj(x) || !x.id || !x.name) fail("Every skill needs an id and a name"); if (x.requires != null && !isArr(x.requires)) fail('Skill "' + x.name + '" requires must be a list'); (x.requires || []).forEach(function (r) { if (dids.indexOf(r) < 0) fail('Skill "' + x.name + '" requires a degree that is not published in Education'); }); });
    courses.forEach(function (c) {
      if (!isObj(c) || !c.id || !c.title) fail("Every course needs an id and a title"); if (sk.indexOf(c.skill) < 0) fail('Course "' + c.title + '" belongs to a skill that does not exist'); price(c, 'Course "' + c.title + '"');
      if ((c.requires != null && !isArr(c.requires)) || (c.lessons != null && !isArr(c.lessons))) fail('Course "' + c.title + '" has invalid lists');
      (c.requires || []).forEach(function (r) { if (dids.indexOf(r) < 0) fail('Course "' + c.title + '" requires a degree that is not published in Education'); });
    });
    var pub = { schema: 1, skills: skills.map(function (x) { return { id: x.id, name: String(x.name).slice(0, 80), emoji: String(x.emoji || "🛠️").slice(0, 8), description: String(x.description || "").slice(0, 400), requires: x.requires || [] }; }), degrees: degs.map(function (d) { return { id: d.id, name: d.name, emoji: d.emoji }; }) };
    pub.courses = courses.map(function (c) { return sklPublic(s, c); });
    var v = addPub("skills", pub, a.p_note, ctx.uid);
    courses.forEach(function (c) { var g = price(c, "") > 0 || sklRequires(s, c).length > 0; T("rp_skills_private").push({ version: v, course_id: c.id, content: g ? { lessons: c.lessons || [], resources: c.resources || [] } : {} }); });
    L.audit(ctx.uid, "skills_content_published", null, { version: v }); prune("skills", v, ["rp_skills_private"]); return v;
  });
  L.rpc("rp_republish_skills", function (a, ctx) {
    need("skills", ctx); var o = pubs("skills").filter(function (x) { return x.version === Number(a.p_version); })[0]; if (!o) fail("That version no longer exists");
    var v = addPub("skills", clone(o.snapshot), "Restored version " + a.p_version, ctx.uid);
    T("rp_skills_private").filter(function (r) { return r.version === Number(a.p_version); }).forEach(function (r) { var c = clone(r); c.version = v; T("rp_skills_private").push(c); }); prune("skills", v, ["rp_skills_private"]); return v;
  });
  L.rpc("rp_unlock_skills_course", unlock("skills", "rp_skills_enrollments", "skills"));
  L.rpc("rp_get_skills_course", getPriv("skills", "rp_skills_enrollments", "rp_skills_private"));
  L.EDIT_ROLES = EDIT; L.isEditor = editor; L.latestPub = latest;
})();
