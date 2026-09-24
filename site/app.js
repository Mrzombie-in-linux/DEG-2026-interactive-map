const DATA_URL = "data/feddeg_dashboard.json";

const formatNumber = new Intl.NumberFormat("ru-RU");
const formatPercent = new Intl.NumberFormat("ru-RU", {
  maximumFractionDigits: 1,
});
const formatDecimal = new Intl.NumberFormat("ru-RU", {
  maximumFractionDigits: 1,
});
const formatSigned = new Intl.NumberFormat("ru-RU", {
  maximumFractionDigits: 1,
  signDisplay: "exceptZero",
});

const app = document.querySelector("#app");
let dashboard = null;
let regionsById = new Map();
let districtsById = new Map();
let districtsByRegion = new Map();
const anomalyCache = new WeakMap();
let state = {
  query: "",
  selectedRegionId: null,
};

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function pluralRu(value, one, few, many) {
  const mod10 = value % 10;
  const mod100 = value % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

function number(value) {
  return formatNumber.format(value || 0);
}

function percent(part, total) {
  if (!total) return "0%";
  return `${formatPercent.format((part / total) * 100)}%`;
}

function normalizeSearch(value) {
  return value.trim().toLocaleLowerCase("ru-RU");
}

function parseRoute() {
  const parts = window.location.hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  const regionIndex = parts.indexOf("region");
  const districtIndex = parts.indexOf("district");
  return {
    regionId: regionIndex >= 0 ? parts[regionIndex + 1] : null,
    districtId: districtIndex >= 0 ? parts[districtIndex + 1] : null,
  };
}

function route(regionId = null, districtId = null) {
  if (!regionId) return "#/";
  if (!districtId) return `#/region/${regionId}`;
  return `#/region/${regionId}/district/${districtId}`;
}

// SVG map of Russia (paths keyed by RU-XX codes) is loaded from russia-map.svg.
// A few SVG codes differ from the ISO codes used in the data.
const SVG_CODE_OVERRIDES = { CR: "KRY", HR: "KHE", ZP: "ZAP" };
const MAP_URL = "russia-map.svg";
let mapSvgCache = null;

function svgCodeToIso(ruCode) {
  const short = String(ruCode).replace(/^RU-/, "");
  return SVG_CODE_OVERRIDES[short] || short;
}

function turnoutColor(region, maxTurnout) {
  const t = region.voters ? (region.votes / region.voters) * 100 : 0;
  const ratio = maxTurnout ? clamp(t / maxTurnout, 0, 1) : 0;
  const hue = 200 + (140 - 200) * ratio; // blue -> green as turnout grows
  const light = 78 - ratio * 24;
  return `hsl(${hue} ${Math.round(52 - ratio * 12)}% ${Math.round(light)}%)`;
}

async function fetchMapSvg() {
  if (mapSvgCache) return mapSvgCache;
  const response = await fetch(MAP_URL);
  if (!response.ok) throw new Error(`Не удалось загрузить ${MAP_URL}`);
  mapSvgCache = await response.text();
  return mapSvgCache;
}

async function renderMap(container, selectedRegionId) {
  if (!container) return;

  let svgText;
  try {
    svgText = await fetchMapSvg();
  } catch (error) {
    container.innerHTML = `<div class="empty">Карта не загрузилась: ${escapeHtml(error.message)}</div>`;
    return;
  }

  const regionsWithData = dashboard.regions.filter((r) => r.code);
  const maxTurnout = Math.max(
    ...regionsWithData.map((r) => (r.voters ? (r.votes / r.voters) * 100 : 0)),
    1,
  );
  const byCode = new Map(regionsWithData.map((r) => [r.code, r]));

  const doc = new DOMParser().parseFromString(svgText, "image/svg+xml");
  const svg = doc.documentElement;
  svg.setAttribute("class", "russia-map");
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", "Карта регионов России");

  const regionEls = svg.querySelectorAll("[data-code]");
  regionEls.forEach((el) => {
    const region = byCode.get(svgCodeToIso(el.getAttribute("data-code")));
    const isSelected = region && region.id === selectedRegionId;
    const fill = !region
      ? "var(--map-no-data, #e6eaf0)"
      : isSelected
        ? "var(--green)"
        : turnoutColor(region, maxTurnout);

    const applyFill = (pathEl) => {
      pathEl.setAttribute("fill", fill);
      pathEl.setAttribute("stroke", "#ffffff");
      pathEl.setAttribute("stroke-width", isSelected ? "1.4" : "0.6");
    };

    if (el.tagName.toLowerCase() === "path") {
      applyFill(el);
    } else {
      el.querySelectorAll("path").forEach(applyFill);
    }

    if (region) {
      const turnout = region.voters ? ((region.votes / region.voters) * 100) : 0;
      el.setAttribute("data-region-id", region.id);
      el.style.cursor = "pointer";
      const title = doc.createElementNS("http://www.w3.org/2000/svg", "title");
      title.textContent = `${region.name} · Явка: ${formatPercent.format(turnout)}%\nГолосов: ${number(region.votes)} · Бюллетеней: ${number(region.ballots)} · Исключено: ${number(region.removed_voters)}`;
      el.appendChild(title);
      el.addEventListener("click", () => {
        state.selectedRegionId = region.id;
        window.location.hash = route(region.id);
      });
    }
  });

  container.innerHTML = "";
  container.appendChild(svg);
}

function renderMapLegend() {
  return `
    <div class="map-legend-bar">
      <span class="map-legend-label">Явка ниже</span>
      <span class="map-legend-gradient"></span>
      <span class="map-legend-label">выше</span>
      <span class="map-legend-swatch" data-swatch="none"></span>
      <span class="map-legend-label">нет данных</span>
    </div>
  `;
}

function formatBucket(offset) {
  const [date, time] = dashboard.timeline.start.split(" ");
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const start = Date.UTC(year, month - 1, day, hour, minute);
  const stamp = new Date(start + offset * 60 * 1000);
  const pad = (value) => String(value).padStart(2, "0");
  return `${pad(stamp.getUTCDate())}.${pad(stamp.getUTCMonth() + 1)} ${pad(stamp.getUTCHours())}:${pad(
    stamp.getUTCMinutes(),
  )}`;
}

function summaryCard(label, value) {
  return `<div class="summary-card"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
}

function renderTopline(title, subtitle, breadcrumbs = "", subject = null) {
  const totals = dashboard.totals;
  const s = subject || totals;
  const voters = s.voters || 0;
  const ballots = s.ballots || 0;
  const votes = s.votes || 0;
  const removed = s.removed_voters || 0;
  const uiks = s.uiks || 0;
  const turnout = voters ? formatPercent.format((votes / voters) * 100) : "0%";
  const ballotToVoteRatio = ballots ? formatPercent.format((votes / ballots) * 100) : "0%";
  const rejectionRate = (voters + removed)
    ? formatPercent.format((removed / (voters + removed)) * 100)
    : "0%";

  const cards = [];
  if (!subject) {
    cards.push(summaryCard("Регионов", number(totals.regions)));
    cards.push(summaryCard("Округов", number(totals.districts)));
  } else if (subject.districtIds) {
    cards.push(summaryCard("Округов", number(subject.districtIds.length)));
  }
  cards.push(summaryCard("УИК", number(uiks)));
  cards.push(summaryCard("Избирателей", number(voters)));
  cards.push(summaryCard("Бюллетеней", number(ballots)));
  cards.push(summaryCard("Голосов", number(votes)));
  cards.push(summaryCard("Исключено из списков", number(removed)));
  cards.push(summaryCard("Доля исключений", rejectionRate));
  cards.push(summaryCard("Явка", turnout));
  cards.push(summaryCard("Бюллетени → Голоса", ballotToVoteRatio));

  return `
    <section class="topline">
      <div class="title-block">
        ${breadcrumbs}
        <h1>${escapeHtml(title)}</h1>
        <p class="meta">${escapeHtml(subtitle)}</p>
      </div>
      <div class="summary-grid">
        ${cards.join("")}
      </div>
    </section>
  `;
}

function renderToolbar(placeholder, total, shown) {
  return `
    <section class="toolbar" aria-label="Поиск">
      <input class="search" id="search" type="search" value="${escapeHtml(state.query)}" placeholder="${escapeHtml(
        placeholder,
      )}" />
      <button class="plain-button" type="button" id="clearSearch">Сбросить</button>
      <p class="count-note">${number(shown)} из ${number(total)}</p>
    </section>
  `;
}

function renderLegend(items) {
  return `
    <div class="legend">
      ${items
        .map(
          (item) =>
            `<span class="legend-item" style="color: ${item.color}"><span class="legend-swatch"></span>${escapeHtml(
              item.label,
            )}</span>`,
        )
        .join("")}
    </div>
  `;
}

function renderChartPanel({ id, title, meta, legend, wide = false }) {
  return `
    <section class="panel chart-panel ${wide ? "chart-panel-wide" : "chart-panel-compact"}">
      <div class="chart-head">
        <div>
          <h2>${escapeHtml(title)}</h2>
          <p class="meta">${escapeHtml(meta)}</p>
        </div>
        ${renderLegend(legend)}
      </div>
      ${renderChartControls(id)}
      <div class="chart-wrap ${wide ? "" : "chart-wrap-compact"}" id="${id}"></div>
      <p class="chart-hint">«Время» и «Значения» меняют масштаб осей, «Ширина» и «Высота» — растягивают сам график. Ctrl/⌘ + колесо — масштаб по времени вокруг курсора, перетаскивание мышью — сдвиг окна.</p>
    </section>
  `;
}

function renderChartControls(id) {
  const group = (label, buttons) => `
    <span class="control-group" role="group" aria-label="${escapeHtml(label)}">
      <span class="control-label">${escapeHtml(label)}</span>
      ${buttons
        .map(
          (button) => `
        <button
          class="icon-button"
          type="button"
          data-chart-action="${button.action}"
          title="${escapeHtml(button.title)}"
          aria-label="${escapeHtml(button.title)}"
        >${button.label}</button>`,
        )
        .join("")}
    </span>
  `;
  return `
    <div class="chart-controls" data-chart-controls="${escapeHtml(id)}">
      ${group("Время", [
        { action: "zoom-out", label: "−", title: "Показать больше времени" },
        { action: "zoom-in", label: "+", title: "Приблизить по времени" },
      ])}
      ${group("Значения", [
        { action: "value-out", label: "−", title: "Отдалить по значениям" },
        { action: "value-in", label: "+", title: "Приблизить по значениям" },
      ])}
      ${group("Ширина", [
        { action: "compress-x", label: "−", title: "Сжать по ширине" },
        { action: "stretch-x", label: "+", title: "Растянуть по ширине" },
      ])}
      ${group("Высота", [
        { action: "compress-y", label: "−", title: "Сжать по высоте" },
        { action: "stretch-y", label: "+", title: "Растянуть по высоте" },
      ])}
      <button class="plain-button chart-reset" type="button" data-chart-action="reset" title="Сбросить масштаб">Сброс</button>
      <span class="chart-status" data-chart-status></span>
    </div>
  `;
}

function renderChartSet(prefix, subjectLabel) {
  const safePrefix = escapeHtml(prefix);
  const label = escapeHtml(subjectLabel);
  return `
    <section class="charts-layout" aria-label="${label}">
      ${renderChartPanel({
        id: `${safePrefix}CumulativeChart`,
        title: "Накопительно",
        meta: `Бюллетени и голоса: ${subjectLabel}, шаг ${dashboard.bucketMinutes} минут.`,
        wide: true,
        legend: [
          { color: "var(--blue)", label: "Бюллетени" },
          { color: "var(--green)", label: "Голоса" },
        ],
      })}
      ${renderChartPanel({
        id: `${safePrefix}ActivityChart`,
        title: "Активность по времени",
        meta: `Сколько бюллетеней и голосов появилось в каждом ${dashboard.bucketMinutes}-минутном интервале.`,
        legend: [
          { color: "var(--blue)", label: "Бюллетени" },
          { color: "var(--green)", label: "Голоса" },
        ],
      })}
      ${renderChartPanel({
        id: `${safePrefix}AnomalyChart`,
        title: "Скачки и просадки",
        meta: "Отклонение выдачи бюллетеней от обычного 5-минутного темпа: 0 — около нормы, выше — всплеск, ниже — просадка.",
        legend: [
          { color: "var(--red)", label: "Всплеск" },
          { color: "var(--blue)", label: "Просадка" },
          { color: "var(--muted)", label: "Около нормы" },
        ],
      })}
      ${renderRemovedPanel(`${safePrefix}RemovedChart`, subjectLabel)}
    </section>
  `;
}

function renderRemovedPanel(id, subjectLabel) {
  return `
    <section class="panel chart-panel chart-panel-wide">
      <div class="chart-head">
        <div>
          <h2>Исключения из списков (отказы)</h2>
          <p class="meta">Накопительное число избирателей, исключённых из списков (удаления) для: ${escapeHtml(subjectLabel)}.</p>
        </div>
        ${renderLegend([{ color: "var(--red)", label: "Исключено накопительно" }])}
      </div>
      <div class="chart-wrap" id="${id}"></div>
      <p class="chart-hint">События типа «remove» из voter_list_events.csv — отказы и удаления из списков избирателей.</p>
    </section>
  `;
}

function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function activityWindow(points) {
  const firstActive = points.findIndex((point) => point.ballots > 0 || point.votes > 0);
  if (firstActive < 0) return points.slice(0, 1);
  const peak = Math.max(...points.map((point) => Math.max(point.ballots, point.votes)), 0);
  const threshold = Math.max(5, Math.ceil(peak * 0.01));
  const firstSignificant = points.findIndex((point) => point.ballots >= threshold || point.votes >= threshold);
  const first = firstSignificant >= 0 ? firstSignificant : firstActive;
  const last = points.findLastIndex((point) => point.ballots > 0 || point.votes > 0);
  return points.slice(first, last + 1);
}

function activeXBounds(series) {
  const points = seriesDeltas(series);
  const active = activityWindow(points);
  const start = active[0]?.offset ?? 0;
  const end = active.at(-1)?.offset ?? start;
  return {
    start,
    end: Math.max(end, start + (dashboard.bucketMinutes || 5)),
  };
}

function formatTimeRange(from, to) {
  return from === to ? formatBucket(from) : `${formatBucket(from)} → ${formatBucket(to)}`;
}

function deviationPoints(series) {
  const points = activityWindow(seriesDeltas(series));
  const activeBallots = points.filter((point) => point.ballots > 0).map((point) => point.ballots);
  const baseline = Math.max(1, median(activeBallots));
  return points.map((point) => ({
    ...point,
    baseline,
    deviation: (point.ballots - baseline) / baseline,
    ratio: point.ballots / baseline,
  }));
}

function analyzeSeries(series) {
  const points = deviationPoints(series);
  const active = points.filter((point) => point.ballots > 0);
  const last = series.at(-1) || [0, 0, 0];
  const finalBallots = last[1] || 0;
  const finalVotes = last[2] || 0;
  const baseline = points[0]?.baseline || 1;
  const findings = [];

  if (!active.length || finalBallots < 25) {
    return {
      level: "none",
      cardLabel: "Без явной",
      cardReason: "мало данных для устойчивого сигнала",
      summary: "Слишком мало активности, чтобы надежно выделять всплески или просадки.",
      findings: [],
      points,
    };
  }

  const peak = active.reduce((best, point) => (point.ballots > best.ballots ? point : best), active[0]);
  const spikeFloor = Math.max(12, baseline * 3);
  if (peak.ballots >= spikeFloor && peak.ratio >= 3) {
    const level = peak.ratio >= 6 || peak.ballots >= baseline * 6 ? "high" : "medium";
    findings.push({
      type: "spike",
      level,
      shortLabel: "всплеск",
      cardReason: `${formatBucket(peak.offset)} · ${formatDecimal.format(peak.ratio)}×`,
      text: `Резкий всплеск: ${number(peak.ballots)} бюллетеней за интервал ${formatBucket(
        peak.offset,
      )}, это в ${formatDecimal.format(peak.ratio)} раза выше обычного темпа (${number(Math.round(baseline))}).`,
    });
  }

  let bestDrop = null;
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    if (previous.ballots < Math.max(12, baseline * 2)) continue;
    const dropShare = (previous.ballots - current.ballots) / previous.ballots;
    if (dropShare <= 0) continue;
    if (!bestDrop || dropShare > bestDrop.dropShare) {
      bestDrop = { previous, current, dropShare };
    }
  }
  if (bestDrop && bestDrop.dropShare >= 0.7) {
    const level = bestDrop.dropShare >= 0.85 ? "high" : "medium";
    findings.push({
      type: "drop",
      level,
      shortLabel: "просадка",
      cardReason: `${formatTimeRange(bestDrop.previous.offset, bestDrop.current.offset)} · −${formatPercent.format(
        bestDrop.dropShare * 100,
      )}%`,
      text: `Резкая просадка: поток упал с ${number(bestDrop.previous.ballots)} до ${number(
        bestDrop.current.ballots,
      )} бюллетеней за соседние интервалы (${formatTimeRange(bestDrop.previous.offset, bestDrop.current.offset)}).`,
    });
  }

  const gap = finalBallots - finalVotes;
  const gapPct = finalBallots ? (gap / finalBallots) * 100 : 0;
  if (gap >= Math.max(50, finalBallots * 0.03) && gapPct >= 3) {
    const level = gapPct >= 8 || gap >= 1000 ? "high" : "medium";
    findings.push({
      type: "gap",
      level,
      shortLabel: "разрыв",
      cardReason: `${number(gap)} бюл. без голоса`,
      text: `Заметный разрыв между выданными бюллетенями и голосами: ${number(gap)} бюллетеней (${formatPercent.format(
        gapPct,
      )}% от выданных).`,
    });
  }

  const priority = { high: 2, medium: 1 };
  findings.sort((a, b) => (priority[b.level] || 0) - (priority[a.level] || 0));
  const level = findings.some((item) => item.level === "high") ? "high" : findings.length ? "medium" : "none";
  const primary = findings[0];

  if (!primary) {
    return {
      level,
      cardLabel: "Без явной",
      cardReason: "темп без крупных скачков",
      summary: "По текущей эвристике крупных всплесков, резких просадок или большого разрыва бюллетени/голоса не видно.",
      findings,
      points,
    };
  }

  return {
    level,
    cardLabel: `${level === "high" ? "Сильная" : "Есть"}: ${primary.shortLabel}`,
    cardReason: primary.cardReason,
    summary: primary.text,
    findings,
    points,
  };
}

function anomalyFor(item) {
  if (!item || !item.series) return analyzeSeries([]);
  if (!anomalyCache.has(item)) {
    anomalyCache.set(item, analyzeSeries(item.series));
  }
  return anomalyCache.get(item);
}

function renderAnomalyMark(item) {
  const anomaly = anomalyFor(item);
  return `
    <span class="anomaly-mark anomaly-${anomaly.level}">
      <span class="anomaly-label">${escapeHtml(anomaly.cardLabel)}</span>
      <span class="anomaly-reason">${escapeHtml(anomaly.cardReason)}</span>
    </span>
  `;
}

function renderAnomalySummary(item) {
  const anomaly = anomalyFor(item);
  const intro = anomaly.findings.length
    ? "Сработавшие сигналы ниже. Они сравнивают интервалы с обычным темпом для этой страницы."
    : anomaly.summary;
  return `
    <section class="panel anomaly-summary anomaly-summary-${anomaly.level}">
      <div class="anomaly-summary-head">
        <span class="anomaly-mark anomaly-${anomaly.level}">
          <span class="anomaly-label">${escapeHtml(anomaly.cardLabel)}</span>
          <span class="anomaly-reason">${escapeHtml(anomaly.cardReason)}</span>
        </span>
        <div>
          <h2>Что видно по аномалиям</h2>
          <p class="meta">${escapeHtml(intro)}</p>
        </div>
      </div>
      ${
        anomaly.findings.length
          ? `<ul class="anomaly-list">${anomaly.findings.map((finding) => `<li>${escapeHtml(finding.text)}</li>`).join("")}</ul>`
          : ""
      }
    </section>
  `;
}

function renderMiniStats(item, thirdLabel, thirdValue) {
  return `
    <dl class="mini-stats">
      <div><dt>Голоса</dt><dd>${number(item.votes)}</dd></div>
      <div><dt>Бюллетени</dt><dd>${number(item.ballots)}</dd></div>
      <div><dt>${escapeHtml(thirdLabel)}</dt><dd>${escapeHtml(thirdValue)}</dd></div>
    </dl>
  `;
}

function regionCard(region) {
  const districtCount = region.districtIds.length;
  return `
    <button class="entity-card" type="button" data-region-id="${region.id}" title="${escapeHtml(region.name)}">
      <span class="card-title">${escapeHtml(region.name)}</span>
      <span class="card-meta">${number(districtCount)} ${pluralRu(districtCount, "округ", "округа", "округов")} · явка ${percent(
        region.votes,
        region.voters,
      )} · исключено ${number(region.removed_voters)}</span>
      ${renderAnomalyMark(region)}
      ${renderMiniStats(region, "Избиратели", number(region.voters))}
    </button>
  `;
}

function districtCard(district, activeId) {
  const elections = district.elections.length ? district.elections.join(" · ") : "Кампания не указана";
  return `
    <button class="entity-card ${district.id === activeId ? "is-active" : ""}" type="button" data-district-id="${
      district.id
    }" title="${escapeHtml(district.name)}">
      <span class="card-title">${escapeHtml(district.name)}</span>
      <span class="card-meta">${escapeHtml(elections)} · явка ${percent(district.votes, district.voters)} · исключено ${number(district.removed_voters)}</span>
      ${renderAnomalyMark(district)}
      ${renderMiniStats(district, "Избиратели", number(district.voters))}
    </button>
  `;
}

function filterRegions() {
  const query = normalizeSearch(state.query);
  if (!query) return dashboard.regions;
  return dashboard.regions.filter((region) => region.name.toLocaleLowerCase("ru-RU").includes(query));
}

function filterDistricts(regionId) {
  const query = normalizeSearch(state.query);
  const districts = districtsByRegion.get(regionId) || [];
  if (!query) return districts;
  return districts.filter((district) => {
    const haystack = `${district.name} ${district.elections.join(" ")}`.toLocaleLowerCase("ru-RU");
    return haystack.includes(query);
  });
}

function mountSearch() {
  const input = document.querySelector("#search");
  const clear = document.querySelector("#clearSearch");
  if (!input || !clear) return;
  input.addEventListener("input", (event) => {
    state.query = event.target.value;
    render();
    const nextInput = document.querySelector("#search");
    nextInput?.focus();
    nextInput?.setSelectionRange(state.query.length, state.query.length);
  });
  clear.addEventListener("click", () => {
    state.query = "";
    render();
  });
}

function renderDetailedStats(item, title) {
  const voters = item.voters || 0;
  const ballots = item.ballots || 0;
  const votes = item.votes || 0;
  const removed = item.removed_voters || 0;
  const contracts = item.contracts || 0;
  const uiks = item.uiks || 0;
  
  const turnout = voters ? formatPercent.format((votes / voters) * 100) : "0%";
  const ballotToVote = ballots ? formatPercent.format((votes / ballots) * 100) : "0%";
  const rejectionRate = (voters + removed) ? formatPercent.format((removed / (voters + removed)) * 100) : "0%";
  const avgBallotsPerUik = uiks ? formatDecimal.format(ballots / uiks) : "0";
  const avgVotesPerUik = uiks ? formatDecimal.format(votes / uiks) : "0";
  
  // Calculate peak activity
  let peakBallots = 0;
  let peakTime = "";
  if (item.series && item.series.length > 1) {
    const deltas = seriesDeltas(item.series);
    const active = activityWindow(deltas);
    if (active.length) {
      const peak = active.reduce((best, p) => p.ballots > best.ballots ? p : best, active[0]);
      peakBallots = peak.ballots;
      peakTime = formatBucket(peak.offset);
    }
  }
  
  return `
    <section class="panel detailed-stats">
      <h2>${escapeHtml(title)}</h2>
      <div class="stats-grid">
        <div class="stat-group">
          <h3>Участие</h3>
          <dl>
            <dt>Явка</dt><dd>${turnout}</dd>
            <dt>Бюллетени → Голоса</dt><dd>${ballotToVote}</dd>
            <dt>Пиковая активность</dt><dd>${number(peakBallots)} бюл. (${peakTime})</dd>
          </dl>
        </div>
        <div class="stat-group">
          <h3>Списки избирателей</h3>
          <dl>
            <dt>В списках</dt><dd>${number(voters)}</dd>
            <dt>Исключено</dt><dd>${number(removed)} (${rejectionRate})</dd>
            <dt>Доля исключений</dt><dd>${rejectionRate}</dd>
          </dl>
        </div>
        <div class="stat-group">
          <h3>Инфраструктура</h3>
          <dl>
            <dt>Контрактов</dt><dd>${number(contracts)}</dd>
            <dt>УИК</dt><dd>${number(uiks)}</dd>
            <dt>Бюлл./УИК (ср.)</dt><dd>${avgBallotsPerUik}</dd>
            <dt>Голосов/УИК (ср.)</dt><dd>${avgVotesPerUik}</dd>
          </dl>
        </div>
        <div class="stat-group">
          <h3>Итоги</h3>
          <dl>
            <dt>Выдано бюллетеней</dt><dd>${number(ballots)}</dd>
            <dt>Проголосовало</dt><dd>${number(votes)}</dd>
            <dt>Бюллетени без голоса</dt><dd>${number(ballots - votes)}</dd>
          </dl>
        </div>
      </div>
    </section>
  `;
}

function renderHome() {
  const regions = filterRegions();

  app.innerHTML = `
    ${renderTopline(
      "Федеральный ДЭГ",
      `${dashboard.sourceArchive} · ${dashboard.timezone} · данные подготовлены ${dashboard.generatedAt}`,
      "",
    )}
    <section id="map-section" class="panel map-panel">
      <div class="map-header">
        <h2>Карта регионов России</h2>
        <p class="meta">Цвет — явка. Кликните по региону, чтобы открыть его статистику.</p>
      </div>
      <div id="map-container" class="map-container"></div>
      ${renderMapLegend()}
    </section>
    ${renderChartSet("main", "все регионы")}
    ${renderDetailedStats(dashboard.totals, "Общая статистика")}
    ${renderAnomalySummary(dashboard)}
    ${dashboard.anomalies.length ? `<section class="notice">${dashboard.anomalies.map(escapeHtml).join("<br />")}</section>` : ""}
    ${renderToolbar("Поиск по регионам", dashboard.regions.length, regions.length)}
    <section class="cards-grid" id="cards">
      ${regions.length ? regions.map(regionCard).join("") : '<div class="empty">Ничего не найдено</div>'}
    </section>
  `;

  renderMap(document.getElementById("map-container"));
  mountChartSet("main", dashboard.series);
  mountRemovedChart("mainRemovedChart", dashboard.removedSeries);
  mountSearch();
  document.querySelectorAll("[data-region-id]").forEach((card) => {
    card.addEventListener("click", () => {
      state.query = "";
      state.selectedRegionId = card.dataset.regionId;
      window.location.hash = route(card.dataset.regionId);
    });
  });
}

function renderRegion(regionId, districtId) {
  const region = regionsById.get(regionId);
  if (!region) {
    window.location.hash = route();
    return;
  }
  const districtCandidate = districtId ? districtsById.get(districtId) : null;
  const district = districtCandidate?.regionId === region.id ? districtCandidate : null;
  const districts = filterDistricts(regionId);
  const subject = district || region;
  const subjectLabel = district ? district.name : region.name;
  const breadcrumbs = `
    <nav class="breadcrumbs" aria-label="Навигация">
      <a href="${route()}">Все регионы</a>
      <span>/</span>
      ${district ? `<a href="${route(region.id)}">${escapeHtml(region.name)}</a>` : `<span>${escapeHtml(region.name)}</span>`}
      ${district ? `<span>/</span><span>${escapeHtml(district.name)}</span>` : ""}
    </nav>
  `;
  
  // Update selected region for map
  state.selectedRegionId = regionId;

  app.innerHTML = `
    ${renderTopline(
      district ? district.name : region.name,
      district
        ? `${region.name} · явка ${percent(district.votes, district.voters)} · избирателей ${number(district.voters)}`
        : `Округов: ${number(region.districtIds.length)} · явка ${percent(region.votes, region.voters)}`,
      breadcrumbs,
      subject,
    )}
    <section id="map-section" class="panel map-panel">
      <div class="map-header">
        <h2>Карта регионов России</h2>
        <p class="meta">Выбран: ${escapeHtml(region.name)}. Цвет — явка. Кликните по другому региону для перехода.</p>
      </div>
      <div id="map-container" class="map-container"></div>
      ${renderMapLegend()}
    </section>
    ${renderChartSet("subject", subjectLabel)}
    ${renderDetailedStats(subject, district ? `Округ: ${escapeHtml(district.name)}` : `Регион: ${escapeHtml(region.name)}`)}
    ${renderAnomalySummary(subject)}
    ${renderToolbar("Поиск по округам и кампаниям", region.districtIds.length, districts.length)}
    <section class="cards-grid">
      ${districts.length ? districts.map((item) => districtCard(item, district?.id)).join("") : '<div class="empty">Ничего не найдено</div>'}
    </section>
  `;
  
  renderMap(document.getElementById("map-container"), regionId);
  mountChartSet("subject", subject.series);
  mountRemovedChart("subjectRemovedChart", subject.removedSeries);
  mountSearch();
  document.querySelectorAll("[data-district-id]").forEach((card) => {
    card.addEventListener("click", () => {
      window.location.hash = route(region.id, card.dataset.districtId);
    });
  });
}

function render() {
  if (!dashboard) return;
  const parsed = parseRoute();
  if (parsed.regionId) {
    state.selectedRegionId = parsed.regionId;
    renderRegion(parsed.regionId, parsed.districtId);
  } else {
    state.selectedRegionId = null;
    renderHome();
  }
}

function scalePath(series, getY, chart) {
  return series
    .map((point, index) => {
      const command = index === 0 ? "M" : "L";
      return `${command}${chart.x(point[0]).toFixed(2)},${getY(point).toFixed(2)}`;
    })
    .join(" ");
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function niceStep(span, count = 4) {
  const rough = span / Math.max(1, count);
  if (!Number.isFinite(rough) || rough <= 0) return 1;
  const exponent = Math.floor(Math.log10(rough));
  const base = 10 ** exponent;
  const normalized = rough / base;
  const step = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return step * base;
}

function niceCeil(value, count = 4) {
  if (!Number.isFinite(value) || value <= 0) return 1;
  const step = niceStep(value, count);
  return Math.ceil(value / step) * step;
}

function valueTicks(min, max, count = 4) {
  const span = max - min;
  if (!(span > 0)) return [min];
  const step = niceStep(span, count);
  const ticks = [];
  for (let value = Math.ceil(min / step) * step; value <= max + step * 1e-6 && ticks.length < 24; value += step) {
    ticks.push(Number(value.toFixed(10)));
  }
  if (!ticks.length) ticks.push(min, max);
  return ticks;
}

const tickFormatters = new Map();

function formatTick(value, step) {
  const digits = step >= 1 ? 0 : Math.min(4, Math.ceil(-Math.log10(step)));
  let formatter = tickFormatters.get(digits);
  if (!formatter) {
    formatter = new Intl.NumberFormat("ru-RU", { minimumFractionDigits: digits, maximumFractionDigits: digits });
    tickFormatters.set(digits, formatter);
  }
  return formatter.format(value);
}

function tickStep(ticks, fallback) {
  return ticks.length > 1 ? Math.abs(ticks[1] - ticks[0]) : fallback;
}

function xTickList(start, span) {
  return [0, 0.25, 0.5, 0.75, 1].map((ratio) => ({
    value: start + span * ratio,
    anchor: ratio === 0 ? "start" : ratio === 1 ? "end" : "middle",
  }));
}

const chartViews = new Map();
const CHART_ZOOM_STEP = 1.4;
const CHART_Y_ZOOM_MIN = 0.25;
const CHART_Y_ZOOM_MAX = 40;
const CHART_STRETCH_STEP = 1.25;
const CHART_STRETCH_MIN = 0.25;
const CHART_STRETCH_MAX = 8;
const CHART_MIN_SPAN_BUCKETS = 3;

function chartKindOf(id) {
  if (id.endsWith("AnomalyChart")) return "anomaly";
  if (id.endsWith("ActivityChart")) return "activity";
  return "cumulative";
}

function chartView(id, series) {
  const base = activeXBounds(series);
  const full = {
    start: Math.min(series[0]?.[0] ?? base.start, base.start),
    end: Math.max(series.at(-1)?.[0] ?? base.end, base.end),
  };
  let view = chartViews.get(id);
  if (!view || view.series !== series) {
    view = {
      id,
      series,
      base,
      full,
      xStart: base.start,
      xEnd: base.end,
      yZoom: 1,
      stretchX: 1,
      stretchY: 1,
      scrollLeft: 0,
    };
    chartViews.set(id, view);
  }
  view.base = base;
  view.full = full;
  if (!(view.xEnd > view.xStart) || view.xStart < full.start || view.xEnd > full.end) {
    view.xStart = base.start;
    view.xEnd = base.end;
  }
  const { minSpan } = chartSpanLimits(view);
  if (view.xEnd - view.xStart < minSpan) {
    const center = (view.xStart + view.xEnd) / 2;
    view.xStart = center - minSpan / 2;
    view.xEnd = center + minSpan / 2;
  }
  return view;
}

function chartSpanLimits(view) {
  const bucket = dashboard.bucketMinutes || 5;
  const fullSpan = Math.max(view.full.end - view.full.start, bucket);
  const minSpan = Math.min(fullSpan, Math.max(bucket * CHART_MIN_SPAN_BUCKETS, fullSpan / 400));
  return { minSpan, maxSpan: fullSpan };
}

function setXWindow(view, start, end) {
  const { minSpan, maxSpan } = chartSpanLimits(view);
  const span = clamp(end - start, minSpan, maxSpan);
  let nextStart = clamp(start, view.full.start, view.full.end - span);
  if (!Number.isFinite(nextStart)) nextStart = view.full.start;
  view.xStart = nextStart;
  view.xEnd = nextStart + span;
}

function zoomXAt(view, factor, anchor) {
  const span = view.xEnd - view.xStart;
  const ratio = span > 0 ? clamp((anchor - view.xStart) / span, 0, 1) : 0.5;
  const nextSpan = span * factor;
  const nextStart = anchor - nextSpan * ratio;
  setXWindow(view, nextStart, nextStart + nextSpan);
}

function resetChartView(view) {
  view.xStart = view.base.start;
  view.xEnd = view.base.end;
  view.yZoom = 1;
  view.stretchX = 1;
  view.stretchY = 1;
  view.scrollLeft = 0;
}

function mountChartSet(prefix, series) {
  [`${prefix}CumulativeChart`, `${prefix}ActivityChart`, `${prefix}AnomalyChart`].forEach((id) => {
    chartView(id, series);
    mountChartById(id);
    mountChartControls(id);
  });
}

function mountRemovedChart(id, removedSeries) {
  const container = document.getElementById(id);
  if (!container) return;
  const series = removedSeries || [];
  if (series.length < 2) {
    renderEmptyChart(container, "Нет данных об исключениях из списков");
    return;
  }

  const width = 980;
  const height = 280;
  const margin = { top: 16, right: 24, bottom: 42, left: 72 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;
  const xStart = series[0][0];
  const xEnd = series[series.length - 1][0];
  const xSpan = Math.max(xEnd - xStart, dashboard.bucketMinutes || 5, 1);
  const yMax = niceCeil(Math.max(...series.map((p) => p[1]), 1));
  const chart = {
    x: (value) => margin.left + ((value - xStart) / xSpan) * innerWidth,
    y: (value) => margin.top + innerHeight - (value / yMax) * innerHeight,
  };
  const yTicks = valueTicks(0, yMax, 4);
  const yStep = tickStep(yTicks, yMax);
  const xTicks = xTickList(xStart, xSpan);
  const path = series
    .map((point, index) => `${index === 0 ? "M" : "L"}${chart.x(point[0]).toFixed(2)},${chart.y(point[1]).toFixed(2)}`)
    .join(" ");

  container.innerHTML = `
    <div class="chart-scroller">
      <svg class="chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="График исключений из списков">
        ${yTicks
          .map(
            (tick) => `
              <line class="grid-line" x1="${margin.left}" y1="${chart.y(tick)}" x2="${width - margin.right}" y2="${chart.y(tick)}"></line>
              <text class="tick-label" x="${margin.left - 10}" y="${chart.y(tick) + 4}" text-anchor="end">${formatTick(tick, yStep)}</text>
            `,
          )
          .join("")}
        ${xTicks
          .map(
            (tick) => `
              <line class="grid-line" x1="${chart.x(tick.value)}" y1="${margin.top}" x2="${chart.x(tick.value)}" y2="${height - margin.bottom}"></line>
              <text class="tick-label" x="${chart.x(tick.value)}" y="${height - 14}" text-anchor="${tick.anchor}">${formatBucket(Math.round(tick.value))}</text>
            `,
          )
          .join("")}
        <line class="axis-line" x1="${margin.left}" y1="${height - margin.bottom}" x2="${width - margin.right}" y2="${height - margin.bottom}"></line>
        <line class="axis-line" x1="${margin.left}" y1="${margin.top}" x2="${margin.left}" y2="${height - margin.bottom}"></line>
        <path class="series-removed" d="${path}"></path>
      </svg>
    </div>
    <div class="tooltip"></div>
  `;
  const svg = container.querySelector("svg");
  if (svg) {
    svg.style.width = "100%";
    svg.style.height = `${height}px`;
  }
}

const chartRenderers = {
  cumulative: (container, series) => mountChart(container, series),
  activity: (container, series) => mountActivityChart(container, series),
  anomaly: (container, series) => mountAnomalyChart(container, series),
};

function mountChartById(id) {
  const container = document.getElementById(id);
  const view = chartViews.get(id);
  if (!container || !view || !view.series) return;
  chartRenderers[chartKindOf(id)](container, view.series);
}

function mountChartControls(id) {
  const controls = document.querySelector(`[data-chart-controls="${id}"]`);
  if (!controls) return;
  controls.querySelectorAll("[data-chart-action]").forEach((button) => {
    button.addEventListener("click", () => applyChartAction(id, button.dataset.chartAction));
  });
  syncChartControls(id);
}

function applyChartAction(id, action) {
  const view = chartViews.get(id);
  if (!view) return;
  const anchor = (view.xStart + view.xEnd) / 2;
  if (action === "zoom-in" || action === "zoom-out") {
    zoomXAt(view, action === "zoom-in" ? 1 / CHART_ZOOM_STEP : CHART_ZOOM_STEP, anchor);
  } else if (action === "value-in") {
    view.yZoom = clamp(view.yZoom * CHART_ZOOM_STEP, CHART_Y_ZOOM_MIN, CHART_Y_ZOOM_MAX);
  } else if (action === "value-out") {
    view.yZoom = clamp(view.yZoom / CHART_ZOOM_STEP, CHART_Y_ZOOM_MIN, CHART_Y_ZOOM_MAX);
  } else if (action === "stretch-x") {
    view.stretchX = clamp(view.stretchX * CHART_STRETCH_STEP, CHART_STRETCH_MIN, CHART_STRETCH_MAX);
  } else if (action === "compress-x") {
    view.stretchX = clamp(view.stretchX / CHART_STRETCH_STEP, CHART_STRETCH_MIN, CHART_STRETCH_MAX);
  } else if (action === "stretch-y") {
    view.stretchY = clamp(view.stretchY * CHART_STRETCH_STEP, CHART_STRETCH_MIN, CHART_STRETCH_MAX);
  } else if (action === "compress-y") {
    view.stretchY = clamp(view.stretchY / CHART_STRETCH_STEP, CHART_STRETCH_MIN, CHART_STRETCH_MAX);
  } else {
    resetChartView(view);
  }
  mountChartById(id);
  syncChartControls(id);
}

function syncChartControls(id) {
  const view = chartViews.get(id);
  const controls = document.querySelector(`[data-chart-controls="${id}"]`);
  if (!view || !controls) return;
  const { minSpan, maxSpan } = chartSpanLimits(view);
  const span = view.xEnd - view.xStart;
  const limits = {
    "zoom-in": span <= minSpan * 1.001,
    "zoom-out": span >= maxSpan * 0.999,
    "value-in": view.yZoom >= CHART_Y_ZOOM_MAX,
    "value-out": view.yZoom <= CHART_Y_ZOOM_MIN,
    "stretch-x": view.stretchX >= CHART_STRETCH_MAX,
    "compress-x": view.stretchX <= CHART_STRETCH_MIN,
    "stretch-y": view.stretchY >= CHART_STRETCH_MAX,
    "compress-y": view.stretchY <= CHART_STRETCH_MIN,
  };
  controls.querySelectorAll("[data-chart-action]").forEach((button) => {
    button.disabled = Boolean(limits[button.dataset.chartAction]);
  });
  const status = controls.querySelector("[data-chart-status]");
  if (status) {
    status.textContent = `${formatBucket(Math.round(view.xStart))} → ${formatBucket(
      Math.round(view.xEnd),
    )} · значения ×${formatDecimal.format(view.yZoom)} · ширина ${Math.round(
      view.stretchX * 100,
    )}% · высота ${Math.round(view.stretchY * 100)}%`;
  }
}

function applyChartSizing(container, view, baseHeight) {
  const svg = container.querySelector("svg");
  const scroller = container.querySelector(".chart-scroller");
  if (!svg || !scroller) return;
  const height = Math.max(120, Math.round(baseHeight * view.stretchY));
  svg.style.width = `${(view.stretchX * 100).toFixed(2)}%`;
  svg.style.height = `${height}px`;
  scroller.style.height = `${height}px`;
  container.style.minHeight = `${height}px`;
  if (view.scrollLeft) scroller.scrollLeft = view.scrollLeft;
}

function renderEmptyChart(container, message) {
  container.style.minHeight = "";
  container.innerHTML = `<div class="empty">${escapeHtml(message)}</div>`;
}

function attachChartInteractions({ container, view, width, margin, innerWidth, xSpan, nearest, pointX, tooltipContent }) {
  const scroller = container.querySelector(".chart-scroller");
  const svg = container.querySelector("svg");
  const hitbox = container.querySelector(".chart-hitbox");
  const hoverLine = container.querySelector(".js-hover-line");
  const tooltip = container.querySelector(".tooltip");
  if (!scroller || !svg || !hitbox || !hoverLine || !tooltip) return;

  const offsetAtClientX = (clientX) => {
    const rect = svg.getBoundingClientRect();
    const svgX = ((clientX - rect.left) / Math.max(1, rect.width)) * width;
    return clamp(view.xStart + ((svgX - margin.left) / innerWidth) * xSpan, view.xStart, view.xEnd);
  };

  const hideHover = () => {
    hoverLine.style.opacity = 0;
    tooltip.style.display = "none";
  };

  const placeTooltip = (event, html) => {
    tooltip.innerHTML = html;
    tooltip.style.display = "block";
    const rect = scroller.getBoundingClientRect();
    const tipWidth = tooltip.offsetWidth || 220;
    const tipHeight = tooltip.offsetHeight || 80;
    const visibleX = event.clientX - rect.left;
    const visibleY = event.clientY - rect.top;
    tooltip.style.left = `${
      clamp(visibleX + 14, 8, Math.max(8, scroller.clientWidth - tipWidth - 8)) + scroller.scrollLeft
    }px`;
    tooltip.style.top = `${clamp(visibleY - 12, 8, Math.max(8, scroller.clientHeight - tipHeight - 8))}px`;
  };

  hitbox.addEventListener("mousemove", (event) => {
    const point = nearest(offsetAtClientX(event.clientX));
    if (!point) return;
    const x = pointX(point);
    hoverLine.setAttribute("x1", x);
    hoverLine.setAttribute("x2", x);
    hoverLine.style.opacity = 1;
    placeTooltip(event, tooltipContent(point));
  });

  hitbox.addEventListener("mouseleave", hideHover);

  hitbox.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    const rect = svg.getBoundingClientRect();
    const start = {
      clientX: event.clientX,
      window: { start: view.xStart, end: view.xEnd },
      unitsPerPixel: width / Math.max(1, rect.width),
      moved: false,
    };
    hideHover();
    event.preventDefault();
    container.classList.add("is-dragging");
    const onMove = (moveEvent) => {
      const dx = moveEvent.clientX - start.clientX;
      if (!start.moved && Math.abs(dx) < 3) return;
      start.moved = true;
      const span = start.window.end - start.window.start;
      const delta = -((dx * start.unitsPerPixel) / innerWidth) * span;
      setXWindow(view, start.window.start + delta, start.window.end + delta);
      mountChartById(view.id);
      syncChartControls(view.id);
    };
    const onUp = () => {
      container.classList.remove("is-dragging");
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  });

  scroller.addEventListener(
    "wheel",
    (event) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      const factor = Math.exp(event.deltaY * 0.002);
      zoomXAt(view, factor, offsetAtClientX(event.clientX));
      mountChartById(view.id);
      syncChartControls(view.id);
    },
    { passive: false },
  );

  scroller.addEventListener("scroll", () => {
    view.scrollLeft = scroller.scrollLeft;
  });
}

function seriesDeltas(series) {
  let previousBallots = 0;
  let previousVotes = 0;
  return series.map((point) => {
    const next = {
      offset: point[0],
      ballots: Math.max(0, point[1] - previousBallots),
      votes: Math.max(0, point[2] - previousVotes),
      cumulativeBallots: point[1],
      cumulativeVotes: point[2],
    };
    previousBallots = point[1];
    previousVotes = point[2];
    return next;
  });
}

function mountChart(container, series) {
  if (!container) return;
  const view = chartView(container.id, series);
  const width = 980;
  const height = 320;
  const margin = { top: 16, right: 24, bottom: 42, left: 72 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;
  const xSpan = Math.max(view.xEnd - view.xStart, dashboard.bucketMinutes || 5, 1);
  const visibleSeries = series.filter((point) => point[0] >= view.xStart && point[0] <= view.xEnd);
  if (series.length < 2) {
    renderEmptyChart(container, "Нет данных для графика");
    return;
  }
  if (visibleSeries.length < 2) {
    renderEmptyChart(container, "В выбранном интервале нет данных. Нажмите «Сброс».");
    return;
  }
  const yMax = niceCeil(Math.max(...visibleSeries.flatMap((point) => [point[1], point[2]]), 1) / view.yZoom);
  const chart = {
    x: (value) => margin.left + ((value - view.xStart) / xSpan) * innerWidth,
    y: (value) => margin.top + innerHeight - (value / yMax) * innerHeight,
  };
  const yTicks = valueTicks(0, yMax, 4);
  const yStep = tickStep(yTicks, yMax);
  const xTicks = xTickList(view.xStart, xSpan);
  const ballotsPath = scalePath(visibleSeries, (point) => chart.y(point[1]), chart);
  const votesPath = scalePath(visibleSeries, (point) => chart.y(point[2]), chart);

  container.innerHTML = `
    <div class="chart-scroller">
      <svg class="chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="График выданных бюллетеней и голосов">
        ${yTicks
          .map(
            (tick) => `
              <line class="grid-line" x1="${margin.left}" y1="${chart.y(tick)}" x2="${width - margin.right}" y2="${chart.y(tick)}"></line>
              <text class="tick-label" x="${margin.left - 10}" y="${chart.y(tick) + 4}" text-anchor="end">${formatTick(
                tick,
                yStep,
              )}</text>
            `,
          )
          .join("")}
        ${xTicks
          .map(
            (tick) => `
              <line class="grid-line" x1="${chart.x(tick.value)}" y1="${margin.top}" x2="${chart.x(tick.value)}" y2="${height - margin.bottom}"></line>
              <text class="tick-label" x="${chart.x(tick.value)}" y="${height - 14}" text-anchor="${tick.anchor}">${formatBucket(
                Math.round(tick.value),
              )}</text>
            `,
          )
          .join("")}
        <line class="axis-line" x1="${margin.left}" y1="${height - margin.bottom}" x2="${width - margin.right}" y2="${height - margin.bottom}"></line>
        <line class="axis-line" x1="${margin.left}" y1="${margin.top}" x2="${margin.left}" y2="${height - margin.bottom}"></line>
        <path class="series-ballots" d="${ballotsPath}"></path>
        <path class="series-votes" d="${votesPath}"></path>
        <line class="hover-line js-hover-line" x1="${margin.left}" y1="${margin.top}" x2="${margin.left}" y2="${height - margin.bottom}"></line>
        <rect class="chart-hitbox" x="${margin.left}" y="${margin.top}" width="${innerWidth}" height="${innerHeight}" fill="transparent"></rect>
      </svg>
    </div>
    <div class="tooltip"></div>
  `;

  applyChartSizing(container, view, height);

  attachChartInteractions({
    container,
    view,
    width,
    margin,
    innerWidth,
    xSpan,
    nearest: (offset) =>
      visibleSeries.reduce(
        (best, point) => (Math.abs(point[0] - offset) < Math.abs(best[0] - offset) ? point : best),
        visibleSeries[0],
      ),
    pointX: (point) => chart.x(point[0]),
    tooltipContent: (point) => `
      <strong>${formatBucket(point[0])}</strong><br>
      Бюллетени: ${number(point[1])}<br>
      Голоса: ${number(point[2])}
    `,
  });
}

function mountActivityChart(container, series) {
  if (!container) return;
  const view = chartView(container.id, series);
  const points = seriesDeltas(series);
  const width = 980;
  const height = 300;
  const margin = { top: 16, right: 24, bottom: 42, left: 72 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;
  const xSpan = Math.max(view.xEnd - view.xStart, dashboard.bucketMinutes || 5, 1);
  const visiblePoints = points.filter((point) => point.offset >= view.xStart && point.offset <= view.xEnd);
  if (points.length < 2) {
    renderEmptyChart(container, "Нет данных для графика");
    return;
  }
  if (visiblePoints.length < 2) {
    renderEmptyChart(container, "В выбранном интервале нет данных. Нажмите «Сброс».");
    return;
  }
  const yMax = niceCeil(Math.max(...visiblePoints.flatMap((point) => [point.ballots, point.votes]), 1) / view.yZoom);
  const chart = {
    x: (value) => margin.left + ((value - view.xStart) / xSpan) * innerWidth,
    y: (value) => margin.top + innerHeight - (value / yMax) * innerHeight,
  };
  const yTicks = valueTicks(0, yMax, 4);
  const yStep = tickStep(yTicks, yMax);
  const xTicks = xTickList(view.xStart, xSpan);
  const bucketCount = Math.max(1, Math.ceil(xSpan / (dashboard.bucketMinutes || 5)));
  const barWidth = Math.max(2, Math.min(18, (innerWidth / bucketCount) * 0.78));
  const votesPath = visiblePoints
    .map((point, index) => {
      const command = index === 0 ? "M" : "L";
      return `${command}${chart.x(point.offset).toFixed(2)},${chart.y(point.votes).toFixed(2)}`;
    })
    .join(" ");

  container.innerHTML = `
    <div class="chart-scroller">
      <svg class="chart chart-compact" viewBox="0 0 ${width} ${height}" role="img" aria-label="Гистограмма активности по времени">
        ${yTicks
          .map(
            (tick) => `
              <line class="grid-line" x1="${margin.left}" y1="${chart.y(tick)}" x2="${width - margin.right}" y2="${chart.y(tick)}"></line>
              <text class="tick-label" x="${margin.left - 10}" y="${chart.y(tick) + 4}" text-anchor="end">${formatTick(
                tick,
                yStep,
              )}</text>
            `,
          )
          .join("")}
        ${xTicks
          .map(
            (tick) => `
              <line class="grid-line" x1="${chart.x(tick.value)}" y1="${margin.top}" x2="${chart.x(tick.value)}" y2="${height - margin.bottom}"></line>
              <text class="tick-label" x="${chart.x(tick.value)}" y="${height - 14}" text-anchor="${tick.anchor}">${formatBucket(
                Math.round(tick.value),
              )}</text>
            `,
          )
          .join("")}
        <line class="axis-line" x1="${margin.left}" y1="${height - margin.bottom}" x2="${width - margin.right}" y2="${height - margin.bottom}"></line>
        <line class="axis-line" x1="${margin.left}" y1="${margin.top}" x2="${margin.left}" y2="${height - margin.bottom}"></line>
        ${visiblePoints
          .map((point) => {
            const x = chart.x(point.offset) - barWidth / 2;
            const y = chart.y(point.ballots);
            const barHeight = height - margin.bottom - y;
            return `<rect class="bar-ballots" x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${barWidth.toFixed(
              2,
            )}" height="${Math.max(0, barHeight).toFixed(2)}"></rect>`;
          })
          .join("")}
        <path class="series-votes series-activity-votes" d="${votesPath}"></path>
        <line class="hover-line js-hover-line" x1="${margin.left}" y1="${margin.top}" x2="${margin.left}" y2="${height - margin.bottom}"></line>
        <rect class="chart-hitbox" x="${margin.left}" y="${margin.top}" width="${innerWidth}" height="${innerHeight}" fill="transparent"></rect>
      </svg>
    </div>
    <div class="tooltip"></div>
  `;

  applyChartSizing(container, view, height);

  attachChartInteractions({
    container,
    view,
    width,
    margin,
    innerWidth,
    xSpan,
    nearest: (offset) =>
      visiblePoints.reduce(
        (best, point) => (Math.abs(point.offset - offset) < Math.abs(best.offset - offset) ? point : best),
        visiblePoints[0],
      ),
    pointX: (point) => chart.x(point.offset),
    tooltipContent: (point) => `
      <strong>${formatBucket(point.offset)}</strong><br>
      Бюллетени за интервал: ${number(point.ballots)}<br>
      Голоса за интервал: ${number(point.votes)}
    `,
  });
}

function mountAnomalyChart(container, series) {
  if (!container) return;
  const view = chartView(container.id, series);
  const allPoints = deviationPoints(series);
  const points = allPoints.filter((point) => point.offset >= view.xStart && point.offset <= view.xEnd);
  if (allPoints.length < 2) {
    renderEmptyChart(container, "Нет данных для графика");
    return;
  }
  if (points.length < 2) {
    renderEmptyChart(container, "В выбранном интервале нет данных. Нажмите «Сброс».");
    return;
  }
  const width = 980;
  const height = 300;
  const margin = { top: 16, right: 24, bottom: 42, left: 72 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;
  const xSpan = Math.max(view.xEnd - view.xStart, dashboard.bucketMinutes || 5, 1);
  const maxDeviation = Math.max(...points.map((point) => point.deviation), 1);
  const minDeviation = Math.min(...points.map((point) => point.deviation), 0);
  const yMax = niceCeil(Math.max(2, maxDeviation) / view.yZoom, 3);
  const yMin = -niceCeil(Math.max(1, Math.abs(minDeviation)) / view.yZoom, 3);
  const chart = {
    x: (value) => margin.left + ((value - view.xStart) / xSpan) * innerWidth,
    y: (value) => margin.top + ((yMax - value) / (yMax - yMin)) * innerHeight,
  };
  const yTicks = valueTicks(yMin, yMax, 4);
  const yStep = tickStep(yTicks, yMax - yMin);
  const xTicks = xTickList(view.xStart, xSpan);
  const bucketCount = Math.max(1, Math.ceil(xSpan / (dashboard.bucketMinutes || 5)));
  const barWidth = Math.max(2, Math.min(18, (innerWidth / bucketCount) * 0.78));
  const zeroY = chart.y(0);
  const thresholdLine = (value, label, className = "") => {
    if (value < yMin || value > yMax) return "";
    return `
      <line class="threshold-line ${className}" x1="${margin.left}" y1="${chart.y(value)}" x2="${width - margin.right}" y2="${chart.y(
        value,
      )}"></line>
      <text class="tick-label threshold-label" x="${width - margin.right - 4}" y="${chart.y(value) - 6}" text-anchor="end">${label}</text>
    `;
  };

  container.innerHTML = `
    <div class="chart-scroller">
      <svg class="chart chart-compact" viewBox="0 0 ${width} ${height}" role="img" aria-label="График скачков и просадок активности">
        ${yTicks
          .map(
            (tick) => `
              <line class="grid-line" x1="${margin.left}" y1="${chart.y(tick)}" x2="${width - margin.right}" y2="${chart.y(tick)}"></line>
              <text class="tick-label" x="${margin.left - 10}" y="${chart.y(tick) + 4}" text-anchor="end">${formatTick(
                tick,
                yStep,
              )}×</text>
            `,
          )
          .join("")}
        ${xTicks
          .map(
            (tick) => `
              <line class="grid-line" x1="${chart.x(tick.value)}" y1="${margin.top}" x2="${chart.x(tick.value)}" y2="${height - margin.bottom}"></line>
              <text class="tick-label" x="${chart.x(tick.value)}" y="${height - 14}" text-anchor="${tick.anchor}">${formatBucket(
                Math.round(tick.value),
              )}</text>
            `,
          )
          .join("")}
        <line class="zero-line" x1="${margin.left}" y1="${chart.y(0)}" x2="${width - margin.right}" y2="${chart.y(0)}"></line>
        ${thresholdLine(2, "всплеск +2×", "threshold-spike")}
        ${thresholdLine(-0.7, "просадка −0,7×", "threshold-drop")}
        <line class="axis-line" x1="${margin.left}" y1="${height - margin.bottom}" x2="${width - margin.right}" y2="${height - margin.bottom}"></line>
        <line class="axis-line" x1="${margin.left}" y1="${margin.top}" x2="${margin.left}" y2="${height - margin.bottom}"></line>
        ${points
          .map((point) => {
            const barY = chart.y(point.deviation);
            const className = point.deviation >= 2 ? "bar-spike" : point.deviation <= -0.7 ? "bar-drop" : "bar-normal";
            return `<rect class="deviation-bar ${className}" x="${(chart.x(point.offset) - barWidth / 2).toFixed(2)}" y="${Math.min(
              zeroY,
              barY,
            ).toFixed(2)}" width="${barWidth.toFixed(2)}" height="${Math.max(1, Math.abs(zeroY - barY)).toFixed(2)}"></rect>`;
          })
          .join("")}
        <line class="hover-line js-hover-line" x1="${margin.left}" y1="${margin.top}" x2="${margin.left}" y2="${height - margin.bottom}"></line>
        <rect class="chart-hitbox" x="${margin.left}" y="${margin.top}" width="${innerWidth}" height="${innerHeight}" fill="transparent"></rect>
      </svg>
    </div>
    <div class="tooltip"></div>
  `;

  applyChartSizing(container, view, height);

  attachChartInteractions({
    container,
    view,
    width,
    margin,
    innerWidth,
    xSpan,
    nearest: (offset) =>
      points.reduce((best, point) => (Math.abs(point.offset - offset) < Math.abs(best.offset - offset) ? point : best), points[0]),
    pointX: (point) => chart.x(point.offset),
    tooltipContent: (point) => {
      const relation =
        point.ratio >= 1
          ? `в ${formatDecimal.format(point.ratio)} раза от обычного`
          : `${formatPercent.format(point.ratio * 100)}% от обычного`;
      return `
        <strong>${formatBucket(point.offset)}</strong><br>
        Бюллетени за интервал: ${number(point.ballots)}<br>
        Обычный интервал: ${number(Math.round(point.baseline))}<br>
        Отклонение: ${formatSigned.format(point.deviation)}× (${relation})
      `;
    },
  });
}

async function boot() {
  const response = await fetch(DATA_URL);
  if (!response.ok) {
    throw new Error(`Не удалось загрузить ${DATA_URL}`);
  }
  dashboard = await response.json();
  regionsById = new Map(dashboard.regions.map((region) => [region.id, region]));
  districtsById = new Map(dashboard.districts.map((district) => [district.id, district]));
  districtsByRegion = dashboard.districts.reduce((map, district) => {
    const list = map.get(district.regionId) || [];
    list.push(district);
    map.set(district.regionId, list);
    return map;
  }, new Map());
  window.addEventListener("hashchange", render);
  render();
}

boot().catch((error) => {
  app.innerHTML = `<div class="empty">${escapeHtml(error.message)}</div>`;
});
