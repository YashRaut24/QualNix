import fs from "node:fs/promises";

export async function detectDjangoChannelsInterfaces(filePath) {
    const content = await fs.readFile(filePath, "utf-8");

    const hasChannelsEvidence =
        /from\s+channels\./.test(content) ||
        /import\s+channels\b/.test(content) ||
        /\b(?:WebsocketConsumer|AsyncWebsocketConsumer|AsyncJsonWebsocketConsumer|JsonWebsocketConsumer)\b/.test(
            content
        ) ||
        /\bwebsocket_urlpatterns\b/.test(content) ||
        /\b(?:ProtocolTypeRouter|URLRouter)\s*\(/.test(content);

    if (!hasChannelsEvidence) {
        return [];
    }

    return [
        {
            type: "realtime",
            protocol: "websocket",
            framework: "Django Channels",
            role: "server",
            event: "websocket",
        },
    ];
}
