import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { resolveProjectPath } from "../utils/pathUtils.js";
import { scanProjectDirectory } from "../utils/projectScanner.js";

const ROUTE_PATTERN =
    /\b(app|router)\.(get|post|put|patch|delete|options|head)\s*\(\s*["'`]([^"'`]+)["'`]/gi;

function extractRoutes(content, filePath) {
    const routes = [];
    let match;

    while ((match = ROUTE_PATTERN.exec(content)) !== null) {
        routes.push({
            method: match[2].toUpperCase(),
            path: match[3],
            file: filePath,
        });
    }

    return routes;
}

export function registerDetectRoutesTool(server) {
    server.registerTool(
        "detect_routes",
        {
            title: "Detect Routes",
            description: "Detects Express route definitions in the selected project.",
            inputSchema: {
                path: z
                    .string()
                    .optional()
                    .default(".")
                    .describe("Relative directory to scan for routes"),
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

                const routes = [];

                for (const file of files) {
                    if (
                        !file.endsWith(".js") &&
                        !file.endsWith(".mjs") &&
                        !file.endsWith(".cjs")
                    ) {
                        continue;
                    }

                    const absolutePath = resolveProjectPath(file);
                    const content = await fs.readFile(
                        absolutePath,
                        "utf-8"
                    );

                    routes.push(
                        ...extractRoutes(content, file)
                    );
                }

                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify(
                                {
                                    routes,
                                    count: routes.length,
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