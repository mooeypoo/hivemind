import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, test } from 'vitest';

/**
 * The pre-paint theme script (src/web/public/theme-init.js) must agree with the Appearance
 * switch (src/web/composables/theme.ts) and run before the stylesheet paints.
 */
const read = (path: string) =>
  readFileSync(new URL(`../../src/web/${path}`, import.meta.url), 'utf8');
const script = read('public/theme-init.js');

const run = (stored: string | null, blocked = false) => {
  const root = { dataset: {} as Record<string, string> };
  const storage = {
    getItem: (key: string) => {
      if (blocked) throw new Error('blocked');
      return key === 'hivemind:theme' ? stored : null;
    },
  };
  runInNewContext(script, { localStorage: storage, document: { documentElement: root } });
  return root.dataset.theme;
};

describe('theme-init.js', () => {
  test('uses the same storage key as the Appearance switch', () => {
    expect(read('composables/theme.ts')).toContain("STORAGE_KEY = 'hivemind:theme'");
  });

  test('pins a saved Light or Dark choice, and otherwise follows the system', () => {
    expect(run('dark')).toBe('dark');
    expect(run('light')).toBe('light');
    expect(run(null)).toBeUndefined();
    expect(run('purple')).toBeUndefined();
    expect(run('dark', true)).toBeUndefined();
  });

  test('greets people who open the console', () => {
    const messages: string[] = [];
    runInNewContext(script, {
      localStorage: { getItem: () => null },
      document: { documentElement: { dataset: {} } },
      console: { info: (message: string) => messages.push(message) },
    });
    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain("/ _` |");
    expect(messages[0]).toContain('I see you. You found the console. Now go make a list.');
    expect(messages[0]).toContain(
      'If you like tinkering with code, feel free to contribute!\nSee github repo @ https://github.com/mooeypoo/hivemind',
    );
  });

  test('loads render-blocking in <head>, before the stylesheet', () => {
    const html = read('index.html');
    const tag = /<script src="\/theme-init\.js"><\/script>/.exec(html);
    expect(tag).not.toBeNull();
    expect(html.indexOf('/theme-init.js')).toBeLessThan(html.indexOf('/styles.css'));
    expect(html.indexOf('/theme-init.js')).toBeLessThan(html.indexOf('</head>'));
  });
});
