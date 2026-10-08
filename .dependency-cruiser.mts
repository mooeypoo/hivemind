import type { IConfiguration } from 'dependency-cruiser';

/**
 * Boundary rules from AGENTS.md ("Dependency rules"). Every rule is an error.
 * `$1` in a `to` pattern refers to the context captured by the `from` pattern.
 */
const TEST_FILE = '\\.test\\.ts$';

const config: IConfiguration = {
  forbidden: [
    {
      name: 'kernel-is-pure',
      comment: 'shared/kernel has no context knowledge and no external dependencies.',
      severity: 'error',
      from: { path: '^src/shared/kernel/', pathNot: TEST_FILE },
      to: { pathNot: '^src/shared/kernel/' },
    },
    {
      name: 'domain-is-pure',
      comment: 'domain may import only its own domain and shared/kernel: no node:*, no packages.',
      severity: 'error',
      from: { path: '^src/contexts/([^/]+)/domain/', pathNot: TEST_FILE },
      to: { pathNot: ['^src/contexts/$1/domain/', '^src/shared/kernel/'] },
    },
    {
      name: 'application-own-domain-only',
      comment:
        'application may import its own domain and shared/kernel. Anything else goes behind a port.',
      severity: 'error',
      from: { path: '^src/contexts/([^/]+)/application/', pathNot: TEST_FILE },
      to: {
        pathNot: ['^src/contexts/$1/(domain|application)/', '^src/shared/kernel/'],
      },
    },
    {
      name: 'context-index-own-only',
      comment: "A context's public API re-exports its own context only.",
      severity: 'error',
      from: { path: '^src/contexts/([^/]+)/index\\.ts$' },
      to: { path: '^src/contexts/', pathNot: '^src/contexts/$1/' },
    },
    {
      name: 'no-cross-context-internals',
      comment:
        'Another context is reachable only through its index.ts (and only from infrastructure).',
      severity: 'error',
      from: { path: '^src/contexts/([^/]+)/' },
      to: {
        path: '^src/contexts/[^/]+/',
        pathNot: ['^src/contexts/$1/', '^src/contexts/[^/]+/index\\.ts$'],
      },
    },
    {
      name: 'outsiders-use-public-api',
      comment: 'Outside src/contexts, a context is importable only through its index.ts.',
      severity: 'error',
      from: { pathNot: '^src/contexts/' },
      to: { path: '^src/contexts/[^/]+/(domain|application|infrastructure)/' },
    },
    {
      name: 'functions-only-server',
      comment: 'netlify/functions are thin handlers and import only src/server.',
      severity: 'error',
      from: { path: '^netlify/functions/' },
      to: { pathNot: ['^src/server/', '^netlify/functions/'] },
    },
    {
      name: 'web-only-contracts',
      comment: 'The web app imports nothing from src/ but itself and server/http/contracts.ts.',
      severity: 'error',
      from: { path: '^src/web/' },
      to: { path: '^src/', pathNot: ['^src/web/', '^src/server/http/contracts\\.ts$'] },
    },
    {
      name: 'web-contracts-type-only',
      comment: 'The web app may import only types from contracts.ts.',
      severity: 'error',
      from: { path: '^src/web/' },
      to: { path: '^src/server/http/contracts\\.ts$', dependencyTypesNot: ['type-only'] },
    },
    {
      name: 'web-no-node',
      comment: 'The web app runs in the browser.',
      severity: 'error',
      from: { path: '^src/web/' },
      to: { dependencyTypes: ['core'] },
    },
    {
      name: 'zod-at-boundary',
      comment: 'zod validates input at the HTTP boundary only.',
      severity: 'error',
      from: { pathNot: '^src/server/http/' },
      to: { path: '^(node_modules/)?zod(/|$)' },
    },
    {
      name: 'no-circular',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
    {
      name: 'not-to-unresolvable',
      severity: 'error',
      from: {},
      to: { couldNotResolve: true },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: { path: '^test/boundaries/fixture/' },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: {
      extensions: ['.ts', '.mts', '.vue', '.js', '.mjs', '.json'],
    },
  },
};

export default config;
