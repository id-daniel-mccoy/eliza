if (typeof globalThis.TransformStream === "undefined") {
    globalThis.TransformStream = class TransformStream {
        constructor() {
            console.warn("Using IC-compatible TransformStream shim");
        }
    } as any;
}
