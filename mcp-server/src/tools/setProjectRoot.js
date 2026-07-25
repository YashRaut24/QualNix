import { z } from "zod";
import { setProjectRoot } from "../context/projectContext.js";

export function registerSetProjectRootTool(server) {
    server.registerTool(
        "set_project_root",
        {
            title: "Set Project Root",
            description: "Sets the active project root for QualNix.",
            inputSchema: {
                path: z.string().describe("Absolute path to the project root"),
            },
        },
        async ({ path }) => {
            setProjectRoot(path);

            return {
                content: [
                    {
                        type: "text",
                        text: `Project root set to:\n${path}`,
                    },
                ],
            };
        }
    );
}