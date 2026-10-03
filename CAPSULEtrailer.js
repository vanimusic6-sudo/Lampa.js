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
 * - Lampa/TMDB video metadata, including YouTube IDs already fetched for the movie card.
 * - Yandex Video/VH and OK.ru as isolated experimental providers for Russian trailers.
 * - Optional self-hosted Invidious/Piped transport for YouTube; no public proxy is hardcoded.
 * - RUTUBE is a low-priority fallback, not the primary source.
 */
(function () {
    'use strict';

    if (window.capsule_trailer_ready) return;
    window.capsule_trailer_ready = true;

    var VERSION = '2.0.0';
    var COMPONENT = 'capsule_trailer';
    var CACHE_KEY = 'capsule_trailer_cache_v2';
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

    function qualityNumber(value) {
        var match = String(value || '').match(/(2160|1440|1080|720|480|360|240|144)/);
        return match ? parseInt(match[1], 10) : 0;
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
        if (duration && (duration < 12 || duration > 900)) return -9999;

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

        if (!exactMovieMatch && best < 70) return -9999;
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
        if (quality >= 2160) score += 28;
        else if (quality >= 1080) score += 22;
        else if (quality >= 720) score += 14;
        else if (quality >= 480) score += 5;

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

    function requestData(url, dataType, timeout, done) {
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
            }, false, {
                timeout: timeout || SEARCH_TIMEOUT,
                dataType: dataType,
                headers: { 'Accept': dataType === 'text' ? 'text/html,*/*' : 'application/json' }
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

    function nativeRequest(url, timeout, done) {
        return requestData(url, 'json', timeout, done);
    }

    function textRequest(url, timeout, done) {
        return requestData(url, 'text', timeout, done);
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

    function backendBase() {
        var value = Lampa.Storage.field('capsule_trailer_youtube_backend') || '';
        value = String(value).replace(/^\s+|\s+$/g, '').replace(/\/+$/, '');
        return /^https?:\/\//i.test(value) ? value : '';
    }

    var backendDetected = '';

    function youtubeId(value) {
        var text = String(value || '');
        var match = text.match(/(?:v=|youtu\.be\/|embed\/)([A-Za-z0-9_-]{11})/);
        if (!match && /^[A-Za-z0-9_-]{11}$/.test(text)) return text;
        return match ? match[1] : '';
    }

    function directMediaUrl(url) {
        return /^https?:\/\//i.test(String(url || '')) && /\.(?:m3u8|mpd|mp4|m4v)(?:[?#]|$)/i.test(String(url || ''));
    }

    function qualityMapFromStreams(streams, urlField, heightField, usable) {
        var quality = {};
        var bestUrl = '';
        var bestHeight = 0;
        for (var i = 0; i < (streams || []).length; i++) {
            var stream = streams[i] || {};
            if (usable && !usable(stream)) continue;
            var url = stream[urlField || 'url'];
            if (!/^https?:\/\//i.test(String(url || ''))) continue;
            var height = parseInt(stream[heightField || 'height'], 10) || qualityNumber(stream.quality || stream.qualityLabel || stream.resolution);
            var label = height ? height + 'p' : (stream.qualityLabel || stream.quality || 'Auto');
            quality[label] = url;
            if (!bestUrl || height > bestHeight) {
                bestUrl = url;
                bestHeight = height;
            }
        }
        return { quality: quality, url: bestUrl, height: bestHeight };
    }

    function resolveYoutubeViaInvidious(base, id, done) {
        return nativeRequest(base + '/api/v1/videos/' + encodeURIComponent(id) + '?local=true&region=RU', RESOLVE_TIMEOUT, function (error, data) {
            if (error || !data || !data.videoId) return done(error || new Error('invidious-invalid'));
            backendDetected = 'invidious';
            var mapped = qualityMapFromStreams(data.formatStreams || [], 'url', 'height', function (stream) {
                return String(stream.container || '').toLowerCase() === 'mp4' || /video\/mp4/i.test(String(stream.type || ''));
            });
            if (!mapped.url && data.hlsUrl) mapped.url = data.hlsUrl;
            if (!mapped.url && data.dashUrl) mapped.url = data.dashUrl;
            if (!mapped.url) return done(new Error('invidious-no-playable'));
            done(null, mapped);
        });
    }

    function resolveYoutubeViaPiped(base, id, done) {
        return nativeRequest(base + '/streams/' + encodeURIComponent(id), RESOLVE_TIMEOUT, function (error, data) {
            if (error || !data || !data.videoStreams) return done(error || new Error('piped-invalid'));
            backendDetected = 'piped';
            var mapped = qualityMapFromStreams(data.videoStreams || [], 'url', 'height', function (stream) {
                return stream.videoOnly === false && /video\/mp4/i.test(String(stream.mimeType || ''));
            });
            if (!mapped.url && data.hls) mapped.url = data.hls;
            if (!mapped.url && data.dash) mapped.url = data.dash;
            if (!mapped.url) return done(new Error('piped-no-playable'));
            done(null, mapped);
        });
    }

    function resolveYoutube(item, context, done) {
        var id = item.videoId || youtubeId(item.url);
        if (!id) {
            done(new Error('youtube-id'));
            return function () {};
        }

        var official = {
            url: 'https://www.youtube.com/watch?v=' + id,
            title: item.title,
            card: context.movie,
            capsule_trailer: true,
            capsule_source: 'youtube-official'
        };
        var base = backendBase();
        if (!base) {
            done(null, official);
            return function () {};
        }

        var cancelled = false;
        var cancelCurrent = null;
        function complete(error, mapped) {
            if (cancelled) return;
            if (error || !mapped || !mapped.url) return done(null, official);
            done(null, {
                url: mapped.url,
                quality: mapped.quality && Object.keys(mapped.quality).length > 1 ? mapped.quality : undefined,
                title: item.title,
                card: context.movie,
                capsule_trailer: true,
                capsule_source: 'youtube-selfhosted',
                capsule_fallback: official.url,
                capsule_fallback_source: 'youtube-official'
            });
        }

        function tryInvidious() {
            cancelCurrent = resolveYoutubeViaInvidious(base, id, complete);
        }
        function tryPiped() {
            cancelCurrent = resolveYoutubeViaPiped(base, id, function (error, mapped) {
                if (!error && mapped) return complete(null, mapped);
                if (backendDetected === 'piped') return complete(error);
                tryInvidious();
            });
        }

        if (backendDetected === 'invidious') tryInvidious();
        else if (backendDetected === 'piped') tryPiped();
        else tryPiped();

        return function () {
            cancelled = true;
            if (cancelCurrent) cancelCurrent();
        };
    }

    function normalizeTmdb(videos, movie) {
        var out = [];
        var list = videos && videos.results ? videos.results : [];
        var backend = backendBase();
        for (var i = 0; i < list.length; i++) {
            var raw = list[i] || {};
            var site = String(raw.site || '').toLowerCase();
            if (site === 'youtube' && raw.key) {
                var item = {
                    id: 'youtube:' + raw.key,
                    canonical: 'youtube:' + raw.key,
                    provider: 'tmdb',
                    providerName: 'TMDB / YouTube',
                    title: raw.name || (raw.type === 'Teaser' ? 'Teaser' : 'Official Trailer'),
                    description: '',
                    duration: 0,
                    thumbnail: 'https://i.ytimg.com/vi/' + encodeURIComponent(raw.key) + '/hqdefault.jpg',
                    author: '',
                    language: raw.iso_639_1 || '',
                    qualityHint: raw.size ? String(raw.size) + 'p' : '',
                    year: yearOf(movie),
                    kind: String(raw.type || '').toLowerCase() === 'teaser' ? 'teaser' : 'trailer',
                    official: raw.official === true,
                    videoId: raw.key,
                    url: 'https://www.youtube.com/watch?v=' + raw.key,
                    transportScore: backend ? 110 : 20,
                    exactMovieMatch: true
                };
                item.score = scoreCandidate(item, movie, true);
                out.push(item);
            }
            else if (directMediaUrl(raw.url)) {
                var direct = {
                    id: 'direct:' + raw.url,
                    canonical: 'direct:' + raw.url,
                    provider: 'tmdb',
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
                    transportScore: 140,
                    exactMovieMatch: true
                };
                direct.score = scoreCandidate(direct, movie, true);
                out.push(direct);
            }
        }
        out.sort(function (a, b) { return b.score - a.score; });
        return out;
    }

    var TmdbProvider = {
        id: 'tmdb',
        name: 'TMDB',
        tier: 'stable',
        search: function (context, done) {
            done(null, normalizeTmdb(context.videos, context.movie));
            return function () {};
        },
        resolve: function (item, context, done) {
            if (item.videoId) return resolveYoutube(item, context, done);
            done(null, { url: item.url, title: item.title, card: context.movie, capsule_trailer: true, capsule_source: 'direct' });
            return function () {};
        }
    };

    function searchYoutubeBackend(context, done) {
        var base = backendBase();
        if (!base) {
            done(null, []);
            return function () {};
        }
        var movie = context.movie || {};
        var title = movie.title || movie.name || movie.original_title || movie.original_name || '';
        var original = movie.original_title || movie.original_name || '';
        var year = yearOf(movie);
        var queries = [];
        var seen = {};
        var results = [];
        var cancelled = false;
        var cancelCurrent = null;
        var index = 0;
        var cacheKey = 'youtube-backend:' + movieKey(movie);
        var cached = cacheGet(cacheKey);
        if (cached) {
            done(null, cached);
            return function () {};
        }

        function addQuery(q) {
            q = String(q || '').replace(/^\s+|\s+$/g, '');
            if (q && queries.indexOf(q) < 0) queries.push(q);
        }
        addQuery([title, year, 'официальный трейлер'].join(' '));
        if (original && cleanText(original) !== cleanText(title)) addQuery([original, year, 'official trailer'].join(' '));

        function normalize(raw, type) {
            var id = '';
            if (type === 'invidious') id = raw.videoId || '';
            else id = youtubeId(raw.url || raw.videoId || '');
            if (!id || seen[id]) return;
            var thumbnails = raw.videoThumbnails || [];
            var thumb = raw.thumbnail || (thumbnails.length ? thumbnails[thumbnails.length - 1].url : '');
            var item = {
                id: 'youtube:' + id,
                canonical: 'youtube:' + id,
                provider: 'youtube-backend',
                providerName: 'YouTube',
                title: raw.title || 'Trailer',
                description: raw.description || '',
                duration: parseInt(raw.lengthSeconds || raw.duration, 10) || 0,
                thumbnail: thumb || ('https://i.ytimg.com/vi/' + id + '/hqdefault.jpg'),
                author: raw.author || raw.uploaderName || raw.uploader || '',
                language: '',
                qualityHint: '',
                year: year,
                kind: trailerKind(raw.title),
                official: /official|официальн/i.test(String(raw.title || '')),
                videoId: id,
                url: 'https://www.youtube.com/watch?v=' + id,
                transportScore: 105,
                exactMovieMatch: false
            };
            item.score = scoreCandidate(item, movie, false);
            if (item.score >= 0) {
                seen[id] = true;
                results.push(item);
            }
        }

        function finish() {
            if (cancelled) return;
            results.sort(function (a, b) { return b.score - a.score; });
            results = results.slice(0, 8);
            cachePut(cacheKey, results);
            done(null, results);
        }

        function queryInvidious(q, callback) {
            return nativeRequest(base + '/api/v1/search?q=' + encodeURIComponent(q) + '&type=video&sort=relevance&region=RU', SEARCH_TIMEOUT, function (error, data) {
                if (!error && Object.prototype.toString.call(data) === '[object Array]') backendDetected = 'invidious';
                callback(error, data);
            });
        }

        function queryPiped(q, callback) {
            return nativeRequest(base + '/search?q=' + encodeURIComponent(q) + '&filter=videos', SEARCH_TIMEOUT, function (error, data) {
                if (!error && data && data.items) backendDetected = 'piped';
                callback(error, data);
            });
        }

        function next() {
            if (cancelled) return;
            if (index >= queries.length) return finish();
            var q = queries[index++];

            function consume(type, data) {
                var list = type === 'piped' ? (data && data.items || []) : (data || []);
                for (var i = 0; i < list.length; i++) normalize(list[i], type);
                next();
            }

            if (backendDetected === 'invidious') {
                cancelCurrent = queryInvidious(q, function (error, data) {
                    if (error) return next();
                    consume('invidious', data);
                });
            }
            else if (backendDetected === 'piped') {
                cancelCurrent = queryPiped(q, function (error, data) {
                    if (error) return next();
                    consume('piped', data);
                });
            }
            else {
                cancelCurrent = queryInvidious(q, function (error, data) {
                    if (!error && Object.prototype.toString.call(data) === '[object Array]') return consume('invidious', data);
                    cancelCurrent = queryPiped(q, function (error2, data2) {
                        if (!error2 && data2 && data2.items) return consume('piped', data2);
                        next();
                    });
                });
            }
        }

        next();
        return function () {
            cancelled = true;
            if (cancelCurrent) cancelCurrent();
        };
    }

    var YoutubeBackendProvider = {
        id: 'youtube-backend',
        name: 'YouTube backend',
        tier: 'stable-optional',
        search: searchYoutubeBackend,
        resolve: resolveYoutube
    };

    function decodeJsonString(raw) {
        if (typeof raw !== 'string') return '';
        try { return JSON.parse('"' + raw.replace(/"/g, '\\"') + '"'); } catch (e) {}
        return raw.replace(/\\u002F/g, '/').replace(/\\\//g, '/').replace(/\\u0026/g, '&');
    }

    function extractNearby(text, start, end, pattern) {
        var part = text.slice(Math.max(0, start), Math.min(text.length, end));
        var match = part.match(pattern);
        return match ? match[1] : '';
    }

    function parseYandexCandidates(text, movie) {
        text = String(text || '');
        var out = [];
        var seen = {};
        var marker = '"trailerIframeUrl":"';
        var pos = 0;
        while ((pos = text.indexOf(marker, pos)) >= 0) {
            var valueStart = pos + marker.length;
            var valueEnd = text.indexOf('"', valueStart);
            if (valueEnd < 0) break;
            var iframe = decodeJsonString(text.slice(valueStart, valueEnd));
            if (iframe.indexOf('//') === 0) iframe = 'https:' + iframe;
            var before = text.slice(Math.max(0, pos - 3600), pos);
            var after = text.slice(valueEnd, Math.min(text.length, valueEnd + 3600));
            var nearby = before + after;
            var titleMatches = before.match(/"title":"((?:\\.|[^"\\])*)"/g) || [];
            var titleRaw = titleMatches.length ? titleMatches[titleMatches.length - 1].replace(/^"title":"|"$/g, '') : '';
            if (!titleRaw) {
                var afterTitle = after.match(/"title":"((?:\\.|[^"\\])*)"/);
                titleRaw = afterTitle ? afterTitle[1] : '';
            }
            var title = decodeJsonString(titleRaw);
            var yearMatch = nearby.match(/"releaseYear":(\d{4})/);
            var kpMatch = nearby.match(/"kpId":"?(\d+)"?/);
            var idMatch = iframe.match(/frontend\.vh\.yandex\.ru\/player\/([A-Za-z0-9_-]+)/i);
            if (idMatch && title && !seen[idMatch[1]]) {
                var item = {
                    id: 'yandex:' + idMatch[1],
                    canonical: 'yandex:' + idMatch[1],
                    provider: 'yandex',
                    providerName: 'Yandex Video',
                    title: title + ' — трейлер',
                    description: '',
                    duration: 0,
                    thumbnail: imageUrl(movie),
                    author: '',
                    language: '',
                    qualityHint: '',
                    year: yearMatch ? yearMatch[1] : '',
                    kind: 'trailer',
                    official: false,
                    yandexId: idMatch[1],
                    yandexPlayer: iframe,
                    kpId: kpMatch ? kpMatch[1] : '',
                    transportScore: 125,
                    exactMovieMatch: false
                };
                var exact = Boolean(movie.kinopoisk_id && item.kpId && String(movie.kinopoisk_id) === String(item.kpId));
                item.exactMovieMatch = exact;
                item.score = scoreCandidate(item, movie, exact);
                if (item.score >= 0) {
                    seen[idMatch[1]] = true;
                    out.push(item);
                }
            }
            pos = valueEnd + 1;
        }
        out.sort(function (a, b) { return b.score - a.score; });
        return out.slice(0, 3);
    }

    function resolveYandex(item, context, done) {
        var id = item.yandexId;
        if (!id) {
            done(new Error('yandex-id'));
            return function () {};
        }
        var url = 'https://frontend.vh.yandex.ru/v23/player/' + encodeURIComponent(id) + '.json?stream_options=hires&disable_trackings=1';
        return nativeRequest(url, RESOLVE_TIMEOUT, function (error, data) {
            if (error || !data || !data.content) return done(error || new Error('yandex-invalid'));
            var content = data.content;
            var streams = content.streams || [];
            var candidates = [];
            for (var i = 0; i < streams.length; i++) {
                if (streams[i] && streams[i].url) candidates.push(streams[i].url);
            }
            if (content.content_url) candidates.push(content.content_url);
            var selected = '';
            for (var p = 0; p < candidates.length; p++) {
                if (/\.m3u8(?:[?#]|$)/i.test(candidates[p])) { selected = candidates[p]; break; }
            }
            if (!selected) {
                for (var d = 0; d < candidates.length; d++) {
                    if (/\.mpd(?:[?#]|$)/i.test(candidates[d])) { selected = candidates[d]; break; }
                }
            }
            if (!selected) {
                for (var f = 0; f < candidates.length; f++) {
                    if (/^https?:\/\//i.test(candidates[f])) { selected = candidates[f]; break; }
                }
            }
            if (!selected) return done(new Error('yandex-no-stream'));
            done(null, {
                url: selected,
                title: item.title,
                card: context.movie,
                capsule_trailer: true,
                capsule_source: 'yandex-vh'
            });
        });
    }

    var YandexProvider = {
        id: 'yandex',
        name: 'Yandex Video',
        tier: 'experimental',
        search: function (context, done) {
            if (Lampa.Storage.field('capsule_trailer_yandex') === false) {
                done(null, []);
                return function () {};
            }
            var movie = context.movie || {};
            var title = movie.title || movie.name || movie.original_title || movie.original_name || '';
            var original = movie.original_title || movie.original_name || '';
            var year = yearOf(movie);
            var queries = [];
            var all = [];
            var seen = {};
            var index = 0;
            var cancelled = false;
            var cancelCurrent = null;
            var key = 'yandex:' + movieKey(movie);
            var cached = cacheGet(key);
            if (cached) {
                done(null, cached);
                return function () {};
            }
            queries.push([title, year, mediaType(movie) === 'tv' ? 'сериал' : 'фильм'].join(' '));
            if (original && cleanText(original) !== cleanText(title)) queries.push([original, year, mediaType(movie) === 'tv' ? 'series' : 'movie'].join(' '));

            function finish() {
                if (cancelled) return;
                all.sort(function (a, b) { return b.score - a.score; });
                all = all.slice(0, 3);
                cachePut(key, all);
                done(null, all);
            }

            function next() {
                if (cancelled) return;
                if (index >= queries.length) return finish();
                var q = queries[index++];
                var url = 'https://yandex.ru/video/search?text=' + encodeURIComponent(q);
                cancelCurrent = textRequest(url, 6500, function (error, body) {
                    if (!error && body) {
                        var parsed = parseYandexCandidates(body, movie);
                        for (var i = 0; i < parsed.length; i++) {
                            if (!seen[parsed[i].id]) {
                                seen[parsed[i].id] = true;
                                all.push(parsed[i]);
                            }
                        }
                    }
                    next();
                });
            }

            next();
            return function () {
                cancelled = true;
                if (cancelCurrent) cancelCurrent();
            };
        },
        resolve: resolveYandex
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
                providerName: 'OK',
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
        out.sort(function (a, b) { return b.score - a.score; });
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
            var end = text.indexOf(quote, start + 1);            if (end < 0) break;
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
                var quality = {};
                var best = '';
                var bestHeight = 0;
                for (var i = 0; i < videos.length; i++) {
                    var stream = videos[i] || {};
                    var streamUrl = String(stream.url || '');
                    if (!/^https?:\/\//i.test(streamUrl)) continue;
                    var height = okQualityHeight(stream.name, streamUrl);
                    var label = height ? height + 'p' : (stream.name || 'Auto');
                    quality[label] = streamUrl;
                    if (!best || height > bestHeight) {
                        best = streamUrl;
                        bestHeight = height;
                    }
                }
                var hls = metadata.hlsManifestUrl || metadata.ondemandHls || '';
                if (hls && /^https?:\/\//i.test(hls)) best = hls;
                if (!best) return done(new Error('ok-no-stream'));
                done(null, {
                    url: best,
                    quality: !hls && Object.keys(quality).length > 1 ? quality : undefined,
                    title: item.title,
                    card: context.movie,
                    capsule_trailer: true,
                    capsule_source: 'ok-direct'
                });
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
        search: function (context, done) {
            if (Lampa.Storage.field('capsule_trailer_ok') === false) {
                done(null, []);
                return function () {};
            }
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

    function requestRutubeSearch(query, done) {
        var base = 'https://rutube.ru/api/search/video/?query=' + encodeURIComponent(query) + '&page=1&limit=20';
        var cancelled = false;
        var cancelCurrent = null;
        function finish(error, data) { if (!cancelled) done(error, data); }
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
        return function () { cancelled = true; if (cancelCurrent) cancelCurrent(); };
    }

    function normalizeRutube(raw, movie) {
        if (!raw || !raw.id || !raw.title) return null;
        if (raw.is_hidden || raw.is_deleted || raw.is_locked || raw.is_audio || raw.is_paid || raw.is_livestream || raw.is_adult) return null;
        var item = {
            id: 'rutube:' + raw.id,
            canonical: 'rutube:' + raw.id,
            provider: 'rutube',
            providerName: 'RUTUBE',
            title: raw.title,
            description: raw.description || '',
            duration: parseInt(raw.duration, 10) || 0,
            thumbnail: raw.thumbnail_url || raw.thumbnail || '',
            author: raw.author && raw.author.name ? raw.author.name : '',
            language: '',
            qualityHint: '',
            year: '',
            kind: trailerKind(raw.title),
            official: /официальн|official/i.test(String(raw.title || '')),
            rutubeId: String(raw.id),
            url: raw.video_url || ('https://rutube.ru/video/' + raw.id + '/'),
            embed: 'https://rutube.ru/play/embed/' + raw.id,
            transportScore: -70,
            exactMovieMatch: false
        };
        item.score = scoreCandidate(item, movie, false);
        return item.score >= 0 ? item : null;
    }

    var RutubeProvider = {
        id: 'rutube',
        name: 'RUTUBE',
        tier: 'fallback',
        search: function (context, done) {
            if (Lampa.Storage.field('capsule_trailer_rutube') === false) {
                done(null, []);
                return function () {};
            }
            var movie = context.movie || {};
            var title = movie.title || movie.name || movie.original_title || movie.original_name || '';
            var original = movie.original_title || movie.original_name || '';
            var year = yearOf(movie);
            var queries = [];
            var cancelled = false;
            var cancelCurrent = null;
            var rawResults = [];
            var seenRaw = {};
            var index = 0;
            var key = 'rutube:' + movieKey(movie);
            var cached = cacheGet(key);
            if (cached) {
                done(null, cached);
                return function () {};
            }
            queries.push([title, year, 'трейлер'].join(' '));
            if (original && cleanText(original) !== cleanText(title)) queries.push([original, year, 'trailer'].join(' '));

            function finish() {
                if (cancelled) return;
                var normalized = [];
                for (var i = 0; i < rawResults.length; i++) {
                    var item = normalizeRutube(rawResults[i], movie);
                    if (item) normalized.push(item);
                }
                normalized.sort(function (a, b) { return b.score - a.score; });
                normalized = normalized.slice(0, 7);
                cachePut(key, normalized);
                done(null, normalized);
            }

            function next() {
                if (cancelled) return;
                if (index >= queries.length) return finish();
                cancelCurrent = requestRutubeSearch(queries[index++], function (error, data) {
                    if (!error && data && data.results) {
                        for (var i = 0; i < data.results.length; i++) {
                            var raw = data.results[i];
                            if (raw && raw.id && !seenRaw[raw.id]) {
                                seenRaw[raw.id] = true;
                                rawResults.push(raw);
                            }
                        }
                    }
                    next();
                });
            }
            next();
            return function () { cancelled = true; if (cancelCurrent) cancelCurrent(); };
        },
        resolve: function (item, context, done) {
            var id = item.rutubeId || rutubeId(item.url);
            var embedData = {
                url: item.embed || ('https://rutube.ru/play/embed/' + id),
                title: item.title,
                card: context.movie,
                capsule_trailer: true,
                capsule_source: 'rutube-embed'
            };
            if (!(Lampa.Platform && Lampa.Platform.is && Lampa.Platform.is('android'))) {
                done(null, embedData);
                return function () {};
            }
            var cancelled = false;
            var cancel = nativeRequest('https://rutube.ru/api/play/options/' + encodeURIComponent(id) + '/?format=json', RESOLVE_TIMEOUT, function (error, data) {
                if (cancelled) return;
                var hls = data && data.video_balancer && data.video_balancer.m3u8;
                if (!error && hls && /^https?:\/\//i.test(hls)) {
                    done(null, {
                        url: hls,
                        title: item.title,
                        card: context.movie,
                        capsule_trailer: true,
                        capsule_source: 'rutube-hls',
                        capsule_fallback: embedData.url,
                        capsule_fallback_source: 'rutube-embed'
                    });
                }
                else done(null, embedData);
            });
            return function () { cancelled = true; cancel(); };
        }
    };

    var PROVIDERS = [TmdbProvider, YandexProvider, YoutubeBackendProvider, OkProvider, RutubeProvider];

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
            if (!data || !data.capsule_trailer || !data.capsule_fallback) return;

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

            function fallbackText() {
                if (data.capsule_fallback_source === 'youtube-official') return 'Прямой поток YouTube недоступен, пробуем встроенный YouTube';
                if (data.capsule_fallback_source === 'rutube-embed') return 'Прямой поток RUTUBE недоступен, пробуем встроенный плеер';
                return 'Прямой поток недоступен, пробуем резервный способ воспроизведения';
            }

            function onError(event) {
                if (!active || used || !event || !event.fatal) return;
                used = true;

                var fallbackData = {
                    url: data.capsule_fallback,
                    title: data.title,
                    card: data.card,
                    capsule_trailer: true,
                    capsule_source: data.capsule_fallback_source || 'fallback'
                };

                cleanup();
                Lampa.Noty.show(fallbackText());

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
        var pendingProviders = 0;
        var totalResults = 0;
        var failures = [];
        var cancels = [];
        var resolvingCancel = null;
        var resultSeen = {};

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

        function itemMeta(item) {
            var parts = [];
            var kind = item.kind || trailerKind(item.title);
            if (kind === 'teaser') parts.push('Тизер');
            else parts.push('Трейлер');
            var lang = languageLabel(item);
            if (lang) parts.push(lang);
            if (item.qualityHint) parts.push(item.qualityHint);
            if (item.duration) parts.push(secondsText(item.duration));
            return parts;
        }

        function makeItem(item, provider) {
            var meta = itemMeta(item);
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

        function appendResults(provider, items) {
            if (!alive || !items || !items.length) return;
            for (var i = 0; i < items.length; i++) {
                var item = items[i];
                var key = item.canonical || item.id || (provider.id + ':' + i + ':' + item.title);
                if (resultSeen[key]) continue;
                resultSeen[key] = true;
                var el = makeItem(item, provider);
                resultRoot.append(el);
                totalResults++;
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
            html.append(header());
            html.append(status);
            content.append(resultRoot);
            scroll.append(content);
            html.append(scroll.render());
            status.text('Ищем трейлеры…');
            this.activity.loader(true);
            runProviders();
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

    function setupSettings() {
        if (!Lampa.SettingsApi || typeof Lampa.SettingsApi.addComponent !== 'function' || typeof Lampa.SettingsApi.addParam !== 'function') return;

        Lampa.SettingsApi.addComponent({
            component: 'capsule_trailer_settings',
            name: 'CAPSULE Trailer',
            icon: ICON
        });

        Lampa.SettingsApi.addParam({
            component: 'capsule_trailer_settings',
            param: {
                name: 'capsule_trailer_youtube_backend',
                type: 'input',
                default: ''
            },
            field: {
                name: 'YouTube backend',
                description: 'Необязательно. Адрес собственного Invidious или Piped backend без конечного слеша. Публичные случайные proxy не используются.'
            },
            onChange: function () {
                backendDetected = '';
            }
        });

        Lampa.SettingsApi.addParam({            component: 'capsule_trailer_settings',
            param: {
                name: 'capsule_trailer_yandex',
                type: 'trigger',
                default: true
            },
            field: {
                name: 'Yandex Video',
                description: 'Экспериментальный источник русских трейлеров. При ошибке остальные источники продолжают работать.'
            }
        });

        Lampa.SettingsApi.addParam({
            component: 'capsule_trailer_settings',
            param: {
                name: 'capsule_trailer_ok',
                type: 'trigger',
                default: true
            },
            field: {
                name: 'OK.ru',
                description: 'Экспериментальный источник с большим русскоязычным каталогом. Используются только публичные ролики без авторизации.'
            }
        });

        Lampa.SettingsApi.addParam({
            component: 'capsule_trailer_settings',
            param: {
                name: 'capsule_trailer_rutube',
                type: 'trigger',
                default: true
            },
            field: {
                name: 'RUTUBE fallback',
                description: 'Резервный источник. Имеет низкий приоритет из-за рекламы и неполного покрытия.'
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

        var button = $('' +
            '<div class="full-start__button selector view--capsule-trailer" data-subtitle="CAPSULE Trailer · агрегатор">' +
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
        setupSettings();
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