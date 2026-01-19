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

function VideoPlayer({
    videoId,
    youtubeUrl,
}: {
    videoId: string;
    youtubeUrl: string;
}) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
    const [isReady, setIsReady] = useState(false);
    const [isDownloading, setIsDownloading] = useState(false);
    const [downloadError, setDownloadError] = useState<string | null>(null);
    const [videoPath, setVideoPath] = useState<string | null>(null);

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
                <div style={{ marginTop: "8px" }}>
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

            return <VideoPlayer videoId={videoId} youtubeUrl={block.props.url} />;
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

export default function Editor() {
    const editor = useCreateBlockNote({ schema });

    return (
        <BlockNoteView editor={editor} slashMenu={false}>
            <SuggestionMenuController
                triggerCharacter="/"
                getItems={async (query) =>
                    filterSuggestionItems(getCustomSlashMenuItems(editor), query)
                }
            />
        </BlockNoteView>
    );
}
