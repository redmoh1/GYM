const { spawn } = require('node:child_process');

const electronPath = require('electron');
const mainFile = 'dist/main/src/main.js';

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
env.NODE_ENV = 'development';

const child = spawn(electronPath, [mainFile], {
  stdio: 'inherit',
  env,
  shell: false,
});

child.on('exit', (code) => {
  process.exit(code ?? 0);
});
