import fs from "node:fs/promises";

const SOCKET_ON_PATTERN =
    /\bsocket\.on\s*\(\s*["'`]([^"'`]+)["'`]/gi;

const SOCKET_EMIT_PATTERN =
    /\bsocket\.emit\s*\(\s*["'`]([^"'`]+)["'`]/gi;

const IO_EMIT_PATTERN =
    /\bio(?:\.[a-zA-Z_$][\w$]*)*\.emit\s*\(\s*["'`]([^"'`]+)["'`]/gi;

const SERVER_CONNECTION_PATTERN =
    /\bio\.on\s*\(\s*["'`]connection["'`]\s*,/i;

const SOCKET_IO_SERVER_PATTERN =
    /\bnew\s+Server\s*\(/i;

const SOCKET_IO_SERVER_IMPORT_PATTERN =
    /(?:from\s*["'`]socket\.io["'`]|require\s*\(\s*["'`]socket\.io["'`]\s*\))/i;

const SOCKET_IO_CLIENT_IMPORT_PATTERN =
    /(?:from\s*["'`]socket\.io-client["'`]|require\s*\(\s*["'`]socket\.io-client["'`]\s*\))/i;

const SOCKET_IO_CLIENT_FACTORY_PATTERN =
    /\bio\s*\(/i;

function collectMatches(content, pattern) {
    const matches = [];
    let match;

    while ((match = pattern.exec(content)) !== null) {
        matches.push(match[1]);
    }

    return matches;
}

function collectUniqueEvents(content, pattern) {
    return [
        ...new Set(
            collectMatches(content, pattern)
        ),
    ];
}

export async function detectSocketIoEvents(filePath) {
    const content = await fs.readFile(
        filePath,
        "utf-8"
    );

    const isServer =
        SERVER_CONNECTION_PATTERN.test(content) ||
        (
            SOCKET_IO_SERVER_PATTERN.test(content) &&
            SOCKET_IO_SERVER_IMPORT_PATTERN.test(content)
        );

    const isClient =
        SOCKET_IO_CLIENT_IMPORT_PATTERN.test(content) &&
        SOCKET_IO_CLIENT_FACTORY_PATTERN.test(content);

    if (!isServer && !isClient) {
        return [];
    }

    const interfaces = [];

    if (isServer) {
        const serverHandlers =
            collectUniqueEvents(
                content,
                SOCKET_ON_PATTERN
            );

        for (const event of serverHandlers) {
            interfaces.push({
                type: "realtime",
                protocol: "socketio",
                framework: "Socket.IO",
                role: "server",
                direction: "incoming",
                event,
            });
        }

        const serverEmits =
            collectUniqueEvents(
                content,
                IO_EMIT_PATTERN
            );

        for (const event of serverEmits) {
            interfaces.push({
                type: "realtime",
                protocol: "socketio",
                framework: "Socket.IO",
                role: "server",
                direction: "outgoing",
                event,
            });
        }
    }

    if (isClient) {
        const clientEmits =
            collectUniqueEvents(
                content,
                SOCKET_EMIT_PATTERN
            );

        for (const event of clientEmits) {
            interfaces.push({
                type: "realtime",
                protocol: "socketio",
                framework: "Socket.IO",
                role: "client",
                direction: "outgoing",
                event,
            });
        }

        const clientListeners =
            collectUniqueEvents(
                content,
                SOCKET_ON_PATTERN
            );

        for (const event of clientListeners) {
            interfaces.push({
                type: "realtime",
                protocol: "socketio",
                framework: "Socket.IO",
                role: "client",
                direction: "incoming",
                event,
            });
        }
    }

    return interfaces;
}