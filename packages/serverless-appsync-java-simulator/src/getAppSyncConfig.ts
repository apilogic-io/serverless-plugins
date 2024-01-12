import { AmplifyAppSyncSimulatorAuthenticationType as AuthTypes } from 'amplify-appsync-simulator';
import {
  AmplifyAppSyncAPIConfig,
  AmplifyAppSyncAuthenticationProviderConfig,
  AmplifyAppSyncSimulatorConfig,
  AppSyncSimulatorSchemaConfig,
} from 'amplify-appsync-simulator/lib/type-definition';
import { invokeResource } from './runtime-providers/java/invoke';
import { invoke } from './runtime-providers/node/invoke';
import axios from 'axios';
import * as fs from 'fs';
import { forEach, isNil, first } from 'lodash';
import * as path from 'path';
import { mergeTypes } from 'merge-graphql-schemas';
// @ts-ignore
import directLambdaRequest from './templates/direct-lambda.request.vtl';
// @ts-ignore
import directLambdaResponse from './templates/direct-lambda.response.vtl';

const directLambdaMappingTemplates = {
  request: directLambdaRequest,
  response: directLambdaResponse,
};

export default function getAppSyncConfig(context, appSyncConfig): AmplifyAppSyncSimulatorConfig {
  // Flattening params
  const cfg = {
    ...appSyncConfig,
    mappingTemplates: (appSyncConfig.mappingTemplates || []).flat(),
    functionConfigurations: (appSyncConfig.functionConfigurations || []).flat(),
    dataSources: (appSyncConfig.dataSources || []).flat(),
  };

  const mappingTemplatesLocation = path.join(
    context.serverless.config.servicePath,
    cfg.mappingTemplatesLocation || 'mapping-templates'
  );

  const { defaultMappingTemplates = {} } = cfg;

  const getMappingTemplate = (filePath) => {
    return fs.readFileSync(path.join(mappingTemplatesLocation, filePath), {
      encoding: 'utf8',
    });
  };

  const getFileMap = (basePath, filePath) => ({
    path: filePath,
    content: fs.readFileSync(path.join(basePath, filePath), {
      encoding: 'utf8',
    }),
  });

  const makeDataSource = (source) => {
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
            ...context.options.dynamoDb,
            tableName: source.config.tableName,
          },
        };
      }
      case 'AWS_LAMBDA': {
        const { functionName } = source.config;
        if (functionName === undefined) {
          context.plugin.log(`${source.name} does not have a functionName`, {
            color: 'orange',
          });
          return null;
        }

        const conf = context.options;
        if (conf.functions && conf.functions[functionName] !== undefined) {
          const func = conf.functions[functionName];
          return {
            ...dataSource,
            invoke: async (payload) => {
              console.log('IN INVOKE request');
              const result = await axios.request({
                url: func.url,
                method: func.method,
                data: payload,
                validateStatus: (a) => false,
              });
              return result.data;
            },
          };
        }

        const func = context.serverless.service.functions[functionName];
        if (func === undefined) {
          context.plugin.log(`The ${functionName} function is not defined`, {
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
                  srcRoot: path.join(context.serverless.config.servicePath, context.options.location),
                  handler: func.handler,
                  package: func.environment.servicePackage,
                  event: JSON.stringify(payload),
                  debug: func.environment.debug !== undefined ? func.environment.debug : false,
                  envVars: {
                    ...(context.options.lambda.loadLocalEnv === true ? process.env : {}),
                    ...context.serverless.service.provider.environment,
                    ...func.environment,
                  },
                },
                context
              ),
          };
        } else {
          return {
            ...dataSource,
            invoke: (payload) =>
              invoke({
                packageFolder: path.join(context.serverless.config.servicePath, context.options.location),
                handler: func.handler,
                event: JSON.stringify(payload),
                environment: {
                  ...(context.options.lambda.loadLocalEnv === true ? process.env : {}),
                  ...context.serverless.service.provider.environment,
                  ...func.environment,
                },
              }),
          };
        }
      }
      case 'AMAZON_ELASTICSEARCH':
      case 'HTTP': {
        return {
          ...dataSource,
          endpoint: source.config.endpoint,
        };
      }
      default:
        return dataSource;
    }
  };

  const makeMappingTemplate = (resolver, type) => {
    const { name, type: parent, field, substitutions = {} } = resolver;

    const defaultTemplatePrefix = name || `${parent}.${field}`;
    const templatePath = !isNil(resolver?.[type])
      ? resolver?.[type]
      : !isNil(defaultMappingTemplates?.[type])
      ? defaultMappingTemplates?.[type]
      : `${defaultTemplatePrefix}.${type}.vtl`;

    let mappingTemplate;
    // Direct lambda
    // For direct lambdas, we use a default mapping template
    // See https://amzn.to/3ncV3Dz
    if (templatePath === false) {
      mappingTemplate = directLambdaMappingTemplates[type];
    } else {
      mappingTemplate = getMappingTemplate(templatePath);
      // Substitutions
      const allSubstitutions = { ...cfg.substitutions, ...substitutions };
      forEach(allSubstitutions, (value, variable) => {
        const regExp = new RegExp(`\\$\{?${variable}}?`, 'g');
        mappingTemplate = mappingTemplate.replace(regExp, value);
      });
    }

    return mappingTemplate;
  };

  const makeResolver = (resolver) => {
    return {
      kind: resolver.kind || 'UNIT',
      fieldName: resolver.field,
      typeName: resolver.type,
      dataSourceName: resolver.dataSource,
      functions: resolver.functions,
      requestMappingTemplate: makeMappingTemplate(resolver, 'request'),
      responseMappingTemplate: makeMappingTemplate(resolver, 'response'),
    };
  };

  const makeFunctionConfiguration = (config) => ({
    dataSourceName: config.dataSource,
    name: config.name,
    requestMappingTemplate: makeMappingTemplate(config, 'request'),
    responseMappingTemplate: makeMappingTemplate(config, 'response'),
  });

  const makeAuthType = (
    apiConfig: AmplifyAppSyncAuthenticationProviderConfig
  ): AmplifyAppSyncAuthenticationProviderConfig => {
    const authType = apiConfig.authenticationType;
    if (authType === AuthTypes.AMAZON_COGNITO_USER_POOLS) {
      return {
        authenticationType: authType,
        cognitoUserPoolConfig: {
          AppIdClientRegex: apiConfig.cognitoUserPoolConfig.AppIdClientRegex,
        },
      };
    } else if (authType === AuthTypes.OPENID_CONNECT) {
      return {
        authenticationType: authType,
        openIDConnectConfig: {
          Issuer: apiConfig.openIDConnectConfig.Issuer,
          ClientId: apiConfig.openIDConnectConfig.ClientId,
        },
      };
    }
  };

  const makeAppSync = (config): AmplifyAppSyncAPIConfig => ({
    name: config.name,
    apiKey: context.options.apiKey,
    defaultAuthenticationType: makeAuthType(config),
    additionalAuthenticationProviders: (config.additionalAuthenticationProviders || []).map(makeAuthType),
  });

  // Load the schema. If multiple provided, merge them
  const schemaPaths = Array.isArray(cfg.schema) ? cfg.schema : [cfg.schema || 'schema.graphql'];
  const schemas: [AppSyncSimulatorSchemaConfig] = schemaPaths.map((schemaPath) =>
    getFileMap(context.serverless.config.servicePath, schemaPath)
  );
  const schema: AppSyncSimulatorSchemaConfig = {
    path: first(schemas).path,
    content: mergeTypes(schemas.map((s) => s.content)),
  };

  return {
    appSync: makeAppSync(cfg),
    schema,
    resolvers: cfg.mappingTemplates.map(makeResolver),
    dataSources: cfg.dataSources.map(makeDataSource).filter((v) => v !== null),
    functions: cfg.functionConfigurations.map(makeFunctionConfiguration),
  };
}
