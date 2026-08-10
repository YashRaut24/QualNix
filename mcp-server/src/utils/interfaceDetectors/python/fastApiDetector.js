import fs from "node:fs/promises";

const ROUTE_PATTERN =
    /@([A-Za-z_]\w*)\.(get|post|put|patch|delete|options|head)\s*\(\s*["'`]([^"'`]+)["'`]/gi;

const ROUTER_PATTERN =
    /\b([A-Za-z_]\w*)\s*=\s*APIRouter\s*\(([\s\S]*?)\)/g;

const APP_PATTERN =
    /\b([A-Za-z_]\w*)\s*=\s*FastAPI\s*\(/g;

function extractPrefix(argumentsText) {
    const match = argumentsText.match(
        /prefix\s*=\s*["'`]([^"'`]+)["'`]/
    );

    return match ? match[1] : "";
}

function joinPaths(prefix, routePath) {
    const first = prefix || "";
    const second = routePath || "";
    const joined = `${first}/${second}`.replace(/\/+/g, "/");

    if (!joined || joined === "/") {
        return "/";
    }

    return joined.startsWith("/") ? joined : `/${joined}`;
}

export async function detectFastApiRoutes(filePath) {
    const content = await fs.readFile(filePath, "utf-8");

    const hasFastApiEvidence =
        /\bFastAPI\s*\(/.test(content) ||
        /\bAPIRouter\s*\(/.test(content) ||
        /from\s+fastapi\s+import\b/.test(content) ||
        /import\s+fastapi\b/.test(content);

    if (!hasFastApiEvidence) {
        return [];
    }

    const routePrefixes = new Map([
        ["app", ""],
        ["router", ""],
    ]);

    let match;

    while ((match = APP_PATTERN.exec(content)) !== null) {
        routePrefixes.set(match[1], "");
    }

    while ((match = ROUTER_PATTERN.exec(content)) !== null) {
        routePrefixes.set(match[1], extractPrefix(match[2]));
    }

    const interfaces = [];

    while ((match = ROUTE_PATTERN.exec(content)) !== null) {
        const receiver = match[1];

        if (!routePrefixes.has(receiver)) {
            continue;
        }

        interfaces.push({
            type: "http",
            protocol: "rest",
            framework: "FastAPI",
            role: "server",
            method: match[2].toUpperCase(),
            path: joinPaths(routePrefixes.get(receiver), match[3]),
        });
    }

    return interfaces;
}
