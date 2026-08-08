import fs from "node:fs/promises";
import path from "node:path";

const IGNORED_DIRECTORIES = new Set([
    "node_modules",
    ".git",
    "dist",
    "build",
    "coverage",
]);

export async function scanProjectDirectory(
    directoryPath,
    projectRoot,
    files = [],
    directories = []
) {
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

            await scanProjectDirectory(
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

    return {
        files,
        directories,
    };
}