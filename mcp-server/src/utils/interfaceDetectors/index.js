import { detectExpressRoutes } from "./javascript/expressDetector.js";
import { detectSocketIoEvents } from "./javascript/socketIoDetector.js";

export const interfaceDetectors = [
    {
        name: "express",
        detect: detectExpressRoutes,
    },
    {
        name: "socketio",
        detect: detectSocketIoEvents,
    },
];