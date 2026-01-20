# vnotes-v2 Architecture Diagrams

This document contains architecture diagrams for the vnotes-v2 note-taking application.

---

## System Context

High-level view of how vnotes-v2 interacts with external systems and users.

```mermaid
flowchart TB
    subgraph User["User"]
        browser["Web Browser"]
    end

    subgraph vnotes["vnotes-v2 Application"]
        nextjs["Next.js 16 App"]
    end

    subgraph External["External Services"]
        youtube["YouTube (via Innertube)"]
    end

    subgraph Storage["Storage"]
        localStorage["Browser localStorage"]
        fileSystem["Server File System\n(public/videos/)"]
    end

    browser <-->|"HTTP/HTTPS"| nextjs
    nextjs -->|"Innertube Protocol"| youtube
    browser <-->|"Read/Write"| localStorage
    nextjs -->|"Write MP4 files"| fileSystem
    browser -->|"Fetch videos"| fileSystem
```

### Legend
- **User** - End user accessing the application via web browser
- **vnotes-v2 Application** - The Next.js application (frontend + API routes)
- **YouTube** - External video source accessed via Innertube protocol
- **Browser localStorage** - Client-side persistence for notes and snapshots
- **Server File System** - Local storage for downloaded video files

### Assumptions
- Single-user local deployment (no multi-user or cloud storage)
- Videos are downloaded and stored locally for offline playback
- No authentication or user management required
- Browser localStorage is sufficient for note persistence

---

## Application Container Diagram

Shows the main containers/modules within the application.

```mermaid
flowchart TB
    subgraph Browser["Browser (Client)"]
        subgraph Pages["Next.js Pages"]
            homePage["Home Page\n(/)"]
            notesPage["Notes Page\n(/notes)"]
        end

        subgraph Components["React Components"]
            sidebar["Sidebar"]
            settingsModal["SettingsModal"]
            editor["Editor\n(BlockNote)"]
        end

        subgraph ClientStorage["Client Storage"]
            ls["localStorage\n- vnotes-blocks\n- vnotes-snapshots-{id}"]
        end
    end

    subgraph Server["Next.js Server"]
        subgraph API["API Routes"]
            youtubeAPI["YouTube API\n(/api/youtube)"]
        end

        subgraph ServerStorage["Server Storage"]
            videos["public/videos/\n*.mp4 files"]
        end
    end

    subgraph External["External"]
        yt["YouTube\n(Innertube)"]
    end

    notesPage --> editor
    sidebar --> settingsModal
    editor <--> ls
    editor -->|"POST/GET"| youtubeAPI
    youtubeAPI -->|"Download"| yt
    youtubeAPI -->|"Save"| videos
    editor -->|"Fetch video"| videos
```

### Legend
- **Pages** - Next.js page routes (server/client components)
- **Components** - React UI components
- **API Routes** - Next.js API handlers
- **localStorage** - Browser-based key-value storage
- **public/videos/** - Server filesystem for downloaded videos

### Assumptions
- Editor component is client-only (dynamic import with SSR disabled)
- All pages share the same Sidebar layout
- Video files are served statically from public directory

---

## Component Hierarchy

Detailed view of the component structure and relationships.

```mermaid
flowchart TB
    subgraph Layout["RootLayout"]
        subgraph SidebarContainer["Sidebar"]
            navHome["Nav: Home"]
            navNotes["Nav: Notes"]
            navSettings["Nav: Settings"]
            settingsModal["SettingsModal"]
        end

        subgraph Main["Main Content"]
            subgraph EditorContainer["Editor Component"]
                blockNoteView["BlockNoteView"]
                slashMenu["SlashMenuController"]

                subgraph YouTubeBlock["YouTube Block"]
                    ytInput["YouTubeInput"]
                    videoPlayer["VideoPlayer"]
                end

                subgraph VideoPlayerInternals["VideoPlayer Internals"]
                    videoEl["video element"]
                    canvasEl["canvas element\n(hidden)"]
                    snapshotGallery["Snapshot Gallery"]
                end
            end
        end
    end

    navSettings -->|"opens"| settingsModal
    blockNoteView --> slashMenu
    slashMenu -->|"/youtube"| YouTubeBlock
    ytInput -->|"URL submitted"| videoPlayer
    videoPlayer --> videoEl
    videoPlayer --> canvasEl
    videoPlayer --> snapshotGallery
    videoEl -->|"frame capture"| canvasEl
    canvasEl -->|"PNG data URL"| snapshotGallery
```

### Legend
- **RootLayout** - App shell with sidebar and main content area
- **Sidebar** - Fixed navigation with settings modal trigger
- **Editor** - BlockNote-based rich text editor
- **YouTubeBlock** - Custom block type for video embedding
- **VideoPlayer** - Video playback with snapshot capability

### Assumptions
- Editor is the only component in the notes page
- Sidebar is persistent across all pages
- VideoPlayer handles both playback and snapshot capture

---

## Data Flow: Note Persistence

How note content is saved and loaded.

```mermaid
sequenceDiagram
    participant U as User
    participant E as Editor
    participant LS as localStorage

    Note over E: Component Mount
    E->>LS: Read "vnotes-blocks"
    LS-->>E: JSON content (or null)
    E->>E: Parse & hydrate editor

    Note over U,E: User Editing
    U->>E: Type/edit content
    E->>E: onChange triggered
    E->>E: Serialize to JSON
    E->>LS: Write "vnotes-blocks"

    Note over E: Page Reload
    E->>LS: Read "vnotes-blocks"
    LS-->>E: Previous content
    E->>E: Restore editor state
```

### Legend
- **User** - Person editing notes
- **Editor** - BlockNote editor component
- **localStorage** - Browser key-value storage

### Assumptions
- Content is auto-saved on every change
- No debouncing or throttling of saves
- Single document model (no multiple notes)

---

## Data Flow: YouTube Video Download

How videos are downloaded and played locally.

```mermaid
sequenceDiagram
    participant U as User
    participant E as Editor
    participant VP as VideoPlayer
    participant API as /api/youtube
    participant YT as YouTube (Innertube)
    participant FS as public/videos/

    U->>E: Paste YouTube URL
    E->>E: Extract videoId from URL
    E->>VP: Render VideoPlayer

    VP->>API: GET ?videoId={id}
    API->>FS: Check file exists

    alt Video exists locally
        FS-->>API: File found
        API-->>VP: {exists: true, videoPath}
        VP->>FS: Load /videos/{id}.mp4
    else Video not downloaded
        FS-->>API: File not found
        API-->>VP: {exists: false}
        VP->>API: POST {url}
        API->>YT: Innertube download request
        YT-->>API: Video stream
        API->>FS: Write {id}.mp4
        API-->>VP: {success: true, videoPath}
        VP->>FS: Load /videos/{id}.mp4
    end

    FS-->>VP: Video data
    VP->>VP: Play video
```

### Legend
- **Editor** - Rich text editor with YouTube block
- **VideoPlayer** - Video playback component
- **/api/youtube** - Server-side API route
- **YouTube (Innertube)** - External video source
- **public/videos/** - Local video storage

### Assumptions
- Videos are downloaded in best quality (video+audio)
- ANDROID client type used for progressive formats
- No streaming - full download before playback
- No cleanup of old videos

---

## Data Flow: Snapshot Capture

How video snapshots are captured and stored.

```mermaid
sequenceDiagram
    participant U as User
    participant VP as VideoPlayer
    participant V as video element
    participant C as canvas element
    participant LS as localStorage

    U->>VP: Click "Snapshot" button
    VP->>V: Get current time
    V-->>VP: timestamp
    VP->>C: drawImage(video, 0, 0)
    C->>C: Render video frame
    VP->>C: toDataURL('image/png')
    C-->>VP: PNG data URL
    VP->>VP: Create snapshot object
    Note over VP: {timestamp, imageDataUrl}
    VP->>VP: Add to snapshots array
    VP->>LS: Write "vnotes-snapshots-{videoId}"
    VP->>VP: Update gallery UI

    Note over U,VP: Click to seek
    U->>VP: Click snapshot thumbnail
    VP->>V: currentTime = timestamp
    V->>V: Seek to timestamp
```

### Legend
- **VideoPlayer** - Component managing video and snapshots
- **video element** - HTML5 video player
- **canvas element** - Hidden canvas for frame capture
- **localStorage** - Snapshot persistence

### Assumptions
- Canvas dimensions match video dimensions
- PNG format used for quality preservation
- Snapshots are persisted per-video (by videoId)
- User can delete individual snapshots

---

## Technology Stack

```mermaid
flowchart LR
    subgraph Frontend["Frontend"]
        next["Next.js 16"]
        react["React 19"]
        blocknote["BlockNote"]
        mantine["Mantine UI"]
    end

    subgraph Backend["Backend (API Routes)"]
        nextapi["Next.js API Routes"]
        innertube["youtubei.js\n(Innertube)"]
    end

    subgraph Build["Build & Dev"]
        ts["TypeScript"]
        eslint["ESLint"]
        css["CSS Modules"]
    end

    next --> react
    react --> blocknote
    react --> mantine
    nextapi --> innertube
```

### Legend
- **Next.js 16** - React framework with App Router
- **React 19** - UI library
- **BlockNote** - Rich text editor framework
- **Mantine** - UI component library
- **youtubei.js** - YouTube download via Innertube protocol

### Assumptions
- Using latest stable versions
- No additional backend services required
- Development uses npm scripts

---

## File Structure

```
vnotes-v2/
├── src/
│   ├── app/
│   │   ├── layout.tsx          # RootLayout with Sidebar
│   │   ├── page.tsx            # Home page (/)
│   │   ├── globals.css         # Global styles & CSS variables
│   │   ├── notes/
│   │   │   └── page.tsx        # Notes page with Editor
│   │   └── api/
│   │       └── youtube/
│   │           └── route.ts    # YouTube download API
│   └── components/
│       ├── Editor.tsx          # BlockNote editor + YouTube blocks
│       ├── Sidebar.tsx         # Navigation sidebar
│       ├── Sidebar.module.css
│       ├── SettingsModal.tsx   # Settings overlay
│       └── SettingsModal.module.css
├── public/
│   └── videos/                 # Downloaded YouTube videos (gitignored)
├── docs/
│   └── DIAGRAMS.md             # This file
├── package.json
├── tsconfig.json
└── CLAUDE.md                   # AI assistant instructions
```

---

## Future Considerations

Potential areas for expansion (not currently implemented):

1. **Multi-note Support** - Replace single localStorage key with note ID-based storage
2. **Cloud Sync** - Add backend database for cross-device sync
3. **User Authentication** - Add login/signup for multi-user support
4. **Video Cleanup** - Implement TTL or manual cleanup for downloaded videos
5. **Collaborative Editing** - Real-time multi-user editing with conflict resolution
