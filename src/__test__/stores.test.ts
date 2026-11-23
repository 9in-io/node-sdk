import {afterAll, beforeAll, describe, expect, it} from '@jest/globals';
import {createServer} from 'node:net';
import {CreateTableCommand, DescribeTableCommand, DynamoDBClient} from '@aws-sdk/client-dynamodb';
import {DynamoDBDocumentClient} from '@aws-sdk/lib-dynamodb';
import {createClient} from 'redis';
import IORedis from 'ioredis';
import {createTokenVerifier, dynamoStore, processEventOnce, redisStore, type EventStore} from '../index';
import {fakeTenant} from './helpers';

const RUN = `test-9in-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}:`;
const REDIS_URL = process.env.NINE_TEST_REDIS_URL ?? 'redis://127.0.0.1:6379/15';

async function redisAvailable(): Promise<boolean> {
    const client = createClient({url: REDIS_URL, socket: {connectTimeout: 1000, reconnectStrategy: false}});
    client.on('error', () => undefined);
    try {
        await client.connect();
        await client.ping();
        await client.quit();
        return true;
    } catch {
        return false;
    }
}

/** The behaviour every Store must have, whatever is behind it. */
function storeContract(name: string, make: () => EventStore) {
    describe(`${name}: the Store contract`, () => {
        it('gets, sets, deletes and expires', async () => {
            const store = make();
            expect(await store.get('missing')).toBeNull();
            await store.set('k', 'v', 60);
            expect(await store.get('k')).toBe('v');
            await store.set('k', 'w', 60);
            expect(await store.get('k')).toBe('w');
            await store.delete('k');
            expect(await store.get('k')).toBeNull();
            await store.set('short', 'x', 1);
            await new Promise((r) => setTimeout(r, 2100));
            expect(await store.get('short')).toBeNull();
        });

        it('adds atomically, including over an expired key', async () => {
            const store = make();
            const results = await Promise.all(Array.from({length: 10}, () => store.add('race', 'mine', 60)));
            expect(results.filter(Boolean)).toHaveLength(1);
            expect(await store.add('race', 'again', 60)).toBe(false);
            await store.set('old', 'x', 1);
            await new Promise((r) => setTimeout(r, 2100));
            expect(await store.add('old', 'new', 60)).toBe(true);
            expect(await store.get('old')).toBe('new');
        });

        it('reads several keys at once', async () => {
            const store = make();
            await store.set('a', '1', 60);
            await store.set('c', '3', 60);
            expect(await store.getMany!(['a', 'b', 'c'])).toEqual(['1', null, '3']);
            expect(await store.getMany!([])).toEqual([]);
        });

        it('processes a webhook once', async () => {
            const store = make();
            let runs = 0;
            const handler = async () => {
                runs++;
                return 'done';
            };
            expect((await processEventOnce(store, 'evt_1', handler)).status).toBe('processed');
            expect((await processEventOnce(store, 'evt_1', handler)).status).toBe('duplicate');
            expect(runs).toBe(1);
        });

        it('carries a revocation from one verifier to another', async () => {
            const store = make();
            const tenant = fakeTenant();
            const sign = tenant.keyFor('ES256');
            const revoked = new Set<string>();
            tenant.onIntrospect((token) => (revoked.has(token) ? {active: false} : {active: true, ...tenant.claimsFor({sid: 'sid_shared'})}));
            const options = {issuer: tenant.issuer, audience: 'https://api.acme.test', clientId: 'api', clientSecret: 'secret', fetch: tenant.fetch, store};
            const a = createTokenVerifier(options);
            const b = createTokenVerifier(options);
            const token = sign({sid: 'sid_shared', jti: 'jti_shared'});
            await a.verify(token);
            await b.verify(token);
            expect(tenant.introspected).toHaveLength(1);
            revoked.add(token);
            await a.verify(token); // cached until 9in tells us
            expect(await b.handleEvent({event_type: 'session.revoked', data: {sid: 'sid_shared'}})).toBe(1);
            await expect(a.verify(token)).rejects.toMatchObject({code: 'invalid_token'});
        });
    });
}

describe('redisStore', () => {
    let available = false;
    const clients: {quit(): Promise<unknown>}[] = [];
    let nodeRedis: ReturnType<typeof createClient>;
    let ioredis: IORedis;

    beforeAll(async () => {
        available = await redisAvailable();
        if (!available) return;
        nodeRedis = createClient({url: REDIS_URL});
        await nodeRedis.connect();
        ioredis = new IORedis(REDIS_URL);
        clients.push(nodeRedis, ioredis);
    });

    afterAll(async () => {
        if (!available) return;
        const keys = await ioredis.keys(`${RUN}*`);
        if (keys.length) await ioredis.del(...keys);
        await Promise.all(clients.map((c) => c.quit()));
    });

    it('has a Redis to talk to (set NINE_TEST_REDIS_URL, or run one on 127.0.0.1:6379)', () => {
        if (!available) console.warn(`redisStore tests skipped: no Redis at ${REDIS_URL}`);
        expect(true).toBe(true);
    });

    // The contract runs once per client library; each gets its own key prefix.
    const guarded = (name: string, make: () => EventStore) =>
        describe(name, () => {
            storeContract(name, () => {
                if (!available) throw new Error('no Redis');
                return make();
            });
        });
    guarded('node-redis', () => redisStore(nodeRedis, {prefix: `${RUN}nr:${Math.random()}:`}));
    guarded('ioredis', () => redisStore(ioredis, {prefix: `${RUN}io:${Math.random()}:`}));
});

describe('dynamoStore', () => {
    let server: {listen(port: number, cb: (err?: unknown) => void): void; close(cb: () => void): void};
    let client: DynamoDBDocumentClient;
    let table = 0;

    beforeAll(async () => {
        // dynalite: a DynamoDB implementation for tests, in this process.
        const dynalite = require('dynalite');
        server = dynalite({createTableMs: 0, deleteTableMs: 0, updateTableMs: 0});
        const port = await new Promise<number>((resolve) => {
            const probe = createServer().listen(0, () => {
                const {port} = probe.address() as {port: number};
                probe.close(() => resolve(port));
            });
        });
        await new Promise<void>((resolve, reject) => server.listen(port, (err) => (err ? reject(err) : resolve())));
        client = DynamoDBDocumentClient.from(
            new DynamoDBClient({endpoint: `http://127.0.0.1:${port}`, region: 'local', credentials: {accessKeyId: 'x', secretAccessKey: 'x'}}),
        );
    });

    afterAll(async () => {
        client?.destroy();
        await new Promise<void>((resolve) => server.close(() => resolve()));
    });

    async function newTable(): Promise<string> {
        const name = `nine-state-${++table}`;
        await client.send(new CreateTableCommand({TableName: name, KeySchema: [{AttributeName: 'pk', KeyType: 'HASH'}], AttributeDefinitions: [{AttributeName: 'pk', AttributeType: 'S'}], BillingMode: 'PAY_PER_REQUEST'}));
        for (let i = 0; i < 50; i++) {
            const {Table} = await client.send(new DescribeTableCommand({TableName: name}));
            if (Table?.TableStatus === 'ACTIVE') return name;
            await new Promise((r) => setTimeout(r, 20));
        }
        throw new Error(`table ${name} never became active`);
    }

    // One table per test, created lazily (the contract's `make` is synchronous).
    let current: Promise<string> | null = null;
    const lazyStore = (): EventStore => {
        current = newTable();
        const ready = current.then((name) => dynamoStore({client, table: name}));
        return {
            get: async (k) => (await ready).get(k),
            set: async (k, v, t) => (await ready).set(k, v, t),
            add: async (k, v, t) => (await ready).add(k, v, t),
            delete: async (k) => (await ready).delete(k),
            getMany: async (keys) => (await ready).getMany!(keys),
        };
    };
    storeContract('dynalite', lazyStore);

    it('uses the attribute names you choose, and ignores expired items DynamoDB has not deleted yet', async () => {
        const name = await newTable();
        const store = dynamoStore({client, table: name, valueAttribute: 'v', ttlAttribute: 'ttl'});
        await store.set('k', 'v', 1);
        await new Promise((r) => setTimeout(r, 2100));
        expect(await store.get('k')).toBeNull(); // still in the table, but expired
        expect(await store.add('k', 'again', 60)).toBe(true);
    });
});
