import { spawnSync } from 'child_process';

const isDeploymentEnv =
  process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true';

if (isDeploymentEnv) {
  console.log('Skipping Jest during deployment environment.');
  process.exit(0);
}

const result = spawnSync(
  process.execPath,
  ['--experimental-vm-modules', './node_modules/jest/bin/jest.js', '--runInBand'],
  {
    stdio: 'inherit',
    shell: false,
  }
);

process.exit(result.status ?? 1);