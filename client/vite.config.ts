import path from "path";
import { defineConfig } from "vite";
import topLevelAwait from "vite-plugin-top-level-await";
import react from "@vitejs/plugin-react";
import wasm from "vite-plugin-wasm";

const isIC = process.env.DFX_NETWORK !== undefined;

// https://vite.dev/config/
export default defineConfig({
    plugins: [wasm(), topLevelAwait(), react()],
    optimizeDeps: {
        exclude: ["onnxruntime-node", "@anush008/tokenizers"],
    },
    build: {
        commonjsOptions: {
            exclude: ["onnxruntime-node", "@anush008/tokenizers"],
        },
        rollupOptions: {
            external: ["onnxruntime-node", "@anush008/tokenizers"],
        },
    },
    resolve: {
        alias: {
            "@": path.resolve(__dirname, "./src"),
        },
    },
    server: {
        proxy: isIC
            ? {}
            : {
                  "/api": {
                      target: "http://localhost:3000",
                      changeOrigin: true,
                      rewrite: (path) => path.replace(/^\/api/, ""),
                  },
              },
    },
    define: {
        "process.env.IS_IC": JSON.stringify(isIC),
    },
});