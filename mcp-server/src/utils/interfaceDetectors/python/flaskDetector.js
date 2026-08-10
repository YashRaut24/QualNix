import fs from "node:fs/promises";

const DECORATOR_PATTERN =
    /@(?:app|router)\.(route|get|post|put|patch|delete|options|head)\s*\(([\s\S]*?)\)/gi;

function extractMethods(argumentsText, decorator) {
    const methodsMatch = argumentsText.match(
        /methods\s*=\s*[\[\(]([\s\S]*?)[\]\)]/i
    );

    if (methodsMatch) {
        const methods = [
            ...methodsMatch[1].matchAll(
                /["'`]([A-Za-z]+)["'`]/g
            ),
        ];

        if (methods.length > 0) {
            return methods.map((match) =>
                match[1].toUpperCase()
            );
        }
    }

    if (decorator === "route") {
        return ["GET"];
    }

    return [decorator.toUpperCase()];
}

export async function detectFlaskRoutes(filePath) {
    const content = await fs.readFile(filePath, "utf-8");

    const hasFlaskEvidence =
        /from\s+flask\s+import\b/.test(content) ||
        /import\s+flask\b/.test(content) ||
        /\b(?:Flask|Blueprint)\s*\(/.test(content) ||
        /@(?:app|router)\.route\s*\(/.test(content);

    if (!hasFlaskEvidence) {
        return [];
    }

    const interfaces = [];
    let match;

    while (
        (match = DECORATOR_PATTERN.exec(content)) !== null
    ) {
        const decorator = match[1].toLowerCase();
        const argumentsText = match[2];

        const pathMatch = argumentsText.match(
            /(?:^\s*|rule\s*=\s*)["'`]([^"'`]+)["'`]/
        );

        if (!pathMatch) {
            continue;
        }

        const routePath = pathMatch[1];

        const methods = extractMethods(
            argumentsText,
            decorator
        );

        for (const method of methods) {
            interfaces.push({
                type: "http",
                protocol: "rest",
                framework: "Flask",
                role: "server",
                method,
                path: routePath,
            });
        }
    }

    return interfaces;
}
