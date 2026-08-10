import fs from "node:fs/promises";

const ROUTE_PATTERN =
    /\$[A-Za-z_]\w*->(get|post|put|patch|delete|options|any|map)\s*\(\s*["']([^"']+)["']/gi;

export async function detectSlimRoutes(filePath) {
    const content = await fs.readFile(filePath, "utf-8");

    const hasSlimEvidence =
        /Slim\\/.test(content) ||
        /AppFactory::create\s*\(/.test(content) ||
        /\$app\s*=\s*new\s+Slim\\App/.test(content);

    if (!hasSlimEvidence) {
        return [];
    }

    const interfaces = [];
    let match;

    while ((match = ROUTE_PATTERN.exec(content)) !== null) {
        interfaces.push({
            type: "http",
            protocol: "rest",
            framework: "Slim",
            role: "server",
            method:
                match[1].toLowerCase() === "any" ||
                match[1].toLowerCase() === "map"
                    ? "ANY"
                    : match[1].toUpperCase(),
            path: match[2],
        });
    }

    return interfaces;
}
