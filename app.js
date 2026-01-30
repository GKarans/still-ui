/* app.js — STILL Player Web UI (UI/UX demo)
   Requires these IDs in HTML:
   Login: #view-login #view-app #loginUser #loginPass #btnLogin #btnLogout
   Header: #deviceName #currentCassetteLabel #lockPill #hotspotLabel
   Battery: #batteryFill #batteryPctIn #batterySlider (optional)
   Settings modal: #modalBackdrop #modalSettings
     #btnOpenSettings #btnSaveSettings
     #settingsDeviceName #settingsNewPass #settingsNewPass2
     #settingsHotspotSsid #settingsHotspotPass #settingsHotspotPass2
   Cassettes: #btnNewCassette #cassetteSelect #cassetteList
     #cassetteMetaLine #btnRenameCassette #btnToggleLock
   Cassette modals: #modalNewCassette #modalRename
     #newCassetteName #newCassetteNfcA #newCassetteNfcB #btnCreateCassette
     #cassetteNameInput #btnSaveCassetteName
   Sides: #countA #countB #nfcA #nfcB #listA #listB #emptyA #emptyB
     buttons with [data-action="clearSide"][data-side="A|B"]
   Library: #btnAddMockSongs #btnUploadMock #searchLibrary #libraryList #libraryEmpty #libraryCount
   Bluetooth: #btnScanBT #btScanState #btFound #btFoundEmpty #btPaired #btPairedEmpty #btPairedCount
   Modals close: elements with [data-close-modal]
*/

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const STORAGE_KEY = "still_ui_state_v4";

const defaultState = {
  auth: { user: "still", pass: "still", loggedIn: false },
  firstLoginShown: false,

  deviceName: "STILL",

  hotspot: { ssid: "still", pass: "still" },

  batteryPct: 74,

  library: [],
  cassettes: [],
  currentCassetteId: null,

  bluetooth: {
    paired: [],         // [{id,name,mac,type,lastSeen}]
    lastFound: [],      // last scan results
    lastScanAt: null
  }
};

let state = loadState();
ensureAtLeastOneCassette();

/* ------------------ Persistence ------------------ */
function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return structuredClone(defaultState);
    return deepMerge(structuredClone(defaultState), JSON.parse(raw));
  } catch {
    return structuredClone(defaultState);
  }
}
function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}
function deepMerge(base, override) {
  for (const k of Object.keys(override || {})) {
    if (override[k] && typeof override[k] === "object" && !Array.isArray(override[k])) {
      base[k] = deepMerge(base[k] || {}, override[k]);
    } else {
      base[k] = override[k];
    }
  }
  return base;
}
function uid() {
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}
function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
function escapeHtml(s) {
  return String(s).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

/* ------------------ Toasts ------------------ */
function toast(msg, kind = "info") {
  const host = $("#toasts");
  if (!host) return;

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
  el.querySelector("button")?.addEventListener("click", () => el.remove());
  host.appendChild(el);
  setTimeout(() => { if (el.isConnected) el.remove(); }, 3200);
}

/* ------------------ Cassettes ------------------ */
function ensureAtLeastOneCassette() {
  if (state.cassettes.length === 0) {
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
  } else if (!state.currentCassetteId || !state.cassettes.some(c => c.id === state.currentCassetteId)) {
    state.currentCassetteId = state.cassettes[0].id;
    saveState();
  }
}
function getCurrentCassette() {
  return state.cassettes.find(c => c.id === state.currentCassetteId) || state.cassettes[0];
}
function setCurrentCassette(id) {
  if (!state.cassettes.some(c => c.id === id)) return;
  state.currentCassetteId = id;
  saveState();
  rerenderAll();
}
function isLocked() {
  return !!getCurrentCassette().locked;
}

/* ------------------ Views ------------------ */
function showLogin() {
  $("#view-login")?.classList.remove("hidden");
  $("#view-app")?.classList.add("hidden");
}
function showApp() {
  $("#view-login")?.classList.add("hidden");
  $("#view-app")?.classList.remove("hidden");
}

/* ------------------ Battery ------------------ */
function setBattery(pct) {
  state.batteryPct = clamp(Math.round(Number(pct) || 0), 0, 100);
  saveState();
  renderBattery();
}
function renderBattery() {
  const pct = clamp(state.batteryPct ?? 0, 0, 100);
  const fill = $("#batteryFill");
  const txt = $("#batteryPctIn");
  if (!fill || !txt) return;

  fill.style.width = `${pct}%`;
  txt.textContent = `${pct}%`;

  const isLow = pct <= 15;
  fill.style.backgroundColor = isLow ? "rgba(248,113,113,.85)" : "rgba(34,197,94,.85)";
  if (pct <= 5) fill.style.backgroundColor = "rgba(239,68,68,.92)";

  const bat = fill.closest(".battery");
  if (bat) bat.classList.toggle("low", isLow);
}

/* ------------------ Header & meta ------------------ */
function renderHeader() {
  const c = getCurrentCassette();
  const dn = $("#deviceName");
  if (dn) dn.textContent = state.deviceName || "STILL";

  const active = $("#currentCassetteLabel");
  if (active) active.textContent = c?.name || "—";

  const lockPill = $("#lockPill");
  if (lockPill) {
    if (c.locked) {
      lockPill.classList.remove("hidden");
      lockPill.textContent = "LOCK";
      lockPill.classList.add("pill-lock");
    } else {
      lockPill.classList.add("hidden");
      lockPill.classList.remove("pill-lock");
    }
  }

  const hotspotLabel = $("#hotspotLabel");
  if (hotspotLabel) hotspotLabel.textContent = state.hotspot?.ssid || "—";

  const meta = $("#cassetteMetaLine");
  if (meta) meta.textContent = `${c.name} · A:${c.sideA.length}/10 · B:${c.sideB.length}/10`;

  renderBattery();
}

/* ------------------ Tracks UI ------------------ */
function trackRow(t, where) {
  const row = document.createElement("div");
  row.className = "track";
  row.dataset.trackId = t.id;
  row.dataset.from = where;
  row.draggable = (where !== "LIB");

  const isLib = where === "LIB";
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

  if (!isLib) {
    row.addEventListener("dragstart", (e) => {
      if (isLocked()) { e.preventDefault(); return; }
      e.dataTransfer.setData("text/plain", JSON.stringify({ trackId: t.id, from: where, kind: "reorder" }));
      e.dataTransfer.effectAllowed = "move";
      row.classList.add("opacity-70");
    });
    row.addEventListener("dragend", () => row.classList.remove("opacity-70"));
  }

  row.querySelectorAll("button").forEach(btn => {
    btn.addEventListener("click", () => {
      if (isLocked()) { toast("Kasete ir LOCK režīmā.", "err"); return; }
      const act = btn.dataset.act;
      if (act === "addA") return addFromLibraryToSide(t.id, "A");
      if (act === "addB") return addFromLibraryToSide(t.id, "B");
      if (act === "removeToLib") return moveFromSideToLibrary(where, t.id);
      if (act === "deleteSd") return deleteFromSd(t.id);
    });
  });

  return row;
}

/* ------------------ Track mutations ------------------ */
function addFromLibraryToSide(trackId, side) {
  const c = getCurrentCassette();
  const target = side === "A" ? c.sideA : c.sideB;
  if (target.length >= 10) { toast(`Side ${side} ir pilns (10 dziesmas).`, "err"); return; }

  const idx = state.library.findIndex(t => t.id === trackId);
  if (idx === -1) return;
  target.push(state.library.splice(idx, 1)[0]);

  saveState();
  rerenderAll();
}
function moveFromSideToLibrary(side, trackId) {
  const c = getCurrentCassette();
  const arr = side === "A" ? c.sideA : c.sideB;
  const idx = arr.findIndex(t => t.id === trackId);
  if (idx === -1) return;

  state.library.unshift(arr.splice(idx, 1)[0]);
  saveState();
  rerenderAll();
  toast("Dziesma pārvietota uz Library.", "ok");
}
function deleteFromSd(trackId) {
  const idx = state.library.findIndex(t => t.id === trackId);
  if (idx === -1) return;
  const t = state.library[idx];
  state.library.splice(idx, 1);
  saveState();
  rerenderAll();
  toast(`Dzēsts no SD (demo): ${t.title}`, "ok");
}
function clearSide(side) {
  if (isLocked()) { toast("Kasete ir LOCK režīmā.", "err"); return; }
  const c = getCurrentCassette();
  const arr = side === "A" ? c.sideA : c.sideB;

  state.library.unshift(...arr);
  if (side === "A") c.sideA = [];
  else c.sideB = [];

  saveState();
  rerenderAll();
  toast(`Puse ${side} notīrīta (pārvietots uz Library).`, "ok");
}
function toggleLock() {
  const c = getCurrentCassette();
  c.locked = !c.locked;
  saveState();
  rerenderAll();
  toast(c.locked ? "Kasete bloķēta (LOCK)." : "Kasete atbloķēta.", "ok");
}

/* ------------------ Reorder (A/B) ------------------ */
function wireReorder(containerEl, side) {
  if (!containerEl) return;

  containerEl.addEventListener("dragover", (e) => {
    if (isLocked()) return;
    e.preventDefault();
  });

  containerEl.addEventListener("drop", (e) => {
    if (isLocked()) return;
    e.preventDefault();

    const payload = safeJson(e.dataTransfer.getData("text/plain"));
    if (!payload || payload.kind !== "reorder" || payload.from !== side) return;

    const c = getCurrentCassette();
    const arr = side === "A" ? c.sideA : c.sideB;

    const draggingIndex = arr.findIndex(t => t.id === payload.trackId);
    if (draggingIndex === -1) return;

    const targetEl = e.target.closest(".track");
    if (!targetEl) return;

    const targetId = targetEl.dataset.trackId;
    const targetIndex = arr.findIndex(t => t.id === targetId);
    if (targetIndex === -1) return;

    const [item] = arr.splice(draggingIndex, 1);
    arr.splice(targetIndex, 0, item);

    saveState();
    rerenderAll();
  });
}
function safeJson(s) { try { return JSON.parse(s); } catch { return null; } }

/* ------------------ Render lists & counts ------------------ */
function renderCountsAndNfc() {
  const c = getCurrentCassette();

  $("#countA") && ($("#countA").textContent = `${c.sideA.length}/10`);
  $("#countB") && ($("#countB").textContent = `${c.sideB.length}/10`);

  $("#emptyA") && ($("#emptyA").style.display = c.sideA.length ? "none" : "block");
  $("#emptyB") && ($("#emptyB").style.display = c.sideB.length ? "none" : "block");

  $("#libraryCount") && ($("#libraryCount").textContent = `${state.library.length} dziesmas`);
  $("#libraryEmpty") && ($("#libraryEmpty").style.display = state.library.length ? "none" : "block");

  const nfcA = $("#nfcA");
  const nfcB = $("#nfcB");
  if (nfcA) { nfcA.value = c.nfcA || ""; nfcA.disabled = c.locked; }
  if (nfcB) { nfcB.value = c.nfcB || ""; nfcB.disabled = c.locked; }
}
function renderLists() {
  const c = getCurrentCassette();

  const listA = $("#listA");
  const listB = $("#listB");
  if (listA) {
    listA.innerHTML = "";
    c.sideA.forEach(t => listA.appendChild(trackRow(t, "A")));
  }
  if (listB) {
    listB.innerHTML = "";
    c.sideB.forEach(t => listB.appendChild(trackRow(t, "B")));
  }

  const q = ($("#searchLibrary")?.value || "").trim().toLowerCase();
  const filtered = state.library.filter(t =>
    t.title.toLowerCase().includes(q) || t.artist.toLowerCase().includes(q)
  );

  const lib = $("#libraryList");
  if (lib) {
    lib.innerHTML = "";
    filtered.forEach(t => lib.appendChild(trackRow(t, "LIB")));
  }
}

/* ------------------ Cassette list UI ------------------ */
function renderCassetteList() {
  const c = getCurrentCassette();

  const sel = $("#cassetteSelect");
  if (sel) {
    sel.innerHTML = "";
    state.cassettes.forEach(cs => {
      const opt = document.createElement("option");
      opt.value = cs.id;
      opt.textContent = `${cs.name}${cs.locked ? " (LOCK)" : ""}`;
      if (cs.id === state.currentCassetteId) opt.selected = true;
      sel.appendChild(opt);
    });
  }

  const list = $("#cassetteList");
  if (list) {
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
          <div class="text-xs muted truncate">
            A:${cs.sideA.length}/10 · B:${cs.sideB.length}/10 · NFC A:${escapeHtml(cs.nfcA || "—")} · NFC B:${escapeHtml(cs.nfcB || "—")}
          </div>
        </div>
        <div class="text-xs muted shrink-0">Atvērt</div>
      `;
      row.addEventListener("click", () => setCurrentCassette(cs.id));
      list.appendChild(row);
    });
  }
}

/* ------------------ Bluetooth (UI demo) ------------------ */
function renderBluetooth() {
  const found = $("#btFound");
  const paired = $("#btPaired");
  const foundEmpty = $("#btFoundEmpty");
  const pairedEmpty = $("#btPairedEmpty");
  const pairedCount = $("#btPairedCount");

  const foundList = state.bluetooth.lastFound || [];
  const pairedList = state.bluetooth.paired || [];

  if (pairedCount) pairedCount.textContent = String(pairedList.length);

  if (found) {
    found.innerHTML = "";
    foundList.forEach(dev => found.appendChild(btDeviceRow(dev, "found")));
  }
  if (paired) {
    paired.innerHTML = "";
    pairedList.forEach(dev => paired.appendChild(btDeviceRow(dev, "paired")));
  }

  if (foundEmpty) foundEmpty.style.display = foundList.length ? "none" : "block";
  if (pairedEmpty) pairedEmpty.style.display = pairedList.length ? "none" : "block";
}

function btDeviceRow(dev, mode) {
  // mode: found | paired
  const row = document.createElement("div");
  row.className = "track";
  const isPaired = mode === "paired";

  row.innerHTML = `
    <div class="meta flex items-center gap-3 min-w-0 flex-1">
      <span class="drag-handle" title="Bluetooth">${isPaired ? "✓" : "⌁"}</span>
      <div class="text min-w-0 flex-1">
        <div class="font-semibold truncate">${escapeHtml(dev.name)}</div>
        <div class="text-xs muted truncate">${escapeHtml(dev.type)} · ${escapeHtml(dev.mac)} · ${escapeHtml(dev.rssi)}</div>
      </div>
    </div>
    <div class="actions flex items-center gap-2 shrink-0">
      ${isPaired
        ? `<button class="btn btn-ghost btn-sm btn-chip" data-act="forget">Aizmirst</button>`
        : `<button class="btn btn-primary btn-sm btn-chip" data-act="pair">Sapārot</button>`
      }
    </div>
  `;

  row.querySelector("button")?.addEventListener("click", () => {
    if (isPaired) forgetBt(dev.id);
    else pairBt(dev.id);
  });

  return row;
}

function startBtScan() {
  const statePill = $("#btScanState");
  if (statePill) statePill.textContent = "Scanning…";

  // Simulate async scan
  const now = Date.now();
  state.bluetooth.lastScanAt = now;

  // generate demo devices
  const demo = genBtDevices();
  state.bluetooth.lastFound = demo;

  saveState();
  renderBluetooth();

  setTimeout(() => {
    const pill = $("#btScanState");
    if (pill) pill.textContent = "Done";
  }, 900);
}

function genBtDevices() {
  // Keep deterministic-ish but varied
  const samples = [
    { name: "JBL Flip 6", type: "Speaker" },
    { name: "Sony WH-CH520", type: "Headphones" },
    { name: "Marshall Emberton", type: "Speaker" },
    { name: "Anker Soundcore", type: "Speaker" },
    { name: "Car Audio", type: "Car" },
    { name: "AirPods", type: "Headphones" }
  ];

  const count = 4 + Math.floor(Math.random() * 3); // 4..6
  const out = [];
  for (let i = 0; i < count; i++) {
    const s = samples[Math.floor(Math.random() * samples.length)];
    out.push({
      id: uid(),
      name: s.name,
      type: s.type,
      mac: fakeMac(),
      rssi: `${-30 - Math.floor(Math.random() * 55)} dBm`,
      lastSeen: Date.now()
    });
  }

  // remove ones already paired (by mac) from found list to look realistic
  const pairedMacs = new Set((state.bluetooth.paired || []).map(p => p.mac));
  return out.filter(d => !pairedMacs.has(d.mac));
}

function fakeMac() {
  const hex = () => Math.floor(Math.random() * 256).toString(16).padStart(2, "0").toUpperCase();
  return `${hex()}:${hex()}:${hex()}:${hex()}:${hex()}:${hex()}`;
}

function pairBt(deviceId) {
  const found = state.bluetooth.lastFound || [];
  const idx = found.findIndex(d => d.id === deviceId);
  if (idx === -1) return;

  const dev = found.splice(idx, 1)[0];

  // avoid duplicates by MAC
  const paired = state.bluetooth.paired || [];
  if (paired.some(p => p.mac === dev.mac)) {
    toast("Šī ierīce jau ir sapārota.", "info");
  } else {
    paired.unshift(dev);
    state.bluetooth.paired = paired;
    toast(`Sapārots: ${dev.name}`, "ok");
  }

  state.bluetooth.lastFound = found;
  saveState();
  renderBluetooth();
}

function forgetBt(deviceId) {
  const paired = state.bluetooth.paired || [];
  const idx = paired.findIndex(d => d.id === deviceId);
  if (idx === -1) return;

  const dev = paired.splice(idx, 1)[0];
  state.bluetooth.paired = paired;

  saveState();
  renderBluetooth();
  toast(`Aizmirsts: ${dev.name}`, "ok");
}

/* ------------------ Settings modal ------------------ */
function openModal(idSel) {
  $("#modalBackdrop")?.classList.remove("hidden");
  $(idSel)?.classList.remove("hidden");
}
function closeModals() {
  $("#modalBackdrop")?.classList.add("hidden");
  ["#modalSettings", "#modalNewCassette", "#modalRename"].forEach(id => $(id)?.classList.add("hidden"));
}
function openSettings(prefill = true) {
  if (prefill) {
    $("#settingsDeviceName") && ($("#settingsDeviceName").value = state.deviceName || "STILL");

    $("#settingsNewPass") && ($("#settingsNewPass").value = "");
    $("#settingsNewPass2") && ($("#settingsNewPass2").value = "");

    $("#settingsHotspotSsid") && ($("#settingsHotspotSsid").value = state.hotspot?.ssid || "still");
    $("#settingsHotspotPass") && ($("#settingsHotspotPass").value = "");
    $("#settingsHotspotPass2") && ($("#settingsHotspotPass2").value = "");
  }
  openModal("#modalSettings");
}

function saveSettingsFromModal() {
  const dn = ($("#settingsDeviceName")?.value || "").trim() || "STILL";

  const web1 = $("#settingsNewPass")?.value || "";
  const web2 = $("#settingsNewPass2")?.value || "";

  const hsSsid = ($("#settingsHotspotSsid")?.value || "").trim() || "still";
  const hs1 = $("#settingsHotspotPass")?.value || "";
  const hs2 = $("#settingsHotspotPass2")?.value || "";

  // Apply device name always
  state.deviceName = dn;

  // Web password (optional)
  if (web1 || web2) {
    if (web1.length < 4) { toast("Web parolei ieteicams vismaz 4 simboli.", "err"); return false; }
    if (web1 !== web2) { toast("Web paroles nesakrīt.", "err"); return false; }
    state.auth.pass = web1;
  }

  // Hotspot settings (optional but recommended on first login)
  state.hotspot.ssid = hsSsid;

  if (hs1 || hs2) {
    if (hs1.length < 8) { toast("Hotspot parolei ieteicams vismaz 8 simboli.", "err"); return false; }
    if (hs1 !== hs2) { toast("Hotspot paroles nesakrīt.", "err"); return false; }
    state.hotspot.pass = hs1;
  }

  saveState();
  closeModals();
  rerenderAll();
  toast("Iestatījumi saglabāti.", "ok");
  return true;
}

/* ------------------ Demo songs ------------------ */
function addDemoSongs() {
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

/* ------------------ Rerender ------------------ */
function rerenderAll() {
  ensureAtLeastOneCassette();
  renderHeader();
  renderCassetteList();
  renderCountsAndNfc();
  renderLists();
  renderBluetooth();
  renderBattery();
}

/* ------------------ Init wiring ------------------ */
function init() {
  // login fields
  $("#loginUser") && ($("#loginUser").value = state.auth.user || "still");
  $("#loginPass") && ($("#loginPass").value = "");

  $("#btnLogin")?.addEventListener("click", () => {
    const u = ($("#loginUser")?.value || "").trim();
    const p = $("#loginPass")?.value || "";

    const ok = (u === state.auth.user && p === state.auth.pass);
    if (!ok) { toast("Nepareizs lietotājvārds vai parole.", "err"); return; }

    state.auth.loggedIn = true;
    saveState();

    showApp();
    rerenderAll();

    // first login: prompt to change both web + hotspot defaults
    const isDefaultWeb = (state.auth.user === "still" && state.auth.pass === "still");
    const isDefaultHotspot = ((state.hotspot?.ssid || "") === "still" && (state.hotspot?.pass || "") === "still");

    if ((isDefaultWeb || isDefaultHotspot) && !state.firstLoginShown) {
      state.firstLoginShown = true;
      saveState();
      openSettings(true);
      toast("Ieteikums: nomaini Web un Hotspot noklusējumus.", "info");
    }
  });

  $("#btnLogout")?.addEventListener("click", () => {
    state.auth.loggedIn = false;
    saveState();
    showLogin();
    toast("Iziets.", "ok");
  });

  // Settings open/save/close
  $("#btnOpenSettings")?.addEventListener("click", () => openSettings(true));
  $("#btnSaveSettings")?.addEventListener("click", () => saveSettingsFromModal());
  $("#modalBackdrop")?.addEventListener("click", closeModals);
  $$("[data-close-modal]").forEach(btn => btn.addEventListener("click", closeModals));

  // New cassette modal
  $("#btnNewCassette")?.addEventListener("click", () => {
    $("#newCassetteName") && ($("#newCassetteName").value = "");
    $("#newCassetteNfcA") && ($("#newCassetteNfcA").value = "");
    $("#newCassetteNfcB") && ($("#newCassetteNfcB").value = "");
    openModal("#modalNewCassette");
  });

  $("#btnCreateCassette")?.addEventListener("click", () => {
    const name = ($("#newCassetteName")?.value || "").trim() || "Jauna kasete";
    const nfcA = ($("#newCassetteNfcA")?.value || "").trim();
    const nfcB = ($("#newCassetteNfcB")?.value || "").trim();

    const id = uid();
    state.cassettes.unshift({ id, name, locked: false, nfcA, nfcB, sideA: [], sideB: [] });
    state.currentCassetteId = id;

    saveState();
    closeModals();
    rerenderAll();
    toast("Kasete izveidota.", "ok");
  });

  // Rename cassette modal
  $("#btnRenameCassette")?.addEventListener("click", () => {
    const c = getCurrentCassette();
    $("#cassetteNameInput") && ($("#cassetteNameInput").value = c.name || "");
    openModal("#modalRename");
  });

  $("#btnSaveCassetteName")?.addEventListener("click", () => {
    const c = getCurrentCassette();
    c.name = ($("#cassetteNameInput")?.value || "").trim() || "Kasete";
    saveState();
    closeModals();
    rerenderAll();
    toast("Nosaukums saglabāts.", "ok");
  });

  // Lock
  $("#btnToggleLock")?.addEventListener("click", () => toggleLock());

  // Switch cassette (mobile select)
  $("#cassetteSelect")?.addEventListener("change", (e) => setCurrentCassette(e.target.value));

  // NFC edits
  $("#nfcA")?.addEventListener("input", () => {
    if (isLocked()) return;
    const c = getCurrentCassette();
    c.nfcA = ($("#nfcA")?.value || "").trim();
    saveState();
    renderCassetteList();
    renderHeader();
  });
  $("#nfcB")?.addEventListener("input", () => {
    if (isLocked()) return;
    const c = getCurrentCassette();
    c.nfcB = ($("#nfcB")?.value || "").trim();
    saveState();
    renderCassetteList();
    renderHeader();
  });

  // Clear sides
  $$("[data-action='clearSide']").forEach(btn => {
    btn.addEventListener("click", () => clearSide(btn.dataset.side));
  });

  // Library
  $("#btnAddMockSongs")?.addEventListener("click", addDemoSongs);
  $("#btnUploadMock")?.addEventListener("click", () => {
    const t = { id: uid(), title: "Jauns uploads", artist: "Unknown", len: "3:00" };
    state.library.unshift(t);
    saveState();
    rerenderAll();
    toast("Simulēts upload: 1 dziesma Library.", "ok");
  });
  $("#searchLibrary")?.addEventListener("input", renderLists);

  // Reorder within A/B
  wireReorder($("#listA"), "A");
  wireReorder($("#listB"), "B");

  // Battery demo slider
  const slider = $("#batterySlider");
  if (slider) {
    slider.value = String(state.batteryPct ?? 74);
    slider.addEventListener("input", () => setBattery(slider.value));
  }
  setBattery(state.batteryPct ?? 74);

  // Bluetooth
  $("#btnScanBT")?.addEventListener("click", () => startBtScan());

  // Initial
  if (state.auth.loggedIn) showApp();
  else showLogin();

  rerenderAll();
}

init();
