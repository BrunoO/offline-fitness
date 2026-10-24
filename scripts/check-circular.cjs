#!/usr/bin/env node
/**
 * Circular Dependency Checker
 *
 * Scans TypeScript files in `src/` to detect any circular import cycles.
 *
 * Usage:
 *   node scripts/check-circular.cjs
 *   npm run check:circular
 *
 * Exit codes:
 *   0 - No circular dependencies found
 *   1 - One or more circular dependency cycles found
 */

const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const SRC_DIR = path.join(ROOT_DIR, 'src');

const EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx'];

function resolveImportPath(currentFilePath, importSpecifier) {
  let targetBase;
  if (importSpecifier.startsWith('@/')) {
    targetBase = path.join(SRC_DIR, importSpecifier.slice(2));
  } else if (importSpecifier.startsWith('.')) {
    targetBase = path.resolve(path.dirname(currentFilePath), importSpecifier);
  } else {
    // External module (node_modules)
    return null;
  }

  // 1. Direct file match if specifier already has extension
  if (fs.existsSync(targetBase) && fs.statSync(targetBase).isFile()) {
    return targetBase;
  }

  // 2. Try extensions (.ts, .tsx, etc.)
  for (const ext of EXTENSIONS) {
    const candidate = targetBase + ext;
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return candidate;
    }
  }

  // 3. Try directory index (e.g. ./index.ts)
  if (fs.existsSync(targetBase) && fs.statSync(targetBase).isDirectory()) {
    for (const ext of EXTENSIONS) {
      const candidate = path.join(targetBase, `index${ext}`);
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
        return candidate;
      }
    }
  }

  return null;
}

function extractImports(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const imports = new Set();

  // Match: import ... from '...' / import('...') / export ... from '...'
  // Exclude type-only imports (e.g. `import type ...` or `export type ...`) as they are erased at runtime.
  const lines = content.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('//') || trimmed.startsWith('/*')) continue;
    if (trimmed.startsWith('import type') || trimmed.startsWith('export type')) continue;

    const match = /(?:import\s+(?:[\w*\s{},]*\s+from\s+)?|export\s+(?:[\w*\s{},]*\s+from\s+)|import\s*\(\s*)['"]([^'"]+)['"]/.exec(trimmed);
    if (match) {
      const specifier = match[1];
      const resolved = resolveImportPath(filePath, specifier);
      if (resolved && resolved.startsWith(SRC_DIR)) {
        imports.add(resolved);
      }
    }
  }

  return Array.from(imports);
}

function collectSourceFiles(dir) {
  const files = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectSourceFiles(fullPath));
    } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx'))) {
      if (!entry.name.endsWith('.d.ts')) {
        files.push(fullPath);
      }
    }
  }

  return files;
}

function findCycles(graph) {
  const visited = new Set();
  const inStack = new Set();
  const stack = [];
  const cycles = [];

  function dfs(node) {
    visited.add(node);
    inStack.add(node);
    stack.push(node);

    const neighbors = graph.get(node) || [];
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        dfs(neighbor);
      } else if (inStack.has(neighbor)) {
        const cycleStartIndex = stack.indexOf(neighbor);
        const cycle = stack.slice(cycleStartIndex).concat(neighbor);
        cycles.push(cycle);
      }
    }

    stack.pop();
    inStack.delete(node);
  }

  for (const node of graph.keys()) {
    if (!visited.has(node)) {
      dfs(node);
    }
  }

  return cycles;
}

function main() {
  const sourceFiles = collectSourceFiles(SRC_DIR);
  const graph = new Map();

  for (const file of sourceFiles) {
    const deps = extractImports(file);
    graph.set(file, deps);
  }

  const cycles = findCycles(graph);

  if (cycles.length > 0) {
    console.error(`❌ Found ${cycles.length} circular dependency cycle(s):\n`);
    for (let i = 0; i < cycles.length; i++) {
      const cycle = cycles[i];
      console.error(`Cycle #${i + 1}:`);
      cycle.forEach((file, idx) => {
        const rel = path.relative(ROOT_DIR, file);
        const prefix = idx === 0 ? '  ' : '  -> ';
        console.error(`${prefix}${rel}`);
      });
      console.error('');
    }
    process.exit(1);
  } else {
    console.log(`✅ No circular dependencies found across ${sourceFiles.length} files.`);
    process.exit(0);
  }
}

main();
