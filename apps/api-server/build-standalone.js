const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('Building standalone api-server...');

// Build with ncc
exec('npx ncc build src/main.ts -o dist-standalone -m -t', (error, stdout, stderr) => {
  if (error) {
    console.error(`Error: ${error}`);
    return;
  }
  console.log(stdout);
  if (stderr) console.error(stderr);
  
  console.log('Build complete! Output in dist-standalone/');
});