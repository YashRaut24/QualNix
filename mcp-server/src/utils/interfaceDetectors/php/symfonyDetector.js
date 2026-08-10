import fs from "node:fs/promises";

const ATTRIBUTE_PATTERN =
    /#\[\s*Route\s*\(([\s\S]*?)\)\s*\]/g;

const ANNOTATION_PATTERN =
    /@Route\s*\(([\s\S]*?)\)/g;

function extractPath(argumentsText) {
    const match = argumentsText.match(/["']([^"']+)["']/);

    return match ? match[1] : "";
}

function extractMethods(argumentsText) {
    const methodsMatch = argumentsText.match(
        /methods\s*[:=]\s*[\{\[]([\s\S]*?)[\}\]]/
    );

    if (!methodsMatch) {
        return ["ANY"];
    }

    const methods = [
        ...methodsMatch[1].matchAll(/["']([A-Za-z]+)["']/g),
    ].map((match) => match[1].toUpperCase());

    return methods.length > 0 ? methods : ["ANY"];
}

function collectRoutes(content, pattern, interfaces) {
    let match;

    while ((match = pattern.exec(content)) !== null) {
        const routePath = extractPath(match[1]);

        if (!routePath) {
            continue;
        }

        for (const method of extractMethods(match[1])) {
            interfaces.push({
                type: "http",
                protocol: "rest",
                framework: "Symfony",
                role: "server",
                method,
                path: routePath,
            });
        }
    }
}

export async function detectSymfonyRoutes(filePath) {
    const content = await fs.readFile(filePath, "utf-8");

    const hasSymfonyEvidence =
        /Symfony\\Component\\Routing/.test(content) ||
        /#\[\s*Route\s*\(/.test(content) ||
        /@Route\s*\(/.test(content);

    if (!hasSymfonyEvidence) {
        return [];
    }

    const interfaces = [];

    collectRoutes(content, ATTRIBUTE_PATTERN, interfaces);
    collectRoutes(content, ANNOTATION_PATTERN, interfaces);

    return interfaces;
}
