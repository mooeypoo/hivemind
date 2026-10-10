import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';

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
  runDev(process.execPath, [
    fileURLToPath(new URL('../node_modules/netlify-cli/bin/run.js', import.meta.url)),
    'dev',
    ...process.argv.slice(2),
  ]);
}
