import * as fs from "fs";
import {JsonAlias, JsonClassType, JsonProperty, JsonStringifier, ObjectMapper} from "jackson-js";
import {EntityField} from "../models/EntityField";
import {DynamoFieldProp} from "../models/DynamoFieldProp";
import {JsonStringifierContext} from "jackson-js/dist/@types";
import {Infra} from "../models/Infra";

export class ModelParser {

  public readModelInput(index_path: string, index_type: string,  index: string): EntityModel {
    let index_location = index_path + "/" + index_type + "/" +  index + ".json";
    if(index_type.includes(".json")) {
      index_location = index_path + "/" + index_type;
    }
    const modelsJson = fs.readFileSync(index_location, "utf-8");
    const objectMapper = new ObjectMapper();
    return objectMapper.parse<EntityModel>(modelsJson, {mainCreator: () => [EntityModel]});
  }

  public parseEntity(index_path: string, infras: Infra[]): void {
    infras.forEach(infra => {
      const entityModel = this.readModelInput(index_path, "type", infra.entity);
      // const keyDefinition = this.getKeyDefinitions(entityModel.fields);
      infra.operations.forEach(op => {
        switch (op.type) {
          case "PutItem" : {
            const vtl = this.putItem(this.keyAttributes(index_path, infra, entityModel.fields))
            console.log(vtl);
          }
        }
      })
    })
  }

  //@ts-ignore
  private generateVtl(index_path: string, fields: EntityField[], parent: AttributeDefinition):string {
    this.constructAttributeDefinitions(index_path,
        fields,
        //@ts-ignore
        parent);
    //@ts-ignore
    this.calculateSelectors(parent);
    //@ts-ignore
    return this.generatePreVtlStatements(parent);
  }

  private generatePreVtlStatements(attributeDefinition: AttributeDefinition): string {
    let vrb = "$map_" + attributeDefinition.field_name;
    let vtl = "#set (" + vrb + " = {})\n";
    const mapperContext: JsonStringifierContext = {};
    attributeDefinition.children.forEach(attributeDefinition => {
        if(!attributeDefinition.isList) {
          if(!attributeDefinition.isMap) {
            vtl = vtl +
                "#if(" + attributeDefinition.selector + ")\n" +
                "$util.qr(" + vrb + ".put(\"" + attributeDefinition.field_name + "\", " +
                new JsonStringifier().stringify(ModelParser.generateFieldValue(attributeDefinition.field_type, attributeDefinition.selector), mapperContext) + "))\n" +
                "#end\n";
          }
          else {
            const child = this.generatePreVtlStatements(attributeDefinition)
            const vrbc = "$map_" + attributeDefinition.field_name;

            vtl = vtl + child +
                "#if(!" + vrbc + ".isEmpty())\n" +
                "$util.qr(" + vrb + ".put(\"" + attributeDefinition.field_name + "\",{\"M\":" + vrbc + "}))\n" +
                "#end";
          }
        }
        else {
          const vrbc = "$array_" + attributeDefinition.field_name;
          let foreach;
          if(attributeDefinition.isMap) {
            const child = this.generatePreVtlStatements(attributeDefinition)
            const map = "$map_" + attributeDefinition.field_name + "";
            const map_m = map + "_m";
              foreach = "#set("+ vrbc + " = [])\n" +
                "#foreach($" + attributeDefinition.field_name + "_entry in " + attributeDefinition.selector + ")\n" +
                child + "\n" +
                "#if(!" + map + ".isEmpty())\n" +
                "#set (" + map_m + " = {})\n" +
                "$util.qr(" + map_m + ".put(\"M\", " + map + "))\n" +
                "$util.qr(" + vrbc + ".add(" + map_m +"))\n" +
                "#end\n" +
              "#end\n"
          }
          else {
            const child = ModelParser.generateFieldValue(attributeDefinition.field_type, "$" + attributeDefinition.field_name + "_entry")
            foreach = "#set("+ vrbc + " = [])\n" +
                "#foreach($" + attributeDefinition.field_name + "_entry in " + attributeDefinition.selector + ")\n" +
                "$util.qr(" + vrbc + ".add(" + new JsonStringifier().stringify(child, mapperContext) + "))\n" +
                "#end\n"
          }
          vtl = vtl + foreach +
              "#if(!" + vrbc + ".isEmpty())\n" +
              "$util.qr(" + vrb + ".put(\"" + attributeDefinition.field_name + "\",{\"L\":"  + vrbc + "}))\n" +
              "#end\n"
        }
    })
    return vtl;
  }

  private static generateFieldValue(fieldType: string, value: string): Map<string, string> {
    const cont = new Map<string, string>();
    cont.set(fieldType, value);
    return cont;
  }

  private calculateSelectors(attr: AttributeDefinition): void {
    if(attr.children !== undefined) {
      attr.children.forEach(ch => {
        if(ch.parent !== undefined && ch.parent.isList) {
          ch.selector = "$" + ch.parent.field_name + "_entry." + ch.field_name
        }
        else if(ch.fromStash) {
          ch.selector = "$ctx.stash." + ch.field_name;
        }
        else {
          ch.selector = attr.selector + "." + ch.field_name
        }
        this.calculateSelectors(ch);

      })
    }
  }

  private putItem(keyAtributesVtl: KeyAtributesVtl): string {
    return keyAtributesVtl.vtl + "\n" +
    "{\"version\": \"2018-05-29\",\n" +
        "  \"operation\": \"PutItem\",\n" +
        "\"key\" : $util.toJson(" + keyAtributesVtl.key + "),\n" +
        "\"attributeValues\" : $util.toJson(" + keyAtributesVtl.attributes + ")\n" +
    "}"
  }

  // @ts-ignore
  private keyAttributes(index_path: string, infra: Infra, fields: EntityField[]) : KeyAtributesVtl {
    const attributes = {field_name: infra.entity + "_attr", selector: "$context.arguments." + infra.entity, children: []};
    const keys = {field_name: infra.entity + "_key", selector: "$context.arguments." + infra.entity, children: []};
    //@ts-ignore
    const keyVtl = this.generateVtl(index_path, fields.filter(ef => ef.props.dynamo.isKey), keys)
    //@ts-ignore
    const attributesVtl = this.generateVtl(index_path, fields, attributes)
    const attr = "$map_" + infra.entity + "_attr";
    const key = "$map_" + infra.entity + "_key";
    const vtl = keyVtl + "\n" + attributesVtl + "\n"
    return {key: key, attributes: attr, vtl: vtl}
  }

  private constructAttributeDefinitions(index_path: string,
                                        fields: EntityField[],
                                        parent: AttributeDefinition
                                        ): void {

    fields.map(field => {
      const child = this.constructDynamoAttributeValues(
          field.fieldName,
          index_path,
          field.props.dynamo);
      child.parent = parent;
      parent.children.push(child);
    })
  }

  private constructDynamoAttributeValues(key: string,
                                         index_path: string,
                                         attribute: DynamoFieldProp): AttributeDefinition {
    if(attribute.ref === undefined) {
      // attribute.value = this.replaceValuePlaceHolders(attribute.value, args);
      return ModelParser.getDynamoSimplePropertyDefinition(key, attribute);
    }
    else {
      const entityModel = this.readModelInput(index_path, attribute.ref, key);
      const complexProperty = ModelParser.getDynamoComplexPropertyDefinition(key, attribute);
      this.constructAttributeDefinitions(index_path, entityModel.fields, complexProperty);
      return complexProperty;
    }
  }

  private static getDynamoSimplePropertyDefinition(key: string,
                                                   attribute: DynamoFieldProp) : AttributeDefinition {
    //@ts-ignore
    return {field_name: key,
      // field_value :obj,
      isMap: false,
      fromStash: attribute.fromStash,
      isList: attribute.list,
      field_type: attribute.type};
  }

  private static getDynamoComplexPropertyDefinition(keyVal: string,
                                                    attribute: DynamoFieldProp) : AttributeDefinition {
    //@ts-ignore
    return  {
      field_name: keyVal,
      isMap: true,
      isList: attribute.list,
      field_type: attribute.type,
      children: []};
  }

}

export class EntityModel {

  @JsonProperty() @JsonClassType({type: () => [String]})
  @JsonAlias({values: ['name']})
  name: String;

  @JsonProperty() @JsonClassType({type: () => [Array, [EntityField]]})
  fields: EntityField[];

}

interface AttributeDefinition {
  field_name: string;
  field_type: string;
  isMap: boolean
  isList: boolean
  fromStash: boolean,
  selector: string;
  statement: string;
  parent: AttributeDefinition;
  children: Array<AttributeDefinition>
}

interface KeyAtributesVtl {
  key: string
  attributes: string
  vtl: string
}
