const fs = require('fs');

let app = fs.readFileSync('js/app.js', 'utf8');

// 1. Update openNodeEdit signature and body
const newOpenNodeEdit = `function openNodeEdit(type, id, x, y) {
    activeEditType = type;
    activeEditNode = id;
    const ui = $("#nodeEditOverlay");
    const title = $("#nodeEditTitle");
    if (ui && title) {
      let dispId = id.length > 8 ? id.substring(0,8) : id;
      title.textContent = (type.charAt(0).toUpperCase() + type.slice(1)) + " " + dispId;
      ui.style.display = "block";
      if (x !== undefined && y !== undefined) {
        ui.style.left = x + "px";
        ui.style.top = y + "px";
        ui.style.transform = "none";
      }
      
      const btnToggleFlow = $("#btnToggleFlowNode");
      if (btnToggleFlow) {
        btnToggleFlow.style.display = type === "register" ? "block" : "none";
      }
    }
  }`;

app = app.replace(/function openNodeEdit\(type, id\) \{[\s\S]*?ui\.style\.display = "block";\n    \}\n  \}/g, newOpenNodeEdit);

// 2. Add Toggle Flow button handler
const toggleFlowLogic = `
  const btnToggleFlowNode = $("#btnToggleFlowNode");
  if (btnToggleFlowNode) btnToggleFlowNode.addEventListener("click", () => {
    if (!activeEditNode || activeEditType !== "register") return;
    const item = window.HOUSE.registers.find(x => x.id === activeEditNode);
    if (item) {
      if (typeof window.pushCaptureState === "function") window.pushCaptureState();
      item.kind = item.kind === "return" ? "supply" : "return";
      SS.save(window.HOUSE);
      refreshAll();
      closeNodeEdit();
    }
  });
`;

app = app.replace('const btnDeleteNode = $("#btnDeleteNode");', toggleFlowLogic + '\n  const btnDeleteNode = $("#btnDeleteNode");');

fs.writeFileSync('js/app.js', app);
