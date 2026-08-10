import fs from "node:fs/promises";

const HANDLE_FUNC_PATTERN =
    /\b(?:http|mux|router|server)\.HandleFunc\s*\(\s*["'`]([^"'`]+)["'`]/g;

const HANDLE_PATTERN =
    /\b(?:http|mux|router|server)\.Handle\s*\(\s*["'`]([^"'`]+)["'`]/g;

function collectRoutes(content, pattern, interfaces) {
    let match;

    while ((match = pattern.exec(content)) !== null) {
        interfaces.push({
            type: "http",
            protocol: "rest",
            framework: "net/http",
            role: "server",
            method: "ANY",
            path: match[1],
        });
    }
}

export async function detectGoNetHttpRoutes(filePath) {
    const content = await fs.readFile(filePath, "utf-8");

    const hasNetHttpEvidence =
        /["'`]net\/http["'`]/.test(content) ||
        /\bhttp\.(?:Handle|HandleFunc|NewServeMux)\b/.test(content);

    if (!hasNetHttpEvidence) {
        return [];
    }

    const interfaces = [];

    collectRoutes(content, HANDLE_FUNC_PATTERN, interfaces);
    collectRoutes(content, HANDLE_PATTERN, interfaces);

    return interfaces;
}
