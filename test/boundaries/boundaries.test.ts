import { fileURLToPath } from 'node:url';
import { cruise } from 'dependency-cruiser';
import { beforeAll, describe, expect, test } from 'vitest';
import config from '../../.dependency-cruiser.mts';

/**
 * Proves each AGENTS.md dependency rule against a fixture tree that mirrors the real layout.
 * Legal files must produce no violations; each `bad-*` file must trip exactly the listed rules.
 */
const fixtureDir = fileURLToPath(new URL('./fixture', import.meta.url));

const expected: Record<string, string[]> = {
  'src/shared/kernel/bad-node.ts': ['kernel-is-pure'],
  'src/contexts/voting/domain/bad-node.ts': ['domain-is-pure'],
  'src/contexts/voting/domain/bad-package.ts': ['domain-is-pure'],
  'src/contexts/voting/domain/bad-own-application.ts': ['domain-is-pure'],
  'src/contexts/voting/domain/bad-other-index.ts': ['domain-is-pure'],
  'src/contexts/voting/domain/bad-other-domain.ts': [
    'domain-is-pure',
    'no-cross-context-internals',
  ],
  'src/contexts/voting/application/bad-infrastructure.ts': ['application-own-domain-only'],
  'src/contexts/voting/application/bad-other-index.ts': ['application-own-domain-only'],
  'src/contexts/voting/infrastructure/bad-other-application.ts': ['no-cross-context-internals'],
  'src/contexts/voting/infrastructure/testing/bad.test.ts': ['no-cross-context-internals'],
  'src/contexts/ranking/index.ts': ['context-root-own-only'],
  'src/contexts/ranking/module.ts': ['context-root-own-only'],
  'src/contexts/lists/domain/cycle-a.ts': ['no-circular'],
  'src/contexts/voting/application/bad-shared-infrastructure.ts': [
    'application-own-domain-only',
    'shared-infrastructure-for-adapters',
  ],
  'src/shared/infrastructure/bad-context.ts': ['shared-infrastructure-no-contexts'],
  'src/contexts/voting/bad-testing-module.ts': ['testing-only-from-tests'],
  'src/server/bad-internals.ts': ['outsiders-use-public-api'],
  'src/server/bad-module.ts': ['outsiders-use-public-api'],
  'src/server/bad-zod.ts': ['zod-at-boundary'],
  'src/server/bad-missing.ts': ['not-to-unresolvable'],
  'netlify/functions/bad-context.mts': ['functions-only-server'],
  'netlify/functions/bad-package.mts': ['functions-only-server'],
  'src/web/bad-value-import.ts': ['web-contracts-type-only'],
  'src/web/bad-server.ts': ['web-only-contracts'],
  'src/web/bad-node.ts': ['web-no-node'],
};

let actual: Record<string, string[]>;

beforeAll(async () => {
  const result = await cruise(['src', 'netlify'], {
    ...config.options,
    baseDir: fixtureDir,
    validate: true,
    ruleSet: { forbidden: config.forbidden ?? [] },
  });
  if (typeof result.output === 'string') throw new Error('Expected a cruise result object');

  const byFile: Record<string, Set<string>> = {};
  for (const violation of result.output.summary.violations) {
    (byFile[violation.from] ??= new Set()).add(violation.rule.name);
  }
  actual = Object.fromEntries(
    Object.entries(byFile).map(([file, rules]) => [file, [...rules].sort()]),
  );
});

describe('dependency-cruiser boundary rules', () => {
  test.each(Object.entries(expected))('%s violates %j', (file, rules) => {
    expect(actual[file]).toEqual([...rules].sort());
  });

  test('legal files produce no violations', () => {
    const unexpected = Object.keys(actual).filter((file) => !(file in expected));
    expect(unexpected).toEqual([]);
  });

  test('every rule in the config is exercised by the fixture', () => {
    const exercised = new Set(Object.values(expected).flat());
    const declared = (config.forbidden ?? []).map((rule) => rule.name);
    expect(declared.filter((name) => name !== undefined && !exercised.has(name))).toEqual([]);
  });
});
