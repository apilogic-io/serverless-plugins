import {DynamoFieldProp} from "./DynamoFieldProp";
import {JsonClassType, JsonProperty} from "jackson-js";

export class Prop {

  @JsonProperty() @JsonClassType({type: () => [Map, [String, String]]})
  appsync: Map<string, string> = new Map<string, string>();

  @JsonProperty() @JsonClassType({type: () => [DynamoFieldProp]})
  dynamo: DynamoFieldProp;

  @JsonProperty() @JsonClassType({type: () => [DynamoFieldProp]})
  es: Map<string, string> = new Map<string, string>();

}