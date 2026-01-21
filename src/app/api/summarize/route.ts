import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import { exec } from "child_process";
import { promisify } from "util";
import OpenAI from "openai";

const execAsync = promisify(exec);

const VIDEOS_DIR = path.join(process.cwd(), "public", "videos");
const AUDIO_DIR = path.join(process.cwd(), "public", "audio");
const FRAMES_DIR = path.join(process.cwd(), "public", "frames");
const TRANSCRIPTS_DIR = path.join(process.cwd(), "public", "transcripts");
const CONFIG_DIR = path.join(process.cwd(), ".vnotes");
const CONFIG_FILE = path.join(CONFIG_DIR, "keys.json");

// Ensure directories exist
function ensureDirectories() {
    [AUDIO_DIR, FRAMES_DIR, TRANSCRIPTS_DIR].forEach((dir) => {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
    });
}

// Read OpenAI API key from config
function getOpenAIApiKey(): string | null {
    if (!fs.existsSync(CONFIG_FILE)) {
        return null;
    }
    try {
        const content = fs.readFileSync(CONFIG_FILE, "utf-8");
        const config = JSON.parse(content);
        return config.openaiApiKey || null;
    } catch {
        return null;
    }
}

// Check if cached data exists
function checkCachedData(videoId: string): {
    hasAudio: boolean;
    hasFrames: boolean;
    hasTranscript: boolean;
    audioPath: string;
    framesDir: string;
    transcriptPath: string;
} {
    const audioPath = path.join(AUDIO_DIR, `${videoId}.mp3`);
    const framesDir = path.join(FRAMES_DIR, videoId);
    const transcriptPath = path.join(TRANSCRIPTS_DIR, `${videoId}.txt`);

    return {
        hasAudio: fs.existsSync(audioPath),
        hasFrames:
            fs.existsSync(framesDir) &&
            fs.readdirSync(framesDir).some((f) => f.endsWith(".txt")),
        hasTranscript: fs.existsSync(transcriptPath),
        audioPath,
        framesDir,
        transcriptPath,
    };
}

// Extract audio from video using ffmpeg
async function extractAudio(
    videoPath: string,
    outputPath: string
): Promise<void> {
    // Extract audio as mp3 with lower bitrate to stay under 25MB Whisper limit
    // Using 32kbps mono which is sufficient for speech recognition
    await execAsync(
        `ffmpeg -i "${videoPath}" -vn -acodec libmp3lame -b:a 32k -ac 1 -y "${outputPath}"`
    );
}

// Extract frames from video and convert to base64
async function extractFrames(
    videoPath: string,
    outputDir: string,
    intervalSeconds: number = 10
): Promise<string[]> {
    // Create output directory
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    // Get video duration
    const { stdout: durationOutput } = await execAsync(
        `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${videoPath}"`
    );
    const duration = parseFloat(durationOutput.trim());

    // Calculate frame timestamps
    const frameCount = Math.min(Math.ceil(duration / intervalSeconds), 20); // Max 20 frames
    const frames: string[] = [];

    for (let i = 0; i < frameCount; i++) {
        const timestamp = i * intervalSeconds;
        const frameFileName = `frame_${String(i).padStart(3, "0")}.jpg`;
        const framePath = path.join(outputDir, frameFileName);
        const base64Path = path.join(
            outputDir,
            `frame_${String(i).padStart(3, "0")}.txt`
        );

        // Extract frame at specific timestamp
        await execAsync(
            `ffmpeg -ss ${timestamp} -i "${videoPath}" -vframes 1 -q:v 2 -y "${framePath}"`
        );

        // Convert to base64 and save
        if (fs.existsSync(framePath)) {
            const imageBuffer = fs.readFileSync(framePath);
            const base64String = imageBuffer.toString("base64");
            fs.writeFileSync(base64Path, base64String);
            frames.push(base64String);

            // Remove the jpg file, keep only base64 txt
            fs.unlinkSync(framePath);
        }
    }

    return frames;
}

// Load cached frames from disk
function loadCachedFrames(framesDir: string): string[] {
    const files = fs
        .readdirSync(framesDir)
        .filter((f) => f.endsWith(".txt"))
        .sort();
    return files.map((file) => {
        return fs.readFileSync(path.join(framesDir, file), "utf-8");
    });
}

// Transcribe audio using OpenAI Whisper API
async function transcribeAudio(
    audioPath: string,
    transcriptPath: string,
    apiKey: string
): Promise<string> {
    const openai = new OpenAI({ apiKey });

    const audioFile = fs.createReadStream(audioPath);

    const transcription = await openai.audio.transcriptions.create({
        file: audioFile,
        model: "whisper-1"
    });

    // Save transcript to file
    fs.writeFileSync(transcriptPath, transcription.text);

    return transcription.text;
}

// Load cached transcript from disk
function loadCachedTranscript(transcriptPath: string): string {
    return fs.readFileSync(transcriptPath, "utf-8");
}

// Generate summary using GPT-4o with frames and transcript
async function generateSummary(
    frames: string[],
    transcript: string,
    apiKey: string
): Promise<string> {
    const openai = new OpenAI({ apiKey });

    // Build the content array with images and text
    const content: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [];

    // Add instruction text
    content.push({
        type: "text",
        text: `You are analyzing a video. Below are frames extracted from the video at regular intervals, followed by the audio transcript. Please provide a comprehensive summary of the video content.

## Audio Transcript:
${transcript}

## Instructions:
1. Describe what is happening in the video based on the visual frames
2. Summarize the key points from the audio/transcript
3. Identify main topics, themes, or subjects covered
4. Note any important visual elements, demonstrations, or on-screen text
5. Provide a concise but comprehensive summary

Please provide your summary:`,
    });

    // Add frames as images (limit to avoid token limits)
    const framesToUse = frames.slice(0, 10); // Use up to 10 frames
    for (let i = 0; i < framesToUse.length; i++) {
        content.push({
            type: "image_url",
            image_url: {
                url: `data:image/jpeg;base64,${framesToUse[i]}`,
                detail: "low", // Use low detail to save tokens
            },
        });
    }

    const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
            {
                role: "user",
                content: content,
            },
        ],
        max_tokens: 2000,
    });

    return response.choices[0].message.content || "";
}

export async function POST(request: NextRequest) {
    try {
        const { videoId } = await request.json();

        if (!videoId) {
            return NextResponse.json(
                { error: "videoId is required" },
                { status: 400 }
            );
        }

        // Check if video exists
        const videoPath = path.join(VIDEOS_DIR, `${videoId}.mp4`);
        if (!fs.existsSync(videoPath)) {
            return NextResponse.json(
                { error: "Video not found. Please download it first." },
                { status: 404 }
            );
        }

        // Get API key
        const apiKey = getOpenAIApiKey();
        if (!apiKey) {
            return NextResponse.json(
                {
                    error: "OpenAI API key not configured. Please set it in settings.",
                },
                { status: 400 }
            );
        }

        ensureDirectories();

        // Check for cached data
        const cached = checkCachedData(videoId);

        // Extract or load audio
        if (cached.hasAudio) {
            console.log(`Using cached audio for ${videoId}`);
        } else {
            console.log(`Extracting audio for ${videoId}`);
            await extractAudio(videoPath, cached.audioPath);
        }

        // Transcribe or load cached transcript
        let transcript: string;
        if (cached.hasTranscript) {
            console.log(`Using cached transcript for ${videoId}`);
            transcript = loadCachedTranscript(cached.transcriptPath);
        } else {
            console.log(`Transcribing audio for ${videoId}`);
            transcript = await transcribeAudio(
                cached.audioPath,
                cached.transcriptPath,
                apiKey
            );
        }

        // Extract or load frames
        let frames: string[];
        if (cached.hasFrames) {
            console.log(`Using cached frames for ${videoId}`);
            frames = loadCachedFrames(cached.framesDir);
        } else {
            console.log(`Extracting frames for ${videoId}`);
            frames = await extractFrames(videoPath, cached.framesDir);
        }

        // Generate summary with GPT-4o
        console.log(`Generating summary for ${videoId}`);
        const summary = await generateSummary(frames, transcript, apiKey);

        return NextResponse.json({
            success: true,
            videoId,
            summary,
            frameCount: frames.length,
            cached: {
                audio: cached.hasAudio,
                frames: cached.hasFrames,
                transcript: cached.hasTranscript,
            },
        });
    } catch (error) {
        console.error("Error summarizing video:", JSON.stringify(error));
        return NextResponse.json(
            {
                error:
                    error instanceof Error
                        ? error.message
                        : "Failed to summarize video",
            },
            { status: 500 }
        );
    }
}

// GET endpoint to check summarization status and cached data
export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const videoId = searchParams.get("videoId");

    if (!videoId) {
        return NextResponse.json(
            { error: "videoId is required" },
            { status: 400 }
        );
    }

    const videoPath = path.join(VIDEOS_DIR, `${videoId}.mp4`);
    const videoExists = fs.existsSync(videoPath);

    const cached = checkCachedData(videoId);

    return NextResponse.json({
        videoId,
        videoExists,
        cached: {
            hasAudio: cached.hasAudio,
            hasFrames: cached.hasFrames,
            hasTranscript: cached.hasTranscript,
            audioPath: cached.hasAudio ? `/audio/${videoId}.mp3` : null,
            framesDir: cached.hasFrames ? `/frames/${videoId}` : null,
            transcriptPath: cached.hasTranscript
                ? `/transcripts/${videoId}.txt`
                : null,
        },
    });
}
