# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

vnotes-v2 is a Next.js 16 note-taking application with rich-text editing and YouTube video embedding capabilities. It uses React 19, TypeScript, and the BlockNote editor framework.

## Development Commands

```bash
npm run dev      # Start development server
npm run build    # Production build
npm run start    # Start production server
npm run lint     # Run ESLint
```

## Architecture

### Key Technologies
- **Editor:** BlockNote (@blocknote/core, @blocknote/react, @blocknote/mantine)
- **UI Components:** Mantine (@mantine/core, @mantine/hooks)
- **YouTube Integration:** youtubei.js (Innertube client for video downloads)
- **Styling:** CSS Modules + global CSS variables with dark mode support

### Path Alias
- `@/*` maps to `./src/*`

### Core Components

**Editor Component** (`src/components/Editor.tsx`)
- Main rich-text editor built on BlockNote
- Custom YouTube video block type with:
  - URL input validation and video ID extraction
  - Local video playback from downloaded files
  - Time-stamped snapshot capture using Canvas API
  - Slash menu integration (`/youtube` command)

**YouTube API** (`src/app/api/youtube/route.ts`)
- GET: Check if video exists locally
- POST: Download YouTube video to `public/videos/{videoId}.mp4`
- Uses Innertube with ANDROID client for progressive formats

### Client-Side Rendering Pattern
The Editor component is dynamically imported with `ssr: false` to avoid hydration issues:
```tsx
const Editor = dynamic(() => import("@/components/Editor"), { ssr: false });
```

### File Storage
Downloaded videos are stored in `public/videos/` (gitignored).

## Environment Variables

- `NEXT_INNERTUBE_KEY`: YouTube API key (stored in `.env`)
