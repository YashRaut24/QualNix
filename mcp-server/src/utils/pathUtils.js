import path from "node:path";
import { getProjectRoot, hasProjectRoot } from "../context/projectContext.js";

export function resolveProjectPath(relativePath) {
    if (!hasProjectRoot()) {
        throw new Error("Project root has not been set.");
    }

    const projectRoot = getProjectRoot();

    const absolutePath = path.resolve(projectRoot, relativePath);

    const relative = path.relative(projectRoot, absolutePath);

    if (relative.startsWith("..") || path.isAbsolute(relative)) {
        throw new Error("Access outside the project directory is not allowed.");
    }

    return absolutePath;
}