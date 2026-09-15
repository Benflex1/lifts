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
const expoArgs = ['start', '--tunnel', ...process.argv.slice(2)];
const child = spawn(
  process.platform === 'win32' ? process.env.ComSpec || 'cmd.exe' : expoCommand,
  process.platform === 'win32' ? ['/d', '/s', '/c', expoCommand, ...expoArgs] : expoArgs,
  {
    cwd: path.resolve(__dirname, '..'),
    env,
    stdio: 'inherit',
  },
);

const signals = process.platform === 'win32'
  ? ['SIGINT', 'SIGTERM']
  : ['SIGINT', 'SIGTERM', 'SIGHUP'];

const forwardSignal = (signal) => child.kill(signal);

for (const signal of signals) {
  process.on(signal, forwardSignal);
}

const removeSignalListeners = () => {
  for (const signal of signals) {
    process.removeListener(signal, forwardSignal);
  }
};

child.on('error', (error) => {
  console.error(error.message);
  process.exit(1);
});

child.on('exit', (code, signal) => {
  if (signal && process.platform !== 'win32') {
    removeSignalListeners();
    process.kill(process.pid, signal);
  } else {
    process.exit(code ?? 1);
  }
});
