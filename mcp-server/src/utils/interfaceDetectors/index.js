import { detectExpressRoutes } from "./javascript/expressDetector.js";
import { detectSocketIoEvents } from "./javascript/socketIoDetector.js";

export const interfaceDetectors = [
    {
        name: "express",
        languages: ["javascript", "typescript"],
        detect: detectExpressRoutes,
    },
    {
        name: "socketio",
        languages: ["javascript", "typescript"],
        detect: detectSocketIoEvents,
    },
];