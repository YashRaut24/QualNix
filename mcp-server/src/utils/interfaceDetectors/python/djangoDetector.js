import fs from "node:fs/promises";

const PATH_PATTERN =
    /path\s*\(\s*["'`]([^"'`]+)["'`]\s*,\s*([^,)]+)/g;

const RE_PATH_PATTERN =
    /re_path\s*\(\s*["'`]([^"'`]+)["'`]\s*,\s*([^,)]+)/g;

export async function detectDjangoRoutes(filePath) {
    const content = await fs.readFile(filePath, "utf-8");

    const interfaces = [];

    let match;

    while ((match = PATH_PATTERN.exec(content)) !== null) {
        interfaces.push({
            type: "http",
            protocol: "rest",
            framework: "Django",
            role: "server",
            method: "ANY",
            path: match[1],
        });
    }

    while ((match = RE_PATH_PATTERN.exec(content)) !== null) {
        interfaces.push({
            type: "http",
            protocol: "rest",
            framework: "Django",
            role: "server",
            method: "ANY",
            path: match[1],
        });
    }

    return interfaces;
}