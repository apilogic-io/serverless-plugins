import { DataApiClientModule } from '../../DataApiClientModule';
import { Config } from './Config';
import ClientConfig = DataApiClientModule.ClientConfig;

export class DynamoConfig implements ClientConfig {
  config?: Config;
  options: unknown;
}
