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

export async function detectSocketIoEvents(filePath) {
    const content = await fs.readFile(filePath, "utf-8");

    const isServer =
        SERVER_CONNECTION_PATTERN.test(content) ||
        SOCKET_IO_SERVER_PATTERN.test(content);

    const isClient =
        SOCKET_IO_CLIENT_IMPORT_PATTERN.test(content) ||
        SOCKET_IO_CLIENT_FACTORY_PATTERN.test(content);

    if (!isServer && !isClient) {
        return [];
    }

    let role = "unknown";

    if (isServer && !isClient) {
        role = "server";
    } else if (isClient && !isServer) {
        role = "client";
    }

    const interfaces = [];

    const socketEvents = collectMatches(
        content,
        SOCKET_ON_PATTERN
    );

    const socketEmits = collectMatches(
        content,
        SOCKET_EMIT_PATTERN
    );

    const ioEmits = collectMatches(
        content,
        IO_EMIT_PATTERN
    );

    const events = [
        ...socketEvents,
        ...socketEmits,
        ...ioEmits,
    ];

    const uniqueEvents = [...new Set(events)];

    for (const event of uniqueEvents) {
        interfaces.push({
            type: "realtime",
            protocol: "socketio",
            framework: "Socket.IO",
            role,
            event,
        });
    }

    return interfaces;
}