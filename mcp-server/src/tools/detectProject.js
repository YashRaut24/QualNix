import fs from "node:fs/promises";
import path from "node:path";
import { resolveProjectPath } from "../utils/pathUtils.js";
import { scanProjectDirectory } from "../utils/projectScanner.js";

const TECHNOLOGY_RULES = {
    frontend: {
        react: ["react", "react-dom"],
        vite: ["vite"],
    },

    backend: {
        express: ["express"],
    },

    database: {
        mongodb: ["mongodb"],
        mongoose: ["mongoose"],
    },

    language: {
        typescript: ["typescript"],
    },
};

function detectFromDependencies(dependencies) {
    const detected = {
        frontend: [],
        backend: [],
        database: [],
        language: [],
    };

    for (const [category, technologies] of Object.entries(
        TECHNOLOGY_RULES
    )) {
        for (const [technology, packages] of Object.entries(
            technologies
        )) {
            if (
                packages.some((packageName) =>
                    dependencies.has(packageName)
                )
            ) {
                detected[category].push(
                    technology.charAt(0).toUpperCase() +
                        technology.slice(1)
                );
            }
        }
    }

    return detected;
}

function mergeTechnologies(target, source) {
    for (const category of Object.keys(target)) {
        for (const technology of source[category]) {
            if (!target[category].includes(technology)) {
                target[category].push(technology);
            }
        }
    }
}

export function registerDetectProjectTool(server) {
    server.registerTool(
        "detect_project",
        {
            title: "Detect Project",
            description: "Detects technologies used by the selected project.",
            inputSchema: {},
        },
        async () => {
            try {
                const projectRoot = resolveProjectPath(".");

                const { files } = await scanProjectDirectory(
                    projectRoot,
                    projectRoot
                );

                const packageFiles = files.filter(
                    (file) =>
                        path.basename(file) === "package.json"
                );

                const technologies = {
                    frontend: [],
                    backend: [],
                    database: [],
                    language: [],
                };

                const packages = [];

                for (const packageFile of packageFiles) {
                    const packagePath = resolveProjectPath(packageFile);

                    const packageContent = await fs.readFile(
                        packagePath,
                        "utf-8"
                    );

                    const packageJson =
                        JSON.parse(packageContent);

                    const dependencies = new Set([
                        ...Object.keys(
                            packageJson.dependencies ?? {}
                        ),
                        ...Object.keys(
                            packageJson.devDependencies ?? {}
                        ),
                    ]);

                    const detected =
                        detectFromDependencies(dependencies);

                    if (
                        dependencies.has("express") ||
                        dependencies.has("@types/node") ||
                        packageJson.type === "module"
                    ) {
                        detected.backend.push("Node.js");
                    }

                    if (
                        dependencies.has("typescript")
                    ) {
                        detected.language.push("TypeScript");
                    } else {
                        detected.language.push("JavaScript");
                    }

                    mergeTechnologies(
                        technologies,
                        detected
                    );

                    packages.push({
                        path: packageFile,
                        name: packageJson.name ?? null,
                    });
                }

                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify(
                                {
                                    projectRoot,
                                    packages,
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