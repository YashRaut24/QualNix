import fs from "node:fs/promises";

export async function detectGoWebSocketInterfaces(filePath) {
    const content = await fs.readFile(filePath, "utf-8");

    const hasWebSocketEvidence =
        /gorilla\/websocket/.test(content) ||
        /nhooyr\.io\/websocket/.test(content) ||
        /\bwebsocket\.Upgrader\b/.test(content) ||
        /\.Upgrade\s*\(/.test(content);

    if (!hasWebSocketEvidence) {
        return [];
    }

    const event = /\bRead(?:JSON|Message)\s*\(/.test(content)
        ? "message"
        : "websocket";

    return [
        {
            type: "realtime",
            protocol: "websocket",
            framework: "WebSocket",
            role: "server",
            event,
        },
    ];
}
