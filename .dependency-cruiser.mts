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
      name: 'context-root-own-only',
      comment:
        "A context's root files (index.ts, module.ts) import only their own context. Knowledge of other contexts lives in infrastructure.",
      severity: 'error',
      from: { path: '^src/contexts/([^/]+)/[^/]+\\.ts$' },
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
      to: { path: '^src/contexts/', pathNot: '^src/contexts/[^/]+/index\\.ts$' },
    },
    {
      name: 'shared-infrastructure-for-adapters',
      comment:
        'shared/infrastructure holds technical helpers for adapters; only infrastructure and server use it.',
      severity: 'error',
      from: {
        pathNot: [
          '^src/contexts/[^/]+/infrastructure/',
          '^src/server/',
          '^src/shared/infrastructure/',
        ],
      },
      to: { path: '^src/shared/infrastructure/' },
    },
    {
      name: 'shared-infrastructure-no-contexts',
      comment: 'shared/infrastructure knows nothing about contexts, the server or the web app.',
      severity: 'error',
      from: { path: '^src/shared/infrastructure/' },
      to: { path: '^src/(contexts|server|web)/' },
    },
    {
      name: 'testing-only-from-tests',
      comment: 'Test doubles under testing/ are never wired into production code.',
      severity: 'error',
      from: { pathNot: ['\\.test\\.ts$', '/testing/'] },
      to: { path: '/testing/' },
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
      name: 'web-ui-primitives-dumb',
      comment:
        'UI primitives (web/components/ui) take props and emit events; they never reach the API, app state or composables.',
      severity: 'error',
      from: { path: '^src/web/components/ui/', pathNot: TEST_FILE },
      to: { path: '^src/web/(services|state|composables|pages)/' },
    },
    {
      name: 'web-composables-headless',
      comment:
        'Composables hold behaviour without markup, so a fork can reuse them under its own UI.',
      severity: 'error',
      from: { path: '^src/web/composables/', pathNot: TEST_FILE },
      to: { path: '^src/web/(components|pages)/' },
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
      exportsFields: ['exports'],
      conditionNames: ['import', 'types', 'node', 'default'],
    },
  },
};

export default config;
