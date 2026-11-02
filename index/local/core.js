/* RP local backend, part 1: storage, auth, fetch interception and a tiny supabase-js stand-in.
   It exists so the whole site can be tested with no Supabase project. Data lives in this browser only (localStorage).
   Switch it off by setting RP_BACKEND = "supabase" in rp-config.js. NOT a security boundary: anyone using this browser can edit the data. */
(function () {
  "use strict";
  var SB_HOST = "nesxcgymsgegkqjhfydx.supabase.co", LS = "rp-local-db-v2", SESSION_KEY = "sb-nesxcgymsgegkqjhfydx-auth-token";
  var DB; try { DB = JSON.parse(localStorage.getItem(LS) || "null"); } catch (e) { DB = null; }
  if (!DB || !DB.t) DB = { t: {}, seq: {}, users: [], sessions: {} };
  var lastError = "", lastRaw = null;
  function flush() { try { var raw = JSON.stringify(DB); if (raw !== lastRaw) { localStorage.setItem(LS, raw); lastRaw = raw; } lastError = ""; } catch (e) { lastError = "This browser's storage is full. Delete old versions or large images."; try { console.warn("[RP local]", lastError); } catch (x) { /* none */ } } }
  function save() { flush(); }
  /* several tabs share one stored database: always start from the newest copy */
  function sync() { try { var raw = localStorage.getItem(LS); if (raw && raw !== lastRaw) { var d = JSON.parse(raw); if (d && d.t) { DB = d; lastRaw = raw; } } } catch (e) { /* ignore */ } }
  try { lastRaw = localStorage.getItem(LS); } catch (e) { /* ignore */ }
  window.addEventListener("storage", function (e) { if (e.key === LS) sync(); });

  function PgError(message, code) { this.message = message; this.code = code || "P0001"; }
  function fail(m) { throw new PgError(m); }
  var T = function (n) { return DB.t[n] || (DB.t[n] = []); };
  var nid = function (n) { DB.seq[n] = (DB.seq[n] || 0) + 1; return DB.seq[n]; };
  var now = function () { return new Date().toISOString(); };
  var clone = function (x) { return x === undefined ? undefined : JSON.parse(JSON.stringify(x)); };
  function uuid() { var a = new Uint8Array(16); crypto.getRandomValues(a); a[6] = (a[6] & 15) | 64; a[8] = (a[8] & 63) | 128; var h = Array.prototype.map.call(a, function (b) { return ("0" + b.toString(16)).slice(-2); }).join(""); return h.slice(0, 8) + "-" + h.slice(8, 12) + "-" + h.slice(12, 16) + "-" + h.slice(16, 20) + "-" + h.slice(20); }
  var b64 = function (s) { return btoa(unescape(encodeURIComponent(s))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); };
  function hashPw(p) { var enc = new TextEncoder().encode("rp-local:" + p); if (window.crypto && crypto.subtle) return crypto.subtle.digest("SHA-256", enc).then(function (b) { return Array.prototype.map.call(new Uint8Array(b), function (x) { return ("0" + x.toString(16)).slice(-2); }).join(""); }); var h = 5381; for (var i = 0; i < p.length; i++) h = ((h << 5) + h + p.charCodeAt(i)) | 0; return Promise.resolve("w" + h); }

  /* ---------- modules register their rpc handlers and tables here ---------- */
  var RPC = {}, TABLES = {}, HOOKS = { userCreated: [] }, ANON = { rp_creator_exists: 1, rp_community_settings_public: 1, rp_community_feed: 1, rp_community_comments: 1, rp_community_profile: 1, rp_community_people: 1 };
  var L = { DB: function () { return DB; }, T: T, nid: nid, now: now, clone: clone, uuid: uuid, fail: fail, save: save, RPC: RPC, TABLES: TABLES, HOOKS: HOOKS, PgError: PgError };
  window.RPLocal = L;
  L.rpc = function (name, fn) { RPC[name] = fn; };
  L.anon = function (n) { ANON[n] = 1; };
  L.table = function (name, cfg) { TABLES[name] = cfg; };

  /* ---------- auth ---------- */
  function issue(user) {
    var t = Date.now(), exp = Math.floor(t / 1000) + 3600 * 24 * 7;
    var tok = b64('{"alg":"HS256","typ":"JWT"}') + "." + b64(JSON.stringify({ sub: user.id, role: "authenticated", exp: exp, iat: Math.floor(t / 1000) })) + "." + uuid().replace(/-/g, "");
    DB.sessions[tok] = { uid: user.id, exp: exp }; var old = Object.keys(DB.sessions); if (old.length > 60) old.slice(0, old.length - 60).forEach(function (k) { delete DB.sessions[k]; });
    var meta = { username: user.meta && user.meta.username, display_name: user.meta && user.meta.username };
    var session = { access_token: tok, token_type: "bearer", expires_in: 3600 * 24 * 7, expires_at: exp, refresh_token: uuid(), user: { id: user.id, aud: "authenticated", role: "authenticated", email: user.email, user_metadata: user.meta || meta, app_metadata: { provider: "email" }, created_at: user.created_at } };
    save(); return session;
  }
  function ctxOf(token) { sync(); var s = token && DB.sessions[token]; if (s && s.exp > Date.now() / 1000) return { uid: s.uid, role: "authenticated" }; return { uid: null, role: "anon" }; }
  var listeners = [];
  function emit(ev, session) { listeners.forEach(function (f) { try { f(ev, session); } catch (e) { /* ignore */ } }); }
  function readSession() { sync(); try { var s = JSON.parse(localStorage.getItem(SESSION_KEY) || "null"); if (s && s.access_token && DB.sessions[s.access_token]) return s; } catch (e) { /* none */ } return null; }
  function writeSession(s) { try { if (s) localStorage.setItem(SESSION_KEY, JSON.stringify(s)); else localStorage.removeItem(SESSION_KEY); } catch (e) { /* ignore */ } }
  var auth = {
    signUp: function (a) {
      var email = String(a.email || "").trim().toLowerCase(), pw = String(a.password || ""), meta = (a.options && a.options.data) || {};
      if (!email) return Promise.resolve({ data: { user: null, session: null }, error: { message: "Signup requires a valid email" } });
      if (pw.length < 6) return Promise.resolve({ data: { user: null, session: null }, error: { message: "Password should be at least 6 characters." } });
      if (DB.users.some(function (u) { return u.email === email; })) return Promise.resolve({ data: { user: null, session: null }, error: { message: "User already registered" } });
      return hashPw(pw).then(function (h) {
        sync(); if (DB.users.some(function (x) { return x.email === email; })) return { data: { user: null, session: null }, error: { message: "User already registered" } };
        var u = { id: uuid(), email: email, pw: h, meta: meta, created_at: now() }; DB.users.push(u);
        HOOKS.userCreated.forEach(function (f) { f(u); });
        var s = issue(u); writeSession(s); emit("SIGNED_IN", s); return { data: { user: s.user, session: s }, error: null };
      });
    },
    signInWithPassword: function (a) {
      var email = String(a.email || "").trim().toLowerCase();
      return hashPw(String(a.password || "")).then(function (h) {
        sync(); var u = DB.users.filter(function (x) { return x.email === email; })[0];
        if (!u || u.pw !== h) return { data: { user: null, session: null }, error: { message: "Invalid login credentials" } };
        var s = issue(u); writeSession(s); emit("SIGNED_IN", s); return { data: { user: s.user, session: s }, error: null };
      });
    },
    signOut: function () { var s = readSession(); if (s) { delete DB.sessions[s.access_token]; save(); } writeSession(null); emit("SIGNED_OUT", null); return Promise.resolve({ error: null }); },
    getSession: function () { return Promise.resolve({ data: { session: readSession() }, error: null }); },
    getUser: function () { var s = readSession(); return Promise.resolve({ data: { user: s ? s.user : null }, error: null }); },
    onAuthStateChange: function (cb) { listeners.push(cb); setTimeout(function () { try { cb("INITIAL_SESSION", readSession()); } catch (e) { /* ignore */ } }, 0); return { data: { subscription: { unsubscribe: function () { listeners = listeners.filter(function (f) { return f !== cb; }); } } } }; }
  };

  /* ---------- requests ---------- */
  function errBody(e) { return { message: e && e.message || "Request failed", code: e && e.code || "P0001", details: null, hint: null }; }
  function parseVal(v) { if (v === "null") return null; if (v === "true") return true; if (v === "false") return false; return v; }
  function cmp(a, b) { if (a === b) return 0; if (a === null || a === undefined) return 1; if (b === null || b === undefined) return -1; return a < b ? -1 : 1; }
  function matches(row, col, expr) {
    var m = /^(not\.)?([a-z]+)\.(.*)$/.exec(expr); if (!m) return true; var neg = !!m[1], op = m[2], val = m[3], x = row[col], ok;
    var vs = function (s) { return String(s); };
    if (op === "eq") ok = vs(x) === val; else if (op === "neq") ok = vs(x) !== val; else if (op === "gt") ok = x > (isNaN(val) ? val : Number(val)); else if (op === "gte") ok = x >= (isNaN(val) ? val : Number(val)); else if (op === "lt") ok = x < (isNaN(val) ? val : Number(val)); else if (op === "lte") ok = x <= (isNaN(val) ? val : Number(val));
    else if (op === "is") ok = x === parseVal(val) || (val === "null" && x == null); else if (op === "in") { var list = val.replace(/^\(|\)$/g, "").match(/"[^"]*"|[^,]+/g) || []; list = list.map(function (s) { return s.replace(/^"|"$/g, ""); }); ok = list.indexOf(vs(x)) >= 0; }
    else if (op === "like" || op === "ilike") { var re = new RegExp("^" + val.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$", op === "ilike" ? "i" : ""); ok = re.test(vs(x)); } else ok = true;
    return neg ? !ok : ok;
  }
  function restGet(table, q, ctx, single) {
    sync();
    var cfg = TABLES[table]; if (!cfg) fail('relation "public.' + table + '" does not exist');
    var cols = cfg.cols && cfg.cols[ctx.role]; if (!cols) fail("permission denied for table " + table);
    var rows = T(table).filter(function (r) { return cfg.rls ? cfg.rls(r, ctx) : true; });
    q.forEach(function (v, k) { if (["select", "order", "limit", "offset"].indexOf(k) >= 0) return; rows = rows.filter(function (r) { return matches(r, k, v); }); });
    var order = q.get("order"); if (order) { var specs = order.split(",").map(function (s) { var p = s.split("."); return { c: p[0], d: p[1] === "desc" }; }); rows = rows.slice().sort(function (a, b) { for (var i = 0; i < specs.length; i++) { var c = cmp(a[specs[i].c], b[specs[i].c]); if (c) return specs[i].d ? -c : c; } return 0; }); }
    var off = Number(q.get("offset") || 0), lim = q.get("limit") ? Number(q.get("limit")) : rows.length; rows = rows.slice(off, off + lim);
    var sel = q.get("select") || "*", want = sel === "*" ? cols : sel.split(",").map(function (s) { return s.trim(); });
    if (cols !== "*") want.forEach(function (c) { if (c !== "*" && cols.indexOf(c) < 0) fail("permission denied for table " + table); });
    var allCols = cols === "*" ? null : cols;
    var out = rows.map(function (r) { var o = {}; (want[0] === "*" ? (allCols || Object.keys(r)) : want).forEach(function (c) { if (c in r) o[c] = clone(r[c]); }); return o; });
    return single ? out[0] : out;
  }
  function callRpc(name, args, ctx) {
    sync();
    var fn = RPC[name]; if (!fn) fail("Could not find the function public." + name + " in the schema cache");
    if (ctx.role === "anon" && !ANON[name]) throw new PgError("permission denied for function " + name, "42501");
    var r = fn(args || {}, ctx); save(); return r === undefined ? null : r;
  }
  L.call = callRpc; L.ctxOf = ctxOf;
  function bearer(h) { var a = ""; if (h) a = (typeof h.get === "function" ? h.get("authorization") : h.authorization || h.Authorization) || ""; return String(a).replace(/^Bearer\s+/i, ""); }
  function serve(method, url, headers, bodyText) {
    var u = new URL(url, location.href), path = u.pathname, ctx = ctxOf(bearer(headers)), body = null;
    try { body = bodyText ? JSON.parse(bodyText) : null; } catch (e) { /* none */ }
    try {
      var m = /\/rest\/v1\/rpc\/([a-z0-9_]+)/.exec(path);
      if (m) { return { status: 200, json: callRpc(m[1], body || {}, ctx) }; }
      m = /\/rest\/v1\/([a-z0-9_]+)$/.exec(path);
      if (m && method === "GET") { var accept = (headers && (typeof headers.get === "function" ? headers.get("accept") : headers.accept || headers.Accept)) || ""; var single = /pgrst\.object/.test(accept); var r = restGet(m[1], u.searchParams, ctx, single); return { status: 200, json: single && r === undefined ? { message: "no rows" } : r }; }
      if (/\/auth\/v1\/user/.test(path)) { var s = readSession(); return { status: s ? 200 : 401, json: s ? s.user : { message: "not signed in" } }; }
      fail("Not supported by the local backend: " + method + " " + path);
    } catch (e) { if (e instanceof PgError) return { status: 400, json: errBody(e) }; try { console.error("[RP local]", e); } catch (x) { /* none */ } return { status: 500, json: { message: String(e && e.message || e) } }; }
  }
  var realFetch = window.fetch ? window.fetch.bind(window) : null;
  window.fetch = function (input, init) {
    var url = typeof input === "string" ? input : (input && input.url) || "";
    if (url.indexOf(SB_HOST) < 0) return realFetch ? realFetch(input, init) : Promise.reject(new Error("fetch unavailable"));
    var method = ((init && init.method) || (input && input.method) || "GET").toUpperCase(), headers = (init && init.headers) || (input && input.headers) || {};
    var norm = {}; if (typeof Headers !== "undefined" && headers instanceof Headers) headers.forEach(function (v, k) { norm[k.toLowerCase()] = v; }); else Object.keys(headers).forEach(function (k) { norm[k.toLowerCase()] = headers[k]; });
    var res = serve(method, url, norm, init && init.body);
    return new Promise(function (resolve) { setTimeout(function () { resolve(new Response(JSON.stringify(res.json === undefined ? null : res.json), { status: res.status, headers: { "Content-Type": "application/json" } })); }, 5); });
  };

  /* ---------- supabase-js stand-in ---------- */
  function builder(table) {
    var q = new URLSearchParams(), single = false;
    var o = {
      select: function (c) { q.set("select", c || "*"); return o; },
      eq: function (k, v) { q.append(k, "eq." + v); return o; }, neq: function (k, v) { q.append(k, "neq." + v); return o; },
      in: function (k, a) { q.append(k, "in.(" + a.join(",") + ")"); return o; },
      gt: function (k, v) { q.append(k, "gt." + v); return o; }, lt: function (k, v) { q.append(k, "lt." + v); return o; },
      order: function (k, opt) { var cur = q.get("order"); var s = k + (opt && opt.ascending === false ? ".desc" : ".asc"); q.set("order", cur ? cur + "," + s : s); return o; },
      limit: function (n) { q.set("limit", String(n)); return o; }, single: function () { single = true; return o; }, maybeSingle: function () { single = true; return o; },
      then: function (res, rej) { return new Promise(function (r) { setTimeout(function () { try { var ctx = ctxOf((readSession() || {}).access_token); var rows = restGet(table, q, ctx, single); r({ data: rows === undefined ? null : rows, error: null }); } catch (e) { r({ data: null, error: errBody(e) }); } }, 5); }).then(res, rej); }
    };
    return o;
  }
  window.supabase = { createClient: function () { return { auth: auth, from: builder, rpc: function (name, args) { return new Promise(function (r) { setTimeout(function () { try { var ctx = ctxOf((readSession() || {}).access_token); r({ data: callRpc(name, args, ctx), error: null }); } catch (e) { r({ data: null, error: errBody(e) }); } }, 5); }); } }; } };
  L.status = function () { return lastError; };
  L.reset = function () { try { localStorage.removeItem(LS); localStorage.removeItem(SESSION_KEY); } catch (e) { /* ignore */ } location.reload(); };
})();
