"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.redisStore = redisStore;
exports.dynamoStore = dynamoStore;
const seconds = (ttl) => Math.max(1, Math.ceil(ttl));
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
function redisStore(client, options = {}) {
    const prefix = options.prefix ?? '';
    const k = (key) => prefix + key;
    // node-redis has mGet and takes SET options as an object; ioredis takes them as arguments.
    const nodeRedis = typeof client.mGet === 'function';
    return {
        get: (key) => client.get(k(key)),
        async set(key, value, ttl) {
            if (nodeRedis)
                await client.set(k(key), value, { EX: seconds(ttl) });
            else
                await client.set(k(key), value, 'EX', seconds(ttl));
        },
        async add(key, value, ttl) {
            const result = nodeRedis ? await client.set(k(key), value, { NX: true, EX: seconds(ttl) }) : await client.set(k(key), value, 'EX', seconds(ttl), 'NX');
            return result === 'OK';
        },
        async delete(key) {
            await client.del(k(key));
        },
        async getMany(keys) {
            if (keys.length === 0)
                return [];
            const full = keys.map(k);
            return nodeRedis ? client.mGet(full) : client.mget(...full);
        },
    };
}
function dynamoCommands() {
    try {
        return require('@aws-sdk/lib-dynamodb');
    }
    catch {
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
function dynamoStore(options) {
    const { GetCommand, PutCommand, DeleteCommand } = dynamoCommands();
    const { client, table } = options;
    const keyName = options.keyAttribute ?? 'pk';
    const valueName = options.valueAttribute ?? 'value';
    const ttlName = options.ttlAttribute ?? 'expires_at';
    const now = () => Math.floor(Date.now() / 1000);
    const item = (key, value, ttl) => ({ [keyName]: key, [valueName]: value, [ttlName]: now() + seconds(ttl) });
    const get = async (key) => {
        const result = await client.send(new GetCommand({ TableName: table, Key: { [keyName]: key }, ConsistentRead: true }));
        const found = result?.Item;
        if (!found || typeof found[ttlName] !== 'number' || found[ttlName] <= now())
            return null;
        return typeof found[valueName] === 'string' ? found[valueName] : null;
    };
    return {
        get,
        async set(key, value, ttl) {
            await client.send(new PutCommand({ TableName: table, Item: item(key, value, ttl) }));
        },
        async add(key, value, ttl) {
            try {
                await client.send(new PutCommand({
                    TableName: table,
                    Item: item(key, value, ttl),
                    ConditionExpression: 'attribute_not_exists(#k) OR #e <= :now',
                    ExpressionAttributeNames: { '#k': keyName, '#e': ttlName },
                    ExpressionAttributeValues: { ':now': now() },
                }));
                return true;
            }
            catch (error) {
                if (error?.name === 'ConditionalCheckFailedException')
                    return false;
                throw error;
            }
        },
        async delete(key) {
            await client.send(new DeleteCommand({ TableName: table, Key: { [keyName]: key } }));
        },
        getMany: (keys) => Promise.all(keys.map(get)),
    };
}
