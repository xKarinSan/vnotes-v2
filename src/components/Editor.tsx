"use client"
import { useState } from "react";
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
                        console.log("Input value:", inputValue);
                        console.log("Video ID:", getYouTubeVideoId(inputValue));
                        if (getYouTubeVideoId(inputValue)) {
                            onSubmit(inputValue);
                        }
                    }
                }}
            />
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
            console.log("Render - block.props.url:", block.props.url);
            const videoId = getYouTubeVideoId(block.props.url);
            console.log("Render - videoId:", videoId);

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

            return (
                <div style={{ width: "100%", maxWidth: "640px" }}>
                    <div style={{ position: "relative", paddingBottom: "56.25%", height: 0, overflow: "hidden" }}>
                        <iframe
                            src={`https://www.youtube.com/embed/${videoId}`}
                            style={{
                                position: "absolute",
                                top: 0,
                                left: 0,
                                width: "100%",
                                height: "100%",
                                border: "none",
                                borderRadius: "4px",
                            }}
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                            allowFullScreen
                        />
                    </div>
                </div>
            );
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
