#!/bin/bash
set -e

###################################################################
# 1) Install the native modules locally (so they're in this package)
###################################################################
pnpm add fastembed @anush008/tokenizers onnxruntime-node --save

###################################################################
# 2) Create a shims folder in client-direct-dfx
###################################################################
SHIMS_DIR="shims"
rm -rf "$SHIMS_DIR"
mkdir -p "$SHIMS_DIR/fastembed/lib/esm"
mkdir -p "$SHIMS_DIR/fastembed/lib/cjs"
mkdir -p "$SHIMS_DIR/@anush008/tokenizers"
mkdir -p "$SHIMS_DIR/onnxruntime-node/dist"

echo "Created local shims folders."

###################################################################
# 3) Write the shim files (ESM/CJS) for fastembed, tokenizers, onnxruntime-node
###################################################################
cat > "$SHIMS_DIR/fastembed/lib/esm/fastembed.js" << 'EOF'
export class FastEmbedClient {
    constructor(options = {}) {
        console.warn('Using IC-compatible FastEmbed ESM shim');
        this.options = options;
    }
    async embed(texts) {
        if (!Array.isArray(texts)) texts = [texts];
        return texts.map(() => new Float32Array(384).fill(0));
    }
    async close() { return Promise.resolve(); }
}
export class EmbeddingModel {
    constructor() { console.warn('Using IC-compatible EmbeddingModel ESM shim'); }
}
export class ExecutionProvider {
    constructor() { console.warn('Using IC-compatible ExecutionProvider ESM shim'); }
}
export class FlagEmbedding {
    constructor() { console.warn('Using IC-compatible FlagEmbedding ESM shim'); }
}
export default { FastEmbedClient, EmbeddingModel, ExecutionProvider, FlagEmbedding };
EOF

cat > "$SHIMS_DIR/fastembed/lib/esm/index.js" << 'EOF'
export * from './fastembed.js';
EOF

cat > "$SHIMS_DIR/fastembed/lib/cjs/fastembed.js" << 'EOF'
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
    constructor() { console.warn('Using IC-compatible EmbeddingModel CJS shim'); }
}
class ExecutionProvider {
    constructor() { console.warn('Using IC-compatible ExecutionProvider CJS shim'); }
}
class FlagEmbedding {
    constructor() { console.warn('Using IC-compatible FlagEmbedding CJS shim'); }
}
module.exports = { FastEmbedClient, EmbeddingModel, ExecutionProvider, FlagEmbedding };
module.exports.default = { FastEmbedClient, EmbeddingModel, ExecutionProvider, FlagEmbedding };
EOF

cat > "$SHIMS_DIR/fastembed/lib/cjs/index.js" << 'EOF'
module.exports = require('./fastembed.js');
EOF

cat > "$SHIMS_DIR/@anush008/tokenizers/index.js" << 'EOF'
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
EOF

cat > "$SHIMS_DIR/onnxruntime-node/dist/binding.js" << 'EOF'
class InferenceSession {
    constructor() {
        console.warn('Using IC-compatible ONNX runtime shim');
    }
    async run() {
        return { output: new Float32Array(0) };
    }
}
module.exports = { InferenceSession };
EOF

echo "Wrote local shims for fastembed, tokenizers, onnxruntime-node."

###################################################################
# 4) Overwrite references in your code or sub-packages to use './shims'
###################################################################
# We'll do a basic 'sed' approach searching for references like:
#   import { ... } from 'fastembed'
#   require('fastembed')
#   or if code references these modules in /packages or node_modules
# We replace them with './shims/fastembed'
# Then do the same for tokenizers & onnxruntime-node

echo "Patching references to point to local shims..."

# If your code or sub-packages import e.g. "fastembed", we rewrite them to './shims/fastembed'
# We only apply it to .js or .ts in the local folder, or you can expand if needed
find . -type f \( -name "*.js" -o -name "*.ts" \) -exec sed -i'.bak' \
    -e "s|[\"']fastembed[\"']|'./shims/fastembed'|g" \
    -e "s|[\"']@anush008/tokenizers[\"']|'./shims/@anush008/tokenizers'|g" \
    -e "s|[\"']onnxruntime-node[\"']|'./shims/onnxruntime-node'|g" \
{} +

find . -name "*.bak" -delete

echo "All references replaced to use local shims."

###################################################################
# 5) (Optional) Also patch "node:path" or "node:https" in final code
###################################################################
# If your final compiled code still references node:path, node:https, you can patch them:
# If you have a dist approach, or you want to do it in local code:

DIST_DIR="dist"  # If you produce a local dist. Adjust as needed.
if [ -d "$DIST_DIR" ]; then
  echo "Patching node:path and node:https in local dist..."
  find "$DIST_DIR" -type f -name "*.js" -exec sed -i'.bak' \
      -e "s/from 'node:path'/from '.\/path_polyfill.js'/g" \
      -e 's/from "node:path"/from ".\/path_polyfill.js"/g' \
      -e "s/import https from 'node:https'/import * as https from 'node:https'/g" \
      -e 's/import https from \"node:https\"/import * as https from \"node:https\"/g' \
  {} +
  find "$DIST_DIR" -name "*.bak" -delete
fi

echo "Local environment prepared for IC deployment with shims."
