/* STILL Player Web UI (UI-only / demo)
   - Multiple cassettes (switchable)
   - NFC ID per side (editable)
   - Side A/B: "Dzēst" moves track back to Library
   - Library: "Dzēst" deletes from SD (demo: removes from list)
   - Lock cassette disables editing (add/remove/reorder/NFC edits)
   - Mobile-friendly: +A/+B buttons instead of drag&drop from library
   - Drag within A/B lists for ordering (bonus for desktop + long-press mobile)
*/

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const STORAGE_KEY = "still_ui_state_v2";

const defaultState = {
  auth: { user: "still", pass: "still", loggedIn: false },
  deviceName: "STILL",
  library: [],
  cassettes: [],
  currentCassetteId: null,
  firstLoginShown: false
};

let state = loadState();
ensureAtLeastOneCassette();

function loadState(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if(!raw) return structuredClone(defaultState);
    return deepMerge(structuredClone(defaultState), JSON.parse(raw));
  }catch{
    return structuredClone(defaultState);
  }
}

function saveState(){
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function deepMerge(base, override){
  for(const k of Object.keys(override || {})){
    if(override[k] && typeof override[k] === "object" && !Array.isArray(override[k])){
      base[k] = deepMerge(base[k] || {}, override[k]);
    } else {
      base[k] = override[k];
    }
  }
  return base;
}

function uid(){
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}

/* ---------- Toasts ---------- */
function toast(msg, kind="info"){
  const el = document.createElement("div");
  el.className = "toast";
  el.innerHTML = `
    <div class="flex items-start justify-between gap-3">
      <div class="text-sm">
        <div class="font-semibold">${kind === "err" ? "Kļūda" : kind === "ok" ? "OK" : "Info"}</div>
        <div class="text-slate-200">${escapeHtml(msg)}</div>
      </div>
      <button class="btn btn-ghost btn-sm">✕</button>
    </div>
  `;
  el.querySelector("button").addEventListener("click", () => el.remove());
  $("#toasts").appendChild(el);
  setTimeout(() => { if(el.isConnected) el.remove(); }, 3200);
}

function escapeHtml(s){
  return String(s).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;");
}

/* ---------- Cassettes ---------- */
function ensureAtLeastOneCassette(){
  if(state.cassettes.length === 0){
    const id = uid();
    state.cassettes.push({
      id,
      name: "Demo kasete",
      locked: false,
      nfcA: "",
      nfcB: "",
      sideA: [],
      sideB: []
    });
    state.currentCassetteId = id;
    saveState();
  } else if(!state.currentCassetteId || !state.cassettes.some(c => c.id === state.currentCassetteId)){
    state.currentCassetteId = state.cassettes[0].id;
    saveState();
  }
}

function getCurrentCassette(){
  return state.cassettes.find(c => c.id === state.currentCassetteId) || state.cassettes[0];
}

function setCurrentCassette(id){
  if(!state.cassettes.some(c => c.id === id)) return;
  state.currentCassetteId = id;
  saveState();
  rerenderAll();
}

/* ---------- Auth views ---------- */
function showLogin(){
  $("#view-login").classList.remove("hidden");
  $("#view-app").classList.add("hidden");
}
function showApp(){
  $("#view-login").classList.add("hidden");
  $("#view-app").classList.remove("hidden");
}

/* ---------- Render header/meta ---------- */
function renderHeader(){
  const c = getCurrentCassette();
  $("#deviceName").textContent = state.deviceName;
  $("#currentCassetteLabel").textContent = c?.name || "—";

  const lockPill = $("#lockPill");
  if(c.locked){
    lockPill.classList.remove("hidden");
    lockPill.classList.add("pill-lock");
    lockPill.textContent = "LOCK";
  } else {
    lockPill.classList.add("hidden");
    lockPill.classList.remove("pill-lock");
  }

  $("#cassetteMetaLine").textContent =
    `${c.name} · A:${c.sideA.length}/10 · B:${c.sideB.length}/10`;
}

/* ---------- Track row ---------- */
function trackRow(t, where){
  // where: "A" | "B" | "LIB"
  const row = document.createElement("div");
  row.className = "track";
  row.draggable = (where !== "LIB"); // reorder only on A/B
  row.dataset.trackId = t.id;
  row.dataset.from = where;

  const isLib = where === "LIB";

  // Actions:
  // - Library: +A +B Dzēst (SD delete)
  // - Side A/B: Dzēst = move back to library
  const actionsHTML = isLib
    ? `
      <button class="btn btn-primary btn-sm btn-chip" data-act="addA">+A</button>
      <button class="btn btn-primary btn-sm btn-chip" data-act="addB">+B</button>
      <button class="btn btn-ghost btn-sm btn-chip" data-act="deleteSd">Dzēst</button>
    `
    : `
      <button class="btn btn-ghost btn-sm btn-chip" data-act="removeToLib">Dzēst</button>
    `;

  row.innerHTML = `
    <div class="meta flex items-center gap-3 min-w-0 flex-1">
      <span class="drag-handle" title="${isLib ? "" : "Velc, lai mainītu secību"}">${isLib ? "♪" : "⋮⋮"}</span>
      <div class="text min-w-0 flex-1">
        <div class="font-semibold truncate">${escapeHtml(t.title)}</div>
        <div class="text-xs muted truncate">${escapeHtml(t.artist)} · ${escapeHtml(t.len)}</div>
      </div>
    </div>

    <div class="actions flex items-center gap-2 shrink-0">
      ${actionsHTML}
    </div>
  `;

  // Drag for reordering within same list
  if(!isLib){
    row.addEventListener("dragstart", (e) => {
      if(isLocked()) { e.preventDefault(); return; }
      e.dataTransfer.setData("text/plain", JSON.stringify({
        trackId: t.id,
        from: where,
        kind: "reorder"
      }));
      e.dataTransfer.effectAllowed = "move";
      row.classList.add("opacity-70");
    });

    row.addEventListener("dragend", () => row.classList.remove("opacity-70"));
  }

  row.querySelectorAll("button").forEach(btn => {
    btn.addEventListener("click", () => {
      if(isLocked()){
        toast("Kasete ir LOCK režīmā.", "err");
        return;
      }

      const act = btn.dataset.act;

      if(act === "addA") return addFromLibraryToSide(t.id, "A");
      if(act === "addB") return addFromLibraryToSide(t.id, "B");

      if(act === "removeToLib") return moveFromSideToLibrary(where, t.id);

      if(act === "deleteSd") return deleteFromSd(t.id);
    });
  });

  return row;
}

function isLocked(){
  return !!getCurrentCassette().locked;
}

/* ---------- Render lists/counts/NFC ---------- */
function renderCountsAndNfc(){
  const c = getCurrentCassette();

  $("#countA").textContent = `${c.sideA.length}/10`;
  $("#countB").textContent = `${c.sideB.length}/10`;

  $("#emptyA").style.display = c.sideA.length ? "none" : "block";
  $("#emptyB").style.display = c.sideB.length ? "none" : "block";

  $("#libraryCount").textContent = `${state.library.length} dziesmas`;
  $("#libraryEmpty").style.display = state.library.length ? "none" : "block";

  // NFC inputs
  $("#nfcA").value = c.nfcA || "";
  $("#nfcB").value = c.nfcB || "";

  // Disable NFC edits if locked
  $("#nfcA").disabled = c.locked;
  $("#nfcB").disabled = c.locked;
  $("#nfcA").classList.toggle("is-locked", c.locked);
  $("#nfcB").classList.toggle("is-locked", c.locked);
}

function renderLists(){
  const c = getCurrentCassette();

  // Side A
  $("#listA").innerHTML = "";
  c.sideA.forEach(t => $("#listA").appendChild(trackRow(t, "A")));

  // Side B
  $("#listB").innerHTML = "";
  c.sideB.forEach(t => $("#listB").appendChild(trackRow(t, "B")));

  // Library (search filter)
  const q = ($("#searchLibrary").value || "").trim().toLowerCase();
  const filtered = state.library.filter(t =>
    t.title.toLowerCase().includes(q) ||
    t.artist.toLowerCase().includes(q)
  );

  $("#libraryList").innerHTML = "";
  filtered.forEach(t => $("#libraryList").appendChild(trackRow(t, "LIB")));
}

/* ---------- Cassette list UI ---------- */
function renderCassetteList(){
  const c = getCurrentCassette();

  // Mobile select
  const sel = $("#cassetteSelect");
  sel.innerHTML = "";
  state.cassettes.forEach(cs => {
    const opt = document.createElement("option");
    opt.value = cs.id;
    opt.textContent = `${cs.name}${cs.locked ? " (LOCK)" : ""}`;
    if(cs.id === state.currentCassetteId) opt.selected = true;
    sel.appendChild(opt);
  });

  // Desktop list
  const list = $("#cassetteList");
  list.innerHTML = "";
  state.cassettes.forEach(cs => {
    const row = document.createElement("button");
    row.className = `w-full text-left track ${cs.id === c.id ? "ring-2 ring-white/20" : ""}`;
    row.innerHTML = `
      <div class="min-w-0 flex-1">
        <div class="flex items-center gap-2">
          <div class="font-semibold truncate">${escapeHtml(cs.name)}</div>
          ${cs.locked ? `<span class="pill pill-lock">LOCK</span>` : ""}
        </div>
        <div class="text-xs muted truncate">A:${cs.sideA.length}/10 · B:${cs.sideB.length}/10 · NFC A:${escapeHtml(cs.nfcA || "—")} · NFC B:${escapeHtml(cs.nfcB || "—")}</div>
      </div>
      <div class="text-xs muted shrink-0">Atvērt</div>
    `;
    row.addEventListener("click", () => setCurrentCassette(cs.id));
    list.appendChild(row);
  });
}

/* ---------- Mutations ---------- */
function addFromLibraryToSide(trackId, side){
  const c = getCurrentCassette();
  const target = side === "A" ? c.sideA : c.sideB;
  if(target.length >= 10){
    toast(`Side ${side} ir pilns (10 dziesmas).`, "err");
    return;
  }

  const idx = state.library.findIndex(t => t.id === trackId);
  if(idx === -1) return;

  const track = state.library.splice(idx, 1)[0];
  target.push(track);

  saveState();
  rerenderAll();
}

function moveFromSideToLibrary(side, trackId){
  const c = getCurrentCassette();
  const arr = side === "A" ? c.sideA : c.sideB;
  const idx = arr.findIndex(t => t.id === trackId);
  if(idx === -1) return;

  const track = arr.splice(idx, 1)[0];
  state.library.unshift(track);

  saveState();
  rerenderAll();
  toast("Dziesma pārvietota uz Library.", "ok");
}

function deleteFromSd(trackId){
  // UI demo: remove from library list (simulate SD delete)
  const idx = state.library.findIndex(t => t.id === trackId);
  if(idx === -1) return;
  const t = state.library[idx];

  state.library.splice(idx, 1);
  saveState();
  rerenderAll();
  toast(`Dzēsts no SD (demo): ${t.title}`, "ok");
}

function clearSide(side){
  if(isLocked()){
    toast("Kasete ir LOCK režīmā.", "err");
    return;
  }

  const c = getCurrentCassette();
  const arr = side === "A" ? c.sideA : c.sideB;

  // Move all back to library
  state.library.unshift(...arr);
  if(side === "A") c.sideA = [];
  else c.sideB = [];

  saveState();
  rerenderAll();
  toast(`Puse ${side} notīrīta (pārvietots uz Library).`, "ok");
}

function toggleLock(){
  const c = getCurrentCassette();
  c.locked = !c.locked;
  saveState();
  rerenderAll();
  toast(c.locked ? "Kasete bloķēta (LOCK)." : "Kasete atbloķēta.", "ok");
}

/* ---------- Reorder inside A/B ---------- */
function wireReorderDropzone(containerEl, side){
  containerEl.addEventListener("dragover", (e) => {
    if(isLocked()) return;
    e.preventDefault();
  });

  containerEl.addEventListener("drop", (e) => {
    if(isLocked()) return;
    e.preventDefault();

    const payload = safeJson(e.dataTransfer.getData("text/plain"));
    if(!payload || payload.kind !== "reorder") return;
    if(payload.from !== side) return;

    const c = getCurrentCassette();
    const arr = side === "A" ? c.sideA : c.sideB;

    const draggingIndex = arr.findIndex(t => t.id === payload.trackId);
    if(draggingIndex === -1) return;

    // Find drop target track by walking up DOM
    const targetEl = e.target.closest(".track");
    if(!targetEl) return;
    const targetId = targetEl.dataset.trackId;
    const targetIndex = arr.findIndex(t => t.id === targetId);
    if(targetIndex === -1) return;

    // Move
    const [item] = arr.splice(draggingIndex, 1);
    arr.splice(targetIndex, 0, item);

    saveState();
    rerenderAll();
  });
}

function safeJson(s){
  try{ return JSON.parse(s); } catch { return null; }
}

/* ---------- Modals ---------- */
function openModal(modalId){
  $("#modalBackdrop").classList.remove("hidden");
  $(modalId).classList.remove("hidden");
}
function closeModals(){
  $("#modalBackdrop").classList.add("hidden");
  $$("#modalSettings, #modalRename, #modalNewCassette").forEach(m => m.classList.add("hidden"));
}

/* ---------- Demo data ---------- */
function addDemoSongs(){
  const seed = [
    ["Klusums", "STILL", "3:12"],
    ["Zvaigznes", "Northern Tape", "2:58"],
    ["Ceļš", "Riga Nights", "3:41"],
    ["Pusnakts", "Static Bloom", "4:03"],
    ["Vējš", "Amber Radio", "3:09"],
    ["Neona ielas", "City Loop", "2:49"],
    ["Tālu", "Lake Echo", "3:22"],
    ["Siltums", "Warm Signal", "3:33"],
    ["Atmiņas", "Analog Heart", "3:18"],
    ["Rīts", "Morning FM", "2:55"],
    ["Skices", "Paper Planes", "3:26"],
    ["Sāls", "Sea Lines", "3:05"],
  ];
  const add = seed.map(([title, artist, len]) => ({ id: uid(), title, artist, len }));
  state.library.unshift(...add);
  saveState();
  rerenderAll();
  toast("Pievienotas demo dziesmas Library.", "ok");
}

/* ---------- Rerender ---------- */
function rerenderAll(){
  ensureAtLeastOneCassette();
  renderHeader();
  renderCassetteList();
  renderCountsAndNfc();
  renderLists();
  applyLockedUI();
}

function applyLockedUI(){
  const locked = isLocked();

  // Disable actions that mutate
  $("#btnRenameCassette").disabled = false; // rename allowed even locked? (var atstāt) — atstājam atļautu.
  $("#btnToggleLock").textContent = locked ? "Unlock" : "Lock";

  // Disable clear buttons if locked
  $$("[data-action='clearSide']").forEach(btn => {
    btn.disabled = locked;
    btn.classList.toggle("opacity-50", locked);
  });

  // “lock” vibe on cassette editor lists
  const editorCard = $(".card:nth-of-type(2)"); // rough, but works in this simple structure
  // safer: toggle on dropzones
  $("#dropA").classList.toggle("is-locked", locked);
  $("#dropB").classList.toggle("is-locked", locked);

  // Also disable Library add if locked (so you can’t modify cassette)
  $("#dropLibrary").classList.toggle("is-locked", false); // library itself still scrollable
}

/* ---------- Wire UI ---------- */
function init(){
  // Login defaults
  $("#loginUser").value = state.auth.user || "still";
  $("#loginPass").value = "";

  $("#btnLogin").addEventListener("click", () => {
    const u = $("#loginUser").value.trim();
    const p = $("#loginPass").value;

    const ok = (u === state.auth.user && p === state.auth.pass);
    if(!ok){
      toast("Nepareizs lietotājvārds vai parole.", "err");
      return;
    }

    state.auth.loggedIn = true;
    saveState();
    showApp();
    rerenderAll();

    // Show settings once if still/still
    const isDefault = (state.auth.user === "still" && state.auth.pass === "still");
    if(isDefault && !state.firstLoginShown){
      state.firstLoginShown = true;
      saveState();
      $("#settingsDeviceName").value = state.deviceName;
      $("#settingsNewPass").value = "";
      $("#settingsNewPass2").value = "";
      openModal("#modalSettings");
      toast("Ieteikums: nomaini noklusēto paroli.", "info");
    }
  });

  $("#btnLogout").addEventListener("click", () => {
    state.auth.loggedIn = false;
    saveState();
    showLogin();
    toast("Iziets.", "ok");
  });

  // Settings
  $("#btnOpenSettings").addEventListener("click", () => {
    $("#settingsDeviceName").value = state.deviceName;
    $("#settingsNewPass").value = "";
    $("#settingsNewPass2").value = "";
    openModal("#modalSettings");
  });

  $("#btnSaveSettings").addEventListener("click", () => {
    const name = $("#settingsDeviceName").value.trim() || "STILL";
    const np1 = $("#settingsNewPass").value;
    const np2 = $("#settingsNewPass2").value;

    state.deviceName = name;

    if(np1 || np2){
      if(np1.length < 4){
        toast("Parolei ieteicams vismaz 4 simboli.", "err");
        return;
      }
      if(np1 !== np2){
        toast("Paroles nesakrīt.", "err");
        return;
      }
      state.auth.pass = np1;
      toast("Parole nomainīta (UI demo).", "ok");
    }

    saveState();
    closeModals();
    rerenderAll();
    toast("Saglabāts.", "ok");
  });

  // New cassette
  $("#btnNewCassette").addEventListener("click", () => {
    $("#newCassetteName").value = "";
    $("#newCassetteNfcA").value = "";
    $("#newCassetteNfcB").value = "";
    openModal("#modalNewCassette");
  });

  $("#btnCreateCassette").addEventListener("click", () => {
    const name = ($("#newCassetteName").value || "").trim() || "Jauna kasete";
    const nfcA = ($("#newCassetteNfcA").value || "").trim();
    const nfcB = ($("#newCassetteNfcB").value || "").trim();

    const id = uid();
    state.cassettes.unshift({
      id,
      name,
      locked: false,
      nfcA,
      nfcB,
      sideA: [],
      sideB: []
    });
    state.currentCassetteId = id;

    saveState();
    closeModals();
    rerenderAll();
    toast("Kasete izveidota.", "ok");
  });

  // Rename cassette
  $("#btnRenameCassette").addEventListener("click", () => {
    const c = getCurrentCassette();
    $("#cassetteNameInput").value = c.name || "";
    openModal("#modalRename");
  });

  $("#btnSaveCassetteName").addEventListener("click", () => {
    const c = getCurrentCassette();
    c.name = ($("#cassetteNameInput").value || "").trim() || "Kasete";
    saveState();
    closeModals();
    rerenderAll();
    toast("Nosaukums saglabāts.", "ok");
  });

  // Lock toggle
  $("#btnToggleLock").addEventListener("click", () => toggleLock());

  // Modal close
  $("#modalBackdrop").addEventListener("click", closeModals);
  $$("[data-close-modal]").forEach(btn => btn.addEventListener("click", closeModals));

  // Clear side buttons
  $$("[data-action='clearSide']").forEach(btn => {
    btn.addEventListener("click", () => clearSide(btn.dataset.side));
  });

  // Library
  $("#btnAddMockSongs").addEventListener("click", addDemoSongs);
  $("#btnUploadMock").addEventListener("click", () => {
    const t = { id: uid(), title: "Jauns uploads", artist: "Unknown", len: "3:00" };
    state.library.unshift(t);
    saveState();
    rerenderAll();
    toast("Simulēts upload: 1 dziesma Library.", "ok");
  });
  $("#searchLibrary").addEventListener("input", renderLists);

  // NFC edit handlers (save on input)
  $("#nfcA").addEventListener("input", () => {
    if(isLocked()) return;
    const c = getCurrentCassette();
    c.nfcA = $("#nfcA").value.trim();
    saveState();
    renderCassetteList();
    renderHeader();
  });
  $("#nfcB").addEventListener("input", () => {
    if(isLocked()) return;
    const c = getCurrentCassette();
    c.nfcB = $("#nfcB").value.trim();
    saveState();
    renderCassetteList();
    renderHeader();
  });

  // Cassette select (mobile)
  $("#cassetteSelect").addEventListener("change", (e) => {
    setCurrentCassette(e.target.value);
  });

  // Reorder dropzones for A/B lists
  wireReorderDropzone($("#listA"), "A");
  wireReorderDropzone($("#listB"), "B");

  // Initial view
  if(state.auth.loggedIn) showApp();
  else showLogin();

  rerenderAll();
}

init();
