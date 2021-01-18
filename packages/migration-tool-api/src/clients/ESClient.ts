import {ApiClient} from "./ApiClient";
import {Client} from 'elasticsearch'
import {DataApiClientModule} from "../DataApiClientModule";
import {EnvironmentCredentials} from 'aws-sdk';
import {httpAWSESClass} from 'http-aws-es';
import ClientConfig = DataApiClientModule.ClientConfig;

export class ESClient implements ApiClient {
    private readonly client: Client;

    constructor(config: ClientConfig) {
        this.client = ESClient.initClient(config)
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


    load(payload): Promise<object | null> {
        return undefined;
    }

    async createIndexAndPutMappings(index: string, template: any): Promise<any> {
        const exists = await this.client.indices.exists({index: index});
        if(!exists) {
            const create = await this.client.indices.create( {index: index});
            if(create) {
                return this.client.indices.putMapping({
                    index,
                    type: 'staff',
                    template
                })
            }
        }


    }

}