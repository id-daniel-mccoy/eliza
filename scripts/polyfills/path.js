// scripts/polyfills/path.js
export function dirname(fullPath) {
    const parts = fullPath.split('/');
    parts.pop();
    return parts.join('/');
}

export function resolve(...segments) {
    return segments.join('/').replace(/\/+/g, '/');
}

export default { dirname, resolve };
