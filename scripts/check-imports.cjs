#!/usr/bin/env node
/**
 * Import Hygiene Checker
 * 
 * Checks for duplicate and scattered imports across the codebase.
 * 
 * Usage:
 *   node scripts/check-imports.cjs
 *   npm run check:imports
 * 
 * Exit codes:
 *   0 - No issues found
 *   1 - Issues found
 */

const fs = require('fs');
const path = require('path');

function extractImportInfo(line) {
  const trimmed = line.trim();
  if (!trimmed.startsWith('import ')) return null;

  // Check for side-effect import: import 'module'
  const sideEffectMatch = trimmed.match(/^import\s+['"]([^'"]+)['"]/);
  if (sideEffectMatch) {
    return {
      line: trimmed,
      module: sideEffectMatch[1],
      normalized: sideEffectMatch[1],
      isSideEffect: true,
      fullLine: line
    };
  }

  // Match different import patterns with named/default imports
  const namedPattern = /^import\s+(?:\*\s+as\s+(\w+)|(\w+)|{([^}]+)}|(\w+)\s*,\s*{([^}]+)})\s+from\s+['"]([^'"]+)['"]/;
  const match = trimmed.match(namedPattern);
  if (match) {
    const modulePath = match[match.length - 1];
    return {
      line: trimmed,
      module: modulePath,
      normalized: modulePath,
      isSideEffect: false,
      fullLine: line
    };
  }

  return null;
}

function checkFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    const imports = new Map(); // module -> array of import info
    const duplicates = [];
    const scattered = [];

    // Collect all imports
    lines.forEach((line, index) => {
      const importInfo = extractImportInfo(line);
      if (importInfo) {
        const module = importInfo.normalized;
        if (!imports.has(module)) {
          imports.set(module, []);
        }
        imports.get(module).push({
          lineNumber: index + 1,
          ...importInfo
        });
      }
    });

    // Check for duplicates and scattered imports
    imports.forEach((occurrences, module) => {
      if (occurrences.length > 1) {
        // Check if this is a side-effect + named import combination
        const hasSideEffect = occurrences.some(occ => occ.isSideEffect);
        const hasNamed = occurrences.some(occ => !occ.isSideEffect);
        
        // For duplicate check: if we have both side-effect and named imports, that's valid - skip
        if (hasSideEffect && hasNamed && occurrences.length === 2) {
          // This is valid, but check if they're scattered
          const lineNumbers = occurrences.map(occ => occ.lineNumber);
          const minLine = Math.min(...lineNumbers);
          const maxLine = Math.max(...lineNumbers);
          const distance = maxLine - minLine;
          
          // If imports are more than 3 lines apart, they're scattered
          if (distance > 3) {
            scattered.push({
              module,
              occurrences,
              distance,
              minLine,
              maxLine
            });
          }
        } else {
          // Multiple imports from same module - this is a duplicate
          duplicates.push({
            module,
            occurrences
          });
        }
      }
    });

    return { duplicates, scattered };
  } catch (error) {
    console.error(`Error reading ${filePath}:`, error.message);
    return { duplicates: [], scattered: [] };
  }
}

function getAllFiles(dir, fileList = []) {
  const files = fs.readdirSync(dir);
  
  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    
    if (stat.isDirectory()) {
      // Skip node_modules, coverage, build directories
      if (!['node_modules', 'coverage', 'build', '.git', 'android', 'ios'].includes(file)) {
        getAllFiles(filePath, fileList);
      }
    } else if (file.endsWith('.ts') || file.endsWith('.tsx')) {
      fileList.push(filePath);
    }
  });
  
  return fileList;
}

// Main execution
const srcDir = path.join(__dirname, '..', 'src');
const testDir = path.join(__dirname, '..', '__tests__');
const appFile = path.join(__dirname, '..', 'App.tsx');

const allFiles = [
  ...getAllFiles(srcDir),
  ...getAllFiles(testDir),
  ...(fs.existsSync(appFile) ? [appFile] : [])
];

const results = {
  duplicates: [],
  scattered: []
};

allFiles.forEach(file => {
  const { duplicates, scattered } = checkFile(file);
  if (duplicates.length > 0 || scattered.length > 0) {
    const relativePath = path.relative(path.join(__dirname, '..'), file);
    if (duplicates.length > 0) {
      results.duplicates.push({
        file: relativePath,
        duplicates
      });
    }
    if (scattered.length > 0) {
      results.scattered.push({
        file: relativePath,
        scattered
      });
    }
  }
});

// Output results
let hasIssues = false;

if (results.duplicates.length > 0) {
  hasIssues = true;
  console.log(`\n❌ Found duplicate imports in ${results.duplicates.length} file(s):\n`);
  results.duplicates.forEach(result => {
    console.log(`\n📄 ${result.file}:`);
    result.duplicates.forEach(dup => {
      console.log(`  Module "${dup.module}" imported ${dup.occurrences.length} times:`);
      dup.occurrences.forEach(occ => {
        console.log(`    Line ${occ.lineNumber}: ${occ.line}`);
      });
    });
  });
}

if (results.scattered.length > 0) {
  hasIssues = true;
  console.log(`\n❌ Found scattered imports in ${results.scattered.length} file(s):\n`);
  results.scattered.forEach(result => {
    console.log(`\n📄 ${result.file}:`);
    result.scattered.forEach(scat => {
      console.log(`  Module "${scat.module}" imported ${scat.occurrences.length} times (${scat.distance} lines apart):`);
      scat.occurrences.forEach(occ => {
        console.log(`    Line ${occ.lineNumber}: ${occ.line}`);
      });
    });
  });
}

if (!hasIssues) {
  console.log('✅ No duplicate or scattered imports found!');
  process.exit(0);
} else {
  console.log('\n💡 Tip: Consolidate imports from the same module into a single import statement.');
  console.log('   Side-effect imports should remain at the top, with named imports immediately following.');
  process.exit(1);
}

