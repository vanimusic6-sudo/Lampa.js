/*
 * CAPSULE Trailer for Lampa
 * Multi-provider trailer aggregator with isolated discovery and playback adapters.
 *
 * Integration points verified against current Lampa source:
 * - Lampa.Listener 'full' / type 'complite'
 * - .buttons--container / source grouping in full/start/buttons.js
 * - Lampa.Activity / Lampa.Component
 * - Lampa.Scroll / Lampa.Controller / global Navigator
 * - Lampa.Reguest
 * - Lampa.Player / Lampa.PlayerVideo.registerTube
 *
 * Discovery / playback layers:
 * - Direct trailer URLs already present in Lampa movie metadata.
 * - Kinopoisk API Unofficial metadata + Kinopoisk trailer widget stream resolver.
 * - OK.ru is the primary trailer source; Yandex Video/VH is an optional experimental provider.
 *
 */
(function () {
    'use strict';

    if (window.capsule_trailer_ready) return;
    window.capsule_trailer_ready = true;

    var VERSION = '2.7.0';
    var COMPONENT = 'capsule_trailer';
    var CACHE_KEY = 'capsule_trailer_cache_v9';
    var CACHE_TTL = 1000 * 60 * 60 * 6;
    var CACHE_MAX = 40;
    var SEARCH_TIMEOUT = 8000;
    var RESOLVE_TIMEOUT = 7000;
    var AUTO_SCORE_MIN = 260;
    var AUTO_SETTLE_MS = 420;
    var AUTO_SEARCH_MAX_MS = 1800;
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

    function noisyTrailerTitle(title, movie) {
        var text = cleanText(title);
        if (!text) return true;

        if (/(обзор|реакци|разбор|рецензи|мнение|объяснен|пасхалк|теори|интервью|саундтрек|soundtrack|review|reaction|breakdown|interview|behind the scenes|making of|featurette|fan made|fanmade|concept trailer|concept teaser|gameplay|walkthrough)/.test(text)) return true;
        if (/(полный фильм|фильм полностью|full movie|watch online|смотреть онлайн)/.test(text)) return true;
        if (/(отрывок|фрагмент|сцена|клип|clip|scene|tv spot)/.test(text)) return true;

        if (mediaType(movie) !== 'tv' && /(сезон|season|серия|эпизод|episode)/.test(text)) return true;
        if (mediaType(movie) === 'tv' && /(серия|эпизод|episode\s*\d+)/.test(text)) return true;

        return false;
    }

    function meaningfulTitleWords(value) {
        var stop = {
            'the':1,'a':1,'an':1,'of':1,'and':1,'or':1,'to':1,'in':1,'on':1,'for':1,
            'и':1,'в':1,'во':1,'на':1,'с':1,'со':1,'к':1,'ко':1,'из':1,'по':1,'для':1
        };
        var input = words(value);
        var out = [];
        for (var i = 0; i < input.length; i++) {
            if (input[i].length > 1 && !stop[input[i]]) out.push(input[i]);
        }
        return out;
    }

    function semanticTrailerKey(item) {
        var generic = {
            'трейлер':1,'trailer':1,'тизер':1,'teaser':1,'официальный':1,'official':1,
            'русский':1,'russian':1,'дублированный':1,'дублирован':1,'dubbed':1,
            'hd':1,'uhd':1,'fullhd':1,'4k':1,'2160p':1,'1440p':1,'1080p':1,'720p':1,'480p':1
        };
        var input = words(item && item.title || '');
        var out = [];
        for (var i = 0; i < input.length; i++) {
            var token = input[i];
            if (generic[token]) continue;
            if (/^(?:19|20)\d{2}$/.test(token)) continue;
            out.push(token);
        }
        return out.join(' ') || cleanText(item && item.title || '');
    }

    function dedupeCandidates(items) {
        var map = {};
        var out = [];
        for (var i = 0; i < (items || []).length; i++) {
            var item = items[i];
            var key = semanticTrailerKey(item);
            if (!key) key = item.canonical || item.id || String(i);
            if (!map[key]) {
                map[key] = item;
                out.push(item);
            }
            else if ((item.score || 0) > (map[key].score || 0)) {
                var old = map[key];
                var at = out.indexOf(old);
                if (at >= 0) out[at] = item;
                map[key] = item;
            }
        }
        out.sort(function (a, b) { return (b.score || 0) - (a.score || 0); });
        return out;
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

    function qualityNumber(value) {
        var match = String(value || '').match(/(2160|1440|1080|720|480|360|240|144)/);
        return match ? parseInt(match[1], 10) : 0;
    }

    function preferredQuality() {
        var value = String(Lampa.Storage.field('capsule_trailer_quality') || 'best');
        if (value === 'best') return 0;
        return qualityNumber(value);
    }

    function settingEnabled(name, defaultValue) {
        var value = Lampa.Storage.field(name);
        if (value === undefined || value === null || value === '') return defaultValue !== false;
        if (value === false || value === 0) return false;
        value = String(value).toLowerCase();
        return value !== 'false' && value !== '0' && value !== 'off' && value !== 'no';
    }

    function qualityPriorityScore(height) {
        height = parseInt(height, 10) || 0;
        if (!height) return 0;

        var preferred = preferredQuality();
        if (!preferred) {
            if (height >= 2160) return 28;
            if (height >= 1080) return 22;
            if (height >= 720) return 14;
            if (height >= 480) return 5;
            return 0;
        }

        if (height === preferred) return 42;
        if (height > preferred) {
            var above = height / preferred;
            return Math.max(18, 32 - Math.round((above - 1) * 8));
        }

        var ratio = height / preferred;
        return Math.max(-24, Math.round(24 * ratio) - 24);
    }

    function yandexTypeHeight(url) {
        var match = String(url || '').match(/[?&]type=(\d)(?:&|$)/);
        if (!match) return 0;
        var map = { '4': 144, '0': 240, '1': 360, '2': 480, '3': 720, '5': 1080, '6': 1440, '7': 2160 };
        return map[match[1]] || 0;
    }

    function pickPreferredStream(streams) {
        if (!streams || !streams.length) return null;

        var prepared = [];
        for (var i = 0; i < streams.length; i++) {
            var stream = streams[i] || {};
            var url = String(stream.url || '');
            if (!/^https?:\/\//i.test(url)) continue;
            prepared.push({
                url: url,
                height: parseInt(stream.height, 10) || qualityNumber(stream.quality || stream.label || stream.name) || yandexTypeHeight(url)
            });
        }
        if (!prepared.length) return null;

        prepared.sort(function (a, b) {
            var preferred = preferredQuality();
            if (!preferred) return (b.height || 0) - (a.height || 0);

            var ad = a.height ? Math.abs(a.height - preferred) : 99999;
            var bd = b.height ? Math.abs(b.height - preferred) : 99999;
            if (ad !== bd) return ad - bd;

            var aBelow = a.height && a.height <= preferred;
            var bBelow = b.height && b.height <= preferred;
            if (aBelow !== bBelow) return aBelow ? -1 : 1;
            return (b.height || 0) - (a.height || 0);
        });

        return prepared[0];
    }

    function trailerKind(value) {
        var text = cleanText(value);
        if (/(^| )(тизер|teaser)( |$)/.test(text)) return 'teaser';
        if (/(^| )(трейлер|trailer)( |$)/.test(text)) return 'trailer';
        return '';
    }

    function movieKey(movie) {
        return mediaType(movie) + ':' + (movie && movie.id || cleanText(movie && (movie.title || movie.name) || '')) + ':' + yearOf(movie);
    }

    function scoreCandidate(item, movie, exactMovieMatch) {
        if (!item || !item.title) return -9999;
        var duration = parseInt(item.duration, 10) || 0;
        var kind = item.kind || trailerKind(item.title);
        if (!kind && !exactMovieMatch) return -9999;
        if (!exactMovieMatch && noisyTrailerTitle(item.title, movie)) return -9999;

        if (duration) {
            if (kind === 'teaser' && (duration < 8 || duration > (exactMovieMatch ? 360 : 240))) return -9999;
            if (kind !== 'teaser' && (duration < 15 || duration > (exactMovieMatch ? 600 : 420))) return -9999;
        }

        var score = exactMovieMatch ? 260 : 0;
        var variants = titleVariants(movie);
        var resultTitle = cleanText(item.title);
        var best = exactMovieMatch ? 100 : 0;

        for (var i = 0; i < variants.length; i++) {
            var c = coverage(resultTitle, variants[i]);
            var value = Math.round(c * 100);
            if (resultTitle.indexOf(variants[i]) >= 0) value += 95;
            if (c === 1) value += 35;
            if (value > best) best = value;
        }

        if (!exactMovieMatch) {
            var meaningful = meaningfulTitleWords(movie && (movie.title || movie.name || movie.original_title || movie.original_name) || '');
            if (best < 80) return -9999;
            if (meaningful.length <= 2 && best < 150) return -9999;
        }
        score += best;

        var year = yearOf(movie);
        var years = explicitYears(item.title + ' ' + (item.description || ''));
        if (year) {
            if (String(item.year || '') === year || years.indexOf(year) >= 0) score += 45;
            else if (years.length) {
                var near = false;
                for (var y = 0; y < years.length; y++) {
                    if (Math.abs(parseInt(years[y], 10) - parseInt(year, 10)) <= 1) near = true;
                }
                if (!near && !exactMovieMatch) return -9999;
                if (!near) score -= 60;
            }
        }

        var text = cleanText(item.title + ' ' + (item.description || ''));
        var lang = inferLanguage(item).toLowerCase();
        if (item.official || /(^| )(официальн|official)( |$)/.test(text)) score += 42;
        if (kind === 'trailer') score += 28;
        if (kind === 'teaser') score += 10;
        if (lang === 'ru' || lang === 'rus') score += 34;
        if (duration >= 45 && duration <= 240) score += 16;

        var quality = qualityNumber(item.qualityHint);
        score += qualityPriorityScore(quality);

        if (mediaType(movie) === 'tv') {
            if (/(сериал|series|season|сезон)/.test(text)) score += 10;
        }
        else if (/(сериал|season|сезон)/.test(text) && !exactMovieMatch) {
            score -= 45;
        }

        score += parseInt(item.transportScore, 10) || 0;
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
            keys.sort(function (a, b) { return (cache[a].time || 0) - (cache[b].time || 0); });
            while (keys.length > CACHE_MAX) delete cache[keys.shift()];
        }
        Lampa.Storage.set(CACHE_KEY, cache, true);
    }

    function cacheDropMovie(movie) {
        var cache = Lampa.Storage.get(CACHE_KEY, {});
        if (!cache || typeof cache !== 'object') return;
        var suffix = ':' + movieKey(movie);
        var changed = false;
        Object.keys(cache).forEach(function (key) {
            if (key.slice(-suffix.length) === suffix) {
                delete cache[key];
                changed = true;
            }
        });
        if (changed) Lampa.Storage.set(CACHE_KEY, cache, true);
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

        window[callbackName] = function (data) { finish(null, data); };
        script.async = true;
        script.onerror = function () { finish(new Error('jsonp-network')); };
        script.src = url + (url.indexOf('?') >= 0 ? '&' : '?') + 'format=jsonp&callback=' + encodeURIComponent(callbackName);
        document.head.appendChild(script);
        timer = setTimeout(function () { finish(new Error('jsonp-timeout')); }, timeout || SEARCH_TIMEOUT);

        return function () { finish(new Error('cancelled')); };
    }

    function requestData(url, dataType, timeout, done, extraHeaders) {
        var network = new Lampa.Reguest();
        var finished = false;
        var headers = { 'Accept': dataType === 'text' ? 'text/html,*/*' : 'application/json' };
        network.timeout(timeout || SEARCH_TIMEOUT);

        if (extraHeaders) {
            for (var headerName in extraHeaders) {
                if (Object.prototype.hasOwnProperty.call(extraHeaders, headerName)) headers[headerName] = extraHeaders[headerName];
            }
        }

        function finish(error, data) {
            if (finished) return;
            finished = true;
            try { network.clear(); } catch (e) {}
            if (!error && dataType === 'json') data = parseMaybeJson(data);
            done(error, data);
        }

        try {
            network.native(url, function (data) {
                finish(null, data);
            }, function () {
                finish(new Error('network'));
            }, false, {
                timeout: timeout || SEARCH_TIMEOUT,
                dataType: dataType,
                headers: headers
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

    function nativeRequest(url, timeout, done, headers) {
        return requestData(url, 'json', timeout, done, headers);
    }

    function textRequest(url, timeout, done, headers) {
        return requestData(url, 'text', timeout, done, headers);
    }

    function postRequest(url, dataType, timeout, postData, done) {
        var network = new Lampa.Reguest();
        var finished = false;
        network.timeout(timeout || SEARCH_TIMEOUT);

        function finish(error, data) {
            if (finished) return;
            finished = true;
            try { network.clear(); } catch (e) {}
            if (!error && dataType === 'json') data = parseMaybeJson(data);
            done(error, data);
        }

        try {
            network.native(url, function (data) {
                finish(null, data);
            }, function () {
                finish(new Error('network'));
            }, postData || '', {
                timeout: timeout || SEARCH_TIMEOUT,
                dataType: dataType,
                headers: {
                    'Accept': dataType === 'text' ? 'text/html,*/*' : 'application/json',
                    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'
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

    function directMediaUrl(url) {
        return /^https?:\/\//i.test(String(url || '')) && /\.(?:m3u8|mpd|mp4|m4v)(?:[?#]|$)/i.test(String(url || ''));
    }

    function capsuleMediaUrl(url, type) {
        url = String(url || '');
        if (!url) return '';
        var hash = type === 'hls' ? 'capsule-hls' : 'capsule-direct';
        var clean = url.replace(/#.*$/, '');
        return clean + '#' + hash;
    }

    function playbackHeaders(source) {
        var headers = { 'User-Agent': 'Mozilla/5.0' };
        if (source === 'ok') headers.Referer = 'https://ok.ru/';
        else if (source === 'yandex') headers.Referer = 'https://yandex.ru/';
        else if (source === 'kinopoisk') headers.Referer = 'https://www.kinopoisk.ru/';
        return headers;
    }

    function attachAlternateStreams(data, alternatives) {
        var queue = [];
        var seen = {};
        var current = String(data && data.url || '').replace(/#.*$/, '');
        alternatives = alternatives || [];

        for (var i = 0; i < alternatives.length; i++) {
            var item = alternatives[i] || {};
            var url = String(item.url || '');
            var clean = url.replace(/#.*$/, '');
            if (!url || clean === current || seen[clean]) continue;
            seen[clean] = true;
            queue.push(item);
        }

        if (!queue.length) return data;

        data.error = function (work, use) {
            if (!queue.length) {
                work.capsule_retry_inflight_until = 0;
                return;
            }
            var next = queue.shift();
            work.url = next.url;
            work.capsule_retry_inflight_until = Date.now() + 1800;
            work.capsule_retry_count = (parseInt(work.capsule_retry_count, 10) || 0) + 1;

            if (next.hls_type) work.hls_type = next.hls_type;
            else if (work.hls_type) delete work.hls_type;

            if (next.headers) work.headers = next.headers;
            use(next.url);
        };

        return data;
    }

    function normalizeNativeVideos(videos, movie) {
        var out = [];
        if (!settingEnabled('capsule_trailer_direct', true)) return out;

        var list = videos && videos.results ? videos.results : [];
        for (var i = 0; i < list.length; i++) {
            var raw = list[i] || {};
            var rawSite = String(raw.site || '').toUpperCase();
            var rawUrl = String(raw.url || '');
            if (rawSite === 'YOUTUBE' || /(?:youtube\.com|youtu\.be|googlevideo\.com)/i.test(rawUrl)) continue;
            if (!directMediaUrl(rawUrl)) continue;

            var item = {
                id: 'direct:' + raw.url,
                canonical: 'direct:' + raw.url,
                provider: 'direct',
                providerName: 'Lampa',
                title: raw.name || 'Трейлер',
                description: '',
                duration: 0,
                thumbnail: raw.icon || '',
                author: '',
                language: raw.iso_639_1 || '',
                qualityHint: raw.size ? String(raw.size) + 'p' : '',
                year: yearOf(movie),
                kind: String(raw.type || '').toLowerCase() === 'teaser' ? 'teaser' : 'trailer',
                official: raw.official === true,
                url: raw.url,
                transportScore: 145,
                exactMovieMatch: true
            };
            item.score = scoreCandidate(item, movie, true);
            out.push(item);
        }

        out.sort(function (a, b) { return b.score - a.score; });
        return out;
    }

    var NativeDirectProvider = {
        id: 'direct',
        name: 'Lampa direct',
        tier: 'stable',
        autoplay: true,
        search: function (context, done) {
            done(null, normalizeNativeVideos(context.videos, context.movie));
            return function () {};
        },
        resolve: function (item, context, done) {
            var data = {
                url: item.url,
                title: item.title,
                card: context.movie,
                capsule_trailer: true,
                capsule_source: 'direct'
            };
            if (/\.m3u8(?:[?#]|$)/i.test(item.url)) data.hls_type = 'native';
            done(null, data);
            return function () {};
        }
    };

    function kinopoiskApiKey() {
        var value = Lampa.Storage.field('capsule_trailer_kinopoisk_key');
        if (value === undefined || value === null || String(value) === 'undefined') return '';
        return String(value).replace(/^\s+|\s+$/g, '');
    }

    function kinopoiskRequest(path, timeout, done) {
        var key = kinopoiskApiKey();
        if (!key) {
            done(new Error('kinopoisk-key'));
            return function () {};
        }

        return nativeRequest('https://kinopoiskapiunofficial.tech' + path, timeout, done, {
            'Accept': 'application/json',
            'X-API-KEY': key
        });
    }

    function kinopoiskTypeMatches(type, movie) {
        type = String(type || '').toUpperCase();
        if (!type) return true;
        if (mediaType(movie) === 'tv') return type === 'TV_SERIES' || type === 'MINI_SERIES' || type === 'TV_SHOW';
        return type === 'FILM' || type === 'VIDEO';
    }

    function kinopoiskMovieScore(raw, movie) {
        raw = raw || {};
        var candidates = [raw.nameRu, raw.nameEn, raw.nameOriginal];
        var variants = titleVariants(movie);
        var best = 0;

        for (var i = 0; i < candidates.length; i++) {
            if (!candidates[i]) continue;
            var candidate = cleanText(candidates[i]);
            for (var j = 0; j < variants.length; j++) {
                var c = coverage(candidate, variants[j]);
                var value = Math.round(c * 100);
                if (candidate === variants[j]) value += 120;
                else if (candidate.indexOf(variants[j]) >= 0 || variants[j].indexOf(candidate) >= 0) value += 45;
                if (value > best) best = value;
            }
        }

        var wantedYear = yearOf(movie);
        var gotYear = String(raw.year || '');
        if (wantedYear && gotYear) {
            if (wantedYear === gotYear) best += 55;
            else if (Math.abs(parseInt(wantedYear, 10) - parseInt(gotYear, 10)) <= 1) best += 8;
            else best -= 90;
        }

        if (kinopoiskTypeMatches(raw.type, movie)) best += 25;
        else best -= 55;

        return best;
    }

    function findKinopoiskId(movie, done) {
        if (movie && movie.kinopoisk_id && /^\d+$/.test(String(movie.kinopoisk_id))) {
            done(null, String(movie.kinopoisk_id));
            return function () {};
        }

        var title = movie && (movie.title || movie.name || movie.original_title || movie.original_name) || '';
        if (!title) {
            done(new Error('kinopoisk-title'));
            return function () {};
        }

        return kinopoiskRequest('/api/v2.1/films/search-by-keyword?keyword=' + encodeURIComponent(title) + '&page=1', SEARCH_TIMEOUT, function (error, data) {
            if (error || !data || !data.films || Object.prototype.toString.call(data.films) !== '[object Array]') {
                done(error || new Error('kinopoisk-search'));
                return;
            }

            var best = null;
            var bestScore = -9999;
            for (var i = 0; i < data.films.length; i++) {
                var raw = data.films[i] || {};
                var score = kinopoiskMovieScore(raw, movie);
                if (score > bestScore) {
                    bestScore = score;
                    best = raw;
                }
            }

            if (!best || !best.filmId || bestScore < 70) {
                done(new Error('kinopoisk-no-match'));
                return;
            }

            done(null, String(best.filmId));
        });
    }

    function normalizeKinopoiskVideos(data, movie, kpId) {
        var out = [];
        var items = data && data.items;
        if (!items || Object.prototype.toString.call(items) !== '[object Array]') return out;

        for (var i = 0; i < items.length; i++) {
            var raw = items[i] || {};
            var site = String(raw.site || '').toUpperCase();

            if (site !== 'KINOPOISK_WIDGET') continue;

            var url = decodeHtmlEntities(raw.url || '');
            if (!/^https?:\/\/widgets\.kinopoisk\.ru\//i.test(url)) continue;

            var trailerIdMatch = url.match(/\/trailer\/(\d+)/i);
            var title = raw.name || 'Трейлер';
            var item = {
                id: 'kinopoisk:' + (trailerIdMatch ? trailerIdMatch[1] : i),
                canonical: 'kinopoisk:' + url,
                provider: 'kinopoisk',
                providerName: 'Кинопоиск',
                title: title,
                description: '',
                duration: 0,
                thumbnail: imageUrl(movie),
                author: '',
                language: inferLanguage({ title: title }),
                qualityHint: '',
                year: yearOf(movie),
                kind: trailerKind(title) || 'trailer',
                official: /официальн|official/i.test(String(title || '')),
                kinopoiskId: String(kpId || ''),
                kinopoiskWidget: url,
                transportScore: 55,
                exactMovieMatch: true
            };
            item.score = scoreCandidate(item, movie, true);
            out.push(item);
        }

        out = dedupeCandidates(out);
        return out.slice(0, 8);
    }

    function normalizeKinopoiskWidgetUrl(value) {
        var widget = decodeHtmlEntities(value || '');
        if (!/^https?:\/\/widgets\.kinopoisk\.ru\//i.test(widget)) return '';

        if (widget.indexOf('onlyPlayer=') < 0) widget += (widget.indexOf('?') >= 0 ? '&' : '?') + 'onlyPlayer=1';
        if (widget.indexOf('autoplay=') < 0) widget += '&autoplay=1';
        if (widget.indexOf('cover=') < 0) widget += '&cover=1';
        if (widget.indexOf('tv=') < 0) widget += '&tv=1';

        return widget;
    }

    function resolveKinopoisk(item, context, done) {
        var widget = normalizeKinopoiskWidgetUrl(item.kinopoiskWidget || item.url || '');
        if (!widget) {
            done(new Error('kinopoisk-widget'));
            return function () {};
        }

        done(null, {
            url: widget,
            title: item.title,
            card: context.movie,
            capsule_trailer: true,
            capsule_source: 'kinopoisk-widget'
        });

        return function () {};
    }

    var KinopoiskProvider = {
        id: 'kinopoisk',
        name: 'Кинопоиск',
        tier: 'experimental',
        autoplay: false,
        search: function (context, done) {
            if (!settingEnabled('capsule_trailer_kinopoisk', true) || !kinopoiskApiKey()) {
                done(null, []);
                return function () {};
            }

            var movie = context.movie || {};
            var key = 'kinopoisk:' + movieKey(movie);
            var cached = cacheGet(key);
            if (cached) {
                done(null, cached);
                return function () {};
            }

            var cancelled = false;
            var cancelCurrent = findKinopoiskId(movie, function (idError, kpId) {
                if (cancelled) return;
                if (idError || !kpId) return done(idError || new Error('kinopoisk-id'), []);

                cancelCurrent = kinopoiskRequest('/api/v2.2/films/' + encodeURIComponent(kpId) + '/videos', SEARCH_TIMEOUT, function (videoError, data) {
                    if (cancelled) return;
                    if (videoError || !data) return done(videoError || new Error('kinopoisk-videos'), []);

                    var items = normalizeKinopoiskVideos(data, movie, kpId);
                    cachePut(key, items);
                    done(null, items);
                });
            });

            return function () {
                cancelled = true;
                if (cancelCurrent) cancelCurrent();
            };
        },
        resolve: resolveKinopoisk
    };

    function decodeHtmlEntities(value) {
        value = String(value || '');
        if (value.indexOf('&') < 0) return value;
        return value.replace(/&(#x?[0-9a-f]+|quot|amp|apos|#39|lt|gt|nbsp);/gi, function (all, entity) {
            var name = String(entity || '').toLowerCase();
            if (name === 'quot') return '"';
            if (name === 'amp') return '&';
            if (name === 'apos' || name === '#39') return "'";
            if (name === 'lt') return '<';
            if (name === 'gt') return '>';
            if (name === 'nbsp') return ' ';
            if (name.charAt(0) === '#') {
                var hex = name.charAt(1) === 'x';
                var num = parseInt(name.slice(hex ? 2 : 1), hex ? 16 : 10);
                if (!isNaN(num)) return String.fromCharCode(num);
            }
            return all;
        });
    }

    function htmlAttribute(tag, name) {
        var marker = name + '=';
        var at = tag.indexOf(marker);
        if (at < 0) return '';
        var start = at + marker.length;
        var quote = tag.charAt(start);
        if (quote !== '"' && quote !== "'") return '';
        var end = tag.indexOf(quote, start + 1);
        return end < 0 ? '' : tag.slice(start + 1, end);
    }

    function okNativeProvider(value) {
        value = String(value || '').replace(/_/g, '').toUpperCase();
        return !value || value === 'UPLOADEDODKL' || value === 'LIVETVAPP';
    }

    function parseOkSearch(text, movie) {
        text = String(text || '');
        var component = text.indexOf('<video-search-result');
        var tagEnd = component < 0 ? -1 : text.indexOf('>', component);
        if (component < 0 || tagEnd < 0) return [];
        var encoded = htmlAttribute(text.slice(component, tagEnd + 1), 'data-props');
        if (!encoded) return [];
        var props;
        try { props = JSON.parse(decodeHtmlEntities(encoded)); } catch (e) { return []; }
        var list = props && props.videos && props.videos.list;
        if (!list || Object.prototype.toString.call(list) !== '[object Array]') return [];

        var out = [];
        var seen = {};
        for (var i = 0; i < list.length && out.length < 10; i++) {
            var card = list[i] || {};
            var raw = card.movie || {};
            if (raw.blocked || !okNativeProvider(raw.provider)) continue;
            var id = String(raw.id || '');
            if (!/^-?\d+$/.test(id) || seen[id]) continue;
            var title = decodeHtmlEntities(card.name || raw.title || '');
            if (!title) continue;
            var durationMs = parseInt(raw.duration, 10) || 0;
            var width = parseInt(raw.width, 10) || 0;
            var height = parseInt(raw.height, 10) || 0;
            var thumbnail = decodeHtmlEntities(card.imageUrl || (raw.thumbnail && (raw.thumbnail.big || raw.thumbnail.small)) || '');
            var item = {
                id: 'ok:' + id,
                canonical: 'ok:' + id,
                provider: 'ok',
                providerName: 'OK.ru',
                title: title,
                description: decodeHtmlEntities(card.description || ''),
                duration: durationMs > 1000 ? Math.round(durationMs / 1000) : durationMs,
                thumbnail: thumbnail,
                author: '',
                language: /русск|дублирован|дубляж/i.test(title) ? 'ru' : '',
                qualityHint: height ? height + 'p' : (width >= 1900 ? '1080p' : width >= 1200 ? '720p' : ''),
                year: '',
                kind: trailerKind(title),
                official: /официальн|official/i.test(title),
                okId: id,
                url: 'https://ok.ru/video/' + id,
                transportScore: 95,
                exactMovieMatch: false
            };
            item.score = scoreCandidate(item, movie, false);
            if (item.score >= 0) {
                seen[id] = true;
                out.push(item);
            }
        }
        out = dedupeCandidates(out);
        return out.slice(0, 6);
    }

    function okQualityHeight(name, url) {
        var map = { mobile: 144, lowest: 240, low: 360, sd: 480, hd: 720, full: 1080, quad: 1440, ultra: 2160 };
        var key = String(name || '').toLowerCase();
        if (map[key]) return map[key];
        var type = String(url || '').match(/[?&]type=(\d)(?:&|$)/);
        if (type) {
            var typeMap = { '4': 144, '0': 240, '1': 360, '2': 480, '3': 720, '5': 1080, '6': 1440, '7': 2160 };
            if (typeMap[type[1]]) return typeMap[type[1]];
        }
        return qualityNumber(name);
    }

    function parseOkPlayerOptions(text, id) {
        text = String(text || '');
        var cursor = 0;
        while (cursor < text.length) {
            var at = text.indexOf('data-options=', cursor);
            if (at < 0) break;
            var start = at + 'data-options='.length;
            var quote = text.charAt(start);
            if (quote !== '"' && quote !== "'") {
                cursor = start + 1;
                continue;
            }
            var end = text.indexOf(quote, start + 1);
            if (end < 0) break;
            var decoded = decodeHtmlEntities(text.slice(start + 1, end));
            if (decoded.indexOf(String(id)) >= 0) {
                try { return JSON.parse(decoded); } catch (e) { return null; }
            }
            cursor = end + 1;
        }
        return null;
    }

    function okMetadataFromPlayer(player, done) {
        if (!player || player.isExternalPlayer) return done(new Error('ok-external'));
        var flashvars = player.flashvars || {};
        var metadata = flashvars.metadata;
        if (metadata && typeof metadata === 'object') return done(null, metadata);
        if (metadata && typeof metadata === 'string') {
            try { return done(null, JSON.parse(metadata)); } catch (e) {}
        }
        var metadataUrl = String(flashvars.metadataUrl || '');
        if (!metadataUrl) return done(new Error('ok-no-metadata'));
        try { metadataUrl = decodeURIComponent(metadataUrl); } catch (e2) {}
        if (metadataUrl.indexOf('//') === 0) metadataUrl = 'https:' + metadataUrl;
        else if (metadataUrl.charAt(0) === '/') metadataUrl = 'https://ok.ru' + metadataUrl;
        if (!/^https?:\/\//i.test(metadataUrl)) return done(new Error('ok-metadata-url'));
        var body = flashvars.location ? 'st.location=' + encodeURIComponent(flashvars.location) : 'st.location=';
        return postRequest(metadataUrl, 'json', RESOLVE_TIMEOUT, body, done);
    }

    function resolveOk(item, context, done) {
        var id = item.okId;
        if (!id) {
            done(new Error('ok-id'));
            return function () {};
        }

        var cancelled = false;
        var cancelCurrent = textRequest('https://ok.ru/videoembed/' + encodeURIComponent(id), RESOLVE_TIMEOUT, function (error, text) {
            if (cancelled) return;
            if (error || !text) return done(error || new Error('ok-player'));

            var player = parseOkPlayerOptions(text, id);
            if (!player) return done(new Error('ok-options'));

            cancelCurrent = okMetadataFromPlayer(player, function (metaError, metadata) {
                if (cancelled) return;
                if (metaError || !metadata) return done(metaError || new Error('ok-metadata'));

                var videos = metadata.videos || [];
                var direct = [];

                for (var i = 0; i < videos.length; i++) {
                    var stream = videos[i] || {};
                    var streamUrl = String(stream.url || '');
                    if (!/^https?:\/\//i.test(streamUrl)) continue;

                    var height = okQualityHeight(stream.name, streamUrl);
                    direct.push({
                        url: streamUrl,
                        height: height,
                        name: stream.name || ''
                    });

                }

                var selected = pickPreferredStream(direct);
                var selectedType = 'direct';
                var hls = metadata.hlsManifestUrl || metadata.ondemandHls || '';

                if ((!selected || !selected.url) && hls && /^https?:\/\//i.test(hls)) {
                    selected = { url: hls, height: 0 };
                    selectedType = 'hls';
                }

                if (!selected || !selected.url) return done(new Error('ok-no-stream'));

                var selectedUrl = selectedType === 'direct' ? capsuleMediaUrl(selected.url, 'direct') :
                    capsuleMediaUrl(selected.url, 'hls');
                var result = {
                    url: selectedUrl,
                    title: item.title,
                    card: context.movie,
                    capsule_trailer: true,
                    capsule_source: selectedType === 'direct' ? 'ok-direct' : 'ok-hls',
                    headers: playbackHeaders('ok'),
                    hls_manifest_timeout: 15000
                };

                if (selectedType === 'hls') result.hls_type = 'native';

                var alternates = [];
                for (var vi = 0; vi < direct.length; vi++) {
                    if (!direct[vi] || !direct[vi].url || direct[vi].url === selected.url) continue;
                    alternates.push({
                        url: capsuleMediaUrl(direct[vi].url, 'direct'),
                        hls_type: '',
                        headers: playbackHeaders('ok')
                    });
                }
                if (hls && /^https?:\/\//i.test(hls) && hls !== selected.url) {
                    alternates.push({
                        url: capsuleMediaUrl(hls, 'hls'),
                        hls_type: 'native',
                        headers: playbackHeaders('ok')
                    });
                }
                attachAlternateStreams(result, alternates);

                done(null, result);
            });
        });

        return function () {
            cancelled = true;
            if (cancelCurrent) cancelCurrent();
        };
    }

    var OkProvider = {
        id: 'ok',
        name: 'OK',
        tier: 'experimental',
        autoplay: true,
        search: function (context, done) {
            var movie = context.movie || {};
            var title = movie.title || movie.name || movie.original_title || movie.original_name || '';
            var original = movie.original_title || movie.original_name || '';
            var year = yearOf(movie);
            var key = 'ok:' + movieKey(movie);
            var cached = cacheGet(key);
            if (cached) {
                done(null, cached);
                return function () {};
            }
            var queries = [];
            var all = [];
            var seen = {};
            var index = 0;
            var cancelled = false;
            var cancelCurrent = null;

            function addQuery(value) {
                value = String(value || '').replace(/^\s+|\s+$/g, '');
                if (value && queries.indexOf(value) < 0) queries.push(value);
            }

            addQuery([title, year, 'трейлер'].join(' '));
            if (original && cleanText(original) !== cleanText(title)) addQuery([original, year, 'trailer'].join(' '));

            function finish() {
                if (cancelled) return;
                all.sort(function (a, b) { return b.score - a.score; });
                all = all.slice(0, 6);
                cachePut(key, all);
                done(null, all);
            }

            function next() {
                if (cancelled) return;
                if (index >= queries.length) return finish();
                var query = queries[index++];
                var url = 'https://ok.ru/video/search?st.cmd=anonymVideo&st.ft=search&st.gsq=' + encodeURIComponent(query) + '&st.m=SEARCH';
                cancelCurrent = textRequest(url, 7000, function (error, text) {
                    if (!error && text) {
                        var items = parseOkSearch(text, movie);
                        for (var i = 0; i < items.length; i++) {
                            if (!seen[items[i].canonical]) {
                                seen[items[i].canonical] = true;
                                all.push(items[i]);
                            }
                        }
                    }

                    if (index === 1 && all.length >= 2) return finish();
                    next();
                });
            }

            next();
            return function () {
                cancelled = true;
                if (cancelCurrent) cancelCurrent();
            };
        },
        resolve: resolveOk
    };

    var PROVIDERS = [NativeDirectProvider, KinopoiskProvider, OkProvider];

    function closeSourceSelectionState() {
        try {
            if (Lampa.Select && Lampa.Select.opened && Lampa.Select.opened()) Lampa.Select.close();
        }
        catch (e) {}

        try {
            if (Lampa.Activity && typeof Lampa.Activity.mixState === 'function') Lampa.Activity.mixState();
        }
        catch (e2) {}

        try { Lampa.Controller.toggle('content'); } catch (e3) {}
    }

    function collectAutoplayCandidates(context, done) {
        var active = true;
        var finished = false;
        var cancels = [];
        var providers = [];
        var pending = 0;
        var candidates = {};
        var timer = null;

        for (var p = 0; p < PROVIDERS.length; p++) {
            if (PROVIDERS[p].autoplay !== false) providers.push(PROVIDERS[p]);
        }

        pending = providers.length;

        function finish() {
            if (!active || finished) return;
            finished = true;
            clearTimeout(timer);

            for (var i = 0; i < cancels.length; i++) {
                try { cancels[i](); } catch (e) {}
            }
            cancels = [];

            var result = [];
            for (var key in candidates) {
                if (Object.prototype.hasOwnProperty.call(candidates, key)) result.push(candidates[key]);
            }

            result.sort(function (a, b) {
                return (b.item.score || 0) - (a.item.score || 0);
            });

            done(result);
        }

        function add(provider, items) {
            items = items || [];
            for (var i = 0; i < items.length; i++) {
                var item = items[i];
                item.score = scoreCandidate(item, context.movie, item.exactMovieMatch === true);
                if (item.score < 0) continue;

                var key = semanticTrailerKey(item) || item.canonical || item.id || (provider.id + ':' + i);
                var current = candidates[key];
                if (!current || item.score > current.item.score) {
                    candidates[key] = { item: item, provider: provider };
                }
            }
        }

        function providerDone(provider, error, items) {
            if (!active || finished) return;
            if (!error) add(provider, items);
            pending--;
            if (pending <= 0) finish();
        }

        if (!pending) {
            done([]);
            return function () {};
        }

        timer = setTimeout(finish, AUTO_SEARCH_MAX_MS);

        for (var i = 0; i < providers.length; i++) {
            (function (provider) {
                var called = false;
                function complete(error, items) {
                    if (called) return;
                    called = true;
                    providerDone(provider, error, items);
                }

                try {
                    var cancel = provider.search(context, complete);
                    if (typeof cancel === 'function') cancels.push(cancel);
                }
                catch (e) {
                    complete(e, []);
                }
            })(providers[i]);
        }

        return function () {
            active = false;
            clearTimeout(timer);
            for (var i = 0; i < cancels.length; i++) {
                try { cancels[i](); } catch (e) {}
            }
            cancels = [];
        };
    }

    function startBestTrailer(context, done) {
        var cancelled = false;
        var searchCancel = collectAutoplayCandidates(context, function (results) {
            if (cancelled) return;

            if (!results.length || !results[0].item || results[0].item.score < AUTO_SCORE_MIN) {
                done(false);
                return;
            }

            var index = 0;
            var resolveCancel = null;

            function next() {
                if (cancelled) return;

                if (index >= results.length) {
                    done(false);
                    return;
                }

                var selected = results[index++];
                if (!selected || !selected.provider || typeof selected.provider.resolve !== 'function') {
                    next();
                    return;
                }

                if (selected.item.score < AUTO_SCORE_MIN) {
                    done(false);
                    return;
                }

                var settled = false;
                var currentCancel = selected.provider.resolve(selected.item, context, function (error, data) {
                    settled = true;
                    resolveCancel = null;
                    if (cancelled) return;

                    if (error || !data || !data.url) {
                        next();
                        return;
                    }

                    closeSourceSelectionState();

                    try {
                        Lampa.Player.play(data);
                        done(true);
                    }
                    catch (e) {
                        log('autoplay Player.play error', e);
                        next();
                    }
                });

                resolveCancel = settled ? null : (typeof currentCancel === 'function' ? currentCancel : null);
            }

            next();
        });

        return function () {
            cancelled = true;
            if (searchCancel) {
                try { searchCancel(); } catch (e) {}
            }
        };
    }

    function registerCapsuleMediaTube() {
        if (!Lampa.PlayerVideo || typeof Lampa.PlayerVideo.registerTube !== 'function') return;
        if (window.capsule_trailer_media_tube) return;

        var probe = document.createElement('video');
        var registration = {
            name: 'CAPSULE MEDIA',
            verify: function (src) {
                src = String(src || '');
                if (src.indexOf('#capsule-direct') >= 0) return true;
                if (src.indexOf('#capsule-hls') >= 0) {
                    try {
                        return !!probe.canPlayType('application/vnd.apple.mpegurl');
                    }
                    catch (e) {
                        return false;
                    }
                }
                return false;
            },
            create: function (callVideo) {
                var object = $('<video class="player-video__video" poster="./img/video_poster.png" playsinline></video>');
                var video = object[0];
                try { video.removeAttribute('crossorigin'); } catch (e) {}
                try { video.setAttribute('preload', 'metadata'); } catch (e2) {}
                callVideo(video);
                return object;
            }
        };

        if (Lampa.PlayerVideo.registerTube(registration)) {
            window.capsule_trailer_media_tube = registration;
        }
    }

    function registerKinopoiskTube() {
        if (!Lampa.PlayerVideo || typeof Lampa.PlayerVideo.registerTube !== 'function') return;
        if (window.capsule_trailer_kinopoisk_tube) return;

        var registration = {
            name: 'CAPSULE KINOPOISK',
            verify: function (src) {
                return /^https?:\/\/widgets\.kinopoisk\.ru\//i.test(String(src || ''));
            },
            create: function (callVideo) {
                var object = $('<div class="capsule-kinopoisk-player"></div>');
                var loader = $('' +
                    '<div class="capsule-kinopoisk-loader">' +
                        '<div class="capsule-kinopoisk-loader__spinner"></div>' +
                        '<div class="capsule-kinopoisk-loader__text">Загрузка трейлера…</div>' +
                    '</div>'
                );
                object.append(loader);

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
                var initTimer = null;
                var loaderFallbackTimer = null;
                var clockTimer = null;
                var clockStamp = 0;
                var clockBase = 0;
                var lastRemoteClock = 0;
                var metadataRequest = new Lampa.Reguest();

                function setLoader(status, text) {
                    if (text) loader.find('.capsule-kinopoisk-loader__text').text(text);
                    loader.toggleClass('hide', !status);
                }

                function hideLoader() {
                    clearTimeout(loaderFallbackTimer);
                    setLoader(false);
                }

                function stopClock() {
                    clearTimeout(clockTimer);
                    clockTimer = null;
                }

                function startClock() {
                    stopClock();
                    if (paused || ended || !duration) return;

                    clockBase = current;
                    clockStamp = Date.now();

                    function tick() {
                        if (paused || ended || !duration) return;

                        var now = Date.now();

                        if (!lastRemoteClock || now - lastRemoteClock > 1200) {
                            current = Math.min(duration, clockBase + (now - clockStamp) / 1000);
                        }
                        else {
                            clockBase = current;
                            clockStamp = now;
                        }

                        listener.send('timeupdate');

                        if (duration > 0 && current >= duration - 0.15) {
                            sendEnded();
                            return;
                        }

                        clockTimer = setTimeout(tick, 500);
                    }

                    clockTimer = setTimeout(tick, 500);
                }

                function applyDuration(value) {
                    var next = Number(value) || 0;
                    if (next < 5 || next > 1800) return false;

                    duration = next;
                    if (current > duration) current = duration;

                    listener.send('timeupdate');
                    if (!paused && !ended) startClock();

                    return true;
                }

                function decodeRepeated(value) {
                    value = String(value || '').replace(/&amp;/gi, '&').replace(/\\u0026/gi, '&').replace(/\\\//g, '/');

                    for (var i = 0; i < 3; i++) {
                        try {
                            var decoded = decodeURIComponent(value);
                            if (decoded === value) break;
                            value = decoded;
                        }
                        catch (e) {
                            break;
                        }
                    }

                    return value;
                }

                function absoluteUrl(base, link) {
                    link = decodeRepeated(link);
                    if (/^https?:\/\//i.test(link)) return link;
                    if (/^\/\//.test(link)) return (base.indexOf('https://') === 0 ? 'https:' : 'http:') + link;

                    var origin = (String(base || '').match(/^(https?:\/\/[^\/]+)/i) || [])[1] || '';
                    if (link.charAt(0) === '/') return origin + link;

                    var clean = String(base || '').replace(/[?#].*$/, '');
                    var slash = clean.lastIndexOf('/');
                    var dir = slash >= 0 ? clean.slice(0, slash + 1) : clean + '/';

                    return dir + link;
                }

                function playlistDuration(text) {
                    var total = 0;
                    var match;
                    var regex = /#EXTINF:([0-9.]+)/gi;

                    while ((match = regex.exec(String(text || '')))) {
                        total += parseFloat(match[1]) || 0;
                    }

                    return total;
                }

                function firstVariantUrl(text, base) {
                    var lines = String(text || '').replace(/\r/g, '').split('\n');

                    for (var i = 0; i < lines.length; i++) {
                        if (lines[i].indexOf('#EXT-X-STREAM-INF') !== 0) continue;

                        for (var j = i + 1; j < lines.length; j++) {
                            var candidate = $.trim(lines[j] || '');
                            if (!candidate) continue;
                            if (candidate.charAt(0) === '#') continue;
                            return absoluteUrl(base, candidate);
                        }
                    }

                    return '';
                }

                function extractWidgetHls(html) {
                    html = String(html || '');
                    var match = html.match(/[?&]mq_url=([^&"'<>\s]+)/i);

                    if (!match) match = html.match(/["']mq_url["']\s*[:=]\s*["']([^"']+)/i);
                    if (!match) match = html.match(/(https?(?:%3A|:)\/?\/?[^"'<>\s]+?\.m3u8[^"'<>\s]*)/i);

                    if (!match) return '';

                    var value = decodeRepeated(match[1] || match[0]);

                    if (value.indexOf('http') > 0) value = value.slice(value.indexOf('http'));
                    return /^https?:\/\//i.test(value) ? value : '';
                }

                function requestText(url, callback) {
                    metadataRequest.native(url, function (data) {
                        callback(null, String(data || ''));
                    }, function () {
                        callback(new Error('request'));
                    }, false, {
                        dataType: 'text',
                        timeout: 6000,
                        headers: playbackHeaders('kinopoisk')
                    });
                }

                function probeDuration() {
                    var cache = window.capsule_trailer_kp_duration_cache = window.capsule_trailer_kp_duration_cache || {};
                    var cacheKey = (String(streamUrl || '').match(/\/trailer\/(\d+)/i) || [])[1] || String(streamUrl || '').split('?')[0];

                    if (cache[cacheKey] && applyDuration(cache[cacheKey])) return;

                    requestText(streamUrl, function (error, html) {
                        if (error || !html) return;

                        var hls = extractWidgetHls(html);

                        if (!hls) {
                            var durationMatch = html.match(/["'](?:videoDuration|duration)["']\s*[:=]\s*["']?([0-9.]+)/i);
                            if (durationMatch && applyDuration(durationMatch[1])) cache[cacheKey] = duration;
                            return;
                        }

                        requestText(hls, function (playlistError, playlist) {
                            if (playlistError || !playlist) return;

                            var total = playlistDuration(playlist);

                            if (total > 0) {
                                if (applyDuration(total)) cache[cacheKey] = duration;
                                return;
                            }

                            var variant = firstVariantUrl(playlist, hls);
                            if (!variant) return;

                            requestText(variant, function (variantError, mediaPlaylist) {
                                if (variantError || !mediaPlaylist) return;

                                var mediaDuration = playlistDuration(mediaPlaylist);
                                if (mediaDuration > 0 && applyDuration(mediaDuration)) {
                                    cache[cacheKey] = duration;
                                }
                            });
                        });
                    });
                }

                function post(method, data) {
                    if (!frame || !frame.contentWindow) return;
                    var message = data || {};
                    message.method = method;
                    try { frame.contentWindow.postMessage(message, '*'); } catch (e) {}
                }

                function parseMessage(event) {
                    if (!frame || event.source !== frame.contentWindow) return null;
                    if (event.origin && event.origin.indexOf('kinopoisk.ru') < 0 && event.origin.indexOf('yandex.ru') < 0) return null;
                    var message = event.data;
                    if (typeof message === 'string') {
                        try { message = JSON.parse(message); } catch (e) { return null; }
                    }
                    return message && typeof message === 'object' ? message : null;
                }

                function sendEnded() {
                    if (ended) return;
                    ended = true;
                    paused = true;
                    stopClock();
                    listener.send('ended');
                }

                function onMessage(event) {
                    var message = parseMessage(event);
                    if (!message) return;

                    var payload = message;
                    if (message.data && typeof message.data === 'object') payload = message.data;

                    var detail = payload;
                    if (payload && payload.data && typeof payload.data === 'object') detail = payload.data;

                    function value(name) {
                        if (detail && typeof detail[name] !== 'undefined') return detail[name];
                        if (payload && typeof payload[name] !== 'undefined') return payload[name];
                        return message[name];
                    }

                    var type = String(
                        message.event || message.type ||
                        (payload && (payload.event || payload.type)) ||
                        (detail && (detail.event || detail.type)) || ''
                    ).toLowerCase();

                    var eventTime = value('time');
                    var eventDuration = value('duration');

                    if (typeof eventTime !== 'undefined' && isFinite(Number(eventTime))) {
                        current = Math.max(0, Number(eventTime) || 0);
                        lastRemoteClock = Date.now();
                        clockBase = current;
                        clockStamp = lastRemoteClock;
                    }
                    if (typeof eventDuration !== 'undefined' && Number(eventDuration) > 0) {
                        applyDuration(eventDuration);
                    }

                    if (type === 'inited' || type === 'ready' || type === 'player:ready') {
                        var firstReady = !ready;
                        ready = true;
                        clearTimeout(initTimer);
                        setLoader(true, 'Запускаем трейлер…');
                        if (firstReady) {
                            listener.send('canplay');
                            listener.send('loadeddata');
                        }
                        post('setVolume', { volume: muted ? 0 : volume });
                        if (wantedPlay) post('play');
                        if (duration > 0) listener.send('timeupdate');
                        return;
                    }

                    if (type === 'started' || type === 'playing') {
                        ready = true;
                        clearTimeout(initTimer);
                        ended = false;
                        paused = false;
                        hideLoader();
                        startClock();
                        listener.send('playing');
                        listener.send('timeupdate');
                        return;
                    }

                    if (type === 'paused' || type === 'pause') {
                        paused = true;
                        stopClock();
                        listener.send('pause');
                        listener.send('timeupdate');
                        return;
                    }

                    if (type === 'ended' || type === 'finished') {
                        hideLoader();
                        sendEnded();
                        return;
                    }

                    if (type === 'timeupdate' || type === 'progress') {
                        if (current > 0 || duration > 0) hideLoader();
                        listener.send('timeupdate');
                        return;
                    }

                    if (type === 'bufferingstarted' || type === 'buffering') {
                        setLoader(true, 'Буферизация трейлера…');
                        stopClock();
                        listener.send('waiting');
                        return;
                    }

                    if (type === 'bufferingended') {
                        hideLoader();
                        if (!paused) {
                            startClock();
                            listener.send('playing');
                        }
                        return;
                    }

                    if (type === 'error' || type === 'fatal') {
                        hideLoader();
                        paused = true;
                        video.error = {
                            code: value('code') || 'kinopoisk',
                            message: value('message') || 'Kinopoisk widget playback error'
                        };
                        listener.send('error', { error: video.error, fatal: true });
                    }
                }

                function createFrame() {
                    if (frame) return;

                    frame = document.createElement('iframe');
                    frame.src = streamUrl;
                    frame.setAttribute('frameborder', '0');
                    frame.setAttribute('allow', 'autoplay; fullscreen; picture-in-picture');
                    frame.setAttribute('allowfullscreen', 'true');
                    frame.style.width = '100%';
                    frame.style.height = '100%';
                    frame.style.border = '0';
                    frame.style.display = 'block';
                    frame.style.pointerEvents = 'none';

                    frame.onload = function () {
                        if (!frame) return;

                        if (!ready) {
                            ready = true;
                            listener.send('canplay');
                            listener.send('loadeddata');
                        }

                        setLoader(true, 'Запускаем трейлер…');
                        clearTimeout(loaderFallbackTimer);
                        loaderFallbackTimer = setTimeout(function () {
                            setLoader(true, 'Кинопоиск всё ещё загружает трейлер…');
                        }, 4500);

                        post('setVolume', { volume: muted ? 0 : volume });

                        if (wantedPlay) {
                            paused = false;
                            post('play');
                            startClock();
                            listener.send('playing');
                        }
                    };

                    object.append(frame);
                    object.append(loader);

                    initTimer = setTimeout(function () {
                        if (ready || !frame) return;
                        ready = true;
                        listener.send('canplay');
                        listener.send('loadeddata');

                        if (wantedPlay) {
                            paused = false;
                            post('play');
                            startClock();
                            listener.send('playing');
                        }
                    }, 2500);
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
                        if (duration > 0) current = Math.min(current, duration);
                        lastRemoteClock = Date.now();
                        clockBase = current;
                        clockStamp = lastRemoteClock;
                        post('seek', { time: current });
                        listener.send('timeupdate');
                        if (!paused && !ended) startClock();
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
                        if (ready) post('setVolume', { volume: muted ? 0 : volume });
                    },
                    get: function () { return volume; }
                });
                Object.defineProperty(video, 'muted', {
                    configurable: true,
                    set: function (value) {
                        muted = !!value;
                        if (ready) post('setVolume', { volume: muted ? 0 : volume });
                    },
                    get: function () { return muted; }
                });
                Object.defineProperty(video, 'videoWidth', {
                    configurable: true,
                    get: function () { return 1920; }
                });
                Object.defineProperty(video, 'videoHeight', {
                    configurable: true,
                    get: function () { return 1080; }
                });
                Object.defineProperty(video, 'audioTracks', { configurable: true, get: function () { return []; } });
                Object.defineProperty(video, 'textTracks', { configurable: true, get: function () { return []; } });

                video.canPlayType = function () { return true; };
                video.addEventListener = listener.follow.bind(listener);
                video.load = function () {
                    if (!/^https?:\/\/widgets\.kinopoisk\.ru\//i.test(streamUrl)) {
                        video.error = { code: 'kinopoisk-url', message: 'Invalid Kinopoisk widget URL' };
                        listener.send('error', { error: video.error, fatal: true });
                        return;
                    }
                    createFrame();
                    probeDuration();
                };
                video.play = function () {
                    wantedPlay = true;
                    if (ready) {
                        paused = false;
                        post('play');
                        startClock();
                        listener.send('playing');
                    }
                };
                video.pause = function () {
                    wantedPlay = false;
                    paused = true;
                    stopClock();
                    if (ready) post('pause');
                };
                video.resize = function () {};
                video.size = function () {};
                video.destroy = function () {
                    clearTimeout(initTimer);
                    clearTimeout(loaderFallbackTimer);
                    stopClock();
                    try { metadataRequest.clear(); } catch (e0) {}
                    window.removeEventListener('message', onMessage);
                    try { if (frame && frame.parentNode) frame.parentNode.removeChild(frame); } catch (e) {}
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
            window.capsule_trailer_kinopoisk_tube = registration;
        }
    }

    function registerPlaybackFallback() {
        if (window.capsule_trailer_playback_fallback) return;
        if (!Lampa.Player || !Lampa.Player.listener || !Lampa.PlayerVideo || !Lampa.PlayerVideo.listener) return;
        window.capsule_trailer_playback_fallback = true;

        Lampa.Player.listener.follow('start', function (data) {
            if (!data || !data.capsule_trailer) return;

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

            function closePlayer() {
                setTimeout(function () {
                    try {
                        if (Lampa.Player.opened && Lampa.Player.opened()) Lampa.Player.close();
                    }
                    catch (e) {}
                }, 0);
            }

            function onError(event) {
                if (!active || used || !event || !event.fatal) return;

                setTimeout(function () {
                    if (!active || used) return;

                    if (data.capsule_retry_inflight_until && Date.now() < data.capsule_retry_inflight_until) {
                        return;
                    }

                    if (data.capsule_fallback) {
                        used = true;
                        var fallbackData = {
                            url: data.capsule_fallback,
                            title: data.title,
                            card: data.card,
                            capsule_trailer: true,
                            capsule_source: data.capsule_fallback_source || 'fallback',
                            headers: data.headers || null
                        };

                        cleanup();
                        Lampa.Noty.show('Прямой поток недоступен, пробуем резервный способ воспроизведения');

                        setTimeout(function () {
                            try {
                                if (Lampa.Player.opened && Lampa.Player.opened()) Lampa.Player.close();
                            }
                            catch (e) {}

                            setTimeout(function () {
                                try { Lampa.Player.play(fallbackData); }
                                catch (e2) { Lampa.Noty.show('CAPSULE Trailer: видео недоступно'); }
                            }, 100);
                        }, 0);
                        return;
                    }

                    if (data.capsule_source === 'kinopoisk-widget') {
                        used = true;
                        cleanup();
                        Lampa.Noty.show('CAPSULE Trailer: Кинопоиск не смог запустить виджет');
                        closePlayer();
                        return;
                    }

                    if (Lampa.Platform && Lampa.Platform.is && Lampa.Platform.is('android') && !data.capsule_native_retry) {
                        used = true;
                        var nativeData = {
                            url: data.url,
                            title: data.title,
                            card: data.card,
                            capsule_trailer: true,
                            capsule_source: data.capsule_source || 'capsule',
                            capsule_native_retry: true,
                            launch_player: 'android',
                            headers: data.headers || null
                        };

                        cleanup();
                        Lampa.Noty.show('Внутренний плеер не принял поток, пробуем Android-плеер');

                        setTimeout(function () {
                            try {
                                if (Lampa.Player.opened && Lampa.Player.opened()) Lampa.Player.close();
                            }
                            catch (e3) {}

                            setTimeout(function () {
                                try { Lampa.Player.play(nativeData); }
                                catch (e4) { Lampa.Noty.show('CAPSULE Trailer: видео недоступно'); }
                            }, 120);
                        }, 0);
                        return;
                    }

                    used = true;
                    cleanup();
                    Lampa.Noty.show('CAPSULE Trailer: этот поток недоступен, выберите другой вариант');
                    closePlayer();
                }, 80);
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
            '.capsule-trailer-scroll{width:100%;height:100%;box-sizing:border-box}' +
            '.capsule-kinopoisk-player{position:absolute;top:0;right:0;bottom:0;left:0;width:100%;height:100%;background:#000;overflow:hidden}' +
            '.capsule-kinopoisk-player iframe{position:absolute;top:0;right:0;bottom:0;left:0;z-index:1}' +
            '.capsule-kinopoisk-loader{position:absolute;top:0;right:0;bottom:0;left:0;z-index:3;display:flex;flex-direction:column;align-items:center;justify-content:center;background:rgba(0,0,0,.42);pointer-events:none;transition:opacity .16s ease}' +
            '.capsule-kinopoisk-loader.hide{opacity:0;visibility:hidden}' +
            '.capsule-kinopoisk-loader__spinner{width:2.8em;height:2.8em;border:.22em solid rgba(255,255,255,.22);border-top-color:#fff;border-radius:50%;animation:capsule-kinopoisk-spin .8s linear infinite}' +
            '.capsule-kinopoisk-loader__text{font-size:1em;margin-top:1em;opacity:.72}' +
            '@keyframes capsule-kinopoisk-spin{to{transform:rotate(360deg)}}' +
            '.capsule-trailer{padding:1.8em 2.2em 3em;box-sizing:border-box;max-width:78em;margin:0 auto;color:inherit}' +
            '.capsule-trailer__head{display:flex;align-items:center;margin:0 0 1.5em}' +
            '.capsule-trailer__poster{width:4.2em;height:6.2em;object-fit:cover;border-radius:.45em;background:rgba(255,255,255,.07);flex:0 0 auto;margin-right:1.1em}' +
            '.capsule-trailer__poster--empty{display:flex;align-items:center;justify-content:center}' +
            '.capsule-trailer__poster--empty svg{width:2em;height:2em;opacity:.7}' +
            '.capsule-trailer__title{font-size:1.55em;font-weight:600;line-height:1.2}' +
            '.capsule-trailer__sub{font-size:.95em;opacity:.58;margin-top:.35em}' +
            '.capsule-trailer__status{font-size:.95em;opacity:.55;margin:.4em 0 1em}' +
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
            '.capsule-trailer__results{padding-bottom:4em}' +
            'body.true--mobile:not(.orientation--landscape) .capsule-trailer__results{padding-bottom:10em}' +
            'body.true--mobile.orientation--landscape .capsule-trailer{padding-right:10em}' +
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
        var scroll = new Lampa.Scroll({ mask: true, over: true, step: 280 });
        var html = scroll.render();
        var content = $('<div class="capsule-trailer"></div>');
        html.addClass('capsule-trailer-scroll');
        var status = $('<div class="capsule-trailer__status"></div>');
        var resultRoot = $('<div class="capsule-trailer__results"></div>');
        var alive = true;
        var started = false;
        var last = null;
        var pendingProviders = 0;
        var totalResults = 0;
        var failures = [];
        var cancels = [];
        var resolvingCancel = null;
        var resultSeen = {};
        var semanticSeen = {};
        var bestFound = null;
        var autoTimer = null;
        var autoStarted = false;

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

        function languageLabel(item) {
            var lang = inferLanguage(item).toLowerCase();
            if (lang === 'ru' || lang === 'rus') return 'Русский';
            if (lang === 'en' || lang === 'eng') return 'English';
            return lang ? lang.toUpperCase() : '';
        }

            function itemMeta(item, provider) {
            var parts = [];
            var kind = item.kind || trailerKind(item.title);
            if (kind === 'teaser') parts.push('Тизер');
            else parts.push('Трейлер');
            var lang = languageLabel(item);
            if (lang) parts.push(lang);
            if (item.qualityHint) parts.push(item.qualityHint);
            if (item.duration) parts.push(secondsText(item.duration));

            var source = item.providerName || (provider && provider.name) || '';
            if (source) parts.push('Источник: ' + source);

            return parts;
        }

        function makeItem(item, provider) {
            var meta = itemMeta(item, provider);
            var thumb = item.thumbnail ?
                '<img class="capsule-trailer__thumb" src="' + escapeHtml(item.thumbnail) + '" />' :
                '<div class="capsule-trailer__thumb capsule-trailer__thumb--empty">' + ICON + '</div>';
            var el = $(
                '<div class="capsule-trailer__item selector" data-score="' + escapeHtml(item.score || 0) + '">' +
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

        function scheduleAutoPlay() {
            return;
        }

        function appendResults(provider, items) {
            if (!alive || !items || !items.length) return;
            for (var i = 0; i < items.length; i++) {
                var item = items[i];
                item.score = scoreCandidate(item, movie, item.exactMovieMatch === true);
                if (item.score < 0) continue;

                var key = item.canonical || item.id || (provider.id + ':' + i + ':' + item.title);
                if (resultSeen[key]) continue;

                var semantic = semanticTrailerKey(item);
                var duplicate = semantic ? semanticSeen[semantic] : null;
                if (duplicate && duplicate.score >= item.score) continue;

                if (duplicate) {
                    try { duplicate.el.remove(); } catch (e) {}
                    if (duplicate.key) delete resultSeen[duplicate.key];
                    totalResults = Math.max(0, totalResults - 1);
                }

                resultSeen[key] = true;
                var el = makeItem(item, provider);
                resultRoot.append(el);
                totalResults++;

                if (semantic) semanticSeen[semantic] = { score: item.score, el: el, key: key };
                if (!bestFound || item.score > bestFound.item.score) {
                    bestFound = { item: item, provider: provider };
                    scheduleAutoPlay();
                }

                refreshCollection(el);
            }
        }

        function sortResults() {
            var nodes = resultRoot.children('.capsule-trailer__item').get();
            nodes.sort(function (a, b) {
                return (parseInt($(b).attr('data-score'), 10) || 0) - (parseInt($(a).attr('data-score'), 10) || 0);
            });
            for (var i = 0; i < nodes.length; i++) resultRoot.append(nodes[i]);

            if (started && Lampa.Activity.own(self)) {
                var enabled = Lampa.Controller.enabled();
                if (enabled && enabled.name === COMPONENT) {
                    Lampa.Controller.collectionSet(scroll.render());
                    Lampa.Controller.collectionFocus(last || false, scroll.render());
                }
            }
        }

        function providerDone(provider, error, items) {
            if (!alive) return;
            if (error) failures.push(provider.id);
            appendResults(provider, items || []);
            pendingProviders--;
            if (pendingProviders <= 0) searchFinished();
            else if (totalResults) status.text('Найдено: ' + totalResults + ' · поиск продолжается…');
        }

        function runProviders() {
            if (!alive) return;
            pendingProviders = PROVIDERS.length;
            status.text('Ищем трейлеры…');

            for (var i = 0; i < PROVIDERS.length; i++) {
                (function (provider) {
                    var finished = false;
                    function finish(error, items) {
                        if (finished) return;
                        finished = true;
                        providerDone(provider, error, items);
                    }
                    try {
                        var cancel = provider.search(context, finish);
                        if (typeof cancel === 'function') cancels.push(cancel);
                    }
                    catch (e) {
                        log('provider search error', provider.id, e);
                        finish(e, []);
                    }
                })(PROVIDERS[i]);
            }
        }

        function clearSearchState() {
            for (var i = 0; i < cancels.length; i++) {
                try { cancels[i](); } catch (e) {}
            }
            cancels = [];
            pendingProviders = 0;
            totalResults = 0;
            failures = [];
            resultSeen = {};
            semanticSeen = {};
            bestFound = null;
            autoStarted = false;
            clearTimeout(autoTimer);
            autoTimer = null;
            last = null;
            resultRoot.empty();
        }

        function retry() {
            cacheDropMovie(movie);
            clearSearchState();
            status.text('Ищем трейлеры…');
            self.activity.loader(true);
            runProviders();
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
            sortResults();
            if (totalResults) {
                var text = totalResults + ' ' + (totalResults === 1 ? 'вариант' : (totalResults < 5 ? 'варианта' : 'вариантов'));
                if (failures.length) text += ' · часть источников недоступна';
                if (settingEnabled('capsule_trailer_autoplay', false) && bestFound && bestFound.item.score < AUTO_SCORE_MIN) {
                    text += ' · выберите вручную: уверенность недостаточна для автостарта';
                }
                status.text(text);
                scheduleAutoPlay();
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
            var settled = false;
            var cancelResolve = provider.resolve(item, context, function (error, data) {
                settled = true;
                resolvingCancel = null;
                if (!alive) return;
                self.activity.loader(false);
                if (error || !data || !data.url) {
                    status.text('Не удалось подготовить видео');
                    Lampa.Noty.show('CAPSULE Trailer: видео недоступно');
                    return;
                }
                status.text('Запуск трейлера…');
                try {
                    Lampa.Player.play(data);
                }
                catch (e) {
                    log('Player.play error', e);
                    Lampa.Noty.show('CAPSULE Trailer: ошибка запуска видео');
                }
            });
            resolvingCancel = settled ? null : (typeof cancelResolve === 'function' ? cancelResolve : null);
        }

        this.create = function () {
            content.append(header());
            content.append(status);
            content.append(resultRoot);
            scroll.append(content);
            try { scroll.height(); } catch (e) {}
            status.text('Ищем трейлеры…');
            this.activity.loader(true);
            runProviders();
            return this.render();
        };

        this.start = function () {
            if (!Lampa.Activity.own(this)) return;
            started = true;
            try { scroll.restorePosition(); } catch (e) {}
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
            clearTimeout(autoTimer);
            autoTimer = null;
            if (resolvingCancel) {
                try { resolvingCancel(); } catch (e) {}
                resolvingCancel = null;
            }
            for (var i = 0; i < cancels.length; i++) {
                try { cancels[i](); } catch (e2) {}
            }
            cancels = [];
            try { scroll.destroy(); } catch (e3) {}
        };
    }

    function setupSettings() {
        if (!Lampa.SettingsApi || typeof Lampa.SettingsApi.addComponent !== 'function' || typeof Lampa.SettingsApi.addParam !== 'function') return;

        Lampa.SettingsApi.addComponent({
            component: 'capsule_trailer_settings',
            name: 'CAPSULEtrailer',
            icon: ICON
        });

        Lampa.SettingsApi.addParam({
            component: 'capsule_trailer_settings',
            param: { type: 'title' },
            field: { name: 'Поведение' }
        });

        Lampa.SettingsApi.addParam({
            component: 'capsule_trailer_settings',
            param: {
                name: 'capsule_trailer_autoplay',
                type: 'trigger',
                default: false
            },
            field: {
                name: 'Автоматически запускать лучший трейлер',
                description: 'CAPSULE сначала завершает быстрый поиск, сравнивает результаты по score и запускает лучший без открытия списка. Экспериментальный Кинопоиск в автостарт не участвует.'
            }
        });

        Lampa.SettingsApi.addParam({
            component: 'capsule_trailer_settings',
            param: {
                name: 'capsule_trailer_replace_native',
                type: 'trigger',
                default: false
            },
            field: {
                name: 'Заменить стандартные трейлеры Lampa',
                description: 'Убирает штатную кнопку трейлеров Lampa из карточки и оставляет только CAPSULE Trailer.'
            }
        });

        Lampa.SettingsApi.addParam({
            component: 'capsule_trailer_settings',
            param: {
                name: 'capsule_trailer_quality',
                type: 'select',
                values: {
                    'best': 'Лучшее доступное',
                    '2160': '2160p',
                    '1440': '1440p',
                    '1080': '1080p',
                    '720': '720p',
                    '480': '480p'
                },
                default: 'best'
            },
            field: {
                name: 'Приоритет качества',
                description: 'CAPSULE сначала выбирает ближайшее к этому качеству. «Лучшее доступное» предпочитает максимальное качество.'
            }
        });

        Lampa.SettingsApi.addParam({
            component: 'capsule_trailer_settings',
            param: { type: 'title' },
            field: { name: 'Источники' }
        });

        Lampa.SettingsApi.addParam({
            component: 'capsule_trailer_settings',
            param: { type: 'static' },
            field: {
                name: 'OK.ru — основной источник',
                description: 'Всегда включён. На нём строится основной быстрый поиск CAPSULE Trailer; отключить его нельзя.'
            },
            onRender: function (item) {
                item.removeClass('selector');
            }
        });

        Lampa.SettingsApi.addParam({
            component: 'capsule_trailer_settings',
            param: {
                name: 'capsule_trailer_direct',
                type: 'trigger',
                default: true
            },
            field: {
                name: 'Прямые трейлеры Lampa',
                description: 'Использовать уже полученные Lampa прямые MP4/HLS/DASH ссылки, если они есть.'
            }
        });

        Lampa.SettingsApi.addParam({
            component: 'capsule_trailer_settings',
            param: {
                name: 'capsule_trailer_kinopoisk',
                type: 'trigger',
                default: true
            },
            field: {
                name: 'Кинопоиск · экспериментально',
                description: 'Поиск идёт через Kinopoisk API Unofficial, а воспроизведение — через сам Kinopoisk widget внутри плеера Lampa. Виджет может зависеть от региона.'
            }
        });

        Lampa.SettingsApi.addParam({
            component: 'capsule_trailer_settings',
            param: {
                name: 'capsule_trailer_kinopoisk_key',
                type: 'input',
                values: '',
                default: ''
            },
            field: {
                name: 'Kinopoisk unofficial API key',
                description: 'Ключ хранится в Storage Lampa и отправляется только kinopoiskapiunofficial.tech через X-API-KEY.'
            }
        });

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

        var nativeTrailer = container.find('.view--trailer').last();
        var replaceNative = settingEnabled('capsule_trailer_replace_native', false);

        var button = $('' +
            '<div class="full-start__button selector view--capsule-trailer" data-subtitle="CAPSULE Trailer · агрегатор">' +
                ICON +
                '<span>Трейлеры</span>' +
            '</div>'
        );

        function openTrailerList() {
            Lampa.Activity.push({
                url: '',
                title: 'Трейлеры',
                component: COMPONENT,
                page: 1,
                movie: movie,
                videos: event.data.videos || { results: [] },
                capsule_version: VERSION
            });
        }

        button.on('hover:enter', function () {
            if (!settingEnabled('capsule_trailer_autoplay', false)) {
                openTrailerList();
                return;
            }

            if (button.data('capsule-autoplay-busy')) return;
            button.data('capsule-autoplay-busy', true);

            closeSourceSelectionState();

            startBestTrailer({
                movie: movie,
                videos: event.data.videos || { results: [] }
            }, function (started) {
                button.data('capsule-autoplay-busy', false);
                if (!started) openTrailerList();
            });
        });

        if (replaceNative && nativeTrailer.length) {
            nativeTrailer.before(button);
            nativeTrailer.remove();
        }
        else if (nativeTrailer.length) nativeTrailer.after(button);
        else container.append(button);
    }

    function init() {
        addStyles();
        setupSettings();
        registerCapsuleMediaTube();
        registerKinopoiskTube();
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
