const fs = require('fs');

let app = fs.readFileSync('js/app.js', 'utf8');

// 1. Disable scrollIntoView on placement
app = app.replace(/if \(sec\) sec\.scrollIntoView\(\{ behavior: "smooth" \}\);/g, '// if (sec) sec.scrollIntoView({ behavior: "smooth" });');

// 2. Add from3D to selectRoom
app = app.replace('function selectRoom(id) {', 'function selectRoom(id, from3D = false) {');
app = app.replace('$$("#roomList li").forEach((li) => li.classList.toggle("is-selected", li.dataset.id === id));', '$$("#roomList li").forEach((li) => li.classList.toggle("is-selected", li.dataset.id === id));\n    if (!from3D && id && window.Model3D && typeof window.Model3D.flyToRoomById === "function") {\n      window.Model3D.flyToRoomById(id);\n    }');

// 3. Add openNodeEdit logic to app.js
const overlayLogic = `
  // Node Edit Overlay
  let activeEditNode = null;
  let activeEditType = null;
  function openNodeEdit(type, id) {
    activeEditType = type;
    activeEditNode = id;
    const ui = document.getElementById("nodeEditOverlay");
    const title = document.getElementById("nodeEditTitle");
    if (ui && title) {
      title.textContent = "Edit " + type + " " + id;
      ui.style.display = "block";
    }
  }
  function closeNodeEdit() {
    const ui = document.getElementById("nodeEditOverlay");
    if (ui) ui.style.display = "none";
    activeEditNode = null;
    activeEditType = null;
  }
  const btnCloseNodeEdit = document.getElementById("btnCloseNodeEdit");
  if (btnCloseNodeEdit) btnCloseNodeEdit.addEventListener("click", closeNodeEdit);

  const btnRotateNode = document.getElementById("btnRotateNode");
  if (btnRotateNode) btnRotateNode.addEventListener("click", () => {
    if (!activeEditNode) return;
    let arr = null;
    if (activeEditType === "register") arr = H.registers;
    if (activeEditType === "fixture") arr = H.fixtures;
    if (activeEditType === "outlet") arr = H.outlets;
    if (arr) {
      const item = arr.find(x => x.id === activeEditNode);
      if (item) {
        item.rotation = ((item.rotation || 0) + 90) % 360;
        SS.save(H);
        refreshAll();
      }
    }
  });

  const btnDeleteNode = document.getElementById("btnDeleteNode");
  if (btnDeleteNode) btnDeleteNode.addEventListener("click", () => {
    if (!activeEditNode) return;
    if (typeof window.pushCaptureState === "function") window.pushCaptureState();
    if (activeEditType === "register") H.registers = (H.registers || []).filter(x => x.id !== activeEditNode);
    if (activeEditType === "fixture") H.fixtures = (H.fixtures || []).filter(x => x.id !== activeEditNode);
    if (activeEditType === "outlet") H.outlets = (H.outlets || []).filter(x => x.id !== activeEditNode);
    SS.save(H);
    refreshAll();
    closeNodeEdit();
  });
`;

app = app.replace('// Select view mode (2D / 3D)', overlayLogic + '\n    // Select view mode (2D / 3D)');
app = app.replace('addRegisterFrom3D,', 'addRegisterFrom3D,\n    openNodeEdit,');

fs.writeFileSync('js/app.js', app);


let model = fs.readFileSync('js/model3d.js', 'utf8');

// 4. Update onClick: selectRoom from 3D
model = model.replace('window.App.selectRoom(hoveredMesh.userData.id);', 'window.App.selectRoom(hoveredMesh.userData.id, true);');

// 5. highlightRoom shouldn't fly
model = model.replace('if (isSel) flyToRoom(mesh);', '// if (isSel) flyToRoom(mesh);');

// 6. Export flyToRoomById
model = model.replace('window.Model3D = {', 'window.Model3D = {\n    flyToRoomById: (id) => { const mesh = roomMeshes.find(m => m.userData.id === id); if (mesh) flyToRoom(mesh); },');

// 7. Add Intersection Logic to onClick
const intersectionLogic = `
    // Check if clicked an existing register in normal mode
    if (hvacLayerGroup && hvacLayerGroup.visible) {
      raycaster.setFromCamera(mouse, camera);
      const regIntersects = raycaster.intersectObjects(hvacLayerGroup.children.filter((c) => c.userData && c.userData.isRegister));
      if (regIntersects.length > 0) {
        const regObj = regIntersects[0].object;
        if (window.App && typeof window.App.openNodeEdit === 'function') {
          window.App.openNodeEdit('register', regObj.userData.registerId);
          return;
        }
      }
    }

    if (plumbingLayerGroup && plumbingLayerGroup.visible) {
      raycaster.setFromCamera(mouse, camera);
      const fixIntersects = raycaster.intersectObjects(plumbingLayerGroup.children.filter((c) => c.userData && c.userData.isFixture));
      if (fixIntersects.length > 0) {
        const fixObj = fixIntersects[0].object;
        if (window.App && typeof window.App.openNodeEdit === 'function') {
          window.App.openNodeEdit('fixture', fixObj.userData.fixtureId);
          return;
        }
      }
    }

    if (electricalLayerGroup && electricalLayerGroup.visible) {
      raycaster.setFromCamera(mouse, camera);
      const outIntersects = raycaster.intersectObjects(electricalLayerGroup.children.filter((c) => c.userData && c.userData.isOutlet));
      if (outIntersects.length > 0) {
        const outObj = outIntersects[0].object;
        if (window.App && typeof window.App.openNodeEdit === 'function') {
          window.App.openNodeEdit('outlet', outObj.userData.outletId);
          return;
        }
      }
    }
`;
model = model.replace(/if \(hvacLayerGroup && hvacLayerGroup\.visible\) \{[\s\S]*?return;\n        \}\n      \}\n    \}/g, intersectionLogic);

// 8. Add Rotation to meshes
model = model.replace('grille.position.set(anchor.x, targetY, anchor.z);', 'grille.position.set(anchor.x, targetY, anchor.z);\n      const rot = (reg.rotation || 0) * Math.PI / 180;\n      grille.rotation.y = rot;\n      boot.rotation.y = rot;');
model = model.replace('outletMesh.position.set(out.anchor.x, out.anchor.y, out.anchor.z);', 'outletMesh.position.set(out.anchor.x, out.anchor.y, out.anchor.z);\n          outletMesh.rotation.y = (out.rotation || 0) * Math.PI / 180;');
model = model.replace('fixtureMesh.position.set(anchor.x, anchor.y || 0.02, anchor.z);', 'fixtureMesh.position.set(anchor.x, anchor.y || 0.02, anchor.z);\n      fixtureMesh.rotation.y = (fix.rotation || 0) * Math.PI / 180;');

fs.writeFileSync('js/model3d.js', model);
console.log("Done");
