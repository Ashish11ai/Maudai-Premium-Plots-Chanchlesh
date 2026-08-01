/**
 * Fix plotData.js syntax errors caused by duplicate data blocks.
 * Extracts valid const blocks and rebuilds the file cleanly.
 */
const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'public/js/plotData.js');
let content = fs.readFileSync(filePath, 'utf8');

console.log('Original file size:', content.length, 'bytes');

// Extract the header portion (function plotTo3D, STATUS_COLORS, contact info)
const headerMatch = content.match(/^([\s\S]*?const CONTACT_PHONE\s*=\s*'[^']*';)/m);
const header = headerMatch ? headerMatch[1].trim() : '';

// Now extract each named const block. We need to find the LAST valid version
// of each const since the upsertJsConst appends to the end.
const constNames = [
  'PLOT_POSITIONS',
  'PLOT_AREAS', 
  'PLOT_DIM_BADGES',
  'PLOT_POLYGONS_EXACT',
  'SITE_ROADS_EXACT',
  'SITE_WALL_SEGMENTS'
];

const extractedBlocks = {};

for (const name of constNames) {
  // Find all occurrences of this const declaration
  const regex = new RegExp(`const ${name} = ([\\[\\{])`, 'g');
  let match;
  let lastMatch = null;
  
  while ((match = regex.exec(content)) !== null) {
    lastMatch = match;
  }
  
  if (!lastMatch) {
    console.log(`WARNING: const ${name} not found!`);
    continue;
  }
  
  const startIdx = lastMatch.index;
  const opener = lastMatch[1]; // '{' or '['
  const closer = opener === '{' ? '}' : ']';
  
  // Find the matching closing bracket by counting nesting
  let depth = 0;
  let endIdx = -1;
  let inString = false;
  let stringChar = '';
  
  for (let i = startIdx + lastMatch[0].length - 1; i < content.length; i++) {
    const ch = content[i];
    
    if (inString) {
      if (ch === stringChar && content[i-1] !== '\\') {
        inString = false;
      }
      continue;
    }
    
    if (ch === "'" || ch === '"') {
      inString = true;
      stringChar = ch;
      continue;
    }
    
    if (ch === opener || (opener === '{' && ch === '{') || (opener === '[' && ch === '[')) {
      // only count same type
    }
    
    if (ch === '{' || ch === '[') depth++;
    if (ch === '}' || ch === ']') {
      depth--;
      if (depth === 0) {
        endIdx = i;
        break;
      }
    }
  }
  
  if (endIdx === -1) {
    console.log(`WARNING: Could not find closing bracket for const ${name}`);
    continue;
  }
  
  // Extract from 'const NAME = ' to the closing bracket + ';'
  let block = content.substring(startIdx, endIdx + 1) + ';';
  
  // Verify the block is valid JS
  try {
    new Function(block);
    console.log(`✓ ${name}: extracted valid block (${block.length} chars)`);
  } catch (e) {
    console.log(`WARNING: ${name} block has syntax error: ${e.message}`);
    // Try to fix common issues
    block = block.replace(/};,/g, '}');
    try {
      new Function(block);
      console.log(`  ✓ Fixed ${name} after removing stray commas`);
    } catch (e2) {
      console.log(`  ✗ Could not fix ${name}: ${e2.message}`);
    }
  }
  
  extractedBlocks[name] = block;
}

// Rebuild the file
let newContent = header + '\n\n\n';

for (const name of constNames) {
  if (extractedBlocks[name]) {
    newContent += '\n' + extractedBlocks[name] + '\n';
  }
}

// Validate final output
try {
  new Function(newContent);
  console.log('\n✓ Rebuilt file is valid JavaScript!');
} catch (e) {
  console.log('\n✗ Rebuilt file has error:', e.message);
  // Last resort: write anyway, we'll fix manually
}

console.log('New file size:', newContent.length, 'bytes (was', content.length, ')');

// Backup original
fs.writeFileSync(filePath + '.bak', content, 'utf8');
console.log('Backup saved to plotData.js.bak');

// Write fixed version
fs.writeFileSync(filePath, newContent, 'utf8');
console.log('Fixed plotData.js written successfully!');

// Final validation
try {
  const verifyContent = fs.readFileSync(filePath, 'utf8');
  new Function(verifyContent);
  console.log('✓ Final verification: plotData.js is valid JavaScript!');
} catch (e) {
  console.log('✗ Final verification failed:', e.message);
}
