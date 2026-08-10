import fs from "node:fs/promises";

const ANNOTATION_BLOCK_PATTERN =
    /((?:\s*@[A-Za-z][\w.]*\s*(?:\([^)]*\))?\s*)+)\s*def\s+\w+/g;

export async function detectPlayRoutes(filePath) {
    const content = await fs.readFile(filePath, "utf-8");

    const hasPlayEvidence =
        /play\.api\.mvc/.test(content) ||
        /play\.routing/.test(content) ||
        /playframework/.test(content);

    if (!hasPlayEvidence) {
        return [];
    }

    const interfaces = [];
    let match;

    while (
        (match = ANNOTATION_BLOCK_PATTERN.exec(content)) !== null
    ) {
        const annotations = match[1];
        const pathMatch = annotations.match(
            /@Path\s*\(\s*["']([^"']+)["']\s*\)/
        );
        const methodMatches = [
            ...annotations.matchAll(
                /@(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)\b/g
            ),
        ];

        if (!pathMatch || methodMatches.length === 0) {
            continue;
        }

        for (const methodMatch of methodMatches) {
            interfaces.push({
                type: "http",
                protocol: "rest",
                framework: "Play Framework",
                role: "server",
                method: methodMatch[1],
                path: pathMatch[1],
            });
        }
    }

    return interfaces;
}
