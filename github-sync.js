const https = require('https');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

function getGitHubRepoConfig() {
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '';
  const repo = process.env.GITHUB_REPOSITORY || process.env.GH_REPOSITORY || '';
  const branch = process.env.GITHUB_BRANCH || process.env.GH_BRANCH || 'main';

  if (!token || !repo) {
    return null;
  }

  const [owner, name] = repo.split('/');
  if (!owner || !name) {
    return null;
  }

  return { token, owner, repo: name, branch };
}

function buildCommitMessage(action, timestamp) {
  return `netlify-admin ${action} ${timestamp}`;
}

function readFileContent(relativePath) {
  const fullPath = path.resolve(process.cwd(), relativePath);
  if (!fs.existsSync(fullPath)) {
    return null;
  }
  return fs.readFileSync(fullPath, 'utf8');
}

function writeFileContent(relativePath, content) {
  const fullPath = path.resolve(process.cwd(), relativePath);
  const dir = path.dirname(fullPath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(fullPath, content, 'utf8');
  return fullPath;
}

function requestGitHub({ method, pathName, body, token }) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.github.com',
      port: 443,
      path: pathName,
      method,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github+json',
        'User-Agent': 'netlify-admin-sync',
        'X-GitHub-Api-Version': '2022-11-28'
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = data ? JSON.parse(data) : {};
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(parsed);
          } else {
            reject(new Error(`GitHub API error ${res.statusCode}: ${data}`));
          }
        } catch (err) {
          reject(err);
        }
      });
    });

    req.on('error', reject);
    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

async function syncToGitHub(relativePaths, action, metadata = {}) {
  const config = getGitHubRepoConfig();
  if (!config) {
    return { success: false, reason: 'missing-github-config' };
  }

  const timestamp = metadata.timestamp || new Date().toISOString();
  const message = buildCommitMessage(action, timestamp);

  const files = [];
  for (const relativePath of relativePaths) {
    const content = readFileContent(relativePath);
    if (content === null) {
      continue;
    }
    files.push({ path: relativePath.replace(/\\/g, '/'), content });
  }

  if (!files.length) {
    return { success: false, reason: 'no-files' };
  }

  try {
    const refData = await requestGitHub({
      method: 'GET',
      pathName: `/repos/${config.owner}/${config.repo}/git/ref/heads/${config.branch}`,
      token: config.token
    });

    const commitSha = refData.object?.sha;
    if (!commitSha) {
      throw new Error('Could not resolve branch commit SHA');
    }

    // Fetch the commit to obtain its tree SHA
    const commitObj = await requestGitHub({
      method: 'GET',
      pathName: `/repos/${config.owner}/${config.repo}/git/commits/${commitSha}`,
      token: config.token
    });

    const baseTreeSha = commitObj.tree?.sha;
    if (!baseTreeSha) {
      throw new Error('Could not resolve base tree SHA');
    }

    const treeEntries = files.map(file => ({
      path: file.path,
      mode: '100644',
      type: 'blob',
      content: file.content
    }));

    const treeResponse = await requestGitHub({
      method: 'POST',
      pathName: `/repos/${config.owner}/${config.repo}/git/trees`,
      token: config.token,
      body: {
        base_tree: baseTreeSha,
        tree: treeEntries
      }
    });

    // Prepare author/committer with provided timestamp to control GitHub commit date
    const author = {
      name: metadata.authorName || 'netlify-admin',
      email: metadata.authorEmail || 'noreply@local',
      date: metadata.timestamp || new Date().toISOString()
    };

    const commitResponse = await requestGitHub({
      method: 'POST',
      pathName: `/repos/${config.owner}/${config.repo}/git/commits`,
      token: config.token,
      body: {
        message,
        tree: treeResponse.sha,
        parents: [commitSha],
        author,
        committer: author
      }
    });

    await requestGitHub({
      method: 'PATCH',
      pathName: `/repos/${config.owner}/${config.repo}/git/refs/heads/${config.branch}`,
      token: config.token,
      body: {
        sha: commitResponse.sha,
        force: true
      }
    });

    return { success: true, commitSha: commitResponse.sha, message };
  } catch (error) {
    return { success: false, reason: 'github-error', error: error.message };
  }
}

function commitLocalGit(relativePaths, action, metadata = {}) {
  const repoDir = process.cwd();
  const timestamp = metadata.timestamp || new Date().toISOString();
  const message = buildCommitMessage(action, timestamp);

  const filePaths = relativePaths
    .map(p => path.relative(repoDir, path.resolve(repoDir, p)))
    .map(p => p.replace(/\\/g, '/'))
    .filter(p => p && fs.existsSync(path.resolve(repoDir, p)));

  if (!filePaths.length) {
    return { success: false, reason: 'no-files' };
  }

  try {
    filePaths.forEach(file => {
      execFileSync('git', ['add', '--', file], { cwd: repoDir, stdio: 'ignore' });
    });

    const diff = execFileSync('git', ['diff', '--cached', '--name-only', '--', ...filePaths], { cwd: repoDir });
    if (!diff.toString().trim()) {
      return { success: true, reason: 'no-changes' };
    }

    execFileSync('git', ['commit', '-m', message], { cwd: repoDir, stdio: 'ignore' });

    if (metadata.push !== false) {
      try {
        execFileSync('git', ['push'], { cwd: repoDir, stdio: 'ignore' });
      } catch (pushErr) {
        return { success: true, reason: 'committed-no-push', message, warning: pushErr.message };
      }
    }

    return { success: true, message };
  } catch (err) {
    return { success: false, reason: 'git-local-failure', error: err.message };
  }
}

module.exports = {
  getGitHubRepoConfig,
  buildCommitMessage,
  syncToGitHub,
  commitLocalGit,
  readFileContent,
  writeFileContent
};
