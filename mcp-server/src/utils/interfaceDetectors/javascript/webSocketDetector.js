import fs from "node:fs/promises";

const SERVER_EVIDENCE_PATTERN =
    /\bnew\s+(?:WebSocketServer|WebSocket\.Server)\s*\(|\bwss\.on\s*\(\s*["'`]connection["'`]/i;

const CLIENT_EVIDENCE_PATTERN =
    /\bnew\s+WebSocket\s*\(\s*["'`]wss?:\/\//i;

const EVENT_PATTERN =
    /\b(?:wss|ws|socket|client)\.(?:on|addEventListener)\s*\(\s*["'`](connection|message|close|error|open)["'`]/gi;

const HANDLER_PATTERN =
    /\b(?:onmessage|onclose|onerror|onopen)\s*=/gi;

function collectEvents(content) {
    const events = [];
    let match;

    while ((match = EVENT_PATTERN.exec(content)) !== null) {
        events.push(match[1]);
    }

    while ((match = HANDLER_PATTERN.exec(content)) !== null) {
        events.push(match[0].replace(/^on/i, "").replace("=", "").trim());
    }

    return [...new Set(events)];
}

export async function detectWebSocketEvents(filePath) {
    const content = await fs.readFile(filePath, "utf-8");

    const isServer = SERVER_EVIDENCE_PATTERN.test(content);
    const isClient = CLIENT_EVIDENCE_PATTERN.test(content);

    if (!isServer && !isClient) {
        return [];
    }

    let role = "unknown";

    if (isServer && !isClient) {
        role = "server";
    } else if (isClient && !isServer) {
        role = "client";
    }

    const events = collectEvents(content);

    if (isServer && events.length === 0) {
        events.push("connection");
    }

    return events.map((event) => ({
        type: "realtime",
        protocol: "websocket",
        framework: "WebSocket",
        role,
        event,
    }));
}
