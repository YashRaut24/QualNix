import fs from "node:fs/promises";

const ROUTE_PATTERN =
    /\b(app|router)\.(get|post|put|patch|delete|options|head)\s*\(\s*["'`]([^"'`]+)["'`]/gi;

export async function detectExpressRoutes(filePath) {
    const content = await fs.readFile(filePath, "utf-8");
    const interfaces = [];

    let match;

    while ((match = ROUTE_PATTERN.exec(content)) !== null) {
        interfaces.push({
            type: "http",
            framework: "Express",
            method: match[2].toUpperCase(),
            path: match[3],
        });
    }

    return interfaces;
}