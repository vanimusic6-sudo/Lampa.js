package main

import (
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestParseOKMetadataQuality(t *testing.T) {
	body:=[]byte(`{"videos":[{"name":"sd","url":"https://cdn.example/480.mp4"},{"name":"hd","url":"https://cdn.example/720.mp4"},{"name":"full","url":"https://cdn.example/1080.mp4"}]}`)
	st,err:=parseOKMetadata(body,720)
	if err!=nil { t.Fatal(err) }
	if st.Quality!=720 || !strings.Contains(st.URL,"720.mp4") { t.Fatalf("unexpected stream: %+v",st) }
}

func TestParseVKAPI(t *testing.T) {
	body:=[]byte(`{"response":{"items":[{"files":{"mp4_360":"https://cdn.example/360.mp4","mp4_1080":"https://cdn.example/1080.mp4"}}]}}`)
	st,err:=parseVKAPI(body,0)
	if err!=nil { t.Fatal(err) }
	if st.Quality!=1080 { t.Fatalf("expected 1080, got %+v",st) }
}

func TestExtractDzenParams(t *testing.T) {
	page:=`<script>const _params = ({"ssrData":{"videoMetaResponse":{"video":{"mp4Streams":[{"url":"https://cdn.example/v.mp4?ct=0&type=3"}]}}}});</script>`
	root,err:=extractDzenParams(page)
	if err!=nil { t.Fatal(err) }
	ssr,_:=root["ssrData"].(map[string]any)
	if ssr["videoMetaResponse"]==nil { t.Fatal("videoMetaResponse missing") }
}

func TestMediaProxyForwardsRange(t *testing.T) {
	up:=httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter,r *http.Request){
		if got:=r.Header.Get("Range"); got!="bytes=2-5" { t.Fatalf("range not forwarded: %q",got) }
		if got:=r.Header.Get("Referer"); got!="https://vk.com/" { t.Fatalf("referer not forwarded: %q",got) }
		w.Header().Set("Content-Type","video/mp4")
		w.Header().Set("Content-Range","bytes 2-5/10")
		w.Header().Set("Accept-Ranges","bytes")
		w.WriteHeader(http.StatusPartialContent)
		_,_=io.WriteString(w,"2345")
	}))
	defer up.Close()

	b:=&bridge{
		mediaClient:up.Client(),
		media:map[string]mediaEntry{"token":{
			URL:up.URL,
			Headers:mediaHeaders("https://vk.com/","https://vk.com"),
			Provider:"vk",
			Created:time.Now(),
		}},
	}
	req:=httptest.NewRequest(http.MethodGet,"http://127.0.0.1/v1/media/token",nil)
	req.Header.Set("Range","bytes=2-5")
	rr:=httptest.NewRecorder()
	b.mediaProxy(rr,req)
	if rr.Code!=http.StatusPartialContent { t.Fatalf("expected 206, got %d",rr.Code) }
	if rr.Header().Get("Content-Range")!="bytes 2-5/10" { t.Fatalf("Content-Range lost: %q",rr.Header().Get("Content-Range")) }
	if rr.Body.String()!="2345" { t.Fatalf("unexpected body %q",rr.Body.String()) }
}
