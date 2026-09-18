import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import {
    extractDatabaseOperations,
    extractServerEmits,
    extractServerHandlerScopes,
    buildCrossLayerFlows,
} from "../src/utils/crossLayerFlowMapper.js";
import { setProjectRoot } from "../src/context/projectContext.js";

test("Database operations extraction", () => {
    const jsCode = `
        const card = await Card.create(req.body);
        const user = await User.findById(card.userId);
        await prisma.column.updateMany({ where: { id: 1 } });
        await cardRepository.save(card);
        await context.Cards.Add(card);
    `;

    const ops = extractDatabaseOperations(jsCode);
    assert.deepEqual(ops, [
        { model: "Card", operation: "create" },
        { model: "User", operation: "find" },
        { model: "Column", operation: "update" },
        { model: "Cards", operation: "create" },
    ]);
});

test("Server emits extraction", () => {
    const jsCode = `
        socket.emit("card:created", newCard);
        io.emit("board:updated", board);
        io.to(boardId).emit("activity:new", activity);
    `;

    const emits = extractServerEmits(jsCode);
    assert.deepEqual(emits, ["card:created", "board:updated", "activity:new"]);
});

test("Server handler scopes extraction for JavaScript/TypeScript", () => {
    const socketCode = `
        socket.on("card:create", async (data) => {
            const card = await Card.create(data);
            io.emit("card:created", card);
        });

        socket.on("card:delete", async (data) => {
            await Card.findByIdAndDelete(data.id);
            socket.emit("card:deleted", data.id);
        });
    `;

    const handlers = extractServerHandlerScopes(socketCode, "javascript", "server/sockets/cards.js");
    assert.equal(handlers.length, 2);
    assert.equal(handlers[0].event, "card:create");
    assert.equal(handlers[0].handler, 'socket.on("card:create")');
    assert.equal(handlers[1].event, "card:delete");
    assert.equal(handlers[1].handler, 'socket.on("card:delete")');
});

test("Server handler scopes extraction for Python, C#, Java, and Go", () => {
    const pythonCode = `
@socketio.on("card:create")
def handle_card_create(data):
    card = Card.objects.create(**data)
    emit("card:created", card)
    `;
    const pyHandlers = extractServerHandlerScopes(pythonCode, "python", "server/sockets.py");
    assert.equal(pyHandlers.length, 1);
    assert.equal(pyHandlers[0].event, "card:create");
    assert.equal(pyHandlers[0].handler, '@socketio.on("card:create") handle_card_create');

    const goCode = `
    r.POST("/api/cards", func(c *gin.Context) {
        db.Create(&card)
    })
    `;
    const goHandlers = extractServerHandlerScopes(goCode, "go", "server/routes.go");
    assert.equal(goHandlers.length, 1);
    assert.equal(goHandlers[0].method, "POST");
    assert.equal(goHandlers[0].path, "/api/cards");

    const javaCode = `
    @PostMapping("/api/cards")
    public Card createCard(@RequestBody Card card) {
        return cardRepository.save(card);
    }
    `;
    const javaHandlers = extractServerHandlerScopes(javaCode, "java", "server/CardController.java");
    assert.equal(javaHandlers.length, 1);
    assert.equal(javaHandlers[0].method, "POST");
    assert.equal(javaHandlers[0].path, "/api/cards");
});

test("End-to-end Cross-Layer Flow Mapping for Socket.IO (SyncStack pattern)", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "qualnix-test-"));

    const clientDir = path.join(tempDir, "client", "src");
    const serverDir = path.join(tempDir, "server", "src");
    await fs.mkdir(clientDir, { recursive: true });
    await fs.mkdir(serverDir, { recursive: true });

    const clientCode = `
        import React from 'react';
        import { socket } from './socket';

        export function CardModal() {
            const handleCreate = () => {
                socket.emit("card:create", { title: "New Card" });
            };

            React.useEffect(() => {
                socket.on("card:created", (newCard) => {
                    console.log("Card created on client", newCard);
                });
            }, []);

            return <button onClick={handleCreate}>Create</button>;
        }
    `;

    const serverCode = `
        export function registerCardHandlers(io, socket) {
            socket.on("card:create", async (data) => {
                const card = await Card.create({
                    title: data.title,
                });

                io.emit("card:created", card);
            });
        }
    `;

    const clientFilePath = path.join(clientDir, "CardModal.jsx");
    const serverFilePath = path.join(serverDir, "cardHandler.js");
    await fs.writeFile(clientFilePath, clientCode, "utf-8");
    await fs.writeFile(serverFilePath, serverCode, "utf-8");

    setProjectRoot(tempDir);

    const relativeFiles = [
        path.relative(tempDir, clientFilePath).replace(/\\/g, "/"),
        path.relative(tempDir, serverFilePath).replace(/\\/g, "/"),
    ];

    const flows = await buildCrossLayerFlows(relativeFiles, tempDir);

    assert.equal(flows.length, 1);
    const flow = flows[0];

    assert.equal(flow.event, "card:create");
    assert.equal(flow.protocol, "socketio");
    assert.equal(flow.type, "realtime");

    assert.ok(flow.client);
    assert.equal(flow.client.direction, "outgoing");
    assert.ok(flow.client.file.includes("CardModal.jsx"));

    assert.ok(flow.server);
    assert.equal(flow.server.handler, 'socket.on("card:create")');
    assert.ok(flow.server.file.includes("cardHandler.js"));

    assert.deepEqual(flow.databaseOperations, [
        {
            model: "Card",
            operation: "create",
        },
    ]);

    assert.deepEqual(flow.serverOutputs, ["card:created"]);
    assert.deepEqual(flow.clientListeners, ["card:created"]);

    await fs.rm(tempDir, { recursive: true, force: true });
});

test("End-to-end Cross-Layer Flow Mapping for REST/HTTP API", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "qualnix-rest-test-"));

    const clientDir = path.join(tempDir, "client", "src");
    const serverDir = path.join(tempDir, "server", "src");
    await fs.mkdir(clientDir, { recursive: true });
    await fs.mkdir(serverDir, { recursive: true });

    const clientCode = `
        import axios from 'axios';
        import { socket } from './socket';

        export async function createCard(data) {
            return await axios.post("/api/cards", data);
        }

        socket.on("card:created", (card) => {
            console.log(card);
        });
    `;

    const serverCode = `
        import express from 'express';
        const router = express.Router();

        router.post("/api/cards", async (req, res) => {
            const card = await Card.create(req.body);
            io.emit("card:created", card);
            res.status(201).json(card);
        });
    `;

    const clientFilePath = path.join(clientDir, "api.js");
    const serverFilePath = path.join(serverDir, "cards.js");
    await fs.writeFile(clientFilePath, clientCode, "utf-8");
    await fs.writeFile(serverFilePath, serverCode, "utf-8");

    setProjectRoot(tempDir);

    const relativeFiles = [
        path.relative(tempDir, clientFilePath).replace(/\\/g, "/"),
        path.relative(tempDir, serverFilePath).replace(/\\/g, "/"),
    ];

    const flows = await buildCrossLayerFlows(relativeFiles, tempDir);

    const restFlow = flows.find(f => f.type === "http");
    assert.ok(restFlow);
    assert.equal(restFlow.method, "POST");
    assert.equal(restFlow.path, "/api/cards");
    assert.equal(restFlow.protocol, "rest");
    assert.ok(restFlow.client);
    assert.ok(restFlow.server);
    assert.deepEqual(restFlow.databaseOperations, [
        { model: "Card", operation: "create" },
    ]);
    assert.deepEqual(restFlow.serverOutputs, ["card:created"]);
    assert.deepEqual(restFlow.clientListeners, ["card:created"]);

    await fs.rm(tempDir, { recursive: true, force: true });
});

test("End-to-end Cross-Layer Flow Mapping for WebSocket", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "qualnix-ws-test-"));

    const clientDir = path.join(tempDir, "client");
    const serverDir = path.join(tempDir, "server");
    await fs.mkdir(clientDir, { recursive: true });
    await fs.mkdir(serverDir, { recursive: true });

    const clientCode = `
        const ws = new WebSocket("ws://localhost:8080");
        ws.send(JSON.stringify({ type: "chat:message", text: "hello" }));
        ws.on("message", (data) => console.log(data));
    `;

    const serverCode = `
        import { WebSocketServer } from 'ws';
        const wss = new WebSocketServer({ port: 8080 });
        wss.on("connection", (ws) => {
            ws.on("chat:message", async (data) => {
                await Message.create({ text: data.text });
                ws.send("chat:received");
            });
        });
    `;

    const clientFilePath = path.join(clientDir, "client.js");
    const serverFilePath = path.join(serverDir, "server.js");
    await fs.writeFile(clientFilePath, clientCode, "utf-8");
    await fs.writeFile(serverFilePath, serverCode, "utf-8");

    setProjectRoot(tempDir);

    const relativeFiles = [
        path.relative(tempDir, clientFilePath).replace(/\\/g, "/"),
        path.relative(tempDir, serverFilePath).replace(/\\/g, "/"),
    ];

    const flows = await buildCrossLayerFlows(relativeFiles, tempDir, { protocol: "websocket" });
    assert.ok(flows.length >= 1);
    const wsFlow = flows[0];
    assert.equal(wsFlow.event, "chat:message");
    assert.equal(wsFlow.protocol, "websocket");
    assert.ok(wsFlow.client);
    assert.ok(wsFlow.server);
    assert.deepEqual(wsFlow.databaseOperations, [{ model: "Message", operation: "create" }]);
    assert.deepEqual(wsFlow.serverOutputs, ["chat:received"]);

    await fs.rm(tempDir, { recursive: true, force: true });
});

test("End-to-end Cross-Layer Flow Mapping for GraphQL & gRPC", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "qualnix-gql-grpc-test-"));

    const clientDir = path.join(tempDir, "client");
    const serverDir = path.join(tempDir, "server");
    await fs.mkdir(clientDir, { recursive: true });
    await fs.mkdir(serverDir, { recursive: true });

    const clientCode = `
        const result = await client.CreateCard({ title: "New Card" });
    `;

    const serverCode = `
        class CardServicer:
            def CreateCard(self, request, context):
                card = Card.objects.create(title=request.title)
                return card
    `;

    const clientFilePath = path.join(clientDir, "client.js");
    const serverFilePath = path.join(serverDir, "servicer.py");
    await fs.writeFile(clientFilePath, clientCode, "utf-8");
    await fs.writeFile(serverFilePath, serverCode, "utf-8");

    setProjectRoot(tempDir);

    const relativeFiles = [
        path.relative(tempDir, clientFilePath).replace(/\\/g, "/"),
        path.relative(tempDir, serverFilePath).replace(/\\/g, "/"),
    ];

    const flows = await buildCrossLayerFlows(relativeFiles, tempDir, { protocol: "grpc" });
    assert.ok(flows.length >= 1);
    const grpcFlow = flows[0];
    assert.equal(grpcFlow.name, "CreateCard");
    assert.equal(grpcFlow.protocol, "grpc");
    assert.ok(grpcFlow.client);

    await fs.rm(tempDir, { recursive: true, force: true });
});

test("Cross-Layer Flow Mapping: Unmatched server handlers & protocol filtering", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "qualnix-unmatched-test-"));

    const serverDir = path.join(tempDir, "server");
    await fs.mkdir(serverDir, { recursive: true });

    const serverCode = `
        import express from 'express';
        const app = express();

        app.delete("/api/boards/:id", async (req, res) => {
            await Board.findByIdAndDelete(req.params.id);
            await Card.deleteMany({ boardId: req.params.id });
            io.emit("board:deleted", req.params.id);
            res.status(200).send("Deleted");
        });
    `;

    const serverFilePath = path.join(serverDir, "boardServer.js");
    await fs.writeFile(serverFilePath, serverCode, "utf-8");

    setProjectRoot(tempDir);

    const relativeFiles = [
        path.relative(tempDir, serverFilePath).replace(/\\/g, "/"),
    ];

    const restFlows = await buildCrossLayerFlows(relativeFiles, tempDir, { protocol: "rest" });
    assert.equal(restFlows.length, 1);
    const flow = restFlows[0];
    assert.equal(flow.method, "DELETE");
    assert.equal(flow.path, "/api/boards/:id");
    assert.equal(flow.client, null);
    assert.ok(flow.server);
    assert.equal(flow.server.handler, 'app.delete("/api/boards/:id")');
    assert.deepEqual(flow.databaseOperations, [
        { model: "Board", operation: "delete" },
        { model: "Card", operation: "delete" },
    ]);
    assert.deepEqual(flow.serverOutputs, ["board:deleted"]);

    const socketFlows = await buildCrossLayerFlows(relativeFiles, tempDir, { protocol: "socketio" });
    assert.equal(socketFlows.length, 0);

    await fs.rm(tempDir, { recursive: true, force: true });
});
