#!/bin/bash

# Exit immediately if a command exits with a non-zero status
set -e

##############################################
# Configuration
##############################################
DIST_DIR="packages/client-direct-dfx/azle/dist"

echo "Cleaning and setting up destination directory: $DIST_DIR"
rm -rf "$DIST_DIR"
mkdir -p "$DIST_DIR"

##############################################
# Copy each package's dist to the destination dist directory
##############################################
for package in packages/*/; do
    package_name=$(basename "$package")

    # Skip ourselves to avoid recursion
    if [ "$package_name" == "client-direct-dfx" ]; then
        continue
    fi

    if [ -d "$package/dist" ]; then
        echo "Copying dist from $package_name..."

        # Create package-specific directory inside DIST_DIR
        mkdir -p "$DIST_DIR/$package_name"

        # Copy everything from that package's dist folder
        cp -r "$package/dist/"* "$DIST_DIR/$package_name/"

        ##############################################
        # Patch references:
        # 1) node:path -> ../polyfills/path.js
        # 2) import https from 'node:https' -> import * as https from 'node:https'
        ##############################################
        find "$DIST_DIR/$package_name" -type f -name "*.js" -exec sed -i'.bak' \
            -e "s/from 'node:path'/from '..\/polyfills\/path.js'/g" \
            -e 's/from "node:path"/from "..\/polyfills\/path.js"/g' \
            -e "s/import https from 'node:https'/import * as https from 'node:https'/g" \
            -e 's/import https from "node:https"/import * as https from "node:https"/g' \
        {} +

        # Clean up .bak files created by sed
        find "$DIST_DIR/$package_name" -name "*.bak" -delete
    fi
done

##############################################
# Create a polyfills directory and add path polyfill
##############################################
echo "Creating polyfills directory and adding path polyfill..."
mkdir -p "$DIST_DIR/polyfills"
cat > "$DIST_DIR/polyfills/path.js" << 'EOF'
export function dirname(fullPath) {
    const parts = fullPath.split('/');
    parts.pop();
    return parts.join('/');
}
export function resolve(...segments) {
    return segments.join('/').replace(/\/+/g, '/');
}
export default { dirname, resolve };
EOF

##############################################
# Create a root index.js that exports each sub-package dist
##############################################
echo "Creating root index.js inside $DIST_DIR..."
echo "// Auto-generated index file for the client_direct_dfx canister" > "$DIST_DIR/index.js"

for sub_dist in "$DIST_DIR"/*/; do
    sub_package_name=$(basename "$sub_dist")
    # Skip the polyfills directory
    if [ "$sub_package_name" != "polyfills" ]; then
        # If there's an index.js in the sub package folder, re-export it
        echo "export * as $sub_package_name from './$sub_package_name/index.js';" >> "$DIST_DIR/index.js"
    fi
done

echo "Collect dist step complete! Distribution files are located in $DIST_DIR."
