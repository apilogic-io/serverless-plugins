import {
  AmplifyAppSyncSimulatorAuthenticationType,
  AmplifyAppSyncSimulatorAuthenticationType as AuthTypes,
} from 'amplify-appsync-simulator';
import {
  AmplifyAppSyncAPIConfig,
  AmplifyAppSyncAuthenticationProviderConfig,
  AmplifyAppSyncSimulatorConfig,
  AppSyncSimulatorDataSourceConfig,
  AppSyncSimulatorDataSourceDDBConfig,
  AppSyncSimulatorDataSourceLambdaConfig,
  AppSyncSimulatorFunctionsConfig,
  AppSyncSimulatorPipelineResolverConfig,
  AppSyncSimulatorSchemaConfig,
  AppSyncSimulatorUnitResolverConfig,
  RESOLVER_KIND,
} from 'amplify-appsync-simulator/lib/type-definition';
import { invoke } from 'amplify-nodejs-function-runtime-provider/lib/utils/invoke';
import axios from 'axios';
import * as fs from 'fs';
import { first, forEach, isNil } from 'lodash';
import { mergeTypes } from 'merge-graphql-schemas';
import * as path from 'path';
import * as Serverless from 'serverless';
import * as ServerlessPlugin from 'serverless/classes/Plugin';
import { invokeResource } from './runtime-providers/java/invoke';
import {
  AmplifyAppSyncSimulatorCustomConfig,
  AmplifyAppSyncSimulatorCustomMappingTemplate,
  AppSyncSimulatorCustomConfig,
  AppSyncSimulatorCustomFunctionsConfig,
  AppSyncSimulatorDataSourceCustomConfig,
  AppSyncSimulatorOpenSearchConfig,
  DEFAULT_ENCODING,
  DEFAULT_MAPPING_TEMPLATE_LOCATION,
  Options,
} from './types';

const directLambdaMappingTemplates = {
  request: `{
      "version": "2018-05-29",
      "operation": "Invoke",
      "payload": $utils.toJson($context)
    }`,
  response: `#if($ctx.error)
              $util.error($ctx.error.message, $ctx.error.type, $ctx.result)
             #end
             $util.toJson($ctx.result)`,
};

export interface AppSyncSimulatorConfigContext {
  plugin: ServerlessPlugin;
  serverless: Serverless;
  options: Options;
}

export class AppSyncSimulatorConfig {
  private readonly mappingTemplatesLocation: string;
  private readonly defaultMappingTemplates: {};
  private logger: ServerlessPlugin.Logging;

  constructor(private context: AppSyncSimulatorConfigContext, private appSyncConfig: AppSyncSimulatorCustomConfig) {
    this.mappingTemplatesLocation = path.join(
      context.serverless.config.servicePath,
      appSyncConfig.resolversLocation || DEFAULT_MAPPING_TEMPLATE_LOCATION
    );
    this.defaultMappingTemplates = appSyncConfig.defaultMappingTemplates;
  }

  getAppSyncConfig(): AmplifyAppSyncSimulatorConfig {
    const schemaPaths = Array.isArray(this.appSyncConfig.schema)
      ? this.appSyncConfig.schema
      : [this.appSyncConfig.schema || 'schema.graphql'];
    const schemas: AppSyncSimulatorSchemaConfig[] = schemaPaths.map((schemaPath) =>
      this.getFileMap(this.context.serverless.config.servicePath, schemaPath)
    );
    const schema: AppSyncSimulatorSchemaConfig = {
      path: first(schemas).path,
      content: mergeTypes(schemas.map((s) => s.content)),
    };

    return {
      appSync: this.makeAppSync(),
      schema,
      resolvers: Object.values(this.appSyncConfig.resolvers).map((mappingTemplate) =>
        this.makeResolver(mappingTemplate, this)
      ),
      dataSources: Object.values(this.appSyncConfig.dataSources)
        .map((datasource) => this.makeDataSource(datasource, this))
        .filter((v) => v !== null),
      functions: Object.values(this.appSyncConfig.pipelineFunctions).map((functionConfiguration) =>
        this.makeFunctionConfiguration(functionConfiguration, this)
      ),
    };
  }

  makeFunctionConfiguration(
    config: AppSyncSimulatorCustomFunctionsConfig,
    instance: AppSyncSimulatorConfig
  ): AppSyncSimulatorFunctionsConfig & {
    requestMappingTemplate: string;
    responseMappingTemplate: string;
  } {
    const vtlResponse = this.makeMappingTemplate(config, 'response', instance);
    const vtlRequest = this.makeMappingTemplate(config, 'request', instance);
    return {
      dataSourceName: config.dataSource,
      name: config.name,
      requestMappingTemplateLocation: vtlRequest,
      responseMappingTemplateLocation: vtlResponse,
      requestMappingTemplate: vtlRequest,
      responseMappingTemplate: vtlResponse,
    };
  }

  makeAppSync(): AmplifyAppSyncAPIConfig {
    return {
      name: this.appSyncConfig.name,
      apiKey: this.context.options.apiKey,
      defaultAuthenticationType: this.makeAuthType(this.appSyncConfig),
      additionalAuthenticationProviders: (this.appSyncConfig.additionalAuthenticationProviders || []).map(
        this.makeAuthType
      ),
    };
  }

  getMappingTemplate(filePath: string): string {
    return fs.readFileSync(path.join(this.mappingTemplatesLocation, filePath), {
      encoding: DEFAULT_ENCODING,
    });
  }

  getFileMap(basePath: string, filePath: string): AppSyncSimulatorSchemaConfig {
    return {
      path: filePath,
      content: fs.readFileSync(path.join(basePath, filePath), {
        encoding: DEFAULT_ENCODING,
      }),
    };
  }

  makeDataSource(
    source: AppSyncSimulatorDataSourceCustomConfig,
    instance: AppSyncSimulatorConfig
  ): AppSyncSimulatorDataSourceConfig {
    if (source.name === undefined || source.type === undefined) {
      return null;
    }

    const dataSource = {
      name: source.name,
      type: source.type,
    };

    switch (source.type) {
      case 'AMAZON_DYNAMODB': {
        return {
          ...dataSource,
          config: {
            ...instance.context.options.dynamoDb,
            tableName: source.config.tableName,
          },
        } as AppSyncSimulatorDataSourceDDBConfig;
      }
      case 'AWS_LAMBDA': {
        const functionName = source.name;
        if (functionName === undefined) {
          instance.logger.log.error(`${source.name} does not have a functionName`, {
            color: 'orange',
          });
          return null;
        }

        const conf = instance.context.options;
        if (conf.functions && conf.functions[functionName] !== undefined) {
          const func = conf.functions[functionName];
          return {
            ...dataSource,
            invoke: async (payload) => {
              const result = await axios.request({
                url: func.url,
                method: func.method,
                data: payload,
                validateStatus: (a) => false,
              });
              return result.data;
            },
          } as AppSyncSimulatorDataSourceLambdaConfig;
        }

        const func: Serverless.FunctionDefinitionHandler | Serverless.FunctionDefinitionImage =
          this.context.serverless.service.functions[functionName];
        if (func === undefined) {
          instance.logger.log.error(`The ${functionName} function is not defined`, {
            color: 'orange',
          });
          return null;
        }
        if (func.runtime === 'java8' || func.runtime === 'java11') {
          return {
            ...dataSource,
            invoke: (payload) =>
              invokeResource(
                {
                  runtime: 'java',
                  srcRoot: path.join(instance.context.serverless.config.servicePath, instance.context.options.location),
                  handler: 'handler' in func ? func.handler : func.name,
                  package: func.environment.servicePackage,
                  event: JSON.stringify(payload),
                  debug: func.environment.debug !== undefined ? func.environment.debug === 'true' : false,
                  envVars: {
                    ...(instance.context.options.lambda.loadLocalEnv === true ? process.env : {}),
                    ...instance.context.serverless.service.provider['environment'],
                    ...func.environment,
                  },
                },
                instance.context
              ),
          } as AppSyncSimulatorDataSourceLambdaConfig;
        } else {
          return {
            ...dataSource,
            invoke: (payload) =>
              invoke({
                packageFolder: path.join(
                  instance.context.serverless.config.servicePath,
                  instance.context.options.location
                ),
                handler: 'handler' in func ? func.handler : func.name,
                event: JSON.stringify(payload),
                environment: {
                  ...(instance.context.options.lambda.loadLocalEnv === true ? process.env : {}),
                  ...instance.context.serverless.service.provider['environment'],
                  ...func.environment,
                },
              }),
          } as AppSyncSimulatorDataSourceLambdaConfig;
        }
      }
      case 'AMAZON_ELASTICSEARCH':
      case 'HTTP': {
        // @ts-ignore
        return {
          ...dataSource,
          endpoint: source['endpoint'],
        } as AppSyncSimulatorOpenSearchConfig;
      }
      default:
        // @ts-ignore
        return dataSource;
    }
  }

  makeMappingTemplate(
    config: AmplifyAppSyncSimulatorCustomMappingTemplate | AppSyncSimulatorCustomFunctionsConfig,
    type: string,
    instance: AppSyncSimulatorConfig
  ): string {
    const { name, type: parent, field, substitutions = {} } = config;

    const defaultTemplatePrefix = name || `${parent}.${field}`;
    const templatePath = !isNil(config?.[type])
      ? config?.[type]
      : !isNil(instance.defaultMappingTemplates?.[type])
      ? instance.defaultMappingTemplates?.[type]
      : `${defaultTemplatePrefix}.${type}.vtl`;

    let mappingTemplate;
    // Direct lambda
    // For direct lambdas, we use a default mapping template
    // See https://amzn.to/3ncV3Dz
    if (templatePath === false) {
      mappingTemplate = directLambdaMappingTemplates[type];
    } else {
      mappingTemplate = instance.getMappingTemplate(templatePath);
      // Substitutions
      const allSubstitutions = { ...instance.appSyncConfig.substitutions, ...substitutions };
      forEach(allSubstitutions, (value, variable) => {
        const regExp = new RegExp(`\\$\{?${variable}}?`, 'g');
        mappingTemplate = mappingTemplate.replace(regExp, value);
      });
    }
    mappingTemplate = mappingTemplate.trimStart();
    mappingTemplate = mappingTemplate.trimEnd();
    return mappingTemplate;
  }

  makeResolver(
    resolver: AmplifyAppSyncSimulatorCustomMappingTemplate,
    instance: AppSyncSimulatorConfig
  ): AppSyncSimulatorPipelineResolverConfig | AppSyncSimulatorUnitResolverConfig {
    return {
      kind: resolver.kind,
      fieldName: resolver.field,
      typeName: resolver.type,
      dataSourceName: resolver.kind !== RESOLVER_KIND.PIPELINE ? resolver?.dataSource : '',
      functions: resolver.kind !== RESOLVER_KIND.UNIT ? resolver?.functions : [],
      requestMappingTemplate: this.makeMappingTemplate(resolver, 'request', instance),
      responseMappingTemplate: this.makeMappingTemplate(resolver, 'response', instance),
    };
  }

  makeAuthType(apiConfig: AppSyncSimulatorCustomConfig): AmplifyAppSyncAuthenticationProviderConfig {
    const authType = apiConfig.authentication.type;
    if (authType === AuthTypes.AMAZON_COGNITO_USER_POOLS) {
      return {
        authenticationType: authType,
        cognitoUserPoolConfig: {
          AppIdClientRegex: apiConfig.authentication.config.AppIdClientRegex,
        },
      };
    } else if (authType === AuthTypes.OPENID_CONNECT) {
      return {
        authenticationType: authType,
        openIDConnectConfig: {
          Issuer: apiConfig.authentication.config.openIDConnectConfig.Issuer,
          ClientId: apiConfig.authentication.config.openIDConnectConfig.ClientId,
        },
      };
    } else if (authType === AmplifyAppSyncSimulatorAuthenticationType.API_KEY) {
      return {
        authenticationType: authType,
      };
    }
  }
}
