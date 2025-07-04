#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const glob = require('glob');

// Fix import paths in compiled JavaScript files
function fixImports(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  
  // Replace require("shared") with require("../../../shared/lib")
  content = content.replace(/require\("shared"\)/g, 'require("../../../../libs/shared/lib")');
  content = content.replace(/require\("database"\)/g, 'require("../../../../libs/database/lib")');
  
  fs.writeFileSync(filePath, content);
}

// Find all JavaScript files in api-server dist
const files = glob.sync('packages/api-server/dist/**/*.js');

files.forEach(file => {
  console.log(`Fixing imports in ${file}`);
  fixImports(file);
});

console.log('Import paths fixed!');