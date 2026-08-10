const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { buildCommitMessage, getGitHubRepoConfig, readFileContent } = require('../github-sync');

test('GitHub Repo Config detects token and branch correctly', () => {
  process.env.GITHUB_TOKEN = 'ghp_test123456789';
  process.env.REPOSITORY_URL = 'https://github.com/myaccount/maudai-plots-repo.git';
  process.env.BRANCH = 'main';

  const config = getGitHubRepoConfig();
  assert.equal(config.token, 'ghp_test123456789');
  assert.equal(config.owner, 'myaccount');
  assert.equal(config.repo, 'maudai-plots-repo');
  assert.equal(config.branch, 'main');
});

test('readFileContent reads updated data files from /tmp/data for serverless sync', () => {
  const tmpDataDir = path.join('/tmp', 'data');
  fs.mkdirSync(tmpDataDir, { recursive: true });
  const plotsFile = path.join(tmpDataDir, 'plots.json');
  fs.writeFileSync(plotsFile, JSON.stringify({ "1": { status: "sold", price: 500000 } }), 'utf8');

  const content = readFileContent('data/plots.json');
  assert.match(content, /sold/);
  assert.match(content, /500000/);
});

test('readFileContent reads updated plotData.js from /tmp/public/js', () => {
  const tmpJsDir = path.join('/tmp', 'public', 'js');
  fs.mkdirSync(tmpJsDir, { recursive: true });
  const plotDataFile = path.join(tmpJsDir, 'plotData.js');
  fs.writeFileSync(plotDataFile, 'const PLOT_POSITIONS = { "1": { x: 10, z: 20 } };', 'utf8');

  const content = readFileContent('public/js/plotData.js');
  assert.match(content, /PLOT_POSITIONS/);
});

test('buildCommitMessage outputs clean, standardized git messages', () => {
  const timestamp = '2026-08-10T18:30:00.000Z';
  const msg = buildCommitMessage('save-layout', timestamp);
  assert.equal(msg, 'netlify-admin save-layout 2026-08-10T18:30:00.000Z');
});
