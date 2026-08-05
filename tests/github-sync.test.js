const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { buildCommitMessage, getGitHubRepoConfig, readFileContent } = require('../github-sync');

test('buildCommitMessage includes the action and timestamp', () => {
  const message = buildCommitMessage('save-layout', '2026-08-04T10:00:00.000Z');

  assert.match(message, /save-layout/i);
  assert.match(message, /2026-08-04T10:00:00\.000Z/i);
  assert.match(message, /netlify-admin/i);
});

test('getGitHubRepoConfig parses repo and branch from env', () => {
  process.env.GITHUB_TOKEN = 'abc123';
  process.env.GITHUB_REPOSITORY = 'owner/repo';
  process.env.GITHUB_BRANCH = 'develop';

  const config = getGitHubRepoConfig();

  assert.deepEqual(config, {
    token: 'abc123',
    owner: 'owner',
    repo: 'repo',
    branch: 'develop'
  });
});

test('getGitHubRepoConfig auto-detects from Netlify REPOSITORY_URL env', () => {
  delete process.env.GITHUB_REPOSITORY;
  delete process.env.GH_REPOSITORY;
  delete process.env.GITHUB_BRANCH;
  delete process.env.GH_BRANCH;
  process.env.GITHUB_TOKEN = 'token_test_123';
  process.env.REPOSITORY_URL = 'https://github.com/myorg/my-plot-project.git';
  process.env.BRANCH = 'main';

  const config = getGitHubRepoConfig();

  assert.equal(config.token, 'token_test_123');
  assert.equal(config.owner, 'myorg');
  assert.equal(config.repo, 'my-plot-project');
  assert.equal(config.branch, 'main');
});

test('readFileContent reads updated content from /tmp on serverless', () => {
  const tmpDataDir = path.join('/tmp', 'data');
  fs.mkdirSync(tmpDataDir, { recursive: true });
  const testFile = path.join(tmpDataDir, 'plots.json');
  fs.writeFileSync(testFile, '{"test_key": "updated_value"}', 'utf8');

  const content = readFileContent('data/plots.json');
  assert.match(content, /updated_value/);
});

