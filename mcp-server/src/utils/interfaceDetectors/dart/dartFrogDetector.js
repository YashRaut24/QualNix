import fs from "node:fs/promises";

function deriveRoutePath(filePath) {
    const normalized = filePath.replace(/\\/g, "/");
    const marker = "/routes/";
    const index = normalized.lastIndexOf(marker);

    if (index === -1) {
        return "";
    }

    const routeFile = normalized
        .slice(index + marker.length)
        .replace(/\.dart$/i, "");

    const segments = routeFile
        .split("/")
        .filter((segment) => segment && segment !== "index")
        .map((segment) =>
            segment.replace(/^\[(.+)\]$/, ":$1")
        );

    return segments.length === 0 ? "/" : `/${segments.join("/")}`;
}

function extractMethods(content) {
    const methods = [
        ...content.matchAll(
            /HttpMethod\.(get|post|put|patch|delete|head|options)/gi
        ),
    ].map((match) => match[1].toUpperCase());

    return methods.length > 0 ? [...new Set(methods)] : ["ANY"];
}

export async function detectDartFrogRoutes(filePath) {
    const content = await fs.readFile(filePath, "utf-8");

    const hasDartFrogEvidence =
        /package:dart_frog/.test(content) ||
        /\bonRequest\s*\(\s*RequestContext\s+context\s*\)/.test(
            content
        );

    if (!hasDartFrogEvidence) {
        return [];
    }

    const routePath = deriveRoutePath(filePath);

    if (!routePath) {
        return [];
    }

    return extractMethods(content).map((method) => ({
        type: "http",
        protocol: "rest",
        framework: "Dart Frog",
        role: "server",
        method,
        path: routePath,
    }));
}
