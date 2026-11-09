export enum SortOrder {
    Ascending = 'asc',
    Descending = 'desc',
}

export interface Sort {
    key: string
    order: SortOrder
}
