const fs = require('fs');

let model = fs.readFileSync('js/model3d.js', 'utf8');

const contextMenuLogic = `
    renderer.domElement.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      
      raycaster.setFromCamera(mouse, camera);
      
      if (hvacLayerGroup && hvacLayerGroup.visible) {
        const regIntersects = raycaster.intersectObjects(hvacLayerGroup.children.filter((c) => c.userData && c.userData.isRegister));
        if (regIntersects.length > 0) {
          const regObj = regIntersects[0].object;
          if (window.App && typeof window.App.openNodeEdit === 'function') {
            window.App.openNodeEdit('register', regObj.userData.registerId, e.clientX, e.clientY);
            return;
          }
        }
      }

      if (plumbingLayerGroup && plumbingLayerGroup.visible) {
        const fixIntersects = raycaster.intersectObjects(plumbingLayerGroup.children.filter((c) => c.userData && c.userData.isFixture));
        if (fixIntersects.length > 0) {
          const fixObj = fixIntersects[0].object;
          if (window.App && typeof window.App.openNodeEdit === 'function') {
            window.App.openNodeEdit('fixture', fixObj.userData.fixtureId, e.clientX, e.clientY);
            return;
          }
        }
      }

      if (electricalLayerGroup && electricalLayerGroup.visible) {
        const outIntersects = raycaster.intersectObjects(electricalLayerGroup.children.filter((c) => c.userData && c.userData.isOutlet));
        if (outIntersects.length > 0) {
          const outObj = outIntersects[0].object;
          if (window.App && typeof window.App.openNodeEdit === 'function') {
            window.App.openNodeEdit('outlet', outObj.userData.outletId, e.clientX, e.clientY);
            return;
          }
        }
      }
    });
`;

model = model.replace('renderer.domElement.addEventListener("click", onClick);', 'renderer.domElement.addEventListener("click", onClick);\n' + contextMenuLogic);

// Also remove the old left-click logic that we tried to add earlier which broke selection!
// Wait! Earlier I used apply_fixes.js to add `intersectionLogic` inside `onClick`.
// But wait, my previous search showed it wasn't there! Let me make sure it isn't there, or if it is, remove it.

fs.writeFileSync('js/model3d.js', model);
