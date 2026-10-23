const fs = require('node:fs');
const path = require('node:path');
const { Console } = require('console');
const console = new Console(require('process').stdout, require('process').stderr);

const appJsonPath = path.resolve(require('process').cwd(), 'app.json');
const versionFilePath = path.resolve(require('process').cwd(), '.version-code');
const appJson = require(appJsonPath);

// Read current version from external file or app.json (committed baseline)
let currentVersionCode;
if (fs.existsSync(versionFilePath)) {
  currentVersionCode = Number.parseInt(fs.readFileSync(versionFilePath, 'utf8').trim(), 10);
} else {
  currentVersionCode = appJson.expo.android.versionCode;
}

// Increment version
const newVersionCode = currentVersionCode + 1;

// Store in external (gitignored) file only — app.json is no longer touched
fs.writeFileSync(versionFilePath, newVersionCode.toString());

console.log(`Incremented versionCode to ${newVersionCode}`);
console.log(`Version stored in ${versionFilePath}`);
console.log('app.json left unchanged (versionCode resolved via app.config.js).');
