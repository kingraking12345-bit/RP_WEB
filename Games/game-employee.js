(() => {
  const TABS_KEY = "rpGamesManagedTabs.v1";
  const EVENTS_KEY = "rpGamesEvents.v1";
  const SUBSCRIPTIONS_KEY = "rpGamesEventSubscriptions.v1";
  const SENT_KEY = "rpGamesEventNotifications.v1";
  const $ = id => document.getElementById(id);
  let pendingBanner = "";

  function load(key) {
    try { const data = JSON.parse(localStorage.getItem(key) || "[]"); return Array.isArray(data) ? data : []; }
    catch { return []; }
  }
  function save(key, data) {
    try { localStorage.setItem(key, JSON.stringify(data)); return true; }
    catch { return false; }
  }
  function logActivity(message) { window.dispatchEvent(new CustomEvent("rp-ee-activity", {detail: message})); }
  function tell(id, message, error = false) {
    const node = $(id); node.textContent = message; node.style.color = error ? "var(--ee-red)" : "var(--ee-green)";
  }
  function textButton(label, onClick, extraClass = "") {
    const button = document.createElement("button"); button.type = "button"; button.textContent = label;
    if (extraClass) button.className = extraClass;
    button.addEventListener("click", onClick); return button;
  }
  function safeFilename(value) {
    return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "games-tab";
  }
  function newId() { return crypto.randomUUID ? crypto.randomUUID() : `rp-${Date.now()}-${Math.random().toString(36).slice(2)}`; }
  function toLocalInput(value) {
    const date=new Date(value);if(Number.isNaN(date.getTime()))return "";
    return new Date(date.getTime()-date.getTimezoneOffset()*60000).toISOString().slice(0,16);
  }
  function localDate(value) {
    const date = new Date(value); if (Number.isNaN(date.getTime())) return "Date not set";
    return date.toLocaleString();
  }

  function currentTab() {
    if (window.rpGamesStudio) window.rpGamesStudio.applyToFields(true); // the Tab code workspace is the source of the HTML, CSS and JavaScript
    return {id: $("tabId").value || newId(),name: $("tabName").value.trim(),subtitle: $("tabSubtitle").value.trim(),price: Math.max(0, Math.min(1000000, Math.floor(Number($("tabPrice").value)) || 0)),html: $("tabHtml").value,css: $("tabCss").value,js: $("tabJs").value,updatedAt:new Date().toISOString()};
  }
  function clearTabForm() {
    $("tabForm").reset(); $("tabId").value = ""; $("saveTab").textContent = "Add tab to Games preview"; tell("tabMessage", "");
    window.dispatchEvent(new CustomEvent("rp-games-tab-cleared"));
  }
  function renderTabs() {
    const root = $("tabList"); root.replaceChildren(); const tabs = load(TABS_KEY);
    if (!tabs.length) { const empty = document.createElement("p"); empty.className = "ee-empty"; empty.textContent = "No custom tabs yet."; root.append(empty); return; }
    tabs.forEach(tab => {
      const row = document.createElement("article"); row.className = "ee-list-item";
      const info = document.createElement("div"), title = document.createElement("strong"), subtitle = document.createElement("span");
      title.textContent = tab.name; subtitle.textContent = `${Number(tab.price) > 0 ? Number(tab.price) + " Refane" : "Free"} · ${tab.subtitle || "No subtitle"} · Updated ${localDate(tab.updatedAt)}`; info.append(title, subtitle);
      const actions = document.createElement("div"); actions.className = "ee-list-actions";
      actions.append(textButton("Edit", () => {
        $("tabId").value=tab.id;$("tabName").value=tab.name;$("tabSubtitle").value=tab.subtitle||"";$("tabPrice").value=Number(tab.price)>0?Number(tab.price):0;$("tabHtml").value=tab.html||"";$("tabCss").value=tab.css||"";$("tabJs").value=tab.js||"";$("saveTab").textContent="Save tab";window.dispatchEvent(new CustomEvent("rp-games-tab-loaded",{detail:tab}));window.scrollTo({top:0,behavior:"smooth"});
      }));
      actions.append(textButton("Delete", () => {
        if (!confirm(`Delete the custom tab “${tab.name}” from this browser?`)) return;
        if (save(TABS_KEY, tabs.filter(item => item.id !== tab.id))) { renderTabs(); logActivity(`Deleted Games tab “${tab.name}”`); tell("tabMessage", "Custom tab deleted from this browser."); }
        else tell("tabMessage", "Could not update local storage.", true);
      }, "ee-danger"));
      row.append(info, actions); root.append(row);
    });
  }
  $("tabForm").addEventListener("submit", event => {
    event.preventDefault(); const tab = currentTab(), tabs = load(TABS_KEY), index = tabs.findIndex(item => item.id === tab.id);
    if (!tab.html.trim()) { tell("tabMessage", "Add HTML to index.html in Tab code first.", true); return; }
    if (index >= 0) tabs[index] = tab; else tabs.push(tab);
    if (!save(TABS_KEY, tabs)) { tell("tabMessage", "Browser storage is full or unavailable. Export the page files instead.", true); return; }
    renderTabs(); logActivity(`${index >= 0 ? "Updated" : "Created"} Games tab “${tab.name}”`); tell("tabMessage", "Saved in this browser. It will appear in the Games preview on this device and site origin."); clearTabForm();
  });
  $("resetTab").addEventListener("click", clearTabForm);
  $("deleteAllTabs").addEventListener("click", () => {
    const tabs = load(TABS_KEY); if (!tabs.length) { tell("tabMessage", "There are no custom tabs to delete."); return; }
    if (!confirm(`Delete all ${tabs.length} custom Games tabs saved in this browser? This does not remove the archived source code or any files already exported.`)) return;
    if (save(TABS_KEY, [])) { renderTabs(); clearTabForm(); tell("tabMessage", "All custom browser tabs were removed."); }
    else tell("tabMessage", "Could not update local storage.", true);
  });

  function pageSource(tab, separateFiles) {
    const title = tab.name.replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
    const subtitle = tab.subtitle.replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
    const styles = separateFiles ? '<link rel="stylesheet" href="styles.css">' : `<style>${tab.css}</style>`;
    const script = separateFiles ? '<script src="script.js"><\/script>' : `<script>${tab.js}<\/script>`;
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>${styles}</head><body><main><h1>${title}</h1><p>${subtitle}</p>${tab.html}</main>${script}</body></html>`;
  }
  function downloadFile(name, content, type) {
    const url = URL.createObjectURL(new Blob([content], {type})), anchor = document.createElement("a");
    anchor.href=url;anchor.download=name;anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  $("downloadHtml").addEventListener("click", () => {
    const tab = currentTab(); if (!tab.name || !tab.html.trim()) { tell("tabMessage", "Enter a tab name and HTML content first.", true); return; }
    downloadFile(`${safeFilename(tab.name)}.html`, pageSource(tab, false), "text/html;charset=utf-8");
    tell("tabMessage", "Standalone HTML downloaded.");
  });
  $("saveFolder").addEventListener("click", async () => {
    const tab = currentTab(); if (!tab.name || !tab.html.trim()) { tell("tabMessage", "Enter a tab name and HTML content first.", true); return; }
    if (!window.showDirectoryPicker) { tell("tabMessage", "Folder export is not supported in this browser. Use Download standalone HTML.", true); return; }
    try {
      const parent = await window.showDirectoryPicker({mode:"readwrite"});
      const folder = await parent.getDirectoryHandle(`rp-games-${safeFilename(tab.name)}`, {create:true});
      const files = [["index.html",pageSource(tab,true)],["styles.css",tab.css],["script.js",tab.js]];
      for (const [name, content] of files) { const handle=await folder.getFileHandle(name,{create:true}),writer=await handle.createWritable();await writer.write(content);await writer.close(); }
      tell("tabMessage", "Created a folder with index.html, styles.css, and script.js.");
    } catch (error) { if (error.name !== "AbortError") tell("tabMessage", `Folder export failed: ${error.message}`, true); }
  });

  async function readBanner(file) {
    if (!file) return "";
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) throw new Error("Choose a PNG, JPEG, or WebP banner image.");
    if (file.size > 8 * 1024 * 1024) throw new Error("Banner must be under 8 MB.");
    const bitmap = await createImageBitmap(file), scale = Math.min(1, 1400 / bitmap.width, 800 / bitmap.height), canvas = document.createElement("canvas");
    canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
    const ctx=canvas.getContext("2d");ctx.fillStyle="#111820";ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close?.();
    return canvas.toDataURL("image/jpeg",0.78);
  }
  function paintBanner(src) {
    const preview=$("bannerPreview");preview.replaceChildren();
    if (!src) { preview.textContent="Banner preview";return; }
    const image=document.createElement("img");image.src=src;image.alt="Event banner preview";preview.append(image);
  }
  function clearEventForm() {
    $("eventForm").reset();$("eventId").value="";pendingBanner="";paintBanner("");$("saveEvent").textContent="Publish event teaser";tell("eventMessage","");
  }
  function renderEvents() {
    const root=$("eventList");root.replaceChildren();const events=load(EVENTS_KEY).sort((a,b)=>new Date(a.releaseAt)-new Date(b.releaseAt));
    if (!events.length) { const empty=document.createElement("p");empty.className="ee-empty";empty.textContent="No event teasers yet.";root.append(empty);return; }
    events.forEach(item=>{
      const row=document.createElement("article");row.className="ee-list-item";const info=document.createElement("div"),name=document.createElement("strong"),summary=document.createElement("span"),actions=document.createElement("div");
      name.textContent=item.name;summary.textContent=`${item.subtitle||"No subtitle"} · ${localDate(item.releaseAt)}${item.status==="draft"?" · DRAFT (hidden)":""}`;info.append(name,summary);actions.className="ee-list-actions";
      actions.append(textButton("Edit",()=>{
        $("eventId").value=item.id;$("eventName").value=item.name;$("eventSubtitle").value=item.subtitle||"";$("eventDescription").value=item.description||"";$("eventNotes").value=item.notes||"";$("eventRelease").value=toLocalInput(item.releaseAt);$("eventStatus").value=item.status==="draft"?"draft":"published";pendingBanner=item.banner||"";paintBanner(pendingBanner);$("saveEvent").textContent="Save event changes";document.querySelector('[data-panel="events"]').click();window.scrollTo({top:0,behavior:"smooth"});
      }));
      actions.append(textButton("Delete",()=>{
        if(!confirm(`Delete the event teaser “${item.name}” from this browser?`))return;
        save(EVENTS_KEY,events.filter(event=>event.id!==item.id));save(SUBSCRIPTIONS_KEY,load(SUBSCRIPTIONS_KEY).filter(id=>id!==item.id));save(SENT_KEY,load(SENT_KEY).filter(id=>id!==item.id));renderEvents();logActivity(`Deleted event “${item.name}”`);tell("eventMessage","Event removed from this browser.");
      },"ee-danger"));row.append(info,actions);root.append(row);
    });
  }
  $("eventBanner").addEventListener("change",async event=>{
    const file=event.target.files?.[0];if(!file)return;
    try { pendingBanner=await readBanner(file);paintBanner(pendingBanner);tell("eventMessage","Banner ready."); }
    catch(error) { event.target.value="";tell("eventMessage",error.message,true); }
  });
  $("eventForm").addEventListener("submit",event=>{
    event.preventDefault();const id=$("eventId").value||newId(),events=load(EVENTS_KEY),existing=events.find(item=>item.id===id);
    const item={id,name:$("eventName").value.trim(),subtitle:$("eventSubtitle").value.trim(),description:$("eventDescription").value.trim(),releaseAt:new Date($("eventRelease").value).toISOString(),notes:$("eventNotes").value.trim(),status:$("eventStatus").value==="draft"?"draft":"published",banner:pendingBanner||existing?.banner||"",updatedAt:new Date().toISOString()};
    const next=existing?events.map(entry=>entry.id===id?item:entry):[...events,item];
    if(!save(EVENTS_KEY,next)){tell("eventMessage","Browser storage is full. Use a smaller banner image and try again.",true);return;}
    renderEvents();logActivity(`${existing?"Updated":"Created"} event “${item.name}”${item.status==="draft"?" (draft)":""}`);clearEventForm();tell("eventMessage","Event teaser saved. Notify buttons appear in the Games preview on this browser/site origin.");
  });
  $("resetEvent").addEventListener("click",clearEventForm);

  document.querySelectorAll("[data-panel]").forEach(button=>button.addEventListener("click",()=>{
    const panel=button.dataset.panel;
    document.querySelectorAll("[data-panel]").forEach(tab=>{const active=tab===button;tab.classList.toggle("active",active);tab.setAttribute("aria-selected",String(active));});
    document.querySelectorAll(".ee-panel").forEach(section=>{const active=section.id===`panel-${panel}`;section.classList.toggle("active",active);section.hidden=!active;});
  }));

  $("storageStatus").textContent=location.protocol==="file:"?"Open through HTTPS for shared same-origin preview":"Saved in this browser";
  renderTabs();renderEvents();
})();
