import { ClientOptions } from '@opensearch-project/opensearch';
import { Client } from '@opensearch-project/opensearch';
import {
  IndicesCreate,
  IndicesDeleteAlias,
  IndicesPutAlias,
  IndicesPutMapping,
} from '@opensearch-project/opensearch/api/requestParams';
import { IndicesCreateRequest } from '@opensearch-project/opensearch/api/types';
import { TransportRequestPromise } from '@opensearch-project/opensearch/lib/Transport';
import * as fs from 'fs';
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

    return config as ClientOptions;
  }

  load(payload): Promise<undefined> {
    this._payload = payload;
    return undefined;
  }

  public async createIndex(
    index: string,
    workingDir: string,
    settingsPath: string,
    mappingsPath: string,
    alias?: string
  ): Promise<unknown> {
    const indexExist = await this._client.indices.exists({ index });
    console.log('EXISTS ' + indexExist);
    if (!indexExist.body) {
      console.log('Creating index:' + index);
      const requestParams: IndicesCreate = { index };
      requestParams.body = { settings: JSON.parse(fs.readFileSync(workingDir + settingsPath, 'utf8')) };
      if (alias) {
        requestParams.body.aliases = {};
        requestParams.body.aliases[alias] = {};
      }
      console.log('Create index params: ', requestParams);
      await this._client.indices.create(requestParams);
    }
    return this.mappingsPayload(index, workingDir, mappingsPath);
  }

  public async upsertIndexAlias(aliasName: string, newIndexName: string, oldIndexName?: string): Promise<unknown> {
    console.log(`Moving alias ${aliasName} from index ${oldIndexName} to index ${newIndexName}`);
    if (oldIndexName) {
      try {
        const requestParams: IndicesDeleteAlias = {
          index: oldIndexName,
          name: aliasName,
        };
        console.log(`Delete alias ${aliasName} from index ${oldIndexName}`);
        await this._client.indices.delete_alias(requestParams);
      } catch (error) {
        console.warn(error);
      }
    }

    try {
      const requestParams: IndicesPutAlias = { index: newIndexName, name: aliasName };
      console.log(`Adding alias ${aliasName} to index ${newIndexName}`);
      return this._client.indices.putAlias(requestParams);
    } catch (error) {
      console.error(error);
    }
  }

  public async updateIndex(index: string, workingDir: string, mappingsPath: string): Promise<unknown> {
    return this.mappingsPayload(index, workingDir, mappingsPath);
  }

  public async deleteIndex(index: string): Promise<unknown> {
    return this._client.indices.delete({ index });
  }

  private async mappingsPayload(index: string, workingDirectory: string, mappingsPath: string) {
    const properties = JSON.parse(fs.readFileSync(workingDirectory + mappingsPath, 'utf-8'));
    const requestParams: IndicesPutMapping = {
      index,
      body: { properties },
    };
    return this._client.indices.putMapping(requestParams);
  }
}
