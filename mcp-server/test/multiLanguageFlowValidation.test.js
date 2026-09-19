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

async function createTempFiles(filesMap) {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "qualnix-ml-flow-"));
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
            try {
                await fs.rm(tempDir, { recursive: true, force: true });
            } catch {}
        },
    };
}

test("Multi-Language Validation: Python Flask/FastAPI & Flask-SocketIO flow", async () => {
    const clientCode = `
import requests

def create_task(title):
    response = requests.post("http://localhost:5000/api/tasks", json={"title": title})
    return response.json()
`;

    const serverCode = `
from flask import Flask, request, jsonify
from flask_socketio import SocketIO, emit
from models import Task, db

app = Flask(__name__)
socketio = SocketIO(app)

@app.post("/api/tasks")
def handle_create_task():
    data = request.get_json()
    task = Task.objects.create(title=data["title"])
    socketio.emit("task:created", {"id": task.id, "title": task.title})
    return jsonify({"id": task.id})

@socketio.on("task:update")
def handle_task_update(data):
    Task.objects.filter(id=data["id"]).update(status=data["status"])
    emit("task:updated", data)
`;

    const listenerCode = `
import socketio

sio = socketio.Client()
sio.connect('http://localhost:5000')

@sio.on("task:created")
def on_task_created(data):
    print("Received task created:", data)

@sio.on("task:updated")
def on_task_updated(data):
    print("Received task updated:", data)
`;

    const { tempDir, relativePaths, cleanup } = await createTempFiles({
        "client/api.py": clientCode,
        "client/listener.py": listenerCode,
        "server/app.py": serverCode,
    });

    try {
        const flows = await buildCrossLayerFlows(relativePaths, tempDir);
        assert.ok(flows.length >= 2);

        const restFlow = flows.find((f) => f.type === "http" && f.path.includes("/api/tasks"));
        assert.ok(restFlow);
        assert.equal(restFlow.method, "POST");
        assert.ok(restFlow.client);
        assert.ok(restFlow.server);
        assert.deepEqual(restFlow.databaseOperations, [{ model: "Task", operation: "create" }]);
        assert.deepEqual(restFlow.serverOutputs, ["task:created"]);
        assert.deepEqual(restFlow.clientListeners, ["task:created"]);

        const socketFlow = flows.find((f) => f.event === "task:update");
        assert.ok(socketFlow);
        assert.equal(socketFlow.protocol, "socketio");
        assert.ok(socketFlow.server);
        assert.deepEqual(socketFlow.databaseOperations, [{ model: "Task", operation: "update" }]);
        assert.deepEqual(socketFlow.serverOutputs, ["task:updated"]);
        assert.deepEqual(socketFlow.clientListeners, ["task:updated"]);
    } finally {
        await cleanup();
    }
});

test("Multi-Language Validation: Java Spring REST & WebSocket (@MessageMapping) flow", async () => {
    const clientCode = `
import React from 'react';
import axios from 'axios';
import { Client } from '@stomp/stompjs';

export function OrderComponent() {
    const submitOrder = async () => {
        await axios.post("/api/orders", { amount: 100 });
    };
    return <button onClick={submitOrder}>Pay</button>;
}
`;

    const serverCode = `
package com.example.demo.controller;

import org.springframework.web.bind.annotation.*;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.simp.SimpMessagingTemplate;

@RestController
@RequestMapping("/api/orders")
public class OrderController {
    private final OrderRepository orderRepository;
    private final SimpMessagingTemplate simpMessagingTemplate;

    @PostMapping("/api/orders")
    public Order createOrder(@RequestBody OrderRequest req) {
        Order order = orderRepository.save(new Order(req.getAmount()));
        simpMessagingTemplate.convertAndSend("/topic/order:created", order);
        return order;
    }

    @MessageMapping("order:status")
    public void updateOrderStatus(OrderStatusUpdate update) {
        orderRepository.save(update.toOrder());
        simpMessagingTemplate.convertAndSend("/topic/order:updated", update);
    }
}
`;

    const listenerCode = `
import socket from 'socket.io-client';
socket.on("/topic/order:created", (order) => {
    console.log("Order created:", order);
});
`;

    const { tempDir, relativePaths, cleanup } = await createTempFiles({
        "client/OrderComponent.jsx": clientCode,
        "client/orderListener.js": listenerCode,
        "server/OrderController.java": serverCode,
    });

    try {
        const flows = await buildCrossLayerFlows(relativePaths, tempDir);
        assert.ok(flows.length >= 1);

        const restFlow = flows.find((f) => f.type === "http" && f.path.includes("/api/orders"));
        assert.ok(restFlow);
        assert.equal(restFlow.method, "POST");
        assert.ok(restFlow.client);
        assert.ok(restFlow.server);
        assert.deepEqual(restFlow.databaseOperations, [{ model: "Order", operation: "create" }]);
        assert.deepEqual(restFlow.serverOutputs, ["/topic/order:created"]);
        assert.deepEqual(restFlow.clientListeners, ["/topic/order:created"]);
    } finally {
        await cleanup();
    }
});

test("Multi-Language Validation: C# ASP.NET Core & SignalR Hub flow", async () => {
    const clientCode = `
import * as signalR from "@microsoft/signalr";

const connection = new signalR.HubConnectionBuilder()
    .withUrl("/chatHub")
    .build();

export async function sendMessage(user, message) {
    await connection.invoke("SendMessage", user, message);
}

connection.on("ReceiveMessage", (user, message) => {
    console.log(user, message);
});
`;

    const serverCode = `
using Microsoft.AspNetCore.SignalR;
using System.Threading.Tasks;

public class ChatHub : Hub
{
    private readonly ApplicationDbContext _context;

    public async Task SendMessage(string user, string message)
    {
        _context.Messages.Add(new Message { User = user, Content = message });
        await _context.SaveChangesAsync();
        await Clients.All.SendAsync("ReceiveMessage", user, message);
    }
}
`;

    const { tempDir, relativePaths, cleanup } = await createTempFiles({
        "client/chatClient.js": clientCode,
        "server/ChatHub.cs": serverCode,
    });

    try {
        const flows = await buildCrossLayerFlows(relativePaths, tempDir);
        assert.equal(flows.length, 1);

        const hubFlow = flows[0];
        assert.equal(hubFlow.event, "SendMessage");
        assert.equal(hubFlow.protocol, "signalr");
        assert.ok(hubFlow.client);
        assert.ok(hubFlow.server);
        assert.deepEqual(hubFlow.databaseOperations, [{ model: "Messages", operation: "create" }]);
        assert.deepEqual(hubFlow.serverOutputs, ["ReceiveMessage"]);
        assert.deepEqual(hubFlow.clientListeners, ["ReceiveMessage"]);
    } finally {
        await cleanup();
    }
});

test("Multi-Language Validation: Go Gin / Fiber REST & Go WebSocket flow", async () => {
    const clientCode = `
package main

import (
    "net/http"
    "github.com/gorilla/websocket"
)

func main() {
    http.Post("/api/products", "application/json", nil)
    
    conn, _, _ := websocket.DefaultDialer.Dial("ws://localhost:8080/ws", nil)
    conn.WriteJSON("product:ping")
}
`;

    const serverCode = `
package main

import (
    "github.com/gin-gonic/gin"
    "gorm.io/gorm"
)

func RegisterRoutes(r *gin.Engine, db *gorm.DB) {
    r.POST("/api/products", func(c *gin.Context) {
        var product Product
        db.Create(&product)
        c.JSON(200, product)
    })
}

func handleWebSocket(ws *websocket.Conn, db *gorm.DB) {
    // event: product:ping
    switch msg.Type {
    case "product:ping":
        db.Find(&products)
        ws.WriteJSON("product:pong")
    }
}
`;

    const listenerCode = `
const ws = new WebSocket("ws://localhost:8080/ws");
ws.on("product:pong", (data) => {
    console.log("Got pong", data);
});
`;

    const { tempDir, relativePaths, cleanup } = await createTempFiles({
        "client/main.go": clientCode,
        "client/webListener.js": listenerCode,
        "server/main.go": serverCode,
    });

    try {
        const flows = await buildCrossLayerFlows(relativePaths, tempDir);
        assert.ok(flows.length >= 2);

        const restFlow = flows.find((f) => f.type === "http" && f.path.includes("/api/products"));
        assert.ok(restFlow);
        assert.equal(restFlow.method, "POST");
        assert.ok(restFlow.client);
        assert.ok(restFlow.server);
        assert.deepEqual(restFlow.databaseOperations, [{ model: "Product", operation: "create" }]);

        const wsFlow = flows.find((f) => f.protocol === "websocket" && f.event === "product:ping");
        assert.ok(wsFlow);
        assert.ok(wsFlow.client);
        assert.ok(wsFlow.server);
        assert.deepEqual(wsFlow.databaseOperations, [{ model: "Products", operation: "find" }]);
        assert.deepEqual(wsFlow.serverOutputs, ["product:pong"]);
        assert.deepEqual(wsFlow.clientListeners, ["product:pong"]);
    } finally {
        await cleanup();
    }
});

test("Multi-Language Validation: PHP Laravel REST & Eloquent flow", async () => {
    const clientCode = `
import axios from 'axios';

export async function createInvoice(data) {
    return await axios.post("/api/invoices", data);
}
`;

    const serverCode = `
<?php

use Illuminate\\Support\\Facades\\Route;
use App\\Models\\Invoice;
use App\\Events\\InvoiceCreated;

Route::post("/api/invoices", function () {
    $invoice = Invoice::create(request()->all());
    broadcast(new InvoiceCreated($invoice));
    return response()->json($invoice);
});
`;

    const listenerCode = `
const socket = io();
socket.on("InvoiceCreated", (invoice) => {
    console.log("Invoice created", invoice);
});
`;

    const { tempDir, relativePaths, cleanup } = await createTempFiles({
        "client/invoiceService.js": clientCode,
        "client/invoiceListener.js": listenerCode,
        "server/routes.php": serverCode,
    });

    try {
        const flows = await buildCrossLayerFlows(relativePaths, tempDir);
        assert.ok(flows.length >= 1);

        const restFlow = flows.find((f) => f.type === "http" && f.path.includes("/api/invoices"));
        assert.ok(restFlow);
        assert.equal(restFlow.method, "POST");
        assert.ok(restFlow.client);
        assert.ok(restFlow.server);
        assert.deepEqual(restFlow.databaseOperations, [{ model: "Invoice", operation: "create" }]);
        assert.deepEqual(restFlow.serverOutputs, ["InvoiceCreated"]);
        assert.deepEqual(restFlow.clientListeners, ["InvoiceCreated"]);
    } finally {
        await cleanup();
    }
});

test("Multi-Language Validation: Ruby Rails REST & ActionCable flow", async () => {
    const clientCode = `
import axios from 'axios';

export async function createComment(data) {
    return await axios.post("/api/comments", data);
}
`;

    const serverCode = `
class CommentsController < ApplicationController
  def create
    @comment = Comment.create(comment_params)
    ActionCable.server.broadcast("comments_channel", "comment:created")
    render json: @comment
  end
end

Rails.application.routes.draw do
  post "/api/comments", to: "comments#create"
end
`;

    const listenerCode = `
const socket = io();
socket.on("comment:created", (comment) => {
    console.log("New comment", comment);
});
`;

    const { tempDir, relativePaths, cleanup } = await createTempFiles({
        "client/commentService.js": clientCode,
        "client/commentListener.js": listenerCode,
        "server/routes.rb": serverCode,
    });

    try {
        const flows = await buildCrossLayerFlows(relativePaths, tempDir);
        assert.ok(flows.length >= 1);

        const restFlow = flows.find((f) => f.type === "http" && f.path.includes("/api/comments"));
        assert.ok(restFlow);
        assert.equal(restFlow.method, "POST");
        assert.ok(restFlow.client);
        assert.ok(restFlow.server);
        assert.deepEqual(restFlow.databaseOperations, [{ model: "Comment", operation: "create" }]);
        assert.deepEqual(restFlow.serverOutputs, ["comment:created"]);
        assert.deepEqual(restFlow.clientListeners, ["comment:created"]);
    } finally {
        await cleanup();
    }
});

test("Multi-Language Validation: Rust Actix-Web / Axum flow", async () => {
    const clientCode = `
fetch("/api/items", { method: "POST", body: JSON.stringify({ name: "Widget" }) });
`;

    const serverCode = `
use actix_web::{post, web, HttpResponse, Responder};

#[post("/api/items")]
pub async fn create_item(item: web::Json<Item>) -> impl Responder {
    diesel::insert_into(items::table).values(&item.into_inner());
    HttpResponse::Ok().finish()
}
`;

    const { tempDir, relativePaths, cleanup } = await createTempFiles({
        "client/itemClient.js": clientCode,
        "server/handlers.rs": serverCode,
    });

    try {
        const flows = await buildCrossLayerFlows(relativePaths, tempDir);
        assert.ok(flows.length >= 1);

        const restFlow = flows.find((f) => f.type === "http" && f.path.includes("/api/items"));
        assert.ok(restFlow);
        assert.equal(restFlow.method, "POST");
        assert.ok(restFlow.client);
        assert.ok(restFlow.server);
        assert.deepEqual(restFlow.databaseOperations, [{ model: "Items", operation: "create" }]);
    } finally {
        await cleanup();
    }
});

test("Multi-Language Validation: Kotlin Ktor REST & WebSocket flow", async () => {
    const clientCode = `
import io.ktor.client.*
import io.ktor.client.request.*

suspend fun sendFeedback() {
    val client = HttpClient()
    client.post("/api/feedback")
}
`;

    const serverCode = `
package com.example

import io.ktor.server.application.*
import io.ktor.server.routing.*

fun Application.module() {
    routing {
        post("/api/feedback") {
            FeedbackRepository.save(feedback)
            send(Frame.Text("feedback:received"))
        }
        webSocket("/ws/feedback") {
            send(Frame.Text("feedback:ready"))
        }
    }
}
`;

    const listenerCode = `
const ws = new WebSocket("ws://localhost:8080/ws/feedback");
ws.on("feedback:received", (data) => console.log(data));
`;

    const { tempDir, relativePaths, cleanup } = await createTempFiles({
        "client/KtorClient.kt": clientCode,
        "client/feedbackListener.js": listenerCode,
        "server/Application.kt": serverCode,
    });

    try {
        const flows = await buildCrossLayerFlows(relativePaths, tempDir);
        assert.ok(flows.length >= 1);

        const restFlow = flows.find((f) => f.type === "http" && f.path.includes("/api/feedback"));
        assert.ok(restFlow);
        assert.equal(restFlow.method, "POST");
        assert.ok(restFlow.client);
        assert.ok(restFlow.server);
        assert.deepEqual(restFlow.databaseOperations, [{ model: "Feedback", operation: "create" }]);
        assert.deepEqual(restFlow.serverOutputs, ["feedback:received"]);
        assert.deepEqual(restFlow.clientListeners, ["feedback:received"]);
    } finally {
        await cleanup();
    }
});

test("Multi-Language Validation: Swift Vapor REST & WebSocket flow", async () => {
    const clientCode = `
import SwiftUI

struct ClientApi {
    func triggerUpload() {
        var req = URLRequest(url: URL(string: "/api/uploads")!)
        req.httpMethod = "POST"
        URLSession.shared.dataTask(with: req)
    }
}
`;

    const serverCode = `
import Vapor

func routes(_ app: Application) throws {
    app.post("api", "uploads") { req -> String in
        Card.query(on: req.db)
        ws.send("upload:complete")
        return "ok"
    }
    app.webSocket("ws", "sync") { req, ws in
        ws.send("sync:connected")
    }
}
`;

    const listenerCode = `
const socket = io();
socket.on("upload:complete", () => console.log("Uploaded!"));
`;

    const { tempDir, relativePaths, cleanup } = await createTempFiles({
        "client/ClientApi.swift": clientCode,
        "client/uploadListener.js": listenerCode,
        "server/routes.swift": serverCode,
    });

    try {
        const flows = await buildCrossLayerFlows(relativePaths, tempDir);
        assert.ok(flows.length >= 1);

        const restFlow = flows.find((f) => f.type === "http" && f.path.includes("/api/uploads"));
        assert.ok(restFlow);
        assert.equal(restFlow.method, "POST");
        assert.ok(restFlow.client);
        assert.ok(restFlow.server);
        assert.deepEqual(restFlow.databaseOperations, [{ model: "Card", operation: "find" }]);
        assert.deepEqual(restFlow.serverOutputs, ["upload:complete"]);
        assert.deepEqual(restFlow.clientListeners, ["upload:complete"]);
    } finally {
        await cleanup();
    }
});

test("Multi-Language Validation: Dart Flutter / Shelf flow", async () => {
    const clientCode = `
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:web_socket_channel/io.dart';

void createPost() async {
    await http.post(Uri.parse("/api/posts"));
    
    final channel = IOWebSocketChannel.connect("ws://localhost:8080/ws");
    channel.stream.listen((message) {
        print(message);
    });
}
`;

    const serverCode = `
import 'package:shelf/shelf.dart';
import 'package:shelf_router/shelf_router.dart';

Router getRouter() {
    final router = Router();
    router.post('/api/posts', (Request req) {
        supabase.from('posts').insert({'title': 'Hello'});
        return Response.ok('created');
    });
    return router;
}
`;

    const { tempDir, relativePaths, cleanup } = await createTempFiles({
        "client/PostWidget.dart": clientCode,
        "server/router.dart": serverCode,
    });

    try {
        const flows = await buildCrossLayerFlows(relativePaths, tempDir);
        assert.ok(flows.length >= 1);

        const restFlow = flows.find((f) => f.type === "http" && f.path.includes("/api/posts"));
        assert.ok(restFlow);
        assert.equal(restFlow.method, "POST");
        assert.ok(restFlow.client);
        assert.ok(restFlow.server);
        assert.deepEqual(restFlow.databaseOperations, [{ model: "Posts", operation: "create" }]);
    } finally {
        await cleanup();
    }
});

test("Multi-Language Validation: Scala Play Framework / Akka-HTTP flow", async () => {
    const clientCode = `
import axios from 'axios';

export async function submitTelemetry() {
    return await axios.post("/api/telemetry", {});
}
`;

    const serverCode = `
package controllers

import play.api.mvc._
import javax.inject._

@Singleton
class TelemetryController @Inject()(cc: ControllerComponents) extends AbstractController(cc) {
    def telemetry = Action { request =>
        TelemetryRepository.save(record)
        Ok("Saved")
    }
}
`;

    const { tempDir, relativePaths, cleanup } = await createTempFiles({
        "client/telemetryClient.js": clientCode,
        "server/TelemetryController.scala": serverCode,
    });

    try {
        const flows = await buildCrossLayerFlows(relativePaths, tempDir);
        assert.ok(flows.length >= 1);

        const restFlow = flows.find((f) => f.type === "http" && f.path.includes("/telemetry"));
        assert.ok(restFlow);
        assert.equal(restFlow.method, "POST");
        assert.ok(restFlow.client);
        assert.ok(restFlow.server);
        assert.deepEqual(restFlow.databaseOperations, [{ model: "Telemetry", operation: "create" }]);
    } finally {
        await cleanup();
    }
});

test("Multi-Language Validation: Elixir Phoenix Router & Phoenix Channel flow", async () => {
    const clientCode = `
import { Socket } from "phoenix";

const socket = new Socket("/socket");
socket.connect();
const channel = socket.channel("room:lobby", {});
channel.join();

export function sendAlert(message) {
    channel.push("alert:trigger");
}

channel.on("alert:broadcast", (payload) => {
    console.log("Broadcast alert:", payload);
});
`;

    const serverCode = `
defmodule MyAppWeb.RoomChannel do
  use MyAppWeb, :channel
  alias MyApp.Repo
  alias MyApp.Alert

  def handle_in("alert:trigger", payload, socket) do
    Repo.insert(%Alert{message: payload["message"]})
    broadcast!(socket, "alert:broadcast", %{status: "ok"})
    {:noreply, socket}
  end
end

defmodule MyAppWeb.Router do
  use MyAppWeb, :router

  scope "/api", MyAppWeb do
    pipe_through :api
    get "/health", HealthController, :index
  end
end
`;

    const { tempDir, relativePaths, cleanup } = await createTempFiles({
        "client/phoenixSocket.js": clientCode,
        "server/channels/room_channel.ex": serverCode,
    });

    try {
        const flows = await buildCrossLayerFlows(relativePaths, tempDir);
        assert.ok(flows.length >= 2);

        const channelFlow = flows.find((f) => f.event === "alert:trigger");
        assert.ok(channelFlow);
        assert.equal(channelFlow.protocol, "phoenix");
        assert.ok(channelFlow.client);
        assert.ok(channelFlow.server);
        assert.deepEqual(channelFlow.databaseOperations, [{ model: "Alert", operation: "create" }]);
        assert.deepEqual(channelFlow.serverOutputs, ["alert:broadcast"]);
        assert.deepEqual(channelFlow.clientListeners, ["alert:broadcast"]);

        const unmatchedRest = flows.find((f) => f.path === "/health");
        assert.ok(unmatchedRest);
        assert.equal(unmatchedRest.method, "GET");
        assert.equal(unmatchedRest.client, null);
        assert.ok(unmatchedRest.server);
    } finally {
        await cleanup();
    }
});

test("Multi-Language Validation: Cross-Language Polyglot Flow (Flutter Dart Client -> Go Backend -> WebSocket -> React Client)", async () => {
    const dartMobileClient = `
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;

Future<void> checkoutCart() async {
    await http.post(Uri.parse("/api/checkout"));
}
`;

    const goBackendServer = `
package main

import (
    "github.com/gin-gonic/gin"
    "gorm.io/gorm"
)

func RegisterCheckout(r *gin.Engine, db *gorm.DB) {
    r.POST("/api/checkout", func(c *gin.Context) {
        var order Order
        db.Create(&order)
        ws.WriteJSON("order:confirmed")
        c.JSON(200, order)
    })
}
`;

    const reactWebConsumer = `
import React, { useEffect } from 'react';
import socket from 'socket.io-client';

export function OrderNotification() {
    useEffect(() => {
        socket.on("order:confirmed", (order) => {
            alert("Order confirmed: " + order.id);
        });
    }, []);
    return <div>Listening for orders...</div>;
}
`;

    const { tempDir, relativePaths, cleanup } = await createTempFiles({
        "mobile_client/CheckoutScreen.dart": dartMobileClient,
        "backend_server/checkout.go": goBackendServer,
        "web_client/OrderNotification.jsx": reactWebConsumer,
    });

    try {
        const flows = await buildCrossLayerFlows(relativePaths, tempDir);
        assert.ok(flows.length >= 1);

        const checkoutFlow = flows.find((f) => f.type === "http" && f.path.includes("/api/checkout"));
        assert.ok(checkoutFlow);
        assert.equal(checkoutFlow.method, "POST");
        assert.ok(checkoutFlow.client);
        assert.ok(checkoutFlow.client.file.includes("CheckoutScreen.dart"));
        assert.ok(checkoutFlow.server);
        assert.ok(checkoutFlow.server.file.includes("checkout.go"));
        assert.deepEqual(checkoutFlow.databaseOperations, [{ model: "Order", operation: "create" }]);
        assert.deepEqual(checkoutFlow.serverOutputs, ["order:confirmed"]);
        assert.deepEqual(checkoutFlow.clientListeners, ["order:confirmed"]);
    } finally {
        await cleanup();
    }
});
