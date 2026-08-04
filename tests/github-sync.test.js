const test = require('node:test');
const assert = require('node:assert/strict');

const { buildCommitMessage, getGitHubRepoConfig } = require('../github-sync');

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
