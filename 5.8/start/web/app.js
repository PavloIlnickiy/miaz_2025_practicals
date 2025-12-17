const API_BASE_URL = "http://localhost:8000";

// --------------------
// view mode (?view=)
// --------------------
const urlParams = new URLSearchParams(window.location.search);
const VIEW = (urlParams.get("view") || "analyst").toLowerCase(); // executive | analyst | demo

// --------------------
// state
// --------------------
let trendChart = null;
let dirChart = null;
let typeChart = null;

let currentPage = 1;
let pageSize = 20;

const HIDE_SOURCE = (VIEW === "demo"); // demo: hide source everywhere
const SHOW_TABLE = (VIEW !== "demo" && VIEW !== "executive");
const SHOW_HEATMAP = (VIEW !== "executive");

// --------------------
// helpers
// --------------------
function $(id) { return document.getElementById(id); }

function esc(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function qsFromFilters() {
  const q = new URLSearchParams();

  const from = $("fromDate")?.value;
  const to = $("toDate")?.value;
  const sector = $("sector")?.value;
  const direction = $("direction")?.value;
  const eventType = $("eventType")?.value;
  const minIntensity = $("minIntensity")?.value;

  if (from) q.set("from", from);
  if (to) q.set("to", to);
  if (sector) q.set("sector", sector);
  if (direction) q.set("direction", direction);
  if (eventType) q.set("event_type", eventType);
  if (minIntensity) q.set("min_intensity", minIntensity);

  const s = q.toString();
  return s ? `?${s}` : "";
}

async function apiGet(path) {
  const res = await fetch(`${API_BASE_URL}${path}`);
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`API ${path} failed: ${res.status} ${txt}`);
  }
  return res.json();
}

function setText(id, value) {
  const el = $(id);
  if (el) el.textContent = (value ?? "-");
}

// --------------------
// view mode UI toggles
// --------------------
function applyViewMode() {
  // optional info text
  const viewBadge = $("viewBadge");
  if (viewBadge) viewBadge.textContent = VIEW;

  // hide blocks by mode
  const heatmapSection = $("heatmapSection");
  if (heatmapSection) heatmapSection.style.display = SHOW_HEATMAP ? "" : "none";

  const incidentsSection = $("incidentsSection");
  if (incidentsSection) incidentsSection.style.display = SHOW_TABLE ? "" : "none";

  const insightBox = $("insightBox");
  if (insightBox) insightBox.style.display = (VIEW === "executive") ? "" : "none";

  // hide "source" header/cols in demo
  const thSource = $("thSource");
  if (thSource) thSource.style.display = HIDE_SOURCE ? "none" : "";
}

// --------------------
// load filters -> populate selects
// --------------------
async function loadFilters() {
  const data = await apiGet("/filters");

  // set date inputs default
  if ($("fromDate") && data.min_date) $("fromDate").value = data.min_date;
  if ($("toDate") && data.max_date) $("toDate").value = data.max_date;

  // populate selects
  const sectorSel = $("sector");
  const dirSel = $("direction");
  const typeSel = $("eventType");

  function fillSelect(sel, values) {
    if (!sel) return;
    // keep first option (All)
    while (sel.options.length > 1) sel.remove(1);
    (values || []).forEach(v => {
      const opt = document.createElement("option");
      opt.value = v;
      opt.textContent = v;
      sel.appendChild(opt);
    });
  }

  fillSelect(sectorSel, data.sectors);
  fillSelect(dirSel, data.directions);
  fillSelect(typeSel, data.event_types);
}

// --------------------
// KPI
// --------------------
async function loadKpi() {
  const d = await apiGet(`/kpi${qsFromFilters()}`);

  setText("kpiTotal", d.total_incidents);
  setText("kpiSum", d.total_intensity);
  setText("kpiAvg", d.avg_intensity);
  setText("kpiTop", d.top_direction ?? "-");

  // executive insight text (simple)
  if ($("insightText")) {
    const top = d.top_direction ? `Топ-напрямок: ${d.top_direction}.` : "Немає даних по топ-напрямку.";
    $("insightText").textContent = `Інцидентів: ${d.total_incidents}. Сумарна інтенсивність: ${d.total_intensity}. ${top}`;
  }
}

// --------------------
// Trend chart
// --------------------
async function loadTrend() {
  const rows = await apiGet(`/trend?group=day${qsFromFilters().replace("?", "&")}`);

  const labels = rows.map(r => r.t);
  const values = rows.map(r => r.value);

  const canvas = $("trendChart");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");

  if (!trendChart) {
    trendChart = new Chart(ctx, {
      type: "line",
      data: {
        labels,
        datasets: [{ label: "Incidents", data: values }]
      },
      options: {
        responsive: true,
        plugins: { legend: { display: true } }
      }
    });
  } else {
    trendChart.data.labels = labels;
    trendChart.data.datasets[0].data = values;
    trendChart.update();
  }
}

// --------------------
// Distributions (directions, types)
// --------------------
async function loadDistributions() {
  const q = qsFromFilters().replace("?", "&");
  const dirs = await apiGet(`/distribution/directions?x=1${q}`);
  const types = await apiGet(`/distribution/types?x=1${q}`);

  // directions chart
  const dirCanvas = $("dirChart");
  if (dirCanvas) {
    const labels = dirs.map(x => x.label);
    const values = dirs.map(x => x.value);
    const ctx = dirCanvas.getContext("2d");

    if (!dirChart) {
      dirChart = new Chart(ctx, {
        type: "bar",
        data: { labels, datasets: [{ label: "By directions", data: values }] },
        options: { responsive: true, plugins: { legend: { display: true } } }
      });
    } else {
      dirChart.data.labels = labels;
      dirChart.data.datasets[0].data = values;
      dirChart.update();
    }
  }

  // types chart
  const typeCanvas = $("typeChart");
  if (typeCanvas) {
    const labels = types.map(x => x.label);
    const values = types.map(x => x.value);
    const ctx = typeCanvas.getContext("2d");

    if (!typeChart) {
      typeChart = new Chart(ctx, {
        type: "doughnut",
        data: { labels, datasets: [{ label: "By event types", data: values }] },
        options: { responsive: true, plugins: { legend: { display: true } } }
      });
    } else {
      typeChart.data.labels = labels;
      typeChart.data.datasets[0].data = values;
      typeChart.update();
    }
  }
}

// --------------------
// Heatmap table (sector × week) with simple coloring
// --------------------
function heatColor(v, maxV) {
  if (maxV <= 0) return "transparent";
  const ratio = v / maxV; // 0..1
  // simple grayscale-like using rgba
  const alpha = Math.min(0.85, 0.1 + ratio * 0.75);
  return `rgba(0, 123, 255, ${alpha})`;
}

async function loadHeatmap() {
  if (!SHOW_HEATMAP) return;

  const d = await apiGet(`/heatmap${qsFromFilters()}`);

  const table = $("heatmapTable");
  if (!table) return;

  const cols = d.columns || [];
  const rows = d.rows || [];

  // find max for coloring
  let maxV = 0;
  rows.forEach(r => (r.values || []).forEach(v => { if (v > maxV) maxV = v; }));

  // build table HTML
  let html = "<thead><tr><th>Sector</th>";
  cols.forEach(c => html += `<th>${esc(c)}</th>`);
  html += "</tr></thead><tbody>";

  rows.forEach(r => {
    html += `<tr><td>${esc(r.sector)}</td>`;
    (r.values || []).forEach(v => {
      const bg = heatColor(v, maxV);
      html += `<td style="background:${bg}; color:#fff; text-align:center;">${v}</td>`;
    });
    html += "</tr>";
  });

  html += "</tbody>";
  table.innerHTML = html;
}

// --------------------
// Incidents table + pagination + modal
// --------------------
function renderPagination(total, page, pageSize) {
  const pag = $("pagination");
  if (!pag) return;

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const prevDisabled = (page <= 1) ? "disabled" : "";
  const nextDisabled = (page >= totalPages) ? "disabled" : "";

  pag.innerHTML = `
    <button id="prevPage" ${prevDisabled}>Prev</button>
    <span>Page ${page} / ${totalPages} (total: ${total})</span>
    <button id="nextPage" ${nextDisabled}>Next</button>
  `;

  $("prevPage")?.addEventListener("click", () => {
    if (currentPage > 1) {
      currentPage--;
      loadIncidents();
    }
  });

  $("nextPage")?.addEventListener("click", () => {
    if (currentPage < totalPages) {
      currentPage++;
      loadIncidents();
    }
  });
}

async function loadIncidents() {
  if (!SHOW_TABLE) return;

  const q = new URLSearchParams(qsFromFilters().replace("?", ""));
  q.set("page", String(currentPage));
  q.set("page_size", String(pageSize));
  q.set("sort", "occurred_at");
  q.set("order", "desc");

  const data = await apiGet(`/incidents?${q.toString()}`);

  const body = $("incidentsBody");
  if (!body) return;

  body.innerHTML = "";

  data.items.forEach(item => {
    const tr = document.createElement("tr");

    const tdId = document.createElement("td");
    tdId.textContent = item.id;
    tr.appendChild(tdId);

    const tdDt = document.createElement("td");
    tdDt.textContent = item.occurred_at;
    tr.appendChild(tdDt);

    const tdSector = document.createElement("td");
    tdSector.textContent = item.sector;
    tr.appendChild(tdSector);

    const tdDir = document.createElement("td");
    tdDir.textContent = item.direction;
    tr.appendChild(tdDir);

    const tdType = document.createElement("td");
    tdType.textContent = item.event_type;
    tr.appendChild(tdType);

    const tdInt = document.createElement("td");
    tdInt.textContent = item.intensity;
    tr.appendChild(tdInt);

    const tdSource = document.createElement("td");
    tdSource.textContent = item.source ?? "";
    tdSource.style.display = HIDE_SOURCE ? "none" : "";
    tr.appendChild(tdSource);

    const tdSum = document.createElement("td");
    tdSum.textContent = item.summary ?? "";
    tr.appendChild(tdSum);

    const tdAct = document.createElement("td");
    const btn = document.createElement("button");
    btn.textContent = "Details";
    btn.addEventListener("click", () => openDetails(item.id));
    tdAct.appendChild(btn);
    tr.appendChild(tdAct);

    body.appendChild(tr);
  });

  renderPagination(data.total, data.page, data.page_size);
}

async function openDetails(id) {
  const modal = $("modal");
  const modalBody = $("modalBody");
  if (!modal || !modalBody) return;

  const d = await apiGet(`/incidents/${id}`);

  const sourceLine = HIDE_SOURCE
    ? ""
    : `<p><b>Source:</b> ${esc(d.source ?? "")}</p>`;

  modalBody.innerHTML = `
    <p><b>ID:</b> ${esc(d.id)}</p>
    <p><b>Occurred at:</b> ${esc(d.occurred_at)}</p>
    <p><b>Sector:</b> ${esc(d.sector)}</p>
    <p><b>Direction:</b> ${esc(d.direction)}</p>
    <p><b>Event type:</b> ${esc(d.event_type)}</p>
    <p><b>Intensity:</b> ${esc(d.intensity)}</p>
    ${sourceLine}
    <p><b>Summary:</b> ${esc(d.summary ?? "")}</p>
  `;

  modal.style.display = "block";
}

function setupModal() {
  const modal = $("modal");
  const closeBtn = $("modalClose");
  if (!modal || !closeBtn) return;

  closeBtn.addEventListener("click", () => {
    modal.style.display = "none";
  });

  window.addEventListener("click", (e) => {
    if (e.target === modal) modal.style.display = "none";
  });
}

// --------------------
// unified refresh
// --------------------
async function refreshAll() {
  try {
    await loadKpi();
    await loadTrend();
    await loadDistributions();
    await loadHeatmap();
    await loadIncidents();
  } catch (e) {
    console.error(e);
    const err = $("errorBox");
    if (err) {
      err.style.display = "";
      err.textContent = String(e);
    } else {
      alert(String(e));
    }
  }
}

function setupApplyButton() {
  $("applyBtn")?.addEventListener("click", () => {
    currentPage = 1; // reset pagination after filter change
    refreshAll();
  });
}

function setupPageSize() {
  const sel = $("pageSize");
  if (!sel) return;
  sel.value = String(pageSize);
  sel.addEventListener("change", () => {
    pageSize = parseInt(sel.value, 10) || 20;
    currentPage = 1;
    loadIncidents();
  });
}

// --------------------
// init
// --------------------
(async function init() {
  applyViewMode();
  setupModal();
  setupApplyButton();
  setupPageSize();

  await loadFilters();
  await refreshAll();
})();
