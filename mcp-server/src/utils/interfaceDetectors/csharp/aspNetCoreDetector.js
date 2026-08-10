import fs from "node:fs/promises";

const MINIMAL_API_PATTERN =
    /\b[A-Za-z_]\w*\.Map(Get|Post|Put|Patch|Delete|Options|Head)\s*\(\s*(?:@?\$?|\$?@?)["']([^"'`]+)["']/g;

const ATTRIBUTE_PATTERN =
    /\[(HttpGet|HttpPost|HttpPut|HttpPatch|HttpDelete|HttpOptions|HttpHead)\s*(?:\(([^)]*)\))?\]/g;

const METHOD_MAP = new Map([
    ["HttpGet", "GET"],
    ["HttpPost", "POST"],
    ["HttpPut", "PUT"],
    ["HttpPatch", "PATCH"],
    ["HttpDelete", "DELETE"],
    ["HttpOptions", "OPTIONS"],
    ["HttpHead", "HEAD"],
    ["Get", "GET"],
    ["Post", "POST"],
    ["Put", "PUT"],
    ["Patch", "PATCH"],
    ["Delete", "DELETE"],
    ["Options", "OPTIONS"],
    ["Head", "HEAD"],
]);

function extractString(argumentsText) {
    if (!argumentsText) {
        return "";
    }

    const match = argumentsText.match(
        /(?:@?\$?|\$?@?)["']([^"'`]+)["']/
    );

    return match ? match[1] : "";
}

function joinPaths(prefix, routePath) {
    const parts = [prefix, routePath].filter(Boolean);

    if (parts.length === 0) {
        return "/";
    }

    const joined = parts.join("/").replace(/\/+/g, "/");
    const normalized = joined.startsWith("/")
        ? joined
        : `/${joined}`;

    return normalized.length > 1
        ? normalized.replace(/\/$/, "")
        : normalized;
}

function extractClassPrefix(content) {
    const match = content.match(
        /\[Route\s*\(\s*(?:@?\$?|\$?@?)["']([^"'`]+)["']\s*\)\][\s\S]{0,300}?\bclass\s+\w+/
    );

    return match ? match[1] : "";
}

export async function detectAspNetCoreRoutes(filePath) {
    const content = await fs.readFile(filePath, "utf-8");

    const hasAspNetEvidence =
        /Microsoft\.AspNetCore/.test(content) ||
        /WebApplication\.CreateBuilder/.test(content) ||
        /\bControllerBase\b/.test(content) ||
        /\[ApiController\]/.test(content) ||
        /\b[A-Za-z_]\w*\.Map(?:Get|Post|Put|Patch|Delete|Options|Head)\s*\(/.test(
            content
        ) ||
        /\[Http(?:Get|Post|Put|Patch|Delete|Options|Head)\b/.test(content);

    if (!hasAspNetEvidence) {
        return [];
    }

    const interfaces = [];
    const classPrefix = extractClassPrefix(content);
    let match;

    while ((match = MINIMAL_API_PATTERN.exec(content)) !== null) {
        interfaces.push({
            type: "http",
            protocol: "rest",
            framework: "ASP.NET Core",
            role: "server",
            method: METHOD_MAP.get(match[1]),
            path: match[2],
        });
    }

    while ((match = ATTRIBUTE_PATTERN.exec(content)) !== null) {
        interfaces.push({
            type: "http",
            protocol: "rest",
            framework: "ASP.NET Core",
            role: "server",
            method: METHOD_MAP.get(match[1]),
            path: joinPaths(classPrefix, extractString(match[2] || "")),
        });
    }

    return interfaces;
}
