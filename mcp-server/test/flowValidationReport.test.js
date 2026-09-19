import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { buildFlowValidationReport } from "../src/utils/flowValidationReport.js";
import { setProjectRoot } from "../src/context/projectContext.js";

async function createTempFiles(filesMap) {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "qualnix-flow-report-"));
    setProjectRoot(tempDir);
    const relativePaths = [];

    for (const [relativePath, content] of Object.entries(filesMap)) {
        const fullPath = path.join(tempDir, relativePath);
        await fs.mkdir(path.dirname(fullPath), { recursive: true });
        await fs.writeFile(fullPath, content, "utf-8");
        relativePaths.push(relativePath.replace(/\\/g, "/"));
    }

    return {
        tempDir,
        relativePaths,
        cleanup: async () => {
            await fs.rm(tempDir, { recursive: true, force: true });
        },
    };
}

function findFlow(report, name) {
    return report.flows.find((flow) => flow.name === name);
}

test("Flow Validation Report marks fully connected Socket.IO flow complete", async () => {
    const { tempDir, relativePaths, cleanup } = await createTempFiles({
        "client/CardClient.jsx": `
import socket from "socket.io-client";

socket.emit("card:create", { title: "New" });
socket.on("card:created", (card) => console.log(card));
`,
        "server/cards.js": `
export function registerCards(io, socket) {
    socket.on("card:create", async (data) => {
        const card = await Card.create(data);
        io.emit("card:created", card);
    });
}
`,
    });

    try {
        const report = await buildFlowValidationReport(relativePaths, tempDir);
        const flow = findFlow(report, "card:create");

        assert.ok(flow);
        assert.equal(flow.status, "complete");
        assert.equal(flow.confidence, 1);
        assert.deepEqual(flow.missing, []);
        assert.deepEqual(flow.steps, [
            "client.emit",
            "server.on",
            "Card.create",
            "server.emit",
            "client.on",
        ]);
        assert.deepEqual(report.summary, {
            total: 1,
            complete: 1,
            partial: 0,
            broken: 0,
        });
    } finally {
        await cleanup();
    }
});

test("Flow Validation Report marks matched handler without operation partial", async () => {
    const { tempDir, relativePaths, cleanup } = await createTempFiles({
        "client/UserClient.jsx": `
import socket from "socket.io-client";

socket.emit("user:update", { id: "1" });
socket.on("user:updated", (user) => console.log(user));
`,
        "server/users.js": `
export function registerUsers(io, socket) {
    socket.on("user:update", (data) => {
        io.emit("user:updated", data);
    });
}
`,
    });

    try {
        const report = await buildFlowValidationReport(relativePaths, tempDir);
        const flow = findFlow(report, "user:update");

        assert.ok(flow);
        assert.equal(flow.status, "partial");
        assert.ok(flow.missing.includes("Database operation"));
        assert.ok(
            flow.issues.some(
                (issue) => issue.code === "missing_database_operation"
            )
        );
    } finally {
        await cleanup();
    }
});

test("Flow Validation Report marks client trigger with no handler broken", async () => {
    const { tempDir, relativePaths, cleanup } = await createTempFiles({
        "client/UserClient.jsx": `
import socket from "socket.io-client";

socket.emit("user:delete", { id: "1" });
`,
    });

    try {
        const report = await buildFlowValidationReport(relativePaths, tempDir);
        const flow = findFlow(report, "user:delete");

        assert.ok(flow);
        assert.equal(flow.status, "broken");
        assert.ok(flow.missing.includes("Server handler"));
        assert.ok(flow.issues.some((issue) => issue.code === "missing_handler"));
        assert.equal(report.summary.broken, 1);
    } finally {
        await cleanup();
    }
});

test("Flow Validation Report recognizes HTTP response paths as complete output", async () => {
    const { tempDir, relativePaths, cleanup } = await createTempFiles({
        "client/api.js": `
import axios from "axios";

export function createCard(data) {
    return axios.post("/api/cards", data);
}
`,
        "server/cards.js": `
import express from "express";
const router = express.Router();

router.post("/api/cards", async (req, res) => {
    const card = await Card.create(req.body);
    return res.status(201).json(card);
});
`,
    });

    try {
        const report = await buildFlowValidationReport(relativePaths, tempDir);
        const flow = findFlow(report, "POST /api/cards");

        assert.ok(flow);
        assert.equal(flow.status, "complete");
        assert.ok(flow.steps.includes("server.response"));
        assert.ok(flow.steps.includes("client.receive_response"));
        assert.deepEqual(flow.evidence.httpResponses, ["server.response"]);
    } finally {
        await cleanup();
    }
});

test("Flow Validation Report flags HTTP handlers without response paths", async () => {
    const { tempDir, relativePaths, cleanup } = await createTempFiles({
        "client/api.js": `
import axios from "axios";
import socket from "socket.io-client";

export function createCard(data) {
    return axios.post("/api/cards", data);
}

socket.on("card:created", (card) => console.log(card));
`,
        "server/cards.js": `
import express from "express";
const router = express.Router();

router.post("/api/cards", async (req, res) => {
    const card = await Card.create(req.body);
    io.emit("card:created", card);
});
`,
    });

    try {
        const report = await buildFlowValidationReport(relativePaths, tempDir);
        const flow = findFlow(report, "POST /api/cards");

        assert.ok(flow);
        assert.equal(flow.status, "partial");
        assert.ok(flow.steps.includes("server.emit"));
        assert.ok(flow.steps.includes("client.on"));
        assert.ok(flow.missing.includes("HTTP response path"));
        assert.ok(
            flow.issues.some(
                (issue) => issue.code === "missing_http_response_path"
            )
        );
    } finally {
        await cleanup();
    }
});

test("Flow Validation Report detects deterministic event-name mismatches", async () => {
    const { tempDir, relativePaths, cleanup } = await createTempFiles({
        "client/CardClient.jsx": `
import socket from "socket.io-client";

socket.emit("card:create", { title: "New" });
socket.on("card:created", (card) => console.log(card));
`,
        "server/cards.js": `
export function registerCards(io, socket) {
    socket.on("card:create", async (data) => {
        const card = await Card.create(data);
        io.emit("card.created", card);
    });
}
`,
    });

    try {
        const report = await buildFlowValidationReport(relativePaths, tempDir);
        const flow = findFlow(report, "card:create");

        assert.ok(flow);
        assert.equal(flow.status, "partial");
        assert.ok(flow.missing.includes("Client consumer for card.created"));
        assert.ok(
            flow.issues.some(
                (issue) =>
                    issue.code === "mismatched_event_name" &&
                    issue.expected === "card.created" &&
                    issue.actual === "card:created"
            )
        );
    } finally {
        await cleanup();
    }
});
