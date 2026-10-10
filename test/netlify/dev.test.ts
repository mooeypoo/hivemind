import { EventEmitter } from 'node:events';
import { spawn, type ChildProcess } from 'node:child_process';
import { afterEach, describe, expect, test, vi, type MockInstance } from 'vitest';
import { runDev } from '../../scripts/dev.ts';

vi.mock('node:child_process', () => ({ spawn: vi.fn(), spawnSync: vi.fn() }));

const originalExitCode = process.exitCode;
let child: ChildProcess;
let kill: MockInstance<typeof process.kill>;

afterEach(() => {
  child.emit('exit', 0);
  process.exitCode = originalExitCode;
  vi.restoreAllMocks();
});

const start = (): ChildProcess => {
  child = Object.assign(new EventEmitter(), { pid: 123456 }) as ChildProcess;
  vi.mocked(spawn).mockReturnValue(child);
  kill = vi.spyOn(process, 'kill').mockReturnValue(true);
  return runDev('node', ['netlify', 'dev']);
};

describe.skipIf(process.platform === 'win32')('dev server process cleanup', () => {
  test('starts Netlify in its own process group', () => {
    start();
    expect(spawn).toHaveBeenCalledWith('node', ['netlify', 'dev'], {
      stdio: 'inherit',
      detached: true,
    });
  });

  test('stops the whole process group when Netlify crashes and preserves its exit code', () => {
    start().emit('exit', 1);
    expect(kill).toHaveBeenCalledWith(-123456, 'SIGTERM');
    expect(process.exitCode).toBe(1);
  });

  test.each([
    ['SIGINT', 130],
    ['SIGTERM', 143],
  ] as const)('forwards %s and removes its listeners on shutdown', (signal, code) => {
    const previous = process.listeners(signal);
    start();
    const handler = process.listeners(signal).find((listener) => !previous.includes(listener));
    expect(handler).toBeDefined();
    handler?.(signal);
    expect(kill).toHaveBeenCalledWith(-123456, signal);
    child.emit('exit', 0);
    expect(process.exitCode).toBe(code);
    expect(process.listeners(signal)).toEqual(previous);
  });

  test('does not fail when the process group has already exited', () => {
    start();
    kill.mockImplementation(() => {
      throw Object.assign(new Error('No such process'), { code: 'ESRCH' });
    });
    expect(() => child.emit('exit', 0)).not.toThrow();
    expect(process.exitCode).toBe(0);
  });
});
