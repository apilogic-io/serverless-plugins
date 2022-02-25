import * as fs from 'fs-extra';
import * as path from 'path';
import * as Serverless from 'serverless';
import * as ServerlessPlugin from 'serverless/classes/Plugin';
import {build} from 'esbuild';
import {nodeExternalsPlugin} from 'esbuild-node-externals';
import {BUILD_FOLDER, WORK_FOLDER} from "./constants";
import {providerRuntimeMatcher} from "./helper";

export class OfflineBuilderServerlessPlugin implements ServerlessPlugin {
    serviceDirPath: string;
    workDirPath: string;
    buildDirPath: string;

    serverless: Serverless;
    options: Serverless.Options;
    hooks: ServerlessPlugin.Hooks;

    constructor(serverless: Serverless, options: Serverless.Options) {
        this.serverless = serverless;
        this.options = options;

        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore old versions use servicePath, new versions serviceDir. Types will use only one of them
        this.serviceDirPath = this.serverless.config.serviceDir || this.serverless.config.servicePath;
        this.workDirPath = path.join(this.serviceDirPath, WORK_FOLDER);
        this.buildDirPath = path.join(this.workDirPath, BUILD_FOLDER);

        this.hooks = {
            'before:offline:start': async () => {
                await this.bundle();
            },
            'before:offline:start:init': async () => {
                await this.bundle();
            }
        };
    }

    /**
     * Checks if the runtime for the given function is nodejs.
     * If the runtime is not set , checks the global runtime.
     * @param {Serverless.FunctionDefinitionHandler} func the function to be checked
     * @returns {boolean} true if the function/global runtime is nodejs; false, otherwise
     */
    private isNodeFunction(func: Serverless.FunctionDefinitionHandler): boolean {
        const runtime = func.runtime || this.serverless.service.provider.runtime;
        const runtimeMatcher = providerRuntimeMatcher[this.serverless.service.provider.name];
        return Boolean(runtimeMatcher?.[runtime]);
    }

    /**
     * Checks if the function has a handler
     * @param {Serverless.FunctionDefinitionHandler | Serverless.FunctionDefinitionImage} func the function to be checked
     * @returns {boolean} true if the function has a handler
     */
    private static isFunctionDefinitionHandler(
      func: Serverless.FunctionDefinitionHandler | Serverless.FunctionDefinitionImage
    ): func is Serverless.FunctionDefinitionHandler {
        return Boolean((func as Serverless.FunctionDefinitionHandler)?.handler);
    }

    get functions(): Record<string, Serverless.FunctionDefinitionHandler> {
        const functions = this.options.function
          ? {
              [this.options.function]: this.serverless.service.getFunction(this.options.function),
          }
          : this.serverless.service.functions;

        // ignore all functions with a different runtime than nodejs:
        const nodeFunctions: Record<string, Serverless.FunctionDefinitionHandler> = {};
        for (const [functionAlias, fn] of Object.entries(functions)) {
            if (OfflineBuilderServerlessPlugin.isFunctionDefinitionHandler(fn) && this.isNodeFunction(fn)) {
                nodeFunctions[functionAlias] = fn;
            }
        }
        return nodeFunctions;
    }

    async bundle(): Promise<string> {
        fs.mkdirpSync(this.buildDirPath);
        for (const [functionAlias, fn] of Object.entries(this.functions)) {
            const selfPath = (fn.environment === undefined || fn.environment.selfPath === undefined) ? "" : fn.environment.selfPath
            const fnPath = path.join(this.serviceDirPath, selfPath);
            const js = fn.handler.split('.')[0];
            const functionHandler = path.join(WORK_FOLDER, js + ".js");
            build({
                entryPoints: [path.join(fnPath, js + ".ts")],
                bundle: true,
                platform: 'node',
                outfile: functionHandler,
                plugins: [ nodeExternalsPlugin({})]
            })
            fn.handler = path.join(WORK_FOLDER, fn.handler);
            console.log(functionAlias, fn)
        }

        this.serverless.cli.log('Compiling completed.');
        return 'done';
    }
}

module.exports = OfflineBuilderServerlessPlugin;