import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { resolveProjectPath } from "../utils/pathUtils.js";
import { scanProjectDirectory } from "../utils/projectScanner.js";
import { interfaceDetectors } from "../utils/interfaceDetectors/index.js";

const LANGUAGE_BY_EXTENSION = new Map([
    [".js", "javascript"],
    [".mjs", "javascript"],
    [".cjs", "javascript"],
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

const DATABASE_PATTERNS = [
    /\b([A-Za-z_$][\w$]*)\.(find|findOne|findById|findByIdAndUpdate|findByIdAndDelete|create|insertMany|updateOne|updateMany|deleteOne|deleteMany)\s*\(/g,
    /\b([A-Za-z_$][\w$]*)\.(query|execute)\s*\(/g,
];

const EMIT_PATTERNS = [
    /\b(?:socket|io|ws|wss)\.(?:emit|send)\s*\(\s*["'`]([^"'`]+)["'`]/gi,
    /\bio\.to\s*\([^)]*\)\.(?:emit|send)\s*\(\s*["'`]([^"'`]+)["'`]/gi,
];

function detectLanguage(file) {
    return (
        LANGUAGE_BY_EXTENSION.get(
            path.extname(file).toLowerCase()
        ) ?? null
    );
}

function findMatchingBrace(content, startIndex) {
    let depth = 0;
    let inSingleQuote = false;
    let inDoubleQuote = false;
    let inTemplate = false;
    let inLineComment = false;
    let inBlockComment = false;
    let escaped = false;

    for (
        let index = startIndex;
        index < content.length;
        index++
    ) {
        const char = content[index];
        const next = content[index + 1];

        if (inLineComment) {
            if (char === "\n") {
                inLineComment = false;
            }

            continue;
        }

        if (inBlockComment) {
            if (char === "*" && next === "/") {
                inBlockComment = false;
                index++;
            }

            continue;
        }

        if (escaped) {
            escaped = false;
            continue;
        }

        if (
            (inSingleQuote ||
                inDoubleQuote ||
                inTemplate) &&
            char === "\\"
        ) {
            escaped = true;
            continue;
        }

        if (
            !inSingleQuote &&
            !inDoubleQuote &&
            !inTemplate &&
            char === "/" &&
            next === "/"
        ) {
            inLineComment = true;
            index++;
            continue;
        }

        if (
            !inSingleQuote &&
            !inDoubleQuote &&
            !inTemplate &&
            char === "/" &&
            next === "*"
        ) {
            inBlockComment = true;
            index++;
            continue;
        }

        if (
            !inDoubleQuote &&
            !inTemplate &&
            char === "'"
        ) {
            inSingleQuote = !inSingleQuote;
            continue;
        }

        if (
            !inSingleQuote &&
            !inTemplate &&
            char === '"'
        ) {
            inDoubleQuote = !inDoubleQuote;
            continue;
        }

        if (
            !inSingleQuote &&
            !inDoubleQuote &&
            char === "`"
        ) {
            inTemplate = !inTemplate;
            continue;
        }

        if (
            inSingleQuote ||
            inDoubleQuote ||
            inTemplate
        ) {
            continue;
        }

        if (char === "{") {
            depth++;
        }

        if (char === "}") {
            depth--;

            if (depth === 0) {
                return index;
            }
        }
    }

    return -1;
}

function extractSocketHandlers(content) {
    const handlers = [];

    const pattern =
        /\bsocket\.on\s*\(\s*["'`]([^"'`]+)["'`]\s*,/gi;

    let match;

    while ((match = pattern.exec(content)) !== null) {
        const event = match[1];
        const start = match.index;

        const callbackStart =
            pattern.lastIndex;

        const arrowIndex =
            content.indexOf(
                "=>",
                callbackStart
            );

        if (arrowIndex === -1) {
            continue;
        }

        const openingBrace =
            content.indexOf(
                "{",
                arrowIndex
            );

        if (openingBrace === -1) {
            continue;
        }

        const closingBrace =
            findMatchingBrace(
                content,
                openingBrace
            );

        if (closingBrace === -1) {
            continue;
        }

        const line =
            content
                .slice(0, start)
                .split("\n")
                .length;

        const endLine =
            content
                .slice(0, closingBrace)
                .split("\n")
                .length;

        handlers.push({
            event,

            body:
                content.slice(
                    openingBrace,
                    closingBrace + 1
                ),

            start,

            line,

            scope: {
                name: "<anonymous>",
                type: "callback",
                startLine: line,
                endLine,
            },
        });

        pattern.lastIndex =
            closingBrace + 1;
    }

    return handlers;
}

function extractSocketEmits(content) {
    const events = [];

    for (const pattern of EMIT_PATTERNS) {
        let match;

        while ((match = pattern.exec(content)) !== null) {
            if (!events.includes(match[1])) {
                events.push(match[1]);
            }
        }
    }

    return events;
}

function findScopeEnd(source, startIndex) {
    let braceDepth = 0;
    let started = false;
    let quote = null;
    let escaped = false;

    for (let index = startIndex; index < source.length; index++) {
        const character = source[index];

        if (quote) {
            if (escaped) {
                escaped = false;
                continue;
            }

            if (character === "\\") {
                escaped = true;
                continue;
            }

            if (character === quote) {
                quote = null;
            }

            continue;
        }

        if (
            character === "\"" ||
            character === "'" ||
            character === "`"
        ) {
            quote = character;
            continue;
        }

        if (character === "{") {
            braceDepth++;
            started = true;
            continue;
        }

        if (character === "}") {
            braceDepth--;

            if (started && braceDepth === 0) {
                return index;
            }
        }
    }

    return source.length - 1;
}

function lineNumberAt(source, index) {
    return (
        source.slice(0, index).split("\n").length
    );
}

function resolveHandlerScope(
    source,
    handlerStart
) {
    if (
        handlerStart === null ||
        handlerStart === undefined
    ) {
        return null;
    }

    const braceStart =
        source.indexOf(
            "{",
            handlerStart
        );

    if (braceStart === -1) {
        return null;
    }

    const braceEnd =
        findScopeEnd(
            source,
            braceStart
        );

    return {
        startLine:
            lineNumberAt(
                source,
                handlerStart
            ),

        endLine:
            lineNumberAt(
                source,
                braceEnd
            ),
    };
}   

function extractDatabaseOperations(content) {
    const operations = [];

    for (const pattern of DATABASE_PATTERNS) {
        let match;

        while ((match = pattern.exec(content)) !== null) {
            const model = match[1];
            const operation = match[2];

            const value = {
                model,
                operation,
            };

            const exists = operations.some(
                (item) =>
                    item.model === value.model &&
                    item.operation === value.operation
            );

            if (!exists) {
                operations.push(value);
            }
        }
    }

    return operations;
}

function extractFunctions(content) {
    const functions = [];

    const patterns = [
        /(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/g,
        /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>/g,
        /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?[A-Za-z_$][\w$]*\s*=>/g,
    ];

    for (const pattern of patterns) {
        let match;

        while ((match = pattern.exec(content)) !== null) {
            const name = match[1];

            if (!functions.some(
                (item) => item.name === name
            )) {
                functions.push({
                    name,
                    line:
                        content
                            .slice(0, match.index)
                            .split("\n").length,
                });
            }
        }
    }

    return functions;
}

function mapSocketInterface(
    interfaceItem,
    content
) {
    const handlers =
        extractSocketHandlers(content);

    const handler = handlers.find(
        (item) =>
            item.event === interfaceItem.event
    );

    if (handler) {
    return {
        handler:
            `socket.on("${handler.event}")`,

        line:
            handler.line,

        scope:
            handler.scope,

        databaseOperations:
            extractDatabaseOperations(
                handler.body
            ),

        emittedEvents:
            extractSocketEmits(
                handler.body
            ),
    };
    }

    const emitPatterns = [
        /\b(?:socket|io)\.emit\s*\(\s*["'`]([^"'`]+)["'`]/gi,
        /\bio\.to\s*\([^)]*\)\.emit\s*\(\s*["'`]([^"'`]+)["'`]/gi,
    ];

    const emitted = [];

    for (const pattern of emitPatterns) {
        let match;

        while (
            (match = pattern.exec(content)) !== null
        ) {
            if (
                match[1] === interfaceItem.event &&
                !emitted.includes(match[1])
            ) {
                emitted.push(match[1]);
            }
        }
    }

    if (emitted.length > 0) {
        const sourceHandler =
            handlers.find((candidate) =>
                extractSocketEmits(
                    candidate.body
                ).includes(
                    interfaceItem.event
                )
            );

     return {
        handler: null,

        line: null,

        sourceHandler:
            sourceHandler
                ? `socket.on("${sourceHandler.event}")`
                : null,

        sourceLine:
            sourceHandler
                ? sourceHandler.line
                : null,

        sourceScope:
            sourceHandler
                ? sourceHandler.scope
                : null,

        databaseOperations:
            sourceHandler
                ? extractDatabaseOperations(
                    sourceHandler.body
                )
                : [],

        emittedEvents:
            emitted,
    };
    }

    return {
        handler: null,
        line: null,
        databaseOperations: [],
        emittedEvents: [],
    };
}

function mapHttpInterface(
    interfaceItem,
    content
) {
    const databaseOperations =
        extractDatabaseOperations(content);

    const functions =
        extractFunctions(content);

    return {
        handler: null,
        line: null,
        databaseOperations,
        emittedEvents:
            extractSocketEmits(content),
        functions,
    };
}

async function discoverAllInterfaces(
    files,
    projectRoot
) {
    const interfaces = [];
    const seen = new Set();

    for (const file of files) {
        const language =
            detectLanguage(file);

        if (!language) {
            continue;
        }

        const absolutePath =
            resolveProjectPath(file);

        const detectors =
            interfaceDetectors.filter(
                (detector) =>
                    detector.languages.includes(
                        language
                    )
            );

        for (const detector of detectors) {
            try {
                const detected =
                    await detector.detect(
                        absolutePath
                    );

                for (const item of detected) {
                    const normalized = {
                        ...item,
                        language,
                        file,
                    };

                    const key =
                        JSON.stringify(
                            normalized
                        );

                    if (seen.has(key)) {
                        continue;
                    }

                    seen.add(key);
                    interfaces.push(
                        normalized
                    );
                }
            } catch {
            }
        }
    }

    return interfaces;
}

async function mapInterface(
    interfaceItem
) {
    const absolutePath =
        resolveProjectPath(
            interfaceItem.file
        );

    let content;

    try {
        content =
            await fs.readFile(
                absolutePath,
                "utf-8"
            );
    } catch {
        return {
            interface: interfaceItem,
            mapping: {
                handler: null,
                line: null,
                databaseOperations: [],
                emittedEvents: [],
            },
        };
    }

    let mapping;

    if (
        interfaceItem.type === "realtime" &&
        interfaceItem.protocol === "socketio"
    ) {
        mapping = mapSocketInterface(
            interfaceItem,
            content
        );
    } else {
        mapping = mapHttpInterface(
            interfaceItem,
            content
        );
    }

    return {
        interface: interfaceItem,
        mapping,
    };
}

export async function collectInterfaceMappings(
    files,
    projectRoot
) {
    const interfaces =
        await discoverAllInterfaces(
            files,
            projectRoot
        );

    const mappings = [];

    for (const interfaceItem of interfaces) {
        mappings.push(
            await mapInterface(
                interfaceItem
            )
        );
    }

    return mappings;
}

export function registerMapInterfacesTool(
    server
) {
    server.registerTool(
        "map_interfaces",
        {
            title: "Map Interfaces",
            description:
                "Maps discovered application interfaces to their handlers, database operations, and emitted events.",
            inputSchema: {
                path: z
                    .string()
                    .optional()
                    .default(".")
                    .describe(
                        "Relative directory to analyze"
                    ),
            },
        },
        async ({
            path: searchPath = ".",
        }) => {
            try {
                const projectRoot =
                    resolveProjectPath(".");

                const searchRoot =
                    resolveProjectPath(
                        searchPath
                    );

                const { files } =
                    await scanProjectDirectory(
                        searchRoot,
                        projectRoot
                    );

                const mappings =
                    await collectInterfaceMappings(
                        files,
                        projectRoot
                );

                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify(
                                {
                                    mappings,
                                    count:
                                        mappings.length,
                                },
                                null,
                                2
                            ),
                        },
                    ],
                };
            } catch (error) {
                return {
                    isError: true,
                    content: [
                        {
                            type: "text",
                            text: error.message,
                        },
                    ],
                };
            }
        }
    );
}