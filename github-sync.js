const https = require('https');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

function getGitHubRepoConfig() {
  const token = (
    process.env.GITHUB_TOKEN ||
    process.env.GH_TOKEN ||
    process.env.NETLIFY_GITHUB_TOKEN ||
    process.env.VERCEL_GITHUB_TOKEN ||
    process.env.GITHUB_PAT ||
    ''
  ).trim();

  let repo = (
    process.env.GITHUB_REPOSITORY ||
    process.env.GH_REPOSITORY ||
    ''
  ).trim();

  let branch = (
    process.env.GITHUB_BRANCH ||
    process.env.GH_BRANCH ||
    process.env.BRANCH ||
    process.env.HEAD ||
    process.env.VERCEL_GIT_COMMIT_REF ||
    ''
  ).trim();

  // Auto-detect repository if not explicitly provided
  if (!repo) {
    const netlifyRepoUrl = process.env.REPOSITORY_URL;
    if (netlifyRepoUrl) {
      const match = netlifyRepoUrl.match(/github\.com[/:]([^/]+)\/([^/.]+)(?:\.git)?$/);
      if (match) {
        repo = `${match[1]}/${match[2]}`;
      }
    }
  }

  if (!repo) {
    const vOwner = process.env.VERCEL_GIT_REPO_OWNER;
    const vSlug = process.env.VERCEL_GIT_REPO_SLUG;
    if (vOwner && vSlug) {
      repo = `${vOwner}/${vSlug}`;
    }
  }

  if (!repo) {
    try {
      const originUrl = execFileSync('git', ['config', '--get', 'remote.origin.url'], { cwd: process.cwd(), encoding: 'utf8' }).trim();
      const match = originUrl.match(/github\.com[/:]([^/]+)\/([^/.]+)(?:\.git)?$/);
      if (match) {
        repo = `${match[1]}/${match[2]}`;
      }
    } catch (e) {}
  }

  // Auto-detect branch if not explicitly provided
  if (!branch) {
    try {
      branch = execFileSync('git', ['branch', '--show-current'], { cwd: process.cwd(), encoding: 'utf8' }).trim();
    } catch (e) {}
  }
  if (!branch) {
    branch = 'main';
  }

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
  const normPath = relativePath.replace(/\\/g, '/');
  const fileName = path.basename(normPath);

  const candidatePaths = [];

  // Check /tmp/data or serverless tmp data directory first for data files
  if (normPath.startsWith('data/')) {
    candidatePaths.push(path.join('/tmp', 'data', fileName));
  }

  // Check /tmp/public/... for updated public assets
  if (normPath.startsWith('public/')) {
    candidatePaths.push(path.join('/tmp', normPath));
    candidatePaths.push(path.join('/tmp', fileName));
  }

  // Next check process.cwd() and __dirname
  candidatePaths.push(path.resolve(process.cwd(), relativePath));
  candidatePaths.push(path.resolve(__dirname, relativePath));

  for (const fullPath of candidatePaths) {
    if (fs.existsSync(fullPath)) {
      try {
        return fs.readFileSync(fullPath, 'utf8');
      } catch (e) {}
    }
  }

  return null;
}

function writeFileContent(relativePath, content) {
  const fullPath = path.resolve(process.cwd(), relativePath);
  const dir = path.dirname(fullPath);
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(fullPath, content, 'utf8');
  } catch (e) {
    const tmpPath = path.join('/tmp', relativePath);
    fs.mkdirSync(path.dirname(tmpPath), { recursive: true });
    fs.writeFileSync(tmpPath, content, 'utf8');
    return tmpPath;
  }
  return fullPath;
}

function requestGitHub({ method, pathName, body, token }) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const headers = {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github+json',
      'User-Agent': 'netlify-admin-sync',
      'X-GitHub-Api-Version': '2022-11-28'
    };
    if (payload) {
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = Buffer.byteLength(payload);
    }
    const req = https.request({
      hostname: 'api.github.com',
      port: 443,
      path: pathName,
      method,
      headers
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
    if (payload) {
      req.write(payload);
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
    let targetBranch = config.branch;
    let refData = null;
    try {
      refData = await requestGitHub({
        method: 'GET',
        pathName: `/repos/${config.owner}/${config.repo}/git/ref/heads/${targetBranch}`,
        token: config.token
      });
    } catch (err) {
      const altBranch = targetBranch === 'main' ? 'master' : 'main';
      try {
        refData = await requestGitHub({
          method: 'GET',
          pathName: `/repos/${config.owner}/${config.repo}/git/ref/heads/${altBranch}`,
          token: config.token
        });
        targetBranch = altBranch;
      } catch (err2) {
        const repoMeta = await requestGitHub({
          method: 'GET',
          pathName: `/repos/${config.owner}/${config.repo}`,
          token: config.token
        });
        if (repoMeta && repoMeta.default_branch) {
          targetBranch = repoMeta.default_branch;
          refData = await requestGitHub({
            method: 'GET',
            pathName: `/repos/${config.owner}/${config.repo}/git/ref/heads/${targetBranch}`,
            token: config.token
          });
        } else {
          throw err;
        }
      }
    }

    const commitSha = refData.object?.sha;
    if (!commitSha) {
      throw new Error(`Could not resolve branch commit SHA for branch ${targetBranch}`);
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
      pathName: `/repos/${config.owner}/${config.repo}/git/refs/heads/${targetBranch}`,
      token: config.token,
      body: {
        sha: commitResponse.sha,
        force: true
      }
    });

    return { success: true, commitSha: commitResponse.sha, message, branch: targetBranch };
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

