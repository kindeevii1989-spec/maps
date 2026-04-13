// Простой формат данных маршрута, сохраняется в localStorage.
const STORAGE_KEY = 'route_navigator_data_v1';

const defaultRoute = {
  routeName: 'Демо-маршрут: до озера',
  currentIndex: 0,
  manualAnchor: '',
  stages: [
    { title: 'Выезд из города', note: 'Проверить документы и уровень топлива.' },
    { title: 'Поворот на трассу М-5', note: 'После АЗС держаться правее.' },
    { title: 'Мост через реку', note: 'Снизить скорость, дальше плохой участок.' },
    { title: 'Лесная развилка', note: 'Выбрать левую дорогу к базе отдыха.' },
    { title: 'Финиш: стоянка у озера', note: 'Остановиться и отметить прибытие.' }
  ]
};

let state = loadState();

const routeNameInput = document.getElementById('routeName');
const currentStageCard = document.getElementById('currentStageCard');
const stageList = document.getElementById('stageList');
const addStageBtn = document.getElementById('addStageBtn');
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

// Рендерим интерфейс после любого изменения state.
function render() {
  routeNameInput.value = state.routeName;

  if (state.stages.length === 0) {
    currentStageCard.innerHTML = '<h3>Нет этапов</h3><p>Добавьте первый этап маршрута.</p>';
  } else {
    const current = state.stages[state.currentIndex];
    currentStageCard.innerHTML = `
      <h3>Этап ${state.currentIndex + 1}: ${escapeHtml(current.title || 'Без названия')}</h3>
      <p><strong>Заметка:</strong> ${escapeHtml(current.note || '—')}</p>
      <p><strong>Прогресс:</strong> ${state.currentIndex + 1} / ${state.stages.length}</p>
    `;
  }

  renderStageList();
  renderManualAnchor();

  backBtn.disabled = state.currentIndex <= 0;
  nextBtn.disabled = state.currentIndex >= state.stages.length - 1 || state.stages.length === 0;
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
      stages: parsed.stages.map((s) => ({ title: s.title || '', note: s.note || '' }))
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

addStageBtn.addEventListener('click', () => {
  state.stages.push({ title: 'Новый этап', note: '' });
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
  alert('Маршрут загружен из localStorage.');
});

resetBtn.addEventListener('click', () => {
  state = structuredClone(defaultRoute);
  saveState();
  render();
});

clampCurrentIndex();
render();
