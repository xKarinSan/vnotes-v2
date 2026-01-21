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

// Max number of frames to extract (evenly distributed across video)
const MAX_FRAMES = 20;

// Extract frames from video and convert to base64
async function extractFrames(
    videoPath: string,
    outputDir: string
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

    // Calculate evenly spaced timestamps across the entire video
    const frameCount = Math.min(MAX_FRAMES, Math.ceil(duration / 10)); // At least 1 frame per 10 seconds, max MAX_FRAMES
    const interval = duration / frameCount;
    const frames: string[] = [];

    for (let i = 0; i < frameCount; i++) {
        // Distribute frames evenly, starting slightly after 0 to avoid black intro frames
        const timestamp = Math.min(interval * i + interval / 2, duration - 1);
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

// Generate visual summary from frames using GPT-4o
async function generateVisualSummary(
    frames: string[],
    apiKey: string
): Promise<string> {
    const openai = new OpenAI({ apiKey });

    const content: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [];

    content.push({
        type: "text",
        text: `You are analyzing frames extracted from a video at regular intervals throughout its duration. Based solely on these visual frames, provide a summary of what you observe.

## Instructions:
1. Describe the visual content, scenes, and what appears to be happening
2. Note any on-screen text, diagrams, demonstrations, or visual aids
3. Identify the setting, people, or objects shown
4. Describe any visual transitions or changes throughout the video

Please provide your visual analysis:`,
    });

    const framesToUse = frames.slice(0, 10);
    for (const frame of framesToUse) {
        content.push({
            type: "image_url",
            image_url: {
                url: `data:image/jpeg;base64,${frame}`,
                detail: "low",
            },
        });
    }

    const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [{ role: "user", content }],
        max_tokens: 1500,
    });

    return response.choices[0].message.content || "";
}

// Generate audio/transcript summary using GPT-4o
async function generateAudioSummary(
    transcript: string,
    apiKey: string
): Promise<string> {
    const openai = new OpenAI({ apiKey });

    const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
            {
                role: "user",
                content: `You are analyzing the audio transcript of a video. Based solely on this transcript, provide a summary of the spoken content.

## Transcript:
${transcript}

## Instructions:
1. Summarize the main topics and key points discussed
2. Identify the speaker's main arguments or explanations
3. Note any important terminology, names, or concepts mentioned
4. Highlight any conclusions or takeaways

Please provide your audio/transcript analysis:`,
            },
        ],
        max_tokens: 1500,
    });

    return response.choices[0].message.content || "";
}

// Consolidate visual and audio summaries into final overview
async function generateFinalSummary(
    visualSummary: string,
    audioSummary: string,
    apiKey: string
): Promise<string> {
    const openai = new OpenAI({ apiKey });

    const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
            {
                role: "user",
                content: `You have been given two separate analyses of a video - one based on visual frames and one based on the audio transcript. Your task is to consolidate these into a single, comprehensive overview.

## Visual Analysis:
${visualSummary}

## Audio/Transcript Analysis:
${audioSummary}

## Instructions:
1. Synthesize both analyses into a cohesive summary
2. Identify how the visual and audio content complement each other
3. Highlight the main themes, key points, and takeaways
4. Note any discrepancies or additional insights from combining both sources
5. Provide a well-structured, comprehensive overview that captures the full essence of the video

Please provide your consolidated summary:`,
            },
        ],
        max_tokens: 2000,
    });

    return response.choices[0].message.content || "";
}

// Main summarization pipeline: visual -> audio -> consolidate
async function generateSummary(
    frames: string[],
    transcript: string,
    apiKey: string
): Promise<{ visualSummary: string; audioSummary: string; finalSummary: string }> {
    // Step 1: Analyze visual frames
    console.log("Generating visual summary...");
    const visualSummary = await generateVisualSummary(frames, apiKey);

    // Step 2: Analyze audio transcript
    console.log("Generating audio summary...");
    const audioSummary = await generateAudioSummary(transcript, apiKey);

    // Step 3: Consolidate into final overview
    console.log("Generating consolidated summary...");
    const finalSummary = await generateFinalSummary(visualSummary, audioSummary, apiKey);

    return { visualSummary, audioSummary, finalSummary };
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

        // Generate summary with GPT-4o (3-step process)
        console.log(`Generating summary for ${videoId}`);
        const { visualSummary, audioSummary, finalSummary } = await generateSummary(frames, transcript, apiKey);

        return NextResponse.json({
            success: true,
            videoId,
            summary: finalSummary,
            visualSummary,
            audioSummary,
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
