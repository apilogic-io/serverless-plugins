import * as fs from "fs";
import {JsonAlias, JsonClassType, JsonProperty, ObjectMapper} from "jackson-js";
import {EntityField} from "../models/EntityField";

export class ModelParser {

  public readModelInput(index_path: string, index: string): EntityModel {
    const index_location = index_path + "/type/" +  index + ".json";
    const modelsJson = fs.readFileSync(index_location, "utf-8");
    const objectMapper = new ObjectMapper();
    return objectMapper.parse<EntityModel>(modelsJson, {mainCreator: () => [EntityModel]});
  }

  public parseEntity(index_path: string, index: string): void {
    const entityModel = this.readModelInput(index_path, index);

    const keyFields = entityModel.fields.filter(field => field.props.dynamo.isKey);
    const keyDefinition = this.getKeyDefinition(keyFields);
    console.log(keyDefinition);
  }

  // public getDynamoApiProps(fieldName: string, props: Prop) {
  //   if(props.dynamo.isKey) {
  //
  //   }
  // }

  public getKeyDefinition(fields: EntityField[]): {[k: string]: any} {
    const key: {[k: string]: any} = {};
    const obj: {[k: string]: any} = {};
    fields.forEach(field => {
      obj[field.props.dynamo.type as keyof string] = field.props.dynamo.value;
    });
    key["key"] = obj;
    return key;
  }


}

export class EntityModel {

  @JsonProperty() @JsonClassType({type: () => [String]})
  @JsonAlias({values: ['name']})
  name: String;

  @JsonProperty() @JsonClassType({type: () => [Array, [EntityField]]})
  fields: EntityField[];

}