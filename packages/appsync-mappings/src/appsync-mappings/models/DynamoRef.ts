import {JsonAnyGetter, JsonClassType, JsonProperty} from "jackson-js";

export class DynamoRef {

  @JsonProperty() @JsonClassType({type: () => [String]})
  path: String;

  @JsonProperty() @JsonClassType({type: () => [Map, [String, String]]})
  args: Map<string, string> = new Map<string, string>();

  @JsonAnyGetter()
  public getArgs(): Map<string, string> {
    return this.args;
  }
}