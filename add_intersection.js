const fs = require('fs');
let model = fs.readFileSync('js/model3d.js', 'utf8');

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

fs.writeFileSync('js/model3d.js', model);
console.log("Added intersection logic");
