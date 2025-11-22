const fs = require('fs');
const path = require('path');

function copyDirSync(src, dest) {
  if (!fs.existsSync(src)) return;
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else if (entry.isFile()) {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

const projectRoot = path.resolve(__dirname, '..');
const src = path.join(projectRoot, 'videos');
const dest = path.join(projectRoot, 'dist', 'videos');

try {
  copyDirSync(src, dest);
  console.log(`Copied videos from ${src} to ${dest}`);
} catch (err) {
  console.error('Error copying videos:', err);
  process.exit(1);
}
