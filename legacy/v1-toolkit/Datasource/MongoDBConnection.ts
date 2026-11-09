import {Datasource} from '.';
import {Connection} from './Connection';
import {Models} from "../Models";
import {Db, UpdateFilter} from 'mongodb';

export class MongoDBConnection extends Connection {
    protected db: Db;

    constructor(db: Db) {
        super();
        this.db = db;
    }

    async query(schema: string, filter: Models.FilterGroup): Promise<Datasource.Item[]> {
        const query = this.buildFilterQuery(filter);
        return this.db.collection(schema).find(query).toArray();
    }

    async insert(schema: string, item: Datasource.Item): Promise<Datasource.Item> {
        const result = await this.db.collection(schema).insertOne(item);
        return {...item, _id: result.insertedId};
    }

    async update(schema: string, criteria: Models.FilterGroup, item: Datasource.Item): Promise<void> {
        const query = this.buildFilterQuery(criteria);
        const update: UpdateFilter<any> = {$set: item};
        await this.db.collection(schema).updateMany(query, update);
    }

    async upsert(schema: string, criteria: Models.FilterGroup, item: Datasource.Item): Promise<void> {
        const query = this.buildFilterQuery(criteria);
        const update: UpdateFilter<any> = {$set: item};
        await this.db.collection(schema).updateMany(query, update, {upsert: true});
    }

    async delete(schema: string, criteria: Models.FilterGroup): Promise<void> {
        const query = this.buildFilterQuery(criteria);
        await this.db.collection(schema).deleteMany(query);
    }

    private buildFilterQuery(filterGroup: Models.FilterGroup): Record<string, any> {
        const query: Record<string, any> = {};

        filterGroup.forEach(filter => {
            if (Array.isArray(filter)) {
                Object.assign(query, this.buildFilterQuery(filter));
            } else {
                const {key, operator, value} = filter;
                switch (operator) {
                    case Models.FilterOperator.Equals:
                        query[key] = value;
                        break;
                    case Models.FilterOperator.NotEquals:
                        query[key] = {$ne: value};
                        break;
                    case Models.FilterOperator.GreaterThan:
                        query[key] = {$gt: value};
                        break;
                    case Models.FilterOperator.GreaterThanOrEqualTo:
                        query[key] = {$gte: value};
                        break;
                    case Models.FilterOperator.LessThan:
                        query[key] = {$lt: value};
                        break;
                    case Models.FilterOperator.LessThanOrEqualTo:
                        query[key] = {$lte: value};
                        break;
                    case Models.FilterOperator.In:
                        query[key] = {$in: value};
                        break;
                    case Models.FilterOperator.Contains:
                        query[key] = {$regex: value, $options: 'i'}; // Case insensitive search
                        break;
                    case Models.FilterOperator.StartsWith:
                        query[key] = {$regex: `^${value}`, $options: 'i'};
                        break;
                    case Models.FilterOperator.EndsWith:
                        query[key] = {$regex: `${value}$`, $options: 'i'};
                        break;
                    default:
                        throw new Error(`Unsupported operator: ${operator}`);
                }
            }
        });

        return query;
    }
}
