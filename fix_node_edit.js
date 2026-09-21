const fs = require('fs');
let app = fs.readFileSync('js/app.js', 'utf8');

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

app = app.replace('  /* ---------- selection ---------- */', overlayLogic + '\n  /* ---------- selection ---------- */');

fs.writeFileSync('js/app.js', app);
