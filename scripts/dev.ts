import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { readFile, realpath } from 'node:fs/promises';
import { createServer } from 'node:net';
import { setTimeout } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

interface StartupDependencies {
  portIsOpen(port: number): Promise<boolean>;
  workspaceOwnsPort(port: number): Promise<boolean>;
  stopWorkspacePort(port: number): Promise<void>;
  report(message: string): void;
}

export const prepareDev = async (
  deps: StartupDependencies,
): Promise<'start' | 'reuse' | 'blocked'> => {
  const occupied = [];
  for (const port of [8888, 5173]) {
    if (await deps.portIsOpen(port)) occupied.push(port);
  }
  for (const port of occupied) {
    if (!(await deps.workspaceOwnsPort(port))) {
      deps.report(
        `Port ${String(port)} is in use by another process (or ownership could not be verified). Stop it before running npm run dev; it has not been killed.`,
      );
      return 'blocked';
    }
  }
  if (occupied.includes(8888) && occupied.includes(5173)) {
    deps.report(
      'This workspace is already running at http://localhost:8888. Reusing the existing dev server.',
    );
    return 'reuse';
  }
  if (occupied.includes(8888)) {
    deps.report(
      'This workspace already has Netlify running on port 8888, but Vite is not ready. Check the existing dev terminal or stop it with Ctrl+C before retrying.',
    );
    return 'blocked';
  }
  if (occupied.includes(5173)) {
    deps.report('Stopping a leftover Vite server from this workspace on port 5173.');
    await deps.stopWorkspacePort(5173);
  }
  return 'start';
};

export const portIsOpen = (port: number): Promise<boolean> =>
  new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'EADDRINUSE') resolve(true);
      else reject(error);
    });
    server.listen(port, () => {
      server.close((error) => {
        if (error) reject(error);
        else resolve(false);
      });
    });
  });

const workspace = fileURLToPath(new URL('../', import.meta.url)).replace(/\/$/, '');
const netlifyScript = `${workspace}/node_modules/netlify-cli/bin/run.js`;

export const isWorkspaceDevProcess = (
  port: number,
  cwd: string,
  args: readonly string[],
): boolean => {
  if (cwd !== workspace) return false;
  if (port === 8888) return args[1] === netlifyScript && args[2] === 'dev';
  return (
    port === 5173 &&
    (args[1] === `${workspace}/node_modules/.bin/vite` ||
      args[1] === `${workspace}/node_modules/vite/bin/vite.js`) &&
    args.includes('--port') &&
    args[args.indexOf('--port') + 1] === '5173'
  );
};

const workspaceProcess = async (port: number, pid: number): Promise<boolean> => {
  try {
    const [cwd, command] = await Promise.all([
      realpath(`/proc/${String(pid)}/cwd`),
      readFile(`/proc/${String(pid)}/cmdline`, 'utf8'),
    ]);
    return isWorkspaceDevProcess(port, cwd, command.split('\0'));
  } catch {
    return false;
  }
};

const portOwners = (port: number): number[] => {
  if (process.platform !== 'linux') return [];
  const result = spawnSync('ss', ['-ltnpH', `sport = :${String(port)}`], { encoding: 'utf8' });
  if (result.status !== 0) return [];
  return [...new Set([...result.stdout.matchAll(/pid=(\d+)/g)].map((match) => Number(match[1])))];
};

const workspaceOwnsPort = async (port: number): Promise<boolean> => {
  const owners = portOwners(port);
  return (
    owners.length > 0 &&
    (await Promise.all(owners.map((pid) => workspaceProcess(port, pid)))).every(Boolean)
  );
};

const hasNetlifyParent = async (pid: number): Promise<boolean> => {
  let ancestor = pid;
  for (let depth = 0; depth < 20 && ancestor > 1; depth += 1) {
    try {
      const status = await readFile(`/proc/${String(ancestor)}/status`, 'utf8');
      const parent = /^PPid:\s+(\d+)$/m.exec(status)?.[1];
      if (parent === undefined) return true;
      ancestor = Number(parent);
      if (await workspaceProcess(8888, ancestor)) return true;
    } catch {
      return true;
    }
  }
  return ancestor > 1;
};

const stopWorkspacePort = async (port: number): Promise<void> => {
  const owners = portOwners(port);
  if (owners.length === 0) throw new Error(`Could not verify the owner of port ${String(port)}.`);
  for (const pid of owners) {
    if (!(await workspaceProcess(port, pid)))
      throw new Error(`Port ${String(port)} changed owners; retry.`);
    if (await hasNetlifyParent(pid)) {
      throw new Error(
        'An existing Netlify session is still starting. Check its terminal and retry.',
      );
    }
  }
  for (const pid of owners) {
    if (!(await workspaceProcess(port, pid)))
      throw new Error(`Port ${String(port)} changed owners; retry.`);
    try {
      process.kill(pid, 'SIGTERM');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error;
    }
  }
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (!(await portIsOpen(port))) return;
    await setTimeout(50);
  }
  throw new Error(
    `Vite did not release port ${String(port)}. Stop the existing dev terminal and retry.`,
  );
};

export const runDev = (command: string, args: readonly string[]): ChildProcess => {
  const child = spawn(command, args, {
    stdio: 'inherit',
    detached: process.platform !== 'win32',
  });
  let requestedExitCode: number | undefined;

  const stop = (signal: NodeJS.Signals = 'SIGTERM'): void => {
    if (child.pid === undefined) return;
    if (process.platform === 'win32') {
      spawnSync('taskkill', ['/pid', String(child.pid), '/t', '/f'], { stdio: 'ignore' });
      return;
    }
    try {
      process.kill(-child.pid, signal);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error;
    }
  };

  const interrupt = (): void => {
    requestedExitCode = 130;
    stop('SIGINT');
  };
  const terminate = (): void => {
    requestedExitCode = 143;
    stop();
  };
  const onExit = (): void => {
    stop();
  };
  const finish = (code: number): void => {
    stop();
    process.removeListener('SIGINT', interrupt);
    process.removeListener('SIGTERM', terminate);
    process.removeListener('exit', onExit);
    process.exitCode = requestedExitCode ?? code;
  };

  process.once('SIGINT', interrupt);
  process.once('SIGTERM', terminate);
  process.once('exit', onExit);
  child.once('exit', (code) => {
    finish(code ?? 1);
  });
  child.once('error', (error) => {
    console.error(`Unable to start the dev server: ${error.message}`);
    finish(1);
  });
  return child;
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const startup =
      process.argv.length > 2
        ? 'start'
        : await prepareDev({
            portIsOpen,
            workspaceOwnsPort,
            stopWorkspacePort,
            report: console.log,
          });
    if (startup === 'start') {
      runDev(process.execPath, [netlifyScript, 'dev', ...process.argv.slice(2)]);
    } else if (startup === 'blocked') {
      process.exitCode = 1;
    }
  } catch (error) {
    console.error(`Unable to start the dev server: ${(error as Error).message}`);
    process.exitCode = 1;
  }
}
