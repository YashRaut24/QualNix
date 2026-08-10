import fs from "node:fs/promises";

const PATH_PATTERN =
    /warp::path!?\s*\(\s*["']([^"']+)["']\s*\)/g;

const METHOD_PATTERN =
    /warp::(get|post|put|patch|delete|head|options)\s*\(/gi;

function collectMethods(segment) {
    const methods = new Set();
    let match;

    METHOD_PATTERN.lastIndex = 0;

    while ((match = METHOD_PATTERN.exec(segment)) !== null) {
        methods.add(match[1].toUpperCase());
    }

    return methods.size > 0 ? [...methods] : ["ANY"];
}

export async function detectWarpRoutes(filePath) {
    const content = await fs.readFile(filePath, "utf-8");

    if (!/warp::/.test(content)) {
        return [];
    }

    const interfaces = [];
    let match;

    while ((match = PATH_PATTERN.exec(content)) !== null) {
        const start = Math.max(0, match.index - 200);
        const end = Math.min(content.length, match.index + 300);
        const methods = collectMethods(content.slice(start, end));

        for (const method of methods) {
            interfaces.push({
                type: "http",
                protocol: "rest",
                framework: "Warp",
                role: "server",
                method,
                path: match[1].startsWith("/")
                    ? match[1]
                    : `/${match[1]}`,
            });
        }
    }

    return interfaces;
}
