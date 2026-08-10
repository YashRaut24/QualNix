import fs from "node:fs/promises";

const ROUTE_PATTERN =
    /#\[(get|post|put|patch|delete|head|options)\s*\(\s*["']([^"']+)["']\s*\)\]/gi;

export async function detectActixWebRoutes(filePath) {
    const content = await fs.readFile(filePath, "utf-8");

    const hasActixEvidence =
        /actix_web/.test(content) ||
        /\bHttpServer::new\b/.test(content) ||
        /\bApp::new\b/.test(content);

    if (!hasActixEvidence) {
        return [];
    }

    const interfaces = [];
    let match;

    while ((match = ROUTE_PATTERN.exec(content)) !== null) {
        interfaces.push({
            type: "http",
            protocol: "rest",
            framework: "Actix Web",
            role: "server",
            method: match[1].toUpperCase(),
            path: match[2],
        });
    }

    return interfaces;
}
