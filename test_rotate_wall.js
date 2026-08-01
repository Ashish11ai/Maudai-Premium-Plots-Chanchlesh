const fs = require('fs');
const path = require('path');

const plotDataPath = path.join(__dirname, 'public/js/plotData.js');
let content = fs.readFileSync(plotDataPath, 'utf8');

// Parse SITE_WALL_SEGMENTS from file
const match = content.match(/const SITE_WALL_SEGMENTS = (\[[\s\S]*?\]);/);
if (!match) {
  console.error('Could not find SITE_WALL_SEGMENTS');
  process.exit(1);
}

// Replace rot of wall_1785156122898 with 1.1519 (66 degrees)
let updatedContent = content.replace(
  /(id:\s*'wall_1785156122898'[\s\S]*?rot:\s*)([\d.-]+)/,
  '$11.1519'
);

fs.writeFileSync(plotDataPath, updatedContent, 'utf8');

// Verify read back
const verifyContent = fs.readFileSync(plotDataPath, 'utf8');
const wallMatch = verifyContent.match(/id:\s*'wall_1785156122898'[\s\S]*?rot:\s*([\d.-]+)/);
console.log('Verified wall_1785156122898 rot in plotData.js:', wallMatch ? wallMatch[1] : 'NOT FOUND');
