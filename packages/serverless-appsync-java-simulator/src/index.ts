import { addDataLoader, AmplifyAppSyncSimulator, AppSyncSimulatorDataSourceType } from 'amplify-appsync-simulator';
import * as cfnResolverLib from 'cfn-resolver-lib';
import { Client } from 'fb-watchman';
import { defaults, get, merge, reduce } from 'lodash';
import * as Serverless from 'serverless';
import * as ServerlessPlugin from 'serverless/classes/Plugin';
import { inspect } from 'util';
import { AppSyncSimulatorConfig } from './appsync-simulator-config';
import { ElasticDataLoader } from './data-loaders/elastic-data-loader';
import { HttpDataLoader } from './data-loaders/http-data-loader';
import { Options } from './types';

const resolverPathMap = {
  'AWS::DynamoDB::Table': 'Properties.TableName',
  'AWS::S3::Bucket': 'Properties.BucketName',
};

class ServerlessAppSyncSimulator implements ServerlessPlugin {
  serverless: Serverless;
  options: Options;
  logger: ServerlessPlugin.Logging;
  commands: ServerlessPlugin.Commands;
  hooks: ServerlessPlugin['hooks'];
  simulator: AmplifyAppSyncSimulator;
  resourceResolvers: any;

  constructor(serverless: Serverless, options: Options, log) {
    this.serverless = serverless;
    this.options = options;
    this.logger = log;

    this.simulator = null;
    // @ts-ignore
    addDataLoader('HTTP', HttpDataLoader);
    // @ts-ignore
    addDataLoader(AppSyncSimulatorDataSourceType.OpenSearch, ElasticDataLoader);

    this.hooks = {
      'before:offline:start': this.startServer.bind(this),
      'before:offline:start:end': this.endServer.bind(this),
    };
  }

  log(message, opts = {}) {
    return this.logger.log.info(message, 'AppSync Simulator', opts);
  }

  debugLog(message, opts = {}) {
    if (process.env.SLS_DEBUG) {
      this.log(message, opts);
    }
  }

  async startServer() {
    try {
      this.buildResolvedOptions();
      this.buildResourceResolvers();
      this.serverless.service.functions = this.resolveResources(this.serverless.service.functions);
      this.serverless.service.custom.appSync = this.resolveResources(this.serverless.service.custom.appSync);

      this.simulator = new AmplifyAppSyncSimulator({
        port: this.options.port as number,
        wsPort: this.options.wsPort as number,
      });

      await this.simulator.start();
      if (Array.isArray(this.options.watch) && this.options.watch.length > 0) {
        this.watch();
      } else {
        this.initServer();
      }

      this.log(`AppSync endpoint: ${this.simulator.url}/graphql`);
      this.log(`GraphiQl: ${this.simulator.url}`);
    } catch (error) {
      this.log(error, { color: 'red' });
    }
  }

  initServer() {
    // TODO: suport several API's
    const appSync = Array.isArray(this.serverless.service.custom.appSync)
      ? this.serverless.service.custom.appSync[0]
      : this.serverless.service.custom.appSync;
    const appSyncSimulatorConfig = new AppSyncSimulatorConfig(
      {
        plugin: this,
        serverless: this.serverless,
        options: this.options,
      },
      appSync
    );
    const config = appSyncSimulatorConfig.getAppSyncConfig();

    this.debugLog(`AppSync Config ${appSync.name}`);
    this.debugLog(inspect(config, { depth: 4, colors: true }));

    this.simulator.init(config);
  }

  watch() {
    const client = new Client();
    const path = this.serverless.config.servicePath;

    // Try to watch for changes in AppSync configuration
    client.command(['watch-project', path], (error, resp) => {
      if (error) {
        console.error('Error initiating watch:', error);
        console.log('AppSync Simulator hot-reloading will not be available');
        // init server once
        this.initServer();
        return;
      }

      if ('warning' in resp) {
        console.log('warning: ', resp.warning);
      }

      // Watch for changes in vtl and schema files.
      const sub = {
        // @ts-ignore
        expression: ['anyof', ...this.options.watch.map((glob) => ['match', glob])],
        fields: ['name'],
        since: resp.clock,
        relative_root: null,
      };

      const { watch, relative_path } = resp;
      if (relative_path) {
        sub.relative_root = relative_path;
      }

      // init subscription
      client.command(['subscribe', watch, 'appsync-simulator', sub], (error) => {
        if (error) {
          console.error('Failed to subscribe: ', error);
          return;
        }
      });
    });

    client.on('subscription', async (resp) => {
      if (resp.subscription === 'appsync-simulator') {
        console.log('Hot-reloading AppSync simulator...');
        this.initServer();
      }
    });
  }

  endServer() {
    if (this.simulator) {
      this.log('Halting AppSync Simulator');
      this.simulator.stop();
    }
  }

  buildResourceResolvers() {
    const refResolvers = reduce(
      get(this.serverless.service, 'resources.Resources', {}),
      (acc, res, name) => {
        const path = resolverPathMap[res.Type];
        if (path !== undefined) {
          return { ...acc, [name]: get(res, path, null) };
        }

        return acc;
      },
      {}
    );

    const keyValueArrayToObject = (mapping) => {
      if (Array.isArray(mapping)) {
        return mapping.reduce((acc, { key, value }) => ({ ...acc, [key]: value }), {});
      }
      return mapping;
    };

    this.resourceResolvers = {
      RefResolvers: {
        ...refResolvers,
        ...keyValueArrayToObject(this.options.refMap),
        // Add region for cfn-resolver-lib GetAZs
        'AWS::Region': this.serverless.service.provider.region,
      },
      'Fn::GetAttResolvers': keyValueArrayToObject(this.options.getAttMap),
      'Fn::ImportValueResolvers': keyValueArrayToObject(this.options.importValueMap),
    };
  }

  buildResolvedOptions() {
    this.options = merge(
      {
        apiKey: '0123456789',
        port: 20002,
        wsPort: 20003,
        location: '.',
        lambda: {
          loadLocalEnv: false,
        },
        refMap: {},
        getAttMap: {},
        importValueMap: {},
        dynamoDb: {
          endpoint: `http://localhost:${get(this.serverless.service, 'custom.dynamodb.start.port', 8000)}`,
          region: 'localhost',
          accessKeyId: 'DEFAULT_ACCESS_KEY',
          secretAccessKey: 'DEFAULT_SECRET',
        },
      },
      get(this.serverless.service, 'custom.appsync-simulator', {})
    );

    this.options = defaults(this.options, {
      watch: ['*.graphql', '*.vtl'],
    });
  }

  /**
   * Resolves resourses through `Ref:` or `Fn:GetAtt`
   */
  resolveResources(toBeResolved) {
    // Pass all resources to allow Fn::GetAtt and Conditions resolution
    if (!this.serverless.service.resources['Parameters']) {
      this.serverless.service.resources['Parameters'] = {};
    }
    const node = {
      ...this.serverless.service.resources,
      toBeResolved,
    };
    const evaluator = new cfnResolverLib(node, this.resourceResolvers);
    const result = evaluator.evaluateNodes();
    if (result && result.toBeResolved) {
      return result.toBeResolved;
    }

    return toBeResolved;
  }
}

module.exports = ServerlessAppSyncSimulator;
