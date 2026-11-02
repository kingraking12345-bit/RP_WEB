/* RP local backend, part 2: accounts, roles, governance, Creator claim. Port of account-system.sql and account-claim.sql. */
(function () {
  "use strict";
  var L = window.RPLocal, T = L.T, fail = L.fail, now = L.now, clone = L.clone;
  var SYSTEM_ROLES = [["Member", "Default role for new accounts."], ["Creator", "Single owner role for RP-wide governance."], ["Games Studio Director", "Leads the Games branch."], ["Game Employee", "Builds and manages RP Games pages and event previews."], ["Education Studio Director", "Leads the Education branch."], ["Lab Studio Director", "Leads the Labs branch."], ["Tool Studio Director", "Leads the Tools branch."], ["Music Studio Director", "Leads the Music branch."], ["Community Studio Director", "Leads the Community branch."], ["Skills Studio Director", "Leads the Skills branch."], ["Lab Scientist", "Authorized scientist role for the Labs branch."],
    ["Tool Employee", "Builds tools and edits Kignity AI."], ["Music Employee", "Curates the Music branch."], ["Education Employee", "Builds courses for the Education branch."], ["Skills Employee", "Builds skills and courses."], ["Community Employee", "Moderates the Community branch."], ["Labs Employee", "Builds labs and experiments."],
    ["Games Developer", "Dev Team: edits Games code in the Coder."], ["Tools Developer", "Dev Team: edits Tools code in the Coder."], ["Music Developer", "Dev Team: edits Music code in the Coder."], ["Education Developer", "Dev Team: edits Education code in the Coder."], ["Skills Developer", "Dev Team: edits Skills code in the Coder."], ["Community Developer", "Dev Team: edits Community code in the Coder."], ["Labs Developer", "Dev Team: edits Labs code in the Coder."]];
  var AUTH = [["labs", "Labs", "Lab Studio Director"], ["games", "Games", "Games Studio Director"], ["education", "Education", "Education Studio Director"], ["tools", "Tools", "Tool Studio Director"], ["music", "Music", "Music Studio Director"], ["community", "Community", "Community Studio Director"], ["skills", "Skills", "Skills Studio Director"]];
  function seed() {
    var roles = T("rp_roles"); SYSTEM_ROLES.forEach(function (r) { if (!roles.some(function (x) { return x.role_name === r[0]; })) roles.push({ role_name: r[0], description: r[1], permissions: [], is_system: true, created_at: now() }); });
    var ba = T("rp_branch_authority"); AUTH.forEach(function (a) { if (!ba.some(function (x) { return x.branch_key === a[0]; })) ba.push({ branch_key: a[0], branch_name: a[1], director_role: a[2], director_account: null, maintenance: false, updated_at: now() }); });
  }
  seed();

  /* helpers shared with the other local modules */
  L.me = function (ctx) { if (!ctx.uid) return null; return T("rp_accounts").filter(function (a) { return a.id === ctx.uid; })[0] || null; };
  L.active = function (ctx) { var a = L.me(ctx); return a && a.status === "active" ? a : null; };
  L.hasRole = function (ctx, list) { var a = L.active(ctx); return !!(a && a.roles.some(function (r) { return list.indexOf(r) >= 0; })); };
  L.isCreator = function (ctx) { return L.hasRole(ctx, ["Creator"]); };
  L.requireCreator = function (ctx) { if (!L.isCreator(ctx)) fail("Creator role required"); };
  L.audit = function (actor, action, target, details) { T("rp_audit_log").push({ id: L.nid("rp_audit_log"), actor: actor || null, action: action, target_account: target == null ? null : target, details: details || {}, created_at: now() }); };
  L.byNumber = function (n) { return T("rp_accounts").filter(function (a) { return String(a.account_number) === String(n); })[0] || null; };
  L.uniq = function (a) { return a.filter(function (x, i) { return a.indexOf(x) === i; }); };
  L.addRole = function (acc, role) { acc.roles = L.uniq(acc.roles.concat([role])); acc.updated_at = now(); };
  L.ensureRole = function (name, desc) { var roles = T("rp_roles"); if (!roles.some(function (x) { return x.role_name === name; })) roles.push({ role_name: name, description: desc || "", permissions: [], is_system: true, created_at: now() }); };

  L.HOOKS.userCreated.push(function (u) {
    var seq = L.DB().seq; seq.acct = (seq.acct || 10000000) + 1; var number = seq.acct;
    var base = String((u.meta && u.meta.username) || "member").toLowerCase().replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, ""); if (base.length < 2) base = "member";
    var name = base.slice(0, 48); if (T("rp_accounts").some(function (a) { return a.username === name; })) name = base.slice(0, 38) + "-" + number;
    T("rp_accounts").push({ id: u.id, account_number: number, username: name, roles: ["Member"], refane_balance: 0, status: "active", timeout_until: null, created_at: now(), updated_at: now() });
  });

  L.table("rp_accounts", { cols: { authenticated: "*" }, rls: function (r, c) { return r.id === c.uid; } });
  L.table("rp_roles", { cols: { authenticated: "*" } });

  L.rpc("rp_get_account_context", function (a, ctx) {
    var acc = L.me(ctx); if (acc && acc.status === "timeout" && acc.timeout_until && new Date(acc.timeout_until) <= new Date()) { acc.status = "active"; acc.timeout_until = null; acc.updated_at = now(); }
    if (!acc) fail("Account profile is not initialized");
    return { account_number: acc.account_number, username: acc.username, roles: acc.roles, refane_balance: acc.refane_balance, status: acc.status, timeout_until: acc.timeout_until, created_at: acc.created_at };
  });
  var byDesc = function (k) { return function (a, b) { return a[k] < b[k] ? 1 : a[k] > b[k] ? -1 : 0; }; };
  L.rpc("rp_creator_overview", function (a, ctx) {
    L.requireCreator(ctx); var accs = T("rp_accounts");
    return {
      accounts: accs.slice().sort(function (x, y) { return x.account_number - y.account_number; }).map(function (x) { return { account_number: x.account_number, username: x.username, roles: x.roles, refane_balance: x.refane_balance, status: x.status, timeout_until: x.timeout_until, created_at: x.created_at }; }),
      roles: T("rp_roles").slice().sort(function (x, y) { return (y.is_system - x.is_system) || (x.role_name < y.role_name ? -1 : 1); }).map(clone),
      branches: T("rp_branch_authority").slice().sort(function (x, y) { return x.branch_name < y.branch_name ? -1 : 1; }).map(clone),
      budgets: T("rp_branch_budgets").map(clone),
      policies: T("rp_policies").slice().sort(byDesc("created_at")).slice(0, 100).map(clone),
      announcements: T("rp_announcements").slice().sort(byDesc("created_at")).slice(0, 100).map(clone),
      audit: T("rp_audit_log").slice().sort(function (x, y) { return y.id - x.id; }).slice(0, 200).map(clone),
      governance_records: T("rp_governance_records").slice().sort(byDesc("created_at")).slice(0, 200).map(clone),
      account_count: accs.length, active_count: accs.filter(function (x) { return x.status === "active"; }).length
    };
  });
  L.rpc("rp_set_account_role", function (a, ctx) {
    L.requireCreator(ctx); var role = a.p_role_name; if (role === "Creator") fail("Use Creator transfer for the single Creator role");
    if (!T("rp_roles").some(function (r) { return r.role_name === role; })) fail("Unknown role");
    var acc = L.byNumber(a.p_account_number); if (!acc) fail("Account not found");
    acc.roles = a.p_grant ? L.uniq(acc.roles.concat([role])) : acc.roles.filter(function (r) { return r !== role; }); acc.updated_at = now();
    L.audit(ctx.uid, a.p_grant ? "role_granted" : "role_removed", acc.account_number, { role: role });
  });
  L.rpc("rp_set_account_status", function (a, ctx) {
    L.requireCreator(ctx); var st = a.p_status; if (["active", "timeout", "banned"].indexOf(st) < 0) fail("Invalid account status");
    if (st === "timeout" && !a.p_timeout_until) fail("Timeout end time is required");
    if (st === "timeout" && new Date(a.p_timeout_until) <= new Date()) fail("Timeout end time must be in the future");
    var acc = L.byNumber(a.p_account_number); if (!acc) fail("Account not found");
    acc.status = st; acc.timeout_until = st === "timeout" ? a.p_timeout_until : null; acc.updated_at = now();
    L.audit(ctx.uid, "account_status_changed", acc.account_number, { status: st, reason: String(a.p_reason || "").slice(0, 500), timeout_until: a.p_timeout_until || null });
  });
  L.rpc("rp_transfer_creator", function (a, ctx) {
    L.requireCreator(ctx); var target = L.byNumber(a.p_target_account_number); if (!target || target.status !== "active") fail("Active target account not found");
    var old = T("rp_accounts").filter(function (x) { return x.roles.indexOf("Creator") >= 0; })[0]; if (old && old.account_number === target.account_number) fail("That account is already Creator");
    if (old) { old.roles = old.roles.filter(function (r) { return r !== "Creator"; }); old.updated_at = now(); } L.addRole(target, "Creator");
    L.audit(ctx.uid, "creator_transferred", target.account_number, { previous_creator_account: old && old.account_number });
  });
  L.rpc("rp_create_role", function (a, ctx) {
    L.requireCreator(ctx); var n = String(a.p_role_name || "").trim(); if (n.length < 3 || n.length > 60) fail("Role name must be 3 to 60 characters");
    if (T("rp_roles").some(function (r) { return r.role_name === n; })) fail('duplicate key value violates unique constraint "rp_roles_pkey"');
    T("rp_roles").push({ role_name: n, description: String(a.p_description || "").slice(0, 300), permissions: a.p_permissions || [], is_system: false, created_at: now() }); L.audit(ctx.uid, "role_created", null, { role: n });
  });
  L.rpc("rp_assign_branch_director", function (a, ctx) {
    L.requireCreator(ctx); var br = T("rp_branch_authority").filter(function (b) { return b.branch_key === a.p_branch_key; })[0]; if (!br) fail("Unknown branch");
    var target = null; if (a.p_account_number != null) { target = L.byNumber(a.p_account_number); if (!target || target.status !== "active") fail("Active target account not found"); }
    var old = br.director_account; if (old != null) { var o = L.byNumber(old); if (o) { o.roles = o.roles.filter(function (r) { return r !== br.director_role; }); o.updated_at = now(); } }
    br.director_account = a.p_account_number == null ? null : a.p_account_number; br.updated_at = now(); if (target) L.addRole(target, br.director_role);
    L.audit(ctx.uid, "branch_director_changed", a.p_account_number, { branch: a.p_branch_key, previous_account: old, role: br.director_role });
  });
  L.rpc("rp_publish_policy", function (a, ctx) {
    L.requireCreator(ctx); var title = String(a.p_title || "").trim(); if (title.length < 3 || String(a.p_body || "").trim().length < 10) fail("Policy title and body are required");
    var v = T("rp_policies").filter(function (p) { return p.title === title; }).reduce(function (m, p) { return Math.max(m, p.version); }, 0) + 1;
    T("rp_policies").push({ id: L.nid("rp_policies"), title: title.slice(0, 120), policy_type: String(a.p_type || "Policy").slice(0, 40), body: String(a.p_body).slice(0, 20000), version: v, created_by: ctx.uid, created_at: now() });
    L.audit(ctx.uid, "policy_published", null, { title: title.slice(0, 120), version: v });
  });
  L.rpc("rp_broadcast", function (a, ctx) {
    L.requireCreator(ctx); if (String(a.p_title || "").trim().length < 3 || String(a.p_body || "").trim().length < 2) fail("Announcement title and body are required");
    T("rp_announcements").push({ id: L.nid("rp_announcements"), title: String(a.p_title).trim().slice(0, 120), body: String(a.p_body).slice(0, 5000), created_by: ctx.uid, created_at: now() }); L.audit(ctx.uid, "global_broadcast", null, { title: String(a.p_title).trim().slice(0, 120) });
  });
  L.rpc("rp_set_branch_budget", function (a, ctx) {
    L.requireCreator(ctx); var amt = Number(a.p_amount); if (!(amt >= 0) || amt > 1e9) fail("Budget amount is out of range");
    var row = T("rp_branch_budgets").filter(function (b) { return b.branch_key === a.p_branch_key; })[0]; var data = { branch_key: a.p_branch_key, amount: amt, currency: String(a.p_currency || "USD").slice(0, 8).toUpperCase(), notes: String(a.p_notes || "").slice(0, 1000), updated_by: ctx.uid, updated_at: now() };
    if (row) Object.assign(row, data); else T("rp_branch_budgets").push(data); L.audit(ctx.uid, "branch_budget_changed", null, { branch: a.p_branch_key, amount: amt, currency: a.p_currency });
  });
  L.rpc("rp_set_branch_maintenance", function (a, ctx) {
    L.requireCreator(ctx); var br = T("rp_branch_authority").filter(function (b) { return b.branch_key === a.p_branch_key; })[0]; if (!br) fail("Unknown branch");
    br.maintenance = !!a.p_enabled; br.updated_at = now(); L.audit(ctx.uid, "branch_maintenance_changed", null, { branch: a.p_branch_key, enabled: !!a.p_enabled, reason: String(a.p_reason || "").slice(0, 500) });
  });
  var GST = ["draft", "pending", "approved", "rejected", "active", "resolved", "review"], GTY = ["asset", "project_approval", "employment", "governance"];
  L.rpc("rp_create_governance_record", function (a, ctx) {
    L.requireCreator(ctx); if (GTY.indexOf(a.p_type) < 0) fail("Invalid record type"); if (GST.indexOf(a.p_status) < 0) fail("Invalid record status"); var t = String(a.p_title || "").trim(); if (t.length < 3 || t.length > 160) fail("Title must be 3 to 160 characters");
    var id = L.nid("rp_governance_records"); T("rp_governance_records").push({ id: id, record_type: a.p_type, title: t.slice(0, 160), status: a.p_status, details: String(a.p_details || "").slice(0, 8000), created_by: ctx.uid, created_at: now(), updated_at: now() });
    L.audit(ctx.uid, "governance_record_created", null, { record_id: id, type: a.p_type, title: t.slice(0, 160) }); return id;
  });
  L.rpc("rp_update_governance_record", function (a, ctx) {
    L.requireCreator(ctx); if (GST.indexOf(a.p_status) < 0) fail("Invalid record status"); var r = T("rp_governance_records").filter(function (x) { return x.id === a.p_id; })[0]; if (!r) fail("Record not found");
    r.status = a.p_status; r.details = String(a.p_details || "").slice(0, 8000); r.updated_at = now(); L.audit(ctx.uid, "governance_record_updated", null, { record_id: r.id, type: r.record_type, title: r.title, status: a.p_status });
  });
  L.rpc("rp_creator_exists", function () { return T("rp_accounts").some(function (x) { return x.roles.indexOf("Creator") >= 0; }); });
  L.rpc("rp_claim_creator", function (a, ctx) {
    var acc = L.active(ctx); if (!acc) fail("Your account cannot claim the Creator role right now");
    if (T("rp_accounts").some(function (x) { return x.roles.indexOf("Creator") >= 0; })) fail("The Creator role has already been claimed");
    L.addRole(acc, "Creator"); L.audit(ctx.uid, "creator_claimed", acc.account_number, {});
    return L.call("rp_get_account_context", {}, ctx);
  });
  L.rpc("rp_bootstrap_creator_by_username", function () { fail("Not available"); });
})();
