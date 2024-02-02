import { Client, ClientOptions } from '@opensearch-project/opensearch';
import {
  IndicesCreate,
  IndicesDeleteAlias,
  IndicesPutAlias,
  IndicesPutMapping,
} from '@opensearch-project/opensearch/api/requestParams';
import { RequestBody } from '@opensearch-project/opensearch/lib/Transport';
import * as fs from 'fs';
import { DataApiClientModule } from '../DataApiClientModule';
import { ApiClient } from './ApiClient';
import ClientConfig = DataApiClientModule.ClientConfig;

export class OpensearchClient implements ApiClient {
  private readonly _client: Client;
  private _payload;

  constructor(config: ClientConfig) {
    this._client = OpensearchClient.initClient(config);
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

  async createIndex(
    index: string,
    workingDir: string,
    settingsPath: string,
    mappingsPath: string,
    alias: string
  ): Promise<unknown> {
    if (!alias) {
      throw new Error(`Alias must be provided!`);
    }
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
    return this._mappingsPayload(index, workingDir, mappingsPath);
  }

  async upsertIndexAlias(aliasName: string, newIndexName: string, oldIndexName?: string): Promise<unknown> {
    console.log(`Moving alias ${aliasName} from index ${oldIndexName} to index ${newIndexName}`);
    if (oldIndexName) {
      try {
        const requestParams: IndicesDeleteAlias = {
          index: oldIndexName,
          name: aliasName,
        };
        console.log(`Delete
        alias
        ${aliasName}
        from
        index
        ${oldIndexName}`);
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

  async updateIndex(index: string, workingDir: string, mappingsPath: string): Promise<unknown> {
    return this._mappingsPayload(index, workingDir, mappingsPath);
  }

  async deleteIndex(index: string): Promise<unknown> {
    return this._client.indices.delete({ index });
  }

  async putScript(id: string, body?: RequestBody): Promise<unknown> {
    try {
      return this._client.putScript({
        id,
        body,
      });
    } catch (e) {
      throw new Error(`Error inserting script with id: ${id}`);
    }
  }

  async deleteScript(id: string): Promise<unknown> {
    try {
      return this._client.deleteScript({ id });
    } catch (e) {
      throw new Error(`Error deleting script with id: ${id}`);
    }
  }

  async reindexData(sourceIndex: string, destinationIndex: string): Promise<unknown> {
    const destinationIndexResponse = await this._client.indices.exists({ index: destinationIndex });
    const sourceIndexResponse = await this._client.indices.exists({ index: sourceIndex });
    if (destinationIndexResponse.statusCode === 404) {
      throw new Error(
        `Index does not exist. Cannot reindex data from ${sourceIndex} to non-existent ${destinationIndex}`
      );
    }
    if (sourceIndexResponse.statusCode === 404) {
      throw new Error(`Source index ${sourceIndex} provided for reindex operation does not exist`);
    }

    try {
      await this._client.reindex({
        body: {
          source: { index: sourceIndex },
          dest: { index: destinationIndex },
        },
      });
    } catch (e) {
      throw new Error(
        `Error occured during reindex operation: Source index: ${sourceIndex}, Destination index: ${destinationIndex}`
      );
    }

    const sourceIndexAliasesResponse = await this._client.cat.aliases({ v: true, format: 'json' });
    const aliases = (sourceIndexAliasesResponse.body as Array<unknown>)
      .filter((responseBody) => responseBody['index'] === sourceIndex)
      .map((responseBody) => ({ name: responseBody['alias'] }));

    try {
      for (const alias of aliases) {
        await this.upsertIndexAlias(alias.name, destinationIndex, sourceIndex);
      }
      return { statusCode: 200, body: aliases };
    } catch (e) {
      throw new Error('Error during upserting aliases');
    }
  }

  private async _mappingsPayload(index: string, workingDirectory: string, mappingsPath: string) {
    const properties = JSON.parse(fs.readFileSync(workingDirectory + mappingsPath, 'utf-8'));
    const requestParams: IndicesPutMapping = {
      index,
      body: { properties },
    };
    return this._client.indices.putMapping(requestParams);
  }
}
