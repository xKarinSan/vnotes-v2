import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import Innertube from "youtubei.js";

const VIDEOS_DIR = path.join(process.cwd(), "public", "videos");

// Ensure videos directory exists
if (!fs.existsSync(VIDEOS_DIR)) {
    fs.mkdirSync(VIDEOS_DIR, { recursive: true });
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

export async function POST(request: NextRequest) {
    try {
        const { url } = await request.json();

        if (!url) {
            return NextResponse.json(
                { error: "URL is required" },
                { status: 400 },
            );
        }

        const videoId = getYouTubeVideoId(url);
        if (!videoId) {
            return NextResponse.json(
                { error: "Invalid YouTube URL" },
                { status: 400 },
            );
        }

        const outputPath = path.join(VIDEOS_DIR, `${videoId}.mp4`);

        // Check if video already exists
        if (fs.existsSync(outputPath)) {
            return NextResponse.json({
                success: true,
                videoId,
                videoPath: `/videos/${videoId}.mp4`,
            });
        }

        // Initialize YouTube.js
        const yt = await Innertube.create();

        // Use the built-in download method - try ANDROID client which has progressive formats
        const stream = await yt.download(videoId, {
            type: "video+audio",
            quality: "best",
            client: "ANDROID",
        });

        // Collect chunks from the stream
        const chunks: Uint8Array[] = [];
        const reader = stream.getReader();

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            chunks.push(value);
        }

        // Combine chunks and write to file
        const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
        const buffer = new Uint8Array(totalLength);
        let offset = 0;
        for (const chunk of chunks) {
            buffer.set(chunk, offset);
            offset += chunk.length;
        }

        fs.writeFileSync(outputPath, Buffer.from(buffer));

        return NextResponse.json({
            success: true,
            videoId,
            videoPath: `/videos/${videoId}.mp4`,
        });
    } catch (error) {
        console.error("Error downloading video:", error);
        return NextResponse.json(
            {
                error:
                    error instanceof Error
                        ? error.message
                        : "Failed to download video",
            },
            { status: 500 },
        );
    }
}

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const videoId = searchParams.get("videoId");

    if (!videoId) {
        return NextResponse.json(
            { error: "videoId is required" },
            { status: 400 },
        );
    }

    const videoPath = path.join(VIDEOS_DIR, `${videoId}.mp4`);

    if (fs.existsSync(videoPath)) {
        return NextResponse.json({
            exists: true,
            videoPath: `/videos/${videoId}.mp4`,
        });
    }

    return NextResponse.json({ exists: false });
}
