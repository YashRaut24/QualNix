import fs from "node:fs/promises";
import path from "node:path";
import { resolveProjectPath } from "./pathUtils.js";
import { scanProjectDirectory } from "./projectScanner.js";

const LANGUAGE_BY_EXTENSION = new Map([
    [".js", "javascript"],
    [".mjs", "javascript"],
    [".cjs", "javascript"],
    [".jsx", "javascript"],
    [".ts", "typescript"],
    [".tsx", "typescript"],
    [".py", "python"],
    [".java", "java"],
    [".cs", "csharp"],
    [".go", "go"],
    [".php", "php"],
    [".rb", "ruby"],
    [".rs", "rust"],
    [".kt", "kotlin"],
    [".kts", "kotlin"],
    [".swift", "swift"],
    [".dart", "dart"],
    [".scala", "scala"],
    [".sc", "scala"],
    [".ex", "elixir"],
    [".exs", "elixir"],
]);

function detectLanguage(file) {
    return (
        LANGUAGE_BY_EXTENSION.get(
            path.extname(file).toLowerCase()
        ) ?? null
    );
}

function findLineNumber(content, index) {
    return content.slice(0, index).split("\n").length;
}

export function isClientFile(file, content) {
    const normalizedPath = file.replace(/\\/g, "/").toLowerCase();
    if (
        normalizedPath.includes("/client/") ||
        normalizedPath.startsWith("client/") ||
        normalizedPath.includes("/frontend/") ||
        normalizedPath.startsWith("frontend/") ||
        normalizedPath.includes("/ui/") ||
        normalizedPath.includes("/components/") ||
        normalizedPath.includes("/pages/") ||
        normalizedPath.includes("/views/") ||
        normalizedPath.includes("/src/client/") ||
        normalizedPath.endsWith(".jsx") ||
        normalizedPath.endsWith(".tsx") ||
        normalizedPath.endsWith(".vue") ||
        normalizedPath.endsWith(".svelte")
    ) {
        return true;
    }
    if (
        /(?:from\s*["']react["']|from\s*["']vue["']|from\s*["']svelte["']|from\s*["']@angular|["']socket\.io-client["'])/i.test(content)
    ) {
        return true;
    }
    return false;
}

export function isServerFile(file, content) {
    const normalizedPath = file.replace(/\\/g, "/").toLowerCase();
    if (
        normalizedPath.includes("/server/") ||
        normalizedPath.startsWith("server/") ||
        normalizedPath.includes("/backend/") ||
        normalizedPath.startsWith("backend/") ||
        normalizedPath.includes("/api/") ||
        normalizedPath.includes("/controllers/") ||
        normalizedPath.includes("/routes/") ||
        normalizedPath.includes("/sockets/") ||
        normalizedPath.includes("/services/") ||
        normalizedPath.includes("/models/")
    ) {
        return true;
    }
    if (
        /(?:from\s*["']express["']|from\s*["']fastify["']|from\s*["']@nestjs|from\s*["']socket\.io["']|from\s*["']koa["']|require\s*\(\s*["'](?:express|fastify|socket\.io|koa)["']\))/i.test(content) ||
        /\bio\.on\s*\(\s*["']connection["']/.test(content) ||
        /\bnew\s+Server\s*\(/.test(content)
    ) {
        return true;
    }
    return false;
}

function findScopeEnd(content, startIndex) {
    let depth = 0;
    let inSingleQuote = false;
    let inDoubleQuote = false;
    let inTemplate = false;
    let inLineComment = false;
    let inBlockComment = false;
    let escaped = false;

    for (let i = startIndex; i < content.length; i++) {
        const char = content[i];
        const next = content[i + 1];

        if (inLineComment) {
            if (char === "\n") inLineComment = false;
            continue;
        }

        if (inBlockComment) {
            if (char === "*" && next === "/") {
                inBlockComment = false;
                i++;
            }
            continue;
        }

        if (escaped) {
            escaped = false;
            continue;
        }

        if ((inSingleQuote || inDoubleQuote || inTemplate) && char === "\\") {
            escaped = true;
            continue;
        }

        if (!inSingleQuote && !inDoubleQuote && !inTemplate && char === "/" && next === "/") {
            inLineComment = true;
            i++;
            continue;
        }

        if (!inSingleQuote && !inDoubleQuote && !inTemplate && char === "/" && next === "*") {
            inBlockComment = true;
            i++;
            continue;
        }

        if (!inDoubleQuote && !inTemplate && char === "'") {
            inSingleQuote = !inSingleQuote;
            continue;
        }

        if (!inSingleQuote && !inTemplate && char === '"') {
            inDoubleQuote = !inDoubleQuote;
            continue;
        }

        if (!inSingleQuote && !inDoubleQuote && char === "`") {
            inTemplate = !inTemplate;
            continue;
        }

        if (inSingleQuote || inDoubleQuote || inTemplate) {
            continue;
        }

        if (char === "{") {
            depth++;
        }

        if (char === "}") {
            depth--;
            if (depth === 0) {
                return i;
            }
        }
    }

    return -1;
}

function findPythonScopeEnd(content, defIndex) {
    const lines = content.slice(defIndex).split("\n");
    if (lines.length === 0) return defIndex;

    const firstLine = lines[0];
    const baseIndentMatch = firstLine.match(/^(\s*)/);
    const baseIndent = baseIndentMatch ? baseIndentMatch[1].length : 0;

    let totalLength = firstLine.length;
    let foundFirstIndentedLine = false;

    for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();

        if (!trimmed || trimmed.startsWith("#")) {
            totalLength += 1 + line.length;
            continue;
        }

        const currentIndentMatch = line.match(/^(\s*)/);
        const currentIndent = currentIndentMatch ? currentIndentMatch[1].length : 0;

        if (currentIndent > baseIndent) {
            foundFirstIndentedLine = true;
            totalLength += 1 + line.length;
        } else {
            if (foundFirstIndentedLine || currentIndent <= baseIndent) {
                break;
            }
        }
    }

    return defIndex + totalLength;
}

const DATABASE_PATTERNS = [
    /\b([A-Z][A-Za-z0-9_$]*)\.(find|findOne|findById|findByIdAndUpdate|findByIdAndDelete|create|insertMany|updateOne|updateMany|deleteOne|deleteMany|save|destroy|upsert|countDocuments|aggregate)\s*\(/g,
    /\bprisma\.([a-zA-Z0-9_$]+)\.(findMany|findUnique|findFirst|create|createMany|update|updateMany|delete|deleteMany|upsert|count|aggregate)\s*\(/g,
    /\b([A-Z][A-Za-z0-9_]*)\.objects\.(create|get|filter|all|update|delete|bulk_create)\s*\(/g,
    /\b([A-Z][A-Za-z0-9_]*)\.query\.(filter|get|all|first|filter_by)\s*\(/g,
    /\b([a-zA-Z0-9_$]*(?:Repository|Repo|Dao|Service))\.(save|saveAll|insert|create|delete|deleteById|findById|findAll)\s*\(/g,
    /\b(?:context|_context|dbContext)\.([A-Z][A-Za-z0-9_]*)\.(Add|AddRange|Remove|RemoveRange|Update|Find|FirstOrDefault)\s*\(/g,
    /\b(?:db|database|connection|pool|session)\.(query|execute|run|prepare|insertOne|insertMany|updateOne|updateMany|deleteOne|deleteMany|find)\s*\(/gi,
    /\b(?:session|db\.session)\.(add|commit|delete|rollback)\s*\(/gi,
];

function normalizeModelName(rawName) {
    if (!rawName) return null;
    let name = rawName.trim();
    if (name.endsWith("Repository")) {
        name = name.slice(0, -10);
    } else if (name.endsWith("Repo")) {
        name = name.slice(0, -4);
    }
    if (name.length > 0) {
        name = name.charAt(0).toUpperCase() + name.slice(1);
    }
    return name;
}

function normalizeDbOperation(rawOp) {
    if (!rawOp) return "query";
    const op = rawOp.toLowerCase();
    if (op.includes("delete") || op.includes("destroy") || op.includes("remove")) {
        return "delete";
    }
    if (op.includes("update") || op.includes("upsert") || op.includes("modify")) {
        return "update";
    }
    if (op.includes("save") || op.includes("add") || op.includes("insert") || op.includes("create") || op.includes("bulk_create")) {
        return "create";
    }
    if (op.includes("find") || op.includes("get") || op.includes("first") || op.includes("filter") || op.includes("all") || op.includes("query") || op.includes("count") || op.includes("read")) {
        return "find";
    }
    return op;
}

export function extractDatabaseOperations(bodyContent) {
    if (!bodyContent) return [];
    const operations = [];
    const seen = new Set();

    for (const regex of DATABASE_PATTERNS) {
        regex.lastIndex = 0;
        let match;
        while ((match = regex.exec(bodyContent)) !== null) {
            let model = null;
            let operation = null;

            if (match.length >= 3) {
                model = normalizeModelName(match[1]);
                operation = normalizeDbOperation(match[2]);
            } else if (match.length === 2) {
                model = "Database";
                operation = normalizeDbOperation(match[1]);
            }

            if (model && operation) {
                const key = `${model}:${operation}`;
                if (!seen.has(key)) {
                    seen.add(key);
                    operations.push({
                        model,
                        operation,
                    });
                }
            }
        }
    }

    return operations;
}

const SERVER_EMIT_PATTERNS = [
    /\b(?:socket|io|this\.server|server|ns|nsp|room)(?:\.[a-zA-Z0-9_$]+)*\.(?:emit|send)\s*\(\s*["'`]([^"'`]+)["'`]/gi,
    /\bClients\.(?:All|Others|Group|Caller|Client|User)\.SendAsync\s*\(\s*(?:@?\$?|\$?@?)["']([^"'`]+)["']/gi,
    /\bemit\s*\(\s*["'`]([^"'`]+)["'`]/gi,
    /\b(?:ws|conn|client|socket)\.send\s*\(\s*["'`]([^"'`]+)["'`]/gi,
    /\b(?:ws|conn|client|socket)\.send\s*\(\s*JSON\.stringify\s*\(\s*\{[^}]*?(?:type|event)\s*:\s*["'`]([^"'`]+)["'`]/gi,
];

export function extractServerEmits(bodyContent) {
    if (!bodyContent) return [];
    const events = [];
    const seen = new Set();

    for (const regex of SERVER_EMIT_PATTERNS) {
        regex.lastIndex = 0;
        let match;
        while ((match = regex.exec(bodyContent)) !== null) {
            const eventName = match[1];
            if (eventName && !seen.has(eventName)) {
                seen.add(eventName);
                events.push(eventName);
            }
        }
    }

    return events;
}

const CLIENT_TRIGGER_PATTERNS = [
    {
        type: "realtime",
        protocol: "socketio",
        framework: "Socket.IO",
        pattern: /\bsocket\.emit\s*\(\s*["'`]([^"'`]+)["'`]/g,
        extract: (match, content, file) => ({
            event: match[1],
            direction: "outgoing",
            file,
            line: findLineNumber(content, match.index),
        }),
    },
    {
        type: "realtime",
        protocol: "websocket",
        framework: "WebSocket",
        pattern: /\b(?:ws|socket|client)\.send\s*\(\s*(?:JSON\.stringify\s*\(\s*\{[^}]*?(?:type|event|action)\s*:\s*)?["'`]([^"'`]+)["'`]/g,
        extract: (match, content, file) => ({
            event: match[1],
            direction: "outgoing",
            file,
            line: findLineNumber(content, match.index),
        }),
    },
    {
        type: "realtime",
        protocol: "signalr",
        framework: "SignalR",
        pattern: /\b(?:connection|hubConnection)\.(?:invoke|send)\s*\(\s*["'`]([^"'`]+)["'`]/g,
        extract: (match, content, file) => ({
            event: match[1],
            direction: "outgoing",
            file,
            line: findLineNumber(content, match.index),
        }),
    },
    {
        type: "http",
        protocol: "rest",
        framework: "Fetch",
        pattern: /\bfetch\s*\(\s*["'`]([^"'`]+)["'`]\s*(?:,\s*\{[\s\S]*?method\s*:\s*["'`](GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)["'`])?/gi,
        extract: (match, content, file) => ({
            path: match[1],
            method: (match[2] || "GET").toUpperCase(),
            direction: "outgoing",
            file,
            line: findLineNumber(content, match.index),
        }),
    },
    {
        type: "http",
        protocol: "rest",
        framework: "Axios",
        pattern: /\b(?:axios|api|client|httpClient|http)\.(get|post|put|patch|delete|head|options)\s*\(\s*["'`]([^"'`]+)["'`]/gi,
        extract: (match, content, file) => ({
            path: match[2],
            method: match[1].toUpperCase(),
            direction: "outgoing",
            file,
            line: findLineNumber(content, match.index),
        }),
    },
    {
        type: "http",
        protocol: "graphql",
        framework: "GraphQL",
        pattern: /\b(?:useMutation|useQuery|apolloClient\.mutate|client\.mutate|client\.query)\s*\(\s*([A-Za-z0-9_$]+)/g,
        extract: (match, content, file) => ({
            name: match[1],
            operationType: match[0].includes("Mutation") || match[0].includes("mutate") ? "mutation" : "query",
            direction: "outgoing",
            file,
            line: findLineNumber(content, match.index),
        }),
    },
    {
        type: "rpc",
        protocol: "grpc",
        framework: "gRPC",
        pattern: /\b(?:client|stub)\.([A-Z][a-zA-Z0-9_]*)\s*\(/g,
        extract: (match, content, file) => ({
            method: match[1],
            direction: "outgoing",
            file,
            line: findLineNumber(content, match.index),
        }),
    },
];

const CLIENT_LISTENER_PATTERNS = [
    {
        type: "realtime",
        protocol: "socketio",
        framework: "Socket.IO",
        pattern: /\bsocket\.on\s*\(\s*["'`]([^"'`]+)["'`]/g,
        extract: (match, content, file) => ({
            event: match[1],
            direction: "incoming",
            file,
            line: findLineNumber(content, match.index),
        }),
    },
    {
        type: "realtime",
        protocol: "signalr",
        framework: "SignalR",
        pattern: /\b(?:connection|hubConnection)\.on\s*\(\s*["'`]([^"'`]+)["'`]/g,
        extract: (match, content, file) => ({
            event: match[1],
            direction: "incoming",
            file,
            line: findLineNumber(content, match.index),
        }),
    },
    {
        type: "realtime",
        protocol: "websocket",
        framework: "WebSocket",
        pattern: /\b(?:ws|socket|client)\.(?:on|addEventListener)\s*\(\s*["'`](message|open|close|error|[^"'`]+)["'`]/gi,
        extract: (match, content, file) => ({
            event: match[1],
            direction: "incoming",
            file,
            line: findLineNumber(content, match.index),
        }),
    },
];

export async function extractClientTriggersAndListeners(files, projectRoot) {
    const triggers = [];
    const listeners = [];

    for (const file of files) {
        const language = detectLanguage(file);
        if (!language) continue;

        const absolutePath = resolveProjectPath(file);
        let content;
        try {
            content = await fs.readFile(absolutePath, "utf-8");
        } catch {
            continue;
        }

        for (const rule of CLIENT_TRIGGER_PATTERNS) {
            rule.pattern.lastIndex = 0;
            let match;
            while ((match = rule.pattern.exec(content)) !== null) {
                const item = rule.extract(match, content, file);
                triggers.push({
                    type: rule.type,
                    protocol: rule.protocol,
                    framework: rule.framework,
                    ...item,
                });
            }
        }

        for (const rule of CLIENT_LISTENER_PATTERNS) {
            rule.pattern.lastIndex = 0;
            let match;
            while ((match = rule.pattern.exec(content)) !== null) {
                const item = rule.extract(match, content, file);
                listeners.push({
                    type: rule.type,
                    protocol: rule.protocol,
                    framework: rule.framework,
                    ...item,
                });
            }
        }
    }

    return { triggers, listeners };
}

export function extractServerHandlerScopes(content, language, file) {
    const handlers = [];

    if (isClientFile(file, content) && !isServerFile(file, content)) {
        return handlers;
    }

    if (language === "javascript" || language === "typescript") {
        const socketOnRegex = /\b(?:socket|ws|conn|client|io|wss)\.on\s*\(\s*["'`]([^"'`]+)["'`]\s*,\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>|\b(?:socket|ws|conn|client|io|wss)\.on\s*\(\s*["'`]([^"'`]+)["'`]\s*,\s*(?:async\s*)?function\s*\w*\s*\([^)]*\)/g;
        let match;
        while ((match = socketOnRegex.exec(content)) !== null) {
            const event = match[1] || match[2];
            if (event === "connection") continue;
            const start = match.index;
            const openBrace = content.indexOf("{", socketOnRegex.lastIndex - 2);
            if (openBrace !== -1) {
                const closeBrace = findScopeEnd(content, openBrace);
                if (closeBrace !== -1) {
                    const body = content.slice(openBrace, closeBrace + 1);
                    const line = findLineNumber(content, start);
                    const isWs = (content.includes("WebSocket") || content.includes("ws")) && !content.includes("socket.io");
                    const protocol = isWs ? "websocket" : "socketio";
                    const framework = isWs ? "WebSocket" : "Socket.IO";
                    const handlerPrefix = isWs ? "ws" : "socket";
                    handlers.push({
                        type: "realtime",
                        protocol,
                        framework,
                        event,
                        handler: `${handlerPrefix}.on("${event}")`,
                        file,
                        line,
                        body,
                    });
                }
            }
        }

        const httpRouteRegex = /\b(?:app|router|fastify)\.(get|post|put|patch|delete|options|head)\s*\(\s*["'`]([^"'`]+)["'`]\s*,\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>|\b(?:app|router|fastify)\.(get|post|put|patch|delete|options|head)\s*\(\s*["'`]([^"'`]+)["'`]\s*,\s*(?:async\s*)?function\s*\w*\s*\([^)]*\)/gi;
        while ((match = httpRouteRegex.exec(content)) !== null) {
            const method = (match[1] || match[3]).toUpperCase();
            const routePath = match[2] || match[4];
            const start = match.index;
            const openBrace = content.indexOf("{", httpRouteRegex.lastIndex - 2);
            if (openBrace !== -1) {
                const closeBrace = findScopeEnd(content, openBrace);
                if (closeBrace !== -1) {
                    const body = content.slice(openBrace, closeBrace + 1);
                    const line = findLineNumber(content, start);
                    handlers.push({
                        type: "http",
                        protocol: "rest",
                        framework: content.includes("fastify") ? "Fastify" : "Express",
                        method,
                        path: routePath,
                        handler: `${content.includes("router.") ? "router" : "app"}.${method.toLowerCase()}("${routePath}")`,
                        file,
                        line,
                        body,
                    });
                }
            }
        }

        const nestJsMethodRegex = /@(Get|Post|Put|Patch|Delete)\s*\(\s*(?:["'`]([^"'`]+)["'`])?\s*\)\s*(?:async\s+)?([a-zA-Z0-9_$]+)\s*\([^)]*\)\s*\{/g;
        while ((match = nestJsMethodRegex.exec(content)) !== null) {
            const method = match[1].toUpperCase();
            const routePath = match[2] || "/";
            const methodName = match[3];
            const start = match.index;
            const openBrace = content.indexOf("{", nestJsMethodRegex.lastIndex - 1);
            if (openBrace !== -1) {
                const closeBrace = findScopeEnd(content, openBrace);
                if (closeBrace !== -1) {
                    const body = content.slice(openBrace, closeBrace + 1);
                    const line = findLineNumber(content, start);
                    handlers.push({
                        type: "http",
                        protocol: "rest",
                        framework: "NestJS",
                        method,
                        path: routePath,
                        handler: `@${match[1]}("${routePath}") ${methodName}()`,
                        file,
                        line,
                        body,
                    });
                }
            }
        }
    } else if (language === "python") {
        let match;
        const grpcServicerRegex = /class\s+([A-Za-z0-9_]*Servicer[A-Za-z0-9_]*)\s*(?:\([^)]*\))?\s*:/g;
        while ((match = grpcServicerRegex.exec(content)) !== null) {
            const className = match[1];
            const classBodyEnd = findPythonScopeEnd(content, grpcServicerRegex.lastIndex);
            const classBody = content.slice(grpcServicerRegex.lastIndex, classBodyEnd);
            const methodRegex = /def\s+([A-Z][A-Za-z0-9_]*)\s*\(\s*self\s*,\s*([^)]*)\)\s*:/g;
            let methodMatch;
            while ((methodMatch = methodRegex.exec(classBody)) !== null) {
                const methodName = methodMatch[1];
                const methodStart = grpcServicerRegex.lastIndex + methodMatch.index;
                const methodBodyEnd = findPythonScopeEnd(classBody, methodRegex.lastIndex);
                const methodBody = classBody.slice(methodRegex.lastIndex, methodBodyEnd);
                const line = findLineNumber(content, methodStart);
                handlers.push({
                    type: "rpc",
                    protocol: "grpc",
                    framework: "gRPC",
                    event: methodName,
                    method: methodName,
                    handler: `${className}.${methodName}`,
                    file,
                    line,
                    body: methodBody,
                });
            }
        }

        const flaskSocketIoRegex = /@(?:socketio|[A-Za-z0-9_]+)\.on\s*\(\s*["'`]([^"'`]+)["'`]\s*\)\s*(?:async\s+)?def\s+([A-Za-z0-9_]+)\s*\([^)]*\)\s*:/g;
        while ((match = flaskSocketIoRegex.exec(content)) !== null) {
            const event = match[1];
            const funcName = match[2];
            const start = match.index;
            const bodyEnd = findPythonScopeEnd(content, flaskSocketIoRegex.lastIndex);
            const body = content.slice(flaskSocketIoRegex.lastIndex, bodyEnd);
            const line = findLineNumber(content, start);
            handlers.push({
                type: "realtime",
                protocol: "socketio",
                framework: "Flask-SocketIO",
                event,
                handler: `@socketio.on("${event}") ${funcName}`,
                file,
                line,
                body,
            });
        }

        const pythonHttpRegex = /@(?:app|router|bp)\.(get|post|put|patch|delete|route)\s*\(\s*["'`]([^"'`]+)["'`][^)]*\)\s*(?:async\s+)?def\s+([A-Za-z0-9_]+)\s*\([^)]*\)\s*:/g;
        while ((match = pythonHttpRegex.exec(content)) !== null) {
            let method = match[1].toUpperCase();
            if (method === "ROUTE") {
                const methodMatch = match[0].match(/methods\s*=\s*\[\s*["'`](GET|POST|PUT|PATCH|DELETE)["'`]/i);
                method = methodMatch ? methodMatch[1].toUpperCase() : "GET";
            }
            const routePath = match[2];
            const funcName = match[3];
            const start = match.index;
            const bodyEnd = findPythonScopeEnd(content, pythonHttpRegex.lastIndex);
            const body = content.slice(pythonHttpRegex.lastIndex, bodyEnd);
            const line = findLineNumber(content, start);
            handlers.push({
                type: "http",
                protocol: "rest",
                framework: "Flask/FastAPI",
                method,
                path: routePath,
                handler: `@app.${method.toLowerCase()}("${routePath}") ${funcName}`,
                file,
                line,
                body,
            });
        }
    } else if (language === "csharp") {
        const hubMethodRegex = /public\s+(?:async\s+)?(?:Task|ValueTask|void)\s+([A-Z][A-Za-z0-9_]*)\s*\([^)]*\)\s*\{/g;
        let match;
        while ((match = hubMethodRegex.exec(content)) !== null) {
            const methodName = match[1];
            if (/^(OnConnectedAsync|OnDisconnectedAsync)$/.test(methodName)) continue;
            const start = match.index;
            const openBrace = content.indexOf("{", hubMethodRegex.lastIndex - 1);
            if (openBrace !== -1) {
                const closeBrace = findScopeEnd(content, openBrace);
                if (closeBrace !== -1) {
                    const body = content.slice(openBrace, closeBrace + 1);
                    const line = findLineNumber(content, start);
                    handlers.push({
                        type: "realtime",
                        protocol: "signalr",
                        framework: "SignalR",
                        event: methodName,
                        handler: `Hub.${methodName}()`,
                        file,
                        line,
                        body,
                    });
                }
            }
        }
    } else if (language === "go") {
        const goRouteRegex = /\b(?:r|router|e|app)\.(GET|POST|PUT|PATCH|DELETE)\s*\(\s*["'`]([^"'`]+)["'`]\s*,\s*func\s*\([^)]*\)\s*\{/g;
        let match;
        while ((match = goRouteRegex.exec(content)) !== null) {
            const method = match[1].toUpperCase();
            const routePath = match[2];
            const start = match.index;
            const openBrace = content.indexOf("{", goRouteRegex.lastIndex - 1);
            if (openBrace !== -1) {
                const closeBrace = findScopeEnd(content, openBrace);
                if (closeBrace !== -1) {
                    const body = content.slice(openBrace, closeBrace + 1);
                    const line = findLineNumber(content, start);
                    handlers.push({
                        type: "http",
                        protocol: "rest",
                        framework: "Go",
                        method,
                        path: routePath,
                        handler: `${method}("${routePath}")`,
                        file,
                        line,
                        body,
                    });
                }
            }
        }
    } else if (language === "java" || language === "kotlin") {
        const springRegex = /@(PostMapping|GetMapping|PutMapping|DeleteMapping|PatchMapping|MessageMapping)\s*\(\s*(?:value\s*=\s*)?(?:["'`]([^"'`]+)["'`])?\s*\)[\s\S]*?(?:public|protected)?\s*(?:[A-Za-z0-9_<>[\]]+)\s+([A-Za-z0-9_]+)\s*\([^)]*\)\s*\{/g;
        let match;
        while ((match = springRegex.exec(content)) !== null) {
            const annotation = match[1];
            const routePath = match[2] || "/";
            const methodName = match[3];
            const start = match.index;
            const openBrace = content.indexOf("{", springRegex.lastIndex - 1);
            if (openBrace !== -1) {
                const closeBrace = findScopeEnd(content, openBrace);
                if (closeBrace !== -1) {
                    const body = content.slice(openBrace, closeBrace + 1);
                    const line = findLineNumber(content, start);
                    if (annotation === "MessageMapping") {
                        handlers.push({
                            type: "realtime",
                            protocol: "websocket",
                            framework: "Spring WebSocket",
                            event: routePath,
                            handler: `@MessageMapping("${routePath}") ${methodName}`,
                            file,
                            line,
                            body,
                        });
                    } else {
                        const method = annotation.replace("Mapping", "").toUpperCase();
                        handlers.push({
                            type: "http",
                            protocol: "rest",
                            framework: "Spring",
                            method,
                            path: routePath,
                            handler: `@${annotation}("${routePath}") ${methodName}`,
                            file,
                            line,
                            body,
                        });
                    }
                }
            }
        }
    }

    return handlers;
}

function pathsMatch(clientPath, serverPath) {
    if (!clientPath || !serverPath) return false;
    const cleanClient = clientPath.split("?")[0].replace(/\/+/g, "/").replace(/\/$/, "");
    const cleanServer = serverPath.split("?")[0].replace(/\/+/g, "/").replace(/\/$/, "");

    if (cleanClient === cleanServer) return true;
    if (cleanClient.endsWith(cleanServer) || cleanServer.endsWith(cleanClient)) return true;

    const clientSegments = cleanClient.split("/").filter(Boolean);
    const serverSegments = cleanServer.split("/").filter(Boolean);

    const minLength = Math.min(clientSegments.length, serverSegments.length);
    if (minLength === 0) return false;

    let matches = 0;
    for (let i = 0; i < minLength; i++) {
        const c = clientSegments[clientSegments.length - 1 - i];
        const s = serverSegments[serverSegments.length - 1 - i];
        if (c === s || s.startsWith(":") || s.startsWith("{") || c.startsWith(":") || c.startsWith("{")) {
            matches++;
        }
    }

    return matches === minLength && matches >= 1;
}

export async function buildCrossLayerFlows(files, projectRoot, options = {}) {
    const protocolFilter = options.protocol && options.protocol !== "all"
        ? options.protocol.toLowerCase()
        : null;

    const { triggers: clientTriggers, listeners: clientListeners } =
        await extractClientTriggersAndListeners(files, projectRoot);

    const serverHandlers = [];
    for (const file of files) {
        const language = detectLanguage(file);
        if (!language) continue;

        const absolutePath = resolveProjectPath(file);
        let content;
        try {
            content = await fs.readFile(absolutePath, "utf-8");
        } catch {
            continue;
        }

        const handlers = extractServerHandlerScopes(content, language, file);
        serverHandlers.push(...handlers);
    }

    const flows = [];
    const matchedServerHandlers = new Set();
    const matchedClientTriggers = new Set();

    for (const trigger of clientTriggers) {
        if (trigger.protocol === "socketio" || trigger.protocol === "signalr" || trigger.protocol === "websocket") {
            if (protocolFilter && trigger.protocol !== protocolFilter) continue;

            const matchingServer = serverHandlers.find((server) =>
                server.type === "realtime" &&
                server.event === trigger.event
            );

            let databaseOperations = [];
            let serverOutputs = [];
            let matchingClientListeners = [];

            if (matchingServer) {
                matchedServerHandlers.add(matchingServer);
                databaseOperations = extractDatabaseOperations(matchingServer.body);
                serverOutputs = extractServerEmits(matchingServer.body);

                for (const outEvent of serverOutputs) {
                    const listenerMatches = clientListeners.filter((listener) =>
                        listener.event === outEvent
                    );
                    if (listenerMatches.length > 0) {
                        matchingClientListeners.push(outEvent);
                    }
                }

                if (serverOutputs.length === 0) {
                    const potentialResponseEvent = `${trigger.event}:response`;
                    const listenerMatches = clientListeners.filter((listener) =>
                        listener.event === potentialResponseEvent
                    );
                    if (listenerMatches.length > 0) {
                        serverOutputs.push(potentialResponseEvent);
                        matchingClientListeners.push(potentialResponseEvent);
                    }
                }
            }

            matchedClientTriggers.add(trigger);

            flows.push({
                event: trigger.event,
                protocol: trigger.protocol,
                type: trigger.type,
                client: {
                    direction: "outgoing",
                    file: trigger.file,
                    line: trigger.line,
                },
                server: matchingServer ? {
                    handler: matchingServer.handler,
                    file: matchingServer.file,
                    line: matchingServer.line,
                } : null,
                databaseOperations,
                serverOutputs,
                clientListeners: [...new Set(matchingClientListeners)],
            });
        }
    }

    for (const trigger of clientTriggers) {
        if (trigger.type === "http" && trigger.protocol === "rest") {
            if (protocolFilter && protocolFilter !== "rest" && protocolFilter !== "http") continue;

            const matchingServer = serverHandlers.find((server) =>
                server.type === "http" &&
                server.method === trigger.method &&
                pathsMatch(trigger.path, server.path)
            );

            let databaseOperations = [];
            let serverOutputs = [];
            let matchingClientListeners = [];

            if (matchingServer) {
                matchedServerHandlers.add(matchingServer);
                databaseOperations = extractDatabaseOperations(matchingServer.body);
                serverOutputs = extractServerEmits(matchingServer.body);

                for (const outEvent of serverOutputs) {
                    const listenerMatches = clientListeners.filter((listener) =>
                        listener.event === outEvent
                    );
                    if (listenerMatches.length > 0) {
                        matchingClientListeners.push(outEvent);
                    }
                }
            }

            matchedClientTriggers.add(trigger);

            flows.push({
                method: trigger.method,
                path: trigger.path,
                protocol: trigger.protocol,
                type: trigger.type,
                client: {
                    direction: "outgoing",
                    file: trigger.file,
                    line: trigger.line,
                },
                server: matchingServer ? {
                    handler: matchingServer.handler,
                    file: matchingServer.file,
                    line: matchingServer.line,
                } : null,
                databaseOperations,
                serverOutputs,
                clientListeners: [...new Set(matchingClientListeners)],
            });
        }
    }

    for (const trigger of clientTriggers) {
        if (trigger.protocol === "graphql" || trigger.protocol === "grpc") {
            if (protocolFilter && trigger.protocol !== protocolFilter) continue;

            const matchingServer = serverHandlers.find((server) =>
                server.protocol === trigger.protocol &&
                (server.event === trigger.name || server.event === trigger.method)
            );

            let databaseOperations = [];
            let serverOutputs = [];
            let matchingClientListeners = [];

            if (matchingServer) {
                matchedServerHandlers.add(matchingServer);
                databaseOperations = extractDatabaseOperations(matchingServer.body);
                serverOutputs = extractServerEmits(matchingServer.body);

                for (const outEvent of serverOutputs) {
                    const listenerMatches = clientListeners.filter((listener) =>
                        listener.event === outEvent
                    );
                    if (listenerMatches.length > 0) {
                        matchingClientListeners.push(outEvent);
                    }
                }
            }

            matchedClientTriggers.add(trigger);

            const flowObj = {
                protocol: trigger.protocol,
                type: trigger.type,
                client: {
                    direction: "outgoing",
                    file: trigger.file,
                    line: trigger.line,
                },
                server: matchingServer ? {
                    handler: matchingServer.handler,
                    file: matchingServer.file,
                    line: matchingServer.line,
                } : null,
                databaseOperations,
                serverOutputs,
                clientListeners: [...new Set(matchingClientListeners)],
            };

            if (trigger.name || trigger.method) {
                flowObj.name = trigger.name || trigger.method;
                flowObj.method = trigger.method || trigger.name;
            }
            if (trigger.operationType) {
                flowObj.operationType = trigger.operationType;
            }

            flows.push(flowObj);
        }
    }

    for (const server of serverHandlers) {
        if (!matchedServerHandlers.has(server)) {
            if (protocolFilter && server.protocol !== protocolFilter) continue;

            const databaseOperations = extractDatabaseOperations(server.body);
            const serverOutputs = extractServerEmits(server.body);
            const matchingClientListeners = [];

            for (const outEvent of serverOutputs) {
                const listenerMatches = clientListeners.filter((listener) =>
                    listener.event === outEvent
                );
                if (listenerMatches.length > 0) {
                    matchingClientListeners.push(outEvent);
                }
            }

            const flowItem = {
                protocol: server.protocol,
                type: server.type,
                client: null,
                server: {
                    handler: server.handler,
                    file: server.file,
                    line: server.line,
                },
                databaseOperations,
                serverOutputs,
                clientListeners: [...new Set(matchingClientListeners)],
            };

            if (server.event) {
                flowItem.event = server.event;
            } else if (server.method && server.path) {
                flowItem.method = server.method;
                flowItem.path = server.path;
            }

            flows.push(flowItem);
        }
    }

    return flows;
}
