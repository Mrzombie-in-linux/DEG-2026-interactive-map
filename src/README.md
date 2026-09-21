# Интерактивная карта РФ — Выборные статистики (ДЭГ 2026)

Интерактивная карта российских регионов с визуализацией выборных данных в стиле **feddeg/dashboard**. При наведении на регион показывается флаг, герб, базовая статистика и культурная информация. При клике открывается боковая панель с выбором типа выборов и **тремя SVG-графиками** (накопительные, активность, аномалии) с зумом/панорамированием.

## Возможности

- 🗺️ **Интерактивная SVG-карта** — зум (колесико/Ctrl+колесико), панорамирование (drag), выделение регионов
- 📍 **Ховер-тултип** — флаг, герб, название, тип региона, бюллетени/голоса/избиратели/явка, народы, языки, ссылки на культурные объекты, галерея фото
- 📊 **Боковая панель при клике** — выбор типа выборов из списка округов региона + 3 графика:
  - **Накопительные бюллетени** — линейные графики бюллетеней и голосов во времени
  - **Активность по времени** — гистограмма бюллетеней за интервал + линия голосов
  - **Скачки и просадки** — отклонение от обычного темпа (z-score) с порогами ±2× и -0.7×
- 🔍 **Интерактивные графики** — зум по времени (Ctrl+колесико), зум по значениями, растяжение, панорамирование, ховер-тултипы с деталями
- 🏳️ **Флаги и гербы** всех 89 регионов
- 🔗 **705 ссылок** на музеи, театры, библиотеки, памятники культуры
- 🖼️ **558 фото** в галереях по регионам
- 📱 **Адаптивный дизайн** — работает на мобильных устройствах

## Требования

- **Python 3.8+** (для предобработки данных)
- **Современный браузер** (Chrome, Firefox, Edge, Safari с поддержкой ES6, SVG, Canvas)
- **Веб-сервер** (любой статический: Python http.server, Node.js serve, nginx)

## Установка и запуск

### 1. Клонирование/переход в папку
```bash
cd DEG-2026-interactive-map
```

### 2. Установка Python-зависимостей
```bash
pip install pandas numpy
```

### 3. Подготовка исходных данных

Поместите архив данных в папку `data/`:
```
data/
└── feddeg_20260919T155213+0300.zip
    ├── elections.csv
    ├── ballots.csv
    ├── votes.csv
    └── voter_list_events.csv
```

### 4. Генерация данных для дашборда (файл feddeg_dashboard.json)
```bash
python generate_feddeg_fast.py
```
**Что делает скрипт:**
- Читает CSV из распакованного архива
- Строит временные ряды (5-минутные баккеты) для каждого округа/региона
- Агрегирует по регионам и создает общий ряд "Все регионы"
- Сохраняет `src/feddeg_dashboard.json` (~32 региона, 1698 округов, 103 временных точки)

### 5. Генерация сводной таблицы выборов (election-data.json)
```bash
python generate_election_data.py
```
**Что делает:**
- Считает итоговые бюллетени, голоса, избирателей, явку по регионам
- Сохраняет `src/election-data.json` для ховера

### 6. Извлечение культурных данных (region-details.json)
```bash
python extract_data_final.py
```
**Что делает:**
- Парсит `map.html` (бывший "Интерактивная карта Российской Федерации.html")
- Извлекает для 89 регионов: народы, языки, языки в образовании, 705 ссылок на культурные объекты, 558 фото галереи
- Сохраняет `src/region-details.json`

### 7. Запуск веб-сервера
```bash
cd src
python -m http.server 8080
```

Откройте в браузере: **http://localhost:8080**

> **Важно:** Открывайте именно через HTTP-сервер (`http://localhost:8080`), а не как файл (`file://...`), иначе браузер заблокирует загрузку JSON и SVG из-за CORS.

## Структура проекта

```
DEG-2026-interactive-map/
├── data/
│   └── feddeg_20260919T155213+0300.zip    # Исходные данные (не в репозитории)
├── src/
│   ├── index.html                          # Главная страница
│   ├── app.js                              # Основная логика (карта, тултипы, SVG-графики, сайдбар)
│   ├── map-data.js                         # Конфигурация регионов (названия, типы, цвета, коды RU-)
│   ├── map.html                            # Исходная карта с SVG + культурными данными
│   ├── feddeg_dashboard.json               # Временные ряды (генерируется)
│   ├── election-data.json                  # Сводка по регионам (генерируется)
│   ├── region-details.json                 # Культурные данные (генерируется)
│   ├── region-timeseries.json              # Старый формат (опционально)
│   └── Интерактивная карта Российской Федерации_files/  # PNG флаги/гербы/фото
├── generate_feddeg_fast.py                 # Генерация feddeg_dashboard.json
├── generate_election_data.py               # Генерация election-data.json
├── extract_data_final.py                   # Извлечение культурных данных
├── preprocess.py                           # Старый препроцессор (region-timeseries.json)
└── README.md
```

## Использование

1. **Наведите курсор на регион** — появится тултип с флагом, гербом, статистикой (бюллетени, голоса, избиратели, явка), народами, языками, ссылками на культурные объекты, галереей фото
2. **Кликните по региону** — откроется правая панель с названием региона
3. **Выберите тип выборов** в выпадающем списке — обновит все три графика
4. **Взаимодействуйте с графиками**:
   - Колесико мыши — зум по горизонтали (время)
   - Ctrl/Cmd + колесико — зум по вертикали (значения)
   - Перетаскивание мышью — панорамирование по времени
   - Ховер — детальный тултип в точке
   - Кнопки управления над графиком — зум/растяжение/сброс

## Формат данных

### Входные CSV (в zip-архиве)
| Файл | Поля |
|------|------|
| `elections.csv` | `contract_id`, `region`, `election`, `district` |
| `ballots.csv` | `contract_id`, `uik`, `timestamp` |
| `votes.csv` | `contract_id`, `timestamp` |
| `voter_list_events.csv` | `contract_id`, `uik`, `timestamp`, `count`, `type` |

### `feddeg_dashboard.json` (основной для графиков)
```json
{
  "bucketMinutes": 5,
  "timeline": { "start": "2026-09-17 22:00", "end": "2026-09-18 06:30" },
  "regions": [
    {
      "id": "chelyabinsk",
      "name": "Челябинская область",
      "voters": 368348,
      "ballots": 279263,
      "votes": 279263,
      "districtIds": ["d1", "d2", ...],
      "series": [[0, 10, 5], [5, 20, 15], ...]
    }
  ],
  "districts": [
    { "id": "d1", "name": "Округ 1", "regionId": "chelyabinsk", "elections": ["Выборы..."], "series": [...] }
  ]
}
```
- `series`: массив `[offset_minutes, cumulative_ballots, cumulative_votes]`

### `election-data.json` (для ховера)
```json
{
  "chelyabinsk": { "region": "Челябинская область", "ballotsIssued": 279263, "voters": 368348, "turnout": "75.81", ... }
}
```

### `region-details.json` (для ховера)
```json
{
  "CHE": {
    "peoples": "русские, татары, башкиры...",
    "languages": "русский, татарский, башкирский...",
    "education_languages": "русский, татарский, башкирский...",
    "links": [{ "url": "https://...", "text": "Музей..." }],
    "gallery": ["./.../RU-CHE-01.jpg", ...]
  }
}
```

## Настройка

### Изменение порогов аномалий
В `app.js` (функции `mountAnomalyChart`):
```javascript
// Пороги для линий на графике аномалий
const SPIKE_THRESHOLD = 2.0;    // всплеск: deviation >= 2
const DROP_THRESHOLD = -0.7;    // просадка: deviation <= -0.7
```

### Изменение цветов регионов
В `src/map-data.js`:
```javascript
const customRegionColors = {
    "chelyabinsk": "#3d4c6d",
    "sverdlovsk": "#3d4c6d",
    "udmurt": "#954036",
    // ...
};
```

### Добавление новых регионов
1. Добавьте маппинг в `REGION_NAME_TO_ID` в `generate_election_data.py` и `generate_feddeg_fast.py`
2. Добавьте название, тип и цвет в `src/map-data.js` (объекты `regionNames`, `regionTypes`, `regionCodeMap`, `customRegionColors`)

## Решение проблем

### Графики/данные не загружаются
- Проверьте консоль браузера (F12) на ошибки 404/500
- Убедитесь, что все `.json` файлы созданы в `src/` и доступны по HTTP
- Проверьте, что запускаете через `http://localhost:8080`, а не `file://`

### Карта не загружается
- `map.html` должен быть в `src/`
- SVG внутри должен иметь атрибуты `data-code="RU-XX"` на путях регионов

### Регион не найден в данных
- Сравните название в CSV с ключами в `REGION_NAME_TO_ID`
- Проверьте предупреждения при запуске генераторов

### Ошибка кодировки (Windows)
```powershell
# PowerShell
$env:PYTHONIOENCODING="utf-8"; python generate_feddeg_fast.py
$env:PYTHONIOENCODING="utf-8"; python generate_election_data.py
$env:PYTHONIOENCODING="utf-8"; python extract_data_final.py
```

## Архитектура фронтенда

```
index.html
├── .map-container (SVG карта + тултип + легенда)
└── .sidebar (скрыта, открывается по клику)
    ├── .sidebar-header (название региона + кнопка закрытия)
    ├── .election-selector (select с типами выборов региона)
    └── .chart-grid (3 div для SVG-графиков)

app.js модули:
├── loadSVGMap()           → парсит map.html, навешивает data-атрибуты
├── showTooltip()          → ховер-тултип с region-details.json + election-data.json
├── openSidebar()          → наполняет сайдбар, рендерит графики
├── renderSidebarCharts()  → создает 3 SVG-графика через mountChart/Activity/Anomaly
├── mountChart()           → накоп. линейный (ballots + votes)
├── mountActivityChart()   → гист. ballots + лин. votes
├── mountAnomalyChart()    → bars deviation с порогами ±2×/-0.7×
└── attachChartInteractions() → зум/панорамирование/ховер
```

## Технологии

- **Frontend:** Vanilla JS (ES6+), SVG, CSS Grid/Flexbox, Chart.js не используется (кастомный SVG)
- **Data Processing:** Python 3, pandas, numpy, zipfile, csv, json
- **Data Flow:** ZIP (CSV) → Python scripts → JSON → Browser (fetch) → SVG Charts

## Лицензия

MIT License — свободное использование, модификация и распространение.