(function () {
'use strict';
if (window.plugin_capsule_mod_ready) return;
window.plugin_capsule_mod_ready = true;

/* Capsule Mod 21.0 — персональный подбор и кинематографичные сцены.
 * Основа: предоставленный пользователем исходник 20.8.
 * Предпочтения и реакции сохраняются только локально; запросы каталога — через TMDb/Lampa.
 */
const VERSION = '21.0';
const COMPONENT_ID = 'capsule_mod_view';
const CTRL_ID = 'capsule_mod_ctrl';
const FALLBACK_KEY = '4ef0d7355d9ffb5151e987764708ce96';
const LANG = 'ru-RU';
const SEEN_CAP = 1400;
const MAX_PARALLEL = 6;
const STACK_CAP = 6;

// ═══════════════════════════════════════════ УТИЛИТЫ
const el = (tag, cls, html) => { const d = document.createElement(tag || 'div'); if (cls) d.className = cls; if (html != null) d.innerHTML = html; return d; };
const hasClass = (n, c) => !!n && (' ' + n.className + ' ').indexOf(' ' + c + ' ') > -1;
const addClass = (n, c) => { if (n && !hasClass(n, c)) n.className += (n.className ? ' ' : '') + c; };
const removeClass = (n, c) => { if (!n) return; n.className = (' ' + n.className + ' ').replace(' ' + c + ' ', ' ').replace(/\s+/g, ' ').trim(); };
const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const isArr = Array.isArray;
const rnd = (n) => Math.floor(Math.random() * n);
const pickOne = (arr) => arr[rnd(arr.length)];
const uniq = (arr) => [...new Set(arr)];
const shuffle = (arr) => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = rnd(i + 1); const t = a[i]; a[i] = a[j]; a[j] = t; } return a; };
const once = (fn) => { let done = false; return function () { if (done) return; done = true; try { return fn.apply(null, arguments); } catch (e) { console.error('[Капсула]', e); } }; };
const vibrate = (ms) => { try { navigator.vibrate && navigator.vibrate(ms); } catch (e) {} };
const fmtRuntime = (min) => min ? (min >= 60 ? Math.floor(min / 60) + ' ч ' + (min % 60) + ' мин' : min + ' мин') : '';
const hexRgb = (hex) => { let h = String(hex || '').trim().replace('#', ''); if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2]; const n = parseInt(h, 16); if (isNaN(n) || h.length !== 6) return '255,255,255'; return ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255); };
const reducedMotion = () => { try { return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { return false; } };
const yearOf = (it) => parseInt(String((it && (it.release_date || it.first_air_date)) || '').slice(0, 4), 10) || 0;
const overlapRatio = (a, b) => { if (!a.length || !b.length) return 0; const s = new Set(b); let n = 0; a.forEach(x => { if (s.has(x)) n++; }); return n / a.length; };

const parallel = (tasks, done) => {
    const out = new Array(tasks.length);
    let next = 0, pending = 0, settled = 0, closed = false;
    const finish = () => { if (closed) return; closed = true; clearTimeout(guard); done(out); };
    const guard = setTimeout(finish, 15000);
    const pump = () => {
        if (closed) return;
        if (settled === tasks.length) return finish();
        while (!closed && pending < MAX_PARALLEL && next < tasks.length) {
            const index = next++; pending++;
            const step = once(result => {
                if (closed) return;
                out[index] = result; pending--; settled++; pump();
            });
            try { tasks[index](step); } catch (e) { step(null); }
        }
    };
    pump();
};


// ═══════════════════════════════════════════ ПРИЛОЖЕНИЕ
const App = { active: false, fallback: false, entered: false };

// ═══════════════════════════════════════════ ХРАНИЛИЩЕ (нужно раньше Perf)
const MEM = {};
const DIRTY = {};
let flushTimer = null;
const flushStore = () => {
    if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
    for (const k in DIRTY) {
        if (!Object.prototype.hasOwnProperty.call(DIRTY, k)) continue;
        try { localStorage.setItem('cm_' + k, JSON.stringify(MEM[k])); } catch (e) {}
        delete DIRTY[k];
    }
};
const PERSON_KEYS = new Set(['onboard', 'onb_skip', 'seen_v2', 'seen_gen', 'pcur', 'sortcur',
    'feedback_v1', 'avoid_genres', 'rec_mode', 'history_learning']);
const personStorageKey = (key) => {
    if (!PERSON_KEYS.has(key)) return key;
    const id = pGet('rec_person', 'default');
    return id === 'default' ? key : 'person_' + id + '_' + key;
};
const pGet = (key, def) => {
    key = personStorageKey(key);
    if (Object.prototype.hasOwnProperty.call(MEM, key)) return MEM[key] === undefined ? def : MEM[key];
    let v = def;
    try { const raw = localStorage.getItem('cm_' + key); if (raw != null) { const parsed = JSON.parse(raw); if (parsed !== null && parsed !== undefined) v = parsed; } } catch (e) {}
    MEM[key] = v;
    return v;
};
const pSet = (key, val) => { key = personStorageKey(key); MEM[key] = val; DIRTY[key] = 1; if (!flushTimer) flushTimer = setTimeout(flushStore, 300); };

// ═══════════════════════════════════════════ КЛАСС УСТРОЙСТВА
const Perf = {
    _tier: null,
    detect: () => {
        let t = 1;
        try {
            const cores = navigator.hardwareConcurrency || 2;
            const mem = navigator.deviceMemory || 2;
            const px = (window.screen && screen.width * screen.height) || 0;
            const tv = /smart-?tv|tizen|web0s|webos|netcast|hbbtv|aftb|aftm|bravia|philipstv|maple|dtv|nettv/i.test(navigator.userAgent || '');
            if (tv || cores <= 2 || mem <= 2) t = 0;
            else if (cores >= 8 && mem >= 8) t = 2;
            if (px > 4000000 && t === 2) t = 1;
        } catch (e) {}
        return t;
    },
    tier: () => {
        const mode = pGet('perf', 'auto');
        if (mode === 'light') return 0;
        if (mode === 'high') return 2;
        if (Perf._tier == null) Perf._tier = Perf.detect();
        return Perf._tier;
    },
    lite: () => Perf.tier() === 0,
    density: () => [0.3, 0.65, 1][Perf.tier()],
    fps: () => [16, 24, 30][Perf.tier()],
    dpr: () => { const d = window.devicePixelRatio || 1; return Math.min(d, [1, 1.25, 2][Perf.tier()]); }
};
const perfLabel = (v) => v === 'light' ? 'лёгкий' : v === 'high' ? 'максимум' : 'авто';
// размер капсулы и глубина запросов подстраиваются под устройство
const capsuleSize = () => 100; // размер набора не зависит от мощности устройства
// множитель плотности частиц поверх авто-определения устройства
const FX_DENSITY = [
    { v: 0.5, l: 'Тише' }, { v: 1, l: 'Обычная' }, { v: 1.6, l: 'Плотнее' },
    { v: 2.4, l: 'Густо' }, { v: 3.5, l: 'Максимум' }
];
const fxDensity = () => { const v = parseFloat(pGet('fx_density', 1)); return isNaN(v) ? 1 : clamp(v, 0.4, 4); };
const fxDensityLabel = () => {
    const cur = fxDensity();
    let best = FX_DENSITY[1];
    FX_DENSITY.forEach(o => { if (Math.abs(o.v - cur) < Math.abs(best.v - cur)) best = o; });
    return best.l.toLowerCase();
};
const depthScale = (n) => Math.max(1, Math.round(n * [0.6, 0.85, 1][Perf.tier()]));

// ═══════════════════════════════════════════ ЖУРНАЛ
const Log = {
    lines: [],
    push: (msg) => {
        let t = '';
        try { t = new Date().toTimeString().slice(0, 8) + ' '; } catch (e) {}
        Log.lines.push(t + String(msg).slice(0, 220));
        if (Log.lines.length > 70) Log.lines.shift();
        try { console.log('[Капсула]', msg); } catch (e) {}
    },
    env: () => {
        const L = [];
        try { L.push('версия плагина: ' + VERSION); } catch (e) {}
        try { L.push('источник: TMDb'); } catch (e) {}
        try { L.push('адреса: ' + Src.where()); } catch (e) {}
        try { L.push('база API: ' + String(Src.apiUrl('configuration', '')).slice(0, 90)); } catch (e) {}
        try { L.push('Lampa: ' + (window.Lampa ? 'есть' : 'НЕТ') + ', TMDB-модуль: ' + (window.Lampa && window.Lampa.TMDB ? 'есть' : 'нет') + ', Reguest: ' + (window.Lampa && window.Lampa.Reguest ? 'есть' : 'нет')); } catch (e) {}
        try { L.push('плотность эффектов: ×' + fxDensity() + ', тема под фильм: ' + (pGet('filmtheme', false) ? (FilmTheme.key || 'вкл, не совпало') : 'выкл')); } catch (e) {}
        try { L.push('класс устройства: ' + ['лёгкий', 'средний', 'максимум'][Perf.tier()] + ' (' + perfLabel(pGet('perf', 'auto')) + '), капсула ' + capsuleSize()); } catch (e) {}
        try { L.push('экран: ' + screen.width + 'x' + screen.height + ', окно: ' + (window.innerWidth || 0) + 'x' + (window.innerHeight || 0)); } catch (e) {}
        try {
            const has = (prop, val) => {
                try { if (window.CSS && CSS.supports && CSS.supports(prop, val)) return 'да'; } catch (e) {}
                try { const d = document.createElement('div'); const js = prop.replace(/-(.)/g, (m, c) => c.toUpperCase()); d.style[js] = val; return d.style[js] ? 'да' : 'нет'; } catch (e) {}
                return '?';
            };
            L.push('CSS inset: ' + has('inset', '0') + ', gap: ' + has('row-gap', '1px') + ', grid: ' + has('display', 'grid'));
        } catch (e) {}
        try { L.push('карточек в наборе: ' + View.list.length + ', глубина стека: ' + View.stack.length + ', история Lampa: ' + ((View.taste && View.taste.stats && View.taste.stats.total) || 0)); } catch (e) {}
        try {
            const st = Capsule.stats;
            if (st) L.push('последний отбор: пришло ' + st.got + ', годных ' + st.scored + ', в набор ' + st.final
                + ' (отсев: рейтинг ' + st.cut.rating + ', голоса ' + st.cut.votes + ', дубли ' + st.cut.dup + ', смотрел ' + st.cut.watched + ')');
            else L.push('последний отбор: не выполнялся');
        } catch (e) {}
        try { L.push('UA: ' + String(navigator.userAgent).slice(0, 120)); } catch (e) {}
        return L;
    },
    text: () => Log.env().concat(['', '— события —']).concat(Log.lines.length ? Log.lines : ['(пусто)']).join('\n'),
    show: () => {
        const html = Log.text().split('\n').map(l => esc(l)).join('<br>');
        Modal.open({
            title: 'Журнал',
            text: '<span style="font-size:.82em;line-height:1.5">' + html + '</span>',
            items: [
                { label: 'Проверить соединение', onSelect: () => Settings.diagnose() },
                { label: 'Скопировать в буфер', onSelect: () => Log.copy() },
                { label: 'Очистить', onSelect: () => { Log.lines = []; notify('Журнал очищен'); } },
                { label: 'Закрыть' }
            ]
        });
    },
    copy: () => {
        const txt = Log.text();
        let done = false;
        try { if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(txt); done = true; } } catch (e) {}
        if (!done) {
            try {
                const ta = document.createElement('textarea');
                ta.value = txt;
                ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
                document.body.appendChild(ta);
                ta.select();
                document.execCommand('copy');
                ta.parentNode.removeChild(ta);
                done = true;
            } catch (e) {}
        }
        notify(done ? 'Журнал скопирован' : 'Скопировать не вышло — перепишите с экрана');
    }
};
const onJsError = (e) => { if (e && e.message) Log.push('JS-ОШИБКА: ' + e.message + ' @' + (e.lineno || '?')); };
try { window.addEventListener('error', onJsError); } catch (e) {}

// ═══════════════════════════════════════════ ГОТОВНОСТЬ LAMPA
const LampaReady = { ready: false, waiters: [] };
const onLampaReady = (cb) => { if (LampaReady.ready) { cb(); return; } LampaReady.waiters.push(cb); };
const flushReady = once(() => { LampaReady.ready = true; const w = LampaReady.waiters; LampaReady.waiters = []; w.forEach(cb => { try { cb(); } catch (e) { console.error(e); } }); });
try { if (window.Lampa && window.Lampa.Listener && window.Lampa.Listener.follow) Lampa.Listener.follow('app', (e) => { if (e && e.type === 'ready') flushReady(); }); } catch (e) {}
setTimeout(flushReady, 2200);

const lampaGetRaw = (key, def) => { try { return window.Lampa.Storage.get(key, def); } catch (e) { return def; } };
const isEmptyish = (v) => v == null || (isArr(v) ? v.length === 0 : (typeof v === 'object' ? Object.keys(v).length === 0 : false));
const ownedGet = (key, def, cb, attempt) => {
    attempt = attempt || 0;
    const fire = once(cb);
    onLampaReady(() => {
        if (!(window.Lampa && window.Lampa.Storage && window.Lampa.Storage.get)) return fire(def);
        const value = lampaGetRaw(key, def);
        if (!isEmptyish(value) || attempt >= 4) return fire(value);
        setTimeout(() => ownedGet(key, def, fire, attempt + 1), 300);
    });
};

// ═══════════════════════════════════════════ СЕТЬ
const TMDB_DEFAULT = 'https://api.themoviedb.org/3';
const IMG_DEFAULT = 'https://image.tmdb.org';

const Src = {
    tmdb: () => { try { return (window.Lampa && window.Lampa.TMDB) || null; } catch (e) { return null; } },
    key: () => {
        const own = String(pGet('tmdb_key', '') || '').trim();
        if (own) return own;
        const t = Src.tmdb();
        try { if (t && t.key) { const k = t.key(); if (k) return k; } } catch (e) {}
        try { if (window.Lampa && window.Lampa.Storage) { const k = window.Lampa.Storage.get('tmdb_key', ''); if (k) return k; } } catch (e) {}
        return FALLBACK_KEY;
    },
    validUrl: (v) => { const t = String(v || '').trim().replace(/\/+$/, ''); return /^https?:\/\/[^\s\/]+/i.test(t) ? t : ''; },
    apiUrl: (path, query) => {
        const clean = String(path || '').replace(/^\/+/, '');
        const tail = clean + (query ? ('?' + query) : '');
        const custom = Src.validUrl(pGet('tmdb_proxy', ''));
        if (custom) return custom + '/' + tail;
        const t = Src.tmdb();
        if (t && t.api) { try { const u = t.api(tail); if (u) return u; } catch (e) {} }
        return TMDB_DEFAULT + '/' + tail;
    },
    imgUrl: (size, path) => {
        if (!path) return '';
        if (/^https?:\/\//i.test(path)) return path;
        const rel = 't/p/' + size + path;
        const custom = Src.validUrl(pGet('img_proxy', ''));
        if (custom) return custom + '/' + rel;
        const t = Src.tmdb();
        if (t && t.image) { try { const u = t.image(rel); if (u) return u; } catch (e) {} }
        return IMG_DEFAULT + '/' + rel;
    },
    where: () => {
        const raw = String(pGet('tmdb_proxy', '') || '').trim();
        if (raw && !Src.validUrl(raw)) return 'ПОЛЕ АДРЕСА ЗАПОЛНЕНО МУСОРОМ — игнорирую';
        if (raw) return 'свой прокси';
        const t = Src.tmdb();
        if (t && t.api) { try { return /themoviedb\.org/.test(t.api('')) ? 'Lampa, напрямую' : 'прокси Lampa'; } catch (e) {} }
        return 'напрямую';
    }
};

const Net = {
    mem: {}, memKeys: [], inflight: {}, queue: [], running: 0,
    failStreak: 0, lastErr: '',
    url: (path, params) => {
        let q = 'api_key=' + encodeURIComponent(Src.key()) + '&language=' + LANG;
        if (params) for (const k in params) { const v = params[k]; if (v != null && v !== '') q += '&' + k + '=' + encodeURIComponent(v); }
        return Src.apiUrl(path, q);
    },
    safe: (url) => String(url).replace(/api_key=[^&]*/, 'api_key=***'),
    _remember: (url, d) => {
        if (!Net.mem[url]) Net.memKeys.push(url);
        Net.mem[url] = { t: Date.now(), d };
        while (Net.memKeys.length > 320) { const old = Net.memKeys.shift(); delete Net.mem[old]; }
    },
    _deliver: (url, err, data) => {
        const hs = Net.inflight[url] || [];
        delete Net.inflight[url];
        hs.forEach(h => { try { if (err) { if (h.fail) h.fail(err); } else h.ok(data); } catch (e) { console.error('[Капсула]', e); } });
    },
    _xhr: (url, cb) => {
        const finish = once(cb);
        try {
            const xhr = new XMLHttpRequest();
            xhr.open('GET', url, true);
            xhr.timeout = 9000;
            xhr.onreadystatechange = () => {
                if (xhr.readyState !== 4) return;
                if (xhr.status >= 200 && xhr.status < 400) {
                    try { finish(null, JSON.parse(xhr.responseText)); } catch (e) { finish('parse'); }
                } else finish('http_' + xhr.status);
            };
            xhr.onerror = () => finish('net');
            xhr.ontimeout = () => finish('timeout');
            xhr.send();
        } catch (e) { finish('send'); }
    },
    _lampaNet: null,
    _lampaTried: false,
    _lampa: (url, cb) => {
        const finish = once(cb);
        try {
            if (!Net._lampaTried) {
                Net._lampaTried = true;
                if (window.Lampa && window.Lampa.Reguest) Net._lampaNet = new window.Lampa.Reguest();
            }
            if (!Net._lampaNet) return finish('unavailable');
            try { Net._lampaNet.timeout(9000); } catch (e) {}
            Net._lampaNet.silent(url,
                (d) => { if (d && typeof d === 'object') finish(null, d); else { try { finish(null, JSON.parse(d)); } catch (e) { finish('parse'); } } },
                () => finish('lampa_net'),
                false
            );
        } catch (e) { finish('lampa_throw'); }
    },
    _start: (url) => {
        Net.running++;
        const finish = once((err, data) => {
            Net.running--;
            if (err) { Net.failStreak++; Net.lastErr = err; Log.push('СЕТЬ ' + err + ' ← ' + Net.safe(url).slice(0, 110)); }
            else { Net.failStreak = 0; Net.lastErr = ''; Net._remember(url, data); }
            Net._deliver(url, err, data);
            Net._pump();
        });
        Net._lampa(url, (err1, d1) => {
            if (!err1) return finish(null, d1);
            Net._xhr(url, (err2, d2) => { if (!err2) return finish(null, d2); finish(err2 || err1); });
        });
    },
    _pump: () => { while (Net.running < MAX_PARALLEL && Net.queue.length) Net._start(Net.queue.shift()); },
    get: (path, params, ok, fail, opts) => {
        opts = opts || {};
        const url = Net.url(path, params);
        const cached = Net.mem[url];
        if (!opts.force && cached && Date.now() - cached.t < (opts.ttl || 900000)) { setTimeout(() => ok(cached.d), 0); return; }
        // Keep the cache slot: forced refresh must not duplicate eviction keys.
        if (Net.inflight[url]) { Net.inflight[url].push({ ok, fail }); return; }
        Net.inflight[url] = [{ ok, fail }];
        Net.queue.push(url);
        Net._pump();
    },
    abortPending: () => { const q = Net.queue; Net.queue = []; q.forEach(url => Net._deliver(url, 'aborted')); },
    drop: () => { Net.mem = {}; Net.memKeys = []; }
};

// одноразовая чистка мусора в полях адресов
(() => {
    ['tmdb_proxy', 'img_proxy'].forEach(k => {
        const raw = String(pGet(k, '') || '').trim();
        if (raw && !Src.validUrl(raw)) { pSet(k, ''); try { Log.push('НАСТРОЙКИ: поле «' + k + '» содержало не-адрес — очищено'); } catch (e) {} }
    });
})();

// ═══════════════════════════════════════════ ЖУРНАЛ ПОКАЗОВ
const Seen = {
    map: null,
    load: () => {
        if (Seen.map) return Seen.map;
        const raw = pGet('seen_v2', null);
        if (isArr(raw)) { Seen.map = {}; raw.forEach(id => { Seen.map[id] = 1; }); }
        else if (raw && typeof raw === 'object') Seen.map = raw;
        else Seen.map = {};
        return Seen.map;
    },
    gen: () => pGet('seen_gen', 0) | 0,
    ago: (id) => { const m = Seen.load(), g = m[id]; if (!g) return 0; return Math.max(1, Seen.gen() - g + 1); },
    add: (ids) => {
        if (!ids || !ids.length) return;
        const m = Seen.load();
        const g = Seen.gen() + 1;
        pSet('seen_gen', g);
        ids.forEach(id => { if (id) m[id] = g; });
        const keys = Object.keys(m);
        if (keys.length > SEEN_CAP) { keys.sort((a, b) => m[a] - m[b]); for (let i = 0; i < keys.length - SEEN_CAP; i++) delete m[keys[i]]; }
        pSet('seen_v2', m);
    },
    clear: () => { Seen.map = {}; pSet('seen_v2', {}); pSet('seen_gen', 0); },
    size: () => Object.keys(Seen.load()).length
};

// ═══════════════════════════════════════════ КУРСОР СТРАНИЦ
const Cursor = {
    take: (key, count, span) => {
        const all = pGet('pcur', {}) || {};
        const start = all[key] | 0;
        const out = [];
        for (let i = 0; i < count; i++) out.push(((start + i) % span) + 1);
        all[key] = (start + count) % span;
        pSet('pcur', all);
        return out;
    },
    skip: (key, n, span) => { const all = pGet('pcur', {}) || {}; all[key] = (((all[key] | 0) + n) % span); pSet('pcur', all); },
    reset: () => pSet('pcur', {})
};

// ═══════════════════════════════════════════ СЛОВАРИ
const GENRE_NAMES = { 28: 'Боевик', 12: 'Приключения', 16: 'Анимация', 35: 'Комедия', 80: 'Криминал', 99: 'Документальное', 18: 'Драма', 10751: 'Семейное', 14: 'Фэнтези', 36: 'История', 27: 'Ужасы', 10402: 'Музыка', 9648: 'Детектив', 10749: 'Мелодрама', 878: 'Фантастика', 53: 'Триллер', 10752: 'Война', 37: 'Вестерн', 10759: 'Боевик', 10765: 'Фантастика', 10768: 'Война', 10762: 'Детское', 10766: 'Драма', 10767: 'Шоу' };
const TV2MOVIE = { 10759: 28, 10765: 878, 10768: 10752, 10762: 10751, 10766: 18 };
const MOVIE2TV = { 28: 10759, 12: 10759, 878: 10765, 14: 10765, 10752: 10768, 10751: 10762, 10749: 18, 36: 18 };
const GENRE_SYN = [
    { m: [28], t: [10759], w: ['боевик', 'экшен', 'экшн', 'драка', 'перестрел', 'action'] },
    { m: [12], t: [10759], w: ['приключен', 'adventure'] },
    { m: [16], t: [16], w: ['мультф', 'мультик', 'мульт', 'анимац', 'animation'] },
    { m: [35], t: [35], w: ['комед', 'смешн', 'юмор', 'ржач', 'посмеят', 'весел', 'comedy'] },
    { m: [80], t: [80], w: ['криминал', 'мафи', 'бандит', 'гангстер', 'crime'] },
    { m: [99], t: [99], w: ['документал', 'научпоп', 'docum'] },
    { m: [18], t: [18], w: ['драм', 'грустн', 'жизненн', 'тяжел', 'drama'] },
    { m: [10751], t: [10751], w: ['семейн', 'детское', 'детск', 'детям', 'family', 'с ребенком', 'для детей'] },
    { m: [14], t: [10765], w: ['фэнтези', 'фентези', 'магия', 'волшебн', 'сказк', 'fantasy'] },
    { m: [27], t: [27], w: ['ужасы', 'ужас', 'страшн', 'хоррор', 'жутк', 'кошмар', 'horror', 'страх'] },
    { m: [9648], t: [9648], w: ['детектив', 'загадк', 'расследован', 'тайн', 'нуар', 'noir', 'mystery'] },
    { m: [10749], t: [18], w: ['мелодрам', 'романтик', 'романт', 'любов', 'romance'] },
    { m: [878], t: [10765], w: ['фантастик', 'sci-fi', 'scifi', 'киберпанк', 'инопланет'] },
    { m: [53], t: [53], w: ['триллер', 'напряж', 'саспенс', 'thriller'] },
    { m: [37], t: [37], w: ['вестерн', 'ковбо', 'western'] },
    { m: [10752], t: [10768], w: ['военн', 'война', 'фронт', 'war'] },
    { m: [10402], t: [10402], w: ['мюзикл', 'музыкальн', 'music'] },
    { m: [36], t: [18], w: ['историч', 'средневеков', 'history'] }
];
const TAG_SYN = [
    { w: ['космос', 'космич', 'space'], k: 'space' },
    { w: ['эксперимент', 'экспериментальн', 'experimental', 'авангард'], k: 'experimental' },
    { w: ['артхаус', 'арт-хаус', 'независимое', 'indie', 'independent'], k: 'independent film' },
    { w: ['классика', 'classic', 'классическое', 'шедевр', 'masterpiece'], k: 'classic film' },
    { w: ['нуар', 'noir'], k: 'film noir' },
    { w: ['сюрреализм', 'surreal', 'сюрреалистичн'], k: 'surrealism' },
    { w: ['минимализм', 'minimal', 'минималистичн'], k: 'minimalism' },
    { w: ['поэтичн', 'поэтический', 'poetic'], k: 'poetic' },
    { w: ['философ', 'философский', 'philosophical'], k: 'philosophical' },
    { w: ['психологич', 'psychological', 'психология'], k: 'psychological' },
    { w: ['зомби', 'zombie'], k: 'zombie' },
    { w: ['вампир', 'vampire'], k: 'vampire' },
    { w: ['супергеро', 'марвел', 'superhero'], k: 'superhero' },
    { w: ['апокалипс', 'постапок'], k: 'post-apocalyptic future' },
    { w: ['выживан', 'survival'], k: 'survival' },
    { w: ['маньяк', 'серийн убийц'], k: 'serial killer' },
    { w: ['во времени', 'time travel', 'путешествие во времени'], k: 'time travel' },
    { w: ['ограблен', 'heist'], k: 'heist' },
    { w: ['шпион', 'агент', 'spy'], k: 'spy' },
    { w: ['самура', 'samurai'], k: 'samurai' },
    { w: ['пират', 'pirate'], k: 'pirate' },
    { w: ['дракон', 'dragon'], k: 'dragon' },
    { w: ['робот', 'robot', 'киборг'], k: 'robot' },
    { w: ['нейросет', 'искусственн интеллект', 'искусственный интеллект'], k: 'artificial intelligence' },
    { w: ['аниме', 'anime'], k: 'anime' },
    { w: ['спорт', 'sport'], k: 'sport' },
    { w: ['гонк', 'racing'], k: 'car race' },
    { w: ['подводн', 'submarine'], k: 'submarine' },
    { w: ['динозавр', 'dinosaur'], k: 'dinosaur' },
    { w: ['школ', 'high school'], k: 'high school' },
    { w: ['тюрьм', 'prison'], k: 'prison' },
    { w: ['катастроф', 'disaster'], k: 'disaster' },
    { w: ['по реальным', 'реальн событ', 'based on true'], k: 'based on true story' },
    { w: ['по книге', 'по роману', 'based on novel'], k: 'based on novel' },
    { w: ['монстр', 'monster'], k: 'monster' },
    { w: ['рождеств', 'новогодн'], k: 'christmas' },
    { w: ['неоновый', 'neon', 'киберпанк', 'cyberpunk'], k: 'cyberpunk' },
    { w: ['винтаж', 'vintage', 'ретро', 'retro'], k: 'period piece' },
    { w: ['медленное', 'slow cinema'], k: 'slow cinema' },
    { w: ['док', 'documentary'], k: 'documentary style' }
];
const STOP_WORDS = ['фильм', 'фильмы', 'кино', 'сериал', 'сериалы', 'смотреть', 'найди', 'найти', 'хочу', 'что-то', 'что', 'нибудь', 'посоветуй', 'подбери', 'самые', 'самый', 'какой', 'какие', 'типа', 'вроде', 'про', 'для', 'или', 'без', 'кроме', 'режиссер', 'режиссёр', 'актер', 'актёр', 'участием', 'the', 'and', 'with'];
const MOODS = [
    { label: '🎬 Отключить голову', q: 'лёгкая комедия приключения' },
    { label: '😱 Держать в напряжении', q: 'напряжённый триллер детектив' },
    { label: '🧠 Подумать', q: 'умная драма философский' },
    { label: '🚀 Улететь подальше', q: 'космическая фантастика фэнтези' },
    { label: '👻 Испугаться', q: 'ужасы хоррор' },
    { label: '😢 Заплакать', q: 'сильная драма по реальным событиям' },
    { label: '💑 Вдвоём', q: 'мелодрама романтика' },
    { label: '👨‍👧 С детьми', q: 'семейное мультфильм анимация' },
    { label: '⚔️ Боевики', q: 'боевик экшен' },
    { label: '🖼 Артхаус', q: 'экспериментальное независимое кино' },
    { label: '🎞 Классика', q: 'классическое кино шедевр' },
    { label: '🕵️ Детективы', q: 'детектив расследование нуар' }
];
const ONB_GENRES = [28, 12, 16, 35, 80, 18, 10751, 14, 27, 9648, 10749, 878, 53, 37, 99];
const DECADES = [{ y: 0, l: '🎲 Любое' }, { y: 1975, l: '70-е' }, { y: 1985, l: '80-е' }, { y: 1995, l: '90-е' }, { y: 2005, l: '2000-е' }, { y: 2015, l: '2010-е' }, { y: 2023, l: '2020-е' }];

// ═══════════════════════════════════════════ ИСТОРИЯ LAMPA

const mediaType = (m) => {
    if (!m) return null;
    if (m.media_type === 'person') return null;
    if (m.media_type === 'tv' || m.type === 'tv' || m.method === 'tv' || m.first_air_date || m.original_name) return 'tv';
    if (m.media_type === 'movie' || m.type === 'movie' || m.method === 'movie' || m.release_date || m.title) return 'movie';
    return null;
};
const mediaKey = (m) => (mediaType(m) || 'movie') + '_' + m.id;
const genreList = (m) => uniq(((m && (m.genre_ids || m.genres)) || []).map(g => Number(g.id || g)).filter(Boolean));
const canonicalGenres = (m) => uniq(genreList(m).map(g => TV2MOVIE[g] || g));
const WEIGHTS = { like: 7, book: 1.4, scheduled: 1, history: .25, wath: .5,
    look: .7, viewed: .6, continued: .8, thrown: -4 };
const Person = {
    all: () => pGet('rec_people', [{ id: 'default', name: 'Основной' }]),
    current: () => Person.all().find(p => p.id === pGet('rec_person', 'default')) || Person.all()[0],
    history: () => !!pGet('history_learning', pGet('rec_person', 'default') === 'default'),
    switchTo: (id) => {
        if (!Person.all().some(p => p.id === id)) return;
        View.cancel(true); View.commitShown(); flushStore();
        pSet('rec_person', id); Seen.map = null; Taste.invalidate();
        View.list = []; View.prevIds = []; View.stack = []; View.taste = null;
        Onboard.active = false; View.boot(false);
    }
};
// A reaction is an explicit statement. Scrolling/opening a full card never writes one.
const Feedback = {
    all: () => pGet('feedback_v1', {}) || {},
    get: (m) => m ? Feedback.all()[mediaKey(m)] : null,
    set: (m, kind) => {
        if (!m || !m.id) return;
        const data = Feedback.all(), key = mediaKey(m), old = data[key];
        if (!kind) delete data[key];
        else data[key] = { kind, at: Date.now(), card: {
            id: m.id, media_type: mediaType(m) || 'movie', title: m.title || '', name: m.name || '',
            genre_ids: genreList(m), release_date: m.release_date || '', first_air_date: m.first_air_date || '',
            original_language: m.original_language || '', vote_average: m.vote_average || 0
        } };
        const keys = Object.keys(data).sort((a,b) => data[b].at - data[a].at);
        keys.slice(1200).forEach(k => delete data[k]);
        pSet('feedback_v1', data); Taste.invalidate();
        Feedback.last = { key, old, person: pGet('rec_person', 'default') };
    },
    undo: () => {
        const last = Feedback.last;
        if (!last || last.person !== pGet('rec_person', 'default')) return;
        const data = Feedback.all();
        if (last.old) data[last.key] = last.old; else delete data[last.key];
        pSet('feedback_v1', data); Feedback.last = null; Taste.invalidate();
    }
};
const History = {
    read: (cb) => {
        const fire = once(cb);
        if (!Person.history()) return fire([]);
        onLampaReady(() => {
            let fav = lampaGetRaw('favorite', {}) || {};
            try { if (Lampa.Favorite && Lampa.Favorite.full) fav = Lampa.Favorite.full() || fav; } catch (e) {}
            const cards = {}, byId = {}, acc = {};
            const addCard = c => {
                if (!c || !c.id || !mediaType(c) || (c.source && c.source !== 'tmdb')) return;
                const key = mediaKey(c); cards[key] = c;
                if (!byId[c.id]) byId[c.id] = [];
                if (byId[c.id].indexOf(key) < 0) byId[c.id].push(key);
            };
            (isArr(fav.card) ? fav.card : []).forEach(addCard);
            const lists = {};
            Object.keys(WEIGHTS).forEach(kind => {
                let list = null;
                // Favorite.get also supports synchronized account bookmarks in Lampa.
                try { if (Lampa.Favorite && Lampa.Favorite.get) list = Lampa.Favorite.get({ type: kind }); } catch (e) {}
                if (!isArr(list) || !list.length) list = isArr(fav[kind]) ? fav[kind] : lampaGetRaw(kind, []);
                lists[kind] = isArr(list) ? list.slice(0, 500) : [];
                lists[kind].forEach(addCard);
            });
            Object.keys(lists).forEach(kind => lists[kind].forEach((entry, i) => {
                let card = entry && typeof entry === 'object' ? entry : null;
                if (!card) {
                    const keys = byId[entry] || [];
                    // https://github.com/yumata/lampa-source/blob/main/src/core/favorite.js
                    // A bare ambiguous ID cannot safely identify a movie or a series.
                    if (keys.length !== 1) return;
                    card = cards[keys[0]];
                }
                if (!card || !card.id || !mediaType(card) || (card.source && card.source !== 'tmdb')) return;
                const key = mediaKey(card);
                const rec = acc[key] || (acc[key] = { id: Number(card.id), type: mediaType(card), card, w: 0, positive: 0, negative: 0, watched: false, signals: {} });
                if (rec.signals[kind]) return;
                rec.signals[kind] = true;
                const w = WEIGHTS[kind] * (.65 + .35 * Math.exp(-i / 80));
                // Same title in several lists is one observation, not several votes.
                rec.positive = Math.max(rec.positive, w);
                rec.negative = Math.min(rec.negative, w);
                if (kind === 'viewed' || kind === 'look' || kind === 'continued' || kind === 'wath') rec.watched = true;
                rec.w = rec.negative < 0 ? rec.negative : rec.positive;
            }));
            fire(Object.keys(acc).map(k => acc[k]).sort((a,b) => Math.abs(b.w) - Math.abs(a.w)));
        });
    },
    stats: (cb) => History.read(items => cb({ total: items.length, withCards: items.length, timeline: 0, items }))
};


// ═══════════════════════════════════════════ ОНБОРДИНГ
const Onboard = {
    active: false, step: 0, moviesList: [], data: null,
    profile: () => pGet('onboard', null),
    save: (p) => pSet('onboard', p),
    skipped: () => !!pGet('onb_skip', false),
    toTaste: (prof, stats) => ({
        empty: false, onboard: true,
        count: ((prof.seeds && prof.seeds.length) || 0) + Object.keys(prof.g || {}).length,
        known: 0,
        genres: Object.keys(prof.g || {}).map(id => ({ id: parseInt(id, 10), score: prof.g[id], name: GENRE_NAMES[id] || '' })).sort((a, b) => b.score - a.score),
        keywords: [], era: prof.era || 0, avgVote: 6.9,
        seeds: prof.seeds || [], watched: {},
        stats: stats || { total: 0, withCards: 0, timeline: 0, items: [] }
    }),
    cols: () => (window.innerWidth || 1280) <= 700 ? 3 : 4,
    start: () => {
        Onboard.active = true; Onboard.step = 0;
        Onboard.data = { movies: [], genres: [], decade: 0, mood: null };
        View.loading('ТЕСТ ПРЕДПОЧТЕНИЙ');
        const shown = once((list) => { if (!Onboard.active) return; Onboard.moviesList = (list || []).slice(0, 12); Onboard.renderStep(); });
        Net.get('/trending/all/week', { page: 1 }, (d) => shown(markList(d && d.results, null, 'onb')), () => shown([]));
    },
    // выход из теста никогда не должен зацикливать запуск теста
    leave: () => {
        Onboard.active = false;
        if (!Onboard.profile()) pSet('onb_skip', true);
        View.boot(false);
    },
    back: () => { if (Onboard.step > 0) { Onboard.step--; Onboard.renderStep(); return; } Onboard.leave(); },
    next: () => { Onboard.step = Math.min(3, Onboard.step + 1); Onboard.renderStep(); },
    finish: () => {
        const d = Onboard.data, g = {};
        d.movies.forEach(m => (m.genre_ids || []).forEach(id => { const gid = TV2MOVIE[id] || id; g[gid] = (g[gid] || 0) + 3; }));
        d.genres.forEach(id => { const gid = TV2MOVIE[id] || id; g[gid] = (g[gid] || 0) + 2.5; });
        // Настроение вечера не превращается в постоянное предпочтение.
        Onboard.save({ v: 2, g, era: d.decade, seeds: d.movies.slice(0, 12).map(m => ({ id: m.id, type: mediaType(m), title: m.title || m.name, card: m })) });
        pSet('onb_skip', true);
        Onboard.active = false;
        Taste.invalidate();
        vibrate(30);
        notify('Предпочтения сохранены');
        if (d.mood) UI.find(d.mood.q, d.mood.label, 'mood'); else View.refreshCapsule(true);
    },
    renderStep: () => {
        if (!View.stage) return;
        View.dropCard();
        View.stage.innerHTML = ''; Nav.reset();
        const outer = el('div', 'cm-onb');
        const wrap = el('div', 'cm-onb-inner');
        outer.appendChild(wrap);
        const s = Onboard.step, d = Onboard.data;
        wrap.appendChild(el('div', 'cm-onb-head cm-mono', 'ШАГ ' + (s + 1) + ' / 4'));
        let firstRow = null;
        if (s === 0) {
            wrap.appendChild(el('div', 'cm-onb-title', 'Какие фильмы вам понравились?'));
            wrap.appendChild(el('div', 'cm-onb-sub', 'Отметьте только то, что действительно понравилось. Незнакомое пропустите.'));
            const grid = el('div', 'cm-onb-grid');
            const cards = Onboard.moviesList.map(m => {
                const c = el('div', 'cm-onb-card' + (d.movies.some(x => mediaKey(x) === mediaKey(m)) ? ' sel' : ''));
                if (m.poster_path) {
                    const im = el('img');
                    im.loading = 'lazy'; im.decoding = 'async'; im.alt = '';
                    im.onerror = () => { im.style.display = 'none'; };
                    im.src = Src.imgUrl('w342', m.poster_path);
                    c.appendChild(im);
                }
                c.appendChild(el('div', 't', esc(m.title || m.name || '')));
                c._cmAction = () => { const i = d.movies.findIndex(x => mediaKey(x) === mediaKey(m)); if (i >= 0) { d.movies.splice(i, 1); removeClass(c, 'sel'); } else { d.movies.push(m); addClass(c, 'sel'); } vibrate(10); };
                return c;
            });
            if (cards.length) { cards.forEach(c => grid.appendChild(c)); wrap.appendChild(grid); firstRow = Nav.addRow(cards, 'cards', Onboard.cols()); }
            else wrap.appendChild(el('div', 'cm-onb-sub', 'Постеры не загрузились — просто идите дальше.'));
        }
        if (s === 1) {
            wrap.appendChild(el('div', 'cm-onb-title', 'Какие жанры нравятся?'));
            wrap.appendChild(el('div', 'cm-onb-sub', 'Выберите любимые жанры. Не нужно отмечать всё подряд.'));
            const chips = el('div', 'cm-chips cm-onb-chips');
            const nodes = ONB_GENRES.map(gid => { const c = el('div', 'cm-chip' + (d.genres.indexOf(gid) >= 0 ? ' sel' : ''), esc(GENRE_NAMES[gid] || '')); c._cmAction = () => { const i = d.genres.indexOf(gid); if (i >= 0) { d.genres.splice(i, 1); removeClass(c, 'sel'); } else { d.genres.push(gid); addClass(c, 'sel'); } vibrate(10); }; return c; });
            nodes.forEach(n => chips.appendChild(n)); wrap.appendChild(chips);
            firstRow = Nav.addRow(nodes, 'chips', 2);
        }
        if (s === 2) {
            wrap.appendChild(el('div', 'cm-onb-title', 'Какая эпоха ближе?'));
            wrap.appendChild(el('div', 'cm-onb-sub', 'Необязательно — этот шаг можно пропустить.'));
            const chips = el('div', 'cm-chips cm-onb-chips');
            const nodes = DECADES.map(dc => { const c = el('div', 'cm-chip' + (d.decade === dc.y ? ' sel' : ''), esc(dc.l)); c._cmAction = () => { d.decade = dc.y; nodes.forEach(n => removeClass(n, 'sel')); addClass(c, 'sel'); vibrate(10); }; return c; });
            nodes.forEach(n => chips.appendChild(n)); wrap.appendChild(chips);
            firstRow = Nav.addRow(nodes, 'chips', 2);
        }
        if (s === 3) {
            wrap.appendChild(el('div', 'cm-onb-title', 'Настроение на сегодняшний вечер?'));
            wrap.appendChild(el('div', 'cm-onb-sub', 'Соберём стартовый набор под него.'));
            const chips = el('div', 'cm-chips cm-onb-chips');
            const nodes = MOODS.map(md => { const c = el('div', 'cm-chip' + (d.mood === md ? ' sel' : ''), esc(md.label)); c._cmAction = () => { d.mood = (d.mood === md) ? null : md; nodes.forEach(n => removeClass(n, 'sel')); if (d.mood) addClass(c, 'sel'); vibrate(10); }; return c; });
            nodes.forEach(n => chips.appendChild(n)); wrap.appendChild(chips);
            firstRow = Nav.addRow(nodes, 'chips', 2);
        }
        const foot = [];
        const mkBtn = (label, primary, action) => { const b = el('div', 'cm-act' + (primary ? ' primary' : ''), esc(label)); b._cmAction = action; foot.push(b); return b; };
        mkBtn(s > 0 ? 'Назад' : 'Выйти', false, () => Onboard.back());
        mkBtn('Пропустить', false, () => (s === 3 ? Onboard.finish() : Onboard.next()));
        if (s < 3) mkBtn('Далее', true, () => Onboard.next()); else mkBtn('Готово', true, () => Onboard.finish());
        const footRow = el('div', 'cm-onb-foot');
        foot.forEach(b => footRow.appendChild(b));
        wrap.appendChild(footRow);
        View.stage.appendChild(outer);
        Nav.addRow(foot, 'foot');
        Nav.setFocus(firstRow != null ? 0 : Nav.rows.length - 1, 0, true);
    }
};

// ═══════════════════════════════════════════ МОДЕЛЬ ВКУСА

const Taste = {
    cache: null, profile: null, profileAt: 0, revision: 0, TTL: 300000,
    invalidate: () => { Taste.profile = null; Taste.profileAt = 0; Taste.revision++; },
    loadCache: () => { Taste.cache = Taste.cache || pGet('dcache', {}) || {}; return Taste.cache; },
    saveCache: () => {
        const c = Taste.loadCache(), keys = Object.keys(c).sort((a,b) => (c[b].at || 0) - (c[a].at || 0));
        keys.slice(320).forEach(k => delete c[k]); pSet('dcache', c);
    },
    remember: (m, d) => {
        const kws = (d.keywords && (d.keywords.keywords || d.keywords.results)) || [];
        const credits = d.credits || {};
        const people = (credits.crew || []).filter(p => p.job === 'Director').concat((d.created_by || []));
        const out = { g: genreList(d), k: kws.slice(0, 24).map(k => [k.id, k.name]),
            p: people.slice(0, 4).map(p => [p.id, p.name]),
            cast: (credits.cast || []).slice(0, 4).map(p => [p.id, p.name]),
            v: d.vote_average || 0, y: yearOf(d), n: d.title || d.name || '',
            t: mediaType(m), lang: d.original_language || '', collection: d.belongs_to_collection ? d.belongs_to_collection.id : 0,
            full: !!(d.keywords && d.credits), at: Date.now() };
        Taste.loadCache()[mediaKey(m)] = out; return out;
    },
    enrich: (items, limit, cb) => {
        const cache = Taste.loadCache(), need = [];
        items.forEach(it => {
            const key = mediaKey(it), d = cache[key];
            if (!d && it.card) cache[key] = { g: genreList(it.card), k: [], p: [], cast: [],
                v: it.card.vote_average || 0, y: yearOf(it.card), n: it.card.title || it.card.name || '',
                t: it.type, lang: it.card.original_language || '', at: Date.now() };
            if (need.length < limit && (!d || !d.full || Date.now() - (d.at || 0) > 2592000000)) need.push(it);
        });
        parallel(need.map(it => done => Net.get('/' + it.type + '/' + it.id,
            { append_to_response: 'keywords,credits' }, d => {
                if (d && d.id) Taste.remember(it, d); done(true);
            }, () => done(false), { ttl: 604800000 })), () => { Taste.saveCache(); cb(cache); });
    },
    compose: (stats, cache) => {
        const records = {}, onboard = Onboard.profile(), feedback = Feedback.all();
        (stats.items || []).forEach(it => records[mediaKey(it)] = Object.assign({}, it));
        // Only the new test asks about enjoyment. Legacy "familiar" seeds are not likes.
        if (onboard && onboard.v === 2) (onboard.seeds || []).forEach(seed => {
            const key = mediaKey(seed), old = records[key] || {};
            if ((feedback[key] && feedback[key].kind === 'dislike') || old.w < 0) return;
            records[key] = Object.assign({}, old, { id: seed.id, type: seed.type, card: seed.card || old.card,
                w: Math.max(old.w || 0, 6), explicit: true, watched: true });
        });
        Object.keys(feedback).forEach(key => {
            const f = feedback[key], c = f.card;
            if (!c || !c.id) return;
            const decay = .55 + .45 * Math.exp(-Math.max(0, Date.now() - f.at) / (180 * 86400000));
            records[key] = { id: c.id, type: mediaType(c), card: c,
                w: (f.kind === 'like' ? 10 : f.kind === 'dislike' ? -7 : 0) * decay,
                explicit: true, watched: f.kind === 'watched' || f.kind === 'like', feedback: f.kind };
        });
        const gPos = {}, gNeg = {}, kPos = {}, kNeg = {}, pPos = {}, pNeg = {}, lang = {}, typeWeights = {},
            namesK = {}, namesP = {}, years = [], seeds = [], watched = {}, blocked = {};
        let positives = 0, explicit = 0;
        const weakTotal = Object.keys(records).reduce((n,k)=>n+(records[k].w>0 && records[k].w<2 && !records[k].explicit ? records[k].w : 0),0);
        const weakScale = Math.min(1,8/Math.max(1,weakTotal));
        const add = (map, key, v) => { map[key] = (map[key] || 0) + v; };
        Object.keys(records).forEach(key => {
            const it = records[key], c = it.card || {}, d = cache[key] || { g: genreList(c), k: [], p: [], cast: [], y: yearOf(c), lang: c.original_language, n: c.title || c.name };
            if (it.watched) watched[key] = true;
            if (it.w < 0 || it.feedback === 'dislike') blocked[key] = true;
            if (!it.w) return;
            const w = Math.abs(it.w)*(it.w>0 && it.w<2 && !it.explicit ? weakScale : 1), positive = it.w > 0;
            const genres = uniq((d.g || []).map(g => TV2MOVIE[g] || g));
            genres.forEach(g => add(positive ? gPos : gNeg, g, w / Math.sqrt(Math.max(1, genres.length))));
            (d.k || []).forEach(pair => { add(positive ? kPos : kNeg, pair[0], w); namesK[pair[0]] = pair[1]; });
            (d.p || []).forEach(pair => { add(positive ? pPos : pNeg, pair[0], w); namesP[pair[0]] = pair[1]; });
            if (positive) {
                positives++; if (it.explicit || it.w >= 4) explicit++;
                add(typeWeights, it.type, w); if (d.lang) add(lang, d.lang, w);
                if (d.y) years.push({ y: d.y, w });
                if (it.w >= 1) seeds.push({ id: it.id, type: it.type, title: d.n || c.title || c.name || '', weight: it.w, genres });
            }
        });
        if (onboard && onboard.g) Object.keys(onboard.g).forEach(g => add(gPos, g, Number(onboard.g[g]) * (onboard.v === 2 ? 1.8 : .6)));
        const make = (pos, neg, names, factor) => Object.keys(pos).map(id => ({ id: Number(id),
            score: Math.max(0, pos[id] - (neg[id] || 0) * factor), name: names[id] || '' })).filter(x => x.score > .1).sort((a,b) => b.score - a.score);
        const genres = make(gPos, gNeg, GENRE_NAMES, .65);
        const keywords = make(kPos, kNeg, namesK, .8).slice(0, 30);
        const people = make(pPos, pNeg, namesP, .65).slice(0, 12);
        const avoid = pGet('avoid_genres', []);
        const allowedGenres = genres.filter(g => avoid.indexOf(g.id) < 0);
        years.sort((a,b) => a.y - b.y);
        const totalY = years.reduce((n,y) => n+y.w, 0); let sumY = 0, era = 0;
        years.some(y => { sumY += y.w; if (sumY >= totalY / 2) { era = y.y; return true; } return false; });
        seeds.sort((a,b) => b.weight - a.weight);
        const diversified = [];
        while (seeds.length && diversified.length < 12) {
            let best = 0, score = -Infinity;
            seeds.forEach((a,i) => {
                const redundancy = diversified.reduce((n,b) => Math.max(n, overlapRatio(a.genres, b.genres)), 0);
                const value = a.weight * (1 - .3 * redundancy);
                if (value > score) { score = value; best = i; }
            });
            diversified.push(seeds.splice(best,1)[0]);
        }
        const hasTaste = !!(allowedGenres.length || keywords.length || diversified.length);
        return { empty: !hasTaste, fallback: !hasTaste, count: Object.keys(records).length, known: positives,
            confidence: Math.min(1, (explicit * 3 + positives) / 28), explicit,
            genres: allowedGenres, negativeGenres: gNeg, positiveGenres: gPos, keywords, people, languages: lang, typeWeights,
            seeds: diversified, watched, blocked, avoid, era: (onboard && onboard.era) || era, avgVote: 6.6, stats };
    },
    build: (cb, force) => {
        const rev = Taste.revision, person = pGet('rec_person', 'default');
        if (!force && Taste.profile && Date.now() - Taste.profileAt < Taste.TTL) return cb(Taste.profile);
        const store = p => {
            if (rev === Taste.revision && person === pGet('rec_person', 'default')) { Taste.profile = p; Taste.profileAt = Date.now(); }
            cb(p);
        };
        History.stats(stats => {
            const initial = Taste.compose(stats, Taste.loadCache());
            const candidates = initial.seeds.concat(Object.keys(Feedback.all()).map(k => {
                const f = Feedback.all()[k]; return { id: f.card.id, type: mediaType(f.card), card: f.card };
            })).concat(stats.items || []);
            const seen = {}, unique = candidates.filter(it => { const key = mediaKey(it); if (seen[key]) return false; seen[key] = 1; return true; });
            Taste.enrich(unique, Perf.lite() ? 4 : 6, cache => {
                if (person !== pGet('rec_person', 'default')) return cb(initial);
                store(Taste.compose(stats, cache));
            });
        });
    }
};


// ═══════════════════════════════════════════ СБОРКА КАПСУЛЫ
// ВАЖНО: возвращаем КОПИИ. Объекты из кэша сети мутировать нельзя —
// иначе _src/_via/_score/_reasonText залипают между разными сборками.
const markList = (list, type, src, via) => {
    if (!isArr(list)) return [];
    const out = [];
    for (let i = 0; i < list.length; i++) {
        const raw = list[i];
        if (!raw || !raw.poster_path || raw.adult) continue;
        const mt = raw.media_type || type || (raw.name && !raw.title ? 'tv' : 'movie');
        if (mt !== 'movie' && mt !== 'tv') continue;
        if (!raw.id) continue;
        out.push({
            id: raw.id,
            media_type: mt,
            title: raw.title || '',
            name: raw.name || '',
            original_title: raw.original_title || raw.original_name || '',
            poster_path: raw.poster_path,
            backdrop_path: raw.backdrop_path || '',
            overview: raw.overview || '',
            vote_average: raw.vote_average || 0,
            vote_count: raw.vote_count || 0,
            release_date: raw.release_date || '',
            first_air_date: raw.first_air_date || '',
            genre_ids: genreList(raw).slice(0, 8),
            original_language: raw.original_language || '',
            popularity: raw.popularity || 0,
            _src: src, _via: via || null
        });
    }
    return out;
};

const SORTS = ['popularity.desc', 'vote_count.desc', 'vote_average.desc'];
const Recommendation = {
    mode: () => pGet('rec_mode', 'balanced'),
    exploration: () => ({ precise: 0, balanced: .08, curious: .18 }[Recommendation.mode()] || 0),
    allowed: (it, taste, search) => {
        if (!it || !it.id || it.adult) return false;
        const key = mediaKey(it), f = Feedback.get(it);
        if ((f && f.kind === 'dislike') || (taste.blocked && taste.blocked[key])) return false;
        if (!search && ((f && (f.kind === 'watched' || f.kind === 'like')) || (taste.watched && taste.watched[key]))) return false;
        const avoid = pGet('avoid_genres', []);
        if (canonicalGenres(it).some(g => avoid.indexOf(g) >= 0)) return false;
        const date = it.release_date || it.first_air_date;
        if (!search && date && date > new Date().toISOString().slice(0,10)) return false;
        return true;
    },
    merge: all => {
        const map = {}, order = [];
        all.forEach(raw => {
            if (!raw || !raw.id) return;
            const key = mediaKey(raw);
            let it = map[key];
            if (!it) { it = map[key] = Object.assign({}, raw, { _evidence: [], _sources: {} }); order.push(it); }
            const evidence = raw._evidence || [{src:raw._src,via:raw._via || {}}];
            evidence.forEach(e=>{
                const via=e.via || {},evidenceKey=(e.src || 'x')+(via.seedKey?':'+via.seedKey:'');
                if(it._sources[evidenceKey])return;
                it._sources[evidenceKey]=true;it._evidence.push({src:e.src,via});
            });
        });
        return order;
    },
    score: (it, taste) => {
        const genres = canonicalGenres(it), pref = taste.genres || [], maxG = pref.length ? pref[0].score : 1;
        let affinity = 0, negative = 0;
        const matches = [];
        pref.forEach(g => { if (genres.indexOf(g.id) >= 0) { matches.push(g.name); affinity += Math.sqrt(g.score / Math.max(.1,maxG)); } });
        affinity /= Math.sqrt(Math.max(1,genres.length));
        genres.forEach(g => {
            const n = (taste.negativeGenres || {})[g] || 0, p = (taste.positiveGenres || {})[g] || 0;
            if (n) negative += n / (n + p + 6);
        });
        negative /= Math.sqrt(Math.max(1,genres.length));
        const d = Taste.loadCache()[mediaKey(it)] || {};
        const keywordHits = (taste.keywords || []).filter(k => (d.k || []).some(x => x[0] === k.id));
        const peopleHits = (taste.people || []).filter(p => (d.p || []).some(x => x[0] === p.id));
        const evidence = it._evidence || [{ src: it._src, via: it._via || {} }];
        const seedEvidence = evidence.filter(e => e.src === 'seed' && e.via.seed);
        const kwSource = evidence.some(e => e.src === 'keyword');
        const seedBonus = seedEvidence.length ? 7 + Math.min(2,seedEvidence.length-1)*1.5 : 0;
        const kwBonus = keywordHits.length ? Math.min(7,keywordHits.length*2.5) : kwSource ? 3 : 0;
        const peopleBonus = peopleHits.length ? Math.min(5,peopleHits.length*3) : 0;
        const count = Math.max(0,Number(it.vote_count) || 0), rating = clamp(Number(it.vote_average) || 0,0,10);
        const bayes = (rating*count + 6.5*180)/(count+180);
        let score = affinity*14 + seedBonus + kwBonus + peopleBonus - negative*9 + (bayes-5)*2;
        const tw = taste.typeWeights || {}, totalT = (tw.movie || 0)+(tw.tv || 0);
        if (totalT) score += 1.5*(tw[it.media_type] || 0)/totalT;
        if (taste.era && yearOf(it)) score += 1.2*Math.exp(-Math.abs(yearOf(it)-taste.era)/18);
        const langs = taste.languages || {}, langTotal = Object.keys(langs).reduce((n,k)=>n+langs[k],0);
        if (langTotal && it.original_language) score += (langs[it.original_language] || 0)/langTotal;
        const ago = Seen.ago(mediaKey(it));
        if (ago) score -= ago === 1 ? 4 : ago === 2 ? 2.5 : 1;
        if (View.shown[mediaKey(it)]) score -= 4;
        if ((View.prevIds || []).indexOf(mediaKey(it)) >= 0) score -= 1.5;
        if (!it.overview) score -= .5;
        // Unknown tastes get an honest editorial start, without invented genre preferences.
        const personal = !!(matches.length || seedEvidence.length || kwBonus || peopleBonus);
        let reason = '';
        if (seedEvidence.length) reason = 'По рекомендациям к «' + seedEvidence[0].via.seed + '»';
        else if (peopleHits.length) reason = 'Знакомый автор: ' + peopleHits[0].name;
        else if (keywordHits.length) reason = 'Общие темы с понравившимися фильмами';
        else if (matches.length) reason = 'По вашим предпочтениям: ' + matches.slice(0,2).join(', ');
        else if (kwSource) reason = 'По темам вашего профиля';
        else reason = taste.empty ? 'Стартовый подбор — отметьте, что вам нравится' : 'Новый для вас жанр — пробуем расширить подбор';
        return { score, personal, affinity, negative, reason, collection: d.collection || 0 };
    }
};
const Capsule = {
    stats: null,
    build: (taste, opts, cb) => {
        opts = opts || {};
        const token = View.token, person = pGet('rec_person','default'), force = !!opts.force;
        const valid = () => token === View.token && person === pGet('rec_person','default');
        const tasks = [], all = [], requests = {};
        const fetch = (path, base, type, src, via, page) => {
            const params = Object.assign({ page: page || 1, include_adult: false },base);
            const key = path + JSON.stringify(params); if (requests[key]) return;
            requests[key] = 1;
            tasks.push(done => { if (!valid()) return done([]); Net.get(path,params,d => done(markList(d && d.results,type,src,via)),()=>done([])); });
        };
        const page = key => Cursor.take('v21_' + key,1,force ? 8 : 5)[0];
        const top = (taste.genres || []).slice(0,4);
        const seeds = (taste.seeds || []).slice(0,8);
        const shift = force && seeds.length > 4 ? (Seen.gen() % Math.max(1,seeds.length-3)) : 0;
        seeds.slice(shift,shift+(Perf.lite()?3:4)).forEach(seed => fetch('/'+seed.type+'/'+seed.id+'/recommendations',{},seed.type,'seed',
            { seed: seed.title, seedKey: seed.type+'_'+seed.id },page('seed_'+seed.type+'_'+seed.id)));
        top.forEach((g,i) => {
            // TMDb discover: https://developer.themoviedb.org/reference/discover-movie
            // Separate genre routes avoid demanding every favorite genre simultaneously.
            const types = i < 2 ? ['movie','tv'] : ['movie'];
            types.forEach(type => {
                const mapped = type === 'tv' ? tvGenre(g.id) : g.id;
                if (!mapped) return;
                fetch('/discover/'+type,{ with_genres: mapped, sort_by: 'popularity.desc',
                    'vote_count.gte': type === 'tv' ? 35 : 60, 'vote_average.gte': 5.8 },type,'genre',null,page('g_'+type+'_'+g.id));
            });
        });
        if ((taste.keywords || []).length) fetch('/discover/movie', {
            with_keywords: taste.keywords.slice(0,5).map(k=>k.id).join('|'), sort_by:'popularity.desc',
            'vote_count.gte':40, 'vote_average.gte':5.8 },'movie','keyword',null,page('keywords'));
        if (taste.empty || Recommendation.exploration() > 0) {
            fetch('/discover/movie',{ sort_by:'popularity.desc', 'vote_count.gte':200, 'vote_average.gte':7 },'movie','top',null,page('top'));
            if (taste.empty) fetch('/trending/all/week',{},null,'trend',null,1);
        }
        const finish = () => {
            if (!valid()) return;
            const picked = Capsule.pick(all,taste,opts);
            // A small shortlist gets richer metadata; bulk candidate lists do not trigger hundreds of requests.
            const items = picked.slice(0,Perf.lite()?4:8).map(m=>({ id:m.id,type:m.media_type,card:m }));
            Taste.enrich(items,Perf.lite()?4:8,()=> { if (valid()) cb(Capsule.pick(all,taste,opts)); });
        };
        parallel(tasks,packs=>{
            if (!valid()) return;
            (packs || []).forEach(p=>{ if (isArr(p)) all.push.apply(all,p); });
            if (Capsule.pick(all,taste,opts).length >= capsuleSize() || !top.length) return finish();
            const more = top.slice(0,3).map(g=>done=> {
                if (!valid()) return done([]);
                Net.get('/discover/movie',{ with_genres:g.id, page:page('fill_'+g.id), sort_by:'vote_count.desc',
                    'vote_count.gte':30,'vote_average.gte':5.8,include_adult:false },d=>done(markList(d && d.results,'movie','genre')),()=>done([]));
            });
            parallel(more,packs2=>{ if (!valid()) return; (packs2 || []).forEach(p=>{if(isArr(p)) all.push.apply(all,p);}); finish(); });
        });
    },
    pick: (all, taste, opts) => {
        const cut = { dup:0,rating:0,votes:0,watched:0,excluded:0,irrelevant:0 };
        const merged = Recommendation.merge(all); cut.dup=all.length-merged.length;
        const scored = [];
        merged.forEach(it=>{
            if (!Recommendation.allowed(it,taste,false)) { cut.excluded++; return; }
            if ((it.vote_average || 0) < 5.5) { cut.rating++; return; }
            if ((it.vote_count || 0) < 20) { cut.votes++; return; }
            const score = Recommendation.score(it,taste);
            Object.assign(it,{ _score:score.score,_personal:score.personal,_negative:score.negative,
                _collection:score.collection,_reasonText:score.reason });
            scored.push(it);
        });
        scored.sort((a,b)=>b._score-a._score || String(mediaKey(a)).localeCompare(mediaKey(b)));
        const personal = scored.filter(it=>it._personal || taste.empty);
        const explorationLimit = taste.empty ? 0 : Math.min(Math.floor(capsuleSize()*Recommendation.exploration()),
            Math.floor(personal.length*Recommendation.exploration()/(1-Recommendation.exploration() || 1)));
        const explorers = scored.filter(it=>!it._personal && it._negative < .35).slice(0,explorationLimit);
        const pool = personal.concat(explorers), final = [], genres = {}, collections = {};
        while (pool.length && final.length < capsuleSize()) {
            let best = 0,bestScore = -Infinity;
            pool.forEach((it,i)=>{
                const gs=canonicalGenres(it), last=final.slice(-3);
                const repeat = last.reduce((n,x)=>n+overlapRatio(gs,canonicalGenres(x)),0);
                const repeatedGenre = gs.reduce((n,g)=>n+(genres[g] || 0),0)/Math.max(1,gs.length);
                const collectionPenalty=it._collection ? (collections[it._collection] || 0)*4 : 0;
                let score=it._score - repeat*1.2 - repeatedGenre*.08 - collectionPenalty;
                if (!it._personal && !taste.empty && final.length < 5) score-=100;
                if (score>bestScore) {bestScore=score;best=i;}
            });
            const chosen=pool.splice(best,1)[0];final.push(chosen);
            canonicalGenres(chosen).forEach(g=>genres[g]=(genres[g] || 0)+1);
            if(chosen._collection)collections[chosen._collection]=(collections[chosen._collection] || 0)+1;
        }
        cut.irrelevant=scored.length-personal.length-explorers.length;
        Capsule.stats={ got:all.length,cut,scored:scored.length,final:final.length };
        return final;
    },
    reason: (item,taste) => {
        if (item._reasonText) return item._reasonText;
        if (item._src === 'title') return 'Совпадение с поиском по названию';
        if (item._src === 'person') return 'Фильмография: '+((item._via || {}).person || 'выбранного автора');
        if (item._src === 'search') return 'По запросу «'+((item._via || {}).query || '')+'»';
        return Recommendation.score(item,taste || {}).reason;
    }
};
// TV has no standalone Horror, Thriller, Music or History genre IDs.
const TV_GENRES = new Set([10759,16,35,80,99,18,10751,10762,9648,10763,10764,10765,10766,10767,10768,37]);
const tvGenre = id => { const mapped = MOVIE2TV[id] || id; return TV_GENRES.has(mapped) ? mapped : 0; };


// ═══════════════════════════════════════════ ПОИСК
const NEG_RE = /(без|кроме|не)\s*$/;
const parseQuery = (raw) => {
    const q = String(raw || '').toLowerCase().replace(/ё/g, 'е').trim();
    const ctx = {
        raw: String(raw || '').trim(), genresM: [], genresT: [], notGenresM: [], notGenresT: [],
        tags: [], tokens: [], type: 'any', yearFrom: 0, yearTo: 0,
        minVote: 6.2, minVotes: 150, person: '', personExplicit: false, exact: ''
    };
    if (/сериал|сезон|series/.test(q)) ctx.type = 'tv';
    else if (/фильм|кино|movie/.test(q)) ctx.type = 'movie';
    // жанры + отрицания («без ужасов», «не комедия»)
    GENRE_SYN.forEach(g => g.w.forEach(w => {
        const at = q.indexOf(w);
        if (at < 0) return;
        const before = q.slice(Math.max(0, at - 12), at);
        if (NEG_RE.test(before)) { ctx.notGenresM.push.apply(ctx.notGenresM, g.m); ctx.notGenresT.push.apply(ctx.notGenresT, g.t); }
        else { ctx.genresM.push.apply(ctx.genresM, g.m); ctx.genresT.push.apply(ctx.genresT, g.t); }
    }));
    TAG_SYN.forEach(t => t.w.forEach(w => { if (q.indexOf(w) > -1) ctx.tags.push(t.k); }));
    // диапазон годов: «с 1990 по 2005», «1990-2005»
    const range = q.match(/((?:19|20)\d{2})\s*(?:-|–|по|до)\s*((?:19|20)\d{2})/);
    if (range) { ctx.yearFrom = parseInt(range[1], 10); ctx.yearTo = parseInt(range[2], 10); }
    if (!ctx.yearFrom) {
        const dec = q.match(/(\d{2})\s?-?\s?х/);
        if (dec) { const n = parseInt(dec[1], 10); const base = n >= 30 ? 1900 + n : 2000 + n; ctx.yearFrom = base; ctx.yearTo = base + 9; }
    }
    if (!ctx.yearFrom) {
        const y4 = q.match(/(19|20)\d{2}/);
        if (y4) { ctx.yearFrom = parseInt(y4[0], 10); ctx.yearTo = ctx.yearFrom; }
    }
    if (/новинк|свеж|недавн|последн/.test(q)) { const cy = new Date().getFullYear(); ctx.yearFrom = cy - 1; ctx.yearTo = cy + 1; }
    if (/классик|стар[оы]е/.test(q) && !range) { ctx.yearFrom = ctx.yearFrom || 1950; ctx.yearTo = ctx.yearTo || 1999; ctx.minVote = 7.3; ctx.minVotes = 400; }
    if (/лучш|топ|шедевр|культов/.test(q)) { ctx.minVote = 7.4; ctx.minVotes = 700; }
    if (/эксперимент|артхаус|авангард|редк|малоизвестн/.test(q)) { ctx.minVote = 6.2; ctx.minVotes = 40; }
    if (ctx.yearTo && ctx.yearFrom > ctx.yearTo) { const t = ctx.yearFrom; ctx.yearFrom = ctx.yearTo; ctx.yearTo = t; }
    q.split(/[^a-zа-я0-9]+/).forEach(w => { if (w.length >= 3 && STOP_WORDS.indexOf(w) === -1) ctx.tokens.push(w); });
    ctx.genresM = uniq(ctx.genresM); ctx.genresT = uniq(ctx.genresT);
    ctx.family = /семейн|детск|детям|с ребенком|для детей/.test(q);
    ctx.horror = ctx.genresM.indexOf(27)>=0; ctx.thriller=ctx.genresM.indexOf(53)>=0;
    if(ctx.type==='tv' && ctx.horror)ctx.tags.push('horror');
    if(ctx.type==='tv' && ctx.thriller)ctx.tags.push('thriller');
    if (ctx.family) { ctx.notGenresM.push(27); ctx.notGenresT.push(27); }
    // Horror/thriller queries use movies unless series have been requested explicitly.
    if (ctx.type === 'any' && (ctx.genresM.indexOf(27)>=0 || ctx.genresM.indexOf(53)>=0)) ctx.type='movie';
    ctx.genresT = ctx.genresT.filter(g=>TV_GENRES.has(g));
    if (ctx.family) ctx.genresT = uniq(ctx.genresT.concat([10751,10762]));
    ctx.notGenresM = uniq(ctx.notGenresM); ctx.notGenresT = uniq(ctx.notGenresT);
    ctx.tags = uniq(ctx.tags);
    // человек: «с Томом Хэнксом», «режиссёр Нолан». Без явного указания имя
    // НЕ угадывается — оно приходит из общего поиска (см. Search.probe),
    // иначе на каждый короткий запрос уходил лишний /search/person впустую.
    const pm = q.match(/(?:^|\s)(?:с|со|режиссер|режиссёр|актер|актёр|от)\s+([a-zа-я][a-zа-я\-\s]{2,40})$/);
    if (pm) { ctx.person = pm[1].trim(); ctx.personExplicit = true; }
    else ctx.person = ctx.raw;
    // точное название: короткий запрос без жанровых слов
    if (!ctx.genresM.length && !ctx.tags.length && ctx.tokens.length && ctx.tokens.length <= 6) ctx.exact = ctx.raw;
    return ctx;
};
const stem = (t) => t.length > 5 ? t.substring(0, t.length - 2) : t;
const norm = (s) => String(s || '').toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9]+/g, ' ').trim();

const Search = {
    resolveTags: (tags, cb) => {
        const fire = once(cb);
        if (!tags.length) return fire([]);
        parallel(tags.slice(0, 5).map(name => done => Net.get('/search/keyword', { query: name, page: 1 }, (d) => done(d && d.results && d.results.length ? d.results[0].id : null), () => done(null), { ttl: 604800000 })),
            (res) => fire((res || []).filter(Boolean)));
    },
    // Один общий поиск в самом начале: из него сразу видно и названия,
    // и людей, и есть ли точное попадание. Отдельный «слепой» /search/person
    // больше не отправляется.
    probe: (query, ctx, force, cb) => {
        const fire = once(cb);
        if (!ctx.tokens.length) return fire({ items: [], people: [], exactHit: false });
        Net.get('/search/multi', { query: String(query).slice(0, 70), page: 1, include_adult: false }, (d) => {
            const res = (d && d.results) || [];
            const people = [];
            res.forEach(r => {
                if (r && r.media_type === 'person' && r.id && (r.popularity || 0) > 1.2)
                    people.push({ id: r.id, name: r.name || '', pop: r.popularity || 0 });
            });
            const items = markList(res, null, 'search', { query });
            const want = norm(ctx.exact || query);
            const exactHit = !!want && items.some(it => norm(it.title || it.name) === want || norm(it.original_title) === want);
            fire({ items, people: people.slice(0, 2), exactHit });
        }, () => fire({ items: [], people: [], exactHit: false }), { force });
    },
    run: (query, taste, cb, force, depth) => {
        const token=View.token, valid=()=>token===View.token;
        const fire = once((...args)=>{if(valid())cb(...args);});
        depth = depth || 0;
        const ctx = parseQuery(query);
        const SPAN = 14 + depth * 7;
        const ckey = 'q_' + norm(query).slice(0, 24);
        if (depth) Cursor.skip(ckey, depth * 3, SPAN);
        const pages = Cursor.take(ckey, depthScale(force ? 6 : 4), SPAN);
        const stage2 = (kwIds, probe) => {
            if(!valid())return;
            const tasks = [];
            const list = probe.items.slice();
            const discover = (media, page) => {
                const p = {
                    sort_by: force ? pickOne(['popularity.desc', 'vote_average.desc', 'vote_count.desc']) : 'popularity.desc',
                    include_adult: false, page,
                    'vote_count.gte': ctx.minVotes, 'vote_average.gte': ctx.minVote
                };
                const g = media === 'tv' ? ctx.genresT : ctx.genresM;
                const ng = media === 'tv' ? ctx.notGenresT : ctx.notGenresM;
                if (g.length) p.with_genres = g.slice(0, 3).join('|');
                if (ctx.family) p.with_genres = media === 'tv' ? '10751|10762' : '10751';
                if (ng.length) p.without_genres = ng.slice(0, 4).join(',');
                if (kwIds.length) p.with_keywords = kwIds.slice(0, 5).join(media==='tv' && (ctx.horror || ctx.thriller) ? ',' : '|');
                if (ctx.yearFrom) {
                    if (media === 'tv') { p['first_air_date.gte'] = ctx.yearFrom + '-01-01'; p['first_air_date.lte'] = (ctx.yearTo || ctx.yearFrom) + '-12-31'; }
                    else { p['primary_release_date.gte'] = ctx.yearFrom + '-01-01'; p['primary_release_date.lte'] = (ctx.yearTo || ctx.yearFrom) + '-12-31'; }
                }
                return p;
            };
            const hasFilter = !!(ctx.genresM.length || ctx.tags.length || ctx.yearFrom || kwIds.length || ctx.notGenresM.length);
            if (hasFilter) pages.forEach(page => {
                if (ctx.type !== 'tv') tasks.push(done => Net.get('/discover/movie', discover('movie', page), (d) => done(markList(d && d.results, 'movie', 'search', { query })), () => done([]), { force }));
                if (ctx.type !== 'movie') tasks.push(done => Net.get('/discover/tv', discover('tv', page), (d) => done(markList(d && d.results, 'tv', 'search', { query, topic: !!kwIds.length })), () => done([]), { force }));
            });
            // фильмография — только когда человек назван явно либо найден уверенно
            // и при этом точного совпадения по названию нет
            const usePeople = probe.people.length && (ctx.personExplicit || (!probe.exactHit && !hasFilter && probe.people[0].pop >= 4));
            if (usePeople) probe.people.forEach(pr => {
                tasks.push(done => Net.get('/person/' + pr.id + '/combined_credits', {}, (d) => {
                    const cast = ((d && d.cast) || []).concat((d && d.crew) || []);
                    cast.sort((a2, b2) => (b2.vote_count || 0) - (a2.vote_count || 0));
                    done(markList(cast.slice(0, 40), null, 'person', { person: pr.name, query }));
                }, () => done([]), { ttl: 604800000 }));
                tasks.push(done => Net.get('/discover/movie', {
                    with_people: pr.id, sort_by: 'vote_count.desc', include_adult: false, page: 1,
                    'vote_average.gte': Math.min(ctx.minVote, 5.5), 'vote_count.gte': Math.min(ctx.minVotes, 50)
                }, (d) => done(markList(d && d.results, 'movie', 'person', { person: pr.name, query })), () => done([]), { force }));
            });
            // точное название
            if (ctx.exact) {
                if (ctx.type !== 'tv') tasks.push(done => Net.get('/search/movie', { query: String(query).slice(0, 70), page: 1, include_adult: false }, (d) => done(markList(d && d.results, 'movie', 'title', { query })), () => done([]), { force }));
                if (ctx.type !== 'movie') tasks.push(done => Net.get('/search/tv', { query: String(query).slice(0, 70), page: 1, include_adult: false }, (d) => done(markList(d && d.results, 'tv', 'title', { query })), () => done([]), { force }));
            }
            // объём: ещё две страницы текстового поиска
            if (ctx.tokens.length) [2, 3].forEach(page => {
                tasks.push(done => Net.get('/search/multi', { query: String(query).slice(0, 70), page, include_adult: false }, (d) => done(markList(d && d.results, null, 'search', { query })), () => done([]), { force }));
            });
            if (!tasks.length) pages.slice(0, 2).forEach(page => {
                tasks.push(done => Net.get('/discover/movie', discover('movie', page), (d) => done(markList(d && d.results, 'movie', 'search', { query })), () => done([]), { force }));
            });
            parallel(tasks.map(task=>done=>{if(valid())task(done);else done([]);}), (packs) => {
                if(!valid())return;
                (packs || []).forEach(pk => { if (isArr(pk)) list.push.apply(list, pk); });
                const ranked = Search.rank(list, ctx, taste, force, probe);
                if (ranked.length >= 8) return fire(ranked, ctx);
                Log.push('ПОИСК: мало результатов (' + ranked.length + '), ослабляю пороги');
                Search.relax(query, ctx, taste, force, (extra) => {
                    const merged = ranked.slice();
                    const has = {};
                    merged.forEach(x => { has[x.media_type + '_' + x.id] = 1; });
                    extra.forEach(x => { const k = x.media_type + '_' + x.id; if (!has[k]) { has[k] = 1; merged.push(x); } });
                    fire(merged.slice(0, capsuleSize()), ctx);
                });
            });
        };
        Search.resolveTags(ctx.tags, (kwIds) => {if(valid())Search.probe(query, ctx, force, (probe) => stage2(kwIds, probe));});
    },
    relax: (query, ctx, taste, force, cb) => {
        const fire = once(cb);
        const token=View.token;
        const soft = Object.assign({}, ctx, { minVote: 0, minVotes: 0 });
        const tasks = [];
        if (ctx.tokens.length) [1, 2, 3].forEach(page => {
            tasks.push(done => Net.get('/search/multi', { query: String(query).slice(0, 70), page, include_adult: false }, (d) => done(markList(d && d.results, null, 'search', { query })), () => done([]), {}));
        });
        const gm = ctx.family ? '10751' : ctx.genresM.length ? ctx.genresM.slice(0, 2).join('|') : '';
        const gt = ctx.family ? '10751|10762' : ctx.genresT.length ? ctx.genresT.slice(0, 2).join('|') : '';
        [1, 2, 3].forEach(page => {
            if (gm && ctx.type !== 'tv') tasks.push(done => Net.get('/discover/movie', {
                with_genres: gm, sort_by: 'popularity.desc', include_adult: false, page, 'vote_count.gte': 20
            }, (d) => done(markList(d && d.results, 'movie', 'search', { query })), () => done([]), {}));
            if (gt && ctx.type !== 'movie') tasks.push(done => Net.get('/discover/tv', {
                with_genres: gt, sort_by: 'popularity.desc', include_adult: false, page, 'vote_count.gte': 10
            }, (d) => done(markList(d && d.results, 'tv', 'search', { query })), () => done([]), {}));
        });
        if (!tasks.length) return fire([]);
        parallel(tasks.map(task=>done=>{if(token===View.token)task(done);else done([]);}), (packs) => {
            if(token!==View.token)return;
            const list = [];
            (packs || []).forEach(p => { if (isArr(p)) list.push.apply(list, p); });
            fire(Search.rank(list, soft, taste, force, null));
        });
    },
    rank: (list, ctx, taste, force, probe) => {
        const CAP = capsuleSize();
        const out = [], seen = {}, gWeight = {};
        const stems = ctx.tokens.map(stem);
        const exact = norm(ctx.exact || '');
        const exactHit = !!(probe && probe.exactHit);
        ((taste && taste.genres) || []).forEach(g => { gWeight[g.id] = g.score; });
        const maxG = (taste && taste.genres && taste.genres.length) ? taste.genres[0].score : 1;
        const curYear = new Date().getFullYear();
        const prev = new Set(View.prevIds || []);
        const notG = (ctx.notGenresM || []).concat(ctx.notGenresT || []);
        list.forEach(it => {
            const key = it.media_type + '_' + it.id;
            if (seen[key]) return;
            if (!Recommendation.allowed(it, taste || {}, true)) return;
            if (notG.length && (it.genre_ids || []).some(g => notG.indexOf(g) > -1)) return;
            if (ctx.type === 'tv' && it.media_type !== 'tv') return;
            if (ctx.type === 'movie' && it.media_type !== 'movie') return;
            // отсев мягче прежнего: раньше выдача часто схлопывалась в ноль
            if (ctx.minVote && (it.vote_average || 0) && (it.vote_average || 0) < ctx.minVote - 1.5) return;
            const title = norm(it.title || it.name);
            const orig = norm(it.original_title);
            const over = norm(it.overview);
            if(it.media_type==='tv' && ctx.horror && !(it._via && it._via.topic) && !/ужас|хоррор|призрак|демон|зомби|вампир|horror|haunt/.test(over))return;
            if(it.media_type==='tv' && ctx.thriller && !(it._via && it._via.topic) && !/триллер|маньяк|убийц|похищ|thriller|killer/.test(over))return;
            let s = 0;
            if (exact && (title === exact || orig === exact)) s += 26;
            else if (exact && (title.indexOf(exact) === 0 || orig.indexOf(exact) === 0)) s += 13;
            stems.forEach(st => {
                if (!st) return;
                if (title === st) s += 10;
                else if (title.indexOf(st) > -1) s += 5;
                if (orig.indexOf(st) > -1) s += 2;
                if (over.indexOf(st) > -1) s += 2.5;
            });
            const wanted = it.media_type === 'tv' ? ctx.genresT : ctx.genresM;
            let gHit = 0;
            (it.genre_ids || []).forEach(gid => {
                if (wanted.indexOf(gid) > -1) { s += 4.5; gHit++; }
                const g = TV2MOVIE[gid] || gid;
                if (gWeight[g]) s += 2 * (gWeight[g] / maxG);
            });
            if (wanted.length && !gHit) return;
            if (ctx.family && !(it.genre_ids || []).some(g=>g===10751 || g===10762)) return;
            if (it._src === 'title') s += 4;
            if (it._src === 'person') s += exactHit ? -6 : 5;
            s += clamp((it.vote_average || 0) - 5.5, 0, 5) * 1.5 + clamp((it.vote_count || 0) / 4000, 0, 1.5);
            const y = yearOf(it);
            if (ctx.yearFrom && !y) return;
            if (ctx.yearFrom && y) { if (y < ctx.yearFrom || y > (ctx.yearTo || ctx.yearFrom)) return; else s += 2; }
            else if (y >= curYear - 2) s += 1.5;
            if (!it.overview) s -= 1.5;
            if (!it.vote_count) s -= 2;
            if (taste && taste.watched && taste.watched[mediaKey(it)]) s -= 4;
            const ago = Seen.ago(mediaKey(it));
            if (ago === 1) s -= 10; else if (ago) s -= clamp(6 - ago, 1, 5);
            if (prev.has(mediaKey(it))) s -= 12;
            // Refresh changes catalog pages, not ranking quality.
            it._score = s; seen[key] = it; out.push(it);
        });
        out.sort((a, b) => b._score - a._score);
        const top = out.slice(0, CAP);
        return top;
    }
};

// ═══════════════════════════════════════════ ТЕМЫ
const THEMES = {
    astro: { name: 'Космос', cls: 'cm-t-astro', fx: 'astro', sys: 'ORBITAL UPLINK: ESTABLISHED', quotes: ['«Хьюстон, у нас проблема»', '«Космос ждёт»'], load: ['ПРОКЛАДЫВАЮ КУРС', 'СОБИРАЮ КАПСУЛУ'], vars: { '--cm-bg': '#05070D', '--cm-accent': '#FF7A2F', '--cm-accent2': '#7FD8FF', '--cm-text': '#E8ECF5', '--cm-sub': '#8695AC', '--cm-radius': '1.2em' } },
    breakingbad: { name: 'Лаборатория', cls: 'cm-t-bb', fx: 'lab', sys: 'LAB NET: ONLINE', quotes: ['«Скажи моё имя»', '«Химия — это сила»'], load: ['СОБИРАЮ КАПСУЛУ'], vars: { '--cm-bg': '#0B0E08', '--cm-accent': '#D6E24A', '--cm-accent2': '#1FAE96', '--cm-text': '#EDF2E0', '--cm-sub': '#9AAE8C', '--cm-radius': '.6em' } },
    matrix: { name: 'Матрица', cls: 'cm-t-matrix', fx: 'matrix', sys: 'SYSTEM_KERNEL: NEBUCHADNEZZAR // ONLINE', quotes: ['«Ложки нет»', '«Следуй за белым кроликом»'], load: ['ДЕШИФРУЮ КОД', 'СОБИРАЮ КАПСУЛУ'], vars: { '--cm-bg': '#000600', '--cm-accent': '#00FF41', '--cm-accent2': '#00B32E', '--cm-text': '#C8FFD4', '--cm-sub': '#4E9E5E', '--cm-radius': '.4em' } },
    panda: { name: 'Свиток', cls: 'cm-t-panda', fx: 'scroll', sys: 'SCROLL OF DESTINY: OPEN', quotes: ['«Случайностей не бывает»', '«Твоё время настало»'], load: ['ЧИТАЮ СВИТКИ', 'СОБИРАЮ КАПСУЛУ'], vars: { '--cm-bg': '#1C140B', '--cm-accent': '#D8433C', '--cm-accent2': '#E7B65C', '--cm-text': '#F4E9D2', '--cm-sub': '#B79E7B', '--cm-radius': '.9em' } },
    rickmorty: { name: 'Портал', cls: 'cm-t-rm', fx: 'portal', sys: 'PORTAL GUN: CHARGED // C-137', quotes: ['«Вубба-лубба-даб-даб»'], load: ['ПРЫГАЮ ЧЕРЕЗ ПОРТАЛ', 'СОБИРАЮ КАПСУЛУ'], vars: { '--cm-bg': '#07141B', '--cm-accent': '#7CFF6B', '--cm-accent2': '#3AD1FF', '--cm-text': '#E6FFF1', '--cm-sub': '#6FA894', '--cm-radius': '1.1em' } },
    starwars: { name: 'Галактика', cls: 'cm-t-sw', fx: 'galaxy', sys: 'HOLONET LINK: ACTIVE', quotes: ['«Да пребудет с тобой Сила»'], load: ['ГИПЕРПРЫЖОК', 'СОБИРАЮ КАПСУЛУ'], vars: { '--cm-bg': '#020409', '--cm-accent': '#FFE81F', '--cm-accent2': '#4BD5FF', '--cm-text': '#F2F4F8', '--cm-sub': '#8C93A0', '--cm-radius': '.8em' } },
    noir: { name: 'Нуар', cls: 'cm-t-noir', fx: 'noir', sys: 'CASE #1947: OPEN', quotes: ['«Забудь её, Джейк»', '«В этом городе все врут»', '«Туман всё скроет»'], load: ['ЛИСТАЮ ДЕЛО', 'ПРОВЕРЯЮ УЛИКИ', 'СОБИРАЮ КАПСУЛУ'], vars: { '--cm-bg': '#0B0B0B', '--cm-accent': '#E6E6E6', '--cm-accent2': '#B48A3C', '--cm-text': '#EDEDED', '--cm-sub': '#8A8A8A', '--cm-radius': '.3em' } },
    inception: { name: 'Сон', cls: 'cm-t-inception', fx: 'inception', sys: 'LIMBO LEVEL: 01 // STABLE', quotes: ['«Как долго мы здесь?»', '«Ты ждёшь поезд»', '«Не бойся глубины»'], load: ['ПОГРУЖАЮСЬ В СОН', 'НАСТРАИВАЮ ГЛУБИНУ'], vars: { '--cm-bg': '#0A0A0C', '--cm-accent': '#E9B487', '--cm-accent2': '#C98A5E', '--cm-text': '#F1E8DF', '--cm-sub': '#8B8279', '--cm-radius': '1em' } },
    dune: { name: 'Арракис', cls: 'cm-t-dune', fx: 'dune', sys: 'ARRAKIS // DEEP DESERT', quotes: ['«Страх — убийца разума»', '«Пустыня помнит всё»', '«Слушай ветер»'], load: ['СЛУШАЮ ПЕСКИ', 'НАСТРАИВАЮ КОМПАС'], vars: { '--cm-bg': '#17100A', '--cm-accent': '#E7B46A', '--cm-accent2': '#8EC7B1', '--cm-text': '#F4E7D1', '--cm-sub': '#AA9274', '--cm-radius': '1.05em' } },
    bladerunner: { name: 'Неон', cls: 'cm-t-blade', fx: 'blade', sys: 'LOS ANGELES // 2049', quotes: ['«Я видел то, во что вы не поверите»', '«Память — это тоже история»', '«Город никогда не спит»'], load: ['ВКЛЮЧАЮ НЕОН', 'СИНХРОНИЗИРУЮ ПАМЯТЬ'], vars: { '--cm-bg': '#090D16', '--cm-accent': '#F2B6FF', '--cm-accent2': '#74E5FF', '--cm-text': '#EEF7FF', '--cm-sub': '#788DA1', '--cm-radius': '.75em' } },
    dreamworks: { name: 'Тихий вечер', cls: 'cm-t-dream', fx: 'dream', sys: 'SLOW EVENING // PLAY', quotes: ['«Сегодня можно никуда не спешить»', '«Выбери историю и выдохни»', '«Пусть фильм найдёт тебя»'], load: ['НАСТРАИВАЮ ТИШИНУ', 'СОБИРАЮ ВЕЧЕР'], vars: { '--cm-bg': '#080C16', '--cm-accent': '#B9C7FF', '--cm-accent2': '#A9E7D5', '--cm-text': '#EAF0FF', '--cm-sub': '#77839C', '--cm-radius': '1.25em' } }
};
const THEME_ORDER = ['astro', 'breakingbad', 'matrix', 'panda', 'rickmorty', 'starwars', 'noir', 'inception', 'dune', 'bladerunner', 'dreamworks'];

// ═══════════════════════════════════════════ ФОНОВЫЕ СЦЕНЫ
const D = () => Perf.density() * fxDensity();
const N = (n) => clamp(Math.round(n * D()), 4, [90,220,420][Perf.tier()]);
const SCENES = {
    astro: () => { const stars = Array.from({ length: N(90) }, () => ({ x: Math.random(), y: Math.random(), r: .4 + Math.random() * 1.2, p: Math.random() * 6.28, v: .004 + Math.random() * .014 })); let shoot = null, wait = 4 + Math.random() * 8, t = 0; return { draw(ctx, W, H, dt) { t += dt; ctx.fillStyle = '#DCE9FF'; stars.forEach(s => { s.x -= s.v * dt * .08; if (s.x < -.02) { s.x = 1.02; s.y = Math.random(); } ctx.globalAlpha = .12 + .14 * Math.sin(t * 1.2 + s.p); ctx.beginPath(); ctx.arc(s.x * W, s.y * H, s.r, 0, 6.283); ctx.fill(); }); const cx = W * .5, cy = H * .5, base = Math.min(W, H); ctx.lineWidth = 1; for (let i = 0; i < 3; i++) { ctx.globalAlpha = .05 - i * .012; ctx.strokeStyle = i % 2 ? '#7FD8FF' : '#FF7A2F'; ctx.beginPath(); ctx.ellipse(cx, cy, base * (.30 + i * .17), base * (.13 + i * .075), Math.sin(t * .05 + i) * .22, 0, 6.283); ctx.stroke(); } wait -= dt; if (!shoot && wait <= 0) { shoot = { x: .1 + Math.random() * .6, y: Math.random() * .5, p: 0 }; wait = 7 + Math.random() * 11; } if (shoot) { shoot.p += dt * .55; if (shoot.p >= 1) shoot = null; else { const x = (shoot.x + shoot.p * .3) * W, y = (shoot.y + shoot.p * .18) * H, len = base * .06; ctx.globalAlpha = .28 * Math.sin(shoot.p * Math.PI); ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - len, y - len * .6); ctx.stroke(); } } ctx.globalAlpha = 1; } }; },
    lab: () => { const mk = (bottom) => ({ x: .05 + Math.random() * .9, y: bottom ? 1.05 + Math.random() * .35 : Math.random(), r: 3 + Math.random() * 14, v: .02 + Math.random() * .06, w: Math.random() * 6.28, ws: .4 + Math.random() * .8 }); const bubbles = Array.from({ length: N(30) }, () => mk(false)); let t = 0; return { draw(ctx, W, H, dt) { t += dt; bubbles.forEach(b => { b.y -= b.v * dt; b.x += Math.sin(t * b.ws + b.w) * .021 * dt; if (b.y < -.1) Object.assign(b, mk(true)); const x = b.x * W, y = b.y * H; const fade = clamp(b.y * 5, 0, 1) * clamp((1.05 - b.y) * 3.5, 0, 1); ctx.globalAlpha = .14 * fade; ctx.strokeStyle = '#D6E24A'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(x, y, b.r, 0, 6.283); ctx.stroke(); ctx.globalAlpha = .07 * fade; ctx.fillStyle = '#1FAE96'; ctx.beginPath(); ctx.arc(x, y, b.r * .92, 0, 6.283); ctx.fill(); ctx.globalAlpha = .18 * fade; ctx.fillStyle = '#F4FBDA'; ctx.beginPath(); ctx.arc(x - b.r * .33, y - b.r * .33, Math.max(.8, b.r * .22), 0, 6.283); ctx.fill(); }); ctx.globalAlpha = 1; } }; },
    matrix: () => { const CH = 'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホ0123456789ABCDEF<>=*+-'; const ch = () => CH.charAt(rnd(CH.length)); let cols = [], size = 16; const mkCol = () => { const len = 6 + rnd(16); return { y: -rnd(30), v: 5 + Math.random() * 13, len, s: Array.from({ length: len }, ch) }; }; return { fps: 22, resize(W) { size = clamp(Math.round(W / (46 * D())), 12, 30); cols = Array.from({ length: Math.ceil(W / size) + 1 }, mkCol); }, draw(ctx, W, H, dt) { if (!cols.length) this.resize(W); ctx.font = size + 'px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace'; ctx.textBaseline = 'top'; for (let i = 0; i < cols.length; i++) { const c = cols[i]; c.y += c.v * dt; c.s[rnd(c.len)] = ch(); for (let k = 0; k < c.len; k++) { const y = (c.y - k) * size; if (y < -size || y > H) continue; const f = 1 - k / c.len; if (k === 0) { ctx.globalAlpha = .38; ctx.fillStyle = '#C8FFD4'; } else { ctx.globalAlpha = .18 * f * f; ctx.fillStyle = '#00FF41'; } ctx.fillText(c.s[k], i * size, y); } if ((c.y - c.len) * size > H) cols[i] = mkCol(); } ctx.globalAlpha = 1; } }; },
    scroll: () => { const GL = ['永', '道', '心', '和', '氣', '龍', '風', '静']; const mkG = (bottom) => ({ x: .05 + Math.random() * .9, y: bottom ? 1.06 + Math.random() * .3 : Math.random(), s: 14 + Math.random() * 24, v: .014 + Math.random() * .026, rot: (Math.random() - .5) * .32, a: Math.random() * 6.28, ch: pickOne(GL) }); const mkP = (top) => ({ x: top ? Math.random() * 1.1 - .1 : Math.random(), y: top ? -.06 - Math.random() * .25 : Math.random(), r: 2.8 + Math.random() * 4.5, vx: .008 + Math.random() * .022, vy: .02 + Math.random() * .038, rot: Math.random() * 6.28, vr: (Math.random() - .5) * 1.3, sw: Math.random() * 6.28 }); const glyphs = Array.from({ length: N(16) }, () => mkG(false)); const petals = Array.from({ length: N(28) }, () => mkP(false)); let t = 0; return { draw(ctx, W, H, dt) { t += dt; ctx.fillStyle = '#E7D7B0'; glyphs.forEach(g => { g.y -= g.v * dt; g.x += Math.sin(t * .5 + g.a) * .015 * dt; if (g.y < -.14) Object.assign(g, mkG(true)); const fade = clamp(g.y * 3, 0, 1) * clamp((1.06 - g.y) * 3, 0, 1); ctx.globalAlpha = (.04 + .025 * Math.sin(t * .8 + g.a)) * fade; ctx.font = g.s + 'px "Songti SC","Noto Serif CJK",serif'; ctx.save(); ctx.translate(g.x * W, g.y * H); ctx.rotate(g.rot); ctx.fillText(g.ch, 0, 0); ctx.restore(); }); ctx.fillStyle = '#D9A7A7'; petals.forEach(p => { p.x += (p.vx + Math.sin(t * .9 + p.sw) * .012) * dt; p.y += p.vy * dt; p.rot += p.vr * dt; if (p.y > 1.1 || p.x > 1.12) Object.assign(p, mkP(true)); ctx.globalAlpha = .07 + .025 * Math.sin(t + p.sw); ctx.save(); ctx.translate(p.x * W, p.y * H); ctx.rotate(p.rot); ctx.beginPath(); ctx.ellipse(0, 0, p.r, p.r * .52, .5, 0, 6.283); ctx.fill(); ctx.restore(); }); ctx.globalAlpha = 1; } }; },
    portal: () => { const CNT = 4; const mkPortal = () => ({ x: .1 + Math.random() * .8, y: .12 + Math.random() * .76, r: 30 + Math.random() * 40, age: 0, ttl: 8 + Math.random() * 10, ph: Math.random() * 6.28 }); const portals = Array.from({ length: CNT }, () => { const p = mkPortal(); p.age = Math.random() * 4; return p; }); const KINDS = ['chair', 'table', 'lamp', 'sofa', 'tv', 'clock']; const mkItem = () => { const from = rnd(CNT); return { from, to: (from + 1 + rnd(CNT - 1)) % CNT, p: -Math.random() * 1.2, v: .16 + Math.random() * .2, kind: pickOne(KINDS), rot: (Math.random() - .5) * .7, spin: (Math.random() - .5) * .8 }; }; const items = Array.from({ length: N(8) }, mkItem); const shape = (ctx, kind, s) => { ctx.beginPath(); if (kind === 'chair') { ctx.rect(-s * .46, -s * .95, s * .18, s * 1.05); ctx.rect(-s * .46, 0, s * .95, s * .16); ctx.rect(-s * .4, s * .16, s * .13, s * .55); ctx.rect(s * .34, s * .16, s * .13, s * .55); } else if (kind === 'table') { ctx.rect(-s * .72, -s * .12, s * 1.44, s * .16); ctx.rect(-s * .58, s * .04, s * .12, s * .68); ctx.rect(s * .46, s * .04, s * .12, s * .68); } else if (kind === 'lamp') { ctx.moveTo(-s * .34, -s * .22); ctx.lineTo(s * .34, -s * .22); ctx.lineTo(s * .19, -s * .78); ctx.lineTo(-s * .19, -s * .78); ctx.closePath(); ctx.rect(-s * .05, -s * .22, s * .1, s * .88); ctx.rect(-s * .3, s * .66, s * .6, s * .12); } else if (kind === 'sofa') { ctx.rect(-s * .78, -s * .48, s * 1.56, s * .5); ctx.rect(-s * .9, -s * .08, s * 1.8, s * .5); ctx.rect(-s * .8, s * .42, s * .14, s * .22); ctx.rect(s * .66, s * .42, s * .14, s * .22); } else if (kind === 'tv') { ctx.rect(-s * .7, -s * .52, s * 1.4, s * .84); ctx.rect(-s * .1, s * .32, s * .2, s * .24); ctx.rect(-s * .42, s * .56, s * .84, s * .12); } else { ctx.arc(0, -s * .1, s * .5, 0, 6.283); ctx.rect(-s * .04, -s * .5, s * .08, s * .42); ctx.rect(-s * .04, -s * .14, s * .34, s * .08); } ctx.fill(); }; let t = 0; return { draw(ctx, W, H, dt) { t += dt; portals.forEach(p => { p.age += dt; if (p.age > p.ttl) Object.assign(p, mkPortal()); const inn = clamp(p.age, 0, 1), out = clamp(p.ttl - p.age, 0, 1), life = inn * out; const pulse = 1 + .07 * Math.sin(t * 1.7 + p.ph); const x = p.x * W, y = p.y * H, r = p.r * pulse * (.4 + .6 * life); ctx.lineWidth = 2.4; ctx.globalAlpha = .13 * life; ctx.strokeStyle = '#7CFF6B'; ctx.beginPath(); ctx.ellipse(x, y, r, r * .82, 0, 0, 6.283); ctx.stroke(); ctx.globalAlpha = .08 * life; ctx.strokeStyle = '#3AD1FF'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.ellipse(x, y, r * .66, r * .54, 0, 0, 6.283); ctx.stroke(); ctx.globalAlpha = .05 * life; ctx.fillStyle = '#7CFF6B'; ctx.beginPath(); ctx.ellipse(x, y, r * .9, r * .74, 0, 0, 6.283); ctx.fill(); }); const base = Math.min(W, H) * .05; ctx.fillStyle = '#DCD6C9'; items.forEach((o, i) => { o.p += o.v * dt; if (o.p > 1) { items[i] = mkItem(); items[i].p = -Math.random() * .8; return; } if (o.p < 0) return; const a = portals[o.from], b = portals[o.to], q = o.p; const x = (a.x + (b.x - a.x) * q) * W; const y = (a.y + (b.y - a.y) * q) * H - Math.sin(q * Math.PI) * H * .08; const s = base * (.3 + .7 * Math.sin(q * Math.PI)); ctx.globalAlpha = .14 * Math.sin(q * Math.PI); ctx.save(); ctx.translate(x, y); ctx.rotate(o.rot + o.spin * q); shape(ctx, o.kind, s); ctx.restore(); }); ctx.globalAlpha = 1; } }; },
    galaxy: () => { let stars = []; let t = 0; return { resize() { stars = Array.from({ length: N(60) }, () => ({ x: Math.random(), y: Math.random(), r: .4 + Math.random() * .9, p: Math.random() * 6.28 })); }, draw(ctx, W, H, dt) { t += dt; if (!stars.length) this.resize(); ctx.fillStyle = '#FFFFFF'; stars.forEach(s => { ctx.globalAlpha = .06 + .05 * Math.sin(t * .7 + s.p); ctx.beginPath(); ctx.arc(s.x * W, s.y * H, s.r, 0, 6.283); ctx.fill(); }); ctx.globalAlpha = 1; const now = new Date(); const h = now.getHours() + now.getMinutes() / 60; const ang = (h / 24) * 6.283 - Math.PI / 2; const cx = W * .5, cy = H * .58, orbit = Math.min(W, H) * .36; const x = cx + Math.cos(ang) * orbit, y = cy + Math.sin(ang) * orbit * .6; const night = h < 6.5 || h >= 18.5; const R = clamp(Math.min(W, H) * .045, 13, 34); ctx.lineWidth = 1; ctx.globalAlpha = .06; ctx.strokeStyle = night ? '#9FB0FF' : '#FFE81F'; ctx.beginPath(); ctx.ellipse(cx, cy, orbit, orbit * .6, 0, 0, 6.283); ctx.stroke(); ctx.globalAlpha = .04; ctx.beginPath(); ctx.moveTo(W * .06, cy); ctx.lineTo(W * .94, cy); ctx.stroke(); const g = ctx.createRadialGradient(x, y, R * .2, x, y, R * 4.2); g.addColorStop(0, night ? 'rgba(190,203,255,.25)' : 'rgba(255,226,80,.26)'); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.globalAlpha = 1; ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, R * 4.2, 0, 6.283); ctx.fill(); if (night) { ctx.save(); ctx.beginPath(); ctx.arc(x, y, R, 0, 6.283); ctx.clip(); ctx.globalAlpha = .55; ctx.fillStyle = '#DCE3FF'; ctx.fillRect(x - R, y - R, R * 2, R * 2); ctx.globalAlpha = .22; ctx.fillStyle = '#9AA6D6'; ctx.beginPath(); ctx.arc(x - R * .3, y + R * .25, R * .22, 0, 6.283); ctx.fill(); ctx.beginPath(); ctx.arc(x + R * .1, y - R * .4, R * .13, 0, 6.283); ctx.fill(); ctx.globalCompositeOperation = 'destination-out'; ctx.globalAlpha = 1; ctx.beginPath(); ctx.arc(x + R * .5, y - R * .22, R * .92, 0, 6.283); ctx.fill(); ctx.globalCompositeOperation = 'source-over'; ctx.restore(); } else { ctx.globalAlpha = .5; ctx.fillStyle = '#FFE9A3'; ctx.beginPath(); ctx.arc(x, y, R, 0, 6.283); ctx.fill(); ctx.globalAlpha = .16; ctx.strokeStyle = '#FFE81F'; ctx.lineWidth = 1.4; for (let i = 0; i < 12; i++) { const a = i * (Math.PI / 6) + t * .1; const l = R * (1.32 + .12 * Math.sin(t * 1.1 + i)); ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * R * 1.18, y + Math.sin(a) * R * 1.18); ctx.lineTo(x + Math.cos(a) * l * 1.28, y + Math.sin(a) * l * 1.28); ctx.stroke(); } } ctx.globalAlpha = 1; } }; },
    noir: () => { const mkDrop = () => ({ x: Math.random() * 1.15 - .1, y: -.05 - Math.random() * .4, v: .7 + Math.random() * .8, len: .03 + Math.random() * .04 }); const drops = Array.from({ length: N(42) }, () => { const d = mkDrop(); d.y = Math.random(); return d; }); const smoke = Array.from({ length: N(9) }, () => ({ x: Math.random() * 1.2 - .1, y: .45 + Math.random() * .5, r: 50 + Math.random() * 90, v: .01 + Math.random() * .02, ph: Math.random() * 6.28 })); let t = 0; return { draw(ctx, W, H, dt) { t += dt; ctx.fillStyle = '#BFBFBF'; smoke.forEach(s => { s.x += s.v * dt; if (s.x > 1.25) { s.x = -.25; s.y = .45 + Math.random() * .5; } ctx.globalAlpha = .02 + .008 * Math.sin(t * .5 + s.ph); ctx.beginPath(); ctx.arc(s.x * W, (s.y + Math.sin(t * .3 + s.ph) * .012) * H, s.r, 0, 6.283); ctx.fill(); }); ctx.lineWidth = .8; ctx.strokeStyle = '#D3D3D3'; ctx.globalAlpha = .04; ctx.beginPath(); drops.forEach(d => { d.y += d.v * dt; d.x += .04 * dt; if (d.y > 1.08) Object.assign(d, mkDrop()); ctx.moveTo(d.x * W, d.y * H); ctx.lineTo((d.x - d.len * .22) * W, (d.y + d.len) * H); }); ctx.stroke(); ctx.globalAlpha = 1; } }; },
    inception: () => { let t = 0; return { draw(ctx, W, H, dt) { t += dt; const cx = W * .5, cy = H * .52, base = Math.min(W, H); ctx.lineWidth = 1; const rings = Perf.lite() ? 7 : 11; for (let i = 0; i < rings; i++) { const r = (i + 1) * base * .05 * (1 + .03 * Math.sin(t * .4 + i * .6)); ctx.globalAlpha = .012 + i * .002; ctx.strokeStyle = i % 2 ? '#E9B487' : '#8A7563'; ctx.beginPath(); ctx.ellipse(cx, cy, r, r * .47, Math.sin(t * .25 + i) * .07, 0, 6.283); ctx.stroke(); } ctx.globalAlpha = 1; } }; },
    dune: () => { let t = 0; return { draw(ctx, W, H, dt) { t += dt; ctx.lineWidth = 1; ctx.strokeStyle = '#E7B46A'; const lines = Perf.lite() ? 5 : 8, stepX = Perf.lite() ? 26 : 18; for (let i = 0; i < lines; i++) { ctx.globalAlpha = .012 + i * .0018; ctx.beginPath(); for (let x = -20; x < W + 20; x += stepX) { const y = H * (.34 + i * .075) + Math.sin(x * .011 + t * .35 + i) * 12 + i * 2; x === -20 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); } ctx.stroke(); } ctx.globalAlpha = 1; } }; },
    blade: () => { const mk = () => ({ x: Math.random() * 1.15 - .1, y: -.05 - Math.random() * .4, v: .9 + Math.random() * 1.1 }); const drops = Array.from({ length: N(46) }, () => { const d = mk(); d.y = Math.random(); return d; }); return { draw(ctx, W, H, dt) { ctx.lineWidth = 1; ctx.globalAlpha = .035; ctx.strokeStyle = '#F2B6FF'; ctx.beginPath(); drops.forEach(d => { d.y += d.v * dt; d.x += .05 * dt; if (d.y > 1.1) Object.assign(d, mk()); if (d.x > .5) return; ctx.moveTo(d.x * W, d.y * H); ctx.lineTo((d.x - .008) * W, (d.y + .04) * H); }); ctx.stroke(); ctx.strokeStyle = '#74E5FF'; ctx.beginPath(); drops.forEach(d => { if (d.x <= .5) return; ctx.moveTo(d.x * W, d.y * H); ctx.lineTo((d.x - .008) * W, (d.y + .04) * H); }); ctx.stroke(); ctx.globalAlpha = 1; } }; },
    dream: () => { const clouds = Array.from({ length: N(9) }, () => ({ x: Math.random(), y: Math.random(), r: 50 + Math.random() * 105, v: .012 + Math.random() * .018 })); return { fps: 20, draw(ctx, W, H, dt) { clouds.forEach(c => { c.x += c.v * dt; if (c.x > 1.25) { c.x = -.25; c.y = Math.random(); } ctx.globalAlpha = .018; ctx.fillStyle = c.y < .5 ? '#B9C7FF' : '#A9E7D5'; ctx.beginPath(); ctx.arc(c.x * W, c.y * H, c.r, 0, 6.283); ctx.fill(); }); ctx.globalAlpha = 1; } }; },
    // ── сцены тем «под фильм» ────────────────────────────────
    pandafilm: () => {
        const GL = ['永', '道', '心', '和', '氣', '龍', '風', '静'];
        const mkG = (b) => ({ x: .05 + Math.random() * .9, y: b ? 1.06 + Math.random() * .3 : Math.random(), s: 14 + Math.random() * 22, v: .016 + Math.random() * .026, rot: (Math.random() - .5) * .3, a: Math.random() * 6.28, ch: pickOne(GL) });
        const mkP = (t) => ({ x: t ? Math.random() * 1.1 - .1 : Math.random(), y: t ? -.06 - Math.random() * .25 : Math.random(), r: 2.8 + Math.random() * 4.5, vx: .008 + Math.random() * .022, vy: .02 + Math.random() * .038, rot: Math.random() * 6.28, vr: (Math.random() - .5) * 1.3, sw: Math.random() * 6.28 });
        const mkD = (t) => ({ x: Math.random(), y: t ? -.08 - Math.random() * .3 : Math.random(), s: 9 + Math.random() * 10, v: .03 + Math.random() * .05, rot: Math.random() * 6.28, vr: (Math.random() - .5) * 1.4, sw: Math.random() * 6.28 });
        const glyphs = Array.from({ length: N(12) }, () => mkG(false));
        const petals = Array.from({ length: N(20) }, () => mkP(false));
        const dumps = Array.from({ length: N(9) }, () => mkD(false));
        let t = 0;
        return { draw(ctx, W, H, dt) {
            t += dt;
            ctx.fillStyle = '#E7D7B0';
            glyphs.forEach(g => {
                g.y -= g.v * dt; g.x += Math.sin(t * .5 + g.a) * .015 * dt;
                if (g.y < -.14) Object.assign(g, mkG(true));
                const fade = clamp(g.y * 3, 0, 1) * clamp((1.06 - g.y) * 3, 0, 1);
                ctx.globalAlpha = (.05 + .025 * Math.sin(t * .8 + g.a)) * fade;
                ctx.font = g.s + 'px "Songti SC","Noto Serif CJK",serif';
                ctx.save(); ctx.translate(g.x * W, g.y * H); ctx.rotate(g.rot); ctx.fillText(g.ch, 0, 0); ctx.restore();
            });
            ctx.fillStyle = '#D9A7A7';
            petals.forEach(pt => {
                pt.x += (pt.vx + Math.sin(t * .9 + pt.sw) * .012) * dt; pt.y += pt.vy * dt; pt.rot += pt.vr * dt;
                if (pt.y > 1.1 || pt.x > 1.12) Object.assign(pt, mkP(true));
                ctx.globalAlpha = .08 + .025 * Math.sin(t + pt.sw);
                ctx.save(); ctx.translate(pt.x * W, pt.y * H); ctx.rotate(pt.rot);
                ctx.beginPath(); ctx.ellipse(0, 0, pt.r, pt.r * .52, .5, 0, 6.283); ctx.fill(); ctx.restore();
            });
            // пельмешки
            dumps.forEach(d => {
                d.y += d.v * dt; d.x += Math.sin(t * .8 + d.sw) * .0009; d.rot += d.vr * dt;
                if (d.y > 1.12) Object.assign(d, mkD(true));
                ctx.save(); ctx.translate(d.x * W, d.y * H); ctx.rotate(d.rot);
                ctx.globalAlpha = .13; ctx.fillStyle = '#F3E7CE';
                ctx.beginPath(); ctx.ellipse(0, 0, d.s, d.s * .62, 0, 0, 6.283); ctx.fill();
                ctx.globalAlpha = .10; ctx.strokeStyle = '#C9B48C'; ctx.lineWidth = 1;
                ctx.beginPath(); ctx.arc(0, -d.s * .12, d.s * .72, Math.PI * .18, Math.PI * .82); ctx.stroke();
                ctx.restore();
            });
            ctx.globalAlpha = 1;
        } };
    },
    spider: () => {
        const mkPizza = (top) => ({ x: .06 + Math.random() * .88, y: top ? -.12 - Math.random() * .4 : Math.random() * .7, v: .10 + Math.random() * .13, s: 11 + Math.random() * 13, rot: Math.random() * 6.28, vr: (Math.random() - .5) * 1.2, caught: 0 });
        const pizzas = Array.from({ length: N(8) }, () => mkPizza(false));
        const shots = [];
        let wait = .5;
        return { draw(ctx, W, H, dt) {
            wait -= dt;
            if (wait <= 0) {
                const free = pizzas.filter(x => !x.caught);
                if (free.length) { const pz = pickOne(free); pz.caught = 1; shots.push({ p: pz, from: Math.random() < .5 ? 0 : 1, age: 0 }); }
                wait = .6 + Math.random() * 1.3;
            }
            for (let i = shots.length - 1; i >= 0; i--) {
                const s = shots[i];
                s.age += dt;
                const ax = s.from ? W * .97 : W * .03, ay = H * .05;
                const bx = s.p.x * W, by = s.p.y * H;
                const k = clamp(s.age * 3.2, 0, 1);
                ctx.globalAlpha = .20 * (1 - clamp((s.age - 1.5) / .9, 0, 1));
                ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 1.1;
                ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(ax + (bx - ax) * k, ay + (by - ay) * k); ctx.stroke();
                if (k >= 1) { // «липучка» на конце
                    ctx.globalAlpha = .16; ctx.beginPath(); ctx.arc(bx, by, 3.2, 0, 6.283); ctx.stroke();
                }
                if (s.age > 2.4) shots.splice(i, 1);
            }
            pizzas.forEach(pz => {
                pz.y += pz.v * dt * (pz.caught ? .05 : 1);
                pz.rot += pz.vr * dt * (pz.caught ? .12 : 1);
                if (pz.y > 1.14) Object.assign(pz, mkPizza(true));
                const s = pz.s;
                ctx.save(); ctx.translate(pz.x * W, pz.y * H); ctx.rotate(pz.rot);
                ctx.globalAlpha = .17; ctx.fillStyle = '#E8A33D';
                ctx.beginPath(); ctx.moveTo(0, -s); ctx.lineTo(s * .62, s * .72); ctx.lineTo(-s * .62, s * .72); ctx.closePath(); ctx.fill();
                ctx.globalAlpha = .14; ctx.fillStyle = '#C0392B';
                ctx.beginPath(); ctx.arc(-s * .17, s * .14, s * .13, 0, 6.283); ctx.fill();
                ctx.beginPath(); ctx.arc(s * .2, s * .34, s * .11, 0, 6.283); ctx.fill();
                ctx.restore();
            });
            ctx.globalAlpha = 1;
        } };
    },
    dragon: () => {
        let next = 0, cur = null;
        const spawn = () => ({ x: .12 + Math.random() * .76, y: .16 + Math.random() * .66, s: Math.random() < .35 ? 1.5 : 1, life: 0, ttl: .16 + Math.random() * .14, flip: Math.random() < .5 });
        const body = (ctx, s) => {
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.quadraticCurveTo(-s * 1.5, -s * .95, -s * 2.6, -s * .2);
            ctx.quadraticCurveTo(-s * 1.4, -s * .1, -s * .5, s * .35);
            ctx.quadraticCurveTo(-s * 1.3, s * .95, -s * 2.3, s * 1.1);
            ctx.quadraticCurveTo(-s * .9, s * .5, 0, s * .5);
            ctx.quadraticCurveTo(s * .9, s * .5, s * 2.3, s * 1.1);
            ctx.quadraticCurveTo(s * 1.3, s * .95, s * .5, s * .35);
            ctx.quadraticCurveTo(s * 1.4, -s * .1, s * 2.6, -s * .2);
            ctx.quadraticCurveTo(s * 1.5, -s * .95, 0, 0);
            ctx.fill();
        };
        return { fps: 24, draw(ctx, W, H, dt) {
            if (!cur) { next -= dt; if (next <= 0) cur = spawn(); }
            if (cur) {
                cur.life += dt;
                const k = Math.sin(clamp(cur.life / cur.ttl, 0, 1) * Math.PI);
                const base = Math.min(W, H) * .055 * cur.s;
                ctx.save(); ctx.translate(cur.x * W, cur.y * H); if (cur.flip) ctx.scale(-1, 1);
                ctx.globalAlpha = .26 * k; ctx.fillStyle = '#0C1A13';
                body(ctx, base);
                ctx.globalAlpha = .40 * k; ctx.fillStyle = '#8CF0B4';
                ctx.beginPath(); ctx.arc(base * .16, -base * .03, base * .085, 0, 6.283); ctx.fill();
                ctx.restore();
                if (cur.life >= cur.ttl) { cur = null; next = .22 + Math.random() * .85; }
            }
            ctx.globalAlpha = 1;
        } };
    },
    claws: () => {
        const marks = [];
        let wait = .25;
        const cap = Math.max(2, N(5));
        return { fps: 22, draw(ctx, W, H, dt) {
            wait -= dt;
            if (wait <= 0 && marks.length < cap) {
                marks.push({ x: .12 + Math.random() * .76, y: .12 + Math.random() * .76, a: (Math.random() - .5) * 1.7, len: .10 + Math.random() * .14, age: 0, ttl: 1.6 + Math.random() * 1.4 });
                wait = .45 + Math.random() * 1.1;
            }
            const unit = Math.min(W, H);
            for (let i = marks.length - 1; i >= 0; i--) {
                const m = marks[i];
                m.age += dt;
                const grow = clamp(m.age * 4.5, 0, 1);
                const fade = 1 - clamp((m.age - m.ttl * .45) / (m.ttl * .55), 0, 1);
                const L = m.len * unit * 2 * grow;
                ctx.save(); ctx.translate(m.x * W, m.y * H); ctx.rotate(m.a);
                ctx.strokeStyle = '#F0D6A8'; ctx.lineCap = 'round';
                [-1, 0, 1].forEach((k, j) => {
                    ctx.globalAlpha = .17 * fade;
                    ctx.lineWidth = j === 1 ? 2.2 : 1.6;
                    ctx.beginPath();
                    ctx.moveTo(-L * .5, k * unit * .026);
                    ctx.lineTo(L * .5, k * unit * .033);
                    ctx.stroke();
                });
                ctx.restore();
                if (m.age > m.ttl) marks.splice(i, 1);
            }
            ctx.globalAlpha = 1;
        } };
    },
    sparks: () => {
        const p = Array.from({ length: N(30) }, () => ({ x: Math.random(), y: Math.random(), r: .8 + Math.random() * 1.8, v: .012 + Math.random() * .03, ph: Math.random() * 6.28 }));
        let t = 0;
        return { draw(ctx, W, H, dt) {
            t += dt; ctx.fillStyle = '#F0C567';
            p.forEach(s => {
                s.y -= s.v * dt; s.x += Math.sin(t * .6 + s.ph) * .0006;
                if (s.y < -.05) { s.y = 1.05; s.x = Math.random(); }
                ctx.globalAlpha = .10 + .10 * Math.sin(t * 1.6 + s.ph);
                ctx.beginPath(); ctx.arc(s.x * W, s.y * H, s.r, 0, 6.283); ctx.fill();
            });
            ctx.globalAlpha = 1;
        } };
    },
    snow: () => {
        const f = Array.from({ length: N(46) }, () => ({ x: Math.random(), y: Math.random(), r: 1 + Math.random() * 2.2, v: .03 + Math.random() * .055, sw: Math.random() * 6.28 }));
        let t = 0;
        return { fps: 22, draw(ctx, W, H, dt) {
            t += dt; ctx.fillStyle = '#DDF2FB'; ctx.globalAlpha = .15;
            f.forEach(s => {
                s.y += s.v * dt; s.x += Math.sin(t * .7 + s.sw) * .0012;
                if (s.y > 1.05) { s.y = -.05; s.x = Math.random(); }
                ctx.beginPath(); ctx.arc(s.x * W, s.y * H, s.r, 0, 6.283); ctx.fill();
            });
            ctx.globalAlpha = 1;
        } };
    },
    // болото: пузыри всплывают и лопаются с брызгами
    swamp: () => {
        const mk = (bottom) => ({
            x: .03 + Math.random() * .94,
            y: bottom ? 1.06 + Math.random() * .35 : .1 + Math.random() * .9,
            r: 4 + Math.random() * 15, v: .035 + Math.random() * .095,
            sw: Math.random() * 6.28, pop: .04 + Math.random() * .8
        });
        const bubbles = Array.from({ length: N(46) }, () => mk(false));
        const pops = [];
        let t = 0;
        return { draw(ctx, W, H, dt) {
            t += dt;
            for (let i = 0; i < bubbles.length; i++) {
                const b = bubbles[i];
                b.y -= b.v * dt;
                b.x += Math.sin(t * 1.1 + b.sw) * .0013;
                if (b.y <= b.pop) { pops.push({ x: b.x, y: b.y, r: b.r, age: 0 }); bubbles[i] = mk(true); continue; }
                const x = b.x * W, y = b.y * H;
                const fade = clamp((1.06 - b.y) * 4, 0, 1);
                ctx.globalAlpha = .15 * fade; ctx.strokeStyle = '#D6E24A'; ctx.lineWidth = 1.2;
                ctx.beginPath(); ctx.arc(x, y, b.r, 0, 6.283); ctx.stroke();
                ctx.globalAlpha = .07 * fade; ctx.fillStyle = '#6E8C3A';
                ctx.beginPath(); ctx.arc(x, y, b.r * .9, 0, 6.283); ctx.fill();
                ctx.globalAlpha = .18 * fade; ctx.fillStyle = '#F2F7D8';
                ctx.beginPath(); ctx.arc(x - b.r * .34, y - b.r * .34, Math.max(.9, b.r * .2), 0, 6.283); ctx.fill();
            }
            for (let i = pops.length - 1; i >= 0; i--) {
                const pp = pops[i];
                pp.age += dt;
                const k = pp.age / .45;
                if (k >= 1) { pops.splice(i, 1); continue; }
                const x = pp.x * W, y = pp.y * H;
                ctx.globalAlpha = .24 * (1 - k); ctx.strokeStyle = '#E8F2C0'; ctx.lineWidth = 1.4;
                ctx.beginPath(); ctx.arc(x, y, pp.r * (1 + k * 1.6), 0, 6.283); ctx.stroke();
                ctx.globalAlpha = .18 * (1 - k); ctx.fillStyle = '#E8F2C0';
                for (let j = 0; j < 5; j++) {
                    const a = j * 1.257 + pp.r;
                    const d = pp.r * (1 + k * 2.4);
                    ctx.beginPath(); ctx.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, 1.5, 0, 6.283); ctx.fill();
                }
            }
            ctx.globalAlpha = 1;
        } };
    },
    embers: () => {
        const mk = (bottom) => ({ x: Math.random(), y: bottom ? 1.05 + Math.random() * .2 : Math.random(), r: .8 + Math.random() * 2.4, v: .05 + Math.random() * .11, sw: Math.random() * 6.28 });
        const p = Array.from({ length: N(60) }, () => mk(false));
        let t = 0;
        return { draw(ctx, W, H, dt) {
            t += dt;
            p.forEach(s => {
                s.y -= s.v * dt; s.x += Math.sin(t * 1.4 + s.sw) * .0016;
                if (s.y < -.05) Object.assign(s, mk(true));
                const glow = .5 + .5 * Math.sin(t * 3 + s.sw);
                ctx.globalAlpha = (.10 + .12 * glow) * clamp(s.y * 2.2, 0, 1);
                ctx.fillStyle = glow > .55 ? '#FFD27A' : '#E8712B';
                ctx.beginPath(); ctx.arc(s.x * W, s.y * H, s.r, 0, 6.283); ctx.fill();
            });
            ctx.globalAlpha = 1;
        } };
    },
    bats: () => {
        const mk = () => ({ x: -.1 - Math.random() * .3, y: .1 + Math.random() * .7, v: .09 + Math.random() * .16, s: .6 + Math.random() * .9, f: Math.random() * 6.28, bob: Math.random() * 6.28 });
        const bats = Array.from({ length: N(11) }, () => { const b = mk(); b.x = Math.random(); return b; });
        let t = 0;
        return { fps: 24, draw(ctx, W, H, dt) {
            t += dt;
            const base = Math.min(W, H) * .035;
            ctx.fillStyle = '#0B0B10';
            bats.forEach(b => {
                b.x += b.v * dt;
                if (b.x > 1.15) Object.assign(b, mk());
                const wing = Math.sin(t * 9 + b.f);
                const y = (b.y + Math.sin(t * 1.2 + b.bob) * .03) * H;
                const s = base * b.s;
                ctx.globalAlpha = .30;
                ctx.save(); ctx.translate(b.x * W, y);
                ctx.beginPath();
                ctx.moveTo(0, 0);
                ctx.quadraticCurveTo(-s * .9, -s * (.5 + wing * .45), -s * 2, -s * .1);
                ctx.quadraticCurveTo(-s * 1.1, s * .15, 0, s * .35);
                ctx.quadraticCurveTo(s * 1.1, s * .15, s * 2, -s * .1);
                ctx.quadraticCurveTo(s * .9, -s * (.5 + wing * .45), 0, 0);
                ctx.fill();
                ctx.restore();
            });
            ctx.globalAlpha = 1;
        } };
    },
    leaves: () => {
        const mk = (top) => ({ x: top ? Math.random() * 1.2 - .1 : Math.random(), y: top ? -.08 - Math.random() * .3 : Math.random(), s: 5 + Math.random() * 9, vx: .01 + Math.random() * .03, vy: .03 + Math.random() * .05, rot: Math.random() * 6.28, vr: (Math.random() - .5) * 2, sw: Math.random() * 6.28 });
        const lv = Array.from({ length: N(28) }, () => mk(false));
        const COL = ['#C9762B', '#A8541F', '#D9A441', '#7A8C3A'];
        lv.forEach(l => { l.c = pickOne(COL); });
        let t = 0;
        return { draw(ctx, W, H, dt) {
            t += dt;
            lv.forEach(l => {
                l.x += (l.vx + Math.sin(t * .9 + l.sw) * .014) * dt;
                l.y += l.vy * dt; l.rot += l.vr * dt;
                if (l.y > 1.1 || l.x > 1.15) { const n = mk(true); n.c = l.c; Object.assign(l, n); }
                ctx.globalAlpha = .13;
                ctx.fillStyle = l.c;
                ctx.save(); ctx.translate(l.x * W, l.y * H); ctx.rotate(l.rot);
                ctx.beginPath(); ctx.ellipse(0, 0, l.s, l.s * .45, .6, 0, 6.283); ctx.fill();
                ctx.restore();
            });
            ctx.globalAlpha = 1;
        } };
    },
    fireflies: () => {
        const mk = () => ({ x: Math.random(), y: Math.random(), a: Math.random() * 6.28, v: .008 + Math.random() * .022, ph: Math.random() * 6.28, r: 1.2 + Math.random() * 2 });
        const f = Array.from({ length: N(34) }, mk);
        let t = 0;
        return { draw(ctx, W, H, dt) {
            t += dt;
            f.forEach(s => {
                s.a += (Math.random() - .5) * dt * 2.4;
                s.x += Math.cos(s.a) * s.v * dt; s.y += Math.sin(s.a) * s.v * dt;
                if (s.x < 0 || s.x > 1) s.a = Math.PI - s.a;
                if (s.y < 0 || s.y > 1) s.a = -s.a;
                s.x = clamp(s.x, 0, 1); s.y = clamp(s.y, 0, 1);
                const pulse = .5 + .5 * Math.sin(t * 2.2 + s.ph);
                const x = s.x * W, y = s.y * H;
                ctx.globalAlpha = .07 * pulse; ctx.fillStyle = '#D8F06A';
                ctx.beginPath(); ctx.arc(x, y, s.r * 5, 0, 6.283); ctx.fill();
                ctx.globalAlpha = .28 * pulse; ctx.fillStyle = '#F4FFC2';
                ctx.beginPath(); ctx.arc(x, y, s.r, 0, 6.283); ctx.fill();
            });
            ctx.globalAlpha = 1;
        } };
    },
    lightning: () => {
        let wait = 1.2, bolt = null, flash = 0;
        const mkBolt = (W, H) => {
            const pts = [];
            let x = W * (.15 + Math.random() * .7), y = -10;
            const seg = 8 + rnd(6);
            for (let i = 0; i <= seg; i++) { pts.push([x, y]); x += (Math.random() - .5) * W * .12; y += H / seg * (.7 + Math.random() * .6); }
            return { pts, age: 0, ttl: .28 + Math.random() * .2 };
        };
        return { fps: 26, draw(ctx, W, H, dt) {
            wait -= dt;
            if (!bolt && wait <= 0) { bolt = mkBolt(W, H); flash = 1; wait = 1.6 + Math.random() * 3.4; }
            if (flash > 0) {
                flash -= dt * 3.2;
                ctx.globalAlpha = clamp(flash, 0, 1) * .05;
                ctx.fillStyle = '#CFE4FF'; ctx.fillRect(0, 0, W, H);
            }
            if (bolt) {
                bolt.age += dt;
                const k = 1 - clamp(bolt.age / bolt.ttl, 0, 1);
                ctx.strokeStyle = '#DCEBFF'; ctx.lineCap = 'round';
                ctx.globalAlpha = .40 * k; ctx.lineWidth = 2.2;
                ctx.beginPath();
                bolt.pts.forEach((pt, i) => { i ? ctx.lineTo(pt[0], pt[1]) : ctx.moveTo(pt[0], pt[1]); });
                ctx.stroke();
                ctx.globalAlpha = .14 * k; ctx.lineWidth = 6;
                ctx.stroke();
                if (bolt.age > bolt.ttl) bolt = null;
            }
            ctx.globalAlpha = 1;
        } };
    },
    confetti: () => {
        const COL = ['#F2C21B', '#E0453E', '#3FA34D', '#5B8DEF', '#E05FA8', '#F2F2F2'];
        const mk = (top) => ({ x: top ? Math.random() * 1.2 - .1 : Math.random(), y: top ? -.08 - Math.random() * .35 : Math.random(), w: 4 + Math.random() * 6, h: 7 + Math.random() * 8, vx: (Math.random() - .5) * .04, vy: .06 + Math.random() * .1, rot: Math.random() * 6.28, vr: (Math.random() - .5) * 4, c: pickOne(COL), sw: Math.random() * 6.28 });
        const c = Array.from({ length: N(40) }, () => mk(false));
        let t = 0;
        return { draw(ctx, W, H, dt) {
            t += dt;
            c.forEach(s => {
                s.x += (s.vx + Math.sin(t * 1.5 + s.sw) * .02) * dt;
                s.y += s.vy * dt; s.rot += s.vr * dt;
                if (s.y > 1.12) Object.assign(s, mk(true));
                ctx.globalAlpha = .17;
                ctx.fillStyle = s.c;
                ctx.save(); ctx.translate(s.x * W, s.y * H); ctx.rotate(s.rot);
                const squash = Math.abs(Math.cos(t * 3 + s.sw));
                ctx.fillRect(-s.w / 2, -s.h / 2 * squash, s.w, s.h * squash);
                ctx.restore();
            });
            ctx.globalAlpha = 1;
        } };
    },
    ash: () => {
        const mk = (top) => ({ x: Math.random(), y: top ? -.05 - Math.random() * .3 : Math.random(), r: .7 + Math.random() * 1.9, v: .012 + Math.random() * .03, sw: Math.random() * 6.28 });
        const p = Array.from({ length: N(56) }, () => mk(false));
        let t = 0;
        return { draw(ctx, W, H, dt) {
            t += dt; ctx.fillStyle = '#C9CDD2';
            p.forEach(s => {
                s.y += s.v * dt; s.x += Math.sin(t * .5 + s.sw) * .0011;
                if (s.y > 1.05) Object.assign(s, mk(true));
                ctx.globalAlpha = .10 + .06 * Math.sin(t + s.sw);
                ctx.beginPath(); ctx.arc(s.x * W, s.y * H, s.r, 0, 6.283); ctx.fill();
            });
            ctx.globalAlpha = 1;
        } };
    },
    grid: () => {
        let t = 0;
        return { fps: 24, draw(ctx, W, H, dt) {
            t += dt;
            const hz = H * .42;
            ctx.strokeStyle = '#4BD5FF'; ctx.lineWidth = 1;
            const cols = Math.max(6, Math.round(14 * clamp(D(), .4, 2)));
            ctx.globalAlpha = .07;
            for (let i = -cols; i <= cols; i++) {
                const x = W / 2 + (i / cols) * W * 1.6;
                ctx.beginPath(); ctx.moveTo(W / 2 + (i / cols) * W * .08, hz); ctx.lineTo(x, H); ctx.stroke();
            }
            const rows = Math.max(5, Math.round(10 * clamp(D(), .4, 2)));
            for (let i = 0; i < rows; i++) {
                const q = ((i / rows) + (t * .12) % (1 / rows)) % 1;
                const y = hz + Math.pow(q, 2.4) * (H - hz);
                ctx.globalAlpha = .085 * (1 - q * .6);
                ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
            }
            ctx.globalAlpha = .10; ctx.strokeStyle = '#F0A202';
            ctx.beginPath(); ctx.moveTo(0, hz); ctx.lineTo(W, hz); ctx.stroke();
            ctx.globalAlpha = 1;
        } };
    },
    shuriken: () => {
        const mk = () => {
            const dir = Math.random() < .5 ? 1 : -1;
            return { x: dir > 0 ? -.14 : 1.14, y: .06 + Math.random() * .88, vx: dir * (.26 + Math.random() * .34), vy: (Math.random() - .5) * .1, s: 6 + Math.random() * 7, rot: Math.random() * 6.28, vr: (6 + Math.random() * 8) * dir };
        };
        const sh = Array.from({ length: N(8) }, () => { const s = mk(); s.x = Math.random(); return s; });
        return { fps: 26, draw(ctx, W, H, dt) {
            for (let i = 0; i < sh.length; i++) {
                const s = sh[i];
                s.x += s.vx * dt; s.y += s.vy * dt; s.rot += s.vr * dt;
                if (s.x < -.22 || s.x > 1.22) { sh[i] = mk(); continue; }
                const x = s.x * W, y = s.y * H;
                ctx.globalAlpha = .10; ctx.strokeStyle = '#9FE870'; ctx.lineWidth = 1.2;
                ctx.beginPath(); ctx.moveTo(x - s.vx * W * .07, y - s.vy * H * .07); ctx.lineTo(x, y); ctx.stroke();
                ctx.save(); ctx.translate(x, y); ctx.rotate(s.rot);
                ctx.globalAlpha = .26; ctx.fillStyle = '#C9D1D9';
                ctx.beginPath();
                for (let k = 0; k < 4; k++) {
                    const a = k * 1.5708;
                    ctx.moveTo(0, 0);
                    ctx.lineTo(Math.cos(a) * s.s * 2.1, Math.sin(a) * s.s * 2.1);
                    ctx.lineTo(Math.cos(a + .62) * s.s * .75, Math.sin(a + .62) * s.s * .75);
                }
                ctx.fill();
                ctx.restore();
            }
            ctx.globalAlpha = 1;
        } };
    },
    bananas: () => {
        const mk = (top) => ({ x: Math.random(), y: top ? -.1 - Math.random() * .35 : Math.random(), s: 8 + Math.random() * 8, v: .05 + Math.random() * .09, rot: Math.random() * 6.28, vr: (Math.random() - .5) * 3, sw: Math.random() * 6.28 });
        const b = Array.from({ length: N(22) }, () => mk(false));
        let t = 0;
        return { draw(ctx, W, H, dt) {
            t += dt; ctx.fillStyle = '#F5D33C';
            b.forEach(o => {
                o.y += o.v * dt; o.x += Math.sin(t * 1.2 + o.sw) * .0016; o.rot += o.vr * dt;
                if (o.y > 1.12) Object.assign(o, mk(true));
                ctx.globalAlpha = .17;
                ctx.save(); ctx.translate(o.x * W, o.y * H); ctx.rotate(o.rot);
                ctx.beginPath();
                ctx.arc(0, 0, o.s, Math.PI * .15, Math.PI * .85);
                ctx.arc(0, o.s * .34, o.s * .86, Math.PI * .86, Math.PI * .14, true);
                ctx.closePath(); ctx.fill();
                ctx.restore();
            });
            ctx.globalAlpha = 1;
        } };
    },
    paws: () => {
        const prints = [];
        let wait = .2, x = .05, y = .5, ang = 0, side = 1;
        const cap = Math.max(8, N(26));
        return { fps: 20, draw(ctx, W, H, dt) {
            wait -= dt;
            if (wait <= 0) {
                ang += (Math.random() - .5) * .55;
                x += Math.cos(ang) * .05; y += Math.sin(ang) * .05;
                if (x > 1.1 || x < -.1 || y > 1.1 || y < -.1) { x = Math.random() * .2; y = Math.random(); ang = (Math.random() - .5); }
                prints.push({ x, y, a: ang, side, age: 0 });
                if (prints.length > cap) prints.shift();
                side = -side;
                wait = .22 + Math.random() * .12;
            }
            const unit = Math.min(W, H) * .016;
            ctx.fillStyle = '#E8B33C';
            for (let i = prints.length - 1; i >= 0; i--) {
                const pr = prints[i];
                pr.age += dt;
                const k = clamp(pr.age / 4.5, 0, 1);
                if (k >= 1) { prints.splice(i, 1); continue; }
                ctx.globalAlpha = .17 * (1 - k);
                ctx.save();
                ctx.translate(pr.x * W + Math.cos(pr.a + 1.57) * unit * 1.7 * pr.side, pr.y * H + Math.sin(pr.a + 1.57) * unit * 1.7 * pr.side);
                ctx.rotate(pr.a);
                ctx.beginPath(); ctx.ellipse(0, 0, unit * 1.5, unit * 1.15, 0, 0, 6.283); ctx.fill();
                for (let j = 0; j < 4; j++) {
                    const a = -.95 + j * .63;
                    ctx.beginPath(); ctx.ellipse(Math.cos(a) * unit * 2.1, Math.sin(a) * unit * 2.1, unit * .55, unit * .44, a, 0, 6.283); ctx.fill();
                }
                ctx.restore();
            }
            ctx.globalAlpha = 1;
        } };
    },
    speed: () => {
        const mk = (right) => ({ x: right ? 1.1 + Math.random() * .3 : Math.random(), y: .05 + Math.random() * .9, len: .06 + Math.random() * .22, v: .5 + Math.random() * 1.3, w: 1 + Math.random() * 2 });
        const s = Array.from({ length: N(34) }, () => mk(false));
        let dash = 0;
        return { fps: 26, draw(ctx, W, H, dt) {
            ctx.strokeStyle = '#F0A202'; ctx.lineCap = 'round';
            s.forEach(o => {
                o.x -= o.v * dt;
                if (o.x < -.35) Object.assign(o, mk(true));
                ctx.globalAlpha = .09 + .05 * (o.v / 1.8);
                ctx.lineWidth = o.w;
                ctx.beginPath(); ctx.moveTo(o.x * W, o.y * H); ctx.lineTo((o.x + o.len) * W, o.y * H); ctx.stroke();
            });
            dash = (dash + dt * .55) % .25;
            ctx.strokeStyle = '#D62828'; ctx.lineWidth = 3; ctx.globalAlpha = .10;
            for (let x = -.25 + dash; x < 1.1; x += .25) {
                ctx.beginPath(); ctx.moveTo(x * W, H * .86); ctx.lineTo((x + .11) * W, H * .86); ctx.stroke();
            }
            ctx.globalAlpha = 1;
        } };
    },
    ocean: () => {
        const mk = (bottom) => ({ x: Math.random(), y: bottom ? 1.05 + Math.random() * .2 : Math.random(), r: 1.5 + Math.random() * 5, v: .04 + Math.random() * .09, sw: Math.random() * 6.28 });
        const b = Array.from({ length: N(40) }, () => mk(false));
        let t = 0;
        return { draw(ctx, W, H, dt) {
            t += dt;
            ctx.globalAlpha = .04; ctx.fillStyle = '#9FE8FF';
            for (let i = 0; i < 4; i++) {
                const x = (i / 4 + .08 + Math.sin(t * .25 + i) * .02) * W;
                ctx.beginPath();
                ctx.moveTo(x, 0); ctx.lineTo(x + W * .05, 0);
                ctx.lineTo(x + W * .18, H); ctx.lineTo(x - W * .02, H);
                ctx.closePath(); ctx.fill();
            }
            ctx.strokeStyle = '#CFF3FF'; ctx.lineWidth = 1;
            b.forEach(o => {
                o.y -= o.v * dt; o.x += Math.sin(t * 1.1 + o.sw) * .0013;
                if (o.y < -.05) Object.assign(o, mk(true));
                ctx.globalAlpha = .15;
                ctx.beginPath(); ctx.arc(o.x * W, o.y * H, o.r, 0, 6.283); ctx.stroke();
            });
            ctx.globalAlpha = 1;
        } };
    },
    runes: () => {
        const CH = 'ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃᛇᛈᛉᛊᛏᛒᛖᛗᛚᛜᛞᛟ';
        const mk = () => ({ a: Math.random() * 6.28, r: .26 + Math.random() * .22, ch: CH.charAt(rnd(CH.length)), ph: Math.random() * 6.28, s: 11 + Math.random() * 10 });
        const rs = Array.from({ length: N(18) }, mk);
        let t = 0;
        return { draw(ctx, W, H, dt) {
            t += dt;
            const cx = W * .5, cy = H * .5, unit = Math.min(W, H);
            ctx.lineWidth = 1; ctx.strokeStyle = '#C9A227';
            [.30, .43].forEach((r, i) => {
                ctx.globalAlpha = .05 + i * .012;
                ctx.beginPath(); ctx.arc(cx, cy, unit * r, 0, 6.283); ctx.stroke();
            });
            ctx.fillStyle = '#E7C55A'; ctx.textAlign = 'center';
            rs.forEach(o => {
                const a = o.a + t * .12;
                ctx.globalAlpha = .10 + .10 * Math.sin(t * 1.4 + o.ph);
                ctx.font = o.s + 'px serif';
                ctx.fillText(o.ch, cx + Math.cos(a) * unit * o.r, cy + Math.sin(a) * unit * o.r);
            });
            ctx.textAlign = 'start'; ctx.globalAlpha = 1;
        } };
    },
    snitch: () => {
        let x = .5, y = .5, tx = Math.random(), ty = Math.random(), t = 0;
        const trail = [];
        return { fps: 26, draw(ctx, W, H, dt) {
            t += dt;
            const dx = tx - x, dy = ty - y, d = Math.sqrt(dx * dx + dy * dy);
            if (d < .04) { tx = .08 + Math.random() * .84; ty = .08 + Math.random() * .84; }
            else { x += dx / d * .35 * dt; y += dy / d * .35 * dt; }
            trail.push([x, y]);
            if (trail.length > 18) trail.shift();
            ctx.strokeStyle = '#F0C567'; ctx.lineWidth = 1.4;
            for (let i = 1; i < trail.length; i++) {
                ctx.globalAlpha = .12 * (i / trail.length);
                ctx.beginPath();
                ctx.moveTo(trail[i - 1][0] * W, trail[i - 1][1] * H);
                ctx.lineTo(trail[i][0] * W, trail[i][1] * H);
                ctx.stroke();
            }
            const px = x * W, py = y * H, s = Math.min(W, H) * .012, wing = Math.abs(Math.sin(t * 14));
            ctx.globalAlpha = .32; ctx.fillStyle = '#F5D98A';
            ctx.beginPath(); ctx.arc(px, py, s, 0, 6.283); ctx.fill();
            ctx.globalAlpha = .17; ctx.fillStyle = '#FFF6D8';
            [-1, 1].forEach(k => {
                ctx.save(); ctx.translate(px, py); ctx.rotate(k * (.5 + wing * .7));
                ctx.beginPath(); ctx.ellipse(k * s * 2.6, 0, s * 2.4, s * .7 * (.4 + wing * .6), 0, 0, 6.283); ctx.fill();
                ctx.restore();
            });
            ctx.globalAlpha = 1;
        } };
    },
    // полутон комикса: точечная сетка + периодический «бам»
    comic: () => {
        const bursts = [];
        let t = 0, wait = 1.1;
        return { fps: 22, draw(ctx, W, H, dt) {
            t += dt; wait -= dt;
            const step = Math.max(18, Math.round(30 / clamp(D(), .4, 2)));
            ctx.fillStyle = '#5B8DEF';
            for (let y = 0; y < H + step; y += step) {
                for (let x = 0; x < W + step; x += step) {
                    const w = .5 + .5 * Math.sin(x * .012 + y * .01 + t * .8);
                    ctx.globalAlpha = .015 + .05 * w;
                    ctx.beginPath(); ctx.arc(x, y, 1 + w * 1.8, 0, 6.283); ctx.fill();
                }
            }
            if (wait <= 0) { bursts.push({ x: .15 + Math.random() * .7, y: .15 + Math.random() * .7, age: 0 }); wait = 1.4 + Math.random() * 2.2; }
            ctx.strokeStyle = '#E23636'; ctx.lineWidth = 2;
            for (let i = bursts.length - 1; i >= 0; i--) {
                const b = bursts[i];
                b.age += dt;
                const k = b.age / .9;
                if (k >= 1) { bursts.splice(i, 1); continue; }
                const x = b.x * W, y = b.y * H, r = Math.min(W, H) * (.05 + k * .16);
                ctx.globalAlpha = .16 * (1 - k);
                ctx.beginPath();
                for (let j = 0; j < 12; j++) {
                    const a = j * (6.283 / 12), rr = r * (j % 2 ? .62 : 1);
                    const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
                    j ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
                }
                ctx.closePath(); ctx.stroke();
            }
            ctx.globalAlpha = 1;
        } };
    },
    // прицел-сканер: бегущая полоса, рамка захвата, тепловые точки
    scan: () => {
        const dots = Array.from({ length: N(24) }, () => ({ x: Math.random(), y: Math.random(), r: 1 + Math.random() * 2, ph: Math.random() * 6.28 }));
        let y = 0, t = 0;
        return { fps: 24, draw(ctx, W, H, dt) {
            t += dt; y = (y + dt * .22) % 1.2;
            const yy = (y - .1) * H;
            const g = ctx.createLinearGradient(0, yy - H * .06, 0, yy + H * .06);
            g.addColorStop(0, 'rgba(226,59,59,0)');
            g.addColorStop(.5, 'rgba(226,59,59,.10)');
            g.addColorStop(1, 'rgba(226,59,59,0)');
            ctx.fillStyle = g; ctx.fillRect(0, yy - H * .06, W, H * .12);
            ctx.globalAlpha = .16; ctx.strokeStyle = '#E23B3B'; ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(0, yy); ctx.lineTo(W, yy); ctx.stroke();
            const cx = W * .5, cy = H * .5, s = Math.min(W, H) * (.18 + .012 * Math.sin(t * 1.5));
            ctx.globalAlpha = .10;
            [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(q => {
                ctx.beginPath();
                ctx.moveTo(cx + q[0] * s, cy + q[1] * s * .7);
                ctx.lineTo(cx + q[0] * s, cy + q[1] * s);
                ctx.lineTo(cx + q[0] * s * .7, cy + q[1] * s);
                ctx.stroke();
            });
            ctx.fillStyle = '#E27A3B';
            dots.forEach(d => {
                ctx.globalAlpha = .06 + .06 * Math.sin(t * 3 + d.ph);
                ctx.beginPath(); ctx.arc(d.x * W, d.y * H, d.r, 0, 6.283); ctx.fill();
            });
            ctx.globalAlpha = 1;
        } };
    },
    ghosts: () => {
        const mk = (bottom) => ({ x: Math.random(), y: bottom ? 1.15 + Math.random() * .2 : Math.random(), r: 20 + Math.random() * 44, v: .02 + Math.random() * .035, sw: Math.random() * 6.28, ph: Math.random() * 6.28 });
        const g = Array.from({ length: N(12) }, () => mk(false));
        let t = 0;
        return { draw(ctx, W, H, dt) {
            t += dt; ctx.fillStyle = '#CFD8E3';
            g.forEach(o => {
                o.y -= o.v * dt; o.x += Math.sin(t * .4 + o.sw) * .0009;
                if (o.y < -.22) Object.assign(o, mk(true));
                const x = o.x * W, y = o.y * H;
                const a = .035 + .02 * Math.sin(t * .9 + o.ph);
                ctx.globalAlpha = a;
                ctx.beginPath(); ctx.ellipse(x, y, o.r * .6, o.r, 0, 0, 6.283); ctx.fill();
                ctx.globalAlpha = a * 1.7;
                ctx.beginPath(); ctx.arc(x, y - o.r * .55, o.r * .3, 0, 6.283); ctx.fill();
            });
            ctx.globalAlpha = 1;
        } };
    },
    tendrils: () => {
        const mk = () => ({ side: rnd(4), p: Math.random(), age: 0, ttl: 1.6 + Math.random() * 1.8, len: .16 + Math.random() * .3, w: 2 + Math.random() * 4, wig: Math.random() * 6.28 });
        const ts = Array.from({ length: N(9) }, mk);
        let t = 0;
        return { fps: 24, draw(ctx, W, H, dt) {
            t += dt;
            ctx.lineCap = 'round';
            const unit = Math.min(W, H);
            for (let i = 0; i < ts.length; i++) {
                const o = ts[i];
                o.age += dt;
                if (o.age > o.ttl) { ts[i] = mk(); continue; }
                const k = Math.sin(clamp(o.age / o.ttl, 0, 1) * Math.PI);
                let x0, y0, dx, dy;
                if (o.side === 0) { x0 = o.p * W; y0 = 0; dx = 0; dy = 1; }
                else if (o.side === 1) { x0 = W; y0 = o.p * H; dx = -1; dy = 0; }
                else if (o.side === 2) { x0 = o.p * W; y0 = H; dx = 0; dy = -1; }
                else { x0 = 0; y0 = o.p * H; dx = 1; dy = 0; }
                const L = o.len * unit * 2 * k;
                ctx.beginPath(); ctx.moveTo(x0, y0);
                for (let j = 1; j <= 6; j++) {
                    const q = j / 6;
                    const off = Math.sin(t * 2 + o.wig + q * 4) * L * .12;
                    ctx.lineTo(x0 + dx * L * q - dy * off, y0 + dy * L * q + dx * off);
                }
                ctx.globalAlpha = .30; ctx.strokeStyle = '#0A0A10'; ctx.lineWidth = o.w; ctx.stroke();
                ctx.globalAlpha = .10; ctx.strokeStyle = '#9BA3AE'; ctx.lineWidth = Math.max(1, o.w * .35); ctx.stroke();
            }
            ctx.globalAlpha = 1;
        } };
    },
    cards: () => {
        const mk = (top) => ({ x: Math.random(), y: top ? -.12 - Math.random() * .35 : Math.random(), w: 11 + Math.random() * 7, v: .05 + Math.random() * .09, rot: Math.random() * 6.28, vr: (Math.random() - .5) * 2.6, sw: Math.random() * 6.28, red: Math.random() < .5 });
        const c = Array.from({ length: N(20) }, () => mk(false));
        let t = 0;
        return { draw(ctx, W, H, dt) {
            t += dt;
            c.forEach(o => {
                o.y += o.v * dt; o.x += Math.sin(t * 1.1 + o.sw) * .0018; o.rot += o.vr * dt;
                if (o.y > 1.14) Object.assign(o, mk(true));
                const w = o.w, h = w * 1.45;
                ctx.save(); ctx.translate(o.x * W, o.y * H); ctx.rotate(o.rot);
                ctx.globalAlpha = .16; ctx.fillStyle = '#EFEFEF';
                ctx.fillRect(-w / 2, -h / 2, w, h);
                ctx.globalAlpha = .22; ctx.fillStyle = o.red ? '#C0392B' : '#2B2B2B';
                ctx.beginPath(); ctx.arc(0, 0, w * .2, 0, 6.283); ctx.fill();
                ctx.restore();
            });
            ctx.globalAlpha = 1;
        } };
    },
    // киноплёнка: перфорация по краям, царапины, вспышки засветки
    filmgrain: () => {
        const holes = 22;
        let t = 0, flick = 0;
        return { fps: 20, draw(ctx, W, H, dt) {
            t += dt; flick -= dt;
            const hs = Math.min(W, H) * .018;
            ctx.fillStyle = '#F2E9D8'; ctx.globalAlpha = .10;
            for (let i = 0; i < holes; i++) {
                const y = ((i / holes + t * .05) % 1) * H;
                ctx.beginPath(); ctx.roundRect ? ctx.roundRect(hs * .6, y - hs / 2, hs, hs, hs * .3) : ctx.rect(hs * .6, y - hs / 2, hs, hs);
                ctx.fill();
                ctx.beginPath(); ctx.roundRect ? ctx.roundRect(W - hs * 1.6, y - hs / 2, hs, hs, hs * .3) : ctx.rect(W - hs * 1.6, y - hs / 2, hs, hs);
                ctx.fill();
            }
            if (flick <= 0 && Math.random() < .01) flick = .05 + Math.random() * .08;
            if (flick > 0) { ctx.globalAlpha = .06; ctx.fillStyle = '#FFF6E0'; ctx.fillRect(0, 0, W, H); }
            ctx.globalAlpha = .03; ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 1;
            for (let i = 0; i < 3; i++) {
                const x = ((i * 37 + t * 40) % (W + 40)) - 20;
                ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + (Math.random() - .5) * 20, H); ctx.stroke();
            }
            ctx.globalAlpha = 1;
        } };
    },
    // сигарный дым: медленные завитки снизу вверх
    smoke: () => {
        const mk = (bottom) => ({ x: .1 + Math.random() * .8, y: bottom ? 1.05 + Math.random() * .2 : Math.random(), r: 30 + Math.random() * 70, v: .012 + Math.random() * .02, sw: Math.random() * 6.28, sp: .3 + Math.random() * .5 });
        const s = Array.from({ length: N(9) }, () => mk(false));
        let t = 0;
        return { draw(ctx, W, H, dt) {
            t += dt;
            s.forEach(o => {
                o.y -= o.v * dt; o.x += Math.sin(t * o.sp + o.sw) * .0012;
                if (o.y < -.25) Object.assign(o, mk(true));
                const fade = clamp((1.1 - o.y) * 1.6, 0, 1) * clamp(o.y * 3, 0, 1);
                ctx.globalAlpha = .035 * fade;
                ctx.fillStyle = '#C9CDD2';
                ctx.beginPath(); ctx.ellipse(o.x * W, o.y * H, o.r * (1 + (1 - o.y) * .4), o.r * .7, Math.sin(t * .3 + o.sw) * .3, 0, 6.283); ctx.fill();
            });
            ctx.globalAlpha = 1;
        } };
    },
    // капли крови: стекают вниз, оставляя короткий след
    blooddrip: () => {
        const mk = () => ({ x: Math.random(), y: -.05 - Math.random() * .3, v: .18 + Math.random() * .3, len: .02 + Math.random() * .04, w: 1.5 + Math.random() * 2.5 });
        const d = Array.from({ length: N(14) }, () => { const o = mk(); o.y = Math.random(); return o; });
        return { fps: 22, draw(ctx, W, H, dt) {
            ctx.fillStyle = '#8C1C2B'; ctx.strokeStyle = '#8C1C2B';
            d.forEach(o => {
                o.y += o.v * dt;
                if (o.y > 1.08) Object.assign(o, mk());
                const x = o.x * W, y = o.y * H, len = o.len * H;
                ctx.globalAlpha = .16; ctx.lineWidth = o.w; ctx.lineCap = 'round';
                ctx.beginPath(); ctx.moveTo(x, y - len); ctx.lineTo(x, y); ctx.stroke();
                ctx.globalAlpha = .20;
                ctx.beginPath(); ctx.arc(x, y + o.w * .4, o.w * .95, 0, 6.283); ctx.fill();
            });
            ctx.globalAlpha = 1;
        } };
    },
    // летящие стрелы с оперением
    arrows: () => {
        const mk = () => ({ x: -.12, y: .1 + Math.random() * .8, v: .3 + Math.random() * .28, drop: .015 + Math.random() * .02, len: 26 + Math.random() * 14 });
        const a = Array.from({ length: N(6) }, () => { const o = mk(); o.x = Math.random() * 1.1; return o; });
        return { fps: 26, draw(ctx, W, H, dt) {
            ctx.strokeStyle = '#3FA34D'; ctx.lineCap = 'round';
            a.forEach(o => {
                o.x += o.v * dt; o.y += o.drop * dt;
                if (o.x > 1.15 || o.y > 1.1) Object.assign(o, mk());
                const x = o.x * W, y = o.y * H, ang = Math.atan2(o.drop, o.v);
                ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
                ctx.globalAlpha = .19; ctx.lineWidth = 1.6;
                ctx.beginPath(); ctx.moveTo(-o.len, 0); ctx.lineTo(0, 0); ctx.stroke();
                ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-6, -4); ctx.lineTo(-6, 4); ctx.closePath(); ctx.fill();
                ctx.globalAlpha = .13;
                ctx.beginPath(); ctx.moveTo(-o.len, 0); ctx.lineTo(-o.len + 6, -4); ctx.moveTo(-o.len, 0); ctx.lineTo(-o.len + 6, 4); ctx.stroke();
                ctx.restore();
            });
            ctx.globalAlpha = 1;
        } };
    },
    // воздушные шары, покачиваясь, поднимаются вверх
    balloons: () => {
        const COL = ['#E23636', '#5B8DEF', '#F2C21B', '#3FA34D'];
        const mk = (bottom) => ({ x: .08 + Math.random() * .84, y: bottom ? 1.15 + Math.random() * .3 : Math.random(), r: 14 + Math.random() * 12, v: .02 + Math.random() * .035, sw: Math.random() * 6.28, c: pickOne(COL) });
        const b = Array.from({ length: N(10) }, () => mk(false));
        let t = 0;
        return { draw(ctx, W, H, dt) {
            t += dt;
            b.forEach(o => {
                o.y -= o.v * dt; o.x += Math.sin(t * .6 + o.sw) * .0014;
                if (o.y < -.15) Object.assign(o, mk(true));
                const x = o.x * W, y = o.y * H;
                ctx.globalAlpha = .16; ctx.fillStyle = o.c;
                ctx.beginPath(); ctx.ellipse(x, y, o.r * .78, o.r, 0, 0, 6.283); ctx.fill();
                ctx.beginPath(); ctx.moveTo(x - 3, y + o.r); ctx.lineTo(x, y + o.r + 6); ctx.lineTo(x + 3, y + o.r); ctx.closePath(); ctx.fill();
                ctx.globalAlpha = .08; ctx.strokeStyle = o.c; ctx.lineWidth = 1;
                ctx.beginPath(); ctx.moveTo(x, y + o.r + 6); ctx.lineTo(x + Math.sin(t + o.sw) * 8, y + o.r + 40); ctx.stroke();
            });
            ctx.globalAlpha = 1;
        } };
    },
    // парящие сердца
    hearts: () => {
        const mk = (bottom) => ({ x: .06 + Math.random() * .88, y: bottom ? 1.1 + Math.random() * .3 : Math.random(), s: 6 + Math.random() * 9, v: .025 + Math.random() * .04, sw: Math.random() * 6.28 });
        const h = Array.from({ length: N(16) }, () => mk(false));
        let t = 0;
        const heart = (ctx, s) => {
            ctx.beginPath();
            ctx.moveTo(0, s * .32);
            ctx.bezierCurveTo(0, -s * .25, -s, -s * .25, -s, s * .1);
            ctx.bezierCurveTo(-s, s * .55, -s * .3, s * .8, 0, s * 1.05);
            ctx.bezierCurveTo(s * .3, s * .8, s, s * .55, s, s * .1);
            ctx.bezierCurveTo(s, -s * .25, 0, -s * .25, 0, s * .32);
            ctx.fill();
        };
        return { draw(ctx, W, H, dt) {
            t += dt; ctx.fillStyle = '#E86F8C';
            h.forEach(o => {
                o.y -= o.v * dt; o.x += Math.sin(t * .8 + o.sw) * .0016;
                if (o.y < -.08) Object.assign(o, mk(true));
                ctx.globalAlpha = .14 + .06 * Math.sin(t * 1.6 + o.sw);
                ctx.save(); ctx.translate(o.x * W, o.y * H); heart(ctx, o.s); ctx.restore();
            });
            ctx.globalAlpha = 1;
        } };
    },
    // виниловая пластинка + ноты
    vinyl: () => {
        const notes = Array.from({ length: N(10) }, () => ({ x: Math.random(), y: Math.random(), v: .03 + Math.random() * .04, sw: Math.random() * 6.28, ch: pickOne(['♪', '♫', '♩']) }));
        let t = 0;
        return { draw(ctx, W, H, dt) {
            t += dt;
            const cx = W * .78, cy = H * .28, R = Math.min(W, H) * .16;
            ctx.save(); ctx.translate(cx, cy); ctx.rotate(t * .6);
            ctx.globalAlpha = .10; ctx.fillStyle = '#1A1A1A';
            ctx.beginPath(); ctx.arc(0, 0, R, 0, 6.283); ctx.fill();
            ctx.globalAlpha = .08; ctx.strokeStyle = '#C9A227'; ctx.lineWidth = 1;
            for (let r = R * .3; r < R; r += R * .1) { ctx.beginPath(); ctx.arc(0, 0, r, 0, 6.283); ctx.stroke(); }
            ctx.globalAlpha = .14; ctx.fillStyle = '#C9A227';
            ctx.beginPath(); ctx.arc(0, 0, R * .12, 0, 6.283); ctx.fill();
            ctx.restore();
            ctx.fillStyle = '#C9A227'; ctx.font = '20px serif';
            notes.forEach(o => {
                o.y -= o.v * dt; o.x += Math.sin(t + o.sw) * .0012;
                if (o.y < -.05) { o.y = 1.05; o.x = Math.random(); }
                ctx.globalAlpha = .12 + .06 * Math.sin(t * 2 + o.sw);
                ctx.fillText(o.ch, o.x * W, o.y * H);
            });
            ctx.globalAlpha = 1;
        } };
    },
    // падающие шахматные фигуры-силуэты
    chess: () => {
        const KINDS = ['pawn', 'knight', 'king'];
        const mk = (top) => ({ x: Math.random(), y: top ? -.14 - Math.random() * .3 : Math.random(), s: 10 + Math.random() * 9, v: .04 + Math.random() * .06, rot: (Math.random() - .5) * .5, vr: (Math.random() - .5) * .6, k: pickOne(KINDS) });
        const c = Array.from({ length: N(11) }, () => mk(false));
        const draw = (ctx, k, s) => {
            ctx.beginPath();
            if (k === 'pawn') { ctx.arc(0, -s * .5, s * .3, 0, 6.283); ctx.moveTo(-s * .4, s * .5); ctx.lineTo(s * .4, s * .5); ctx.lineTo(s * .22, -s * .1); ctx.lineTo(-s * .22, -s * .1); ctx.closePath(); }
            else if (k === 'king') { ctx.rect(-s * .06, -s * 1.1, s * .12, s * .3); ctx.rect(-s * .18, -s * .92, s * .36, s * .12); ctx.moveTo(-s * .4, s * .5); ctx.lineTo(s * .4, s * .5); ctx.lineTo(s * .28, -s * .6); ctx.lineTo(-s * .28, -s * .6); ctx.closePath(); }
            else { ctx.moveTo(-s * .35, s * .5); ctx.lineTo(s * .35, s * .5); ctx.lineTo(s * .3, -s * .2); ctx.quadraticCurveTo(s * .4, -s * .9, -s * .1, -s * .95); ctx.quadraticCurveTo(-s * .5, -s * .85, -s * .3, -s * .45); ctx.closePath(); }
            ctx.fill();
        };
        return { draw(ctx, W, H, dt) {
            ctx.fillStyle = '#C9CDD2';
            c.forEach(o => {
                o.y += o.v * dt; o.rot += o.vr * dt;
                if (o.y > 1.16) Object.assign(o, mk(true));
                ctx.globalAlpha = .14;
                ctx.save(); ctx.translate(o.x * W, o.y * H); ctx.rotate(o.rot); draw(ctx, o.k, o.s); ctx.restore();
            });
            ctx.globalAlpha = 1;
        } };
    },
    // невесомые перья
    feathers: () => {
        const mk = (top) => ({ x: top ? Math.random() * 1.1 - .05 : Math.random(), y: top ? -.1 - Math.random() * .3 : Math.random(), s: 7 + Math.random() * 6, vx: .01 + Math.random() * .02, vy: .025 + Math.random() * .035, rot: Math.random() * 6.28, vr: (Math.random() - .5) * 1.6, sw: Math.random() * 6.28 });
        const f = Array.from({ length: N(16) }, () => mk(false));
        let t = 0;
        return { draw(ctx, W, H, dt) {
            t += dt; ctx.fillStyle = '#F2E9D8';
            f.forEach(o => {
                o.x += (o.vx + Math.sin(t * .8 + o.sw) * .018) * dt; o.y += o.vy * dt; o.rot += o.vr * dt;
                if (o.y > 1.1) Object.assign(o, mk(true));
                ctx.globalAlpha = .14;
                ctx.save(); ctx.translate(o.x * W, o.y * H); ctx.rotate(o.rot);
                ctx.beginPath(); ctx.ellipse(0, 0, o.s, o.s * .32, 0, 0, 6.283); ctx.fill();
                ctx.globalAlpha = .07; ctx.strokeStyle = '#D9C8A8'; ctx.lineWidth = .6;
                ctx.beginPath(); ctx.moveTo(-o.s, 0); ctx.lineTo(o.s, 0); ctx.stroke();
                ctx.restore();
            });
            ctx.globalAlpha = 1;
        } };
    },
    // печатные платы: пульсирующие дорожки
    circuitry: () => {
        const nodes = [];
        const cols = 7, rows = 5;
        for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) nodes.push({ x: (i + .5) / cols, y: (j + .5) / rows, ph: Math.random() * 6.28 });
        let t = 0;
        return { fps: 22, draw(ctx, W, H, dt) {
            t += dt;
            ctx.strokeStyle = '#5BC0EB'; ctx.lineWidth = 1;
            nodes.forEach((n, i) => {
                const right = nodes[i + rows];
                if (right) {
                    const pulse = .5 + .5 * Math.sin(t * 1.4 + n.ph);
                    ctx.globalAlpha = .05 + .05 * pulse;
                    ctx.beginPath(); ctx.moveTo(n.x * W, n.y * H); ctx.lineTo(right.x * W, right.y * H); ctx.stroke();
                }
                const down = nodes[i + 1];
                if (down && (i + 1) % rows) {
                    const pulse = .5 + .5 * Math.sin(t * 1.7 + n.ph + 1);
                    ctx.globalAlpha = .05 + .05 * pulse;
                    ctx.beginPath(); ctx.moveTo(n.x * W, n.y * H); ctx.lineTo(down.x * W, down.y * H); ctx.stroke();
                }
            });
            ctx.fillStyle = '#8BE0FF';
            nodes.forEach(n => {
                const pulse = .5 + .5 * Math.sin(t * 2 + n.ph);
                ctx.globalAlpha = .08 + .1 * pulse;
                ctx.beginPath(); ctx.arc(n.x * W, n.y * H, 1.6 + pulse, 0, 6.283); ctx.fill();
            });
            ctx.globalAlpha = 1;
        } };
    },
    // вращающийся компас и линии карты
    compass: () => {
        let t = 0;
        return { draw(ctx, W, H, dt) {
            t += dt;
            const cx = W * .82, cy = H * .78, R = Math.min(W, H) * .1;
            ctx.globalAlpha = .07; ctx.strokeStyle = '#C08A3E'; ctx.lineWidth = 1;
            ctx.beginPath(); ctx.arc(cx, cy, R, 0, 6.283); ctx.stroke();
            ctx.beginPath(); ctx.arc(cx, cy, R * .7, 0, 6.283); ctx.stroke();
            ctx.save(); ctx.translate(cx, cy); ctx.rotate(t * .25);
            ctx.globalAlpha = .12; ctx.fillStyle = '#C08A3E';
            ctx.beginPath(); ctx.moveTo(0, -R); ctx.lineTo(R * .12, 0); ctx.lineTo(0, R * .35); ctx.lineTo(-R * .12, 0); ctx.closePath(); ctx.fill();
            ctx.globalAlpha = .08; ctx.fillStyle = '#8FB8D6';
            ctx.beginPath(); ctx.moveTo(0, R); ctx.lineTo(R * .1, 0); ctx.lineTo(0, -R * .3); ctx.lineTo(-R * .1, 0); ctx.closePath(); ctx.fill();
            ctx.restore();
            ctx.globalAlpha = .05; ctx.strokeStyle = '#C08A3E';
            for (let i = 0; i < 5; i++) {
                ctx.beginPath();
                ctx.moveTo(Math.random() * W * .3, Math.random() * H * .3);
                ctx.lineTo(W * (.1 + i * .12) + Math.sin(t * .3 + i) * 20, H * (.1 + (i % 3) * .1));
                ctx.stroke();
            }
            ctx.globalAlpha = 1;
        } };
    },
    // магические кристаллы льда
    crystal: () => {
        const mk = (bottom) => ({ x: Math.random(), y: bottom ? 1.1 + Math.random() * .25 : Math.random(), s: 5 + Math.random() * 8, v: .018 + Math.random() * .03, rot: Math.random() * 6.28, vr: (Math.random() - .5) * .8, sw: Math.random() * 6.28 });
        const c = Array.from({ length: N(20) }, () => mk(false));
        let t = 0;
        return { draw(ctx, W, H, dt) {
            t += dt;
            ctx.strokeStyle = '#BEE8FF'; ctx.lineWidth = 1;
            c.forEach(o => {
                o.y -= o.v * dt; o.x += Math.sin(t * .7 + o.sw) * .0012; o.rot += o.vr * dt;
                if (o.y < -.06) Object.assign(o, mk(true));
                ctx.globalAlpha = .13 + .07 * Math.sin(t * 1.5 + o.sw);
                ctx.save(); ctx.translate(o.x * W, o.y * H); ctx.rotate(o.rot);
                for (let k = 0; k < 6; k++) { ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -o.s); ctx.stroke(); ctx.rotate(1.047); }
                ctx.restore();
            });
            ctx.globalAlpha = 1;
        } };
    },
    // лотосы и свечи на воде
    lotus: () => {
        const mk = () => ({ x: Math.random(), y: .55 + Math.random() * .42, r: 6 + Math.random() * 7, sw: Math.random() * 6.28, drift: (Math.random() - .5) * .01 });
        const l = Array.from({ length: N(9) }, mk);
        let t = 0;
        return { draw(ctx, W, H, dt) {
            t += dt;
            l.forEach(o => {
                o.x += o.drift * dt;
                if (o.x < -.05 || o.x > 1.05) o.x = clamp(o.x, 0, 1);
                const x = o.x * W, y = (o.y + Math.sin(t * .6 + o.sw) * .006) * H;
                ctx.globalAlpha = .10; ctx.fillStyle = '#F2A65A';
                for (let k = 0; k < 6; k++) {
                    const a = k * 1.047;
                    ctx.beginPath(); ctx.ellipse(x + Math.cos(a) * o.r * .6, y + Math.sin(a) * o.r * .6, o.r * .55, o.r * .28, a, 0, 6.283); ctx.fill();
                }
                ctx.globalAlpha = .18; ctx.fillStyle = '#FFE9B0';
                ctx.beginPath(); ctx.arc(x, y, o.r * .22, 0, 6.283); ctx.fill();
            });
            ctx.globalAlpha = 1;
        } };
    },
    // расползающиеся чернильные пятна
    ink: () => {
        const mk = () => ({ x: Math.random(), y: Math.random(), max: 30 + Math.random() * 50, age: 0, ttl: 3 + Math.random() * 3, wait: Math.random() * 4 });
        const spots = Array.from({ length: N(6) }, mk);
        return { draw(ctx, W, H, dt) {
            spots.forEach(s => {
                if (s.wait > 0) { s.wait -= dt; return; }
                s.age += dt;
                const k = clamp(s.age / s.ttl, 0, 1);
                if (k >= 1) { Object.assign(s, mk()); s.wait = 1 + Math.random() * 3; return; }
                const r = s.max * Math.sqrt(k);
                ctx.globalAlpha = .05 * (1 - k * .6);
                ctx.fillStyle = '#1A1A1A';
                ctx.beginPath(); ctx.arc(s.x * W, s.y * H, r, 0, 6.283); ctx.fill();
            });
            ctx.globalAlpha = 1;
        } };
    },
    // полярное сияние: несколько текучих лент разных цветов
    aurora: () => {
        const bands = [
            { c: '#7FFFB0', y: .12, amp: .05, sp: .22, ph: 0 },
            { c: '#7FD8FF', y: .2, amp: .07, sp: .17, ph: 1.6 },
            { c: '#C9A7E8', y: .28, amp: .06, sp: .26, ph: 3.1 }
        ];
        let t = 0;
        return { draw(ctx, W, H, dt) {
            t += dt;
            bands.forEach(b => {
                ctx.beginPath();
                for (let x = -10; x <= W + 10; x += 24) {
                    const y = H * (b.y + Math.sin(x * .006 + t * b.sp + b.ph) * b.amp + Math.sin(x * .002 - t * .1) * .03);
                    x === -10 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
                }
                for (let x = W + 10; x >= -10; x -= 24) {
                    const y = H * (b.y + .1 + Math.sin(x * .006 + t * b.sp + b.ph) * b.amp);
                    ctx.lineTo(x, y);
                }
                ctx.closePath();
                const g = ctx.createLinearGradient(0, 0, 0, H * .5);
                g.addColorStop(0, b.c); g.addColorStop(1, 'rgba(0,0,0,0)');
                ctx.globalAlpha = .07; ctx.fillStyle = g; ctx.fill();
            });
            ctx.globalAlpha = 1;
        } };
    },
    // лепестки бархатцев (Coco / День мёртвых) — тёплый оранжевый поток
    marigold: () => {
        const mk = (top) => ({ x: top ? Math.random() * 1.15 - .08 : Math.random(), y: top ? -.08 - Math.random() * .3 : Math.random(), s: 6 + Math.random() * 7, vx: .012 + Math.random() * .02, vy: .03 + Math.random() * .05, rot: Math.random() * 6.28, vr: (Math.random() - .5) * 2.2, sw: Math.random() * 6.28 });
        const p = Array.from({ length: N(26) }, () => mk(false));
        let t = 0;
        return { draw(ctx, W, H, dt) {
            t += dt; ctx.fillStyle = '#F2A335';
            p.forEach(o => {
                o.x += (o.vx + Math.sin(t * .9 + o.sw) * .016) * dt; o.y += o.vy * dt; o.rot += o.vr * dt;
                if (o.y > 1.1) Object.assign(o, mk(true));
                ctx.globalAlpha = .17;
                ctx.save(); ctx.translate(o.x * W, o.y * H); ctx.rotate(o.rot);
                for (let k = 0; k < 5; k++) { ctx.beginPath(); ctx.ellipse(0, -o.s * .5, o.s * .34, o.s * .55, 0, 0, 6.283); ctx.fill(); ctx.rotate(1.257); }
                ctx.restore();
            });
            ctx.globalAlpha = 1;
        } };
    },
    // геометрические маски (круг / треугольник / квадрат)
    shapes: () => {
        const K = ['o', 't', 's'];
        const mk = (top) => ({ x: Math.random(), y: top ? -.14 - Math.random() * .3 : Math.random(), s: 8 + Math.random() * 7, v: .04 + Math.random() * .06, rot: (Math.random() - .5) * .4, vr: (Math.random() - .5) * .5, k: pickOne(K) });
        const c = Array.from({ length: N(14) }, () => mk(false));
        return { draw(ctx, W, H, dt) {
            ctx.strokeStyle = '#E8B33C'; ctx.lineWidth = 2;
            c.forEach(o => {
                o.y += o.v * dt; o.rot += o.vr * dt;
                if (o.y > 1.16) Object.assign(o, mk(true));
                ctx.globalAlpha = .16;
                ctx.save(); ctx.translate(o.x * W, o.y * H); ctx.rotate(o.rot);
                ctx.beginPath();
                if (o.k === 'o') ctx.arc(0, 0, o.s, 0, 6.283);
                else if (o.k === 't') { ctx.moveTo(0, -o.s); ctx.lineTo(o.s * .87, o.s * .5); ctx.lineTo(-o.s * .87, o.s * .5); ctx.closePath(); }
                else ctx.rect(-o.s * .8, -o.s * .8, o.s * 1.6, o.s * 1.6);
                ctx.stroke();
                ctx.restore();
            });
            ctx.globalAlpha = 1;
        } };
    },
    // розовые блёстки и мыльные пузырьки
    sparklepink: () => {
        const mk = (bottom) => ({ x: Math.random(), y: bottom ? 1.08 + Math.random() * .25 : Math.random(), r: 2 + Math.random() * 6, v: .02 + Math.random() * .04, sw: Math.random() * 6.28 });
        const p = Array.from({ length: N(30) }, () => mk(false));
        let t = 0;
        return { draw(ctx, W, H, dt) {
            t += dt;
            p.forEach(o => {
                o.y -= o.v * dt; o.x += Math.sin(t * .8 + o.sw) * .0016;
                if (o.y < -.06) Object.assign(o, mk(true));
                const x = o.x * W, y = o.y * H, glit = .5 + .5 * Math.sin(t * 3.4 + o.sw);
                ctx.globalAlpha = .08 + .1 * glit; ctx.strokeStyle = '#F5B8D8'; ctx.lineWidth = 1;
                ctx.beginPath(); ctx.arc(x, y, o.r, 0, 6.283); ctx.stroke();
                ctx.globalAlpha = .18 * glit; ctx.fillStyle = '#FFF0F7';
                ctx.beginPath(); ctx.arc(x, y, 1, 0, 6.283); ctx.fill();
            });
            ctx.globalAlpha = 1;
        } };
    },
    // ударная волна — расходящиеся кольца с редким взрывом частиц
    shockwave: () => {
        const rings = [];
        let wait = .8;
        return { fps: 24, draw(ctx, W, H, dt) {
            wait -= dt;
            if (wait <= 0) { rings.push({ x: .2 + Math.random() * .6, y: .2 + Math.random() * .55, age: 0, ttl: 1.4 + Math.random() * .6 }); wait = 1.8 + Math.random() * 2.6; }
            const unit = Math.min(W, H);
            ctx.strokeStyle = '#E0762B';
            for (let i = rings.length - 1; i >= 0; i--) {
                const r = rings[i];
                r.age += dt;
                const k = r.age / r.ttl;
                if (k >= 1) { rings.splice(i, 1); continue; }
                const rad = unit * .05 + unit * .5 * k;
                ctx.globalAlpha = .18 * (1 - k); ctx.lineWidth = 2 + 4 * (1 - k);
                ctx.beginPath(); ctx.arc(r.x * W, r.y * H, rad, 0, 6.283); ctx.stroke();
            }
            ctx.globalAlpha = 1;
        } };
    },
    // тягучие шоколадные капли
    chocolate: () => {
        const mk = () => ({ x: Math.random(), y: -.08 - Math.random() * .3, v: .07 + Math.random() * .1, len: .015 + Math.random() * .03, w: 2 + Math.random() * 3 });
        const d = Array.from({ length: N(12) }, () => { const o = mk(); o.y = Math.random(); return o; });
        return { draw(ctx, W, H, dt) {
            ctx.fillStyle = '#6B3F1D'; ctx.strokeStyle = '#6B3F1D'; ctx.lineCap = 'round';
            d.forEach(o => {
                o.y += o.v * dt;
                if (o.y > 1.08) Object.assign(o, mk());
                const x = o.x * W, y = o.y * H, len = o.len * H;
                ctx.globalAlpha = .15; ctx.lineWidth = o.w;
                ctx.beginPath(); ctx.moveTo(x, y - len); ctx.lineTo(x, y); ctx.stroke();
                ctx.globalAlpha = .19;
                ctx.beginPath(); ctx.ellipse(x, y + o.w * .3, o.w * .9, o.w * 1.3, 0, 0, 6.283); ctx.fill();
            });
            ctx.globalAlpha = 1;
        } };
    },
    // мерцающие порталы-двери (мультивселенная)
    portaldoors: () => {
        const mk = () => ({ x: Math.random(), y: .15 + Math.random() * .7, w: 20 + Math.random() * 16, ph: Math.random() * 6.28, life: 0, ttl: 2.5 + Math.random() * 2.5 });
        const doors = Array.from({ length: N(5) }, mk);
        let t = 0;
        return { draw(ctx, W, H, dt) {
            t += dt;
            doors.forEach((o, i) => {
                o.life += dt;
                if (o.life > o.ttl) { doors[i] = mk(); return; }
                const k = Math.sin(clamp(o.life / o.ttl, 0, 1) * Math.PI);
                const x = o.x * W, y = o.y * H, w = o.w * (.7 + .3 * Math.sin(t * 1.5 + o.ph)), h = w * 1.7;
                ctx.globalAlpha = .10 * k; ctx.strokeStyle = '#8B5CF6'; ctx.lineWidth = 2;
                ctx.beginPath(); ctx.ellipse(x, y, w * .5, h * .5, 0, 0, 6.283); ctx.stroke();
                ctx.globalAlpha = .05 * k; ctx.fillStyle = '#5BC0EB';
                ctx.beginPath(); ctx.ellipse(x, y, w * .38, h * .38, 0, 0, 6.283); ctx.fill();
            });
            ctx.globalAlpha = 1;
        } };
    },
    // силуэт песчаного червя, ходящий под дюнами
    sandworm: () => {
        let t = 0, x = -.2, y = .7, wait = 1;
        const segs = 7;
        return { fps: 22, draw(ctx, W, H, dt) {
            t += dt; wait -= dt;
            ctx.lineWidth = 1; ctx.strokeStyle = '#E7B46A';
            const lines = Perf.lite() ? 5 : 8, stepX = Perf.lite() ? 26 : 18;
            for (let i = 0; i < lines; i++) {
                ctx.globalAlpha = .012 + i * .0018;
                ctx.beginPath();
                for (let xx = -20; xx < W + 20; xx += stepX) {
                    const yy = H * (.34 + i * .075) + Math.sin(xx * .011 + t * .35 + i) * 12 + i * 2;
                    xx === -20 ? ctx.moveTo(xx, yy) : ctx.lineTo(xx, yy);
                }
                ctx.stroke();
            }
            if (wait <= 0) {
                x += dt * .09;
                if (x > 1.2) { x = -.2; y = .5 + Math.random() * .3; wait = 2 + Math.random() * 3; }
                ctx.fillStyle = '#8A6A3E';
                for (let s = 0; s < segs; s++) {
                    const sx = (x - s * .028) * W;
                    const sy = y * H + Math.sin(t * 1.4 - s * .5) * 8;
                    const rr = (1 - s / segs) * 10 + 3;
                    ctx.globalAlpha = .10 * (1 - s / segs);
                    ctx.beginPath(); ctx.ellipse(sx, sy, rr * 1.6, rr, 0, 0, 6.283); ctx.fill();
                }
            }
            ctx.globalAlpha = 1;
        } };
    },
    // тонущий Титаник: трещины во льду-металле и пузыри
    iceberg: () => {
        const cracks = Array.from({ length: N(5) }, () => ({ x: Math.random(), y: Math.random() * .5, a: Math.random() * 6.28, len: 40 + Math.random() * 70, ph: Math.random() * 6.28 }));
        const mk = (bottom) => ({ x: Math.random(), y: bottom ? 1.06 + Math.random() * .2 : Math.random(), r: 1 + Math.random() * 3, v: .05 + Math.random() * .09, sw: Math.random() * 6.28 });
        const bub = Array.from({ length: N(24) }, () => mk(false));
        let t = 0;
        return { draw(ctx, W, H, dt) {
            t += dt;
            ctx.strokeStyle = '#CFE4FF'; ctx.lineWidth = 1.1;
            cracks.forEach(c => {
                ctx.globalAlpha = .06 + .04 * Math.sin(t * .6 + c.ph);
                ctx.beginPath();
                let x = c.x * W, y = c.y * H, a = c.a;
                ctx.moveTo(x, y);
                for (let i = 0; i < 4; i++) { a += (Math.random() - .5) * 1.1; x += Math.cos(a) * c.len * .25; y += Math.sin(a) * c.len * .25; ctx.lineTo(x, y); }
                ctx.stroke();
            });
            ctx.strokeStyle = '#EAF4FF';
            bub.forEach(o => {
                o.y -= o.v * dt; o.x += Math.sin(t * 1.1 + o.sw) * .001;
                if (o.y < -.05) Object.assign(o, mk(true));
                ctx.globalAlpha = .16;
                ctx.beginPath(); ctx.arc(o.x * W, o.y * H, o.r, 0, 6.283); ctx.stroke();
            });
            ctx.globalAlpha = 1;
        } };
    },
    // водоворот: концентрические кольца, утягивающие частицы к центру
    maelstrom: () => {
        const mk = () => ({ a: Math.random() * 6.28, r: .1 + Math.random() * .5, v: .06 + Math.random() * .08 });
        const p = Array.from({ length: N(30) }, mk);
        let t = 0;
        return { draw(ctx, W, H, dt) {
            t += dt;
            const cx = W * .5, cy = H * .56, unit = Math.min(W, H);
            ctx.strokeStyle = '#7FD8FF'; ctx.lineWidth = 1;
            for (let i = 1; i <= 5; i++) {
                ctx.globalAlpha = .035;
                ctx.beginPath(); ctx.arc(cx, cy, unit * .06 * i, t * (.15 + i * .02), t * (.15 + i * .02) + 5.5); ctx.stroke();
            }
            ctx.fillStyle = '#EAF4FF';
            p.forEach(o => {
                o.r -= o.v * dt * .1; o.a += (1 - o.r) * dt * 2.4;
                if (o.r < .04) Object.assign(o, mk());
                const x = cx + Math.cos(o.a) * o.r * unit, y = cy + Math.sin(o.a) * o.r * unit * .6;
                ctx.globalAlpha = .14 * (1 - o.r);
                ctx.beginPath(); ctx.arc(x, y, 1.6, 0, 6.283); ctx.fill();
            });
            ctx.globalAlpha = 1;
        } };
    },
    // квантовое поле: складывающиеся частицы, редкие телепорт-вспышки
    quantum: () => {
        const p = Array.from({ length: N(50) }, () => ({ x: Math.random(), y: Math.random(), ph: Math.random() * 6.28, r: .6 + Math.random() * 1.6 }));
        let t = 0, flash = 0;
        return { draw(ctx, W, H, dt) {
            t += dt; flash -= dt;
            if (flash <= 0 && Math.random() < .01) flash = .15;
            ctx.fillStyle = '#5BC0EB';
            p.forEach(o => {
                const k = .5 + .5 * Math.sin(t * 1.6 + o.ph);
                const x = (o.x + Math.sin(t * .3 + o.ph) * .01) * W, y = (o.y + Math.cos(t * .25 + o.ph) * .01) * H;
                ctx.globalAlpha = .05 + .09 * k;
                ctx.beginPath(); ctx.arc(x, y, o.r * (.6 + k), 0, 6.283); ctx.fill();
            });
            if (flash > 0) {
                ctx.globalAlpha = .06 * (flash / .15); ctx.fillStyle = '#E8E8FF';
                ctx.fillRect(0, 0, W, H);
            }
            ctx.globalAlpha = 1;
        } };
    },
    // проклятая энергия: тёмно-фиолетовые дымные росчерки
    cursedenergy: () => {
        const mk = () => ({ x: Math.random(), y: Math.random(), a: Math.random() * 6.28, len: 30 + Math.random() * 60, ph: Math.random() * 6.28, ttl: 1.4 + Math.random() * 1.6, age: 0 });
        const w = Array.from({ length: N(10) }, mk);
        return { fps: 24, draw(ctx, W, H, dt) {
            ctx.strokeStyle = '#8B5CF6'; ctx.lineCap = 'round';
            w.forEach((o, i) => {
                o.age += dt;
                if (o.age > o.ttl) { w[i] = mk(); return; }
                const k = Math.sin(clamp(o.age / o.ttl, 0, 1) * Math.PI);
                ctx.globalAlpha = .13 * k; ctx.lineWidth = 2;
                ctx.beginPath();
                let x = o.x * W, y = o.y * H, a = o.a;
                ctx.moveTo(x, y);
                for (let s = 0; s < 5; s++) { a += Math.sin(o.ph + s) * .6; x += Math.cos(a) * o.len * .2; y += Math.sin(a) * o.len * .2; ctx.lineTo(x, y); }
                ctx.stroke();
            });
            ctx.globalAlpha = 1;
        } };
    },
    // биомеханика: пульсирующие органические жилы
    biomech: () => {
        const veins = Array.from({ length: N(9) }, () => ({ x: Math.random(), y: Math.random(), a: Math.random() * 6.28, len: 50 + Math.random() * 90, ph: Math.random() * 6.28 }));
        let t = 0;
        return { draw(ctx, W, H, dt) {
            t += dt;
            ctx.strokeStyle = '#B0392B'; ctx.lineCap = 'round';
            veins.forEach(v => {
                const pulse = .5 + .5 * Math.sin(t * 2.2 + v.ph);
                ctx.globalAlpha = .05 + .07 * pulse; ctx.lineWidth = 1.5 + pulse * 1.5;
                ctx.beginPath();
                let x = v.x * W, y = v.y * H, a = v.a;
                ctx.moveTo(x, y);
                for (let s = 0; s < 4; s++) { a += Math.sin(v.ph + s * 1.3) * .5; x += Math.cos(a) * v.len * .25; y += Math.sin(a) * v.len * .25; ctx.lineTo(x, y); }
                ctx.stroke();
            });
            ctx.globalAlpha = 1;
        } };
    },
    // пламя исторических битв: летящие искры и дым над полем боя
    inferno: () => {
        const mk = (bottom) => ({ x: Math.random(), y: bottom ? 1.05 + Math.random() * .2 : Math.random() * .7 + .3, r: 1 + Math.random() * 2.6, v: .06 + Math.random() * .13, sw: Math.random() * 6.28 });
        const p = Array.from({ length: N(56) }, () => mk(false));
        let t = 0;
        return { draw(ctx, W, H, dt) {
            t += dt;
            ctx.globalAlpha = .05; ctx.fillStyle = '#2B2B2B';
            ctx.fillRect(0, H * .55, W, H * .45);
            p.forEach(s => {
                s.y -= s.v * dt; s.x += Math.sin(t * 1.5 + s.sw) * .0016;
                if (s.y < -.05) Object.assign(s, mk(true));
                const glow = .5 + .5 * Math.sin(t * 3 + s.sw);
                ctx.globalAlpha = (.10 + .12 * glow) * clamp(s.y * 1.6, 0, 1);
                ctx.fillStyle = glow > .55 ? '#FFC24E' : '#B0392B';
                ctx.beginPath(); ctx.arc(s.x * W, s.y * H, s.r, 0, 6.283); ctx.fill();
            });
            ctx.globalAlpha = 1;
        } };
    },
    // звёздная пыль желаний: искры тянутся к падающей звезде
    wish: () => {
        const mk = () => ({ x: Math.random(), y: Math.random(), r: .6 + Math.random() * 1.4, ph: Math.random() * 6.28 });
        const dust = Array.from({ length: N(34) }, mk);
        let t = 0, star = null, wait = 2;
        return { draw(ctx, W, H, dt) {
            t += dt; wait -= dt;
            ctx.fillStyle = '#F2C21B';
            dust.forEach(o => {
                const k = .5 + .5 * Math.sin(t * 1.8 + o.ph);
                ctx.globalAlpha = .05 + .09 * k;
                ctx.beginPath(); ctx.arc(o.x * W, o.y * H, o.r, 0, 6.283); ctx.fill();
            });
            if (!star && wait <= 0) { star = { x: .1 + Math.random() * .3, y: .1 + Math.random() * .2, age: 0 }; wait = 3 + Math.random() * 4; }
            if (star) {
                star.age += dt;
                const k = clamp(star.age / 1.3, 0, 1);
                if (k >= 1) { star = null; }
                else {
                    const x = (star.x + k * .5) * W, y = (star.y + k * .35) * H;
                    ctx.strokeStyle = '#FFF3C4'; ctx.lineWidth = 1.4; ctx.globalAlpha = .22 * (1 - k);
                    ctx.beginPath(); ctx.moveTo(x - 40, y - 28); ctx.lineTo(x, y); ctx.stroke();
                    ctx.globalAlpha = .3 * (1 - k); ctx.fillStyle = '#FFF3C4';
                    ctx.beginPath(); ctx.arc(x, y, 2, 0, 6.283); ctx.fill();
                }
            }
            ctx.globalAlpha = 1;
        } };
    },
    // неоновые фигуры-маски игры: круг, треугольник, квадрат
    squidshapes: () => {
        const K = ['o', 't', 's'];
        const mk = (top) => ({ x: Math.random(), y: top ? -.1 - Math.random() * .3 : Math.random(), s: 9 + Math.random() * 6, v: .03 + Math.random() * .05, k: pickOne(K), sw: Math.random() * 6.28 });
        const p = Array.from({ length: N(16) }, () => mk(false));
        let t = 0;
        return { draw(ctx, W, H, dt) {
            t += dt;
            ctx.strokeStyle = '#3FA34D'; ctx.lineWidth = 1.6;
            p.forEach(o => {
                o.y += o.v * dt; o.x += Math.sin(t * .8 + o.sw) * .0011;
                if (o.y > 1.1) Object.assign(o, mk(true));
                ctx.globalAlpha = .14 + .06 * Math.sin(t * 1.4 + o.sw);
                const x = o.x * W, y = o.y * H, s = o.s;
                ctx.beginPath();
                if (o.k === 'o') ctx.arc(x, y, s, 0, 6.283);
                else if (o.k === 't') { ctx.moveTo(x, y - s); ctx.lineTo(x + s * .87, y + s * .5); ctx.lineTo(x - s * .87, y + s * .5); ctx.closePath(); }
                else ctx.rect(x - s * .8, y - s * .8, s * 1.6, s * 1.6);
                ctx.stroke();
            });
            ctx.globalAlpha = 1;
        } };
    },
    // летящий попкорн кинотеатра
    popcorn: () => {
        const mk = (bottom) => ({ x: .05 + Math.random() * .9, y: bottom ? 1.1 + Math.random() * .3 : Math.random(), s: 5 + Math.random() * 5, v: .03 + Math.random() * .05, rot: Math.random() * 6.28, vr: (Math.random() - .5) * 2, sw: Math.random() * 6.28 });
        const p = Array.from({ length: N(20) }, () => mk(false));
        let t = 0;
        return { draw(ctx, W, H, dt) {
            t += dt; ctx.fillStyle = '#F2E9D8';
            p.forEach(o => {
                o.y -= o.v * dt; o.x += Math.sin(t * 1.2 + o.sw) * .0015; o.rot += o.vr * dt;
                if (o.y < -.08) Object.assign(o, mk(true));
                ctx.globalAlpha = .16;
                ctx.save(); ctx.translate(o.x * W, o.y * H); ctx.rotate(o.rot);
                for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.arc((k - 1) * o.s * .6, 0, o.s * .55, 0, 6.283); ctx.fill(); }
                ctx.restore();
            });
            ctx.globalAlpha = 1;
        } };
    },
    // театральный софит, гуляющий по сцене, и пылинки в луче
    spotlight: () => {
        let t = 0;
        const dust = Array.from({ length: N(24) }, () => ({ x: Math.random(), y: Math.random(), sw: Math.random() * 6.28 }));
        return { draw(ctx, W, H, dt) {
            t += dt;
            const cx = W * (.5 + Math.sin(t * .35) * .32), top = -H * .1;
            const ang = Math.PI / 2 + Math.sin(t * .35) * .28;
            const len = H * 1.3, spread = .22;
            ctx.save();
            ctx.globalAlpha = .07;
            const grad = ctx.createLinearGradient(cx, top, cx + Math.cos(ang) * len, top + Math.sin(ang) * len);
            grad.addColorStop(0, '#F2E9C4'); grad.addColorStop(1, 'rgba(242,233,196,0)');
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.moveTo(cx, top);
            ctx.lineTo(cx + Math.cos(ang - spread) * len, top + Math.sin(ang - spread) * len);
            ctx.lineTo(cx + Math.cos(ang + spread) * len, top + Math.sin(ang + spread) * len);
            ctx.closePath(); ctx.fill();
            ctx.restore();
            ctx.fillStyle = '#F2E9C4';
            dust.forEach(o => {
                ctx.globalAlpha = .06 + .05 * Math.sin(t * 1.6 + o.sw);
                ctx.beginPath(); ctx.arc(o.x * W, o.y * H, 1, 0, 6.283); ctx.fill();
            });
            ctx.globalAlpha = 1;
        } };
    }
};

// Единый rAF-цикл с настоящим watchdog (по метке времени)
// Сценические детали рисуются вместе с основным фоном в одном цикле rAF.
// Движение зависит от dt, а не от числа кадров; плотность и DPR ограничивает Perf.
const Cinematic = {
    layer: (baseName, detail) => {
        const baseFactory = SCENES[baseName];
        return () => {
            const base = baseFactory(), overlay = detail(); let time = 0;
            return {
                fps: base.fps,
                resize(W,H) { if(base.resize)base.resize(W,H); if(overlay.resize)overlay.resize(W,H); },
                draw(ctx,W,H,dt) {
                    time += dt;
                    ctx.save(); base.draw(ctx,W,H,dt,time); ctx.restore();
                    ctx.save(); overlay.draw(ctx,W,H,dt,time); ctx.restore();
                }
            };
        };
    },
    glow: (ctx,x,y,r,color,alpha) => {
        const g=ctx.createRadialGradient(x,y,0,x,y,r);
        g.addColorStop(0,color);g.addColorStop(1,'rgba(0,0,0,0)');
        ctx.globalAlpha=alpha;ctx.fillStyle=g;ctx.fillRect(x-r,y-r,r*2,r*2);
    }
};

SCENES.gargantua = Cinematic.layer('astro', () => ({
    draw(ctx,W,H,dt,t) {
        const x=W*.79,y=H*.25,r=Math.min(W,H)*.115;
        Cinematic.glow(ctx,x,y,r*2.8,'#E3A857',.12);
        ctx.save();ctx.translate(x,y);ctx.rotate(-.24);
        for(let i=0;i<5;i++) {
            ctx.strokeStyle=i%2?'#E3A857':'#F4DBC0';ctx.globalAlpha=.14-i*.018;ctx.lineWidth=2.3-i*.28;
            ctx.beginPath();ctx.ellipse(0,0,r*(1.55+i*.12),r*(.28+i*.025),0,0,Math.PI*2);ctx.stroke();
        }
        ctx.globalAlpha=.7;ctx.fillStyle='#020309';ctx.beginPath();ctx.arc(0,0,r*.72,0,Math.PI*2);ctx.fill();
        ctx.globalAlpha=.24;ctx.lineWidth=1.6;ctx.strokeStyle='#F4DBC0';
        ctx.beginPath();ctx.arc(0,0,r*.79,Math.PI,Math.PI*2);ctx.stroke();
        // Endurance: slowly rotating twelve-module ring in the lower left orbit.
        ctx.translate(-r*2.2,r*2.2);ctx.rotate(t*.09);ctx.strokeStyle='#CED8E4';ctx.globalAlpha=.23;
        ctx.beginPath();ctx.arc(0,0,r*.24,0,Math.PI*2);ctx.stroke();
        for(let i=0;i<12;i++){ctx.save();ctx.rotate(i*Math.PI/6);ctx.strokeRect(r*.21,-r*.027,r*.085,r*.054);ctx.restore();}
        ctx.restore();
    }
}));

SCENES.dreamcity = Cinematic.layer('inception',()=>({
    draw(ctx,W,H,dt,t) {
        const unit=Math.min(W,H), fold=.08+.045*Math.sin(t*.15);
        ctx.strokeStyle='#BAAB9B';ctx.lineWidth=.8;
        // The skyline gently folds toward the vanishing point.
        [0,1].forEach(side=>{
            ctx.save();ctx.translate(side?W:0,H*.18);ctx.scale(side?-1:1,1);ctx.rotate(fold);
            for(let i=0;i<9;i++){
                const x=i*unit*.035,h=unit*(.06+.025*((i*7)%5));
                ctx.globalAlpha=.04+i*.006;ctx.strokeRect(x,-h,unit*.026,h);
                ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(W*.45,H*.55);ctx.stroke();
            }ctx.restore();
        });
        const x=W*.16,y=H*.79,r=unit*.034,wobble=Math.sin(t*.8)*.04;
        ctx.save();ctx.translate(x,y);ctx.rotate(wobble);
        Cinematic.glow(ctx,0,r*.55,r*2,'#E9B487',.13);
        ctx.globalAlpha=.32;ctx.strokeStyle='#E9B487';ctx.lineWidth=1.4;
        ctx.beginPath();ctx.moveTo(0,-r*1.2);ctx.lineTo(0,-r*.5);ctx.moveTo(-r,0);ctx.quadraticCurveTo(0,-r*.8,r,0);ctx.lineTo(0,r*.64);ctx.closePath();ctx.stroke();
        ctx.globalAlpha=.2;ctx.beginPath();ctx.ellipse(0,0,r,r*.22,0,0,Math.PI*2);ctx.stroke();
        const angle=t*2.2;ctx.globalAlpha=.2+.08*Math.cos(angle);ctx.beginPath();ctx.moveTo(0,-r*.5);ctx.lineTo(Math.sin(angle)*r,0);ctx.stroke();ctx.restore();
    }
}));

SCENES.chemistry = Cinematic.layer('lab',()=>({
    draw(ctx,W,H,dt,t) {
        const unit=Math.min(W,H), size=unit*.058;
        [['Br','35',W*.13,H*.21],['Ba','56',W*.19,H*.28]].forEach((e,i)=>{
            const y=e[3]+Math.sin(t*.3+i)*unit*.007;
            ctx.strokeStyle='#A9D552';ctx.globalAlpha=.16;ctx.lineWidth=1;ctx.strokeRect(e[2],y,size,size);
            ctx.fillStyle='#D6E24A';ctx.font=size*.52+'px sans-serif';ctx.textBaseline='middle';ctx.fillText(e[0],e[2]+size*.14,y+size*.57);
            ctx.font=size*.16+'px monospace';ctx.fillText(e[1],e[2]+size*.12,y+size*.2);
        });
        ctx.save();ctx.translate(W*.85,H*.76);ctx.rotate(Math.sin(t*.16)*.1);
        const crystal=unit*.065;
        for(let i=0;i<3;i++){
            ctx.save();ctx.rotate((i-1)*.35);ctx.translate((i-1)*crystal*.5,0);
            ctx.globalAlpha=.13;ctx.strokeStyle='#61D4C9';ctx.fillStyle='#267D89';ctx.lineWidth=1;
            ctx.beginPath();ctx.moveTo(0,-crystal);ctx.lineTo(crystal*.3,-crystal*.45);ctx.lineTo(crystal*.2,crystal*.6);ctx.lineTo(-crystal*.22,crystal*.4);ctx.lineTo(-crystal*.3,-crystal*.5);ctx.closePath();ctx.fill();ctx.stroke();
            ctx.beginPath();ctx.moveTo(0,-crystal);ctx.lineTo(0,crystal*.45);ctx.stroke();ctx.restore();
        }ctx.restore();
    }
}));

SCENES.hyperspace = Cinematic.layer('galaxy',()=>{
    const stars=Array.from({length:N(45)},()=>({a:Math.random()*Math.PI*2,r:.05+Math.random()*.9,s:.01+Math.random()*.03}));
    return {draw(ctx,W,H,dt,t){
        const pulse=Math.pow(Math.max(0,Math.sin(t*.12)),12),cx=W*.5,cy=H*.4;
        ctx.strokeStyle='#B9DBFF';ctx.lineWidth=1;
        stars.forEach(s=>{
            s.r+=dt*s.s*(.15+pulse);if(s.r>1.05)s.r=.03;
            const x=Math.cos(s.a)*s.r*W*.75,y=Math.sin(s.a)*s.r*H*.75;
            ctx.globalAlpha=(.04+pulse*.14)*Math.min(1,s.r*4);ctx.beginPath();ctx.moveTo(cx+x,cy+y);ctx.lineTo(cx+x*(1+pulse*.13),cy+y*(1+pulse*.13));ctx.stroke();
        });
        // Twin suns remain calm between occasional hyperspace streaks.
        Cinematic.glow(ctx,W*.84,H*.18,H*.045,'#F3B567',.16);
        Cinematic.glow(ctx,W*.89,H*.2,H*.026,'#FFDFB0',.13);
    }};
});

SCENES.desertcinema = Cinematic.layer('sandworm',()=>({
    draw(ctx,W,H,dt,t){
        const r=Math.min(W,H)*.06;
        ctx.fillStyle='#DFC49C';ctx.globalAlpha=.075;ctx.beginPath();ctx.arc(W*.81,H*.18,r,0,Math.PI*2);ctx.fill();
        ctx.globalAlpha=.06;ctx.beginPath();ctx.arc(W*.88,H*.2,r*.53,0,Math.PI*2);ctx.fill();
        const x=W*(.08+((t*.003)%1)*.84),y=H*.25+Math.sin(t*.15)*H*.018;
        ctx.save();ctx.translate(x,y);ctx.strokeStyle='#E7B46A';ctx.globalAlpha=.21;ctx.lineWidth=1.2;
        ctx.beginPath();ctx.moveTo(-r*.24,0);ctx.lineTo(r*.28,0);ctx.stroke();
        for(let i=0;i<2;i++){
            const wing=r*(.6+.1*Math.sin(t*9+i));ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(-wing,Math.sin(t*9+i)*r*.1-r*.1);ctx.moveTo(0,0);ctx.lineTo(wing,Math.sin(t*9+i)*r*.1+r*.1);ctx.stroke();
        }ctx.restore();
    }
}));

SCENES.forestspirits = Cinematic.layer('fireflies',()=>{
    const motes=Array.from({length:N(8)},()=>({x:Math.random(),y:.12+Math.random()*.76,p:Math.random()*6.28,r:3+Math.random()*4}));
    return{draw(ctx,W,H,dt,t){
        motes.forEach(m=>{
            m.x+=dt*.006;if(m.x>1.05)m.x=-.05;
            const x=m.x*W,y=m.y*H+Math.sin(t*.65+m.p)*8;
            ctx.globalAlpha=.24;ctx.fillStyle='#101C16';ctx.beginPath();ctx.arc(x,y,m.r,0,Math.PI*2);ctx.fill();
            const blink=Math.sin(t*.35+m.p)>.995;
            ctx.fillStyle='#D9E6BB';ctx.globalAlpha=.27;
            [-1,1].forEach(side=>{ctx.beginPath();ctx.ellipse(x+side*m.r*.32,y-m.r*.1,m.r*.22,blink?.25:m.r*.3,0,0,Math.PI*2);ctx.fill();});
        });
    }};
});

SCENES.detective = Cinematic.layer('noir',()=>({
    draw(ctx,W,H,dt,t){
        ctx.save();ctx.translate(W*.78,H*.2);ctx.rotate(-.32+Math.sin(t*.08)*.025);
        for(let i=0;i<7;i++){ctx.globalAlpha=.025;ctx.fillStyle='#DFD6BE';ctx.fillRect(-W*.25,i*H*.035,W*.5,H*.011);}ctx.restore();
        // Expanding smoke ribbons, rather than blinking solid circles.
        ctx.strokeStyle='#BDBEB9';ctx.lineWidth=1;
        for(let i=0;i<3;i++){
            ctx.globalAlpha=.035;ctx.beginPath();
            for(let j=0;j<=30;j++){
                const p=j/30,x=W*(.12+i*.025)+Math.sin(t*.25+p*8+i)*W*.02*p,y=H*(.87-p*.35);
                j?ctx.lineTo(x,y):ctx.moveTo(x,y);
            }ctx.stroke();
        }
    }
}));

SCENES.portalpair = () => {
    const props=['chair','lamp','box'];let age=0,cycle=0;
    let a={x:.13,y:.28},b={x:.87,y:.73};
    const portal=(ctx,x,y,r,t,life)=>{
        Cinematic.glow(ctx,x,y,r*1.6,'#75F353',.12*life);
        ctx.save();ctx.translate(x,y);ctx.scale(1,.78);
        for(let j=0;j<3;j++){
            ctx.strokeStyle=j%2?'#35D5B4':'#A4ED56';ctx.globalAlpha=(.24-j*.04)*life;ctx.lineWidth=2-j*.35;
            ctx.beginPath();
            for(let i=0;i<=60;i++){const q=i/60*Math.PI*2,rr=r*(.78+j*.1+.025*Math.sin(q*7+t*1.7+j));const x1=Math.cos(q)*rr,y1=Math.sin(q)*rr;i?ctx.lineTo(x1,y1):ctx.moveTo(x1,y1);}
            ctx.closePath();ctx.stroke();
        }ctx.restore();
    };
    return{draw(ctx,W,H,dt,t){
        age+=dt;if(age>18){age-=18;cycle++;a={x:.1+Math.random()*.14,y:.16+Math.random()*.2};b={x:.76+Math.random()*.14,y:.62+Math.random()*.17};}
        const life=clamp(age/1.5,0,1)*clamp((18-age)/1.5,0,1),r=Math.min(W,H)*.075*life;
        portal(ctx,a.x*W,a.y*H,r,t,life);portal(ctx,b.x*W,b.y*H,r,t+2,life);
        if(age<3||age>15)return;
        const p=(age-3)/12,ease=p*p*(3-2*p),scale=Math.sin(p*Math.PI),kind=props[cycle%props.length];
        const x=(a.x+(b.x-a.x)*ease)*W,y=(a.y+(b.y-a.y)*ease)*H-Math.sin(p*Math.PI)*H*.12;
        ctx.save();ctx.translate(x,y);ctx.rotate(Math.sin(p*Math.PI)*.65);ctx.scale(scale,scale);
        ctx.strokeStyle='#E1DABE';ctx.lineWidth=1.5;ctx.globalAlpha=.27*scale;const z=Math.min(W,H)*.026;
        if(kind==='chair'){ctx.strokeRect(-z*.5,-z,z,.95*z);ctx.strokeRect(-z*.55,0,z*1.1,z*.18);ctx.beginPath();ctx.moveTo(-z*.45,z*.18);ctx.lineTo(-z*.45,z);ctx.moveTo(z*.45,z*.18);ctx.lineTo(z*.45,z);ctx.stroke();}
        else if(kind==='lamp'){ctx.beginPath();ctx.moveTo(-z*.7,0);ctx.lineTo(-z*.3,-z);ctx.lineTo(z*.3,-z);ctx.lineTo(z*.7,0);ctx.closePath();ctx.moveTo(0,0);ctx.lineTo(0,z);ctx.moveTo(-z*.4,z);ctx.lineTo(z*.4,z);ctx.stroke();}
        else{ctx.strokeRect(-z*.6,-z*.6,z*1.2,z*1.2);ctx.beginPath();ctx.moveTo(0,-z*.6);ctx.lineTo(0,z*.6);ctx.stroke();}ctx.restore();
    }};
};

const FILM_LINES = {
    interstellar:['На орбите Гаргантюа','За горизонтом событий'], inception:['Ещё один уровень сна','Волчок продолжает вращаться'],
    breakingbad:['Кристаллы, формулы, последствия','Пустынная лаборатория'], matrix:['За строками зелёного кода','Сбой в привычной реальности'],
    dune:['Тихий полёт над Арракисом','След под поверхностью песка'], starwars:['Два солнца над горизонтом','Координаты далёкой галактики'],
    ghibli:['Лес дышит, духи не спешат','Маленькое чудо за поворотом'], potter:['Золотой след над Хогвартсом','Тёплый свет в окнах замка'],
    rickmorty:['Багаж между измерениями','Следующая остановка — другая реальность'], kungfu:['Тишина Нефритового дворца','Сила начинается с равновесия'],
    noir:['Тени за жалюзи','Город говорит шёпотом'], ring:['Свет над дорогой в Средиземье'], spider:['Нити соединяют город']
};


const Fx = {
    canvas: null, ctx: null, scene: null, raf: null, last: 0, tick: 0, mode: null,
    W: 1, H: 1, root: null, resizeT: null, _watchdog: null, _frame: null, _ro: null, _retiring: null, _fadeT: null, _sizeTimers: [], _paused: false,
    stop: (preserve) => {
        clearTimeout(Fx._fadeT); Fx._fadeT=null;
        if(Fx._retiring && Fx._retiring.parentNode)Fx._retiring.parentNode.removeChild(Fx._retiring);
        Fx._retiring=null;
        Fx._sizeTimers.forEach(clearTimeout); Fx._sizeTimers=[];
        if (Fx.raf) cancelAnimationFrame(Fx.raf);
        Fx.raf = null; Fx.scene = null; Fx._frame = null;
        if (Fx._watchdog) { clearInterval(Fx._watchdog); Fx._watchdog = null; }
        clearTimeout(Fx.resizeT); Fx.resizeT = null;
        window.removeEventListener('resize', Fx._onResize);
        window.removeEventListener('orientationchange', Fx._onResize);
        if (Fx._ro) { try { Fx._ro.disconnect(); } catch (e) {} Fx._ro = null; }
        if (Fx.canvas && Fx.canvas !== preserve && Fx.canvas.parentNode) Fx.canvas.parentNode.removeChild(Fx.canvas);
        Fx.canvas = null; Fx.ctx = null; Fx.root = null; Fx.mode = null;
    },
    pause: () => { Fx._paused=true; addClass(Fx.root || View.root,'cm-paused'); if (Fx.raf) { cancelAnimationFrame(Fx.raf); Fx.raf = null; } },
    resume: () => { if(document.hidden || !App.active)return; Fx._paused=false; removeClass(Fx.root || View.root,'cm-paused'); if (Fx.canvas && Fx.scene && !Fx.raf && Fx._frame) { Fx.last = 0; Fx.tick = Date.now(); Fx.raf = requestAnimationFrame(Fx._frame); } },
    _onResize: () => { clearTimeout(Fx.resizeT); Fx.resizeT = setTimeout(Fx._resize, 180); },
    _resize: () => {
        if (!Fx.canvas || !Fx.root || !Fx.ctx) return;
        const w = Fx.root.clientWidth || window.innerWidth || 1;
        const h = Fx.root.clientHeight || window.innerHeight || 1;
        if (w === Fx.W && h === Fx.H && Fx.canvas.width) return;
        const dpr = Perf.dpr();
        Fx.W = Math.max(1, w);
        Fx.H = Math.max(1, h);
        Fx.canvas.width = Math.round(Fx.W * dpr);
        Fx.canvas.height = Math.round(Fx.H * dpr);
        Fx.canvas.style.width = Fx.W + 'px';
        Fx.canvas.style.height = Fx.H + 'px';
        Fx.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        if (Fx.scene && Fx.scene.resize) { try { Fx.scene.resize(Fx.W, Fx.H); } catch (e) {} }
    },
    // вызывается после вставки в DOM: до этого clientWidth == 0 и холст был 1×1
    ensureSize: () => { Fx._sizeTimers.forEach(clearTimeout); Fx._sizeTimers=[0,160,600].map(ms=>setTimeout(Fx._resize,ms)); },
    start: (root, mode) => {
        if (!root || mode === 'none' || reducedMotion() || pGet('fx', true) === false) { Fx.stop(); return; }
        // та же сцена уже крутится — не тратим кадр на пересоздание частиц
        if (Fx.mode === mode && Fx.root === root && Fx.canvas && Fx.scene) { Fx.resume(); return; }
        const previous = !Perf.lite() && Fx.root===root ? Fx.canvas : null;
        Fx.stop(previous);
        if(previous){Fx._retiring=previous;addClass(previous,'cm-scene-out');Fx._fadeT=setTimeout(()=>{
            if(previous.parentNode)previous.parentNode.removeChild(previous);if(Fx._retiring===previous)Fx._retiring=null;
        },650);}
        Fx._paused=false;
        Fx.mode = mode;
        const canvas = el('canvas', 'cm-rain'+(previous?' cm-scene-in':''));
        root.insertBefore(canvas, root.firstChild);
        const ctx = canvas.getContext ? canvas.getContext('2d', { alpha: true }) : null;
        if (!ctx) { if (canvas.parentNode) canvas.parentNode.removeChild(canvas); return; }
        Fx.root = root; Fx.canvas = canvas; Fx.ctx = ctx;
        Fx.scene = (SCENES[mode] || SCENES.astro)();
        Fx.last = 0; Fx.W = 0; Fx.H = 0;
        Fx._resize();
        Fx.ensureSize();
        window.addEventListener('resize', Fx._onResize, { passive: true });
        window.addEventListener('orientationchange', Fx._onResize, { passive: true });
        try { if (window.ResizeObserver) { Fx._ro = new ResizeObserver(Fx._onResize); Fx._ro.observe(root); } } catch (e) {}
        const frame = (now) => {
            Fx.tick = Date.now();
            if (!Fx.canvas || !Fx.scene) { Fx.raf = null; return; }
            if (!Fx.canvas.parentNode || document.hidden || !App.active || Fx._paused) { Fx.pause(); return; }
            Fx.raf = requestAnimationFrame(frame);
            const target = 1000 / (Math.min(Fx.scene.fps || Perf.fps(),Perf.fps()) / (Modal.active() ? 2 : 1));
            if (!Fx.last) Fx.last = now;
            const elapsed = now - Fx.last;
            if (elapsed < target) return;
            Fx.last = now;
            const dt = Math.min(elapsed / 1000, .12);
            ctx.clearRect(0, 0, Fx.W, Fx.H);
            try { Fx.scene.draw(ctx, Fx.W, Fx.H, dt, now / 1000); }
            catch (e) { console.error('[Капсула] сцена:', e); Fx.stop(); }
        };
        Fx._frame = frame;
        Fx.tick = Date.now();
        if(App.active && !document.hidden)Fx.raf = requestAnimationFrame(frame);else Fx.pause();
        // если rAF замер (ТВ-браузеры любят это делать) — поднимаем цикл
        Fx._watchdog = setInterval(() => {
            if (!App.active || !Fx.canvas || !Fx.scene || document.hidden || Fx._paused) return;
            if (Date.now() - Fx.tick < 2500) return;
            if (Fx.raf) { cancelAnimationFrame(Fx.raf); Fx.raf = null; }
            Fx.last = 0; Fx.tick = Date.now();
            Fx.raf = requestAnimationFrame(frame);
        }, 4000);
    }
};

const ThemeContrast = {apply:(root,accent)=>{
    const c=hexRgb(accent).split(',').map(Number),luma=(c[0]*.2126+c[1]*.7152+c[2]*.0722)/255;
    root.style.setProperty('--cm-primary-text',luma>.6?'#101217':'#F4F4F2');
}};
const Themes = {
    current: () => (THEMES[pGet('theme', 'astro')] ? pGet('theme', 'astro') : 'astro'),
    apply: (key, root) => {
        const t = THEMES[key] || THEMES.astro;
        root = root || View.root;
        if (!root) return;
        THEME_ORDER.forEach(k => removeClass(root, THEMES[k].cls));
        addClass(root, t.cls);
        for (const v in t.vars) root.style.setProperty(v, t.vars[v]);
        root.style.setProperty('--cm-accent-rgb', hexRgb(t.vars['--cm-accent']));
        root.style.setProperty('--cm-accent2-rgb', hexRgb(t.vars['--cm-accent2']));
        ThemeContrast.apply(root,t.vars['--cm-accent']);
        if(pGet('fx',true)===false || reducedMotion())addClass(root,'cm-static');else removeClass(root,'cm-static');
        const sl = root.querySelector('.cm-sysline');
        if (sl) sl.textContent = t.sys || '';
        if (Perf.lite()) addClass(root, 'cm-lite'); else removeClass(root, 'cm-lite');
        Fx.start(root, t.fx);
    },
    set: (key) => { pSet('theme', key); Themes.apply(key, View.root); FilmTheme.key = null; FilmTheme.apply(View.current()); },
    quote: (key) => { const t = THEMES[key || Themes.current()] || THEMES.astro; const q = t.quotes || []; return q.length ? pickOne(q) : ''; },
    loadLine: () => { const t = THEMES[Themes.current()] || THEMES.astro; return pickOne(t.load || ['СОБИРАЮ КАПСУЛУ']); }
};
// Смещение интерфейса — плавная шкала, а не пять фиксированных значений.
const OFFSET_MIN = -3, OFFSET_MAX = 3, OFFSET_STEP = 0.25;
const offsetGet = () => {
    const raw = pGet('stage_offset', 0);
    const n = typeof raw === 'number' ? raw : (parseFloat(String(raw)) || 0);
    return clamp(n, OFFSET_MIN, OFFSET_MAX);
};
const offsetSet = (n) => {
    const v = clamp(Math.round(n / OFFSET_STEP) * OFFSET_STEP, OFFSET_MIN, OFFSET_MAX);
    pSet('stage_offset', Math.round(v * 100) / 100);
    return v;
};
const StageOffset = { apply: (root) => { if (root) root.style.setProperty('--cm-stage-offset', offsetGet() + 'em'); } };
const offsetLabel = () => {
    const n = offsetGet();
    if (!n) return 'по центру';
    const num = String(Math.abs(n)).replace('.', ',');
    return (n < 0 ? 'выше на ' : 'ниже на ') + num;
};

// ═══════════════════════════════════════════ ТЕМА ПОД ФИЛЬМ (эксперимент)
// Капсула узнаёт франшизу по названию карточки и на лету перекрашивается
// в её палитру со своей анимацией. Ушли с карточки — вернулась обычная тема.
// accent может быть массивом: цвет выбирается случайно при каждом показе.
const FILM_THEMES = [
    { key:'rickmorty',name:'Рик и Морти',re:/(rick and morty|рик и морти)/,accent:'#7CFF6B',accent2:'#3AD1FF',bg:'#07141B',fx:'portalpair' },
    { key:'aang',name:'Четыре стихии',re:/(avatar the last airbender|avatar the legend|аватар легенда|легенда об аанге|легенда о корре|повелитель стихий)/,accent:'#E9B665',accent2:'#78BED7',bg:'#09131B',fx:'lotus' },
    { key:'inception',name:'Начало',re:/^(inception|начало)$/,accent:'#E9B487',accent2:'#A68B74',bg:'#09090C',fx:'dreamcity' },
    { key: 'kungfu',  name: 'Кунг-фу Панда',      re: /(kung ?fu panda|кунг ?фу панда)/,                          accent: '#D8433C', accent2: '#DA9C2A', bg: '#1C140B', fx: 'pandafilm' },
    { key: 'spider',  name: 'Человек-паук',       re: /(spider ?man|человек ?паук|паучок|spider verse)/,          accent: '#BC0B26', accent2: '#5B8DEF', bg: '#0A0A14', fx: 'spider' },
    { key: 'shrek',   name: 'Шрэк',               re: /(shrek|шрэк|шрек)/,                                        accent: '#D1D646', accent2: '#88796B', bg: '#121608', fx: 'swamp' },
    { key: 'tmnt',    name: 'Черепашки-ниндзя',   re: /(teenage mutant|ninja turtles|черепашки ниндзя)/,          accent: ['#D23A07', '#0341AC', '#93339C', '#EF0008'], accent2: '#504B26', bg: '#0C1208', fx: 'shuriken' },
    { key: 'dragon',  name: 'Как приручить дракона', re: /(how to train your dragon|как приручить дракона)/,      accent: '#609C47', accent2: '#C21509', bg: '#08120E', fx: 'dragon' },
    { key: 'puss',    name: 'Кот в сапогах',      re: /(puss in boots|кот в сапогах)/,                            accent: '#CB6220', accent2: '#5A6129', bg: '#140E06', fx: 'claws' },
    // придумано сверх списка
    { key: 'matrix',  name: 'Матрица',            re: /(the matrix|матрица)/,                                     accent: '#00FF41', accent2: '#00B32E', bg: '#000600', fx: 'matrix' },
    { key: 'potter',  name: 'Волшебный мир',      re: /(harry potter|гарри поттер|fantastic beasts|фантастические твари)/, accent: '#B8873B', accent2: '#6E1F23', bg: '#0B0A12', fx: 'snitch' },
    { key: 'starwars', name: 'Звёздные войны',    re: /(star wars|звездные войны|mandalorian|мандалорец)/,        accent: '#FFE81F', accent2: '#4BD5FF', bg: '#020409', fx: 'galaxy' },
    { key: 'minions', name: 'Миньоны',            re: /(despicable me|гадкий я|minions|миньоны)/,                 accent: '#F5D33C', accent2: '#3B6FD4', bg: '#14120A', fx: 'bananas' },
    { key: 'iceage',  name: 'Ледниковый период',  re: /(ice age|ледниковый период)/,                              accent: '#8FD8F2', accent2: '#C9E9F7', bg: '#0A1620', fx: 'snow' },
    { key: 'pirates', name: 'Пираты',             re: /(pirates of the caribbean|пираты карибского)/,             accent: '#C79A4B', accent2: '#2E5A63', bg: '#100C08', fx: 'maelstrom' },
    { key: 'wick',    name: 'Джон Уик',           re: /(john wick|джон уик)/,                                     accent: '#E23B3B', accent2: '#2C7CF0', bg: '#07070A', fx: 'blade' },
    { key: 'dune',    name: 'Дюна',               re: /(^| )dune( |$)|дюна/,                                      accent: '#E7B46A', accent2: '#8EC7B1', bg: '#17100A', fx: 'sandworm' },
    { key: 'avatar',  name: 'Пандора',            re: /(avatar|аватар)/,                                          accent: '#2FA7E0', accent2: '#7CFF6B', bg: '#05101A', fx: 'fireflies' },
    { key: 'ring',    name: 'Средиземье',         re: /(lord of the rings|властелин колец|the hobbit|хоббит)/,    accent: '#C9A227', accent2: '#4A5D3A', bg: '#0C0E0A', fx: 'runes' },
    { key: 'madagascar', name: 'Мадагаскар',      re: /(madagascar|мадагаскар)/,                                  accent: '#E8B33C', accent2: '#3E8E5A', bg: '#12140A', fx: 'paws' },
    { key: 'nemo',    name: 'Немо',               re: /(finding nemo|finding dory|в поисках немо|в поисках дори)/, accent: '#F2711C', accent2: '#1B6CA8', bg: '#04121C', fx: 'ocean' },
    { key: 'cars',    name: 'Тачки',              re: /(^| )cars( |$)|тачки/,                                     accent: '#D62828', accent2: '#F0A202', bg: '#140A08', fx: 'speed' },
    { key: 'jurassic', name: 'Парк Юрского',      re: /(jurassic|парк юрского|мир юрского)/,                      accent: '#C4762A', accent2: '#3E6B3A', bg: '#0B1108', fx: 'claws' },
    // ── комиксы ──────────────────────────────────────────────
    { key: 'ironman', name: 'Железный человек',   re: /(iron man|железный человек)/,                              accent: '#D62828', accent2: '#F0A202', bg: '#140A08', fx: 'embers' },
    { key: 'thor',    name: 'Асгард',             re: /(^| )thor( |$)|тор рагнарек|тор любовь|тор царство/,      accent: '#4FA3E3', accent2: '#D8B24A', bg: '#060A12', fx: 'lightning' },
    { key: 'batman',  name: 'Готэм',              re: /(batman|бэтмен|бетмен|темный рыцарь)/,                     accent: '#C8A64B', accent2: '#7A8B99', bg: '#07070A', fx: 'bats' },
    { key: 'joker',   name: 'Джокер',             re: /(joker|джокер)/,                                           accent: '#8B5CF6', accent2: '#3FA34D', bg: '#0A080C', fx: 'cards' },
    { key: 'superman', name: 'Криптон',           re: /(superman|супермен)/,                                      accent: '#1F6FEB', accent2: '#E23B3B', bg: '#050912', fx: 'comic' },
    { key: 'guardians', name: 'Стражи галактики', re: /(guardians of the galaxy|стражи галактики)/,               accent: '#7C4DFF', accent2: '#FF8A3D', bg: '#06060F', fx: 'astro' },
    { key: 'deadpool', name: 'Дэдпул',            re: /(deadpool|дэдпул|дедпул)/,                                 accent: '#D0242B', accent2: '#B9B9B9', bg: '#0B0708', fx: 'confetti' },
    { key: 'venom',   name: 'Симбиот',            re: /(venom|веном)/,                                            accent: '#9BA3AE', accent2: '#5B8DEF', bg: '#05060A', fx: 'tendrils' },
    { key: 'avengers', name: 'Мстители',          re: /(avengers|мстители|marvel)/,                               accent: '#E23636', accent2: '#5B8DEF', bg: '#0A0D16', fx: 'comic' },
    // ── фантастика и боевики ────────────────────────────────
    { key: 'terminator', name: 'Скайнет',         re: /(terminator|терминатор)/,                                  accent: '#E23B3B', accent2: '#8FA3B8', bg: '#08090C', fx: 'scan' },
    { key: 'alien',   name: 'Чужой',              re: /(^| )aliens?( |$)|чужой|чужие|prometheus|прометей/,     accent: '#7FD8C0', accent2: '#8A6BD1', bg: '#04070A', fx: 'ash' },
    { key: 'predator', name: 'Хищник',            re: /(predator|хищник)/,                                        accent: '#8FC93A', accent2: '#C0392B', bg: '#070B06', fx: 'scan' },
    { key: 'bttf',    name: 'Назад в будущее',    re: /(back to the future|назад в будущее)/,                     accent: '#F0A202', accent2: '#5B8DEF', bg: '#0A0A10', fx: 'lightning' },
    { key: 'tron',    name: 'Сетка',              re: /(^| )tron( |$)|трон наследие/,                            accent: '#4BD5FF', accent2: '#F0A202', bg: '#03070C', fx: 'grid' },
    { key: 'blade',   name: 'Бегущий по лезвию',  re: /(blade runner|бегущий по лезвию)/,                         accent: '#F2B6FF', accent2: '#74E5FF', bg: '#090D16', fx: 'blade' },
    { key: 'interstellar', name: 'Дальний космос', re: /(interstellar|интерстеллар)/,                             accent: '#B8C4D6', accent2: '#E3A857', bg: '#04060C', fx: 'astro' },
    { key: 'martian', name: 'Марс',               re: /(the martian|марсианин)/,                                  accent: '#E07A3E', accent2: '#8FB8D6', bg: '#120903', fx: 'dune' },
    { key: 'fast',    name: 'Форсаж',             re: /(форсаж|fast furious|fast and the furious|fate of the furious)/, accent: '#E23B3B', accent2: '#F0A202', bg: '#0A0708', fx: 'speed' },
    { key: 'bond',    name: 'Агент 007',          re: /(james bond|агент 007|skyfall|скайфолл|spectre|спектр|no time to die)/, accent: '#C8A64B', accent2: '#5B8DEF', bg: '#08080B', fx: 'noir' },
    { key: 'mission', name: 'Миссия невыполнима', re: /(mission impossible|миссия невыполнима)/,                  accent: '#E23B3B', accent2: '#5B8DEF', bg: '#07080C', fx: 'scan' },
    { key: 'hunger',  name: 'Голодные игры',      re: /(hunger games|голодные игры)/,                             accent: '#E0762B', accent2: '#8FA3B8', bg: '#0A0806', fx: 'embers' },
    { key: 'indiana', name: 'Индиана Джонс',      re: /(indiana jones|индиана джонс)/,                            accent: '#C08A3E', accent2: '#6B8E5A', bg: '#120D07', fx: 'dune' },
    { key: 'mummy',   name: 'Мумия',              re: /(the mummy|мумия)/,                                        accent: '#D9A441', accent2: '#7A5C3A', bg: '#120E08', fx: 'dune' },
    { key: 'titanic', name: 'Титаник',            re: /(titanic|титаник)/,                                        accent: '#5B8DEF', accent2: '#D9C08A', bg: '#050A14', fx: 'iceberg' },
    // ── фэнтези и сериалы ───────────────────────────────────
    { key: 'got',     name: 'Вестерос',           re: /(game of thrones|игра престолов|house of the dragon|дом дракона)/, accent: '#C0A062', accent2: '#6E8CA0', bg: '#0A0C10', fx: 'snow' },
    { key: 'witcher', name: 'Ведьмак',            re: /(the witcher|ведьмак)/,                                    accent: '#C9CDD2', accent2: '#B0392B', bg: '#0A0A0C', fx: 'runes' },
    { key: 'stranger', name: 'Изнанка',           re: /(stranger things|очень странные дела)/,                    accent: '#E01E37', accent2: '#5B8DEF', bg: '#08060A', fx: 'lightning' },
    { key: 'breakingbad', name: 'Во все тяжкие',  re: /(breaking bad|во все тяжкие|better call saul|лучше звоните солу)/, accent: '#D6E24A', accent2: '#1FAE96', bg: '#0B0E08', fx: 'lab' },
    { key: 'sherlock', name: 'Шерлок',            re: /(sherlock|шерлок)/,                                        accent: '#B08D57', accent2: '#7A8B99', bg: '#0A0A0B', fx: 'noir' },
    { key: 'supernatural', name: 'Сверхъестественное', re: /(supernatural|сверхъестественное)/,                   accent: '#C9A227', accent2: '#8FA3B8', bg: '#08070A', fx: 'ghosts' },
    { key: 'friends', name: 'Друзья',             re: /(^| )friends( |$)|^друзья( |$)/,                                        accent: '#E0453E', accent2: '#F2C21B', bg: '#0C0A0A', fx: 'confetti' },
    { key: 'jumanji', name: 'Джуманджи',          re: /(jumanji|джуманджи)/,                                      accent: '#3FA34D', accent2: '#D9A441', bg: '#07110A', fx: 'leaves' },
    // ── ужасы ────────────────────────────────────────────────
    { key: 'conjuring', name: 'Заклятие',         re: /(the conjuring|заклятие|annabelle|аннабель)/,              accent: '#B0392B', accent2: '#7A8B99', bg: '#07070A', fx: 'ghosts' },
    { key: 'saw',     name: 'Пила',               re: /(^| )saw( |$)|^пила|пила игра/,                           accent: '#3FA34D', accent2: '#B0392B', bg: '#080807', fx: 'scan' },
    { key: 'halloween', name: 'Хэллоуин',         re: /(halloween|хэллоуин|хеллоуин)/,                            accent: '#E8792B', accent2: '#6E4B8C', bg: '#0A0708', fx: 'bats' },
    { key: 'vampire', name: 'Клыки',              re: /(dracula|дракула|twilight|сумерки|nosferatu|носферату)/,   accent: '#8C1C2B', accent2: '#9BA3AE', bg: '#07060A', fx: 'bats' },
    // ── мультфильмы ─────────────────────────────────────────
    { key: 'frozen',  name: 'Холодное сердце',    re: /(^| )frozen( |$)|холодное сердце/,                        accent: '#7EC8F0', accent2: '#C9A7E8', bg: '#061018', fx: 'snow' },
    { key: 'lionking', name: 'Король Лев',        re: /(lion king|король лев)/,                                   accent: '#E0A03C', accent2: '#B0553A', bg: '#140E06', fx: 'dune' },
    { key: 'moana',   name: 'Моана',              re: /(moana|моана)/,                                            accent: '#1CA9C9', accent2: '#F2A65A', bg: '#04121A', fx: 'ocean' },
    { key: 'toystory', name: 'История игрушек',   re: /(toy story|история игрушек)/,                              accent: '#E0453E', accent2: '#F2C21B', bg: '#0A0C14', fx: 'confetti' },
    { key: 'monsters', name: 'Корпорация монстров', re: /(monsters inc|корпорация монстров|университет монстров)/, accent: '#3FA34D', accent2: '#5BC0EB', bg: '#08120C', fx: 'fireflies' },
    { key: 'insideout', name: 'Головоломка',      re: /(inside out|головоломка)/,                                 accent: '#F2C21B', accent2: '#E05FA8', bg: '#0A0814', fx: 'confetti' },
    { key: 'zootopia', name: 'Зверополис',        re: /(zootopia|зверополис)/,                                    accent: '#E8792B', accent2: '#5BC0EB', bg: '#0A0C10', fx: 'paws' },
    { key: 'walle',   name: 'ВАЛЛ-И',             re: /(wall ?e|валл ?и)/,                                        accent: '#D9A441', accent2: '#7FD8FF', bg: '#100C06', fx: 'grid' },
    { key: 'naruto',  name: 'Наруто',             re: /(naruto|наруто|boruto|боруто)/,                            accent: '#F58A07', accent2: '#2E6FD6', bg: '#0C0A06', fx: 'leaves' },
    { key: 'titan',   name: 'Атака титанов',      re: /(attack on titan|атака титанов)/,                          accent: '#8C6B3F', accent2: '#B0392B', bg: '#0A0906', fx: 'tendrils' },
    { key: 'onepiece', name: 'Ван Пис',           re: /(one piece|ван пис)/,                                      accent: '#E0453E', accent2: '#F0C244', bg: '#04101A', fx: 'maelstrom' },
    { key: 'pokemon', name: 'Покемон',            re: /(pokemon|покемон|покемоны)/,                               accent: '#F2C21B', accent2: '#E23B3B', bg: '#0A0C14', fx: 'sparks' },
    { key: 'ghibli',  name: 'Гибли',              re: /(унесенные призраками|spirited away|мой сосед тоторо|totoro|ходячий замок|howl s moving castle|принцесса мононоке|mononoke)/, accent: '#7FBF6A', accent2: '#7FD8FF', bg: '#07120A', fx: 'fireflies' }
,
    // ── добавлено в v20.6: классика, детективы, романтика, ужасы, война, спорт, фантастика, аниме ──
    { key: 'godfather', name: 'Крёстный отец', re: /godfather|крестный отец|крёстный отец/, accent: '#C9A227', accent2: '#8C1C2B', bg: '#0A0806', fx: 'smoke' },
    { key: 'pulpfiction', name: 'Криминальное чтиво', re: /pulp fiction|криминальное чтиво/, accent: '#FFD400', accent2: '#B0392B', bg: '#0A0806', fx: 'filmgrain' },
    { key: 'goodfellas', name: 'Славные парни', re: /goodfellas|славные парни/, accent: '#C9A227', accent2: '#2B2B2B', bg: '#0A0808', fx: 'smoke' },
    { key: 'scarface', name: 'Лицо со шрамом', re: /scarface|лицо со шрамом/, accent: '#E0453E', accent2: '#F2C21B', bg: '#0A0806', fx: 'smoke' },
    { key: 'killbill', name: 'Убить Билла', re: /kill bill|убить билла/, accent: '#F2C21B', accent2: '#E0453E', bg: '#0A0A0A', fx: 'blooddrip' },
    { key: 'shawshank', name: 'Побег из Шоушенка', re: /shawshank|шоушенка/, accent: '#C9CDD2', accent2: '#3FA34D', bg: '#0A0A0A', fx: 'ash' },
    { key: 'fightclub', name: 'Бойцовский клуб', re: /fight club|бойцовский клуб/, accent: '#E0453E', accent2: '#F2C21B', bg: '#0A0808', fx: 'smoke' },
    { key: 'se7en', name: 'Семь', re: /^se7en$|^seven$|^семь$/, accent: '#8C1C2B', accent2: '#2B2B2B', bg: '#06060A', fx: 'smoke' },
    { key: 'zodiac', name: 'Зодиак', re: /^zodiac$|^зодиак$/, accent: '#2B2B2B', accent2: '#8C1C2B', bg: '#07070A', fx: 'noir' },
    { key: 'prestige', name: 'Престиж', re: /the prestige|престиж/, accent: '#C9A227', accent2: '#2B2B2B', bg: '#0A0A0C', fx: 'smoke' },
    { key: 'oceans', name: 'Друзья Оушена', re: /ocean s eleven|ocean s twelve|ocean s thirteen|друзей оушена/, accent: '#C9A227', accent2: '#2B2B2B', bg: '#0A0A0C', fx: 'cards' },
    { key: 'nowyouseeme', name: 'Иллюзия обмана', re: /now you see me|иллюзия обмана/, accent: '#8B5CF6', accent2: '#C9A227', bg: '#0A080C', fx: 'cards' },
    { key: 'knivesout', name: 'Достать ножи', re: /knives out|достать ножи|glass onion|стеклянная луковица/, accent: '#B0392B', accent2: '#C9A227', bg: '#0A0806', fx: 'chess' },
    { key: 'shutterisland', name: 'Остров проклятых', re: /shutter island|остров проклятых/, accent: '#3A4A5A', accent2: '#8C1C2B', bg: '#04080C', fx: 'ash' },
    { key: 'bourne', name: 'Джейсон Борн', re: /jason bourne|борн эволюция|борн ультиматум|джейсон борн/, accent: '#5B8DEF', accent2: '#2B2B2B', bg: '#06080C', fx: 'scan' },
    { key: 'kingsman', name: 'Kingsman', re: /kingsman/, accent: '#1F3A5C', accent2: '#C9A227', bg: '#06080C', fx: 'smoke' },
    { key: 'notebook', name: 'Дневник памяти', re: /the notebook|дневник памяти/, accent: '#E86F8C', accent2: '#F2D9A0', bg: '#140A0C', fx: 'hearts' },
    { key: 'lalaland', name: 'Ла-Ла Ленд', re: /la la land|ла ла ленд/, accent: '#E0453E', accent2: '#2E6FD6', bg: '#0A0810', fx: 'vinyl' },
    { key: 'greatestshowman', name: 'Величайший шоумен', re: /greatest showman|величайший шоумен/, accent: '#E0453E', accent2: '#F2C21B', bg: '#0A0810', fx: 'confetti' },
    { key: 'mammamia', name: 'Мамма Миа', re: /mamma mia|мамма миа/, accent: '#2E9BD6', accent2: '#F2C21B', bg: '#061018', fx: 'ocean' },
    { key: 'grease', name: 'Бриолин', re: /^grease$|^бриолин$/, accent: '#E0453E', accent2: '#2B2B2B', bg: '#0A0808', fx: 'vinyl' },
    { key: 'grandbudapest', name: 'Гранд Будапешт', re: /grand budapest|гранд будапешт/, accent: '#E86FA0', accent2: '#7EC8C0', bg: '#140A10', fx: 'confetti' },
    { key: 'marypoppins', name: 'Мэри Поппинс', re: /mary poppins|мэри поппинс/, accent: '#5B8DEF', accent2: '#E8B33C', bg: '#0A0C18', fx: 'balloons' },
    { key: 'up', name: 'Вверх', re: /^up$|^вверх$|^вверх \d|disney up/, accent: '#E8792B', accent2: '#5B8DEF', bg: '#0A0C18', fx: 'balloons' },
    { key: 'paddington', name: 'Паддингтон', re: /paddington|паддингтон/, accent: '#C0392B', accent2: '#2E6FD6', bg: '#0A0A10', fx: 'feathers' },
    { key: 'charlie', name: 'Шоколадная фабрика', re: /charlie and the chocolate factory|шоколадная фабрика|вилли вонка/, accent: '#7C4DFF', accent2: '#F2C21B', bg: '#0A0810', fx: 'confetti' },
    { key: 'wizardofoz', name: 'Волшебник страны Оз', re: /wizard of oz|волшебник страны оз|изумрудного города/, accent: '#3FA34D', accent2: '#F2C21B', bg: '#0A0C08', fx: 'crystal' },
    { key: 'narnia', name: 'Хроники Нарнии', re: /narnia|нарнии/, accent: '#7EC8F0', accent2: '#C9A227', bg: '#060C14', fx: 'crystal' },
    { key: 'percyjackson', name: 'Перси Джексон', re: /percy jackson|перси джексон/, accent: '#2E6FD6', accent2: '#C9A227', bg: '#04101A', fx: 'ocean' },
    { key: 'scream', name: 'Крик', re: /^scream|^крик$|^крик \d/, accent: '#E8E8E8', accent2: '#8C1C2B', bg: '#07070A', fx: 'blooddrip' },
    { key: 'nightmare', name: 'Кошмар на улице Вязов', re: /nightmare on elm street|кошмар на улице вязов|фредди крюгер/, accent: '#B0392B', accent2: '#3FA34D', bg: '#07080A', fx: 'claws' },
    { key: 'exorcist', name: 'Изгоняющий дьявола', re: /the exorcist|изгоняющий дьявола/, accent: '#8FA3B8', accent2: '#3A2A2A', bg: '#07080A', fx: 'ghosts' },
    { key: 'itfilm', name: 'Оно', re: /^it$|^it \d|^оно$|^оно \d|pennywise|пеннивайз/, accent: '#E8792B', accent2: '#B0392B', bg: '#07070A', fx: 'balloons' },
    { key: 'shining', name: 'Сияние', re: /the shining|сияние/, accent: '#B0392B', accent2: '#F0C567', bg: '#0A0A0C', fx: 'snow' },
    { key: 'jordanpeele', name: 'Прочь и Мы', re: /^get out$|^прочь$|^us$|^мы$/, accent: '#8C1C2B', accent2: '#2B2B2B', bg: '#07070A', fx: 'scan' },
    { key: 'privateryan', name: 'Спасти рядового Райана', re: /saving private ryan|рядового райана/, accent: '#6B7A4F', accent2: '#8C1C2B', bg: '#0A0A08', fx: 'ash' },
    { key: 'nineteen17', name: '1917', re: /^1917$/, accent: '#6B7A4F', accent2: '#C9A227', bg: '#0A0A08', fx: 'smoke' },
    { key: 'dunkirk', name: 'Дюнкерк', re: /dunkirk|дюнкерк/, accent: '#7A8B99', accent2: '#E0762B', bg: '#06080C', fx: 'ocean' },
    { key: 'schindler', name: 'Список Шиндлера', re: /schindler s list|список шиндлера/, accent: '#C9CDD2', accent2: '#8C1C2B', bg: '#08080A', fx: 'ash' },
    { key: 'gladiator', name: 'Гладиатор', re: /gladiator|гладиатор/, accent: '#C9A227', accent2: '#8C1C2B', bg: '#0A0906', fx: 'embers' },
    { key: 'rocky', name: 'Рокки', re: /^rocky|^рокки|creed|крид наследие/, accent: '#E23636', accent2: '#2E6FD6', bg: '#0A0708', fx: 'embers' },
    { key: 'readyplayerone', name: 'Первому игроку приготовиться', re: /ready player one|первому игроку приготовиться/, accent: '#4BD5FF', accent2: '#F0A202', bg: '#03070C', fx: 'grid' },
    { key: 'ghostshell', name: 'Призрак в доспехах', re: /ghost in the shell|призрак в доспехах/, accent: '#5BC0EB', accent2: '#E23636', bg: '#04070C', fx: 'circuitry' },
    { key: 'exmachina', name: 'Из машины', re: /ex machina|из машины/, accent: '#5BC0EB', accent2: '#E8E8E8', bg: '#06080C', fx: 'circuitry' },
    { key: 'irobot', name: 'Я, робот', re: /i, robot|i robot|я робот/, accent: '#E23636', accent2: '#5BC0EB', bg: '#06080C', fx: 'circuitry' },
    { key: 'transformers', name: 'Трансформеры', re: /transformers|трансформеры/, accent: '#E23B3B', accent2: '#4BD5FF', bg: '#07080C', fx: 'circuitry' },
    { key: 'westworld', name: 'Мир Дикого Запада', re: /westworld|мир дикого запада/, accent: '#C9A227', accent2: '#8C1C2B', bg: '#0A0806', fx: 'circuitry' },
    { key: 'gravity', name: 'Гравитация', re: /^gravity$|^гравитация$/, accent: '#B8C4D6', accent2: '#E3A857', bg: '#04060C', fx: 'astro' },
    { key: 'arrival', name: 'Прибытие', re: /^arrival$|^прибытие$/, accent: '#7EC8F0', accent2: '#2B2B2B', bg: '#05070C', fx: 'circuitry' },
    { key: 'madmax', name: 'Безумный Макс', re: /mad max|безумный макс/, accent: '#E0762B', accent2: '#7A8B99', bg: '#0F0A06', fx: 'speed' },
    { key: 'blackpanther', name: 'Чёрная пантера', re: /black panther|черная пантера|чёрная пантера/, accent: '#7C1F2B', accent2: '#C9A227', bg: '#06060A', fx: 'sparks' },
    { key: 'hangover', name: 'Мальчишник в Вегасе', re: /the hangover|мальчишник в вегасе/, accent: '#F2C21B', accent2: '#E0453E', bg: '#0A0806', fx: 'confetti' },
    { key: 'homealone', name: 'Один дома', re: /home alone|один дома/, accent: '#E0453E', accent2: '#3FA34D', bg: '#0A0C10', fx: 'snow' },
    { key: 'elf', name: 'Эльф', re: /^elf$|^эльф$/, accent: '#3FA34D', accent2: '#E0453E', bg: '#0A0C10', fx: 'snow' },
    { key: 'christmascarol', name: 'Рождественская классика', re: /christmas carol|wonderful life|miracle on 34th|рождественская история/, accent: '#C9A227', accent2: '#8C1C2B', bg: '#0A0806', fx: 'snow' },
    { key: 'demonslayer', name: 'Клинок, рассекающий демонов', re: /demon slayer|kimetsu no yaiba|клинок рассекающий демонов/, accent: '#2E9BD6', accent2: '#E23636', bg: '#05060A', fx: 'embers' },
    { key: 'jujutsu', name: 'Магическая битва', re: /jujutsu kaisen|магическая битва/, accent: '#8B5CF6', accent2: '#2B2B2B', bg: '#06060A', fx: 'cursedenergy' },
    { key: 'myhero', name: 'Моя геройская академия', re: /my hero academia|боку но хироакадемия|геройская академия/, accent: '#2E6FD6', accent2: '#E23636', bg: '#06060A', fx: 'sparks' },
    { key: 'deathnote', name: 'Тетрадь смерти', re: /death note|тетрадь смерти/, accent: '#2B2B2B', accent2: '#8C1C2B', bg: '#07070A', fx: 'ash' },
    { key: 'dragonball', name: 'Драконий жемчуг', re: /dragon ball|драконий жемчуг/, accent: '#F0A202', accent2: '#2E6FD6', bg: '#0A0806', fx: 'sparks' },
    { key: 'bebop', name: 'Ковбой Бибоп', re: /cowboy bebop|ковбой бибоп/, accent: '#C9A227', accent2: '#2E6FD6', bg: '#0A0806', fx: 'smoke' }
,
    // ── добавлено в v20.7: мультфильмы, супергероика, культовая фантастика, аниме ──
    { key: 'coco', name: 'Тайна Коко', re: /^coco$|тайна коко/, accent: '#F2A335', accent2: '#8B5CF6', bg: '#12080A', fx: 'marigold' },
    { key: 'encanto', name: 'Энканто', re: /encanto|энканто/, accent: '#F2A335', accent2: '#3FA34D', bg: '#100C08', fx: 'wish' },
    { key: 'wonka', name: 'Вонка', re: /^wonka$|^вонка$|вилли вонка/, accent: '#7C4DFF', accent2: '#F2C21B', bg: '#0A0810', fx: 'chocolate' },
    { key: 'mulan', name: 'Мулан', re: /^mulan$|мулан/, accent: '#C0392B', accent2: '#E8B33C', bg: '#0A0806', fx: 'leaves' },
    { key: 'aladdin', name: 'Аладдин', re: /aladdin|алладин|аладдин/, accent: '#2E6FD6', accent2: '#E8B33C', bg: '#04101A', fx: 'wish' },
    { key: 'littlemermaid', name: 'Русалочка', re: /little mermaid|русалочка/, accent: '#1CA9C9', accent2: '#F2A65A', bg: '#04121A', fx: 'ocean' },
    { key: 'beauty', name: 'Красавица и чудовище', re: /beauty and the beast|красавица и чудовище/, accent: '#E8B33C', accent2: '#3A2A5C', bg: '#0A0810', fx: 'hearts' },
    { key: 'brother_bear', name: 'Братец медвежонок', re: /brother bear|братец медвежонок/, accent: '#E0762B', accent2: '#7A8B99', bg: '#0F0A06', fx: 'aurora' },
    { key: 'secretlife', name: 'Тайная жизнь домашних', re: /secret life of pets|тайная жизнь домашних/, accent: '#F2C21B', accent2: '#E0453E', bg: '#0A0C08', fx: 'confetti' },
    { key: 'grinch', name: 'Гринч', re: /^the grinch$|^гринч$|гринч \d/, accent: '#3FA34D', accent2: '#B0392B', bg: '#0A0C10', fx: 'snow' },
    { key: 'wonderwoman', name: 'Чудо-женщина', re: /wonder woman|чудо женщина/, accent: '#C9A227', accent2: '#E23636', bg: '#06060A', fx: 'sparks' },
    { key: 'aquaman', name: 'Аквамен', re: /aquaman|аквамен/, accent: '#1F8FD6', accent2: '#F2A65A', bg: '#04101A', fx: 'ocean' },
    { key: 'flash', name: 'Флэш', re: /^the flash$|^флэш$|флэш \d/, accent: '#E23636', accent2: '#F2C21B', bg: '#07080C', fx: 'lightning' },
    { key: 'shazam', name: 'Шазам', re: /^shazam$|шазам/, accent: '#E23636', accent2: '#F2C21B', bg: '#06060A', fx: 'lightning' },
    { key: 'antman', name: 'Человек-муравей', re: /ant ?man|человек муравей/, accent: '#E0453E', accent2: '#7A8B99', bg: '#06060A', fx: 'quantum' },
    { key: 'doctorstrange', name: 'Доктор Стрэндж', re: /doctor strange|доктор стрэндж/, accent: '#8B5CF6', accent2: '#E8792B', bg: '#06060A', fx: 'portaldoors' },
    { key: 'captainamerica', name: 'Капитан Америка', re: /captain america|капитан америка/, accent: '#5B8DEF', accent2: '#E23636', bg: '#06060A', fx: 'sparks' },
    { key: 'shangchi', name: 'Шан-Чи', re: /shang chi|шан чи/, accent: '#E23636', accent2: '#F2C21B', bg: '#0A0806', fx: 'leaves' },
    { key: 'expendables', name: 'Неудержимые', re: /expendables|неудержимые/, accent: '#E0762B', accent2: '#2B2B2B', bg: '#0A0806', fx: 'embers' },
    { key: 'rambo', name: 'Рэмбо', re: /^rambo|рэмбо/, accent: '#6B7A4F', accent2: '#8C1C2B', bg: '#0A0A08', fx: 'ash' },
    { key: 'dieHard', name: 'Крепкий орешек', re: /die hard|крепкий орешек/, accent: '#E23636', accent2: '#F2C21B', bg: '#0A0806', fx: 'shockwave' },
    { key: 'topgun', name: 'Топ Ган', re: /top gun|топ ган/, accent: '#5B8DEF', accent2: '#E23636', bg: '#04060C', fx: 'speed' },
    { key: 'kingdomofheaven', name: 'Царство небесное', re: /kingdom of heaven|царство небесное/, accent: '#C9A227', accent2: '#8C1C2B', bg: '#0A0806', fx: 'inferno' },
    { key: 'braveheart', name: 'Храброе сердце', re: /braveheart|храброе сердце/, accent: '#3FA34D', accent2: '#8C1C2B', bg: '#0A0C06', fx: 'inferno' },
    { key: '300', name: '300 спартанцев', re: /^300$|300 спартанцев/, accent: '#8C1C2B', accent2: '#C9A227', bg: '#0A0806', fx: 'inferno' },
    { key: 'edgeoftomorrow', name: 'Грань будущего', re: /edge of tomorrow|грань будущего/, accent: '#5B8DEF', accent2: '#E23636', bg: '#06080C', fx: 'lightning' },
    { key: 'districtnine', name: 'Район №9', re: /district 9|район 9|район №9/, accent: '#8FA34F', accent2: '#C9CDD2', bg: '#08090A', fx: 'scan' },
    { key: 'elysium', name: 'Элизиум', re: /^elysium$|элизиум/, accent: '#5BC0EB', accent2: '#C9CDD2', bg: '#04060C', fx: 'quantum' },
    { key: 'looper', name: 'Петля времени', re: /^looper$|петля времени/, accent: '#5B8DEF', accent2: '#8C1C2B', bg: '#06060A', fx: 'shockwave' },
    { key: 'primer', name: 'Праймер', re: /^primer$|праймер/, accent: '#5BC0EB', accent2: '#8C1C2B', bg: '#04060A', fx: 'quantum' },
    { key: 'passengers', name: 'Пассажиры', re: /^passengers$|пассажиры/, accent: '#7EC8F0', accent2: '#E0762B', bg: '#04060C', fx: 'astro' },
    { key: 'evangelion', name: 'Евангелион', re: /evangelion|евангелион/, accent: '#8C1C2B', accent2: '#5BC0EB', bg: '#0A0708', fx: 'biomech' },
    { key: 'akira', name: 'Акира', re: /^akira$|акира/, accent: '#E23636', accent2: '#5BC0EB', bg: '#06060A', fx: 'speed' },
    { key: 'spiritedaway', name: 'Унесённые призраками', re: /spirited away|унесенные призраками/, accent: '#7FBF6A', accent2: '#F2A65A', bg: '#07120A', fx: 'fireflies' },
    { key: 'castleinthesky', name: 'Небесный замок', re: /castle in the sky|небесный замок/, accent: '#7EC8F0', accent2: '#7FBF6A', bg: '#04101A', fx: 'astro' },
    { key: 'yourname', name: 'Твоё имя', re: /your name|твоё имя|твое имя/, accent: '#E86FA0', accent2: '#5B8DEF', bg: '#06060C', fx: 'aurora' },
    { key: 'hunterxhunter', name: 'Хантер х Хантер', re: /hunter x hunter|хантер х хантер/, accent: '#3FA34D', accent2: '#E23636', bg: '#0A0806', fx: 'leaves' },
    { key: 'chainsawman', name: 'Человек-бензопила', re: /chainsaw man|человек бензопила/, accent: '#8C1C2B', accent2: '#2B2B2B', bg: '#0A0708', fx: 'blooddrip' },
    { key: 'nightmarebeforexmas', name: 'Кошмар перед Рождеством', re: /nightmare before christmas|кошмар перед рождеством/, accent: '#3FA34D', accent2: '#E0762B', bg: '#0A0A0C', fx: 'bats' },
    { key: 'polarexpress', name: 'Полярный экспресс', re: /polar express|полярный экспресс/, accent: '#5B8DEF', accent2: '#E23636', bg: '#04060C', fx: 'snow' }
,
    // ── добавлено в v20.7: культовые сериалы, драма, независимое кино, ещё супергерои ──
    { key: 'cinemaparadiso', name: 'Синема Парадизо', re: /cinema paradiso|синема парадизо|новый кинотеатр парадизо/, accent: '#E8B33C', accent2: '#8C1C2B', bg: '#0A0806', fx: 'popcorn' },
    { key: 'theartist', name: 'Артист', re: /^the artist$|^артист$/, accent: '#C9CDD2', accent2: '#2B2B2B', bg: '#0A0A0A', fx: 'spotlight' },
    { key: 'squidgame', name: 'Игра в кальмара', re: /squid game|игра в кальмара/, accent: '#3FA34D', accent2: '#E23B3B', bg: '#0A0C0A', fx: 'squidshapes' },
    { key: 'moneyheist', name: 'Бумажный дом', re: /money heist|la casa de papel|бумажный дом/, accent: '#E23B3B', accent2: '#C9A227', bg: '#0A0806', fx: 'cards' },
    { key: 'peakyblinders', name: 'Острые козырьки', re: /peaky blinders|острые козырьки/, accent: '#7A8B99', accent2: '#C9A227', bg: '#0A0A0A', fx: 'smoke' },
    { key: 'narcos', name: 'Нарко', re: /^narcos$|^наркос$/, accent: '#3FA34D', accent2: '#8C1C2B', bg: '#0A0806', fx: 'ash' },
    { key: 'thewire', name: 'Прослушка', re: /^the wire$|^прослушка$/, accent: '#7A8B99', accent2: '#2B2B2B', bg: '#0A0A0A', fx: 'noir' },
    { key: 'sopranos', name: 'Клан Сопрано', re: /the sopranos|клан сопрано/, accent: '#C9A227', accent2: '#2B2B2B', bg: '#0A0808', fx: 'smoke' },
    { key: 'housemd', name: 'Доктор Хаус', re: /^house m d$|^house$|доктор хаус/, accent: '#5BC0EB', accent2: '#C9CDD2', bg: '#06080C', fx: 'scan' },
    { key: 'greysanatomy', name: 'Анатомия страсти', re: /grey s anatomy|анатомия страсти/, accent: '#E86F8C', accent2: '#5BC0EB', bg: '#06080C', fx: 'scan' },
    { key: 'theoffice', name: 'Офис', re: /^the office$|^офис$/, accent: '#C9A227', accent2: '#2B2B2B', bg: '#0A0A08', fx: 'popcorn' },
    { key: 'simpsons', name: 'Симпсоны', re: /the simpsons|симпсоны/, accent: '#F2C21B', accent2: '#5B8DEF', bg: '#0A0806', fx: 'popcorn' },
    { key: 'bigbangtheory', name: 'Теория большого взрыва', re: /big bang theory|теория большого взрыва/, accent: '#2E6FD6', accent2: '#F2C21B', bg: '#06060A', fx: 'sparks' },
    { key: 'familyguy', name: 'Гриффины', re: /family guy|гриффины/, accent: '#2E6FD6', accent2: '#F2C21B', bg: '#0A0810', fx: 'confetti' },
    { key: 'southpark', name: 'Южный Парк', re: /south park|южный парк/, accent: '#F2C21B', accent2: '#5B8DEF', bg: '#061018', fx: 'snow' },
    { key: 'shapeofwater', name: 'Форма воды', re: /shape of water|форма воды/, accent: '#1F6FA8', accent2: '#5B8DEF', bg: '#04101A', fx: 'ocean' },
    { key: 'lifeofpi', name: 'Жизнь Пи', re: /life of pi|жизнь пи/, accent: '#F2A65A', accent2: '#1F6FA8', bg: '#04101A', fx: 'maelstrom' },
    { key: 'casablanca', name: 'Касабланка', re: /^casablanca$|^касабланка$/, accent: '#C9A227', accent2: '#2B2B2B', bg: '#0A0806', fx: 'smoke' },
    { key: 'singinintherain', name: 'Поющие под дождём', re: /singin in the rain|поющие под дождем|поющие под дождём/, accent: '#5B8DEF', accent2: '#F2C21B', bg: '#0A0810', fx: 'vinyl' },
    { key: 'spaceodyssey', name: 'Космическая одиссея', re: /space odyssey|космическая одиссея/, accent: '#C9CDD2', accent2: '#5BC0EB', bg: '#04060C', fx: 'astro' },
    { key: 'xmen', name: 'Люди Икс', re: /x men|люди икс/, accent: '#F0A202', accent2: '#2B2B2B', bg: '#06060A', fx: 'sparks' },
    { key: 'wolverine', name: 'Росомаха', re: /^wolverine|росомаха/, accent: '#F0A202', accent2: '#2B2B2B', bg: '#07070A', fx: 'claws' },
    { key: 'hulk', name: 'Халк', re: /^the hulk$|^hulk$|халк/, accent: '#3FA34D', accent2: '#8C1C2B', bg: '#0A0806', fx: 'inferno' },
    { key: 'forestgump', name: 'Форрест Гамп', re: /forrest gump|форрест гамп/, accent: '#5B8DEF', accent2: '#F2E9D8', bg: '#0A0C14', fx: 'feathers' },
    { key: 'castaway', name: 'Изгой', re: /^cast away$|^изгой$/, accent: '#1F6FA8', accent2: '#E0762B', bg: '#04101A', fx: 'ocean' },
    { key: 'lifeisbeautiful', name: 'Жизнь прекрасна', re: /life is beautiful|жизнь прекрасна/, accent: '#C9CDD2', accent2: '#8C1C2B', bg: '#08080A', fx: 'ash' },
    { key: 'amelie', name: 'Амели', re: /^amelie$|^амели$/, accent: '#E86F8C', accent2: '#3FA34D', bg: '#0A0810', fx: 'hearts' },
    { key: 'fivehundreddays', name: '500 дней лета', re: /500 days of summer|500 дней лета/, accent: '#F2C21B', accent2: '#E86F8C', bg: '#0A0810', fx: 'confetti' },
    { key: 'greatgatsby', name: 'Великий Гэтсби', re: /great gatsby|великий гэтсби/, accent: '#C9A227', accent2: '#2B2B2B', bg: '#0A0810', fx: 'confetti' },
    { key: 'moodforlove', name: 'Любовное настроение', re: /in the mood for love|любовное настроение/, accent: '#8C1C2B', accent2: '#C9A227', bg: '#0A0806', fx: 'smoke' },
    { key: 'crouchingtiger', name: 'Крадущийся тигр', re: /crouching tiger|крадущийся тигр/, accent: '#3FA34D', accent2: '#C9A227', bg: '#070C07', fx: 'leaves' },
    { key: 'everythingeverywhere', name: 'Всё везде и сразу', re: /everything everywhere all at once|всё везде и сразу|все везде и сразу/, accent: '#8B5CF6', accent2: '#F2C21B', bg: '#0A080C', fx: 'quantum' },
    { key: 'littleprince', name: 'Маленький принц', re: /little prince|маленький принц/, accent: '#F2A65A', accent2: '#5BC0EB', bg: '#04060C', fx: 'astro' },
    { key: 'peterpan', name: 'Питер Пэн', re: /peter pan|питер пэн/, accent: '#3FA34D', accent2: '#C9A7E8', bg: '#04101A', fx: 'sparks' }
];
const CINEMA_MODES = {interstellar:'gargantua',inception:'dreamcity',breakingbad:'chemistry',starwars:'hyperspace',dune:'desertcinema',ghibli:'forestspirits',rickmorty:'portalpair'};
FILM_THEMES.forEach(f=>{if(CINEMA_MODES[f.key])f.fx=CINEMA_MODES[f.key];});
THEMES.breakingbad.fx='chemistry';THEMES.inception.fx='dreamcity';THEMES.rickmorty.fx='portalpair';
THEMES.starwars.fx='hyperspace';THEMES.noir.fx='detective';THEMES.dune.fx='desertcinema';

const FilmTheme = {
    key: null,
    _cache: {}, _n: 0,
    enabled: () => !!pGet('filmtheme', false),
    byKey: (k) => { for (let i = 0; i < FILM_THEMES.length; i++) if (FILM_THEMES[i].key === k) return FILM_THEMES[i]; return null; },
    pinned: () => FilmTheme.byKey(pGet('film_pin', '')),
    // сопоставление кэшируется: 170 регулярок на каждую перелистнутую карточку ни к чему.
    // Чистка кэша идёт пачками — Object.keys() по 400+ записям на каждый промах был бы лишним.
    match: (m) => {
        if (!m || !m.id) return null;
        const ck = m.media_type + '_' + m.id;
        if (Object.prototype.hasOwnProperty.call(FilmTheme._cache, ck)) return FilmTheme._cache[ck];
        const titles = uniq([m.title,m.name,m.original_title,m.original_name].filter(Boolean).map(norm));
        let found = null;
        for (let i = 0; i < FILM_THEMES.length; i++) { if (titles.some(t=>FILM_THEMES[i].re.test(t))) { found = FILM_THEMES[i]; break; } }
        FilmTheme._cache[ck] = found;
        if (++FilmTheme._n > 450) {
            const keys = Object.keys(FilmTheme._cache);
            for (let i = 0; i < keys.length - 350; i++) delete FilmTheme._cache[keys[i]];
            FilmTheme._n = 350;
        }
        return found;
    },
    line: m => {
        const f=FilmTheme.pinned() || (FilmTheme.enabled()?FilmTheme.match(m):null);
        const key=f?f.key:Themes.current(),lines=FILM_LINES[key] || (f?[f.name]:THEMES[key].quotes);
        return lines && lines.length ? lines[Math.abs(Number(m && m.id) || 0)%lines.length] : '';
    },
    // если акцентов несколько (черепашки) — перебираем их по кругу
    accentOf: (f) => {
        if (!isArr(f.accent)) return f.accent;
        f._i = ((f._i | 0) + 1) % f.accent.length;
        return f.accent[f._i];
    },
    paintColors: (root, f) => {
        const accent = FilmTheme.accentOf(f);
        root.style.setProperty('--cm-accent', accent);
        root.style.setProperty('--cm-accent2', f.accent2);
        root.style.setProperty('--cm-accent-rgb', hexRgb(accent));
        root.style.setProperty('--cm-accent2-rgb', hexRgb(f.accent2));
        ThemeContrast.apply(root,accent);
    },
    clearClasses: (root) => { if (!root) return; FILM_THEMES.forEach(f => removeClass(root, 'cm-f-' + f.key)); removeClass(root, 'cm-film'); },
    apply: (m) => {
        const root = View.root;
        if (!root) return;
        if(View.ui)View.ui.quote.textContent=FilmTheme.line(m);
        const f = FilmTheme.pinned() || (FilmTheme.enabled() ? FilmTheme.match(m) : null);
        if (!f) return FilmTheme.reset();
        if (f.key === FilmTheme.key) {
            // та же франшиза: обновляем только цвет, сцену не трогаем
            // Preserve the accent and scene phase when redisplaying the same franchise.
            return;
        }
        FilmTheme.key = f.key;
        FilmTheme.clearClasses(root);
        addClass(root, 'cm-film');
        addClass(root, 'cm-f-' + f.key);
        FilmTheme.paintColors(root, f);
        if (f.bg) root.style.setProperty('--cm-bg', f.bg);
        const sl = root.querySelector('.cm-sysline');
        if (sl) sl.textContent = String(f.name || '').toUpperCase();
        Fx.start(root, f.fx || 'none');
        Fx.ensureSize();
        Log.push('ТЕМА ПОД ФИЛЬМ: ' + f.name);
    },
    reset: (force) => {
        if (!FilmTheme.key && !force) return;
        FilmTheme.key = null;
        const root = View.root;
        if (!root) return;
        FilmTheme.clearClasses(root);
        Themes.apply(Themes.current(), root);
        Fx.ensureSize();
    }
};

// ═══════════════════════════════════════════ CSS
const CSS = `
.cm-root{position:fixed;top:0;right:0;bottom:0;left:0;z-index:999998;overflow:hidden;color:var(--cm-text);background:var(--cm-bg);
font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",sans-serif;
-webkit-tap-highlight-color:transparent;user-select:none;-webkit-user-select:none;
font-size:14px;font-size:clamp(13px,1.5vw,16px);isolation:isolate;
transition:background-color .5s ease,color .5s ease}
.cm-root *{box-sizing:border-box}
.cm-root .cm-act,.cm-root .cm-opt,.cm-root .cm-chip,.cm-root .cm-onb-card,.cm-root .cm-bar-btn,.cm-root .cm-poster{touch-action:manipulation}
.cm-mono{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
.cm-sysline{position:absolute;top:1.1em;left:1.5em;z-index:8;font-family:ui-monospace,Menlo,Consolas,monospace;
font-size:.56em;letter-spacing:.16em;color:var(--cm-accent2);opacity:.22;pointer-events:none}
.cm-rain{position:absolute;top:0;right:0;bottom:0;left:0;width:100%;height:100%;opacity:.34;pointer-events:none;z-index:0}
.cm-stars{display:none;position:absolute;top:-12%;right:-12%;bottom:-12%;left:-12%;opacity:.26;z-index:0;pointer-events:none;
background-image:radial-gradient(1px 1px at 12% 22%,#fff,transparent),radial-gradient(1px 1px at 68% 14%,#cfe6ff,transparent),radial-gradient(1.4px 1.4px at 84% 62%,#fff,transparent),radial-gradient(1px 1px at 32% 78%,#9fd4ff,transparent);
animation:cm-drift 70s linear infinite}
.cm-t-astro .cm-stars,.cm-t-sw .cm-stars{display:block}
@keyframes cm-drift{0%{transform:translate3d(0,0,0) scale(1)}50%{transform:translate3d(-1.2%,-1.5%,0) scale(1.015)}100%{transform:translate3d(-2.5%,-3%,0) scale(1.03)}}
.cm-root:before{content:"";position:absolute;top:-20%;right:-20%;bottom:-20%;left:-20%;z-index:0;pointer-events:none;
background:radial-gradient(35% 30% at 20% 25%,rgba(var(--cm-accent-rgb),.16),transparent 70%),radial-gradient(40% 35% at 82% 72%,rgba(var(--cm-accent2-rgb),.14),transparent 72%);
filter:blur(34px);opacity:.5;animation:cm-ambient 26s ease-in-out infinite alternate}
@keyframes cm-ambient{from{transform:scale(1) rotate(0deg);opacity:.36}to{transform:scale(1.06) rotate(1.5deg);opacity:.6}}
.cm-t-astro:after,.cm-t-bb:after,.cm-t-matrix:after,.cm-t-panda:after,.cm-t-rm:after,.cm-t-sw:after,.cm-t-noir:after,.cm-t-inception:after,.cm-t-dune:after,.cm-t-blade:after,.cm-t-dream:after{content:"";position:absolute;top:0;right:0;bottom:0;left:0;z-index:1;pointer-events:none}
.cm-t-astro:after{background:radial-gradient(45% 55% at 18% 65%,rgba(255,122,47,.10),transparent 70%),radial-gradient(38% 48% at 82% 25%,rgba(127,216,255,.12),transparent 70%);animation:cm-space 22s ease-in-out infinite alternate}
@keyframes cm-space{from{transform:scale(1) rotate(-.6deg)}to{transform:scale(1.05) rotate(.6deg)}}
.cm-t-bb:after{background:radial-gradient(28% 40% at 15% 85%,rgba(214,226,74,.10),transparent 70%),radial-gradient(35% 35% at 85% 20%,rgba(31,174,150,.09),transparent 70%);animation:cm-lab 20s ease-in-out infinite alternate}
@keyframes cm-lab{from{transform:translateX(-1.5%) scale(1)}to{transform:translateX(1.5%) scale(1.04)}}
.cm-t-matrix:after{background:linear-gradient(rgba(0,255,65,.028) 1px,transparent 1px),linear-gradient(90deg,rgba(0,255,65,.028) 1px,transparent 1px);background-size:36px 36px,36px 36px;animation:cm-matrix-grid 26s linear infinite}
@keyframes cm-matrix-grid{to{background-position:0 36px,36px 0}}
.cm-t-panda:after{background:radial-gradient(circle at 18% 20%,rgba(231,182,92,.10),transparent 24%),radial-gradient(circle at 82% 72%,rgba(216,67,60,.08),transparent 26%),repeating-linear-gradient(0deg,rgba(244,233,210,.014) 0 2px,transparent 2px 6px);animation:cm-scroll 24s ease-in-out infinite alternate}
@keyframes cm-scroll{from{transform:translateY(-.8%) scale(1)}to{transform:translateY(1%) scale(1.025)}}
.cm-t-rm:after{background:radial-gradient(circle at 50% 50%,transparent 0 14%,rgba(58,209,255,.055) 24%,transparent 45%);animation:cm-portal 26s linear infinite}
@keyframes cm-portal{to{transform:rotate(360deg) scale(1.06)}}
.cm-t-sw:after{background:radial-gradient(ellipse at center,transparent 0 26%,rgba(75,213,255,.05) 54%,transparent 74%);animation:cm-hyper 20s ease-in-out infinite}
@keyframes cm-hyper{0%,100%{transform:scale(.99)}50%{transform:scale(1.07)}}
.cm-t-noir:after{background:repeating-linear-gradient(90deg,transparent 0 5px,rgba(255,255,255,.012) 6px 7px),radial-gradient(80% 60% at 50% 40%,transparent 40%,rgba(0,0,0,.8) 100%);animation:cm-film 14s linear infinite}
@keyframes cm-film{from{background-position:0 0,0 0}to{background-position:55px 0,0 0}}
.cm-t-inception:after{background:radial-gradient(ellipse at 50% 52%,transparent 0 20%,rgba(233,180,135,.055) 32%,transparent 52%),radial-gradient(60% 50% at 50% 100%,rgba(201,138,94,.06),transparent 70%);animation:cm-dream-depth 30s ease-in-out infinite alternate}
@keyframes cm-dream-depth{from{transform:scale(1) translateY(.8%)}to{transform:scale(1.08) translateY(-.8%)}}
.cm-t-dune:after{background:radial-gradient(65% 35% at 20% 75%,rgba(231,180,106,.10),transparent 72%),radial-gradient(55% 30% at 78% 30%,rgba(142,199,177,.06),transparent 70%);animation:cm-sand 32s ease-in-out infinite alternate}
@keyframes cm-sand{from{transform:translateX(-1.5%) scale(1.02)}to{transform:translateX(1.5%) scale(1.06)}}
.cm-t-blade:after{background:linear-gradient(115deg,transparent 28%,rgba(242,182,255,.045) 48%,transparent 66%);animation:cm-rain-city 18s linear infinite}
@keyframes cm-rain-city{from{background-position:0 0}to{background-position:120px 200px}}
.cm-t-dream:after{background:radial-gradient(40% 35% at 20% 25%,rgba(185,199,255,.07),transparent 70%),radial-gradient(45% 40% at 80% 70%,rgba(169,231,213,.055),transparent 72%);filter:blur(8px);animation:cm-evening 30s ease-in-out infinite alternate}
@keyframes cm-evening{from{transform:translate3d(-1%,-1%,0) scale(1)}to{transform:translate3d(2%,2%,0) scale(1.06)}}
.cm-glow{position:absolute;top:-25%;left:-25%;width:150%;height:150%;z-index:0;background-size:cover;background-position:center;
opacity:0;filter:blur(64px) saturate(150%);transform:scale(1.08);
transition:opacity .8s ease,transform 1.2s ease}
.cm-glow.on{opacity:.2;transform:scale(1.12)}
.cm-shade{position:absolute;top:0;right:0;bottom:0;left:0;z-index:2;pointer-events:none;
background:linear-gradient(180deg,rgba(0,0,0,.08),transparent 32%,transparent 68%,rgba(0,0,0,.48)),radial-gradient(90% 80% at 50% 45%,rgba(0,0,0,.06),rgba(0,0,0,.6) 88%,var(--cm-bg) 100%)}
.cm-stage{position:absolute;top:0;right:0;bottom:0;left:0;z-index:3;display:flex;flex-direction:column;align-items:center;justify-content:center;
gap:.7em;padding:3.4em 1.1em 1.25em;padding-top:calc(3.4em + var(--cm-stage-offset,0em));
overflow-y:auto;-webkit-overflow-scrolling:touch;scrollbar-width:none}
.cm-stage::-webkit-scrollbar{width:0;height:0}
.cm-port{position:relative;display:flex;gap:1.35em;width:100%;max-width:64em;padding:1em;border-radius:calc(var(--cm-radius) * 1.15);
background:rgba(255,255,255,.045);border:1px solid rgba(255,255,255,.075);
box-shadow:0 1.4em 3.5em rgba(0,0,0,.3),inset 0 1px 0 rgba(255,255,255,.055);
-webkit-backdrop-filter:blur(22px) saturate(112%);backdrop-filter:blur(22px) saturate(112%)}
.cm-port.anim{animation:cm-in-up .42s cubic-bezier(.22,.7,.25,1) both}
.cm-port.anim.dir-next{animation-name:cm-in-right}
.cm-port.anim.dir-prev{animation-name:cm-in-left}
@keyframes cm-in-up{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
@keyframes cm-in-right{from{opacity:0;transform:translateX(2.2%)}to{opacity:1;transform:none}}
@keyframes cm-in-left{from{opacity:0;transform:translateX(-2.2%)}to{opacity:1;transform:none}}
.cm-poster{position:relative;flex:none;width:13.5em;height:20.25em;border-radius:calc(var(--cm-radius) * .7);
overflow:hidden;background:#0B0F18;cursor:pointer;
box-shadow:0 1em 2.4em rgba(0,0,0,.44),0 0 0 1px rgba(255,255,255,.09);
transition:transform .26s cubic-bezier(.22,.7,.25,1),box-shadow .26s ease}
@supports (aspect-ratio:2/3){.cm-poster{height:auto;aspect-ratio:2/3}}
.cm-poster:after{content:"";position:absolute;top:0;right:0;bottom:0;left:0;pointer-events:none;
background:linear-gradient(135deg,rgba(255,255,255,.13),transparent 30%,transparent 70%,rgba(0,0,0,.32))}
.cm-poster img{width:100%;height:100%;object-fit:cover;opacity:0;transition:opacity .45s ease,transform .6s ease}
.cm-poster img.ready{opacity:1}
.cm-poster .cm-noimg{position:absolute;top:50%;left:0;right:0;transform:translateY(-50%);text-align:center;
font-size:.68em;letter-spacing:.14em;color:var(--cm-sub);opacity:0;transition:opacity .3s ease;pointer-events:none}
.cm-poster.empty .cm-noimg{opacity:.55}
.cm-poster.cm-focus{transform:scale(1.02);box-shadow:0 1.2em 2.8em rgba(0,0,0,.5),0 0 0 .14em var(--cm-accent)}
.cm-t-noir .cm-poster img{filter:grayscale(1) contrast(1.1)}
.cm-rate{position:absolute;top:.6em;right:.6em;z-index:2;padding:.32em .62em;border-radius:.6em;
background:rgba(0,0,0,.62);color:var(--cm-accent);font-weight:800;font-size:.76em;
border:1px solid rgba(var(--cm-accent-rgb),.55)}
.cm-hero{flex:1;min-width:0;display:flex;flex-direction:column;padding:.1em}
.cm-meta{display:flex;flex-wrap:wrap;gap:.35em;margin-bottom:.72em}
.cm-mchip{display:inline-flex;align-items:center;white-space:nowrap;padding:.34em .62em;border-radius:.6em;
font-size:.65em;letter-spacing:.05em;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.075);color:var(--cm-text);opacity:.78}
.cm-mchip.src{color:var(--cm-accent);border-color:rgba(var(--cm-accent-rgb),.5);background:rgba(var(--cm-accent-rgb),.07);opacity:.95}
.cm-mchip.type{color:var(--cm-accent2);border-color:rgba(var(--cm-accent2-rgb),.45)}
.cm-name{font-size:1.6rem;font-size:clamp(1.5rem,3vw,2.25rem);font-weight:800;line-height:1.08;letter-spacing:-.035em;
margin-bottom:.45em;overflow-wrap:anywhere;text-shadow:0 .08em .8em rgba(0,0,0,.28)}
.cm-ref{display:inline-flex;align-items:center;align-self:flex-start;max-width:100%;margin:-.05em 0 .55em;padding:.25em .55em;
border-left:1px solid var(--cm-accent);border-radius:.3em;background:rgba(255,255,255,.03);color:var(--cm-accent2);
font-size:.6em;letter-spacing:.08em;opacity:.68;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
animation:cm-ref-pulse 9s ease-in-out infinite}
.cm-ref:empty{display:none}
@keyframes cm-ref-pulse{0%,100%{opacity:.5}50%{opacity:.78}}
.cm-genres{display:flex;flex-wrap:wrap;gap:.35em;margin-bottom:.55em}
.cm-gchip{padding:.27em .62em;border-radius:1.2em;font-size:.64em;opacity:.82;color:var(--cm-accent);
background:rgba(255,255,255,.025);border:1px solid rgba(var(--cm-accent-rgb),.32)}
.cm-why{position:relative;margin-bottom:.55em;padding:.48em .65em .48em .85em;font-size:.76em;line-height:1.4;opacity:.8;
color:var(--cm-text);background:rgba(255,255,255,.025);border:1px solid rgba(255,255,255,.05);border-radius:.6em}
.cm-why:before{content:"";position:absolute;left:0;top:.5em;bottom:.5em;width:.14em;border-radius:.2em;background:var(--cm-accent)}
.cm-over{font-size:.8em;line-height:1.55;margin-bottom:.7em;max-width:48em;color:var(--cm-sub);
display:-webkit-box;-webkit-line-clamp:4;-webkit-box-orient:vertical;overflow:hidden}
.cm-acts{margin-top:auto;display:flex;gap:.45em;flex-wrap:wrap}
.cm-act{display:flex;align-items:center;justify-content:center;gap:.5em;min-height:2.7em;padding:.72em 1em;
white-space:nowrap;cursor:pointer;border-radius:calc(var(--cm-radius) * .58);
background:rgba(255,255,255,.065);color:var(--cm-text);border:1px solid rgba(255,255,255,.075);
font-size:.82em;font-weight:700;
transition:transform .2s cubic-bezier(.22,.7,.25,1),box-shadow .2s ease,background-color .2s ease,border-color .2s ease}
.cm-act svg{width:1.05em;height:1.05em;fill:currentColor;flex:none}
.cm-act:active{transform:scale(.98)}
.cm-act.primary{flex:1;background:var(--cm-accent);color:#0A0A0A;border-color:transparent;box-shadow:0 .4em 1.1em rgba(var(--cm-accent-rgb),.18)}
.cm-act.secondary{flex:1;background:rgba(255,255,255,.08)}
.cm-act.cm-focus{transform:translateY(-2px);box-shadow:0 .7em 1.6em rgba(0,0,0,.32),0 0 0 .14em var(--cm-accent),0 2px 0 0 var(--cm-accent)}
.cm-bar{width:100%;max-width:64em;display:flex;align-items:center;justify-content:space-between;gap:.5em;
padding:.48em .62em;border-radius:calc(var(--cm-radius) * 1.05);
background:rgba(8,10,16,.4);border:1px solid rgba(255,255,255,.065);
box-shadow:0 .7em 1.8em rgba(0,0,0,.18),inset 0 1px 0 rgba(255,255,255,.05);
-webkit-backdrop-filter:blur(16px);backdrop-filter:blur(16px)}
.cm-bar-btn{display:flex;align-items:center;justify-content:center;gap:.5em;min-height:2.35em;padding:.6em .8em;
cursor:pointer;opacity:.76;font-size:.76em;color:var(--cm-text);background:transparent;
border:1px solid transparent;border-radius:.7em;
transition:transform .16s ease,background-color .16s ease,border-color .16s ease,box-shadow .16s ease}
.cm-bar-btn svg{width:1.15em;height:1.15em;fill:currentColor;flex:none}
.cm-bar-btn.center{font-weight:800;font-size:.8em;letter-spacing:.05em;color:var(--cm-accent);opacity:.92}
.cm-bar-btn.cm-focus{opacity:1;color:var(--cm-accent);transform:translateY(-1px);
background:rgba(var(--cm-accent-rgb),.09);border-color:rgba(var(--cm-accent-rgb),.45);
box-shadow:0 .4em 1em rgba(var(--cm-accent-rgb),.25),0 2px 0 0 var(--cm-accent)}
.cm-load{position:absolute;top:0;right:0;bottom:0;left:0;z-index:5;display:flex;flex-direction:column;align-items:center;justify-content:center}
.cm-load-ring{width:4.4em;height:4.4em;border-radius:50%;position:relative;border:1px solid rgba(255,255,255,.1)}
.cm-load-ring:before{content:"";position:absolute;top:.35em;right:.35em;bottom:.35em;left:.35em;border-radius:50%;border:1px dashed rgba(var(--cm-accent2-rgb),.3);animation:cm-spin 5s linear infinite reverse}
.cm-load-ring:after{content:"";position:absolute;top:-.15em;right:-.15em;bottom:-.15em;left:-.15em;border-radius:50%;border:.15em solid transparent;border-top-color:var(--cm-accent);animation:cm-spin 1.15s cubic-bezier(.55,.15,.45,.85) infinite}
@keyframes cm-spin{to{transform:rotate(360deg)}}
.cm-load-txt{margin-top:1.15em;font-size:.66em;letter-spacing:.22em;color:var(--cm-sub);opacity:.8;text-align:center;padding:0 1em}
.cm-load-hint{margin-top:.7em;font-size:.6em;letter-spacing:.12em;color:var(--cm-sub);opacity:.45;text-align:center;padding:0 1em}
.cm-onb{position:absolute;top:0;right:0;bottom:0;left:0;z-index:3;display:flex;flex-direction:column;align-items:center;justify-content:flex-start;
padding:3.2em 1.2em 1.5em;overflow-y:auto;scrollbar-width:none}
.cm-onb::-webkit-scrollbar{width:0}
.cm-onb-inner{width:100%;max-width:58em;display:flex;flex-direction:column;align-items:center;margin:auto 0}
.cm-onb-head{font-size:.62em;letter-spacing:.24em;color:var(--cm-accent2);opacity:.62;margin-bottom:1em}
.cm-onb-title{font-size:1.4em;font-weight:800;margin-bottom:.4em;text-align:center;letter-spacing:-.02em}
.cm-onb-sub{color:var(--cm-sub);font-size:.85em;text-align:center;max-width:38em;margin-bottom:1.5em;line-height:1.5;opacity:.85}
.cm-onb-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:.8em;width:100%}
.cm-onb-card{position:relative;height:0;padding-bottom:150%;border-radius:.8em;overflow:hidden;background:#0B0F18;cursor:pointer;
border:1px solid rgba(255,255,255,.09);box-shadow:0 .8em 1.6em rgba(0,0,0,.22);
transition:transform .2s cubic-bezier(.22,.7,.25,1),box-shadow .2s ease}
@supports (aspect-ratio:2/3){.cm-onb-card{height:auto;padding-bottom:0;aspect-ratio:2/3}}
.cm-onb-card img{position:absolute;top:0;right:0;bottom:0;left:0;width:100%;height:100%;object-fit:cover;transition:transform .35s ease}
.cm-onb-card .t{position:absolute;left:0;right:0;bottom:0;padding:1.7em .6em .55em;font-size:.7em;
background:linear-gradient(transparent,rgba(0,0,0,.92));white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cm-onb-card.sel{transform:translateY(-2px);box-shadow:0 0 0 .16em var(--cm-accent),0 .8em 1.8em rgba(0,0,0,.3)}
.cm-onb-card.sel:after{content:"✓";position:absolute;top:.5em;right:.5em;width:1.6em;height:1.6em;border-radius:50%;
background:var(--cm-accent);color:#0A0A0A;font-weight:900;display:flex;align-items:center;justify-content:center}
.cm-onb-card.cm-focus{box-shadow:0 0 0 .17em var(--cm-accent2)}
.cm-onb-card.sel.cm-focus{box-shadow:0 0 0 .17em var(--cm-accent),0 0 0 .32em var(--cm-accent2)}
.cm-onb-chips{max-width:44em;margin:0 auto}
.cm-onb-foot{display:flex;gap:.6em;margin-top:1.5em;flex-wrap:wrap;justify-content:center}
.cm-onb-foot .cm-act{flex:0 1 auto;min-width:7.5em}
.cm-chips{display:grid;grid-template-columns:1fr 1fr;gap:.5em;margin-bottom:.9em;width:100%}
.cm-chip{display:flex;align-items:center;min-height:2.8em;padding:.58em .9em;border-radius:.75em;font-size:.84em;
text-align:left;cursor:pointer;background:rgba(255,255,255,.04);color:var(--cm-text);border:1px solid rgba(255,255,255,.09);
transition:transform .16s cubic-bezier(.22,.7,.25,1),background-color .16s ease,border-color .16s ease,box-shadow .16s ease}
.cm-chip.sel{border-color:var(--cm-accent);color:var(--cm-accent);background:rgba(var(--cm-accent-rgb),.08)}
.cm-chip.cm-focus{background:rgba(var(--cm-accent2-rgb),.22);color:var(--cm-text);border-color:var(--cm-accent2);transform:scale(1.02);box-shadow:0 .4em 1em rgba(var(--cm-accent2-rgb),.22)}
.cm-ov{position:fixed;top:0;right:0;bottom:0;left:0;z-index:999999;display:flex;align-items:center;justify-content:center;padding:1.2em;
background:rgba(0,0,0,.68);-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);animation:cm-fade .18s ease both}
@keyframes cm-fade{from{opacity:0}to{opacity:1}}
.cm-modal{width:40em;max-width:100%;max-height:88%;overflow-y:auto;padding:1.4em;border-radius:calc(var(--cm-radius,1em) * 1.15);
background:rgba(11,14,21,.92);border:1px solid rgba(255,255,255,.09);
box-shadow:0 1.5em 4em rgba(0,0,0,.45),inset 0 1px 0 rgba(255,255,255,.06);
scrollbar-width:none;animation:cm-modal-in .22s cubic-bezier(.22,.7,.25,1) both}
@keyframes cm-modal-in{from{opacity:0;transform:translateY(8px) scale(.99)}to{opacity:1;transform:none}}
.cm-modal::-webkit-scrollbar{width:0}
.cm-modal h3{margin:0 0 .5em;font-size:1.15em;font-weight:800;letter-spacing:-.01em}
.cm-modal p{margin:0 0 1em;color:var(--cm-sub,#8695AC);font-size:.88em;line-height:1.55}
.cm-modal p b{color:var(--cm-text,#fff)}
.cm-opt{display:flex;flex-direction:column;justify-content:center;width:100%;min-height:3.1em;padding:.7em 1em;margin-bottom:.42em;
text-align:left;font-size:.9em;cursor:pointer;border-radius:calc(var(--cm-radius,1em) * .55);
background:rgba(255,255,255,.035);color:var(--cm-text,#fff);border:1px solid rgba(255,255,255,.06);
transition:transform .16s ease,background-color .16s ease,border-color .16s ease,box-shadow .16s ease}
.cm-opt small{display:block;font-size:.72em;opacity:.65;margin-top:.15em}
.cm-opt.cm-focus{background:rgba(var(--cm-accent-rgb,255,255,255),.18);color:var(--cm-text,#fff);border-color:var(--cm-accent,#fff);transform:translateX(3px);box-shadow:0 .4em 1em rgba(var(--cm-accent-rgb,255,255,255),.2)}
.cm-opt.cm-focus small{opacity:.8}
.cm-input{width:100%;padding:.85em 1em;margin-bottom:.8em;font-size:1em;color:#fff;outline:none;
border-radius:calc(var(--cm-radius,1em) * .5);background:rgba(255,255,255,.055);border:1px solid rgba(255,255,255,.15)}
.cm-film .cm-sysline{opacity:.34}
.cm-offset{margin-bottom:1em}
.cm-offset-val{font-size:1.15em;font-weight:800;text-align:center;color:var(--cm-accent,#fff);letter-spacing:.04em}
.cm-offset-scale{position:relative;height:.3em;margin:.9em 0 .7em;border-radius:.3em;background:rgba(255,255,255,.09)}
.cm-offset-dot{position:absolute;top:50%;width:.9em;height:.9em;margin:-.45em 0 0 -.45em;border-radius:50%;
background:var(--cm-accent,#fff);box-shadow:0 0 0 .25em rgba(var(--cm-accent-rgb,255,255,255),.18);transition:left .12s ease}
.cm-offset-hint{font-size:.72em;text-align:center;color:var(--cm-sub,#8695AC);opacity:.75}
.cm-toast{position:fixed;left:50%;bottom:1.8em;z-index:1000001;transform:translateX(-50%) translateY(1em);opacity:0;
max-width:92%;padding:.75em 1.2em;text-align:center;font-size:.86em;border-radius:.8em;
background:rgba(10,12,18,.92);color:#fff;border:1px solid rgba(255,255,255,.1);
box-shadow:0 .8em 2em rgba(0,0,0,.35);transition:opacity .24s ease,transform .24s cubic-bezier(.22,.7,.25,1)}
.cm-toast.on{opacity:1;transform:translateX(-50%) translateY(0)}
.cm-t-matrix,.cm-t-matrix .cm-name{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
/* лёгкий режим: убираем дорогие эффекты (ТВ-приставки) */
.cm-lite .cm-port,.cm-lite .cm-bar{-webkit-backdrop-filter:none;backdrop-filter:none}
.cm-lite .cm-port{background:rgba(14,17,24,.92)}
.cm-lite .cm-bar{background:rgba(10,12,18,.88)}
.cm-lite .cm-port.anim{animation:none}
.cm-lite:before{display:none}
.cm-lite .cm-glow{filter:blur(32px) saturate(120%)}
.cm-lite .cm-stars{display:none !important}
.cm-lite:after{animation:none !important;display:none}
/* ── СОВМЕСТИМОСТЬ СО СТАРЫМИ ТВ-БРАУЗЕРАМИ ────────────────────── */
@supports not (row-gap: 1px){
.cm-port{display:block}
.cm-port .cm-poster{margin:0 auto 1em}
.cm-meta>*,.cm-genres>*{margin:0 .35em .35em 0}
.cm-acts>*{margin:0 .45em .45em 0}
.cm-bar>*{margin:0 .25em}
.cm-onb-foot>*{margin:0 .3em .3em 0}
.cm-stage>*{margin-bottom:.7em}
}
@supports not (display: grid){
.cm-chips{display:block;font-size:0}
.cm-chips>.cm-chip{display:inline-block;width:48%;margin:0 1% 4% 1%;font-size:.84rem;vertical-align:top}
.cm-onb-grid{display:block;font-size:0}
.cm-onb-grid>.cm-onb-card{display:inline-block;width:23%;margin:0 1% 2% 1%;vertical-align:top}
}
@supports not (aspect-ratio: 2/3){
.cm-poster{height:20.25em}
}
@media (hover:hover) and (pointer:fine){
.cm-act:hover{background:rgba(255,255,255,.11);border-color:rgba(var(--cm-accent-rgb),.5);box-shadow:0 .6em 1.4em rgba(0,0,0,.25);transform:translateY(-1px)}
.cm-act.primary:hover{filter:brightness(1.06);box-shadow:0 .6em 1.4em rgba(var(--cm-accent-rgb),.35)}
.cm-opt:hover{background:rgba(255,255,255,.09)}
.cm-chip:hover{background:rgba(255,255,255,.09);border-color:rgba(var(--cm-accent-rgb),.35)}
.cm-bar-btn:hover{background:rgba(255,255,255,.09);opacity:1;border-color:rgba(var(--cm-accent-rgb),.35)}
.cm-poster:hover img{transform:scale(1.03)}
.cm-onb-card:hover{transform:translateY(-3px);box-shadow:0 0 0 .1em var(--cm-accent2),0 1em 2em rgba(0,0,0,.32)}
}
@media (max-width:700px){
.cm-port{flex-direction:column;align-items:center;gap:1em}
.cm-poster{width:11em}
.cm-onb-grid{grid-template-columns:repeat(3,minmax(0,1fr))}
.cm-bar-btn .lbl{display:none}
.cm-bar-btn.center .lbl{display:inline}
}
@media (min-width:1200px){
.cm-port{max-width:75em;padding:1.8em 1.5em;gap:2em}
.cm-poster{width:16em;height:24em}
.cm-name{font-size:2rem;font-size:clamp(1.8rem,3.5vw,2.6rem)}
.cm-hero{padding:.3em}
.cm-acts{gap:.6em}
.cm-act{min-height:3em;padding:.85em 1.3em;font-size:.9em}
.cm-bar{max-width:75em;padding:.65em .85em}
.cm-bar-btn{min-height:2.65em;padding:.75em 1em;font-size:.85em}
.cm-over{font-size:.9em;max-width:55em;-webkit-line-clamp:5}
.cm-why{font-size:.85em;padding:.6em .8em .6em 1em}
}
@media (min-width:1600px){
.cm-root{font-size:17px}
.cm-port{max-width:85em;padding:2em;gap:2.5em}
.cm-poster{width:18em;height:27em}
.cm-name{font-size:2.3rem}
.cm-bar{max-width:85em}
}
@media (prefers-reduced-motion:reduce){
.cm-root *,.cm-root *:before,.cm-root *:after{animation:none !important;transition-duration:.01ms !important}
.cm-rain{display:none}
}
/* v21: controlled transitions, readable focus, quiet background scenery. */
.cm-root .cm-rain{z-index:1;opacity:.72}
.cm-root.cm-film .cm-rain{opacity:.85}
.cm-root .cm-scene-in{animation:cm-scene-in .65s ease both}
.cm-root .cm-scene-out{animation:cm-scene-out .65s ease both}
@keyframes cm-scene-in{from{opacity:0}to{opacity:.72}}
@keyframes cm-scene-out{from{opacity:.72}to{opacity:0}}
.cm-film:after{background:radial-gradient(ellipse at 16% 22%,rgba(var(--cm-accent-rgb),.08),transparent 48%),radial-gradient(ellipse at 88% 78%,rgba(var(--cm-accent2-rgb),.07),transparent 45%);animation:none}
.cm-film .cm-stars{display:none}
.cm-root .cm-port.anim{animation-duration:.34s;animation-timing-function:cubic-bezier(.2,.75,.25,1)}
@keyframes cm-in-right{from{opacity:.55;transform:translate3d(18px,0,0)}to{opacity:1;transform:translate3d(0,0,0)}}
@keyframes cm-in-left{from{opacity:.55;transform:translate3d(-18px,0,0)}to{opacity:1;transform:translate3d(0,0,0)}}
.cm-root .cm-ref{animation:none;opacity:.72;white-space:normal;line-height:1.4}
.cm-root .cm-act.primary{color:var(--cm-primary-text,#F4F4F2)}
.cm-root .cm-act.primary:hover{background:var(--cm-accent);color:var(--cm-primary-text,#F4F4F2)}
.cm-root .cm-feedback{flex:0 0 auto;color:var(--cm-accent2);background:rgba(var(--cm-accent2-rgb),.08);border-color:rgba(var(--cm-accent2-rgb),.18)}
.cm-root .cm-act:not(.primary):hover,.cm-root .cm-act:not(.primary).cm-focus,.cm-ov .cm-opt:hover,.cm-ov .cm-opt.cm-focus{color:#D6D7DC}
.cm-ov{color:var(--cm-text,#ECEFF4);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;font-size:16px}
.cm-ov .cm-opt.cm-focus{outline:1px solid var(--cm-accent2,#9BBDE4);outline-offset:1px}
.cm-root.cm-paused *,.cm-root.cm-paused:before,.cm-root.cm-paused:after,.cm-root.cm-paused *:before,.cm-root.cm-paused *:after{animation-play-state:paused!important}
.cm-root.cm-static:before,.cm-root.cm-static:after,.cm-root.cm-static .cm-stars{animation:none!important}
.cm-root.cm-static .cm-stars{display:none}
.cm-lite .cm-rain{opacity:.62}
@media(max-width:700px){
    .cm-stage{justify-content:flex-start;padding-top:calc(2.4em + var(--cm-stage-offset,0em))}
    .cm-port{margin-top:auto}.cm-bar{margin-bottom:auto;flex-shrink:0}
    .cm-hero{width:100%}.cm-poster{width:9em;height:13.5em;aspect-ratio:2/3}
    .cm-acts .cm-feedback{flex-basis:100%;min-height:2.8em}
    .cm-over{-webkit-line-clamp:3}
}
@media(prefers-reduced-motion:reduce){
    .cm-root:before,.cm-root:after,.cm-ov,.cm-ov *{animation:none!important;transition:none!important}
}
`;
const injectCSS = () => { if (document.getElementById('cm_css')) return; const s = el('style'); s.id = 'cm_css'; s.textContent = CSS; document.head.appendChild(s); };

// ═══════════════════════════════════════════ ИКОНКИ
const I_PLAY = '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>';
const I_SEARCH = '<svg viewBox="0 0 24 24"><path d="M15.5 14h-.79l-.28-.27a6.5 6.5 0 1 0-.7.7l.27.28v.79l5 4.99L20.49 19zm-6 0A4.5 4.5 0 1 1 14 9.5 4.5 4.5 0 0 1 9.5 14z"/></svg>';
const I_INFO = '<svg viewBox="0 0 24 24"><path d="M11 7h2v2h-2zm0 4h2v6h-2zm1-9a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 18a8 8 0 1 1 0-16 8 8 0 0 1 0 16z"/></svg>';
const I_GEAR = '<svg viewBox="0 0 24 24"><path d="M19.14 12.94a7.07 7.07 0 0 0 .06-.94 7.07 7.07 0 0 0-.06-.94l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.61-.22l-2.39.96a7.3 7.3 0 0 0-1.62-.94l-.36-2.54a.5.5 0 0 0-.5-.42h-3.84a.5.5 0 0 0-.5.42l-.36 2.54c-.59.24-1.13.56-1.62.94l-2.39-.96a.5.5 0 0 0-.61.22L2.65 8.84a.5.5 0 0 0 .12.64l2.03 1.58a7.07 7.07 0 0 0 0 1.88l-2.03 1.58a.5.5 0 0 0-.12.64l1.92 3.32c.14.24.42.34.61.22l2.39-.96c.49.38 1.03.7 1.62.94l.36 2.54c.04.24.25.42.5.42h3.84c.25 0 .46-.18.5-.42l.36-2.54a7.3 7.3 0 0 0 1.62-.94l2.39.96c.24.1.5 0 .61-.22l1.92-3.32a.5.5 0 0 0-.12-.64zM12 15.5A3.5 3.5 0 1 1 15.5 12 3.5 3.5 0 0 1 12 15.5z"/></svg>';
const I_CHANGE = '<svg viewBox="0 0 24 24"><path d="M3 17v2h6v-2H3zM3 5v2h10V5H3zm10 16v-2h8v-2h-8v-2h-2v6h2zM7 9v2H3v2h4v2h2V9H7zm14 4v-2H11v2h10zm-6-4h2V7h4V5h-4V3h-2v6z"/></svg>';
const I_CAPSULE = '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M17 2a5 5 0 0 1 3.5 8.5l-10 10A5 5 0 0 1 3.5 13.5l10-10A5 5 0 0 1 17 2zm-2 3.9-9.1 9.2a3 3 0 0 0 4.2 4.2L19.2 10a3 3 0 0 0-4.2-4.2z"/></svg>';

// ═══════════════════════════════════════════ НАВИГАЦИЯ
const Nav = {
    rows: [], r: 0, c: 0, _last: null,
    reset: () => { Nav.rows = []; Nav.r = 0; Nav.c = 0; Nav._last = null; },
    addRow: (items, type, cols) => {
        const clean = (items || []).filter(Boolean);
        if (!clean.length) return null;
        Nav.rows.push({ items: clean, memo: 0, type: type || 'row', cols: cols || 0 });
        const idx = Nav.rows.length - 1;
        clean.forEach((item, j) => bindPointer(item, idx, j));
        return idx;
    },
    setFocus: (r, c, silent) => {
        if (!Nav.rows.length) return;
        Nav.r = clamp(r, 0, Nav.rows.length - 1);
        const row = Nav.rows[Nav.r];
        Nav.c = clamp(c, 0, row.items.length - 1);
        row.memo = Nav.c;
        Nav.paint(silent);
    },
    current: () => { const row = Nav.rows[Nav.r]; return (row && row.items[Nav.c]) || null; },
    paint: (silent) => {
        const cur = Nav.current();
        // снимаем подсветку с известного узла; полный обход — только если его нет
        if (Nav._last) { if (Nav._last !== cur) removeClass(Nav._last, 'cm-focus'); }
        else if (View.root) { const old = View.root.querySelectorAll('.cm-focus'); for (let i = 0; i < old.length; i++) removeClass(old[i], 'cm-focus'); }
        Nav._last = cur;
        if (!cur) return;
        addClass(cur, 'cm-focus');
        if (!silent && cur.scrollIntoView) { try { cur.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } catch (e) {} }
    },
    move: (dir) => {
        if (!Nav.rows.length) return;
        const row = Nav.rows[Nav.r];
        if (row && row.cols > 1) {
            const target = Nav.c + (dir === 'down' ? row.cols : -row.cols);
            if (target >= 0 && target < row.items.length) { Nav.setFocus(Nav.r, target); return; }
        }
        if (dir === 'up' && Nav.r > 0) Nav.setFocus(Nav.r - 1, Nav.rows[Nav.r - 1].memo || 0);
        else if (dir === 'down' && Nav.r < Nav.rows.length - 1) Nav.setFocus(Nav.r + 1, Nav.rows[Nav.r + 1].memo || 0);
    },
    moveH: (dir) => {
        const row = Nav.rows[Nav.r];
        if (!row) return false;
        const c = Nav.c + (dir === 'right' ? 1 : -1);
        if (c < 0 || c >= row.items.length) return false;
        Nav.setFocus(Nav.r, c);
        return true;
    },
    enter: () => { const cur = Nav.current(); if (cur && cur._cmAction) cur._cmAction(cur); }
};
let touchMode = false;
const onTouchProbe = () => { touchMode = true; };
document.addEventListener('touchstart', onTouchProbe, true);
const bindPointer = (node, r, c) => {
    node.setAttribute('data-cm-r', r);
    node.setAttribute('data-cm-c', c);
    node.onmouseenter = () => { if (!touchMode && App.active && !Modal.active()) Nav.setFocus(r, c, true); };
};
const trigger = (node) => { if (node && node._cmAction) node._cmAction(node); };
const onDocClick = (e) => {
    if (!App.active || Date.now() < swipe.suppressUntil) return;
    const modalBox = Modal.active() ? Modal.st.ov : null;
    let n = e.target;
    while (n && n !== document) {
        if (modalBox && n === modalBox) break;
        if (n._cmAction) {
            if (modalBox && !modalBox.contains(n)) return; // клик «сквозь» модалку запрещён
            const r = parseInt(n.getAttribute('data-cm-r'), 10);
            const c = parseInt(n.getAttribute('data-cm-c'), 10);
            if (!modalBox && !isNaN(r) && !isNaN(c)) Nav.setFocus(r, c, true);
            trigger(n);
            return;
        }
        n = n.parentNode;
    }
};
document.addEventListener('click', onDocClick, false);
const swipe = { x: 0, y: 0, t: 0, on: false, suppressUntil: 0 };
const onTouchStart = (e) => { if (!App.active || Modal.active() || Onboard.active || !View.root || !View.root.contains(e.target) || e.touches.length!==1) return; swipe.x = e.touches[0].clientX; swipe.y = e.touches[0].clientY; swipe.t = Date.now(); swipe.on = true; };
const onTouchEnd = (e) => {
    if (!swipe.on || !App.active || Modal.active() || Onboard.active) return;
    swipe.on = false;
    const t = e.changedTouches[0];
    const dx = t.clientX - swipe.x, dy = t.clientY - swipe.y;
    const vx = Math.abs(dx) / Math.max(Date.now() - swipe.t, 1);
    if ((Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) || (vx > 0.5 && Math.abs(dx) > 28 && Math.abs(dx)>Math.abs(dy)*1.5)) { swipe.suppressUntil=Date.now()+450; vibrate(12); View.step(dx > 0 ? -1 : 1); }
};
document.addEventListener('touchstart', onTouchStart, { passive: true });
document.addEventListener('touchend', onTouchEnd, { passive: true });
document.addEventListener('touchcancel',()=>{swipe.on=false;},{passive:true});

// ═══════════════════════════════════════════ КОНТРОЛЬ ФОКУСА LAMPA
const NATIVE_UI_SEL = '.selectbox,.modal,.simple-keyboard,.keyboard,.settings-input,.search--input,.player';
const Ctrl = {
    timer: null, holdUntil: 0,
    hold: (ms) => { Ctrl.holdUntil = Date.now() + (ms || 2000); },
    free: () => { Ctrl.holdUntil = 0; },
    nativeOpen: () => { try { return !!document.querySelector(NATIVE_UI_SEL); } catch (e) { return false; } },
    take: () => {
        try {
            if (!(window.Lampa && window.Lampa.Controller && App.active)) return;
            Lampa.Controller.toggle(CTRL_ID);
            Nav.paint(true);
        } catch (e) {}
    },
    start: () => {
        Ctrl.stop();
        Ctrl.timer = setInterval(() => {
            if (!App.active || App.fallback) return;
            if (Date.now() < Ctrl.holdUntil) return;
            if (Modal.active() || Ctrl.nativeOpen()) return;
            try {
                const en = window.Lampa && Lampa.Controller && Lampa.Controller.enabled && Lampa.Controller.enabled();
                if (en && en.name === CTRL_ID) return;
            } catch (e) { return; }
            Ctrl.take();
        }, 1500);
    },
    stop: () => { if (Ctrl.timer) { clearInterval(Ctrl.timer); Ctrl.timer = null; } }
};
// возврат контроля после нативного UI Lampa
const reclaimControl = () => { setTimeout(() => { Ctrl.free(); Ctrl.take(); }, 150); };

// ═══════════════════════════════════════════ ТОСТ И МОДАЛКА
const Toast = {
    node: null, timer: null,
    show: (text) => {
        if (!Toast.node) { Toast.node = el('div', 'cm-toast'); document.body.appendChild(Toast.node); }
        Toast.node.textContent = text;
        addClass(Toast.node, 'on');
        clearTimeout(Toast.timer);
        Toast.timer = setTimeout(() => removeClass(Toast.node, 'on'), 2400);
    },
    kill: () => { clearTimeout(Toast.timer); if (Toast.node && Toast.node.parentNode) Toast.node.parentNode.removeChild(Toast.node); Toast.node = null; }
};
const notify = (t) => { if (!t) return; try { if (window.Lampa && window.Lampa.Noty && window.Lampa.Noty.show) { Lampa.Noty.show(t); return; } } catch (e) {} Toast.show(t); };
const CHIP_COLS = 2;
const Modal = {
    st: null,
    open: (opts) => {
        Modal.close(true);
        const ov = el('div', 'cm-ov');
        const box = el('div', 'cm-modal');
        const nodes = [];
        let gridLen = 0;
        if (opts.title) box.appendChild(el('h3', '', esc(opts.title)));
        if (opts.text) box.appendChild(el('p', '', opts.text));
        if (opts.customNode) box.appendChild(opts.customNode);
        if (opts.chips && opts.chips.length) {
            const wrap = el('div', 'cm-chips');
            opts.chips.forEach(ch => { const c = el('div', 'cm-chip', esc(ch.label)); c._cmAction = () => { Modal.close(true); if (ch.onSelect) ch.onSelect(); }; wrap.appendChild(c); nodes.push(c); });
            gridLen = opts.chips.length;
            box.appendChild(wrap);
        }
        if (opts.items) opts.items.forEach(it => {
            const b = el('div', 'cm-opt', esc(it.label) + (it.hint ? '<small>' + esc(it.hint) + '</small>' : ''));
            b._cmAction = () => {
                Modal.close(true);
                if (it.onSelect) it.onSelect();
                // действие не открыло новое окно — вернуть фокус капсуле
                if (!Modal.active()) { Nav.paint(true); reclaimControl(); }
            };
            box.appendChild(b); nodes.push(b);
        });
        ov.setAttribute('role','dialog'); ov.setAttribute('aria-modal','true');
        if (opts.title) ov.setAttribute('aria-label',opts.title);
        if (View.root) { ['--cm-accent','--cm-accent2','--cm-accent-rgb','--cm-accent2-rgb','--cm-text','--cm-sub','--cm-radius'].forEach(k=>ov.style.setProperty(k,View.root.style.getPropertyValue(k))); }
        ov.appendChild(box);
        document.body.appendChild(ov);
        ov.onclick = (e) => { if (e.target === ov) Modal.close(); };
        Modal.st = { ov, box, nodes, idx: 0, gridLen, tag: opts.tag || '', onKey: opts.onKey || null };
        nodes.forEach((n, i) => { n.onmouseenter = () => { if (!touchMode && Modal.st) { Modal.st.idx = i; Modal.paint(); } }; });
        Modal.paint();
        return Modal.st;
    },
    paint: () => {
        const st = Modal.st;
        if (!st) return;
        st.nodes.forEach(n => removeClass(n, 'cm-focus'));
        const cur = st.nodes[st.idx];
        if (cur) { addClass(cur, 'cm-focus'); if (cur.scrollIntoView) { try { cur.scrollIntoView({ block: 'nearest' }); } catch (e) {} } }
    },
    move: (dir) => {
        const st = Modal.st;
        if (!st || !st.nodes.length) return;
        const gridLen = st.gridLen || 0, last = st.nodes.length - 1, inGrid = st.idx < gridLen;
        let next = st.idx;
        if (inGrid) {
            if (dir === 'right') next = st.idx + 1 < gridLen ? st.idx + 1 : st.idx;
            else if (dir === 'left') next = st.idx - 1 >= 0 ? st.idx - 1 : st.idx;
            else if (dir === 'down') { const cand = st.idx + CHIP_COLS; next = cand < gridLen ? cand : Math.min(gridLen, last); }
            else if (dir === 'up') { const cand = st.idx - CHIP_COLS; next = cand >= 0 ? cand : st.idx; }
        } else {
            if (dir === 'down') next = clamp(st.idx + 1, 0, last);
            else if (dir === 'up') { const cand = st.idx - 1; next = cand >= gridLen ? cand : (gridLen > 0 ? gridLen - 1 : 0); }
        }
        st.idx = clamp(next, 0, last);
        Modal.paint();
    },
    enter: () => { if (Modal.st) trigger(Modal.st.nodes[Modal.st.idx]); },
    close: (silent) => {
        const st = Modal.st;
        Modal.st = null;
        if (!st) return;
        if (st.ov && st.ov.parentNode) st.ov.parentNode.removeChild(st.ov);
        if (!silent) { Nav.paint(true); reclaimControl(); }
    },
    active: () => !!Modal.st,
    tag: () => (Modal.st && Modal.st.tag) || ''
};
const askText = (title, value, cb) => {
    const fire = once((v) => { cb(v); });
    try {
        if (window.Lampa && window.Lampa.Input && window.Lampa.Input.edit) {
            Ctrl.hold(600000); // отпустим по колбэку; DOM-детектор клавиатуры страхует
            Lampa.Input.edit({ title, value: value || '', free: true }, (v) => {
                Ctrl.free();
                reclaimControl();
                if (v) fire(v);
            });
            return;
        }
    } catch (e) { Ctrl.free(); }
    const input = el('input', 'cm-input');
    input.type = 'text';
    input.value = value || '';
    Modal.open({ title, customNode: input, items: [{ label: 'Найти', onSelect: () => { if (input.value) fire(input.value); } }, { label: 'Отмена' }] });
    input.onkeydown = (e) => { e.stopPropagation(); if (e.keyCode === 13 && input.value) { const v = input.value; Modal.close(); fire(v); } };
    setTimeout(() => { try { input.focus(); } catch (e) {} }, 60);
};

// ═══════════════════════════════════════════ ЭКРАН
const View = {
    root: null, stage: null, glow: null, ui: null, mounted: false,
    list: [], prevIds: [], idx: 0, taste: null,
    stack: [], shown: {},
    sourceLabel: 'КАПСУЛА',
    activeQuery: { kind: 'taste', label: 'КАПСУЛА', query: '' },
    busy: false, token: 0, _busyT: null, _enrichT: null, _dir: 0, _imgToken: 0, _glowToken: 0, _detailsToken: 0, _pre: {},

    current: () => View.list[View.idx] || null,

    create: () => {
        injectCSS();
        View.root = el('div', 'cm-root');
        View.root.appendChild(el('div', 'cm-sysline cm-mono'));
        View.root.appendChild(el('div', 'cm-stars'));
        View.glow = el('div', 'cm-glow');
        View.root.appendChild(View.glow);
        View.root.appendChild(el('div', 'cm-shade'));
        View.stage = el('div');
        View.stage.style.cssText = 'position:absolute;top:0;right:0;bottom:0;left:0;z-index:3;';
        View.root.appendChild(View.stage);
        Themes.apply(Themes.current(), View.root);
        StageOffset.apply(View.root);
        View.loading(Themes.loadLine());
        View.boot(false);
        return View.root;
    },

    setBusy: (on) => {
        View.busy = on;
        clearTimeout(View._busyT);
        View._busyT = null;
        if (!on) return;
        View._busyT = setTimeout(() => {
            View.busy = false;
            View.token++;
            Net.abortPending();
            if (View.list.length) View.render(); else View.renderEmpty();
            notify(Net.failStreak > 3 ? 'TMDb не отвечает — проверьте сеть или задайте прокси в настройках' : 'Сеть не ответила — попробуйте ещё раз');
        }, 65000);
    },

    dropCard: () => { View.mounted = false; View.ui = null; clearTimeout(View._enrichT); View._enrichT = null; },

    loading: (text, hint) => {
        if (!View.stage) return;
        View.dropCard();
        View.stage.innerHTML = '';
        const box = el('div', 'cm-load');
        box.appendChild(el('div', 'cm-load-ring'));
        box.appendChild(el('div', 'cm-load-txt cm-mono', esc(text)));
        box.appendChild(el('div', 'cm-load-hint cm-mono', hint ? esc(hint) : 'НАЗАД — ОТМЕНА'));
        View.stage.appendChild(box);
        Nav.reset();
    },

    run: (opts) => {
        opts = opts || {};
        if (View.busy) { if (!opts.queue) return; View.cancel(true); }
        View.commitShown();
        const token = ++View.token;
        Net.abortPending();
        View.setBusy(true);
        View.loading(opts.loadText || Themes.loadLine(), opts.force ? 'ИЩУ ДРУГОЕ' : '');
        Taste.build((taste) => {
            if (token !== View.token) return;
            View.taste = taste;
            if (taste.empty && !Onboard.profile() && !Onboard.skipped()) { View.setBusy(false); Onboard.start(); return; }
            Log.push('ВКУС: жанров ' + ((taste.genres && taste.genres.length) || 0) + ', история ' + ((taste.stats && taste.stats.total) || 0));
            const attempt = (depth) => {
                Capsule.build(taste, { force: opts.force, depth }, (list) => {
                    if (token !== View.token) return;
                    Log.push('СБОРКА: попытка ' + depth + ' → карточек ' + list.length);
                    // A bounded build already paginates preferred sources; never restart the whole build here.
                    View.setBusy(false);
                    if (!list.length) { View.renderEmpty(); return; }
                    View.stack = []; // капсула — корень, отсюда «Назад» = выход
                    View.apply(list, 'КАПСУЛА', { kind: 'taste', label: 'КАПСУЛА', query: '' });
                    notify(opts.notifyText);
                });
            };
            attempt(0);
        }, opts.tasteForce);
    },
    boot: (force) => View.run({ force: !!force }),
    refreshCapsule: (silent) => View.run({ force: true, queue: true, notifyText: silent ? '' : 'Капсула обновлена', tasteForce: !!silent }),
    refreshCurrent: () => {
        const q = View.activeQuery || { kind: 'taste' };
        if (q.kind === 'search' || q.kind === 'mood') { UI.find(q.query, q.label, q.kind, true, true); return; }
        View.refreshCapsule();
    },
    resetAndRefresh: () => {
        View.commitShown();
        Seen.clear(); Cursor.reset(); Net.drop(); Taste.invalidate();
        View.prevIds = []; View.stack = [];
        View.run({ force: true, queue: true, notifyText: 'Собрал заново', tasteForce: true });
    },

    // отмена текущей загрузки
    cancel: (silent) => {
        View.token++;
        View.setBusy(false);
        Net.abortPending();
        if (!silent) { if (View.list.length) View.render(); else View.renderEmpty(); }
    },

    // ── стек экранов ──────────────────────────────────────────
    pushState: () => {
        if (!View.list.length) return;
        View.stack.push({ list: View.list, idx: View.idx, label: View.sourceLabel, activeQuery: View.activeQuery, prevIds: View.prevIds });
        while (View.stack.length > STACK_CAP) View.stack.shift();
    },
    popState: () => {
        const st = View.stack.pop();
        if (!st) return false;
        View.commitShown();
        View.list = st.list;
        View.idx = clamp(st.idx, 0, Math.max(0, st.list.length - 1));
        View.sourceLabel = st.label;
        View.activeQuery = st.activeQuery;
        View.prevIds = st.prevIds || st.list.map(mediaKey);
        View._dir = 0;
        View.render();
        return true;
    },
    backToCapsule: () => {
        // если капсула лежит в стеке — возвращаемся мгновенно, без сети
        for (let i = View.stack.length - 1; i >= 0; i--) {
            if (View.stack[i].activeQuery && View.stack[i].activeQuery.kind === 'taste') {
                View.stack.length = i + 1;
                View.popState();
                return;
            }
        }
        View.refreshCapsule(true);
    },

    commitShown: () => {
        const ids = Object.keys(View.shown);
        if (ids.length) Seen.add(ids);
        View.shown = {};
    },

    apply: (list, label, activeQuery) => {
        View.commitShown();
        View.list = list;
        View.idx = 0;
        View._dir = 0;
        View.sourceLabel = String(label || 'КАПСУЛА').toUpperCase().slice(0, 22);
        View.activeQuery = activeQuery || { kind: 'taste', label: View.sourceLabel, query: '' };
        View.prevIds = list.map(mediaKey);
        View.render();
    },

    showFound: (label, list, kind, query) => {
        View.setBusy(false);
        if (!list.length) { notify('Ничего не нашлось — попробуйте другие слова'); if (View.list.length) View.render(); else View.renderEmpty(); return; }
        View.pushState();
        View.apply(list.slice(0, capsuleSize()), label || 'ПОИСК', { kind: kind || 'search', label: String(label || 'ПОИСК').toUpperCase().slice(0, 22), query: query || label });
    },

    renderEmpty: () => {
        if (!View.stage) return;
        View.dropCard();
        View.stage.innerHTML = ''; Nav.reset();
        const wrap = el('div', 'cm-stage');
        const port = el('div', 'cm-port anim');
        const hero = el('div', 'cm-hero');
        const netBad = Net.failStreak > 2;
        hero.appendChild(el('div', 'cm-meta', '<div class="cm-mchip src cm-mono">КАПСУЛА ПУСТА</div>'));
        hero.appendChild(el('div', 'cm-name', netBad ? 'TMDb недоступен' : 'Пока нечего показать'));
        let stat = '';
        try {
            const st = Capsule.stats;
            if (st) stat = ' Получено с сервера: ' + st.got + ', прошло отбор: ' + st.scored + '.';
        } catch (e) {}
        const why = netBad
            ? 'Не удалось получить данные (' + esc(Net.lastErr || 'ошибка сети') + '). Проверьте соединение или задайте прокси в настройках.'
            : ('Подходящих новых фильмов не нашлось.' + stat + ' Можно уточнить вкусы, пересмотреть исключения или попробовать другое настроение.');
        hero.appendChild(el('div', 'cm-why', why));
        const acts = el('div', 'cm-acts');
        const bTest = el('div', 'cm-act primary', 'Пройти тест');
        bTest._cmAction = () => Onboard.start();
        const bRetry = el('div', 'cm-act secondary', netBad ? 'Проверить соединение' : 'Повторить');
        bRetry._cmAction = netBad ? (() => Settings.diagnose()) : (() => { Net.drop(); Taste.invalidate(); View.refreshCapsule(true); });
        const bLog = el('div', 'cm-act', 'Журнал'); bLog._cmAction = () => Log.show();
        acts.appendChild(bTest); acts.appendChild(bRetry); acts.appendChild(bLog);
        hero.appendChild(acts);
        port.appendChild(hero);
        wrap.appendChild(port);
        View.stage.appendChild(wrap);
        Nav.addRow([bTest, bRetry, bLog], 'actions');
        Nav.setFocus(0, 0, true);
    },

    // Карточка собирается ОДИН раз, дальше только обновляется —
    // это главное ускорение листания на ТВ.
    mountCard: () => {
        View.stage.innerHTML = ''; Nav.reset();
        const wrap = el('div', 'cm-stage');
        const port = el('div', 'cm-port');
        const poster = el('div', 'cm-poster');
        const img = el('img');
        img.loading = 'lazy'; img.decoding = 'async'; img.alt = '';
        poster.appendChild(img);
        poster.appendChild(el('div', 'cm-noimg cm-mono', 'НЕТ ПОСТЕРА'));
        const rate = el('div', 'cm-rate cm-mono', '★ —');
        poster.appendChild(rate);
        let held = false, holdT = null;
        const cancelHold = () => { if (holdT) { clearTimeout(holdT); holdT = null; } };
        poster._cmAction = () => { if (held) { held = false; return; } play(View.current()); };
        poster.addEventListener('touchstart', () => { held = false; holdT = setTimeout(() => { held = true; holdT = null; vibrate(18); View.details(View.current()); }, 520); }, { passive: true });
        poster.addEventListener('touchend', cancelHold, { passive: true });
        poster.addEventListener('touchmove', cancelHold, { passive: true });
        poster.addEventListener('touchcancel', cancelHold, { passive: true });
        port.appendChild(poster);

        const hero = el('div', 'cm-hero');
        const meta = el('div', 'cm-meta');
        const chipSrc = el('div', 'cm-mchip src cm-mono', '');
        const chipType = el('div', 'cm-mchip type cm-mono', '');
        const chipYear = el('div', 'cm-mchip cm-mono', '');
        meta.appendChild(chipSrc); meta.appendChild(chipType); meta.appendChild(chipYear);
        hero.appendChild(meta);
        const name = el('div', 'cm-name', '');
        hero.appendChild(name);
        const quote = el('div', 'cm-ref cm-mono', '');
        hero.appendChild(quote);
        const genres = el('div', 'cm-genres');
        hero.appendChild(genres);
        const why = el('div', 'cm-why', '');
        hero.appendChild(why);
        const over = el('div', 'cm-over', '');
        hero.appendChild(over);
        const acts = el('div', 'cm-acts');
        const bPlay = el('div', 'cm-act primary', I_PLAY + 'Смотреть'); bPlay._cmAction = () => play(View.current());
        const bMore = el('div', 'cm-act secondary', I_INFO + 'Подробнее'); bMore._cmAction = () => View.details(View.current());
        const bTaste = el('div', 'cm-act cm-feedback', 'Мой вкус'); bTaste._cmAction = () => UI.feedback(View.current());
        acts.appendChild(bPlay); acts.appendChild(bMore); acts.appendChild(bTaste);
        hero.appendChild(acts);
        port.appendChild(hero);
        wrap.appendChild(port);

        const bar = el('div', 'cm-bar');
        const bSet = el('div', 'cm-bar-btn', I_GEAR + '<span class="lbl">Настройки</span>'); bSet._cmAction = () => UI.settings();
        const bChange = el('div', 'cm-bar-btn center cm-mono', I_CHANGE + '<span class="lbl">Изменить набор</span>'); bChange._cmAction = () => UI.changeSet();
        const bSearch = el('div', 'cm-bar-btn', I_SEARCH + '<span class="lbl">Поиск</span>'); bSearch._cmAction = () => UI.ask();
        bar.appendChild(bSet); bar.appendChild(bChange); bar.appendChild(bSearch);
        wrap.appendChild(bar);
        View.stage.appendChild(wrap);

        Nav.addRow([poster], 'poster');
        Nav.addRow([bPlay, bMore, bTaste], 'actions');
        Nav.addRow([bSet, bChange, bSearch], 'bar');
        Nav.setFocus(1, 0, true);

        View.ui = { wrap, port, poster, img, bTaste, rate, chipSrc, chipType, chipYear, name, quote, genres, why, over };
        View.mounted = true;
    },

    render: () => {
        if (!View.stage) return;
        const m = View.current();
        if (!m) return View.renderEmpty();
        if (!View.mounted) View.mountCard();
        const u = View.ui;
        if (!u) return;

        // постер
        const token = ++View._imgToken;
        if (u.img.getAttribute('src') !== Src.imgUrl('w500', m.poster_path)) removeClass(u.img, 'ready');
        removeClass(u.poster, 'empty');
        const url = m.poster_path ? Src.imgUrl('w500', m.poster_path) : '';
        u.img.onload = () => { if (token === View._imgToken) addClass(u.img, 'ready'); };
        u.img.onerror = () => { if (token === View._imgToken) { addClass(u.poster, 'empty'); removeClass(u.img, 'ready'); } };
        if (url) { if (u.img.getAttribute('src') !== url) u.img.src = url; else if (u.img.complete && u.img.naturalWidth > 0) addClass(u.img, 'ready'); }
        else { u.img.removeAttribute('src'); addClass(u.poster, 'empty'); }
        u.rate.textContent = '★ ' + (m.vote_average ? m.vote_average.toFixed(1) : '—');

        const year = yearOf(m);
        u.chipSrc.textContent = (View.sourceLabel || 'КАПСУЛА') + ' · ' + (View.idx + 1) + '/' + View.list.length;
        u.chipType.textContent = m.media_type === 'tv' ? 'СЕРИАЛ' : 'ФИЛЬМ';
        u.chipYear.textContent = year ? String(year) : '—';
        u.name.textContent = m.title || m.name || '';
        const feedback = Feedback.get(m);
        u.bTaste.textContent = feedback ? ({like:'♥ Нравится',dislike:'Не моё',watched:'Уже смотрел'}[feedback.kind] || 'Мой вкус') : 'Мой вкус';
        u.bTaste.setAttribute('aria-label', 'Оценить фильм: ' + u.name.textContent);
        u.quote.textContent = FilmTheme.line(m);
        u.genres.innerHTML = '';
        (m.genre_ids || []).slice(0, 3).forEach(gid => { if (GENRE_NAMES[gid]) u.genres.appendChild(el('div', 'cm-gchip', esc(GENRE_NAMES[gid]))); });
        u.why.textContent = Capsule.reason(m, View.taste || {});
        u.over.textContent = m.overview || 'Описание подгружается…';

        // анимация направления (в лёгком режиме отключена стилями)
        removeClass(u.port, 'dir-next'); removeClass(u.port, 'dir-prev'); removeClass(u.port, 'anim');
        if (!Perf.lite() && !reducedMotion()) {
            void u.port.offsetWidth;
            if (View._dir > 0) addClass(u.port, 'dir-next');
            else if (View._dir < 0) addClass(u.port, 'dir-prev');
            addClass(u.port, 'anim');
        }
        try { u.wrap.scrollTop = 0; } catch (e) {}

        View.shown[mediaKey(m)] = 1;
        FilmTheme.apply(m);
        View.setGlow(m);
        View.preload();
        View.enrichLater(m);
    },

    // догрузка деталей — с задержкой, чтобы быстрое листание не слало запросы
    enrichLater: (m) => {
        clearTimeout(View._enrichT);
        View._enrichT = setTimeout(() => {
            if (!App.active || View.current() !== m || !View.ui) return;
            const type = m.media_type === 'tv' ? 'tv' : 'movie';
            Net.get('/' + type + '/' + m.id, { append_to_response: 'keywords,credits' }, (d) => {
                const u = View.ui;
                if (!u || View.current() !== m || !d) return;
                Taste.remember(m,d); Taste.saveCache();
                if (View.activeQuery.kind === 'taste') {
                    m._reasonText = Recommendation.score(m,View.taste || {}).reason;
                    u.why.textContent = m._reasonText;
                }
                u.chipType.textContent = type === 'tv'
                    ? 'СЕРИАЛ · ' + (d.number_of_seasons || 1) + ' СЕЗ.'
                    : (d.runtime ? 'ФИЛЬМ · ' + fmtRuntime(d.runtime).toUpperCase() : 'ФИЛЬМ');
                if (!m.overview && d.overview) { m.overview = d.overview; u.over.textContent = d.overview; }
                if (d.genres && d.genres.length) { u.genres.innerHTML = ''; d.genres.slice(0, 3).forEach(g => u.genres.appendChild(el('div', 'cm-gchip', esc(g.name)))); }
            }, () => {}, { ttl: 604800000 });
        }, 340);
    },

    preload: () => {
        if (View.list.length < 2) return;
        [1, -1].forEach(d => {
            const it = View.list[(View.idx + d + View.list.length) % View.list.length];
            if (!it || !it.poster_path) return;
            const u = Src.imgUrl('w500', it.poster_path);
            if (View._pre[u]) return;              // уже просили — браузер сам отдаст из кэша
            View._pre[u] = 1;
            const im = new Image(); im.decoding = 'async'; im.src = u;
        });
        const ks = Object.keys(View._pre);
        if (ks.length > 200) for (let i = 0; i < 100; i++) delete View._pre[ks[i]];
    },

    setGlow: (m) => {
        if (!View.glow) return;
        View._glowToken++;
        if (!pGet('glow', true)) { removeClass(View.glow, 'on'); return; }
        const url = m.backdrop_path ? Src.imgUrl('w780', m.backdrop_path) : Src.imgUrl('w342', m.poster_path);
        if (!url) { removeClass(View.glow, 'on'); return; }
        if (View.glow._url === url) { addClass(View.glow, 'on'); return; }
        const glowToken = ++View._glowToken;
        const root = View.glow;
        const img = new Image();
        img.decoding = 'async';
        img.onload = () => {
            if (View.glow !== root || glowToken !== View._glowToken || View.current() !== m || !pGet('glow',true)) return;
            View.glow._url = url;
            View.glow.style.backgroundImage = 'url(' + url + ')';
            addClass(View.glow, 'on');
        };
        img.onerror = () => { if (View.glow === root && glowToken === View._glowToken && View.current() === m) removeClass(root, 'on'); };
        img.src = url;
    },

    details: (m) => {
        if (!m) return;
        const detailsToken = ++View._detailsToken;
        Modal.open({ title: 'Загружаем…', tag: 'wait', items: [{ label: 'Закрыть' }] });
        const type = m.media_type === 'tv' ? 'tv' : 'movie';
        Net.get('/' + type + '/' + m.id, {}, (d) => {
            if (Modal.tag() !== 'wait' || detailsToken !== View._detailsToken) return;
            const title = d.title || d.name || '';
            const year = (d.release_date || d.first_air_date || '').slice(0, 4);
            const genres = (d.genres || []).map(g => g.name).join(', ');
            const score = d.vote_average ? d.vote_average.toFixed(1) : '—';
            let html = '<b>' + esc(title) + '</b>' + (year ? ' (' + year + ')' : '') + ' · ★ ' + score + (d.runtime ? ' · ' + fmtRuntime(d.runtime) : '');
            if (genres) html += '<br>' + esc(genres);
            html += '<br><br>' + esc(d.overview || 'Описания нет.');
            Modal.open({ title: 'Подробнее', text: html, items: [{ label: 'Смотреть', onSelect: () => play(m) }, { label: 'Мой вкус', onSelect: () => UI.feedback(m) }, { label: 'Закрыть' }] });
        }, () => { if (Modal.tag() === 'wait' && detailsToken === View._detailsToken) { Modal.close(); notify('Не удалось загрузить описание'); } }, { ttl: 604800000 });
    },

    go: (i) => {
        if (i < 0 || i >= View.list.length || i === View.idx) return;
        View.idx = i;
        View.render(); // фокус сохраняется — узлы те же
    },
    step: (delta) => {
        if (!View.list.length || View.busy) return;
        let next = View.idx + delta;
        if (next >= View.list.length) next = 0;
        if (next < 0) next = View.list.length - 1;
        View._dir = delta > 0 ? 1 : -1;
        View.go(next);
    }
};

// ═══════════════════════════════════════════ ИНТЕРФЕЙС
const UI = {
    settings: () => {
        Modal.open({
            title: 'Настройки · Капсула '+VERSION,
            items: [
                { label: 'Оформление', hint: 'тема, темы для фильмов, эффекты', onSelect: () => UI.mLook() },
                { label: 'Интерфейс', hint: 'положение экрана, производительность', onSelect: () => UI.mIface() },
                { label: 'Подбор', hint: 'вкус, журнал показов, пересборка', onSelect: () => UI.mTaste() },
                { label: 'Сеть', hint: 'адреса берутся: ' + Src.where(), onSelect: () => UI.mNet() },
                { label: 'Диагностика', hint: 'журнал и проверка соединения', onSelect: () => UI.mDiag() },
                { label: 'Закрыть' }
            ]
        });
    },
    mLook: () => {
        const pin = FilmTheme.pinned();
        const filmState = pin ? pin.name : (pGet('filmtheme', false) ? 'авто, по фильму' : 'выключены');
        Modal.open({
            title: 'Оформление',
            items: [
                { label: 'Тема: ' + THEMES[Themes.current()].name, onSelect: () => UI.themes() },
                { label: 'Темы для фильмов: ' + filmState, hint: FILM_THEMES.length + ' палитр со своей анимацией', onSelect: () => UI.filmThemes() },
                { label: 'Свет от постера: ' + (pGet('glow', true) ? 'включён' : 'выключен'), onSelect: () => { pSet('glow', !pGet('glow', true)); const m = View.current(); if (m) View.setGlow(m); UI.mLook(); } },
                { label: 'Фоновая анимация: ' + (pGet('fx', true) ? 'включена' : 'выключена'), hint: 'выключите, если подтормаживает', onSelect: () => { pSet('fx', !pGet('fx', true)); Fx.mode = null; Themes.apply(Themes.current(), View.root); FilmTheme.key = null; FilmTheme.apply(View.current()); Fx.ensureSize(); UI.mLook(); } },
                { label: 'Плотность эффектов: ' + fxDensityLabel(), hint: 'сколько частиц в фоновой сцене', onSelect: () => UI.density() },
                { label: 'Назад', onSelect: () => UI.settings() }
            ]
        });
    },
    mIface: () => {
        Modal.open({
            title: 'Интерфейс',
            items: [
                { label: 'Смещение интерфейса: ' + offsetLabel(), hint: 'двигается стрелками, 25 положений', onSelect: () => UI.stageOffset() },
                { label: 'Производительность: ' + perfLabel(pGet('perf', 'auto')), hint: 'класс устройства: размытия и частота кадров', onSelect: () => UI.perf() },
                { label: 'Назад', onSelect: () => UI.settings() }
            ]
        });
    },

    feedback: m => {
        if (!m) return;
        const current = Feedback.get(m);
        const choose = kind => {
            Feedback.set(m,kind); vibrate(15);
            // Immediate rerank uses current history and cached metadata; no rebuild required.
            View.taste = Taste.compose((View.taste && View.taste.stats) || {items:[],total:0},Taste.loadCache());
            Taste.profile = View.taste; Taste.profileAt = Date.now();
            if (kind === 'dislike' || kind === 'watched') {
                View.list = View.list.filter(x=>mediaKey(x)!==mediaKey(m));
                View.stack.forEach(st=>{st.list=st.list.filter(x=>mediaKey(x)!==mediaKey(m));});
                View.idx = Math.min(View.idx,Math.max(0,View.list.length-1));
                if (View.list.length) View.render(); else View.renderEmpty();
            } else if (View.activeQuery.kind === 'taste') {
                // Keep the visible card and already inspected prefix; rerank what comes next.
                const prefix = View.list.slice(0,View.idx+1);
                const tail = Capsule.pick(View.list.slice(View.idx+1),View.taste,{});
                View.list = prefix.concat(tail); View.render();
            } else View.render();
            notify(kind === 'like' ? 'Учту в подборе следующих фильмов' : kind === 'dislike' ? 'Убрано. Похожие темы будут встречаться реже' : kind === 'watched' ? 'Больше не предлагаю в капсуле' : 'Оценка удалена');
        };
        Modal.open({ title: m.title || m.name || 'Мой вкус',
            text: 'Профиль: '+esc(Person.current().name)+'. Отмечайте личное впечатление. Простое перелистывание не меняет вкус.',
            items: [
                { label:'♥ Нравится', hint:'Больше фильмов с похожими темами и авторами', onSelect:()=>choose('like') },
                { label:'Не моё', hint:'Убрать этот фильм и ослабить похожие предпочтения', onSelect:()=>choose('dislike') },
                { label:'Уже смотрел', hint:'Убрать из капсулы без оценки «нравится»', onSelect:()=>choose('watched') },
                ...(current ? [{label:'Убрать мою оценку',onSelect:()=>choose(null)}] : []),
                { label:'Закрыть' }
            ] });
    },
    people: () => {
        Modal.open({title:'Для кого подбираем?',text:'У каждого профиля свои оценки, тест, исключения и история показов. У нового профиля обучение по общей истории Lampa выключено.',
            items: Person.all().map(p=>({label:(p.id===Person.current().id?'✓ ':'')+p.name,onSelect:()=>Person.switchTo(p.id)})).concat([
                {label:'Добавить человека',onSelect:()=>{
                    if(Person.all().length>=6){notify('Можно создать до 6 профилей');return;}
                    askText('Имя профиля','',name=>{
                        name=String(name || '').trim().slice(0,30);if(!name)return;
                        const id='p'+Date.now().toString(36),people=Person.all().slice();people.push({id,name});pSet('rec_people',people);Person.switchTo(id);
                    });
                }}, {label:'Назад',onSelect:()=>UI.mTaste()}
            ])});
    },
    avoidGenres: () => {
        const avoid=pGet('avoid_genres',[]);
        Modal.open({title:'Какие жанры исключить?',text:'Выбранные жанры не попадут в капсулу и поиск, даже при нехватке результатов.',
            chips:ONB_GENRES.map(id=>({label:(avoid.indexOf(id)>=0?'✕ ':'')+GENRE_NAMES[id],onSelect:()=>{
                const next=avoid.indexOf(id)>=0?avoid.filter(x=>x!==id):avoid.concat([id]);pSet('avoid_genres',next);Taste.invalidate();UI.avoidGenres();
            }})),items:[{label:'Применить и собрать подбор',onSelect:()=>View.refreshCapsule(true)},{label:'Назад',onSelect:()=>UI.mTaste()}]});
    },
    recMode: () => Modal.open({title:'Точность подбора',items:[
        {label:'Точно по вкусу',hint:'Только совпадения с вашими предпочтениями',onSelect:()=>{pSet('rec_mode','precise');View.refreshCapsule(true);}},
        {label:'Баланс',hint:'До 8% новых направлений; основа — ваш вкус',onSelect:()=>{pSet('rec_mode','balanced');View.refreshCapsule(true);}},
        {label:'Больше открытий',hint:'До 18% новых направлений',onSelect:()=>{pSet('rec_mode','curious');View.refreshCapsule(true);}},
        {label:'Назад',onSelect:()=>UI.mTaste()}
    ]}),
    reactions: () => {
        const data=Feedback.all(),keys=Object.keys(data).sort((a,b)=>data[b].at-data[a].at).slice(0,60);
        Modal.open({title:'Мои оценки',text:'Последние 60 оценок. Нажмите на фильм, чтобы изменить или убрать оценку.',
            items:keys.map(k=>({label:(data[k].card.title || data[k].card.name || k),
                hint:({like:'Нравится',dislike:'Не моё',watched:'Уже смотрел'}[data[k].kind]),onSelect:()=>UI.feedback(data[k].card)}))
                .concat([{label:'Назад',onSelect:()=>UI.mTaste()}])});
    },

    mTaste: () => {
        Modal.open({
            title: 'Подбор · '+Person.current().name,
            text: 'Явные оценки важнее истории. Жанры: '+esc(((View.taste && View.taste.genres) || []).slice(0,4).map(g=>g.name).join(', ') || 'пока не определены')+'.',
            items: [
                {label:'Профиль: '+Person.current().name,onSelect:()=>UI.people()},
                {label:'История Lampa: '+(Person.history()?'учитывается':'не учитывается'),hint:'На общем устройстве лучше учиться по личным оценкам',onSelect:()=>{pSet('history_learning',!Person.history());Taste.invalidate();View.refreshCapsule(true);}},
                {label:'Режим: '+({precise:'точно по вкусу',balanced:'баланс',curious:'больше открытий'}[Recommendation.mode()] || 'баланс'),onSelect:()=>UI.recMode()},
                {label:'Исключённые жанры',hint:'Жёсткие ограничения для этого профиля',onSelect:()=>UI.avoidGenres()},
                {label:'Мои оценки: '+Object.keys(Feedback.all()).length,onSelect:()=>UI.reactions()},
                ...(Feedback.last && Feedback.last.person===pGet('rec_person','default') ? [{label:'Отменить последнюю оценку',onSelect:()=>{Feedback.undo();View.refreshCapsule(true);}}] : []),
                { label: 'Пройти тест предпочтений', hint: 'уточнить любимые фильмы и жанры', onSelect: () => Onboard.start() },
                { label: 'Очистить журнал показов', hint: 'запомнено ' + Seen.size() + ' — снова покажем отложенное', onSelect: () => { View.shown = {}; Seen.clear(); Cursor.reset(); notify('Журнал показов очищен'); UI.mTaste(); } },
                { label: 'Собрать набор заново', hint: 'забыть показанное и начать чистый круг', onSelect: () => View.resetAndRefresh() },
                { label: 'Назад', onSelect: () => UI.settings() }
            ]
        });
    },
    mNet: () => {
        Modal.open({
            title: 'Сеть',
            items: [
                { label: 'Свой ключ TMDb', hint: pGet('tmdb_key', '') ? 'задан' : 'берётся из Lampa', onSelect: () => Settings.askKey() },
                { label: 'Адрес API TMDb', hint: pGet('tmdb_proxy', '') ? 'свой' : 'как в Lampa (' + Src.where() + ')', onSelect: () => Settings.askProxy() },
                { label: 'Адрес картинок TMDb', hint: pGet('img_proxy', '') ? 'свой' : 'как в Lampa', onSelect: () => Settings.askImg() },
                { label: 'Проверка соединения', hint: 'если пусто на ТВ — начните отсюда', onSelect: () => Settings.diagnose() },
                { label: 'Сбросить настройки сети', hint: 'вернуть адреса и ключ к состоянию «как в Lampa»', onSelect: () => UI.resetNet() },
                { label: 'Назад', onSelect: () => UI.settings() }
            ]
        });
    },
    mDiag: () => {
        Modal.open({
            title: 'Диагностика',
            items: [
                { label: 'Журнал', hint: 'что именно пошло не так (для ТВ)', onSelect: () => Log.show() },
                { label: 'Проверка соединения', onSelect: () => Settings.diagnose() },
                { label: 'Назад', onSelect: () => UI.settings() }
            ]
        });
    },
    filmThemes: () => {
        const pin = pGet('film_pin', '');
        const auto = pGet('filmtheme', false);
        const use = (key) => {
            pSet('film_pin', key);
            pSet('filmtheme', true);
            FilmTheme.key = null;
            FilmTheme.apply(View.current());
            UI.filmThemes();
        };
        const items = [
            { label: (auto && !pin ? '● ' : '○ ') + 'Авто — по фильму', hint: 'палитра подстраивается под франшизу карточки', onSelect: () => { pSet('film_pin', ''); pSet('filmtheme', true); FilmTheme.key = null; FilmTheme.apply(View.current()); UI.filmThemes(); } },
            { label: (!auto && !pin ? '● ' : '○ ') + 'Выключить', hint: 'вернуться к обычной теме', onSelect: () => { pSet('film_pin', ''); pSet('filmtheme', false); FilmTheme.reset(true); UI.filmThemes(); } }
        ].concat(FILM_THEMES.map(f => ({
            label: (pin === f.key ? '● ' : '○ ') + f.name,
            hint: 'закрепить насовсем',
            onSelect: () => use(f.key)
        })));
        items.push({ label: 'Назад', onSelect: () => UI.mLook() });
        Modal.open({ title: 'Темы для фильмов', text: 'Можно оставить «Авто» — тогда капсула сама узнаёт франшизу по названию, — либо закрепить любую палитру насовсем.', items });
    },
    resetNet: () => {
        Modal.open({
            title: 'Сбросить настройки сети?',
            text: 'Будут очищены: свой ключ TMDb, адрес API, адрес картинок.',
            items: [
                { label: 'Да, сбросить', onSelect: () => {
                    pSet('tmdb_key', ''); pSet('tmdb_proxy', ''); pSet('img_proxy', '');
                    Net.drop(); Net.failStreak = 0; Net._lampaTried = false; Net._lampaNet = null;
                    Taste.invalidate(); Seen.clear(); Cursor.reset();
                    View.prevIds = []; View.stack = []; View.shown = {};
                    Log.push('НАСТРОЙКИ: сеть сброшена к значениям по умолчанию');
                    notify('Сброшено — работаем как Lampa');
                    View.refreshCapsule(true);
                } },
                { label: 'Отмена', onSelect: () => UI.mNet() }
            ]
        });
    },
    perf: () => {
        const cur = pGet('perf', 'auto');
        const opts = [{ v: 'auto', l: 'Авто', h: 'определяется по устройству' }, { v: 'light', l: 'Лёгкий', h: 'без размытий, меньше частиц — для ТВ' }, { v: 'high', l: 'Максимум', h: 'все эффекты' }];
        Modal.open({
            title: 'Производительность',
            items: opts.map(o => ({ label: (cur === o.v ? '● ' : '○ ') + o.l, hint: o.h, onSelect: () => { pSet('perf', o.v); Perf._tier = null; Fx.mode = null; Themes.apply(Themes.current(), View.root); FilmTheme.key = null; FilmTheme.apply(View.current()); Fx.ensureSize(); UI.mIface(); } }))
                .concat([{ label: 'Назад', onSelect: () => UI.mIface() }])
        });
    },
    density: () => {
        const cur = fxDensity();
        Modal.open({
            title: 'Плотность эффектов',
            text: 'Множитель поверх авто-настройки. На слабом ТВ выше «обычной» лучше не поднимать.',
            items: FX_DENSITY.map(o => ({
                label: (Math.abs(o.v - cur) < .05 ? '● ' : '○ ') + o.l,
                hint: '×' + String(o.v).replace('.', ','),
                onSelect: () => {
                    pSet('fx_density', o.v);
                    Fx.mode = null;                    // плотность поменялась — сцену пересобрать
                    Themes.apply(Themes.current(), View.root);
                    FilmTheme.key = null;
                    FilmTheme.apply(View.current());
                    Fx.ensureSize();
                    UI.density();
                }
            })).concat([{ label: 'Назад', onSelect: () => UI.mLook() }])
        });
    },
    stageOffset: () => {
        const box = el('div', 'cm-offset');
        const val = el('div', 'cm-offset-val cm-mono', '');
        const scale = el('div', 'cm-offset-scale');
        const fill = el('div', 'cm-offset-dot');
        scale.appendChild(fill);
        const hint = el('div', 'cm-offset-hint', '↑ / ↓ — двигать интерфейс&nbsp;&nbsp;·&nbsp;&nbsp;← / → — выбрать кнопку');
        box.appendChild(val); box.appendChild(scale); box.appendChild(hint);
        const paint = () => {
            val.textContent = offsetLabel();
            const pos = (offsetGet() - OFFSET_MIN) / (OFFSET_MAX - OFFSET_MIN);
            fill.style.left = clamp(pos * 100, 0, 100) + '%';
        };
        const move = (d) => { offsetSet(offsetGet() + d); StageOffset.apply(View.root); paint(); vibrate(6); };
        paint();
        Modal.open({
            title: 'Смещение интерфейса',
            customNode: box,
            onKey: (kind) => {
                if (kind === 'up') { move(-OFFSET_STEP); return true; }
                if (kind === 'down') { move(OFFSET_STEP); return true; }
                if (kind === 'left') { Modal.move('up'); return true; }
                if (kind === 'right') { Modal.move('down'); return true; }
                return false;
            },
            items: [
                { label: 'Сбросить в центр', onSelect: () => { offsetSet(0); StageOffset.apply(View.root); UI.stageOffset(); } },
                { label: 'Готово', onSelect: () => UI.mIface() }
            ]
        });
    },
    themes: () => {
        const items = THEME_ORDER.map(key => ({
            label: (Themes.current() === key ? '● ' : '○ ') + THEMES[key].name,
            onSelect: () => {
                Themes.set(key);
                Fx.ensureSize();
                notify('Тема: ' + THEMES[key].name);
                if (Onboard.active) Onboard.renderStep();
                else if (View.list.length) View.render();
                else if (!View.busy) View.renderEmpty();
            }
        }));
        items.push({ label: 'Назад', onSelect: () => UI.mLook() });
        Modal.open({ title: 'Базовая тема', items });
    },
    changeSet: () => {
        const isSearch = View.activeQuery && View.activeQuery.kind !== 'taste';
        Modal.open({
            title: 'Изменить набор',
            items: [
                { label: 'Обновить этот набор', hint: 'другие фильмы по той же логике', onSelect: () => View.refreshCurrent() },
                { label: 'Выбрать по настроению', onSelect: () => UI.moods() },
                { label: 'Найти по описанию', hint: 'жанр, тема, эпоха, актёр, годы', onSelect: () => UI.ask() },
                isSearch ? { label: 'Вернуться к капсуле', onSelect: () => View.backToCapsule() } : null,
                { label: 'Собрать заново с нуля', hint: 'забыть показанное и начать чистый круг', onSelect: () => View.resetAndRefresh() },
                { label: 'Закрыть' }
            ].filter(Boolean)
        });
    },
    moods: () => {
        Modal.open({
            title: 'Настроение',
            chips: MOODS.map(md => ({ label: md.label, onSelect: () => UI.find(md.q, md.label, 'mood') })),
            items: [{ label: 'Назад', onSelect: () => UI.changeSet() }]
        });
    },
    ask: () => askText('Что ищем?', '', (v) => UI.find(v, v, 'search')),
    find: (query, label, kind, force, replace) => {
        if (!query) return;
        if (View.busy) View.cancel(true);
        View.commitShown();
        const token = ++View.token;
        Net.abortPending();
        View.setBusy(true);
        View.loading('ИЩУ: ' + String(query).toUpperCase().slice(0, 24), force ? 'ДРУГИЕ ВАРИАНТЫ' : '');
        const attempt = (depth) => {
            Search.run(query, View.taste, (list) => {
                if (token !== View.token) return;
                // Search refresh also makes one bounded attempt.
                // «обновить этот набор» не должен плодить записи в стеке
                if (replace && View.stack.length && View.activeQuery.kind === kind) View.stack.pop();
                View.showFound(label || query, list, kind || 'search', query);
            }, !!force, depth);
        };
        attempt(0);
    }
};

const Settings = {
    askKey: () => askText('Ключ TMDb («сброс» — брать ключ из Lampa)', pGet('tmdb_key', ''), (v) => {
        let val = String(v || '').trim();
        if (val && val.toLowerCase() === 'сброс') val = '';
        pSet('tmdb_key', val);
        Net.drop(); Net.failStreak = 0; Taste.invalidate();
        notify(val ? 'Ключ сохранён' : 'Свой ключ убран — используется ключ Lampa');
    }),
    askProxy: () => askText('Адрес API TMDb («сброс» — как в Lampa). Пример: https://apitmdb.cub.red/3', pGet('tmdb_proxy', ''), (v) => {
        let val = String(v || '').trim();
        if (val && val.toLowerCase() === 'сброс') val = '';
        if (val && !Src.validUrl(val)) { notify('Это не адрес. Нужен полный URL вида https://… (ключ вводится в другом пункте)'); return; }
        pSet('tmdb_proxy', val);
        Net.drop(); Net.failStreak = 0; Net._lampaTried = false; Net._lampaNet = null; Taste.invalidate();
        notify(val ? 'Адрес API сохранён' : 'Адрес API — как в Lampa');
        View.refreshCapsule(true);
    }),
    askImg: () => askText('Адрес картинок TMDb («сброс» — как в Lampa). Пример: https://imagetmdb.cub.red', pGet('img_proxy', ''), (v) => {
        let val = String(v || '').trim();
        if (val && val.toLowerCase() === 'сброс') val = '';
        if (val && !Src.validUrl(val)) { notify('Это не адрес. Нужен полный URL вида https://…'); return; }
        pSet('img_proxy', val);
        notify(val ? 'Адрес картинок сохранён' : 'Адрес картинок — как в Lampa');
        if (View.glow) View.glow._url = '';
        if (View.list.length) View.render();
    }),
    diagnose: () => {
        Modal.open({ title: 'Проверка соединения', text: 'Проверяю API и картинки…', items: [{ label: 'Закрыть' }], tag: 'diag' });
        const url = Net.url('/configuration', {});
        const shown = Net.safe(url);
        const out = { lampa: '—', xhr: '—', img: '—' };
        let left = 3;
        const step = () => {
            if (--left > 0) return;
            if (Modal.tag() !== 'diag') return;
            const html = 'Адреса берутся: <b>' + esc(Src.where()) + '</b>'
                + '<br>API: ' + esc(shown)
                + '<br><br>Сеть Lampa: <b>' + esc(out.lampa) + '</b>'
                + '<br>Обычный XHR: <b>' + esc(out.xhr) + '</b>'
                + '<br>Картинки: <b>' + esc(out.img) + '</b>'
                + '<br><br>' + (out.lampa === 'ок' || out.xhr === 'ок'
                    ? 'API доступен. Если пусто именно на ТВ — проверьте строку «Картинки».'
                    : 'API недоступен ни одним способом. Включите «Прокси TMDB» в настройках самой Lampa либо задайте адрес API вручную.');
            Modal.open({ title: 'Проверка соединения', text: html, items: [{ label: 'Адрес API', onSelect: () => Settings.askProxy() }, { label: 'Адрес картинок', onSelect: () => Settings.askImg() }, { label: 'Закрыть' }] });
        };
        Net._lampa(url, (e) => { out.lampa = e ? ('ошибка: ' + e) : 'ок'; step(); });
        Net._xhr(url, (e) => { out.xhr = e ? ('ошибка: ' + e) : 'ок'; step(); });
        const im = new Image();
        const fin = once((res) => { out.img = res; step(); });
        const timer = setTimeout(() => fin('таймаут'), 8000);
        im.onload = () => { clearTimeout(timer); fin('ок'); };
        im.onerror = () => { clearTimeout(timer); fin('не грузятся'); };
        im.src = Src.imgUrl('w92', '/kqjL17yufvn9OVLyXYpvtyrFfak.jpg');
    }
};

// ═══════════════════════════════════════════ ИНТЕГРАЦИЯ С LAMPA
const play = (m) => {
    if (!m) return;
    View.commitShown();
    try {
        if (window.Lampa && window.Lampa.Activity) {
            Ctrl.hold(4000); // не отбирать фокус у открывающейся карточки
            Lampa.Activity.push({
                url: '', component: 'full',
                id: m.id,
                method: m.media_type === 'tv' ? 'tv' : 'movie',
                card: m, source: 'tmdb'
            });
            return;
        }
    } catch (e) { Ctrl.free(); }
    notify('Lampa не отвечает');
};

const exitApp = () => {
    Modal.close(true);
    View.commitShown();
    flushStore();
    let pushed = false;
    try {
        if (window.Lampa && window.Lampa.Activity && Lampa.Activity.backward) {
            Ctrl.hold(3000);
            Lampa.Activity.backward();
            pushed = true;
        }
    } catch (e) {}
    // страховка: если активность не сменилась — отдаём фокус боковому меню
    setTimeout(() => {
        if (!App.active) return;
        try { if (window.Lampa && Lampa.Controller) { Lampa.Controller.toggle('menu'); return; } } catch (e) {}
        if (!pushed) { try { window.history.back(); } catch (e) {} }
    }, 500);
};

// ═══════════════════════════════════════════ КЛАВИШИ / ПУЛЬТ
const KEYS = { 37: 'left', 38: 'up', 39: 'right', 40: 'down', 13: 'enter', 32: 'enter', 8: 'back', 27: 'back', 461: 'back', 10009: 'back' };
let lastStepAt = 0;
const route = (kind) => {
    if (Modal.active()) {
        if (Modal.st.onKey && kind !== 'back' && kind !== 'enter' && Modal.st.onKey(kind)) return;
        if (kind === 'back') Modal.close();
        else if (kind === 'enter') Modal.enter();
        else Modal.move(kind);
        return;
    }
    if (Onboard.active) {
        if (kind === 'back') return Onboard.back();
        if (kind === 'enter') return Nav.enter();
        if (kind === 'left' || kind === 'right') { Nav.moveH(kind); return; }
        Nav.move(kind);
        return;
    }
    if (kind === 'left' || kind === 'right') {
        if (!Nav.moveH(kind)) {
            const now = Date.now();
            if (now - lastStepAt > 160) { lastStepAt = now; View.step(kind === 'right' ? 1 : -1); }
        }
        return;
    }
    if (kind === 'enter') return Nav.enter();
    if (kind === 'back') {
        // 1) идёт загрузка — отменяем её
        if (View.busy) { View.cancel(); return; }
        // 2) есть предыдущий экран — мгновенно возвращаемся (без сети!)
        if (View.stack.length) { View.popState(); return; }
        // 3) корень — выходим из плагина
        exitApp();
        return;
    }
    Nav.move(kind);
};
const keyFallback = (e) => {
    if (!App.active) return;
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
    const kind = KEYS[e.keyCode];
    if (!kind) return;
    e.preventDefault(); e.stopPropagation();
    route(kind);
};

// ═══════════════════════════════════════════ КОМПОНЕНТ LAMPA
const CapsuleComponent = function () {
    let node = null, wrapped = null;
    this.create = () => { node = View.create(); wrapped = window.$ ? window.$(node) : node; return this.render(); };
    this.render = () => wrapped;
    this.start = () => {
        App.active = true;
        Fx.last = 0;
        Fx.resume();
        Fx.ensureSize();
        if (App.entered && !View.busy && !Onboard.active && !View.list.length) View.refreshCapsule(true);
        App.entered = true;
        let ok = false;
        try { ok = !!(window.Lampa && window.Lampa.Controller && window.Lampa.Controller.add); } catch (e) {}
        if (ok) {
            Lampa.Controller.add(CTRL_ID, {
                toggle: () => { try { Lampa.Controller.clear(); } catch (e) {} Nav.paint(true); },
                up: () => route('up'),
                down: () => route('down'),
                left: () => route('left'),
                right: () => route('right'),
                enter: () => route('enter'),
                back: () => route('back')
            });
            Lampa.Controller.toggle(CTRL_ID);
            Ctrl.start();
        } else {
            App.fallback = true;
            document.addEventListener('keydown', keyFallback, true);
        }
    };
    this.pause = () => { App.active = false; Ctrl.stop(); Fx.pause(); clearTimeout(View._enrichT); View.commitShown(); flushStore(); Taste.invalidate(); };
    this.resume = () => { App.active = true; Fx.last = 0; Fx.resume(); Fx.ensureSize(); Ctrl.start(); reclaimControl(); };
    this.stop = () => { App.active = false; Ctrl.stop(); Fx.pause(); };
    this.destroy = () => {
        App.active = false;
        View._imgToken++; View._glowToken++; View._detailsToken++;
        View.token++;
        clearTimeout(View._busyT); View._busyT = null;
        clearTimeout(View._enrichT); View._enrichT = null;
        View.busy = false;
        Ctrl.stop(); Ctrl.free();
        if (App.fallback) { document.removeEventListener('keydown', keyFallback, true); App.fallback = false; }
        Modal.close(true);
        Toast.kill();
        Net.abortPending();
        Fx.stop();
        View.commitShown();
        flushStore();
        if (node && node.parentNode) node.parentNode.removeChild(node);
        node = null; wrapped = null;
        View.root = null; View.stage = null; View.glow = null; View.ui = null; View.mounted = false;
        View.list = []; View.stack = []; View.idx = 0;
        Onboard.active = false;
        FilmTheme.key = null;
        Nav.reset();
    };
};

// ═══════════════════════════════════════════ ПУНКТ МЕНЮ
// Значок «Капсулы» читает фон под собой и подбирает контрастный цвет:
// на светлой подсветке фокуса становится чёрным, на тёмной — белым.
const LogoTint = {
    node: null, ico: null, obs: null, timer: null,
    lum: (rgb) => {
        const m = String(rgb || '').match(/rgba?\(([^)]+)\)/);
        if (!m) return null;
        const p = m[1].split(',').map(x => parseFloat(x));
        if (p.length < 3 || isNaN(p[0])) return null;
        if (p.length > 3 && p[3] < 0.15) return null; // прозрачно — смотрим выше по дереву
        const f = (c) => { c = c / 255; return c <= .03928 ? c / 12.92 : Math.pow((c + .055) / 1.055, 2.4); };
        return .2126 * f(p[0]) + .7152 * f(p[1]) + .0722 * f(p[2]);
    },
    behind: (node) => {
        let n = node, guard = 0;
        while (n && n.nodeType === 1 && guard++ < 10) {
            let st = null;
            try { st = window.getComputedStyle(n); } catch (e) {}
            if (st) {
                const l = LogoTint.lum(st.backgroundColor);
                if (l != null) return l;
                // фон-картинка или градиент — считаем светлым только по цвету текста
                if (st.backgroundImage && st.backgroundImage !== 'none') {
                    const tl = LogoTint.lum(st.color);
                    if (tl != null) return 1 - tl;
                }
            }
            n = n.parentNode;
        }
        return 0;
    },
    update: () => {
        const node = LogoTint.node, ico = LogoTint.ico;
        if (!node || !ico || !node.parentNode) return;
        const color = LogoTint.behind(node) > 0.55 ? '#000000' : '#FFFFFF';
        if (ico._cmColor === color) return;
        ico._cmColor = color;
        try {
            ico.style.color = color;
            ico.style.fill = color;
            const paths = ico.querySelectorAll('path');
            for (let i = 0; i < paths.length; i++) paths[i].setAttribute('fill', color);
        } catch (e) {}
    },
    ping: () => { LogoTint.update(); setTimeout(LogoTint.update, 70); setTimeout(LogoTint.update, 300); },
    attach: (node) => {
        if (!node || LogoTint.node === node) return;
        LogoTint.detach();
        LogoTint.node = node;
        LogoTint.ico = node.querySelector ? node.querySelector('svg') : null;
        if (!LogoTint.ico) { LogoTint.node = null; return; }
        LogoTint.update();
        ['mouseenter', 'mouseleave', 'focus', 'blur', 'transitionend'].forEach(ev => {
            try { node.addEventListener(ev, LogoTint.ping, true); } catch (e) {}
        });
        try {
            if (window.MutationObserver) {
                LogoTint.obs = new MutationObserver(LogoTint.ping);
                LogoTint.obs.observe(node, { attributes: true, attributeFilter: ['class', 'style'] });
                LogoTint.obs.observe(document.body, { attributes: true, attributeFilter: ['class', 'style'] });
            }
        } catch (e) {}
        LogoTint.timer = setInterval(LogoTint.update, 2500);
    },
    detach: () => {
        if (LogoTint.obs) { try { LogoTint.obs.disconnect(); } catch (e) {} LogoTint.obs = null; }
        if (LogoTint.timer) { clearInterval(LogoTint.timer); LogoTint.timer = null; }
        LogoTint.node = null; LogoTint.ico = null;
    }
};

// ═══════════════════════════════════════════ ПУНКТ МЕНЮ
const addMenu = () => {
    let done = false;
    const tryAdd = () => {
        if (done) return;
        try {
            const exist = document.querySelector('[data-action="capsule_mod_entry"]');
            if (exist) { done = true; LogoTint.attach(exist); return; }
            const $ = window.jQuery || window.$;
            if (!$) return;
            const list = $('.menu .menu__list').eq(0);
            if (!list.length) return;
            const item = $('<li class="menu__item selector" data-action="capsule_mod_entry"><div class="menu__ico">' + I_CAPSULE + '</div><div class="menu__text">Капсула</div></li>');
            item.on('hover:enter click', () => {
                try { Lampa.Activity.push({ url: '', title: 'Капсула', component: COMPONENT_ID, page: 1 }); } catch (e) {}
            });
            item.on('hover:focus hover:blur hover:long', LogoTint.ping);
            list.append(item);
            done = true;
            LogoTint.attach(item[0] || (item.get && item.get(0)) || null);
        } catch (e) {}
    };
    if (window.appready) tryAdd();
    try { if (window.Lampa && window.Lampa.Listener) Lampa.Listener.follow('app', (e) => { if (e.type === 'ready') tryAdd(); }); } catch (e) {}
    setTimeout(tryAdd, 1500);
    setTimeout(tryAdd, 4000);
    setTimeout(LogoTint.ping, 6000);
};

window.addEventListener('beforeunload', flushStore);
document.addEventListener('visibilitychange', () => {
    if (document.hidden) { flushStore(); Fx.pause(); }
    else { Fx.last = 0; if (App.active) Fx.resume(); }
});

(() => {
    try {
        if (window.Lampa && window.Lampa.Component && window.Lampa.Component.add) window.Lampa.Component.add(COMPONENT_ID, CapsuleComponent);
        addMenu();
        console.log('[Капсула] v' + VERSION + ' загружена');
    } catch (e) { console.error('[Капсула] ошибка старта:', e); }
})();
})();
