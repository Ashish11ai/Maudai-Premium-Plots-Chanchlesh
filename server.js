const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
let MongoClient = null;
try {
  MongoClient = require('mongodb').MongoClient;
} catch (err) {
  if (process.env.MONGODB_URI) {
    throw err;
  }
}
const { syncToGitHub, commitLocalGit } = require('./github-sync');

const REPO_DATA_DIR = path.join(__dirname, 'data');

const app = express();
const PORT = process.env.PORT || 3000;

let DATA_DIR = path.join(__dirname, 'data');
const isServerlessRuntime = !!(
  process.env.NETLIFY ||
  process.env.AWS_LAMBDA_FUNCTION_NAME ||
  process.env.LAMBDA_TASK_ROOT ||
  process.env.VERCEL ||
  process.env.NOW_REGION
);
if (isServerlessRuntime) {
  const tmpDataDir = path.join('/tmp', 'data');
  if (!fs.existsSync(tmpDataDir)) {
    fs.mkdirSync(tmpDataDir, { recursive: true });
    const srcDataDir = path.join(__dirname, 'data');
    if (fs.existsSync(srcDataDir)) {
      fs.readdirSync(srcDataDir).forEach(f => {
        try { fs.copyFileSync(path.join(srcDataDir, f), path.join(tmpDataDir, f)); } catch (e) {}
      });
    }
  }
  DATA_DIR = tmpDataDir;
}

const PLOTS_FILE = path.join(DATA_DIR, 'plots.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');

const ADMIN_SECRET = process.env.ADMIN_SECRET || process.env.NETLIFY_ADMIN_SECRET || '';
const MONGODB_URI = process.env.MONGODB_URI || '';
const MONGODB_DB = process.env.MONGODB_DB || 'maudai_plots';
let dbEnabled = false;
let dbCache = {
  plots: null,
  settings: null,
  plotDetails: null,
  assets: null,
  plotData: null
};
let mongoClient = null;
let mongoDb = null;

let dbInitializing = null;
async function initDatabaseStore() {
  if (!MONGODB_URI || !MongoClient) return;
  if (dbInitializing) return dbInitializing;
  dbInitializing = (async () => {
    try {
      mongoClient = new MongoClient(MONGODB_URI, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
        serverSelectionTimeoutMS: 1500,
        connectTimeoutMS: 1500
      });
      await Promise.race([
        mongoClient.connect(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('MongoDB connection timeout')), 1500))
      ]);
      mongoDb = mongoClient.db(MONGODB_DB);
      dbEnabled = true;
      const coll = mongoDb.collection('app_data');

      const [plotsDoc, settingsDoc, detailsDoc, assetsDoc, plotDataDoc] = await Promise.all([
        coll.findOne({ _id: 'plots' }),
        coll.findOne({ _id: 'settings' }),
        coll.findOne({ _id: 'plotDetails' }),
        coll.findOne({ _id: 'assets' }),
        coll.findOne({ _id: 'plotData' })
      ]);

      dbCache.plots = plotsDoc ? plotsDoc.value : null;
      dbCache.settings = settingsDoc ? settingsDoc.value : null;
      dbCache.plotDetails = detailsDoc ? detailsDoc.value : null;
      dbCache.assets = assetsDoc ? assetsDoc.value : null;
      dbCache.plotData = plotDataDoc ? plotDataDoc.value : null;

      console.log('Database store enabled for backend persistence.');
    } catch (err) {
      console.warn('MongoDB initialization skipped (falling back to file storage):', err.message || err);
      dbEnabled = false;
    }
  })();
  return dbInitializing;
}

async function saveToDb(key, value) {
  if (!dbEnabled || !mongoDb) return false;
  try {
    const coll = mongoDb.collection('app_data');
    await coll.updateOne({ _id: key }, { $set: { value } }, { upsert: true });
    return true;
  } catch (err) {
    console.warn(`Failed to save ${key} to DB:`, err.message || err);
    return false;
  }
}

function loadFromDb(key) {
  return dbEnabled ? dbCache[key] : null;
}

function saveToDbCache(key, value) {
  if (!dbEnabled) return false;
  dbCache[key] = value;
  saveToDb(key, value).catch(() => {});
  return true;
}

// --- Security & Anti-Scraping Middleware ---
const loginRateMap = new Map();
const apiRateMap = new Map();

function rateLimiter(map, windowMs, maxRequests, message) {
  return (req, res, next) => {
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    let record = map.get(ip);

    if (!record || now - record.startTime > windowMs) {
      record = { count: 1, startTime: now };
      map.set(ip, record);
      return next();
    }

    record.count++;
    if (record.count > maxRequests) {
      return res.status(429).json({ error: message || 'Too many requests. Please try again later.' });
    }
    next();
  };
}

setInterval(() => {
  const now = Date.now();
  for (const [ip, rec] of loginRateMap.entries()) {
    if (now - rec.startTime > 5 * 60 * 1000) loginRateMap.delete(ip);
  }
  for (const [ip, rec] of apiRateMap.entries()) {
    if (now - rec.startTime > 60 * 1000) apiRateMap.delete(ip);
  }
}, 10 * 60 * 1000);

// Global Security Headers Middleware
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
});

// Block requests for sensitive extensions or hidden files
app.use((req, res, next) => {
  const urlPath = req.path.toLowerCase();
  if (urlPath.includes('.env') || urlPath.includes('.git') || urlPath.endsWith('.py') || urlPath.endsWith('.sh')) {
    return res.status(403).json({ error: 'Access denied.' });
  }
  next();
});

// Apply API Rate Limiter
app.use('/api/', rateLimiter(apiRateMap, 60 * 1000, 120, 'API rate limit exceeded. Please slow down.'));

// Apply Login Rate Limiter specifically to login endpoint
app.post('/api/login', rateLimiter(loginRateMap, 5 * 60 * 1000, 10, 'Too many login attempts. Please wait 5 minutes before trying again.'));

// Middleware
app.use(bodyParser.json());
if (isServerlessRuntime) {
  app.get('/js/plotData.js', (req, res, next) => {
    const tmpPlotData = path.join('/tmp', 'public', 'js', 'plotData.js');
    if (fs.existsSync(tmpPlotData)) {
      res.setHeader('Content-Type', 'application/javascript');
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      return res.sendFile(tmpPlotData);
    }
    next();
  });
}
app.use(express.static(path.join(__dirname, 'public'), {
  etag: false,
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.js') || filePath.endsWith('.html') || filePath.endsWith('.css')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }
  }
}));
app.use(session({
  secret: 'maudai-plot-layout-secret-2026',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 24 * 60 * 60 * 1000 } // 24 hours
}));

// --- Data Helpers ---
function loadPlots() {
  const dbValue = loadFromDb('plots');
  if (dbValue) return dbValue;
  if (fs.existsSync(PLOTS_FILE)) {
    return JSON.parse(fs.readFileSync(PLOTS_FILE, 'utf8'));
  }
  return {};
}

function savePlots(data) {
  saveToDbCache('plots', data);
  try {
    fs.writeFileSync(PLOTS_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {
    console.warn('Failed to write PLOTS_FILE:', e.message);
  }
}

function syncDataFilesToRepository(relativePaths) {
  const normalizedPaths = relativePaths.map(p => p.replace(/\\/g, '/'));
  normalizedPaths.forEach(relativePath => {
    const fileName = relativePath.split('/').pop();
    const sourcePath = path.join(DATA_DIR, fileName);
    const targetPath = path.join(REPO_DATA_DIR, fileName);
    if (fs.existsSync(sourcePath)) {
      try {
        fs.mkdirSync(path.dirname(targetPath), { recursive: true });
        fs.copyFileSync(sourcePath, targetPath);
      } catch (e) {
        // Read-only filesystem on serverless Lambda runtime
      }
    }
  });
}

async function persistToGitHub(action, relativePaths, metadata = {}) {
  syncDataFilesToRepository(relativePaths);
  const timestamp = metadata.timestamp || new Date().toISOString();
  const result = await syncToGitHub(relativePaths, action, { ...metadata, timestamp });
  if (result.success) {
    console.log(`[github-sync] ${action} successfully pushed to GitHub repository (branch: ${result.branch || 'main'}).`);
    return result;
  }
  if (result.reason === 'missing-github-config') {
    const localResult = commitLocalGit(relativePaths, action, { ...metadata, timestamp, push: false });
    if (!localResult.success) {
      console.warn(`[github-sync] local git fallback failed:`, localResult.error || localResult.reason);
    }
    return localResult;
  }
  console.warn(`[github-sync] ${action} failed:`, result.error || result.reason);
  return result;
}

function loadSettings() {
  const dbValue = loadFromDb('settings');
  let settings = dbValue || {
    overlay: { x: 0, y: 0, z: 0, scale: 1, rotation: 0, opacity: 0.7 },
    gmap: {
      lat: 22.088368,
      lng: 78.863390,
      zoom: 18,
      rotation: 0,
      scale: 1.0,
      mapType: 'satellite'
    }
  };
  if (!dbValue && fs.existsSync(SETTINGS_FILE)) {
    try {
      const data = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
      settings = Object.assign(settings, data);
      if (!settings.gmap) {
        settings.gmap = {
          lat: 22.088368,
          lng: 78.863390,
          zoom: 18,
          rotation: 0,
          scale: 1.0,
          mapType: 'satellite'
        };
      }
    } catch (e) {}
  }
  return settings;
}

function saveSettings(data) {
  saveToDbCache('settings', data);
  try {
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {
    console.warn('Failed to write SETTINGS_FILE:', e.message);
  }
}

// --- Auth Middleware & Stateless Token Manager ---
const JWT_SECRET = process.env.JWT_SECRET || ADMIN_SECRET || 'maudai-plot-layout-jwt-secret-2026';

function generateAuthToken(payload) {
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', JWT_SECRET).update(data).digest('base64url');
  return `${data}.${signature}`;
}

function verifyAuthToken(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [data, signature] = parts;
  const expectedSignature = crypto.createHmac('sha256', JWT_SECRET).update(data).digest('base64url');
  if (signature !== expectedSignature) return null;
  try {
    const payload = JSON.parse(Buffer.from(data, 'base64url').toString('utf8'));
    if (payload.exp && Date.now() > payload.exp) return null;
    return payload;
  } catch (e) {
    return null;
  }
}

function parseAuth(req) {
  if (req.session && req.session.isAdmin) {
    return {
      isAdmin: true,
      username: req.session.username || 'admin',
      userRole: req.session.userRole || 'admin'
    };
  }

  if (ADMIN_SECRET) {
    const headerSecret = req.headers['x-admin-secret'] || req.headers['X-Admin-Secret'];
    const bodySecret = req.body && req.body._admin_secret;
    if (headerSecret === ADMIN_SECRET || bodySecret === ADMIN_SECRET) {
      return { isAdmin: true, username: 'admin', userRole: 'admin' };
    }
  }

  let token = null;
  const authHeader = req.headers['authorization'] || req.headers['Authorization'] || req.headers['x-auth-token'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7).trim();
  } else if (authHeader) {
    token = authHeader.trim();
  }

  if (!token && req.headers.cookie) {
    const match = req.headers.cookie.match(/(?:^|;\s*)auth_token=([^;]+)/);
    if (match) token = match[1];
  }

  if (token) {
    const decoded = verifyAuthToken(token);
    if (decoded && decoded.username) {
      return {
        isAdmin: true,
        username: decoded.username,
        userRole: decoded.role || 'admin'
      };
    }
  }

  return null;
}

function requireAdmin(req, res, next) {
  const auth = parseAuth(req);
  if (auth) {
    req.session = req.session || {};
    Object.assign(req.session, auth);
    return next();
  }
  return res.status(401).json({ error: 'Unauthorized. Please login.' });
}

function requireAdminOnly(req, res, next) {
  const auth = parseAuth(req);
  if (auth && auth.userRole === 'admin') {
    req.session = req.session || {};
    Object.assign(req.session, auth);
    return next();
  }
  return res.status(403).json({ error: 'Forbidden. Full Admin access required for this action.' });
}

// --- Users & Credentials Manager ---
function getUsers() {
  const settings = loadSettings();
  let updated = false;

  if (!settings.adminAuth) {
    settings.adminAuth = { username: 'admin', password: 'admin123' };
    updated = true;
  }

  if (!settings.users) {
    settings.users = {};
    updated = true;
  }

  const adminUser = settings.adminAuth.username || 'admin';
  const adminPass = settings.adminAuth.password || 'admin123';

  if (!settings.users[adminUser]) {
    settings.users[adminUser] = {
      username: adminUser,
      password: adminPass,
      role: 'admin'
    };
    updated = true;
  } else {
    settings.users[adminUser].password = adminPass;
  }

  // Accountant user (Plot details, status & price editor)
  if (!settings.users['Accountant']) {
    settings.users['Accountant'] = {
      username: 'Accountant',
      password: 'Accountant123',
      role: 'accountant'
    };
    updated = true;
  }

  if (updated) {
    saveSettings(settings);
  }

  return settings.users;
}

// --- API Routes ---

// Login
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  const users = getUsers();

  const userKey = Object.keys(users).find(
    k => k.toLowerCase() === (username || '').trim().toLowerCase()
  );

  if (userKey && users[userKey].password === password) {
    const matchedUser = users[userKey];
    req.session.isAdmin = true;
    req.session.username = matchedUser.username;
    req.session.userRole = matchedUser.role || 'admin';

    const token = generateAuthToken({
      username: matchedUser.username,
      role: matchedUser.role || 'admin',
      exp: Date.now() + 7 * 24 * 60 * 60 * 1000
    });

    res.setHeader('Set-Cookie', `auth_token=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800`);

    return res.json({ 
      success: true, 
      message: 'Login successful',
      token,
      user: {
        username: req.session.username,
        role: req.session.userRole
      }
    });
  }
  return res.status(401).json({ success: false, message: 'Invalid credentials' });
});

// Change Admin Password & Username (Admin Only)
app.post('/api/change-password', requireAdminOnly, async (req, res) => {
  const { currentPassword, newUsername, newPassword } = req.body;
  const users = getUsers();
  const adminUser = users['admin'] || users[Object.keys(users).find(k => users[k].role === 'admin') || 'admin'];

  if (!adminUser || currentPassword !== adminUser.password) {
    return res.status(400).json({ success: false, message: 'Current password is incorrect.' });
  }

  if (!newPassword || newPassword.trim().length < 4) {
    return res.status(400).json({ success: false, message: 'New password must be at least 4 characters long.' });
  }

  const settings = loadSettings();
  const updatedUsername = newUsername && newUsername.trim() ? newUsername.trim() : adminUser.username;
  
  settings.adminAuth = {
    username: updatedUsername,
    password: newPassword.trim()
  };

  if (!settings.users) settings.users = {};
  settings.users[updatedUsername] = {
    username: updatedUsername,
    password: newPassword.trim(),
    role: 'admin'
  };

  saveSettings(settings);
  await persistToGitHub('change-password', ['data/settings.json']);

  return res.json({ success: true, message: 'Admin credentials updated successfully!' });
});

// Logout
app.post('/api/logout', (req, res) => {
  if (req.session) {
    try { req.session.destroy(); } catch (e) {}
  }
  res.setHeader('Set-Cookie', 'auth_token=; Path=/; HttpOnly; Max-Age=0');
  return res.json({ success: true, message: 'Logged out' });
});

// Check auth status
app.get('/api/auth-status', (req, res) => {
  const auth = parseAuth(req);
  if (auth) {
    return res.json({
      isAdmin: true,
      username: auth.username,
      role: auth.userRole
    });
  }

  res.json({ 
    isAdmin: false,
    username: null,
    role: null
  });
});

const DETAILS_FILE = path.join(DATA_DIR, 'plot_details.json');

function loadPlotDetails() {
  const dbValue = loadFromDb('plotDetails');
  if (dbValue) return dbValue;
  if (fs.existsSync(DETAILS_FILE)) {
    return JSON.parse(fs.readFileSync(DETAILS_FILE, 'utf8'));
  }
  return { plots: {}, roads: [] };
}

function savePlotDetails(details) {
  saveToDbCache('plotDetails', details);
  try {
    fs.writeFileSync(DETAILS_FILE, JSON.stringify(details, null, 2), 'utf8');
  } catch (e) {
    console.warn('Failed to write DETAILS_FILE:', e.message);
  }
}

// Get all plots (enriched with dimensions & road facing info)
app.get('/api/plots', (req, res) => {
  const plots = loadPlots();
  const details = loadPlotDetails();
  
  Object.keys(plots).forEach(id => {
    if (details.plots && details.plots[id]) {
      plots[id].area = details.plots[id].area;
      plots[id].dimensions_str = details.plots[id].dimensions_str;
      plots[id].width_ft = details.plots[id].width_ft;
      plots[id].depth_ft = details.plots[id].depth_ft;
      plots[id].facing_road = details.plots[id].facing_road;
    }
  });
  
  res.json(plots);
});

// Get road specifications (width, length, type)
app.get('/api/roads', (req, res) => {
  const details = loadPlotDetails();
  res.json(details.roads || []);
});

// Get site boundary wall & road geometry
app.get('/api/infrastructure', (req, res) => {
  const infraFile = path.join(DATA_DIR, 'site_infrastructure.json');
  if (fs.existsSync(infraFile)) {
    return res.json(JSON.parse(fs.readFileSync(infraFile, 'utf8')));
  }
  res.json({ wall_segments: [], road_labels: [] });
});

// Update single plot (admin only)
app.put('/api/plots/:id', requireAdmin, async (req, res) => {
  const plots = loadPlots();
  const details = loadPlotDetails();
  const id = req.params.id;
  
  if (!plots[id]) {
    return res.status(404).json({ error: 'Plot not found' });
  }

  const now = new Date().toISOString();
  const prev = Object.assign({}, plots[id]);
  const { status, price, notes, area, dimensions_str, facing_road, width_ft, depth_ft } = req.body;
  
  if (status && status !== prev.status) {
    plots[id].status = status;
    plots[id].status_changed_at = now;
  }
  if (price !== undefined && Number(price) !== Number(prev.price)) {
    plots[id].price = Number(price);
    plots[id].price_updated_at = now;
  }
  if (notes !== undefined) {
    plots[id].notes = notes;
  }
  if (area !== undefined) plots[id].area = Number(area);
  if (dimensions_str !== undefined) plots[id].dimensions_str = dimensions_str;
  if (facing_road !== undefined) plots[id].facing_road = facing_road;
  if (width_ft !== undefined) plots[id].width_ft = Number(width_ft);
  if (depth_ft !== undefined) plots[id].depth_ft = Number(depth_ft);

  // Always update updated_at
  plots[id].updated_at = now;

  // Also persist in plot_details.json to ensure persistence across reloads
  if (!details.plots) details.plots = {};
  if (!details.plots[id]) details.plots[id] = {};

  if (area !== undefined) details.plots[id].area = Number(area);
  if (dimensions_str !== undefined) details.plots[id].dimensions_str = dimensions_str;
  if (width_ft !== undefined) details.plots[id].width_ft = Number(width_ft);
  if (depth_ft !== undefined) details.plots[id].depth_ft = Number(depth_ft);
  if (facing_road !== undefined) details.plots[id].facing_road = facing_road;

  savePlots(plots);
  savePlotDetails(details);

  try {
    await persistToGitHub('plot-update', ['data/plots.json', 'data/plot_details.json'], { timestamp: now });
  } catch (gitErr) {
    console.warn('[github-sync] Non-fatal plot update git sync warning:', gitErr.message || gitErr);
  }

  res.json({ success: true, plot: plots[id] });
});

// Bulk update plots (admin only)
app.put('/api/plots-bulk', requireAdmin, async (req, res) => {
  const plots = loadPlots();
  const updates = req.body.updates; // Array of { id, status, price, notes }
  
  if (!Array.isArray(updates)) {
    return res.status(400).json({ error: 'updates must be an array' });
  }

  const now = new Date().toISOString();
  updates.forEach(update => {
    if (plots[update.id]) {
      const prev = Object.assign({}, plots[update.id]);
      if (update.status && update.status !== prev.status) {
        plots[update.id].status = update.status;
        plots[update.id].status_changed_at = now;
      }
      if (update.price !== undefined && Number(update.price) !== Number(prev.price)) {
        plots[update.id].price = Number(update.price);
        plots[update.id].price_updated_at = now;
      }
      if (update.notes !== undefined) plots[update.id].notes = update.notes;
      plots[update.id].updated_at = now;
    }
  });
  
  savePlots(plots);
  try {
    await persistToGitHub('bulk-plot-update', ['data/plots.json', 'data/plot_details.json'], { timestamp: now });
  } catch (gitErr) {
    console.warn('[github-sync] Non-fatal bulk plot update git sync warning:', gitErr.message || gitErr);
  }
  res.json({ success: true, plots });
});

const ASSETS_FILE = path.join(DATA_DIR, 'custom_assets.json');

function loadAssets() {
  const dbValue = loadFromDb('assets');
  if (dbValue) return dbValue;
  if (fs.existsSync(ASSETS_FILE)) {
    return JSON.parse(fs.readFileSync(ASSETS_FILE, 'utf8'));
  }
  return [];
}

function saveAssets(data) {
  saveToDbCache('assets', data);
  try {
    fs.writeFileSync(ASSETS_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {
    console.warn('Failed to write ASSETS_FILE:', e.message);
  }
}

function serializeJsLiteral(value) {
  return JSON.stringify(value, null, 2)
    .replace(/"([^"]+)":/g, '$1:')
    .replace(/"/g, "'");
}

function upsertJsConst(fileContent, constName, value) {
  const serialized = serializeJsLiteral(value);
  const isArray = Array.isArray(value);
  const opener = isArray ? '[' : '{';
  const closer = isArray ? ']' : '}';

  // Find 'const NAME = { or [' using regex for the declaration start
  const startRegex = new RegExp(`(\\n*)const ${constName}\\s*=\\s*\\${opener}`);
  const startMatch = startRegex.exec(fileContent);

  if (!startMatch) {
    // Const doesn't exist yet, append it
    return `${fileContent.trimEnd()}\n\nconst ${constName} = ${serialized};\n`;
  }

  // Find matching closing bracket by counting nesting depth
  const searchStart = startMatch.index + startMatch[0].length - 1; // position of the opener
  let depth = 0;
  let endIdx = -1;
  let inString = false;
  let strChar = '';

  for (let i = searchStart; i < fileContent.length; i++) {
    const ch = fileContent[i];
    if (inString) {
      if (ch === strChar && fileContent[i - 1] !== '\\') inString = false;
      continue;
    }
    if (ch === "'" || ch === '"') { inString = true; strChar = ch; continue; }
    if (ch === '{' || ch === '[') depth++;
    if (ch === '}' || ch === ']') {
      depth--;
      if (depth === 0) { endIdx = i; break; }
    }
  }

  if (endIdx === -1) {
    // Could not find matching bracket, append fresh
    return `${fileContent.trimEnd()}\n\nconst ${constName} = ${serialized};\n`;
  }

  // Remove from the start of the const declaration to after the closing ';'
  let removeEnd = endIdx + 1;
  // Skip any trailing semicolons, commas, and whitespace
  while (removeEnd < fileContent.length && /[;\s,]/.test(fileContent[removeEnd])) {
    removeEnd++;
  }

  const before = fileContent.substring(0, startMatch.index).trimEnd();
  const after = fileContent.substring(removeEnd).trimStart();

  return `${before}\n\nconst ${constName} = ${serialized};\n\n${after}`.replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';
}

// Get custom assets
app.get('/api/assets', (req, res) => {
  res.json(loadAssets());
});

// Save Layout (Plots, Roads, and Custom Assets - Admin Only)
app.post('/api/save-layout', requireAdminOnly, async (req, res) => {
  try {
    const { plots, roads, walls, assets } = req.body;
    const plotDataPath = path.join(__dirname, 'public/js/plotData.js');
    let fileContent = fs.readFileSync(plotDataPath, 'utf8');
    
    const existingPlots = loadPlots();
    const plotAreas = {};
    const plotBadges = {};
    const plotPolygons = {};

    if (plots && typeof plots === 'object') {
      fileContent = upsertJsConst(fileContent, 'PLOT_POSITIONS', plots);

      Object.keys(plots).forEach(id => {
        const p = plots[id];
        // Calculate polygon shoelace area if polygon points exist
        let area_sqft = 0;
        if (p.polygon && Array.isArray(p.polygon) && p.polygon.length >= 3) {
          let polyArea3D = 0;
          const pts = p.polygon;
          const n = pts.length;
          for (let k = 0; k < n; k++) {
            const m = (k + 1) % n;
            polyArea3D += pts[k][0] * pts[m][1];
            polyArea3D -= pts[m][0] * pts[k][1];
          }
          polyArea3D = Math.abs(polyArea3D) / 2.0;
          area_sqft = Math.round(polyArea3D * (16.8407 * 16.8407) * 100) / 100;
          plotPolygons[id] = p.polygon;
        } else {
          const FT_SCALE = 16.8407;
          const w_ft = Math.round((p.w || 1.48) * FT_SCALE * 10) / 10;
          const d_ft = Math.round((p.h || 2.97) * FT_SCALE * 10) / 10;
          area_sqft = Math.round(w_ft * d_ft * 100) / 100;
        }

        const FT_SCALE = 16.8407;
        const w_ft = Math.round((p.w || 1.48) * FT_SCALE * 10) / 10;
        const d_ft = Math.round((p.h || 2.97) * FT_SCALE * 10) / 10;

        plotAreas[id] = area_sqft;
        plotBadges[id] = `${Math.round(w_ft)}x${Math.round(d_ft)}`;

        // Calculate 4 corners of rectangle in 3D local coords if no explicit polygon
        if (!plotPolygons[id]) {
          const cx = p.x || 0;
          const cz = p.z || 0;
          const rot = p.rot || 0;
          const hw = (p.w || 1.48) / 2;
          const hd = (p.h || 2.97) / 2;
          const cos = Math.cos(rot);
          const sin = Math.sin(rot);
          const offsets = [
            [-hw, -hd],
            [ hw, -hd],
            [ hw,  hd],
            [-hw,  hd]
          ];
          plotPolygons[id] = offsets.map(([dx, dz]) => [
            Number((cx + dx * cos + dz * sin).toFixed(4)),
            Number((cz - dx * sin + dz * cos).toFixed(4))
          ]);
        }

        // Update plots.json entry and record update timestamp
        const now = new Date().toISOString();
        if (!existingPlots[id]) {
          existingPlots[id] = {
            number: parseInt(id) || id,
            area: area_sqft,
            status: 'available',
            price: 0,
            notes: '',
            polygon: p.polygon || plotPolygons[id],
            approved: true,
            updated_at: now
          };
        } else {
          if (area_sqft > 0) existingPlots[id].area = area_sqft;
          if (p.polygon) existingPlots[id].polygon = p.polygon;
          existingPlots[id].updated_at = now;
          if (p.polygon) existingPlots[id].polygon_updated_at = now;
        }
      });

      fileContent = upsertJsConst(fileContent, 'PLOT_AREAS', plotAreas);
      fileContent = upsertJsConst(fileContent, 'PLOT_DIM_BADGES', plotBadges);
      fileContent = upsertJsConst(fileContent, 'PLOT_POLYGONS_EXACT', plotPolygons);
      savePlots(existingPlots);
    }

    if (Array.isArray(roads)) {
      fileContent = upsertJsConst(fileContent, 'SITE_ROADS_EXACT', roads);
    }

    if (Array.isArray(walls)) {
      fileContent = upsertJsConst(fileContent, 'SITE_WALL_SEGMENTS', walls);
    }
    
    try {
      fs.writeFileSync(plotDataPath, fileContent, 'utf8');
    } catch (e) {
      console.warn('[server] Could not write to __dirname/public/js/plotData.js, using fallback:', e.message);
    }
    try {
      const tmpPlotDataPath = path.join('/tmp', 'public', 'js', 'plotData.js');
      fs.mkdirSync(path.dirname(tmpPlotDataPath), { recursive: true });
      fs.writeFileSync(tmpPlotDataPath, fileContent, 'utf8');
    } catch (e) {}

    if (assets !== undefined) {
      saveAssets(assets);
    }

    const gitHubFiles = ['public/js/plotData.js', 'data/plots.json', 'data/plot_details.json', 'data/custom_assets.json'];
    await persistToGitHub('save-layout', gitHubFiles);

    res.json({ success: true, count: Object.keys(plots || {}).length });
  } catch (err) {
    console.error('Error saving layout:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get overlay settings
app.get('/api/settings', (req, res) => {
  res.json(loadSettings());
});

// Update overlay settings (admin only)
app.put('/api/settings', requireAdminOnly, async (req, res) => {
  const settings = loadSettings();
  Object.assign(settings, req.body);
  saveSettings(settings);
  await persistToGitHub('settings-update', ['data/settings.json']);
  res.json({ success: true, settings });
});

// --- Serve pages ---
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Serve a small JS snippet with runtime admin secret (if configured)
app.get('/admin-config.js', (req, res) => {
  res.setHeader('Content-Type', 'application/javascript');
  // Expose admin secret to client only if it's configured; empty string otherwise
  res.send(`window.__ADMIN_SECRET = ${JSON.stringify(ADMIN_SECRET)};`);
});

// --- Initialize plots data if not exists ---
function initializePlots() {
  if (fs.existsSync(PLOTS_FILE)) {
    console.log('Plots data already exists.');
    return;
  }
  
  // Plot areas from the PDF drawing
  const plotAreas = {
    1: 3364.83, 2: 3330.27, 3: 3930.91, 4: 3000.00, 5: 3000.00,
    6: 2763.76, 7: 1561.96, 8: 1703.73, 9: 1250.00, 10: 1250.00,
    11: 921.08, 12: 2202.74, 13: 1548.62, 14: 1800.00, 15: 1255.51,
    16: 1029.04, 17: 1134.31, 18: 1239.69, 19: 1500.00, 20: 1298.46,
    21: 1895.33, 22: 1500.00, 23: 1500.00, 24: 1250.00, 25: 1074.68,
    26: 1674.23, 27: 1250.00, 28: 1500.00, 29: 1500.00, 30: 1250.00,
    31: 1000.00, 32: 1089.86, 33: 3054.39, 34: 2236.87, 35: 1750.00,
    36: 1494.69, 37: 1485.43, 38: 1477.57, 39: 1465.73, 40: 1463.26,
    41: 1456.15, 42: 1449.05, 43: 1441.95, 44: 1196.63, 45: 1191.57,
    46: 1186.41, 47: 1181.13, 48: 1175.97, 49: 1177.90, 50: 1187.81,
    51: 1197.71, 52: 1207.61, 53: 1217.52, 54: 981.78, 55: 988.14,
    56: 994.38, 57: 995.67, 58: 969.51, 59: 939.16, 60: 908.80,
    61: 1406.64, 62: 1746.57, 63: 1250.00, 64: 1250.00, 65: 1250.00,
    66: 1250.00, 67: 1250.00, 68: 1384.04, 69: 1500.00, 70: 1590.00,
    71: 1466.70, 72: 1325.00, 73: 1325.00, 74: 1325.00, 75: 1325.00,
    76: 1325.00, 77: 1677.89, 78: 1886.82, 79: 1500.00, 80: 1500.00,
    81: 1871.97, 82: 1367.67, 83: 1500.00, 84: 1500.00, 85: 1368.53,
    86: 1476.28, 87: 1500.00, 88: 1500.00, 89: 1250.00, 90: 1310.95,
    91: 1617.72, 92: 1250.00, 93: 2106.30, 94: 2009.32, 95: 3491.52,
    96: 3310.04
  };
  
  const plots = {};
  for (let i = 1; i <= 96; i++) {
    plots[i] = {
      number: i,
      area: plotAreas[i] || 0,
      status: 'available', // available, sold, reserved
      price: 0,
      notes: ''
    };
  }
  
  savePlots(plots);
  console.log('Initialized plots data with 96 plots.');
}

// Initialize settings if not exists
function initializeSettings() {
  if (!fs.existsSync(SETTINGS_FILE)) {
    saveSettings({
      overlay: { x: 0, y: 0, scale: 1, rotation: 0, opacity: 0.7 }
    });
    console.log('Initialized default settings.');
  }
}

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

initializePlots();
initializeSettings();

// Initialize DB store if configured
initDatabaseStore().catch(err => {
  console.warn('Database initialization error:', err && err.message ? err.message : err);
});

// Start server if run directly
if (require.main === module) {
  const server = app.listen(PORT, () => {
    console.log(`\n========================================`);
    console.log(`  Maudai Property Plot Layout Server`);
    console.log(`========================================`);
    console.log(`  Customer View: http://localhost:${PORT}`);
    console.log(`  Admin Panel:   http://localhost:${PORT}/admin`);
    console.log(`  Admin Login:   admin / admin123`);
    console.log(`========================================\n`);
  });

  server.on('error', err => {
    if (err.code === 'EADDRINUSE') {
      console.error(`Port ${PORT} is already in use. Please stop the process using it or set PORT to a different port.`);
      process.exit(1);
    }
    console.error('Server error:', err);
    process.exit(1);
  });
}

module.exports = app;