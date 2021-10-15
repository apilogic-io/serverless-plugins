import {ApiClient} from "./ApiClient";
import {Client} from '@opensearch-project/opensearch'
import {DataApiClientModule} from "../DataApiClientModule";
import {EnvironmentCredentials} from 'aws-sdk';
import {httpAWSESClass} from 'http-aws-es';
import ClientConfig = DataApiClientModule.ClientConfig;
import * as fs from "fs";

export class ESClient implements ApiClient {
    private readonly client: Client;
    private _payload;

    constructor(config: ClientConfig) {
        this.client = ESClient.initClient(config)
    }

    getClient(): Client {
        return this.client;
    }

    private static initClient(config: ClientConfig) {

        return new Client(this.getOptions(config.config));
    }

    private static getOptions(options) {


        // serverless-offline will set IS_OFFLINE based on whether we're offline
        const devMode = options.devmode;

        const prefix = options.envPrefix || 'AWS';
        const region = options.region || process.env[`${prefix}_REGION`];
        const host = options.endpoint || process.env[`${prefix}_HOST`];
        const auth = {
            username: "admin",
            password: "admin"
        };
        delete options.region; // this doesn't belong in ES options

        if (!region) {
            throw new TypeError('region is required');
        }
        if (!host) {
            throw new TypeError('host is required');
        }

        const credentials = options.credentials || new EnvironmentCredentials(prefix);

        const config = Object.assign({}, options, {
            host: host,
            auth: auth,
            amazonES: {
                region,
                credentials
            }
        });

        // don't sign the request in offline mode
        if (!devMode) {
            config.connectionClass = httpAWSESClass;
        }

        return config;
    }


    // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
    load(payload): Promise<unknown | null> {
        this._payload = payload;
        return undefined;
    }

    public async createIndex(index: string,
                             workingDir: string,
                             settingsPath: string,
                             mappingsPath: string): Promise<unknown> {
        const indexExist =  await this.client.indices.exists({ index });
        if(!indexExist) {
            const settings = JSON.parse(fs.readFileSync(workingDir + settingsPath,  "utf8"));
            const body = {
                settings
            };
            const template = {
                index,
                body

            };
            await this.client.indices.create(template);
        }
        return await this.mappingsPayload(index, workingDir, mappingsPath);

    }

    public async updateIndex(index: string,
                             workingDir: string,
                             mappingsPath: string): Promise<unknown> {
        return this.mappingsPayload(index, workingDir, mappingsPath);
    }



    private async mappingsPayload(index: string, workingDirectory: string, mappingsPath: string) {
        const properties = JSON.parse(fs.readFileSync(workingDirectory + mappingsPath, "utf-8"));
        const body = {
            properties
        };
        const template = {
            index,
            body
        };
        return this.client.indices.putMapping(template);
    }


}