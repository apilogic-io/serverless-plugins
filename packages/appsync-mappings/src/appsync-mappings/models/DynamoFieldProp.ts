import {JsonAlias, JsonClassType, JsonProperty} from "jackson-js";

export class DynamoFieldProp {

  @JsonProperty() @JsonClassType({type: () => [String]})
  type: string;

  @JsonProperty() @JsonClassType({type: () => [Boolean]})
  @JsonAlias({values: ['is_key']})
  isKey: boolean;

  @JsonProperty() @JsonClassType({type: () => [Boolean]})
  list: boolean;

  @JsonProperty() @JsonClassType({type: () => [Boolean]})
  fromStash: boolean;

  @JsonProperty() @JsonClassType({type: () => [String]})
  ref: string;
}