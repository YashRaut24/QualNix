import { detectExpressRoutes } from "./javascript/expressDetector.js";
import { detectSocketIoEvents } from "./javascript/socketIoDetector.js";
import { detectFlaskRoutes } from "./python/flaskDetector.js";
import { detectFastApiRoutes } from "./python/fastApiDetector.js";
import { detectDjangoRoutes } from "./python/djangoDetector.js";
import { detectSpringRoutes } from "./java/springDetector.js";

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
    {
        name: "flask",
        languages: ["python"],
        detect: detectFlaskRoutes,
    },
    {
        name: "fastapi",
        languages: ["python"],
        detect: detectFastApiRoutes,
    },
    {
        name: "django",
        languages: ["python"],
        detect: detectDjangoRoutes,
    },
    {
        name: "spring",
        languages: ["java"],
        detect: detectSpringRoutes,
    },
];