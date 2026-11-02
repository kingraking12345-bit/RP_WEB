/* RP local backend, part 6: the branch tree (main branches and sub-branches with their own theme and settings). Port of branches.sql. */
(function () {
  "use strict";
  var L = window.RPLocal, T = L.T, fail = L.fail, now = L.now, clone = L.clone;
  var MAX_DEPTH = 4; /* main branch + up to 3 levels of sub-branches */
  var SEED = [
    ["labs", "Labs", "Science", "Virtual science labs and an experiment scripting studio for physics, chemistry and biology.", "🧪", "#38bdf8", "../Labs/labs.html", 10],
    ["games", "Games", "Entertainment", "Games, events and releases from the RP Games studio.", "🎮", "#8b8cf8", "../Games/games.html", 20],
    ["education", "Education", "Learning", "Courses, degrees and exams, from first lessons to university level.", "🎓", "#4aa3f0", "../Education/education.html", 30],
    ["tools", "Tools", "Utilities", "Practical tools and the Kignity AI assistant.", "🧰", "#3fb7a6", "../Tools/tools.html", 40],
    ["music", "Music", "Creative", "A browser music studio and a showcase for finished tracks.", "🎵", "#e8749f", "../Music/music.html", 50],
    ["community", "Community", "Social", "A social space to share projects, ideas and updates.", "💬", "#4cc38a", "../Community/community.html", 60],
    ["skills", "Skills", "Learning", "Practical skill courses unlocked by your degrees.", "🧠", "#e0a23b", "../Skills/skills.html", 70]];
  var br = function () { return T("rp_branches"); };
  var get = function (s) { return br().filter(function (b) { return b.slug === s; })[0]; };
  function blank(slug, parent) { return { slug: slug, parent: parent || null, name: slug, tagline: "", description: "", icon: "📁", accent: "", tone: "graphite", radius: "rounded", sort: 0, enabled: true, maintenance: false, maintenance_note: "", banner: "", applications_open: true, requires_login: false, link: "", content: "", created_at: now(), updated_at: now() }; }
  SEED.forEach(function (s) { if (!get(s[0])) { var b = blank(s[0], null); b.name = s[1]; b.tagline = s[2]; b.description = s[3]; b.icon = s[4]; b.accent = s[5]; b.link = s[6]; b.sort = s[7]; br().push(b); } });
  var PUB = ["slug", "parent", "name", "tagline", "description", "icon", "accent", "tone", "radius", "sort", "enabled", "maintenance", "maintenance_note", "banner", "applications_open", "requires_login", "link", "content", "updated_at"];
  /* a disabled branch hides its whole subtree from the public */
  function visible(b) { var n = 0; while (b && n++ < 10) { if (!b.enabled) return false; b = b.parent ? get(b.parent) : null; } return true; }
  L.table("rp_branches", { cols: { anon: PUB, authenticated: PUB }, rls: visible });
  function depth(slug) { var n = 0, b = get(slug); while (b && n < 10) { n++; b = b.parent ? get(b.parent) : null; } return n; }
  function descendants(slug) { var out = []; br().forEach(function (b) { if (b.parent === slug) { out.push(b.slug); out = out.concat(descendants(b.slug)); } }); return out; }
  function height(slug) { var h = 0; br().forEach(function (b) { if (b.parent === slug) h = Math.max(h, height(b.slug)); }); return h + 1; }
  var LINK = /^(https:\/\/\S{4,255}|\.\.\/[A-Za-z0-9_.\/?=&#%-]{1,200}|[A-Za-z0-9_-]+\.html([?#][A-Za-z0-9_=&#.%-]*)?)$/;
  L.rpc("rp_save_branch", function (a, ctx) {
    L.requireCreator(ctx); var slug = String(a.p_slug || "").trim().toLowerCase(), ex = get(slug);
    if (!/^[a-z0-9][a-z0-9-]{1,30}$/.test(slug)) fail("The key must be 2 to 31 letters, numbers or dashes");
    var name = String(a.p_name || "").trim(); if (!name || name.length > 60) fail("A name of 1 to 60 characters is required");
    if (a.p_accent && !/^#[0-9a-fA-F]{6}$/.test(a.p_accent)) fail("Accent must be a #rrggbb colour"); if (["graphite", "midnight", "black", "slate"].indexOf(a.p_tone || "graphite") < 0) fail("Unknown background tone"); if (["sharp", "rounded", "soft"].indexOf(a.p_radius || "rounded") < 0) fail("Unknown corner style");
    if (a.p_link && !LINK.test(a.p_link)) fail("The link must be https://… or a page of this site such as ../Games/games.html"); if (String(a.p_description || "").length > 600 || String(a.p_tagline || "").length > 40 || String(a.p_banner || "").length > 300 || String(a.p_maintenance_note || "").length > 300) fail("A text field is too long");
    if (String(a.p_content || "").length > 60000) fail("The page content is too long"); if (String(a.p_icon || "").length > 8) fail("Use one emoji or up to 8 characters as the icon");
    var parent = a.p_parent ? String(a.p_parent).trim().toLowerCase() : null;
    if (ex && !ex.parent) { parent = null; } else {
      if (!parent) fail("Choose the branch this sub-branch belongs to"); if (!get(parent)) fail("The parent branch does not exist"); if (parent === slug || descendants(slug).indexOf(parent) >= 0) fail("A branch cannot sit inside itself");
      if (depth(parent) + (ex ? height(slug) : 1) > MAX_DEPTH) fail("Branches can go " + (MAX_DEPTH - 1) + " levels deep below a main branch");
    }
    var row = { slug: slug, parent: parent, name: name, tagline: String(a.p_tagline || "").trim(), description: String(a.p_description || "").trim(), icon: String(a.p_icon || "📁").trim() || "📁", accent: a.p_accent || "", tone: a.p_tone || "graphite", radius: a.p_radius || "rounded", sort: parseInt(a.p_sort, 10) || 0,
      enabled: a.p_enabled !== false, maintenance: !!a.p_maintenance, maintenance_note: String(a.p_maintenance_note || "").trim(), banner: String(a.p_banner || "").trim(), applications_open: a.p_applications_open !== false, requires_login: !!a.p_requires_login, link: String(a.p_link || "").trim(), content: String(a.p_content || ""), updated_at: now() };
    if (ex) Object.keys(row).forEach(function (k) { ex[k] = row[k]; }); else { row.created_at = now(); br().push(row); }
    L.audit(ctx.uid, ex ? "branch_saved" : "branch_created", null, { slug: slug, parent: parent }); return slug;
  });
  L.rpc("rp_delete_branch", function (a, ctx) {
    L.requireCreator(ctx); var b = get(a.p_slug); if (!b) fail("That branch does not exist"); if (!b.parent) fail("Main branches cannot be deleted. Turn them off instead");
    if (br().some(function (x) { return x.parent === b.slug; })) fail("Delete or move its sub-branches first");
    ["rp_pages", "rp_applications"].forEach(function (t) { var x = T(t); for (var i = x.length - 1; i >= 0; i--) if (x[i].branch === b.slug) x.splice(i, 1); });
    br().splice(br().indexOf(b), 1); L.audit(ctx.uid, "branch_deleted", null, { slug: b.slug }); return null;
  });
  L.rpc("rp_admin_branches", function (a, ctx) { L.requireCreator(ctx); return clone(br().slice().sort(function (x, y) { return x.sort - y.sort || (x.name < y.name ? -1 : 1); })); });
})();
