import {ApiClient} from "../ApiClient";
import {DynamoDB} from 'aws-sdk';
import {nullIfEmpty, unmarshall} from './utils';

export class DynamoClient implements ApiClient {
    private client: DynamoDB;
    private tableName: string;

    constructor({config, options}) {
        const tableName = config.config.tableName;
        if (!tableName) {
            throw new Error(`Invalid DynamoDBConfig ${JSON.stringify(config, null, 4)}`);
        }
        this.tableName = tableName;
        this.client = new DynamoDB({ ...config.config, ...options });
    }

    public getClient():DynamoDB {
        return this.client;
    }

    // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
    public async load(payload): Promise<unknown | null> {
        try {
            switch (payload.operation) {
                case 'GetItem':
                    return await this.getItem(payload);
                case 'PutItem':
                    return await this.putItem(payload);
                case 'UpdateItem':
                    return await this.updateItem(payload);
                case 'DeleteItem':
                    return await this.deleteItem(payload);
                case 'Query':
                    return await this.query(payload);
                case 'Scan':
                    return await this.scan(payload);
                case 'TransactWriteItems':
                    return await this.transactWriteItem(payload);
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

    private async getItem(payload: any): Promise<unknown | null> {
        const { consistentRead = false } = payload;
        const result = await this.client
            .getItem({
                TableName: this.tableName,
                Key: payload.key,
                ConsistentRead: consistentRead,
            })
            .promise();

        if (!result.Item) return null;
        return unmarshall(result.Item, true);
    }

    private async putItem(payload): Promise<unknown | null> {
        const params = this.getPutAttributes(payload);
        await this.client
            .putItem(params.params)
            .promise();

        // put does not return us anything useful so we need to fetch the object.
        return this.getItem({key: params.key , consistentRead: true });
    }

    private getPutAttributes(payload:any) {
        const {
            key,
            attributeValues,
            condition: {
                // we only provide limited support for condition update expressions.
                expression = null,
                expressionNames = null,
                expressionValues = null,
            } = {},
        } = payload;
        return {
            key,
            params: {
                TableName: payload.table !== undefined ? payload.table: this.tableName,
                Item: {
                    ...attributeValues,
                    ...key,
                },
                ConditionExpression: expression,
                ExpressionAttributeNames: expressionNames,
                ExpressionAttributeValues: expressionValues,
            }
        }
    }

    private async transactWriteItem(payload): Promise<unknown | null> {

        const transactionParams = payload.transactItems.map(transaction => {
            switch (transaction.operation) {
                case 'PutItem':
                default: return {
                    Put : this.getPutAttributes(transaction).params
                }
            }
        });
        console.log(transactionParams);
        await this.client
            .transactWriteItems({
                TransactItems: transactionParams
            }).promise();

        // put does not return us anything useful so we need to fetch the object.
        return null;
    }

    private async query({ query: keyCondition, filter, index, nextToken, limit, scanIndexForward = true, consistentRead = false, select }) {
        keyCondition = keyCondition || { expression: null };
        filter = filter || { expression: null };
        const params = {
            TableName: this.tableName,
            KeyConditionExpression: keyCondition.expression,
            FilterExpression: filter.expression,
            ExpressionAttributeValues: nullIfEmpty({
                ...(filter.expressionValues || {}),
                ...(keyCondition.expressionValues || {}),
            }),
            ExpressionAttributeNames: nullIfEmpty({
                ...(filter.expressionNames || {}),
                ...(keyCondition.expressionNames || {}),
            }),
            ExclusiveStartKey: nextToken ? JSON.parse(Buffer.from(nextToken, 'base64').toString()) : null,
            IndexName: index,
            Limit: limit,
            ConsistentRead: consistentRead,
            ScanIndexForward: scanIndexForward,
            Select: select || 'ALL_ATTRIBUTES',
        };
        const { Items: items, ScannedCount: scannedCount, LastEvaluatedKey: resultNextToken = null } = await this.client
            .query(params as any)
            .promise();

        return {
            items: items.map(item => unmarshall(item, true)),
            scannedCount,
            nextToken: resultNextToken ? Buffer.from(JSON.stringify(resultNextToken)).toString('base64') : null,
        };
    }

    private async updateItem(payload) {
        const { key, update = {}, condition = {} } = payload;
        const params: any = {
            TableName: this.tableName,
            Key: key,
            UpdateExpression: update.expression,
            ConditionExpression: condition.expression,
            ReturnValues: 'ALL_NEW',
            ExpressionAttributeNames: nullIfEmpty({
                ...(condition.expressionNames || {}),
                ...(update.expressionNames || {}),
            }),
            ExpressionAttributeValues: nullIfEmpty({
                ...(condition.expressionValues || {}),
                ...(update.expressionValues || {}),
            }),
        };
        const { Attributes: updated } = await this.client.updateItem(params).promise();
        return unmarshall(updated, true);
    }

    private async deleteItem(payload) {
        const {
            key,
            condition: {
                // we only provide limited support for condition update expressions.
                expression = null,
                expressionNames = null,
                expressionValues = null,
            } = {},
        } = payload;
        const { Attributes: deleted } = await this.client
            .deleteItem({
                TableName: this.tableName,
                Key: key,
                ReturnValues: 'ALL_OLD',
                ConditionExpression: expression,
                ExpressionAttributeNames: expressionNames,
                ExpressionAttributeValues: expressionValues,
            })
            .promise();

        return unmarshall(deleted, true);
    }
    private async scan(payload) {
        const { filter, index, limit, consistentRead = false, nextToken, select, totalSegments, segment } = payload;

        const params = {
            TableName: this.tableName,
            ExclusiveStartKey: nextToken ? JSON.parse(Buffer.from(nextToken, 'base64').toString()) : null,
            IndexName: index,
            Limit: limit,
            ConsistentRead: consistentRead,
            Select: select || 'ALL_ATTRIBUTES',
            Segment: segment,
            TotalSegments: totalSegments,
        };
        if (filter) {
            Object.assign(params, {
                FilterExpression: filter.expression,
                ExpressionAttributeNames: nullIfEmpty({
                    ...(filter.expressionNames || undefined),
                }),
                ExpressionAttributeValues: {
                    ...(filter.expressionValues || undefined),
                },
            });
        }
        const { Items: items, ScannedCount: scannedCount, LastEvaluatedKey: resultNextToken = null } = await this.client.scan(params).promise();

        return {
            items: items.map(item => unmarshall(item, true)),
            scannedCount,
            nextToken: resultNextToken ? Buffer.from(JSON.stringify(resultNextToken)).toString('base64') : null,
        };
    }
}
