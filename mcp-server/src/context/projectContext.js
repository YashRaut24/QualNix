let projectRoot = null;

export function setProjectRoot(root) {
    projectRoot = root;
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