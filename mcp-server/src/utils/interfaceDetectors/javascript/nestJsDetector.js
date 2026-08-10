import fs from "node:fs/promises";

const CONTROLLER_BLOCK_PATTERN =
    /@Controller\s*(?:\(([^)]*)\))?[\s\S]{0,500}?\bclass\s+\w+[\s\S]*?(?=@Controller\s*(?:\(|\s)|$)/g;

const ROUTE_DECORATOR_PATTERN =
    /@(Get|Post|Put|Patch|Delete|Options|Head)\s*(?:\(([^)]*)\))?/g;

const METHOD_MAP = new Map([
    ["Get", "GET"],
    ["Post", "POST"],
    ["Put", "PUT"],
    ["Patch", "PATCH"],
    ["Delete", "DELETE"],
    ["Options", "OPTIONS"],
    ["Head", "HEAD"],
]);

function extractDecoratorPath(argumentsText) {
    if (!argumentsText || !argumentsText.trim()) {
        return "";
    }

    const match = argumentsText.match(
        /["'`]([^"'`]+)["'`]/
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

function collectRoutes(block, prefix) {
    const interfaces = [];
    let match;

    ROUTE_DECORATOR_PATTERN.lastIndex = 0;

    while ((match = ROUTE_DECORATOR_PATTERN.exec(block)) !== null) {
        interfaces.push({
            type: "http",
            protocol: "rest",
            framework: "NestJS",
            role: "server",
            method: METHOD_MAP.get(match[1]),
            path: joinPaths(
                prefix,
                extractDecoratorPath(match[2] || "")
            ),
        });
    }

    return interfaces;
}

export async function detectNestJsRoutes(filePath) {
    const content = await fs.readFile(filePath, "utf-8");

    const hasNestEvidence =
        /@nestjs\/common/.test(content) ||
        /@Controller\b/.test(content);

    if (!hasNestEvidence) {
        return [];
    }

    const interfaces = [];
    let match;

    while (
        (match = CONTROLLER_BLOCK_PATTERN.exec(content)) !== null
    ) {
        interfaces.push(
            ...collectRoutes(
                match[0],
                extractDecoratorPath(match[1] || "")
            )
        );
    }

    if (interfaces.length === 0 && /@(?:Get|Post|Put|Patch|Delete|Options|Head)\b/.test(content)) {
        interfaces.push(...collectRoutes(content, ""));
    }

    return interfaces;
}
