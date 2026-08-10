import fs from "node:fs/promises";

const SEND_ASYNC_PATTERN =
    /\bSendAsync\s*\(\s*(?:@?\$?|\$?@?)["']([^"'`]+)["']/g;

const CLIENT_ON_PATTERN =
    /\.On(?:<[^>]+>)?\s*\(\s*(?:@?\$?|\$?@?)["']([^"'`]+)["']/g;

const HUB_METHOD_PATTERN =
    /\bpublic\s+(?:async\s+)?(?:Task|ValueTask|void)\s+([A-Z][A-Za-z_]\w*)\s*\(/g;

export async function detectSignalRInterfaces(filePath) {
    const content = await fs.readFile(filePath, "utf-8");

    const hasSignalREvidence =
        /Microsoft\.AspNetCore\.SignalR/.test(content) ||
        /:\s*Hub(?:<[^>]+>)?\b/.test(content) ||
        /\bClients\.(?:All|Caller|Group|Others)\b/.test(content) ||
        /\bSendAsync\s*\(/.test(content);

    if (!hasSignalREvidence) {
        return [];
    }

    const interfaces = [];
    const events = new Set();
    let match;

    while ((match = SEND_ASYNC_PATTERN.exec(content)) !== null) {
        events.add(match[1]);
    }

    while ((match = HUB_METHOD_PATTERN.exec(content)) !== null) {
        if (!/^(OnConnectedAsync|OnDisconnectedAsync)$/.test(match[1])) {
            events.add(match[1]);
        }
    }

    for (const event of events) {
        interfaces.push({
            type: "realtime",
            protocol: "signalr",
            framework: "SignalR",
            role: "server",
            event,
        });
    }

    while ((match = CLIENT_ON_PATTERN.exec(content)) !== null) {
        interfaces.push({
            type: "realtime",
            protocol: "signalr",
            framework: "SignalR",
            role: "client",
            event: match[1],
        });
    }

    return interfaces;
}
