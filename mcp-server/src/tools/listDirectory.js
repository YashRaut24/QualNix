import fs from "node:fs/promises";
import { z } from "zod";
import { resolveProjectPath } from "../utils/pathUtils.js";

export function registerListDirectoryTool(server) {
    server.registerTool(
        "list_directory",
        {
            title: "List Directory",
            description: "Lists the contents of a directory in the selected project.",
            inputSchema: {
                path: z
                    .string()
                    .describe("Relative path to the directory"),
            },
        },
        async ({ path }) => {
            try {
                const absolutePath = resolveProjectPath(path);

                const entries = await fs.readdir(absolutePath, {
                    withFileTypes: true,
                });

                const result = entries.map((entry) => ({
                    name: entry.name,
                    type: entry.isDirectory() ? "directory" : "file",
                }));

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