import type { Store } from '@9in-io/sdk/server';
/**
 * Ready-made shared stores for `createTokenVerifier({store})`, `requireAuth({store})`,
 * `processEventOnce(store, …)` and `webhookHandler(…, {dedupe: store})`: what 9in keeps
 * between requests (hybrid answers, revocation markers, processed webhook ids), shared by
 * every instance of your app. Neither needs a dependency of this package: pass the client
 * you already have.
 */
/** The methods of a node-redis (v4, v5) or ioredis client the store uses. */
export interface RedisLikeClient {
    get(key: string): Promise<string | null>;
    set(key: string, value: string, ...args: any[]): Promise<unknown>;
    del(key: string | string[]): Promise<unknown>;
    mGet?(keys: string[]): Promise<(string | null)[]>;
    mget?(...keys: any[]): Promise<(string | null)[]>;
}
export interface RedisStoreOptions {
    /** Prefix for every key (the SDK's keys already start with `9in:`). Default none. */
    prefix?: string;
}
/**
 * A Store on Redis, with a node-redis client (`createClient()`, v4 or v5) or an ioredis client.
 * `add` is `SET NX EX`, so it is atomic. Use a Redis whose eviction policy keeps keys until they
 * expire (`noeviction` or `volatile-*`): a store that drops keys under memory pressure can let a
 * webhook run twice.
 *
 *   const redis = await createClient({url: process.env.REDIS_URL}).connect();
 *   const store = redisStore(redis);
 *   app.use('/api', requireAuth({issuer, audience, clientId, clientSecret, store}));
 */
export declare function redisStore(client: RedisLikeClient, options?: RedisStoreOptions): Store;
/** The part of a `DynamoDBDocumentClient` (`@aws-sdk/lib-dynamodb`) the store uses. */
export interface DynamoDocumentClient {
    send(command: any): Promise<any>;
}
export interface DynamoStoreOptions {
    /** `DynamoDBDocumentClient.from(new DynamoDBClient({...}))`. */
    client: DynamoDocumentClient;
    /** A table whose partition key is `keyAttribute` (a string). Turn on TTL on `ttlAttribute`. */
    table: string;
    /** Default `pk`. */
    keyAttribute?: string;
    /** Default `value`. */
    valueAttribute?: string;
    /** Unix seconds; enable DynamoDB TTL on it so expired items are deleted. Default `expires_at`. */
    ttlAttribute?: string;
}
/**
 * A Store on DynamoDB (AWS SDK v3). Reads are strongly consistent; `add` is a conditional put
 * (the key is missing or expired), so it is atomic. DynamoDB deletes expired items lazily, so
 * reads check the expiry themselves.
 *
 *   const store = dynamoStore({client: DynamoDBDocumentClient.from(new DynamoDBClient({})), table: 'nine-state'});
 */
export declare function dynamoStore(options: DynamoStoreOptions): Store;
