import fs from "node:fs/promises";

const ROUTE_PATTERN =
    /@(?:app|router)\.(get|post|put|patch|delete|options|head)\s*\(\s*["'`]([^"'`]+)["'`]/gi;

export async function detectFastApiRoutes(filePath) {
    const content = await fs.readFile(filePath, "utf-8");

    const interfaces = [];
    let match;

    while ((match = ROUTE_PATTERN.exec(content)) !== null) {
        interfaces.push({
            type: "http",
            protocol: "rest",
            framework: "FastAPI",
            role: "server",
            method: match[1].toUpperCase(),
            path: match[2],
        });
    }

    return interfaces;
}