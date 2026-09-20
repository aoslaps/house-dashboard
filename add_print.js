const fs = require('fs');
let app = fs.readFileSync('js/app.js', 'utf8');

const printLogic = `
  function generatePrintReport() {
    const H = window.HOUSE || { rooms: [] };
    const wrap = $("#printReport");
    if (!wrap) return;

    let totalBudget = 0;
    let totalSpent = 0;

    let html = \`<h1 style="border-bottom:2px solid #000;padding-bottom:10px;margin-bottom:20px;">Project Punch List & Budget Report</h1>\`;

    html += \`<div style="display:flex;flex-wrap:wrap;gap:20px;">\`;

    H.rooms.forEach(r => {
      const budget = parseFloat(r.budget) || 0;
      const spent = parseFloat(r.spent) || 0;
      totalBudget += budget;
      totalSpent += spent;

      html += \`<div style="width:48%;margin-bottom:20px;border:1px solid #ccc;padding:15px;page-break-inside:avoid;">
        <h2 style="margin:0 0 10px 0;font-size:18px;">\${r.name} <span style="font-size:12px;color:#555;font-weight:normal;">(\${r.status || 'not-started'})</span></h2>
        <div style="font-size:14px;margin-bottom:10px;">
          <strong>Budget:</strong> $\${budget.toFixed(2)} | 
          <strong>Spent:</strong> $\${spent.toFixed(2)} | 
          <strong>Remaining:</strong> $\${(budget - spent).toFixed(2)}
        </div>
      \`;

      if (r.tasks && r.tasks.length > 0) {
        html += \`<ul style="margin:0;padding-left:20px;font-size:14px;">\`;
        r.tasks.forEach(t => {
          html += \`<li style="margin-bottom:4px;">
            [\${t.done ? 'X' : ' '}] \${t.label}
          </li>\`;
        });
        html += \`</ul>\`;
      } else {
        html += \`<div style="font-style:italic;color:#777;font-size:13px;">No tasks.</div>\`;
      }

      html += \`</div>\`;
    });

    html += \`</div>\`;

    html += \`<div style="margin-top:30px;padding:20px;border:2px solid #000;font-size:18px;">
      <strong>PROJECT TOTALS:</strong><br>
      Total Budget: $\${totalBudget.toFixed(2)}<br>
      Total Spent: $\${totalSpent.toFixed(2)}<br>
      Overall Remaining: $\${(totalBudget - totalSpent).toFixed(2)}
    </div>\`;

    wrap.innerHTML = html;
  }
`;

app = app.replace('// Initialization', printLogic + '\n  // Initialization');

const btnLogic = `
    const btnPrintReport = $("#btnPrintReport");
    if (btnPrintReport) {
      btnPrintReport.addEventListener("click", () => {
        generatePrintReport();
        window.print();
      });
    }
`;

app = app.replace('const btnReset = $("#btnReset");', btnLogic + '\n    const btnReset = $("#btnReset");');

fs.writeFileSync('js/app.js', app);
console.log("Added print logic");
