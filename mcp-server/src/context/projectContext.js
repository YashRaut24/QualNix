import fs from "node:fs";
import path from "node:path";

let projectRoot = null;

export function setProjectRoot(root) {
    const resolvedPath = path.resolve(root);

    if (!fs.existsSync(resolvedPath)) {
        throw new Error("The specified path does not exist.");
    }

    const stats = fs.statSync(resolvedPath);

    if (!stats.isDirectory()) {
        throw new Error("The specified path is not a directory.");
    }

    projectRoot = resolvedPath;

    return resolvedPath;
}

export function getProjectRoot() {
    return projectRoot;
}

export function clearProjectRoot() {
    projectRoot = null;
}

export function hasProjectRoot() {
    return projectRoot !== null;
}