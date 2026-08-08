import { resolveProjectPath } from "../utils/pathUtils.js";
import { scanProjectDirectory } from "../utils/projectScanner.js";

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

                const result = await scanProjectDirectory(
                    projectRoot,
                    projectRoot
                );

                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify(
                                {
                                    root: projectRoot,
                                    ...result,
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