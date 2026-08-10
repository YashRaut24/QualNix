import fs from "node:fs/promises";

const ENDPOINT_PATTERN =
    /\b(?:app|server|router)\.(?:use|post)\s*\(\s*["'`]([^"'`]+)["'`][\s\S]{0,200}?(?:graphqlHTTP|expressGraphQL|ApolloServer|createHandler|createYoga)/gi;

const PATH_OPTION_PATTERN =
    /\b(?:path|endpoint)\s*:\s*["'`]([^"'`]+)["'`]/gi;

export async function detectGraphQlInterfaces(filePath) {
    const content = await fs.readFile(filePath, "utf-8");

    const hasGraphQlEvidence =
        /\b(?:graphqlHTTP|ApolloServer|GraphQLSchema|createYoga)\b/.test(
            content
        ) ||
        /express-graphql/.test(content) ||
        /\btype\s+(?:Query|Mutation)\b/.test(content) ||
        /\bresolvers\s*[:=]\s*\{/.test(content);

    const hasServerEvidence =
        /\b(?:graphqlHTTP|ApolloServer|GraphQLSchema|createYoga)\b/.test(
            content
        ) || /express-graphql/.test(content);

    if (!hasGraphQlEvidence || !hasServerEvidence) {
        return [];
    }

    const paths = new Set();
    let match;

    while ((match = ENDPOINT_PATTERN.exec(content)) !== null) {
        paths.add(match[1]);
    }

    while ((match = PATH_OPTION_PATTERN.exec(content)) !== null) {
        paths.add(match[1]);
    }

    if (paths.size === 0) {
        paths.add("/graphql");
    }

    const framework = /\bApolloServer\b/.test(content)
        ? "Apollo Server"
        : "GraphQL";

    return [...paths].map((routePath) => ({
        type: "http",
        protocol: "graphql",
        framework,
        role: "server",
        method: "POST",
        path: routePath,
    }));
}
