import fs from "node:fs/promises";

const METHOD_ANNOTATIONS = new Map([
    ["GET", "GET"],
    ["POST", "POST"],
    ["PUT", "PUT"],
    ["PATCH", "PATCH"],
    ["DELETE", "DELETE"],
    ["OPTIONS", "OPTIONS"],
    ["HEAD", "HEAD"],
]);

const METHOD_BLOCK_PATTERN =
    /((?:\s*@[A-Za-z][\w.]*\s*(?:\([^)]*\))?\s*)+)\s*(?:public|protected|private)?[\s\w<>,.?[\]]+\s+\w+\s*\(/g;

function extractPath(annotations) {
    const matches = [
        ...annotations.matchAll(
            /@Path\s*\(\s*["'`]([^"'`]+)["'`]\s*\)/g
        ),
    ];

    if (matches.length === 0) {
        return "";
    }

    return matches[matches.length - 1][1];
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
        /@Path\s*\(\s*["'`]([^"'`]+)["'`]\s*\)[\s\S]{0,300}?\bclass\s+\w+/
    );

    return match ? match[1] : "";
}

export async function detectJaxRsRoutes(filePath) {
    const content = await fs.readFile(filePath, "utf-8");

    const hasRestEvidence =
        /(?:javax|jakarta)\.ws\.rs/.test(content) ||
        /@(Path|GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)\b/.test(content);

    if (!hasRestEvidence || !/@Path\b/.test(content)) {
        return [];
    }

    const framework = /jakarta\.ws\.rs/.test(content)
        ? "Jakarta REST"
        : "JAX-RS";

    const interfaces = [];
    const classPrefix = extractClassPrefix(content);
    let match;

    while ((match = METHOD_BLOCK_PATTERN.exec(content)) !== null) {
        const annotations = match[1];
        const methodMatches = [
            ...annotations.matchAll(
                /@(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)\b/g
            ),
        ];

        if (methodMatches.length === 0) {
            continue;
        }

        const routePath = extractPath(annotations);

        for (const methodMatch of methodMatches) {
            interfaces.push({
                type: "http",
                protocol: "rest",
                framework,
                role: "server",
                method: METHOD_ANNOTATIONS.get(methodMatch[1]),
                path: joinPaths(classPrefix, routePath),
            });
        }
    }

    return interfaces;
}
