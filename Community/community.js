(() => {
  "use strict";
  const SB_URL = "https://nesxcgymsgegkqjhfydx.supabase.co", SB_KEY = "sb_publishable_Tj4frYyU-iAylsH_--y3Qg_esNYqce-", SESSION_KEY = "sb-nesxcgymsgegkqjhfydx-auth-token";
  const $ = id => document.getElementById(id);
  const EMOJIS = ["🙂", "😎", "🤖", "🦊", "🐼", "🐯", "🦄", "🐸", "🚀", "🎮", "🎧", "📚", "🛠️", "🌟", "🔥", "🎨"];
  const S = { me: null, view: "feed", mode: "latest", tag: "", q: "", posts: [], more: false, loading: false, settings: { slow_mode_seconds: 0, read_only: false, images_allowed: true, announcement: "" }, profile: null, openComments: new Set(), reportTarget: null, offline: false };
  function el(tag, attrs = {}, ...kids) { const n = document.createElement(tag); Object.entries(attrs).forEach(([k, v]) => { if (k === "text") n.textContent = v; else if (k === "class") n.className = v; else n.setAttribute(k, v); }); kids.forEach(c => n.append(c)); return n; }
  const btn = (label, fn, cls) => { const b = el("button", { type: "button", text: label }); b.className = cls || "btn small"; b.addEventListener("click", fn); return b; };

  /* ---------- network ---------- */
  function auth() { let s = null; try { s = JSON.parse(localStorage.getItem(SESSION_KEY) || "null"); } catch { return { state: "out" }; } const t = s && typeof s.access_token === "string" ? s.access_token : ""; if (!t) return { state: "out" }; if (Number(s.expires_at) * 1000 < Date.now()) return { state: "expired" }; return { state: "in", token: t }; }
  async function rpc(name, body) {
    const a = auth(), headers = { apikey: SB_KEY, "Content-Type": "application/json" }; if (a.state === "in") headers.Authorization = "Bearer " + a.token;
    let r; try { r = await fetch(SB_URL + "/rest/v1/rpc/" + name, { method: "POST", headers, body: JSON.stringify(body || {}), cache: "no-store" }); } catch { S.offline = true; throw new Error("You appear to be offline."); }
    S.offline = false; let data = null; try { data = await r.json(); } catch { /* none */ }
    if (!r.ok) { const m = (data && (data.message || data.error)) || "HTTP " + r.status; throw new Error(/schema cache|Could not find the function/i.test(m) ? "Community is not set up yet. Ask an employee to run community-content.sql." : /JWT/i.test(m) ? "Your sign-in expired. Open the main page to sign in again." : m); }
    return data;
  }
  const signedIn = () => !!S.me;
  function needSignIn() { const n = $("statusBanner"); n.hidden = false; n.textContent = auth().state === "expired" ? "Your sign-in expired. Open the main page to sign in again." : "Sign in on the main page to do that."; setTimeout(() => { n.hidden = true; }, 4000); }
  async function act(fn) { try { await fn(); return true; } catch (e) { const n = $("statusBanner"); n.hidden = false; n.textContent = e.message; setTimeout(() => { n.hidden = true; }, 6000); return false; } }

  /* ---------- text rendering (no innerHTML) ---------- */
  function richText(text) {
    const frag = document.createDocumentFragment(); const re = /(https:\/\/[^\s<>"']+|#[A-Za-z0-9_]{2,30}|@[A-Za-z0-9_.-]{2,30})/g; let last = 0, m;
    while ((m = re.exec(text))) {
      if (m.index > last) frag.append(text.slice(last, m.index)); const t = m[0];
      if (t[0] === "#") frag.append(btn(t, () => { S.view = "feed"; S.mode = "latest"; S.tag = t.slice(1); S.q = ""; refreshFeed(); }, "tag"));
      else if (t[0] === "@") frag.append(btn(t, () => openProfile(t.slice(1)), "men"));
      else { let u = ""; try { u = new URL(t).href; } catch { /* ignore */ } frag.append(u ? el("a", { href: u, target: "_blank", rel: "noopener noreferrer nofollow ugc", text: t }) : t); }
      last = m.index + t.length;
    }
    if (last < text.length) frag.append(text.slice(last)); return frag;
  }
  function ago(iso) { const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000); if (s < 60) return "just now"; if (s < 3600) return Math.floor(s / 60) + "m"; if (s < 86400) return Math.floor(s / 3600) + "h"; if (s < 604800) return Math.floor(s / 86400) + "d"; return new Date(iso).toLocaleDateString(); }
  const who = (a, sub) => el("div", { class: "who" }, el("div", { class: "av", text: a.emoji || "🙂" }), el("div", {}, (() => { const n = el("button", { type: "button", class: "name", text: a.username }); n.addEventListener("click", () => openProfile(a.username)); if (a.staff) n.after(""); return n; })(), a.staff ? el("span", { class: "staff", text: "Staff" }) : "", el("div", { class: "muted", text: sub })));

  /* ---------- posts ---------- */
  function postCard(p) {
    const card = el("article", { class: "card post" + (p.pinned ? " pinned" : ""), "data-id": String(p.id) });
    if (p.pinned) card.append(el("div", { class: "pin", text: "📌 Pinned by moderators" }));
    const head = who(p.author, ago(p.created_at) + (p.edited_at ? " · edited" : "")); card.append(head);
    const body = el("div", { class: "body" }); body.append(richText(p.body)); card.append(body);
    if (p.image) { const img = el("img", { class: "pimg", alt: "Image attached to the post", loading: "lazy", referrerpolicy: "no-referrer", src: p.image }); img.addEventListener("error", () => img.replaceWith(el("div", { class: "muted", text: "[image could not be loaded]" }))); card.append(img); }
    const likeB = el("button", { type: "button", class: "act like" + (p.liked ? " on" : ""), text: (p.liked ? "♥ " : "♡ ") + p.likes });
    likeB.addEventListener("click", async () => { if (!signedIn()) return needSignIn(); const on = !p.liked; if (await act(() => rpc("rp_community_like", { p_post_id: p.id, p_on: on }))) { p.liked = on; p.likes += on ? 1 : -1; likeB.className = "act like" + (on ? " on" : ""); likeB.textContent = (on ? "♥ " : "♡ ") + p.likes; } });
    const cmB = el("button", { type: "button", class: "act", text: "💬 " + p.comments }); cmB.addEventListener("click", () => toggleComments(p, card, cmB));
    const saveB = el("button", { type: "button", class: "act" + (p.saved ? " on" : ""), text: p.saved ? "🔖 Saved" : "🔖 Save" });
    saveB.addEventListener("click", async () => { if (!signedIn()) return needSignIn(); const on = !p.saved; if (await act(() => rpc("rp_community_save", { p_post_id: p.id, p_on: on }))) { p.saved = on; saveB.className = "act" + (on ? " on" : ""); saveB.textContent = on ? "🔖 Saved" : "🔖 Save"; if (!on && S.mode === "saved") card.remove(); } });
    const actions = el("div", { class: "actions" }, likeB, cmB, saveB);
    if (p.mine) {
      actions.append(btn("Edit", () => editPost(p, card, body), "act"), btn("Delete", async () => { if (!confirm("Delete this post?")) return; if (await act(() => rpc("rp_community_delete_own", { p_type: "post", p_id: p.id }))) card.remove(); }, "act"));
    } else {
      if (!p.following && signedIn()) actions.append(btn("Follow @" + p.author.username, async () => { if (await act(() => rpc("rp_community_follow", { p_username: p.author.username, p_on: true }))) { S.posts.forEach(x => { if (x.author.username === p.author.username) x.following = true; }); renderFeedList(); loadPeople(); } }, "act"));
      actions.append(btn("⚑ Report", () => openReport("post", String(p.id)), "act"));
    }
    card.append(actions); if (S.openComments.has(p.id)) toggleComments(p, card, cmB, true); return card;
  }
  function editPost(p, card, bodyEl) {
    const ta = el("textarea", { maxlength: "2000", rows: "4" }); ta.value = p.body; ta.style.cssText = "width:100%;background:#081525;border:1px solid var(--border);border-radius:8px;padding:10px"; const msg = el("p", { class: "msg" });
    const wrap = el("div", {}, ta, msg, el("div", { class: "row" }, btn("Save", async () => { if (await act(async () => { await rpc("rp_community_edit_post", { p_id: p.id, p_body: ta.value }); p.body = ta.value.trim(); p.edited_at = new Date().toISOString(); })) { renderFeedList(); } }, "btn small primary"), btn("Cancel", () => wrap.replaceWith(bodyEl), "btn small")));
    bodyEl.replaceWith(wrap); ta.focus();
  }
  async function toggleComments(p, card, cmB, keepOpen) {
    const ex = card.querySelector(".comments"); if (ex && !keepOpen) { ex.remove(); S.openComments.delete(p.id); return; } if (ex) ex.remove(); S.openComments.add(p.id);
    const box = el("div", { class: "comments" }, el("span", { class: "muted", text: "Loading comments…" })); card.append(box);
    const draw = async () => {
      let list = []; try { list = await rpc("rp_community_comments", { p_post_id: p.id }); } catch (e) { box.replaceChildren(el("span", { class: "msg bad", text: e.message })); return; }
      box.replaceChildren(); const tops = list.filter(c => !c.parent_id);
      if (!tops.length) box.append(el("div", { class: "muted", text: "No comments yet." }));
      const one = (c, reply) => { const row = el("div", { class: "cm" + (reply ? " reply" : "") }); const nm = el("button", { type: "button", class: "name", text: c.author.username }); nm.addEventListener("click", () => openProfile(c.author.username));
        const t = el("div", { class: "body" }); t.append(richText(c.body)); const acts = el("div", { class: "actions" });
        if (!reply && signedIn()) acts.append(btn("Reply", () => replyBox(row, c.id), "act"));
        if (c.mine) acts.append(btn("Delete", async () => { if (await act(() => rpc("rp_community_delete_own", { p_type: "comment", p_id: c.id }))) { p.comments = Math.max(0, p.comments - 1); cmB.textContent = "💬 " + p.comments; draw(); } }, "act")); else acts.append(btn("⚑ Report", () => openReport("comment", String(c.id)), "act"));
        row.append(el("div", { class: "meta" }, nm, c.author.staff ? el("span", { class: "staff", text: "Staff" }) : "", " · " + ago(c.created_at)), t, acts); return row; };
      tops.forEach(c => { box.append(one(c, false)); list.filter(r => r.parent_id === c.id).forEach(r => box.append(one(r, true))); });
      const form = (parent, placeholder) => { const i = el("input", { type: "text", maxlength: "500", placeholder }), f = el("form", { class: "cmform" }, i, el("button", { type: "submit", class: "btn small primary", text: "Send" })); f.addEventListener("submit", async e => { e.preventDefault(); if (!signedIn()) return needSignIn(); if (!i.value.trim()) return; if (await act(() => rpc("rp_community_comment", { p_post_id: p.id, p_body: i.value, p_parent: parent }))) { p.comments += 1; cmB.textContent = "💬 " + p.comments; draw(); } }); return f; };
      window.__cmForm = form; if (signedIn()) box.append(form(null, "Write a comment…")); else box.append(el("div", { class: "muted", text: "Sign in on the main page to comment." }));
    };
    const replyBox = (row, id) => { if (row.querySelector(".cmform")) return; const f = window.__cmForm(id, "Write a reply…"); row.append(f); f.querySelector("input").focus(); };
    draw();
  }

  /* ---------- feed view ---------- */
  function composer() {
    const box = el("div", { class: "card composer" });
    if (!signedIn()) { box.append(el("p", { class: "muted", text: "You can read everything. Sign in on the main page to post, like, comment and follow." }), el("a", { class: "btn primary", href: "../index/index.html", text: "Sign in" })); return box; }
    if (S.me.restriction) { box.append(el("p", { class: "msg bad", text: (S.me.restriction.kind === "ban" ? "You are banned from Community" : "You are muted") + (S.me.restriction.until ? " until " + new Date(S.me.restriction.until).toLocaleString() : "") + (S.me.restriction.reason ? ": " + S.me.restriction.reason : "") + ". You can still read." })); return box; }
    if (S.settings.read_only && !S.me.mod) { box.append(el("p", { class: "muted", text: "Community is in read-only mode right now. You can still read." })); return box; }
    const ta = el("textarea", { maxlength: "2000", placeholder: "What's happening? Use #topics and @mentions." }), img = el("input", { type: "url", maxlength: "500", placeholder: "Image link (https://…), optional" }), count = el("span", { class: "muted", text: "0 / 2000" }), msg = el("p", { class: "msg" }), send = el("button", { type: "submit", class: "btn primary", text: "Post" });
    if (!S.settings.images_allowed && !S.me.mod) img.hidden = true; ta.addEventListener("input", () => { count.textContent = ta.value.length + " / 2000"; });
    const f = el("form", {}, ta, el("div", { style: "height:8px" }), img, el("div", { class: "row between", style: "margin-top:8px" }, count, send), msg);
    f.addEventListener("submit", async e => { e.preventDefault(); if (!ta.value.trim()) return; send.disabled = true; msg.textContent = ""; try { await rpc("rp_community_post", { p_body: ta.value, p_image: img.value.trim() || null }); ta.value = ""; img.value = ""; count.textContent = "0 / 2000"; S.mode = "latest"; S.tag = ""; S.q = ""; await refreshFeed(); } catch (err) { msg.textContent = err.message; msg.className = "msg bad"; } send.disabled = false; });
    box.append(el("div", { class: "row", style: "margin-bottom:8px" }, el("div", { class: "av", text: S.me.emoji }), el("strong", { text: S.me.username }))); box.append(f); return box;
  }
  function tabs() {
    const wrap = el("div", {}, el("div", { class: "tabs" }, ...[["latest", "Latest"], ["trending", "Trending"], ["following", "Following"], ["saved", "Saved"]].map(([m, l]) => { const b = el("button", { type: "button", class: "tab" + (S.mode === m && !S.tag && !S.q ? " active" : ""), text: l }); b.addEventListener("click", () => { if ((m === "following" || m === "saved") && !signedIn()) return needSignIn(); S.mode = m; S.tag = ""; S.q = ""; refreshFeed(); }); return b; })));
    const s = el("input", { type: "search", class: "search", placeholder: "Search posts…", maxlength: "60", "aria-label": "Search posts" }); s.value = S.q; s.addEventListener("keydown", e => { if (e.key === "Enter") { S.q = s.value.trim(); S.tag = ""; S.mode = "latest"; refreshFeed(); } });
    wrap.firstChild.append(s); if (S.tag || S.q) wrap.append(el("div", { class: "row", style: "margin-bottom:10px" }, el("span", { class: "muted", text: S.tag ? "Showing #" + S.tag : "Search: " + S.q }), btn("Clear", () => { S.tag = ""; S.q = ""; refreshFeed(); }))); return wrap;
  }
  let listBox = null;
  function renderFeed() {
    const c = $("center"); c.replaceChildren(composer(), tabs()); listBox = el("div"); c.append(listBox, el("div", { id: "moreBox" })); renderFeedList();
  }
  function renderFeedList() {
    if (!listBox) return; listBox.replaceChildren();
    if (S.loading && !S.posts.length) listBox.append(el("div", { class: "empty", text: "Loading…" }));
    else if (!S.posts.length) listBox.append(el("div", { class: "empty", text: S.mode === "following" ? "Follow people to see their posts here." : S.mode === "saved" ? "Nothing saved yet." : S.tag || S.q ? "No posts found." : "No posts yet. Be the first to post!" }));
    S.posts.forEach(p => listBox.append(postCard(p)));
    const more = $("moreBox"); if (more) { more.replaceChildren(); if (S.more) more.append(btn("Load more", loadMore, "btn")); }
  }
  async function fetchFeed(before) { return rpc("rp_community_feed", { p_mode: S.mode, p_before: before || null, p_limit: 20, p_tag: S.tag || null, p_query: S.q || null }); }
  async function refreshFeed() {
    S.view = "feed"; S.posts = []; S.loading = true; renderFeed();
    try { S.posts = await fetchFeed(); S.more = S.mode !== "trending" && S.posts.length >= 20; } catch (e) { S.posts = []; $("center").append(el("div", { class: "msg bad", text: e.message })); }
    S.loading = false; renderFeedList();
  }
  async function loadMore() { const last = S.posts[S.posts.length - 1]; if (!last) return; await act(async () => { const more = await fetchFeed(last.id); S.posts = S.posts.concat(more.filter(x => !S.posts.some(y => y.id === x.id))); S.more = more.length >= 20; renderFeedList(); }); }

  /* ---------- profile ---------- */
  async function openProfile(username) {
    S.view = "profile"; const c = $("center"); c.replaceChildren(el("div", { class: "empty", text: "Loading…" }));
    let p = null; try { p = await rpc("rp_community_profile", { p_username: username }); } catch (e) { c.replaceChildren(el("div", { class: "msg bad", text: e.message })); return; }
    c.replaceChildren(btn("← Back to feed", () => refreshFeed(), "btn"), el("div", { style: "height:10px" }));
    if (!p) { c.append(el("div", { class: "empty", text: "That member has not joined Community yet." })); return; }
    const card = el("div", { class: "card profile" }, el("div", { class: "row" }, el("div", { class: "av big", text: p.emoji, style: "width:70px;height:70px;font-size:38px" }), el("div", {}, el("h2", { text: p.username, style: "margin:0" }), p.staff ? el("span", { class: "staff", text: "Staff" }) : "", el("div", { class: "muted", text: "Joined " + new Date(p.joined).toLocaleDateString() }))));
    if (p.bio) card.append(el("p", { text: p.bio, style: "color:var(--text);margin:10px 0" }));
    card.append(el("div", { class: "stats" }, el("span", {}, el("b", { text: String(p.posts) }), " posts"), el("span", {}, el("b", { text: String(p.followers) }), " followers"), el("span", {}, el("b", { text: String(p.following) }), " following")));
    const row = el("div", { class: "row" });
    if (p.is_me) row.append(btn("Edit profile", openProfileEditor, "btn"));
    else { const fb = el("button", { type: "button", class: "btn " + (p.followed_by_me ? "" : "primary"), text: p.followed_by_me ? "Following ✓" : "Follow" }); fb.addEventListener("click", async () => { if (!signedIn()) return needSignIn(); if (await act(() => rpc("rp_community_follow", { p_username: p.username, p_on: !p.followed_by_me }))) openProfile(p.username); }); row.append(fb, btn("⚑ Report", () => openReport("user", p.username), "btn")); }
    card.append(row); c.append(card);
    const box = el("div"); c.append(box); try { const posts = await rpc("rp_community_feed", { p_mode: "user", p_author: p.username, p_limit: 30 }); if (!posts.length) box.append(el("div", { class: "empty", text: "No posts yet." })); posts.forEach(x => box.append(postCard(x))); } catch (e) { box.append(el("div", { class: "msg bad", text: e.message })); }
  }
  function openProfileEditor() {
    const pick = $("emojiPick"); let chosen = S.me.emoji; pick.replaceChildren(); EMOJIS.forEach(e => { const b = el("button", { type: "button", text: e }); if (e === chosen) b.className = "on"; b.addEventListener("click", () => { chosen = e; pick.querySelectorAll("button").forEach(x => x.classList.toggle("on", x === b)); }); pick.append(b); });
    $("bioIn").value = S.me.bio || ""; $("profMsg").textContent = ""; $("profileDlg").showModal();
    $("profileForm").onsubmit = async ev => { ev.preventDefault(); try { await rpc("rp_community_set_profile", { p_bio: $("bioIn").value, p_emoji: chosen }); await loadMe(); $("profileDlg").close(); openProfile(S.me.username); } catch (e) { $("profMsg").textContent = e.message; $("profMsg").className = "msg bad"; } };
  }
  $("profCancel").addEventListener("click", () => $("profileDlg").close());

  /* ---------- notifications ---------- */
  async function openNotifications() {
    if (!signedIn()) return needSignIn(); S.view = "notes"; const c = $("center"); c.replaceChildren(btn("← Back to feed", () => refreshFeed(), "btn"), el("h2", { text: "Notifications" }));
    let list = []; try { list = await rpc("rp_community_notifications"); } catch (e) { c.append(el("div", { class: "msg bad", text: e.message })); return; }
    const box = el("div", { class: "card" }); if (!list.length) box.append(el("div", { class: "empty", text: "Nothing yet." }));
    const unseen = Number(S.me.unseen || 0); const seenCut = unseen;
    list.forEach((n, i) => { const t = n.type === "like" ? ["♥ ", n.who, " liked your post: “" + (n.text || "") + "”"] : n.type === "comment" ? ["💬 ", n.who, " commented: “" + (n.text || "") + "”"] : n.type === "follow" ? ["👤 ", n.who, " started following you"] : ["🛡 ", "Moderator", ": " + n.text];
      const row = el("div", { class: "note" + (i < seenCut ? " new" : "") }, el("div", { text: t[0] + (t[1] === "Moderator" ? "Moderators" : "@" + t[1]) + t[2] }), el("div", { class: "muted", text: ago(n.at) })); if (n.post_id) { row.style.cursor = "pointer"; } box.append(row); });
    c.append(box); try { await rpc("rp_community_mark_seen"); S.me.unseen = 0; updateBell(); } catch { /* ignore */ }
  }

  /* ---------- report ---------- */
  function openReport(type, id) { S.reportTarget = { type, id }; $("repMsg").textContent = ""; $("repDetails").value = ""; if (!signedIn()) return needSignIn(); $("reportDlg").showModal(); }
  $("repCancel").addEventListener("click", () => $("reportDlg").close());
  $("reportForm").addEventListener("submit", async e => { e.preventDefault(); const t = S.reportTarget; if (!t) return; $("repSend").disabled = true; try { await rpc("rp_community_report", { p_type: t.type, p_id: t.id, p_reason: $("repReason").value, p_details: $("repDetails").value }); $("repMsg").textContent = "Thanks. A moderator will review this."; $("repMsg").className = "msg ok"; setTimeout(() => $("reportDlg").close(), 1200); } catch (err) { $("repMsg").textContent = err.message; $("repMsg").className = "msg bad"; } $("repSend").disabled = false; });

  /* ---------- sidebar, header, boot ---------- */
  async function loadPeople() {
    const box = $("people"); try { const list = (await rpc("rp_community_people", { p_query: "" })).filter(x => !S.me || x.username !== S.me.username).slice(0, 6); box.replaceChildren(); if (!list.length) box.append(el("span", { class: "muted", text: "No members yet." }));
      list.forEach(x => { const n = el("button", { type: "button", class: "name", text: x.username }); n.addEventListener("click", () => openProfile(x.username)); box.append(el("div", { class: "person" }, el("div", { class: "av", text: x.emoji }), el("div", { class: "grow" }, n, x.staff ? el("span", { class: "staff", text: "Staff" }) : ""))); }); } catch { box.replaceChildren(el("span", { class: "muted", text: "Unavailable" })); }
  }
  async function loadTrends() {
    const box = $("trendTags"); try { const posts = await rpc("rp_community_feed", { p_mode: "latest", p_limit: 50 }); const counts = new Map(); posts.forEach(p => (p.body.match(/#[A-Za-z0-9_]{2,30}/g) || []).forEach(t => counts.set(t.toLowerCase(), (counts.get(t.toLowerCase()) || 0) + 1)));
      box.replaceChildren(); const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8); if (!top.length) box.append(el("span", { class: "muted", text: "Use #topics in posts to start trends." })); top.forEach(([t, n]) => box.append(btn(t + " · " + n, () => { S.mode = "latest"; S.tag = t.slice(1); S.q = ""; refreshFeed(); }, "btn small"))); } catch { box.replaceChildren(el("span", { class: "muted", text: "Unavailable" })); }
  }
  function updateBell() { const n = Number(S.me && S.me.unseen || 0); $("bellBadge").hidden = n <= 0; $("bellBadge").textContent = n > 99 ? "99+" : String(n); }
  async function loadMe() { if (auth().state !== "in") { S.me = null; $("meBtn").hidden = true; return; } try { S.me = await rpc("rp_community_me"); $("meBtn").hidden = false; $("meBtn").textContent = S.me.emoji + " " + S.me.username; $("modLink").hidden = !S.me.mod; updateBell(); } catch { S.me = null; } }
  async function loadSettings() { try { S.settings = await rpc("rp_community_settings_public"); const a = $("announce"); a.hidden = !S.settings.announcement; a.textContent = "📢 " + S.settings.announcement; } catch { /* keep */ } }
  $("bellBtn").addEventListener("click", openNotifications); $("meBtn").addEventListener("click", () => S.me && openProfile(S.me.username));
  (async () => {
    await Promise.all([loadMe(), loadSettings()]); await refreshFeed(); loadPeople(); loadTrends();
    const p = new URLSearchParams(location.search).get("u"); if (p) openProfile(p);
    setInterval(async () => { if (document.hidden) return; const before = JSON.stringify(S.settings); await loadSettings(); if (signedIn()) { const m = S.me; await loadMe(); if (m && S.me && m.restriction !== S.me.restriction && S.view === "feed") renderFeed(); } if (before !== JSON.stringify(S.settings) && S.view === "feed") renderFeed(); }, 60000);
  })();
})();
