export interface ApiClient {
    load(payload): Promise<object | null>;
}