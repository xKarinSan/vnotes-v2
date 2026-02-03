# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

VNotes is a note-taking application with YouTube video embedding, video summarization using OpenAI, and snapshot capture capabilities. Built with Next.js 16, React 19, and BlockNote editor. Can run as a web app or Tauri desktop app.

## Development Commands

```bash
npm run dev          # Start Next.js development server
npm run build        # Production build
npm run lint         # Run ESLint

# Tauri desktop app
npm run tauri:dev    # Run Tauri development (starts Next.js + Tauri)
npm run tauri:build  # Build Tauri desktop app (outputs to src-tauri/target/)
```

## Architecture

### Tech Stack
- **Framework:** Next.js 16 (App Router)
- **Editor:** BlockNote with custom YouTube block type
- **UI:** Mantine v8 + CSS Modules
- **Desktop:** Tauri v2 (Rust backend, webview frontend)
- **AI:** OpenAI GPT-4o for summarization, Whisper for transcription
- **YouTube:** youtubei.js (Innertube client) for video downloads

### Path Alias
`@/*` maps to `./src/*`

### Data Flow

**Video Summarization Pipeline** (3-step process in `/api/summarize`):
1. Extract audio → Whisper transcription → audio summary
2. Extract frames (max 20, evenly distributed) → GPT-4o visual analysis
3. Consolidate both summaries → final markdown summary → parsed into BlockNote blocks

**Local Storage:**
- Videos: `public/videos/{videoId}.mp4`
- Audio: `public/audio/{videoId}.mp3`
- Frames: `public/frames/{videoId}/frame_XXX.txt` (base64)
- Transcripts: `public/transcripts/{videoId}.txt`
- API keys: `.vnotes/keys.json`
- Editor content: `localStorage` key `vnotes-blocks`
- Snapshots: `localStorage` key `vnotes-snapshots-{videoId}`

### Key Patterns

**Client-Side Editor:** The BlockNote Editor component must be dynamically imported with `ssr: false` to avoid hydration issues:
```tsx
const Editor = dynamic(() => import("@/components/Editor"), { ssr: false });
```

**Custom BlockNote Block:** The YouTube block (`src/components/Editor.tsx`) demonstrates:
- `createReactBlockSpec` for custom block types
- `BlockNoteSchema.create` to extend default schema
- Custom slash menu items via `getDefaultReactSlashMenuItems`

**Tauri Build Config:** `next.config.ts` conditionally enables static export (`output: "export"`) only during Tauri production builds via `TAURI_ENV_PLATFORM` check.

### External Dependencies
- **ffmpeg:** Required for audio extraction and frame capture (must be installed on system)
- **OpenAI API key:** Stored in `.vnotes/keys.json`, configured via Settings modal
