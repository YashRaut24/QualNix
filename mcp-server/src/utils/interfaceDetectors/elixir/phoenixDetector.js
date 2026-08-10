import fs from "node:fs/promises";

const ROUTE_PATTERN =
    /(?:^|\n)\s*(get|post|put|patch|delete|options|head)\s+["']([^"']+)["']\s*,/gi;

export async function detectPhoenixRoutes(filePath) {
    const content = await fs.readFile(filePath, "utf-8");

    const hasPhoenixEvidence =
        /use\s+Phoenix\.Router/.test(content) ||
        /Phoenix\.Controller/.test(content) ||
        /scope\s+["']/.test(content);

    if (!hasPhoenixEvidence) {
        return [];
    }

    const interfaces = [];
    let match;

    while ((match = ROUTE_PATTERN.exec(content)) !== null) {
        interfaces.push({
            type: "http",
            protocol: "rest",
            framework: "Phoenix",
            role: "server",
            method: match[1].toUpperCase(),
            path: match[2],
        });
    }

    return interfaces;
}
