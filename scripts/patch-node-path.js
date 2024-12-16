// scripts/patch-node-path.js

const fs = require('fs');
const path = require('path');

// Adjust if you store the polyfill elsewhere
const RELATIVE_POLYFILL_PATH = '../polyfills/path.js';
// This is the path that will appear in the final "import" line.
// E.g., if you're patching a file in `@ai16z/eliza/dist/`
// and your polyfill is 1 dir up in scripts/polyfills,
// you might need '../scripts/polyfills/path.js', etc.

// The module we want to patch
const PACKAGE_NAME = '@ai16z/eliza';

// 1) Find the installed @ai16z/eliza location via require.resolve
function patchNodePathImports() {
    let packageEntry;
    try {
        packageEntry = require.resolve(PACKAGE_NAME);
    } catch (err) {
        console.error(`[patch-node-path] Could not resolve "${PACKAGE_NAME}". Is it installed?`);
        process.exit(1);
    }

    // 2) The package's main file location
    const packageDir = path.dirname(packageEntry);
    // We'll assume there's a "dist" folder near the resolved entry, containing the .js files
    const distDir = path.join(packageDir, 'dist');

    if (!fs.existsSync(distDir)) {
        console.log(`[patch-node-path] No "dist" folder found for ${PACKAGE_NAME} at ${distDir}, skipping.`);
        return;
    }

    console.log(`[patch-node-path] Patching "node:path" imports in ${distDir}...`);
    patchFolderRecursively(distDir);
    console.log(`[patch-node-path] Finished patching node:path references.`);
}

// 3) Recursively scan .js files, replace `from 'node:path'`
function patchFolderRecursively(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
            patchFolderRecursively(fullPath);
        } else if (entry.isFile() && entry.name.endsWith('.js')) {
            let content = fs.readFileSync(fullPath, 'utf8');
            if (content.includes('node:path')) {
                content = content.replace(
                    /from\s+['"]node:path['"]/g,
                    `from '${RELATIVE_POLYFILL_PATH}'`
                );
                fs.writeFileSync(fullPath, content, 'utf8');
                console.log(`[patch-node-path] Replaced node:path in ${fullPath}`);
            }
        }
    }
}

// Run the patch
patchNodePathImports();
