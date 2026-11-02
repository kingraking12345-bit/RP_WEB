/* Kignity AI runtime (shared by the Tools employee workspace and the public Tools page).
 *
 * Kignity AI is a script-driven assistant: employees write JavaScript "skills" and knowledge files
 * (JSON / Markdown / text) in the Kignity project, and this runtime executes them.
 *
 *   KignityRuntime.starterFiles()                      -> the default project files
 *   const rt = KignityRuntime.create(files, options)   -> starts the scripts in an isolated Web Worker
 *   const info = await rt.ready()                      -> { name, greeting, suggestions, skills[], errors[] }
 *   const reply = await rt.ask("hello")                -> { text, suggestions?, skill?, error? }
 *   rt.stop()
 *   KignityRuntime.mountChat(element, options)         -> small chat UI; chat.attach(rt, info)
 *
 * Scripts run in a Worker, so they cannot touch the page, cookies or the signed-in session.
 * A script that never finishes is stopped after a timeout (default 2 seconds).
 * Network access is switched off inside the worker (best effort).
 */
(() => {
  "use strict";

  /* ------------------------------------------------------------------ worker code */
  function workerMain() {
    const post = self.postMessage.bind(self);
    ["fetch", "XMLHttpRequest", "WebSocket", "EventSource", "importScripts", "indexedDB", "caches", "BroadcastChannel", "SharedWorker", "Worker"].forEach(name => {
      try { self[name] = undefined; } catch (e) { /* not writable here */ }
    });

    let files = {}, config = {}, context = {}, memory = {}, currentFile = "";
    let skills = [], befores = [], fallbackFn = null, order = 0;
    const MAX_REPLY = 4000;

    const log = level => (...args) => {
      let text;
      try { text = args.map(a => (typeof a === "string" ? a : JSON.stringify(a))).join(" "); } catch (e) { text = String(args); }
      post({ type: "log", level, file: currentFile, text: text.slice(0, 1000) });
    };
    const fakeConsole = { log: log("log"), info: log("log"), warn: log("warn"), error: log("error") };

    const STOP = new Set("a an the is are am was were be to of and or for in on at it its this that i you me my we us do does did can could will would please what which who how about with".split(" "));
    const normalize = text => String(text || "").toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
    const tokens = text => normalize(text).split(" ").filter(w => w && !STOP.has(w));
    function similarity(a, b) {
      const A = new Set(tokens(a)), B = new Set(tokens(b));
      if (!A.size || !B.size) return 0;
      let shared = 0; A.forEach(w => { if (B.has(w)) shared++; });
      return (2 * shared) / (A.size + B.size);
    }
    const escapeRegExp = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    const Kignity = {
      get config() { return config; },
      get files() { return files; },
      get memory() { return memory; },
      get context() { return context; },
      data(path) {
        const text = files[path];
        if (text === undefined) return undefined;
        if (/\.json$/i.test(path)) {
          try { return JSON.parse(text); } catch (e) { throw new Error("Invalid JSON in " + path + ": " + e.message); }
        }
        return text;
      },
      skill(def) {
        if (!def || typeof def !== "object") throw new Error("Kignity.skill needs an object: { name, patterns, reply }");
        if (typeof def.reply !== "function" && typeof def.reply !== "string") throw new Error("Skill \"" + (def.name || "?") + "\" needs a reply (text or function).");
        const patterns = [].concat(def.patterns === undefined ? [] : def.patterns);
        if (!patterns.length && typeof def.match !== "function") throw new Error("Skill \"" + (def.name || "?") + "\" needs patterns or a match function.");
        skills.push({ name: String(def.name || "skill-" + (skills.length + 1)), patterns, match: def.match, priority: Number(def.priority) || 0, reply: def.reply, file: currentFile, order: order++ });
      },
      before(fn) { if (typeof fn !== "function") throw new Error("Kignity.before needs a function."); befores.push(fn); },
      fallback(fn) { if (typeof fn !== "function") throw new Error("Kignity.fallback needs a function."); fallbackFn = fn; },
      util: {
        pick: list => list[Math.floor(Math.random() * list.length)],
        tokens, normalize, similarity
      }
    };

    function testSkill(skill, ctx) {
      if (typeof skill.match === "function") { const m = skill.match(ctx); return m || null; }
      for (const p of skill.patterns) {
        if (p instanceof RegExp) { p.lastIndex = 0; const m = p.exec(ctx.text); if (m) return m; }
        else if (typeof p === "string" && p.trim()) {
          const m = new RegExp("(^|[^\\p{L}\\p{N}])" + escapeRegExp(p.trim()) + "($|[^\\p{L}\\p{N}])", "iu").exec(ctx.text);
          if (m) return m;
        }
      }
      return null;
    }
    function shape(value, skill) {
      if (value === undefined || value === null || value === false) return null;
      if (typeof value === "string") return { text: value.slice(0, MAX_REPLY), skill };
      if (typeof value === "object" && value.text !== undefined) {
        const out = { text: String(value.text).slice(0, MAX_REPLY), skill };
        if (Array.isArray(value.suggestions)) out.suggestions = value.suggestions.slice(0, 6).map(s => String(s).slice(0, 80));
        return out;
      }
      return { text: String(value).slice(0, MAX_REPLY), skill };
    }
    async function handle(text) {
      const ctx = { text, lower: text.toLowerCase(), words: tokens(text), match: null, memory, config, context };
      for (const fn of befores) { const r = shape(await fn(ctx), "before"); if (r) return r; }
      const ordered = skills.slice().sort((a, b) => b.priority - a.priority || a.order - b.order);
      for (const skill of ordered) {
        const m = testSkill(skill, ctx);
        if (!m) continue;
        ctx.match = m === true ? [] : m;
        const r = shape(typeof skill.reply === "function" ? await skill.reply(ctx) : skill.reply, skill.name);
        if (r) return r;
      }
      if (fallbackFn) { const r = shape(await fallbackFn(ctx), "fallback"); if (r) return r; }
      return { text: String(config.fallback || "I do not know that yet."), skill: "(none)" };
    }

    function init(msg) {
      files = {}; msg.files.forEach(f => { files[f.path] = String(f.content || ""); });
      context = msg.context || {}; memory = {}; skills = []; befores = []; fallbackFn = null; order = 0;
      const errors = [];
      config = {};
      if (files["kignity.json"] !== undefined) {
        try { config = JSON.parse(files["kignity.json"]) || {}; } catch (e) { errors.push({ path: "kignity.json", message: "Invalid JSON: " + e.message }); }
      }
      msg.files.filter(f => f.type === "js" || /\.js$/i.test(f.path)).sort((a, b) => a.path.localeCompare(b.path)).forEach(f => {
        currentFile = f.path;
        try { new Function("Kignity", "console", "\"use strict\";\n" + f.content + "\n//# sourceURL=" + f.path)(Kignity, fakeConsole); }
        catch (e) { errors.push({ path: f.path, message: String((e && e.message) || e) }); }
      });
      currentFile = "";
      post({
        type: "ready", errors,
        info: {
          name: String(config.name || "Kignity AI"), greeting: String(config.greeting || "Hi! Ask me something."),
          suggestions: Array.isArray(config.suggestions) ? config.suggestions.slice(0, 6).map(s => String(s).slice(0, 80)) : [],
          skills: skills.map(s => ({ name: s.name, file: s.file }))
        }
      });
    }

    self.onmessage = async event => {
      const msg = event.data || {};
      if (msg.type === "init") { init(msg); return; }
      if (msg.type === "ask") {
        try { const r = await handle(String(msg.text || "").slice(0, 1000)); post({ type: "reply", id: msg.id, reply: r }); }
        catch (e) { post({ type: "reply", id: msg.id, error: String((e && e.message) || e) }); }
      }
    };
  }

  /* ------------------------------------------------------------------ host side */
  function create(files, options = {}) {
    const o = { timeoutMs: 2000, initTimeoutMs: 3000, context: {}, onLog() {}, ...options };
    const list = (Array.isArray(files) ? files : []).filter(f => f && typeof f.path === "string").map(f => ({ path: f.path, type: f.type || "", content: String(f.content || "") }));
    let worker = null, seq = 0, destroyed = false, readyInfo = null, readyResolve = null, initTimer = null;
    const pending = new Map();
    const readyPromise = new Promise(resolve => { readyResolve = resolve; });

    function fail(message) {
      readyInfo = { info: { name: "Kignity AI", greeting: "Kignity AI could not start.", suggestions: [], skills: [] }, errors: [{ path: "(startup)", message }] };
      readyResolve(readyInfo);
    }
    function spawn() {
      let url;
      try {
        url = URL.createObjectURL(new Blob(["(" + workerMain.toString() + ")()"], { type: "text/javascript" }));
        worker = new Worker(url);
      } catch (error) { fail("This browser could not start the Kignity worker: " + error.message); return; }
      URL.revokeObjectURL(url);
      worker.onmessage = event => {
        const m = event.data || {};
        if (m.type === "log") o.onLog(m);
        else if (m.type === "ready") { clearTimeout(initTimer); readyInfo = { info: m.info, errors: m.errors }; readyResolve(readyInfo); }
        else if (m.type === "reply") {
          const p = pending.get(m.id); if (!p) return;
          clearTimeout(p.timer); pending.delete(m.id);
          p.resolve(m.error ? { text: "Something went wrong while answering: " + m.error, error: m.error } : m.reply);
        }
      };
      worker.onerror = event => { o.onLog({ level: "error", file: event.filename || "", text: event.message || "Worker error" }); };
      initTimer = setTimeout(() => {
        if (readyInfo) return;
        kill(); fail("The scripts took too long to start. A script may be stuck in an endless loop.");
      }, o.initTimeoutMs);
      worker.postMessage({ type: "init", files: list, context: o.context });
    }
    function kill() { if (worker) { worker.terminate(); worker = null; } clearTimeout(initTimer); }
    spawn();

    return {
      ready: () => readyPromise,
      async ask(text) {
        if (destroyed) return { text: "Kignity AI is stopped.", error: "stopped" };
        const state = await readyPromise;
        if (!worker) {
          if (state.errors.some(e => e.path === "(startup)")) return { text: "Kignity AI could not start. Check the scripts for endless loops or errors.", error: "startup" };
          readyInfo = null; spawn(); await new Promise(r => { const t = setInterval(() => { if (readyInfo) { clearInterval(t); r(); } }, 20); });
          if (!worker) return { text: "Kignity AI could not restart.", error: "startup" };
        }
        const id = ++seq;
        return new Promise(resolve => {
          const timer = setTimeout(() => {
            pending.delete(id); kill();
            resolve({ text: "That took too long, so I stopped. A script may be stuck in an endless loop.", error: "timeout" });
          }, o.timeoutMs);
          pending.set(id, { resolve, timer });
          worker.postMessage({ type: "ask", id, text: String(text) });
        });
      },
      stop() { destroyed = true; kill(); pending.forEach(p => { clearTimeout(p.timer); p.resolve({ text: "Kignity AI is stopped.", error: "stopped" }); }); pending.clear(); }
    };
  }

  /* ------------------------------------------------------------------ chat UI */
  const CHAT_CSS = `
.kg-chat{display:flex;flex-direction:column;min-height:320px;max-height:520px;border:1px solid var(--kg-line,#2b3b41);border-radius:6px;background:var(--kg-bg,#0f171b);color:var(--kg-text,#e6edef);font:14px/1.5 'Segoe UI',system-ui,sans-serif}
.kg-head{display:flex;align-items:center;gap:8px;padding:10px 14px;border-bottom:1px solid var(--kg-line,#2b3b41);font-weight:700}
.kg-head span{margin-left:auto;font-weight:400;font-size:11px;color:var(--kg-muted,#9baab0)}
.kg-log{flex:1;overflow:auto;padding:12px 14px;display:flex;flex-direction:column;gap:8px}
.kg-msg{max-width:85%;padding:8px 12px;border-radius:10px;white-space:pre-wrap;overflow-wrap:anywhere}
.kg-msg.bot{align-self:flex-start;background:var(--kg-raised,#1b272d)}
.kg-msg.me{align-self:flex-end;background:#226c55;color:#fff}
.kg-msg.note{align-self:center;background:none;color:var(--kg-muted,#9baab0);font-size:12px;padding:0}
.kg-chips{display:flex;flex-wrap:wrap;gap:6px;padding:0 14px 8px}
.kg-chips button{padding:4px 10px;border:1px solid var(--kg-line,#2b3b41);border-radius:14px;background:none;color:var(--kg-accent,#71d8ae);cursor:pointer;font:inherit;font-size:12px}
.kg-chips button:hover{background:var(--kg-raised,#1b272d)}
.kg-form{display:flex;gap:8px;padding:10px 14px;border-top:1px solid var(--kg-line,#2b3b41)}
.kg-form input{flex:1;min-width:0;padding:9px 11px;border:1px solid var(--kg-line,#2b3b41);border-radius:4px;background:#0b1114;color:inherit;font:inherit}
.kg-form button{padding:8px 14px;border:0;border-radius:4px;background:#226c55;color:#fff;font:inherit;font-weight:700;cursor:pointer}
.kg-form button:disabled{opacity:.5;cursor:default}`;

  function mountChat(root, options = {}) {
    if (!document.getElementById("kgChatStyle")) {
      const style = document.createElement("style"); style.id = "kgChatStyle"; style.textContent = CHAT_CSS; document.head.append(style);
    }
    root.replaceChildren();
    const wrap = document.createElement("div"); wrap.className = "kg-chat";
    const head = document.createElement("div"); head.className = "kg-head";
    const title = document.createElement("strong"); title.textContent = options.title || "Kignity AI";
    const tag = document.createElement("span"); tag.textContent = options.tag || "";
    head.append(title, tag);
    const log = document.createElement("div"); log.className = "kg-log"; log.setAttribute("role", "log"); log.setAttribute("aria-live", "polite");
    const chips = document.createElement("div"); chips.className = "kg-chips";
    const form = document.createElement("form"); form.className = "kg-form"; form.autocomplete = "off";
    const input = document.createElement("input"); input.type = "text"; input.maxLength = 500; input.placeholder = "Ask Kignity AI…"; input.setAttribute("aria-label", "Message Kignity AI");
    const send = document.createElement("button"); send.type = "submit"; send.textContent = "Send";
    form.append(input, send); wrap.append(head, log, chips, form); root.append(wrap);

    let runtime = null, busy = false;
    function add(text, who) {
      const node = document.createElement("div"); node.className = "kg-msg " + who; node.textContent = text; log.append(node); log.scrollTop = log.scrollHeight; return node;
    }
    function setChips(list) {
      chips.replaceChildren();
      (list || []).forEach(text => {
        const b = document.createElement("button"); b.type = "button"; b.textContent = text; b.addEventListener("click", () => ask(text)); chips.append(b);
      });
    }
    async function ask(text) {
      text = String(text || "").trim();
      if (!text || busy || !runtime) return;
      busy = true; send.disabled = true; input.value = ""; add(text, "me"); setChips([]);
      const thinking = add("…", "bot");
      const reply = await runtime.ask(text);
      thinking.textContent = reply.text;
      if (options.onReply) options.onReply(text, reply);
      setChips(reply.suggestions);
      busy = false; send.disabled = false; input.focus();
    }
    form.addEventListener("submit", event => { event.preventDefault(); ask(input.value); });
    return {
      attach(rt, info, opts = {}) {
        runtime = rt; title.textContent = (info && info.name) || options.title || "Kignity AI";
        if (!opts.keep) { log.replaceChildren(); add((info && info.greeting) || "Hi!", "bot"); setChips(info && info.suggestions); }
        else add("Scripts reloaded.", "note");
      },
      clear(info) { log.replaceChildren(); add((info && info.greeting) || "Hi!", "bot"); setChips(info && info.suggestions); },
      note(text) { add(text, "note"); }
    };
  }

  /* ------------------------------------------------------------------ starter project */
  const T = String.raw;
  const STARTER = [
    ["kignity.json", "json", `{
  "name": "Kignity AI",
  "greeting": "Hi, I'm Kignity AI, the assistant for RP Tools. Ask me about our tools, or pick a suggestion below.",
  "fallback": "I'm not sure about that yet. Try asking about our tools, prices, or Refane.",
  "suggestions": ["What tools do you have?", "How much do tools cost?", "What is Refane?", "Help"]
}
`],
    ["README.md", "md", `# Kignity AI project

Kignity AI answers using the scripts in this project.

- **.js files** run as scripts, in alphabetical order by path. Use a number prefix to control the order (for example 01-greetings.js).
- **.json / .md / .txt files** are knowledge files. Read them with Kignity.data("path/to/file.json").
- **kignity.json** holds the name, greeting, fallback message and suggestion buttons.
- Other languages (py, lua, ts...) can be stored here but are not run.

## Writing a skill

    Kignity.skill({
      name: "opening-hours",
      patterns: ["opening hours", /when are you (open|available)/i],
      priority: 0,
      reply: (ctx) => "We are online all day!"
    });

- patterns: words (matched as whole words) or regular expressions.
- match(ctx): instead of patterns, return a truthy value (or a regex match) to claim the message.
- reply: text, or a function returning text, { text, suggestions: [...] } or a Promise.
- Return nothing from reply to let the next skill try.
- Higher priority skills are tried first.

## Other helpers

- Kignity.fallback(fn): runs when no skill answered.
- Kignity.before(fn): runs first on every message. Return a reply to stop there.
- Kignity.config: the contents of kignity.json.
- Kignity.context.tools: the published tools (name, description, price).
- Kignity.memory: an object that lasts for the current chat.
- Kignity.util.pick(list), .similarity(a, b), .tokens(text), .normalize(text).
- console.log(...) appears in the Script console of the employee workspace.

Scripts run in an isolated worker with no network access. A script that takes longer than 2 seconds is stopped.
`],
    ["skills/01-greetings.js", "js", `// Friendly basics.
Kignity.skill({
  name: "greeting",
  patterns: ["hello", "hi", "hey", "good morning", "good evening"],
  priority: 5,
  reply: () => Kignity.util.pick([
    "Hello! How can I help you with RP Tools today?",
    "Hi there! What would you like to know?"
  ])
});

Kignity.skill({
  name: "thanks",
  patterns: ["thanks", "thank you"],
  reply: () => "You're welcome!"
});

Kignity.skill({
  name: "help",
  patterns: ["help", "what can you do"],
  reply: () => ({
    text: "I can tell you about our tools and prices, explain Refane, and do simple maths. Try one of these:",
    suggestions: ["What tools do you have?", "How much do tools cost?", "What is Refane?", "12 * 7"]
  })
});
`],
    ["skills/02-tools.js", "js", `// Answers about the tools that are published in the Tools branch.
function toolLine(tool) {
  const price = tool.price > 0 ? tool.price + " Refane" : "Free";
  return "• " + tool.name + " (" + price + ")" + (tool.description ? " - " + tool.description : "");
}

Kignity.skill({
  name: "list-tools",
  patterns: [/\\b(what|which|list|show|any)\\b.*\\btools?\\b/i, "tools available"],
  reply: () => {
    const tools = Kignity.context.tools || [];
    if (!tools.length) return "No tools have been published yet. Check back soon!";
    return "Here are our tools:\\n" + tools.map(toolLine).join("\\n");
  }
});

Kignity.skill({
  name: "prices",
  patterns: [/\\b(price|prices|cost|how much|free)\\b/i],
  reply: () => {
    const tools = Kignity.context.tools || [];
    if (!tools.length) return "Prices are shown on each tool once tools are published. Tools priced at 0 Refane are free.";
    const free = tools.filter(t => !(t.price > 0));
    const paid = tools.filter(t => t.price > 0);
    return free.length + " tool(s) are free and " + paid.length + " cost Refane.\\n" + tools.map(toolLine).join("\\n");
  }
});
`],
    ["skills/03-math.js", "js", `// A tiny calculator: "12 * 7", "100 / 4", "5 + 3 =".
Kignity.skill({
  name: "math",
  priority: 10,
  match: (ctx) => ctx.text.match(/^\\s*(-?\\d+(?:\\.\\d+)?)\\s*([+\\-*\\/x×÷])\\s*(-?\\d+(?:\\.\\d+)?)\\s*=?\\s*\\??$/i),
  reply: (ctx) => {
    const [, a, op, b] = ctx.match;
    const x = Number(a), y = Number(b);
    let result;
    if (op === "+") result = x + y;
    else if (op === "-") result = x - y;
    else if (op === "/" || op === "÷") { if (y === 0) return "I can't divide by zero."; result = x / y; }
    else result = x * y;
    return a + " " + op + " " + b + " = " + Math.round(result * 1e6) / 1e6;
  }
});
`],
    ["skills/90-faq.js", "js", `// Looks up the closest question in knowledge/faq.json when no other skill answered.
const faq = Kignity.data("knowledge/faq.json") || [];

Kignity.fallback((ctx) => {
  let best = null, bestScore = 0;
  faq.forEach((item) => {
    (item.questions || []).forEach((question) => {
      const score = Kignity.util.similarity(ctx.text, question);
      if (score > bestScore) { bestScore = score; best = item; }
    });
  });
  if (best && bestScore >= 0.5) return best.answer;
});
`],
    ["knowledge/faq.json", "json", `[
  {
    "questions": ["What is Refane?", "What are Refane?", "Tell me about Refane"],
    "answer": "Refane is the virtual currency for Raking Productions. It is not cash and cannot be withdrawn. Some tools and features can cost Refane; others are free."
  },
  {
    "questions": ["Who makes these tools?", "Who is Raking Productions?"],
    "answer": "RP Tools is the tools branch of Raking Productions. Tools are built and published by the RP Tools team."
  },
  {
    "questions": ["How do I use a tool?", "How do I open a tool?"],
    "answer": "Open the Tools Library, choose a tool card, and it opens right on the page."
  }
]
`]
  ];
  function starterFiles() {
    const now = new Date().toISOString();
    return STARTER.map(([path, type, content]) => ({ path, type, content, updatedAt: now }));
  }

  window.KignityRuntime = { create, mountChat, starterFiles };
})();
