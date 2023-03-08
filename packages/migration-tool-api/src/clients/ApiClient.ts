import { Client } from '@opensearch-project/opensearch/api/new';
import { DynamoDB } from 'aws-sdk';

export interface ApiClient {
  load(payload): Promise<unknown | null>;

  getClient(): Client | DynamoDB;
}
