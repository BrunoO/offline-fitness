const fs = require('fs');
const path = require('path');
const { Console } = require('console');
const console = new Console(require('process').stdout, require('process').stderr);

const appJsonPath = path.resolve(require('process').cwd(), 'app.json');
const versionFilePath = path.resolve(require('process').cwd(), '.version-code');
const appJson = require(appJsonPath);

// Read current version from external file or app.json
let currentVersionCode;
if (fs.existsSync(versionFilePath)) {
  currentVersionCode = parseInt(fs.readFileSync(versionFilePath, 'utf8').trim());
} else {
  currentVersionCode = appJson.expo.android.versionCode;
}

// Increment version
const newVersionCode = currentVersionCode + 1;

// Update app.json
appJson.expo.android.versionCode = newVersionCode;
fs.writeFileSync(appJsonPath, JSON.stringify(appJson, null, 2));

// Store in external file
fs.writeFileSync(versionFilePath, newVersionCode.toString());

console.log(`Incremented versionCode to ${newVersionCode}`);
console.log(`Version stored in ${versionFilePath}`);
