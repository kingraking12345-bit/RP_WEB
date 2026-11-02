/* RP News reader: issues archive, 12 sections per issue, server-checked private letter and secret video. */
(async () => {
  "use strict";
  const { sb, rpc, user, esc, md, safeUrl, $ } = RPK; RPK.topbar("news"); const app = $("#app");
  const SECS = [
    ["welcome", "👋", "Welcome"], ["private_letter", "🔒", "Private Letter"], ["public_letter", "✉️", "Public Letter"], ["secret_video", "🎬", "Secret Video"], ["presentation", "📊", "Presentation"],
    ["games", "🎮", "Fun 5 Games"], ["facts", "🧠", "Fun 5 Facts"], ["songs", "🎵", "Fun 5 Songs"], ["announcements", "📢", "Announcements"], ["highlights", "⭐", "Highlights"],
    ["blog", "📝", "Blog"], ["vlogs", "🎥", "Character Vlogs"], ["secrets", "🕵️", "Hidden Secrets"], ["next", "⏭️", "Next Issue"]];
  const st = { issues: [], cur: null, q: "", me: await user() };
  const readKey = n => "rpNewsRead." + n; const getRead = n => { try { return new Set(JSON.parse(localStorage.getItem(readKey(n)) || "[]")); } catch { return new Set(); } };
  const setRead = (n, s) => { try { localStorage.setItem(readKey(n), JSON.stringify([...s])); } catch { /* private mode */ } };
  const items = (a, f) => (Array.isArray(a) ? a : []).filter(Boolean).map(f).join("");

  async function load() {
    const { data, error } = await sb.from("rp_news_issues").select("issue_no,title,subtitle,published_on,sections").order("issue_no", { ascending: false });
    if (error) { app.innerHTML = '<div class="k-card">The newsletters could not be loaded: ' + esc(error.message) + "</div>"; return false; }
    st.issues = data || []; return true;
  }
  function pick() { const h = new URLSearchParams(location.hash.slice(1)); const n = Number(h.get("issue")); return st.issues.find(i => i.issue_no === n) || st.issues[0]; }
  function render() {
    if (!st.issues.length) { app.innerHTML = '<div class="n-hero"><h1>RP News</h1></div><div class="k-card">No issue has been published yet. Check back soon.</div>'; return; }
    const is = st.cur = pick(), S = is.sections || {}, read = getRead(is.issue_no), q = st.q.trim().toLowerCase();
    const has = k => { const v = S[k]; return v && (Array.isArray(v) ? v.length : Object.values(v).some(x => String(x || "").trim())) || ["private_letter", "secret_video"].includes(k); };
    const secs = SECS.filter(([k]) => has(k) || k === "private_letter" || k === "secret_video");
    const match = k => !q || JSON.stringify(S[k] || "").toLowerCase().includes(q) || SECS.find(s => s[0] === k)[2].toLowerCase().includes(q);
    app.innerHTML = '<div class="n-hero"><span class="k-badge">Issue ' + is.issue_no + " · " + new Date(is.published_on + "T00:00").toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" }) + "</span><h1>" + esc(is.title) + '</h1><p class="k-muted">' + esc(is.subtitle) + "</p></div>" +
      '<div class="n-issues" role="tablist" aria-label="Issues">' + st.issues.map(i => '<button class="n-issue' + (i.issue_no === is.issue_no ? " on" : "") + '" data-i="' + i.issue_no + '" role="tab"><b>#' + i.issue_no + "</b>" + esc(i.title) + '<br><small class="k-muted">' + new Date(i.published_on + "T00:00").toLocaleDateString() + "</small></button>").join("") + "</div>" +
      '<div class="n-layout"><aside class="n-toc" id="toc"><input class="n-search" type="search" id="q" placeholder="Search this issue…" aria-label="Search this issue" value="' + esc(st.q) + '"><div class="n-progress" title="Sections read"><i id="pg"></i></div>' +
      secs.filter(([k]) => match(k)).map(([k, ic, nm]) => '<a href="#issue=' + is.issue_no + "&s=" + k + '" data-k="' + k + '" class="' + (read.has(k) ? "read" : "") + '">' + ic + " " + nm + '<span class="rd">✓</span></a>').join("") + "</aside>" +
      '<div id="secs">' + secs.filter(([k]) => match(k)).map(([k, ic, nm], i) => '<section class="k-card n-sec" id="s-' + k + '" data-k="' + k + '"><h2><span class="num">' + String(i + 1).padStart(2, "0") + "</span>" + ic + " " + nm + '</h2><div id="b-' + k + '"></div></section>').join("") + "</div></div>";
    app.querySelectorAll(".n-issue").forEach(b => b.onclick = () => { st.q = ""; location.hash = "issue=" + b.dataset.i; });
    $("#q").oninput = e => { st.q = e.target.value; const p = e.target.selectionStart; render(); const n = $("#q"); n.focus(); n.setSelectionRange(p, p); };
    secs.forEach(([k]) => body(k, S[k], is));
    const upd = () => { const total = secs.length; $("#pg").style.width = (100 * getRead(is.issue_no).size / total) + "%"; app.querySelectorAll(".n-toc a").forEach(a => a.classList.toggle("read", getRead(is.issue_no).has(a.dataset.k))); };
    upd();
    const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { const k = e.target.dataset.k; app.querySelectorAll(".n-toc a").forEach(a => a.classList.toggle("on", a.dataset.k === k)); const r = getRead(is.issue_no); if (!r.has(k) && e.intersectionRatio > 0.5) { r.add(k); setRead(is.issue_no, r); upd(); } } }), { threshold: [0.1, 0.5], rootMargin: "-80px 0px -30% 0px" });
    app.querySelectorAll(".n-sec").forEach(s => io.observe(s));
    const want = new URLSearchParams(location.hash.slice(1)).get("s"); if (want && $("#s-" + want)) $("#s-" + want).scrollIntoView();
  }
  function body(k, v, is) {
    const box = $("#b-" + k); if (!box) return; v = v || {};
    const text = t => md(t || "");
    if (k === "welcome" || k === "public_letter" || k === "secrets") box.innerHTML = text(v.text);
    else if (k === "blog") box.innerHTML = (v.title ? "<h3>" + esc(v.title) + "</h3>" : "") + text(v.body);
    else if (k === "next") box.innerHTML = '<div class="n-next" style="padding:10px"><h3 style="font-size:1.4rem;margin:0">' + esc(v.title) + "</h3>" + text(v.text) + "</div>";
    else if (k === "presentation") box.innerHTML = text(v.text) + (safeUrl(v.url) ? '<p><a class="k-btn" style="display:inline-block;text-decoration:none" target="_blank" rel="noopener noreferrer" href="' + esc(v.url) + '">Open the presentation ↗</a></p>' : '<p class="k-muted">The presentation link has not been added yet.</p>');
    else if (k === "games" || k === "songs" || k === "vlogs") box.innerHTML = Array.isArray(v) && v.length ? '<div class="n-list">' + items(v, g => '<div class="n-item"><h3>' + esc(g.title) + "</h3><p>" + esc(g.text) + "</p>" + (safeUrl(g.url) ? '<a target="_blank" rel="noopener noreferrer" href="' + esc(g.url) + '">' + (k === "games" ? "Play" : k === "songs" ? "Listen" : "Watch") + " ↗</a>" : "") + "</div>") + "</div>" : '<p class="k-muted">Nothing here yet.</p>';
    else if (k === "facts") box.innerHTML = '<div class="n-list">' + items(v, g => '<div class="n-item"><h3>' + esc(g.title) + "</h3><p>" + esc(g.text) + "</p></div>") + "</div>";
    else if (k === "announcements" || k === "highlights") box.innerHTML = "<ul>" + items(v, t => "<li>" + esc(t) + "</li>") + "</ul>";
    else if (k === "private_letter") { box.innerHTML = text(v.text) + (st.me ? '<form class="n-lock" id="pl"><label>Password<input type="password" id="plp" autocomplete="off" required></label><button class="k-btn" type="submit">Unlock letter</button><p class="k-msg" id="plm" role="status"></p></form><p class="k-muted n-note">Hint: the password is hidden somewhere in this issue. The check happens on the server, so it cannot be read from the page.</p>' : '<p class="k-muted">Sign in on the main page to unlock the private letter.</p>');
      const f = $("#pl"); if (f) f.onsubmit = async e => { e.preventDefault(); const m = $("#plm"); m.className = "k-msg"; m.textContent = "Checking…"; try { const url = await rpc("rp_news_unlock_letter", { p_issue: is.issue_no, p_password: $("#plp").value }); if (!safeUrl(url)) throw new Error("The letter link is not valid."); m.className = "k-msg ok"; m.innerHTML = 'Unlocked! <a target="_blank" rel="noopener noreferrer" href="' + esc(url) + '">Open the private letter (PDF) ↗</a>'; } catch (er) { m.className = "k-msg err"; m.textContent = er.message; } }; }
    else if (k === "secret_video") { box.innerHTML = text(v.text) + (st.me ? '<div id="sv"><p class="k-muted">Loading your progress…</p></div>' : '<p class="k-muted">Sign in on the main page to play and save your progress.</p>'); if (st.me) secretVideo(is); }
  }

  /* ---- 10-level platformer. Progress is saved on the server; the video link only comes from the server once all levels are saved. ---- */
  async function secretVideo(is) {
    const box = $("#sv"); let prog; try { prog = await rpc("rp_news_my_levels", { p_issue: is.issue_no }); } catch (e) { box.textContent = e.message; return; }
    const need = prog.needed, done = new Set(prog.levels); let lvl = 1; while (done.has(lvl) && lvl < need) lvl++;
    box.innerHTML = '<div class="n-lvls" id="lv"></div><canvas class="n-game" id="cv" width="640" height="320" tabindex="0" aria-label="Platformer game. Arrow keys or A and D to move, space to jump."></canvas><div class="k-row" style="margin-top:8px"><button class="k-btn ghost" id="lt" type="button">◀</button><button class="k-btn ghost" id="rt" type="button">▶</button><button class="k-btn ghost" id="jp" type="button">⤒ Jump</button><button class="k-btn" id="claim" type="button" disabled>🎬 Watch the secret video</button><span class="k-msg" id="svm" role="status"></span></div><p class="k-muted n-note">Reach the green flag. Arrow keys / A D move, space jumps. Falling restarts the level.</p>';
    const cv = $("#cv"), cx = cv.getContext("2d"), W = 640, H = 320, msg = (t, bad) => { const m = $("#svm"); m.textContent = t; m.className = "k-msg " + (bad ? "err" : "ok"); };
    const paint = () => { $("#lv").innerHTML = Array.from({ length: need }, (_, i) => '<b class="' + (done.has(i + 1) ? "done" : i + 1 === lvl ? "cur" : "") + '">' + (i + 1) + "</b>").join(""); $("#claim").disabled = done.size < need; };
    const build = n => { const r = (i) => { const x = Math.sin(n * 91.7 + i * 17.3) * 10000; return x - Math.floor(x); }; const plats = [{ x: 0, y: 280, w: 120, h: 40 }]; let x = 120; const count = 4 + Math.min(n, 8); for (let i = 0; i < count; i++) { const gap = 40 + Math.min(n * 6, 60) + r(i) * 20, w = Math.max(50, 110 - n * 5 + r(i + 40) * 30); x += gap; const y = 200 + r(i + 80) * 80; plats.push({ x, y: Math.min(y, plats[plats.length - 1].y + 50), w, h: 20 }); x += w; } const last = plats[plats.length - 1]; plats.push({ x: last.x + 50, y: last.y, w: 80, h: 20 }); const g = plats[plats.length - 1]; return { plats, goal: { x: g.x + 40, y: g.y - 34 }, width: g.x + 140, movers: n >= 4 ? [{ i: 2, dx: 40 + n * 4, t: 0 }] : [] }; };
    let L, p, keys = {}, cam = 0, raf = 0, won = false;
    const reset = () => { L = build(lvl); p = { x: 30, y: 240, vx: 0, vy: 0, on: false }; won = false; paint(); };
    const key = (e, d) => { const c = { ArrowLeft: "l", a: "l", ArrowRight: "r", d: "r", " ": "j", ArrowUp: "j", w: "j" }[e.key]; if (c) { keys[c] = d; e.preventDefault(); } };
    cv.onkeydown = e => key(e, true); cv.onkeyup = e => key(e, false);
    const hold = (id, c) => { const b = $(id); ["pointerdown"].forEach(ev => b.addEventListener(ev, () => keys[c] = true)); ["pointerup", "pointerleave", "pointercancel"].forEach(ev => b.addEventListener(ev, () => keys[c] = false)); }; hold("#lt", "l"); hold("#rt", "r"); hold("#jp", "j");
    async function win() { if (won) return; won = true; try { await rpc("rp_news_mark_level", { p_issue: is.issue_no, p_level: lvl }); done.add(lvl); msg("Level " + lvl + " complete!"); } catch (e) { msg(e.message, true); } if (lvl < need) lvl++; else if (done.size < need) { lvl = [...Array(need).keys()].map(i => i + 1).find(i => !done.has(i)) || need; } paint(); setTimeout(reset, 600); }
    function tick() {
      if (!document.body.contains(cv)) return; p.vx = (keys.r ? 3 : 0) - (keys.l ? 3 : 0); if (keys.j && p.on) { p.vy = -9.2; p.on = false; } p.vy += 0.5; p.x += p.vx; p.y += p.vy; p.on = false;
      const plats = L.plats.map((q, i) => { const m = L.movers.find(m => m.i === i); if (m) { m.t += 0.02; return { ...q, x: q.x + Math.sin(m.t) * m.dx }; } return q; });
      plats.forEach(q => { if (p.x + 16 > q.x && p.x < q.x + q.w && p.y + 24 >= q.y && p.y + 24 - p.vy <= q.y + 8 && p.vy >= 0) { p.y = q.y - 24; p.vy = 0; p.on = true; } });
      if (p.x < 0) p.x = 0; if (p.y > H + 60) reset(); const g = L.goal; if (p.x + 16 > g.x && p.x < g.x + 22 && p.y + 24 > g.y && p.y < g.y + 34) win();
      cam = Math.max(0, Math.min(L.width - W, p.x - 200)); cx.clearRect(0, 0, W, H); cx.fillStyle = "#04100a"; cx.fillRect(0, 0, W, H);
      cx.fillStyle = "#1c3d2a"; plats.forEach(q => cx.fillRect(q.x - cam, q.y, q.w, q.h)); cx.fillStyle = "#32df8b"; plats.forEach(q => cx.fillRect(q.x - cam, q.y, q.w, 4));
      cx.fillStyle = "#32df8b"; cx.fillRect(g.x - cam, g.y, 4, 34); cx.beginPath(); cx.moveTo(g.x + 4 - cam, g.y); cx.lineTo(g.x + 24 - cam, g.y + 8); cx.lineTo(g.x + 4 - cam, g.y + 16); cx.fill();
      cx.fillStyle = "#e8f1ff"; cx.fillRect(p.x - cam, p.y, 16, 24); cx.fillStyle = "#04140b"; cx.fillRect(p.x - cam + 9, p.y + 5, 3, 3); cx.fillStyle = "#32df8b"; cx.font = "14px system-ui"; cx.fillText("Level " + lvl + " / " + need, 12, 22); raf = requestAnimationFrame(tick);
    }
    $("#claim").onclick = async () => { try { const url = await rpc("rp_news_claim_video", { p_issue: is.issue_no }); if (!safeUrl(url)) throw new Error("The video link is not valid."); msg(""); $("#svm").innerHTML = '<a target="_blank" rel="noopener noreferrer" href="' + esc(url) + '">Open the secret video ↗</a>'; $("#svm").className = "k-msg ok"; } catch (e) { msg(e.message, true); } };
    reset(); cancelAnimationFrame(raf); tick();
  }

  window.addEventListener("hashchange", () => { const was = st.cur && st.cur.issue_no; if (pick().issue_no !== was) render(); else { const s = new URLSearchParams(location.hash.slice(1)).get("s"); if (s && $("#s-" + s)) $("#s-" + s).scrollIntoView(); } });
  if (await load()) { render(); setInterval(async () => { if (document.hidden) return; const before = JSON.stringify(st.issues); if (await load() && JSON.stringify(st.issues) !== before && !st.q && !document.querySelector("#sv canvas")) render(); }, 120000); }
})();
