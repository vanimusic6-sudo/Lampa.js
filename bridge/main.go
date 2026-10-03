package main

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"html"
	"io"
	"log"
	"net"
	"net/http"
	"net/http/cookiejar"
	"net/url"
	"os"
	"os/signal"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"
)

const (
	version = "1.0.0"
	addr = "127.0.0.1:19876"
	userAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36"
	mediaTTL = 2 * time.Hour
)

var qualityMap = map[string]int{
	"mobile":144, "lowest":240, "low":360, "sd":480, "hd":720,
	"full":1080, "fullhd":1080, "quad":1440, "ultra":2160,
}

var vkIDRe = regexp.MustCompile("^-?[0-9]+_[0-9]+$")

type stream struct {
	URL string
	Quality int
}

type mediaEntry struct {
	URL string
	Headers http.Header
	Provider string
	Created time.Time
}

type bridge struct {
	client *http.Client
	mediaClient *http.Client
	mediaMu sync.RWMutex
	media map[string]mediaEntry
	vkMu sync.Mutex
	vkToken string
	vkExpires int64
}

func main() {
	jar, _ := cookiejar.New(nil)
	tr := &http.Transport{
		Proxy: http.ProxyFromEnvironment,
		DialContext: (&net.Dialer{Timeout:8*time.Second, KeepAlive:30*time.Second}).DialContext,
		ForceAttemptHTTP2: true,
		MaxIdleConns: 32,
		MaxIdleConnsPerHost: 8,
		IdleConnTimeout: 60*time.Second,
		TLSHandshakeTimeout: 8*time.Second,
		ResponseHeaderTimeout: 12*time.Second,
	}
	b := &bridge{
		client: &http.Client{Transport:tr, Jar:jar, Timeout:18*time.Second},
		mediaClient: &http.Client{Transport:tr},
		media: map[string]mediaEntry{},
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/health", b.cors(b.health))
	mux.HandleFunc("/v1/search/ok", b.cors(b.searchOK))
	mux.HandleFunc("/v1/search/dzen", b.cors(b.searchDzen))
	mux.HandleFunc("/v1/search/dzen-html", b.cors(b.searchDzenHTML))
	mux.HandleFunc("/v1/search/vk", b.cors(b.searchVK))
	mux.HandleFunc("/v1/resolve", b.cors(b.resolve))
	mux.HandleFunc("/v1/media/", b.cors(b.mediaProxy))

	srv := &http.Server{
		Addr: addr,
		Handler: logRequests(mux),
		ReadHeaderTimeout: 5*time.Second,
		IdleTimeout: 60*time.Second,
	}

	go b.cleanup()
	go func() {
		log.Printf("CAPSULE Trailer Bridge %s: http://%s", version, addr)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Fatal(err)
		}
	}()

	ch := make(chan os.Signal, 1)
	signal.Notify(ch, os.Interrupt, syscall.SIGTERM)
	<-ch
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	_ = srv.Shutdown(ctx)
}

func logRequests(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/health" { log.Printf("%s %s", r.Method, r.URL.RequestURI()) }
		next.ServeHTTP(w, r)
	})
}

func (b *bridge) cors(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, HEAD, POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Range, If-Range")
		w.Header().Set("Access-Control-Allow-Private-Network", "true")
		w.Header().Set("Access-Control-Expose-Headers", "Content-Length, Content-Range, Accept-Ranges, Content-Type")
		w.Header().Set("Cache-Control", "no-store")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next(w, r)
	}
}

func (b *bridge) health(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok":true, "version":version})
}

func (b *bridge) searchOK(w http.ResponseWriter, r *http.Request) {
	q := strings.TrimSpace(r.URL.Query().Get("q"))
	if r.Method != http.MethodGet || q == "" {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}
	target := "https://ok.ru/video/search?st.cmd=anonymVideo&st.ft=search&st.gsq="+url.QueryEscape(q)+"&st.m=SEARCH"
	body, status, err := b.fetch(r.Context(), http.MethodGet, target, nil, map[string]string{
		"Accept":"text/html,application/xhtml+xml,*/*;q=0.8",
		"Referer":"https://ok.ru/",
	})
	if err != nil || status < 200 || status >= 300 {
		upstreamError(w, "ok-search", status, err)
		return
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	_, _ = w.Write(body)
}

func (b *bridge) searchDzen(w http.ResponseWriter, r *http.Request) {
	q := strings.TrimSpace(r.URL.Query().Get("q"))
	if r.Method != http.MethodGet || q == "" {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}
	target := "https://dzen.ru/api/web/v1/zen-search?country_code=ru&forced_request_type=long_video_search&query="+url.QueryEscape(q)+"&clid=1400&type_filter=video&lang=ru"
	body, status, err := b.fetch(r.Context(), http.MethodGet, target, nil, map[string]string{
		"Accept":"application/json,text/plain,*/*",
		"Referer":"https://dzen.ru/",
	})
	if err != nil || status < 200 || status >= 300 {
		upstreamError(w, "dzen-search", status, err)
		return
	}
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	_, _ = w.Write(body)
}

func (b *bridge) searchDzenHTML(w http.ResponseWriter, r *http.Request) {
	q := strings.TrimSpace(r.URL.Query().Get("q"))
	if r.Method != http.MethodGet || q == "" {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}
	target := "https://dzen.ru/search?query="+url.QueryEscape(q)+"&type_filter=video"
	body, status, err := b.fetch(r.Context(), http.MethodGet, target, nil, map[string]string{
		"Accept":"text/html,application/xhtml+xml,*/*;q=0.8",
		"Referer":"https://dzen.ru/",
	})
	if err != nil || status < 200 || status >= 300 {
		upstreamError(w, "dzen-search-html", status, err)
		return
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	_, _ = w.Write(body)
}

func (b *bridge) searchVK(w http.ResponseWriter, r *http.Request) {
	q := strings.TrimSpace(r.URL.Query().Get("q"))
	if r.Method != http.MethodGet || q == "" {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}

	token, err := b.vkAnonymousToken(r.Context(), false)
	if err != nil {
		upstreamError(w, "vk-token", 0, err)
		return
	}
	body, status, err := b.vkSearch(r.Context(), q, token)
	if err == nil && vkErrorCode(body) == 5 {
		token, err = b.vkAnonymousToken(r.Context(), true)
		if err == nil { body, status, err = b.vkSearch(r.Context(), q, token) }
	}
	if err != nil || status < 200 || status >= 300 {
		upstreamError(w, "vk-search", status, err)
		return
	}
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	_, _ = w.Write(body)
}

func (b *bridge) vkSearch(ctx context.Context, q, token string) ([]byte, int, error) {
	target := "https://api.vkvideo.ru/method/catalog.getVideoSearchWeb2?v=5.282&client_id=52461373&count=30&q="+url.QueryEscape(q)+"&content_type=video&access_token="+url.QueryEscape(token)
	return b.fetch(ctx, http.MethodGet, target, nil, map[string]string{
		"Accept":"application/json,text/plain,*/*",
		"Referer":"https://vkvideo.ru/",
		"Origin":"https://vkvideo.ru",
	})
}

func (b *bridge) resolve(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	defer r.Body.Close()
	var req map[string]any
	if json.NewDecoder(io.LimitReader(r.Body, 64<<10)).Decode(&req) != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error":"bad-json"})
		return
	}
	provider := strings.ToLower(strings.TrimSpace(anyString(req["provider"])))
	id := strings.TrimSpace(anyString(req["id"]))
	quality := anyInt(req["quality"])
	if quality < 0 || quality > 4320 { quality = 0 }

	var st stream
	var headers http.Header
	var err error
	switch provider {
	case "ok":
		st, headers, err = b.resolveOK(r.Context(), id, quality)
	case "vk":
		st, headers, err = b.resolveVK(r.Context(), id, quality)
	case "dzen":
		st, headers, err = b.resolveDzen(r.Context(), id, quality)
	default:
		writeJSON(w, http.StatusBadRequest, map[string]any{"error":"unknown-provider"})
		return
	}
	if err != nil || st.URL == "" {
		if err == nil { err = errors.New("no stream") }
		upstreamError(w, "resolve-"+provider, 0, err)
		return
	}

	token, err := randomToken()
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error":"token"})
		return
	}
	b.mediaMu.Lock()
	b.media[token] = mediaEntry{URL:st.URL, Headers:headers.Clone(), Provider:provider, Created:time.Now()}
	b.mediaMu.Unlock()

	writeJSON(w, http.StatusOK, map[string]any{
		"url":"http://"+addr+"/v1/media/"+token,
		"quality":st.Quality,
		"provider":provider,
	})
}

func (b *bridge) mediaProxy(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	token := strings.TrimPrefix(r.URL.Path, "/v1/media/")
	if token == "" || strings.Contains(token, "/") {
		http.NotFound(w, r)
		return
	}
	b.mediaMu.RLock()
	entry, ok := b.media[token]
	b.mediaMu.RUnlock()
	if !ok || time.Since(entry.Created) > mediaTTL {
		http.Error(w, "media token expired", http.StatusGone)
		return
	}

	req, err := http.NewRequestWithContext(r.Context(), r.Method, entry.URL, nil)
	if err != nil {
		http.Error(w, "bad upstream", http.StatusBadGateway)
		return
	}
	for k, values := range entry.Headers {
		for _, v := range values { req.Header.Add(k, v) }
	}
	req.Header.Set("Accept-Encoding", "identity")
	if v := r.Header.Get("Range"); v != "" { req.Header.Set("Range", v) }
	if v := r.Header.Get("If-Range"); v != "" { req.Header.Set("If-Range", v) }

	client := *b.mediaClient
	client.CheckRedirect = func(redir *http.Request, via []*http.Request) error {
		if len(via) >= 8 { return errors.New("too many redirects") }
		for k := range redir.Header { redir.Header.Del(k) }
		for k, values := range entry.Headers {
			for _, v := range values { redir.Header.Add(k, v) }
		}
		redir.Header.Set("Accept-Encoding", "identity")
		if v := req.Header.Get("Range"); v != "" { redir.Header.Set("Range", v) }
		return nil
	}

	resp, err := client.Do(req)
	if err != nil {
		http.Error(w, "upstream media error", http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()
	for _, k := range []string{"Content-Type","Content-Length","Content-Range","Accept-Ranges","ETag","Last-Modified","Cache-Control"} {
		if v := resp.Header.Get(k); v != "" { w.Header().Set(k, v) }
	}
	if w.Header().Get("Accept-Ranges") == "" { w.Header().Set("Accept-Ranges", "bytes") }
	w.WriteHeader(resp.StatusCode)
	if r.Method != http.MethodHead { _, _ = io.Copy(w, resp.Body) }
}

func (b *bridge) resolveOK(ctx context.Context, id string, preferred int) (stream, http.Header, error) {
	if id == "" || !regexp.MustCompile("^-?[0-9]+$").MatchString(id) {
		return stream{}, nil, errors.New("invalid OK id")
	}
	form := url.Values{"mid":{id}}
	body, status, err := b.fetch(ctx, http.MethodPost, "https://www.ok.ru/dk?cmd=videoPlayerMetadata", strings.NewReader(form.Encode()), map[string]string{
		"Accept":"application/json,text/plain,*/*",
		"Content-Type":"application/x-www-form-urlencoded; charset=UTF-8",
		"Origin":"https://ok.ru",
		"Referer":"https://ok.ru/",
	})
	if err == nil && status >= 200 && status < 300 {
		if st, e := parseOKMetadata(body, preferred); e == nil {
			return st, mediaHeaders("https://ok.ru/", "https://ok.ru"), nil
		}
	}

	embed := "https://ok.ru/videoembed/"+url.PathEscape(id)
	page, status, err := b.fetch(ctx, http.MethodGet, embed, nil, map[string]string{"Referer":"https://ok.ru/"})
	if err != nil || status < 200 || status >= 300 {
		return stream{}, nil, fmt.Errorf("OK embed unavailable")
	}
	player, err := parseOKPlayer(page, id)
	if err != nil { return stream{}, nil, err }
	flash, _ := player["flashvars"].(map[string]any)
	if flash == nil { return stream{}, nil, errors.New("OK flashvars missing") }

	if raw, ok := flash["metadata"].(string); ok && raw != "" {
		if st, e := parseOKMetadata([]byte(raw), preferred); e == nil {
			return st, mediaHeaders("https://ok.ru/", "https://ok.ru"), nil
		}
	}
	if obj, ok := flash["metadata"].(map[string]any); ok {
		raw, _ := json.Marshal(obj)
		if st, e := parseOKMetadata(raw, preferred); e == nil {
			return st, mediaHeaders("https://ok.ru/", "https://ok.ru"), nil
		}
	}

	metaURL := anyString(flash["metadataUrl"])
	if metaURL == "" { return stream{}, nil, errors.New("OK metadata URL missing") }
	if decoded, e := url.QueryUnescape(metaURL); e == nil { metaURL = decoded }
	if strings.HasPrefix(metaURL, "//") { metaURL = "https:"+metaURL }
	if strings.HasPrefix(metaURL, "/") { metaURL = "https://ok.ru"+metaURL }
	metaForm := url.Values{"st.location":{anyString(flash["location"])}}
	meta, status, err := b.fetch(ctx, http.MethodPost, metaURL, strings.NewReader(metaForm.Encode()), map[string]string{
		"Accept":"application/json,text/plain,*/*",
		"Content-Type":"application/x-www-form-urlencoded; charset=UTF-8",
		"Origin":"https://ok.ru",
		"Referer":embed,
	})
	if err != nil || status < 200 || status >= 300 { return stream{}, nil, errors.New("OK metadata request failed") }
	st, err := parseOKMetadata(meta, preferred)
	return st, mediaHeaders("https://ok.ru/", "https://ok.ru"), err
}

func parseOKMetadata(body []byte, preferred int) (stream, error) {
	var root map[string]any
	if err := json.Unmarshal(body, &root); err != nil { return stream{}, err }
	rows, _ := root["videos"].([]any)
	var list []stream
	for _, item := range rows {
		row, _ := item.(map[string]any); if row == nil { continue }
		u := anyString(row["url"]); if !httpURL(u) { continue }
		q := qualityMap[strings.ToLower(anyString(row["name"]))]
		if q == 0 {
			if parsed, e := url.Parse(u); e == nil { q = okTypeQuality(parsed.Query().Get("type")) }
		}
		list = append(list, stream{URL:u, Quality:q})
	}
	if len(list) == 0 { return stream{}, errors.New("OK returned no direct MP4 streams") }
	return choose(list, preferred), nil
}

func parseOKPlayer(page []byte, id string) (map[string]any, error) {
	text := string(page)
	pos := 0
	for {
		i := strings.Index(text[pos:], "data-options=")
		if i < 0 { break }
		i += pos + len("data-options=")
		if i >= len(text) { break }
		quote := text[i]
		if quote != '\'' && quote != '"' { pos=i+1; continue }
		end := strings.IndexByte(text[i+1:], quote)
		if end < 0 { break }
		raw := html.UnescapeString(text[i+1:i+1+end])
		if strings.Contains(raw, id) {
			var obj map[string]any
			if json.Unmarshal([]byte(raw), &obj) == nil { return obj, nil }
		}
		pos = i+1+end+1
	}
	return nil, errors.New("OK data-options missing")
}

func (b *bridge) resolveVK(ctx context.Context, id string, preferred int) (stream, http.Header, error) {
	if !vkIDRe.MatchString(id) { return stream{}, nil, errors.New("invalid VK id") }
	token, err := b.vkAnonymousToken(ctx, false)
	if err == nil {
		st, code, e := b.vkByID(ctx, id, preferred, token)
		if code == 5 {
			token, err = b.vkAnonymousToken(ctx, true)
			if err == nil { st, _, e = b.vkByID(ctx, id, preferred, token) }
		}
		if e == nil { return st, mediaHeaders("https://vk.com/", "https://vk.com"), nil }
	}

	form := url.Values{"act":{"show"}, "al":{"1"}, "video":{id}}
	body, status, err := b.fetch(ctx, http.MethodPost, "https://vk.com/al_video.php?act=show", strings.NewReader(form.Encode()), map[string]string{
		"Accept":"application/json,text/plain,*/*",
		"Content-Type":"application/x-www-form-urlencoded; charset=UTF-8",
		"Origin":"https://vk.com",
		"Referer":"https://vk.com/",
		"X-Requested-With":"XMLHttpRequest",
	})
	if err != nil || status < 200 || status >= 300 { return stream{}, nil, errors.New("VK al_video failed") }
	st, err := parseVKPayload(body, preferred)
	return st, mediaHeaders("https://vk.com/", "https://vk.com"), err
}

func (b *bridge) vkByID(ctx context.Context, id string, preferred int, token string) (stream, int, error) {
	form := url.Values{"access_token":{token}, "videos":{id}, "video_fields":{"files"}}
	body, status, err := b.fetch(ctx, http.MethodPost, "https://api.vk.com/method/video.getByIds?v=5.282&client_id=52461373", strings.NewReader(form.Encode()), map[string]string{
		"Accept":"application/json,text/plain,*/*",
		"Content-Type":"application/x-www-form-urlencoded; charset=UTF-8",
		"Origin":"https://vkvideo.ru",
		"Referer":"https://vkvideo.ru/",
	})
	if err != nil || status < 200 || status >= 300 { return stream{}, 0, errors.New("VK video.getByIds failed") }
	if code := vkErrorCode(body); code != 0 { return stream{}, code, fmt.Errorf("VK api error %d", code) }
	st, err := parseVKAPI(body, preferred)
	return st, 0, err
}

func parseVKAPI(body []byte, preferred int) (stream, error) {
	var root map[string]any
	if err := json.Unmarshal(body, &root); err != nil { return stream{}, err }
	response, _ := root["response"].(map[string]any)
	items, _ := response["items"].([]any)
	if len(items) == 0 { return stream{}, errors.New("VK API returned no items") }
	item, _ := items[0].(map[string]any)
	files, _ := item["files"].(map[string]any)
	return chooseVK(files, preferred)
}

func parseVKPayload(body []byte, preferred int) (stream, error) {
	text := strings.TrimSpace(strings.TrimPrefix(string(body), "<!--"))
	var root any
	if json.Unmarshal([]byte(text), &root) != nil { return stream{}, errors.New("VK payload JSON invalid") }
	var found []map[string]any
	walkMaps(root, func(m map[string]any) {
		if files, ok := m["files"].(map[string]any); ok { found = append(found, files) }
		if params, ok := m["params"].([]any); ok && len(params) > 0 {
			if p, ok := params[0].(map[string]any); ok { found = append(found, p) }
		}
	})
	for _, files := range found {
		if st, err := chooseVK(files, preferred); err == nil { return st, nil }
	}
	return stream{}, errors.New("VK payload contains no direct MP4")
}

func chooseVK(files map[string]any, preferred int) (stream, error) {
	var list []stream
	re := regexp.MustCompile("^(?:mp4_|url|cache)([0-9]{3,4})$")
	for key, raw := range files {
		u, ok := raw.(string); if !ok || !httpURL(u) { continue }
		m := re.FindStringSubmatch(key)
		if len(m) == 2 {
			q, _ := strconv.Atoi(m[1])
			list = append(list, stream{URL:strings.ReplaceAll(u, "^", ""), Quality:q})
		} else if key == "extra_data" || key == "live_mp4" || key == "postlive_mp4" {
			list = append(list, stream{URL:strings.ReplaceAll(u, "^", ""), Quality:0})
		}
	}
	if len(list) == 0 { return stream{}, errors.New("VK returned no direct MP4 streams") }
	return choose(list, preferred), nil
}

func (b *bridge) resolveDzen(ctx context.Context, id string, preferred int) (stream, http.Header, error) {
	if id == "" || !regexp.MustCompile("^[0-9a-z_-]+$").MatchString(id) {
		return stream{}, nil, errors.New("invalid Dzen id")
	}
	watch := "https://dzen.ru/video/watch/"+url.PathEscape(id)
	page, status, err := b.fetch(ctx, http.MethodGet, watch, nil, map[string]string{"Referer":"https://dzen.ru/"})
	if err != nil || status < 200 || status >= 300 { return stream{}, nil, errors.New("Dzen watch failed") }

	root, err := extractDzenParams(string(page))
	if err != nil {
		if ret := extractDzenRedirect(string(page)); ret != "" {
			if strings.HasPrefix(ret, "/") { ret="https://dzen.ru"+ret }
			page, status, err = b.fetch(ctx, http.MethodGet, ret, nil, map[string]string{"Referer":watch})
			if err == nil && status >= 200 && status < 300 { root, err = extractDzenParams(string(page)) }
		}
	}
	if err != nil { return stream{}, nil, err }
	ssr, _ := root["ssrData"].(map[string]any)
	meta, _ := ssr["videoMetaResponse"].(map[string]any)
	video, _ := meta["video"].(map[string]any)
	if video == nil { return stream{}, nil, errors.New("Dzen videoMetaResponse.video missing") }

	var list []stream
	add := func(u string, q int) {
		if !httpURL(u) { return }
		parsed, e := url.Parse(u); if e != nil { return }
		ct := parsed.Query().Get("ct")
		ext := strings.ToLower(pathExt(parsed.Path))
		if ct != "0" && ext != ".mp4" && ext != ".m4v" { return }
		values := parsed.Query(); values.Del("dzen_dash"); parsed.RawQuery=values.Encode()
		if q == 0 { q=okTypeQuality(parsed.Query().Get("type")) }
		list=append(list, stream{URL:parsed.String(), Quality:q})
	}
	if u, ok := video["id"].(string); ok { add(u,0) }
	if rows, ok := video["streams"].([]any); ok {
		for _, row := range rows { if u, ok := row.(string); ok { add(u,0) } }
	}
	for _, key := range []string{"mp4Streams","oneVideoStreams"} {
		if rows, ok := video[key].([]any); ok {
			for _, raw := range rows {
				row, _ := raw.(map[string]any); if row == nil { continue }
				q := anyInt(row["height"])
				if q == 0 { q=qualityMap[strings.ToLower(anyString(row["type"]))] }
				add(anyString(row["url"]), q)
			}
		}
	}
	list=dedupe(list)
	if len(list)==0 { return stream{}, nil, errors.New("Dzen returned no direct MP4 streams") }
	return choose(list, preferred), mediaHeaders("https://dzen.ru/", "https://dzen.ru"), nil
}

func extractDzenParams(text string) (map[string]any, error) {
	start := -1
	for _, marker := range []string{"var _params","let _params","const _params"} {
		if i:=strings.Index(text,marker); i>=0 && (start<0 || i<start) { start=i }
	}
	if start<0 { return nil, errors.New("Dzen _params missing") }
	brace:=strings.Index(text[start:],"{"); if brace<0 { return nil, errors.New("Dzen object missing") }
	raw, ok:=balancedObject(text,start+brace); if !ok { return nil, errors.New("Dzen object malformed") }
	var root map[string]any
	if json.Unmarshal([]byte(raw),&root)!=nil { return nil, errors.New("Dzen params JSON invalid") }
	return root,nil
}

func extractDzenRedirect(text string) string {
	for _, marker := range []string{"var it","let it","const it"} {
		start:=strings.Index(text,marker); if start<0 { continue }
		brace:=strings.Index(text[start:],"{"); if brace<0 { continue }
		raw,ok:=balancedObject(text,start+brace); if !ok { continue }
		var obj map[string]any
		if json.Unmarshal([]byte(raw),&obj)==nil { if ret,ok:=obj["retpath"].(string); ok { return ret } }
	}
	return ""
}

func balancedObject(text string, start int) (string,bool) {
	depth:=0; inString:=false; escaped:=false
	for i:=start;i<len(text);i++ {
		c:=text[i]
		if inString {
			if escaped { escaped=false } else if c=='\\' { escaped=true } else if c=='"' { inString=false }
			continue
		}
		if c=='"' { inString=true; continue }
		if c=='{' { depth++ } else if c=='}' { depth--; if depth==0 { return text[start:i+1],true } }
	}
	return "",false
}

func (b *bridge) vkAnonymousToken(ctx context.Context, force bool) (string,error) {
	now:=time.Now().Unix()
	b.vkMu.Lock()
	defer b.vkMu.Unlock()
	if !force && b.vkToken!="" && now+60<b.vkExpires { return b.vkToken,nil }

	form:=url.Values{"client_id":{"52461373"}}
	body,status,err:=b.fetch(ctx,http.MethodPost,"https://login.vk.com/?act=get_anonym_token",strings.NewReader(form.Encode()),map[string]string{
		"Accept":"application/json,text/plain,*/*",
		"Content-Type":"application/x-www-form-urlencoded; charset=UTF-8",
		"Origin":"https://vkvideo.ru",
		"Referer":"https://vkvideo.ru/",
	})
	if err!=nil { return "",err }
	if status<200 || status>=300 { return "",fmt.Errorf("VK token status %d",status) }
	var root map[string]any
	if json.Unmarshal(body,&root)!=nil { return "",errors.New("VK token JSON invalid") }
	if anyString(root["type"])!="okay" { return "",errors.New("VK token rejected") }
	data,_:=root["data"].(map[string]any)
	token:=anyString(data["access_token"]); if token=="" { return "",errors.New("VK token missing") }
	b.vkToken=token
	b.vkExpires=int64(anyInt(data["expired_at"])); if b.vkExpires==0 { b.vkExpires=now+600 }
	return token,nil
}

func vkErrorCode(body []byte) int {
	var root map[string]any
	if json.Unmarshal(body,&root)!=nil { return 0 }
	errObj,_:=root["error"].(map[string]any)
	return anyInt(errObj["error_code"])
}

func (b *bridge) fetch(ctx context.Context, method,target string, body io.Reader, headers map[string]string) ([]byte,int,error) {
	req,err:=http.NewRequestWithContext(ctx,method,target,body); if err!=nil { return nil,0,err }
	req.Header.Set("User-Agent",userAgent)
	for k,v:=range headers { req.Header.Set(k,v) }
	resp,err:=b.client.Do(req); if err!=nil { return nil,0,err }
	defer resp.Body.Close()
	data,err:=io.ReadAll(io.LimitReader(resp.Body,16<<20))
	return data,resp.StatusCode,err
}

func mediaHeaders(referer,origin string) http.Header {
	h:=make(http.Header)
	h.Set("User-Agent",userAgent)
	if referer!="" { h.Set("Referer",referer) }
	if origin!="" { h.Set("Origin",origin) }
	return h
}

func choose(list []stream, preferred int) stream {
	sort.SliceStable(list,func(i,j int)bool{
		a,b:=list[i].Quality,list[j].Quality
		if preferred<=0 { return a>b }
		ad,bd:=abs(a-preferred),abs(b-preferred)
		if a==0 { ad=1<<30 }; if b==0 { bd=1<<30 }
		if ad!=bd { return ad<bd }
		ab,bb:=a>0&&a<=preferred,b>0&&b<=preferred
		if ab!=bb { return ab }
		return a>b
	})
	return list[0]
}

func dedupe(in []stream) []stream {
	seen:=map[string]bool{}; out:=make([]stream,0,len(in))
	for _,st:=range in { if st.URL!=""&&!seen[st.URL] { seen[st.URL]=true; out=append(out,st) } }
	return out
}

func walkMaps(v any, fn func(map[string]any)) {
	switch x:=v.(type) {
	case map[string]any:
		fn(x); for _,child:=range x { walkMaps(child,fn) }
	case []any:
		for _,child:=range x { walkMaps(child,fn) }
	}
}

func randomToken() (string,error) {
	buf:=make([]byte,24); if _,err:=rand.Read(buf); err!=nil { return "",err }
	return base64.RawURLEncoding.EncodeToString(buf),nil
}

func writeJSON(w http.ResponseWriter,status int,value any) {
	w.Header().Set("Content-Type","application/json; charset=utf-8")
	w.WriteHeader(status); _=json.NewEncoder(w).Encode(value)
}

func upstreamError(w http.ResponseWriter,name string,status int,err error) {
	detail:="upstream request failed"; if err!=nil { detail=err.Error() }
	log.Printf("%s: status=%d err=%v",name,status,err)
	writeJSON(w,http.StatusBadGateway,map[string]any{"error":name,"status":status,"detail":detail})
}

func okTypeQuality(t string) int {
	switch t { case "4":return 144; case "0":return 240; case "1":return 360; case "2":return 480; case "3":return 720; case "5":return 1080; case "6":return 1440; case "7":return 2160 }
	return 0
}

func anyString(v any) string { if s,ok:=v.(string); ok { return s }; return "" }

func anyInt(v any) int {
	switch x:=v.(type) {
	case float64: return int(x)
	case int: return x
	case json.Number: n,_:=strconv.Atoi(x.String()); return n
	case string: n,_:=strconv.Atoi(x); return n
	}
	return 0
}

func httpURL(raw string) bool { return strings.HasPrefix(raw,"https://")||strings.HasPrefix(raw,"http://") }

func pathExt(path string) string {
	dot:=strings.LastIndex(path,"."); slash:=strings.LastIndex(path,"/")
	if dot<=slash { return "" }; return path[dot:]
}

func abs(v int) int { if v<0 { return -v }; return v }

func (b *bridge) cleanup() {
	t:=time.NewTicker(10*time.Minute); defer t.Stop()
	for range t.C {
		cutoff:=time.Now().Add(-mediaTTL)
		b.mediaMu.Lock()
		for k,v:=range b.media { if v.Created.Before(cutoff) { delete(b.media,k) } }
		b.mediaMu.Unlock()
	}
}
