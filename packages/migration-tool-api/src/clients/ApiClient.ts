export interface ApiClient {
    load(payload): Promise<unknown | null>;
    getClient();
}