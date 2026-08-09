import fs from "node:fs/promises";

const SOCKET_EVENT_PATTERN =
    /\bsocket\.on\s*\(\s*["'`]([^"'`]+)["'`]/gi;

export async function detectSocketIoEvents(filePath) {
    const content = await fs.readFile(filePath, "utf-8");
    const interfaces = [];

    let match;

    while ((match = SOCKET_EVENT_PATTERN.exec(content)) !== null) {
        interfaces.push({
            type: "socketio",
            framework: "Socket.IO",
            event: match[1],
        });
    }

    return interfaces;
}