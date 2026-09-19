const path = require('node:path');
const { spawn } = require('node:child_process');

const env = { ...process.env };

if (env.EXPO_FORCE_WEBCONTAINER_ENV === undefined) {
  env.EXPO_FORCE_WEBCONTAINER_ENV = '1';
}

if (env.EXPO_UNSTABLE_HEADLESS === undefined) {
  if (process.stdin.isTTY && process.stdout.isTTY) {
    env.EXPO_UNSTABLE_HEADLESS = '0';
  } else if (
    process.platform === 'linux' &&
    !env.DISPLAY &&
    !env.WAYLAND_DISPLAY
  ) {
    env.EXPO_UNSTABLE_HEADLESS = '1';
  }
}

const expoCli = path.resolve(
  __dirname,
  '..',
  'node_modules/expo/bin/cli',
);
const expoArgs = ['start', '--tunnel', ...process.argv.slice(2)];
const child = spawn(process.execPath, [expoCli, ...expoArgs], {
  cwd: path.resolve(__dirname, '..'),
  env,
  stdio: 'inherit',
});

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
