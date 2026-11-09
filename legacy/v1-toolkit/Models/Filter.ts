export enum FilterOperator {
    Equals = 'equals',
    NotEquals = 'not_equals',
    GreaterThan = 'greater_than',
    GreaterThanOrEqualTo = 'greater_than_or_equal_to',
    LessThan = 'less_than',
    LessThanOrEqualTo = 'less_than_or_equal_to',
    In = 'in',
    Contains = 'contains',
    StartsWith = 'starts_with',
    EndsWith = 'ends_with',
}

export interface Filter {
    key: string
    value: any
    operator: FilterOperator
}
