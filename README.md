# Lampa.js

## CAPSULE Trailer

`CAPSULEtrailer.js` — агрегатор трейлеров для Lampa с источниками OK, VK Video и Дзен.

### ПК / браузер

Обычный браузер не может повторить Android-native HTTP Lampa: источники требуют cross-origin POST/headers, а media CDN — Referer/Origin и HTTP Range. Поэтому desktop-путь использует локальный **CAPSULE Trailer Bridge**.

Bridge:
- слушает только `127.0.0.1:19876`;
- не является универсальным URL-прокси;
- выполняет provider-specific поиск/resolve для OK, VK и Дзена;
- отдаёт выбранный MP4 в обычный `Lampa.Player`;
- прозрачно поддерживает `Range / 206 Partial Content`, поэтому перемотка и прогресс остаются штатными.

Android/TV продолжают использовать нативный транспорт Lampa и Bridge им не нужен.

### Сборка Bridge

```bash
cd bridge
go test ./...
go build .
```

Windows-сборка `CAPSULE-Trailer-Bridge.exe` также создаётся GitHub Actions workflow `Build CAPSULE Trailer Bridge`.
На ПК Bridge нужно запустить перед поиском трейлеров в Lampa.
