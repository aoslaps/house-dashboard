/* ============================================================
   charts.js — three Chart.js charts, rebuilt whenever the phase
   changes. Exposes window.Charts.render(rooms, STATUS).
   ============================================================ */
(function () {
  "use strict";

  const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const instances = {};

  function destroy(key) { if (instances[key]) { instances[key].destroy(); delete instances[key]; } }

  function render(rooms, STATUS) {
    if (typeof Chart === "undefined") return; // CDN blocked / offline
    Chart.defaults.font.family = "Inter, system-ui, sans-serif";
    Chart.defaults.color = css("--graphite");

    const blue = css("--blue");
    const line = css("--line");

    /* --- 1. completion by room (biggest rooms first) --- */
    const comp = rooms.filter((r) => r.area > 0).sort((a, b) => b.area - a.area).slice(0, 10);
    destroy("completion");
    instances.completion = new Chart(document.getElementById("chartCompletion"), {
      type: "bar",
      data: {
        labels: comp.map((r) => r.name),
        datasets: [{ data: comp.map((r) => r.percent || 0), backgroundColor: blue, borderRadius: 3, barThickness: 14 }],
      },
      options: {
        indexAxis: "y", responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => c.parsed.x + "% complete" } } },
        scales: { x: { max: 100, grid: { color: line }, ticks: { callback: (v) => v + "%" } }, y: { grid: { display: false } } },
      },
    });

    /* --- 2. budget vs spent (rooms with a budget) --- */
    const money = rooms.filter((r) => (r.budget || 0) > 0).sort((a, b) => b.budget - a.budget).slice(0, 8);
    destroy("spend");
    instances.spend = new Chart(document.getElementById("chartSpend"), {
      type: "bar",
      data: {
        labels: money.map((r) => r.name),
        datasets: [
          { label: "Budget", data: money.map((r) => r.budget), backgroundColor: line, borderRadius: 3 },
          { label: "Spent",  data: money.map((r) => r.spent || 0), backgroundColor: blue, borderRadius: 3 },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { position: "bottom" }, tooltip: { callbacks: { label: (c) => c.dataset.label + ": $" + c.parsed.y.toLocaleString() } } },
        scales: { x: { grid: { display: false }, ticks: { autoSkip: false, maxRotation: 40, minRotation: 0 } },
                  y: { grid: { color: line }, ticks: { callback: (v) => "$" + (v / 1000) + "k" } } },
      },
    });

    /* --- 3. status mix --- */
    const counts = {};
    Object.keys(STATUS).forEach((k) => (counts[k] = 0));
    rooms.forEach((r) => (counts[r.status] = (counts[r.status] || 0) + 1));
    const keys = Object.keys(STATUS).filter((k) => counts[k] > 0);
    destroy("status");
    instances.status = new Chart(document.getElementById("chartStatus"), {
      type: "doughnut",
      data: {
        labels: keys.map((k) => STATUS[k].label),
        datasets: [{ data: keys.map((k) => counts[k]), backgroundColor: keys.map((k) => STATUS[k].color), borderWidth: 2, borderColor: css("--surface") }],
      },
      options: { responsive: true, maintainAspectRatio: false, cutout: "62%", plugins: { legend: { position: "bottom" } } },
    });
  }

  window.Charts = { render };
})();
