import {Datasource} from '.';
import {Connection} from './Connection';
import {Models} from "../Models";
import {DynamoDB} from 'aws-sdk';
import {ExpressionAttributeValueMap} from "aws-sdk/clients/dynamodb";

export class DynamoDBConnection extends Connection {
    protected client: DynamoDB.DocumentClient;

    constructor(client: DynamoDB.DocumentClient) {
        super();
        this.client = client;
    }

    async query(schema: string, filter: Models.FilterGroup): Promise<Datasource.Item[]> {
        const {expression, values} = this.buildFilterExpression(filter);

        const params: DynamoDB.DocumentClient.QueryInput = {
            TableName: schema,
            KeyConditionExpression: expression,
            ExpressionAttributeValues: values,
        };

        const result = await this.client.query(params).promise();
        return result.Items as Datasource.Item[];
    }

    async insert(schema: string, item: Datasource.Item): Promise<Datasource.Item> {
        const params: DynamoDB.DocumentClient.PutItemInput = {
            TableName: schema,
            Item: item,
        };

        await this.client.put(params).promise();
        return item;
    }

    async update(schema: string, filter: Models.FilterGroup, item: Datasource.Item): Promise<void> {
        const updateExpressions: string[] = [];
        const expressionAttributeNames: { [key: string]: string } = {};
        const expressionAttributeValues: ExpressionAttributeValueMap = {};

        Object.entries(item).forEach(([key, value], index) => {
            const attributeKey = `#attr${index}`;
            const attributeValueKey = `:value${index}`;

            updateExpressions.push(`${attributeKey} = ${attributeValueKey}`);
            expressionAttributeNames[attributeKey] = key;
            expressionAttributeValues[attributeValueKey] = value;
        });

        const {expression, values} = this.buildFilterExpression(filter);

        const params: DynamoDB.DocumentClient.UpdateItemInput = {
            TableName: schema,
            Key: values,
            UpdateExpression: `SET ${updateExpressions.join(', ')}`,
            ExpressionAttributeNames: expressionAttributeNames,
            ExpressionAttributeValues: {...expressionAttributeValues, ...values},
            ConditionExpression: expression,
        };

        await this.client.update(params).promise();
    }

    async upsert(schema: string, filter: Models.FilterGroup, item: Datasource.Item): Promise<void> {
        await this.insert(schema, item);
    }

    async delete(schema: string, filter: Models.FilterGroup): Promise<void> {
        const {expression, values} = this.buildFilterExpression(filter);

        const params: DynamoDB.DocumentClient.DeleteItemInput = {
            TableName: schema,
            Key: values,
            ConditionExpression: expression,
        };

        await this.client.delete(params).promise();
    }

    protected buildFilterExpression(filterGroup: Models.FilterGroup, parentIndex = 0): {
        expression: string,
        values: ExpressionAttributeValueMap
    } {
        let index = parentIndex;
        let expressions: string[] = [];
        let expressionValues: ExpressionAttributeValueMap = {};

        for (const filter of filterGroup) {
            if (Array.isArray(filter)) {
                const nested = this.buildFilterExpression(filter, index);
                expressions.push(`(${nested.expression})`);
                expressionValues = {...expressionValues, ...nested.values};
                index += Object.keys(nested.values).length;
            } else {
                const keyWithIndex = `${filter.key}${index}`;
                const {condition, expressionValue} = this.mapOperator(filter.operator, keyWithIndex, filter.value);
                expressions.push(condition.replace(keyWithIndex, filter.key));
                expressionValues = {
                    ...expressionValues, ...Object.entries(expressionValue).reduce((acc, [k, v]) => {
                        acc[k.replace(keyWithIndex, filter.key)] = v;
                        return acc;
                    }, {} as ExpressionAttributeValueMap)
                };
                index++;
            }
        }

        return {
            expression: expressions.join(' AND '),
            values: expressionValues,
        };
    }

    protected mapOperator(operator: Models.FilterOperator, key: string, value: any): {
        condition: string,
        expressionValue: ExpressionAttributeValueMap
    } {
        switch (operator) {
            case Models.FilterOperator.Equals:
                return {condition: `${key} = :${key}`, expressionValue: {[`:${key}`]: value}};
            case Models.FilterOperator.NotEquals:
                return {condition: `${key} <> :${key}`, expressionValue: {[`:${key}`]: value}};
            case Models.FilterOperator.GreaterThan:
                return {condition: `${key} > :${key}`, expressionValue: {[`:${key}`]: value}};
            case Models.FilterOperator.GreaterThanOrEqualTo:
                return {condition: `${key} >= :${key}`, expressionValue: {[`:${key}`]: value}};
            case Models.FilterOperator.LessThan:
                return {condition: `${key} < :${key}`, expressionValue: {[`:${key}`]: value}};
            case Models.FilterOperator.LessThanOrEqualTo:
                return {condition: `${key} <= :${key}`, expressionValue: {[`:${key}`]: value}};
            case Models.FilterOperator.In:
                const inKeys = value.map((v: any, i: number) => `:${key}${i}`).join(', ');
                const inExpressionValues = value.reduce((acc: ExpressionAttributeValueMap, v: any, i: number) => {
                    acc[`:${key}${i}`] = v;
                    return acc;
                }, {});
                return {condition: `${key} IN (${inKeys})`, expressionValue: inExpressionValues};
            case Models.FilterOperator.Contains:
                return {condition: `contains(${key}, :${key})`, expressionValue: {[`:${key}`]: value}};
            case Models.FilterOperator.StartsWith:
                return {condition: `begins_with(${key}, :${key})`, expressionValue: {[`:${key}`]: value}};
            case Models.FilterOperator.EndsWith:
            default:
                throw new Error(`Unsupported operator: ${operator}`);
        }
    }
}
