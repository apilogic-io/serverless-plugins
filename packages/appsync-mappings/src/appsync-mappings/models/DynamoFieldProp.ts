import {JsonAlias, JsonClassType, JsonProperty} from "jackson-js";
import {DynamoRef} from "./DynamoRef";

export class DynamoFieldProp {

  @JsonProperty() @JsonClassType({type: () => [String]})
  type: String;

  @JsonProperty() @JsonClassType({type: () => [Boolean]})
  @JsonAlias({values: ['is_key']})
  isKey: Boolean;

  @JsonProperty() @JsonClassType({type: () => [Boolean]})
  list: Boolean;

  @JsonProperty() @JsonClassType({type: () => [String]})
  value: String;

  @JsonProperty() @JsonClassType({type: () => [DynamoRef]})
  ref: DynamoRef;
}