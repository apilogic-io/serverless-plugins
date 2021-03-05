import {EntityField} from "./EntityField";
import {JsonAlias, JsonClassType, JsonProperty} from "jackson-js";

export class EntityModel {

  @JsonProperty() @JsonClassType({type: () => [String]})
  @JsonAlias({values: ['entity_name']})
  entityName: String;

  @JsonProperty() @JsonClassType({type: () => [String]})
  @JsonAlias({values: ['entity_index']})
  entityIndex: String;

  @JsonProperty() @JsonClassType({type: () => [Array, [EntityField]]})
  fields: EntityField[];

}