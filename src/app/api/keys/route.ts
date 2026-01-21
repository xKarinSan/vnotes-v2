import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs";

const CONFIG_DIR = path.join(process.cwd(), ".vnotes");
const CONFIG_FILE = path.join(CONFIG_DIR, "keys.json");

interface KeysConfig {
    openaiApiKey?: string;
}

function ensureConfigDir() {
    if (!fs.existsSync(CONFIG_DIR)) {
        fs.mkdirSync(CONFIG_DIR, { recursive: true });
    }
}

function readConfig(): KeysConfig {
    ensureConfigDir();
    if (!fs.existsSync(CONFIG_FILE)) {
        return {};
    }
    try {
        const content = fs.readFileSync(CONFIG_FILE, "utf-8");
        return JSON.parse(content);
    } catch {
        return {};
    }
}

function writeConfig(config: KeysConfig) {
    ensureConfigDir();
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

export async function GET() {
    const config = readConfig();
    return NextResponse.json({
        openaiApiKey: config.openaiApiKey || "",
    });
}

export async function POST(request: NextRequest) {
    try {
        const { openaiApiKey } = await request.json();

        const config = readConfig();
        config.openaiApiKey = openaiApiKey;
        writeConfig(config);

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Error saving API key:", error);
        return NextResponse.json(
            { error: "Failed to save API key" },
            { status: 500 },
        );
    }
}

export async function DELETE() {
    try {
        const config = readConfig();
        delete config.openaiApiKey;
        writeConfig(config);

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Error deleting API key:", error);
        return NextResponse.json(
            { error: "Failed to delete API key" },
            { status: 500 },
        );
    }
}
