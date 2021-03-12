import {Prop} from "./Prop";
import {JsonAlias, JsonClassType, JsonProperty} from "jackson-js";

export class EntityField {

  @JsonProperty() @JsonClassType({type: () => [String]})
  @JsonAlias({values: ['name']})
  fieldName: string;

  @JsonProperty() @JsonClassType({type: () => [Prop]})
  props: Prop;

}