import fs from "node:fs/promises";

const ROUTE_PATTERN =
    /\.route\s*\(\s*["']([^"']+)["']\s*,\s*([^\n;]+)/g;

const METHOD_PATTERN =
    /\b(get|post|put|patch|delete|head|options)\s*\(/gi;

export async function detectAxumRoutes(filePath) {
    const content = await fs.readFile(filePath, "utf-8");

    const hasAxumEvidence =
        /axum::/.test(content) ||
        /\bRouter::new\s*\(/.test(content);

    if (!hasAxumEvidence) {
        return [];
    }

    const interfaces = [];
    let match;

    while ((match = ROUTE_PATTERN.exec(content)) !== null) {
        const routePath = match[1];
        const methods = new Set();
        let methodMatch;

        METHOD_PATTERN.lastIndex = 0;

        while (
            (methodMatch = METHOD_PATTERN.exec(match[2])) !== null
        ) {
            methods.add(methodMatch[1].toUpperCase());
        }

        for (const method of methods) {
            interfaces.push({
                type: "http",
                protocol: "rest",
                framework: "Axum",
                role: "server",
                method,
                path: routePath,
            });
        }
    }

    return interfaces;
}
