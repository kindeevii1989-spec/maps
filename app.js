const STORAGE_KEY = 'route_navigator_data_v1';

let map;
let routeLine;

const startCoordInput = document.getElementById('startCoord');
const finishCoordInput = document.getElementById('finishCoord');
const buildRouteBtn = document.getElementById('buildRouteBtn');
const routeStatus = document.getElementById('routeStatus');
const mapFallback = document.getElementById('mapFallback');

function saveState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return { start: '', finish: '', routePath: null };
  try {
    const parsed = JSON.parse(raw);
    return {
      start: parsed.start || '',
      finish: parsed.finish || '',
      routePath: Array.isArray(parsed.routePath) ? parsed.routePath : null
    };
  } catch {
    return { start: '', finish: '', routePath: null };
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
  if (parts.length !== 2) throw new Error('Неверный формат. Используйте lat,lng');

  const lat = Number(parts[0]);
  const lng = Number(parts[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw new Error('Координаты должны быть числами.');
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) throw new Error('Координаты вне диапазона.');

  return { lat, lng };
}

function drawRoute(path) {
  if (routeLine) map.removeLayer(routeLine);
  routeLine = L.polyline(path, { color: '#2563eb', weight: 5 }).addTo(map);
  map.fitBounds(routeLine.getBounds(), { padding: [20, 20] });
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
    drawRoute(state.routePath);
    setStatus('Маршрут построен', 'ok');
  }

  buildRouteBtn.addEventListener('click', async () => {
    try {
      const start = parseLatLng(startCoordInput.value);
      const finish = parseLatLng(finishCoordInput.value);

      const url = `https://router.project-osrm.org/route/v1/driving/${start.lng},${start.lat};${finish.lng},${finish.lat}?overview=full&steps=true&geometries=geojson`;
      const response = await fetch(url);
      if (!response.ok) throw new Error('Запрос к OSRM не удался.');

      const data = await response.json();
      if (data.code !== 'Ok') throw new Error('OSRM вернул ошибку маршрута.');

      const coordinates = data?.routes?.[0]?.geometry?.coordinates;
      if (!Array.isArray(coordinates) || coordinates.length === 0) {
        throw new Error('Маршрут не найден.');
      }

      const latLngPath = coordinates.map(([lng, lat]) => [lat, lng]);
      drawRoute(latLngPath);

      saveState({
        start: startCoordInput.value.trim(),
        finish: finishCoordInput.value.trim(),
        routePath: latLngPath
      });

      setStatus('Маршрут построен', 'ok');
    } catch (error) {
      setStatus('Ошибка маршрута', 'error');
      alert(error.message || 'Ошибка маршрута');
    }
  });
});// Простой формат данных маршрута, сохраняется в localStorage.
const STORAGE_KEY = 'route_navigator_data_v1';

const defaultRoute = {
  routeName: 'Демо-маршрут: до озера',
  currentIndex: 0,
  manualAnchor: '',
  calcPoint: null,
  gpsInitialized: false,
  stages: [
    { title: 'Выезд из города', note: 'Проверить документы и уровень топлива.' },
    { title: 'Поворот на трассу М-5', note: 'После АЗС держаться правее.' },
    { title: 'Мост через реку', note: 'Снизить скорость, дальше плохой участок.' },
    { title: 'Лесная развилка', note: 'Выбрать левую дорогу к базе отдыха.' },
    { title: 'Финиш: стоянка у озера', note: 'Остановиться и отметить прибытие.' }
  ]
};

let state = loadState();
let map;
let gpsMarker;
let calcMarker;

const routeNameInput = document.getElementById('routeName');
const currentStageCard = document.getElementById('currentStageCard');
const stageList = document.getElementById('stageList');
const quickTitle = document.getElementById('quickTitle');
const quickNote = document.getElementById('quickNote');
const quickAddBtn = document.getElementById('quickAddBtn');
const nextBtn = document.getElementById('nextBtn');
const backBtn = document.getElementById('backBtn');
const lostBtn = document.getElementById('lostBtn');
const saveBtn = document.getElementById('saveBtn');
const loadBtn = document.getElementById('loadBtn');
const resetBtn = document.getElementById('resetBtn');
const lostPanel = document.getElementById('lostPanel');
const manualLocationInput = document.getElementById('manualLocation');
const saveLocationBtn = document.getElementById('saveLocationBtn');
const manualAnchorBlock = document.getElementById('manualAnchorBlock');
const progressText = document.getElementById('progressText');
const mapFallback = document.getElementById('mapFallback');

// Рендерим интерфейс после любого изменения state.
function render() {
  routeNameInput.value = state.routeName;

  if (state.stages.length === 0) {
    currentStageCard.innerHTML = '<h3>Нет этапов</h3><p>Добавьте первый этап маршрута.</p>';
    progressText.textContent = 'Этапов пока нет';
  } else {
    const current = state.stages[state.currentIndex];
    const isLastStage = state.currentIndex === state.stages.length - 1;
    currentStageCard.innerHTML = `
      <h3>Этап ${state.currentIndex + 1}: ${escapeHtml(current.title || 'Без названия')}</h3>
      <p><strong>Заметка:</strong> ${escapeHtml(current.note || '—')}</p>
      ${isLastStage ? '<p><strong>Вы прибыли</strong></p>' : ''}
    `;
    progressText.textContent = `Этап ${state.currentIndex + 1} из ${state.stages.length}`;
  }

  renderStageList();
  renderManualAnchor();

  backBtn.disabled = state.currentIndex <= 0;
  const isDisabledNext = state.currentIndex >= state.stages.length - 1 || state.stages.length === 0;
  nextBtn.disabled = isDisabledNext;
  nextBtn.textContent = isDisabledNext ? 'Вы прибыли' : 'Следующий этап';
}

function renderStageList() {
  stageList.innerHTML = '';

  state.stages.forEach((stage, index) => {
    const li = document.createElement('li');
    li.className = `stage-item ${index === state.currentIndex ? 'current' : ''}`;

    li.innerHTML = `
      <div class="row-top">
        <span class="stage-number">Этап ${index + 1}</span>
        <button class="btn btn-danger" data-action="delete" data-index="${index}">Удалить</button>
      </div>
      <div class="row">
        <input class="input" data-field="title" data-index="${index}" type="text" value="${escapeAttribute(stage.title)}" placeholder="Название этапа" />
        <textarea class="input" data-field="note" data-index="${index}" rows="2" placeholder="Заметка">${escapeHtml(stage.note)}</textarea>
      </div>
    `;

    stageList.appendChild(li);
  });
}

function renderManualAnchor() {
  if (state.manualAnchor.trim()) {
    manualAnchorBlock.classList.remove('hidden');
    manualAnchorBlock.textContent = `Текущая ручная привязка: ${state.manualAnchor}`;
  } else {
    manualAnchorBlock.classList.add('hidden');
    manualAnchorBlock.textContent = '';
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return structuredClone(defaultRoute);
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed.stages)) throw new Error('Invalid data');
    return {
      routeName: parsed.routeName || defaultRoute.routeName,
      currentIndex: Number.isInteger(parsed.currentIndex) ? parsed.currentIndex : 0,
      manualAnchor: parsed.manualAnchor || '',
      stages: parsed.stages.map((s) => ({ title: s.title || '', note: s.note || '' })),
      calcPoint: parsed.calcPoint || null,
      gpsInitialized: Boolean(parsed.gpsInitialized)
    };
  } catch {
    return structuredClone(defaultRoute);
  }
}

function clampCurrentIndex() {
  if (state.stages.length === 0) {
    state.currentIndex = 0;
    return;
  }
  state.currentIndex = Math.max(0, Math.min(state.currentIndex, state.stages.length - 1));
}

// Инициализация карты (Leaflet) и GPS слежения.
function initMap() {
  if (typeof L === 'undefined') {
    showMapFallback('Leaflet не загрузился. Карта недоступна.');
    return;
  }

  map = L.map('map', { zoomControl: true }).setView([55.75, 37.61], 10);

  const osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(map);

  osmLayer.on('tileerror', () => {
    showMapFallback('Не удалось загрузить тайлы карты. Проверьте интернет-соединение.');
  });

  const gpsIcon = L.divIcon({ className: 'gps-dot', iconSize: [16, 16] });
  const calcIcon = L.divIcon({ className: 'calc-dot', iconSize: [16, 16] });

  gpsMarker = L.marker([55.751244, 37.618423], { icon: gpsIcon }).addTo(map);
  gpsMarker.bindTooltip('GPS позиция');

  const startCalc = state.calcPoint || { lat: 55.751244, lng: 37.618423 };
  calcMarker = L.marker([startCalc.lat, startCalc.lng], { icon: calcIcon }).addTo(map);
  calcMarker.bindTooltip('Расчетная точка (тап по карте для переноса)');

  // Тап по карте сдвигает расчетную точку.
  map.on('click', (event) => {
    const { lat, lng } = event.latlng;
    calcMarker.setLatLng([lat, lng]);
    state.calcPoint = { lat, lng };
    saveState();
  });

  if (!navigator.geolocation) return;

  navigator.geolocation.watchPosition(
    (position) => {
      const { latitude, longitude } = position.coords;
      gpsMarker.setLatLng([latitude, longitude]);

      if (!state.gpsInitialized) {
        map.setView([latitude, longitude], 15);
        state.gpsInitialized = true;
        saveState();
      }
    },
    () => {
      // Если геолокация недоступна, продолжаем в ручном режиме.
    },
    { enableHighAccuracy: true, maximumAge: 3000, timeout: 10000 }
  );
}

function showMapFallback(message) {
  mapFallback.textContent = message;
  mapFallback.classList.remove('hidden');
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeAttribute(value) {
  return escapeHtml(value).replace(/"/g, '&quot;');
}

routeNameInput.addEventListener('input', (e) => {
  state.routeName = e.target.value;
  saveState();
});

nextBtn.addEventListener('click', () => {
  if (state.currentIndex < state.stages.length - 1) {
    state.currentIndex += 1;
    saveState();
    render();
  }
});

backBtn.addEventListener('click', () => {
  if (state.currentIndex > 0) {
    state.currentIndex -= 1;
    saveState();
    render();
  }
});

lostBtn.addEventListener('click', () => {
  lostPanel.classList.toggle('hidden');
  manualLocationInput.value = state.manualAnchor;
});

saveLocationBtn.addEventListener('click', () => {
  state.manualAnchor = manualLocationInput.value.trim();
  saveState();
  renderManualAnchor();
  lostPanel.classList.add('hidden');
});

quickAddBtn.addEventListener('click', () => {
  const title = quickTitle.value.trim();
  const note = quickNote.value.trim();

  state.stages.push({ title: title || 'Новый этап', note });
  quickTitle.value = '';
  quickNote.value = '';
  clampCurrentIndex();
  saveState();
  render();
});

stageList.addEventListener('input', (e) => {
  const index = Number(e.target.dataset.index);
  const field = e.target.dataset.field;
  if (!Number.isInteger(index) || !field) return;

  state.stages[index][field] = e.target.value;
  saveState();
  if (index === state.currentIndex) render();
});

stageList.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-action="delete"]');
  if (!btn) return;
  const index = Number(btn.dataset.index);
  if (!Number.isInteger(index)) return;

  state.stages.splice(index, 1);
  clampCurrentIndex();
  saveState();
  render();
});

saveBtn.addEventListener('click', () => {
  saveState();
  alert('Маршрут сохранён в localStorage.');
});

loadBtn.addEventListener('click', () => {
  state = loadState();
  clampCurrentIndex();
  render();

  if (calcMarker && state.calcPoint) {
    calcMarker.setLatLng([state.calcPoint.lat, state.calcPoint.lng]);
  }

  alert('Маршрут загружен из localStorage.');
});

resetBtn.addEventListener('click', () => {
  state = structuredClone(defaultRoute);
  saveState();
  render();

  if (calcMarker) {
    calcMarker.setLatLng([55.751244, 37.618423]);
    map.setView([55.751244, 37.618423], 13);
  }
});

document.addEventListener('DOMContentLoaded', () => {
  clampCurrentIndex();
  render();

  try {
    initMap();
  } catch {
    showMapFallback('Ошибка инициализации карты. Попробуйте перезагрузить страницу.');
  }
});
