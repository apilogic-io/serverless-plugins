import {
  AmplifyAppSyncSimulatorAuthenticationType,
  AppSyncSimulatorDataSourceBaseConfig,
  AppSyncSimulatorDataSourceConfig,
  AppSyncSimulatorDataSourceType,
  AppSyncSimulatorFunctionsConfig,
  AppSyncSimulatorMappingTemplate,
  AppSyncSimulatorSchemaConfig,
  AppSyncSimulatorTable,
  RESOLVER_KIND,
} from 'amplify-appsync-simulator/lib/type-definition';

// from https://stackoverflow.com/a/49725198/3296811
type RequireAtLeastOne<T, Keys extends keyof T = keyof T> = Pick<T, Exclude<keyof T, Keys>> &
  {
    [K in Keys]-?: Required<Pick<T, K>> & Partial<Pick<T, Exclude<Keys, K>>>;
  }[Keys];

export enum AppSyncSimulatorCustomDataSourceType {
  Http = 'HTTP',
}

export type AppSyncSimulatorCustomFunctionsConfig = AppSyncSimulatorFunctionsConfig & {
  dataSource: string;
  type: string;
  field: string;
  substitutions: {};
  requestMappingTemplate: string;
  responseMappingTemplate: string;
};

export type AmplifyAppSyncSimulatorCustomConfig = {
  authenticationType: AmplifyAppSyncSimulatorAuthenticationType;
  mappingTemplatesLocation: string;
  functionConfigurationsLocation: string;
  defaultMappingTemplates;
  functionConfigurations: AppSyncSimulatorCustomFunctionsConfig[];
  substitutions: {};
  mappingTemplates: AmplifyAppSyncSimulatorCustomMappingTemplate[];
  dataSources?: AppSyncSimulatorDataSourceConfig[];
  schema: AppSyncSimulatorSchemaConfig;
  name: string;
  defaultAuthenticationType: AmplifyAppSyncSimulatorCustomConfig;
  authRoleName?: string;
  unAuthRoleName?: string;
  authAccessKeyId?: string;
  accountId?: string;
  apiKey?: string;
  additionalAuthenticationProviders: AmplifyAppSyncSimulatorCustomConfig[];
  tables?: AppSyncSimulatorTable[];
  userPoolConfig: {};
  openIDConnectConfig: {};
};

export type AmplifyAppSyncSimulatorCustomMappingTemplate = AppSyncSimulatorMappingTemplate & {
  kind: RESOLVER_KIND;
  field: string;
  type: string;
  dataSource: string;
  functions: string[];
  substitutions: {};
  name: string;
};

export interface AppSyncSimulatorOpenSearchConfig extends AppSyncSimulatorDataSourceBaseConfig {
  type: AppSyncSimulatorDataSourceType.OpenSearch | `${AppSyncSimulatorDataSourceType.OpenSearch}`;
  endpoint: string;
}

// @ts-ignore
export interface AppSyncSimulatorHttpConfig extends AppSyncSimulatorDataSourceBaseConfig {
  name: string;
  type: AppSyncSimulatorCustomDataSourceType.Http | `${AppSyncSimulatorCustomDataSourceType.Http}`;
  config: {
    endpoint: string;
  };
}

export type AppSyncSimulatorDataSourceCustomConfig =
  | AppSyncSimulatorDataSourceConfig
  | AppSyncSimulatorOpenSearchConfig
  | AppSyncSimulatorHttpConfig;

export type Maybe<T> = null | undefined | T;

export type Event = Record<string, any>;

export type Callback = (event, context: ContextObject, done: ContextObject['cb']) => void;

export type ContextObject = {
  name: string;
  attempt: number;
  cb: (err: Maybe<Error>, result?: Event) => void | Callback | Promise<void | Callback>;
  done: ContextObject['cb'];
  succeed: (result: Event) => void;
  fail: (err: Error) => void;
};

export type Options = {
  location?: Maybe<string>;
  stateMachine?: Maybe<string>;
  lambdaEndpoint?: Maybe<string>;
  dynamoDb?: {};
  detailedLog?: boolean;
  l?: boolean;
  [key: string]: any;
  stage?: string;
  region?: string;
} & RequireAtLeastOne<
  {
    eventFile?: Maybe<string>;
    event?: Maybe<string>;
    e?: Options['event'];
    ef?: Options['eventFile'];
  },
  'event' | 'e'
>;

const DEFAULT_MAPPING_TEMPLATE_LOCATION = 'mapping-templates';
const DEFAULT_ENCODING = 'utf8';
const DEFAULT_SCHEMA_FILE = 'schema.graphql';
const DEFAULT_HTTP_METHOD = 'POST';
const DEFAULT_RESOLVER_TYPE = 'UNIT';

const MappingTemplateType = {
  MAPPING_TEMPLATE: 'mappingTemplate',
  FUNCTION_CONFIGURATION: 'functionConfiguration',
};

export {
  DEFAULT_MAPPING_TEMPLATE_LOCATION,
  DEFAULT_ENCODING,
  DEFAULT_SCHEMA_FILE,
  DEFAULT_HTTP_METHOD,
  DEFAULT_RESOLVER_TYPE,
  MappingTemplateType,
};
