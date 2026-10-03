/*
 * CAPSULE Trailer for Lampa
 * Minimal trailer provider focused on sources that can be used without a browser hand-off.
 *
 * Integration points verified against current Lampa source:
 * - Lampa.Listener 'full' / type 'complite'
 * - .buttons--container / source grouping in full/start/buttons.js
 * - Lampa.Activity / Lampa.Component
 * - Lampa.Scroll / Lampa.Controller / global Navigator
 * - Lampa.Reguest
 * - Lampa.Player / Lampa.PlayerVideo.registerTube
 *
 * Providers:
 * 1. Native direct trailers already present in the Lampa full-card payload (YouTube excluded).
 * 2. RUTUBE public search + official embed player API; Android additionally attempts direct HLS.
 */
(function () {
    'use strict';

    if (window.capsule_trailer_ready) return;
    window.capsule_trailer_ready = true;

    var VERSION = '1.0.0';
    var COMPONENT = 'capsule_trailer';
    var CACHE_KEY = 'capsule_trailer_cache_v1';
    var CACHE_TTL = 1000 * 60 * 60 * 6;
    var CACHE_MAX = 40;
    var SEARCH_TIMEOUT = 8000;
    var RESOLVE_TIMEOUT = 7000;
    var jsonpSerial = 0;

    var ICON = '' +
        '<svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
            '<rect x="4.5" y="7.5" width="23" height="17" rx="7.5" stroke="currentColor" stroke-width="2.2"/>' +
            '<path d="M14 12.1L20.6 16L14 19.9V12.1Z" fill="currentColor"/>' +
        '</svg>';

    function log() {
        if (!window.console || !console.log) return;
        var args = ['[CAPSULE Trailer]'];
        for (var i = 0; i < arguments.length; i++) args.push(arguments[i]);
        try { console.log.apply(console, args); } catch (e) {}
    }

    function parseMaybeJson(data) {
        if (typeof data !== 'string') return data;
        try { return JSON.parse(data); } catch (e) { return null; }
    }

    function cleanText(value) {
        return String(value || '')
            .toLowerCase()
            .replace(/ё/g, 'е')
            .replace(/[^0-9a-zа-я]+/gi, ' ')
            .replace(/\s+/g, ' ')
            .replace(/^\s+|\s+$/g, '');
    }

    function escapeHtml(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function yearOf(movie) {
        var date = movie && (movie.release_date || movie.first_air_date) || '';
        var match = String(date).match(/^(\d{4})/);
        return match ? match[1] : '';
    }

    function mediaType(movie) {
        if (!movie) return 'movie';
        if (movie.media_type === 'tv' || movie.name || movie.original_name || movie.first_air_date) return 'tv';
        return 'movie';
    }

    function titleVariants(movie) {
        var raw = [
            movie && movie.title,
            movie && movie.name,
            movie && movie.original_title,
            movie && movie.original_name
        ];
        var out = [];
        var seen = {};
        for (var i = 0; i < raw.length; i++) {
            var value = cleanText(raw[i]);
            if (value && !seen[value]) {
                seen[value] = true;
                out.push(value);
            }
        }
        return out;
    }

    function words(value) {
        var text = cleanText(value);
        return text ? text.split(' ') : [];
    }

    function containsYoutube(url) {
        return /(?:youtube\.com|youtu\.be)/i.test(String(url || ''));
    }

    function rutubeId(url) {
        var match = String(url || '').match(/rutube\.ru\/(?:play\/embed|video(?:\/private)?|shorts)\/([0-9a-z]{32})/i);
        return match ? match[1] : '';
    }

    function secondsText(value) {
        var n = parseInt(value, 10);
        if (!n || n < 1) return '';
        var m = Math.floor(n / 60);
        var s = n % 60;
        return m + ':' + (s < 10 ? '0' : '') + s;
    }

    function inferLanguage(item) {
        if (item.language) return String(item.language).toUpperCase();
        var text = cleanText((item.title || '') + ' ' + (item.description || ''));
        if (/(русск|дубляж|дублирован|озвуч)/.test(text)) return 'RU';
        if (/(english|original trailer)/.test(text)) return 'EN';
        return '';
    }

    function isTrailerTitle(title) {
        var text = cleanText(title);
        return /(^| )(трейлер|trailer|тизер|teaser)( |$)/.test(text);
    }

    function explicitYears(text) {
        var matches = String(text || '').match(/(?:19|20)\d{2}/g) || [];
        var out = [];
        for (var i = 0; i < matches.length; i++) {
            if (out.indexOf(matches[i]) < 0) out.push(matches[i]);
        }
        return out;
    }

    function coverage(resultTitle, variant) {
        var target = words(variant);
        var hay = ' ' + cleanText(resultTitle) + ' ';
        if (!target.length) return 0;
        var found = 0;
        for (var i = 0; i < target.length; i++) {
            if (hay.indexOf(' ' + target[i] + ' ') >= 0) found++;
        }
        return found / target.length;
    }

    function scoreRutube(item, movie) {
        if (!item || !item.id || !item.title) return -9999;
        if (item.is_hidden || item.is_deleted || item.is_locked || item.is_audio || item.is_paid || item.is_livestream || item.is_adult) return -9999;

        var duration = parseInt(item.duration, 10) || 0;
        if (duration && (duration < 15 || duration > 600)) return -9999;
        if (!isTrailerTitle(item.title)) return -9999;

        var variants = titleVariants(movie);
        var normalizedTitle = cleanText(item.title);
        var best = 0;

        for (var i = 0; i < variants.length; i++) {
            var variant = variants[i];
            var c = coverage(normalizedTitle, variant);
            var value = Math.round(c * 100);
            if (normalizedTitle.indexOf(variant) >= 0) value += 95;
            if (c === 1) value += 35;
            if (value > best) best = value;
        }

        if (best < 70) return -9999;

        var score = best + 35;
        var year = yearOf(movie);
        var years = explicitYears(item.title + ' ' + (item.description || ''));
        if (year) {
            if (years.indexOf(year) >= 0) score += 40;
            else if (years.length) {
                var near = false;
                for (var y = 0; y < years.length; y++) {
                    if (Math.abs(parseInt(years[y], 10) - parseInt(year, 10)) <= 1) near = true;
                }
                if (!near) return -9999;
                score -= 10;
            }
        }

        var text = cleanText(item.title + ' ' + (item.description || ''));
        if (/(официальн|official)/.test(text)) score += 20;
        if (/(русск|дубляж|дублирован)/.test(text)) score += 18;
        if (duration >= 45 && duration <= 240) score += 12;

        if (mediaType(movie) === 'tv') {
            if (/(сериал|series|season|сезон)/.test(text)) score += 12;
        }
        else if (/(сериал|season|сезон)/.test(text)) {
            score -= 35;
        }

        return score;
    }

    function cacheGet(key) {
        var cache = Lampa.Storage.get(CACHE_KEY, {});
        if (!cache || typeof cache !== 'object') return null;
        var entry = cache[key];
        if (!entry || !entry.time || Date.now() - entry.time > CACHE_TTL || !entry.items) return null;
        return entry.items;
    }

    function cachePut(key, items) {
        var cache = Lampa.Storage.get(CACHE_KEY, {});
        if (!cache || typeof cache !== 'object') cache = {};
        cache[key] = { time: Date.now(), items: items };

        var keys = Object.keys(cache);
        if (keys.length > CACHE_MAX) {
            keys.sort(function (a, b) {
                return (cache[a].time || 0) - (cache[b].time || 0);
            });
            while (keys.length > CACHE_MAX) delete cache[keys.shift()];
        }

        Lampa.Storage.set(CACHE_KEY, cache, true);
    }

    function cacheDrop(key) {
        var cache = Lampa.Storage.get(CACHE_KEY, {});
        if (cache && typeof cache === 'object' && cache[key]) {
            delete cache[key];
            Lampa.Storage.set(CACHE_KEY, cache, true);
        }
    }

    function jsonp(url, timeout, done) {
        var callbackName = '__capsuleTrailerJsonp' + Date.now() + '_' + (++jsonpSerial);
        var script = document.createElement('script');
        var timer = null;
        var finished = false;

        function finish(error, data) {
            if (finished) return;
            finished = true;
            if (timer) clearTimeout(timer);
            try { if (script.parentNode) script.parentNode.removeChild(script); } catch (e) {}
            try { delete window[callbackName]; } catch (e2) { window[callbackName] = undefined; }
            done(error, data);
        }

        window[callbackName] = function (data) {
            finish(null, data);
        };

        script.async = true;
        script.onerror = function () {
            finish(new Error('jsonp-network'));
        };
        script.src = url + (url.indexOf('?') >= 0 ? '&' : '?') + 'format=jsonp&callback=' + encodeURIComponent(callbackName);
        document.head.appendChild(script);

        timer = setTimeout(function () {
            finish(new Error('jsonp-timeout'));
        }, timeout || SEARCH_TIMEOUT);

        return function () {
            finish(new Error('cancelled'));
        };
    }

    function nativeRequest(url, timeout, done) {
        var network = new Lampa.Reguest();
        var finished = false;
        network.timeout(timeout || SEARCH_TIMEOUT);

        function finish(error, data) {
            if (finished) return;
            finished = true;
            try { network.clear(); } catch (e) {}
            done(error, parseMaybeJson(data));
        }

        try {
            network.native(url, function (data) {
                finish(null, data);
            }, function () {
                finish(new Error('network'));
            }, false, {
                timeout: timeout || SEARCH_TIMEOUT,
                headers: {
                    'Accept': 'application/json'
                }
            });
        }
        catch (e) {
            finish(e);
        }

        return function () {
            finished = true;
            try { network.clear(); } catch (e) {}
        };
    }

    function requestRutubeSearch(query, done) {
        var base = 'https://rutube.ru/api/search/video/?query=' + encodeURIComponent(query) + '&page=1&limit=20';
        var cancelled = false;
        var cancelCurrent = null;

        function finish(error, data) {
            if (cancelled) return;
            done(error, data);
        }

        if (Lampa.Platform && Lampa.Platform.is && Lampa.Platform.is('android')) {
            cancelCurrent = nativeRequest(base + '&format=json', SEARCH_TIMEOUT, finish);
        }
        else {
            cancelCurrent = jsonp(base, 5500, function (error, data) {
                if (!error && data) return finish(null, data);
                if (cancelled) return;
                cancelCurrent = nativeRequest(base + '&format=json', 4500, finish);
            });
        }

        return function () {
            cancelled = true;
            if (cancelCurrent) cancelCurrent();
        };
    }

    function normalizeRutube(raw, movie) {
        var score = scoreRutube(raw, movie);
        if (score < 0) return null;
        return {
            id: String(raw.id),
            provider: 'rutube',
            providerName: 'RUTUBE',
            title: raw.title || 'Трейлер',
            description: raw.description || '',
            duration: parseInt(raw.duration, 10) || 0,
            thumbnail: raw.thumbnail_url || raw.thumbnail || '',
            author: raw.author && raw.author.name ? raw.author.name : '',
            score: score,
            language: '',
            url: raw.video_url || ('https://rutube.ru/video/' + raw.id + '/'),
            embed: 'https://rutube.ru/play/embed/' + raw.id
        };
    }

    function normalizeNative(videos) {
        var out = [];
        var list = videos && videos.results ? videos.results : [];
        for (var i = 0; i < list.length; i++) {
            var raw = list[i] || {};
            var url = raw.url || '';
            if (!url || containsYoutube(url) || raw.youtube === true) continue;
            if (!rutubeId(url) && !/\.(?:m3u8|mpd|mp4)(?:[?#]|$)/i.test(url)) continue;
            out.push({
                id: raw.key || url,
                provider: 'native',
                providerName: 'Lampa',
                title: raw.name || 'Трейлер',
                description: '',
                duration: 0,
                thumbnail: raw.icon || '',
                author: '',
                score: 1000,
                language: raw.iso_639_1 || '',
                url: url,
                embed: rutubeId(url) ? 'https://rutube.ru/play/embed/' + rutubeId(url) : ''
            });
        }
        return out;
    }

    var NativeProvider = {
        id: 'native',
        name: 'Lampa',
        search: function (context, done) {
            done(null, normalizeNative(context.videos));
            return function () {};
        },
        resolve: function (item, context, done) {
            done(null, {
                url: item.url,
                title: item.title,
                card: context.movie,
                capsule_trailer: true
            });
            return function () {};
        }
    };

    var RutubeProvider = {
        id: 'rutube',
        name: 'RUTUBE',
        search: function (context, done) {
            var movie = context.movie || {};
            var variants = titleVariants(movie);
            var title = movie.title || movie.name || movie.original_title || movie.original_name || '';
            var original = movie.original_title || movie.original_name || '';
            var year = yearOf(movie);
            var typeHint = mediaType(movie) === 'tv' ? 'сериал' : '';
            var queries = [];
            var cancelled = false;
            var cancelCurrent = null;
            var rawResults = [];
            var seenRaw = {};
            var index = 0;
            var key = mediaType(movie) + ':' + (movie.id || cleanText(title)) + ':' + year;
            var cached = cacheGet(key);

            if (cached) {
                done(null, cached);
                return function () {};
            }

            function addQuery(value) {
                value = cleanText(value);
                if (value && queries.indexOf(value) < 0) queries.push(value);
            }

            addQuery([title, year, typeHint, 'трейлер'].join(' '));
            if (original && cleanText(original) !== cleanText(title)) addQuery([original, year, mediaType(movie) === 'tv' ? 'series' : '', 'trailer'].join(' '));

            function finish() {
                if (cancelled) return;
                var normalized = [];
                for (var i = 0; i < rawResults.length; i++) {
                    var item = normalizeRutube(rawResults[i], movie);
                    if (item) normalized.push(item);
                }
                normalized.sort(function (a, b) { return b.score - a.score; });
                normalized = normalized.slice(0, 12);
                cachePut(key, normalized);
                done(null, normalized);
            }

            function next() {
                if (cancelled) return;
                if (index >= queries.length) return finish();
                var query = queries[index++];

                cancelCurrent = requestRutubeSearch(query, function (error, data) {
                    if (cancelled) return;
                    if (error) {
                        cacheDrop(key);
                        if (rawResults.length) finish();
                        else done(error, []);
                        return;
                    }

                    if (!data || !data.results || !data.results.length) {
                        if (index >= queries.length && !rawResults.length) {
                            cachePut(key, []);
                            done(null, []);
                        }
                        else next();
                        return;
                    }

                    for (var i = 0; i < data.results.length; i++) {
                        var raw = data.results[i];
                        if (raw && raw.id && !seenRaw[raw.id]) {
                            seenRaw[raw.id] = true;
                            rawResults.push(raw);
                        }
                    }

                    var confident = 0;
                    for (var j = 0; j < rawResults.length; j++) {
                        if (scoreRutube(rawResults[j], movie) >= 170) confident++;
                    }

                    if (confident >= 4 || index >= queries.length) finish();
                    else next();
                });
            }

            if (!variants.length || !queries.length) {
                done(null, []);
                return function () {};
            }

            next();

            return function () {
                cancelled = true;
                if (cancelCurrent) cancelCurrent();
            };
        },
        resolve: function (item, context, done) {
            var embedData = {
                url: item.embed || ('https://rutube.ru/play/embed/' + item.id),
                title: item.title,
                card: context.movie,
                capsule_trailer: true,
                capsule_source: 'rutube-embed'
            };

            if (!(Lampa.Platform && Lampa.Platform.is && Lampa.Platform.is('android'))) {
                done(null, embedData);
                return function () {};
            }

            var url = 'https://rutube.ru/api/play/options/' + encodeURIComponent(item.id) + '/?format=json';
            var cancelled = false;
            var cancel = nativeRequest(url, RESOLVE_TIMEOUT, function (error, data) {
                if (cancelled) return;
                var hls = data && data.video_balancer && data.video_balancer.m3u8;
                if (!error && hls && /^https?:\/\//i.test(hls)) {
                    done(null, {
                        url: hls,
                        title: item.title,
                        card: context.movie,
                        capsule_trailer: true,
                        capsule_source: 'rutube-hls',
                        capsule_fallback: embedData.url
                    });
                }
                else {
                    done(null, embedData);
                }
            });

            return function () {
                cancelled = true;
                cancel();
            };
        }
    };

    var PROVIDERS = [NativeProvider, RutubeProvider];

    function registerRutubeTube() {
        if (!Lampa.PlayerVideo || typeof Lampa.PlayerVideo.registerTube !== 'function') return;
        if (window.capsule_trailer_rutube_tube) return;

        var registration = {
            name: 'CAPSULE RUTUBE',
            verify: function (src) {
                return /^https?:\/\/(?:www\.)?rutube\.ru\/(?:play\/embed|video(?:\/private)?|shorts)\/[0-9a-z]{32}/i.test(String(src || ''));
            },
            create: function (callVideo) {
                var object = $('<div class="capsule-rutube-player"></div>');
                var video = object[0];
                var listener = Lampa.Subscribe();
                var frame = null;
                var streamUrl = '';
                var current = 0;
                var duration = 0;
                var paused = true;
                var volume = 1;
                var muted = false;
                var ready = false;
                var wantedPlay = false;
                var ended = false;
                var qualityList = [];
                var currentQuality = 0;
                var playTimer = null;

                function post(type, data) {
                    if (!frame || !frame.contentWindow) return;
                    try {
                        frame.contentWindow.postMessage(JSON.stringify({ type: type, data: data || {} }), '*');
                    }
                    catch (e) {}
                }

                function sendEnded() {
                    if (ended) return;
                    ended = true;
                    paused = true;
                    listener.send('ended');
                }

                function levels() {
                    if (!qualityList.length || !Lampa.PlayerVideo.listener || !Lampa.PlayerVideo.listener.send) return;
                    var result = [];
                    for (var i = 0; i < qualityList.length; i++) {
                        (function (height) {
                            var level = {
                                title: height + 'p',
                                quality: height + 'p',
                                height: height,
                                selected: parseInt(currentQuality, 10) === parseInt(height, 10)
                            };
                            Object.defineProperty(level, 'enabled', {
                                configurable: true,
                                set: function (value) {
                                    if (!value) return;
                                    currentQuality = height;
                                    post('player:changeQuality', { quality: String(height) });
                                },
                                get: function () {}
                            });
                            result.push(level);
                        })(qualityList[i]);
                    }
                    Lampa.PlayerVideo.listener.send('levels', {
                        levels: result,
                        current: currentQuality ? currentQuality + 'p' : 'AUTO'
                    });
                }

                function parseMessage(event) {
                    if (!frame || event.source !== frame.contentWindow) return null;
                    if (event.origin && event.origin !== 'https://rutube.ru') return null;
                    var message = event.data;
                    if (typeof message === 'string') {
                        try { message = JSON.parse(message); } catch (e) { return null; }
                    }
                    return message && message.type ? message : null;
                }

                function onMessage(event) {
                    var message = parseMessage(event);
                    if (!message) return;
                    var data = message.data || {};

                    if (message.type === 'player:ready' || message.type === 'player:init') {
                        var firstReady = !ready;
                        ready = true;
                        post('player:hideControls');
                        post(muted ? 'player:mute' : 'player:unMute');
                        post('player:setVolume', { volume: volume });
                        if (firstReady) {
                            listener.send('canplay');
                            listener.send('loadeddata');
                        }
                        if (wantedPlay) post('player:play');
                        return;
                    }

                    if (message.type === 'player:durationChange') {
                        duration = Number(data.duration) || duration;
                        listener.send('timeupdate');
                        return;
                    }

                    if (message.type === 'player:currentTime') {
                        current = Number(data.time) || 0;
                        listener.send('timeupdate');
                        return;
                    }

                    if (message.type === 'player:changeState') {
                        if (data.state === 'playing') {
                            ended = false;
                            paused = false;
                            clearTimeout(playTimer);
                            listener.send('playing');
                        }
                        else if (data.state === 'paused') {
                            paused = true;
                            listener.send('pause');
                        }
                        else if (data.state === 'stopped') {
                            sendEnded();
                        }
                        return;
                    }

                    if (message.type === 'player:buffering') {
                        listener.send('waiting');
                        return;
                    }

                    if (message.type === 'player:qualityList') {
                        qualityList = data.list && data.list.slice ? data.list.slice(0) : [];
                        qualityList.sort(function (a, b) { return parseInt(b, 10) - parseInt(a, 10); });
                        levels();
                        return;
                    }

                    if (message.type === 'player:currentQuality') {
                        var quality = data.quality || {};
                        currentQuality = quality.isAutoQuality ? 0 : (parseInt(quality.height || quality.quality, 10) || 0);
                        levels();
                        return;
                    }

                    if (message.type === 'player:volumeChange') {
                        if (typeof data.volume !== 'undefined') volume = Number(data.volume) || 0;
                        if (typeof data.muted !== 'undefined') muted = !!data.muted;
                        return;
                    }

                    if (message.type === 'player:playComplete') {
                        sendEnded();
                        return;
                    }

                    if (message.type === 'player:error') {
                        paused = true;
                        video.error = {
                            code: data.code || 'rutube',
                            message: data.text || 'RUTUBE playback error'
                        };
                        listener.send('error', { error: video.error, fatal: true });
                    }
                }

                function createFrame(id) {
                    if (frame) return;
                    frame = document.createElement('iframe');
                    frame.src = 'https://rutube.ru/play/embed/' + encodeURIComponent(id) + '?getPlayOptions=duration,title';
                    frame.setAttribute('frameborder', '0');
                    frame.setAttribute('allow', 'autoplay; fullscreen; picture-in-picture');
                    frame.setAttribute('allowfullscreen', 'true');
                    frame.style.width = '100%';
                    frame.style.height = '100%';
                    frame.style.border = '0';
                    frame.style.display = 'block';
                    frame.style.pointerEvents = 'none';
                    object.empty().append(frame);
                }

                Object.defineProperty(video, 'src', {
                    configurable: true,
                    set: function (value) { streamUrl = String(value || ''); },
                    get: function () { return streamUrl; }
                });
                Object.defineProperty(video, 'currentTime', {
                    configurable: true,
                    set: function (value) {
                        current = Math.max(0, Number(value) || 0);
                        post('player:setCurrentTime', { time: current });
                    },
                    get: function () { return current; }
                });
                Object.defineProperty(video, 'duration', {
                    configurable: true,
                    get: function () { return duration; }
                });
                Object.defineProperty(video, 'paused', {
                    configurable: true,
                    get: function () { return paused; }
                });
                Object.defineProperty(video, 'volume', {
                    configurable: true,
                    set: function (value) {
                        volume = Math.max(0, Math.min(1, Number(value) || 0));
                        if (ready) post('player:setVolume', { volume: volume });
                    },
                    get: function () { return volume; }
                });
                Object.defineProperty(video, 'muted', {
                    configurable: true,
                    set: function (value) {
                        muted = !!value;
                        if (ready) post(muted ? 'player:mute' : 'player:unMute');
                    },
                    get: function () { return muted; }
                });
                Object.defineProperty(video, 'videoWidth', {
                    configurable: true,
                    get: function () {
                        if (currentQuality >= 2160) return 3840;
                        if (currentQuality >= 1440) return 2560;
                        if (currentQuality >= 1080) return 1920;
                        if (currentQuality >= 720) return 1280;
                        return 854;
                    }
                });
                Object.defineProperty(video, 'videoHeight', {
                    configurable: true,
                    get: function () { return currentQuality || 480; }
                });
                Object.defineProperty(video, 'audioTracks', { configurable: true, get: function () { return []; } });
                Object.defineProperty(video, 'textTracks', { configurable: true, get: function () { return []; } });

                video.canPlayType = function () { return true; };
                video.addEventListener = listener.follow.bind(listener);
                video.load = function () {
                    var id = rutubeId(streamUrl);
                    if (!id) {
                        video.error = { code: 'rutube-url', message: 'Invalid RUTUBE URL' };
                        listener.send('error', { error: video.error, fatal: true });
                        return;
                    }
                    createFrame(id);
                };
                video.play = function () {
                    wantedPlay = true;
                    if (ready) post('player:play');
                    clearTimeout(playTimer);
                    playTimer = setTimeout(function () {
                        if (wantedPlay && paused && !ended) {
                            log('RUTUBE did not report playing state yet');
                        }
                    }, 12000);
                };
                video.pause = function () {
                    wantedPlay = false;
                    paused = true;
                    if (ready) post('player:pause');
                };
                video.resize = function () {};
                video.size = function () {};
                video.destroy = function () {
                    clearTimeout(playTimer);
                    try { post('player:remove'); } catch (e) {}
                    window.removeEventListener('message', onMessage);
                    try { if (frame && frame.parentNode) frame.parentNode.removeChild(frame); } catch (e2) {}
                    frame = null;
                    listener.destroy();
                    object.remove();
                };

                window.addEventListener('message', onMessage);
                callVideo(video);
                return object;
            }
        };

        if (Lampa.PlayerVideo.registerTube(registration)) {
            window.capsule_trailer_rutube_tube = registration;
        }
    }

    function registerPlaybackFallback() {
        if (window.capsule_trailer_playback_fallback) return;
        if (!Lampa.Player || !Lampa.Player.listener || !Lampa.PlayerVideo || !Lampa.PlayerVideo.listener) return;
        window.capsule_trailer_playback_fallback = true;

        Lampa.Player.listener.follow('start', function (data) {
            if (!data || !data.capsule_trailer || !data.capsule_fallback || data.capsule_source !== 'rutube-hls') return;

            var active = true;
            var used = false;

            function cleanup() {
                if (!active) return;
                active = false;
                try { Lampa.PlayerVideo.listener.remove('error', onError); } catch (e) {}
                try { Lampa.Player.listener.remove('destroy', onDestroy); } catch (e2) {}
            }

            function onDestroy() {
                cleanup();
            }

            function onError(event) {
                if (!active || used || !event || !event.fatal) return;
                used = true;

                var fallback = data.capsule_fallback;
                var fallbackData = {
                    url: fallback,
                    title: data.title,
                    card: data.card,
                    capsule_trailer: true,
                    capsule_source: 'rutube-embed'
                };

                cleanup();
                Lampa.Noty.show('RUTUBE: прямой поток недоступен, пробуем встроенный плеер');

                setTimeout(function () {
                    try {
                        if (Lampa.Player.opened && Lampa.Player.opened()) Lampa.Player.close();
                    }
                    catch (e) {}

                    setTimeout(function () {
                        try { Lampa.Player.play(fallbackData); }
                        catch (e2) { Lampa.Noty.show('CAPSULE Trailer: видео недоступно'); }
                    }, 80);
                }, 0);
            }

            Lampa.PlayerVideo.listener.follow('error', onError);
            Lampa.Player.listener.follow('destroy', onDestroy);
        });
    }

    function addStyles() {
        if (document.getElementById('capsule-trailer-style')) return;
        var style = document.createElement('style');
        style.id = 'capsule-trailer-style';
        style.textContent = '' +
            '.capsule-trailer{padding:1.8em 2.2em 3em;box-sizing:border-box;max-width:78em;margin:0 auto;color:inherit}' +
            '.capsule-trailer__head{display:flex;align-items:center;margin:0 0 1.5em}' +
            '.capsule-trailer__poster{width:4.2em;height:6.2em;object-fit:cover;border-radius:.45em;background:rgba(255,255,255,.07);flex:0 0 auto;margin-right:1.1em}' +
            '.capsule-trailer__poster--empty{display:flex;align-items:center;justify-content:center}' +
            '.capsule-trailer__poster--empty svg{width:2em;height:2em;opacity:.7}' +
            '.capsule-trailer__title{font-size:1.55em;font-weight:600;line-height:1.2}' +
            '.capsule-trailer__sub{font-size:.95em;opacity:.58;margin-top:.35em}' +
            '.capsule-trailer__status{font-size:.95em;opacity:.55;margin:.4em 0 1em}' +
            '.capsule-trailer__source{font-size:.82em;font-weight:600;letter-spacing:.08em;text-transform:uppercase;opacity:.48;margin:1.45em 0 .65em}' +
            '.capsule-trailer__item{display:flex;align-items:center;padding:.72em;border-radius:.55em;margin:.25em 0;transition:background-color .12s ease,transform .12s ease;box-sizing:border-box}' +
            '.capsule-trailer__item.focus,.capsule-trailer__item:hover{background:rgba(255,255,255,.13)}' +
            '.capsule-trailer__item.focus{transform:scale(1.012)}' +
            '.capsule-trailer__thumb{width:10.5em;height:5.9em;object-fit:cover;border-radius:.38em;background:rgba(255,255,255,.07);flex:0 0 auto;margin-right:1em}' +
            '.capsule-trailer__thumb--empty{display:flex;align-items:center;justify-content:center}' +
            '.capsule-trailer__thumb--empty svg{width:2em;height:2em;opacity:.55}' +
            '.capsule-trailer__meta{min-width:0;flex:1}' +
            '.capsule-trailer__name{font-size:1.05em;font-weight:500;line-height:1.3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
            '.capsule-trailer__line{font-size:.86em;opacity:.56;margin-top:.34em}' +
            '.capsule-trailer__empty{padding:2em 0;opacity:.65;font-size:1.05em}' +
            '.capsule-trailer__retry{display:inline-flex;align-items:center;padding:.72em 1.05em;border-radius:.5em;background:rgba(255,255,255,.1);margin-top:.8em}' +
            '.capsule-rutube-player{position:absolute;top:0;right:0;bottom:0;left:0;width:100%;height:100%;background:#000;overflow:hidden}' +
            '@media(max-width:700px){.capsule-trailer{padding:1.1em 1em 2.5em}.capsule-trailer__head{margin-bottom:1em}.capsule-trailer__poster{width:3.4em;height:5em;margin-right:.8em}.capsule-trailer__title{font-size:1.25em}.capsule-trailer__item{padding:.6em .2em;border-radius:.4em}.capsule-trailer__thumb{width:7.8em;height:4.39em;margin-right:.75em}.capsule-trailer__name{font-size:.98em}}';
        document.head.appendChild(style);
    }

    function imageUrl(movie) {
        if (!movie || !movie.poster_path) return '';
        if (Lampa.Api && Lampa.Api.img) {
            try { return Lampa.Api.img(movie.poster_path, 'w300'); } catch (e) {}
        }
        return 'https://image.tmdb.org/t/p/w300' + movie.poster_path;
    }

    function TrailerComponent(object) {
        var self = this;
        var movie = object.movie || {};
        var context = { movie: movie, videos: object.videos || { results: [] } };
        var html = $('<div class="capsule-trailer"></div>');
        var scroll = new Lampa.Scroll({ mask: true, over: true });
        var content = $('<div class="capsule-trailer__content"></div>');
        var status = $('<div class="capsule-trailer__status"></div>');
        var resultRoot = $('<div class="capsule-trailer__results"></div>');
        var alive = true;
        var started = false;
        var last = null;
        var providerIndex = 0;
        var totalResults = 0;
        var failures = [];
        var cancels = [];
        var resolvingCancel = null;
        var sourceBlocks = {};

        function header() {
            var poster = imageUrl(movie);
            var title = movie.title || movie.name || movie.original_title || movie.original_name || 'Трейлеры';
            var year = yearOf(movie);
            var left;
            if (poster) left = '<img class="capsule-trailer__poster" src="' + escapeHtml(poster) + '" />';
            else left = '<div class="capsule-trailer__poster capsule-trailer__poster--empty">' + ICON + '</div>';
            return $(
                '<div class="capsule-trailer__head">' +
                    left +
                    '<div><div class="capsule-trailer__title">' + escapeHtml(title) + '</div>' +
                    '<div class="capsule-trailer__sub">' + escapeHtml(year ? year + ' · CAPSULE Trailer' : 'CAPSULE Trailer') + '</div></div>' +
                '</div>'
            );
        }

        function ensureSource(item) {
            var key = item.provider || 'other';
            if (sourceBlocks[key]) return sourceBlocks[key].body;
            var block = $('<div class="capsule-trailer__block"></div>');
            block.append('<div class="capsule-trailer__source">' + escapeHtml(item.providerName || key) + '</div>');
            var body = $('<div></div>');
            block.append(body);
            resultRoot.append(block);
            sourceBlocks[key] = { block: block, body: body };
            return body;
        }

        function refreshCollection(item) {
            if (!started || !Lampa.Activity.own(self)) return;
            var enabled = Lampa.Controller.enabled();
            if (!enabled || enabled.name !== COMPONENT) return;
            if (item) Lampa.Controller.collectionAppend(item);
            if (!last) {
                var first = scroll.render().find('.selector').first();
                if (first.length) Lampa.Controller.collectionFocus(first, scroll.render());
            }
        }

        function itemMeta(item) {
            var parts = [];
            var lang = inferLanguage(item);
            if (lang) parts.push(lang);
            if (item.duration) parts.push(secondsText(item.duration));
            if (item.author) parts.push(item.author);
            return parts;
        }

        function makeItem(item, provider) {
            var meta = itemMeta(item);
            var thumb = item.thumbnail ?
                '<img class="capsule-trailer__thumb" src="' + escapeHtml(item.thumbnail) + '" />' :
                '<div class="capsule-trailer__thumb capsule-trailer__thumb--empty">' + ICON + '</div>';
            var el = $(
                '<div class="capsule-trailer__item selector">' +
                    thumb +
                    '<div class="capsule-trailer__meta">' +
                        '<div class="capsule-trailer__name">' + escapeHtml(item.title) + '</div>' +
                        '<div class="capsule-trailer__line">' + escapeHtml(meta.join(' · ')) + '</div>' +
                    '</div>' +
                '</div>'
            );
            el.on('hover:focus', function () {
                last = el;
                try { scroll.update(el, true); } catch (e) {}
            });

            el.on('hover:enter', function () {
                play(item, provider);
            });

            return el;
        }

        function appendResults(provider, items) {
            if (!alive || !items || !items.length) return;
            var body = ensureSource(items[0]);
            for (var i = 0; i < items.length; i++) {
                var el = makeItem(items[i], provider);
                body.append(el);
                totalResults++;
                refreshCollection(el);
            }
        }

        function providerDone(provider, error, items) {
            if (!alive) return;
            if (error) failures.push(provider.name);
            appendResults(provider, items || []);
            runNextProvider();
        }

        function runNextProvider() {
            if (!alive) return;
            if (providerIndex >= PROVIDERS.length) return searchFinished();
            var provider = PROVIDERS[providerIndex++];
            status.text('Поиск: ' + provider.name + '…');
            var cancel = provider.search(context, function (error, items) {
                providerDone(provider, error, items);
            });
            if (typeof cancel === 'function') cancels.push(cancel);
        }

        function clearSearchState() {
            for (var i = 0; i < cancels.length; i++) {
                try { cancels[i](); } catch (e) {}
            }
            cancels = [];
            providerIndex = 0;
            totalResults = 0;
            failures = [];
            sourceBlocks = {};
            resultRoot.empty();
        }

        function retry() {
            var key = mediaType(movie) + ':' + (movie.id || cleanText(movie.title || movie.name || '')) + ':' + yearOf(movie);
            cacheDrop(key);
            clearSearchState();
            resultRoot.empty();
            status.text('Ищем трейлеры…');
            self.activity.loader(true);
            runNextProvider();
        }

        function addRetry() {
            var retryButton = $('<div class="capsule-trailer__retry selector">Повторить поиск</div>');
            retryButton.on('hover:focus', function () {
                last = retryButton;
                try { scroll.update(retryButton, true); } catch (e) {}
            });
            retryButton.on('hover:enter', retry);
            resultRoot.append(retryButton);
            refreshCollection(retryButton);
        }

        function searchFinished() {
            if (!alive) return;
            self.activity.loader(false);
            if (totalResults) {
                var text = totalResults + ' ' + (totalResults === 1 ? 'вариант' : (totalResults < 5 ? 'варианта' : 'вариантов'));
                if (failures.length) text += ' · недоступно: ' + failures.join(', ');
                status.text(text);
            }
            else {
                status.text(failures.length ? 'Источники сейчас недоступны' : 'Трейлеры не найдены');
                resultRoot.append('<div class="capsule-trailer__empty">Для этой карточки подходящих трейлеров не найдено.</div>');
                addRetry();
            }
            self.activity.toggle();
        }

        function play(item, provider) {
            if (!alive || !provider || typeof provider.resolve !== 'function') return;
            if (resolvingCancel) {
                try { resolvingCancel(); } catch (e) {}
                resolvingCancel = null;
            }
            status.text('Подготовка видео…');
            self.activity.loader(true);
            resolvingCancel = provider.resolve(item, context, function (error, data) {
                resolvingCancel = null;
                if (!alive) return;
                self.activity.loader(false);
                if (error || !data || !data.url) {
                    status.text('Не удалось подготовить видео');
                    Lampa.Noty.show('CAPSULE Trailer: видео недоступно');
                    return;
                }
                status.text('Запуск: ' + (item.providerName || provider.name));
                try {
                    Lampa.Player.play(data);
                }
                catch (e) {
                    log('Player.play error', e);
                    Lampa.Noty.show('CAPSULE Trailer: ошибка запуска видео');
                }
            });
        }

        this.create = function () {
            html.append(header());
            html.append(status);
            content.append(resultRoot);
            scroll.append(content);
            html.append(scroll.render());
            status.text('Ищем трейлеры…');
            this.activity.loader(true);
            runNextProvider();
            return this.render();
        };

        this.start = function () {
            if (!Lampa.Activity.own(this)) return;
            started = true;
            Lampa.Controller.add(COMPONENT, {
                toggle: function () {
                    Lampa.Controller.collectionSet(scroll.render());
                    Lampa.Controller.collectionFocus(last || false, scroll.render());
                },
                up: function () {
                    if (Navigator.canmove('up')) Navigator.move('up');
                },
                down: function () {
                    if (Navigator.canmove('down')) Navigator.move('down');
                },
                left: function () {
                    if (Navigator.canmove('left')) Navigator.move('left');
                },
                right: function () {
                    if (Navigator.canmove('right')) Navigator.move('right');
                },
                back: function () {
                    Lampa.Activity.backward();
                }
            });
            Lampa.Controller.toggle(COMPONENT);
        };

        this.stop = function () {
            started = false;
        };

        this.render = function () {
            return html;
        };

        this.destroy = function () {
            alive = false;
            started = false;
            if (resolvingCancel) {
                try { resolvingCancel(); } catch (e) {}
                resolvingCancel = null;
            }
            for (var i = 0; i < cancels.length; i++) {
                try { cancels[i](); } catch (e2) {}
            }
            cancels = [];
            try { scroll.destroy(); } catch (e3) {}
            html.remove();
        };
    }

    function addCardButton(event) {
        if (!event || event.type !== 'complite' || !event.data || !event.data.movie || !event.object || !event.object.activity) return;
        var movie = event.data.movie;
        if (movie.adult) return;

        var render = event.object.activity.render();
        if (!render || !render.find) return;
        if (render.find('.view--capsule-trailer').length) return;

        var container = render.find('.buttons--container');
        if (!container.length) return;

        var button = $('' +
            '<div class="full-start__button selector view--capsule-trailer" data-subtitle="CAPSULE Trailer · RUTUBE">' +
                ICON +
                '<span>Трейлеры</span>' +
            '</div>'
        );

        button.on('hover:enter', function () {
            Lampa.Activity.push({
                url: '',
                title: 'Трейлеры',
                component: COMPONENT,
                page: 1,
                movie: movie,
                videos: event.data.videos || { results: [] },
                capsule_version: VERSION
            });
        });

        var nativeTrailer = container.find('.view--trailer').last();
        if (nativeTrailer.length) nativeTrailer.after(button);
        else container.append(button);
    }

    function init() {
        addStyles();
        registerRutubeTube();
        registerPlaybackFallback();
        if (!Lampa.Component.get(COMPONENT)) Lampa.Component.add(COMPONENT, TrailerComponent);
        Lampa.Listener.follow('full', addCardButton);
        log('ready', VERSION);
    }

    if (window.appready) init();
    else Lampa.Listener.follow('app', function (event) {
        if (event && event.type === 'ready') init();
    });
})();