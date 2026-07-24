import {createServer} from './server.js';

async function main() {
    try{
        await createServer();
        console.log("QualNix MCP server started");
    } catch (error) {
        console.error("Failed to start MCP Server:", error);
        process.exit(1);
    }
}

main();