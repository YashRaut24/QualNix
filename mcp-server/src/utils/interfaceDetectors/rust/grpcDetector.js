import fs from "node:fs/promises";

const ADD_SERVICE_PATTERN =
    /\.add_service\s*\(\s*([A-Za-z_]\w*)Server::new/g;

export async function detectRustGrpcInterfaces(filePath) {
    const content = await fs.readFile(filePath, "utf-8");

    const hasGrpcEvidence =
        /tonic::/.test(content) ||
        /tonic_build/.test(content) ||
        /tonic::include_proto!/.test(content) ||
        /\.add_service\s*\(/.test(content);

    if (!hasGrpcEvidence) {
        return [];
    }

    const events = new Set();
    let match;

    while ((match = ADD_SERVICE_PATTERN.exec(content)) !== null) {
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
