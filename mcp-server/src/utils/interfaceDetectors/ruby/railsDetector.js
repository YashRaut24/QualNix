import fs from "node:fs/promises";

const ROUTE_PATTERN =
    /(?:^|\n)\s*(get|post|put|patch|delete|options|head)\s+["']([^"']+)["']/gi;

export async function detectRailsRoutes(filePath) {
    const content = await fs.readFile(filePath, "utf-8");

    const hasRailsEvidence =
        /Rails\.application\.routes\.draw/.test(content) ||
        /class\s+\w+Controller\s*<\s*ApplicationController/.test(
            content
        ) ||
        /ActionController::/.test(content);

    if (!hasRailsEvidence) {
        return [];
    }

    const interfaces = [];
    let match;

    while ((match = ROUTE_PATTERN.exec(content)) !== null) {
        interfaces.push({
            type: "http",
            protocol: "rest",
            framework: "Rails",
            role: "server",
            method: match[1].toUpperCase(),
            path: match[2],
        });
    }

    return interfaces;
}
