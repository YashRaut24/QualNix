import fs from "node:fs/promises";

const WEBSOCKET_PATTERN =
    /@(MessageMapping|SubscribeMapping|SendTo)\s*(?:\(\s*["'`]([^"'`]+)["'`]\s*\))?/g;

function eventName(annotation, routePath) {
    if (routePath) {
        return routePath;
    }

    return annotation === "SendTo" ? "send" : "message";
}

export async function detectSpringWebSocketInterfaces(filePath) {
    const content = await fs.readFile(filePath, "utf-8");

    const hasSpringWebSocketEvidence =
        /org\.springframework\.messaging/.test(content) ||
        /org\.springframework\.web\.socket/.test(content) ||
        /@(MessageMapping|SubscribeMapping|SendTo)\b/.test(content);

    if (!hasSpringWebSocketEvidence) {
        return [];
    }

    const interfaces = [];
    let match;

    while ((match = WEBSOCKET_PATTERN.exec(content)) !== null) {
        interfaces.push({
            type: "realtime",
            protocol: "websocket",
            framework: "Spring WebSocket",
            role: "server",
            event: eventName(match[1], match[2] || ""),
        });
    }

    return interfaces;
}
