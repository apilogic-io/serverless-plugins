import { DynamoDBClientConfig } from '@aws-sdk/client-dynamodb';
import { DynamodbService } from '@travelhubx/aws/src/services/dynamodb/dynamodb.service';
import { ApiClient } from '../ApiClient';

export class DynamoClient extends DynamodbService<unknown> implements ApiClient {
  protected table;

  constructor({ config, options }) {
    super();
    const tableName = config.config.tableName;
    if (!tableName) {
      throw new Error(`Invalid DynamoDBConfig ${JSON.stringify(config, null, 4)}`);
    }
    this.table = tableName;
  }

  public async load(payload): Promise<unknown | null> {
    try {
      switch (payload.operation) {
        case 'GetItem':
          return await this.getItemById(payload);
        case 'PutItem':
          return await this.putItem(payload);
        case 'UpdateItem':
          return await this.updateItem(payload);
        case 'Scan':
          return await this.scan(payload);
        default:
          throw new Error(`Unknown operation name: ${payload.operation}`);
      }
    } catch (e) {
      if (e.code) {
        console.log('Error while executing Local DynamoDB');
        console.log(JSON.stringify(payload, null, 4));
        console.log(e);
        e.extensions = { errorType: 'DynamoDB:' + e.code };
      }
      throw e;
    }
  }
}
