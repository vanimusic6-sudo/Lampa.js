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
	bridgeVersion = "1.0.0"
	defaultAddr   = "127.0.0.1:19876"
	userAgent     = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36"
	mediaTTL      = 2 * time.Hour
)

var qualityOrder = map[string]int{
	"mobile": 144, "lowest": 240, "low": 360, "sd": 480,
	"hd": 720, "full": 1080, "fullhd": 1080, "quad": 1440, "ultra": 2160,
}

var okTypeHeight = map[string]int{"4": 144, "0": 240, "1": 360, "2": 480, "3": 720, "5": 1080, "6": 1440, "7": 2160}

var (
	reMP4Key      = regexp.MustCompile(`^(?:mp4_|url|cache)(\d{3,4})$`)
	reVKVideoID   = regexp.MustCompile(`^-?\d+_\d+$`)
	reOKDataProps = regexp.MustCompile(`(?is)<video-search-result\b[^>]*\bdata-props=(?:"([^"]+)"|'([^']+)')`)
)

type bridge struct {
	client      *http.Client
	mediaClient *http.Client

	mediaMu sync.RWMutex
	media   map[string]mediaEntry

	vkMu      sync.Mutex
	vkToken   string
	vkExpires int64
}

type mediaEntry struct {
	URL       string
	Headers   http.Header
	Provider  string
	CreatedAt time.Time
}

type resolveRequest struct {
	Provider string `json:"provider"`
	ID       string `json:"id"`
	Embed    string `json:"embed,omitempty"`
	Quality  int    `json:"quality,omitempty"`
}

type resolveResponse struct {
	URL      string `json:"url"`
	Quality  int    `json:"quality,omitempty"`
	Provider string `json:"provider"`
}

type stream struct {
	URL     string
	Quality int
}

func main() {
	jar, _ := cookiejar.New(nil)
	transport := &http.Transport{
		Proxy:                 http.ProxyFromEnvironment,
		DialContext:           (&net.Dialer{Timeout: 8 * time.Second, KeepAlive: 30 * time.Second}).DialContext,
		ForceAttemptHTTP2:     true,
		MaxIdleConns:          32,
		MaxIdleConnsPerHost:   8,
		IdleConnTimeout:       60 * time.Second,
		TLSHandshakeTimeout:   8 * time.Second,
		ResponseHeaderTimeout: 12 * time.Second,
	}

	b := &bridge{
		client:      &http.Client{Transport: transport, Jar: jar, Timeout: 18 * time.Second},
		mediaClient: &http.Client{Transport: transport, Timeout: 0},
		media:       make(map[string]mediaEntry),
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/health", b.withCORS(b.health))
	mux.HandleFunc("/v1/search/ok", b.withCORS(b.searchOK))
	mux.HandleFunc("/v1/search/dzen", b.withCORS(b.searchDzen))
	mux.HandleFunc("/v1/search/dzen-html", b.withCORS(b.searchDzenHTML))
	mux.HandleFunc("/v1/search/vk", b.withCORS(b.searchVK))
	mux.HandleFunc("/v1/resolve", b.withCORS(b.resolve))
	mux.HandleFunc("/v1/media/", b.withCORS(b.mediaProxy))

	srv := &http.Server{
		Addr:              defaultAddr,
		Handler:           logRequests(mux),
		ReadHeaderTimeout: 5 * time.Second,
		IdleTimeout:       60 * time.Second,
	}

	go b.cleanupLoop()

	go func() {
		log.Printf("CAPSULE Trailer Bridge %s listening on http://%s", bridgeVersion, defaultAddr)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Fatalf("listen: %v", err)
		}
	}()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt, syscall.SIGTERM)
	<-stop

	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	_ = srv.Shutdown(ctx)
}

func logRequests(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/health" {
			log.Printf("%s %s", r.Method, r.URL.RequestURI())
		}
		next.ServeHTTP(w, r)
	})
}

func (b *bridge) withCORS(next http.HandlerFunc) http.HandlerFunc {
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
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "version": bridgeVersion})
}

func (b *bridge) searchOK(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	q := strings.TrimSpace(r.URL.Query().Get("q"))
	if q == "" {
		http.Error(w, "missing q", http.StatusBadRequest)
		return
	}

	target := "https://ok.ru/video/search?st.cmd=anonymVideo&st.ft=search&st.gsq=" + url.QueryEscape(q) + "&st.m=SEARCH"
	body, status, err := b.fetchRaw(r.Context(), http.MethodGet, target, nil, map[string]string{
		"Accept":  "text/html,application/xhtml+xml,*/*;q=0.8",
		"Referer": "https://ok.ru/",
	})
	if err != nil {
		writeUpstreamError(w, "ok-search", err)
		return
	}
	if status < 200 || status >= 300 {
		writeJSON(w, http.StatusBadGateway, map[string]any{"error": "ok-search-status", "status": status})
		return
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	_, _ = w.Write(body)
}

func (b *bridge) searchDzen(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	q := strings.TrimSpace(r.URL.Query().Get("q"))
	if q == "" {
		http.Error(w, "missing q", http.StatusBadRequest)
		return
	}

	target := "https://dzen.ru/api/web/v1/zen-search?country_code=ru&forced_request_type=long_video_search&query=" + url.QueryEscape(q) + "&clid=1400&type_filter=video&lang=ru"
	body, status, err := b.fetchRaw(r.Context(), http.MethodGet, target, nil, map[string]string{
		"Accept":  "application/json,text/plain,*/*",
		"Referer": "https://dzen.ru/",
	})
	if err != nil {
		writeUpstreamError(w, "dzen-search", err)
		return
	}
	if status < 200 || status >= 300 {
		writeJSON(w, http.StatusBadGateway, map[string]any{"error": "dzen-search-status", "status": status})
		return
	}
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	_, _ = w.Write(body)
}

func (b *bridge) searchDzenHTML(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	q := strings.TrimSpace(r.URL.Query().Get("q"))
	if q == "" {
		http.Error(w, "missing q", http.StatusBadRequest)
		return
	}

	target := "https://dzen.ru/search?query=" + url.QueryEscape(q) + "&type_filter=video"
	body, status, err := b.fetchRaw(r.Context(), http.MethodGet, target, nil, map[string]string{
		"Accept":  "text/html,application/xhtml+xml,*/*;q=0.8",
		"Referer": "https://dzen.ru/",
	})
	if err != nil {
		writeUpstreamError(w, "dzen-search-html", err)
		return
	}
	if status < 200 || status >= 300 {
		writeJSON(w, http.StatusBadGateway, map[string]any{"error": "dzen-search-html-status", "status": status})
		return
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	_, _ = w.Write(body)
}

func (b *bridge) searchVK(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	q := strings.TrimSpace(r.URL.Query().Get("q"))
	if q == "" {
		http.Error(w, "missing q", http.StatusBadRequest)
		return
	}

	token, err := b.vkAnonymousToken(r.Context())
	if err != nil {
		writeUpstreamError(w, "vk-token", err)
		return
	}

	endpoint := "https://api.vkvideo.ru/method/catalog.getVideoSearchWeb2?v=5.282&client_id=52461373&count=30&q=" + url.QueryEscape(q) + "&content_type=video&access_token=" + url.QueryEscape(token)
	body, status, err := b.fetchRaw(r.Context(), http.MethodGet, endpoint, nil, map[string]string{
		"Accept":  "application/json,text/plain,*/*",
		"Referer": "https://vkvideo.ru/",
		"Origin":  "https://vkvideo.ru",
	})
	if err == nil && vkErrorCode(body) == 5 {
		b.vkMu.Lock()
		b.vkToken, b.vkExpires = "", 0
		b.vkMu.Unlock()
		if refreshed, tokenErr := b.vkAnonymousToken(r.Context()); tokenErr == nil {
			endpoint = "https://api.vkvideo.ru/method/catalog.getVideoSearchWeb2?v=5.282&client_id=52461373&count=30&q=" + url.QueryEscape(q) + "&content_type=video&access_token=" + url.QueryEscape(refreshed)
			body, status, err = b.fetchRaw(r.Context(), http.MethodGet, endpoint, nil, map[string]string{
				"Accept": "application/json,text/plain,*/*", "Referer": "https://vkvideo.ru/", "Origin": "https://vkvideo.ru",
			})
		}
	}
	if err != nil {
		writeUpstreamError(w, "vk-search", err)
		return
	}
	if status < 200 || status >= 300 {
		writeJSON(w, http.StatusBadGateway, map[string]any{"error": "vk-search-status", "status": status})
		return
	}
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	_, _ = w.Write(body)
}

func (b *bridge) resolve(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	defer r.Body.Close()
	var req resolveRequest
	if err := json.NewDecoder(io.LimitReader(r.Body, 64<<10)).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "bad-json"})
		return
	}
	req.Provider = strings.ToLower(strings.TrimSpace(req.Provider))
	req.ID = strings.TrimSpace(req.ID)
	if req.Quality < 0 || req.Quality > 4320 {
		req.Quality = 0
	}

	var st stream
	var headers http.Header
	var err error

	switch req.Provider {
	case "ok":
		st, headers, err = b.resolveOK(r.Context(), req.ID, req.Quality)
	case "vk":
		st, headers, err = b.resolveVK(r.Context(), req.ID, req.Quality)
	case "dzen":
		st, headers, err = b.resolveDzen(r.Context(), req.ID, req.Quality)
	default:
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "unknown-provider"})
		return
	}
	if err != nil {
		log.Printf("resolve %s %s: %v", req.Provider, req.ID, err)
		writeJSON(w, http.StatusBadGateway, map[string]any{"error": "resolve-failed", "provider": req.Provider, "detail": err.Error()})
		return
	}

	token, err := randomToken()
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": "token"})
		return
	}
	b.mediaMu.Lock()
	b.media[token] = mediaEntry{URL: st.URL, Headers: headers.Clone(), Provider: req.Provider, CreatedAt: time.Now()}
	b.mediaMu.Unlock()

	mediaURL := "http://" + defaultAddr + "/v1/media/" + token
	writeJSON(w, http.StatusOK, resolveResponse{URL: mediaURL, Quality: st.Quality, Provider: req.Provider})
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
	if !ok || time.Since(entry.CreatedAt) > mediaTTL {
		http.Error(w, "media token expired", http.StatusGone)
		return
	}

	req, err := http.NewRequestWithContext(r.Context(), r.Method, entry.URL, nil)
	if err != nil {
		http.Error(w, "bad upstream", http.StatusBadGateway)
		return
	}
	for key, values := range entry.Headers {
		for _, value := range values {
			req.Header.Add(key, value)
		}
	}
	req.Header.Set("Accept-Encoding", "identity")
	if v := r.Header.Get("Range"); v != "" {
		req.Header.Set("Range", v)
	}
	if v := r.Header.Get("If-Range"); v != "" {
		req.Header.Set("If-Range", v)
	}

	client := *b.mediaClient
	client.CheckRedirect = func(redir *http.Request, via []*http.Request) error {
		if len(via) >= 8 {
			return errors.New("too many redirects")
		}
		for key, values := range entry.Headers {
			redir.Header.Del(key)
			for _, value := range values {
				redir.Header.Add(key, value)
			}
		}
		redir.Header.Set("Accept-Encoding", "identity")
		if v := req.Header.Get("Range"); v != "" {
			redir.Header.Set("Range", v)
		}
		return nil
	}

	resp, err := client.Do(req)
	if err != nil {
		log.Printf("media %s: %v", entry.Provider, err)
		http.Error(w, "upstream media error", http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()

	for _, key := range []string{"Content-Type", "Content-Length", "Content-Range", "Accept-Ranges", "ETag", "Last-Modified", "Cache-Control"} {
		if value := resp.Header.Get(key); value != "" {
			w.Header().Set(key, value)
		}
	}
	if w.Header().Get("Accept-Ranges") == "" {
		w.Header().Set("Accept-Ranges", "bytes")
	}
	w.WriteHeader(resp.StatusCode)
	if r.Method == http.MethodHead {
		return
	}
	_, _ = io.Copy(w, resp.Body)
}

func (b *bridge) resolveOK(ctx context.Context, id string, preferred int) (stream, http.Header, error) {
	if id == "" || !regexp.MustCompile(`^-?\d+$`).MatchString(id) {
		return stream{}, nil, errors.New("invalid OK id")
	}

	form := url.Values{"mid": {id}}
	body, status, err := b.fetchRaw(ctx, http.MethodPost, "https://www.ok.ru/dk?cmd=videoPlayerMetadata", strings.NewReader(form.Encode()), map[string]string{
		"Accept":       "application/json,text/plain,*/*",
		"Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
		"Origin":       "https://ok.ru",
		"Referer":      "https://ok.ru/",
	})
	if err == nil && status >= 200 && status < 300 {
		if st, parseErr := parseOKMetadata(body, preferred); parseErr == nil {
			return st, mediaHeaders("https://ok.ru/", "https://ok.ru"), nil
		}
	}

	embed := "https://ok.ru/videoembed/" + url.PathEscape(id)
	page, status, pageErr := b.fetchRaw(ctx, http.MethodGet, embed, nil, map[string]string{
		"Accept":  "text/html,application/xhtml+xml,*/*;q=0.8",
		"Referer": "https://ok.ru/",
	})
	if pageErr != nil || status < 200 || status >= 300 {
		if pageErr != nil {
			return stream{}, nil, pageErr
		}
		return stream{}, nil, fmt.Errorf("OK embed status %d", status)
	}

	player, err := parseOKPlayer(page, id)
	if err != nil {
		return stream{}, nil, err
	}
	flashvars, _ := player["flashvars"].(map[string]any)
	if flashvars == nil {
		return stream{}, nil, errors.New("OK flashvars missing")
	}

	if metadata, ok := flashvars["metadata"].(string); ok && metadata != "" {
		if st, parseErr := parseOKMetadata([]byte(metadata), preferred); parseErr == nil {
			return st, mediaHeaders("https://ok.ru/", "https://ok.ru"), nil
		}
	}
	if metadata, ok := flashvars["metadata"].(map[string]any); ok {
		raw, _ := json.Marshal(metadata)
		if st, parseErr := parseOKMetadata(raw, preferred); parseErr == nil {
			return st, mediaHeaders("https://ok.ru/", "https://ok.ru"), nil
		}
	}

	metadataURL, _ := flashvars["metadataUrl"].(string)
	if metadataURL == "" {
		return stream{}, nil, errors.New("OK metadata URL missing")
	}
	metadataURL, _ = url.QueryUnescape(metadataURL)
	if strings.HasPrefix(metadataURL , "//") {
		metadataURL = "https:" + metadataURL
	} else if strings.HasPrefix(metadataURL , "/") {
		metadataURL = "https://ok.ru" + metadataURL
	}
	location, _ := flashvars["location"].(string)
	metaForm := url.Values{"st.location": {location}}
	metaBody, metaStatus, metaErr := b.fetchRaw(ctx, http.MethodPost, metadataURL, strings.NewReader(metaForm.Encode()), map[string]string{
		"Accept":       "application/json,text/plain,*/*",
		"Content-Type": "application/x-ww-form-urlencoded; charset=UTF-8",
		"Origin":       "https://ok.ru",
		"Referer":      embed,
	})
	if metaErr != nil {
		return stream{}, nil, metaErr
	}
	if metaStatus < 200 || metaStatus >= 300 {
		return stream{}, nil, fmt.Errorf("OK metadata status %d", metaStatus)
	}
	st, err := parseOKMetadata(metaBody, preferred)
	return st, mediaHeaders("https://ok.ru/", "https://ok.ru"), err
}

func parseOKMetadata(body []byte, preferred int) (stream, error) {
	var root map[string]any
	if err := json.Unmarshal(body, &root); err != nil {
		return stream{}, fmt.Errorf("OK metadata JSON: %w", err)
	}
	rows, _ := root["videos"].([]any)
	var candidates []stream
	for _, item := range rows {
		row, _ := item.(map[string]any)
		if row == nil {
			continue
		}
		u, _ := row["url"].(string)
		if !isHTTPURL(u) {
			continue
		}
		name, _ := row["name"].(string)
		q := qualityOrder[strings.ToLower(name)]
		if q == 0 {
			if parsed, err := url.Parse(u); err == nil {
				q = okTypeHeight[parsed.Query().Get("type")]
			}
		}
		candidates = append(candidates, stream{URL: u, Quality: q})
	}
	if len(candidates) == 0 {
		return stream{}, errors.New("OK returned no MP4 streams")
	}
	return chooseStream(candidates, preferred), nil
}

func parseOKPlayer(page []byte, id string) (map[string]any, error) {
	text := string(page)
	pos := 0
	for {
		idx := strings.Index(text[pos:], "data-options=")
		if idx < 0 {
			break
		}
		idx += pos + len("data-options=")
		if idx >= len(text) {
			break
		}
		quote := text[idx]
		if quote != '\'' && quote != '"' {
			pos = idx + 1
			continue
		}
		end := strings.IndexByte(text[idx+1:], quote)
		if end < 0 {
			break
		}
		raw := html.UnescapeString(text[idx+1 : idx+1+end])
		if strings.Contains(raw, id) {
			var player map[string]any
			if err := json.Unmarshal([]byte(raw), &player); err == nil {
				return player, nil
			}
		}
		pos = idx + 1 + end + 1
	}
	return nil, errors.New("OK data-options missing")
}

func (b *bridge) resolveVK(ctx context.Context, id string, preferred int) (stream, http.Header, error) {
	if !reVKVideoID.MatchString(id) {
		return stream{}, nil, errors.New("invalid VK id")
	}
	token, err := b.vkAnonymousToken(ctx)
	if err == nil {
		endpoint := "https://api.vk.com/method/video.getByIds?v=5.282&client_id=52461373"
		form := url.Values{
			"access_token": {token},
			"videos":       {id},
			"video_fields": {"files"},
		}
		body, status, reqErr := b.fetchRaw(ctx, http.MethodPost, endpoint, strings.NewReader(form.Encode()), map[string]string{
			"Accept":       "application/json,text/plain,*/*",
			"Content-Type": "application/x-ww-form-urlencoded; charset=UTF-8",
			"Origin":       "https://vkvideo.ru",
			"Referer":      "https://vkvideo.ru/",
		})
		if reqErr == nil && status >= 200 && status < 300 {
			if st, parseErr := parseVKAPI(body, preferred); parseErr == nil {
				return st, mediaHeaders("https://vk.com/", "https://vk.com"), nil
			}
		}
	}

	form := url.Values{"act": {"show"}, "al": {"1"}, "video": {id}}
	body, status, err := b.fetchRaw(ctx, http.MethodPost, "https://vk.com/al_video.php?act=show", strings.NewReader(form.Encode()), map[string]string{
		"Accept":           "application/json,text/plain,*/*",
		"Content-Type":     "application/x-www-form-urlencoded; charset=UTF-8",
		"Origin":           "https://vk.com",
		"Referer":          "https://vk.com/",
		"X-Requested-With": "XMLHttpRequest",
	})
	if err != nil {
		return stream{}, nil, err
	}
	if status < 200 || status >= 300 {
		return stream{}, nil, fmt.Errorf("VK al_video status %d", status)
	}
	st, err := parseVKPayload(body, preferred)
	return st, mediaHeaders("https://vk.com/", "https://vk.com"), err
}

func parseVKAPI(body []byte, preferred int) (stream, error) {
	var root map[string]any
	if err := json.Unmarshal(body, &root); err != nil {
		return stream{}, err
	}
	response, _ := root["response"].(map[string]any)
	items, _ := response["items"].([]any)
	if len(items) == 0 {
		return stream{}, errors.New("VK API returned no items")
	}
	item, _ := items[0].(map[string]any)
	files, _ := item["files"].(map[string]any)
	return chooseVKFiles(files, preferred)
}

func parseVKPayload(body []byte, preferred int) (stream, error) {
	text := strings.TrimSpace(string(body))
	text = strings.TrimPrefix(text, "<!--")
	var root any
	if err := json.Unmarshal([]byte(text), &root); err != nil {
		return stream{}, fmt.Errorf("VK payload JSON: %w", err)
	}
	var candidates []map[string]any
	walkMaps(root, func(m map[string]any) {
		if files, ok := m["files"].(map[string]any); ok {
			candidates = append(candidates, files)
		}
		if params, ok := m["params"].([]any); ok && len(params) > 0 {
			if p, ok := params[0].(map[string]any); ok {
				candidates = append(candidates, p)
			}
		}
	})
	for _, files := range candidates {
		if st, err := chooseVKFiles(files, preferred); err == nil {
			return st, nil
		}
	}
	return stream{}, errors.New("VK payload contained no playable MP4")
}

func chooseVKFiles(files map[string]any, preferred int) (stream, error) {
	var candidates []stream
	for key, raw := range files {
		u, ok := raw.(string)
		if !ok || !isHTTPURL(u) {
			continue
		}
		match := reMP4Key.FindStringSubmatch(key)
		if len(match) != 2 {
			if key == "extra_data" || key == "live_mp4" || key == "postlive_mp4" {
				candidates = append(candidates, stream{URL: strings.ReplaceAll(u, "^", ""), Quality: 0})
			}
			continue
		}
		q, _ := strconv.Atoi(match[1])
		candidates = append(candidates, stream{URL: strings.ReplaceAll(u, "^", ""), Quality: q})
	}
	if len(candidates) == 0 {
		return stream{}, errors.New("VK returned no MP4 streams")
	}
	return chooseStream(candidates, preferred), nil
}

func (b *bridge) resolveDzen(ctx context.Context, id string, preferred int) (stream, http.Header, error) {
	if id == "" || !regexp.MustCompile(`^[0-9a-z_-]+$`).MatchString(id) {
		return stream{}, nil, errors.New("invalid Dzen id")
	}
	watch := "https://dzen.ru/video/watch/" + url.PathEscape(id)
	body, status, err := b.fetchRaw(ctx, http.MethodGet, watch, nil, map[string]string{
		"Accept":  "text/html,application/xhtml+xml,*/*;q=0.8",
		"Referer": "https://dzen.ru/",
	})
	if err != nil {
		return stream{}, nil, err
	}
	if status < 200 || status >= 300 {
		return stream{}, nil, fmt.Errorf("Dzen watch status %d", status)
	}

	root, err := extractDzenParams(string(body))
	if err != nil {
		if redirect := extractDzenRedirect(string(body)); redirect != "" {
			if strings.HasPrefix(redirect, "/") {
				redirect = "https://dzen.ru" + redirect
			}
			redirectBody, redirectStatus, redirectErr := b.fetchRaw(ctx, http.MethodGet, redirect, nil, map[string]string{
				"Accept": "text/html,application/xhtml+xml,*/*;q=0.8", "Referer": watch,
			})
			if redirectErr == nil && redirectStatus >= 200 && redirectStatus < 300 {
				root, err = extractDzenParams(string(redirectBody))
			}
		}
		if err != nil {
			return stream{}, nil