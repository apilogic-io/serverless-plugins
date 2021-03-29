
export interface Infra {
    entity: string
    dataSource: string
    operations: Array<Operation>
}

interface Operation {
    name: string
    type: string
    pipeline: Array<Pipeline>
}

interface Pipeline {
    type: string
    items: Reference[]
}

interface Reference {
    entity: string,
    path: string
    dataSource: string
}