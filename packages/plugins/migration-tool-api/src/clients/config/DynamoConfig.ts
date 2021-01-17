import {DataApiClientModule} from "../../DataApiClientModule";
import ClientConfig = DataApiClientModule.ClientConfig;
import {Config} from "./Config";

export class DynamoConfig implements ClientConfig {
    config?: Config;
    options: object;
}