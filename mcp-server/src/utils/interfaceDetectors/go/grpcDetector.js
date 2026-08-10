import fs from "node:fs/promises";

const REGISTER_PATTERN =
    /\bRegister([A-Za-z_]\w*)Server\s*\(/g;

export async function detectGoGrpcInterfaces(filePath) {
    const content = await fs.readFile(filePath, "utf-8");

    const hasGrpcEvidence =
        /google\.golang\.org\/grpc/.test(content) ||
        /\bgrpc\.NewServer\s*\(/.test(content) ||
        /\bRegister[A-Za-z_]\w*Server\s*\(/.test(content);

    if (!hasGrpcEvidence) {
        return [];
    }

    const events = new Set();
    let match;

    while ((match = REGISTER_PATTERN.exec(content)) !== null) {
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
