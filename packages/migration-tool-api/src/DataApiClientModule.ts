import {ESClient} from "./clients/ESClient";
import {Config} from "./clients/config/Config";
import {ApiClient} from "./clients/ApiClient";
import {DynamoClient} from "./clients/dynamo/DynamoClient";

export namespace DataApiClientModule {

    export interface ClientConfig {
        clientType?: string;
        config?: Config;
    }

    export class DataApiClient {
        public readonly apiClient: ApiClient;
        constructor (clientConfig) {
            this.apiClient = DataApiClientModule.DataApiClient.init(clientConfig);
        }

        private static init(clientConfig: ClientConfig): ApiClient {
            const clientType = clientConfig.clientType;
            switch (clientType) {
                case 'AMAZON_ELASTICSEARCH': return new ESClient(clientConfig);
                case "AMAZON_DYNAMODB": return new DynamoClient({config: clientConfig, options: ""});
            }
        }

        public async fetchMigrations(): Promise<any> {
            return this.apiClient.load(DataApiClientModule.DataApiClient.getFetchPayLoad());

        }

        private static getFetchPayLoad() {
            return {
                "version" : "2017-02-28",
                "operation" : "Scan",
            }
        }

    }
}

