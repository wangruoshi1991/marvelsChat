const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

describe('Android API origin configuration', () => {
  test('does not provide the production IP when MIAOXUN_API_BASE_URL is missing', () => {
    const gradlePath = path.resolve(__dirname, '../android/app/build.gradle');
    const gradle = fs.readFileSync(gradlePath, 'utf8');
    expect(gradle).not.toContain('https://8.153.167.11');
    expect(gradle).toContain(
      'MIAOXUN_API_BASE_URL must be provided for Android builds.',
    );
  });

  test.each([
    undefined,
    'https://api.marvelschat.com/path',
    'http://api.marvelschat.com',
  ])('release origin validator rejects missing or illegal origin %p', value => {
    const script = path.resolve(
      __dirname,
      '../../scripts/validate-release-api-origin.mjs',
    );
    const environment = { ...process.env };
    if (value === undefined) delete environment.MIAOXUN_API_BASE_URL;
    else environment.MIAOXUN_API_BASE_URL = value;
    const result = spawnSync(
      process.execPath,
      [script, '--env', 'MIAOXUN_API_BASE_URL'],
      { env: environment, encoding: 'utf8' },
    );
    expect(result.status).not.toBe(0);
  });

  test('release origin validator accepts an explicit HTTPS origin', () => {
    const script = path.resolve(
      __dirname,
      '../../scripts/validate-release-api-origin.mjs',
    );
    const result = spawnSync(
      process.execPath,
      [script, '--env', 'MIAOXUN_API_BASE_URL'],
      {
        env: {
          ...process.env,
          MIAOXUN_API_BASE_URL: 'https://api.marvelschat.com',
        },
        encoding: 'utf8',
      },
    );
    expect(result.status).toBe(0);
  });
});
