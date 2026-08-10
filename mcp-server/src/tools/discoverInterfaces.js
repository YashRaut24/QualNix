import { z } from "zod";
import path from "node:path";
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

function detectLanguage(filePath) {
    const extension = path.extname(filePath).toLowerCase();

    return LANGUAGE_BY_EXTENSION.get(extension) || null;
}

function createInterfaceKey(item, language, file) {
    return JSON.stringify({
        type: item.type,
        protocol: item.protocol,
        framework: item.framework,
        role: item.role,
        method: item.method || "",
        path: item.path || "",
        event: item.event || "",
        language,
        file,
    });
}

export function registerDiscoverInterfacesTool(server) {
    server.registerTool(
        "discover_interfaces",
        {
            title: "Discover Interfaces",
            description:
                "Discovers application interfaces across supported languages and frameworks.",
            inputSchema: {
                path: z
                    .string()
                    .optional()
                    .default(".")
                    .describe("Relative directory to scan"),
            },
        },
        async ({ path: searchPath = "." }) => {
            try {
                const projectRoot = resolveProjectPath(".");
                const searchRoot = resolveProjectPath(searchPath);

                const { files } = await scanProjectDirectory(
                    searchRoot,
                    projectRoot
                );

                const interfaces = [];
                const seenInterfaces = new Set();

                for (const file of files) {
                    const language = detectLanguage(file);

                    if (!language) {
                        continue;
                    }

                    const absolutePath = resolveProjectPath(file);

                    const applicableDetectors =
                        interfaceDetectors.filter((detector) =>
                            detector.languages.includes(language)
                        );

                    for (const detector of applicableDetectors) {
                        try {
                            const detected =
                                await detector.detect(absolutePath);

                            for (const item of detected) {
                                const key = createInterfaceKey(
                                    item,
                                    language,
                                    file
                                );

                                if (seenInterfaces.has(key)) {
                                    continue;
                                }

                                seenInterfaces.add(key);

                                interfaces.push({
                                    ...item,
                                    language,
                                    file,
                                });
                            }
                        } catch {
                        }
                    }
                }

                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify(
                                {
                                    interfaces,
                                    count: interfaces.length,
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
