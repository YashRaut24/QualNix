import fs from "node:fs/promises";

const ROUTE_PATTERN =
    /(?:^|\n)\s*(get|post|put|patch|delete|options|head)\s+["']([^"']+)["']\s+do\b/gi;

export async function detectSinatraRoutes(filePath) {
    const content = await fs.readFile(filePath, "utf-8");

    const hasSinatraEvidence =
        /require\s+["']sinatra["']/.test(content) ||
        /Sinatra::Base/.test(content) ||
        /class\s+\w+\s*<\s*Sinatra::Base/.test(content);

    if (!hasSinatraEvidence) {
        return [];
    }

    const interfaces = [];
    let match;

    while ((match = ROUTE_PATTERN.exec(content)) !== null) {
        interfaces.push({
            type: "http",
            protocol: "rest",
            framework: "Sinatra",
            role: "server",
            method: match[1].toUpperCase(),
            path: match[2],
        });
    }

    return interfaces;
}
