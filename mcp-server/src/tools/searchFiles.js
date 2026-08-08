import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { resolveProjectPath } from "../utils/pathUtils.js";

const IGNORED_DIRECTORIES = new Set([
    "node_modules",
    ".git",
    "dist",
    "build",
    "coverage",
]);

async function searchDirectory(directoryPath, query, projectRoot, results) {
    const entries = await fs.readdir(directoryPath, {
        withFileTypes: true,
    });

    for (const entry of entries) {
        if (IGNORED_DIRECTORIES.has(entry.name) && entry.isDirectory()) {
            continue;
        }

        const entryPath = path.join(directoryPath, entry.name);

        if (entry.isDirectory()) {
            await searchDirectory(
                entryPath,
                query,
                projectRoot,
                results
            );
            continue;
        }

        if (!entry.isFile()) {
            continue;
        }

        try {
            const content = await fs.readFile(entryPath, "utf-8");

            const matches = content
                .toLowerCase()
                .split(query.toLowerCase()).length - 1;

            if (matches > 0) {
                results.push({
                    path: path.relative(projectRoot, entryPath),
                    matches,
                });
            }
        } catch {
            // Skip files that cannot be read as text.
        }
    }
}

export function registerSearchFilesTool(server) {
    server.registerTool(
        "search_files",
        {
            title: "Search Files",
            description: "Searches file contents within the selected project.",
            inputSchema: {
                query: z.string().min(1).describe("Text to search for"),
                path: z
                    .string()
                    .optional()
                    .default(".")
                    .describe("Relative directory to search within"),
            },
        },
        async ({ query, path: searchPath = "." }) => {
            try {
                const absolutePath = resolveProjectPath(searchPath);

                const results = [];

                const projectRoot = resolveProjectPath(".");

                await searchDirectory(
                    absolutePath,
                    query,
                    projectRoot,
                    results
                );

                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify(results, null, 2),
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