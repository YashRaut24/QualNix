import fs from "node:fs/promises";
import path from "node:path";
import { setProjectRoot } from "../context/projectContext.js";
import { resolveProjectPath } from "./pathUtils.js";
import {
    buildCrossLayerFlows,
    extractClientTriggersAndListeners,
    extractServerHandlerScopes,
} from "./crossLayerFlowMapper.js";

const LANGUAGE_BY_EXTENSION = new Map([
    [".js", "javascript"],
    [".mjs", "javascript"],
    [".cjs", "javascript"],
    [".jsx", "javascript"],
    [".ts", "typescript"],
    [".tsx", "typescript"],
    [".py", "python"],
    [".java", "java"],
    [".cs", "csharp"],
    [".go", "go"],
    [".php", "php"],
    [".rb", "ruby"],
    [".rs", "rust"],
    [".kt", "kotlin"],
    [".kts", "kotlin"],
    [".swift", "swift"],
    [".dart", "dart"],
    [".scala", "scala"],
    [".sc", "scala"],
    [".ex", "elixir"],
    [".exs", "elixir"],
]);

const HTTP_RESPONSE_PATTERNS = [
    { step: "server.response", pattern: /\bres\.(?:status\s*\([^)]*\)\s*\.\s*)?(?:json|send|end)\s*\(/gi },
    { step: "server.response", pattern: /\b(?:reply|response|ctx|c)\.(?:status\s*\([^)]*\)\s*\.\s*)?(?:json|send|end|code|JSON|Send|SendString)\s*\(/g },
    { step: "server.response", pattern: /\breturn\s+(?:jsonify|JSONResponse|Response|FileResponse|RedirectResponse)\s*\(/gi },
    { step: "server.response", pattern: /\bjsonify\s*\(/gi },
    { step: "server.response", pattern: /\bResponseEntity\.(?:ok|created|accepted|status|noContent)\s*\(/g },
    { step: "server.response", pattern: /\breturn\s+(?:ResponseEntity|Response)\b/g },
    { step: "server.response", pattern: /\b(?:Ok|Created|Accepted|BadRequest|NotFound|NoContent)\s*\(/g },
    { step: "server.response", pattern: /\breturn\s+response\s*\(\)\s*->\s*json\s*\(/gi },
    { step: "server.response", pattern: /\bresponse\s*\(\)\s*->\s*json\s*\(/gi },
    { step: "server.response", pattern: /\brender\s+json:/gi },
    { step: "server.response", pattern: /\bHttpResponse::(?:Ok|Created|Accepted|NoContent|BadRequest)\s*\(/g },
    { step: "server.response", pattern: /\bResponse\.ok\s*\(/g },
    { step: "server.response", pattern: /\bcall\.respond\s*\(/g },
    { step: "server.response", pattern: /\breturn\s+["'][^"']*["']/g },
    { step: "server.response", pattern: /\breturn\s+[A-Za-z0-9_.$]+;?/g },
    { step: "server.response", pattern: /\bOk\s*\(/g },
    { step: "server.response", pattern: /\bjson\s*\(\s*conn\s*,/g },
    { step: "server.response", pattern: /\bsend_resp\s*\(/g },
];

function detectLanguage(file) {
    return LANGUAGE_BY_EXTENSION.get(path.extname(file).toLowerCase()) ?? null;
}

function handlerKey(handler) {
    if (!handler) return null;
    return `${handler.file}:${handler.line}:${handler.handler}`;
}

function flowName(flow) {
    if (flow.event) return flow.event;
    if (flow.name) return flow.name;
    if (flow.method && flow.path) return `${flow.method} ${flow.path}`;
    if (flow.method) return flow.method;
    return "unknown-flow";
}

function normalizeName(value) {
    return String(value ?? "")
        .toLowerCase()
        .replace(/^\/topic\//, "")
        .replace(/[^a-z0-9]/g, "");
}

function unique(items) {
    return [...new Set(items.filter(Boolean))];
}

function clientStep(flow) {
    if (flow.protocol === "socketio") return "client.emit";
    if (flow.protocol === "signalr") return "client.invoke";
    if (flow.protocol === "websocket") return "client.send";
    if (flow.protocol === "phoenix") return "client.push";
    if (flow.protocol === "graphql") return "client.graphql";
    if (flow.protocol === "grpc") return "client.rpc";
    if (flow.type === "http" || flow.protocol === "rest") return "client.request";
    return "client.interface";
}

function serverStep(flow) {
    if (flow.protocol === "socketio") return "server.on";
    if (flow.protocol === "signalr") return "server.hub";
    if (flow.protocol === "websocket" || flow.protocol === "phoenix") return "server.on";
    if (flow.protocol === "graphql") return "server.resolver";
    if (flow.protocol === "grpc") return "server.rpc";
    if (flow.type === "http" || flow.protocol === "rest") return "server.route";
    return "server.handler";
}

function serverOutputStep(flow) {
    if (flow.protocol === "signalr") return "server.send";
    if (flow.protocol === "websocket") return "server.send";
    if (flow.protocol === "phoenix") return "server.broadcast";
    return "server.emit";
}

function consumerStep(flow) {
    if (flow.protocol === "signalr") return "client.on";
    if (flow.protocol === "websocket") return "client.message";
    if (flow.protocol === "phoenix") return "client.on";
    return "client.on";
}

function databaseSteps(flow) {
    return (flow.databaseOperations ?? []).map(
        (operation) => `${operation.model}.${operation.operation}`
    );
}

function extractHttpResponseIndicators(body) {
    if (!body) return [];
    const indicators = [];

    for (const rule of HTTP_RESPONSE_PATTERNS) {
        rule.pattern.lastIndex = 0;
        if (rule.pattern.test(body)) {
            indicators.push(rule.step);
        }
    }

    return unique(indicators);
}

async function collectServerHandlers(files, projectRoot) {
    if (projectRoot) {
        setProjectRoot(projectRoot);
    }

    const handlers = [];
    const handlersByKey = new Map();

    for (const file of files) {
        const language = detectLanguage(file);
        if (!language) continue;

        let content;
        try {
            content = await fs.readFile(resolveProjectPath(file), "utf-8");
        } catch {
            continue;
        }

        for (const handler of extractServerHandlerScopes(content, language, file)) {
            handlers.push(handler);
            handlersByKey.set(handlerKey(handler), handler);
        }
    }

    return {
        handlers,
        handlersByKey,
    };
}

function findSimilarServer(flow, serverHandlers) {
    if (!flow.client || flow.server || serverHandlers.length === 0) return null;

    if (flow.event) {
        const wanted = normalizeName(flow.event);
        return serverHandlers.find(
            (handler) =>
                handler.event &&
                handler.event !== flow.event &&
                normalizeName(handler.event) === wanted
        ) ?? null;
    }

    if (flow.method && flow.path) {
        const wanted = normalizeName(flow.path);
        return serverHandlers.find(
            (handler) =>
                handler.type === "http" &&
                handler.method === flow.method &&
                handler.path !== flow.path &&
                normalizeName(handler.path) === wanted
        ) ?? null;
    }

    return null;
}

function findSimilarListener(output, clientListeners) {
    const wanted = normalizeName(output);
    if (!wanted) return null;

    return clientListeners.find(
        (listener) =>
            listener.event &&
            listener.event !== output &&
            normalizeName(listener.event) === wanted
    ) ?? null;
}

function hasListenerForOutput(flow, output) {
    return (flow.clientListeners ?? []).includes(output);
}

function issue(code, severity, message, details = {}) {
    return {
        code,
        severity,
        message,
        ...details,
    };
}

export function validateCrossLayerFlows(flows, context = {}) {
    const serverHandlers = context.serverHandlers ?? [];
    const serverHandlersByKey = context.serverHandlersByKey ?? new Map();
    const clientListeners = context.clientListeners ?? [];

    const validatedFlows = flows.map((flow) => {
        const issues = [];
        const missing = [];
        const steps = [];
        const matchedHandler = flow.server
            ? serverHandlersByKey.get(handlerKey(flow.server)) ?? null
            : null;
        const responseIndicators =
            flow.type === "http" || flow.protocol === "rest"
                ? extractHttpResponseIndicators(matchedHandler?.body)
                : [];
        const serverOutputs = flow.serverOutputs ?? [];
        const clientListenersForFlow = flow.clientListeners ?? [];

        if (flow.client) {
            steps.push(clientStep(flow));
        } else {
            missing.push("Client interface");
            issues.push(
                issue(
                    "missing_interface",
                    "partial",
                    "No client interface or trigger was matched to this server handler."
                )
            );
        }

        if (flow.server) {
            steps.push(serverStep(flow));
        } else {
            missing.push("Server handler");
            issues.push(
                issue(
                    "missing_handler",
                    "broken",
                    "The client interface has no matching server handler."
                )
            );

            const similarServer = findSimilarServer(flow, serverHandlers);
            if (similarServer) {
                issues.push(
                    issue(
                        "mismatched_event_name",
                        "partial",
                        "A similar server handler exists, but the names do not match exactly.",
                        {
                            expected: flow.event ?? flow.path,
                            actual: similarServer.event ?? similarServer.path,
                            file: similarServer.file,
                            line: similarServer.line,
                        }
                    )
                );
            }
        }

        if (flow.server && (flow.databaseOperations ?? []).length > 0) {
            steps.push(...databaseSteps(flow));
        } else if (flow.server) {
            missing.push("Database operation");
            issues.push(
                issue(
                    "missing_database_operation",
                    "partial",
                    "The handler has no identifiable model, repository, service, or database operation."
                )
            );
        }

        if (flow.server) {
            if (serverOutputs.length > 0) {
                steps.push(serverOutputStep(flow));
            }

            if (responseIndicators.length > 0) {
                steps.push(...responseIndicators);
            }

            if (flow.type === "http" || flow.protocol === "rest") {
                if (responseIndicators.length === 0) {
                    missing.push("HTTP response path");
                    issues.push(
                        issue(
                            "missing_http_response_path",
                            "partial",
                            "The handler has no identifiable HTTP response path."
                        )
                    );
                }
            } else if (serverOutputs.length === 0) {
                missing.push("Server output");
                issues.push(
                    issue(
                        "missing_server_output",
                        "partial",
                        "The handler has no identifiable server output or emit."
                    )
                );
            }
        }

        for (const output of serverOutputs) {
            if (hasListenerForOutput(flow, output)) {
                continue;
            }

            const similarListener = findSimilarListener(output, clientListeners);
            if (similarListener) {
                issues.push(
                    issue(
                        "mismatched_event_name",
                        "partial",
                        "A similar client consumer exists, but the output event name does not match exactly.",
                        {
                            expected: output,
                            actual: similarListener.event,
                            file: similarListener.file,
                            line: similarListener.line,
                        }
                    )
                );
            }

            missing.push(`Client consumer for ${output}`);
            issues.push(
                issue(
                    "missing_client_consumer",
                    "partial",
                    `Server output "${output}" has no matching client consumer.`
                )
            );
        }

        if (clientListenersForFlow.length > 0) {
            steps.push(consumerStep(flow));
        } else if (
            responseIndicators.length > 0 &&
            flow.client &&
            (flow.type === "http" || flow.protocol === "rest")
        ) {
            steps.push("client.receive_response");
        }

        if (
            issues.some((item) =>
                [
                    "missing_handler",
                    "missing_interface",
                    "missing_client_consumer",
                ].includes(item.code)
            )
        ) {
            issues.push(
                issue(
                    "unresolved_cross_file_relationship",
                    issues.some((item) => item.severity === "broken")
                        ? "broken"
                        : "partial",
                    "One or more cross-file relationships could not be resolved statically."
                )
            );
        }

        const status = issues.some((item) => item.severity === "broken")
            ? "broken"
            : issues.length > 0
                ? "partial"
                : "complete";
        const requiredChecks = [
            Boolean(flow.client),
            Boolean(flow.server),
            (flow.databaseOperations ?? []).length > 0,
            flow.type === "http" || flow.protocol === "rest"
                ? responseIndicators.length > 0
                : serverOutputs.length > 0,
            clientListenersForFlow.length > 0 ||
                (responseIndicators.length > 0 &&
                    flow.client &&
                    (flow.type === "http" || flow.protocol === "rest")),
        ];
        const confidence =
            Math.round(
                (requiredChecks.filter(Boolean).length / requiredChecks.length) *
                    100
            ) / 100;

        return {
            name: flowName(flow),
            status,
            confidence,
            protocol: flow.protocol,
            type: flow.type,
            steps: unique(steps),
            missing: unique(missing),
            issues,
            evidence: {
                client: flow.client ?? null,
                server: flow.server ?? null,
                databaseOperations: flow.databaseOperations ?? [],
                serverOutputs,
                httpResponses: responseIndicators,
                clientListeners: clientListenersForFlow,
            },
        };
    });

    return {
        flows: validatedFlows,
        summary: {
            total: validatedFlows.length,
            complete: validatedFlows.filter((flow) => flow.status === "complete")
                .length,
            partial: validatedFlows.filter((flow) => flow.status === "partial")
                .length,
            broken: validatedFlows.filter((flow) => flow.status === "broken")
                .length,
        },
    };
}

export async function buildFlowValidationReport(files, projectRoot, options = {}) {
    if (projectRoot) {
        setProjectRoot(projectRoot);
    }

    const flows = await buildCrossLayerFlows(files, projectRoot, options);
    const { handlers, handlersByKey } = await collectServerHandlers(
        files,
        projectRoot
    );
    const { listeners } = await extractClientTriggersAndListeners(
        files,
        projectRoot
    );

    return validateCrossLayerFlows(flows, {
        serverHandlers: handlers,
        serverHandlersByKey: handlersByKey,
        clientListeners: listeners,
    });
}
