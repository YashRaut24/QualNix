import { z } from "zod";
import { resolveProjectPath } from "../utils/pathUtils.js";
import { scanProjectDirectory } from "../utils/projectScanner.js";
import { buildCrossLayerFlows } from "../utils/crossLayerFlowMapper.js";

export function registerMapCrossLayerFlowsTool(server) {
    server.registerTool(
        "map_cross_layer_flows",
        {
            title: "Map Cross-Layer Flows",
            description:
                "Builds end-to-end normalized flow mappings connecting interfaces across client trigger -> server handler -> database operations -> server outputs -> client listeners.",
            inputSchema: {
                path: z
                    .string()
                    .optional()
                    .default(".")
                    .describe("Relative directory to analyze"),
                protocol: z
                    .string()
                    .optional()
                    .describe("Filter flows by protocol (e.g. 'socketio', 'websocket', 'rest', 'graphql', 'grpc', or 'all')"),
            },
        },
        async ({ path: searchPath = ".", protocol }) => {
            try {
                const projectRoot = resolveProjectPath(".");
                const searchRoot = resolveProjectPath(searchPath);

                const { files } = await scanProjectDirectory(
                    searchRoot,
                    projectRoot
                );

                const flows = await buildCrossLayerFlows(
                    files,
                    projectRoot,
                    { protocol }
                );

                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify(
                                {
                                    flows,
                                    count: flows.length,
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
