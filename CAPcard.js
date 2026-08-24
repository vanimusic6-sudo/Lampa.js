(function () {
'use strict';
if (window.plugin_capsule_card_ready) return;
window.plugin_capsule_card_ready = true;

const VERSION = '1.0';
const COMPONENT_ID = 'capsule_card_view';
const CTRL_ID = 'capsule_card_ctrl';
const TMDB_DEFAULT = 'https://api.themoviedb.org/3';
const IMG_DEFAULT = 'https://image.tmdb.org';
const FALLBACK_KEY = '4ef0d7355d9ffb5151e987764708ce96';
const LANG = 'ru-RU';
const MAX_PARALLEL = 5;

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
const once = (fn) => { let done = false; return function () { if (done) return; done = true; try { return fn.apply(null, arguments); } catch (e) { console.error('[Карточка]', e); } }; };
const vibrate = (ms) => { try { navigator.vibrate && navigator.vibrate(ms); } catch (e) {} };
const reducedMotion = () => { try { return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { return false; } };
const hexRgbLocal = (hex) => { let h = String(hex || '').trim().replace('#', ''); if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2]; const n = parseInt(h, 16); if (isNaN(n) || h.length !== 6) return '255,255,255'; return ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255); };
const normLocal = (s) => String(s || '').toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9]+/g, ' ').trim();
const fmtRuntime = (min) => min ? (min >= 60 ? Math.floor(min / 60) + ' ч ' + (min % 60) + ' мин' : min + ' мин') : '';
const yearOf = (d) => parseInt(String((d && (d.release_date || d.first_air_date)) || '').slice(0, 4), 10) || 0;
const fmtDate = (s) => {
    if (!s) return '';
    const M = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
    const p = String(s).slice(0, 10).split('-');
    if (p.length !== 3) return '';
    const m = parseInt(p[1], 10) - 1;
    return parseInt(p[2], 10) + ' ' + (M[m] || '') + ' ' + p[0];
};
const parallel = (tasks, done) => {
    const finish = once(done);
    let left = tasks.length;
    const out = new Array(left);
    if (!left) return finish(out);
    const guard = setTimeout(() => finish(out), 14000);
    tasks.forEach((task, idx) => {
        const step = once((r) => { out[idx] = r; if (--left === 0) { clearTimeout(guard); finish(out); } });
        try { task(step); } catch (e) { step(null); }
    });
};

// ═══════════════════════════════════════════ ХРАНИЛИЩЕ
const MEM = {};
const pGet = (key, def) => {
    if (Object.prototype.hasOwnProperty.call(MEM, key)) return MEM[key] === undefined ? def : MEM[key];
    let v = def;
    try { const raw = localStorage.getItem('cc_' + key); if (raw != null) { const parsed = JSON.parse(raw); if (parsed !== null && parsed !== undefined) v = parsed; } } catch (e) {}
    MEM[key] = v;
    return v;
};
const pSet = (key, val) => { MEM[key] = val; try { localStorage.setItem('cc_' + key, JSON.stringify(val)); } catch (e) {} };

// ═══════════════════════════════════════════ МОСТ К «КАПСУЛЕ»
// Если первый плагин установлен — забираем оттуда темы и сцены,
// чтобы два экрана выглядели как одно приложение, а не как два разных.
const MOD = () => { try { return window.CapsuleModAPI || null; } catch (e) { return null; } };
const hexRgb = (h) => { const m = MOD(); return (m && m.hexRgb) ? m.hexRgb(h) : hexRgbLocal(h); };
const norm = (s) => { const m = MOD(); return (m && m.norm) ? m.norm(s) : normLocal(s); };

// Запасная палитра и сцены на случай, если «Капсула» не стоит
const BASE_THEME = { '--cc-bg': '#05070D', '--cc-accent': '#FF7A2F', '--cc-accent2': '#7FD8FF', '--cc-text': '#E8ECF5', '--cc-sub': '#8695AC' };
const density = () => { const m = MOD(); const d = (m && m.density) ? m.density() : 1; return clamp(d, .4, 4); };
const tier = () => { const m = MOD(); return (m && m.perfTier) ? m.perfTier() : 1; };
const lite = () => tier() === 0;
const N = (n) => clamp(Math.round(n * [0.3, 0.65, 1][tier()] * density()), 4, 700);
const LOCAL_SCENES = {
    dust: () => {
        const mk = (top) => ({ x: Math.random(), y: top ? -.05 - Math.random() * .3 : Math.random(), r: .7 + Math.random() * 1.9, v: .012 + Math.random() * .03, sw: Math.random() * 6.28 });
        const p = Array.from({ length: N(46) }, () => mk(false));
        let t = 0;
        return { draw(ctx, W, H, dt) {
            t += dt; ctx.fillStyle = '#C9CDD2';
            p.forEach(s => {
                s.y += s.v * dt; s.x += Math.sin(t * .5 + s.sw) * .0011;
                if (s.y > 1.05) Object.assign(s, mk(true));
                ctx.globalAlpha = .09 + .05 * Math.sin(t + s.sw);
                ctx.beginPath(); ctx.arc(s.x * W, s.y * H, s.r, 0, 6.283); ctx.fill();
            });
            ctx.globalAlpha = 1;
        } };
    },
    stars: () => {
        const s = Array.from({ length: N(70) }, () => ({ x: Math.random(), y: Math.random(), r: .4 + Math.random() * 1.2, p: Math.random() * 6.28, v: .004 + Math.random() * .012 }));
        let t = 0;
        return { draw(ctx, W, H, dt) {
            t += dt; ctx.fillStyle = '#DCE9FF';
            s.forEach(o => {
                o.x -= o.v * dt * .08;
                if (o.x < -.02) { o.x = 1.02; o.y = Math.random(); }
                ctx.globalAlpha = .12 + .14 * Math.sin(t * 1.2 + o.p);
                ctx.beginPath(); ctx.arc(o.x * W, o.y * H, o.r, 0, 6.283); ctx.fill();
            });
            ctx.globalAlpha = 1;
        } };
    },
    rain: () => {
        const mk = () => ({ x: Math.random() * 1.15 - .1, y: -.05 - Math.random() * .4, v: .8 + Math.random() * .9 });
        const d = Array.from({ length: N(40) }, () => { const o = mk(); o.y = Math.random(); return o; });
        return { draw(ctx, W, H, dt) {
            ctx.lineWidth = 1; ctx.globalAlpha = .05; ctx.strokeStyle = '#CFE4FF';
            ctx.beginPath();
            d.forEach(o => {
                o.y += o.v * dt; o.x += .04 * dt;
                if (o.y > 1.1) Object.assign(o, mk());
                ctx.moveTo(o.x * W, o.y * H); ctx.lineTo((o.x - .008) * W, (o.y + .04) * H);
            });
            ctx.stroke(); ctx.globalAlpha = 1;
        } };
    },
    glowdots: () => {
        const p = Array.from({ length: N(26) }, () => ({ x: Math.random(), y: Math.random(), r: 1.2 + Math.random() * 2.2, ph: Math.random() * 6.28, v: .01 + Math.random() * .02 }));
        let t = 0;
        return { draw(ctx, W, H, dt) {
            t += dt;
            p.forEach(s => {
                s.y -= s.v * dt;
                if (s.y < -.05) { s.y = 1.05; s.x = Math.random(); }
                const pulse = .5 + .5 * Math.sin(t * 1.8 + s.ph);
                ctx.globalAlpha = .05 * pulse; ctx.fillStyle = '#9FD4FF';
                ctx.beginPath(); ctx.arc(s.x * W, s.y * H, s.r * 5, 0, 6.283); ctx.fill();
                ctx.globalAlpha = .22 * pulse; ctx.fillStyle = '#EAF4FF';
                ctx.beginPath(); ctx.arc(s.x * W, s.y * H, s.r, 0, 6.283); ctx.fill();
            });
            ctx.globalAlpha = 1;
        } };
    }
};
const sceneFactory = (name) => {
    const m = MOD();
    if (m && m.SCENES && m.SCENES[name]) return m.SCENES[name];
    if (LOCAL_SCENES[name]) return LOCAL_SCENES[name];
    return LOCAL_SCENES.dust;
};

// ═══════════════════════════════════════════ СЕТЬ
const Src = {
    tmdb: () => { try { return (window.Lampa && window.Lampa.TMDB) || null; } catch (e) { return null; } },
    key: () => {
        try { const own = String(localStorage.getItem('cm_tmdb_key') || '').replace(/"/g, '').trim(); if (own) return own; } catch (e) {}
        const t = Src.tmdb();
        try { if (t && t.key) { const k = t.key(); if (k) return k; } } catch (e) {}
        try { if (window.Lampa && window.Lampa.Storage) { const k = window.Lampa.Storage.get('tmdb_key', ''); if (k) return k; } } catch (e) {}
        return FALLBACK_KEY;
    },
    api: (path, query) => {
        const clean = String(path || '').replace(/^\/+/, '');
        const tail = clean + (query ? ('?' + query) : '');
        const t = Src.tmdb();
        if (t && t.api) { try { const u = t.api(tail); if (u) return u; } catch (e) {} }
        return TMDB_DEFAULT + '/' + tail;
    },
    img: (size, path) => {
        if (!path) return '';
        if (/^https?:\/\//i.test(path)) return path;
        const rel = 't/p/' + size + path;
        const t = Src.tmdb();
        if (t && t.image) { try { const u = t.image(rel); if (u) return u; } catch (e) {} }
        return IMG_DEFAULT + '/' + rel;
    }
};

const Net = {
    mem: {}, keys: [], inflight: {}, queue: [], running: 0, lampa: null, tried: false,
    url: (path, params) => {
        let q = 'api_key=' + Src.key() + '&language=' + LANG;
        if (params) for (const k in params) { const v = params[k]; if (v != null && v !== '') q += '&' + k + '=' + encodeURIComponent(v); }
        return Src.api(path, q);
    },
    _xhr: (url, cb) => {
        const finish = once(cb);
        try {
            const xhr = new XMLHttpRequest();
            xhr.open('GET', url, true);
            xhr.timeout = 9000;
            xhr.onreadystatechange = () => {
                if (xhr.readyState !== 4) return;
                if (xhr.status >= 200 && xhr.status < 400) { try { finish(null, JSON.parse(xhr.responseText)); } catch (e) { finish('parse'); } }
                else finish('http_' + xhr.status);
            };
            xhr.onerror = () => finish('net');
            xhr.ontimeout = () => finish('timeout');
            xhr.send();
        } catch (e) { finish('send'); }
    },
    _lampa: (url, cb) => {
        const finish = once(cb);
        try {
            if (!Net.tried) { Net.tried = true; if (window.Lampa && window.Lampa.Reguest) Net.lampa = new window.Lampa.Reguest(); }
            if (!Net.lampa) return finish('unavailable');
            try { Net.lampa.timeout(9000); } catch (e) {}
            Net.lampa.silent(url,
                (d) => { if (d && typeof d === 'object') finish(null, d); else { try { finish(null, JSON.parse(d)); } catch (e) { finish('parse'); } } },
                () => finish('lampa_net'), false);
        } catch (e) { finish('lampa_throw'); }
    },
    _deliver: (url, err, data) => {
        const hs = Net.inflight[url] || [];
        delete Net.inflight[url];
        hs.forEach(h => { try { err ? (h.fail && h.fail(err)) : h.ok(data); } catch (e) {} });
    },
    _start: (url) => {
        Net.running++;
        const finish = once((err, data) => {
            Net.running--;
            if (!err) {
                if (!Net.mem[url]) Net.keys.push(url);
                Net.mem[url] = { t: Date.now(), d: data };
                while (Net.keys.length > 120) delete Net.mem[Net.keys.shift()];
            }
            Net._deliver(url, err, data);
            Net._pump();
        });
        Net._lampa(url, (e1, d1) => {
            if (!e1) return finish(null, d1);
            Net._xhr(url, (e2, d2) => { if (!e2) return finish(null, d2); finish(e2 || e1); });
        });
    },
    _pump: () => { while (Net.running < MAX_PARALLEL && Net.queue.length) Net._start(Net.queue.shift()); },
    get: (path, params, ok, fail, ttl) => {
        const url = Net.url(path, params);
        const c = Net.mem[url];
        if (c && Date.now() - c.t < (ttl || 900000)) { setTimeout(() => ok(c.d), 0); return; }
        if (Net.inflight[url]) { Net.inflight[url].push({ ok, fail }); return; }
        Net.inflight[url] = [{ ok, fail }];
        Net.queue.push(url);
        Net._pump();
    },
    abort: () => { const q = Net.queue; Net.queue = []; q.forEach(u => Net._deliver(u, 'aborted')); }
};

// ═══════════════════════════════════════════ ТЕМА ЭКРАНА
const App = { active: false, fallback: false };

const Theme = {
    film: null,
    // палитра: сначала тема «под фильм» из «Капсулы», потом её базовая тема,
    // потом запасной набор — экран всегда получает валидные цвета
    resolve: (data) => {
        const m = MOD();
        if (m && pGet('film_theme', true)) {
            const f = m.matchFilm ? m.matchFilm(data.title || data.name, data.original_title || data.original_name) : null;
            if (f) return { accent: isArr(f.accent) ? pickOne(f.accent) : f.accent, accent2: f.accent2, bg: f.bg, fx: f.fx, name: f.name };
        }
        if (m && m.THEMES && m.currentTheme) {
            const t = m.THEMES[m.currentTheme()];
            if (t && t.vars) return { accent: t.vars['--cm-accent'], accent2: t.vars['--cm-accent2'], bg: t.vars['--cm-bg'], fx: t.fx, name: t.name };
        }
        return { accent: BASE_THEME['--cc-accent'], accent2: BASE_THEME['--cc-accent2'], bg: BASE_THEME['--cc-bg'], fx: 'stars', name: '' };
    },
    apply: (root, data) => {
        if (!root) return;
        const t = Theme.resolve(data);
        Theme.film = t;
        root.style.setProperty('--cc-accent', t.accent);
        root.style.setProperty('--cc-accent2', t.accent2);
        root.style.setProperty('--cc-accent-rgb', hexRgb(t.accent));
        root.style.setProperty('--cc-accent2-rgb', hexRgb(t.accent2));
        if (t.bg) root.style.setProperty('--cc-bg', t.bg);
        if (lite()) addClass(root, 'cc-lite'); else removeClass(root, 'cc-lite');
        Fx.start(root, pGet('fx', true) ? (t.fx || 'stars') : 'none');
        return t;
    }
};

// ═══════════════════════════════════════════ ФОНОВАЯ СЦЕНА
const Fx = {
    canvas: null, ctx: null, scene: null, raf: null, last: 0, tick: 0, W: 0, H: 0, root: null, mode: null, wd: null, frame: null, rt: null,
    stop: () => {
        if (Fx.raf) cancelAnimationFrame(Fx.raf);
        Fx.raf = null; Fx.scene = null; Fx.frame = null; Fx.mode = null;
        if (Fx.wd) { clearInterval(Fx.wd); Fx.wd = null; }
        clearTimeout(Fx.rt); Fx.rt = null;
        window.removeEventListener('resize', Fx.onResize);
        window.removeEventListener('orientationchange', Fx.onResize);
        if (Fx.canvas && Fx.canvas.parentNode) Fx.canvas.parentNode.removeChild(Fx.canvas);
        Fx.canvas = null; Fx.ctx = null; Fx.root = null;
    },
    pause: () => { if (Fx.raf) { cancelAnimationFrame(Fx.raf); Fx.raf = null; } },
    resume: () => { if (Fx.canvas && Fx.scene && !Fx.raf && Fx.frame) { Fx.last = 0; Fx.tick = Date.now(); Fx.raf = requestAnimationFrame(Fx.frame); } },
    onResize: () => { clearTimeout(Fx.rt); Fx.rt = setTimeout(Fx.resize, 180); },
    resize: () => {
        if (!Fx.canvas || !Fx.root || !Fx.ctx) return;
        const w = Fx.root.clientWidth || window.innerWidth || 1;
        const h = Fx.root.clientHeight || window.innerHeight || 1;
        if (w === Fx.W && h === Fx.H && Fx.canvas.width) return;
        const dpr = Math.min(window.devicePixelRatio || 1, [1, 1.25, 2][tier()]);
        Fx.W = Math.max(1, w); Fx.H = Math.max(1, h);
        Fx.canvas.width = Math.round(Fx.W * dpr);
        Fx.canvas.height = Math.round(Fx.H * dpr);
        Fx.canvas.style.width = Fx.W + 'px';
        Fx.canvas.style.height = Fx.H + 'px';
        Fx.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        if (Fx.scene && Fx.scene.resize) { try { Fx.scene.resize(Fx.W, Fx.H); } catch (e) {} }
    },
    ensureSize: () => { [0, 120, 400, 1200].forEach(ms => setTimeout(Fx.resize, ms)); },
    start: (root, mode) => {
        if (!root || mode === 'none' || reducedMotion()) { Fx.stop(); return; }
        if (Fx.mode === mode && Fx.root === root && Fx.canvas && Fx.scene) { Fx.resume(); return; }
        Fx.stop();
        const canvas = el('canvas', 'cc-fx');
        root.insertBefore(canvas, root.firstChild);
        const ctx = canvas.getContext ? canvas.getContext('2d', { alpha: true }) : null;
        if (!ctx) { if (canvas.parentNode) canvas.parentNode.removeChild(canvas); return; }
        Fx.root = root; Fx.canvas = canvas; Fx.ctx = ctx; Fx.mode = mode;
        Fx.W = 0; Fx.H = 0; Fx.last = 0;
        try { Fx.scene = sceneFactory(mode)(); } catch (e) { Fx.scene = LOCAL_SCENES.dust(); }
        Fx.resize(); Fx.ensureSize();
        window.addEventListener('resize', Fx.onResize, { passive: true });
        window.addEventListener('orientationchange', Fx.onResize, { passive: true });
        const fpsBase = [16, 24, 30][tier()];
        const frame = (now) => {
            Fx.tick = Date.now();
            if (!Fx.canvas || !Fx.scene) { Fx.raf = null; return; }
            Fx.raf = requestAnimationFrame(frame);
            if (!Fx.canvas.parentNode || document.hidden || !App.active) { Fx.last = now; return; }
            const target = 1000 / ((Fx.scene.fps || fpsBase) / (Modal.active() ? 2 : 1));
            if (!Fx.last) Fx.last = now;
            const elapsed = now - Fx.last;
            if (elapsed < target) return;
            Fx.last = now;
            const dt = Math.min(elapsed / 1000, .12);
            ctx.clearRect(0, 0, Fx.W, Fx.H);
            try { Fx.scene.draw(ctx, Fx.W, Fx.H, dt, now / 1000); }
            catch (e) { console.error('[Карточка] сцена:', e); Fx.stop(); }
        };
        Fx.frame = frame;
        Fx.tick = Date.now();
        Fx.raf = requestAnimationFrame(frame);
        Fx.wd = setInterval(() => {
            if (!App.active || !Fx.canvas || !Fx.scene || document.hidden) return;
            if (Date.now() - Fx.tick < 2500) return;
            if (Fx.raf) cancelAnimationFrame(Fx.raf);
            Fx.last = 0; Fx.tick = Date.now();
            Fx.raf = requestAnimationFrame(frame);
        }, 4000);
    }
};

// ═══════════════════════════════════════════ CSS
const CSS = `
.cc-root{position:fixed;top:0;right:0;bottom:0;left:0;z-index:999997;overflow:hidden;
color:var(--cc-text,#E8ECF5);background:var(--cc-bg,#05070D);
font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",sans-serif;
font-size:14px;font-size:clamp(13px,1.5vw,16px);
-webkit-tap-highlight-color:transparent;user-select:none;-webkit-user-select:none;isolation:isolate}
.cc-root *{box-sizing:border-box}
.cc-mono{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
.cc-fx{position:absolute;top:0;right:0;bottom:0;left:0;width:100%;height:100%;opacity:.34;pointer-events:none;z-index:1}
.cc-back{position:absolute;top:-8%;right:-8%;bottom:-8%;left:-8%;z-index:0;background-size:cover;background-position:center top;
opacity:0;filter:blur(26px) saturate(126%);transform:scale(1.06);transition:opacity 1s ease,transform 1.6s ease}
.cc-back.on{opacity:.42;transform:scale(1.1)}
.cc-tint{position:absolute;top:0;right:0;bottom:0;left:0;z-index:2;pointer-events:none;
background:linear-gradient(105deg,var(--cc-bg,#05070D) 8%,rgba(0,0,0,.72) 46%,rgba(0,0,0,.3) 78%,transparent),
linear-gradient(0deg,var(--cc-bg,#05070D) 2%,rgba(0,0,0,.5) 26%,transparent 62%),
radial-gradient(70% 60% at 22% 34%,rgba(var(--cc-accent-rgb,255,122,47),.16),transparent 72%)}
.cc-scroll{position:absolute;top:0;right:0;bottom:0;left:0;z-index:3;overflow-y:auto;overflow-x:hidden;
-webkit-overflow-scrolling:touch;scrollbar-width:none;padding:0 0 3em}
.cc-scroll::-webkit-scrollbar{width:0;height:0}
.cc-sys{position:absolute;top:1.1em;left:1.6em;z-index:9;font-size:.56em;letter-spacing:.16em;
color:var(--cc-accent2,#7FD8FF);opacity:.3;pointer-events:none;white-space:nowrap}
.cc-sys:empty{display:none}
/* ── герой ───────────────────────────────────────────────── */
.cc-hero{display:flex;gap:2em;padding:4em 3em 1.6em;max-width:88em;margin:0 auto;align-items:flex-start}
.cc-poster{position:relative;flex:none;width:16em;border-radius:.9em;overflow:hidden;background:#0B0F18;cursor:pointer;
box-shadow:0 1.4em 3em rgba(0,0,0,.5),0 0 0 1px rgba(255,255,255,.09);
transition:transform .26s cubic-bezier(.22,.7,.25,1),box-shadow .26s ease}
.cc-poster:before{content:"";display:block;padding-bottom:150%}
.cc-poster img{position:absolute;top:0;left:0;width:100%;height:100%;object-fit:cover;opacity:0;transition:opacity .5s ease}
.cc-poster img.ready{opacity:1}
.cc-poster .cc-noimg{position:absolute;top:50%;left:0;right:0;transform:translateY(-50%);text-align:center;
font-size:.68em;letter-spacing:.14em;color:var(--cc-sub,#8695AC);opacity:0}
.cc-poster.empty .cc-noimg{opacity:.55}
.cc-poster.cc-focus{transform:scale(1.03);box-shadow:0 1.6em 3.4em rgba(0,0,0,.55),0 0 0 .15em var(--cc-accent,#FF7A2F)}
.cc-rate{position:absolute;top:.6em;right:.6em;z-index:2;padding:.34em .66em;border-radius:.6em;font-size:.8em;font-weight:800;
background:rgba(0,0,0,.66);color:var(--cc-accent,#FF7A2F);border:1px solid rgba(var(--cc-accent-rgb,255,122,47),.55)}
.cc-info{flex:1;min-width:0;padding-top:.4em}
.cc-title{font-size:clamp(1.9rem,4vw,3.2rem);font-weight:800;line-height:1.02;letter-spacing:-.04em;margin-bottom:.16em;
overflow-wrap:anywhere;text-shadow:0 .1em 1em rgba(0,0,0,.45)}
.cc-orig{font-size:.86em;color:var(--cc-sub,#8695AC);opacity:.75;margin-bottom:.9em}
.cc-orig:empty{display:none}
.cc-chips{display:flex;flex-wrap:wrap;gap:.4em;margin-bottom:.9em}
.cc-chip{display:inline-flex;align-items:center;white-space:nowrap;padding:.36em .7em;border-radius:.6em;font-size:.68em;
letter-spacing:.04em;background:rgba(255,255,255,.055);border:1px solid rgba(255,255,255,.08);opacity:.82}
.cc-chip.acc{color:var(--cc-accent,#FF7A2F);border-color:rgba(var(--cc-accent-rgb,255,122,47),.5);background:rgba(var(--cc-accent-rgb,255,122,47),.08);opacity:1}
.cc-chip.acc2{color:var(--cc-accent2,#7FD8FF);border-color:rgba(var(--cc-accent2-rgb,127,216,255),.45)}
.cc-tag{font-size:.9em;font-style:italic;color:var(--cc-accent2,#7FD8FF);opacity:.8;margin-bottom:.7em;max-width:46em}
.cc-tag:empty{display:none}
.cc-over{font-size:.92em;line-height:1.6;color:var(--cc-sub,#8695AC);max-width:52em;margin-bottom:1.1em;
display:-webkit-box;-webkit-line-clamp:5;-webkit-box-orient:vertical;overflow:hidden;cursor:pointer}
.cc-acts{display:flex;gap:.5em;flex-wrap:wrap}
.cc-btn{display:flex;align-items:center;justify-content:center;gap:.55em;min-height:2.9em;padding:.78em 1.3em;
white-space:nowrap;cursor:pointer;border-radius:.7em;font-size:.86em;font-weight:700;
background:rgba(255,255,255,.07);color:var(--cc-text,#E8ECF5);border:1px solid rgba(255,255,255,.09);
transition:transform .2s cubic-bezier(.22,.7,.25,1),box-shadow .2s ease,background-color .2s ease,border-color .2s ease}
.cc-btn svg{width:1.1em;height:1.1em;fill:currentColor;flex:none}
.cc-btn.primary{background:var(--cc-accent,#FF7A2F);color:#0A0A0A;border-color:transparent;
box-shadow:0 .5em 1.4em rgba(var(--cc-accent-rgb,255,122,47),.26)}
.cc-btn.on{color:var(--cc-accent,#FF7A2F);border-color:rgba(var(--cc-accent-rgb,255,122,47),.6);background:rgba(var(--cc-accent-rgb,255,122,47),.12)}
.cc-btn.cc-focus{transform:translateY(-2px);box-shadow:0 .8em 1.8em rgba(0,0,0,.38),0 0 0 .15em var(--cc-accent,#FF7A2F)}
.cc-btn:active{transform:scale(.98)}
/* ── ряды ────────────────────────────────────────────────── */
.cc-sec{max-width:88em;margin:0 auto;padding:1.1em 3em 0}
.cc-sec-h{display:flex;align-items:baseline;gap:.7em;margin-bottom:.7em}
.cc-sec-t{font-size:.78em;font-weight:800;letter-spacing:.18em;text-transform:uppercase;color:var(--cc-accent,#FF7A2F);opacity:.9}
.cc-sec-n{font-size:.72em;color:var(--cc-sub,#8695AC);opacity:.6}
.cc-row{display:flex;gap:.8em;overflow-x:auto;overflow-y:hidden;scrollbar-width:none;padding:.3em .2em .5em}
.cc-row::-webkit-scrollbar{height:0}
.cc-person{flex:none;width:7.4em;cursor:pointer;border-radius:.7em;padding:.4em;
border:1px solid transparent;transition:transform .2s ease,background-color .2s ease,border-color .2s ease}
.cc-person .ph{position:relative;width:100%;border-radius:.6em;overflow:hidden;background:#0B0F18;margin-bottom:.45em}
.cc-person .ph:before{content:"";display:block;padding-bottom:130%}
.cc-person img{position:absolute;top:0;left:0;width:100%;height:100%;object-fit:cover;opacity:0;transition:opacity .45s ease}
.cc-person img.ready{opacity:1}
.cc-person .nm{font-size:.68em;line-height:1.25;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cc-person .rl{font-size:.62em;line-height:1.25;color:var(--cc-sub,#8695AC);opacity:.7;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cc-person.cc-focus{transform:translateY(-3px);background:rgba(var(--cc-accent-rgb,255,122,47),.10);border-color:rgba(var(--cc-accent-rgb,255,122,47),.5)}
.cc-mini{flex:none;width:9em;cursor:pointer;border-radius:.7em;overflow:hidden;position:relative;background:#0B0F18;
border:1px solid rgba(255,255,255,.07);transition:transform .2s ease,box-shadow .2s ease}
.cc-mini:before{content:"";display:block;padding-bottom:150%}
.cc-mini img{position:absolute;top:0;left:0;width:100%;height:100%;object-fit:cover;opacity:0;transition:opacity .45s ease}
.cc-mini img.ready{opacity:1}
.cc-mini .cap{position:absolute;left:0;right:0;bottom:0;padding:1.6em .5em .45em;font-size:.64em;
background:linear-gradient(transparent,rgba(0,0,0,.92));white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cc-mini .mrate{position:absolute;top:.4em;right:.4em;padding:.2em .45em;border-radius:.4em;font-size:.6em;font-weight:800;
background:rgba(0,0,0,.7);color:var(--cc-accent,#FF7A2F)}
.cc-mini.cc-focus{transform:translateY(-3px) scale(1.02);box-shadow:0 .9em 2em rgba(0,0,0,.45),0 0 0 .14em var(--cc-accent,#FF7A2F)}
/* ── комментарии ─────────────────────────────────────────── */
.cc-cmt{flex:none;width:24em;max-width:82vw;cursor:pointer;padding:.9em 1em;border-radius:.8em;
background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);
transition:transform .2s ease,background-color .2s ease,border-color .2s ease}
.cc-cmt .hd{display:flex;align-items:center;gap:.5em;margin-bottom:.5em}
.cc-cmt .av{width:2em;height:2em;flex:none;border-radius:50%;background:rgba(var(--cc-accent-rgb,255,122,47),.22);
color:var(--cc-accent,#FF7A2F);display:flex;align-items:center;justify-content:center;font-weight:800;font-size:.8em}
.cc-cmt .au{font-size:.76em;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;min-width:0}
.cc-cmt .st{font-size:.7em;font-weight:800;color:var(--cc-accent,#FF7A2F);white-space:nowrap}
.cc-cmt .tx{font-size:.76em;line-height:1.5;color:var(--cc-sub,#8695AC);
display:-webkit-box;-webkit-line-clamp:4;-webkit-box-orient:vertical;overflow:hidden}
.cc-cmt .dt{margin-top:.5em;font-size:.64em;letter-spacing:.08em;color:var(--cc-sub,#8695AC);opacity:.55}
.cc-cmt.mine{border-color:rgba(var(--cc-accent-rgb,255,122,47),.45);background:rgba(var(--cc-accent-rgb,255,122,47),.07)}
.cc-cmt.cc-focus{transform:translateY(-2px);background:rgba(var(--cc-accent-rgb,255,122,47),.12);border-color:var(--cc-accent,#FF7A2F)}
.cc-empty{padding:.9em 1em;font-size:.78em;color:var(--cc-sub,#8695AC);opacity:.6}
/* ── загрузка и модалка ──────────────────────────────────── */
.cc-load{position:absolute;top:0;right:0;bottom:0;left:0;z-index:6;display:flex;flex-direction:column;align-items:center;justify-content:center}
.cc-ring{width:4.2em;height:4.2em;border-radius:50%;position:relative;border:1px solid rgba(255,255,255,.1)}
.cc-ring:after{content:"";position:absolute;top:-.15em;right:-.15em;bottom:-.15em;left:-.15em;border-radius:50%;
border:.15em solid transparent;border-top-color:var(--cc-accent,#FF7A2F);animation:cc-spin 1.1s cubic-bezier(.55,.15,.45,.85) infinite}
@keyframes cc-spin{to{transform:rotate(360deg)}}
.cc-load-t{margin-top:1.1em;font-size:.66em;letter-spacing:.22em;color:var(--cc-sub,#8695AC);opacity:.8}
.cc-ov{position:fixed;top:0;right:0;bottom:0;left:0;z-index:1000000;display:flex;align-items:center;justify-content:center;padding:1.2em;
background:rgba(0,0,0,.7);-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px)}
.cc-modal{width:42em;max-width:100%;max-height:86%;overflow-y:auto;padding:1.4em;border-radius:1em;scrollbar-width:none;
background:rgba(11,14,21,.94);border:1px solid rgba(255,255,255,.09);box-shadow:0 1.5em 4em rgba(0,0,0,.5)}
.cc-modal::-webkit-scrollbar{width:0}
.cc-modal h3{margin:0 0 .6em;font-size:1.1em;font-weight:800}
.cc-modal p{margin:0 0 1em;font-size:.86em;line-height:1.6;color:var(--cc-sub,#8695AC)}
.cc-opt{display:flex;flex-direction:column;justify-content:center;width:100%;min-height:3em;padding:.7em 1em;margin-bottom:.4em;
text-align:left;font-size:.9em;cursor:pointer;border-radius:.6em;color:var(--cc-text,#fff);
background:rgba(255,255,255,.035);border:1px solid rgba(255,255,255,.06);transition:background-color .16s ease,border-color .16s ease,transform .16s ease}
.cc-opt small{display:block;font-size:.72em;opacity:.62;margin-top:.15em}
.cc-opt.cc-focus{background:rgba(var(--cc-accent-rgb,255,122,47),.18);border-color:var(--cc-accent,#FF7A2F);transform:translateX(3px)}
.cc-toast{position:fixed;left:50%;bottom:1.8em;z-index:1000001;transform:translateX(-50%) translateY(1em);opacity:0;
max-width:92%;padding:.75em 1.2em;text-align:center;font-size:.86em;border-radius:.8em;color:#fff;
background:rgba(10,12,18,.94);border:1px solid rgba(255,255,255,.1);transition:opacity .24s ease,transform .24s ease}
.cc-toast.on{opacity:1;transform:translateX(-50%) translateY(0)}
/* ── лёгкий режим и адаптив ──────────────────────────────── */
.cc-lite .cc-back{filter:blur(18px) saturate(110%)}
.cc-lite .cc-ov{-webkit-backdrop-filter:none;backdrop-filter:none;background:rgba(0,0,0,.9)}
@media (hover:hover) and (pointer:fine){
.cc-btn:hover{background:rgba(255,255,255,.12);border-color:rgba(var(--cc-accent-rgb,255,122,47),.5)}
.cc-btn.primary:hover{filter:brightness(1.07)}
.cc-mini:hover,.cc-person:hover,.cc-cmt:hover{transform:translateY(-2px)}
}
@media (max-width:900px){
.cc-hero{flex-direction:column;align-items:center;text-align:center;padding:3.4em 1.2em 1.2em;gap:1.2em}
.cc-poster{width:11em}
.cc-info{text-align:left;width:100%}
.cc-acts{justify-content:flex-start}
.cc-sec{padding:1em 1.2em 0}
.cc-over{-webkit-line-clamp:4}
}
@media (min-width:1600px){
.cc-root{font-size:17px}
.cc-hero{max-width:100em;padding:4.4em 4em 1.8em}
.cc-sec{max-width:100em;padding:1.2em 4em 0}
.cc-poster{width:18em}
}
@media (prefers-reduced-motion:reduce){
.cc-root *,.cc-root *:before,.cc-root *:after{animation:none !important;transition-duration:.01ms !important}
.cc-fx{display:none}
}`;
const injectCSS = () => { if (document.getElementById('cc_css')) return; const s = el('style'); s.id = 'cc_css'; s.textContent = CSS; document.head.appendChild(s); };

// ═══════════════════════════════════════════ ИКОНКИ
const I_PLAY = '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>';
const I_FILM = '<svg viewBox="0 0 24 24"><path d="M18 4v1h-2V4H8v1H6V4H4v16h2v-1h2v1h8v-1h2v1h2V4h-2zM8 17H6v-2h2v2zm0-4H6v-2h2v2zm0-4H6V7h2v2zm10 8h-2v-2h2v2zm0-4h-2v-2h2v2zm0-4h-2V7h2v2z"/></svg>';
const I_STAR = '<svg viewBox="0 0 24 24"><path d="M12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>';
const I_DOTS = '<svg viewBox="0 0 24 24"><path d="M6 10a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm6 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm6 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4z"/></svg>';
const I_PEN = '<svg viewBox="0 0 24 24"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>';

// ═══════════════════════════════════════════ НАВИГАЦИЯ
const Nav = {
    rows: [], r: 0, c: 0, last: null,
    reset: () => { Nav.rows = []; Nav.r = 0; Nav.c = 0; Nav.last = null; },
    addRow: (items, type) => {
        const clean = (items || []).filter(Boolean);
        if (!clean.length) return null;
        Nav.rows.push({ items: clean, memo: 0, type: type || 'row' });
        const idx = Nav.rows.length - 1;
        clean.forEach((it, j) => bindPointer(it, idx, j));
        return idx;
    },
    current: () => { const row = Nav.rows[Nav.r]; return (row && row.items[Nav.c]) || null; },
    setFocus: (r, c, silent) => {
        if (!Nav.rows.length) return;
        Nav.r = clamp(r, 0, Nav.rows.length - 1);
        const row = Nav.rows[Nav.r];
        Nav.c = clamp(c, 0, row.items.length - 1);
        row.memo = Nav.c;
        Nav.paint(silent);
    },
    paint: (silent) => {
        const cur = Nav.current();
        if (Nav.last) { if (Nav.last !== cur) removeClass(Nav.last, 'cc-focus'); }
        else if (View.root) { const old = View.root.querySelectorAll('.cc-focus'); for (let i = 0; i < old.length; i++) removeClass(old[i], 'cc-focus'); }
        Nav.last = cur;
        if (!cur) return;
        addClass(cur, 'cc-focus');
        if (!silent && cur.scrollIntoView) { try { cur.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: lite() ? 'auto' : 'smooth' }); } catch (e) { try { cur.scrollIntoView(false); } catch (e2) {} } }
    },
    move: (dir) => {
        if (!Nav.rows.length) return;
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
    enter: () => { const cur = Nav.current(); if (cur && cur._ccAction) cur._ccAction(cur); }
};
let touchMode = false;
document.addEventListener('touchstart', () => { touchMode = true; }, true);
const bindPointer = (node, r, c) => {
    node.setAttribute('data-cc-r', r);
    node.setAttribute('data-cc-c', c);
    node.onmouseenter = () => { if (!touchMode && App.active && !Modal.active()) Nav.setFocus(r, c, true); };
};
const trigger = (n) => { if (n && n._ccAction) n._ccAction(n); };
document.addEventListener('click', (e) => {
    if (!App.active) return;
    const box = Modal.active() ? Modal.st.ov : null;
    let n = e.target;
    while (n && n !== document) {
        if (box && n === box) break;
        if (n._ccAction) {
            if (box && !box.contains(n)) return;
            if (!box) {
                const r = parseInt(n.getAttribute('data-cc-r'), 10);
                const c = parseInt(n.getAttribute('data-cc-c'), 10);
                if (!isNaN(r) && !isNaN(c)) Nav.setFocus(r, c, true);
            }
            trigger(n);
            return;
        }
        n = n.parentNode;
    }
}, false);

// ═══════════════════════════════════════════ ТОСТ И МОДАЛКА
const Toast = {
    node: null, timer: null,
    show: (t) => {
        if (!Toast.node) { Toast.node = el('div', 'cc-toast'); document.body.appendChild(Toast.node); }
        Toast.node.textContent = t;
        addClass(Toast.node, 'on');
        clearTimeout(Toast.timer);
        Toast.timer = setTimeout(() => removeClass(Toast.node, 'on'), 2400);
    },
    kill: () => { clearTimeout(Toast.timer); if (Toast.node && Toast.node.parentNode) Toast.node.parentNode.removeChild(Toast.node); Toast.node = null; }
};
const notify = (t) => { if (!t) return; try { if (window.Lampa && window.Lampa.Noty && window.Lampa.Noty.show) { window.Lampa.Noty.show(t); return; } } catch (e) {} Toast.show(t); };

const Modal = {
    st: null,
    open: (opts) => {
        Modal.close(true);
        const ov = el('div', 'cc-ov');
        const box = el('div', 'cc-modal');
        const nodes = [];
        if (opts.title) box.appendChild(el('h3', '', esc(opts.title)));
        if (opts.text) box.appendChild(el('p', '', opts.text));
        if (opts.customNode) box.appendChild(opts.customNode);
        (opts.items || []).forEach(it => {
            const b = el('div', 'cc-opt', esc(it.label) + (it.hint ? '<small>' + esc(it.hint) + '</small>' : ''));
            b._ccAction = () => {
                Modal.close(true);
                if (it.onSelect) it.onSelect();
                if (!Modal.active()) { Nav.paint(true); reclaim(); }
            };
            box.appendChild(b); nodes.push(b);
        });
        ov.appendChild(box);
        document.body.appendChild(ov);
        ov.onclick = (e) => { if (e.target === ov) Modal.close(); };
        Modal.st = { ov, box, nodes, idx: 0 };
        nodes.forEach((n, i) => { n.onmouseenter = () => { if (!touchMode && Modal.st) { Modal.st.idx = i; Modal.paint(); } }; });
        Modal.paint();
    },
    paint: () => {
        const st = Modal.st;
        if (!st) return;
        st.nodes.forEach(n => removeClass(n, 'cc-focus'));
        const cur = st.nodes[st.idx];
        if (cur) { addClass(cur, 'cc-focus'); try { cur.scrollIntoView({ block: 'nearest' }); } catch (e) {} }
    },
    move: (dir) => {
        const st = Modal.st;
        if (!st || !st.nodes.length) return;
        if (dir === 'down') st.idx = clamp(st.idx + 1, 0, st.nodes.length - 1);
        else if (dir === 'up') st.idx = clamp(st.idx - 1, 0, st.nodes.length - 1);
        Modal.paint();
    },
    enter: () => { if (Modal.st) trigger(Modal.st.nodes[Modal.st.idx]); },
    close: (silent) => {
        const st = Modal.st;
        Modal.st = null;
        if (!st) return;
        if (st.ov && st.ov.parentNode) st.ov.parentNode.removeChild(st.ov);
        if (st.box) st.box.scrollTop = 0;
        if (!silent) { Nav.paint(true); reclaim(); }
    },
    active: () => !!Modal.st
};

// ═══════════════════════════════════════════ КОНТРОЛЬ ФОКУСА
const NATIVE_UI = '.selectbox,.modal,.simple-keyboard,.keyboard,.settings-input,.search--input,.player';
const Ctrl = {
    timer: null, hold: 0,
    lock: (ms) => { Ctrl.hold = Date.now() + (ms || 2000); },
    free: () => { Ctrl.hold = 0; },
    native: () => { try { return !!document.querySelector(NATIVE_UI); } catch (e) { return false; } },
    take: () => { try { if (window.Lampa && window.Lampa.Controller && App.active) { window.Lampa.Controller.toggle(CTRL_ID); Nav.paint(true); } } catch (e) {} },
    start: () => {
        Ctrl.stop();
        Ctrl.timer = setInterval(() => {
            if (!App.active || App.fallback) return;
            if (Date.now() < Ctrl.hold) return;
            if (Modal.active() || Ctrl.native()) return;
            try {
                const en = window.Lampa && window.Lampa.Controller && window.Lampa.Controller.enabled && window.Lampa.Controller.enabled();
                if (en && en.name === CTRL_ID) return;
            } catch (e) { return; }
            Ctrl.take();
        }, 1500);
    },
    stop: () => { if (Ctrl.timer) { clearInterval(Ctrl.timer); Ctrl.timer = null; } }
};
const reclaim = () => setTimeout(() => { Ctrl.free(); Ctrl.take(); }, 150);

const askText = (title, value, cb) => {
    const fire = once(cb);
    try {
        if (window.Lampa && window.Lampa.Input && window.Lampa.Input.edit) {
            Ctrl.lock(600000);
            window.Lampa.Input.edit({ title, value: value || '', free: true }, (v) => { Ctrl.free(); reclaim(); if (v != null) fire(v); });
            return;
        }
    } catch (e) { Ctrl.free(); }
    const inp = el('input', 'cc-opt');
    inp.type = 'text'; inp.value = value || '';
    inp.style.cssText = 'min-height:3em;padding:.85em 1em;color:#fff;background:rgba(255,255,255,.06)';
    Modal.open({ title, customNode: inp, items: [{ label: 'Сохранить', onSelect: () => fire(inp.value) }, { label: 'Отмена' }] });
    inp.onkeydown = (e) => { e.stopPropagation(); if (e.keyCode === 13) { const v = inp.value; Modal.close(); fire(v); } };
    setTimeout(() => { try { inp.focus(); } catch (e) {} }, 60);
};

// ═══════════════════════════════════════════ ЭКРАН
const View = {
    root: null, scroll: null, back: null, sys: null,
    card: null, data: null, type: 'movie', id: 0,
    busy: false, token: 0, destroyed: false,

    create: (object) => {
        injectCSS();
        View.destroyed = false;
        const card = (object && (object.card || object.movie)) || {};
        View.card = card;
        View.id = parseInt((object && object.id) || card.id, 10) || 0;
        View.type = (object && object.method) || card.media_type || (card.name && !card.title ? 'tv' : 'movie');
        if (View.type !== 'tv') View.type = 'movie';

        View.root = el('div', 'cc-root');
        View.back = el('div', 'cc-back');
        View.root.appendChild(View.back);
        View.root.appendChild(el('div', 'cc-tint'));
        View.sys = el('div', 'cc-sys cc-mono');
        View.root.appendChild(View.sys);
        View.scroll = el('div', 'cc-scroll');
        View.root.appendChild(View.scroll);

        // ранняя отрисовка по данным карточки: экран не мигает пустотой
        Theme.apply(View.root, card);
        View.setBackdrop(card.backdrop_path || card.poster_path);
        View.loading();
        View.load();
        return View.root;
    },

    loading: () => {
        View.scroll.innerHTML = '';
        Nav.reset();
        const box = el('div', 'cc-load');
        box.appendChild(el('div', 'cc-ring'));
        box.appendChild(el('div', 'cc-load-t cc-mono', 'ОТКРЫВАЮ КАРТОЧКУ'));
        View.scroll.appendChild(box);
    },

    setBackdrop: (path) => {
        if (!View.back || !path) return;
        const url = Src.img('w1280', path);
        if (!url || View.back._url === url) { addClass(View.back, 'on'); return; }
        const im = new Image();
        im.decoding = 'async';
        im.onload = () => { if (!View.back) return; View.back._url = url; View.back.style.backgroundImage = 'url(' + url + ')'; addClass(View.back, 'on'); };
        im.onerror = () => { if (View.back) removeClass(View.back, 'on'); };
        im.src = url;
    },

    load: () => {
        const token = ++View.token;
        if (!View.id) { View.renderError('Не передан идентификатор карточки'); return; }
        const t = View.type;
        const tasks = [
            (done) => Net.get('/' + t + '/' + View.id, { append_to_response: 'credits,videos,external_ids,release_dates,content_ratings' }, (d) => done(d), () => done(null), 604800000),
            (done) => Net.get('/' + t + '/' + View.id + '/recommendations', { page: 1 }, (d) => done((d && d.results) || []), () => done([]), 604800000),
            (done) => Net.get('/' + t + '/' + View.id + '/reviews', { page: 1 }, (d) => done((d && d.results) || []), () => done([]), 3600000)
        ];
        parallel(tasks, (res) => {
            if (token !== View.token || View.destroyed) return;
            const d = res[0];
            if (!d || !d.id) { View.renderError('TMDb не отдал данные — проверьте соединение'); return; }
            d._recs = isArr(res[1]) ? res[1] : [];
            d._reviews = isArr(res[2]) ? res[2] : [];
            View.data = d;
            Theme.apply(View.root, d);
            Fx.ensureSize();
            View.setBackdrop(d.backdrop_path || (View.card && View.card.backdrop_path) || d.poster_path);
            View.render();
        });
    },

    renderError: (msg) => {
        View.scroll.innerHTML = '';
        Nav.reset();
        const sec = el('div', 'cc-hero');
        const info = el('div', 'cc-info');
        info.appendChild(el('div', 'cc-title', 'Не открылось'));
        info.appendChild(el('div', 'cc-over', esc(msg)));
        const acts = el('div', 'cc-acts');
        const a = el('div', 'cc-btn primary', 'Открыть обычную карточку');
        a._ccAction = () => openNative();
        const b = el('div', 'cc-btn', 'Повторить');
        b._ccAction = () => { View.loading(); View.load(); };
        acts.appendChild(a); acts.appendChild(b);
        info.appendChild(acts);
        sec.appendChild(info);
        View.scroll.appendChild(sec);
        Nav.addRow([a, b], 'acts');
        Nav.setFocus(0, 0, true);
    },

    render: () => {
        const d = View.data;
        if (!d) return;
        View.scroll.innerHTML = '';
        Nav.reset();
        if (View.sys) View.sys.textContent = (Theme.film && Theme.film.name) ? String(Theme.film.name).toUpperCase() : '';

        const title = d.title || d.name || '';
        const orig = d.original_title || d.original_name || '';
        const year = yearOf(d);

        // ── герой ────────────────────────────────────────────
        const hero = el('div', 'cc-hero');
        const poster = el('div', 'cc-poster');
        const pimg = el('img');
        pimg.alt = ''; pimg.decoding = 'async';
        pimg.onload = () => addClass(pimg, 'ready');
        pimg.onerror = () => addClass(poster, 'empty');
        if (d.poster_path) pimg.src = Src.img('w500', d.poster_path); else addClass(poster, 'empty');
        poster.appendChild(pimg);
        poster.appendChild(el('div', 'cc-noimg cc-mono', 'НЕТ ПОСТЕРА'));
        poster.appendChild(el('div', 'cc-rate cc-mono', '★ ' + (d.vote_average ? d.vote_average.toFixed(1) : '—')));
        poster._ccAction = () => View.gallery();
        hero.appendChild(poster);

        const info = el('div', 'cc-info');
        info.appendChild(el('div', 'cc-title', esc(title)));
        info.appendChild(el('div', 'cc-orig', orig && norm(orig) !== norm(title) ? esc(orig) : ''));

        const chips = el('div', 'cc-chips');
        const chip = (txt, cls) => { if (!txt) return; chips.appendChild(el('div', 'cc-chip ' + (cls || '') + ' cc-mono', esc(txt))); };
        chip((d.vote_average ? d.vote_average.toFixed(1) : '—') + ' TMDB', 'acc');
        chip(View.type === 'tv' ? 'СЕРИАЛ' : 'ФИЛЬМ', 'acc2');
        if (year) chip(String(year));
        if (View.type === 'tv') {
            if (d.number_of_seasons) chip(d.number_of_seasons + ' сез.');
            if (d.number_of_episodes) chip(d.number_of_episodes + ' сер.');
        } else if (d.runtime) chip(fmtRuntime(d.runtime));
        if (d.status) chip(d.status === 'Released' ? 'Вышел' : d.status === 'Ended' ? 'Завершён' : d.status === 'Returning Series' ? 'Идёт' : d.status);
        (d.production_countries || []).slice(0, 2).forEach(c => chip(c.iso_3166_1));
        if (d.vote_count) chip(d.vote_count + ' голосов');
        info.appendChild(chips);

        const genres = (d.genres || []).map(g => g.name).join(' · ');
        if (genres) {
            const gr = el('div', 'cc-chips');
            gr.appendChild(el('div', 'cc-chip acc2', esc(genres)));
            info.appendChild(gr);
        }
        if (d.tagline) info.appendChild(el('div', 'cc-tag', '«' + esc(d.tagline) + '»'));

        const over = el('div', 'cc-over', esc(d.overview || 'Описания нет.'));
        over._ccAction = () => Modal.open({ title: title, text: esc(d.overview || 'Описания нет.'), items: [{ label: 'Закрыть' }] });
        info.appendChild(over);

        // ── кнопки ───────────────────────────────────────────
        const acts = el('div', 'cc-acts');
        const bWatch = el('div', 'cc-btn primary', I_PLAY + 'Смотреть');
        bWatch._ccAction = () => openNative();
        const trailer = View.trailerKey();
        const bTrailer = trailer ? el('div', 'cc-btn', I_FILM + 'Трейлер') : null;
        if (bTrailer) bTrailer._ccAction = () => View.playTrailer(trailer);
        const fav = isFavorite(View.card, d);
        const bFav = el('div', 'cc-btn' + (fav ? ' on' : ''), I_STAR + (fav ? 'В избранном' : 'Избранное'));
        bFav._ccAction = () => {
            const now = toggleFavorite(View.card, d);
            if (now == null) { notify('Lampa не дала доступ к избранному'); return; }
            bFav.innerHTML = I_STAR + (now ? 'В избранном' : 'Избранное');
            if (now) addClass(bFav, 'on'); else removeClass(bFav, 'on');
            vibrate(12);
            notify(now ? 'Добавлено в избранное' : 'Убрано из избранного');
        };
        const bMore = el('div', 'cc-btn', I_DOTS + 'Ещё');
        bMore._ccAction = () => View.menu();
        [bWatch, bTrailer, bFav, bMore].forEach(b => { if (b) acts.appendChild(b); });
        info.appendChild(acts);
        hero.appendChild(info);
        View.scroll.appendChild(hero);

        Nav.addRow([poster], 'poster');
        Nav.addRow([bWatch, bTrailer, bFav, bMore].filter(Boolean), 'acts');

        // ── съёмочная группа ─────────────────────────────────
        const cast = ((d.credits && d.credits.cast) || []).slice(0, 20);
        if (cast.length) {
            const nodes = cast.map(p => {
                const n = el('div', 'cc-person');
                const ph = el('div', 'ph');
                const im = el('img');
                im.alt = ''; im.decoding = 'async'; im.loading = 'lazy';
                im.onload = () => addClass(im, 'ready');
                if (p.profile_path) im.src = Src.img('w185', p.profile_path);
                ph.appendChild(im);
                n.appendChild(ph);
                n.appendChild(el('div', 'nm', esc(p.name || '')));
                n.appendChild(el('div', 'rl', esc(p.character || '')));
                n._ccAction = () => View.person(p);
                return n;
            });
            View.scroll.appendChild(View.section('В ролях', cast.length, nodes));
            Nav.addRow(nodes, 'cast');
        }

        // ── похожее ──────────────────────────────────────────
        const recs = (d._recs || []).filter(r => r && r.poster_path).slice(0, 20);
        if (recs.length) {
            const nodes = recs.map(r => {
                const n = el('div', 'cc-mini');
                const im = el('img');
                im.alt = ''; im.decoding = 'async'; im.loading = 'lazy';
                im.onload = () => addClass(im, 'ready');
                im.src = Src.img('w342', r.poster_path);
                n.appendChild(im);
                if (r.vote_average) n.appendChild(el('div', 'mrate cc-mono', r.vote_average.toFixed(1)));
                n.appendChild(el('div', 'cap', esc(r.title || r.name || '')));
                n._ccAction = () => openCard(r);
                return n;
            });
            View.scroll.appendChild(View.section('Похожее', recs.length, nodes));
            Nav.addRow(nodes, 'recs');
        }

        // ── комментарии ──────────────────────────────────────
        View.renderComments();

        Nav.setFocus(1, 0, true);
        try { View.scroll.scrollTop = 0; } catch (e) {}
    },

    section: (title, count, nodes) => {
        const sec = el('div', 'cc-sec');
        const h = el('div', 'cc-sec-h');
        h.appendChild(el('div', 'cc-sec-t', esc(title)));
        if (count) h.appendChild(el('div', 'cc-sec-n cc-mono', String(count)));
        sec.appendChild(h);
        const row = el('div', 'cc-row');
        nodes.forEach(n => row.appendChild(n));
        sec.appendChild(row);
        return sec;
    },

    // Отзывы TMDb + собственная заметка, которая живёт в localStorage
    renderComments: () => {
        const d = View.data;
        const sec = el('div', 'cc-sec');
        sec.id = 'cc-comments';
        const h = el('div', 'cc-sec-h');
        h.appendChild(el('div', 'cc-sec-t', 'Комментарии'));
        const reviews = (d._reviews || []).slice(0, 12);
        h.appendChild(el('div', 'cc-sec-n cc-mono', String(reviews.length)));
        sec.appendChild(h);

        const row = el('div', 'cc-row');
        const nodes = [];

        const mineKey = 'note_' + View.type + '_' + View.id;
        const mineText = pGet(mineKey, '');
        const mine = el('div', 'cc-cmt mine');
        const rebuildMine = () => {
            const txt = pGet(mineKey, '');
            mine.innerHTML = '';
            const hd = el('div', 'hd');
            hd.appendChild(el('div', 'av', '✎'));
            hd.appendChild(el('div', 'au', 'Моя заметка'));
            hd.appendChild(el('div', 'st cc-mono', txt ? 'ИЗМЕНИТЬ' : 'ДОБАВИТЬ'));
            mine.appendChild(hd);
            mine.appendChild(el('div', 'tx', txt ? esc(txt) : 'Записать мысль о фильме — она сохранится на этом устройстве.'));
            if (txt) mine.appendChild(el('div', 'dt cc-mono', 'ТОЛЬКО ДЛЯ ВАС'));
        };
        rebuildMine();
        mine._ccAction = () => askText('Заметка о фильме', pGet(mineKey, ''), (v) => {
            const val = String(v == null ? '' : v).trim();
            pSet(mineKey, val);
            rebuildMine();
            notify(val ? 'Заметка сохранена' : 'Заметка очищена');
        });
        row.appendChild(mine); nodes.push(mine);

        reviews.forEach(rv => {
            const author = (rv.author_details && rv.author_details.username) || rv.author || 'Аноним';
            const rating = rv.author_details && rv.author_details.rating;
            const n = el('div', 'cc-cmt');
            const hd = el('div', 'hd');
            hd.appendChild(el('div', 'av', esc(String(author).slice(0, 1).toUpperCase())));
            hd.appendChild(el('div', 'au', esc(author)));
            if (rating) hd.appendChild(el('div', 'st cc-mono', '★ ' + rating));
            n.appendChild(hd);
            n.appendChild(el('div', 'tx', esc(String(rv.content || '').replace(/\s+/g, ' '))));
            if (rv.created_at) n.appendChild(el('div', 'dt cc-mono', fmtDate(rv.created_at).toUpperCase()));
            n._ccAction = () => Modal.open({
                title: author,
                text: esc(String(rv.content || '')).replace(/\n/g, '<br>'),
                items: [{ label: 'Закрыть' }]
            });
            row.appendChild(n); nodes.push(n);
        });

        if (!reviews.length) row.appendChild(el('div', 'cc-empty', 'На TMDb для этого фильма отзывов пока нет — но заметку оставить можно.'));

        sec.appendChild(row);
        View.scroll.appendChild(sec);
        Nav.addRow(nodes, 'comments');
    },

    trailerKey: () => {
        const d = View.data;
        const list = (d && d.videos && d.videos.results) || [];
        let best = null;
        list.forEach(v => {
            if (!v || v.site !== 'YouTube' || !v.key) return;
            const isTrailer = /trailer|трейлер/i.test(v.type + ' ' + (v.name || ''));
            const score = (isTrailer ? 10 : 0) + (v.iso_639_1 === 'ru' ? 5 : 0) + (v.official ? 2 : 0);
            if (!best || score > best.score) best = { key: v.key, score };
        });
        return best ? best.key : '';
    },

    playTrailer: (key) => {
        Ctrl.lock(4000);
        try { if (window.Lampa && window.Lampa.Youtube && window.Lampa.Youtube.play) { window.Lampa.Youtube.play({ id: key, title: (View.data && (View.data.title || View.data.name)) || 'Трейлер' }); return; } } catch (e) {}
        try { if (window.Lampa && window.Lampa.Player && window.Lampa.Player.play) { window.Lampa.Player.play({ url: 'https://www.youtube.com/watch?v=' + key, title: 'Трейлер' }); return; } } catch (e) {}
        Ctrl.free();
        notify('Плеер трейлеров недоступен');
    },

    person: (p) => {
        Modal.open({
            title: p.name || 'Актёр',
            text: (p.character ? 'Роль: <b>' + esc(p.character) + '</b><br>' : '') + (p.known_for_department ? esc(p.known_for_department) : ''),
            items: [
                { label: 'Искать по актёру', hint: 'откроет поиск Lampa', onSelect: () => searchLampa(p.name) },
                { label: 'Закрыть' }
            ]
        });
    },

    gallery: () => {
        const d = View.data;
        Modal.open({
            title: d.title || d.name || '',
            text: esc(d.overview || 'Описания нет.'),
            items: [
                { label: 'Смотреть', onSelect: () => openNative() },
                { label: 'Закрыть' }
            ]
        });
    },

    menu: () => {
        const d = View.data;
        Modal.open({
            title: 'Ещё',
            items: [
                { label: 'Открыть обычную карточку Lampa', hint: 'все источники и балансеры', onSelect: () => openNative() },
                { label: 'Полное описание', onSelect: () => Modal.open({ title: d.title || d.name || '', text: esc(d.overview || 'Описания нет.'), items: [{ label: 'Закрыть' }] }) },
                { label: 'Сведения', hint: 'бюджет, сборы, студии', onSelect: () => View.details() },
                { label: 'Тема под фильм: ' + (pGet('film_theme', true) ? 'включена' : 'выключена'), hint: MOD() ? 'палитра из «Капсулы»' : 'нужен плагин «Капсула»', onSelect: () => { pSet('film_theme', !pGet('film_theme', true)); Fx.mode = null; Theme.apply(View.root, View.data || View.card); Fx.ensureSize(); notify('Готово'); } },
                { label: 'Фоновая анимация: ' + (pGet('fx', true) ? 'включена' : 'выключена'), onSelect: () => { pSet('fx', !pGet('fx', true)); Fx.mode = null; Theme.apply(View.root, View.data || View.card); Fx.ensureSize(); } },
                { label: 'Новая карточка: ' + (pGet('enabled', true) ? 'включена' : 'выключена'), hint: 'выключить — вернётся стандартный экран Lampa', onSelect: () => { pSet('enabled', !pGet('enabled', true)); notify(pGet('enabled', true) ? 'Карточка «Капсулы» включена' : 'Вернул стандартную карточку'); } },
                { label: 'Закрыть' }
            ]
        });
    },

    details: () => {
        const d = View.data;
        const money = (v) => v ? new Intl.NumberFormat('ru-RU').format(v) + ' $' : '—';
        let html = '';
        if (d.release_date || d.first_air_date) html += 'Дата выхода: <b>' + esc(fmtDate(d.release_date || d.first_air_date)) + '</b><br>';
        if (View.type === 'movie') {
            html += 'Бюджет: <b>' + esc(money(d.budget)) + '</b><br>';
            html += 'Сборы: <b>' + esc(money(d.revenue)) + '</b><br>';
        }
        const studios = (d.production_companies || []).map(c => c.name).slice(0, 4).join(', ');
        if (studios) html += 'Студии: <b>' + esc(studios) + '</b><br>';
        const countries = (d.production_countries || []).map(c => c.name).join(', ');
        if (countries) html += 'Страны: <b>' + esc(countries) + '</b><br>';
        if (d.original_language) html += 'Язык оригинала: <b>' + esc(String(d.original_language).toUpperCase()) + '</b><br>';
        const crew = ((d.credits && d.credits.crew) || []).filter(c => c.job === 'Director').map(c => c.name).slice(0, 3).join(', ');
        if (crew) html += 'Режиссёр: <b>' + esc(crew) + '</b><br>';
        Modal.open({ title: 'Сведения', text: html || 'Данных нет.', items: [{ label: 'Закрыть' }] });
    }
};

// ═══════════════════════════════════════════ ИНТЕГРАЦИЯ С LAMPA
let nativePush = null;

const openNative = () => {
    const d = View.data || View.card || {};
    Ctrl.lock(4000);
    try {
        if (window.Lampa && window.Lampa.Activity) {
            const card = Object.assign({}, View.card || {}, d);
            (nativePush || window.Lampa.Activity.push).call(window.Lampa.Activity, {
                url: '', component: 'full', id: View.id,
                method: View.type, card: card, source: (View.card && View.card.source) || 'tmdb',
                _cc_skip: true
            });
            return;
        }
    } catch (e) { Ctrl.free(); }
    notify('Lampa не отвечает');
};

const openCard = (item) => {
    if (!item || !item.id) return;
    Ctrl.lock(3000);
    try {
        if (window.Lampa && window.Lampa.Activity) {
            window.Lampa.Activity.push({
                url: '', component: 'full', id: item.id,
                method: item.media_type === 'tv' || item.first_air_date ? 'tv' : 'movie',
                card: item, source: 'tmdb'
            });
        }
    } catch (e) { Ctrl.free(); }
};

const searchLampa = (query) => {
    if (!query) return;
    Ctrl.lock(4000);
    try {
        if (window.Lampa && window.Lampa.Search && window.Lampa.Search.open) { window.Lampa.Search.open({ input: query }); return; }
        if (window.Lampa && window.Lampa.Activity) { window.Lampa.Activity.push({ url: '', title: 'Поиск', component: 'search', search: query, page: 1 }); return; }
    } catch (e) { Ctrl.free(); }
    notify('Поиск недоступен');
};

const isFavorite = (card, data) => {
    try {
        if (window.Lampa && window.Lampa.Favorite && window.Lampa.Favorite.check) {
            const st = window.Lampa.Favorite.check(Object.assign({}, card || {}, { id: View.id }));
            return !!(st && (st.like || st.book || st.wath));
        }
    } catch (e) {}
    return false;
};

const toggleFavorite = (card, data) => {
    const item = Object.assign({}, card || {}, data || {}, { id: View.id });
    try {
        if (!(window.Lampa && window.Lampa.Favorite)) return null;
        const st = window.Lampa.Favorite.check ? window.Lampa.Favorite.check(item) : null;
        const on = !!(st && st.like);
        if (on) { if (window.Lampa.Favorite.remove) window.Lampa.Favorite.remove('like', item); }
        else { if (window.Lampa.Favorite.add) window.Lampa.Favorite.add('like', item); }
        return !on;
    } catch (e) { return null; }
};

// ═══════════════════════════════════════════ КЛАВИШИ
const KEYS = { 37: 'left', 38: 'up', 39: 'right', 40: 'down', 13: 'enter', 32: 'enter', 8: 'back', 27: 'back', 461: 'back', 10009: 'back' };
const route = (kind) => {
    if (Modal.active()) {
        if (kind === 'back') Modal.close();
        else if (kind === 'enter') Modal.enter();
        else Modal.move(kind);
        return;
    }
    if (kind === 'enter') return Nav.enter();
    if (kind === 'back') return exitCard();
    if (kind === 'left' || kind === 'right') { Nav.moveH(kind); return; }
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

const exitCard = () => {
    Modal.close(true);
    let ok = false;
    try {
        if (window.Lampa && window.Lampa.Activity && window.Lampa.Activity.backward) { Ctrl.lock(3000); window.Lampa.Activity.backward(); ok = true; }
    } catch (e) {}
    setTimeout(() => {
        if (!App.active) return;
        try { if (window.Lampa && window.Lampa.Controller) { window.Lampa.Controller.toggle('menu'); return; } } catch (e) {}
        if (!ok) { try { window.history.back(); } catch (e) {} }
    }, 500);
};

// ═══════════════════════════════════════════ КОМПОНЕНТ
const CardComponent = function (object) {
    let node = null, wrapped = null;
    this.create = () => { node = View.create(object); wrapped = window.$ ? window.$(node) : node; return this.render(); };
    this.render = () => wrapped;
    this.start = () => {
        App.active = true;
        Fx.resume(); Fx.ensureSize();
        let ok = false;
        try { ok = !!(window.Lampa && window.Lampa.Controller && window.Lampa.Controller.add); } catch (e) {}
        if (ok) {
            window.Lampa.Controller.add(CTRL_ID, {
                toggle: () => { try { window.Lampa.Controller.clear(); } catch (e) {} Nav.paint(true); },
                up: () => route('up'),
                down: () => route('down'),
                left: () => route('left'),
                right: () => route('right'),
                enter: () => route('enter'),
                back: () => route('back')
            });
            window.Lampa.Controller.toggle(CTRL_ID);
            Ctrl.start();
        } else {
            App.fallback = true;
            document.addEventListener('keydown', keyFallback, true);
        }
    };
    this.pause = () => { App.active = false; Ctrl.stop(); Fx.pause(); };
    this.stop = () => { App.active = false; Ctrl.stop(); Fx.pause(); };
    this.resume = () => { App.active = true; Fx.resume(); Fx.ensureSize(); Ctrl.start(); reclaim(); };
    this.destroy = () => {
        App.active = false;
        View.destroyed = true;
        View.token++;
        Ctrl.stop(); Ctrl.free();
        if (App.fallback) { document.removeEventListener('keydown', keyFallback, true); App.fallback = false; }
        Modal.close(true);
        Toast.kill();
        Net.abort();
        Fx.stop();
        if (node && node.parentNode) node.parentNode.removeChild(node);
        node = null; wrapped = null;
        View.root = null; View.scroll = null; View.back = null; View.sys = null;
        View.data = null; View.card = null;
        Nav.reset();
    };
};

// ═══════════════════════════════════════════ ПЕРЕХВАТ ОТКРЫТИЯ КАРТОЧКИ
const hookActivity = () => {
    try {
        if (!(window.Lampa && window.Lampa.Activity && window.Lampa.Activity.push)) return false;
        if (nativePush) return true;
        nativePush = window.Lampa.Activity.push;
        window.Lampa.Activity.push = function (params) {
            try {
                if (params && params.component === 'full' && !params._cc_skip && pGet('enabled', true)) {
                    const id = parseInt(params.id || (params.card && params.card.id), 10);
                    if (id) {
                        const clone = {};
                        for (const k in params) clone[k] = params[k];
                        clone.component = COMPONENT_ID;
                        clone.id = id;
                        return nativePush.call(window.Lampa.Activity, clone);
                    }
                }
            } catch (e) { console.error('[Карточка] перехват:', e); }
            return nativePush.apply(window.Lampa.Activity, arguments);
        };
        return true;
    } catch (e) { return false; }
};

document.addEventListener('visibilitychange', () => {
    if (document.hidden) Fx.pause();
    else if (App.active) Fx.resume();
});

(() => {
    const boot = () => {
        try {
            if (window.Lampa && window.Lampa.Component && window.Lampa.Component.add) window.Lampa.Component.add(COMPONENT_ID, CardComponent);
            hookActivity();
            console.log('[Карточка] v' + VERSION + ' загружена' + (MOD() ? ', темы из «Капсулы» v' + MOD().version : ', автономный режим'));
        } catch (e) { console.error('[Карточка] ошибка старта:', e); }
    };
    boot();
    try { if (window.Lampa && window.Lampa.Listener) window.Lampa.Listener.follow('app', (e) => { if (e.type === 'ready') { hookActivity(); } }); } catch (e) {}
    setTimeout(hookActivity, 1500);
    setTimeout(hookActivity, 4000);
})();
})();
