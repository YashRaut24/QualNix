import fs from "node:fs/promises";

const ROUTE_PATTERN =
    /\b[A-Za-z_]\w*\.(get|post|put|patch|delete|options|head)\s*\(\s*["']([^"']+)["']/gi;

export async function detectShelfRoutes(filePath) {
    const content = await fs.readFile(filePath, "utf-8");

    const hasShelfEvidence =
        /package:shelf/.test(content) ||
        /shelf_router/.test(content) ||
        /\bRouter\s*\(\s*\)/.test(content);

    if (!hasShelfEvidence) {
        return [];
    }

    const interfaces = [];
    let match;

    while ((match = ROUTE_PATTERN.exec(content)) !== null) {
        interfaces.push({
            type: "http",
            protocol: "rest",
            framework: "Shelf",
            role: "server",
            method: match[1].toUpperCase(),
            path: match[2],
        });
    }

    return interfaces;
}
