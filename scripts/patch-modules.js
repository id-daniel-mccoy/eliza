// scripts/patch-modules.js

const fs = require('fs');
const path = require('path');

// ESM shim for fastembed
const FASTEMBED_ESM_SHIM = `
export class FastEmbedClient {
    constructor(options = {}) {
        console.warn('Using IC-compatible FastEmbed ESM shim');
        this.options = options;
    }

    async embed(texts) {
        if (!Array.isArray(texts)) texts = [texts];
        // Return dummy embeddings
        return texts.map(() => new Float32Array(384).fill(0));
    }

    async close() { return Promise.resolve(); }
}

export class EmbeddingModel {
    constructor() {
        console.warn('Using IC-compatible EmbeddingModel ESM shim');
    }
}

export class ExecutionProvider {
    constructor() {
        console.warn('Using IC-compatible ExecutionProvider ESM shim');
    }
}

export class FlagEmbedding {
    constructor() {
        console.warn('Using IC-compatible FlagEmbedding ESM shim');
    }
}

export default { FastEmbedClient, EmbeddingModel, ExecutionProvider, FlagEmbedding };
`;

// CJS shim for fastembed
const FASTEMBED_CJS_SHIM = `
"use strict";
class FastEmbedClient {
    constructor(options = {}) {
        console.warn('Using IC-compatible FastEmbed CJS shim');
        this.options = options;
    }
    async embed(texts) {
        if (!Array.isArray(texts)) texts = [texts];
        return texts.map(() => new Float32Array(384).fill(0));
    }
    async close() { return Promise.resolve(); }
}

class EmbeddingModel {
    constructor() {
        console.warn('Using IC-compatible EmbeddingModel CJS shim');
    }
}
class ExecutionProvider {
    constructor() {
        console.warn('Using IC-compatible ExecutionProvider CJS shim');
    }
}
class FlagEmbedding {
    constructor() {
        console.warn('Using IC-compatible FlagEmbedding CJS shim');
    }
}

module.exports = { FastEmbedClient, EmbeddingModel, ExecutionProvider, FlagEmbedding };
module.exports.default = { FastEmbedClient, EmbeddingModel, ExecutionProvider, FlagEmbedding };
`;

// Tokenizers shim
const TOKENIZERS_SHIM = `
class Tokenizer {
    constructor() {
        console.warn('Using IC-compatible tokenizer shim');
    }
    encode(text) {
        return {
            ids: new Array(text.length).fill(0),
            tokens: text.split(' '),
            attentionMask: new Array(text.length).fill(1)
        };
    }
    decode() { return ''; }
}
module.exports = { Tokenizer };
`;

// ONNX shim
const ONNX_SHIM = `
class InferenceSession {
    constructor() {
        console.warn('Using IC-compatible ONNX runtime shim');
    }
    async run() {
        return { output: new Float32Array(0) };
    }
}
module.exports = { InferenceSession };
`;

// Modules to patch
const MODULES_TO_PATCH = [
    {
        name: 'fastembed',
        paths: {
            'lib/esm/fastembed.js': FASTEMBED_ESM_SHIM,
            'lib/cjs/fastembed.js': FASTEMBED_CJS_SHIM,
            // Overwrite the index to ensure import defaults to our shims
            'lib/esm/index.js': `
                export * from './fastembed.js';
            `,
            'lib/cjs/index.js': `
                module.exports = require('./fastembed.js');
            `
        }
    },
    {
        name: '@anush008/tokenizers',
        paths: {
            'index.js': TOKENIZERS_SHIM,
        }
    },
    {
        name: 'onnxruntime-node',
        paths: {
            'dist/binding.js': ONNX_SHIM
        }
    }
];

// Recursively remove .node files
function removeNodeFiles(dir) {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            removeNodeFiles(fullPath);
        } else if (entry.isFile() && entry.name.endsWith('.node')) {
            fs.writeFileSync(fullPath, '// IC-compatible empty file');
            console.log(`Removed .node file: ${fullPath}`);
        }
    }
}

// Patch each module’s files
function patchModule(moduleInfo, modulePath) {
    const { name, paths } = moduleInfo;
    if (!fs.existsSync(modulePath)) {
        console.log(`Module "${name}" not found at "${modulePath}" - skipping.`);
        return;
    }

    for (const [filePath, content] of Object.entries(paths)) {
        const fullPath = path.join(modulePath, filePath);
        const dirName = path.dirname(fullPath);
        if (!fs.existsSync(dirName)) {
            fs.mkdirSync(dirName, { recursive: true });
            console.log(`Created directory: ${dirName}`);
        }
        fs.writeFileSync(fullPath, content);
        console.log(`Patched "${name}" at "${filePath}" in "${modulePath}".`);
    }

    removeNodeFiles(modulePath);
}

// Search node_modules for nested copies
function findAllModulePaths(moduleName, startPath) {
    const results = [];
    function search(dir) {
        const moduleDir = path.join(dir, 'node_modules', moduleName);
        if (fs.existsSync(moduleDir)) {
            results.push(moduleDir);
        }
        // Also search sub node_modules if any
        const subdirs = fs.readdirSync(dir, { withFileTypes: true })
            .filter(sub => sub.isDirectory() && sub.name === 'node_modules')
            .map(sub => path.join(dir, sub.name));
        subdirs.forEach(subdir => search(subdir));
    }
    search(startPath);
    return results;
}

// Mark certain modules as "browser" to avoid Node APIs
function updatePackageJson(name, modulePath) {
    const pkgPath = path.join(modulePath, 'package.json');
    if (fs.existsSync(pkgPath)) {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
        pkg.browser = {
            'node:https': false,
            'node:http': false,
            'node:crypto': false,
            'node:fs': false,
            'node:path': false,
            'node:url': false
        };
        fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));
        console.log(`Updated package.json for "${name}" at "${modulePath}" (browser field).`);
    }
}

function applyPatches() {
    console.log('Starting module patching...');
    const rootDir = process.cwd();
    MODULES_TO_PATCH.forEach(mod => {
        const foundPaths = findAllModulePaths(mod.name, rootDir);
        if (foundPaths.length === 0) {
            console.log(`Module "${mod.name}" not found. Skipping.`);
            return;
        }
        foundPaths.forEach(modulePath => {
            patchModule(mod, modulePath);
            updatePackageJson(mod.name, modulePath);
        });
    });
    console.log('Module patching complete.');
}

applyPatches();
