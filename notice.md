# web-streaming — Notice

**Welcome to web-streaming beta!**

I am currently a solo dev with no money or servers or anything. I want to make a simple streaming site that:

- Doesn't spam ads
- Doesn't break half the time
- Doesn't steal your info lmao
- Has original UI and functionality

Currently this depends on torrents and peers. I want to do direct streaming but I'm seriously broke and API keys cost monies man.

---

## How It Works

web-streaming is a self-hosted web application that lets you browse and stream movies and TV shows. The backend handles everything — your browser never touches P2P.

### Architecture

```
Browser (HTTP) → Server (Express.js) → WebTorrent/FFmpeg → Video Stream
```

### Flow

1. **Search** → IMDb suggestion API (free, no key)
2. **Details** → Wikipedia REST API (free, no key)
3. **Episodes** → TVmaze API (free, no key)
4. **Sources** → torrentio.strem.fun (free, no key) + YTS/EZTV/PirateBay fallbacks
5. **Download** → Server-side WebTorrent downloads the torrent, FFmpeg transcodes audio to AAC
6. **Play** → Full file served via HTTP with seeking support, subtitles extracted from torrent

### Key Features

- **Race-testing**: Tests multiple torrent sources in parallel, picks the fastest
- **Buffer-then-play**: Downloads the full file before playing for complete seeking support
- **Audio transcode**: FFmpeg converts E-AC3/DTS/TrueHD to AAC for browser compatibility
- **Subtitles**: Extracts .srt/.vtt from torrent files, displays as native text tracks
- **Profile system**: Supabase-powered accounts with watch progress, watchlist, continue watching
- **Episode links**: Shareable URLs with season/episode (`#id=tt123&type=tv&s=1&e=2`)

---

## Technical Stack

### Frontend
- Vanilla JavaScript SPA (no framework)
- Hash-based URL routing
- Custom video player with seek bar, volume, fullscreen, captions toggle
- Profile page with media search dropdown and status tabs

### Backend
- **Express.js** — HTTP server and API routes
- **WebTorrent** — Server-side torrent client (vendored for platform compatibility)
- **FFmpeg** — Audio transcoding (E-AC3 → AAC)
- **memory-chunk-store** — In-memory torrent storage (no disk writes during download)
- **Supabase** — Authentication, watch progress, watchlist

### APIs Used (All Free, No Keys)
- **IMDb Suggestion API** (`v3.sg.media-imdb.com/suggestion`) — Search and metadata
- **Wikipedia REST API** (`en.wikipedia.org/api/rest_v1`) — Plot summaries
- **TVmaze API** (`api.tvmaze.com`) — Episode guides, season info
- **Torrentio** (`torrentio.strem.fun`) — Torrent source aggregation
- **YTS API** (`yts.mx/api/v2`) — Movie torrents (fallback)
- **EZTV API** (`eztvx.to/api`) — TV episode torrents (fallback)
- **PirateBay API** (`apibay.org`) — General torrent search (fallback)
- **OpenSubtitles** — Subtitle data from torrent file contents

### Deployment
- **Docker** — Containerized with Node.js 22 + FFmpeg
- **docker-compose.yml** — One-command VPS deployment
- **Render** — Free tier (512MB RAM, requires disk-based transcoding)

---

## File Structure

```
├── public/
│   ├── app.js          — Frontend SPA (search, detail, player, profile)
│   ├── index.html      — Main HTML shell
│   └── styles.css      — Dark theme, player controls, profile UI
├── server/
│   ├── index.js        — Express server, all API routes
│   ├── media-finder.js — WebTorrent client, tracker list, source search (YTS/EZTV/TPB)
│   ├── source-finder.js— Torrentio API integration
│   ├── download.js     — Download manager (torrent → disk → FFmpeg → serve)
│   ├── transcode.js    — FFmpeg streaming and file-to-file transcode
│   ├── imdb.js         — IMDb suggestion API + Wikipedia details
│   ├── episodes.js     — TVmaze episode data + season filtering
│   ├── supabase.js     — Supabase auth, progress, watchlist
│   └── cache.js        — Simple in-memory TTL cache
├── vendor/
│   ├── s-engine.tgz    — Vendored WebTorrent (platform-safe packaging)
│   └── s-store.tgz     — Vendored memory-chunk-store
├── Dockerfile          — Container build (Node 22, FFmpeg via apt)
├── docker-compose.yml  — VPS deployment config
└── package.json        — Dependencies (Express, Axios, Supabase, vendored WebTorrent)
```

---

## License & Disclaimer

This project is for **personal use only**. Only stream content you have the right to access. The developer is not responsible for how this software is used. All APIs consumed are publicly available and free.

---

*Built solo with no budget. If this helped you, star the repo.*
