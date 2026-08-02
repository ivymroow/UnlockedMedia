# WebStreaming

A lightweight self-hosted streaming platform with metadata discovery, streaming, accounts, watch history, and customizable media management.

WebStreaming combines a Netflix/Plex-style browser UI with a Node streaming backend, metadata search, source discovery, torrent-backed playback, optional FFmpeg transcoding, Supabase authentication, watch progress, and watchlists.

## Features

- Movie and TV discovery through metadata search, trending, and popular feeds.
- Episode lookup for TV shows with season and episode source resolution.
- Source aggregation with duplicate filtering and source racing.
- HTTP range streaming with optional FFmpeg fallback for browser compatibility.
- Supabase-backed sign up, sign in, session refresh, progress, and watchlist APIs.
- Render-ready Docker deployment with health checks and environment validation.
- Free-tier resource guards for stream cleanup, active stream caps, rate limiting, and graceful shutdown.

## Architecture

```text
server/
  index.js              bootstrap and shutdown
  app.js                Express app composition
  config/               environment and constants
  routes/               auth, media, streams, progress, watchlist
  services/             metadata, streaming, torrent, transcoder, cache, downloads
  middleware/           auth, errors, rate limiting, validation
  database/             Supabase adapter
  utils/                logger
public/                 browser UI
vendor/                 local streaming engine package
```

## Local Development

```bash
npm install
cp .env.example .env
npm run dev
```

Open `http://localhost:3000`.

Supabase variables are only required for auth, watch progress, and watchlist features in development. They are required in production.

## Render Deployment

1. Push this repository to GitHub.
2. Create a Render Blueprint from `render.yaml`.
3. Set `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `CORS_ORIGINS`.
4. Deploy the Docker web service.

The service exposes `/health` for Render health checks.

## Environment Variables

| Name | Required | Description |
| --- | --- | --- |
| `PORT` | No | HTTP port. Render injects this automatically. |
| `NODE_ENV` | Yes in production | Use `production` on Render. |
| `CORS_ORIGINS` | Yes in production | Comma-separated allowed browser origins. |
| `SUPABASE_URL` | Yes in production | Supabase project URL. |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes in production | Server-only Supabase service role key. |
| `RATE_LIMIT_WINDOW_MS` | No | Request rate-limit window. |
| `RATE_LIMIT_MAX` | No | Requests allowed per window per IP. |
| `MAX_ACTIVE_STREAMS` | No | Maximum torrent streams kept active. |
| `STREAM_IDLE_MS` | No | Idle stream lifetime before cleanup. |
| `STREAM_CLEANUP_INTERVAL_MS` | No | Cleanup interval for inactive streams. |
| `FFMPEG_TIMEOUT_MS` | No | Time to wait for FFmpeg output before fallback. |

## Notes

This project is designed for personal, self-hosted use. Respect copyright law and only stream media you are legally allowed to access.
