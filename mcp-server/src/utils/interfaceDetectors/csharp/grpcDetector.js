import fs from "node:fs/promises";

const BASE_CLASS_PATTERN =
    /:\s*([A-Za-z_]\w*)\.([A-Za-z_]\w*Base)\b/g;

const OVERRIDE_METHOD_PATTERN =
    /\bpublic\s+override\s+[\s\S]{0,160}?\s+([A-Z][A-Za-z_]\w*)\s*\(/g;

export async function detectCsharpGrpcInterfaces(filePath) {
    const content = await fs.readFile(filePath, "utf-8");

    const hasGrpcEvidence =
        /Grpc\.Core/.test(content) ||
        /Grpc\.AspNetCore/.test(content) ||
        /MapGrpcService\s*</.test(content) ||
        /:\s*[A-Za-z_]\w*\.[A-Za-z_]\w*Base\b/.test(content);

    if (!hasGrpcEvidence) {
        return [];
    }

    const events = new Set();
    let match;

    while ((match = BASE_CLASS_PATTERN.exec(content)) !== null) {
        events.add(match[1]);
    }

    while ((match = OVERRIDE_METHOD_PATTERN.exec(content)) !== null) {
        events.add(match[1]);
    }

    if (events.size === 0) {
        events.add("grpc");
    }

    return [...events].map((event) => ({
        type: "realtime",
        protocol: "grpc",
        framework: "gRPC",
        role: "server",
        event,
    }));
}
