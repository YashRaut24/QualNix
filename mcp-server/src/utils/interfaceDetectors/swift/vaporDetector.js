import fs from "node:fs/promises";

const ROUTE_PATTERN =
    /\bapp\.(get|post|put|patch|delete|on)\s*\(([^)]*)\)/gi;

function extractSegments(argumentsText) {
    return [...argumentsText.matchAll(/["']([^"']+)["']/g)].map(
        (match) => match[1]
    );
}

function methodFromCall(name, argumentsText) {
    if (name.toLowerCase() !== "on") {
        return name.toUpperCase();
    }

    const methodMatch = argumentsText.match(
        /\.(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)\b/i
    );

    return methodMatch ? methodMatch[1].toUpperCase() : "ANY";
}

function pathFromSegments(segments) {
    if (segments.length === 0) {
        return "/";
    }

    const joined = segments.join("/").replace(/\/+/g, "/");

    return joined.startsWith("/") ? joined : `/${joined}`;
}

export async function detectVaporRoutes(filePath) {
    const content = await fs.readFile(filePath, "utf-8");

    if (!/import\s+Vapor/.test(content)) {
        return [];
    }

    const interfaces = [];
    let match;

    while ((match = ROUTE_PATTERN.exec(content)) !== null) {
        interfaces.push({
            type: "http",
            protocol: "rest",
            framework: "Vapor",
            role: "server",
            method: methodFromCall(match[1], match[2]),
            path: pathFromSegments(extractSegments(match[2])),
        });
    }

    return interfaces;
}
