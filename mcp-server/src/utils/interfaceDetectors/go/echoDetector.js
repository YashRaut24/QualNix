import fs from "node:fs/promises";

const ROUTE_PATTERN =
    /\b[A-Za-z_]\w*\.(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)\s*\(\s*["'`]([^"'`]+)["'`]/g;

export async function detectEchoRoutes(filePath) {
    const content = await fs.readFile(filePath, "utf-8");

    const hasEchoEvidence =
        /github\.com\/labstack\/echo/.test(content) ||
        /\becho\.New\s*\(/.test(content);

    if (!hasEchoEvidence) {
        return [];
    }

    const interfaces = [];
    let match;

    while ((match = ROUTE_PATTERN.exec(content)) !== null) {
        interfaces.push({
            type: "http",
            protocol: "rest",
            framework: "Echo",
            role: "server",
            method: match[1],
            path: match[2],
        });
    }

    return interfaces;
}
