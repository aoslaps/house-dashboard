const fs = require('fs');
let app = fs.readFileSync('js/app.js', 'utf8');
app = app.replace('document.addEventListener("DOMContentLoaded", init);', 'document.addEventListener("click", (e) => { const ui = document.getElementById("nodeEditOverlay"); if (ui && ui.style.display === "block" && !ui.contains(e.target)) ui.style.display = "none"; });\n  document.addEventListener("DOMContentLoaded", init);');
fs.writeFileSync('js/app.js', app);
