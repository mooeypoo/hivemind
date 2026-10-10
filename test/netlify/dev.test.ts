import { EventEmitter } from 'node:events';
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, test, vi, type MockInstance } from 'vitest';
import { isWorkspaceDevProcess, portIsOpen, prepareDev, runDev } from '../../scripts/dev.ts';

vi.mock('node:child_process', () => ({ spawn: vi.fn(), spawnSync: vi.fn() }));

const originalExitCode = process.exitCode;
let child: ChildProcess | undefined;
let kill: MockInstance<typeof process.kill>;

afterEach(() => {
  child?.emit('exit', 0);
  child = undefined;
  process.exitCode = originalExitCode;
  vi.restoreAllMocks();
});

const start = (): ChildProcess => {
  child = Object.assign(new EventEmitter(), { pid: 123456 }) as ChildProcess;
  vi.mocked(spawn).mockReturnValue(child);
  kill = vi.spyOn(process, 'kill').mockReturnValue(true);
  return runDev('node', ['netlify', 'dev']);
};

describe('dev server startup', () => {
  const dependencies = () => ({
    portIsOpen: vi.fn<(port: number) => Promise<boolean>>().mockResolvedValue(false),
    workspaceOwnsPort: vi.fn<(port: number) => Promise<boolean>>().mockResolvedValue(false),
    stopWorkspacePort: vi.fn<(port: number) => Promise<void>>().mockResolvedValue(undefined),
    report: vi.fn(),
  });

  test('starts when both ports are available', async () => {
    const deps = dependencies();
    expect(await prepareDev(deps)).toBe('start');
    expect(deps.stopWorkspacePort).not.toHaveBeenCalled();
  });

  test('reuses an existing workspace server instead of starting a competing one', async () => {
    const deps = dependencies();
    deps.portIsOpen.mockResolvedValue(true);
    deps.workspaceOwnsPort.mockResolvedValue(true);
    expect(await prepareDev(deps)).toBe('reuse');
    expect(deps.report).toHaveBeenCalledWith(
      'This workspace is already running at http://localhost:8888. Reusing the existing dev server.',
    );
    expect(deps.stopWorkspacePort).not.toHaveBeenCalled();
  });

  test('cleans up a workspace Vite server left behind without Netlify', async () => {
    const deps = dependencies();
    deps.portIsOpen.mockImplementation((port) => Promise.resolve(port === 5173));
    deps.workspaceOwnsPort.mockResolvedValue(true);
    expect(await prepareDev(deps)).toBe('start');
    expect(deps.stopWorkspacePort).toHaveBeenCalledWith(5173);
  });

  test('does not kill an unrelated port owner', async () => {
    const deps = dependencies();
    deps.portIsOpen.mockResolvedValue(true);
    expect(await prepareDev(deps)).toBe('blocked');
    expect(deps.stopWorkspacePort).not.toHaveBeenCalled();
    expect(deps.report).toHaveBeenCalledWith(expect.stringContaining('another process'));
  });

  test('does not reuse a mixed pair of workspace and unrelated servers', async () => {
    const deps = dependencies();
    deps.portIsOpen.mockResolvedValue(true);
    deps.workspaceOwnsPort.mockImplementation((port) => Promise.resolve(port === 5173));
    expect(await prepareDev(deps)).toBe('blocked');
    expect(deps.stopWorkspacePort).not.toHaveBeenCalled();
  });

  test('does not launch another Netlify session while an existing one is starting', async () => {
    const deps = dependencies();
    deps.portIsOpen.mockImplementation((port) => Promise.resolve(port === 8888));
    deps.workspaceOwnsPort.mockResolvedValue(true);
    expect(await prepareDev(deps)).toBe('blocked');
    expect(deps.stopWorkspacePort).not.toHaveBeenCalled();
  });

  test('propagates cleanup failure instead of starting on a still-occupied port', async () => {
    const deps = dependencies();
    deps.portIsOpen.mockImplementation((port) => Promise.resolve(port === 5173));
    deps.workspaceOwnsPort.mockResolvedValue(true);
    deps.stopWorkspacePort.mockRejectedValue(new Error('Port still occupied'));
    await expect(prepareDev(deps)).rejects.toThrow('Port still occupied');
  });

  test('checks actual port availability and releases its probe socket', async () => {
    const server = createServer();
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const address = server.address();
    if (address === null || typeof address === 'string') throw new Error('Missing server port');
    try {
      expect(await portIsOpen(address.port)).toBe(true);
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        }),
      );
    }
    expect(await portIsOpen(address.port)).toBe(false);
    expect(await portIsOpen(address.port)).toBe(false);
  });

  test('requires the exact workspace and server command for ownership', () => {
    const workspace = fileURLToPath(new URL('../../', import.meta.url)).replace(/\/$/, '');
    const netlify = ['node', `${workspace}/node_modules/netlify-cli/bin/run.js`, 'dev'];
    const vite = ['node', `${workspace}/node_modules/.bin/vite`, '--port', '5173', '--strictPort'];
    expect(isWorkspaceDevProcess(8888, workspace, netlify)).toBe(true);
    expect(isWorkspaceDevProcess(5173, workspace, vite)).toBe(true);
    expect(isWorkspaceDevProcess(8888, '/another/workspace', netlify)).toBe(false);
    expect(
      isWorkspaceDevProcess(5173, workspace, ['node', '/another/vite', '--port', '5173']),
    ).toBe(false);
    expect(isWorkspaceDevProcess(8888, workspace, ['node', netlify[1] ?? '', 'deploy'])).toBe(
      false,
    );
    expect(isWorkspaceDevProcess(8888, workspace, vite)).toBe(false);
  });
});

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
    child?.emit('exit', 0);
    expect(process.exitCode).toBe(code);
    expect(process.listeners(signal)).toEqual(previous);
  });

  test('does not fail when the process group has already exited', () => {
    start();
    kill.mockImplementation(() => {
      throw Object.assign(new Error('No such process'), { code: 'ESRCH' });
    });
    expect(() => child?.emit('exit', 0)).not.toThrow();
    expect(process.exitCode).toBe(0);
  });
});
