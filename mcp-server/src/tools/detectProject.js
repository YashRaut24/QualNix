import fs from "node:fs/promises";
import path from "node:path";
import { resolveProjectPath } from "../utils/pathUtils.js";
import { scanProjectDirectory } from "../utils/projectScanner.js";

const TECHNOLOGY_RULES = {
    frontend: {
        React: ["react", "react-dom"],
        Vite: ["vite"],
        NextJS: ["next"],
        Vue: ["vue"],
        Nuxt: ["nuxt"],
        Angular: ["@angular/core"],
        Svelte: ["svelte"],
        SvelteKit: ["@sveltejs/kit"],
        Astro: ["astro"],
    },

    backend: {
        Express: ["express"],
        Fastify: ["fastify"],
        NestJS: ["@nestjs/core"],
        Koa: ["koa"],
        Hapi: ["@hapi/hapi"],
        Flask: ["flask"],
        FastAPI: ["fastapi"],
        Django: ["django"],
        Spring: ["spring-boot", "spring-web", "spring-webmvc"],
        "ASP.NET": ["Microsoft.AspNetCore"],
        Gin: ["github.com/gin-gonic/gin"],
        Echo: ["github.com/labstack/echo"],
        Fiber: ["github.com/gofiber/fiber"],
        Rails: ["rails"],
        Laravel: ["laravel/framework"],
        Symfony: ["symfony/framework-bundle"],
        Phoenix: ["phoenix"],
        Actix: ["actix-web"],
        Axum: ["axum"],
        Rocket: ["rocket"],
        Ktor: ["io.ktor"],
        Vapor: ["vapor"],
    },

    database: {
        MongoDB: ["mongodb", "mongoose", "pymongo", "motor"],
        PostgreSQL: ["pg", "psycopg2", "psycopg", "postgres"],
        MySQL: ["mysql", "mysql2", "mysqlclient"],
        Redis: ["redis", "ioredis"],
        SQLite: ["sqlite3", "better-sqlite3", "sqlite"],
        Cassandra: ["cassandra-driver"],
        DynamoDB: ["@aws-sdk/client-dynamodb"],
        Firebase: ["firebase", "firebase-admin"],
    },

    orm: {
        Mongoose: ["mongoose"],
        Prisma: ["prisma", "@prisma/client"],
        Sequelize: ["sequelize"],
        TypeORM: ["typeorm"],
        SQLAlchemy: ["sqlalchemy"],
        Hibernate: ["hibernate-core"],
        EntityFramework: ["Microsoft.EntityFrameworkCore"],
        ActiveRecord: ["activerecord"],
        Ecto: ["ecto"],
    },

    realtime: {
        "Socket.IO": ["socket.io", "socket.io-client"],
        WebSocket: ["ws", "websocket"],
        SignalR: ["@microsoft/signalr"],
        "Flask-SocketIO": ["flask-socketio"],
    },

    ai: {
        OpenAI: ["openai"],
        Anthropic: ["@anthropic-ai/sdk"],
        LangChain: ["langchain", "@langchain/core"],
        Transformers: ["transformers", "@huggingface/transformers"],
        TensorFlow: ["tensorflow", "@tensorflow/tfjs"],
        PyTorch: ["torch"],
        ScikitLearn: ["scikit-learn"],
        Pandas: ["pandas"],
        NumPy: ["numpy"],
    },

    testing: {
        Jest: ["jest"],
        Vitest: ["vitest"],
        Mocha: ["mocha"],
        Cypress: ["cypress"],
        Playwright: ["playwright", "@playwright/test"],
        Pytest: ["pytest"],
        JUnit: ["junit"],
    },
};

const MANIFESTS = [
    "package.json",
    "requirements.txt",
    "pyproject.toml",
    "Pipfile",
    "pom.xml",
    "build.gradle",
    "build.gradle.kts",
    "settings.gradle",
    "settings.gradle.kts",
    "go.mod",
    "Cargo.toml",
    "Gemfile",
    "composer.json",
    "pubspec.yaml",
    "Package.swift",
    "mix.exs",
];

function normalizeDependencies(dependencies) {
    return new Set(
        dependencies.map((dependency) =>
            dependency.toLowerCase()
        )
    );
}

function addUnique(target, value) {
    if (!target.includes(value)) {
        target.push(value);
    }
}

function mergeTechnologies(target, source) {
    for (const category of Object.keys(source)) {
        if (!target[category]) {
            target[category] = [];
        }

        for (const technology of source[category]) {
            addUnique(target[category], technology);
        }
    }
}

function detectFromDependencies(dependencies) {
    const normalizedDependencies =
        normalizeDependencies(dependencies);

    const detected = {};

    for (const [category, technologies] of Object.entries(
        TECHNOLOGY_RULES
    )) {
        detected[category] = [];

        for (const [technology, packages] of Object.entries(
            technologies
        )) {
            if (
                packages.some((packageName) =>
                    normalizedDependencies.has(
                        packageName.toLowerCase()
                    )
                )
            ) {
                addUnique(
                    detected[category],
                    technology
                );
            }
        }
    }

    return detected;
}

function detectLanguageFromFile(file) {
    const extension = path.extname(file).toLowerCase();

    const languages = {
        ".js": "JavaScript",
        ".mjs": "JavaScript",
        ".cjs": "JavaScript",
        ".jsx": "JavaScript",
        ".ts": "TypeScript",
        ".tsx": "TypeScript",
        ".py": "Python",
        ".java": "Java",
        ".cs": "CSharp",
        ".go": "Go",
        ".rs": "Rust",
        ".rb": "Ruby",
        ".php": "PHP",
        ".kt": "Kotlin",
        ".kts": "Kotlin",
        ".swift": "Swift",
        ".dart": "Dart",
        ".scala": "Scala",
        ".sc": "Scala",
        ".ex": "Elixir",
        ".exs": "Elixir",
    };

    return languages[extension] ?? null;
}

function detectLanguagesFromFiles(files) {
    const languages = [];

    for (const file of files) {
        const language = detectLanguageFromFile(file);

        if (language) {
            addUnique(languages, language);
        }
    }

    return languages;
}

function detectPackageManager(files) {
    const managers = [];

    const managerRules = [
        {
            name: "npm",
            files: ["package-lock.json"],
        },
        {
            name: "Yarn",
            files: ["yarn.lock"],
        },
        {
            name: "pnpm",
            files: ["pnpm-lock.yaml"],
        },
        {
            name: "Bun",
            files: ["bun.lock", "bun.lockb"],
        },
        {
            name: "pip",
            files: [
                "requirements.txt",
                "pyproject.toml",
                "Pipfile",
            ],
        },
        {
            name: "Maven",
            files: ["pom.xml"],
        },
        {
            name: "Gradle",
            files: [
                "build.gradle",
                "build.gradle.kts",
            ],
        },
        {
            name: "Go Modules",
            files: ["go.mod"],
        },
        {
            name: "Cargo",
            files: ["Cargo.toml"],
        },
        {
            name: "Bundler",
            files: ["Gemfile"],
        },
        {
            name: "Composer",
            files: ["composer.json"],
        },
        {
            name: "Pub",
            files: ["pubspec.yaml"],
        },
        {
            name: "Swift Package Manager",
            files: ["Package.swift"],
        },
        {
            name: "Mix",
            files: ["mix.exs"],
        },
    ];

    for (const manager of managerRules) {
        if (
            files.some((file) =>
                manager.files.includes(
                    path.basename(file)
                )
            )
        ) {
            addUnique(managers, manager.name);
        }
    }

    return managers;
}

function detectRuntime(technologies, languages) {
    const runtimes = [];

    if (
        languages.includes("JavaScript") ||
        languages.includes("TypeScript")
    ) {
        addUnique(runtimes, "Node.js");
    }

    if (languages.includes("Python")) {
        addUnique(runtimes, "Python");
    }

    if (
        languages.includes("Java") ||
        languages.includes("Kotlin") ||
        technologies.backend?.includes("Spring")
    ) {
        addUnique(runtimes, "JVM");
    }

    if (languages.includes("CSharp")) {
        addUnique(runtimes, ".NET");
    }

    if (languages.includes("Go")) {
        addUnique(runtimes, "Go");
    }

    if (languages.includes("Rust")) {
        addUnique(runtimes, "Rust");
    }

    if (languages.includes("Ruby")) {
        addUnique(runtimes, "Ruby");
    }

    if (languages.includes("PHP")) {
        addUnique(runtimes, "PHP");
    }

    if (languages.includes("Swift")) {
        addUnique(runtimes, "Swift");
    }

    if (languages.includes("Dart")) {
        addUnique(runtimes, "Dart");
    }

    if (languages.includes("Elixir")) {
        addUnique(runtimes, "BEAM");
    }

    return runtimes;
}

function detectEntryPoints(files) {
    const candidates = [
        "index.js",
        "server.js",
        "app.js",
        "main.js",
        "index.ts",
        "server.ts",
        "app.ts",
        "main.ts",
        "main.py",
        "app.py",
        "manage.py",
        "Main.java",
        "Application.java",
        "Program.cs",
        "main.go",
        "main.rs",
        "main.rb",
        "config.ru",
        "index.php",
        "main.kt",
        "Application.kt",
        "main.swift",
        "main.dart",
        "lib/main.dart",
        "main.ex",
    ];

    return files.filter((file) =>
        candidates.includes(path.basename(file))
    );
}

function inferPackageRole(
    packageFile,
    packageJson,
    detected
) {
    const normalizedPath =
        packageFile.toLowerCase();

    const hasFrontend =
        detected.frontend.length > 0;

    const hasBackend =
        detected.backend.length > 0;

    if (
        normalizedPath.includes("\\client\\") ||
        normalizedPath.includes("/client/")
    ) {
        return "frontend";
    }

    if (
        normalizedPath.includes("\\frontend\\") ||
        normalizedPath.includes("/frontend/")
    ) {
        return "frontend";
    }

    if (
        normalizedPath.includes("\\server\\") ||
        normalizedPath.includes("/server/")
    ) {
        return "backend";
    }

    if (
        normalizedPath.includes("\\backend\\") ||
        normalizedPath.includes("/backend/")
    ) {
        return "backend";
    }

    if (hasFrontend && !hasBackend) {
        return "frontend";
    }

    if (hasBackend && !hasFrontend) {
        return "backend";
    }

    if (
        packageJson.scripts?.start &&
        hasBackend
    ) {
        return "backend";
    }

    return "unknown";
}

async function readPackageJson(file) {
    try {
        const packagePath =
            resolveProjectPath(file);

        const content =
            await fs.readFile(
                packagePath,
                "utf-8"
            );

        return JSON.parse(content);
    } catch {
        return null;
    }
}

function getDependencies(packageJson) {
    return [
        ...Object.keys(
            packageJson.dependencies ?? {}
        ),
        ...Object.keys(
            packageJson.devDependencies ?? {}
        ),
        ...Object.keys(
            packageJson.peerDependencies ?? {}
        ),
    ];
}

function createPackageProfile(
    packageFile,
    packageJson
) {
    const dependencies =
        getDependencies(packageJson);

    const detected =
        detectFromDependencies(
            dependencies
        );

    const role =
        inferPackageRole(
            packageFile,
            packageJson,
            detected
        );

    return {
        path: packageFile,
        name: packageJson.name ?? null,
        role,
        frameworks: [
            ...detected.frontend,
            ...detected.backend,
        ],
        databases: detected.database,
        orms: detected.orm,
        realtime: detected.realtime,
        ai: detected.ai,
        testing: detected.testing,
        dependencies,
    };
}

function collectManifestInfo(files) {
    return files
        .filter((file) =>
            MANIFESTS.includes(
                path.basename(file)
            )
        )
        .map((file) => ({
            file,
            type: path.basename(file),
        }));
}

export function registerDetectProjectTool(server) {
    server.registerTool(
        "detect_project",
        {
            title: "Detect Project",
            description:
                "Detects languages, frameworks, runtimes, databases, package managers, dependencies, and entry points used by the selected project.",
            inputSchema: {},
        },
        async () => {
            try {
                const projectRoot =
                    resolveProjectPath(".");

                const { files } =
                    await scanProjectDirectory(
                        projectRoot,
                        projectRoot
                    );

                const packageFiles =
                    files.filter(
                        (file) =>
                            path.basename(file) ===
                            "package.json"
                    );

                const packageProfiles = [];

                for (const packageFile of packageFiles) {
                    const packageJson =
                        await readPackageJson(
                            packageFile
                        );

                    if (!packageJson) {
                        continue;
                    }

                    packageProfiles.push(
                        createPackageProfile(
                            packageFile,
                            packageJson
                        )
                    );
                }

                const technologies = {
                    frontend: [],
                    backend: [],
                    database: [],
                    orm: [],
                    realtime: [],
                    ai: [],
                    testing: [],
                    language: [],
                };

                for (const profile of packageProfiles) {
                    const profileTechnologies = {
                        frontend: [],
                        backend: [],
                        database:
                            profile.databases,
                        orm: profile.orms,
                        realtime:
                            profile.realtime,
                        ai: profile.ai,
                        testing:
                            profile.testing,
                        language: [],
                    };

                    if (
                        profile.role ===
                        "frontend"
                    ) {
                        profileTechnologies.frontend =
                            profile.frameworks;
                    } else if (
                        profile.role ===
                        "backend"
                    ) {
                        profileTechnologies.backend =
                            profile.frameworks;
                    } else {
                        profileTechnologies.frontend =
                            profile.frameworks.filter(
                                (technology) =>
                                    [
                                        "React",
                                        "Vite",
                                        "NextJS",
                                        "Vue",
                                        "Nuxt",
                                        "Angular",
                                        "Svelte",
                                        "SvelteKit",
                                        "Astro",
                                    ].includes(
                                        technology
                                    )
                            );

                        profileTechnologies.backend =
                            profile.frameworks.filter(
                                (technology) =>
                                    !profileTechnologies
                                        .frontend
                                        .includes(
                                            technology
                                        )
                            );
                    }

                    mergeTechnologies(
                        technologies,
                        profileTechnologies
                    );
                }

                const languages =
                    detectLanguagesFromFiles(
                        files
                    );

                technologies.language =
                    languages;

                const packageManagers =
                    detectPackageManager(
                        files
                    );

                const runtimes =
                    detectRuntime(
                        technologies,
                        languages
                    );

                const entryPoints =
                    detectEntryPoints(files);

                const manifests =
                    collectManifestInfo(files);

                const dependencies = [
                    ...new Set(
                        packageProfiles.flatMap(
                            (profile) =>
                                profile.dependencies
                        )
                    ),
                ];

                const primaryPackage =
                    packageProfiles[0];

                const projectName = path.basename(projectRoot);

                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify(
                                {
                                    project: {
                                        name: projectName,
                                        root: projectRoot,
                                        languages,
                                        frameworks: [
                                            ...technologies.frontend,
                                            ...technologies.backend,
                                        ],
                                        databases:
                                            technologies.database,
                                        orms:
                                            technologies.orm,
                                        realtime:
                                            technologies.realtime,
                                        ai:
                                            technologies.ai,
                                        testing:
                                            technologies.testing,
                                        runtimes,
                                        packageManagers,
                                        dependencies,
                                        entryPoints,
                                        manifests,
                                    },
                                    packages:
                                        packageProfiles,
                                    technologies,
                                },
                                null,
                                2
                            ),
                        },
                    ],
                };
            } catch (error) {
                return {
                    isError: true,
                    content: [
                        {
                            type: "text",
                            text: error.message,
                        },
                    ],
                };
            }
        }
    );
}