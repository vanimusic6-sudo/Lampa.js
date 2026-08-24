(function () {
'use strict';
if (window.plugin_capsule_mod_ready) return;
window.plugin_capsule_mod_ready = true;

const VERSION = '20.3';
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
    const finish = once(done);
    let left = tasks.length;
    const out = new Array(left);
    if (!left) return finish(out);
    const guard = setTimeout(() => finish(out), 15000);
    tasks.forEach((task, idx) => {
        const step = once((r) => { out[idx] = r; if (--left === 0) { clearTimeout(guard); finish(out); } });
        try { task(step); } catch (e) { console.error('[Капсула]', e); step(null); }
    });
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
const pGet = (key, def) => {
    if (Object.prototype.hasOwnProperty.call(MEM, key)) return MEM[key] === undefined ? def : MEM[key];
    let v = def;
    try { const raw = localStorage.getItem('cm_' + key); if (raw != null) { const parsed = JSON.parse(raw); if (parsed !== null && parsed !== undefined) v = parsed; } } catch (e) {}
    MEM[key] = v;
    return v;
};
const pSet = (key, val) => { MEM[key] = val; DIRTY[key] = 1; if (!flushTimer) flushTimer = setTimeout(flushStore, 300); };

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
const capsuleSize = () => [60, 85, 100][Perf.tier()];
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
        let q = 'api_key=' + Src.key() + '&language=' + LANG;
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
        if (opts.force && cached) delete Net.mem[url];
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
const WEIGHTS = { history: 3.0, viewed: 3.0, look: 2.6, continued: 3.2, like: 2.8, wath: 1.8, book: 1.2, scheduled: 1.0, card: 1.0, thrown: -2.0 };
const History = {
    read: (cb) => {
        const fire = once(cb);
        const cards = {}, acc = {}, order = [];
        const addCard = (c) => { if (c && c.id && !cards[c.id]) cards[c.id] = c; };
        const typeOf = (c) => { if (!c) return null; if (c.media_type === 'tv' || c.method === 'tv' || c.number_of_seasons || c.first_air_date) return 'tv'; if (c.media_type === 'movie' || c.method === 'movie' || c.release_date || c.title) return 'movie'; return (c.name && !c.title) ? 'tv' : 'movie'; };
        const bump = (id, weight, type, card) => {
            if (!id) return;
            id = parseInt(id, 10);
            if (!id) return;
            if (!acc[id]) { acc[id] = { id, w: 0, type: type || null, card: card || null }; order.push(id); }
            acc[id].w += weight;
            if (type && !acc[id].type) acc[id].type = type;
            if (card && !acc[id].card) acc[id].card = card;
        };
        const withTimeline = once(() => {
            ownedGet('timeline', {}, (timeline) => {
                if (timeline && typeof timeline === 'object') {
                    for (const tk in timeline) {
                        if (!Object.prototype.hasOwnProperty.call(timeline, tk)) continue;
                        const m = /^(movie|tv)_(\d+)/.exec(tk) || /^(\d+)$/.exec(tk);
                        if (m) bump(m[2] || m[1], 1.5, m[1] === 'tv' ? 'tv' : 'movie', null);
                    }
                }
                const out = [];
                order.forEach(id => {
                    const rec = acc[id];
                    if (!rec || rec.w <= 0) return;
                    if (!rec.card && cards[rec.id]) rec.card = cards[rec.id];
                    if (!rec.type) rec.type = typeOf(rec.card);
                    out.push(rec);
                });
                out.sort((a, b) => b.w - a.w);
                fire(out);
            });
        });
        const withFavorite = (fav) => {
            const favHadKeys = {};
            if (fav && typeof fav === 'object') {
                if (isArr(fav.card)) fav.card.forEach(addCard);
                for (const k in fav) {
                    const list = fav[k];
                    if (!isArr(list) || !list.length) continue;
                    favHadKeys[k] = true;
                    const w = WEIGHTS[k] == null ? 1 : WEIGHTS[k];
                    list.forEach((entry, i) => {
                        const recency = 1 + clamp((list.length - i) / Math.max(list.length, 1), 0, 1) * 0.6;
                        if (entry && typeof entry === 'object') { addCard(entry); bump(entry.id, w * recency, typeOf(entry), entry); }
                        else bump(entry, w * recency, null, cards[entry] || null);
                    });
                }
            }
            const extra = ['history', 'view', 'viewed', 'card_history', 'recomends_last', 'wath', 'look', 'like', 'book', 'scheduled', 'continued', 'thrown'].filter(k => !favHadKeys[k]);
            if (!extra.length) return withTimeline();
            let left = extra.length;
            extra.forEach(key => {
                ownedGet(key, null, (list2) => {
                    if (isArr(list2)) list2.forEach(it => {
                        if (it && typeof it === 'object') { addCard(it); bump(it.id, WEIGHTS[key] || 1.6, typeOf(it), it); }
                        else bump(it, WEIGHTS[key] || 1.6, null, null);
                    });
                    if (--left === 0) withTimeline();
                });
            });
        };
        onLampaReady(() => {
            let fav = null;
            try { if (window.Lampa && window.Lampa.Favorite && window.Lampa.Favorite.full) fav = Lampa.Favorite.full(); } catch (e) {}
            if (fav && typeof fav === 'object' && !isEmptyish(fav)) return withFavorite(fav);
            ownedGet('favorite', {}, withFavorite);
        });
    },
    stats: (cb) => {
        const fire = once(cb);
        History.read((items) => {
            const withCards = items.filter(it => it.card).length;
            ownedGet('timeline', {}, (timeline) => fire({ total: items.length, withCards, timeline: timeline ? Object.keys(timeline).length : 0, items }));
        });
    }
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
        if (d.mood) parseQuery(d.mood.q).genresM.forEach(id => { g[id] = (g[id] || 0) + 1.5; });
        Onboard.save({ g, era: d.decade, mood: d.mood ? d.mood.label : null, seeds: d.movies.slice(0, 5).map(m => ({ id: m.id, type: m.media_type === 'tv' ? 'tv' : 'movie', title: m.title || m.name })) });
        pSet('onb_skip', true);
        Onboard.active = false;
        Taste.invalidate();
        vibrate(30);
        notify('Предпочтения сохранены');
        View.refreshCapsule(true);
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
            wrap.appendChild(el('div', 'cm-onb-title', 'Что вы смотрели или слышали?'));
            wrap.appendChild(el('div', 'cm-onb-sub', 'Отметьте знакомое — с этого начнётся подбор.'));
            const grid = el('div', 'cm-onb-grid');
            const cards = Onboard.moviesList.map(m => {
                const c = el('div', 'cm-onb-card' + (d.movies.some(x => x.id === m.id) ? ' sel' : ''));
                if (m.poster_path) {
                    const im = el('img');
                    im.loading = 'lazy'; im.decoding = 'async'; im.alt = '';
                    im.onerror = () => { im.style.display = 'none'; };
                    im.src = Src.imgUrl('w342', m.poster_path);
                    c.appendChild(im);
                }
                c.appendChild(el('div', 't', esc(m.title || m.name || '')));
                c._cmAction = () => { const i = d.movies.findIndex(x => x.id === m.id); if (i >= 0) { d.movies.splice(i, 1); removeClass(c, 'sel'); } else { d.movies.push(m); addClass(c, 'sel'); } vibrate(10); };
                return c;
            });
            if (cards.length) { cards.forEach(c => grid.appendChild(c)); wrap.appendChild(grid); firstRow = Nav.addRow(cards, 'cards', Onboard.cols()); }
            else wrap.appendChild(el('div', 'cm-onb-sub', 'Постеры не загрузились — просто идите дальше.'));
        }
        if (s === 1) {
            wrap.appendChild(el('div', 'cm-onb-title', 'Какие жанры нравятся?'));
            wrap.appendChild(el('div', 'cm-onb-sub', 'Чем больше отметите, тем точнее подбор.'));
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
    cache: null,
    profile: null,
    profileAt: 0,
    TTL: 5 * 60 * 1000,
    invalidate: () => { Taste.profile = null; Taste.profileAt = 0; },
    loadCache: () => { Taste.cache = Taste.cache || pGet('dcache', {}) || {}; return Taste.cache; },
    saveCache: () => {
        const c = Taste.cache || {}, keys = Object.keys(c);
        if (keys.length > 240) { const trimmed = {}; for (let i = keys.length - 240; i < keys.length; i++) trimmed[keys[i]] = c[keys[i]]; Taste.cache = trimmed; }
        pSet('dcache', Taste.cache);
    },
    enrich: (items, limit, cb) => {
        const fire = once(cb);
        const cache = Taste.loadCache(), need = [];
        for (let i = 0; i < Math.min(items.length, limit); i++) {
            const it = items[i], ck = (it.type || 'x') + '_' + it.id;
            if (cache[ck]) continue;
            if (it.card && it.card.genre_ids && it.card.genre_ids.length) {
                cache[ck] = { g: it.card.genre_ids.slice(0, 5), k: [], v: it.card.vote_average || 0, y: yearOf(it.card), n: it.card.title || it.card.name || '', t: it.type || 'movie' };
                continue;
            }
            need.push(it);
        }
        if (!need.length) { Taste.saveCache(); return fire(cache); }
        const tasks = need.map(it => (done) => {
            const order = it.type === 'tv' ? ['tv', 'movie'] : ['movie', 'tv'];
            let n = 0;
            const attempt = () => {
                if (n >= order.length) return done(false);
                const type = order[n++];
                Net.get('/' + type + '/' + it.id, { append_to_response: 'keywords' }, (d) => {
                    if (!d || !d.id) return attempt();
                    const kws = (d.keywords && (d.keywords.keywords || d.keywords.results)) || [];
                    cache[(it.type || type) + '_' + it.id] = {
                        g: (d.genres || []).slice(0, 5).map(g => g.id),
                        k: kws.slice(0, 12).map(k => [k.id, k.name]),
                        v: d.vote_average || 0, y: yearOf(d),
                        n: d.title || d.name || '', t: type
                    };
                    it.type = type; done(true);
                }, attempt, { ttl: 604800000 });
            };
            attempt();
        });
        parallel(tasks, () => { Taste.saveCache(); fire(cache); });
    },
    build: (cb, force) => {
        const fire = once(cb);
        if (!force && Taste.profile && Date.now() - Taste.profileAt < Taste.TTL) return fire(Taste.profile);
        const store = (p) => { Taste.profile = p; Taste.profileAt = Date.now(); fire(p); };
        History.stats((stats) => {
            const items = stats.items;
            if (!items.length) {
                const prof = Onboard.profile();
                if (prof) return store(Onboard.toTaste(prof, stats));
                Log.push('ВКУС: истории нет, беру стартовый профиль');
                return store({
                    empty: true, fallback: true, count: 0,
                    genres: [{ id: 18, score: 3, name: 'Драма' }, { id: 28, score: 2.5, name: 'Боевик' }, { id: 35, score: 2, name: 'Комедия' }],
                    keywords: [], seeds: [], watched: {}, era: 0, avgVote: 6.8, stats
                });
            }
            Taste.enrich(items, 20, (cache) => {
                const gScore = {}, kScore = {}, kName = {}, years = [], votes = [], watched = {}, seeds = [];
                items.forEach(it => {
                    watched[it.id] = true;
                    const d = cache[(it.type || 'movie') + '_' + it.id] || cache['movie_' + it.id] || cache['tv_' + it.id];
                    if (!d) return;
                    (d.g || []).forEach(gid => { const g = TV2MOVIE[gid] || gid; gScore[g] = (gScore[g] || 0) + it.w; });
                    (d.k || []).forEach(pair => { const kid = pair[0]; kScore[kid] = (kScore[kid] || 0) + it.w * 1.2; kName[kid] = pair[1]; });
                    if (d.y) years.push(d.y);
                    if (d.v) votes.push(d.v);
                    if (seeds.length < 6 && it.w > 0) seeds.push({ id: it.id, type: d.t || it.type || 'movie', title: d.n });
                });
                years.sort((a, b) => a - b);
                const onb = Onboard.profile();
                if (onb && onb.g) for (const id in onb.g) { gScore[id] = (gScore[id] || 0) + onb.g[id] * 0.6; }
                store({
                    empty: false, count: items.length, known: years.length,
                    era: years.length ? years[Math.floor(years.length / 2)] : 0,
                    avgVote: votes.length ? votes.reduce((a, b) => a + b, 0) / votes.length : 0,
                    seeds, watched, stats,
                    genres: Object.keys(gScore).map(id => ({ id: parseInt(id, 10), score: gScore[id], name: GENRE_NAMES[id] || '' })).sort((a, b) => b.score - a.score),
                    keywords: Object.keys(kScore).filter(k => kScore[k] > 1.0).map(id => ({ id: parseInt(id, 10), score: kScore[id], name: kName[id] })).sort((a, b) => b.score - a.score)
                });
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
            genre_ids: isArr(raw.genre_ids) ? raw.genre_ids.slice(0, 6) : [],
            popularity: raw.popularity || 0,
            _src: src, _via: via || null
        });
    }
    return out;
};
const SORTS = ['popularity.desc', 'vote_average.desc', 'vote_count.desc', 'revenue.desc'];

const Capsule = {
    stats: null,
    build: (taste, opts, cb) => {
        const fire = once(cb);
        opts = opts || {};
        const force = !!opts.force;
        const depth = opts.depth || 0;
        const CAP = capsuleSize();
        const tasks = [];
        const topG = taste.genres || [];
        const topK = taste.keywords || [];
        const SPAN = 18 + depth * 8;
        const pagesOf = (key, n) => {
            const cnt = depthScale(n);
            if (depth) Cursor.skip(key, depth * 3, SPAN);
            return Cursor.take(key, cnt, SPAN);
        };
        const sortFor = (key) => force ? SORTS[(pGet('sortcur', 0) + key.length) % SORTS.length] : 'popularity.desc';
        if (force) pSet('sortcur', (pGet('sortcur', 0) + 1) % SORTS.length);
        const add = (path, base, type, src, via, pages) => pages.forEach(page => {
            tasks.push(done => Net.get(path, Object.assign({}, base, { page }), (d) => done(markList(d && d.results, type, src, via)), () => done([]), { force }));
        });
        (taste.seeds || []).slice(0, 4).forEach((seed, i) => {
            pagesOf('seed' + i, force ? 2 : 1).forEach(page => {
                tasks.push(done => Net.get('/' + seed.type + '/' + seed.id + '/recommendations', { page }, (d) => done(markList(d && d.results, seed.type, 'seed', { seed: seed.title })), () => done([]), { force }));
            });
        });
        if (topG.length) {
            const gm = topG.slice(0, 3).map(g => g.id).join(',');
            const gt = topG.slice(0, 3).map(g => MOVIE2TV[g.id] || g.id).join(',');
            add('/discover/movie', {
                with_genres: gm, sort_by: sortFor('gm'),
                'vote_count.gte': force ? 120 + rnd(180) : 200,
                'vote_average.gte': clamp(taste.avgVote ? taste.avgVote - 0.6 : 6.4, 6.0, 7.6),
                include_adult: false
            }, 'movie', 'genre', null, pagesOf('gm', force ? 6 : 4));
            add('/discover/tv', {
                with_genres: gt, sort_by: sortFor('gt'),
                'vote_count.gte': 80, 'vote_average.gte': 6.4, include_adult: false
            }, 'tv', 'genre', null, pagesOf('gt', force ? 4 : 3));
        }
        if (topK.length) {
            const kw = shuffle(topK.slice(0, 10)).slice(0, 6);
            add('/discover/movie', {
                with_keywords: kw.map(k => k.id).join('|'), sort_by: sortFor('kw'),
                'vote_count.gte': 120, 'vote_average.gte': 6.2, include_adult: false
            }, 'movie', 'keyword', { kw: kw[0] && kw[0].name }, pagesOf('kw', force ? 4 : 3));
        }
        add('/discover/movie', {
            sort_by: force ? 'vote_average.desc' : 'popularity.desc',
            'vote_count.gte': 300, 'vote_average.gte': 7.0, include_adult: false
        }, 'movie', 'top', null, pagesOf('top', 2));
        add('/discover/movie', {
            sort_by: 'vote_average.desc', 'vote_count.gte': 500, 'vote_average.gte': 7.4,
            'primary_release_date.lte': '2000-12-31', include_adult: false
        }, 'movie', 'classic', null, pagesOf('classic', 2));
        Cursor.take('trend', 1, 3).forEach(page => {
            tasks.push(done => Net.get('/trending/all/week', { page }, (d) => done(markList(d && d.results, null, 'trend')), () => done([]), { force }));
        });
        parallel(tasks, (packs) => {
            const all = [];
            (packs || []).forEach(p => { if (isArr(p)) all.push.apply(all, p); });
            let picked = Capsule.pick(all, taste, { force, depth });
            // ДОБОР: пока набор не заполнен — тянем новые страницы, снижая пороги.
            // Раньше был один запасной заход, и капсула часто оставалась неполной.
            const g0 = topG.length ? topG[0].id : 0;
            const g1 = topG.length > 1 ? topG[1].id : 0;
            const round = (n) => {
                if (picked.length >= CAP || n > 2) return fire(picked);
                const relax = n >= 1;
                const extraTasks = [];
                Cursor.take('fill' + n, depthScale(3), 12).forEach(page => {
                    if (g0) extraTasks.push(done => Net.get('/discover/movie', {
                        with_genres: g0, sort_by: (n % 2) ? 'vote_average.desc' : 'popularity.desc',
                        'vote_count.gte': relax ? 80 : 250, 'vote_average.gte': relax ? 6.0 : 6.6,
                        page, include_adult: false
                    }, (d) => done(markList(d && d.results, 'movie', 'relax')), () => done([]), { force }));
                    if (g1) extraTasks.push(done => Net.get('/discover/tv', {
                        with_genres: MOVIE2TV[g1] || g1, sort_by: 'popularity.desc',
                        'vote_count.gte': relax ? 40 : 100, 'vote_average.gte': 6.2,
                        page, include_adult: false
                    }, (d) => done(markList(d && d.results, 'tv', 'relax')), () => done([]), { force }));
                    extraTasks.push(done => Net.get('/movie/top_rated', { page }, (d) => done(markList(d && d.results, 'movie', 'top')), () => done([]), { force }));
                });
                if (!extraTasks.length) return fire(picked);
                parallel(extraTasks, extra => {
                    (extra || []).forEach(p => { if (isArr(p)) all.push.apply(all, p); });
                    picked = Capsule.pick(all, taste, { force, depth, relax });
                    Log.push('ДОБОР ' + (n + 1) + ': кандидатов ' + all.length + ', в наборе ' + picked.length + '/' + CAP);
                    round(n + 1);
                });
            };
            round(0);
        });
    },
    pick: (all, taste, opts) => {
        opts = opts || {};
        const CAP = capsuleSize();
        const force = !!opts.force, relax = !!opts.relax;
        const seen = {}, scored = [];
        const gWeight = {};
        (taste.genres || []).forEach(g => { gWeight[g.id] = g.score; });
        const maxG = (taste.genres && taste.genres.length) ? taste.genres[0].score : 1;
        const prev = new Set(View.prevIds || []);
        const minVote = relax ? 5.5 : 5.8;
        const minCount = relax ? 30 : 60;
        const cut = { dup: 0, rating: 0, votes: 0, watched: 0 };
        Capsule.stats = { got: all.length, cut, scored: 0, final: 0 };
        all.forEach(it => {
            const key = it.media_type + '_' + it.id;
            if (seen[key]) { seen[key]._score += 3.5; seen[key]._multi = true; cut.dup++; return; }
            if (!it.vote_average || it.vote_average < minVote) { cut.rating++; return; }
            if ((it.vote_count || 0) < minCount) { cut.votes++; return; }
            if (it.id && taste.watched && taste.watched[it.id]) { cut.watched++; return; }
            let s = 0;
            let gHit = 0;
            (it.genre_ids || []).forEach(gid => { const g = TV2MOVIE[gid] || gid; if (gWeight[g]) { s += 4.4 * Math.sqrt(gWeight[g] / maxG); gHit++; } });
            // ни одного пересечения со вкусом — это случайный попутчик, а не находка
            if (!gHit && (taste.genres || []).length && it._src !== 'seed' && it._src !== 'keyword' && it._src !== 'classic') s -= 2.5;
            if (gHit > 1) s += 1.2;
            if (it._src === 'seed') s += 5;
            else if (it._src === 'keyword') s += 4.5;
            else if (it._src === 'classic') s += 3;
            else if (it._src === 'genre') s += 2;
            else if (it._src === 'trend') s += 0.5;
            s += clamp(it.vote_average - 6, 0, 4) * 2.0 + clamp((it.vote_count || 0) / 3000, 0, 1.5);
            if (taste.era) { const y = yearOf(it); if (y) s -= clamp(Math.abs(y - taste.era) / 30, 0, 1.2); }
            if (!it.overview) s -= 1;
            const ago = Seen.ago(it.id);
            if (ago === 1) s -= 14;
            else if (ago === 2) s -= 7;
            else if (ago) s -= clamp(5 - ago * 0.6, 1, 4);
            if (prev.has(it.id)) s -= 16;
            s += (Math.random() - 0.5) * (force ? 4 : 1.2);
            it._score = s; seen[key] = it; scored.push(it);
        });
        scored.sort((a, b) => b._score - a._score);
        const bySrc = {}, byGenre = {}, byDecade = {}, chosen = new Set(), final = [];
        const capSrc = Math.max(5, Math.round(CAP / 6));
        const capGenre = Math.max(8, Math.round(CAP / 3));
        const capDecade = Math.max(10, Math.round(CAP / 2.5));
        const take = (it) => { if (chosen.has(it)) return; chosen.add(it); final.push(it); };
        for (let i = 0; i < scored.length && final.length < CAP; i++) {
            const it = scored[i];
            const src = it._src || 'x';
            const g0 = (it.genre_ids || [])[0] || 0;
            const dec = Math.floor((yearOf(it) || 2000) / 10);
            if ((bySrc[src] || 0) >= capSrc) continue;
            if (g0 && (byGenre[g0] || 0) >= capGenre) continue;
            if ((byDecade[dec] || 0) >= capDecade) continue;
            bySrc[src] = (bySrc[src] || 0) + 1;
            if (g0) byGenre[g0] = (byGenre[g0] || 0) + 1;
            byDecade[dec] = (byDecade[dec] || 0) + 1;
            take(it);
        }
        for (let i = 0; i < scored.length && final.length < CAP; i++) take(scored[i]);
        Capsule.stats.scored = scored.length;
        Capsule.stats.final = final.length;
        Log.push('ОТБОР: пришло ' + all.length + ', годных ' + scored.length + ', в набор ' + final.length
            + ' | отсев: дубли ' + cut.dup + ', рейтинг ' + cut.rating + ', голоса ' + cut.votes + ', смотрел ' + cut.watched);
        if (!final.length && all.length) {
            const rescue = {}, plan = [];
            all.forEach(it => {
                const k = it.media_type + '_' + it.id;
                if (rescue[k] || !it.poster_path) return;
                rescue[k] = 1; plan.push(it);
            });
            plan.sort((a, b) => (b.vote_average || 0) - (a.vote_average || 0));
            Log.push('ОТБОР: сработала страховка, пороги отсеяли всё (' + all.length + ' кандидатов)');
            Capsule.stats.final = Math.min(plan.length, CAP);
            return plan.slice(0, CAP);
        }
        if (force && final.length > 6) {
            const block = 10, out = [];
            for (let i = 0; i < final.length; i += block) out.push.apply(out, shuffle(final.slice(i, i + block)));
            return out;
        }
        return final;
    },
    reason: (item, taste) => {
        if (item._reasonText) return item._reasonText;
        let r = '';
        if (item._src === 'seed' && item._via && item._via.seed) r = 'Похоже на «' + item._via.seed + '»';
        else if (item._src === 'keyword' && item._via && item._via.kw) r = 'Тема: «' + item._via.kw + '»';
        else if (item._src === 'person' && item._via && item._via.person) r = 'С участием: ' + item._via.person;
        else if (item._src === 'classic') r = 'Классика мирового кино';
        else if (item._src === 'genre' || item._src === 'relax') {
            const names = [];
            const gl = (taste && taste.genres) || [];
            for (let i = 0; i < gl.length && names.length < 2; i++) {
                const want = gl[i].id;
                if ((item.genre_ids || []).some(gid => (TV2MOVIE[gid] || gid) === want) && gl[i].name) names.push(gl[i].name);
            }
            r = names.length ? 'Ваши жанры: ' + names.join(' и ') : 'Высокий рейтинг';
        }
        else if (item._src === 'title') r = 'Точное совпадение по названию';
        else if (item._src === 'search') r = (item._via && item._via.query) ? 'По запросу «' + item._via.query + '»' : 'Найдено по запросу';
        else if (item._src === 'trend') r = 'Сейчас смотрят';
        else r = 'Высокий рейтинг';
        if (item._multi) r += ' · совпало по нескольким признакам';
        return (item._reasonText = r);
    }
};

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
        const fire = once(cb);
        depth = depth || 0;
        const ctx = parseQuery(query);
        const SPAN = 14 + depth * 7;
        const ckey = 'q_' + norm(query).slice(0, 24);
        if (depth) Cursor.skip(ckey, depth * 3, SPAN);
        const pages = Cursor.take(ckey, depthScale(force ? 6 : 4), SPAN);
        const stage2 = (kwIds, probe) => {
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
                if (g.length) p.with_genres = g.slice(0, 3).join(',');
                if (ng.length) p.without_genres = ng.slice(0, 4).join(',');
                if (kwIds.length) p.with_keywords = kwIds.slice(0, 5).join('|');
                if (ctx.yearFrom) {
                    if (media === 'tv') { p['first_air_date.gte'] = ctx.yearFrom + '-01-01'; p['first_air_date.lte'] = (ctx.yearTo || ctx.yearFrom) + '-12-31'; }
                    else { p['primary_release_date.gte'] = ctx.yearFrom + '-01-01'; p['primary_release_date.lte'] = (ctx.yearTo || ctx.yearFrom) + '-12-31'; }
                }
                return p;
            };
            const hasFilter = !!(ctx.genresM.length || ctx.tags.length || ctx.yearFrom || kwIds.length);
            if (hasFilter) pages.forEach(page => {
                if (ctx.type !== 'tv') tasks.push(done => Net.get('/discover/movie', discover('movie', page), (d) => done(markList(d && d.results, 'movie', 'search', { query })), () => done([]), { force }));
                if (ctx.type !== 'movie') tasks.push(done => Net.get('/discover/tv', discover('tv', page), (d) => done(markList(d && d.results, 'tv', 'search', { query })), () => done([]), { force }));
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
            parallel(tasks, (packs) => {
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
        Search.resolveTags(ctx.tags, (kwIds) => Search.probe(query, ctx, force, (probe) => stage2(kwIds, probe)));
    },
    relax: (query, ctx, taste, force, cb) => {
        const fire = once(cb);
        const soft = Object.assign({}, ctx, { minVote: 0, minVotes: 0 });
        const tasks = [];
        if (ctx.tokens.length) [1, 2, 3].forEach(page => {
            tasks.push(done => Net.get('/search/multi', { query: String(query).slice(0, 70), page, include_adult: false }, (d) => done(markList(d && d.results, null, 'search', { query })), () => done([]), {}));
        });
        const gm = ctx.genresM.length ? ctx.genresM.slice(0, 2).join(',') : '';
        const gt = ctx.genresT.length ? ctx.genresT.slice(0, 2).join(',') : gm;
        [1, 2, 3].forEach(page => {
            if (gm) tasks.push(done => Net.get('/discover/movie', {
                with_genres: gm, sort_by: 'popularity.desc', include_adult: false, page, 'vote_count.gte': 20
            }, (d) => done(markList(d && d.results, 'movie', 'search', { query })), () => done([]), {}));
            if (gt) tasks.push(done => Net.get('/discover/tv', {
                with_genres: gt, sort_by: 'popularity.desc', include_adult: false, page, 'vote_count.gte': 10
            }, (d) => done(markList(d && d.results, 'tv', 'search', { query })), () => done([]), {}));
        });
        if (!tasks.length) return fire([]);
        parallel(tasks, (packs) => {
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
            if (seen[key]) { seen[key]._score += 2; seen[key]._multi = true; return; }
            if (notG.length && (it.genre_ids || []).some(g => notG.indexOf(g) > -1)) return;
            if (ctx.type === 'tv' && it.media_type !== 'tv') return;
            if (ctx.type === 'movie' && it.media_type !== 'movie') return;
            // отсев мягче прежнего: раньше выдача часто схлопывалась в ноль
            if (ctx.minVote && (it.vote_average || 0) && (it.vote_average || 0) < ctx.minVote - 1.5) return;
            const title = norm(it.title || it.name);
            const orig = norm(it.original_title);
            const over = norm(it.overview);
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
            if (wanted.length && !gHit) s -= 3;
            if (it._src === 'title') s += 4;
            if (it._src === 'person') s += exactHit ? -6 : 5;
            s += clamp((it.vote_average || 0) - 5.5, 0, 5) * 1.5 + clamp((it.vote_count || 0) / 4000, 0, 1.5);
            const y = yearOf(it);
            if (ctx.yearFrom && y) { if (y < ctx.yearFrom || y > (ctx.yearTo || ctx.yearFrom)) s -= 8; else s += 2; }
            else if (y >= curYear - 2) s += 1.5;
            if (!it.overview) s -= 1.5;
            if (!it.vote_count) s -= 2;
            if (taste && taste.watched && taste.watched[it.id]) s -= 4;
            const ago = Seen.ago(it.id);
            if (ago === 1) s -= 10; else if (ago) s -= clamp(6 - ago, 1, 5);
            if (prev.has(it.id)) s -= 12;
            if (force) s += (Math.random() - 0.5) * 4;
            it._score = s; seen[key] = it; out.push(it);
        });
        out.sort((a, b) => b._score - a._score);
        const top = out.slice(0, CAP);
        if (force && top.length > 6) {
            const block = 10, res = [];
            res.push(top[0]); // самое точное попадание всегда первым
            const rest = top.slice(1);
            for (let i = 0; i < rest.length; i += block) res.push.apply(res, shuffle(rest.slice(i, i + block)));
            return res;
        }
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
const N = (n) => clamp(Math.round(n * D()), 4, 700);
const SCENES = {
    astro: () => { const stars = Array.from({ length: N(90) }, () => ({ x: Math.random(), y: Math.random(), r: .4 + Math.random() * 1.2, p: Math.random() * 6.28, v: .004 + Math.random() * .014 })); let shoot = null, wait = 4 + Math.random() * 8, t = 0; return { draw(ctx, W, H, dt) { t += dt; ctx.fillStyle = '#DCE9FF'; stars.forEach(s => { s.x -= s.v * dt * .08; if (s.x < -.02) { s.x = 1.02; s.y = Math.random(); } ctx.globalAlpha = .12 + .14 * Math.sin(t * 1.2 + s.p); ctx.beginPath(); ctx.arc(s.x * W, s.y * H, s.r, 0, 6.283); ctx.fill(); }); const cx = W * .5, cy = H * .5, base = Math.min(W, H); ctx.lineWidth = 1; for (let i = 0; i < 3; i++) { ctx.globalAlpha = .05 - i * .012; ctx.strokeStyle = i % 2 ? '#7FD8FF' : '#FF7A2F'; ctx.beginPath(); ctx.ellipse(cx, cy, base * (.30 + i * .17), base * (.13 + i * .075), Math.sin(t * .05 + i) * .22, 0, 6.283); ctx.stroke(); } wait -= dt; if (!shoot && wait <= 0) { shoot = { x: .1 + Math.random() * .6, y: Math.random() * .5, p: 0 }; wait = 7 + Math.random() * 11; } if (shoot) { shoot.p += dt * .55; if (shoot.p >= 1) shoot = null; else { const x = (shoot.x + shoot.p * .3) * W, y = (shoot.y + shoot.p * .18) * H, len = base * .06; ctx.globalAlpha = .28 * Math.sin(shoot.p * Math.PI); ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - len, y - len * .6); ctx.stroke(); } } ctx.globalAlpha = 1; } }; },
    lab: () => { const mk = (bottom) => ({ x: .05 + Math.random() * .9, y: bottom ? 1.05 + Math.random() * .35 : Math.random(), r: 3 + Math.random() * 14, v: .02 + Math.random() * .06, w: Math.random() * 6.28, ws: .4 + Math.random() * .8 }); const bubbles = Array.from({ length: N(30) }, () => mk(false)); let t = 0; return { draw(ctx, W, H, dt) { t += dt; bubbles.forEach(b => { b.y -= b.v * dt; b.x += Math.sin(t * b.ws + b.w) * .0007; if (b.y < -.1) Object.assign(b, mk(true)); const x = b.x * W, y = b.y * H; const fade = clamp(b.y * 5, 0, 1) * clamp((1.05 - b.y) * 3.5, 0, 1); ctx.globalAlpha = .14 * fade; ctx.strokeStyle = '#D6E24A'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(x, y, b.r, 0, 6.283); ctx.stroke(); ctx.globalAlpha = .07 * fade; ctx.fillStyle = '#1FAE96'; ctx.beginPath(); ctx.arc(x, y, b.r * .92, 0, 6.283); ctx.fill(); ctx.globalAlpha = .18 * fade; ctx.fillStyle = '#F4FBDA'; ctx.beginPath(); ctx.arc(x - b.r * .33, y - b.r * .33, Math.max(.8, b.r * .22), 0, 6.283); ctx.fill(); }); ctx.globalAlpha = 1; } }; },
    matrix: () => { const CH = 'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホ0123456789ABCDEF<>=*+-'; const ch = () => CH.charAt(rnd(CH.length)); let cols = [], size = 16; const mkCol = () => { const len = 6 + rnd(16); return { y: -rnd(30), v: 5 + Math.random() * 13, len, s: Array.from({ length: len }, ch) }; }; return { fps: 22, resize(W) { size = clamp(Math.round(W / (46 * D())), 12, 30); cols = Array.from({ length: Math.ceil(W / size) + 1 }, mkCol); }, draw(ctx, W, H, dt) { if (!cols.length) this.resize(W); ctx.font = size + 'px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace'; ctx.textBaseline = 'top'; for (let i = 0; i < cols.length; i++) { const c = cols[i]; c.y += c.v * dt; c.s[rnd(c.len)] = ch(); for (let k = 0; k < c.len; k++) { const y = (c.y - k) * size; if (y < -size || y > H) continue; const f = 1 - k / c.len; if (k === 0) { ctx.globalAlpha = .38; ctx.fillStyle = '#C8FFD4'; } else { ctx.globalAlpha = .18 * f * f; ctx.fillStyle = '#00FF41'; } ctx.fillText(c.s[k], i * size, y); } if ((c.y - c.len) * size > H) cols[i] = mkCol(); } ctx.globalAlpha = 1; } }; },
    scroll: () => { const GL = ['永', '道', '心', '和', '氣', '龍', '風', '静']; const mkG = (bottom) => ({ x: .05 + Math.random() * .9, y: bottom ? 1.06 + Math.random() * .3 : Math.random(), s: 14 + Math.random() * 24, v: .014 + Math.random() * .026, rot: (Math.random() - .5) * .32, a: Math.random() * 6.28, ch: pickOne(GL) }); const mkP = (top) => ({ x: top ? Math.random() * 1.1 - .1 : Math.random(), y: top ? -.06 - Math.random() * .25 : Math.random(), r: 2.8 + Math.random() * 4.5, vx: .008 + Math.random() * .022, vy: .02 + Math.random() * .038, rot: Math.random() * 6.28, vr: (Math.random() - .5) * 1.3, sw: Math.random() * 6.28 }); const glyphs = Array.from({ length: N(16) }, () => mkG(false)); const petals = Array.from({ length: N(28) }, () => mkP(false)); let t = 0; return { draw(ctx, W, H, dt) { t += dt; ctx.fillStyle = '#E7D7B0'; glyphs.forEach(g => { g.y -= g.v * dt; g.x += Math.sin(t * .5 + g.a) * .0005; if (g.y < -.14) Object.assign(g, mkG(true)); const fade = clamp(g.y * 3, 0, 1) * clamp((1.06 - g.y) * 3, 0, 1); ctx.globalAlpha = (.04 + .025 * Math.sin(t * .8 + g.a)) * fade; ctx.font = g.s + 'px "Songti SC","Noto Serif CJK",serif'; ctx.save(); ctx.translate(g.x * W, g.y * H); ctx.rotate(g.rot); ctx.fillText(g.ch, 0, 0); ctx.restore(); }); ctx.fillStyle = '#D9A7A7'; petals.forEach(p => { p.x += (p.vx + Math.sin(t * .9 + p.sw) * .012) * dt; p.y += p.vy * dt; p.rot += p.vr * dt; if (p.y > 1.1 || p.x > 1.12) Object.assign(p, mkP(true)); ctx.globalAlpha = .07 + .025 * Math.sin(t + p.sw); ctx.save(); ctx.translate(p.x * W, p.y * H); ctx.rotate(p.rot); ctx.beginPath(); ctx.ellipse(0, 0, p.r, p.r * .52, .5, 0, 6.283); ctx.fill(); ctx.restore(); }); ctx.globalAlpha = 1; } }; },
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
                g.y -= g.v * dt; g.x += Math.sin(t * .5 + g.a) * .0005;
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
    }
};

// Единый rAF-цикл с настоящим watchdog (по метке времени)
const Fx = {
    canvas: null, ctx: null, scene: null, raf: null, last: 0, tick: 0,
    W: 1, H: 1, root: null, resizeT: null, _watchdog: null, _frame: null, _ro: null,
    stop: () => {
        if (Fx.raf) cancelAnimationFrame(Fx.raf);
        Fx.raf = null; Fx.scene = null; Fx._frame = null;
        if (Fx._watchdog) { clearInterval(Fx._watchdog); Fx._watchdog = null; }
        clearTimeout(Fx.resizeT); Fx.resizeT = null;
        window.removeEventListener('resize', Fx._onResize);
        window.removeEventListener('orientationchange', Fx._onResize);
        if (Fx._ro) { try { Fx._ro.disconnect(); } catch (e) {} Fx._ro = null; }
        if (Fx.canvas && Fx.canvas.parentNode) Fx.canvas.parentNode.removeChild(Fx.canvas);
        Fx.canvas = null; Fx.ctx = null; Fx.root = null;
    },
    pause: () => { if (Fx.raf) { cancelAnimationFrame(Fx.raf); Fx.raf = null; } },
    resume: () => { if (Fx.canvas && Fx.scene && !Fx.raf && Fx._frame) { Fx.last = 0; Fx.tick = Date.now(); Fx.raf = requestAnimationFrame(Fx._frame); } },
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
    ensureSize: () => { [0, 120, 400, 1200].forEach(ms => setTimeout(Fx._resize, ms)); },
    start: (root, mode) => {
        Fx.stop();
        if (!root || mode === 'none' || reducedMotion() || pGet('fx', true) === false) return;
        const canvas = el('canvas', 'cm-rain');
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
            Fx.raf = requestAnimationFrame(frame);
            if (!Fx.canvas.parentNode || document.hidden || !App.active) { Fx.last = now; return; }
            const target = 1000 / ((Fx.scene.fps || Perf.fps()) / (Modal.active() ? 2 : 1));
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
        Fx.raf = requestAnimationFrame(frame);
        // если rAF замер (ТВ-браузеры любят это делать) — поднимаем цикл
        Fx._watchdog = setInterval(() => {
            if (!App.active || !Fx.canvas || !Fx.scene || document.hidden) return;
            if (Date.now() - Fx.tick < 2500) return;
            if (Fx.raf) { cancelAnimationFrame(Fx.raf); Fx.raf = null; }
            Fx.last = 0; Fx.tick = Date.now();
            Fx.raf = requestAnimationFrame(frame);
        }, 4000);
    }
};

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
    { key: 'kungfu',  name: 'Кунг-фу Панда',      re: /(kung ?fu panda|кунг ?фу панда)/,                          accent: '#D8433C', accent2: '#DA9C2A', bg: '#1C140B', fx: 'pandafilm' },
    { key: 'spider',  name: 'Человек-паук',       re: /(spider ?man|человек ?паук|паучок|spider verse)/,          accent: '#BC0B26', accent2: '#5B8DEF', bg: '#0A0A14', fx: 'spider' },
    { key: 'shrek',   name: 'Шрэк',               re: /(shrek|шрэк|шрек)/,                                        accent: '#D1D646', accent2: '#88796B', bg: '#121608', fx: 'swamp' },
    { key: 'tmnt',    name: 'Черепашки-ниндзя',   re: /(teenage mutant|ninja turtles|черепашки ниндзя)/,          accent: ['#D23A07', '#0341AC', '#93339C', '#EF0008'], accent2: '#504B26', bg: '#0C1208', fx: 'none' },
    { key: 'dragon',  name: 'Как приручить дракона', re: /(how to train your dragon|как приручить дракона)/,      accent: '#609C47', accent2: '#C21509', bg: '#08120E', fx: 'dragon' },
    { key: 'puss',    name: 'Кот в сапогах',      re: /(puss in boots|кот в сапогах)/,                            accent: '#CB6220', accent2: '#5A6129', bg: '#140E06', fx: 'claws' },
    // придумано сверх списка
    { key: 'matrix',  name: 'Матрица',            re: /(the matrix|матрица)/,                                     accent: '#00FF41', accent2: '#00B32E', bg: '#000600', fx: 'matrix' },
    { key: 'potter',  name: 'Волшебный мир',      re: /(harry potter|гарри поттер|fantastic beasts|фантастические твари)/, accent: '#B8873B', accent2: '#6E1F23', bg: '#0B0A12', fx: 'sparks' },
    { key: 'starwars', name: 'Звёздные войны',    re: /(star wars|звездные войны|mandalorian|мандалорец)/,        accent: '#FFE81F', accent2: '#4BD5FF', bg: '#020409', fx: 'galaxy' },
    { key: 'minions', name: 'Миньоны',            re: /(despicable me|гадкий я|minions|миньоны)/,                 accent: '#F5D33C', accent2: '#3B6FD4', bg: '#14120A', fx: 'none' },
    { key: 'iceage',  name: 'Ледниковый период',  re: /(ice age|ледниковый период)/,                              accent: '#8FD8F2', accent2: '#C9E9F7', bg: '#0A1620', fx: 'snow' },
    { key: 'pirates', name: 'Пираты',             re: /(pirates of the caribbean|пираты карибского)/,             accent: '#C79A4B', accent2: '#2E5A63', bg: '#100C08', fx: 'noir' },
    { key: 'wick',    name: 'Джон Уик',           re: /(john wick|джон уик)/,                                     accent: '#E23B3B', accent2: '#2C7CF0', bg: '#07070A', fx: 'blade' },
    { key: 'dune',    name: 'Дюна',               re: /(^| )dune( |$)|дюна/,                                      accent: '#E7B46A', accent2: '#8EC7B1', bg: '#17100A', fx: 'dune' },
    { key: 'avatar',  name: 'Пандора',            re: /(avatar|аватар)/,                                          accent: '#2FA7E0', accent2: '#7CFF6B', bg: '#05101A', fx: 'dream' },
    { key: 'ring',    name: 'Средиземье',         re: /(lord of the rings|властелин колец|the hobbit|хоббит)/,    accent: '#C9A227', accent2: '#4A5D3A', bg: '#0C0E0A', fx: 'scroll' },
    { key: 'madagascar', name: 'Мадагаскар',      re: /(madagascar|мадагаскар)/,                                  accent: '#E8B33C', accent2: '#3E8E5A', bg: '#12140A', fx: 'none' },
    { key: 'nemo',    name: 'Немо',               re: /(finding nemo|finding dory|в поисках немо|в поисках дори)/, accent: '#F2711C', accent2: '#1B6CA8', bg: '#04121C', fx: 'dream' },
    { key: 'cars',    name: 'Тачки',              re: /(^| )cars( |$)|тачки/,                                     accent: '#D62828', accent2: '#F0A202', bg: '#140A08', fx: 'none' },
    { key: 'jurassic', name: 'Парк Юрского',      re: /(jurassic|парк юрского|мир юрского)/,                      accent: '#C4762A', accent2: '#3E6B3A', bg: '#0B1108', fx: 'claws' },
    // ── комиксы ──────────────────────────────────────────────
    { key: 'ironman', name: 'Железный человек',   re: /(iron man|железный человек)/,                              accent: '#D62828', accent2: '#F0A202', bg: '#140A08', fx: 'embers' },
    { key: 'thor',    name: 'Асгард',             re: /(^| )thor( |$)|тор рагнарек|тор любовь|тор царство/,      accent: '#4FA3E3', accent2: '#D8B24A', bg: '#060A12', fx: 'lightning' },
    { key: 'batman',  name: 'Готэм',              re: /(batman|бэтмен|бетмен|темный рыцарь)/,                     accent: '#C8A64B', accent2: '#7A8B99', bg: '#07070A', fx: 'bats' },
    { key: 'joker',   name: 'Джокер',             re: /(joker|джокер)/,                                           accent: '#8B5CF6', accent2: '#3FA34D', bg: '#0A080C', fx: 'noir' },
    { key: 'superman', name: 'Криптон',           re: /(superman|супермен)/,                                      accent: '#1F6FEB', accent2: '#E23B3B', bg: '#050912', fx: 'sparks' },
    { key: 'guardians', name: 'Стражи галактики', re: /(guardians of the galaxy|стражи галактики)/,               accent: '#7C4DFF', accent2: '#FF8A3D', bg: '#06060F', fx: 'astro' },
    { key: 'deadpool', name: 'Дэдпул',            re: /(deadpool|дэдпул|дедпул)/,                                 accent: '#D0242B', accent2: '#B9B9B9', bg: '#0B0708', fx: 'confetti' },
    { key: 'venom',   name: 'Симбиот',            re: /(venom|веном)/,                                            accent: '#9BA3AE', accent2: '#5B8DEF', bg: '#05060A', fx: 'blade' },
    { key: 'avengers', name: 'Мстители',          re: /(avengers|мстители|marvel)/,                               accent: '#E23636', accent2: '#5B8DEF', bg: '#0A0D16', fx: 'sparks' },
    // ── фантастика и боевики ────────────────────────────────
    { key: 'terminator', name: 'Скайнет',         re: /(terminator|терминатор)/,                                  accent: '#E23B3B', accent2: '#8FA3B8', bg: '#08090C', fx: 'embers' },
    { key: 'alien',   name: 'Чужой',              re: /(^| )aliens?( |$)|чужой|чужие|prometheus|прометей/,     accent: '#7FD8C0', accent2: '#8A6BD1', bg: '#04070A', fx: 'ash' },
    { key: 'predator', name: 'Хищник',            re: /(predator|хищник)/,                                        accent: '#8FC93A', accent2: '#C0392B', bg: '#070B06', fx: 'ash' },
    { key: 'bttf',    name: 'Назад в будущее',    re: /(back to the future|назад в будущее)/,                     accent: '#F0A202', accent2: '#5B8DEF', bg: '#0A0A10', fx: 'lightning' },
    { key: 'tron',    name: 'Сетка',              re: /(^| )tron( |$)|трон наследие/,                            accent: '#4BD5FF', accent2: '#F0A202', bg: '#03070C', fx: 'grid' },
    { key: 'blade',   name: 'Бегущий по лезвию',  re: /(blade runner|бегущий по лезвию)/,                         accent: '#F2B6FF', accent2: '#74E5FF', bg: '#090D16', fx: 'blade' },
    { key: 'interstellar', name: 'Дальний космос', re: /(interstellar|интерстеллар)/,                             accent: '#B8C4D6', accent2: '#E3A857', bg: '#04060C', fx: 'astro' },
    { key: 'martian', name: 'Марс',               re: /(the martian|марсианин)/,                                  accent: '#E07A3E', accent2: '#8FB8D6', bg: '#120903', fx: 'dune' },
    { key: 'fast',    name: 'Форсаж',             re: /(форсаж|fast furious|fast and the furious|fate of the furious)/, accent: '#E23B3B', accent2: '#F0A202', bg: '#0A0708', fx: 'embers' },
    { key: 'bond',    name: 'Агент 007',          re: /(james bond|агент 007|skyfall|скайфолл|spectre|спектр|no time to die)/, accent: '#C8A64B', accent2: '#5B8DEF', bg: '#08080B', fx: 'noir' },
    { key: 'mission', name: 'Миссия невыполнима', re: /(mission impossible|миссия невыполнима)/,                  accent: '#E23B3B', accent2: '#5B8DEF', bg: '#07080C', fx: 'blade' },
    { key: 'hunger',  name: 'Голодные игры',      re: /(hunger games|голодные игры)/,                             accent: '#E0762B', accent2: '#8FA3B8', bg: '#0A0806', fx: 'embers' },
    { key: 'indiana', name: 'Индиана Джонс',      re: /(indiana jones|индиана джонс)/,                            accent: '#C08A3E', accent2: '#6B8E5A', bg: '#120D07', fx: 'dune' },
    { key: 'mummy',   name: 'Мумия',              re: /(the mummy|мумия)/,                                        accent: '#D9A441', accent2: '#7A5C3A', bg: '#120E08', fx: 'dune' },
    { key: 'titanic', name: 'Титаник',            re: /(titanic|титаник)/,                                        accent: '#5B8DEF', accent2: '#D9C08A', bg: '#050A14', fx: 'snow' },
    // ── фэнтези и сериалы ───────────────────────────────────
    { key: 'got',     name: 'Вестерос',           re: /(game of thrones|игра престолов|house of the dragon|дом дракона)/, accent: '#C0A062', accent2: '#6E8CA0', bg: '#0A0C10', fx: 'snow' },
    { key: 'witcher', name: 'Ведьмак',            re: /(the witcher|ведьмак)/,                                    accent: '#C9CDD2', accent2: '#B0392B', bg: '#0A0A0C', fx: 'ash' },
    { key: 'stranger', name: 'Изнанка',           re: /(stranger things|очень странные дела)/,                    accent: '#E01E37', accent2: '#5B8DEF', bg: '#08060A', fx: 'lightning' },
    { key: 'breakingbad', name: 'Во все тяжкие',  re: /(breaking bad|во все тяжкие|better call saul|лучше звоните солу)/, accent: '#D6E24A', accent2: '#1FAE96', bg: '#0B0E08', fx: 'lab' },
    { key: 'sherlock', name: 'Шерлок',            re: /(sherlock|шерлок)/,                                        accent: '#B08D57', accent2: '#7A8B99', bg: '#0A0A0B', fx: 'noir' },
    { key: 'supernatural', name: 'Сверхъестественное', re: /(supernatural|сверхъестественное)/,                   accent: '#C9A227', accent2: '#8FA3B8', bg: '#08070A', fx: 'embers' },
    { key: 'friends', name: 'Друзья',             re: /(^| )friends( |$)|^друзья( |$)/,                                        accent: '#E0453E', accent2: '#F2C21B', bg: '#0C0A0A', fx: 'confetti' },
    { key: 'jumanji', name: 'Джуманджи',          re: /(jumanji|джуманджи)/,                                      accent: '#3FA34D', accent2: '#D9A441', bg: '#07110A', fx: 'leaves' },
    // ── ужасы ────────────────────────────────────────────────
    { key: 'conjuring', name: 'Заклятие',         re: /(the conjuring|заклятие|annabelle|аннабель)/,              accent: '#B0392B', accent2: '#7A8B99', bg: '#07070A', fx: 'ash' },
    { key: 'saw',     name: 'Пила',               re: /(^| )saw( |$)|^пила|пила игра/,                           accent: '#3FA34D', accent2: '#B0392B', bg: '#080807', fx: 'noir' },
    { key: 'halloween', name: 'Хэллоуин',         re: /(halloween|хэллоуин|хеллоуин)/,                            accent: '#E8792B', accent2: '#6E4B8C', bg: '#0A0708', fx: 'bats' },
    { key: 'vampire', name: 'Клыки',              re: /(dracula|дракула|twilight|сумерки|nosferatu|носферату)/,   accent: '#8C1C2B', accent2: '#9BA3AE', bg: '#07060A', fx: 'bats' },
    // ── мультфильмы ─────────────────────────────────────────
    { key: 'frozen',  name: 'Холодное сердце',    re: /(^| )frozen( |$)|холодное сердце/,                        accent: '#7EC8F0', accent2: '#C9A7E8', bg: '#061018', fx: 'snow' },
    { key: 'lionking', name: 'Король Лев',        re: /(lion king|король лев)/,                                   accent: '#E0A03C', accent2: '#B0553A', bg: '#140E06', fx: 'dune' },
    { key: 'moana',   name: 'Моана',              re: /(moana|моана)/,                                            accent: '#1CA9C9', accent2: '#F2A65A', bg: '#04121A', fx: 'dream' },
    { key: 'toystory', name: 'История игрушек',   re: /(toy story|история игрушек)/,                              accent: '#E0453E', accent2: '#F2C21B', bg: '#0A0C14', fx: 'confetti' },
    { key: 'monsters', name: 'Корпорация монстров', re: /(monsters inc|корпорация монстров|университет монстров)/, accent: '#3FA34D', accent2: '#5BC0EB', bg: '#08120C', fx: 'confetti' },
    { key: 'insideout', name: 'Головоломка',      re: /(inside out|головоломка)/,                                 accent: '#F2C21B', accent2: '#E05FA8', bg: '#0A0814', fx: 'confetti' },
    { key: 'zootopia', name: 'Зверополис',        re: /(zootopia|зверополис)/,                                    accent: '#E8792B', accent2: '#5BC0EB', bg: '#0A0C10', fx: 'confetti' },
    { key: 'walle',   name: 'ВАЛЛ-И',             re: /(wall ?e|валл ?и)/,                                        accent: '#D9A441', accent2: '#7FD8FF', bg: '#100C06', fx: 'ash' },
    { key: 'naruto',  name: 'Наруто',             re: /(naruto|наруто|boruto|боруто)/,                            accent: '#F58A07', accent2: '#2E6FD6', bg: '#0C0A06', fx: 'leaves' },
    { key: 'titan',   name: 'Атака титанов',      re: /(attack on titan|атака титанов)/,                          accent: '#8C6B3F', accent2: '#B0392B', bg: '#0A0906', fx: 'ash' },
    { key: 'onepiece', name: 'Ван Пис',           re: /(one piece|ван пис)/,                                      accent: '#E0453E', accent2: '#F0C244', bg: '#04101A', fx: 'dream' },
    { key: 'pokemon', name: 'Покемон',            re: /(pokemon|покемон|покемоны)/,                               accent: '#F2C21B', accent2: '#E23B3B', bg: '#0A0C14', fx: 'sparks' },
    { key: 'ghibli',  name: 'Гибли',              re: /(унесенные призраками|spirited away|мой сосед тоторо|totoro|ходячий замок|howl s moving castle|принцесса мононоке|mononoke)/, accent: '#7FBF6A', accent2: '#7FD8FF', bg: '#07120A', fx: 'fireflies' }
];
const FilmTheme = {
    key: null,
    enabled: () => !!pGet('filmtheme', false),
    match: (m) => {
        if (!m) return null;
        const t = norm((m.title || m.name || '') + ' ' + (m.original_title || ''));
        if (!t) return null;
        for (let i = 0; i < FILM_THEMES.length; i++) if (FILM_THEMES[i].re.test(t)) return FILM_THEMES[i];
        return null;
    },
    clearClasses: (root) => { FILM_THEMES.forEach(f => removeClass(root, 'cm-f-' + f.key)); removeClass(root, 'cm-film'); },
    apply: (m) => {
        const root = View.root;
        if (!root) return;
        if (!FilmTheme.enabled()) { if (FilmTheme.key) FilmTheme.reset(); return; }
        const f = FilmTheme.match(m);
        const key = f ? f.key : null;
        if (key === FilmTheme.key) return;
        if (!f) return FilmTheme.reset();
        FilmTheme.key = key;
        FilmTheme.clearClasses(root);
        addClass(root, 'cm-film');
        addClass(root, 'cm-f-' + f.key);
        const accent = isArr(f.accent) ? pickOne(f.accent) : f.accent;
        root.style.setProperty('--cm-accent', accent);
        root.style.setProperty('--cm-accent2', f.accent2);
        root.style.setProperty('--cm-accent-rgb', hexRgb(accent));
        root.style.setProperty('--cm-accent2-rgb', hexRgb(f.accent2));
        if (f.bg) root.style.setProperty('--cm-bg', f.bg);
        const sl = root.querySelector('.cm-sysline');
        if (sl) sl.textContent = String(f.name || '').toUpperCase();
        Fx.start(root, f.fx || 'none');
        Fx.ensureSize();
        Log.push('ТЕМА ПОД ФИЛЬМ: ' + f.name);
    },
    reset: () => {
        if (!FilmTheme.key) return;
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
}`;
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
    rows: [], r: 0, c: 0,
    reset: () => { Nav.rows = []; Nav.r = 0; Nav.c = 0; },
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
        if (View.root) { const old = View.root.querySelectorAll('.cm-focus'); for (let i = 0; i < old.length; i++) removeClass(old[i], 'cm-focus'); }
        const cur = Nav.current();
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
    if (!App.active) return;
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
const swipe = { x: 0, y: 0, t: 0, on: false };
const onTouchStart = (e) => { if (!App.active || Modal.active() || Onboard.active) return; swipe.x = e.touches[0].clientX; swipe.y = e.touches[0].clientY; swipe.t = Date.now(); swipe.on = true; };
const onTouchEnd = (e) => {
    if (!swipe.on || !App.active || Modal.active() || Onboard.active) return;
    swipe.on = false;
    const t = e.changedTouches[0];
    const dx = t.clientX - swipe.x, dy = t.clientY - swipe.y;
    const vx = Math.abs(dx) / Math.max(Date.now() - swipe.t, 1);
    if ((Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) || (vx > 0.5 && Math.abs(dx) > 28)) { vibrate(12); View.step(dx > 0 ? -1 : 1); }
};
document.addEventListener('touchstart', onTouchStart, { passive: true });
document.addEventListener('touchend', onTouchEnd, { passive: true });

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
    busy: false, token: 0, _busyT: null, _enrichT: null, _dir: 0, _imgToken: 0,

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
        }, 22000);
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
                    const ids = list.map(i => i.id);
                    const prev = View.prevIds || [];
                    const ov = overlapRatio(ids, prev);
                    const sameHead = !!(ids.length && prev.length && ids[0] === prev[0]);
                    if (opts.force && list.length && (ov > 0.34 || sameHead) && depth < 2) return attempt(depth + 1);
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
        View.prevIds = st.prevIds || st.list.map(i => i.id);
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
        View.prevIds = list.map(i => i.id);
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
            : ('Данные не дошли до экрана.' + stat + ' Откройте «Журнал» — там видно, на каком шаге обрыв.');
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
        acts.appendChild(bPlay); acts.appendChild(bMore);
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
        Nav.addRow([bPlay, bMore], 'actions');
        Nav.addRow([bSet, bChange, bSearch], 'bar');
        Nav.setFocus(1, 0, true);

        View.ui = { wrap, port, poster, img, rate, chipSrc, chipType, chipYear, name, quote, genres, why, over };
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
        removeClass(u.img, 'ready');
        removeClass(u.poster, 'empty');
        const url = m.poster_path ? Src.imgUrl('w500', m.poster_path) : '';
        u.img.onload = () => { if (token === View._imgToken) addClass(u.img, 'ready'); };
        u.img.onerror = () => { if (token === View._imgToken) { addClass(u.poster, 'empty'); removeClass(u.img, 'ready'); } };
        if (url) { if (u.img.getAttribute('src') !== url) u.img.src = url; else addClass(u.img, 'ready'); }
        else { u.img.removeAttribute('src'); addClass(u.poster, 'empty'); }
        u.rate.textContent = '★ ' + (m.vote_average ? m.vote_average.toFixed(1) : '—');

        const year = yearOf(m);
        u.chipSrc.textContent = (View.sourceLabel || 'КАПСУЛА') + ' · ' + (View.idx + 1) + '/' + View.list.length;
        u.chipType.textContent = m.media_type === 'tv' ? 'СЕРИАЛ' : 'ФИЛЬМ';
        u.chipYear.textContent = year ? String(year) : '—';
        u.name.textContent = m.title || m.name || '';
        u.quote.textContent = Themes.quote(Themes.current());
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

        View.shown[m.id] = 1;
        FilmTheme.apply(m);
        View.setGlow(m);
        View.preload();
        View.enrichLater(m);
    },

    // догрузка деталей — с задержкой, чтобы быстрое листание не слало запросы
    enrichLater: (m) => {
        clearTimeout(View._enrichT);
        View._enrichT = setTimeout(() => {
            if (View.current() !== m || !View.ui) return;
            const type = m.media_type === 'tv' ? 'tv' : 'movie';
            Net.get('/' + type + '/' + m.id, {}, (d) => {
                const u = View.ui;
                if (!u || View.current() !== m || !d) return;
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
            if (it && it.poster_path) { const im = new Image(); im.decoding = 'async'; im.src = Src.imgUrl('w500', it.poster_path); }
        });
    },

    setGlow: (m) => {
        if (!View.glow) return;
        if (!pGet('glow', true)) { removeClass(View.glow, 'on'); return; }
        const url = m.backdrop_path ? Src.imgUrl('w780', m.backdrop_path) : Src.imgUrl('w342', m.poster_path);
        if (!url) { removeClass(View.glow, 'on'); return; }
        if (View.glow._url === url) { addClass(View.glow, 'on'); return; }
        const img = new Image();
        img.decoding = 'async';
        img.onload = () => {
            if (!View.glow) return;
            View.glow._url = url;
            View.glow.style.backgroundImage = 'url(' + url + ')';
            addClass(View.glow, 'on');
        };
        img.onerror = () => { if (View.glow) removeClass(View.glow, 'on'); };
        img.src = url;
    },

    details: (m) => {
        if (!m) return;
        Modal.open({ title: 'Загружаем…', tag: 'wait', items: [{ label: 'Закрыть' }] });
        const type = m.media_type === 'tv' ? 'tv' : 'movie';
        Net.get('/' + type + '/' + m.id, {}, (d) => {
            if (Modal.tag() !== 'wait') return;
            const title = d.title || d.name || '';
            const year = (d.release_date || d.first_air_date || '').slice(0, 4);
            const genres = (d.genres || []).map(g => g.name).join(', ');
            const score = d.vote_average ? d.vote_average.toFixed(1) : '—';
            let html = '<b>' + esc(title) + '</b>' + (year ? ' (' + year + ')' : '') + ' · ★ ' + score + (d.runtime ? ' · ' + fmtRuntime(d.runtime) : '');
            if (genres) html += '<br>' + esc(genres);
            html += '<br><br>' + esc(d.overview || 'Описания нет.');
            Modal.open({ title: 'Подробнее', text: html, items: [{ label: 'Смотреть', onSelect: () => play(m) }, { label: 'Закрыть' }] });
        }, () => { if (Modal.tag() === 'wait') Modal.close(); notify('Не удалось загрузить описание'); }, { ttl: 604800000 });
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
            title: 'Настройки',
            items: [
                { label: 'Тема: ' + THEMES[Themes.current()].name, onSelect: () => UI.themes() },
                { label: 'Свет от постера: ' + (pGet('glow', true) ? 'включён' : 'выключен'), onSelect: () => { pSet('glow', !pGet('glow', true)); const m = View.current(); if (m) View.setGlow(m); UI.settings(); } },
                { label: 'Фоновая анимация: ' + (pGet('fx', true) ? 'включена' : 'выключена'), hint: 'выключите, если подтормаживает', onSelect: () => { pSet('fx', !pGet('fx', true)); Themes.apply(Themes.current(), View.root); Fx.ensureSize(); UI.settings(); } },
                { label: 'Производительность: ' + perfLabel(pGet('perf', 'auto')), hint: 'класс устройства: размытия и частота кадров', onSelect: () => UI.perf() },
                { label: 'Плотность эффектов: ' + fxDensityLabel(), hint: 'сколько частиц в фоновой сцене', onSelect: () => UI.density() },
                { label: 'Смещение интерфейса: ' + offsetLabel(), hint: 'двигается стрелками, 25 положений', onSelect: () => UI.stageOffset() },
                { label: 'Тема под фильм: ' + (pGet('filmtheme', false) ? 'включена' : 'выключена'), hint: 'эксперимент — палитра и анимация под франшизу', onSelect: () => { pSet('filmtheme', !pGet('filmtheme', false)); FilmTheme.key = null; if (!pGet('filmtheme', false)) { FilmTheme.clearClasses(View.root); Themes.apply(Themes.current(), View.root); Fx.ensureSize(); } else FilmTheme.apply(View.current()); UI.settings(); } },
                { label: 'Пройти тест предпочтений', hint: 'пересобрать вкус с нуля', onSelect: () => Onboard.start() },
                { label: 'Проверка соединения', hint: 'если пусто на ТВ — начните отсюда', onSelect: () => Settings.diagnose() },
                { label: 'Журнал', hint: 'что именно пошло не так (для ТВ)', onSelect: () => Log.show() },
                { label: 'Свой ключ TMDb', hint: pGet('tmdb_key', '') ? 'задан' : 'берётся из Lampa', onSelect: () => Settings.askKey() },
                { label: 'Адрес API TMDb', hint: pGet('tmdb_proxy', '') ? 'свой' : 'как в Lampa (' + Src.where() + ')', onSelect: () => Settings.askProxy() },
                { label: 'Адрес картинок TMDb', hint: pGet('img_proxy', '') ? 'свой' : 'как в Lampa', onSelect: () => Settings.askImg() },
                { label: 'Очистить журнал показов', hint: 'запомнено ' + Seen.size() + ' — снова покажем отложенное', onSelect: () => { View.shown = {}; Seen.clear(); Cursor.reset(); notify('Журнал очищен'); } },
                { label: 'Сбросить настройки сети', hint: 'вернуть адреса и ключ к состоянию «как в Lampa»', onSelect: () => UI.resetNet() },
                { label: 'Закрыть' }
            ]
        });
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
                { label: 'Отмена', onSelect: () => UI.settings() }
            ]
        });
    },
    perf: () => {
        const cur = pGet('perf', 'auto');
        const opts = [{ v: 'auto', l: 'Авто', h: 'определяется по устройству' }, { v: 'light', l: 'Лёгкий', h: 'без размытий, меньше частиц — для ТВ' }, { v: 'high', l: 'Максимум', h: 'все эффекты' }];
        Modal.open({
            title: 'Производительность',
            items: opts.map(o => ({ label: (cur === o.v ? '● ' : '○ ') + o.l, hint: o.h, onSelect: () => { pSet('perf', o.v); Perf._tier = null; Themes.apply(Themes.current(), View.root); Fx.ensureSize(); UI.settings(); } }))
                .concat([{ label: 'Назад', onSelect: () => UI.settings() }])
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
                    Themes.apply(Themes.current(), View.root);
                    FilmTheme.key = null;
                    FilmTheme.apply(View.current());
                    Fx.ensureSize();
                    UI.settings();
                }
            })).concat([{ label: 'Назад', onSelect: () => UI.settings() }])
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
                { label: 'Готово', onSelect: () => UI.settings() }
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
        items.push({ label: 'Назад', onSelect: () => UI.settings() });
        Modal.open({ title: 'Оформление', items });
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
        const token = ++View.token;
        Net.abortPending();
        View.setBusy(true);
        View.loading('ИЩУ: ' + String(query).toUpperCase().slice(0, 24), force ? 'ДРУГИЕ ВАРИАНТЫ' : '');
        const attempt = (depth) => {
            Search.run(query, View.taste, (list) => {
                if (token !== View.token) return;
                const ids = list.map(i => i.id);
                const ov = overlapRatio(ids, View.prevIds || []);
                if (force && list.length && ov > 0.4 && depth < 2) return attempt(depth + 1);
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
    this.pause = () => { App.active = false; Ctrl.stop(); Fx.pause(); View.commitShown(); flushStore(); };
    this.resume = () => { App.active = true; Fx.last = 0; Fx.resume(); Fx.ensureSize(); Ctrl.start(); reclaimControl(); };
    this.stop = () => { App.active = false; Ctrl.stop(); Fx.pause(); };
    this.destroy = () => {
        App.active = false;
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
