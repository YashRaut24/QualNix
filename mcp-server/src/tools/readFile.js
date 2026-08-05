import fs from "node:fs/promises";
import { z } from "zod";
import { resolveProjectPath } from "../utils/pathUtils.js";

export function registerReadFileTool(server) {
    server.registerTool(
        "read_file",
        {
            title: "Read File",
            description: "Reads a file from the selected project.",
            inputSchema: {
                path: z.string().describe("Relative path to the file"),
            },
        },
        async ({ path }) => {
            try {
                const absolutePath = resolveProjectPath(path);

                const content = await fs.readFile(
                    absolutePath,
                    "utf-8"
                );

                return {
                    content: [
                        {
                            type: "text",
                            text: content,
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