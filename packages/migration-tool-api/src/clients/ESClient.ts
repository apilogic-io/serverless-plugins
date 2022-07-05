import { Client, ClientOptions } from '@opensearch-project/opensearch';
import * as fs from 'fs';
import { httpAWSESClass } from 'http-aws-es';
import { DataApiClientModule } from '../DataApiClientModule';
import { ApiClient } from './ApiClient';
import ClientConfig = DataApiClientModule.ClientConfig;

export class ESClient implements ApiClient {
  private readonly _client: Client;
  private _payload;

  constructor(config: ClientConfig) {
    this._client = ESClient.initClient(config);
  }

  getClient(): Client {
    return this._client;
  }

  private static initClient(config: ClientConfig): Client {
    const options = this.getOptions(config.config);
    console.log(options);
    return new Client(options);
  }

  private static getOptions(options): ClientOptions {
    // serverless-offline will set IS_OFFLINE based on whether we're offline
    const devMode = options.devmode;

    const prefix = options.envPrefix || 'AWS';
    const region = options.region || process.env[`${prefix}_REGION`];
    const host = options.url.host || process.env[`${prefix}_HOST`];

    delete options.region; // this doesn't belong in ES options

    if (!region) {
      throw new TypeError('region is required');
    }

    const config = Object.assign({}, options, {
      node: host,
      auth: {
        username: options.url.username,
        password: options.url.password,
      },
    });

    // don't sign the request in offline mode
    if (!devMode) {
      config.connectionClass = httpAWSESClass;
    }
    return config;
  }

  load(payload): Promise<undefined> {
    this._payload = payload;
    return undefined;
  }

  public async createIndex(
    index: string,
    workingDir: string,
    settingsPath: string,
    mappingsPath: string
  ): Promise<unknown> {
    const indexExist = await this._client.indices.exists({ index });
    console.log('EXISTS ' + indexExist);
    if (!indexExist.body) {
      console.log('Creating index:' + index);
      const settings = JSON.parse(fs.readFileSync(workingDir + settingsPath, 'utf8'));
      const body = {
        settings,
      };
      const template = {
        index,
        body,
      };
      await this._client.indices.create(template);
    }
    return this.mappingsPayload(index, workingDir, mappingsPath);
  }

  public async updateIndex(index: string, workingDir: string, mappingsPath: string): Promise<unknown> {
    return this.mappingsPayload(index, workingDir, mappingsPath);
  }

  private async mappingsPayload(index: string, workingDirectory: string, mappingsPath: string) {
    const properties = JSON.parse(fs.readFileSync(workingDirectory + mappingsPath, 'utf-8'));
    const body = {
      properties,
    };
    const template = {
      index,
      body,
    };
    return this._client.indices.putMapping(template);
  }
}
