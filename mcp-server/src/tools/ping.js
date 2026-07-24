export function registerPingTool(server){
    server.registerTool("ping",
        {
            title: "Ping",
            description: "Checks if the MCP server is running",
            inputSchema: {},
        },
        async () => {
            return {
                content: [
                    {
                        type: "text",
                        text: "Pong! QualNix MCP Server is running.",
                    },
                ],
            };
        }
    );
}