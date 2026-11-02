/* RP local backend, part 4: Branch Kit (pages, applications, notifications, coder, news) and Site Code. Port of branch-kit.sql and site-code.sql. */
(function () {
  "use strict";
  var L = window.RPLocal, T = L.T, fail = L.fail, now = L.now, clone = L.clone;
  var MAIN = ["games", "tools", "music", "education", "skills", "community", "labs"];
  var FOLDER = { games: "Games", tools: "Tools", music: "Music", education: "Education", skills: "Skills", community: "Community", labs: "Labs" };
  var ROLE = {
    employee: { games: "Game Employee", tools: "Tool Employee", music: "Music Employee", education: "Education Employee", skills: "Skills Employee", community: "Community Employee", labs: "Labs Employee" },
    developer: { games: "Games Developer", tools: "Tools Developer", music: "Music Developer", education: "Education Developer", skills: "Skills Developer", community: "Community Developer", labs: "Labs Developer" },
    director: { games: "Games Studio Director", tools: "Tool Studio Director", music: "Music Studio Director", education: "Education Studio Director", skills: "Skills Studio Director", community: "Community Studio Director", labs: "Lab Studio Director" }
  };
  /* sub-branches inherit the roles of the main branch they sit under */
  function root(slug) { var seen = 0, cur = slug; while (cur && MAIN.indexOf(cur) < 0 && seen++ < 12) { var b = T("rp_branches").filter(function (x) { return x.slug === cur; })[0]; cur = b ? b.parent : null; } return MAIN.indexOf(cur) >= 0 ? cur : null; }
  L.branchRoot = root;
  function branchOk(p) { return p === "rp" || MAIN.indexOf(p) >= 0 || T("rp_branches").some(function (b) { return b.slug === p; }); }
  function roleOf(b, kind) { var r = root(b); return r ? ROLE[kind][r] : null; }
  function isDev(b, ctx) { var r = root(b); return !!(r && L.hasRole(ctx, ["Creator", ROLE.developer[r], ROLE.director[r]])); }
  L.rpc("rp_is_branch_dev", function (a, ctx) { return isDev(a.p_branch, ctx); });
  L.rpc("rp_is_creator", function (a, ctx) { return L.isCreator(ctx); });
  L.rpc("rp_site_is_creator", function (a, ctx) { return L.isCreator(ctx); });
  var URL_RE = /^https:\/\/\S{4,255}$/;

  /* ---------- pages ---------- */
  L.table("rp_pages", { cols: { anon: ["id", "kind", "branch", "title", "sort", "data", "updated_at"], authenticated: ["id", "kind", "branch", "title", "sort", "data", "updated_at"] }, rls: function (r) { return r.published; } });
  function validatePage(kind, d) {
    if (!d || typeof d !== "object" || Array.isArray(d)) fail("Page data must be an object"); if (JSON.stringify(d).length > 400000) fail("Page is too large");
    if (kind === "policy") { if (d.body != null && typeof d.body !== "string") fail("Policy text must be text"); }
    else if (kind === "about") {
      if (["system", "serif", "mono", "rounded", "display"].indexOf(d.font || "system") < 0) fail("Unknown font"); if (!/^#[0-9a-fA-F]{6}$/.test(d.accent || "#2ee6e6")) fail("Accent must be a #rrggbb colour");
      var bl = d.blocks || []; if (!Array.isArray(bl) || bl.length > 200) fail("About pages can have at most 200 blocks");
      bl.forEach(function (v) {
        if (!v || typeof v !== "object" || ["heading", "sub", "text", "canva", "image"].indexOf(v.type) < 0) fail("Unknown About block type"); if (String(v.text || "").length > 8000) fail("An About block is too long");
        if (v.type === "canva" && !/^https:\/\/www\.canva\.com\/design\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\/(view|watch)(\?[A-Za-z0-9=&_%-]*)?$/.test(v.url || "")) fail("Canva blocks need a Canva share link like https://www.canva.com/design/ID/TOKEN/view?embed");
        if (v.type === "image" && !URL_RE.test(v.url || "")) fail("Image blocks need an https:// link");
      });
    } else if (kind === "contact") {
      var en = d.entries || []; if (!Array.isArray(en) || en.length > 100) fail("Contact pages can have at most 100 roles");
      en.forEach(function (v) {
        if (!v || typeof v !== "object" || !v.role || String(v.role).length > 80) fail("Every contact needs a role name");
        if (v.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.email)) fail("Invalid email for " + v.role); if (v.phone && !/^[0-9+() .-]{3,30}$/.test(v.phone)) fail("Invalid phone number for " + v.role);
        var so = v.socials || []; if (!Array.isArray(so) || so.length > 8) fail("Too many social links for " + v.role); so.forEach(function (s) { if (!URL_RE.test((s && s.url) || "")) fail("Social links for " + v.role + " must start with https://"); });
      });
    }
  }
  L.rpc("rp_save_page", function (a, ctx) {
    L.requireCreator(ctx); if (["policy", "about", "contact"].indexOf(a.p_kind) < 0) fail("Unknown page kind"); if (!branchOk(a.p_branch)) fail("Unknown branch");
    if (!String(a.p_title || "").trim()) fail("A title is required"); validatePage(a.p_kind, a.p_data); var t = T("rp_pages"), id;
    if (a.p_id == null) { id = L.nid("rp_pages"); t.push({ id: id, kind: a.p_kind, branch: a.p_branch, title: a.p_title.trim(), sort: a.p_sort || 0, published: a.p_published !== false, data: clone(a.p_data), updated_by: ctx.uid, updated_at: now() }); }
    else { var r = t.filter(function (x) { return x.id === Number(a.p_id); })[0]; if (!r) fail("That page no longer exists"); id = r.id; r.kind = a.p_kind; r.branch = a.p_branch; r.title = a.p_title.trim(); r.sort = a.p_sort || 0; r.published = a.p_published !== false; r.data = clone(a.p_data); r.updated_at = now(); }
    L.audit(ctx.uid, "page_saved", null, { id: id, kind: a.p_kind, branch: a.p_branch }); return id;
  });
  L.rpc("rp_delete_page", function (a, ctx) { L.requireCreator(ctx); var t = T("rp_pages"), i = t.findIndex(function (x) { return x.id === Number(a.p_id); }); if (i < 0) fail("That page no longer exists"); t.splice(i, 1); L.audit(ctx.uid, "page_deleted", null, { id: a.p_id }); return null; });
  L.rpc("rp_admin_pages", function (a, ctx) { L.requireCreator(ctx); return clone(T("rp_pages").slice().sort(function (x, y) { return (x.kind < y.kind ? -1 : x.kind > y.kind ? 1 : 0) || (x.branch < y.branch ? -1 : x.branch > y.branch ? 1 : 0) || x.sort - y.sort || x.id - y.id; })); });
  if (!T("rp_pages").some(function (p) { return p.kind === "policy"; })) {
    [["Refane Policy", 10, "## What Refane is\nRefane is a currency that works across the whole of Raking Productions. You buy Refane once with real money and it never expires. Spend it on anything to get a head start or to open paid content.\n\n## Paying\nIn all of Raking Productions you cannot buy anything with real money except Refane. All payment is handled by the Creator.\n\n## Earning\nYou can also receive Refane as gifts, buy it on the official RP website, or earn it from your creations.\n\n## Refunds\n- There are no refunds once you have bought Refane.\n- You may ask customer service about a mistaken purchase. The Refane you bought is then taken back and 75% of the amount you paid is returned.\n\n## Third-party sellers\nIf you buy Refane from any third-party website your account is permanently terminated. You have 10 days to contact support and ask for a review. After 10 days the appeal window closes forever.\n\n## Agreement\nBy obtaining Refane for the first time you agree to all Refane-related policy and cannot challenge it later in any form. If you do not agree, disable Refane in your account settings."],
      ["Employment and Work Hours", 20, "## Applying\nUse the **I want to apply** page on the main RP website. Fill in the interview form. If the Creator accepts you, you are notified and get access to your employee workspace automatically.\n\n## Work hours\n5 hours a day. Saturday and Sunday are off unless a major release is coming.\n\n## Pay\nPay depends on your productivity each month."]].forEach(function (p) { T("rp_pages").push({ id: L.nid("rp_pages"), kind: "policy", branch: "rp", title: p[0], sort: p[1], published: true, data: { body: p[2] }, updated_by: null, updated_at: now() }); });
  }

  /* ---------- hiring + notifications ---------- */
  L.rpc("rp_submit_application", function (a, ctx) {
    if (!ctx.uid) fail("Sign in to apply"); var acc = L.active(ctx); if (!acc) fail("Your account cannot apply right now");
    if (!branchOk(a.p_branch) || a.p_branch === "rp") fail("Choose a branch"); if (["employee", "developer"].indexOf(a.p_kind) < 0) fail("Choose employee or developer");
    var role = roleOf(a.p_branch, a.p_kind); if (acc.roles.indexOf("Creator") >= 0 || acc.roles.indexOf(role) >= 0) fail("You already have access to this role");
    var an = a.p_answers; if (!an || typeof an !== "object" || JSON.stringify(an).length > 20000) fail("The application is invalid or too long");
    if (String(an.why || "").trim().length < 20) fail("Tell us in a few sentences why you want to join"); if (String(an.qualifications || "").trim().length < 10) fail("Describe your qualifications");
    var apps = T("rp_applications"), mine = apps.filter(function (x) { return x.account_id === ctx.uid; });
    if (mine.filter(function (x) { return new Date(x.created_at) > Date.now() - 86400000; }).length >= 5) fail("You can send at most 5 applications a day");
    if (mine.some(function (x) { return x.branch === a.p_branch && x.kind === a.p_kind && x.status === "pending"; })) fail("You already have a pending application for this role");
    var id = L.nid("rp_applications"); apps.push({ id: id, account_id: ctx.uid, branch: a.p_branch, kind: a.p_kind, answers: clone(an), status: "pending", decision_note: "", decided_by: null, decided_at: null, created_at: now() }); return id;
  });
  L.rpc("rp_my_applications", function (a, ctx) { return T("rp_applications").filter(function (x) { return x.account_id === ctx.uid; }).sort(function (x, y) { return y.id - x.id; }).slice(0, 50).map(function (x) { return { id: x.id, branch: x.branch, kind: x.kind, status: x.status, decision_note: x.decision_note, created_at: x.created_at, decided_at: x.decided_at }; }); });
  L.rpc("rp_withdraw_application", function (a, ctx) { var r = T("rp_applications").filter(function (x) { return x.id === Number(a.p_id) && x.account_id === ctx.uid && x.status === "pending"; })[0]; if (!r) fail("No pending application found"); r.status = "withdrawn"; r.decided_at = now(); return null; });
  L.rpc("rp_list_applications", function (a, ctx) {
    L.requireCreator(ctx); var st = a.p_status || "pending";
    return T("rp_applications").filter(function (x) { return st === "all" || x.status === st; }).sort(function (x, y) { return y.id - x.id; }).slice(0, 200).map(function (x) { var c = T("rp_accounts").filter(function (z) { return z.id === x.account_id; })[0] || {}; return { id: x.id, account_number: c.account_number, username: c.username, branch: x.branch, kind: x.kind, status: x.status, answers: clone(x.answers), decision_note: x.decision_note, created_at: x.created_at, decided_at: x.decided_at }; });
  });
  function notify(uid, title, body, link) { T("rp_notifications").push({ id: L.nid("rp_notifications"), account_id: uid, title: title, body: body, link: link || "", read: false, created_at: now() }); }
  L.notify = notify;
  L.rpc("rp_decide_application", function (a, ctx) {
    L.requireCreator(ctx); var v = T("rp_applications").filter(function (x) { return x.id === Number(a.p_id); })[0]; if (!v) fail("Application not found"); if (v.status !== "pending") fail("This application was already decided");
    var role = roleOf(v.branch, v.kind), acc = T("rp_accounts").filter(function (x) { return x.id === v.account_id; })[0], note = String(a.p_note || "").trim() ? "\n\nNote from the Creator: " + String(a.p_note).slice(0, 500) : "";
    if (a.p_accept) { if (acc) L.addRole(acc, role); notify(v.account_id, "Application accepted 🎉", "You are now " + role + ". Open the main page and choose your workspace to start working. Work hours: 5 hours a day, Saturday and Sunday off unless a major release is coming." + note, v.kind === "developer" ? "../index/coder.html?branch=" + v.branch : "../index/index.html"); }
    else notify(v.account_id, "Application update", "Your application for " + role + " was not accepted this time." + note, "../index/apply.html");
    v.status = a.p_accept ? "accepted" : "rejected"; v.decision_note = String(a.p_note || "").slice(0, 500); v.decided_by = ctx.uid; v.decided_at = now();
    L.audit(ctx.uid, a.p_accept ? "application_accepted" : "application_rejected", acc && acc.account_number, { application: v.id, branch: v.branch, role: role }); return null;
  });
  L.rpc("rp_my_notifications", function (a, ctx) { var n = Math.min(Math.max(a.p_limit || 20, 1), 50); return T("rp_notifications").filter(function (x) { return x.account_id === ctx.uid; }).sort(function (x, y) { return y.id - x.id; }).slice(0, n).map(function (x) { return { id: x.id, title: x.title, body: x.body, link: x.link, read: x.read, created_at: x.created_at }; }); });
  L.rpc("rp_mark_notifications_read", function (a, ctx) { T("rp_notifications").forEach(function (x) { if (x.account_id === ctx.uid) x.read = true; }); return null; });

  /* ---------- site code (overrides) ---------- */
  var PATH_RE = /^[A-Za-z0-9_-]+\/[A-Za-z0-9_.-]+\.(html|js|css)$/;
  function checkPath(p) { if (!p || !PATH_RE.test(p) || p.indexOf("..") >= 0) fail("Path must look like Folder/file.html (.html, .js or .css)"); if (p === "index/rp-site-loader.js") fail("The site loader cannot be overridden"); }
  L.table("rp_site_files", { cols: { anon: ["path", "content", "version", "enabled", "updated_at"], authenticated: ["path", "content", "version", "enabled", "updated_at"] }, rls: function (r) { return r.enabled; } });
  function hist(path, version, action, note, content, uid) { var h = T("rp_site_file_history"); h.push({ id: L.nid("rp_site_file_history"), path: path, version: version, action: action, note: note, content: content, saved_by: uid, saved_at: now() }); var mine = h.filter(function (x) { return x.path === path; }); if (mine.length > 30) { var drop = mine.slice(0, mine.length - 30); drop.forEach(function (d) { h.splice(h.indexOf(d), 1); }); } }
  function putFile(path, content, note, uid, action) { var t = T("rp_site_files"), f = t.filter(function (x) { return x.path === path; })[0]; if (f) { f.content = content; f.version++; f.enabled = true; f.note = note; f.updated_by = uid; f.updated_at = now(); } else { f = { path: path, content: content, version: 1, enabled: true, note: note, updated_by: uid, updated_at: now() }; t.push(f); } hist(path, f.version, action || "save", note, content, uid); return f.version; }
  L.rpc("rp_list_site_files", function (a, ctx) { L.requireCreator(ctx); return T("rp_site_files").slice().sort(function (x, y) { return x.path < y.path ? -1 : 1; }).map(function (f) { return { path: f.path, version: f.version, enabled: f.enabled, note: f.note, size: f.content.length, updated_at: f.updated_at }; }); });
  L.rpc("rp_get_site_file", function (a, ctx) { L.requireCreator(ctx); var f = T("rp_site_files").filter(function (x) { return x.path === a.p_path; })[0]; return f ? clone(f) : null; });
  L.rpc("rp_save_site_file", function (a, ctx) {
    L.requireCreator(ctx); checkPath(a.p_path); if (a.p_content == null || !String(a.p_content).trim()) fail("File content cannot be empty (use Reset to original instead)"); if (a.p_content.length > 2000000) fail("File is too large (limit 2,000,000 characters)");
    var v = putFile(a.p_path, a.p_content, String(a.p_note || "").slice(0, 200), ctx.uid); L.audit(ctx.uid, "site_file_saved", null, { path: a.p_path, version: v }); return v;
  });
  L.rpc("rp_set_site_file_enabled", function (a, ctx) { L.requireCreator(ctx); var f = T("rp_site_files").filter(function (x) { return x.path === a.p_path; })[0]; if (!f) fail("No override exists for that file"); f.enabled = !!a.p_enabled; f.version++; f.updated_at = now(); return null; });
  L.rpc("rp_reset_site_file", function (a, ctx) { L.requireCreator(ctx); var t = T("rp_site_files"), i = t.findIndex(function (x) { return x.path === a.p_path; }); if (i < 0) fail("No override exists for that file"); var f = t.splice(i, 1)[0]; hist(a.p_path, f.version + 1, "reset", "Reset to the original file", f.content, ctx.uid); return null; });
  L.rpc("rp_site_file_history", function (a, ctx) { L.requireCreator(ctx); return T("rp_site_file_history").filter(function (h) { return h.path === a.p_path; }).sort(function (x, y) { return y.id - x.id; }).slice(0, 30).map(function (h) { return { id: h.id, version: h.version, action: h.action, note: h.note, size: h.content.length, saved_at: h.saved_at }; }); });
  L.rpc("rp_site_file_history_content", function (a, ctx) { L.requireCreator(ctx); var h = T("rp_site_file_history").filter(function (x) { return x.id === Number(a.p_id); })[0]; return h ? h.content : null; });

  /* ---------- coder ---------- */
  var CP = /^[A-Za-z0-9_-]+(\/[A-Za-z0-9_-]+)*(\/[A-Za-z0-9_.-]+\.[A-Za-z0-9]{1,8}|\/\.folder)$|^[A-Za-z0-9_.-]+\.[A-Za-z0-9]{1,8}$/;
  function req(b, ctx) { if (!isDev(b, ctx)) fail("Developer access for this branch is required"); }
  function folderOf(b) { var r = root(b); return FOLDER[r]; }
  L.rpc("rp_coder_list", function (a, ctx) { req(a.p_branch, ctx); return T("rp_coder_files").filter(function (f) { return f.branch === a.p_branch; }).sort(function (x, y) { return x.path < y.path ? -1 : 1; }).map(function (f) { return { path: f.path, size: f.content.length, updated_at: f.updated_at }; }); });
  L.rpc("rp_coder_get", function (a, ctx) { req(a.p_branch, ctx); var f = T("rp_coder_files").filter(function (x) { return x.branch === a.p_branch && x.path === a.p_path; })[0]; return f ? f.content : null; });
  L.rpc("rp_coder_save", function (a, ctx) {
    req(a.p_branch, ctx); if (!CP.test(a.p_path || "") || String(a.p_path).indexOf("..") >= 0) fail("Use letters, numbers, dash, underscore and dot in names"); var content = a.p_content == null ? "" : String(a.p_content); if (content.length > 500000) fail("File is too large");
    var t = T("rp_coder_files"), f = t.filter(function (x) { return x.branch === a.p_branch && x.path === a.p_path; })[0];
    if (!f) { if (t.filter(function (x) { return x.branch === a.p_branch; }).length >= 400) fail("A branch workspace can hold at most 400 files"); f = { branch: a.p_branch, path: a.p_path }; t.push(f); }
    f.content = content; f.updated_by = ctx.uid; f.updated_at = now(); return f.updated_at;
  });
  L.rpc("rp_coder_delete", function (a, ctx) {
    req(a.p_branch, ctx); var t = T("rp_coder_files"), n = 0; for (var i = t.length - 1; i >= 0; i--) { var f = t[i]; if (f.branch === a.p_branch && (f.path === a.p_path || (a.p_folder && f.path.indexOf(a.p_path + "/") === 0))) { t.splice(i, 1); n++; } } return n;
  });
  L.rpc("rp_coder_apply", function (a, ctx) {
    req(a.p_branch, ctx); var fo = folderOf(a.p_branch); if (!/^[A-Za-z0-9_.-]+\.(html|js|css)$/.test(a.p_path || "")) fail("Only top-level .html, .js and .css files can be applied to the live site");
    var f = T("rp_coder_files").filter(function (x) { return x.branch === a.p_branch && x.path === a.p_path; })[0]; if (!f || !f.content.trim()) fail("That file is empty or does not exist");
    var site = fo + "/" + a.p_path; checkPath(site); var v = putFile(site, f.content, String(a.p_note || "Applied from the Coder").slice(0, 200), ctx.uid); L.audit(ctx.uid, "coder_applied", null, { branch: a.p_branch, path: site, version: v }); return v;
  });
  L.rpc("rp_coder_live", function (a, ctx) { req(a.p_branch, ctx); var fo = folderOf(a.p_branch); return T("rp_site_files").filter(function (f) { return f.path.indexOf(fo + "/") === 0; }).map(function (f) { return { path: f.path.slice(fo.length + 1), version: f.version, enabled: f.enabled }; }); });
  L.rpc("rp_coder_unapply", function (a, ctx) {
    req(a.p_branch, ctx); var site = folderOf(a.p_branch) + "/" + a.p_path, t = T("rp_site_files"), i = t.findIndex(function (x) { return x.path === site; }); if (i < 0) fail("That file has no live override");
    var f = t.splice(i, 1)[0]; hist(site, f.version + 1, "reset", "Reset to the original file", f.content, ctx.uid); L.audit(ctx.uid, "coder_unapplied", null, { branch: a.p_branch, path: site }); return null;
  });

  /* ---------- news ---------- */
  function nhash(issue, pw) { var s = "rp-news:" + issue + ":" + String(pw || "").trim().toLowerCase(), h1 = 0xdeadbeef ^ 0, h2 = 0x41c6ce57 ^ 0; for (var i = 0; i < s.length; i++) { var c = s.charCodeAt(i); h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677); } h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909); h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909); return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16); }
  L.table("rp_news_issues", { cols: { anon: ["issue_no", "title", "subtitle", "published_on", "sections", "updated_at"], authenticated: ["issue_no", "title", "subtitle", "published_on", "sections", "updated_at"] }, rls: function (r) { return r.status === "published"; } });
  var SECS = ["welcome", "private_letter", "public_letter", "secret_video", "presentation", "games", "facts", "songs", "announcements", "highlights", "blog", "vlogs", "secrets", "next"];
  function validNews(s) {
    if (!s || typeof s !== "object" || Array.isArray(s)) fail("Sections must be an object"); if (JSON.stringify(s).length > 600000) fail("The issue is too large");
    Object.keys(s).forEach(function (k) { if (SECS.indexOf(k) < 0) fail("Unknown section " + k); });
    ["games", "facts", "songs", "announcements", "highlights", "vlogs"].forEach(function (k) { if (k in s && (!Array.isArray(s[k]) || s[k].length > 50)) fail("Section " + k + " must be a list of at most 50 items"); });
    [].concat(s.games || [], s.songs || [], s.vlogs || []).forEach(function (v) { if (v && typeof v === "object" && v.url && !URL_RE.test(v.url)) fail("Links in news items must start with https://"); });
    if (s.presentation && s.presentation.url && !URL_RE.test(s.presentation.url)) fail("The presentation link must start with https://");
  }
  var iss = function (n) { return T("rp_news_issues").filter(function (x) { return x.issue_no === Number(n); })[0]; };
  var sec = function (n) { return T("rp_news_secrets").filter(function (x) { return x.issue_no === Number(n); })[0]; };
  L.rpc("rp_news_save_issue", function (a, ctx) {
    L.requireCreator(ctx); var n = Number(a.p_issue); if (!(n >= 1 && n <= 9999)) fail("Issue number must be between 1 and 9999"); if (["draft", "published"].indexOf(a.p_status) < 0) fail("Status must be draft or published"); if (!String(a.p_title || "").trim()) fail("An issue title is required");
    validNews(a.p_sections); if (a.p_pdf_url && !URL_RE.test(a.p_pdf_url)) fail("The private letter link must start with https://"); if (a.p_video_url && !URL_RE.test(a.p_video_url)) fail("The secret video link must start with https://");
    var i = iss(n), row = { issue_no: n, title: a.p_title.trim(), subtitle: String(a.p_subtitle || "").slice(0, 200), published_on: a.p_date || now().slice(0, 10), status: a.p_status, sections: clone(a.p_sections), updated_by: ctx.uid, updated_at: now() };
    if (i) Object.keys(row).forEach(function (k) { i[k] = row[k]; }); else T("rp_news_issues").push(row);
    var s = sec(n); if (!s) { s = { issue_no: n, letter_password_hash: "", letter_pdf_url: "", secret_video_url: "", levels_needed: 10 }; T("rp_news_secrets").push(s); }
    if (a.p_password != null && String(a.p_password).trim()) s.letter_password_hash = nhash(n, a.p_password); if (a.p_pdf_url != null) s.letter_pdf_url = a.p_pdf_url; if (a.p_video_url != null) s.secret_video_url = a.p_video_url; if (a.p_levels != null) s.levels_needed = Math.min(Math.max(a.p_levels, 1), 50);
    L.audit(ctx.uid, "news_issue_saved", null, { issue: n, status: a.p_status }); return null;
  });
  L.rpc("rp_news_admin_issues", function (a, ctx) { L.requireCreator(ctx); return T("rp_news_issues").slice().sort(function (x, y) { return y.issue_no - x.issue_no; }).map(function (i) { var s = sec(i.issue_no) || {}; return { issue_no: i.issue_no, title: i.title, subtitle: i.subtitle, published_on: i.published_on, status: i.status, sections: clone(i.sections), has_password: !!s.letter_password_hash, pdf_url: s.letter_pdf_url || "", video_url: s.secret_video_url || "", levels_needed: s.levels_needed || 10 }; }); });
  L.rpc("rp_news_delete_issue", function (a, ctx) { L.requireCreator(ctx); var i = iss(a.p_issue); if (!i) fail("That issue does not exist"); var n = i.issue_no; ["rp_news_issues", "rp_news_secrets", "rp_news_levels"].forEach(function (t) { var x = T(t); for (var j = x.length - 1; j >= 0; j--) if (x[j].issue_no === n) x.splice(j, 1); }); return null; });
  L.rpc("rp_news_unlock_letter", function (a, ctx) {
    if (!ctx.uid) fail("Sign in to unlock the private letter"); var i = iss(a.p_issue); if (!i || i.status !== "published") fail("That issue is not published");
    var at = T("rp_news_attempts"); if (at.filter(function (x) { return x.account_id === ctx.uid && x.issue_no === i.issue_no && new Date(x.at) > Date.now() - 3600000; }).length >= 10) fail("Too many tries. Wait an hour and look for the clue again.");
    var s = sec(i.issue_no); if (!s || !s.letter_password_hash) fail("The private letter is not ready yet");
    if (nhash(i.issue_no, a.p_password) !== s.letter_password_hash) { at.push({ account_id: ctx.uid, issue_no: i.issue_no, at: now() }); fail("Incorrect password. Look for the clue in the newsletter."); }
    if (!s.letter_pdf_url) fail("Password accepted! The publisher has not added the letter yet."); return s.letter_pdf_url;
  });
  var cnt = function (uid, n) { return T("rp_news_levels").filter(function (x) { return x.account_id === uid && x.issue_no === Number(n); }).length; };
  L.rpc("rp_news_mark_level", function (a, ctx) { if (!ctx.uid) fail("Sign in to save level progress"); var i = iss(a.p_issue); if (!i || i.status !== "published") fail("That issue is not published"); var lv = Number(a.p_level); if (!(lv >= 1 && lv <= 50)) fail("Invalid level"); if (!T("rp_news_levels").some(function (x) { return x.account_id === ctx.uid && x.issue_no === i.issue_no && x.level === lv; })) T("rp_news_levels").push({ account_id: ctx.uid, issue_no: i.issue_no, level: lv }); return cnt(ctx.uid, i.issue_no); });
  L.rpc("rp_news_unmark_level", function (a, ctx) { if (!ctx.uid) fail("Sign in to save level progress"); var t = T("rp_news_levels"); for (var j = t.length - 1; j >= 0; j--) if (t[j].account_id === ctx.uid && t[j].issue_no === Number(a.p_issue) && t[j].level === Number(a.p_level)) t.splice(j, 1); return cnt(ctx.uid, a.p_issue); });
  L.rpc("rp_news_my_levels", function (a, ctx) { var s = sec(a.p_issue); return { levels: T("rp_news_levels").filter(function (x) { return x.account_id === ctx.uid && x.issue_no === Number(a.p_issue); }).map(function (x) { return x.level; }).sort(function (x, y) { return x - y; }), needed: s ? s.levels_needed : 10 }; });
  L.rpc("rp_news_claim_video", function (a, ctx) {
    if (!ctx.uid) fail("Sign in to claim the secret video"); var s = sec(a.p_issue); if (!s) fail("No secret video for this issue");
    var n = T("rp_news_levels").filter(function (x) { return x.account_id === ctx.uid && x.issue_no === s.issue_no && x.level <= s.levels_needed; }).length; if (n < s.levels_needed) fail("Complete all " + s.levels_needed + " levels first (you have " + n + ")"); if (!s.secret_video_url) fail("The secret video has not been added yet"); return s.secret_video_url;
  });
  if (!T("rp_news_issues").length) {
    T("rp_news_issues").push({ issue_no: 1, title: "RP Newsletters", subtitle: "The world of RP, delivered.", published_on: "2026-10-21", status: "published", updated_at: now(), sections: {
      welcome: { text: "Welcome to the first edition of RP Newsletters, a publication by Raking Productions.\n\nDiscover company updates, educational facts, games, music, presentations, fictional characters, and hidden secrets.\n\nThis is the first edition. More editions will follow!" },
      private_letter: { text: "A special company letter waiting to be unlocked. Search through this newsletter to discover the password clue." },
      public_letter: { text: "Welcome to RP Newsletters Issue 1!\n\nThis public letter is where Raking Productions shares company progress, projects, milestones, upcoming releases, and other important developments." },
      secret_video: { text: "Ten platformal levels. One secret video. Can you complete the challenge?" }, presentation: { text: "A presentation to learn about RP projects, ideas and company milestones.", url: "" }, games: [],
      facts: [{ title: "Space is not empty", text: "Space is not completely empty; it contains particles and fields." }, { title: "Sunlight takes time", text: "Light from the Sun takes about eight minutes to reach Earth." }, { title: "Three states of water", text: "Water can naturally exist as a solid, liquid, and gas." }, { title: "Underground fungi", text: "Some fungi form extensive underground networks." }, { title: "Proof", text: "A mathematical proof can establish why a result is true." }],
      songs: [], announcements: ["Welcome to the first RP Newsletters edition!", "More announcements will be added as RP projects progress."],
      highlights: ["Explore all 12 sections of Issue 1.", "Discover the private letter password clue.", "Try the 10-level secret video challenge.", "Look out for the next edition."],
      blog: { title: "Behind the Beginning", body: "Every project begins with an idea. RP Newsletters is a place to bring company updates, creativity, educational discoveries, and entertainment together." }, vlogs: [],
      secrets: { text: "Look carefully. Future clues could be hidden in articles, facts, games, character vlogs, and other parts of the publication. More secrets will be revealed in future editions." },
      next: { title: "Issue 2 soon.", text: "New stories. New discoveries. New secrets." } } });
    T("rp_news_secrets").push({ issue_no: 1, letter_password_hash: "", letter_pdf_url: "", secret_video_url: "", levels_needed: 10 });
  }
  L.save();
})();
