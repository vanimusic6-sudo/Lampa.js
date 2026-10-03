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
		writeJSON(w, http.StatusBadGate