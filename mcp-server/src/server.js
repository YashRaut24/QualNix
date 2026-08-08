import {McpServer} from "@modelcontextprotocol/sdk/server/mcp.js";
import {StdioServerTransport} from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerPingTool } from "./tools/ping.js";
import { registerSetProjectRootTool } from "./tools/setProjectRoot.js";
import { registerReadFileTool } from "./tools/readFile.js";
import { registerListDirectoryTool } from "./tools/listDirectory.js";
import { registerSearchFilesTool } from "./tools/searchFiles.js";

export async function createServer(){
    const server = new McpServer({
        name: "QualNix",
        version: "1.0.0",
    });

    registerPingTool(server);
    registerSetProjectRootTool(server);
    registerReadFileTool(server);
    registerListDirectoryTool(server);
    registerSearchFilesTool(server);

    const transport = new StdioServerTransport();

    await server.connect(transport);

    return server;
}