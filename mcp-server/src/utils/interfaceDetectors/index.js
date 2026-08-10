import { detectExpressRoutes } from "./javascript/expressDetector.js";
import { detectSocketIoEvents } from "./javascript/socketIoDetector.js";
import { detectFastifyRoutes } from "./javascript/fastifyDetector.js";
import { detectNestJsRoutes } from "./javascript/nestJsDetector.js";
import { detectWebSocketEvents } from "./javascript/webSocketDetector.js";
import { detectGraphQlInterfaces } from "./javascript/graphqlDetector.js";
import { detectFlaskRoutes } from "./python/flaskDetector.js";
import { detectFastApiRoutes } from "./python/fastApiDetector.js";
import { detectDjangoRoutes } from "./python/djangoDetector.js";
import { detectFlaskSocketIoEvents } from "./python/flaskSocketIoDetector.js";
import { detectDjangoChannelsInterfaces } from "./python/djangoChannelsDetector.js";
import { detectPythonGrpcInterfaces } from "./python/grpcDetector.js";
import { detectSpringRoutes } from "./java/springDetector.js";
import { detectJaxRsRoutes } from "./java/jaxRsDetector.js";
import { detectSpringWebSocketInterfaces } from "./java/springWebSocketDetector.js";
import { detectJavaGrpcInterfaces } from "./java/grpcDetector.js";
import { detectAspNetCoreRoutes } from "./csharp/aspNetCoreDetector.js";
import { detectSignalRInterfaces } from "./csharp/signalRDetector.js";
import { detectCsharpGrpcInterfaces } from "./csharp/grpcDetector.js";
import { detectGoNetHttpRoutes } from "./go/netHttpDetector.js";
import { detectGinRoutes } from "./go/ginDetector.js";
import { detectEchoRoutes } from "./go/echoDetector.js";
import { detectFiberRoutes } from "./go/fiberDetector.js";
import { detectChiRoutes } from "./go/chiDetector.js";
import { detectGoGrpcInterfaces } from "./go/grpcDetector.js";
import { detectGoWebSocketInterfaces } from "./go/webSocketDetector.js";
import { detectLaravelRoutes } from "./php/laravelDetector.js";
import { detectSymfonyRoutes } from "./php/symfonyDetector.js";
import { detectSlimRoutes } from "./php/slimDetector.js";
import { detectRailsRoutes } from "./ruby/railsDetector.js";
import { detectSinatraRoutes } from "./ruby/sinatraDetector.js";
import { detectActixWebRoutes } from "./rust/actixWebDetector.js";
import { detectAxumRoutes } from "./rust/axumDetector.js";
import { detectRocketRoutes } from "./rust/rocketDetector.js";
import { detectWarpRoutes } from "./rust/warpDetector.js";
import { detectRustGrpcInterfaces } from "./rust/grpcDetector.js";
import { detectKtorRoutes } from "./kotlin/ktorDetector.js";
import { detectVaporRoutes } from "./swift/vaporDetector.js";
import { detectShelfRoutes } from "./dart/shelfDetector.js";
import { detectDartFrogRoutes } from "./dart/dartFrogDetector.js";
import { detectPlayRoutes } from "./scala/playDetector.js";
import { detectAkkaHttpRoutes } from "./scala/akkaHttpDetector.js";
import { detectPhoenixRoutes } from "./elixir/phoenixDetector.js";

export const interfaceDetectors = [
    {
        name: "express",
        languages: ["javascript", "typescript"],
        detect: detectExpressRoutes,
    },
    {
        name: "socketio-js",
        languages: ["javascript", "typescript"],
        detect: detectSocketIoEvents,
    },
    {
        name: "fastify",
        languages: ["javascript", "typescript"],
        detect: detectFastifyRoutes,
    },
    {
        name: "nestjs",
        languages: ["javascript", "typescript"],
        detect: detectNestJsRoutes,
    },
    {
        name: "websocket-js",
        languages: ["javascript", "typescript"],
        detect: detectWebSocketEvents,
    },
    {
        name: "graphql-js",
        languages: ["javascript", "typescript"],
        detect: detectGraphQlInterfaces,
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
        name: "flask-socketio",
        languages: ["python"],
        detect: detectFlaskSocketIoEvents,
    },
    {
        name: "django-channels",
        languages: ["python"],
        detect: detectDjangoChannelsInterfaces,
    },
    {
        name: "grpc-python",
        languages: ["python"],
        detect: detectPythonGrpcInterfaces,
    },
    {
        name: "spring",
        languages: ["java", "kotlin"],
        detect: detectSpringRoutes,
    },
    {
        name: "jax-rs",
        languages: ["java"],
        detect: detectJaxRsRoutes,
    },
    {
        name: "spring-websocket",
        languages: ["java", "kotlin"],
        detect: detectSpringWebSocketInterfaces,
    },
    {
        name: "grpc-java",
        languages: ["java"],
        detect: detectJavaGrpcInterfaces,
    },
    {
        name: "aspnet-core",
        languages: ["csharp"],
        detect: detectAspNetCoreRoutes,
    },
    {
        name: "signalr",
        languages: ["csharp"],
        detect: detectSignalRInterfaces,
    },
    {
        name: "grpc-csharp",
        languages: ["csharp"],
        detect: detectCsharpGrpcInterfaces,
    },
    {
        name: "go-net-http",
        languages: ["go"],
        detect: detectGoNetHttpRoutes,
    },
    {
        name: "gin",
        languages: ["go"],
        detect: detectGinRoutes,
    },
    {
        name: "echo",
        languages: ["go"],
        detect: detectEchoRoutes,
    },
    {
        name: "fiber",
        languages: ["go"],
        detect: detectFiberRoutes,
    },
    {
        name: "chi",
        languages: ["go"],
        detect: detectChiRoutes,
    },
    {
        name: "grpc-go",
        languages: ["go"],
        detect: detectGoGrpcInterfaces,
    },
    {
        name: "websocket-go",
        languages: ["go"],
        detect: detectGoWebSocketInterfaces,
    },
    {
        name: "laravel",
        languages: ["php"],
        detect: detectLaravelRoutes,
    },
    {
        name: "symfony",
        languages: ["php"],
        detect: detectSymfonyRoutes,
    },
    {
        name: "slim",
        languages: ["php"],
        detect: detectSlimRoutes,
    },
    {
        name: "rails",
        languages: ["ruby"],
        detect: detectRailsRoutes,
    },
    {
        name: "sinatra",
        languages: ["ruby"],
        detect: detectSinatraRoutes,
    },
    {
        name: "actix-web",
        languages: ["rust"],
        detect: detectActixWebRoutes,
    },
    {
        name: "axum",
        languages: ["rust"],
        detect: detectAxumRoutes,
    },
    {
        name: "rocket",
        languages: ["rust"],
        detect: detectRocketRoutes,
    },
    {
        name: "warp",
        languages: ["rust"],
        detect: detectWarpRoutes,
    },
    {
        name: "grpc-rust",
        languages: ["rust"],
        detect: detectRustGrpcInterfaces,
    },
    {
        name: "ktor",
        languages: ["kotlin"],
        detect: detectKtorRoutes,
    },
    {
        name: "vapor",
        languages: ["swift"],
        detect: detectVaporRoutes,
    },
    {
        name: "shelf",
        languages: ["dart"],
        detect: detectShelfRoutes,
    },
    {
        name: "dart-frog",
        languages: ["dart"],
        detect: detectDartFrogRoutes,
    },
    {
        name: "play-framework",
        languages: ["scala"],
        detect: detectPlayRoutes,
    },
    {
        name: "akka-http",
        languages: ["scala"],
        detect: detectAkkaHttpRoutes,
    },
    {
        name: "phoenix",
        languages: ["elixir"],
        detect: detectPhoenixRoutes,
    },
];
