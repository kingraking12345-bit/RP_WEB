/* RP local backend, part 5: Community (feed, comments, likes, follows, reports, moderation). Port of community-content.sql. */
(function () {
  "use strict";
  var L = window.RPLocal, T = L.T, fail = L.fail, now = L.now, clone = L.clone;
  var MODR = ["Creator", "Community Studio Director", "Community Employee"], tk = function (t) { return T("rp_community_" + t); };
  var iso = function (ms) { return new Date(ms).toISOString(); }, ago = function (ms) { return Date.now() - ms; };
  if (!tk("settings").length) tk("settings").push({ id: 1, slow_mode_seconds: 0, read_only: false, images_allowed: true, announcement: "", updated_at: now() });
  var S = function () { return tk("settings")[0]; };
  var isMod = function (ctx) { return L.hasRole(ctx, MODR); };
  var requireMod = function (ctx) { if (!isMod(ctx)) fail("Community moderator role required"); };
  var isStaff = function (id) { var a = T("rp_accounts").filter(function (x) { return x.id === id; })[0]; return !!(a && a.roles.some(function (r) { return MODR.indexOf(r) >= 0; })); };
  var prof = function (id) { return tk("profiles").filter(function (p) { return p.account_id === id; })[0]; };
  var profByName = function (n) { n = String(n || "").trim().toLowerCase(); return tk("profiles").filter(function (p) { return p.username.toLowerCase() === n; })[0]; };
  var lc = function (s) { return String(s || "").toLowerCase(); };
  function ensure(ctx) {
    if (!ctx.uid) fail("Sign in to use Community"); var acc = L.me(ctx); if (!acc) fail("Account profile is not initialized");
    var p = prof(ctx.uid); if (!p) { p = { account_id: ctx.uid, username: acc.username, bio: "", emoji: "🙂", notif_seen_at: now(), created_at: now() }; tk("profiles").push(p); } else if (p.username !== acc.username) p.username = acc.username; return ctx.uid;
  }
  var activeRes = function (id) { var r = tk("restrictions").filter(function (x) { return x.account_id === id; })[0]; return r && (!r.until || new Date(r.until) > Date.now()) ? r : null; };
  function badWord(text) { return tk("words").some(function (w) { var e = w.word.replace(/[.^$*+?()\[\]{}|\\]/g, "\\$&"); return new RegExp("(^|[^a-z0-9_])" + e + "($|[^a-z0-9_])").test(lc(text)); }); }
  function gate(ctx, text, kind) {
    var uid = ensure(ctx), acc = L.me(ctx); if (acc.status !== "active") fail("Your account cannot post right now"); if (isMod(ctx)) return uid;
    var s = S(); if (s.read_only) fail("Community is in read-only mode right now");
    var r = activeRes(uid); if (r) { if (r.kind === "ban") fail("You are banned from Community" + (r.reason ? ": " + r.reason : "")); fail("You are muted until " + (r.until ? r.until.replace("T", " ").slice(0, 16) + " UTC" : "further notice") + (r.reason ? " (" + r.reason + ")" : "")); }
    if (text != null && badWord(text)) fail("Your message contains a word that is not allowed in Community");
    if (kind === "post") {
      var mine = tk("posts").filter(function (p) { return p.author === uid; }), last = mine.reduce(function (m, p) { return Math.max(m, Date.parse(p.created_at)); }, 0);
      if (s.slow_mode_seconds > 0 && last && ago(last) < s.slow_mode_seconds * 1000) fail("Slow mode is on. Wait " + Math.ceil((last + s.slow_mode_seconds * 1000 - Date.now()) / 1000) + " more second(s)");
      if (mine.filter(function (p) { return ago(Date.parse(p.created_at)) < 3600000; }).length >= 20) fail("You are posting too fast. Try again later");
    } else if (kind === "comment") { if (tk("comments").filter(function (c) { return c.author === uid && ago(Date.parse(c.created_at)) < 3600000; }).length >= 60) fail("You are commenting too fast. Try again later"); }
    return uid;
  }
  var author = function (id) { var p = prof(id); return { username: p ? p.username : "[deleted]", emoji: p ? p.emoji : "🙂", staff: isStaff(id) }; };
  var nComments = function (pid) { return tk("comments").filter(function (c) { return c.post_id === pid && !c.removed; }).length; };
  var nLikes = function (pid) { return tk("likes").filter(function (l) { return l.post_id === pid; }).length; };
  function postJson(p, me) {
    return { id: p.id, body: p.body, image: p.image_url || null, pinned: p.pinned, created_at: p.created_at, edited_at: p.edited_at || null, author: author(p.author), likes: nLikes(p.id), comments: nComments(p.id),
      liked: !!me && tk("likes").some(function (l) { return l.post_id === p.id && l.account_id === me; }), saved: !!me && tk("bookmarks").some(function (b) { return b.post_id === p.id && b.account_id === me; }),
      following: !!me && tk("follows").some(function (f) { return f.follower === me && f.followee === p.author; }), mine: !!me && p.author === me };
  }
  function notice(id, kind, msg) { tk("notices").push({ id: L.nid("rp_community_notices"), account_id: id, kind: kind, message: String(msg).slice(0, 300), created_at: now() }); }
  function caudit(ctx, action, target, d) { var a = target && T("rp_accounts").filter(function (x) { return x.id === target; })[0]; L.audit(ctx.uid, action, a ? a.account_number : null, d || {}); }

  L.rpc("rp_community_settings_public", function () { var s = S(); return { slow_mode_seconds: s.slow_mode_seconds, read_only: s.read_only, images_allowed: s.images_allowed, announcement: s.announcement }; });
  L.rpc("rp_community_feed", function (a, ctx) {
    var me = ctx.uid, mode = a.p_mode || "latest", lim = Math.min(Math.max(a.p_limit || 20, 1), 50), tag = lc(String(a.p_tag || "").replace(/^#+|#+$/g, "")).trim() || null, q = String(a.p_query || "").trim() || null, au;
    if (["latest", "following", "trending", "saved", "user"].indexOf(mode) < 0) fail("Unknown feed"); if ((mode === "following" || mode === "saved") && !me) fail("Sign in to see this feed");
    if (mode === "user") { var pp = profByName(a.p_author); if (!pp) return []; au = pp.account_id; }
    var rows = tk("posts").filter(function (p) { return !p.removed; });
    if (mode === "trending") return rows.filter(function (p) { return ago(Date.parse(p.created_at)) < 3 * 86400000; }).map(function (p) { return { p: p, s: nLikes(p.id) * 2 + nComments(p.id) }; }).sort(function (x, y) { return y.s - x.s || y.p.id - x.p.id; }).slice(0, lim).map(function (x) { return postJson(x.p, me); });
    rows = rows.filter(function (p) {
      if (a.p_before != null && !(p.id < a.p_before)) return false;
      if (mode === "following" && !(p.author === me || tk("follows").some(function (f) { return f.follower === me && f.followee === p.author; }))) return false;
      if (mode === "saved" && !tk("bookmarks").some(function (b) { return b.account_id === me && b.post_id === p.id; })) return false; if (mode === "user" && p.author !== au) return false;
      if (tag && !new RegExp("#" + tag.replace(/[.^$*+?()\[\]{}|\\]/g, "\\$&") + "($|[^a-z0-9_])").test(lc(p.body))) return false; if (q && lc(p.body).indexOf(lc(q)) < 0) return false; return true;
    });
    var pin = function (p) { return mode === "latest" && a.p_before == null && p.pinned ? 1 : 0; };
    return rows.sort(function (x, y) { return pin(y) - pin(x) || y.id - x.id; }).slice(0, lim).map(function (p) { return postJson(p, me); });
  });
  L.rpc("rp_community_comments", function (a, ctx) {
    var p = tk("posts").filter(function (x) { return x.id === Number(a.p_post_id) && !x.removed; })[0]; if (!p) return [];
    return tk("comments").filter(function (c) { return c.post_id === p.id && !c.removed; }).sort(function (x, y) { return x.id - y.id; }).slice(0, 300).map(function (c) { return { id: c.id, parent_id: c.parent_id || null, body: c.body, created_at: c.created_at, author: author(c.author), mine: !!ctx.uid && c.author === ctx.uid }; });
  });
  L.rpc("rp_community_profile", function (a, ctx) {
    var p = profByName(a.p_username); if (!p) return null; var id = p.account_id;
    return { username: p.username, emoji: p.emoji, bio: p.bio, staff: isStaff(id), joined: p.created_at, posts: tk("posts").filter(function (x) { return x.author === id && !x.removed; }).length, followers: tk("follows").filter(function (f) { return f.followee === id; }).length, following: tk("follows").filter(function (f) { return f.follower === id; }).length, followed_by_me: !!ctx.uid && tk("follows").some(function (f) { return f.follower === ctx.uid && f.followee === id; }), is_me: ctx.uid === id };
  });
  L.rpc("rp_community_people", function (a) {
    var q = lc(a.p_query || ""); return tk("profiles").filter(function (p) { return !q || lc(p.username).indexOf(q) >= 0; }).map(function (p) { return { p: p, n: tk("follows").filter(function (f) { return f.followee === p.account_id; }).length }; }).sort(function (x, y) { return y.n - x.n || (x.p.username < y.p.username ? -1 : 1); }).slice(0, 20).map(function (x) { return { username: x.p.username, emoji: x.p.emoji, bio: x.p.bio, staff: isStaff(x.p.account_id) }; });
  });
  function unseen(uid, since) { var s = Date.parse(since), mine = tk("posts").filter(function (p) { return p.author === uid; }).map(function (p) { return p.id; }), after = function (x) { return Date.parse(x.created_at) > s; };
    return tk("notices").filter(function (n) { return n.account_id === uid && after(n); }).length + tk("likes").filter(function (l) { return mine.indexOf(l.post_id) >= 0 && l.account_id !== uid && after(l); }).length + tk("comments").filter(function (c) { return mine.indexOf(c.post_id) >= 0 && c.author !== uid && !c.removed && after(c); }).length + tk("follows").filter(function (f) { return f.followee === uid && after(f); }).length; }
  L.rpc("rp_community_me", function (a, ctx) { var uid = ensure(ctx), p = prof(uid), r = activeRes(uid); return { username: p.username, emoji: p.emoji, bio: p.bio, mod: isMod(ctx), restriction: r ? { kind: r.kind, until: r.until, reason: r.reason } : null, unseen: unseen(uid, p.notif_seen_at) }; });
  L.rpc("rp_community_set_profile", function (a, ctx) {
    var uid = ensure(ctx), bio = String(a.p_bio || ""), em = String(a.p_emoji || ""); if (bio.length > 200) fail("Bio is limited to 200 characters"); if (Array.from(em).length < 1 || em.length > 8) fail("Pick one emoji for your avatar");
    if (badWord(bio) && !isMod(ctx)) fail("Your bio contains a word that is not allowed"); var p = prof(uid); p.bio = bio.trim(); p.emoji = em; return null;
  });
  L.rpc("rp_community_notifications", function (a, ctx) {
    if (!ctx.uid) fail("Sign in to see notifications"); var uid = ctx.uid, out = [], mine = tk("posts").filter(function (p) { return p.author === uid; });
    tk("notices").filter(function (n) { return n.account_id === uid; }).forEach(function (n) { out.push({ type: "notice", sub: n.kind, text: n.message, post_id: null, who: null, at: n.created_at }); });
    tk("likes").forEach(function (l) { var p = mine.filter(function (x) { return x.id === l.post_id && !x.removed; })[0]; if (p && l.account_id !== uid && prof(l.account_id)) out.push({ type: "like", sub: null, text: p.body.slice(0, 80), post_id: p.id, who: prof(l.account_id).username, at: l.created_at }); });
    tk("comments").forEach(function (c) { var p = mine.filter(function (x) { return x.id === c.post_id && !x.removed; })[0]; if (p && c.author !== uid && !c.removed && prof(c.author)) out.push({ type: "comment", sub: null, text: c.body.slice(0, 80), post_id: c.post_id, who: prof(c.author).username, at: c.created_at }); });
    tk("follows").filter(function (f) { return f.followee === uid && prof(f.follower); }).forEach(function (f) { out.push({ type: "follow", sub: null, text: null, post_id: null, who: prof(f.follower).username, at: f.created_at }); });
    return out.sort(function (x, y) { return x.at < y.at ? 1 : -1; }).slice(0, 40);
  });
  L.rpc("rp_community_mark_seen", function (a, ctx) { var p = ctx.uid && prof(ctx.uid); if (p) p.notif_seen_at = now(); return null; });

  L.rpc("rp_community_post", function (a, ctx) {
    var body = String(a.p_body || "").trim(), img = String(a.p_image || "").trim() || null; if (body.length < 1 || body.length > 2000) fail("Posts must be 1 to 2000 characters");
    var uid = gate(ctx, body, "post");
    if (img) { if (!S().images_allowed && !isMod(ctx)) fail("Images are turned off right now"); if (!/^https:\/\/[^\s<>"']+$/.test(img) || img.length > 500) fail("Image address must be an https:// link"); }
    var id = L.nid("rp_community_posts"); tk("posts").push({ id: id, author: uid, body: body, image_url: img, pinned: false, removed: false, removed_reason: null, removed_by: null, created_at: now(), edited_at: null }); return id;
  });
  L.rpc("rp_community_edit_post", function (a, ctx) {
    var body = String(a.p_body || "").trim(); if (body.length < 1 || body.length > 2000) fail("Posts must be 1 to 2000 characters"); var uid = gate(ctx, body, "edit");
    var p = tk("posts").filter(function (x) { return x.id === Number(a.p_id) && x.author === uid && !x.removed; })[0]; if (!p) fail("You can only edit your own posts"); p.body = body; p.edited_at = now(); return null;
  });
  L.rpc("rp_community_comment", function (a, ctx) {
    var body = String(a.p_body || "").trim(); if (body.length < 1 || body.length > 500) fail("Comments must be 1 to 500 characters"); var uid = gate(ctx, body, "comment"), pid = Number(a.p_post_id);
    if (!tk("posts").some(function (p) { return p.id === pid && !p.removed; })) fail("That post is no longer available");
    if (a.p_parent != null && !tk("comments").some(function (c) { return c.id === Number(a.p_parent) && c.post_id === pid && !c.parent_id && !c.removed; })) fail("You can only reply to a top-level comment");
    var id = L.nid("rp_community_comments"); tk("comments").push({ id: id, post_id: pid, parent_id: a.p_parent != null ? Number(a.p_parent) : null, author: uid, body: body, removed: false, removed_reason: null, removed_by: null, created_at: now() }); return id;
  });
  L.rpc("rp_community_delete_own", function (a, ctx) {
    if (!ctx.uid) fail("Sign in first"); var t = a.p_type === "post" ? "posts" : a.p_type === "comment" ? "comments" : null; if (!t) fail("Unknown type");
    var r = tk(t).filter(function (x) { return x.id === Number(a.p_id) && x.author === ctx.uid && !x.removed; })[0]; if (!r) fail("Nothing to delete"); r.removed = true; r.removed_reason = "Deleted by author"; r.removed_by = ctx.uid; if (t === "posts") r.pinned = false; return null;
  });
  L.rpc("rp_community_like", function (a, ctx) {
    var uid = ensure(ctx), pid = Number(a.p_post_id); if (!tk("posts").some(function (p) { return p.id === pid && !p.removed; })) fail("That post is no longer available");
    if (a.p_on) { if (tk("likes").filter(function (l) { return l.account_id === uid && ago(Date.parse(l.created_at)) < 3600000; }).length >= 200) fail("Too many likes. Slow down"); if (!tk("likes").some(function (l) { return l.post_id === pid && l.account_id === uid; })) tk("likes").push({ post_id: pid, account_id: uid, created_at: now() }); }
    else { var t = tk("likes"); for (var i = t.length - 1; i >= 0; i--) if (t[i].post_id === pid && t[i].account_id === uid) t.splice(i, 1); } return null;
  });
  L.rpc("rp_community_save", function (a, ctx) {
    var uid = ensure(ctx), pid = Number(a.p_post_id);
    if (a.p_on) { if (!tk("posts").some(function (p) { return p.id === pid && !p.removed; })) fail("That post is no longer available"); if (!tk("bookmarks").some(function (b) { return b.post_id === pid && b.account_id === uid; })) tk("bookmarks").push({ account_id: uid, post_id: pid, created_at: now() }); }
    else { var t = tk("bookmarks"); for (var i = t.length - 1; i >= 0; i--) if (t[i].post_id === pid && t[i].account_id === uid) t.splice(i, 1); } return null;
  });
  L.rpc("rp_community_follow", function (a, ctx) {
    var uid = ensure(ctx), tp = profByName(a.p_username); if (!tp) fail("That member does not exist"); if (tp.account_id === uid) fail("You cannot follow yourself");
    if (a.p_on) { if (tk("follows").filter(function (f) { return f.follower === uid; }).length >= 2000) fail("You follow too many members"); if (!tk("follows").some(function (f) { return f.follower === uid && f.followee === tp.account_id; })) tk("follows").push({ follower: uid, followee: tp.account_id, created_at: now() }); }
    else { var t = tk("follows"); for (var i = t.length - 1; i >= 0; i--) if (t[i].follower === uid && t[i].followee === tp.account_id) t.splice(i, 1); } return null;
  });
  var REASONS = ["spam", "harassment", "hate", "sexual", "violence", "scam", "privacy", "other"];
  L.rpc("rp_community_report", function (a, ctx) {
    var uid = ensure(ctx), owner, ty = a.p_type, id = String(a.p_id);
    if (ty === "post" && /^[0-9]{1,18}$/.test(id)) { var p = tk("posts").filter(function (x) { return x.id === +id && !x.removed; })[0]; owner = p && p.author; }
    else if (ty === "comment" && /^[0-9]{1,18}$/.test(id)) { var c = tk("comments").filter(function (x) { return x.id === +id && !x.removed; })[0]; owner = c && c.author; }
    else if (ty === "user") { var u = profByName(id); owner = u && u.account_id; } else fail("Unknown report type");
    if (!owner) fail("That content is no longer available"); if (owner === uid) fail("You cannot report your own content"); if (String(a.p_details || "").length > 500) fail("Details are limited to 500 characters"); if (REASONS.indexOf(a.p_reason) < 0) fail("Pick a reason");
    var tid = ty === "user" ? lc(id) : id; if (tk("reports").some(function (r) { return r.reporter === uid && r.target_type === ty && r.target_id === tid && r.status === "open"; })) fail("You already reported this. A moderator will review it");
    if (tk("reports").filter(function (r) { return r.reporter === uid && ago(Date.parse(r.created_at)) < 86400000; }).length >= 20) fail("You have sent many reports today. Please wait");
    tk("reports").push({ id: L.nid("rp_community_reports"), reporter: uid, target_type: ty, target_id: tid, reason: a.p_reason, details: String(a.p_details || "").trim(), status: "open", resolution: null, handled_by: null, handled_at: null, created_at: now() }); return null;
  });

  /* ---------- moderation ---------- */
  function removeItem(ctx, type, id, reason) {
    var t = type === "post" ? "posts" : type === "comment" ? "comments" : null; if (!t) fail("Unknown type"); var r = tk(t).filter(function (x) { return x.id === Number(id) && !x.removed; })[0]; if (!r) fail("That item was already removed or does not exist");
    r.removed = true; r.removed_reason = String(reason || "").slice(0, 200); r.removed_by = ctx.uid; if (t === "posts") r.pinned = false;
    notice(r.author, "removed", "A moderator removed your " + type + (reason ? ": " + reason : ".")); caudit(ctx, "community_removed_" + type, r.author, { id: id, reason: String(reason || "").slice(0, 200) });
    tk("reports").forEach(function (x) { if (x.status === "open" && x.target_type === type && x.target_id === String(id)) { x.status = "actioned"; x.resolution = "Removed"; x.handled_by = ctx.uid; x.handled_at = now(); } }); return r.author;
  }
  function restrict(ctx, target, kind, hours, reason, purge) {
    if (["mute", "ban"].indexOf(kind) < 0) fail("Unknown restriction"); if (target === ctx.uid) fail("You cannot restrict yourself"); if (isStaff(target) && !L.isCreator(ctx)) fail("Only the Creator can restrict staff");
    var until = null; if (hours != null) { if (hours < 1 || hours > 8760) fail("Duration must be between 1 hour and 1 year"); until = iso(Date.now() + hours * 3600000); } else if (kind === "mute") fail("A mute needs a duration in hours (use a ban for permanent)");
    var t = tk("restrictions"), r = t.filter(function (x) { return x.account_id === target; })[0], row = { account_id: target, kind: kind, until: until, reason: String(reason || "").slice(0, 200), set_by: ctx.uid, set_at: now() }; if (r) Object.keys(row).forEach(function (k) { r[k] = row[k]; }); else t.push(row);
    if (purge) { tk("posts").forEach(function (p) { if (p.author === target && !p.removed) { p.removed = true; p.removed_reason = "Removed with ban"; p.removed_by = ctx.uid; p.pinned = false; } }); tk("comments").forEach(function (c) { if (c.author === target && !c.removed) { c.removed = true; c.removed_reason = "Removed with ban"; c.removed_by = ctx.uid; } }); }
    notice(target, "restricted", (kind === "ban" ? "You were banned from Community" : "You were muted in Community") + (until ? " until " + until.replace("T", " ").slice(0, 16) + " UTC" : " permanently") + (reason ? ": " + reason : ".")); caudit(ctx, "community_" + kind, target, { hours: hours, reason: String(reason || "").slice(0, 200), purged: !!purge });
  }
  L.rpc("rp_mod_overview", function (a, ctx) {
    requireMod(ctx); var day = function (x) { return ago(Date.parse(x.created_at)) < 86400000; };
    return { open_reports: tk("reports").filter(function (r) { return r.status === "open"; }).length, posts_today: tk("posts").filter(function (p) { return day(p) && !p.removed; }).length, comments_today: tk("comments").filter(function (p) { return day(p) && !p.removed; }).length,
      removed_today: tk("posts").concat(tk("comments")).filter(function (p) { return day(p) && p.removed && p.removed_by !== p.author; }).length, members: tk("profiles").length, restricted: tk("restrictions").filter(function (r) { return !r.until || new Date(r.until) > Date.now(); }).length, settings: L.RPC.rp_community_settings_public({}, ctx) };
  });
  L.rpc("rp_mod_reports", function (a, ctx) {
    requireMod(ctx); var st = a.p_status || "open", un = function (id) { var p = prof(id); return p ? p.username : null; };
    return tk("reports").filter(function (r) { return (st === "open" && r.status === "open") || (st === "handled" && r.status !== "open"); }).sort(function (x, y) { return y.id - x.id; }).slice(0, Math.min(Math.max(a.p_limit || 50, 1), 100)).map(function (r) {
      var tg = null; if (r.target_type === "post") { var p = tk("posts").filter(function (x) { return x.id === +r.target_id; })[0]; if (p) tg = { text: p.body, image: p.image_url, removed: p.removed, author: un(p.author) }; } else if (r.target_type === "comment") { var c = tk("comments").filter(function (x) { return x.id === +r.target_id; })[0]; if (c) tg = { text: c.body, removed: c.removed, post_id: c.post_id, author: un(c.author) }; } else { var u = profByName(r.target_id); if (u) tg = { author: u.username, text: u.bio }; }
      var h = r.handled_by && T("rp_accounts").filter(function (x) { return x.id === r.handled_by; })[0];
      return { id: r.id, target_type: r.target_type, target_id: r.target_id, reason: r.reason, details: r.details, status: r.status, resolution: r.resolution, created_at: r.created_at, handled_at: r.handled_at, reporter: un(r.reporter), handled_by: h ? h.username : null, open_for_target: tk("reports").filter(function (o) { return o.target_type === r.target_type && o.target_id === r.target_id && o.status === "open"; }).length, target: tg };
    });
  });
  L.rpc("rp_mod_resolve_report", function (a, ctx) {
    requireMod(ctx); var r = tk("reports").filter(function (x) { return x.id === Number(a.p_id); })[0]; if (!r) fail("Report not found"); if (r.status !== "open") fail("This report was already handled"); var note = String(a.p_note || ""), act = a.p_action;
    if (act === "dismiss") { r.status = "dismissed"; r.resolution = "Dismissed" + (note ? ": " + note : ""); r.handled_by = ctx.uid; r.handled_at = now(); caudit(ctx, "community_report_dismissed", null, { report: r.id }); return null; }
    var owner; if (r.target_type === "user") { var u = profByName(r.target_id); owner = u && u.account_id; } else { var it = tk(r.target_type === "post" ? "posts" : "comments").filter(function (x) { return x.id === +r.target_id; })[0]; owner = it && it.author; }
    if (!owner) fail("The reported content no longer exists. Dismiss the report");
    if (act === "remove") { if (r.target_type === "user") fail("Choose warn, mute or ban for a member report"); removeItem(ctx, r.target_type, r.target_id, note || r.reason); }
    else if (act === "warn") { notice(owner, "warning", "Community warning (" + r.reason + ")" + (note ? ": " + note : ".")); caudit(ctx, "community_warned", owner, { report: r.id, note: note.slice(0, 200) }); }
    else if (act === "mute" || act === "ban") { restrict(ctx, owner, act, a.p_hours == null ? null : a.p_hours, note || r.reason, false); if (r.target_type !== "user") removeItem(ctx, r.target_type, r.target_id, note || r.reason); } else fail("Unknown action");
    tk("reports").forEach(function (x) { if (x.id === r.id || (x.status === "open" && x.target_type === r.target_type && x.target_id === r.target_id)) { x.status = "actioned"; x.resolution = act.charAt(0).toUpperCase() + act.slice(1) + (note ? ": " + note : ""); x.handled_by = ctx.uid; x.handled_at = now(); } }); return null;
  });
  L.rpc("rp_mod_content", function (a, ctx) {
    requireMod(ctx); var q = lc(a.p_query || ""), rem = !!a.p_removed, lim = Math.min(Math.max(a.p_limit || 40, 1), 100), un = function (id) { var p = prof(id); return p ? p.username : ""; };
    var hit = function (x) { return !q || lc(x.body).indexOf(q) >= 0 || lc(un(x.author)).indexOf(q) >= 0; };
    if (a.p_type === "comment") return tk("comments").filter(function (c) { return c.removed === rem && hit(c); }).sort(function (x, y) { return y.id - x.id; }).slice(0, lim).map(function (c) { return { id: c.id, post_id: c.post_id, text: c.body, author: un(c.author), created_at: c.created_at, removed: c.removed, removed_reason: c.removed_reason }; });
    return tk("posts").filter(function (p) { return p.removed === rem && hit(p); }).sort(function (x, y) { return y.id - x.id; }).slice(0, lim).map(function (p) { return { id: p.id, text: p.body, image: p.image_url, author: un(p.author), created_at: p.created_at, removed: p.removed, removed_reason: p.removed_reason, pinned: p.pinned, likes: nLikes(p.id), comments: nComments(p.id) }; });
  });
  L.rpc("rp_mod_remove", function (a, ctx) { requireMod(ctx); removeItem(ctx, a.p_type, a.p_id, a.p_reason); return null; });
  L.rpc("rp_mod_restore", function (a, ctx) {
    requireMod(ctx); var t = a.p_type === "post" ? "posts" : a.p_type === "comment" ? "comments" : null; if (!t) fail("Unknown type"); var r = tk(t).filter(function (x) { return x.id === Number(a.p_id) && x.removed; })[0]; if (!r) fail("Nothing to restore");
    r.removed = false; r.removed_reason = null; r.removed_by = null; notice(r.author, "restored", "A moderator restored your " + a.p_type + "."); caudit(ctx, "community_restored_" + a.p_type, r.author, { id: a.p_id }); return null;
  });
  L.rpc("rp_mod_pin", function (a, ctx) {
    requireMod(ctx); if (a.p_on && tk("posts").filter(function (p) { return p.pinned && !p.removed; }).length >= 3) fail("Only 3 posts can be pinned. Unpin one first"); var p = tk("posts").filter(function (x) { return x.id === Number(a.p_id) && !x.removed; })[0]; if (!p) fail("Post not found");
    p.pinned = !!a.p_on; caudit(ctx, a.p_on ? "community_pinned" : "community_unpinned", p.author, { id: a.p_id }); return null;
  });
  L.rpc("rp_mod_member", function (a, ctx) {
    requireMod(ctx); var p = profByName(a.p_username); if (!p) return null; var id = p.account_id, r = tk("restrictions").filter(function (x) { return x.account_id === id; })[0], posts = tk("posts").filter(function (x) { return x.author === id; });
    var ids = posts.map(function (x) { return String(x.id); }), cids = tk("comments").filter(function (x) { return x.author === id; }).map(function (x) { return String(x.id); });
    return { username: p.username, emoji: p.emoji, bio: p.bio, joined: p.created_at, staff: isStaff(id), restriction: r ? { kind: r.kind, until: r.until, reason: r.reason, active: !r.until || new Date(r.until) > Date.now(), set_at: r.set_at } : null, posts: posts.length, removed_posts: posts.filter(function (x) { return x.removed; }).length, comments: cids.length,
      reports_against: tk("reports").filter(function (x) { return (x.target_type === "user" && x.target_id === lc(p.username)) || (x.target_type === "post" && ids.indexOf(x.target_id) >= 0) || (x.target_type === "comment" && cids.indexOf(x.target_id) >= 0); }).length,
      recent: posts.slice().sort(function (x, y) { return y.id - x.id; }).slice(0, 8).map(function (x) { return { id: x.id, text: x.body.slice(0, 160), removed: x.removed, created_at: x.created_at }; }), notices: tk("notices").filter(function (x) { return x.account_id === id; }).sort(function (x, y) { return y.id - x.id; }).slice(0, 8).map(function (x) { return { kind: x.kind, message: x.message, created_at: x.created_at }; }) };
  });
  L.rpc("rp_mod_restrictions", function (a, ctx) { requireMod(ctx); return tk("restrictions").filter(function (r) { return (!r.until || new Date(r.until) > Date.now()) && prof(r.account_id); }).sort(function (x, y) { return x.set_at < y.set_at ? 1 : -1; }).map(function (r) { return { username: prof(r.account_id).username, kind: r.kind, until: r.until, reason: r.reason, set_at: r.set_at }; }); });
  L.rpc("rp_mod_restrict", function (a, ctx) { requireMod(ctx); var p = profByName(a.p_username); if (!p) fail("No Community member with that username"); restrict(ctx, p.account_id, a.p_kind, a.p_hours == null ? null : a.p_hours, a.p_reason, !!a.p_purge); return null; });
  L.rpc("rp_mod_unrestrict", function (a, ctx) {
    requireMod(ctx); var p = profByName(a.p_username); if (!p) fail("No Community member with that username"); var t = tk("restrictions"), i = t.findIndex(function (x) { return x.account_id === p.account_id; }); if (i < 0) fail("That member has no restriction");
    t.splice(i, 1); notice(p.account_id, "lifted", "Your Community restriction was lifted."); caudit(ctx, "community_restriction_lifted", p.account_id, {}); return null;
  });
  L.rpc("rp_mod_warn", function (a, ctx) {
    requireMod(ctx); var m = String(a.p_message || "").trim(); if (m.length < 3 || m.length > 250) fail("Write a warning of 3 to 250 characters"); var p = profByName(a.p_username); if (!p) fail("No Community member with that username");
    notice(p.account_id, "warning", "Community warning: " + m); caudit(ctx, "community_warned", p.account_id, { note: m.slice(0, 200) }); return null;
  });
  L.rpc("rp_mod_set_settings", function (a, ctx) {
    requireMod(ctx); if (a.p_slow == null || a.p_slow < 0 || a.p_slow > 3600) fail("Slow mode must be 0 to 3600 seconds"); if (String(a.p_announcement || "").length > 300) fail("Announcement is limited to 300 characters");
    var s = S(); s.slow_mode_seconds = a.p_slow; s.read_only = !!a.p_read_only; s.images_allowed = a.p_images !== false; s.announcement = String(a.p_announcement || "").trim(); s.updated_at = now(); caudit(ctx, "community_settings_changed", null, { slow: a.p_slow, read_only: a.p_read_only, images: a.p_images }); return null;
  });
  L.rpc("rp_mod_words", function (a, ctx) { requireMod(ctx); return tk("words").map(function (w) { return w.word; }).sort(); });
  L.rpc("rp_mod_word_add", function (a, ctx) { requireMod(ctx); var v = lc(String(a.p_word || "").trim()); if (v.length < 2 || v.length > 40) fail("Words must be 2 to 40 characters"); if (tk("words").length >= 500) fail("The word list is full (500)"); if (!tk("words").some(function (w) { return w.word === v; })) tk("words").push({ word: v }); caudit(ctx, "community_word_added", null, { word: v }); return null; });
  L.rpc("rp_mod_word_remove", function (a, ctx) { requireMod(ctx); var v = lc(String(a.p_word || "").trim()), t = tk("words"), i = t.findIndex(function (w) { return w.word === v; }); if (i >= 0) t.splice(i, 1); caudit(ctx, "community_word_removed", null, { word: v }); return null; });
  L.rpc("rp_mod_log", function (a, ctx) {
    requireMod(ctx); var acc = T("rp_accounts"), un = function (f, v) { var x = acc.filter(function (y) { return y[f] === v; })[0]; return x ? x.username : null; };
    return T("rp_audit_log").filter(function (l) { return l.action.indexOf("community_") === 0; }).sort(function (x, y) { return y.id - x.id; }).slice(0, Math.min(Math.max(a.p_limit || 100, 1), 200)).map(function (l) { return { id: l.id, action: l.action, details: l.details, created_at: l.created_at, actor: un("id", l.actor), target: un("account_number", l.target_account) }; });
  });
})();
