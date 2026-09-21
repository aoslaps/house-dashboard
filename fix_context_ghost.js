const fs = require('fs');
let model = fs.readFileSync('js/model3d.js', 'utf8');

// Replace contextmenu with pointerup that checks for right click (button === 2)
model = model.replace('renderer.domElement.addEventListener("contextmenu", (e) => {', `renderer.domElement.addEventListener("contextmenu", (e) => e.preventDefault());
    renderer.domElement.addEventListener("pointerdown", (e) => { if (e.button === 2) { window.__lastRx = e.clientX; window.__lastRy = e.clientY; } });
    renderer.domElement.addEventListener("pointerup", (e) => {
      if (e.button !== 2) return;
      const dx = Math.abs(e.clientX - (window.__lastRx || e.clientX));
      const dy = Math.abs(e.clientY - (window.__lastRy || e.clientY));
      if (dx > 5 || dy > 5) return; // it was a pan drag
`);

// Add ghost mesh for placement
const ghostLogic = `
  // Ghost mesh for placement mode
  let ghostMesh = null;
  const ghostMat = new THREE.MeshBasicMaterial({ color: 0x0ea5e9, transparent: true, opacity: 0.5, depthTest: false });

  function updateGhostMesh(x, y, z, type) {
    if (!ghostMesh) {
      ghostMesh = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.02, 0.14), ghostMat);
      scene.add(ghostMesh);
    }
    ghostMesh.position.set(x, y, z);
    ghostMesh.visible = true;
  }
  function hideGhostMesh() {
    if (ghostMesh) ghostMesh.visible = false;
  }
`;

model = model.replace('// Initialization', ghostLogic + '\n  // Initialization');

const ghostMoveLogic = `
  function onMouseMove(e) {
    if (!renderer || !camera) return;
    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    
    // Ghost mesh
    if (isPlaceVentMode || isPlaceFixtureMode || isPlaceOutletMode || isMoveNodeMode) {
      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(roomMeshes.filter((m) => m.visible));
      if (intersects.length > 0) {
        const hit = intersects[0];
        const hitX = Math.round(hit.point.x * 100) / 100;
        const hitY = Math.round(hit.point.y * 100) / 100;
        const hitZ = Math.round(hit.point.z * 100) / 100;
        
        let targetY = hitY;
        if (isPlaceOutletMode) targetY += 0.3;
        else if (isPlaceVentMode || isPlaceFixtureMode) targetY += 0.02;
        else if (isMoveNodeMode) targetY += 0.02; // Roughly height for register/fixture
        
        updateGhostMesh(hitX, targetY, hitZ, 'generic');
      } else {
        hideGhostMesh();
      }
    } else {
      hideGhostMesh();
    }
`;

model = model.replace(/function onMouseMove\(e\) \{[\s\S]*?mouse\.y = -\(\(e\.clientY - rect\.top\) \/ rect\.height\) \* 2 \+ 1;/g, ghostMoveLogic);

fs.writeFileSync('js/model3d.js', model);
