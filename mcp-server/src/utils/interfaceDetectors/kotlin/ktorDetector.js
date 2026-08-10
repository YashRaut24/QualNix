import fs from "node:fs/promises";

const ROUTE_PATTERN =
    /\b(get|post|put|patch|delete|options|head)\s*\(\s*["']([^"']+)["']\s*\)/gi;

export async function detectKtorRoutes(filePath) {
    const content = await fs.readFile(filePath, "utf-8");

    const hasKtorEvidence =
        /io\.ktor/.test(content) ||
        /\bembeddedServer\s*\(/.test(content) ||
        /\brouting\s*\{/.test(content);

    if (!hasKtorEvidence) {
        return [];
    }

    const interfaces = [];
    let match;

    while ((match = ROUTE_PATTERN.exec(content)) !== null) {
        interfaces.push({
            type: "http",
            protocol: "rest",
            framework: "Ktor",
            role: "server",
            method: match[1].toUpperCase(),
            path: match[2],
        });
    }

    return interfaces;
}
