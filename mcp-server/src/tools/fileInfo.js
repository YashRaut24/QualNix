import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { resolveProjectPath } from "../utils/pathUtils.js";

export function registerFileInfoTool(server) {
    server.registerTool(
        "get_file_info",
        {
            title: "Get File Info",
            description: "Returns metadata about a file or directory in the selected project.",
            inputSchema: {
                path: z.string().describe("Relative path to the file or directory"),
            },
        },
        async ({ path: filePath }) => {
            try {
                const absolutePath = resolveProjectPath(filePath);
                const stats = await fs.stat(absolutePath);

                const result = {
                    path: path.relative(
                        resolveProjectPath("."),
                        absolutePath
                    ),
                    type: stats.isDirectory() ? "directory" : "file",
                    size: stats.size,
                };

                if (stats.isFile()) {
                    result.extension = path.extname(absolutePath);
                }

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