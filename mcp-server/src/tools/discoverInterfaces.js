import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { resolveProjectPath } from "../utils/pathUtils.js";
import { scanProjectDirectory } from "../utils/projectScanner.js";
import { interfaceDetectors } from "../utils/interfaceDetectors/index.js";

export function registerDiscoverInterfacesTool(server) {
    server.registerTool(
        "discover_interfaces",
        {
            title: "Discover Interfaces",
            description:
                "Discovers application interfaces such as HTTP routes and realtime events.",
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
                    if (
                        !file.endsWith(".js") &&
                        !file.endsWith(".mjs") &&
                        !file.endsWith(".cjs")
                    ) {
                        continue;
                    }

                    const absolutePath = resolveProjectPath(file);

                    for (const detector of interfaceDetectors) {
                        try {
                            const detected =
                                await detector.detect(absolutePath);

                            for (const item of detected) {
                                interfaces.push({
                                    ...item,
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