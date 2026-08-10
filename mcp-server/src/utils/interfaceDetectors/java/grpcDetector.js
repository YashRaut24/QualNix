import fs from "node:fs/promises";

const SERVICE_BASE_PATTERN =
    /(?:extends|implements)\s+([A-Za-z_]\w*(?:Grpc)?\.[A-Za-z_]\w*ImplBase|[A-Za-z_]\w*ImplBase)\b/g;

const METHOD_PATTERN =
    /@Override\s+[\s\S]{0,200}?\b(?:StreamObserver<[^>]+>|void|[A-Za-z_]\w*)\s+([a-zA-Z_]\w*)\s*\(/g;

export async function detectJavaGrpcInterfaces(filePath) {
    const content = await fs.readFile(filePath, "utf-8");

    const hasGrpcEvidence =
        /io\.grpc/.test(content) ||
        /@GrpcService\b/.test(content) ||
        /\b[A-Za-z_]\w*ImplBase\b/.test(content) ||
        /\bbindService\s*\(/.test(content);

    if (!hasGrpcEvidence) {
        return [];
    }

    const events = new Set();
    let match;

    while ((match = SERVICE_BASE_PATTERN.exec(content)) !== null) {
        events.add(match[1].replace(/.*\./, "").replace(/ImplBase$/, ""));
    }

    while ((match = METHOD_PATTERN.exec(content)) !== null) {
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
