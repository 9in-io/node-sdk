import {Datasource} from ".";
import {Models} from "../Models";

export abstract class Connection {
    abstract query(schema: any, filter: Models.FilterGroup): Promise<Datasource.Item[]>;

    abstract insert(schema: any, item: Datasource.Item): Promise<Datasource.Item>;

    abstract update(schema: any, filter: Models.FilterGroup, item: Datasource.Item): Promise<void>;

    abstract upsert(schema: any, filter: Models.FilterGroup, item: Datasource.Item): Promise<void>;

    abstract delete(schema: any, filter: Models.FilterGroup): Promise<void>;
}
