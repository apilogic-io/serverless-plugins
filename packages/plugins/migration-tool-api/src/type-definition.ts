
export interface ApiDataSourceDDBConfig {
    type: 'AMAZON_DYNAMODB';
    config: {
        endpoint: string;
        region?: string;
        accessKeyId?: string;
        secretAccessKey?: string;
        tableName: string;
    };
}