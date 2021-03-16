
export interface Infra {
    entity: string
    operations: Operation[]
}

interface Operation {
    type: string
    input: string
    references: Reference[]
}

interface Reference {
    entity: string,
    path: string
}