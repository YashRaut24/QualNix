import { z } from "zod";
import path from "node:path";
import { resolveProjectPath } from "../utils/pathUtils.js";
import { scanProjectDirectory } from "../utils/projectScanner.js";
import { interfaceDetectors } from "../utils/interfaceDetectors/index.js";

function detectLanguage(filePath) {
    const extension = path.extname(filePath).toLowerCase();

    if (extension === ".js" || extension === ".mjs" || extension === ".cjs") {
        return "javascript";
    }

    if (extension === ".ts" || extension === ".tsx") {
        return "typescript";
    }

    if (extension === ".py") {
        return "python";
    }

    if (extension === ".java") {
        return "java";
    }

    if (extension === ".cs") {
        return "csharp";
    }

    if (extension === ".go") {
        return "go";
    }

    if (extension === ".rb") {
        return "ruby";
    }

    if (extension === ".php") {
        return "php";
    }

    if (extension === ".rs") {
        return "rust";
    }

    return null;
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
                                interfaces.push({
                                    ...item,
                                    language,
                                    file,
                                });
                            }
                        } catch {
                            // Detector failures should not stop other detectors.
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