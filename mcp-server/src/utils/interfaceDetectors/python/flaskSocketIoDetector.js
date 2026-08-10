import fs from "node:fs/promises";

const ON_PATTERN =
    /@([A-Za-z_]\w*)\.on\s*\(\s*["'`]([^"'`]+)["'`]/g;

const EMIT_PATTERN =
    /\b([A-Za-z_]\w*)\.emit\s*\(\s*["'`]([^"'`]+)["'`]/g;

export async function detectFlaskSocketIoEvents(filePath) {
    const content = await fs.readFile(filePath, "utf-8");

    const hasFlaskSocketIoEvidence =
        /from\s+flask_socketio\s+import\b/.test(content) ||
        /import\s+flask_socketio\b/.test(content) ||
        /\bSocketIO\s*\(/.test(content);

    if (!hasFlaskSocketIoEvidence) {
        return [];
    }

    const events = new Set();
    let match;

    while ((match = ON_PATTERN.exec(content)) !== null) {
        events.add(match[2]);
    }

    while ((match = EMIT_PATTERN.exec(content)) !== null) {
        events.add(match[2]);
    }

    return [...events].map((event) => ({
        type: "realtime",
        protocol: "socketio",
        framework: "Flask-SocketIO",
        role: "server",
        event,
    }));
}
