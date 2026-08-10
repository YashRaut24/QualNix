import fs from "node:fs/promises";

const MAPPING_PATTERNS = [
    {
        annotation: "GetMapping",
        method: "GET",
    },
    {
        annotation: "PostMapping",
        method: "POST",
    },
    {
        annotation: "PutMapping",
        method: "PUT",
    },
    {
        annotation: "PatchMapping",
        method: "PATCH",
    },
    {
        annotation: "DeleteMapping",
        method: "DELETE",
    },
];

function extractPath(argumentsText) {
    if (!argumentsText.trim()) {
        return "";
    }

    const valueMatch = argumentsText.match(
        /(?:value|path)\s*=\s*["'`]([^"'`]+)["'`]/
    );

    if (valueMatch) {
        return valueMatch[1];
    }

    const directMatch = argumentsText.match(
        /["'`]([^"'`]+)["'`]/
    );

    return directMatch ? directMatch[1] : "";
}

export async function detectSpringRoutes(filePath) {
    const content = await fs.readFile(filePath, "utf-8");

    const interfaces = [];

    const classMapping = content.match(
        /@RequestMapping\s*\(\s*(?:value\s*=\s*)?["'`]([^"'`]+)["'`]\s*\)/
    );

    const classPrefix = classMapping
        ? classMapping[1]
        : "";

    for (const mapping of MAPPING_PATTERNS) {
        const pattern = new RegExp(
            `@${mapping.annotation}\\s*(?:\\(([^)]*)\\))?`,
            "g"
        );

        let match;

        while ((match = pattern.exec(content)) !== null) {
            const routePath = extractPath(
                match[1] ?? ""
            );

            interfaces.push({
                type: "http",
                protocol: "rest",
                framework: "Spring",
                role: "server",
                method: mapping.method,
                path: `${classPrefix}${routePath}` || "/",
            });
        }
    }

    return interfaces;
}