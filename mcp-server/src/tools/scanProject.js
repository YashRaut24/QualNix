import fs from "node:fs/promises";
import path from "node:path";
import { resolveProjectPath } from "../utils/pathUtils.js";

const IGNORED_DIRECTORIES = new Set([
    "node_modules",
    ".git",
    "dist",
    "build",
    "coverage",
]);

async function scanDirectory(directoryPath, projectRoot, files, directories) {
    const entries = await fs.readdir(directoryPath, {
        withFileTypes: true,
    });

    for (const entry of entries) {
        if (
            entry.isDirectory() &&
            IGNORED_DIRECTORIES.has(entry.name)
        ) {
            continue;
        }

        const entryPath = path.join(directoryPath, entry.name);
        const relativePath = path.relative(projectRoot, entryPath);

        if (entry.isDirectory()) {
            directories.push(relativePath);

            await scanDirectory(
                entryPath,
                projectRoot,
                files,
                directories
            );

            continue;
        }

        if (entry.isFile()) {
            files.push(relativePath);
        }
    }
}

export function registerScanProjectTool(server) {
    server.registerTool(
        "scan_project",
        {
            title: "Scan Project",
            description: "Scans the selected project and returns its file and directory structure.",
            inputSchema: {},
        },
        async () => {
            try {
                const projectRoot = resolveProjectPath(".");
                const files = [];
                const directories = [];

                await scanDirectory(
                    projectRoot,
                    projectRoot,
                    files,
                    directories
                );

                const result = {
                    root: projectRoot,
                    directories,
                    files,
                };

                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify(result, null, 2),
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