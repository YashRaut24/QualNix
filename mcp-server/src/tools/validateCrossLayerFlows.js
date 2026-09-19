import { z } from "zod";
import { resolveProjectPath } from "../utils/pathUtils.js";
import { scanProjectDirectory } from "../utils/projectScanner.js";
import { buildFlowValidationReport } from "../utils/flowValidationReport.js";

export function registerValidateCrossLayerFlowsTool(server) {
    server.registerTool(
        "validate_cross_layer_flows",
        {
            title: "Validate Cross-Layer Flows",
            description:
                "Builds a deterministic validation report for cross-layer flows, classifying each flow as complete, partial, or broken.",
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

                const report = await buildFlowValidationReport(
                    files,
                    projectRoot,
                    { protocol }
                );

                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify(report, null, 2),
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
