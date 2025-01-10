// This file contains the custom esbuild configuration for Azle's experimental compilation.
// This file goes in the ./packages/client-direct-dfx/azle/node_modules/azle/src/build/experimental/commands/compile directory.
// This is an internal patch to Azle to allow for onyxruntime and tokenizer to be used in the experimental compilation.

import { BuildOptions } from 'esbuild';
import esbuildPluginTsc from 'esbuild-plugin-tsc';
import { join, resolve } from 'path';

import {
    bundle,
    getBuildOptions as getStableBuildOptions,
    handleClassApiCanister,
} from '../../../stable/commands/compile/javascript';
import { AZLE_PACKAGE_PATH } from '../../../stable/utils/global_paths';
import { WASMEDGE_QUICKJS_PATH } from '../../utils/global_paths';

export async function compile(
    main: string,
    esmAliases: Record<string, string>,
    esmExternals: string[]
): Promise<string> {
    const prelude = getPrelude(main);
    const buildOptions = getBuildOptions(prelude, esmAliases, esmExternals);
    const bundled = await bundle(buildOptions);

    return bundled
        .replace(
            /__toCommonJS\(assert_exports\)\);/g,
            `__toCommonJS(assert_exports)).default;`
        )
        .replace(
            /__toCommonJS\(stream_exports\)\);/g,
            `__toCommonJS(stream_exports)).default;`
        )
        .replace(
            /__toCommonJS\(http_exports\)\);/g,
            `__toCommonJS(http_exports)).default;`
        );
}

export function getPrelude(main: string): string {
    return /*TS*/ `
        import 'azle/src/lib/stable/globals';
        import 'azle/src/lib/experimental/globals';

        import 'reflect-metadata';

        // TODO remove the ethersGetUrl registration once we implement lower-level http for ethers
        import { ethersGetUrl, Server } from 'azle/src/lib/experimental';
        import { ethers } from 'ethers';
        ethers.FetchRequest.registerGetUrl(ethersGetUrl);

        import { DidVisitor, getDefaultVisitorData, IDL, toDidString } from 'azle';
        export { Principal } from '@dfinity/principal';
        import * as Canister from './${main}';

        if (isClassSyntaxExport(Canister)) {
            ${handleClassApiCanister()}
        }
        else {
            setTimeout(() => {
                const canister = Canister.default !== undefined ? Canister.default() : Server(() => globalThis._azleNodeServer)();

                const candid = canister.getIdlType([]).accept(new DidVisitor(), {
                    ...getDefaultVisitorData(),
                    isFirstService: true,
                    systemFuncs: canister.getSystemFunctionIdlTypes()
                });

                globalThis._azleCallbacks = canister.callbacks;

                globalThis._azleGetCandidAndMethodMeta = () => {
                    return JSON.stringify({
                        candid: toDidString(candid),
                        methodMeta: canister.methodMeta
                    });
                };
            });
        }

        function isClassSyntaxExport(canister) {
            const isNothing = canister === undefined || canister.default === undefined;
            const isFunctionalSyntaxExport =
                canister?.default?.isCanister === true ||
                canister?.default?.isRecursive === true;
            return !isNothing && !isFunctionalSyntaxExport;
        }
    `;
}

export function getBuildOptions(
    ts: string,
    esmAliases: Record<string, string>,
    esmExternals: string[]
): BuildOptions {
    const externalImplemented = [
        '_node:fs',
        '_node:os',
        '_node:crypto',
        'qjs:os',
        '_encoding',
        'wasi_net',
        'wasi_http',
    ];

    const externalNotImplementedAzle: string[] = [];

    const externalNotImplementedDev = esmExternals;

    const externalNotImplemented = [
        ...externalNotImplementedAzle,
        ...externalNotImplementedDev,
    ];

    const customJsModulesPath = join(
        AZLE_PACKAGE_PATH,
        'src',
        'build',
        'experimental',
        'commands',
        'compile',
        'custom_js_modules'
    );

    const stableBuildOptions = getStableBuildOptions(ts);

    const buildOptions: BuildOptions = {
        ...stableBuildOptions,
        alias: {
            internal: `${WASMEDGE_QUICKJS_PATH}/modules/internal`,
            util: `${WASMEDGE_QUICKJS_PATH}/modules/util`,
            fs: `${WASMEDGE_QUICKJS_PATH}/modules/fs`,
            fmt: `${WASMEDGE_QUICKJS_PATH}/modules/fmt`,
            assert: `${WASMEDGE_QUICKJS_PATH}/modules/assert.js`,
            buffer: `${WASMEDGE_QUICKJS_PATH}/modules/buffer.js`,
            path: `${WASMEDGE_QUICKJS_PATH}/modules/path.js`,
            stream: `${WASMEDGE_QUICKJS_PATH}/modules/stream.js`,
            process: `${WASMEDGE_QUICKJS_PATH}/modules/process.js`,
            url: `${WASMEDGE_QUICKJS_PATH}/modules/url.js`,
            events: `${WASMEDGE_QUICKJS_PATH}/modules/events.js`,
            string_decoder: `${WASMEDGE_QUICKJS_PATH}/modules/string_decoder.js`,
            punycode: `${WASMEDGE_QUICKJS_PATH}/modules/punycode.js`,
            querystring: `${WASMEDGE_QUICKJS_PATH}/modules/querystring.js`,
            whatwg_url: `${WASMEDGE_QUICKJS_PATH}/modules/whatwg_url.js`,
            encoding: `${WASMEDGE_QUICKJS_PATH}/modules/encoding.js`,
            http: `${WASMEDGE_QUICKJS_PATH}/modules/http.js`,
            os: `${WASMEDGE_QUICKJS_PATH}/modules/os.js`,
            crypto: 'crypto-browserify',
            zlib: 'pako',
            'path-browserify': 'path-browserify',
            'node:path': 'path-browserify',
            'internal/deps/acorn/acorn/dist/acorn': join(
                customJsModulesPath,
                'acorn',
                'acorn.ts'
            ),
            'internal/deps/acorn/acorn-walk/dist/walk': join(
                customJsModulesPath,
                'acorn',
                'walk.ts'
            ),
            perf_hooks: join(customJsModulesPath, 'perf_hooks.ts'),
            async_hooks: join(customJsModulesPath, 'async_hooks.ts'),
            https: join(customJsModulesPath, 'https.ts'),
            ...esmAliases,
        },
        external: [...externalImplemented, ...externalNotImplemented],
        plugins: [
            esbuildPluginTsc(),
            {
                name: 'node-loader',
                setup(build): void {
                    build.onResolve({ filter: /\.node$/ }, (args) => {
                        const resolvedPath = resolve(args.resolveDir, args.path);
                        return { path: resolvedPath, namespace: 'file' };
                    });

                    build.onLoad({ filter: /\.node$/ }, async (args) => {
                        return {
                            contents: `
                                import path from 'path';
                                import { fileURLToPath } from 'url';
                                const __filename = fileURLToPath(import.meta.url);
                                const __dirname = path.dirname(__filename);
                                export default path.join(__dirname, ${JSON.stringify(
                                    args.path
                                )});
                            `,
                            loader: 'js',
                        };
                    });
                },
            },
        ],
    };

    return buildOptions;
}
