const fs = require('fs');
let app = fs.readFileSync('js/app.js', 'utf8');

const moveBtnLogic = `
  const btnMoveNode = $("#btnMoveNode");
  if (btnMoveNode) btnMoveNode.addEventListener("click", () => {
    if (!activeEditNode || !window.Model3D) return;
    window.Model3D.setMoveNodeMode(true);
    closeNodeEdit();
  });
`;

app = app.replace('const btnRotateNode = $("#btnRotateNode");', moveBtnLogic + '\n  const btnRotateNode = $("#btnRotateNode");');

const moveFnLogic = `
  function moveNodeTo3D({ room, anchor }) {
    if (!activeEditNode || !activeEditType) return;
    let arr = null;
    if (activeEditType === "register") arr = window.HOUSE.registers;
    if (activeEditType === "fixture") arr = window.HOUSE.fixtures;
    if (activeEditType === "outlet") arr = window.HOUSE.outlets;
    
    if (arr) {
      const item = arr.find(x => x.id === activeEditNode);
      if (item) {
        if (typeof window.pushCaptureState === "function") window.pushCaptureState();
        item.room = room;
        item.anchor = anchor;
        SS.save(window.HOUSE);
        refreshAll();
      }
    }
    
    // Reset move mode
    if (window.Model3D && typeof window.Model3D.setMoveNodeMode === "function") {
      window.Model3D.setMoveNodeMode(false);
    }
    activeEditNode = null;
    activeEditType = null;
  }
`;

app = app.replace('function openNodeEdit(type, id) {', moveFnLogic + '\n  function openNodeEdit(type, id) {');
app = app.replace('openNodeEdit,', 'openNodeEdit,\n    moveNodeTo3D,');

fs.writeFileSync('js/app.js', app);
