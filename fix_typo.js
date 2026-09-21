const fs = require('fs');
let app = fs.readFileSync('js/app.js', 'utf8');
app = app.replace('$("#roomList li").forEach', '$$("#roomList li").forEach');
fs.writeFileSync('js/app.js', app);
console.log('Fixed');
