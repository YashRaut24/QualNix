import fs from "node:fs/promises";

const ROUTE_PATTERN =
    /\bRoute::(get|post|put|patch|delete|options|any|match)\s*\(\s*["']([^"']+)["']/gi;

export async function detectLaravelRoutes(filePath) {
    const content = await fs.readFile(filePath, "utf-8");

    const hasLaravelEvidence =
        /Illuminate\\Support\\Facades\\Route/.test(content) ||
        /\bRoute::(?:get|post|put|patch|delete|options|any|match)\s*\(/i.test(
            content
        );

    if (!hasLaravelEvidence) {
        return [];
    }

    const interfaces = [];
    let match;

    while ((match = ROUTE_PATTERN.exec(content)) !== null) {
        interfaces.push({
            type: "http",
            protocol: "rest",
            framework: "Laravel",
            role: "server",
            method:
                match[1].toLowerCase() === "any" ||
                match[1].toLowerCase() === "match"
                    ? "ANY"
                    : match[1].toUpperCase(),
            path: match[2],
        });
    }

    return interfaces;
}
