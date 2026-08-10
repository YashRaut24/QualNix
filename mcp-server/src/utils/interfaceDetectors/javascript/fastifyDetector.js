import fs from "node:fs/promises";

const ROUTE_PATTERN =
    /\b(fastify|app|server)\.(get|post|put|patch|delete|options|head)\s*\(\s*["'`]([^"'`]+)["'`]/gi;

const FASTIFY_EVIDENCE_PATTERN =
    /(?:from\s*["'`]fastify["'`]|require\s*\(\s*["'`]fastify["'`]\s*\)|\bfastify\s*\(|\bFastify\s*\()/i;

export async function detectFastifyRoutes(filePath) {
    const content = await fs.readFile(filePath, "utf-8");

    if (!FASTIFY_EVIDENCE_PATTERN.test(content)) {
        return [];
    }

    const interfaces = [];
    let match;

    while ((match = ROUTE_PATTERN.exec(content)) !== null) {
        interfaces.push({
            type: "http",
            protocol: "rest",
            framework: "Fastify",
            role: "server",
            method: match[2].toUpperCase(),
            path: match[3],
        });
    }

    return interfaces;
}
