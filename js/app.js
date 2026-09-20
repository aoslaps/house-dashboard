/* ============================================================
   app.js — wires data.js, storage.js, model3d.js, and the DOM.
   Supports Renovation mode, Electrical Breaker Mapping mode,
   Floor level switching (Main/Basement), and 3D Orbital Model.
   Single source of truth. No framework, zero build step.
   ============================================================ */
(function () {
  "use strict";

  const SS = window.StorageService;
  const BASELINE = structuredClone(window.HOUSE);
  let H = window.HOUSE;

  const $  = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  const STATUS = {
    "not-started": { label: "Not started", color: "#9AA4AE" },
    "in-progress": { label: "In progress", color: "#E0A22B" },
    "blocked":     { label: "Blocked",     color: "#C4553B" },
    "complete":    { label: "Complete",    color: "#3E8E5A" },
  };

  let state = {
    mode: "renovation",       // "renovation" | "electrical"
    view: "2d",               // "2d" | "3d"
    circuitsView: "panels",   // "panels" | "table"
    level: "main",            // "main" | "basement" | "all"
    phase: "existing",        // "existing" | "proposed" | "both"
    selected: null,           // selected room id
    activeCircuit: null,      // active breaker/circuit id (e.g. "A12")
    hoverCircuit: null,       // hovered breaker/circuit id
    filter: ""
  };

  /* ---------- helpers ---------- */
  const money = (n) => "$" + Math.round(n).toLocaleString();
  const sqft  = (n) => n.toLocaleString(undefined, { maximumFractionDigits: 0 }) + " sq ft";
  const byId  = (id) => H.rooms.find((r) => r.id === id);
  const circuitById = (id) => H.circuits.find((c) => c.id === id);

  function updateSyncPill() {
    const el = $("#saveIndicator");
    if (!el) return;
    const inSync = (JSON.stringify(H) === JSON.stringify(BASELINE));
    el.classList.toggle("is-synced", inSync);
    el.classList.toggle("is-unexported", !inSync);
    el.textContent = inSync ? "✓ In sync with data.js" : "● Local edits not exported";
  }

  function flashSaved() {
    const el = $("#saveIndicator");
    if (!el) return;
    el.textContent = "● Saving…";
    el.classList.add("is-saving");
    clearTimeout(flashSaved._timer);
    flashSaved._timer = setTimeout(() => {
      el.classList.remove("is-saving");
      updateSyncPill();
    }, 250);
  }

  function compressAndAddPhoto(file, room) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const maxDim = 1200;
          let w = img.width;
          let h = img.height;
          if (w > maxDim || h > maxDim) {
            if (w > h) {
              h = Math.round((h * maxDim) / w);
              w = maxDim;
            } else {
              w = Math.round((w * maxDim) / h);
              h = maxDim;
            }
          }
          const canvas = document.createElement("canvas");
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0, w, h);
          const dataUrl = canvas.toDataURL("image/jpeg", 0.82);
          if (!room.photos) room.photos = [];
          room.photos.push(dataUrl);
          resolve();
        };
        img.onerror = () => resolve();
        img.src = e.target.result;
      };
      reader.onerror = () => resolve();
      reader.readAsDataURL(file);
    });
  }

  function showPhotoModal(imgSrc, title) {
    let modal = $("#photoModal");
    if (!modal) {
      modal = document.createElement("div");
      modal.id = "photoModal";
      modal.className = "modal-overlay photo-lightbox";
      document.body.appendChild(modal);
    }
    modal.innerHTML = `
      <div class="photo-modal-content">
        <div class="photo-modal-head">
          <span style="font-size:14px;font-weight:600;color:#fff;">${title || "Photo"}</span>
          <button class="modal-close" id="btnClosePhotoModal" title="Close (Esc)">✕</button>
        </div>
        <img src="${imgSrc}" class="photo-modal-img" alt="${title || "Photo"}" />
      </div>
    `;
    modal.hidden = false;
    modal.classList.remove("hidden");
    modal.style.display = "flex";

    function closeModal() {
      modal.hidden = true;
      modal.classList.add("hidden");
      modal.style.display = "none";
      document.removeEventListener("keydown", onKeyDown);
    }

    function onKeyDown(e) {
      if (e.key === "Escape") {
        closeModal();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    $("#btnClosePhotoModal").onclick = closeModal;
    modal.onclick = (e) => {
      if (e.target === modal) closeModal();
    };
  }

  function roomsForPhase(phase) {
    let list = H.rooms;
    if (phase === "existing") list = list.filter((r) => r.phase === "existing");
    else if (phase === "proposed") list = list.filter((r) => r.phase === "existing" || r.phase === "proposed");

    // Level filter for room list
    if (state.level === "main") list = list.filter((r) => r.floor !== "basement");
    else if (state.level === "basement") list = list.filter((r) => r.floor === "basement");

    return list;
  }

  /* ---------- aggregates ---------- */
  function aggregate(rooms) {
    const finished = rooms.filter((r) => r.countsAsFinished);
    const finishedSqft = finished.reduce((a, r) => a + (r.area || 0), 0);
    const budget = rooms.reduce((a, r) => a + (r.budget || 0), 0);
    const spent  = rooms.reduce((a, r) => a + (r.spent || 0), 0);

    const mode = (H.meta && H.meta.progressWeighting) || "area";
    const weightOf = (r) =>
      mode === "budget" ? (r.budget || 0) :
      mode === "area"   ? (r.area   || 0) : 1;
    let wsum = 0, wtot = 0;
    rooms.forEach((r) => { const w = weightOf(r); wsum += w * (r.percent || 0); wtot += w; });
    const overall = wtot ? Math.round(wsum / wtot) : 0;

    const statusCounts = {};
    Object.keys(STATUS).forEach((k) => (statusCounts[k] = 0));
    rooms.forEach((r) => (statusCounts[r.status] = (statusCounts[r.status] || 0) + 1));

    return { finishedSqft, budget, spent, overall, statusCounts };
  }

  /* ---------- render: KPIs ---------- */
  function renderKpis(agg) {
    if (state.mode === "electrical") {
      const totalCircuits = H.circuits.length;
      const offCircuits = H.circuits.filter((c) => c.status === "off").length;
      const mappedRooms = new Set(H.circuits.flatMap((c) => c.rooms || [])).size;
      const subInstalled = H.meta && H.meta.subpanelInstalled;
      $("#kpis").innerHTML = [
        ["Active circuits", (totalCircuits - offCircuits) + " / " + totalCircuits],
        ["Mapped rooms",    mappedRooms + " / " + H.rooms.length],
        ["Service capacity", subInstalled ? "200A Main + 100A Sub" : "200A Main Service"],
      ].map(([l, v]) => `<div class="kpi"><span class="v">${v}</span><span class="l">${l}</span></div>`).join("");
    } else {
      $("#kpis").innerHTML = [
        ["Overall complete", agg.overall + "%"],
        ["Finished area",    sqft(agg.finishedSqft)],
        ["Spent / budget",   money(agg.spent) + " / " + money(agg.budget)],
      ].map(([l, v]) => `<div class="kpi"><span class="v">${v}</span><span class="l">${l}</span></div>`).join("");
    }
  }

  /* ---------- render: legend ---------- */
  function renderLegend() {
    if (state.mode === "electrical") {
      $("#legend").innerHTML = `
        <span><i style="background:#00E5FF;box-shadow:0 0 6px #00E5FF;"></i>Active Circuit (Illuminated)</span>
        <span><i style="background:#52C47E;"></i>Breaker ON</span>
        <span><i style="background:#C4553B;"></i>Breaker OFF / Tripped</span>
        <span style="color:var(--graphite);font-size:11px;margin-left:auto;">Click breaker to trace · Click room to inspect</span>
      `;
    } else {
      $("#legend").innerHTML = Object.entries(STATUS)
        .map(([, s]) => `<span><i style="background:${s.color}"></i>${s.label}</span>`)
        .join("");
    }
  }

  /* ---------- render: room list ---------- */
  function renderList() {
    const rooms = roomsForPhase(state.phase)
      .filter((r) => r.name.toLowerCase().includes(state.filter))
      .sort((a, b) => (b.area || 0) - (a.area || 0));
    $("#roomList").innerHTML = rooms.map((r) => `
      <li data-id="${r.id}" class="${r.id === state.selected ? "is-selected" : ""}">
        <span class="dot" style="background:${STATUS[r.status].color}"></span>
        <span class="nm">${r.name}</span>
        <span class="ar">${r.area ? Math.round(r.area) : "—"}</span>
      </li>`).join("");
    $$("#roomList li").forEach((li) => li.addEventListener("click", () => selectRoom(li.dataset.id)));
  }

  /* ---------- render: SVG colors + phase & electrical visibility ---------- */
  function paintPlan() {
    const activeCId = state.hoverCircuit || state.activeCircuit;
    const activeCircuit = activeCId ? circuitById(activeCId) : null;
    const activeRoomIds = activeCircuit ? new Set(activeCircuit.rooms || []) : null;

    // 1. Floor Level Visibility
    const basementGroup = $("#basementFloor");
    if (basementGroup) {
      basementGroup.style.display = (state.level === "main" ? "none" : "block");
    }

    // Main floor root elements (walls/image)
    const mainElements = $$("#floorplan > g:not(#basementFloor), #floorplan > clipPath");
    mainElements.forEach((el) => {
      el.style.display = (state.level === "basement" ? "none" : "");
    });

    // 2. Room styling
    $$(".room", $("#floorplan")).forEach((g) => {
      const r = byId(g.id);
      const shape = g.querySelector("rect, polygon, path, .room-shape");
      if (!r) { g.classList.add("is-hidden"); return; }

      // Level check
      const roomLevel = r.floor === "basement" ? "basement" : "main";
      const matchesLevel = (state.level === "all" || state.level === roomLevel);

      // Phase visibility
      const matchesPhase =
        state.phase === "existing" ? r.phase === "existing" :
        state.phase === "proposed" ? true : true;

      const visible = matchesLevel && matchesPhase;
      g.classList.toggle("is-hidden", !visible);
      g.classList.toggle("is-proposed", r.phase === "proposed");
      g.classList.toggle("is-selected", r.id === state.selected);

      if (state.mode === "electrical") {
        if (activeRoomIds) {
          const isAct = activeRoomIds.has(r.id);
          g.classList.toggle("is-circuit-active", isAct);
          g.classList.toggle("is-dimmed", !isAct);
        } else {
          g.classList.remove("is-circuit-active");
          g.classList.remove("is-dimmed");
        }
        if (shape) shape.style.fill = "";
      } else {
        g.classList.remove("is-circuit-active");
        g.classList.remove("is-dimmed");
        if (shape) shape.style.fill = STATUS[r.status].color + "2E"; // ~18% alpha
      }
    });

    // Update 3D model if active
    if (window.Model3D && state.view === "3d") {
      window.Model3D.updateRoomTints();
      if (state.mode === "electrical") {
        window.Model3D.highlightCircuit(activeCId);
      } else {
        window.Model3D.highlightRoom(state.selected);
      }
    }
  }

  /* ---------- render: Breaker Box ---------- */
  function renderBreakerBox() {
    const grid = $("#panelsGrid");
    const tableWrap = $("#circuitsTableWrap");
    if (!grid) return;

    if (state.circuitsView === "table") {
      grid.hidden = true;
      if (tableWrap) {
        tableWrap.hidden = false;
        renderCircuitsTable();
      }
      return;
    }

    grid.hidden = false;
    if (tableWrap) tableWrap.hidden = true;

    const subInstalled = H.meta && H.meta.subpanelInstalled;

    const panels = [
      { id: "main", name: "Main Panel (Panel A)", capacity: "200A Main Service", isInstalled: true },
      { id: "sub",  name: "Subpanel (Panel B)",   capacity: "100A Subfeed",      isInstalled: !!subInstalled },
    ];

    grid.innerHTML = panels.map((p) => {
      const circuits = H.circuits.filter((c) => (c.panel || "main") === p.id);
      const isSub = (p.id === "sub");

      let badgeHtml = "";
      if (isSub) {
        badgeHtml = p.isInstalled
          ? `<span class="panel-main-breaker" style="color:#52C47E;border-color:#2B6946;">100A ACTIVE</span>`
          : `<span class="panel-uninstalled-badge">PLANNED (NOT INSTALLED)</span>`;
      } else {
        badgeHtml = `<span class="panel-main-breaker">200A MAIN</span>`;
      }

      const toggleActionHtml = isSub
        ? `<button class="panel-action-btn" id="btnToggleSubpanel">
            ${p.isInstalled ? "Mark as Planned" : "Mark as Installed"}
           </button>`
        : ``;

      return `
        <div class="panel-enclosure ${!p.isInstalled ? "is-uninstalled" : ""}" data-panel="${p.id}">
          <div class="panel-door-head">
            <div>
              <div class="panel-title">${p.name}</div>
              <div style="font-size:11px;color:#8C9CAE;">${p.capacity}</div>
            </div>
            <div style="display:flex;align-items:center;gap:8px;">
              ${toggleActionHtml}
              ${badgeHtml}
            </div>
          </div>
          <div class="breaker-rows">
            ${circuits.length ? circuits.map((c) => {
              const isAct = (state.hoverCircuit === c.id || state.activeCircuit === c.id);
              const isOff = (c.status === "off");
              const ampsClass = `amps-${c.amps || 15}`;
              const roomBadges = (c.rooms || []).map((rid) => {
                const rm = byId(rid);
                return `<span class="breaker-room-tag">${rm ? rm.name : rid}</span>`;
              }).join("");

              return `
                <div class="breaker-item ${isAct ? "is-active" : ""} ${isOff ? "is-off" : ""}" data-circuit="${c.id}">
                  <span class="breaker-num">#${c.breaker || c.id}</span>
                  <span class="breaker-amps ${ampsClass}">${c.amps || 15}A</span>
                  <div class="breaker-info">
                    <div class="breaker-desc">
                      ${c.description || "Circuit " + c.id}
                      ${c.placeholder ? '<span class="placeholder-badge" style="margin-left:4px;">PLACEHOLDER</span>' : ''}
                    </div>
                    <div class="breaker-rooms">${roomBadges || '<span style="color:#6A7888;font-size:10px;">Unassigned</span>'}</div>
                  </div>
                  <div style="display:flex;align-items:center;gap:4px;">
                    <button class="breaker-toggle-btn ${isOff ? "is-off" : ""}" data-circuit="${c.id}" title="Toggle breaker ${c.id}">
                      ${isOff ? "OFF" : "ON"}
                    </button>
                    <button class="btn-del-task btn-edit-breaker" data-circuit="${c.id}" title="Edit breaker" style="opacity:0.6;padding:4px 6px;">✏️</button>
                  </div>
                </div>
              `;
            }).join("") : `<div style="padding:14px;text-align:center;color:#6A7888;font-size:12px;">No breakers assigned to this panel yet.</div>`}
          </div>
        </div>
      `;
    }).join("");

    // Toggle subpanel install status
    const btnToggleSub = $("#btnToggleSubpanel", grid);
    if (btnToggleSub) {
      btnToggleSub.addEventListener("click", () => {
        if (!H.meta) H.meta = {};
        H.meta.subpanelInstalled = !H.meta.subpanelInstalled;
        SS.save(H);
        flashSaved();
        SS.logEvent("subpanel_toggle", { installed: H.meta.subpanelInstalled });
        renderBreakerBox();
        renderKpis(aggregate(roomsForPhase(state.phase)));
      });
    }

    // Breaker hover & click event listeners
    $$(".breaker-item", grid).forEach((el) => {
      const cid = el.dataset.circuit;
      el.addEventListener("mouseenter", () => {
        state.hoverCircuit = cid;
        paintPlan();
      });
      el.addEventListener("mouseleave", () => {
        state.hoverCircuit = null;
        paintPlan();
      });
      el.addEventListener("click", (e) => {
        if (e.target.closest(".breaker-toggle-btn") || e.target.closest(".btn-edit-breaker")) return;
        state.activeCircuit = (state.activeCircuit === cid ? null : cid);
        paintPlan();
        renderBreakerBox();
      });
    });

    // Breaker ON/OFF toggle button
    $$(".breaker-toggle-btn", grid).forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const cid = btn.dataset.circuit;
        const c = circuitById(cid);
        if (c) {
          c.status = (c.status === "off" ? "on" : "off");
          SS.save(H);
          flashSaved();
          SS.logEvent("breaker_toggle", { circuitId: c.id, status: c.status });
          renderBreakerBox();
          renderKpis(aggregate(roomsForPhase(state.phase)));
        }
      });
    });

    // Breaker Edit button
    $$(".btn-edit-breaker", grid).forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const cid = btn.dataset.circuit;
        const c = circuitById(cid);
        if (c) showEditBreakerModal(c);
      });
    });
  }

  /* ---------- render: Circuits Table Editor ---------- */
  function renderCircuitsTable() {
    const wrap = $("#circuitsTableWrap");
    if (!wrap) return;

    wrap.innerHTML = `
      <table class="circuits-table">
        <thead>
          <tr>
            <th style="width:65px;">ID</th>
            <th style="width:70px;">Breaker #</th>
            <th style="width:140px;">Panel</th>
            <th style="width:80px;">Amps</th>
            <th>Description</th>
            <th class="table-rooms-cell">Connected Rooms</th>
            <th style="width:110px;">Status</th>
            <th style="width:50px;"></th>
          </tr>
        </thead>
        <tbody>
          ${H.circuits.map((c) => {
            const unassignedRooms = H.rooms.filter((rm) => !(c.rooms || []).includes(rm.id));
            return `
              <tr data-circuit="${c.id}">
                <td><span class="circuit-chip" style="margin:0;">${c.id}</span></td>
                <td>
                  <input type="number" class="table-input num circuit-field" data-id="${c.id}" data-field="breaker" value="${c.breaker || ""}" min="1" max="60" />
                </td>
                <td>
                  <select class="table-select circuit-field" data-id="${c.id}" data-field="panel">
                    <option value="main" ${c.panel === "main" ? "selected" : ""}>Main (Panel A - 200A)</option>
                    <option value="sub" ${c.panel === "sub" ? "selected" : ""}>Subpanel (Panel B - 100A)</option>
                  </select>
                </td>
                <td>
                  <select class="table-select circuit-field" data-id="${c.id}" data-field="amps">
                    <option value="15" ${c.amps === 15 ? "selected" : ""}>15A</option>
                    <option value="20" ${c.amps === 20 ? "selected" : ""}>20A</option>
                    <option value="30" ${c.amps === 30 ? "selected" : ""}>30A</option>
                    <option value="50" ${c.amps === 50 ? "selected" : ""}>50A</option>
                  </select>
                </td>
                <td>
                  <input type="text" class="table-input circuit-field" data-id="${c.id}" data-field="description" value="${c.description || ""}" placeholder="Circuit description" />
                </td>
                <td class="table-rooms-cell">
                  <div class="table-rooms-list">
                    ${(c.rooms || []).map((rid) => {
                      const rm = byId(rid);
                      return `<span class="table-room-chip">${rm ? rm.name : rid} <button class="btn-remove-room" data-cid="${c.id}" data-rid="${rid}" title="Remove room">✕</button></span>`;
                    }).join("")}
                  </div>
                  ${unassignedRooms.length ? `
                    <select class="table-select btn-add-room-to-circuit" data-cid="${c.id}">
                      <option value="">+ Add room…</option>
                      ${unassignedRooms.map((rm) => `<option value="${rm.id}">${rm.name}</option>`).join("")}
                    </select>
                  ` : ``}
                </td>
                <td>
                  <label style="display:inline-flex;align-items:center;gap:6px;font-size:11.5px;cursor:pointer;">
                    <input type="checkbox" class="cb-placeholder" data-id="${c.id}" ${c.placeholder ? "checked" : ""} />
                    <span class="${c.placeholder ? "placeholder-badge" : "verified-badge"}">${c.placeholder ? "Placeholder" : "Verified"}</span>
                  </label>
                </td>
                <td>
                  <button class="btn-del-circuit" data-id="${c.id}" title="Delete circuit ${c.id}">🗑️</button>
                </td>
              </tr>
            `;
          }).join("")}
        </tbody>
      </table>
    `;

    // Field edit listeners
    $$(".circuit-field", wrap).forEach((el) => {
      el.addEventListener("change", (e) => {
        const cid = el.dataset.id;
        const field = el.dataset.field;
        const c = circuitById(cid);
        if (!c) return;
        if (field === "breaker" || field === "amps") {
          c[field] = parseInt(e.target.value, 10) || 0;
        } else {
          c[field] = e.target.value;
        }
        SS.save(H);
        flashSaved();
        refreshAll();
      });
    });

    // Placeholder toggle
    $$(".cb-placeholder", wrap).forEach((cb) => {
      cb.addEventListener("change", (e) => {
        const cid = cb.dataset.id;
        const c = circuitById(cid);
        if (c) {
          c.placeholder = e.target.checked;
          SS.save(H);
          flashSaved();
          refreshAll();
        }
      });
    });

    // Remove room from circuit
    $$(".btn-remove-room", wrap).forEach((btn) => {
      btn.addEventListener("click", () => {
        const cid = btn.dataset.cid;
        const rid = btn.dataset.rid;
        const c = circuitById(cid);
        if (c && c.rooms) {
          c.rooms = c.rooms.filter((x) => x !== rid);
          SS.save(H);
          flashSaved();
          refreshAll();
        }
      });
    });

    // Add room to circuit
    $$(".btn-add-room-to-circuit", wrap).forEach((sel) => {
      sel.addEventListener("change", (e) => {
        const cid = sel.dataset.cid;
        const rid = e.target.value;
        if (!rid) return;
        const c = circuitById(cid);
        if (c) {
          if (!c.rooms) c.rooms = [];
          if (!c.rooms.includes(rid)) c.rooms.push(rid);
          SS.save(H);
          flashSaved();
          refreshAll();
        }
      });
    });

    // Delete circuit
    $$(".btn-del-circuit", wrap).forEach((btn) => {
      btn.addEventListener("click", () => {
        const cid = btn.dataset.id;
        if (confirm(`Delete circuit ${cid}?`)) {
          H.circuits = H.circuits.filter((c) => c.id !== cid);
          SS.save(H);
          flashSaved();
          refreshAll();
        }
      });
    });
  }

  /* ---------- live update helper ---------- */
  function refreshAll() {
    const rooms = roomsForPhase(state.phase);
    const agg = aggregate(rooms);
    renderKpis(agg);
    renderList();
    paintPlan();
    if (state.mode === "electrical") renderBreakerBox();
    if (window.Charts) window.Charts.render(rooms, STATUS);
    if (window.Model3D && window.Model3D.generateElectricalSchematic) {
      window.Model3D.generateElectricalSchematic();
    }
    updateSyncPill();
  }

  /* ---------- render: detail panel ---------- */
  function renderDetail(r) {
    $("#detailEmpty").hidden = !!r;
    const body = $("#detailBody");
    body.hidden = !r;
    if (!r) return;

    const tasksHtml = (r.tasks || []).length
      ? `<ul class="tasks">${r.tasks.map((t, idx) => `
          <li class="task-item ${t.done ? "done" : ""}">
            <input type="checkbox" class="task-checkbox" data-idx="${idx}" ${t.done ? "checked" : ""} aria-label="Mark task done" />
            <input type="text" class="task-label-input" data-idx="${idx}" value="${t.label}" aria-label="Task label" />
            <button class="btn-del-task" data-idx="${idx}" title="Delete task" aria-label="Delete task">✕</button>
          </li>`).join("")}</ul>`
      : `<p class="notes" style="color:var(--graphite);margin:4px 0 8px;">No tasks yet.</p>`;

    const photosHtml = (r.photos || []).length
      ? `<div class="photos-grid">${r.photos.map((p, idx) => `
          <div class="photo-thumb-wrap" data-idx="${idx}">
            <img src="${p}" alt="${r.name}" loading="lazy" class="photo-thumb" />
            <button class="btn-del-photo" data-idx="${idx}" title="Delete photo">✕</button>
          </div>`).join("")}</div>`
      : `<p class="notes" style="color:var(--graphite);margin:4px 0 8px;">No photos yet. Click "+ Upload Photos" below to add progress photos or receipts.</p>`;

    // Room circuits list with interactive toggle & unlinking
    const roomCircuits = H.circuits.filter((c) => (c.rooms || []).includes(r.id));
    const allOtherCircuits = H.circuits.filter((c) => !(c.rooms || []).includes(r.id));

    const circuitsHtml = roomCircuits.length
      ? `<div class="room-circuits-list">${roomCircuits.map((c) => `
          <div class="room-circuit-row">
            <div class="room-circuit-info">
              <span class="circuit-chip" data-circuit="${c.id}" style="margin:0;">${c.id}</span>
              <span><strong>#${c.breaker || c.id}</strong> (${c.amps || 15}A · ${c.panel})</span>
              <span style="color:var(--graphite);font-size:12px;">${c.description}</span>
            </div>
            <button class="btn-unlink-circuit" data-circuit="${c.id}" title="Unlink circuit from room">✕</button>
          </div>
        `).join("")}</div>`
      : `<p class="notes" style="color:var(--graphite);margin:4px 0 8px;">No circuits mapped yet.</p>`;

    const linkSelectHtml = allOtherCircuits.length
      ? `<div style="display:flex;gap:6px;margin-top:6px;">
          <select id="selectLinkCircuit" class="add-task-input" style="flex:1;">
            <option value="">+ Link a breaker to this room…</option>
            ${allOtherCircuits.map((c) => `<option value="${c.id}">${c.id} (#${c.breaker} · ${c.amps}A): ${c.description}</option>`).join("")}
          </select>
        </div>`
      : ``;

    const ALL_TYPES = ["bedroom", "bath", "kitchen", "living", "flex", "utility", "storage", "circulation", "exterior", "garage", "basement"];
    const roomTypes = Array.from(new Set([...ALL_TYPES, ...H.rooms.map((x) => x.type).filter(Boolean)]));

    body.innerHTML = `
      <input type="text" class="edit-room-name" id="editName" value="${r.name || ""}" placeholder="Room Name" aria-label="Room name" />
      <div class="detail-controls-row">
        <select class="status-select ${r.status}" id="editStatus" aria-label="Room status">
          <option value="not-started" ${r.status === "not-started" ? "selected" : ""}>Not started</option>
          <option value="in-progress" ${r.status === "in-progress" ? "selected" : ""}>In progress</option>
          <option value="blocked"     ${r.status === "blocked"     ? "selected" : ""}>Blocked</option>
          <option value="complete"    ${r.status === "complete"    ? "selected" : ""}>Complete</option>
        </select>
        <select class="detail-select" id="editType" aria-label="Room type" title="Room type">
          ${roomTypes.map((t) => `<option value="${t}" ${r.type === t ? "selected" : ""}>${t}</option>`).join("")}
        </select>
        <select class="detail-select" id="editPhase" aria-label="Room phase" title="Room phase">
          <option value="existing" ${r.phase === "existing" ? "selected" : ""}>Existing</option>
          <option value="proposed" ${r.phase === "proposed" ? "selected" : ""}>Proposed</option>
        </select>
      </div>

      <div class="meter"><i style="width:${r.percent || 0}%"></i></div>
      <div class="percent-wrap">
        <input type="range" min="0" max="100" value="${r.percent || 0}" class="percent-slider" id="editPercent" aria-label="Completion percentage" />
        <span class="percent-badge" id="percentDisplay">${r.percent || 0}%</span>
      </div>

      <div class="stat-row">
        <div class="stat">
          <div class="v">${r.area ? Math.round(r.area) : "—"}</div>
          <div class="l">sq ft${r.countsAsFinished ? "" : " · excl."}</div>
        </div>
        <div class="stat">
          <div class="stat-input-wrap">
            <span class="stat-prefix">$</span>
            <input type="number" min="0" step="50" class="stat-input" id="editSpent" value="${r.spent || 0}" aria-label="Spent dollars" />
          </div>
          <div class="l">spent</div>
        </div>
        <div class="stat">
          <div class="stat-input-wrap">
            <span class="stat-prefix">$</span>
            <input type="number" min="0" step="100" class="stat-input" id="editBudget" value="${r.budget || 0}" aria-label="Budget dollars" />
          </div>
          <div class="l">budget</div>
        </div>
      </div>

      <div style="margin: 4px 0 12px;">
        <label style="display:inline-flex;align-items:center;gap:6px;font-size:12px;color:var(--graphite);cursor:pointer;">
          <input type="checkbox" id="editFinished" ${r.countsAsFinished ? "checked" : ""} style="cursor:pointer;" />
          <span>Counts as finished / heated sq ft</span>
        </label>
      </div>

      <h3>Tasks</h3>
      ${tasksHtml}
      <form class="add-task-form" id="addTaskForm">
        <input type="text" class="add-task-input" id="newTaskInput" placeholder="+ Add a task…" />
        <button type="submit" class="btn-add-task">Add</button>
      </form>

      <h3>Electrical Circuits (⚡)</h3>
      ${circuitsHtml}
      ${linkSelectHtml}

      <h3>Photos</h3>
      ${photosHtml}
      <div class="photo-upload-bar">
        <label class="btn-upload-photos">
          <span>📷 + Upload Photos</span>
          <input type="file" id="photoFileInput" accept="image/*" multiple style="display:none;" />
        </label>
        <span class="upload-hint">Auto-saved to browser</span>
      </div>

      <h3>Notes</h3>
      <textarea class="edit-notes" id="editNotes" placeholder="Notes on this room…">${r.notes || ""}</textarea>

      <details class="advanced-disclosure">
        <summary>Advanced (Structural)</summary>
        <div style="display:flex;flex-direction:column;gap:8px;margin-top:8px;font-size:11.5px;">
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <span style="color:var(--graphite);">ID (SVG Key):</span>
            <input type="text" id="advId" value="${r.id}" readonly disabled style="width:130px;background:var(--paper-2);border:1px solid var(--line);border-radius:4px;padding:3px 6px;font-family:var(--font-mono);font-size:11px;" />
          </div>
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <span style="color:var(--graphite);">Area:</span>
            <input type="text" id="advArea" value="${r.area ? r.area.toFixed(2) : 0} sq ft" readonly disabled style="width:130px;background:var(--paper-2);border:1px solid var(--line);border-radius:4px;padding:3px 6px;font-family:var(--font-mono);font-size:11px;" />
          </div>
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <span style="color:var(--graphite);">Floor:</span>
            <input type="text" id="advFloor" value="${r.floor || "main"}" readonly disabled style="width:130px;background:var(--paper-2);border:1px solid var(--line);border-radius:4px;padding:3px 6px;font-family:var(--font-mono);font-size:11px;" />
          </div>
          <div style="font-size:10.5px;color:var(--graphite);line-height:1.3;margin-top:2px;">
            🔒 Structural IDs, areas, and floor levels are locked to maintain plan sync.
          </div>
        </div>
      </details>
    `;

    // Room Name change
    const nameInput = $("#editName", body);
    if (nameInput) {
      nameInput.addEventListener("input", (e) => {
        r.name = e.target.value;
        SS.save(H);
        flashSaved();
        refreshAll();
      });
    }

    // Room Type change
    const typeSelect = $("#editType", body);
    if (typeSelect) {
      typeSelect.addEventListener("change", (e) => {
        r.type = e.target.value;
        SS.save(H);
        flashSaved();
        refreshAll();
      });
    }

    // Room Phase change
    const phaseSelect = $("#editPhase", body);
    if (phaseSelect) {
      phaseSelect.addEventListener("change", (e) => {
        r.phase = e.target.value;
        SS.save(H);
        flashSaved();
        refreshAll();
      });
    }

    // Counts as Finished toggle
    const finishedCb = $("#editFinished", body);
    if (finishedCb) {
      finishedCb.addEventListener("change", (e) => {
        r.countsAsFinished = e.target.checked;
        SS.save(H);
        flashSaved();
        refreshAll();
        renderDetail(r);
      });
    }

    // Status change
    const statusSelect = $("#editStatus", body);
    statusSelect.addEventListener("change", (e) => {
      r.status = e.target.value;
      statusSelect.className = `status-select ${r.status}`;
      SS.save(H);
      flashSaved();
      SS.logEvent("status_change", { roomId: r.id, status: r.status });
      refreshAll();
    });

    // Percent slider change
    const percentSlider = $("#editPercent", body);
    const percentDisplay = $("#percentDisplay", body);
    const meterBar = $(".meter > i", body);
    percentSlider.addEventListener("input", (e) => {
      const val = parseInt(e.target.value, 10) || 0;
      r.percent = val;
      percentDisplay.textContent = val + "%";
      if (meterBar) meterBar.style.width = val + "%";
      if (val === 100 && r.status !== "complete") {
        r.status = "complete";
        statusSelect.value = "complete";
        statusSelect.className = "status-select complete";
      } else if (val > 0 && val < 100 && r.status === "not-started") {
        r.status = "in-progress";
        statusSelect.value = "in-progress";
        statusSelect.className = "status-select in-progress";
      }
      SS.save(H);
      flashSaved();
      refreshAll();
    });

    // Spent input change
    const spentInput = $("#editSpent", body);
    spentInput.addEventListener("change", (e) => {
      r.spent = parseFloat(e.target.value) || 0;
      SS.save(H);
      flashSaved();
      refreshAll();
    });

    // Budget input change
    const budgetInput = $("#editBudget", body);
    budgetInput.addEventListener("change", (e) => {
      r.budget = parseFloat(e.target.value) || 0;
      SS.save(H);
      flashSaved();
      refreshAll();
    });

    // Notes change
    const notesArea = $("#editNotes", body);
    notesArea.addEventListener("input", (e) => {
      r.notes = e.target.value;
      SS.save(H);
      flashSaved();
    });

    // Task checkbox toggle
    $$(".task-checkbox", body).forEach((cb) => {
      cb.addEventListener("change", (e) => {
        const idx = parseInt(e.target.dataset.idx, 10);
        if (r.tasks && r.tasks[idx]) {
          r.tasks[idx].done = e.target.checked;
          const doneCount = r.tasks.filter((t) => t.done).length;
          if (r.tasks.length > 0) {
            r.percent = Math.round((doneCount / r.tasks.length) * 100);
            if (percentSlider) percentSlider.value = r.percent;
            if (percentDisplay) percentDisplay.textContent = r.percent + "%";
            if (meterBar) meterBar.style.width = r.percent + "%";
            if (r.percent === 100) {
              r.status = "complete";
              statusSelect.value = "complete";
              statusSelect.className = "status-select complete";
            }
          }
          SS.save(H);
          flashSaved();
          SS.logEvent("task_toggle", { roomId: r.id, task: r.tasks[idx] });
          renderDetail(r);
          refreshAll();
        }
      });
    });

    // Task delete
    $$(".btn-del-task", body).forEach((btn) => {
      btn.addEventListener("click", () => {
        const idx = parseInt(btn.dataset.idx, 10);
        if (r.tasks && r.tasks[idx]) {
          r.tasks.splice(idx, 1);
          SS.save(H);
          flashSaved();
          renderDetail(r);
          refreshAll();
        }
      });
    });

    // Task rename input
    $$(".task-label-input", body).forEach((input) => {
      input.addEventListener("input", (e) => {
        const idx = parseInt(e.target.dataset.idx, 10);
        if (r.tasks && r.tasks[idx]) {
          r.tasks[idx].label = e.target.value;
          SS.save(H);
          flashSaved();
        }
      });
      input.addEventListener("change", (e) => {
        const idx = parseInt(e.target.dataset.idx, 10);
        if (r.tasks && r.tasks[idx]) {
          r.tasks[idx].label = e.target.value.trim();
          SS.save(H);
          flashSaved();
          refreshAll();
        }
      });
    });

    // Add task submit
    const addTaskForm = $("#addTaskForm", body);
    if (addTaskForm) {
      addTaskForm.addEventListener("submit", (e) => {
        e.preventDefault();
        const input = $("#newTaskInput", addTaskForm);
        const label = input.value.trim();
        if (label) {
          if (!r.tasks) r.tasks = [];
          r.tasks.push({ label, done: false });
          input.value = "";
          SS.save(H);
          flashSaved();
          SS.logEvent("task_add", { roomId: r.id, label });
          renderDetail(r);
          refreshAll();
        }
      });
    }

    // Photo file input (upload)
    const photoFileInput = $("#photoFileInput", body);
    if (photoFileInput) {
      photoFileInput.addEventListener("change", async (e) => {
        const files = Array.from(e.target.files || []);
        if (!files.length) return;
        const uploadBtn = $(".btn-upload-photos span", body);
        if (uploadBtn) uploadBtn.textContent = "Uploading…";
        for (const file of files) {
          await compressAndAddPhoto(file, r);
        }
        SS.save(H);
        flashSaved();
        SS.logEvent("photos_upload", { roomId: r.id, count: files.length });
        renderDetail(r);
      });
    }

    // Photo delete
    $$(".btn-del-photo", body).forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const idx = parseInt(btn.dataset.idx, 10);
        if (r.photos && r.photos[idx] !== undefined) {
          r.photos.splice(idx, 1);
          SS.save(H);
          flashSaved();
          renderDetail(r);
        }
      });
    });

    // Photo lightbox view
    $$(".photo-thumb", body).forEach((img) => {
      img.addEventListener("click", () => {
        showPhotoModal(img.src, r.name);
      });
    });

    // Circuit chip click -> activate circuit & switch to electrical view
    $$(".circuit-chip", body).forEach((chip) => {
      chip.addEventListener("click", () => {
        const cid = chip.dataset.circuit;
        setMode("electrical");
        state.activeCircuit = cid;
        paintPlan();
        renderBreakerBox();
      });
    });

    // Unlink circuit from room
    $$(".btn-unlink-circuit", body).forEach((btn) => {
      btn.addEventListener("click", () => {
        const cid = btn.dataset.circuit;
        const c = circuitById(cid);
        if (c && c.rooms) {
          c.rooms = c.rooms.filter((rid) => rid !== r.id);
          SS.save(H);
          flashSaved();
          renderDetail(r);
          refreshAll();
        }
      });
    });

    // Link new circuit to room
    const linkSelect = $("#selectLinkCircuit", body);
    if (linkSelect) {
      linkSelect.addEventListener("change", (e) => {
        const cid = e.target.value;
        const c = circuitById(cid);
        if (c) {
          if (!c.rooms) c.rooms = [];
          if (!c.rooms.includes(r.id)) c.rooms.push(r.id);
          SS.save(H);
          flashSaved();
          renderDetail(r);
          refreshAll();
        }
      });
    }
  }

  /* ---------- selection ---------- */
  function selectRoom(id) {
    state.selected = id;
    const r = byId(id);
    renderDetail(r);

    // If selected room is on a different level, switch level automatically
    if (r && r.floor === "basement" && state.level === "main") {
      setLevel("basement");
    } else if (r && r.floor !== "basement" && state.level === "basement") {
      setLevel("main");
    } else {
      paintPlan();
    }

    $$("#roomList li").forEach((li) => li.classList.toggle("is-selected", li.dataset.id === id));
  }

  /* ---------- mode switcher (Renovation vs Electrical) ---------- */
  function setMode(mode) {
    state.mode = mode;
    document.documentElement.classList.toggle("mode-electrical", mode === "electrical");
    $$(".mode-toggle button").forEach((b) => b.classList.toggle("is-active", b.dataset.mode === mode));

    const breakerSection = $("#breakerBoxSection");
    if (breakerSection) breakerSection.hidden = (mode !== "electrical");

    renderLegend();
    refreshAll();
  }

  /* ---------- view toggle (2D Plan vs 3D Orbit) ---------- */
  function setView(view) {
    state.view = view;
    $$(".view-toggle button").forEach((b) => b.classList.toggle("is-active", b.dataset.view === view));

    const planScroll = $("#planScroll");
    const model3dWrap = $("#model3dWrap");
    const wallHeightToggle = $("#wallHeightToggle");
    const btnToggle3DLabels = $("#btnToggle3DLabels");
    const lightingToggle = $("#lightingToggle");
    const btnWalkthrough = $("#btnWalkthrough");
    const infraToggle = $("#infraToggle");

    if (view === "3d") {
      if (planScroll) planScroll.hidden = true;
      if (model3dWrap) model3dWrap.hidden = false;
      if (wallHeightToggle) wallHeightToggle.hidden = false;
      if (btnToggle3DLabels) btnToggle3DLabels.hidden = false;
      if (lightingToggle) lightingToggle.hidden = false;
      if (btnWalkthrough) btnWalkthrough.hidden = false;
      if (infraToggle) infraToggle.hidden = false;

      // Initialize Three.js 3D model
      if (window.Model3D) {
        window.Model3D.loadModelData().then((data) => {
          if (data) {
            window.Model3D.init($("#model3dContainer"));
            window.Model3D.setLevel(state.level);
            window.Model3D.updateRoomTints();
            if (state.selected) window.Model3D.highlightRoom(state.selected);
            setTimeout(() => window.Model3D.resize(), 50);
          }
        });
      }
    } else {
      if (planScroll) planScroll.hidden = false;
      if (model3dWrap) model3dWrap.hidden = true;
      if (wallHeightToggle) wallHeightToggle.hidden = true;
      if (btnToggle3DLabels) btnToggle3DLabels.hidden = true;
      if (lightingToggle) lightingToggle.hidden = true;
      if (btnWalkthrough) btnWalkthrough.hidden = true;
      if (infraToggle) infraToggle.hidden = true;
      if (window.Model3D && window.Model3D.isFirstPersonMode && window.Model3D.isFirstPersonMode()) {
        window.Model3D.exitFirstPersonMode();
      }
      paintPlan();
    }
  }

  /* ---------- floor level toggle (Main vs Basement) ---------- */
  function setLevel(lvl) {
    state.level = lvl;
    $$(".level-toggle button").forEach((b) => b.classList.toggle("is-active", b.dataset.level === lvl));

    if (window.Model3D) {
      window.Model3D.setLevel(lvl);
    }
    refreshAll();
  }

  /* ---------- phase toggle ---------- */
  function setPhase(phase) {
    state.phase = phase;
    document.documentElement.setAttribute("data-phase", phase);
    $$(".phase-toggle button").forEach((b) => b.classList.toggle("is-active", b.dataset.phase === phase));
    refreshAll();
  }

  /* ---------- breaker modals (Add & Edit) ---------- */
  function showEditBreakerModal(c) {
    let modal = $("#editBreakerModal");
    if (!modal) {
      modal = document.createElement("div");
      modal.id = "editBreakerModal";
      modal.className = "modal-overlay";
      document.body.appendChild(modal);
    }

    modal.innerHTML = `
      <div class="modal-box" role="dialog" aria-modal="true" aria-label="Edit Circuit Breaker">
        <div class="modal-head">
          <h3>Edit Breaker #${c.breaker || c.id} (${c.id})</h3>
          <button class="modal-close" id="btnCloseEditBreaker">✕</button>
        </div>
        <div class="modal-body">
          <form id="formEditBreaker" style="display:flex;flex-direction:column;gap:12px;">
            <div>
              <label style="display:block;font-size:12px;font-weight:600;margin-bottom:4px;">Panel</label>
              <select id="editBreakerPanel" class="add-task-input" style="width:100%;">
                <option value="main" ${c.panel === "main" ? "selected" : ""}>Main Panel (Panel A - 200A)</option>
                <option value="sub"  ${c.panel === "sub"  ? "selected" : ""}>Subpanel (Panel B - 100A)</option>
              </select>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
              <div>
                <label style="display:block;font-size:12px;font-weight:600;margin-bottom:4px;">Breaker #</label>
                <input type="number" id="editBreakerNum" class="add-task-input" value="${c.breaker || 1}" min="1" max="60" required style="width:100%;" />
              </div>
              <div>
                <label style="display:block;font-size:12px;font-weight:600;margin-bottom:4px;">Amperage</label>
                <select id="editBreakerAmps" class="add-task-input" style="width:100%;">
                  <option value="15" ${c.amps === 15 ? "selected" : ""}>15 Amps (Lighting/Receptacle)</option>
                  <option value="20" ${c.amps === 20 ? "selected" : ""}>20 Amps (Kitchen/Bath/Appliance)</option>
                  <option value="30" ${c.amps === 30 ? "selected" : ""}>30 Amps (Dryer/AC/Shop)</option>
                  <option value="50" ${c.amps === 50 ? "selected" : ""}>50 Amps (Range/EV/Subfeed)</option>
                </select>
              </div>
            </div>
            <div>
              <label style="display:block;font-size:12px;font-weight:600;margin-bottom:4px;">Description</label>
              <input type="text" id="editBreakerDesc" class="add-task-input" value="${c.description || ""}" required style="width:100%;" />
            </div>
            <div>
              <label style="display:block;font-size:12px;font-weight:600;margin-bottom:4px;">Connected Rooms</label>
              <div style="display:grid;grid-template-columns:repeat(auto-fill, minmax(130px, 1fr));gap:6px;max-height:160px;overflow-y:auto;padding:8px;background:var(--paper-2);border-radius:6px;">
                ${H.rooms.map((rm) => `
                  <label style="display:flex;align-items:center;gap:6px;font-size:12px;cursor:pointer;">
                    <input type="checkbox" name="editBreakerRooms" value="${rm.id}" ${(c.rooms || []).includes(rm.id) ? "checked" : ""} />
                    <span>${rm.name}</span>
                  </label>
                `).join("")}
              </div>
            </div>
          </form>
        </div>
        <div class="modal-foot">
          <button class="btn-action btn-subtle" id="btnDeleteBreaker" style="color:var(--s-blocked);margin-right:auto;">Delete Breaker</button>
          <button class="btn-action btn-subtle" id="btnCancelEditBreaker">Cancel</button>
          <button class="btn-action" id="btnSaveEditBreaker" style="background:var(--blue);color:#fff;border-color:var(--blue);">Save Changes</button>
        </div>
      </div>
    `;

    modal.hidden = false;
    $("#btnCloseEditBreaker").onclick = () => (modal.hidden = true);
    $("#btnCancelEditBreaker").onclick = () => (modal.hidden = true);
    modal.onclick = (e) => { if (e.target === modal) modal.hidden = true; };

    $("#btnDeleteBreaker").onclick = () => {
      if (confirm(`Delete breaker #${c.breaker} (${c.id})?`)) {
        H.circuits = H.circuits.filter((item) => item.id !== c.id);
        SS.save(H);
        flashSaved();
        modal.hidden = true;
        renderBreakerBox();
        if (state.selected) renderDetail(byId(state.selected));
        refreshAll();
      }
    };

    $("#btnSaveEditBreaker").onclick = () => {
      c.panel = $("#editBreakerPanel").value;
      c.breaker = parseInt($("#editBreakerNum").value, 10) || 1;
      c.amps = parseInt($("#editBreakerAmps").value, 10) || 20;
      c.description = $("#editBreakerDesc").value.trim();
      c.rooms = Array.from(modal.querySelectorAll('input[name="editBreakerRooms"]:checked')).map((cb) => cb.value);

      const prefix = c.panel === "main" ? "A" : "B";
      c.id = `${prefix}${c.breaker < 10 ? "0" + c.breaker : c.breaker}`;

      SS.save(H);
      flashSaved();
      SS.logEvent("breaker_edit", c);
      modal.hidden = true;
      renderBreakerBox();
      if (state.selected) renderDetail(byId(state.selected));
      refreshAll();
    };
  }

  function showAddBreakerModal() {
    let modal = $("#addBreakerModal");
    if (!modal) {
      modal = document.createElement("div");
      modal.id = "addBreakerModal";
      modal.className = "modal-overlay";
      document.body.appendChild(modal);
    }

    const nextBreakerNum = (H.circuits.length + 1) * 2;
    modal.innerHTML = `
      <div class="modal-box" role="dialog" aria-modal="true" aria-label="Add Circuit Breaker">
        <div class="modal-head">
          <h3>+ Add Electrical Breaker</h3>
          <button class="modal-close" id="btnCloseBreakerModal">✕</button>
        </div>
        <div class="modal-body">
          <form id="formAddBreaker" style="display:flex;flex-direction:column;gap:12px;">
            <div>
              <label style="display:block;font-size:12px;font-weight:600;margin-bottom:4px;">Panel</label>
              <select id="newBreakerPanel" class="add-task-input" style="width:100%;">
                <option value="main">Main Panel (Panel A - 200A)</option>
                <option value="sub">Subpanel (Panel B - 100A)</option>
              </select>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
              <div>
                <label style="display:block;font-size:12px;font-weight:600;margin-bottom:4px;">Breaker #</label>
                <input type="number" id="newBreakerNum" class="add-task-input" value="${nextBreakerNum}" min="1" max="60" required style="width:100%;" />
              </div>
              <div>
                <label style="display:block;font-size:12px;font-weight:600;margin-bottom:4px;">Amperage</label>
                <select id="newBreakerAmps" class="add-task-input" style="width:100%;">
                  <option value="15">15 Amps (Lighting/Receptacle)</option>
                  <option value="20" selected>20 Amps (Kitchen/Bath/Appliance)</option>
                  <option value="30">30 Amps (Dryer/AC/Shop)</option>
                  <option value="50">50 Amps (Range/EV/Subfeed)</option>
                </select>
              </div>
            </div>
            <div>
              <label style="display:block;font-size:12px;font-weight:600;margin-bottom:4px;">Description</label>
              <input type="text" id="newBreakerDesc" class="add-task-input" placeholder="e.g. Living room receptacles" required style="width:100%;" />
            </div>
            <div>
              <label style="display:block;font-size:12px;font-weight:600;margin-bottom:4px;">Connected Rooms</label>
              <div style="display:grid;grid-template-columns:repeat(auto-fill, minmax(130px, 1fr));gap:6px;max-height:160px;overflow-y:auto;padding:8px;background:var(--paper-2);border-radius:6px;">
                ${H.rooms.map((rm) => `
                  <label style="display:flex;align-items:center;gap:6px;font-size:12px;cursor:pointer;">
                    <input type="checkbox" name="newBreakerRooms" value="${rm.id}" />
                    <span>${rm.name}</span>
                  </label>
                `).join("")}
              </div>
            </div>
          </form>
        </div>
        <div class="modal-foot">
          <button class="btn-action btn-subtle" id="btnCancelBreaker">Cancel</button>
          <button class="btn-action" id="btnSaveBreaker" style="background:var(--blue);color:#fff;border-color:var(--blue);">Save Breaker</button>
        </div>
      </div>
    `;

    modal.hidden = false;
    $("#btnCloseBreakerModal").onclick = () => (modal.hidden = true);
    $("#btnCancelBreaker").onclick = () => (modal.hidden = true);
    modal.onclick = (e) => { if (e.target === modal) modal.hidden = true; };

    $("#btnSaveBreaker").onclick = () => {
      const panel = $("#newBreakerPanel").value;
      const breaker = parseInt($("#newBreakerNum").value, 10) || 1;
      const amps = parseInt($("#newBreakerAmps").value, 10) || 20;
      const description = $("#newBreakerDesc").value.trim();
      const selectedRooms = Array.from(modal.querySelectorAll('input[name="newBreakerRooms"]:checked')).map((cb) => cb.value);

      if (!description) {
        alert("Please enter a circuit description.");
        return;
      }

      const prefix = panel === "main" ? "A" : "B";
      const id = `${prefix}${breaker < 10 ? "0" + breaker : breaker}`;

      const newCircuit = { id, breaker, panel, amps, description, rooms: selectedRooms, status: "on" };
      H.circuits.push(newCircuit);

      SS.save(H);
      flashSaved();
      SS.logEvent("circuit_add", newCircuit);
      modal.hidden = true;
      renderBreakerBox();
      if (state.selected) renderDetail(byId(state.selected));
      refreshAll();
    };
  }

  /* ---------- export modal ---------- */
  function exportData() {
    const code = SS.toJsCode(H);

    let modal = $("#exportModal");
    if (!modal) {
      modal = document.createElement("div");
      modal.id = "exportModal";
      modal.className = "modal-overlay";
      document.body.appendChild(modal);
    }

    modal.innerHTML = `
      <div class="modal-box" role="dialog" aria-modal="true" aria-label="Export data.js">
        <div class="modal-head">
          <h3>Export data.js</h3>
          <button class="modal-close" id="btnCloseModal" aria-label="Close">✕</button>
        </div>
        <div class="modal-body">
          <p style="margin:0 0 10px;font-size:13px;color:var(--graphite);">
            Copy the code below or click Download to replace <code>data/data.js</code> in your repository.
          </p>
          <pre class="modal-pre" id="exportPre"></pre>
        </div>
        <div class="modal-foot">
          <button class="btn-action" id="btnCopyExport">Copy to clipboard</button>
          <button class="btn-action" id="btnDownloadExport" style="background:var(--blue);color:#fff;border-color:var(--blue);">Download data.js</button>
        </div>
      </div>
    `;

    $("#exportPre").textContent = code;
    modal.hidden = false;

    $("#btnCloseModal").onclick = () => (modal.hidden = true);
    modal.onclick = (e) => { if (e.target === modal) modal.hidden = true; };

    $("#btnCopyExport").onclick = () => {
      navigator.clipboard.writeText(code).then(() => {
        $("#btnCopyExport").textContent = "Copied!";
        setTimeout(() => ($("#btnCopyExport").textContent = "Copy to clipboard"), 1800);
      });
    };

    $("#btnDownloadExport").onclick = () => {
      const blob = new Blob([code], { type: "text/javascript" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "data.js";
      a.click();
      URL.revokeObjectURL(url);
    };
  }

  /* ---------- init ---------- */
  async function init() {
    // Hydrate data using StorageService
    H = await SS.load();
    window.HOUSE = H;

    // SVG room click handlers
    $$(".room", $("#floorplan")).forEach((g) => {
      const act = () => byId(g.id) && selectRoom(g.id);
      g.addEventListener("click", act);
      g.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); act(); } });
    });

    // Main panel location marker in basement
    const panelMarker = $("#markerMainPanel");
    if (panelMarker) {
      panelMarker.addEventListener("click", () => {
        setMode("electrical");
        const breakerBox = $("#breakerBoxSection");
        if (breakerBox) breakerBox.scrollIntoView({ behavior: "smooth" });
      });
    }

    // Mode toggle (Renovation vs Electrical)
    $$(".mode-toggle button").forEach((b) => b.addEventListener("click", () => setMode(b.dataset.mode)));

    // View toggle (2D Plan vs 3D Orbit)
    $$(".view-toggle button").forEach((b) => b.addEventListener("click", () => setView(b.dataset.view)));

    // Level toggle (Main Floor vs Basement vs All)
    $$(".level-toggle button").forEach((b) => b.addEventListener("click", () => setLevel(b.dataset.level)));

    // Phase toggle
    $$(".phase-toggle button").forEach((b) => b.addEventListener("click", () => setPhase(b.dataset.phase)));

    // Room search filter
    $("#roomSearch").addEventListener("input", (e) => { state.filter = e.target.value.toLowerCase(); renderList(); });

    // Topbar actions: Export & Reset
    const btnExport = $("#btnExport");
    if (btnExport) btnExport.addEventListener("click", exportData);

    const btnReset = $("#btnReset");
    if (btnReset) {
      btnReset.addEventListener("click", () => {
        if (confirm("Reset to file? This will discard unexported local changes and reload data.js.")) {
          SS.reset();
          location.reload();
        }
      });
    }

    // Add breaker button
    const btnAddBreaker = $("#btnAddBreaker");
    if (btnAddBreaker) btnAddBreaker.addEventListener("click", showAddBreakerModal);

    // Circuits View toggle (Visual Panels vs Circuits Table)
    $$("#circuitsViewToggle button").forEach((b) => {
      b.addEventListener("click", () => {
        $$("#circuitsViewToggle button").forEach((btn) => btn.classList.toggle("is-active", btn === b));
        state.circuitsView = b.dataset.cview;
        renderBreakerBox();
      });
    });

    // 3D Wall Height Toggle (Cutaway / Full)
    $$("#wallHeightToggle button").forEach((b) => {
      b.addEventListener("click", () => {
        $$("#wallHeightToggle button").forEach((btn) => btn.classList.toggle("is-active", btn === b));
        if (window.Model3D) window.Model3D.setWallHeight(b.dataset.height);
      });
    });

    // 3D Labels Toggle
    const btnLabels = $("#btnToggle3DLabels");
    if (btnLabels) {
      let labelsOn = true;
      btnLabels.addEventListener("click", () => {
        labelsOn = !labelsOn;
        btnLabels.classList.toggle("is-active", labelsOn);
        btnLabels.textContent = labelsOn ? "🏷️ Labels: ON" : "🏷️ Labels: OFF";
        if (window.Model3D) window.Model3D.setLabelsVisible(labelsOn);
      });
    }

    // 3D Lighting Environment Toggle (Day / Sunset / Night)
    $$("#lightingToggle button").forEach((b) => {
      b.addEventListener("click", () => {
        $$("#lightingToggle button").forEach((btn) => btn.classList.toggle("is-active", btn === b));
        if (window.Model3D) window.Model3D.setLightingEnvironment(b.dataset.light);
      });
    });

    // 3D Walkthrough Mode ("Walk Inside")
    const btnWalkthrough = $("#btnWalkthrough");
    if (btnWalkthrough) {
      btnWalkthrough.addEventListener("click", () => {
        if (window.Model3D) {
          window.Model3D.enterFirstPersonMode(state.selected || null);
        }
      });
    }

    // 3D Infrastructure Layers (Conduit, HVAC, Plumbing)
    const btnConduit = $("#btnToggleConduit");
    if (btnConduit) {
      let conduitOn = false;
      btnConduit.addEventListener("click", () => {
        conduitOn = !conduitOn;
        btnConduit.classList.toggle("is-active", conduitOn);
        if (window.Model3D) window.Model3D.toggleInfrastructureLayer("conduit", conduitOn);
      });
    }

    const btnHVAC = $("#btnToggleHVAC");
    if (btnHVAC) {
      let hvacOn = false;
      btnHVAC.addEventListener("click", () => {
        hvacOn = !hvacOn;
        btnHVAC.classList.toggle("is-active", hvacOn);
        if (window.Model3D) window.Model3D.toggleInfrastructureLayer("hvac", hvacOn);
      });
    }

    const btnPlumbing = $("#btnTogglePlumbing");
    if (btnPlumbing) {
      let plumbingOn = false;
      btnPlumbing.addEventListener("click", () => {
        plumbingOn = !plumbingOn;
        btnPlumbing.classList.toggle("is-active", plumbingOn);
        if (window.Model3D) window.Model3D.toggleInfrastructureLayer("plumbing", plumbingOn);
      });
    }

    // 3D Panel Anchor calibration inputs
    const pAnchor = (H.meta && H.meta.panelAnchor) || { x: 0.6, y: -0.9, z: 2.25 };
    const inX = $("#anchorX");
    const inY = $("#anchorY");
    const inZ = $("#anchorZ");
    if (inX) inX.value = pAnchor.x;
    if (inY) inY.value = pAnchor.y;
    if (inZ) inZ.value = pAnchor.z;

    [inX, inY, inZ].forEach((input) => {
      if (!input) return;
      input.addEventListener("change", () => {
        if (!H.meta) H.meta = {};
        if (!H.meta.panelAnchor) H.meta.panelAnchor = {};
        H.meta.panelAnchor.x = parseFloat(inX.value) || 0;
        H.meta.panelAnchor.y = parseFloat(inY.value) || 0;
        H.meta.panelAnchor.z = parseFloat(inZ.value) || 0;
        SS.save(H);
        flashSaved();
        if (window.Model3D && window.Model3D.generateElectricalSchematic) {
          window.Model3D.generateElectricalSchematic();
        }
        updateSyncPill();
      });
    });

    renderLegend();
    setPhase("existing");
    setLevel("main");
    setMode("renovation");
    updateSyncPill();
  }

  function checkElectricalSchematic() {
    const circuits = H.circuits || [];
    const verified = circuits.filter((c) => !c.placeholder);
    const placeholders = circuits.filter((c) => !!c.placeholder);
    const unmapped = circuits.filter((c) => !(c.rooms && c.rooms.length > 0));

    console.group("%c⚡ 3D Electrical Schematic Integrity Check", "font-weight:bold;color:#38BDF8;font-size:13px;");
    console.log(`Total circuits: ${circuits.length}  |  Verified: ${verified.length}  |  Placeholder: ${placeholders.length}  |  Unmapped: ${unmapped.length}`);

    console.table(circuits.map((c) => ({
      ID: c.id,
      Breaker: "#" + (c.breaker || "?"),
      Panel: c.panel || "main",
      Amps: (c.amps || 15) + "A",
      Status: c.placeholder ? "⚠️ PLACEHOLDER" : "✅ VERIFIED",
      Rooms: (c.rooms || []).join(", ") || "(NONE)",
      Description: c.description || ""
    })));

    if (placeholders.length > 0) {
      console.warn("Circuits needing breaker tracer field verification:", placeholders.map((c) => c.id));
    }
    if (unmapped.length > 0) {
      console.warn("Circuits with no connected rooms (no 3D runs generated):", unmapped.map((c) => c.id));
    }
    console.groupEnd();

    return {
      total: circuits.length,
      verified: verified.length,
      placeholder: placeholders.length,
      unmapped: unmapped.length,
      circuits
    };
  }

  // Expose selectRoom for 3D raycaster
  window.App = {
    selectRoom,
    setMode,
    setLevel,
    setView,
    checkElectricalSchematic
  };

  document.addEventListener("DOMContentLoaded", init);
})();
