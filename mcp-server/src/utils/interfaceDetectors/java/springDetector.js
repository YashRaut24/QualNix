import fs from "node:fs/promises";

const MAPPING_METHODS = new Map([
    ["GetMapping", "GET"],
    ["PostMapping", "POST"],
    ["PutMapping", "PUT"],
    ["PatchMapping", "PATCH"],
    ["DeleteMapping", "DELETE"],
]);

const MAPPING_PATTERN =
    /@(GetMapping|PostMapping|PutMapping|PatchMapping|DeleteMapping|RequestMapping)\s*(?:\(([^)]*)\))?/g;

function extractPath(argumentsText) {
    if (!argumentsText || !argumentsText.trim()) {
        return "";
    }

    const valueMatch = argumentsText.match(
        /(?:value|path)\s*=\s*(?:\{)?\s*["'`]([^"'`]+)["'`]/
    );

    if (valueMatch) {
        return valueMatch[1];
    }

    const directMatch = argumentsText.match(
        /["'`]([^"'`]+)["'`]/
    );

    return directMatch ? directMatch[1] : "";
}

function extractRequestMappingMethods(argumentsText) {
    const methods = [
        ...argumentsText.matchAll(
            /RequestMethod\.(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)/g
        ),
    ].map((match) => match[1]);

    if (methods.length > 0) {
        return methods;
    }

    return ["ANY"];
}

function joinPaths(prefix, routePath) {
    const joined = `${prefix || ""}/${routePath || ""}`.replace(
        /\/+/g,
        "/"
    );

    if (!joined || joined === "/") {
        return "/";
    }

    return joined.startsWith("/") ? joined : `/${joined}`;
}

function extractClassPrefix(content) {
    const match = content.match(
        /@RequestMapping\s*(?:\(([^)]*)\))?[\s\S]{0,300}?\b(?:class|interface|record)\s+\w+/
    );

    return match ? extractPath(match[1] || "") : "";
}

function isClassLevelMapping(content, index) {
    const slice = content.slice(index, index + 300);
    const braceIndex = slice.indexOf("{");
    const segment =
        braceIndex >= 0 ? slice.slice(0, braceIndex) : slice;

    return /\b(?:class|interface|record)\b/.test(segment);
}

export async function detectSpringRoutes(filePath) {
    const content = await fs.readFile(filePath, "utf-8");

    const hasSpringEvidence =
        /org\.springframework\./.test(content) ||
        /@(RestController|Controller|RequestMapping|GetMapping|PostMapping|PutMapping|PatchMapping|DeleteMapping)\b/.test(
            content
        );

    if (!hasSpringEvidence) {
        return [];
    }

    const interfaces = [];
    const classPrefix = extractClassPrefix(content);

    let match;

    while ((match = MAPPING_PATTERN.exec(content)) !== null) {
        const annotation = match[1];
        const argumentsText = match[2] || "";

        if (
            annotation === "RequestMapping" &&
            isClassLevelMapping(content, match.index)
        ) {
            continue;
        }

        const methods =
            annotation === "RequestMapping"
                ? extractRequestMappingMethods(argumentsText)
                : [MAPPING_METHODS.get(annotation)];

        const routePath = extractPath(argumentsText);

        for (const method of methods) {
            interfaces.push({
                type: "http",
                protocol: "rest",
                framework: "Spring",
                role: "server",
                method,
                path: joinPaths(classPrefix, routePath),
            });
        }
    }

    return interfaces;
}
