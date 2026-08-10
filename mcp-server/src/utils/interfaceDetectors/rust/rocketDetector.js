import fs from "node:fs/promises";

const ROUTE_PATTERN =
    /#\[(get|post|put|patch|delete|head|options)\s*\(\s*["']([^"']+)["']\s*\)\]/gi;

export async function detectRocketRoutes(filePath) {
    const content = await fs.readFile(filePath, "utf-8");

    const hasRocketEvidence =
        /rocket::/.test(content) ||
        /extern\s+crate\s+rocket/.test(content) ||
        /#\[launch\]/.test(content);

    if (!hasRocketEvidence) {
        return [];
    }

    const interfaces = [];
    let match;

    while ((match = ROUTE_PATTERN.exec(content)) !== null) {
        interfaces.push({
            type: "http",
            protocol: "rest",
            framework: "Rocket",
            role: "server",
            method: match[1].toUpperCase(),
            path: match[2],
        });
    }

    return interfaces;
}
