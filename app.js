const STORAGE_KEY = 'route_navigator_data_v2';

let map;
let routeLine;
let userMarker;
let watchId = null;
let isNavigationMode = false;
let activeRoutePath = [];
let routeMeta = null;
let routeTailDistances = [];

const startCoordInput = document.getElementById('startCoord');
const finishCoordInput = document.getElementById('finishCoord');
const buildRouteBtn = document.getElementById('buildRouteBtn');
const startBtn = document.getElementById('startBtn');
const routeStatus = document.getElementById('routeStatus');
const routeSummary = document.getElementById('routeSummary');
const mapFallback = document.getElementById('mapFallback');

function saveState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return { start: '', finish: '', routePath: null, summary: null };
  }

  try {
    const parsed = JSON.parse(raw);
    return {
      start: parsed.start || '',
      finish: parsed.finish || '',
      routePath: Array.isArray(parsed.routePath) ? parsed.routePath : null,
      summary: parsed.summary || null
    };
  } catch {
    return { start: '', finish: '', routePath: null, summary: null };
  }
}

function setStatus(text, type) {
  routeStatus.textContent = text;
  routeStatus.classList.remove('ok', 'error');
  if (type) routeStatus.classList.add(type);
}

function showMapFallback(text) {
  mapFallback.textContent = text;
  mapFallback.classList.remove('hidden');
}

function parseLatLng(value) {
  const parts = value.split(',').map((item) => item.trim());
  if (parts.length !== 2) return null;

  const lat = Number(parts[0]);
  const lng = Number(parts[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;

  return { lat, lng };
}

async function geocodeAddress(query) {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`;
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json'
    }
  });

  if (!response.ok) {
    throw new Error('Не удалось выполнить геокодирование адреса.');
  }

  const data = await response.json();
  const first = Array.isArray(data) ? data[0] : null;
  if (!first) {
    throw new Error(`Адрес не найден: ${query}`);
  }

  const lat = Number(first.lat);
  const lng = Number(first.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw new Error(`Некорректные координаты от геокодера: ${query}`);
  }

  return {
    lat,
    lng,
    displayName: first.display_name || query
  };
}

async function resolvePoint(input) {
  const trimmed = input.trim();
  if (!trimmed) throw new Error('Заполните оба поля: старт и пункт назначения.');

  const latLng = parseLatLng(trimmed);
  if (latLng) {
    return {
      ...latLng,
      displayName: trimmed
    };
  }

  return geocodeAddress(trimmed);
}

function formatDistance(distanceMeters) {
  return `${(distanceMeters / 1000).toFixed(1)} км`;
}

function formatDuration(durationSeconds) {
  const totalMinutes = Math.round(durationSeconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes} мин`;
  return `${hours} ч ${minutes} мин`;
}

function drawRoute(path) {
  if (routeLine) map.removeLayer(routeLine);
  routeLine = L.polyline(path, { color: '#2563eb', weight: 5 }).addTo(map);
  map.fitBounds(routeLine.getBounds(), { padding: [20, 20] });
}

function showRouteSummary(summary) {
  routeSummary.innerHTML = `
    <div><strong>Отправка:</strong> ${summary.startAddress}</div>
    <div><strong>Назначение:</strong> ${summary.finishAddress}</div>
    <div><strong>Расстояние:</strong> ${formatDistance(summary.distance)}</div>
    <div><strong>Примерное время:</strong> ${formatDuration(summary.duration)}</div>
  `;
  routeSummary.classList.remove('hidden');
}

function initMap() {
  if (typeof L === 'undefined') {
    showMapFallback('Leaflet не загрузился.');
    return;
  }

  map = L.map('map').setView([55.75, 37.61], 10);
  const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(map);

  osm.on('tileerror', () => {
    showMapFallback('Не удалось загрузить карту.');
  });
}

document.addEventListener('DOMContentLoaded', () => {
  initMap();

  const state = loadState();
  startCoordInput.value = state.start;
  finishCoordInput.value = state.finish;

  if (state.routePath && map) {
    activeRoutePath = state.routePath;
    drawRoute(state.routePath);
    if (state.summary) {
      showRouteSummary(state.summary);
      startBtn.classList.remove('hidden');
    }
    setStatus('Маршрут построен', 'ok');
  }

  startBtn.addEventListener('click', () => {
    setStatus('Режим «Старт» пока только подготовлен в интерфейсе.', 'ok');
  });

  buildRouteBtn.addEventListener('click', async () => {
    buildRouteBtn.disabled = true;
    setStatus('Строим маршрут...', null);

    try {
      const start = await resolvePoint(startCoordInput.value);
      const finish = await resolvePoint(finishCoordInput.value);

      const url = `https://router.project-osrm.org/route/v1/driving/${start.lng},${start.lat};${finish.lng},${finish.lat}?overview=full&steps=true&geometries=geojson`;
      const response = await fetch(url);
      if (!response.ok) throw new Error('Запрос к OSRM не удался.');

      const data = await response.json();
      if (data.code !== 'Ok') throw new Error('OSRM вернул ошибку маршрута.');

      const route = data?.routes?.[0];
      const coordinates = route?.geometry?.coordinates;
      if (!Array.isArray(coordinates) || coordinates.length === 0) {
        throw new Error('Маршрут не найден.');
      }

      const latLngPath = coordinates.map(([lng, lat]) => [lat, lng]);
      activeRoutePath = latLngPath;
      routeTailDistances = buildTailDistances(activeRoutePath);
      drawRoute(latLngPath);

      const summary = {
        startAddress: start.displayName,
        finishAddress: finish.displayName,
        distance: route.distance,
        duration: route.duration
      };

      showRouteSummary(summary);
      startBtn.classList.remove('hidden');

      saveState({
        start: startCoordInput.value.trim(),
        finish: finishCoordInput.value.trim(),
        routePath: latLngPath,
        summary
      });

      setStatus('Маршрут построен', 'ok');
    } catch (error) {
      setStatus('Ошибка маршрута', 'error');
      alert(error.message || 'Ошибка маршрута');
    } finally {
      buildRouteBtn.disabled = false;
    }
  });
});
