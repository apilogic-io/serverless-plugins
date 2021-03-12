import {JsonAlias, JsonClassType, JsonProperty} from "jackson-js";
import {DynamoRef} from "./DynamoRef";

export class DynamoFieldProp {

  @JsonProperty() @JsonClassType({type: () => [String]})
  type: string;

  @JsonProperty() @JsonClassType({type: () => [Boolean]})
  @JsonAlias({values: ['is_key']})
  isKey: Boolean;

  @JsonProperty() @JsonClassType({type: () => [Boolean]})
  list: boolean;

  @JsonProperty() @JsonClassType({type: () => [String]})
  value: string;

  @JsonProperty() @JsonClassType({type: () => [DynamoRef]})
  ref: DynamoRef;
}