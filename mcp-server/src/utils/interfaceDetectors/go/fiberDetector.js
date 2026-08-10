import fs from "node:fs/promises";

const ROUTE_PATTERN =
    /\b[A-Za-z_]\w*\.(Get|Post|Put|Patch|Delete|Options|Head)\s*\(\s*["'`]([^"'`]+)["'`]/g;

const METHOD_MAP = new Map([
    ["Get", "GET"],
    ["Post", "POST"],
    ["Put", "PUT"],
    ["Patch", "PATCH"],
    ["Delete", "DELETE"],
    ["Options", "OPTIONS"],
    ["Head", "HEAD"],
]);

export async function detectFiberRoutes(filePath) {
    const content = await fs.readFile(filePath, "utf-8");

    const hasFiberEvidence =
        /github\.com\/gofiber\/fiber/.test(content) ||
        /\bfiber\.New\s*\(/.test(content);

    if (!hasFiberEvidence) {
        return [];
    }

    const interfaces = [];
    let match;

    while ((match = ROUTE_PATTERN.exec(content)) !== null) {
        interfaces.push({
            type: "http",
            protocol: "rest",
            framework: "Fiber",
            role: "server",
            method: METHOD_MAP.get(match[1]),
            path: match[2],
        });
    }

    return interfaces;
}
