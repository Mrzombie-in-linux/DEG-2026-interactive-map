// Main Application Logic for Russia Interactive Election Map

let currentRegion = null;
let currentElection = null;
let svgMap = null;
let svgWrapper = null;
let currentZoom = 1;
let currentPanX = 0;
let currentPanY = 0;
let isPanning = false;
let lastPanX = 0;
let lastPanY = 0;
let feddegData = null;

const BUCKET_MINUTES = 5;

document.addEventListener('DOMContentLoaded', async () => {
    await loadElectionData();
    await loadFeddegData();
    await loadRegionDetails();
    await loadSVGMap();

    const closeButton = document.getElementById('sidebarClose');
    if (closeButton) {
        closeButton.addEventListener('click', closeSidebar);
    }
    const electionSelect = document.getElementById('electionSelect');
    if (electionSelect) {
        electionSelect.addEventListener('change', (event) => onElectionChange(event.target.value));
    }
});

async function loadFeddegData() {
    try {
        const response = await fetch('feddeg_dashboard.json');
        feddegData = await response.json();
        console.log('Loaded feddeg data for', feddegData.regions.length, 'regions');
    } catch (error) {
        console.error('Error loading feddeg data:', error);
    }
}

function getRegionSeries(regionId) {
    if (!feddegData) return null;
    const region = feddegData.regions.find(r => r.id === regionId);
    return region?.series || null;
}

function getRegionVoters(regionId) {
    if (!feddegData) return 0;
    const region = feddegData.regions.find(r => r.id === regionId);
    return region?.voters || 0;
}

function getRegionBallots(regionId) {
    if (!feddegData) return 0;
    const region = feddegData.regions.find(r => r.id === regionId);
    return region?.ballots || 0;
}

function getRegionVotes(regionId) {
    if (!feddegData) return 0;
    const region = feddegData.regions.find(r => r.id === regionId);
    return region?.votes || 0;
}

function getRegionRemoved(regionId) {
    if (!feddegData) return 0;
    const region = feddegData.regions.find(r => r.id === regionId);
    return region?.removed_voters || 0;
}

function getRegionRemovedSeries(regionId) {
    if (!feddegData) return null;
    const region = feddegData.regions.find(r => r.id === regionId);
    return region?.removedSeries || null;
}

function getRegionElections(regionId) {
    if (!feddegData) return [];
    const region = feddegData.regions.find(r => r.id === regionId);
    if (!region) return [];
    const districtIds = region.districtIds || [];
    const elections = new Set();
    districtIds.forEach(did => {
        const district = feddegData.districts.find(d => d.id === did);
        if (district?.elections) {
            district.elections.forEach(e => elections.add(e));
        }
    });
    return Array.from(elections).sort();
}

function getDistrictSeries(districtId) {
    if (!feddegData) return null;
    const district = feddegData.districts.find(d => d.id === districtId);
    return district?.series || null;
}

function getDistrictByRegionAndElection(regionId, electionName) {
    if (!feddegData) return null;
    const region = feddegData.regions.find(r => r.id === regionId);
    if (!region) return null;
    const districtIds = region.districtIds || [];
    for (const did of districtIds) {
        const district = feddegData.districts.find(d => d.id === did);
        if (district?.elections?.includes(electionName)) {
            return district;
        }
    }
    return null;
}

function openSidebar(regionId, regionName) {
    currentRegion = regionId;
    const sidebar = document.getElementById('sidebar');
    const title = document.getElementById('sidebarTitle');
    title.textContent = regionName;
    
    // Populate election selector
    const elections = getRegionElections(regionId);
    const select = document.getElementById('electionSelect');
    select.innerHTML = elections.map(e => `<option value="${escapeHtml(e)}">${escapeHtml(e)}</option>`).join('');
    
    // Select first election by default
    if (elections.length > 0) {
        currentElection = elections[0];
        select.value = currentElection;
    }
    
    sidebar.classList.add('open');
    renderSidebarCharts();
}

function closeSidebar() {
    document.getElementById('sidebar').classList.remove('open');
    currentRegion = null;
    currentElection = null;
}

function onElectionChange(electionName) {
    currentElection = electionName;
    renderSidebarCharts();
}

function renderSidebarCharts() {
    if (!currentRegion || !currentElection || !feddegData) return;
    
    const chartsContainer = document.getElementById('sidebarCharts');
    const region = feddegData.regions.find(r => r.id === currentRegion);
    if (!region) return;
    
    // Try to get district-specific series, fallback to region series
    const district = getDistrictByRegionAndElection(currentRegion, currentElection);
    const series = district?.series || region.series;
    const removedSeries = district?.removedSeries || region.removedSeries || null;
    if (!series) return;
    
    const timelineStart = feddegData.timeline?.start || '2026-09-17 22:00';
    const bucketMinutes = feddegData.bucketMinutes || 5;
    
    const view = { xStart: series[0][0], xEnd: series[series.length - 1][0], yZoom: 1, fullStart: series[0][0], fullEnd: series[series.length - 1][0] };
    
    chartsContainer.innerHTML = `
        <div class="chart-wrapper">
            <div class="chart-title">Накопительные бюллетени</div>
            <div id="chartCumulative" style="min-height:220px"></div>
        </div>
        <div class="chart-wrapper">
            <div class="chart-title">Активность по времени</div>
            <div id="chartActivity" style="min-height:220px"></div>
        </div>
        <div class="chart-wrapper">
            <div class="chart-title">Скачки и просадки</div>
            <div id="chartAnomaly" style="min-height:220px"></div>
        </div>
        <div class="chart-wrapper">
            <div class="chart-title">Исключения из списков</div>
            <div id="chartRemoved" style="min-height:220px"></div>
        </div>
    `;
    
    setTimeout(() => {
        mountChart(document.getElementById('chartCumulative'), series, bucketMinutes, timelineStart, view);
        mountActivityChart(document.getElementById('chartActivity'), series, bucketMinutes, timelineStart, view);
        mountAnomalyChart(document.getElementById('chartAnomaly'), series, bucketMinutes, timelineStart, view);
        mountRemovedChart(document.getElementById('chartRemoved'), removedSeries, bucketMinutes, timelineStart, view);
    }, 0);
}

async function loadSVGMap() {
    const mapContainer = document.getElementById('map');
    
    svgWrapper = document.createElement('div');
    svgWrapper.className = 'svg-wrapper';
    svgWrapper.style.width = '100%';
    svgWrapper.style.height = '100%';
    svgWrapper.style.overflow = 'hidden';
    svgWrapper.style.position = 'relative';
    svgWrapper.style.cursor = 'grab';
    mapContainer.appendChild(svgWrapper);
    
    const innerWrapper = document.createElement('div');
    innerWrapper.className = 'svg-inner';
    innerWrapper.style.transformOrigin = '0 0';
    innerWrapper.style.transition = 'transform 0.1s ease-out';
    svgWrapper.appendChild(innerWrapper);
    
    try {
        const response = await fetch('map.html');
        const html = await response.text();
        
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        const svg = doc.querySelector('svg');
        
        if (svg) {
            svgMap = svg.cloneNode(true);
            
            applyRegionColors();
            setupRegionEvents();
            setupZoomPan();
            
            svgMap.style.width = '100%';
            svgMap.style.height = '100%';
            svgMap.style.minHeight = '550px';
            svgMap.style.display = 'block';
            
            innerWrapper.appendChild(svgMap);
            
            fitMapToContainer();
        } else {
            console.error('SVG not found in source file');
            fallbackMap();
        }
    } catch (error) {
        console.error('Error loading SVG map:', error);
        fallbackMap();
    }
}

function fitMapToContainer() {
    if (!svgMap || !svgWrapper) return;
    
    const containerRect = svgWrapper.getBoundingClientRect();
    const svgRect = svgMap.getBoundingClientRect();
    
    const viewBox = svgMap.getAttribute('viewBox');
    if (!viewBox) return;
    
    const [, , vbWidth, vbHeight] = viewBox.split(' ').map(Number);
    
    const scaleX = containerRect.width / vbWidth;
    const scaleY = containerRect.height / vbHeight;
    const scale = Math.min(scaleX, scaleY) * 0.95;
    
    currentZoom = scale;
    currentPanX = (containerRect.width - vbWidth * scale) / 2;
    currentPanY = (containerRect.height - vbHeight * scale) / 2;
    
    updateTransform();
}

function updateTransform() {
    if (!svgMap) return;
    const innerWrapper = document.querySelector('.svg-inner');
    if (innerWrapper) {
        innerWrapper.style.transform = `translate(${currentPanX}px, ${currentPanY}px) scale(${currentZoom})`;
    }
}

function setupZoomPan() {
    const wrapper = svgWrapper;
    const innerWrapper = document.querySelector('.svg-inner');
    
    wrapper.addEventListener('wheel', (e) => {
        e.preventDefault();
        
        const rect = wrapper.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        
        const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
        const newZoom = Math.max(0.5, Math.min(5, currentZoom * zoomFactor));
        
        const zoomRatio = newZoom / currentZoom;
        currentPanX = mouseX - (mouseX - currentPanX) * zoomRatio;
        currentPanY = mouseY - (mouseY - currentPanY) * zoomRatio;
        currentZoom = newZoom;
        
        updateTransform();
    }, { passive: false });
    
    wrapper.addEventListener('mousedown', (e) => {
        if (e.target.closest('.region')) return;
        
        isPanning = true;
        lastPanX = e.clientX;
        lastPanY = e.clientY;
        wrapper.style.cursor = 'grabbing';
        e.preventDefault();
    });
    
    window.addEventListener('mousemove', (e) => {
        if (!isPanning) return;
        
        const dx = e.clientX - lastPanX;
        const dy = e.clientY - lastPanY;
        
        currentPanX += dx;
        currentPanY += dy;
        
        lastPanX = e.clientX;
        lastPanY = e.clientY;
        
        updateTransform();
    });
    
    window.addEventListener('mouseup', () => {
        if (isPanning) {
            isPanning = false;
            wrapper.style.cursor = 'grab';
        }
    });
    
    wrapper.addEventListener('dblclick', (e) => {
        if (e.target.closest('.region')) return;
        fitMapToContainer();
    });
    
    let lastTouchDistance = 0;
    let lastTouchCenter = { x: 0, y: 0 };
    
    wrapper.addEventListener('touchstart', (e) => {
        if (e.touches.length === 1) {
            lastPanX = e.touches[0].clientX;
            lastPanY = e.touches[0].clientY;
            isPanning = true;
        } else if (e.touches.length === 2) {
            isPanning = false;
            const touch1 = e.touches[0];
            const touch2 = e.touches[1];
            lastTouchDistance = Math.hypot(touch2.clientX - touch1.clientX, touch2.clientY - touch1.clientY);
            lastTouchCenter = {
                x: (touch1.clientX + touch2.clientX) / 2,
                y: (touch1.clientY + touch2.clientY) / 2
            };
        }
    }, { passive: false });
    
    wrapper.addEventListener('touchmove', (e) => {
        e.preventDefault();
        
        if (e.touches.length === 1 && isPanning) {
            const dx = e.touches[0].clientX - lastPanX;
            const dy = e.touches[0].clientY - lastPanY;
            
            currentPanX += dx;
            currentPanY += dy;
            
            lastPanX = e.touches[0].clientX;
            lastPanY = e.touches[0].clientY;
            
            updateTransform();
        } else if (e.touches.length === 2) {
            const touch1 = e.touches[0];
            const touch2 = e.touches[1];
            const currentDistance = Math.hypot(touch2.clientX - touch1.clientX, touch2.clientY - touch1.clientY);
            const currentCenter = {
                x: (touch1.clientX + touch2.clientX) / 2,
                y: (touch1.clientY + touch2.clientY) / 2
            };
            
            if (lastTouchDistance > 0) {
                const zoomFactor = currentDistance / lastTouchDistance;
                const newZoom = Math.max(0.5, Math.min(5, currentZoom * zoomFactor));
                
                const rect = wrapper.getBoundingClientRect();
                const mouseX = currentCenter.x - rect.left;
                const mouseY = currentCenter.y - rect.top;
                
                const zoomRatio = newZoom / currentZoom;
                currentPanX = mouseX - (mouseX - currentPanX) * zoomRatio;
                currentPanY = mouseY - (mouseY - currentPanY) * zoomRatio;
                currentZoom = newZoom;
                
                updateTransform();
            }
            
            lastTouchDistance = currentDistance;
            lastTouchCenter = currentCenter;
        }
    }, { passive: false });
    
    wrapper.addEventListener('touchend', () => {
        isPanning = false;
        lastTouchDistance = 0;
    });
}

function applyRegionColors() {
    if (!svgMap) return;
    
    const paths = svgMap.querySelectorAll('path[data-code], g[data-code] > path');
    
    paths.forEach(path => {
        const ruCode = path.getAttribute('data-code') || path.closest('[data-code]')?.getAttribute('data-code');
        if (!ruCode) return;
        
        const regionId = regionCodeMap[ruCode];
        if (!regionId) return;
        
        const color = getRegionColor(regionId);
        
        path.setAttribute('fill', color);
        path.setAttribute('class', 'region');
        path.setAttribute('data-region-id', regionId);
        path.setAttribute('data-region-name', regionNames[regionId] || ruCode);
        path.setAttribute('data-region-type', regionTypes[regionId] || 'oblast');
        path.setAttribute('data-ru-code', ruCode);
        
        const group = path.closest('g[data-code]');
        if (group) {
            group.setAttribute('data-region-id', regionId);
            group.setAttribute('data-region-name', regionNames[regionId] || ruCode);
            group.setAttribute('data-region-type', regionTypes[regionId] || 'oblast');
            group.setAttribute('data-ru-code', ruCode);
        }
    });
}

function setupRegionEvents() {
    if (!svgMap) return;
    
    const regions = svgMap.querySelectorAll('.region, g[data-region-id] > path');
    const tooltip = document.getElementById('tooltip');
    
    regions.forEach(el => {
        const regionId = el.getAttribute('data-region-id');
        if (!regionId) return;
        
        const regionName = regionNames[regionId] || regionId;
        const regionType = regionTypes[regionId] || 'oblast';
        const ruCode = el.getAttribute('data-ru-code');
        
        el.addEventListener('mouseenter', (e) => showTooltip(e, regionId, regionName, regionType, ruCode));
        el.addEventListener('mousemove', (e) => moveTooltip(e));
        el.addEventListener('mouseleave', (e) => {
            if (!tooltip.contains(e.relatedTarget)) {
                hideTooltip();
            }
        });
        el.addEventListener('click', () => openSidebar(regionId, regionName));
    });
    
    tooltip.addEventListener('mouseleave', (e) => {
        if (!e.relatedTarget || !e.relatedTarget.closest('.region')) {
            hideTooltip();
        }
    });
}

function showTooltip(event, regionId, regionName, regionType, ruCode) {
    const tooltip = document.getElementById('tooltip');
    const data = electionData[regionId];
    
    // region-details.json uses codes without RU- prefix
    const detailCode = ruCode.replace('RU-', '');
    const details = getRegionDetails(detailCode);
    
    const assetsPath = 'Интерактивная карта Российской Федерации_files/';
    const flagPath = details?.flag || `${assetsPath}RU-${detailCode}.png`;
    const coatOfArmsPath = details?.coat_of_arms || `${assetsPath}RU-${detailCode}(1).png`;
    
    let html = `
        <div class="tooltip-header">
            <strong>${escapeHtml(regionName)}</strong>
            <span class="region-type">${getTypeLabel(regionType)}</span>
        </div>
        <div class="tooltip-symbols">
            <div class="symbol">
                <img src="${flagPath}" alt="Флаг" class="symbol-img" onerror="this.style.display='none'">
                <span class="symbol-label">Флаг</span>
            </div>
            <div class="symbol">
                <img src="${coatOfArmsPath}" alt="Герб" class="symbol-img" onerror="this.style.display='none'">
                <span class="symbol-label">Герб</span>
            </div>
        </div>
    `;
    
    // Region details: peoples, languages, education
    if (details) {
        if (details.peoples) {
            html += `<div class="tooltip-section"><div class="section-title">Народы</div><div class="section-text">${escapeHtml(details.peoples)}</div></div>`;
        }
        if (details.languages) {
            html += `<div class="tooltip-section"><div class="section-title">Языки</div><div class="section-text">${escapeHtml(details.languages)}</div></div>`;
        }
        if (details.education_languages) {
            html += `<div class="tooltip-section"><div class="section-title">Языки в образовании</div><div class="section-text">${escapeHtml(details.education_languages)}</div></div>`;
        }
    }
    
    // Election stats from feddeg data
    const feddegBallots = getRegionBallots(regionId);
    const feddegVotes = getRegionVotes(regionId);
    const feddegVoters = getRegionVoters(regionId);
    const feddegRemoved = getRegionRemoved(regionId);
    const turnout = feddegVoters > 0 ? (feddegVotes / feddegVoters * 100).toFixed(1) : '—';
    
    html += `
    <div class="tooltip-stats">
        <div class="stat-row"><span>Бюллетени:</span><span>${number(feddegBallots)}</span></div>
        <div class="stat-row"><span>Голоса:</span><span>${number(feddegVotes)}</span></div>
        <div class="stat-row"><span>Избирателей:</span><span>${number(feddegVoters)}</span></div>
        <div class="stat-row"><span>Исключено из списков:</span><span>${number(feddegRemoved)}</span></div>
        <div class="stat-row"><span>Явка:</span><span>${turnout}%</span></div>
    </div>
    `;
    
    // Cultural links
    if (details && details.links && details.links.length > 0) {
        html += `<div class="tooltip-section"><div class="section-title">Культурные объекты</div>`;
        details.links.slice(0, 5).forEach(link => {
            html += `<div class="link-item"><a href="${escapeHtml(link.url)}" target="_blank">${escapeHtml(link.text)}</a></div>`;
        });
        if (details.links.length > 5) {
            html += `<div class="link-item"><em>и ещё ${details.links.length - 5}...</em></div>`;
        }
        html += `</div>`;
    }
    
    // Gallery
    if (details && details.gallery && details.gallery.length > 0) {
        html += `<div class="tooltip-section"><div class="section-title">Галерея</div><div class="gallery-grid">`;
        details.gallery.slice(0, 6).forEach(img => {
            html += `<img src="${escapeHtml(img)}" alt="Галерея" class="gallery-img" onerror="this.style.display='none'" loading="lazy">`;
        });
        html += `</div></div>`;
    }
    
    html += `<div class="tooltip-hint">Кликните для графиков</div>`;
    
    tooltip.innerHTML = html;
    tooltip.classList.add('visible');
    moveTooltip(event);
}

// ===== Custom SVG Charts (from feddeg dashboard) =====

const formatNumber = new Intl.NumberFormat('ru-RU');
const formatPercent = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 });
const formatDecimal = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 });
const formatSigned = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1, signDisplay: 'exceptZero' });

function number(value) { return formatNumber.format(value || 0); }
function escapeHtml(value) { return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;'); }

function formatBucket(offset, timelineStart) {
    const [date, time] = timelineStart.split(' ');
    const [year, month, day] = date.split('-').map(Number);
    const [hour, minute] = time.split(':').map(Number);
    const start = Date.UTC(year, month - 1, day, hour, minute);
    const stamp = new Date(start + offset * 60 * 1000);
    const pad = (v) => String(v).padStart(2, '0');
    return `${pad(stamp.getUTCDate())}.${pad(stamp.getUTCMonth() + 1)} ${pad(stamp.getUTCHours())}:${pad(stamp.getUTCMinutes())}`;
}

function median(values) {
    if (!values.length) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function seriesDeltas(series) {
    let pb = 0, pv = 0;
    return series.map(p => {
        const next = { offset: p[0], ballots: Math.max(0, p[1] - pb), votes: Math.max(0, p[2] - pv), cumulativeBallots: p[1], cumulativeVotes: p[2] };
        pb = p[1]; pv = p[2];
        return next;
    });
}

function activityWindow(points) {
    const firstActive = points.findIndex(p => p.ballots > 0 || p.votes > 0);
    if (firstActive < 0) return points.slice(0, 1);
    const peak = Math.max(...points.map(p => Math.max(p.ballots, p.votes)), 0);
    const threshold = Math.max(5, Math.ceil(peak * 0.01));
    const firstSig = points.findIndex(p => p.ballots >= threshold || p.votes >= threshold);
    const first = firstSig >= 0 ? firstSig : firstActive;
    const last = points.findLastIndex(p => p.ballots > 0 || p.votes > 0);
    return points.slice(first, last + 1);
}

function deviationPoints(series) {
    const points = activityWindow(seriesDeltas(series));
    const activeBallots = points.filter(p => p.ballots > 0).map(p => p.ballots);
    const baseline = Math.max(1, median(activeBallots));
    return points.map(p => ({ ...p, baseline, deviation: (p.ballots - baseline) / baseline, ratio: p.ballots / baseline }));
}

function niceStep(span, count = 4) {
    const rough = span / Math.max(1, count);
    if (!Number.isFinite(rough) || rough <= 0) return 1;
    const exp = Math.floor(Math.log10(rough));
    const base = 10 ** exp;
    const norm = rough / base;
    const step = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10;
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
    for (let v = Math.ceil(min / step) * step; v <= max + step * 1e-6 && ticks.length < 24; v += step) {
        ticks.push(Number(v.toFixed(10)));
    }
    return ticks.length ? ticks : [min, max];
}

function formatTick(value, step) {
    const digits = step >= 1 ? 0 : Math.min(4, Math.ceil(-Math.log10(step)));
    return new Intl.NumberFormat('ru-RU', { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);
}

function xTickList(start, span) {
    return [0, 0.25, 0.5, 0.75, 1].map(ratio => ({ value: start + span * ratio, anchor: ratio === 0 ? 'start' : ratio === 1 ? 'end' : 'middle' }));
}

function scalePath(series, getY, chart) {
    return series.map((p, i) => `${i === 0 ? 'M' : 'L'}${chart.x(p[0]).toFixed(2)},${getY(p).toFixed(2)}`).join(' ');
}

function clamp(v, min, max) { return Math.min(Math.max(v, min), max); }

function mountChart(container, series, bucketMinutes, timelineStart, view) {
    if (!container || series.length < 2) return;
    const width = 980, height = 320;
    const margin = { top: 16, right: 24, bottom: 42, left: 72 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;
    const xSpan = Math.max(view.xEnd - view.xStart, bucketMinutes, 1);
    const visible = series.filter(p => p[0] >= view.xStart && p[0] <= view.xEnd);
    if (visible.length < 2) return;
    const yMax = niceCeil(Math.max(...visible.flatMap(p => [p[1], p[2]]), 1) / view.yZoom);
    const chart = { x: v => margin.left + ((v - view.xStart) / xSpan) * innerWidth, y: v => margin.top + innerHeight - (v / yMax) * innerHeight };
    const yTicks = valueTicks(0, yMax, 4);
    const yStep = yTicks.length > 1 ? yTicks[1] - yTicks[0] : yMax;
    const xTicks = xTickList(view.xStart, xSpan);
    const ballotsPath = scalePath(visible, p => chart.y(p[1]), chart);
    const votesPath = scalePath(visible, p => chart.y(p[2]), chart);

    container.innerHTML = `
        <div class="chart-scroller" style="overflow-x:auto;height:${height}px">
            <svg class="chart" viewBox="0 0 ${width} ${height}" role="img" style="width:${width}px;height:${height}px">
                ${yTicks.map(t => `<line class="grid-line" x1="${margin.left}" y1="${chart.y(t)}" x2="${width - margin.right}" y2="${chart.y(t)}" style="stroke:rgba(255,255,255,0.05)"/><text class="tick-label" x="${margin.left - 10}" y="${chart.y(t) + 4}" text-anchor="end" style="fill:#666;font-size:10px">${formatTick(t, yStep)}</text>`).join('')}
                ${xTicks.map(t => `<line class="grid-line" x1="${chart.x(t.value)}" y1="${margin.top}" x2="${chart.x(t.value)}" y2="${height - margin.bottom}" style="stroke:rgba(255,255,255,0.05)"/><text class="tick-label" x="${chart.x(t.value)}" y="${height - 14}" text-anchor="${t.anchor}" style="fill:#666;font-size:10px">${formatBucket(Math.round(t.value), timelineStart)}</text>`).join('')}
                <line class="axis-line" x1="${margin.left}" y1="${height - margin.bottom}" x2="${width - margin.right}" y2="${height - margin.bottom}" style="stroke:#444"/>
                <line class="axis-line" x1="${margin.left}" y1="${margin.top}" x2="${margin.left}" y2="${height - margin.bottom}" style="stroke:#444"/>
                <path class="series-ballots" d="${ballotsPath}" style="fill:none;stroke:var(--blue);stroke-width:2"/>
                <path class="series-votes" d="${votesPath}" style="fill:none;stroke:var(--green);stroke-width:2"/>
                <line class="hover-line" x1="${margin.left}" y1="${margin.top}" x2="${margin.left}" y2="${height - margin.bottom}" style="stroke:#fff;stroke-dasharray:4,4;opacity:0;pointer-events:none"/>
                <rect class="chart-hitbox" x="${margin.left}" y="${margin.top}" width="${innerWidth}" height="${innerHeight}" fill="transparent" style="cursor:crosshair"/>
            </svg>
        </div>
        <div class="tooltip" style="position:absolute;background:rgba(21,20,25,0.95);color:#fff;padding:8px;border-radius:6px;font-size:12px;pointer-events:none;display:none;z-index:100;border:1px solid rgba(255,255,255,0.1)"></div>
    `;

    attachChartInteractions({ container, view, width, margin, innerWidth, xSpan, nearest: o => visible.reduce((b, p) => Math.abs(p[0] - o) < Math.abs(b[0] - o) ? p : b, visible[0]), pointX: p => chart.x(p[0]), tooltipContent: p => `<strong>${formatBucket(p[0], timelineStart)}</strong><br>Бюллетени: ${number(p[1])}<br>Голоса: ${number(p[2])}` });
}

function mountActivityChart(container, series, bucketMinutes, timelineStart, view) {
    if (!container || series.length < 2) return;
    const points = seriesDeltas(series);
    const width = 980, height = 300;
    const margin = { top: 16, right: 24, bottom: 42, left: 72 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;
    const xSpan = Math.max(view.xEnd - view.xStart, bucketMinutes, 1);
    const visible = points.filter(p => p.offset >= view.xStart && p.offset <= view.xEnd);
    if (visible.length < 2) return;
    const yMax = niceCeil(Math.max(...visible.flatMap(p => [p.ballots, p.votes]), 1) / view.yZoom);
    const chart = { x: v => margin.left + ((v - view.xStart) / xSpan) * innerWidth, y: v => margin.top + innerHeight - (v / yMax) * innerHeight };
    const yTicks = valueTicks(0, yMax, 4);
    const yStep = yTicks.length > 1 ? yTicks[1] - yTicks[0] : yMax;
    const xTicks = xTickList(view.xStart, xSpan);
    const bucketCount = Math.max(1, Math.ceil(xSpan / bucketMinutes));
    const barWidth = Math.max(2, Math.min(18, (innerWidth / bucketCount) * 0.78));
    const votesPath = visible.map((p, i) => `${i === 0 ? 'M' : 'L'}${chart.x(p.offset).toFixed(2)},${chart.y(p.votes).toFixed(2)}`).join(' ');

    container.innerHTML = `
        <div class="chart-scroller" style="overflow-x:auto;height:${height}px">
            <svg class="chart" viewBox="0 0 ${width} ${height}" role="img" style="width:${width}px;height:${height}px">
                ${yTicks.map(t => `<line class="grid-line" x1="${margin.left}" y1="${chart.y(t)}" x2="${width - margin.right}" y2="${chart.y(t)}" style="stroke:rgba(255,255,255,0.05)"/><text class="tick-label" x="${margin.left - 10}" y="${chart.y(t) + 4}" text-anchor="end" style="fill:#666;font-size:10px">${formatTick(t, yStep)}</text>`).join('')}
                ${xTicks.map(t => `<line class="grid-line" x1="${chart.x(t.value)}" y1="${margin.top}" x2="${chart.x(t.value)}" y2="${height - margin.bottom}" style="stroke:rgba(255,255,255,0.05)"/><text class="tick-label" x="${chart.x(t.value)}" y="${height - 14}" text-anchor="${t.anchor}" style="fill:#666;font-size:10px">${formatBucket(Math.round(t.value), timelineStart)}</text>`).join('')}
                <line class="axis-line" x1="${margin.left}" y1="${height - margin.bottom}" x2="${width - margin.right}" y2="${height - margin.bottom}" style="stroke:#444"/>
                <line class="axis-line" x1="${margin.left}" y1="${margin.top}" x2="${margin.left}" y2="${height - margin.bottom}" style="stroke:#444"/>
                ${visible.map(p => `<rect class="bar-ballots" x="${(chart.x(p.offset) - barWidth/2).toFixed(2)}" y="${chart.y(p.ballots).toFixed(2)}" width="${barWidth.toFixed(2)}" height="${Math.max(0, height - margin.bottom - chart.y(p.ballots)).toFixed(2)}" style="fill:rgba(66,133,244,0.6)"/>`).join('')}
                <path class="series-votes" d="${votesPath}" style="fill:none;stroke:var(--green);stroke-width:2"/>
                <line class="hover-line" x1="${margin.left}" y1="${margin.top}" x2="${margin.left}" y2="${height - margin.bottom}" style="stroke:#fff;stroke-dasharray:4,4;opacity:0;pointer-events:none"/>
                <rect class="chart-hitbox" x="${margin.left}" y="${margin.top}" width="${innerWidth}" height="${innerHeight}" fill="transparent" style="cursor:crosshair"/>
            </svg>
        </div>
        <div class="tooltip" style="position:absolute;background:rgba(21,20,25,0.95);color:#fff;padding:8px;border-radius:6px;font-size:12px;pointer-events:none;display:none;z-index:100;border:1px solid rgba(255,255,255,0.1)"></div>
    `;

    attachChartInteractions({ container, view, width, margin, innerWidth, xSpan, nearest: o => visible.reduce((b, p) => Math.abs(p.offset - o) < Math.abs(b.offset - o) ? p : b, visible[0]), pointX: p => chart.x(p.offset), tooltipContent: p => `<strong>${formatBucket(p.offset, timelineStart)}</strong><br>Бюллетени за интервал: ${number(p.ballots)}<br>Голоса за интервал: ${number(p.votes)}` });
}

function mountAnomalyChart(container, series, bucketMinutes, timelineStart, view) {
    if (!container || series.length < 2) return;
    const allPoints = deviationPoints(series);
    const points = allPoints.filter(p => p.offset >= view.xStart && p.offset <= view.xEnd);
    if (points.length < 2) return;
    const width = 980, height = 300;
    const margin = { top: 16, right: 24, bottom: 42, left: 72 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;
    const xSpan = Math.max(view.xEnd - view.xStart, bucketMinutes, 1);
    const maxDev = Math.max(...points.map(p => p.deviation), 1);
    const minDev = Math.min(...points.map(p => p.deviation), 0);
    const yMax = niceCeil(Math.max(2, maxDev) / view.yZoom, 3);
    const yMin = -niceCeil(Math.max(1, Math.abs(minDev)) / view.yZoom, 3);
    const chart = { x: v => margin.left + ((v - view.xStart) / xSpan) * innerWidth, y: v => margin.top + ((yMax - v) / (yMax - yMin)) * innerHeight };
    const yTicks = valueTicks(yMin, yMax, 4);
    const yStep = yTicks.length > 1 ? yTicks[1] - yTicks[0] : yMax - yMin;
    const xTicks = xTickList(view.xStart, xSpan);
    const bucketCount = Math.max(1, Math.ceil(xSpan / bucketMinutes));
    const barWidth = Math.max(2, Math.min(18, (innerWidth / bucketCount) * 0.78));
    const zeroY = chart.y(0);

    container.innerHTML = `
        <div class="chart-scroller" style="overflow-x:auto;height:${height}px">
            <svg class="chart" viewBox="0 0 ${width} ${height}" role="img" style="width:${width}px;height:${height}px">
                ${yTicks.map(t => `<line class="grid-line" x1="${margin.left}" y1="${chart.y(t)}" x2="${width - margin.right}" y2="${chart.y(t)}" style="stroke:rgba(255,255,255,0.05)"/><text class="tick-label" x="${margin.left - 10}" y="${chart.y(t) + 4}" text-anchor="end" style="fill:#666;font-size:10px">${formatTick(t, yStep)}×</text>`).join('')}
                ${xTicks.map(t => `<line class="grid-line" x1="${chart.x(t.value)}" y1="${margin.top}" x2="${chart.x(t.value)}" y2="${height - margin.bottom}" style="stroke:rgba(255,255,255,0.05)"/><text class="tick-label" x="${chart.x(t.value)}" y="${height - 14}" text-anchor="${t.anchor}" style="fill:#666;font-size:10px">${formatBucket(Math.round(t.value), timelineStart)}</text>`).join('')}
                <line class="zero-line" x1="${margin.left}" y1="${zeroY}" x2="${width - margin.right}" y2="${zeroY}" style="stroke:#fff;stroke-width:2"/>
                <line class="threshold-line" x1="${margin.left}" y1="${chart.y(2)}" x2="${width - margin.right}" y2="${chart.y(2)}" style="stroke:var(--red);stroke-dasharray:4,4"/>
                <line class="threshold-line" x1="${margin.left}" y1="${chart.y(-0.7)}" x2="${width - margin.right}" y2="${chart.y(-0.7)}" style="stroke:var(--blue);stroke-dasharray:4,4"/>
                <line class="axis-line" x1="${margin.left}" y1="${height - margin.bottom}" x2="${width - margin.right}" y2="${height - margin.bottom}" style="stroke:#444"/>
                <line class="axis-line" x1="${margin.left}" y1="${margin.top}" x2="${margin.left}" y2="${height - margin.bottom}" style="stroke:#444"/>
                ${points.map(p => { const barY = chart.y(p.deviation); const cls = p.deviation >= 2 ? 'bar-spike' : p.deviation <= -0.7 ? 'bar-drop' : 'bar-normal'; return `<rect class="deviation-bar ${cls}" x="${(chart.x(p.offset) - barWidth/2).toFixed(2)}" y="${Math.min(zeroY, barY).toFixed(2)}" width="${barWidth.toFixed(2)}" height="${Math.max(1, Math.abs(zeroY - barY)).toFixed(2)}" style="fill:${p.deviation >= 2 ? 'var(--red)' : p.deviation <= -0.7 ? 'var(--blue)' : 'rgba(128,128,128,0.5)'}"/>`; }).join('')}
                <line class="hover-line" x1="${margin.left}" y1="${margin.top}" x2="${margin.left}" y2="${height - margin.bottom}" style="stroke:#fff;stroke-dasharray:4,4;opacity:0;pointer-events:none"/>
                <rect class="chart-hitbox" x="${margin.left}" y="${margin.top}" width="${innerWidth}" height="${innerHeight}" fill="transparent" style="cursor:crosshair"/>
            </svg>
        </div>
        <div class="tooltip" style="position:absolute;background:rgba(21,20,25,0.95);color:#fff;padding:8px;border-radius:6px;font-size:12px;pointer-events:none;display:none;z-index:100;border:1px solid rgba(255,255,255,0.1)"></div>
    `;

    attachChartInteractions({ container, view, width, margin, innerWidth, xSpan, nearest: o => points.reduce((b, p) => Math.abs(p.offset - o) < Math.abs(b.offset - o) ? p : b, points[0]), pointX: p => chart.x(p.offset), tooltipContent: p => { const rel = p.ratio >= 1 ? `в ${formatDecimal.format(p.ratio)} раза от обычного` : `${formatPercent.format(p.ratio * 100)}% от обычного`; return `<strong>${formatBucket(p.offset, timelineStart)}</strong><br>Бюллетени за интервал: ${number(p.ballots)}<br>Обычный интервал: ${number(Math.round(p.baseline))}<br>Отклонение: ${formatSigned.format(p.deviation)}× (${rel})`; } });
}

function mountRemovedChart(container, removedSeries, bucketMinutes, timelineStart, view) {
    const empty = () => {
        container.innerHTML = '<div style="color:#888;text-align:center;padding:1rem;font-size:0.8rem">Нет данных об исключениях</div>';
    };
    if (!container || !removedSeries || removedSeries.length < 2) { if (container) empty(); return; }
    const width = 980, height = 300;
    const margin = { top: 16, right: 24, bottom: 42, left: 72 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;
    const xSpan = Math.max(view.xEnd - view.xStart, bucketMinutes, 1);
    const visible = removedSeries.filter(p => p[0] >= view.xStart && p[0] <= view.xEnd);
    if (visible.length < 2) { empty(); return; }
    const yMax = niceCeil(Math.max(...visible.map(p => p[1]), 1) / view.yZoom);
    const chart = { x: v => margin.left + ((v - view.xStart) / xSpan) * innerWidth, y: v => margin.top + innerHeight - (v / yMax) * innerHeight };
    const yTicks = valueTicks(0, yMax, 4);
    const yStep = yTicks.length > 1 ? yTicks[1] - yTicks[0] : yMax;
    const xTicks = xTickList(view.xStart, xSpan);
    const path = visible.map((p, i) => `${i === 0 ? 'M' : 'L'}${chart.x(p[0]).toFixed(2)},${chart.y(p[1]).toFixed(2)}`).join(' ');

    container.innerHTML = `
        <div class="chart-scroller" style="overflow-x:auto;height:${height}px">
            <svg class="chart" viewBox="0 0 ${width} ${height}" role="img" style="width:${width}px;height:${height}px">
                ${yTicks.map(t => `<line class="grid-line" x1="${margin.left}" y1="${chart.y(t)}" x2="${width - margin.right}" y2="${chart.y(t)}" style="stroke:rgba(255,255,255,0.05)"/><text class="tick-label" x="${margin.left - 10}" y="${chart.y(t) + 4}" text-anchor="end" style="fill:#666;font-size:10px">${formatTick(t, yStep)}</text>`).join('')}
                ${xTicks.map(t => `<line class="grid-line" x1="${chart.x(t.value)}" y1="${margin.top}" x2="${chart.x(t.value)}" y2="${height - margin.bottom}" style="stroke:rgba(255,255,255,0.05)"/><text class="tick-label" x="${chart.x(t.value)}" y="${height - 14}" text-anchor="${t.anchor}" style="fill:#666;font-size:10px">${formatBucket(Math.round(t.value), timelineStart)}</text>`).join('')}
                <line class="axis-line" x1="${margin.left}" y1="${height - margin.bottom}" x2="${width - margin.right}" y2="${height - margin.bottom}" style="stroke:#444"/>
                <line class="axis-line" x1="${margin.left}" y1="${margin.top}" x2="${margin.left}" y2="${height - margin.bottom}" style="stroke:#444"/>
                <path class="series-removed" d="${path}" style="fill:none;stroke:var(--red);stroke-width:2"/>
                <line class="hover-line" x1="${margin.left}" y1="${margin.top}" x2="${margin.left}" y2="${height - margin.bottom}" style="stroke:#fff;stroke-dasharray:4,4;opacity:0;pointer-events:none"/>
                <rect class="chart-hitbox" x="${margin.left}" y="${margin.top}" width="${innerWidth}" height="${innerHeight}" fill="transparent" style="cursor:crosshair"/>
            </svg>
        </div>
        <div class="tooltip" style="position:absolute;background:rgba(21,20,25,0.95);color:#fff;padding:8px;border-radius:6px;font-size:12px;pointer-events:none;display:none;z-index:100;border:1px solid rgba(255,255,255,0.1)"></div>
    `;

    attachChartInteractions({ container, view, width, margin, innerWidth, xSpan, nearest: o => visible.reduce((b, p) => Math.abs(p[0] - o) < Math.abs(b[0] - o) ? p : b, visible[0]), pointX: p => chart.x(p[0]), tooltipContent: p => `<strong>${formatBucket(p[0], timelineStart)}</strong><br>Исключено накопительно: ${number(p[1])}` });
}

function attachChartInteractions({ container, view, width, margin, innerWidth, xSpan, nearest, pointX, tooltipContent }) {
    const scroller = container.querySelector('.chart-scroller');
    const svg = container.querySelector('svg');
    const hitbox = container.querySelector('.chart-hitbox');
    const hoverLine = container.querySelector('.hover-line');
    const tooltip = container.querySelector('.tooltip');
    if (!scroller || !svg || !hitbox || !hoverLine || !tooltip) return;

    const offsetAtClientX = clientX => {
        const rect = svg.getBoundingClientRect();
        const svgX = ((clientX - rect.left) / Math.max(1, rect.width)) * width;
        return clamp(view.xStart + ((svgX - margin.left) / innerWidth) * xSpan, view.xStart, view.xEnd);
    };

    const hideHover = () => { hoverLine.style.opacity = 0; tooltip.style.display = 'none'; };
    const placeTooltip = (event, html) => {
        tooltip.innerHTML = html; tooltip.style.display = 'block';
        const rect = scroller.getBoundingClientRect();
        const tipW = tooltip.offsetWidth || 220, tipH = tooltip.offsetHeight || 80;
        const vx = event.clientX - rect.left, vy = event.clientY - rect.top;
        tooltip.style.left = `${clamp(vx + 14, 8, Math.max(8, scroller.clientWidth - tipW - 8)) + scroller.scrollLeft}px`;
        tooltip.style.top = `${clamp(vy - 12, 8, Math.max(8, scroller.clientHeight - tipH - 8))}px`;
    };

    hitbox.addEventListener('mousemove', e => { const p = nearest(offsetAtClientX(e.clientX)); if (!p) return; hoverLine.setAttribute('x1', pointX(p)); hoverLine.setAttribute('x2', pointX(p)); hoverLine.style.opacity = 1; placeTooltip(e, tooltipContent(p)); });
    hitbox.addEventListener('mouseleave', hideHover);

    let dragging = false, dragStart = { x: 0, viewStart: 0, viewEnd: 0 };
    hitbox.addEventListener('pointerdown', e => { if (e.button !== 0) return; dragging = true; dragStart = { x: e.clientX, viewStart: view.xStart, viewEnd: view.xEnd, unitsPerPx: width / Math.max(1, svg.getBoundingClientRect().width) }; e.preventDefault(); container.classList.add('is-dragging'); });
    window.addEventListener('pointermove', e => { if (!dragging) return; const dx = e.clientX - dragStart.x; if (!dragging || Math.abs(dx) < 3) return; const span = dragStart.viewEnd - dragStart.viewStart; const delta = -((dx * dragStart.unitsPerPx) / innerWidth) * span; const fullStart = view.fullStart || view.xStart; const fullEnd = view.fullEnd || view.xEnd; view.xStart = clamp(dragStart.viewStart + delta, fullStart, fullEnd - span); view.xEnd = view.xStart + span; container.querySelector('.chart-scroller').scrollLeft = 0; });
    window.addEventListener('pointerup', () => { dragging = false; container.classList.remove('is-dragging'); });

    scroller.addEventListener('wheel', e => { if (!e.ctrlKey && !e.metaKey) return; e.preventDefault(); const factor = Math.exp(e.deltaY * 0.002); const anchor = offsetAtClientX(e.clientX); const span = view.xEnd - view.xStart; const ratio = span > 0 ? clamp((anchor - view.xStart) / span, 0, 1) : 0.5; const nextSpan = span * factor; const nextStart = anchor - nextSpan * ratio; const fullStart = view.fullStart || view.xStart; const fullEnd = view.fullEnd || view.xEnd; const minSpan = Math.max(bucketMinutes * 3, (fullEnd - fullStart) / 400); const maxSpan = fullEnd - fullStart; const clampedSpan = clamp(nextSpan, minSpan, maxSpan); view.xStart = clamp(nextStart, fullStart, fullEnd - clampedSpan); view.xEnd = view.xStart + clampedSpan; container.querySelector('.chart-scroller').scrollLeft = 0; }, { passive: false });

    scroller.addEventListener('scroll', () => { view.scrollLeft = scroller.scrollLeft; });
}