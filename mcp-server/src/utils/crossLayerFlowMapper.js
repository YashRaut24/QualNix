import fs from "node:fs/promises";
import path from "node:path";
import { resolveProjectPath } from "./pathUtils.js";
import { scanProjectDirectory } from "./projectScanner.js";
import { setProjectRoot } from "../context/projectContext.js";

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
        /(?:from\s*["']react["']|from\s*["']vue["']|from\s*["']svelte["']|from\s*["']@angular|["']socket\.io-client["'])/i.test(content) ||
        /(?:package:flutter|StatefulWidget|StatelessWidget|package:http|web_socket_channel)/i.test(content) ||
        /(?:import\s+SwiftUI|import\s+UIKit|URLSession\.shared|webSocketTask)/i.test(content) ||
        /(?:androidx\.compose|android\.app|io\.ktor\.client)/i.test(content) ||
        /(?:import\s+requests|import\s+httpx|import\s+aiohttp)/i.test(content)
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
        normalizedPath.includes("/models/") ||
        normalizedPath.includes("/handlers/") ||
        normalizedPath.includes("/channels/") ||
        normalizedPath.includes("/routers/")
    ) {
        return true;
    }
    if (
        /(?:from\s*["']express["']|from\s*["']fastify["']|from\s*["']@nestjs|from\s*["']socket\.io["']|from\s*["']koa["']|require\s*\(\s*["'](?:express|fastify|socket\.io|koa)["']\))/i.test(content) ||
        /\bio\.on\s*\(\s*["']connection["']/.test(content) ||
        /\bnew\s+Server\s*\(/.test(content) ||
        /(?:from\s+flask|from\s+fastapi|import\s+django|from\s+django|flask_socketio)/i.test(content) ||
        /(?:org\.springframework|@RestController|@Controller|io\.ktor\.server)/i.test(content) ||
        /(?:Microsoft\.AspNetCore|\[ApiController\]|\bHub\b|ControllerBase)/i.test(content) ||
        /(?:github\.com\/gin-gonic|fiber|echo|chi|gorilla\/websocket)/i.test(content) ||
        /(?:Illuminate\\Support\\Facades\\Route|\bRoute::|Symfony\\Component|Slim\\App)/i.test(content) ||
        /(?:Rails\.application|ActionController|Sinatra::Base|ActionCable)/i.test(content) ||
        /(?:actix_web|axum|rocket::|warp::|tonic::)/i.test(content) ||
        /(?:import\s+Vapor|RoutesBuilder|Vapor\.Application)/i.test(content) ||
        /(?:package:shelf|dart_frog)/i.test(content) ||
        /(?:play\.api|akka\.http|org\.http4s)/i.test(content) ||
        /(?:Phoenix\.Router|Phoenix\.Controller|Phoenix\.Channel|Phoenix\.Socket)/i.test(content)
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

function findRubyOrElixirScopeEnd(content, startIndex) {
    const lines = content.slice(startIndex).split("\n");
    let depth = 0;
    let totalLength = 0;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();

        if (
            /\b(?:def|do|class|module|if|unless|case|begin)\b/.test(trimmed) &&
            !trimmed.startsWith("#")
        ) {
            depth++;
        }

        if (/\bend\b/.test(trimmed) && !trimmed.startsWith("#")) {
            depth--;
            if (depth <= 0) {
                totalLength += line.length;
                return startIndex + totalLength;
            }
        }

        totalLength += line.length + 1;
    }

    return startIndex + totalLength;
}

const DATABASE_EXTRACTORS = [
    // Standard Object.operation(..) e.g. Card.create(..), User.findById(..)
    {
        pattern: /\b([A-Z][A-Za-z0-9_$]*)\.(find|findOne|findById|findByIdAndUpdate|findByIdAndDelete|create|insertMany|updateOne|updateMany|deleteOne|deleteMany|save|destroy|upsert|countDocuments|aggregate|all|where|first|delete|insert)\s*\(/g,
        extract: (m) => ({ model: m[1], operation: m[2] }),
    },
    // Prisma: prisma.column.updateMany(..)
    {
        pattern: /\bprisma\.([a-zA-Z0-9_$]+)\.(findMany|findUnique|findFirst|create|createMany|update|updateMany|delete|deleteMany|upsert|count|aggregate)\s*\(/g,
        extract: (m) => ({ model: m[1], operation: m[2] }),
    },
    // Django ORM: Task.objects.create(..) or Task.objects.filter(..).update(..)
    {
        pattern: /\b([A-Z][A-Za-z0-9_]*)\.objects(?:\.[a-zA-Z0-9_]+\([^)]*\))*\.(create|update|delete|bulk_create|get|filter|all)\s*\(/g,
        extract: (m) => ({ model: m[1], operation: m[2] }),
    },
    // SQLAlchemy: Task.query.filter(..)
    {
        pattern: /\b([A-Z][A-Za-z0-9_]*)\.query(?:\.[a-zA-Z0-9_]+\([^)]*\))*\.(filter|get|all|first|filter_by|update|delete)\s*\(/g,
        extract: (m) => ({ model: m[1], operation: m[2] }),
    },
    // Spring Repository / Dao: orderRepository.save(..)
    {
        pattern: /\b([a-zA-Z0-9_$]*(?:Repository|Repo|Dao|Service))\.(save|saveAll|saveAndFlush|insert|create|delete|deleteById|findById|findAll|getOne)\s*\(/g,
        extract: (m) => ({ model: m[1], operation: m[2] }),
    },
    // EF Core: _context.Messages.Add(..)
    {
        pattern: /\b(?:context|_context|dbContext)\.([A-Z][A-Za-z0-9_]*)\.(Add|AddRange|Remove|RemoveRange|Update|Find|FirstOrDefault|ToListAsync|SaveChanges|SaveChangesAsync)\s*\(/g,
        extract: (m) => ({ model: m[1], operation: m[2] }),
    },
    // Go GORM: db.Create(&product), db.Find(&products)
    {
        pattern: /\bdb\.(Create|Save|Delete|Find|First|Where|Take)\s*\(\s*&?([A-Za-z0-9_]+)/gi,
        extract: (m) => ({ model: m[2], operation: m[1] }),
    },
    // PHP Eloquent: Invoice::create(..)
    {
        pattern: /\b([A-Z][A-Za-z0-9_]*)::(create|find|findOrFail|where|all|destroy)\s*\(/g,
        extract: (m) => ({ model: m[1], operation: m[2] }),
    },
    // Elixir Ecto: Repo.insert(%Alert{..})
    {
        pattern: /\bRepo\.(insert|insert!|update|update!|delete|delete!|get|get!|all|one)\s*\(\s*(?:%?([A-Z][A-Za-z0-9_]*)|[A-Za-z0-9_]+)/g,
        extract: (m) => ({ model: m[2] || "Database", operation: m[1] }),
    },
    // Rust Diesel: diesel::insert_into(items::table)
    {
        pattern: /\bdiesel::(insert_into|delete|update)\s*\(\s*([a-zA-Z0-9_]+)/g,
        extract: (m) => ({ model: m[2], operation: m[1] }),
    },
    // Swift Fluent: Card.query(on: req.db)
    {
        pattern: /\b([A-Z][A-Za-z0-9_]*)\.(query|find|create|save|delete)\s*\(\s*on:\s*(?:req|request)\.db\s*\)/g,
        extract: (m) => ({ model: m[1], operation: m[2] }),
    },
    // Dart Supabase: supabase.from('posts').insert(..)
    {
        pattern: /\bsupabase\.from\s*\(\s*["']([a-zA-Z0-9_]+)["']\s*\)\.(insert|select|update|delete|upsert)\s*\(/g,
        extract: (m) => ({ model: m[1], operation: m[2] }),
    },
    // Dart Drift: into(posts).insert(..)
    {
        pattern: /\binto\s*\(\s*([a-zA-Z0-9_]+)\s*\)\.(insert|insertOnConflictUpdate)\s*\(/g,
        extract: (m) => ({ model: m[1], operation: m[2] }),
    },
    // Kotlin Exposed: Cards.insert { .. }
    {
        pattern: /\b([A-Z][A-Za-z0-9_]*)\.(insert|select|update|deleteWhere)\s*\{/g,
        extract: (m) => ({ model: m[1], operation: m[2] }),
    },
    // Generic db/session query fallback
    {
        pattern: /\b(?:database|connection|pool)\.(query|execute|run|prepare|insertOne|insertMany|updateOne|updateMany|deleteOne|deleteMany|find)\s*\(/gi,
        extract: (m) => ({ model: "Database", operation: m[1] }),
    },
    {
        pattern: /\bdb\.(query|execute|run|prepare|raw|exec|queryRow)\s*\(/gi,
        extract: (m) => ({ model: "Database", operation: m[1] }),
    },
    {
        pattern: /\b(?:session|db\.session)\.(add|commit|delete|rollback)\s*\(/gi,
        extract: (m) => ({ model: "Database", operation: m[1] }),
    },
];

function normalizeModelName(rawName) {
    if (!rawName) return null;
    let name = rawName.trim();
    if (name.startsWith("%")) {
        name = name.slice(1);
    }
    if (name.endsWith("Repository")) {
        name = name.slice(0, -10);
    } else if (name.endsWith("Repo")) {
        name = name.slice(0, -4);
    } else if (name.endsWith("Dao")) {
        name = name.slice(0, -3);
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
    if (op.includes("save") || op.includes("add") || op.includes("insert") || op.includes("create") || op.includes("bulk_create") || op.includes("persist")) {
        return "create";
    }
    if (op.includes("find") || op.includes("get") || op.includes("first") || op.includes("filter") || op.includes("all") || op.includes("query") || op.includes("count") || op.includes("read") || op.includes("select") || op.includes("one")) {
        return "find";
    }
    return op;
}

export function extractDatabaseOperations(bodyContent) {
    if (!bodyContent) return [];
    const operations = [];
    const seen = new Set();

    for (const extractor of DATABASE_EXTRACTORS) {
        extractor.pattern.lastIndex = 0;
        let match;
        while ((match = extractor.pattern.exec(bodyContent)) !== null) {
            const raw = extractor.extract(match);
            const model = normalizeModelName(raw.model);
            const operation = normalizeDbOperation(raw.operation);

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
    // JS/TS Socket.IO & WebSocket & Python emit
    /\b(?:socket|io|this\.server|server|ns|nsp|room)(?:\.[a-zA-Z0-9_$]+)*\.(?:emit|send)\s*\(\s*["'`]([^"'`]+)["'`]/gi,
    /\bemit\s*\(\s*["'`]([^"'`]+)["'`]/gi,
    /\b(?:ws|conn|client|socket)\.send\s*\(\s*["'`]([^"'`]+)["'`]/gi,
    /\b(?:ws|conn|client|socket)\.send\s*\(\s*JSON\.stringify\s*\(\s*\{[^}]*?(?:type|event|action)\s*:\s*["'`]([^"'`]+)["'`]/gi,
    // C# SignalR
    /\bClients\.(?:All|Others|Group|Caller|Client|User)\.SendAsync\s*\(\s*(?:@?\$?|\$?@?)["']([^"'`]+)["']/gi,
    // Go WebSocket: ws.WriteJSON, conn.WriteJSON, conn.WriteMessage
    /\b(?:ws|conn)\.WriteJSON\s*\(\s*(?:map\[string\]interface\{\}\s*\{[^}]*?["'](?:event|type|action)["']\s*:\s*["']([^"']+)["']|[a-zA-Z0-9_]*\{\s*(?:Event|Type|Action)\s*:\s*["']([^"']+)["'])/gi,
    /\b(?:ws|conn)\.WriteJSON\s*\(\s*["'`]([^"'`]+)["'`]/gi,
    // Elixir Phoenix: broadcast!, broadcast, push, Endpoint.broadcast
    /\b(?:broadcast!|broadcast|push)\s*\(\s*(?:socket|[a-zA-Z0-9_]+)\s*,\s*["']([^"']+)["']/gi,
    /\bEndpoint\.broadcast\s*\(\s*["'][^"']+["']\s*,\s*["']([^"']+)["']/gi,
    // Ruby ActionCable: ActionCable.server.broadcast("channel", "event" or { event: "event" })
    /\bActionCable\.server\.broadcast\s*\(\s*["'][^"']+["']\s*,\s*(?:\{[^}]*?event:\s*["']([^"']+)["']|["']([^"']+)["'])/gi,
    /\bbroadcast_to\s*\(\s*[^,]+\s*,\s*(?:\{[^}]*?event:\s*["']([^"']+)["']|["']([^"']+)["'])/gi,
    // PHP Laravel: broadcast(new EventName(...)) or event(new EventName(...))
    /\b(?:broadcast|event)\s*\(\s*new\s+([A-Za-z0-9_]+)\s*\(/gi,
    // Java / Kotlin Spring WebSocket: messagingTemplate.convertAndSend("/topic/cards", ...)
    /\b(?:messagingTemplate|simpMessagingTemplate)\.convertAndSend\s*\(\s*["']([^"']+)["']/gi,
    // Swift Vapor: ws.send("event")
    /\bws\.send\s*\(\s*["']([^"']+)["']/gi,
    // Kotlin Ktor: send(Frame.Text("event"))
    /\bsend\s*\(\s*Frame\.Text\s*\(\s*["']([^"']+)["']/gi,
    // Rust WebSocket / broadcast channel: tx.send("event")
    /\b(?:tx|session)\.(?:send|text)\s*\(\s*["']([^"']+)["']/gi,
];

export function extractServerEmits(bodyContent) {
    if (!bodyContent) return [];
    const events = [];
    const seen = new Set();

    for (const regex of SERVER_EMIT_PATTERNS) {
        regex.lastIndex = 0;
        let match;
        while ((match = regex.exec(bodyContent)) !== null) {
            const eventName = match[1] || match[2] || match[3];
            if (eventName && !seen.has(eventName)) {
                seen.add(eventName);
                events.push(eventName);
            }
        }
    }

    return events;
}

const CLIENT_TRIGGER_PATTERNS = [
    // Realtime - Socket.IO (JS, TS, Python, Dart, Swift)
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
    // Realtime - WebSocket (JS, TS, Go, Python, Swift, Dart, Kotlin)
    {
        type: "realtime",
        protocol: "websocket",
        framework: "WebSocket",
        pattern: /\b(?:ws|socket|client|channel\.sink|conn)\.(?:send|add|WriteJSON)\s*\(\s*(?:JSON\.stringify\s*\(\s*\{[^}]*?(?:type|event|action)\s*:\s*)?["'`]([^"'`]+)["'`]/g,
        extract: (match, content, file) => ({
            event: match[1],
            direction: "outgoing",
            file,
            line: findLineNumber(content, match.index),
        }),
    },
    // Realtime - SignalR (JS, TS, C#)
    {
        type: "realtime",
        protocol: "signalr",
        framework: "SignalR",
        pattern: /\b(?:connection|hubConnection)\.(?:invoke|send|InvokeAsync|SendAsync)\s*\(\s*["'`]([^"'`]+)["'`]/g,
        extract: (match, content, file) => ({
            event: match[1],
            direction: "outgoing",
            file,
            line: findLineNumber(content, match.index),
        }),
    },
    // Realtime - Phoenix Channel (JS / Elixir client)
    {
        type: "realtime",
        protocol: "phoenix",
        framework: "Phoenix Channels",
        pattern: /\bchannel\.push\s*\(\s*["'`]([^"'`]+)["'`]/g,
        extract: (match, content, file) => ({
            event: match[1],
            direction: "outgoing",
            file,
            line: findLineNumber(content, match.index),
        }),
    },
    // HTTP - Fetch (JS / TS)
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
    // HTTP - Axios / Http Client (JS, TS, Python, Dart, Kotlin, Swift, Go, C#, PHP, Ruby)
    {
        type: "http",
        protocol: "rest",
        framework: "HTTP Client",
        pattern: /\b(?:axios|api|client|httpClient|http|requests|httpx|aiohttp|dio|Dio\(\)|Faraday|HTTParty|Http)\.(get|post|put|patch|delete|head|options)\s*\(\s*(?:Uri\.parse\s*\(\s*)?["'`]([^"'`]+)["'`]/gi,
        extract: (match, content, file) => ({
            path: match[2],
            method: match[1].toUpperCase(),
            direction: "outgoing",
            file,
            line: findLineNumber(content, match.index),
        }),
    },
    // HTTP - C# HttpClient (httpClient.PostAsync("url", ...))
    {
        type: "http",
        protocol: "rest",
        framework: "HttpClient",
        pattern: /\b(?:httpClient|client)\.(GetAsync|PostAsync|PutAsync|DeleteAsync|PatchAsync)\s*\(\s*["'`]([^"'`]+)["'`]/g,
        extract: (match, content, file) => ({
            path: match[2],
            method: match[1].replace("Async", "").toUpperCase(),
            direction: "outgoing",
            file,
            line: findLineNumber(content, match.index),
        }),
    },
    // HTTP - Swift URLSession / URLRequest
    {
        type: "http",
        protocol: "rest",
        framework: "URLSession",
        pattern: /URLRequest\s*\(\s*url:\s*URL\s*\(\s*string:\s*["']([^"']+)["']\s*\)!\s*\)[\s\S]*?\.httpMethod\s*=\s*["'](GET|POST|PUT|PATCH|DELETE)["']/gi,
        extract: (match, content, file) => ({
            path: match[1],
            method: match[2].toUpperCase(),
            direction: "outgoing",
            file,
            line: findLineNumber(content, match.index),
        }),
    },
    // HTTP - Go http.Post / http.Get
    {
        type: "http",
        protocol: "rest",
        framework: "Go HTTP",
        pattern: /\bhttp\.(Get|Post|Head)\s*\(\s*["'`]([^"'`]+)["'`]/g,
        extract: (match, content, file) => ({
            path: match[2],
            method: match[1].toUpperCase(),
            direction: "outgoing",
            file,
            line: findLineNumber(content, match.index),
        }),
    },
    // GraphQL (JS / TS / Dart / Swift)
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
    // gRPC (JS, Python, Java, C#, Go, Rust)
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
    // Socket.IO (JS, TS, Python, Dart)
    {
        type: "realtime",
        protocol: "socketio",
        framework: "Socket.IO",
        pattern: /@?(?:socket|sio|client)\.on\s*\(\s*["'`]([^"'`]+)["'`]/g,
        extract: (match, content, file) => ({
            event: match[1],
            direction: "incoming",
            file,
            line: findLineNumber(content, match.index),
        }),
    },
    // SignalR (JS, TS, C#)
    {
        type: "realtime",
        protocol: "signalr",
        framework: "SignalR",
        pattern: /\b(?:connection|hubConnection)\.(?:on|On)\s*(?:<[^>]+>)?\s*\(\s*["'`]([^"'`]+)["'`]/g,
        extract: (match, content, file) => ({
            event: match[1],
            direction: "incoming",
            file,
            line: findLineNumber(content, match.index),
        }),
    },
    // WebSocket (JS, TS, Dart, Swift, Go, Python, Kotlin)
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
    // Phoenix Channel Listener (JS / Dart / Swift)
    {
        type: "realtime",
        protocol: "phoenix",
        framework: "Phoenix Channels",
        pattern: /\bchannel\.on\s*\(\s*["'`]([^"'`]+)["'`]/g,
        extract: (match, content, file) => ({
            event: match[1],
            direction: "incoming",
            file,
            line: findLineNumber(content, match.index),
        }),
    },
    // Dart / Flutter stream listener: channel.stream.listen / socket.on
    {
        type: "realtime",
        protocol: "websocket",
        framework: "Dart Stream",
        pattern: /\b(?:channel\.stream|stream)\.listen\s*\(/g,
        extract: (match, content, file) => ({
            event: "message",
            direction: "incoming",
            file,
            line: findLineNumber(content, match.index),
        }),
    },
];

export async function extractClientTriggersAndListeners(files, projectRoot) {
    if (projectRoot) {
        setProjectRoot(projectRoot);
    }
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

        const flaskSocketIoRegex = /@(?:socketio|sio|[A-Za-z0-9_]+)\.on\s*\(\s*["'`]([^"'`]+)["'`]\s*\)\s*(?:async\s+)?def\s+([A-Za-z0-9_]+)\s*\([^)]*\)\s*:/g;
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
                framework: content.includes("FastAPI") || content.includes("fastapi") ? "FastAPI" : "Flask",
                method,
                path: routePath,
                handler: `@app.${method.toLowerCase()}("${routePath}") ${funcName}`,
                file,
                line,
                body,
            });
        }
    } else if (language === "csharp") {
        let match;
        const hubMethodRegex = /public\s+(?:async\s+)?(?:Task|ValueTask|void)\s+([A-Z][A-Za-z0-9_]*)\s*\([^)]*\)\s*\{/g;
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

        const aspNetMethodRegex = /\[(HttpGet|HttpPost|HttpPut|HttpDelete|HttpPatch)\s*(?:\(\s*["']([^"']*)["']\s*\))?\][\s\S]*?public\s+(?:async\s+)?(?:IActionResult|ActionResult|Task<[^>]+>|void|[A-Za-z0-9_<>]+)\s+([A-Z][A-Za-z0-9_]*)\s*\([^)]*\)\s*\{/g;
        while ((match = aspNetMethodRegex.exec(content)) !== null) {
            const method = match[1].replace("Http", "").toUpperCase();
            const routePath = match[2] || "/";
            const methodName = match[3];
            const start = match.index;
            const openBrace = content.indexOf("{", aspNetMethodRegex.lastIndex - 1);
            if (openBrace !== -1) {
                const closeBrace = findScopeEnd(content, openBrace);
                if (closeBrace !== -1) {
                    const body = content.slice(openBrace, closeBrace + 1);
                    const line = findLineNumber(content, start);
                    handlers.push({
                        type: "http",
                        protocol: "rest",
                        framework: "ASP.NET Core",
                        method,
                        path: routePath,
                        handler: `[${match[1]}("${routePath}")] ${methodName}`,
                        file,
                        line,
                        body,
                    });
                }
            }
        }

        const minimalApiRegex = /\bapp\.(MapGet|MapPost|MapPut|MapDelete|MapPatch)\s*\(\s*["']([^"']+)["']\s*,\s*(?:async\s*)?\([^)]*\)\s*=>\s*\{/g;
        while ((match = minimalApiRegex.exec(content)) !== null) {
            const method = match[1].replace("Map", "").toUpperCase();
            const routePath = match[2];
            const start = match.index;
            const openBrace = content.indexOf("{", minimalApiRegex.lastIndex - 1);
            if (openBrace !== -1) {
                const closeBrace = findScopeEnd(content, openBrace);
                if (closeBrace !== -1) {
                    const body = content.slice(openBrace, closeBrace + 1);
                    const line = findLineNumber(content, start);
                    handlers.push({
                        type: "http",
                        protocol: "rest",
                        framework: "ASP.NET Minimal API",
                        method,
                        path: routePath,
                        handler: `app.${match[1]}("${routePath}")`,
                        file,
                        line,
                        body,
                    });
                }
            }
        }
    } else if (language === "go") {
        let match;
        const goRouteRegex = /\b(?:r|router|e|app)\.(GET|POST|PUT|PATCH|DELETE|Get|Post|Put|Patch|Delete)\s*\(\s*["'`]([^"'`]+)["'`]\s*,\s*(?:func\s*\([^)]*\)\s*\{|[A-Za-z0-9_.]+)/g;
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

        const goWsRegex = /func\s+([A-Za-z0-9_]*WebSocket[A-Za-z0-9_]*|[A-Za-z0-9_]*WsHandler[A-Za-z0-9_]*|handleWebSocket|handleWs)\s*\([^)]*\)\s*\{/g;
        while ((match = goWsRegex.exec(content)) !== null) {
            const funcName = match[1];
            const start = match.index;
            const openBrace = content.indexOf("{", goWsRegex.lastIndex - 1);
            if (openBrace !== -1) {
                const closeBrace = findScopeEnd(content, openBrace);
                if (closeBrace !== -1) {
                    const body = content.slice(openBrace, closeBrace + 1);
                    const line = findLineNumber(content, start);
                    const eventMatch = body.match(/case\s+["']([^"']+)["']|Type\s*==\s*["']([^"']+)["']|Event\s*==\s*["']([^"']+)["']/);
                    const event = eventMatch ? (eventMatch[1] || eventMatch[2] || eventMatch[3]) : "message";
                    handlers.push({
                        type: "realtime",
                        protocol: "websocket",
                        framework: "Go WebSocket",
                        event,
                        handler: `${funcName}()`,
                        file,
                        line,
                        body,
                    });
                }
            }
        }
    } else if (language === "java" || language === "kotlin") {
        const springRegex = /@(PostMapping|GetMapping|PutMapping|DeleteMapping|PatchMapping|MessageMapping)\s*\(\s*(?:value\s*=\s*)?(?:["'`]([^"'`]+)["'`])?\s*\)[\s\S]*?(?:public|protected|private|fun)?\s*(?:[A-Za-z0-9_<>[\]]+)?\s*([A-Za-z0-9_]+)\s*\([^)]*\)\s*\{/g;
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

        // Kotlin Ktor routes: get("path") { ... }, post("path") { ... }, webSocket("path") { ... }
        if (language === "kotlin") {
            const ktorRouteRegex = /\b(get|post|put|delete|patch|webSocket)\s*\(\s*["']([^"']+)["']\s*\)\s*\{/g;
            while ((match = ktorRouteRegex.exec(content)) !== null) {
                const methodOrWs = match[1];
                const routePath = match[2];
                const start = match.index;
                const openBrace = content.indexOf("{", ktorRouteRegex.lastIndex - 1);
                if (openBrace !== -1) {
                    const closeBrace = findScopeEnd(content, openBrace);
                    if (closeBrace !== -1) {
                        const body = content.slice(openBrace, closeBrace + 1);
                        const line = findLineNumber(content, start);
                        if (methodOrWs === "webSocket") {
                            handlers.push({
                                type: "realtime",
                                protocol: "websocket",
                                framework: "Ktor",
                                event: routePath,
                                handler: `webSocket("${routePath}")`,
                                file,
                                line,
                                body,
                            });
                        } else {
                            handlers.push({
                                type: "http",
                                protocol: "rest",
                                framework: "Ktor",
                                method: methodOrWs.toUpperCase(),
                                path: routePath,
                                handler: `${methodOrWs}("${routePath}")`,
                                file,
                                line,
                                body,
                            });
                        }
                    }
                }
            }
        }
    } else if (language === "php") {
        // Laravel: Route::get('path', ...), Route::post('path', ...)
        const laravelRegex = /\bRoute::(get|post|put|patch|delete)\s*\(\s*["']([^"']+)["']\s*,\s*(?:function\s*\([^)]*\)\s*\{|\[[^\]]+\])/gi;
        let match;
        while ((match = laravelRegex.exec(content)) !== null) {
            const method = match[1].toUpperCase();
            const routePath = match[2];
            const start = match.index;
            const openBrace = content.indexOf("{", laravelRegex.lastIndex - 1);
            let body = "";
            if (openBrace !== -1) {
                const closeBrace = findScopeEnd(content, openBrace);
                if (closeBrace !== -1) {
                    body = content.slice(openBrace, closeBrace + 1);
                }
            }
            const line = findLineNumber(content, start);
            handlers.push({
                type: "http",
                protocol: "rest",
                framework: "Laravel",
                method,
                path: routePath,
                handler: `Route::${match[1].toLowerCase()}("${routePath}")`,
                file,
                line,
                body: body || content.slice(start, start + 300),
            });
        }
    } else if (language === "ruby") {
        // Rails routes & Sinatra: get "path", to: "controller#action" or get "path" do ... end
        const rubyRouteRegex = /(?:^|\n)\s*(get|post|put|patch|delete)\s+["']([^"']+)["'](?:\s*,\s*to:\s*["']([^"']+)["']|\s+do)/gi;
        let match;
        while ((match = rubyRouteRegex.exec(content)) !== null) {
            const method = match[1].toUpperCase();
            const routePath = match[2];
            const start = match.index;
            const line = findLineNumber(content, start);
            let body = "";
            if (match[0].includes("do")) {
                const bodyEnd = findRubyOrElixirScopeEnd(content, rubyRouteRegex.lastIndex);
                body = content.slice(rubyRouteRegex.lastIndex, bodyEnd);
            }
            handlers.push({
                type: "http",
                protocol: "rest",
                framework: "Rails/Sinatra",
                method,
                path: routePath,
                handler: `${method} "${routePath}"`,
                file,
                line,
                body: body || content,
            });
        }
    } else if (language === "rust") {
        // Actix-Web: #[get("path")], #[post("path")] async fn name(...) { ... }
        const actixRegex = /#\[(get|post|put|patch|delete)\s*\(\s*["']([^"']+)["']\s*\)\]\s*(?:pub\s+)?async\s+fn\s+([A-Za-z0-9_]+)\s*\([^)]*\)\s*(?:->\s*[^{]+)?\{/g;
        let match;
        while ((match = actixRegex.exec(content)) !== null) {
            const method = match[1].toUpperCase();
            const routePath = match[2];
            const funcName = match[3];
            const start = match.index;
            const openBrace = content.indexOf("{", start);
            if (openBrace !== -1) {
                const closeBrace = findScopeEnd(content, openBrace);
                if (closeBrace !== -1) {
                    const body = content.slice(openBrace, closeBrace + 1);
                    const line = findLineNumber(content, start);
                    handlers.push({
                        type: "http",
                        protocol: "rest",
                        framework: "Actix-Web",
                        method,
                        path: routePath,
                        handler: `#[${match[1]}("${routePath}")] ${funcName}`,
                        file,
                        line,
                        body,
                    });
                }
            }
        }

        // Axum: .route("path", get(handler).post(handler))
        const axumRegex = /\.route\s*\(\s*["']([^"']+)["']\s*,\s*(get|post|put|delete|patch)\s*\(\s*([A-Za-z0-9_]+)\s*\)/g;
        while ((match = axumRegex.exec(content)) !== null) {
            const routePath = match[1];
            const method = match[2].toUpperCase();
            const handlerName = match[3];
            const start = match.index;
            const line = findLineNumber(content, start);
            handlers.push({
                type: "http",
                protocol: "rest",
                framework: "Axum",
                method,
                path: routePath,
                handler: `route("${routePath}", ${match[2]}(${handlerName}))`,
                file,
                line,
                body: content,
            });
        }
    } else if (language === "swift") {
        // Vapor: app.get("path") { req in ... } or routes.post("path") { req in ... }
        const vaporRegex = /\b(?:app|routes)\.(get|post|put|patch|delete|webSocket)\s*\(\s*["']([^"']+)["']\s*(?:,\s*["']([^"']+)["'])?\s*\)\s*\{/g;
        let match;
        while ((match = vaporRegex.exec(content)) !== null) {
            const methodOrWs = match[1];
            const segment1 = match[2];
            const segment2 = match[3];
            const routePath = segment2 ? `/${segment1}/${segment2}` : `/${segment1.replace(/^\//, "")}`;
            const start = match.index;
            const openBrace = content.indexOf("{", vaporRegex.lastIndex - 1);
            if (openBrace !== -1) {
                const closeBrace = findScopeEnd(content, openBrace);
                if (closeBrace !== -1) {
                    const body = content.slice(openBrace, closeBrace + 1);
                    const line = findLineNumber(content, start);
                    if (methodOrWs === "webSocket") {
                        handlers.push({
                            type: "realtime",
                            protocol: "websocket",
                            framework: "Vapor",
                            event: routePath,
                            handler: `webSocket("${routePath}")`,
                            file,
                            line,
                            body,
                        });
                    } else {
                        handlers.push({
                            type: "http",
                            protocol: "rest",
                            framework: "Vapor",
                            method: methodOrWs.toUpperCase(),
                            path: routePath,
                            handler: `app.${methodOrWs}("${routePath}")`,
                            file,
                            line,
                            body,
                        });
                    }
                }
            }
        }
    } else if (language === "dart") {
        // Shelf: router.get('path', handler) or router.post('path', (Request req) { ... })
        const shelfRegex = /\brouter\.(get|post|put|patch|delete)\s*\(\s*["']([^"']+)["']/g;
        let match;
        while ((match = shelfRegex.exec(content)) !== null) {
            const method = match[1].toUpperCase();
            const routePath = match[2];
            const start = match.index;
            const line = findLineNumber(content, start);
            const openBrace = content.indexOf("{", shelfRegex.lastIndex);
            let body = "";
            if (openBrace !== -1) {
                const closeBrace = findScopeEnd(content, openBrace);
                if (closeBrace !== -1) {
                    body = content.slice(openBrace, closeBrace + 1);
                }
            }
            handlers.push({
                type: "http",
                protocol: "rest",
                framework: "Shelf",
                method,
                path: routePath,
                handler: `router.${match[1]}("${routePath}")`,
                file,
                line,
                body: body || content,
            });
        }
    } else if (language === "scala") {
        // Play Framework Action / Akka HTTP path("...")
        const playRegex = /def\s+([A-Za-z0-9_]+)\s*=\s*Action(?:\.async)?\s*\{/g;
        let match;
        while ((match = playRegex.exec(content)) !== null) {
            const actionName = match[1];
            const start = match.index;
            const openBrace = content.indexOf("{", playRegex.lastIndex - 1);
            if (openBrace !== -1) {
                const closeBrace = findScopeEnd(content, openBrace);
                if (closeBrace !== -1) {
                    const body = content.slice(openBrace, closeBrace + 1);
                    const line = findLineNumber(content, start);
                    handlers.push({
                        type: "http",
                        protocol: "rest",
                        framework: "Play",
                        method: "POST",
                        path: `/${actionName.toLowerCase()}`,
                        handler: `Action.${actionName}`,
                        file,
                        line,
                        body,
                    });
                }
            }
        }

        const akkaRegex = /path\s*\(\s*["']([^"']+)["']\s*\)\s*\{\s*(get|post|put|delete)/g;
        while ((match = akkaRegex.exec(content)) !== null) {
            const routePath = match[1];
            const method = match[2].toUpperCase();
            const start = match.index;
            const line = findLineNumber(content, start);
            handlers.push({
                type: "http",
                protocol: "rest",
                framework: "Akka-HTTP",
                method,
                path: `/${routePath.replace(/^\//, "")}`,
                handler: `path("${routePath}") { ${match[2]} }`,
                file,
                line,
                body: content,
            });
        }
    } else if (language === "elixir") {
        // Phoenix Router: get "/path", Controller, :action
        const phoenixRouteRegex = /(?:^|\n)\s*(get|post|put|patch|delete)\s+["']([^"']+)["']\s*,\s*([A-Za-z0-9_]+)\s*,\s*:([a-zA-Z0-9_]+)/g;
        let match;
        while ((match = phoenixRouteRegex.exec(content)) !== null) {
            const method = match[1].toUpperCase();
            const routePath = match[2];
            const controller = match[3];
            const action = match[4];
            const start = match.index;
            const line = findLineNumber(content, start);
            handlers.push({
                type: "http",
                protocol: "rest",
                framework: "Phoenix",
                method,
                path: routePath,
                handler: `${controller}.${action}`,
                file,
                line,
                body: content,
            });
        }

        // Phoenix Channels: def handle_in("event", payload, socket) do ... end
        const phoenixChannelRegex = /def\s+handle_in\s*\(\s*["']([^"']+)["']\s*,\s*([^,]+)\s*,\s*socket\s*\)\s*do/g;
        while ((match = phoenixChannelRegex.exec(content)) !== null) {
            const event = match[1];
            const start = match.index;
            const line = findLineNumber(content, start);
            const bodyEnd = findRubyOrElixirScopeEnd(content, phoenixChannelRegex.lastIndex);
            const body = content.slice(phoenixChannelRegex.lastIndex, bodyEnd);
            handlers.push({
                type: "realtime",
                protocol: "phoenix",
                framework: "Phoenix Channels",
                event,
                handler: `handle_in("${event}")`,
                file,
                line,
                body,
            });
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
    if (projectRoot) {
        setProjectRoot(projectRoot);
    }
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

    // 1. Real-time flows (socketio, signalr, websocket, phoenix)
    for (const trigger of clientTriggers) {
        if (
            trigger.protocol === "socketio" ||
            trigger.protocol === "signalr" ||
            trigger.protocol === "websocket" ||
            trigger.protocol === "phoenix"
        ) {
            if (protocolFilter && trigger.protocol !== protocolFilter) continue;

            const matchingServer = serverHandlers.find((server) =>
                server.type === "realtime" &&
                (server.event === trigger.event || (server.protocol === "websocket" && trigger.protocol === "websocket"))
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
                        listener.event === outEvent || (trigger.protocol === "websocket" && listener.event === "message")
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

    // 2. HTTP / REST flows
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
                        listener.event === outEvent || listener.event === "message"
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

    // 3. GraphQL & gRPC flows
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

    // 4. Unmatched server handlers
    for (const server of serverHandlers) {
        if (!matchedServerHandlers.has(server)) {
            if (protocolFilter && server.protocol !== protocolFilter) continue;

            const databaseOperations = extractDatabaseOperations(server.body);
            const serverOutputs = extractServerEmits(server.body);
            const matchingClientListeners = [];

            for (const outEvent of serverOutputs) {
                const listenerMatches = clientListeners.filter((listener) =>
                    listener.event === outEvent || listener.event === "message"
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
