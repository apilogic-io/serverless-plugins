import {JsonClassType, JsonProperty} from "jackson-js";

export class Infra {

    @JsonProperty() @JsonClassType({type: () => [String]})
    entity: string;

    @JsonProperty() @JsonClassType({type: () => [Array, [Operations]]})
    operations: Operations[]
}

class Operations {

    @JsonProperty() @JsonClassType({type: () => [String]})
    type: string;

    @JsonProperty() @JsonClassType({type: () => [Array, [String]]})
    items: string[];
}