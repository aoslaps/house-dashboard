const fs = require('fs');

let model = fs.readFileSync('js/model3d.js', 'utf8');

model = model.replace('let isPlaceOutletMode = false;', 'let isPlaceOutletMode = false;\n  let isMoveNodeMode = false;');

model = model.replace('if (isPlaceVentMode || isPlaceFixtureMode || isPlaceOutletMode) {', 'if (isPlaceVentMode || isPlaceFixtureMode || isPlaceOutletMode || isMoveNodeMode) {');

const moveLogic = `} else if (isMoveNodeMode && window.App && typeof window.App.moveNodeTo3D === "function") {
          window.App.moveNodeTo3D({
            room: detectedRoom,
            anchor: { x: hitX, y: hitY + 0.02, z: hitZ }
          });
        } else if (isPlaceOutletMode`;

model = model.replace('} else if (isPlaceOutletMode', moveLogic);

model = model.replace('    init,', '    setMoveNodeMode: (m) => { isMoveNodeMode = m; },\n    init,');

fs.writeFileSync('js/model3d.js', model);
