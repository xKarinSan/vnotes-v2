"use client"
import { useState, useEffect, useRef, useCallback } from "react";
import {
    createReactBlockSpec,
    useCreateBlockNote,
    DefaultReactSuggestionItem,
    getDefaultReactSlashMenuItems,
    SuggestionMenuController,
} from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import { BlockNoteSchema } from "@blocknote/core";
import { defaultBlockSpecs } from "@blocknote/core/blocks";
import { filterSuggestionItems } from "@blocknote/core/extensions";
import "@blocknote/mantine/style.css";
import "@blocknote/core/fonts/inter.css";

interface Snapshot {
    timestamp: number;
    imageDataUrl: string;
}

function getYouTubeVideoId(url: string): string | null {
    const patterns = [
        /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&?\s]+)/,
    ];
    for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match) return match[1];
    }
    return null;
}

function formatTime(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
}

// Parse inline markdown (bold, italic) into BlockNote styled text
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseInlineMarkdown(text: string): any[] {
    const result: { type: "text"; text: string; styles: Record<string, boolean> }[] = [];
    let remaining = text;

    while (remaining.length > 0) {
        // Match **bold** or __bold__
        const boldMatch = remaining.match(/^(\*\*|__)(.+?)\1/);
        if (boldMatch) {
            result.push({ type: "text", text: boldMatch[2], styles: { bold: true } });
            remaining = remaining.slice(boldMatch[0].length);
            continue;
        }

        // Match *italic* or _italic_
        const italicMatch = remaining.match(/^(\*|_)(.+?)\1/);
        if (italicMatch) {
            result.push({ type: "text", text: italicMatch[2], styles: { italic: true } });
            remaining = remaining.slice(italicMatch[0].length);
            continue;
        }

        // Find next special character
        const nextSpecial = remaining.search(/[\*_]/);
        if (nextSpecial === -1) {
            // No more special characters
            result.push({ type: "text", text: remaining, styles: {} });
            break;
        } else if (nextSpecial === 0) {
            // Special char at start but didn't match pattern, treat as text
            result.push({ type: "text", text: remaining[0], styles: {} });
            remaining = remaining.slice(1);
        } else {
            // Add plain text before special char
            result.push({ type: "text", text: remaining.slice(0, nextSpecial), styles: {} });
            remaining = remaining.slice(nextSpecial);
        }
    }

    return result;
}

// Parse markdown text into BlockNote block array
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseMarkdownToBlocks(markdown: string): any[] {
    const lines = markdown.split("\n");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const blocks: any[] = [];
    let i = 0;

    while (i < lines.length) {
        const line = lines[i];

        // Skip empty lines
        if (line.trim() === "") {
            i++;
            continue;
        }

        // Headings: # to ###### (h1 to h6, but BlockNote only supports 1-3)
        const headingMatch = line.match(/^(#{1,6}) /);
        if (headingMatch) {
            const hashes = headingMatch[1].length;
            // BlockNote only supports levels 1-3, so cap at 3
            const level = Math.min(hashes, 3) as 1 | 2 | 3;
            blocks.push({
                type: "heading",
                props: { level },
                content: parseInlineMarkdown(line.slice(hashes + 1).trim()),
            });
            i++;
            continue;
        }

        // Bullet list item: - item or * item
        if (line.match(/^[\-\*] /)) {
            blocks.push({
                type: "bulletListItem",
                content: parseInlineMarkdown(line.slice(2).trim()),
            });
            i++;
            continue;
        }

        // Numbered list item: 1. item
        if (line.match(/^\d+\. /)) {
            const content = line.replace(/^\d+\. /, "").trim();
            blocks.push({
                type: "numberedListItem",
                content: parseInlineMarkdown(content),
            });
            i++;
            continue;
        }

        // Regular paragraph
        blocks.push({
            type: "paragraph",
            content: parseInlineMarkdown(line.trim()),
        });
        i++;
    }

    return blocks;
}

function YouTubeInput({ onSubmit }: { onSubmit: (url: string) => void }) {
    const [inputValue, setInputValue] = useState("");

    return (
        <div style={{ padding: "12px", background: "#f5f5f5", borderRadius: "4px" }}>
            <input
                type="text"
                placeholder="Paste YouTube URL and press Enter..."
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                style={{
                    width: "100%",
                    padding: "8px",
                    border: "1px solid #ddd",
                    borderRadius: "4px",
                }}
                onKeyDown={(e) => {
                    if (e.key === "Enter") {
                        e.preventDefault();
                        if (getYouTubeVideoId(inputValue)) {
                            onSubmit(inputValue);
                        }
                    }
                }}
            />
        </div>
    );
}

function getSnapshotStorageKey(videoId: string) {
    return `vnotes-snapshots-${videoId}`;
}

function VideoPlayer({
    videoId,
    youtubeUrl,
    blockId,
    editor,
}: {
    videoId: string;
    youtubeUrl: string;
    blockId: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    editor: any;
}) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [snapshots, setSnapshots] = useState<Snapshot[]>(() => {
        // Load snapshots from localStorage on init
        if (typeof window === "undefined") return [];
        const saved = localStorage.getItem(getSnapshotStorageKey(videoId));
        if (saved) {
            try {
                return JSON.parse(saved);
            } catch {
                return [];
            }
        }
        return [];
    });
    const [isReady, setIsReady] = useState(false);
    const [isDownloading, setIsDownloading] = useState(false);
    const [downloadError, setDownloadError] = useState<string | null>(null);
    const [videoPath, setVideoPath] = useState<string | null>(null);
    const [isSummarizing, setIsSummarizing] = useState(false);

    // Save snapshots to localStorage whenever they change
    useEffect(() => {
        localStorage.setItem(getSnapshotStorageKey(videoId), JSON.stringify(snapshots));
    }, [videoId, snapshots]);

    // Check if video exists or download it
    useEffect(() => {
        let cancelled = false;

        async function checkOrDownloadVideo() {
            try {
                // First check if video already exists
                const checkRes = await fetch(`/api/youtube?videoId=${videoId}`);
                const checkData = await checkRes.json();

                if (checkData.exists) {
                    if (!cancelled) {
                        setVideoPath(checkData.videoPath);
                    }
                    return;
                }

                // Download the video
                if (!cancelled) {
                    setIsDownloading(true);
                    setDownloadError(null);
                }

                const downloadRes = await fetch("/api/youtube", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ url: youtubeUrl }),
                });

                const downloadData = await downloadRes.json();

                if (!cancelled) {
                    if (downloadData.success) {
                        setVideoPath(downloadData.videoPath);
                    } else {
                        setDownloadError(downloadData.error || "Failed to download video");
                    }
                    setIsDownloading(false);
                }
            } catch (error) {
                if (!cancelled) {
                    setDownloadError("Failed to download video");
                    setIsDownloading(false);
                }
            }
        }

        checkOrDownloadVideo();

        return () => {
            cancelled = true;
        };
    }, [videoId, youtubeUrl]);

    const takeSnapshot = useCallback(() => {
        const video = videoRef.current;
        const canvas = canvasRef.current;
        if (!video || !canvas) return;

        if (video.videoWidth === 0 || video.videoHeight === 0) {
            console.warn("Video not loaded yet");
            return;
        }

        // Pause video
        video.pause();

        // Set canvas dimensions to match video
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;

        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        // Draw current frame to canvas
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        // Get image data URL
        const imageDataUrl = canvas.toDataURL("image/png");

        const snapshot: Snapshot = {
            timestamp: video.currentTime,
            imageDataUrl,
        };

        setSnapshots((prev) => [...prev, snapshot]);
    }, []);

    const seekToSnapshot = useCallback((timestamp: number) => {
        const video = videoRef.current;
        if (video) {
            video.currentTime = timestamp;
        }
    }, []);

    const removeSnapshot = useCallback((index: number) => {
        setSnapshots((prev) => prev.filter((_, i) => i !== index));
    }, []);

    const handleSummarize = useCallback(async () => {
        setIsSummarizing(true);
        try {
            const response = await fetch("/api/summarize", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ videoId }),
            });
            const data = await response.json();

            if (data.success && data.summary) {
                // Parse markdown summary into BlockNote blocks
                const blocks = parseMarkdownToBlocks(data.summary);
                editor.insertBlocks(blocks, blockId, "after");
            } else {
                alert(data.error || "Failed to generate summary");
            }
        } catch (error) {
            console.error("Summarization error:", error);
            alert("Failed to generate summary");
        } finally {
            setIsSummarizing(false);
        }
    }, [videoId, editor, blockId]);

    if (isDownloading) {
        return (
            <div style={{
                width: "640px",
                height: "360px",
                background: "#000",
                borderRadius: "4px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "white",
                flexDirection: "column",
                gap: "12px",
            }}>
                <div style={{
                    width: "40px",
                    height: "40px",
                    border: "3px solid #333",
                    borderTopColor: "#fff",
                    borderRadius: "50%",
                    animation: "spin 1s linear infinite",
                }} />
                <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                <span>Downloading video...</span>
            </div>
        );
    }

    if (downloadError) {
        return (
            <div style={{
                width: "640px",
                height: "360px",
                background: "#fee2e2",
                borderRadius: "4px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#dc2626",
                padding: "20px",
                textAlign: "center",
            }}>
                {downloadError}
            </div>
        );
    }

    if (!videoPath) {
        return (
            <div style={{
                width: "640px",
                height: "360px",
                background: "#000",
                borderRadius: "4px",
            }} />
        );
    }

    return (
        <div style={{ width: "100%", maxWidth: "640px" }}>
            <video
                ref={videoRef}
                src={videoPath}
                controls
                onLoadedData={() => setIsReady(true)}
                style={{
                    width: "640px",
                    height: "360px",
                    borderRadius: "4px",
                    background: "#000",
                }}
            />
            {/* Hidden canvas for frame capture */}
            <canvas ref={canvasRef} style={{ display: "none" }} />

            {isReady && (
                <div style={{ marginTop: "8px", display: "flex", gap: "8px" }}>
                    <button
                        onClick={takeSnapshot}
                        style={{
                            padding: "8px 16px",
                            background: "#3b82f6",
                            color: "white",
                            border: "none",
                            borderRadius: "4px",
                            cursor: "pointer",
                            fontSize: "14px",
                            fontWeight: 500,
                        }}
                    >
                        Snapshot
                    </button>
                    <button
                        onClick={handleSummarize}
                        disabled={isSummarizing}
                        style={{
                            padding: "8px 16px",
                            background: isSummarizing ? "#9ca3af" : "#10b981",
                            color: "white",
                            border: "none",
                            borderRadius: "4px",
                            cursor: isSummarizing ? "not-allowed" : "pointer",
                            fontSize: "14px",
                            fontWeight: 500,
                        }}
                    >
                        {isSummarizing ? "Summarizing..." : "Summarize"}
                    </button>
                </div>
            )}

            {snapshots.length > 0 && (
                <div style={{ marginTop: "12px" }}>
                    <div style={{ fontSize: "14px", fontWeight: 500, marginBottom: "8px", color: "#333" }}>
                        Snapshots:
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                        {snapshots.map((snapshot, index) => (
                            <div
                                key={index}
                                style={{
                                    position: "relative",
                                    width: "120px",
                                    cursor: "pointer",
                                    borderRadius: "4px",
                                    overflow: "hidden",
                                    border: "2px solid #e5e7eb",
                                }}
                            >
                                <img
                                    src={snapshot.imageDataUrl}
                                    alt={`Snapshot at ${formatTime(snapshot.timestamp)}`}
                                    style={{ width: "100%", display: "block" }}
                                    onClick={() => seekToSnapshot(snapshot.timestamp)}
                                />
                                <div
                                    style={{
                                        position: "absolute",
                                        bottom: 0,
                                        left: 0,
                                        right: 0,
                                        background: "rgba(0,0,0,0.7)",
                                        color: "white",
                                        fontSize: "12px",
                                        padding: "4px",
                                        textAlign: "center",
                                    }}
                                    onClick={() => seekToSnapshot(snapshot.timestamp)}
                                >
                                    {formatTime(snapshot.timestamp)}
                                </div>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        removeSnapshot(index);
                                    }}
                                    style={{
                                        position: "absolute",
                                        top: "2px",
                                        right: "2px",
                                        background: "rgba(0,0,0,0.6)",
                                        color: "white",
                                        border: "none",
                                        borderRadius: "50%",
                                        width: "20px",
                                        height: "20px",
                                        cursor: "pointer",
                                        fontSize: "12px",
                                        lineHeight: "20px",
                                        padding: 0,
                                    }}
                                >
                                    ×
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

const YouTubeBlock = createReactBlockSpec(
    {
        type: "youtube",
        propSchema: {
            url: { default: "" },
        },
        content: "none",
    },
    {
        render: ({ block, editor }) => {
            const videoId = getYouTubeVideoId(block.props.url);

            if (!videoId) {
                return (
                    <YouTubeInput
                        onSubmit={(url) => {
                            editor.replaceBlocks(
                                [block.id],
                                [{ type: "youtube", props: { url } }]
                            );
                        }}
                    />
                );
            }

            return <VideoPlayer videoId={videoId} youtubeUrl={block.props.url} blockId={block.id} editor={editor} />;
        },
    }
);

const schema = BlockNoteSchema.create({
    blockSpecs: {
        ...defaultBlockSpecs,
        youtube: YouTubeBlock(),
    },
});

const insertYouTube = (editor: any): DefaultReactSuggestionItem => ({
    title: "YouTube",
    subtext: "Embed a YouTube video",
    onItemClick: () => {
        editor.insertBlocks(
            [{ type: "youtube" }],
            editor.getTextCursorPosition().block,
            "after"
        );
    },
    aliases: ["youtube", "video", "embed"],
    group: "Embeds",
});

function getCustomSlashMenuItems(editor: any): DefaultReactSuggestionItem[] {
    return [...getDefaultReactSlashMenuItems(editor), insertYouTube(editor)];
}

const STORAGE_KEY = "vnotes-blocks";

export default function Editor() {
    const editor = useCreateBlockNote({
        schema,
        initialContent: undefined,
    });
    const [isLoaded, setIsLoaded] = useState(false);

    // Load saved content on mount
    useEffect(() => {
        const savedContent = localStorage.getItem(STORAGE_KEY);
        if (savedContent) {
            try {
                const blocks = JSON.parse(savedContent);
                editor.replaceBlocks(editor.document, blocks);
            } catch (e) {
                console.error("Failed to load saved content:", e);
            }
        }
        setIsLoaded(true);
    }, [editor]);

    // Save content on change
    const handleChange = useCallback(() => {
        const blocks = editor.document;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(blocks));
    }, [editor]);

    if (!isLoaded) {
        return null;
    }

    return (
        <BlockNoteView editor={editor} slashMenu={false} onChange={handleChange}>
            <SuggestionMenuController
                triggerCharacter="/"
                getItems={async (query) =>
                    filterSuggestionItems(getCustomSlashMenuItems(editor), query)
                }
            />
        </BlockNoteView>
    );
}
