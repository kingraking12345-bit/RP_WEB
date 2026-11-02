/* RP PostgreSQL client. Replaces supabase-js: same calls (auth, rpc, from), but talks to the RP API (server/) which talks to PostgreSQL.
   Also redirects the old hard-coded database address used inside the page scripts to the new API address (RP_API_URL in rp-config.js),
   so no page script needs to change. */
(function () {
  "use strict";
  var OLD_HOST = "nesxcgymsgegkqjhfydx.supabase.co", SESSION_KEY = "sb-nesxcgymsgegkqjhfydx-auth-token";
  var API = String(window.RP_API_URL || "").replace(/\/+$/, "");
  if (!API) { try { console.error("[RP] RP_API_URL is empty in rp-config.js"); } catch (e) { /* none */ } }

  /* ---------- send old-address requests to the API ---------- */
  var realFetch = window.fetch ? window.fetch.bind(window) : null;
  window.fetch = function (input, init) {
    var url = typeof input === "string" ? input : (input && input.url) || "";
    if (url.indexOf(OLD_HOST) < 0 || !realFetch) return realFetch ? realFetch(input, init) : Promise.reject(new Error("fetch unavailable"));
    var target = API + url.slice(url.indexOf(OLD_HOST) + OLD_HOST.length);
    if (typeof input !== "string" && input && !init) return realFetch(new Request(target, input));
    return realFetch(target, init);
  };

  /* ---------- session storage ---------- */
  function read() { try { var s = JSON.parse(localStorage.getItem(SESSION_KEY) || "null"); return s && s.access_token ? s : null; } catch (e) { return null; } }
  function write(s) { try { if (s) localStorage.setItem(SESSION_KEY, JSON.stringify(s)); else localStorage.removeItem(SESSION_KEY); } catch (e) { /* ignore */ } }
  var listeners = [];
  function emit(ev, s) { listeners.forEach(function (f) { try { f(ev, s); } catch (e) { /* ignore */ } }); }
  window.addEventListener("storage", function (e) { if (e.key === SESSION_KEY) { var s = read(); emit(s ? "SIGNED_IN" : "SIGNED_OUT", s); } });

  function post(path, body, token) {
    var h = { "Content-Type": "application/json" }; if (token) h.Authorization = "Bearer " + token;
    return fetch(API + path, { method: "POST", headers: h, body: JSON.stringify(body || {}), cache: "no-store" }).then(function (r) {
      return r.text().then(function (t) { var j = null; try { j = t ? JSON.parse(t) : null; } catch (e) { /* none */ } return { ok: r.ok, status: r.status, json: j }; });
    }, function () { return { ok: false, status: 0, json: { message: "Cannot reach the server. Check your connection and try again." } }; });
  }
  var fail = function (res) { return { data: { user: null, session: null }, error: { message: (res.json && (res.json.message || res.json.msg)) || "Request failed", status: res.status } }; };

  /* renew the token when less than a day is left (the server gives 7-day tokens) */
  var refreshing = null;
  function fresh() {
    var s = read(); if (!s) return Promise.resolve(null);
    var left = Number(s.expires_at) - Date.now() / 1000;
    if (left > 86400 || !s.refresh_token) return Promise.resolve(left > 0 ? s : null);
    if (!refreshing) refreshing = post("/auth/v1/token?grant_type=refresh_token", { refresh_token: s.refresh_token }).then(function (r) {
      refreshing = null;
      if (r.ok && r.json && r.json.access_token) { write(r.json); emit("TOKEN_REFRESHED", r.json); return r.json; }
      if (r.status === 400 || r.status === 401) { write(null); emit("SIGNED_OUT", null); return null; }  // refresh token rejected: signed out
      return left > 0 ? s : null;                                                                          // server unreachable: keep what we have
    });
    return refreshing;
  }

  var auth = {
    signUp: function (a) {
      return post("/auth/v1/signup", { email: a.email, password: a.password, data: (a.options && a.options.data) || {} }).then(function (r) {
        if (!r.ok || !r.json || !r.json.access_token) return fail(r);
        write(r.json); emit("SIGNED_IN", r.json); return { data: { user: r.json.user, session: r.json }, error: null };
      });
    },
    signInWithPassword: function (a) {
      return post("/auth/v1/token?grant_type=password", { email: a.email, password: a.password }).then(function (r) {
        if (!r.ok || !r.json || !r.json.access_token) return fail(r);
        write(r.json); emit("SIGNED_IN", r.json); return { data: { user: r.json.user, session: r.json }, error: null };
      });
    },
    signOut: function (o) {
      var scope = (o && o.scope) || "global", s = read(); if (!s) { emit("SIGNED_OUT", null); return Promise.resolve({ error: null }); }
      return post("/auth/v1/logout?scope=" + encodeURIComponent(scope), {}, s.access_token).then(function (r) {
        if (scope === "others") { if (r.ok && r.json && r.json.access_token) { write(r.json); return { error: null }; } return { error: { message: (r.json && r.json.message) || "Could not revoke other sessions" } }; }
        write(null); emit("SIGNED_OUT", null); return { error: null };
      });
    },
    getSession: function () { return fresh().then(function (s) { return { data: { session: s }, error: null }; }); },
    getUser: function () { return fresh().then(function (s) { return { data: { user: s ? s.user : null }, error: null }; }); },
    onAuthStateChange: function (cb) {
      listeners.push(cb); setTimeout(function () { fresh().then(function (s) { try { cb("INITIAL_SESSION", s); } catch (e) { /* ignore */ } }); }, 0);
      return { data: { subscription: { unsubscribe: function () { listeners = listeners.filter(function (f) { return f !== cb; }); } } } };
    }
  };

  /* ---------- table reads and database functions ---------- */
  function errOf(r) { var j = r.json || {}; return { message: j.message || (r.status === 0 ? "Cannot reach the server. Check your connection and try again." : "Request failed (" + r.status + ")"), code: j.code || String(r.status), details: j.details || null, hint: j.hint || null }; }
  function request(method, path, body, accept) {
    return fresh().then(function (s) {
      var h = { Accept: accept || "application/json" }; if (s) h.Authorization = "Bearer " + s.access_token; if (body !== undefined) h["Content-Type"] = "application/json";
      return fetch(API + path, { method: method, headers: h, body: body === undefined ? undefined : JSON.stringify(body), cache: "no-store" }).then(function (r) {
        return r.text().then(function (t) { var j = null; try { j = t ? JSON.parse(t) : null; } catch (e) { /* none */ } return { ok: r.ok, status: r.status, json: j }; });
      }, function () { return { ok: false, status: 0, json: null }; });
    });
  }
  var q = function (v) { return '"' + String(v).replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"'; };
  function builder(table) {
    var p = new URLSearchParams(), mode = "";
    var add = function (k, op) { return function (c, v) { p.append(c, op + "." + v); return o; }; };
    var o = {
      select: function (c) { p.set("select", c || "*"); return o; },
      eq: add("eq", "eq"), neq: add("neq", "neq"), gt: add("gt", "gt"), gte: add("gte", "gte"), lt: add("lt", "lt"), lte: add("lte", "lte"), like: add("like", "like"), ilike: add("ilike", "ilike"),
      is: function (c, v) { p.append(c, "is." + v); return o; },
      in: function (c, a) { p.append(c, "in.(" + a.map(q).join(",") + ")"); return o; },
      order: function (c, opt) { var cur = p.get("order"), s = c + (opt && opt.ascending === false ? ".desc" : ".asc"); p.set("order", cur ? cur + "," + s : s); return o; },
      limit: function (n) { p.set("limit", String(n)); return o; },
      range: function (a, b) { p.set("offset", String(a)); p.set("limit", String(b - a + 1)); return o; },
      single: function () { mode = "single"; return o; }, maybeSingle: function () { mode = "maybe"; return o; },
      then: function (res, rej) {
        return request("GET", "/rest/v1/" + table + "?" + p.toString()).then(function (r) {
          if (!r.ok) return { data: null, error: errOf(r) };
          var rows = Array.isArray(r.json) ? r.json : [];
          if (mode === "single") return rows.length === 1 ? { data: rows[0], error: null } : { data: null, error: { message: "JSON object requested, multiple (or no) rows returned", code: "PGRST116" } };
          if (mode === "maybe") return rows.length <= 1 ? { data: rows[0] || null, error: null } : { data: null, error: { message: "Multiple rows returned", code: "PGRST116" } };
          return { data: rows, error: null };
        }).then(res, rej);
      }
    };
    return o;
  }
  var client = {
    auth: auth, from: builder,
    rpc: function (name, args) { return request("POST", "/rest/v1/rpc/" + name, args || {}).then(function (r) { return r.ok ? { data: r.json === undefined ? null : r.json, error: null } : { data: null, error: errOf(r) }; }); }
  };
  window.supabase = { createClient: function () { return client; } };   // the pages look for this name; it is now the RP client
  window.RPApi = { url: API, client: client };
})();
