const path = require('node:path');
const { spawn } = require('node:child_process');

const env = { ...process.env };

if (env.EXPO_FORCE_WEBCONTAINER_ENV === undefined) {
  env.EXPO_FORCE_WEBCONTAINER_ENV = '1';
}

if (
  process.platform === 'linux' &&
  !env.DISPLAY &&
  !env.WAYLAND_DISPLAY &&
  env.EXPO_UNSTABLE_HEADLESS === undefined
) {
  env.EXPO_UNSTABLE_HEADLESS = '1';
}

const expoCommand = path.resolve(
  __dirname,
  '..',
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'expo.cmd' : 'expo',
);
const child = spawn(expoCommand, ['start', '--tunnel', ...process.argv.slice(2)], {
  cwd: path.resolve(__dirname, '..'),
  env,
  stdio: 'inherit',
  windowsVerbatimArguments: process.platform === 'win32',
});

const signals = process.platform === 'win32'
  ? ['SIGINT', 'SIGTERM']
  : ['SIGINT', 'SIGTERM', 'SIGHUP'];

for (const signal of signals) {
  process.on(signal, () => child.kill(signal));
}

child.on('error', (error) => {
  console.error(error.message);
  process.exit(1);
});

child.on('exit', (code, signal) => {
  if (signal && process.platform !== 'win32') {
    process.kill(process.pid, signal);
  } else {
    process.exit(code ?? 1);
  }
});
