import fs from "node:fs/promises";

const ADD_SERVICER_PATTERN =
    /\badd_([A-Za-z_]\w*)Servicer_to_server\s*\(/g;

const CLASS_SERVICER_PATTERN =
    /class\s+([A-Za-z_]\w*)\s*\([^)]*Servicer[^)]*\)\s*:/g;

export async function detectPythonGrpcInterfaces(filePath) {
    const content = await fs.readFile(filePath, "utf-8");

    const hasGrpcEvidence =
        /import\s+grpc\b/.test(content) ||
        /from\s+grpc\b/.test(content) ||
        /\bgrpc\.server\s*\(/.test(content) ||
        /\badd_[A-Za-z_]\w*Servicer_to_server\s*\(/.test(content);

    if (!hasGrpcEvidence) {
        return [];
    }

    const services = new Set();
    let match;

    while ((match = ADD_SERVICER_PATTERN.exec(content)) !== null) {
        services.add(match[1]);
    }

    while ((match = CLASS_SERVICER_PATTERN.exec(content)) !== null) {
        services.add(match[1]);
    }

    if (services.size === 0 && /\bgrpc\.server\s*\(/.test(content)) {
        services.add("grpc");
    }

    return [...services].map((event) => ({
        type: "realtime",
        protocol: "grpc",
        framework: "gRPC",
        role: "server",
        event,
    }));
}
