"use strict";

const $ = (id) => document.getElementById(id);
const market = window.housingMarket;
const icons = {
  brand: '<path d="M2 17h20M5 17V9m14 8V9M5 10c3-1 5-3 7-6 2 3 4 5 7 6M8 12v5m4-9v9m4-5v5"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  pin: '<path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/>',
  calculator: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 7h8m-7 5h.01m3 0h.01m3 0h.01m-6 4h.01m3 0h.01m3 0h.01"/>',
  bookmark: '<path d="M6 4h12v17l-6-4-6 4V4Z"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5m0-8h.01"/>',
  home: '<path d="m3 10 9-7 9 7m-16-1v11h14V9m-9 11v-6h4v6"/>',
  trend: '<path d="m3 17 6-6 4 4 7-9m-6 0h6v6"/>',
  activity: '<path d="M3 18h18M5 14l4-4 4 2 6-7"/>',
  map: '<path d="m3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2V5Zm6-2v16m6-14v16"/>',
  search: '<circle cx="10.5" cy="10.5" r="6"/><path d="m15 15 5 5"/>',
  download: '<path d="M12 3v12m-4-4 4 4 4-4M4 16v4h16v-4"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
};
const svg = (name) => '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">' + icons[name] + '</svg>';
document.querySelectorAll("[data-icon]").forEach((item) => { item.innerHTML = svg(item.dataset.icon); });

if (!market) {
  $("data-date").textContent = "Market data unavailable";
  $("results-count").textContent = "The market snapshot could not be loaded.";
} else {
  start();
}

function start() {
  const index = market.months.indexOf(market.latest);
  const zipById = new Map(market.zipcodes.map((row) => [row.zip, row]));
  const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
  const monthFormat = new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
  const typeLabels = { all: "All home types", house: "Single-family", condo: "Condo / co-op" };
  const lineColors = ["#7143db", "#cc6e32", "#248979", "#3c72ce"];
  const lineDashes = [[], [6, 3], [2, 3], [9, 3, 2, 3]];
  const bins = [
    { max: 200000, label: "<$200k", color: "#d3c0f6" },
    { max: 300000, label: "$200–299k", color: "#af91ee" },
    { max: 400000, label: "$300–399k", color: "#8a65d8" },
    { max: 500000, label: "$400–499k", color: "#7045bb" },
    { max: Infinity, label: "$500k+", color: "#472888" },
  ];
  const pageSize = 8;
  let type = "all";
  let range = 5;
  let view = "overview";
  let page = 0;
  let sortKey = "value";
  let sortOrder = 1;
  let chartIndex = null;
  let zoom = 1;
  let projectionCenter = null;
  let mapHits = [];
  let toastTimer;
  let chartSeries = [];
  let chartScale = null;
  let comparison = ["45202", "41011", "41042"];
  let watch = new Set(readSaved());

  function readSaved() {
    try {
      const saved = JSON.parse(localStorage.getItem("rivercity-watchlist") || "[]");
      return Array.isArray(saved) ? saved.filter((zip) => zipById.has(zip)) : [];
    } catch { return []; }
  }

  const dollars = (value) => value == null ? "—" : currency.format(value);
  const month = (value) => monthFormat.format(new Date(value + "T00:00:00Z"));
  const percent = (value) => value == null ? "—" : (value > 0 ? "+" : "") + value.toFixed(1) + "%";
  const numericClass = (value) => value > 0 ? "positive" : value < 0 ? "negative" : "";
  const safe = (value) => String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[char]);
  const change = (values, periods) => values?.[index] && values?.[index - periods] ?
    (values[index] / values[index - periods] - 1) * 100 : null;
  const matches = (row, query) => (row.zip + " " + row.city + " " + row.county + " " + row.state).toLowerCase().includes(query);
  const eligible = (row) => row.values[type]?.[index] != null;

  function showToast(message) {
    window.clearTimeout(toastTimer);
    $("toast").textContent = message;
    $("toast").hidden = false;
    toastTimer = window.setTimeout(() => { $("toast").hidden = true; }, 3600);
  }

  function renderMetrics() {
    const values = market.metro[type];
    $("metro-value").textContent = dollars(values?.[index]);
    $("metro-caption").textContent = "Zillow Home Value Index";
    for (const [id, intervals] of [["metro-year", 12], ["metro-five", 60]]) {
      const result = change(values, intervals);
      $(id).textContent = percent(result);
      $(id).className = numericClass(result);
    }
    $("zip-count").textContent = market.zipcodes.filter(eligible).length;
  }

  function filteredRows() {
    const query = $("search").value.trim().toLowerCase();
    const state = $("region").value;
    const cap = Number($("budget").value);
    return market.zipcodes.filter((row) => {
      const value = row.values[type]?.[index];
      const inView = view === "watchlist" ? watch.has(row.zip) : value != null;
      return inView && (!state || row.state === state) && (!cap || (value != null && value <= cap)) && matches(row, query);
    }).map((row) => ({
      ...row,
      region: row.county + ", " + row.state,
      value: row.values[type]?.[index] ?? null,
      year: change(row.values[type], 12),
      five: change(row.values[type], 60),
    })).sort((a, b) => {
      const left = a[sortKey], right = b[sortKey];
      if (left == null || right == null) return Number(left == null) - Number(right == null);
      const order = typeof left === "number" ? left - right : left.localeCompare(right);
      return order * sortOrder || a.zip.localeCompare(b.zip);
    });
  }

  function renderTable() {
    const rows = filteredRows();
    page = Math.min(page, Math.max(0, Math.ceil(rows.length / pageSize) - 1));
    const from = page * pageSize;
    const visible = rows.slice(from, from + pageSize);
    $("results-count").textContent = rows.length ?
      (from + 1) + "–" + (from + visible.length) + " of " + rows.length + " ZIPs" : "0 ZIPs";
    $("prev-page").disabled = page === 0;
    $("next-page").disabled = from + pageSize >= rows.length;
    $("export-data").disabled = !rows.length;
    $("zip-table").innerHTML = visible.length ? visible.map((row) => {
      const label = safe(row.zip + " " + row.city);
      const selected = comparison.includes(row.zip);
      const saved = watch.has(row.zip);
      return '<tr><td><strong>' + row.zip + '</strong><small>' + safe(row.city) + '</small></td><td>' + safe(row.region) +
        '</td><td><strong>' + dollars(row.value) + '</strong></td><td class="' + numericClass(row.year) + '">' + percent(row.year) +
        '</td><td class="' + numericClass(row.five) + '">' + percent(row.five) + '</td><td><div class="actions">' +
        '<button class="icon-button" type="button" data-action="compare" data-zip="' + row.zip + '" aria-pressed="' + selected + '" ' +
        'title="Toggle comparison" aria-label="Compare ' + label + '">' + svg(selected ? "check" : "plus") + '</button>' +
        '<button class="icon-button" type="button" data-action="watch" data-zip="' + row.zip + '" aria-pressed="' + saved + '" ' +
        'title="Toggle watchlist" aria-label="Save ' + label + ' to watchlist">' + svg("bookmark") + '</button>' +
        '<button class="icon-button" type="button" data-action="plan" data-zip="' + row.zip + '" ' +
        'title="Open buying planner" aria-label="Plan a purchase in ' + label + '">' + svg("calculator") + '</button></div></td></tr>';
    }).join("") : '<tr><td class="empty" colspan="6">' +
      (view === "watchlist" && !watch.size ? 'Your watchlist is empty. <a href="#compare">Explore ZIPs</a> to save some.' : 'No ZIPs match these filters.') +
      '</td></tr>';
    document.querySelectorAll("[data-sort]").forEach((button) => {
      const active = button.dataset.sort === sortKey;
      const cell = button.closest("th");
      if (active) cell.setAttribute("aria-sort", sortOrder === 1 ? "ascending" : "descending");
      else cell.removeAttribute("aria-sort");
      button.lastElementChild.textContent = active ? (sortOrder === 1 ? "↑" : "↓") : "";
    });
    $("watch-count").hidden = !watch.size;
    $("watch-count").textContent = watch.size;
  }

  function toggleComparison(zip) {
    if (comparison.includes(zip)) comparison = comparison.filter((item) => item !== zip);
    else {
      if (comparison.length === 4) {
        showToast("Choose up to four ZIPs. Remove one to add another.");
        return;
      }
      comparison.push(zip);
    }
    renderTrend();
    drawMap();
    renderTable();
    updateChecks();
  }

  function clearFilters() {
    $("search").value = "";
    $("region").value = "";
    $("budget").value = "";
    page = 0;
  }

  function route() {
    const previous = view;
    const target = location.hash.slice(1);
    view = ["compare", "planner", "watchlist", "methodology"].includes(target) ? target : "overview";
    document.body.dataset.view = view;
    $("market-view").hidden = ["planner", "methodology"].includes(view);
    $("planner").hidden = view !== "planner";
    $("methodology").hidden = view !== "methodology";
    $("explorer-title").textContent = view === "watchlist" ? "Your watchlist" : "ZIP explorer";
    $("explorer-description").textContent = view === "watchlist" ? "Saved ZIPs on this browser." : "Filter by location and budget, then add ZIPs to your comparison.";
    document.querySelectorAll("[data-nav]").forEach((anchor) => {
      if (anchor.dataset.nav === view) anchor.setAttribute("aria-current", "page");
      else anchor.removeAttribute("aria-current");
      if (anchor.dataset.nav === view) $("crumb-current").textContent = anchor.textContent.trim().replace(/\s+\d+$/, "");
    });
    if ((previous === "watchlist") !== (view === "watchlist")) clearFilters();
    if (view === "planner") renderPlan();
    else if (view !== "methodology") renderMarket();
    requestAnimationFrame(() => {
      if (view === "compare") $("compare").scrollIntoView({ block: "start" });
      else if (document.activeElement?.className !== "skip-link") window.scrollTo(0, 0);
    });
  }

  function chartContext(canvas) {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return null;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.font = '11px -apple-system, "Segoe UI", sans-serif';
    return { ctx, w, h };
  }

  function renderTrend() {
    chartIndex = null;
    $("chart-tip").hidden = true;
    chartSeries = comparison.map((zip, color) => ({ row: zipById.get(zip), color }));
    $("trend-legend").innerHTML = chartSeries.length ? chartSeries.map(({ row, color }) =>
      '<span class="legend-item"><i style="background:' + lineColors[color] + '"></i>' + safe(row.city) +
      ' ' + row.zip + (eligible(row) ? "" : " (latest unavailable)") + '</span>').join("") :
      '<span>Select ZIP codes to start a comparison.</span>';
    for (const button of $("ranges").querySelectorAll("button")) {
      button.setAttribute("aria-pressed", Number(button.dataset.range) === range);
    }
    drawTrend();
  }

  function drawTrend() {
    const surface = chartContext($("trend-chart"));
    if (!surface) return;
    const { ctx, w, h } = surface;
    const first = Math.max(0, index - range * 12);
    const values = chartSeries.flatMap(({ row }) => (row.values[type] || []).slice(first, index + 1).filter(Number.isFinite));
    chartScale = null;
    if (!values.length) {
      ctx.textAlign = "center";
      ctx.fillStyle = "#686376";
      ctx.fillText(comparison.length ? "No chart data for this property type and time range." : "Add ZIP codes to chart their home values.", w / 2, h / 2);
      return;
    }
    const step = [5000, 10000, 20000, 25000, 50000, 100000, 200000, 500000].find(
      (amount) => amount >= (Math.max(...values) - Math.min(...values)) / 4,
    ) || 500000;
    const min = Math.max(0, Math.floor((Math.min(...values) - step * .14) / step) * step);
    const max = Math.ceil((Math.max(...values) + step * .16) / step) * step;
    const left = 47, right = w - 13, top = 13, bottom = h - 27;
    const x = (i) => left + (right - left) * (i - first) / Math.max(1, index - first);
    const y = (n) => bottom - (bottom - top) * (n - min) / (max - min);
    chartScale = { x, y, first, left, right, w, h };
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.lineWidth = 1;
    for (let value = min; value <= max; value += step) {
      const py = y(value);
      ctx.strokeStyle = "#ebe7f0";
      ctx.beginPath();
      ctx.moveTo(left, py);
      ctx.lineTo(right, py);
      ctx.stroke();
      ctx.fillStyle = "#6d657a";
      ctx.fillText("$" + value / 1000 + "k", left - 7, py);
    }
    const ticks = w > 440 ? 5 : w > 310 ? 4 : 3;
    ctx.textBaseline = "alphabetic";
    for (let t = 0; t < ticks; t++) {
      const i = first + Math.round((index - first) * t / (ticks - 1));
      ctx.textAlign = t === 0 ? "left" : t === ticks - 1 ? "right" : "center";
      ctx.fillText(month(market.months[i]), x(i), h - 8);
    }
    const primary = chartSeries[0]?.row.values[type]?.slice(first, index + 1);
    if (primary?.every(Number.isFinite)) {
      const shade = ctx.createLinearGradient(0, top, 0, bottom);
      shade.addColorStop(0, "#ad86f540");
      shade.addColorStop(1, "#ad86f500");
      ctx.beginPath();
      ctx.moveTo(left, bottom);
      primary.forEach((value, i) => ctx.lineTo(x(first + i), y(value)));
      ctx.lineTo(right, bottom);
      ctx.fillStyle = shade;
      ctx.fill();
    }
    for (const { row, color } of chartSeries) {
      ctx.strokeStyle = lineColors[color];
      ctx.lineWidth = 2.4;
      ctx.lineJoin = "round";
      ctx.setLineDash(lineDashes[color]);
      const series = row.values[type] || [];
      let contiguous = false;
      ctx.beginPath();
      for (let i = first; i <= index; i++) {
        const value = series[i];
        if (value == null) { contiguous = false; continue; }
        if (contiguous) ctx.lineTo(x(i), y(value));
        else ctx.moveTo(x(i), y(value));
        contiguous = true;
      }
      ctx.stroke();
    }
    ctx.setLineDash([]);
    if (chartIndex != null) {
      ctx.lineWidth = 1;
      ctx.strokeStyle = "#a999be";
      ctx.beginPath();
      ctx.moveTo(x(chartIndex), top);
      ctx.lineTo(x(chartIndex), bottom);
      ctx.stroke();
      for (const { row, color } of chartSeries) {
        const value = row.values[type]?.[chartIndex];
        if (value == null) continue;
        ctx.fillStyle = lineColors[color];
        ctx.beginPath();
        ctx.arc(x(chartIndex), y(value), 4.1, 0, 2 * Math.PI);
        ctx.fill();
      }
    }
  }

  function selectChartDate(selected, announce = false) {
    if (!chartScale) return;
    const { first, x, w } = chartScale;
    chartIndex = Math.max(first, Math.min(index, selected));
    drawTrend();
    const date = month(market.months[chartIndex]);
    const rows = chartSeries.map(({ row }) => [row.zip, dollars(row.values[type]?.[chartIndex])]);
    const tip = $("chart-tip");
    tip.innerHTML = '<strong>' + date + '</strong>' + rows.map(([zip, value]) => '<div><span>' + zip + '</span><b>' + value + '</b></div>').join("");
    tip.style.left = Math.max(4, Math.min(w - 145, x(chartIndex) + 8)) + "px";
    tip.style.top = "12px";
    tip.hidden = false;
    if (announce) $("chart-announcement").textContent = date + ". " + rows.map(([zip, value]) => zip + " " + value).join(", ");
  }

  function drawMap() {
    const surface = chartContext($("value-map"));
    if (!surface) return;
    const { ctx, w, h } = surface;
    ctx.fillStyle = "#efedf6";
    ctx.fillRect(0, 0, w, h);
    const pts = market.zipcodes.filter((row) => row.point);
    if (!pts.length) return;
    const lons = pts.map((row) => row.point[0]), lats = pts.map((row) => row.point[1]);
    const minLon = Math.min(...lons), maxLon = Math.max(...lons);
    const minLat = Math.min(...lats), maxLat = Math.max(...lats);
    const center = projectionCenter || [(minLon + maxLon) / 2, (minLat + maxLat) / 2];
    const ratio = Math.cos(center[1] * Math.PI / 180);
    const scale = zoom * Math.min((w - 29) / ((maxLon - minLon) * ratio), (h - 24) / (maxLat - minLat));
    const project = ([lon, lat]) => [w / 2 + (lon - center[0]) * ratio * scale, h / 2 + (center[1] - lat) * scale];
    for (const shape of window.housingMap?.counties || []) {
      ctx.beginPath();
      for (const ring of shape.rings) {
        ring.forEach((point, i) => { if (i === 0) ctx.moveTo(...project(point)); else ctx.lineTo(...project(point)); });
        ctx.closePath();
      }
      ctx.fillStyle = shape.state === "21" ? "#e9e2f1" : "#e5e5f0";
      ctx.fill("evenodd");
      ctx.strokeStyle = "#c9c2d6";
      ctx.lineWidth = .8;
      ctx.stroke();
    }
    const lines = window.housingMap?.river || [];
    ctx.beginPath();
    for (const line of lines) {
      line.forEach((point, i) => { if (i === 0) ctx.moveTo(...project(point)); else ctx.lineTo(...project(point)); });
      ctx.closePath();
    }
    ctx.fillStyle = "#b2c7e3";
    ctx.fill("evenodd");
    ctx.strokeStyle = "#9db3d9";
    ctx.lineWidth = .75;
    ctx.stroke();
    if (zoom < 1.9) {
      ctx.font = '700 9px -apple-system, "Segoe UI", sans-serif';
      ctx.letterSpacing = "1px";
      ctx.fillStyle = "#6d6381";
      ctx.fillText("OHIO", ...project([-84.72, 39.33]));
      ctx.fillText("KENTUCKY", ...project([-84.67, 38.97]));
      ctx.letterSpacing = "0px";
      ctx.font = '10px -apple-system, "Segoe UI", sans-serif';
      ctx.fillText("Ohio River", ...project([-84.76, 39.10]));
    }
    mapHits = [];
    for (const row of pts.filter(eligible).sort((a, b) => Number(comparison.includes(a.zip)) - Number(comparison.includes(b.zip)))) {
      const value = row.values[type][index];
      const [x, y] = project(row.point);
      if (x < 1 || x > w - 1 || y < 1 || y > h - 1) continue;
      const chosen = comparison.includes(row.zip);
      ctx.beginPath();
      ctx.arc(x, y, chosen ? 5.4 : 3.7, 0, 2 * Math.PI);
      ctx.fillStyle = bins.find((bin) => value < bin.max)?.color || bins.at(-1).color;
      ctx.fill();
      ctx.lineWidth = chosen ? 1.7 : .75;
      ctx.strokeStyle = "#fff";
      ctx.stroke();
      mapHits.push({ x, y, row, value });
    }
    $("zoom-out").disabled = zoom <= 1;
    $("zoom-in").disabled = zoom >= 2.5;
  }

  function renderMarket() {
    renderMetrics();
    renderTrend();
    renderTable();
    drawMap();
  }

  function monthlyPayment(loan, yearlyRate) {
    const rate = yearlyRate / 1200;
    return rate === 0 ? loan / 360 : loan * rate / -Math.expm1(-360 * Math.log1p(rate));
  }

  function renderPlan() {
    const form = $("assumptions");
    const inputs = new FormData(form);
    const row = zipById.get(inputs.get("zip"));
    const planType = inputs.get("type");
    const base = row?.values[planType]?.[index];
    $("plan-baseline").textContent = base == null ? typeLabels[planType] + " · " + month(market.latest) :
      row.zip + " " + row.city + " · " + dollars(base) + " typical value in " + month(market.latest);
    if (!form.matches(":valid") || base == null) {
      $("plan-output").textContent = base == null ? "Choose a ZIP and property type with a value for this month." : "Enter values within the allowed ranges to calculate a scenario.";
      $("sensitivity-output").textContent = "A valid scenario is needed to compare rates.";
      return;
    }
    const get = (key) => Number(inputs.get(key));
    const years = get("years"), growth = get("growth"), rate = get("rate"), down = get("down");
    const price = base * (1 + growth / 100) ** years;
    const loan = price * (1 - down / 100);
    const upfront = price * (down + get("closing")) / 100;
    const ownership = price * get("tax") / 1200 + get("insurance") + get("hoa") + (loan > 0 ? get("pmi") : 0);
    const total = monthlyPayment(loan, rate) + ownership;
    const saving = Math.max(0, upfront - get("saved")) / (years * 12);
    const budgetGap = get("cap") - total;
    const blocks = [
      ["Scenario purchase price", dollars(price)], ["Estimated monthly payment", dollars(total)],
      ["Cash for down payment and closing", dollars(upfront)], ["Monthly savings target", dollars(saving)],
    ];
    const status = Math.abs(budgetGap) < .5 ? "At your monthly budget" :
      dollars(Math.abs(budgetGap)) + (budgetGap > 0 ? " below" : " above") + " your monthly budget";
    $("plan-output").innerHTML = '<div class="scenario-grid">' + blocks.map(([label, result]) =>
      '<div class="scenario-result"><span>' + label + '</span><strong>' + result + '</strong></div>').join("") +
      '</div><p class="scenario-status"><strong class="' + (budgetGap >= 0 ? "positive" : "negative") + '">' + status +
      '</strong> · ' + years + '-year scenario</p>' +
      (loan > 0 && down < 20 && get("pmi") === 0 ? '<p class="scenario-status">A down payment below 20% may require mortgage insurance. Enter a monthly estimate to include it.</p>' : "");
    const rates = [...new Set([Math.max(0, rate - 1), rate, rate + 1])];
    const payments = rates.map((candidate) => monthlyPayment(loan, candidate) + ownership);
    const maxPayment = Math.max(...payments, 1);
    $("sensitivity-output").innerHTML = rates.map((candidate, i) =>
      '<div class="sensitivity-row"><span>' + candidate.toFixed(2) + '%</span><span class="sensitivity-track"><i style="width:' +
      (payments[i] / maxPayment * 100) + '%"></i></span><strong>' + dollars(payments[i]) + '/mo</strong></div>').join("");
  }

  function updateChecks() {
    const options = $("compare-options");
    options.querySelectorAll("input").forEach((input) => {
      input.checked = comparison.includes(input.value);
      input.disabled = comparison.length >= 4 && !input.checked;
    });
    $("compare-count").textContent = comparison.length + " of 4 ZIPs selected";
  }

  function renderOptions() {
    const query = $("compare-search").value.trim().toLowerCase();
    const rows = market.zipcodes.filter((row) => matches(row, query) && (eligible(row) || comparison.includes(row.zip)));
    $("compare-options").innerHTML = rows.length ? rows.map((row) => '<label class="choice"><input type="checkbox" value="' +
      row.zip + '"><span><strong>' + row.zip + '</strong> · ' + safe(row.city) + ', ' + row.state + '</span></label>').join("") :
      '<p class="empty">No ZIPs match this search.</p>';
    updateChecks();
  }

  function exportCsv() {
    const csvField = (value) => '"' + String(value).replaceAll('"', '""') + '"';
    const records = ["zip,city,state,county,property_type,month,typical_home_value"];
    for (const row of filteredRows()) {
      const prefix = [row.zip, row.city, row.state, row.county, typeLabels[type]].map(csvField).join(",");
      (row.values[type] || []).forEach((value, i) => {
        if (value != null && i <= index) records.push(prefix + "," + market.months[i] + "," + value);
      });
    }
    const url = URL.createObjectURL(new Blob([records.join("\r\n") + "\r\n"], { type: "text/csv;charset=utf-8" }));
    const download = document.createElement("a");
    download.href = url;
    download.download = "rivercity-zhvi-" + type + "-" + market.latest + ".csv";
    download.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  $("data-date").textContent = "Data through " + month(market.latest);
  $("map-key").innerHTML = bins.map(({ label, color }) => '<span class="legend-item"><i style="background:' +
    color + '"></i>' + label + '</span>').join("");
  $("plan-zip").innerHTML = market.zipcodes.map((row) => '<option value="' + row.zip + '">' + row.zip + " · " +
    safe(row.city) + ", " + row.state + '</option>').join("");
  $("plan-zip").value = "45202";
  $("home-type").addEventListener("change", (event) => { type = event.target.value; page = 0; renderMarket(); });
  $("ranges").addEventListener("click", (event) => {
    const button = event.target.closest("[data-range]");
    if (button) { range = Number(button.dataset.range); renderTrend(); }
  });
  $("edit-comparison").addEventListener("click", () => {
    $("compare-search").value = "";
    renderOptions();
    $("compare-dialog").showModal();
    $("compare-search").focus();
  });
  $("compare-done").addEventListener("click", () => $("compare-dialog").close());
  $("compare-search").addEventListener("input", renderOptions);
  $("compare-options").addEventListener("change", (event) => toggleComparison(event.target.value));
  for (const id of ["search", "budget", "region"]) {
    $(id).addEventListener("input", () => { page = 0; renderTable(); });
  }
  $("clear-filters").addEventListener("click", () => { clearFilters(); renderTable(); });
  $("export-data").addEventListener("click", exportCsv);
  document.querySelectorAll("[data-sort]").forEach((button) => button.addEventListener("click", () => {
    const key = button.dataset.sort;
    sortOrder = key === sortKey ? -sortOrder : 1;
    sortKey = key;
    page = 0;
    renderTable();
  }));
  $("prev-page").addEventListener("click", () => { page--; renderTable(); });
  $("next-page").addEventListener("click", () => { page++; renderTable(); });
  $("zip-table").addEventListener("click", (event) => {
    const button = event.target.closest("[data-action]");
    if (!button) return;
    const { action, zip } = button.dataset;
    if (action === "compare") toggleComparison(zip);
    if (action === "watch") {
      if (watch.has(zip)) watch.delete(zip);
      else watch.add(zip);
      let savedLocally = false;
      try {
        localStorage.setItem("rivercity-watchlist", JSON.stringify([...watch]));
        savedLocally = true;
      } catch {}
      renderTable();
      showToast(watch.has(zip) ? (savedLocally ? zip + " saved to your watchlist" : zip + " added for this session") : zip + " removed from your watchlist");
    }
    if (action === "plan") {
      $("plan-zip").value = zip;
      $("plan-type").value = type;
      location.hash = "planner";
    } else {
      $("zip-table").querySelector('button[data-action="' + action + '"][data-zip="' + zip + '"]')?.focus({ preventScroll: true });
    }
  });
  $("assumptions").addEventListener("input", renderPlan);
  $("assumptions").addEventListener("submit", (event) => event.preventDefault());
  $("trend-chart").addEventListener("pointermove", (event) => {
    if (!chartScale) return;
    const { first, left, right } = chartScale;
    const mouse = event.clientX - event.currentTarget.getBoundingClientRect().left;
    selectChartDate(first + Math.round((mouse - left) / (right - left) * (index - first)));
  });
  function clearChartFocus() {
    chartIndex = null;
    $("chart-tip").hidden = true;
    drawTrend();
  }
  $("trend-chart").addEventListener("pointerleave", clearChartFocus);
  $("trend-chart").addEventListener("blur", clearChartFocus);
  $("trend-chart").addEventListener("keydown", (event) => {
    if (!chartScale || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const offset = event.key === "ArrowLeft" ? -1 : 1;
    const target = event.key === "Home" ? chartScale.first : event.key === "End" ? index : (chartIndex ?? index) + offset;
    selectChartDate(target, true);
  });
  function pointAt(event) {
    const bound = $("value-map").getBoundingClientRect();
    const px = event.clientX - bound.left, py = event.clientY - bound.top;
    return mapHits.reduce((best, point) => {
      const distance = Math.hypot(point.x - px, point.y - py);
      return distance <= 10 && (!best || distance <= best.distance) ? { ...point, distance } : best;
    }, null);
  }
  $("value-map").addEventListener("pointermove", (event) => {
    const point = pointAt(event);
    const tip = $("map-tip");
    tip.hidden = !point;
    event.currentTarget.style.cursor = point ? "pointer" : "default";
    if (point) {
      tip.textContent = point.row.zip + " " + point.row.city + " · " + dollars(point.value);
      tip.style.left = Math.max(4, Math.min(point.x + 8, $("map-wrap").clientWidth - tip.offsetWidth - 4)) + "px";
      tip.style.top = Math.max(4, point.y - 32) + "px";
    }
  });
  $("value-map").addEventListener("pointerleave", () => { $("map-tip").hidden = true; });
  $("value-map").addEventListener("click", (event) => {
    const point = pointAt(event);
    if (!point) return;
    toggleComparison(point.row.zip);
    if (zoom > 1) {
      projectionCenter = point.row.point;
      $("map-tip").hidden = true;
      drawMap();
    }
  });
  for (const [button, changeBy] of [["zoom-in", .5], ["zoom-out", -.5]]) {
    $(button).addEventListener("click", () => {
      zoom = Math.max(1, Math.min(2.5, zoom + changeBy));
      if (zoom === 1) projectionCenter = null;
      $("map-tip").hidden = true;
      drawMap();
    });
  }
  const observer = new ResizeObserver(() => { drawTrend(); drawMap(); });
  observer.observe($("trend-chart"));
  observer.observe($("value-map"));
  window.addEventListener("hashchange", route);
  route();
}
