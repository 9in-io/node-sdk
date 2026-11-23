import type {Store} from '@9in-io/sdk/server';

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

const seconds = (ttl: number) => Math.max(1, Math.ceil(ttl));

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
export function redisStore(client: RedisLikeClient, options: RedisStoreOptions = {}): Store {
    const prefix = options.prefix ?? '';
    const k = (key: string) => prefix + key;
    // node-redis has mGet and takes SET options as an object; ioredis takes them as arguments.
    const nodeRedis = typeof client.mGet === 'function';
    return {
        get: (key) => client.get(k(key)),
        async set(key, value, ttl) {
            if (nodeRedis) await client.set(k(key), value, {EX: seconds(ttl)});
            else await client.set(k(key), value, 'EX', seconds(ttl));
        },
        async add(key, value, ttl) {
            const result = nodeRedis ? await client.set(k(key), value, {NX: true, EX: seconds(ttl)}) : await client.set(k(key), value, 'EX', seconds(ttl), 'NX');
            return result === 'OK';
        },
        async delete(key) {
            await client.del(k(key));
        },
        async getMany(keys) {
            if (keys.length === 0) return [];
            const full = keys.map(k);
            return nodeRedis ? client.mGet!(full) : client.mget!(...full);
        },
    };
}

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

function dynamoCommands(): {GetCommand: any; PutCommand: any; DeleteCommand: any} {
    try {
        return require('@aws-sdk/lib-dynamodb');
    } catch {
        throw new Error('9in: dynamoStore needs @aws-sdk/lib-dynamodb (npm install @aws-sdk/client-dynamodb @aws-sdk/lib-dynamodb)');
    }
}

/**
 * A Store on DynamoDB (AWS SDK v3). Reads are strongly consistent; `add` is a conditional put
 * (the key is missing or expired), so it is atomic. DynamoDB deletes expired items lazily, so
 * reads check the expiry themselves.
 *
 *   const store = dynamoStore({client: DynamoDBDocumentClient.from(new DynamoDBClient({})), table: 'nine-state'});
 */
export function dynamoStore(options: DynamoStoreOptions): Store {
    const {GetCommand, PutCommand, DeleteCommand} = dynamoCommands();
    const {client, table} = options;
    const keyName = options.keyAttribute ?? 'pk';
    const valueName = options.valueAttribute ?? 'value';
    const ttlName = options.ttlAttribute ?? 'expires_at';
    const now = () => Math.floor(Date.now() / 1000);
    const item = (key: string, value: string, ttl: number) => ({[keyName]: key, [valueName]: value, [ttlName]: now() + seconds(ttl)});
    const get = async (key: string): Promise<string | null> => {
        const result = await client.send(new GetCommand({TableName: table, Key: {[keyName]: key}, ConsistentRead: true}));
        const found = result?.Item;
        if (!found || typeof found[ttlName] !== 'number' || found[ttlName] <= now()) return null;
        return typeof found[valueName] === 'string' ? found[valueName] : null;
    };
    return {
        get,
        async set(key, value, ttl) {
            await client.send(new PutCommand({TableName: table, Item: item(key, value, ttl)}));
        },
        async add(key, value, ttl) {
            try {
                await client.send(
                    new PutCommand({
                        TableName: table,
                        Item: item(key, value, ttl),
                        ConditionExpression: 'attribute_not_exists(#k) OR #e <= :now',
                        ExpressionAttributeNames: {'#k': keyName, '#e': ttlName},
                        ExpressionAttributeValues: {':now': now()},
                    }),
                );
                return true;
            } catch (error) {
                if ((error as {name?: string})?.name === 'ConditionalCheckFailedException') return false;
                throw error;
            }
        },
        async delete(key) {
            await client.send(new DeleteCommand({TableName: table, Key: {[keyName]: key}}));
        },
        getMany: (keys) => Promise.all(keys.map(get)),
    };
}
