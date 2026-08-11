import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { resolveProjectPath } from "../utils/pathUtils.js";
import { scanProjectDirectory } from "../utils/projectScanner.js";
import { collectInterfaceMappings } from "./mapInterfaces.js";

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

const DATABASE_PATTERNS = [
    {
        pattern:
            /\b([A-Za-z_$][\w$]*)\.(find|findOne|findById|findByIdAndUpdate|findByIdAndDelete|create|insertMany|updateOne|updateMany|deleteOne|deleteMany)\s*\(/g,
        kind: "orm",
    },
    {
        pattern:
            /\b([A-Za-z_$][\w$]*)\.(query|execute)\s*\(/g,
        kind: "database",
    },
    {
        pattern:
            /\b(?:db|database|connection)\.(query|execute|run|prepare)\s*\(/gi,
        kind: "database",
    },
];

const EXTERNAL_API_PATTERNS = [
    {
        pattern:
            /\bfetch\s*\(\s*["'`]([^"'`]+)/gi,
        client: "fetch",
    },
    {
        pattern:
            /\baxios\.(get|post|put|patch|delete|request)\s*\(\s*["'`]([^"'`]+)/gi,
        client: "axios",
    },
    {
        pattern:
            /\brequests\.(get|post|put|patch|delete|request)\s*\(\s*["'`]([^"'`]+)/gi,
        client: "requests",
    },
    {
        pattern:
            /\b(?:http|https)\.(get|post|put|patch|delete|request)\s*\(\s*["'`]([^"'`]+)/gi,
        client: "http",
    },
];

const IMPORT_PATTERNS = [
    /import\s+.*?\s+from\s+["'`](.*?)["'`]/g,
    /import\s+["'`](.*?)["'`]/g,
    /require\s*\(\s*["'`](.*?)["'`]\s*\)/g,
];

const FUNCTION_PATTERNS = {
    javascript: [
        /(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/g,
        /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>/g,
    ],

    typescript: [
        /(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/g,
        /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>/g,
    ],

    python: [
        /(?:async\s+)?def\s+([A-Za-z_][\w]*)\s*\(/g,
    ],

    java: [
        /(?:public|private|protected)?\s*(?:static\s+)?[\w<>,[\]]+\s+([A-Za-z_][\w]*)\s*\(/g,
    ],

    csharp: [
        /(?:public|private|protected|internal)?\s*(?:static\s+)?[\w<>,[\]]+\s+([A-Za-z_][\w]*)\s*\(/g,
    ],

    go: [
        /func\s+(?:\([^)]+\)\s*)?([A-Za-z_][\w]*)\s*\(/g,
    ],

    ruby: [
        /def\s+([A-Za-z_][\w!?=]*)/g,
    ],

    php: [
        /function\s+([A-Za-z_][\w]*)\s*\(/g,
    ],

    rust: [
        /(?:pub\s+)?(?:async\s+)?fn\s+([A-Za-z_][\w]*)\s*\(/g,
    ],

    kotlin: [
        /fun\s+([A-Za-z_][\w]*)\s*\(/g,
    ],

    swift: [
        /func\s+([A-Za-z_][\w]*)\s*\(/g,
    ],

    dart: [
        /(?:Future<[^>]+>\s+)?([A-Za-z_][\w]*)\s*\([^)]*\)\s*(?:async)?\s*\{/g,
    ],

    scala: [
        /def\s+([A-Za-z_][\w]*)\s*\(/g,
    ],

    elixir: [
        /def(?:p)?\s+([A-Za-z_][\w!?]*)\s*(?:\(|do)/g,
    ],
};

function detectLanguage(file) {
    return (
        LANGUAGE_BY_EXTENSION.get(
            path.extname(file).toLowerCase()
        ) ?? null
    );
}

function findLine(content, index) {
    return (
        content
            .slice(0, index)
            .split("\n").length
    );
}

function uniqueBy(items, keyFn) {
    const seen = new Set();

    return items.filter((item) => {
        const key = keyFn(item);

        if (seen.has(key)) {
            return false;
        }

        seen.add(key);
        return true;
    });
}

function extractFunctions(
    content,
    language
) {
    const patterns =
        FUNCTION_PATTERNS[language] ?? [];

    const functions = [];

    for (const pattern of patterns) {
        let match;

        while (
            (match = pattern.exec(content)) !== null
        ) {
            functions.push({
                name: match[1],
                line: findLine(
                    content,
                    match.index
                ),
            });
        }
    }

    return uniqueBy(
        functions,
        (item) =>
            `${item.name}:${item.line}`
    );
}

function classifyImport(source) {
    const normalized =
        source.toLowerCase();

    if (
        normalized.includes("service")
    ) {
        return "service";
    }

    if (
        normalized.includes("repository") ||
        normalized.includes("repo")
    ) {
        return "repository";
    }

    if (
        normalized.includes("model") ||
        normalized.includes("schema") ||
        normalized.includes("entity")
    ) {
        return "model";
    }

    if (
        normalized.includes("controller")
    ) {
        return "controller";
    }

    if (
        normalized.includes("middleware")
    ) {
        return "middleware";
    }

    if (
        normalized.includes("util") ||
        normalized.includes("helper")
    ) {
        return "utility";
    }

    return "module";
}

function extractImports(content) {
    const imports = [];

    for (const pattern of IMPORT_PATTERNS) {
        let match;

        while (
            (match = pattern.exec(content)) !== null
        ) {
            const source = match[1];

            imports.push({
                source,
                kind: classifyImport(source),
                line: findLine(
                    content,
                    match.index
                ),
            });
        }
    }

    return uniqueBy(
        imports,
        (item) =>
            `${item.source}:${item.line}`
    );
}

function extractDatabaseOperations(
    content
) {
    const operations = [];

    for (const rule of DATABASE_PATTERNS) {
        let match;

        while (
            (match =
                rule.pattern.exec(content)) !==
            null
        ) {
            const target =
                rule.kind === "database" &&
                match.length === 2
                    ? "database"
                    : match[1];

            const operation =
                rule.kind === "database" &&
                match.length === 2
                    ? match[1]
                    : match[2];

            operations.push({
                kind: rule.kind,
                target,
                operation,
                line: findLine(
                    content,
                    match.index
                ),
            });
        }
    }

    return uniqueBy(
        operations,
        (item) =>
            `${item.kind}:${item.target}:${item.operation}:${item.line}`
    );
}

function extractExternalApis(content) {
    const apis = [];

    for (const rule of EXTERNAL_API_PATTERNS) {
        let match;

        while (
            (match =
                rule.pattern.exec(content)) !==
            null
        ) {
            const method =
                rule.client === "fetch"
                    ? "fetch"
                    : match[1];

            const target =
                rule.client === "fetch"
                    ? match[1]
                    : match[2];

            apis.push({
                client: rule.client,
                method,
                target,
                line: findLine(
                    content,
                    match.index
                ),
            });
        }
    }

    return uniqueBy(
        apis,
        (item) =>
            `${item.client}:${item.method}:${item.target}:${item.line}`
    );
}

function buildDependencies(imports) {
    return {
        services: imports
            .filter(
                (item) =>
                    item.kind === "service"
            )
            .map((item) => ({
                source: item.source,
                line: item.line,
            })),

        repositories: imports
            .filter(
                (item) =>
                    item.kind === "repository"
            )
            .map((item) => ({
                source: item.source,
                line: item.line,
            })),

        models: imports
            .filter(
                (item) =>
                    item.kind === "model"
            )
            .map((item) => ({
                source: item.source,
                line: item.line,
            })),

        controllers: imports
            .filter(
                (item) =>
                    item.kind === "controller"
            )
            .map((item) => ({
                source: item.source,
                line: item.line,
            })),

        middleware: imports
            .filter(
                (item) =>
                    item.kind === "middleware"
            )
            .map((item) => ({
                source: item.source,
                line: item.line,
            })),

        utilities: imports
            .filter(
                (item) =>
                    item.kind === "utility"
            )
            .map((item) => ({
                source: item.source,
                line: item.line,
            })),

        modules: imports
            .filter(
                (item) =>
                    item.kind === "module"
            )
            .map((item) => ({
                source: item.source,
                line: item.line,
            })),
    };
}

async function analyzeFile(file) {
    const language =
        detectLanguage(file);

    if (!language) {
        return null;
    }

    const absolutePath =
        resolveProjectPath(file);

    let content;

    try {
        content =
            await fs.readFile(
                absolutePath,
                "utf-8"
            );
    } catch {
        return null;
    }

    const functions =
        extractFunctions(
            content,
            language
        );

    const imports =
        extractImports(content);

    const dependencies =
        buildDependencies(imports);

    const databaseOperations =
        extractDatabaseOperations(
            content
        );

    const externalApis =
        extractExternalApis(
            content
        );

    return {
        file,
        language,
        functions,
        dependencies,
        databaseOperations,
        externalApis,
    };
}

function getModelNames(
    databaseOperations
) {
    return [
        ...new Set(
            databaseOperations
                .filter(
                    (item) =>
                        item.kind === "orm"
                )
                .map(
                    (item) =>
                        item.target
                )
        ),
    ];
}

function normalizeModelName(value) {
    if (!value) {
        return null;
    }

    return value
        .replace(/^.*[\\/]/, "")
        .replace(/\.(js|jsx|ts|tsx|py|java|cs|go|php|rb|rs|kt|kts|swift|dart|scala|sc|ex|exs)$/i, "")
        .trim();
}

function resolveInterfaceModels(
    databaseOperations,
    importedModels
) {
    const operationModels = [
        ...new Set(
            (databaseOperations ?? [])
                .map((operation) =>
                    normalizeModelName(
                        operation.model ??
                        operation.target
                    )
                )
                .filter(Boolean)
        ),
    ];

    return importedModels.filter(
        (model) => {
            const importedName =
                normalizeModelName(
                    model.name ??
                    model.source
                );

            return operationModels.some(
                (operationModel) =>
                    importedName ===
                        operationModel ||
                    importedName?.toLowerCase() ===
                        operationModel.toLowerCase()
            );
        }
    );
}

function createInterfaceFlow(
    mapping,
    fileAnalysis
) {
    const interfaceItem =
        mapping.interface;

    const mappingData =
        mapping.mapping;

    const databaseOperations =
        mappingData.databaseOperations ??
        fileAnalysis.databaseOperations;

    const models =
        resolveInterfaceModels(
            databaseOperations,
            fileAnalysis.dependencies.models
        );

    return {
        interface: {
            type:
                interfaceItem.type ??
                null,

            protocol:
                interfaceItem.protocol ??
                null,

            framework:
                interfaceItem.framework ??
                null,

            role:
                interfaceItem.role ??
                null,

            method:
                interfaceItem.method ??
                null,

            path:
                interfaceItem.path ??
                null,

            event:
                interfaceItem.event ??
                null,

            language:
                interfaceItem.language ??
                fileAnalysis.language,

            file:
                interfaceItem.file,
        },

        handler:
            mappingData.handler ??
            null,

        scope:
            mappingData.scope ??
            null,

        sourceScope:
            mappingData.sourceScope ??
            null,

        sourceHandler:
            mappingData.sourceHandler ??
            null,

        sourceLine:
            mappingData.sourceLine ??
            null,

        services:
            fileAnalysis.dependencies
                .services,

        repositories:
            fileAnalysis.dependencies
                .repositories,

        models,

        database:
            databaseOperations,

        externalApis:
            fileAnalysis.externalApis,

        outputs:
            mappingData.emittedEvents ??
            [],

        functions:
            fileAnalysis.functions,
    };
}

function createFileFlow(
    analysis,
    mappings
) {
    const interfaces =
        mappings
            .filter(
                (item) =>
                    item.interface.file ===
                    analysis.file
            )
            .map(
                (item) =>
                    createInterfaceFlow(
                        item,
                        analysis
                    )
            );

    return {
        source: {
            file: analysis.file,
            language: analysis.language,
        },

        functions:
            analysis.functions,

        services:
            analysis.dependencies
                .services,

        repositories:
            analysis.dependencies
                .repositories,

        models:
            analysis.dependencies
                .models,

        database:
            analysis.databaseOperations,

        externalApis:
            analysis.externalApis,

        interfaces,
    };
}

export function registerAnalyzeDataFlowTool(
    server
) {
    server.registerTool(
        "analyze_data_flow",
        {
            title: "Analyze Data Flow",
            description:
                "Builds normalized application data flows by combining interface mappings with source-level dependencies, database operations, and external API calls.",
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

                const analyses = [];

                for (const file of files) {
                    const analysis =
                        await analyzeFile(
                            file
                        );

                    if (analysis) {
                        analyses.push(
                            analysis
                        );
                    }
                }

                const mappings =
                    await collectInterfaceMappings(
                        files,
                        projectRoot
                    );

                const fileFlows =
                    analyses.map(
                        (analysis) =>
                            createFileFlow(
                                analysis,
                                mappings
                            )
                    );

                const interfaceFlows =
                    mappings.map((mapping) => {
                        const analysis =
                            analyses.find(
                                (item) =>
                                    item.file ===
                                    mapping.interface
                                        .file
                            );

                        if (!analysis) {
                            return {
                                interface:
                                    mapping.interface,
                                mapping:
                                    mapping.mapping,
                            };
                        }

                        return createInterfaceFlow(
                            mapping,
                            analysis
                        );
                    });

                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify(
                                {
                                    flows:
                                        interfaceFlows,
                                    files:
                                        fileFlows,
                                    interfacesAnalyzed:
                                        interfaceFlows.length,
                                    filesAnalyzed:
                                        analyses.length,
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