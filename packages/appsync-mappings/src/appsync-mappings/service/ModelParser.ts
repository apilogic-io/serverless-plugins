import * as fs from "fs";
import {JsonAlias, JsonClassType, JsonProperty, JsonStringifier, ObjectMapper} from "jackson-js";
import {EntityField} from "../models/EntityField";
import {DynamoFieldProp} from "../models/DynamoFieldProp";
import {JsonClassTypeOptions, JsonStringifierContext} from "jackson-js/dist/@types";
import {Infra} from "../models/Infra";
import {TemplateUtils} from "../utils/TemplateUtils";

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

  public parseEntity(index_path: string, infras: Infra[]): Operation[] {
    //@ts-ignore
    const operation = [];
    infras.forEach(infra => {
      infra.operations.forEach(op => {
        op.pipeline.forEach(pipe => {
          switch (pipe.type) {
            case "PutItem" : {
              const entityModel = this.readModelInput(index_path, "type", infra.entity);
              operation.push({
                path: infra.entity,
                mainType: "Mutation",
                type: "mutations",
                mainDataSource: infra.dataSource,
                dataSource: infra.dataSource,
                template: TemplateUtils.putItem(this.keyAttributes(index_path, infra.entity, entityModel.fields))
              }); break
            }
            case "TransactWriteItems": {
              const  items = [];
              const transactEntities = pipe.items.map(ref => {
                let index = infra.entity;
                if(index !== ref.entity) {
                  index = index + "." + ref.entity;
                }
                const entityModel = this.readModelInput(index_path, "type", ref.entity);
                const keyAttributes = this.keyAttributes(index_path, index, entityModel.fields)
                return {
                  name: op.name,
                  context: ref.entity,
                  type: "mutations",
                  mainType: "Mutation",
                  template: TemplateUtils.putItem(keyAttributes),
                  mainDataSource: infra.dataSource,
                  dataSource: ref.dataSource,
                  keyAttributes: keyAttributes
                }
              })
              const keyAttributes = transactEntities.map(tr => tr.keyAttributes);
              const mainItem = {
                name: op.name,
                func: "create " + infra.entity,
                path: infra.entity,
                context: infra.entity,
                type: "mutations",
                mainType: "Mutation",
                mainDataSource: infra.dataSource,
                dataSource: infra.dataSource,
                template: TemplateUtils.transactWriteItems(keyAttributes)
              }
              items.push(transactEntities)
              items.push(mainItem)
              operation.push(...[mainItem]);
            } break;
            case "GetItem": {
              pipe.items.forEach(item => {
                const pipeItem = {
                  name: op.name,
                  func: "get " + item.path.split("_")[0],
                  type: "query",
                  mainType: "Query",
                  path: item.path.split("_")[0],
                  context: infra.entity,
                  mainDataSource: infra.dataSource,
                  dataSource: item.dataSource,
                  template: TemplateUtils.getItem(item.path, infra.entity, item.entity)
                }
                operation.push(pipeItem);
              })
            }
          }
        })

      });
    })
    //@ts-ignore
    return operation;
  }

  private generateVtl(index_path: string, fields: EntityField[], parent: AttributeDefinition):string {
    this.constructAttributeDefinitions(index_path,
        fields,
        parent);
    this.calculateSelectors(parent);
    return this.generatePreVtlStatements(parent);
  }

  private generatePreVtlStatements(attributeDefinition: AttributeDefinition): string {
    const vrb = "$map_" + attributeDefinition.field_name;
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
                "#end\n";
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

  // @ts-ignore
  private keyAttributes(index_path: string, entity: string, fields: EntityField[]) : KeyAtributesVtl {
    const field_name = entity.replace(".", "_");
    const attributes = {field_name: field_name + "_attr", selector: "$context.arguments." + entity, children: []};
    const keys = {field_name: field_name + "_key", selector: "$context.arguments." + entity, children: []};
    //@ts-ignore
    const keyVtl = this.generateVtl(index_path, fields.filter(ef => ef.props.dynamo.isKey), keys)
    // @ts-ignore
    const attributesVtl = this.generateVtl(index_path, fields, attributes)
    const attr = "$map_" + field_name + "_attr";
    const key = "$map_" + field_name + "_key";
    const vtl = keyVtl + "\n" + attributesVtl + "\n"
    return {key: key, table: entity, attributes: attr, vtl: vtl}
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

class EntityModel {

  @JsonProperty() @JsonClassType(<JsonClassTypeOptions>{type: () => [String]})
  @JsonAlias({values: ['name']})
  name: String;

  @JsonProperty() @JsonClassType(<JsonClassTypeOptions>{type: () => [Array, [EntityField]]})
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

export interface KeyAtributesVtl {
  key: string
  table: string
  attributes: string
  vtl: string
}

export interface Operation {
  name: string,
  mainType: string,
  type: string,
  context: string,
  path: string,
  func: string,
  mainDataSource: string,
  dataSource: string,
  template: string
}