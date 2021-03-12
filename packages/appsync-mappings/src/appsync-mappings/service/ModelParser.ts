import * as fs from "fs";
import {JsonAlias, JsonClassType, JsonProperty, JsonStringifier, ObjectMapper} from "jackson-js";
import {EntityField} from "../models/EntityField";
import {DynamoFieldProp} from "../models/DynamoFieldProp";
import {JsonStringifierContext} from "jackson-js/dist/@types";

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

  public parseEntity(index_path: string, infras: any[]): void {
    infras.forEach(infra => {
      const entityModel = this.readModelInput(index_path, "type", infra.entity);
      const keyDefinition = this.getKeyDefinitions(entityModel.fields);
      const attributeDefinition =
          this.constructAttributeDefinitions(index_path,
              entityModel.fields,
              new Map<string, string>(),
              0,
              false);
      this.putItem(keyDefinition, attributeDefinition);
    })
  }

  private putItem(key: {[k: string]: any}, attributes: {[k: string]: any}) : {[k: string]: any} {
    const puItem: {[k: string]: any} = {};
    puItem["key"] = key;
    puItem["attributeValues"] = attributes;
    const putMap = new Map<string, any>(Object.entries(puItem));
    const mapperContext: JsonStringifierContext = {};
    console.log(new JsonStringifier().stringify(putMap, mapperContext));
    return puItem;
  }

  private constructAttributeDefinitions(index_path: string,
                                        fields: EntityField[],
                                        args: Map<string, string>,
                                        parentRec: number,
                                        parentIsList: boolean): {[k: string]: any} {
    const value: {[k: string]: any} = {};
    let rec = 0;
    const forEachBuilder = "";
    fields.forEach(field => {
      const dynamoField = field.props.dynamo;
       value[field.fieldName] = this.constructDynamoAttributeValues(parentRec,
           parentIsList,
           field.fieldName,
           index_path,
           dynamoField,
           args,
           rec,
           forEachBuilder);
       rec = rec + 1;
    })
    return value;
  }

  private constructDynamoAttributeValues(parentRec: number,
                                         parentIsList: boolean,
                                         key: string,
                                         index_path: string,
                                         attribute: DynamoFieldProp,
                                         args: Map<string, string>,
                                         rec: number,
                                         foreEachBuilder: string
                                         ): {[k: string]: any} {
    if(attribute.ref === undefined) {
      attribute.value = this.replaceValuePlaceHolders(attribute.value, args);
      return this.getDynamoSimplePropertyDefinition(key, parentRec, parentIsList, rec, attribute);
    }
    else {
      const entityModel = this.readModelInput(index_path, attribute.ref.path, key);
        // @ts-ignore
        attribute.ref.args.forEach((value: string, key: string) => {
          attribute.ref.args.set(key, this.replaceValuePlaceHolders(value, args));
        })
      return this.getDynamoComplexPropertyDefinition(parentRec, key, attribute,
          this.constructAttributeDefinitions(index_path, entityModel.fields, attribute.ref.args, rec, attribute.list), rec);
    }
  }

  private replaceValuePlaceHolders(value: string, args: Map<string, string>) :string {
    const placeholders = value.match(/__(.*?)__/g)
    if (placeholders != null) {
      placeholders.forEach(placeholder => {
        var phText = placeholder.substring(2, placeholder.length - 2);
        //phText = Name
        // @ts-ignore
        if (args.get(phText)) {
          // @ts-ignore
          value = value.replace(placeholder, args.get(phText));
        }
      })
    }
    return value;
  }

  private getKeyDefinitions(fields: EntityField[]): {[k: string]: any} {
    const keyFields = fields.filter(field => field.props.dynamo.isKey);
    const key: {[k: string]: any} = {};
    const obj: {[k: string]: any} = {};
    keyFields.forEach(field => {
      obj[field.props.dynamo.type as keyof string] = field.props.dynamo.value;
      key[field.fieldName as keyof string] = obj;
    });
    return key;
  }

  private getDynamoSimplePropertyDefinition(key: string,
                                            parentRec: number,
                                            parentIsList: boolean,
                                            rec: number,
                                            attribute: DynamoFieldProp,
                                            forEachBuilder: string
  ) : {[k: string]: any} {
    const obj: { [k: string]: any } = {};
    if(attribute.list) {
      // const list = attribute.value;
      // const obList = list.map((el: string) => {
      //   const objectList: { [k: string]: any } = {};
      //   objectList[attribute.type as keyof string] =  el;
      //   return objectList;
      // });

        const objectList: { [k: string]: any } = {};
        objectList[attribute.type as keyof string] =  "$entry_" + rec;
        let val = attribute.value;
        if(parentRec !== rec && parentIsList) {
          val = "$entry_" + parentRec + "." + key;
        }
        const forEachL = "#foreach($entry_" + rec + " in " + val + ")\n" +
           JSON.stringify(objectList) + "\n" +
          " #end"
        obj["L"] = forEachL
    }
    else {
      obj[attribute.type as keyof string] = attribute.value;
    }
    return obj;
  }

  private getDynamoComplexPropertyDefinition(parentRec: number, keyVal: string, attribute: DynamoFieldProp, value: {[k: string]: any}, rec: number) : {[k: string]: any} {
    const obj = new Map<string, any>();
    const objL = new Map<string, any>();
    obj.set(attribute.type, value);
    if(attribute.list) {
      if(attribute.type === "M") {
        const attr = new Map<string, any>(Object.entries(obj.get(attribute.type)));
        attr.forEach((v: any, k: string) => {
          if (obj.get(attribute.type)[k] !== undefined) {
            const key = k;
            if (obj.get(attribute.type)[k] instanceof Map) {
              obj.get(attribute.type)[k].forEach((sv:any, sk: any) => {
                if (typeof sv !== 'string') {
                  const svMap = new Map<string, any>(Object.entries(sv));
                  svMap.forEach((svmv: any, svmk: any) => {
                    ["S", "B", "N"].filter(code =>  svmv[code] !== undefined).forEach(code => {
                      svmv[code] = "$entry_" + rec + "." + key + "." + svmk;
                    })
                  });
                  obj.get(attribute.type)[k].set(sk, svMap);
                }
              })

            }
            else {
              console.log(parentRec);
              const simpleVal = new Map<string, any>(Object.entries(obj.get(attribute.type)[k]));
              simpleVal.forEach((sv: any, sk: string) => {
                if (sk !== "M" && sk !== "L" ) {
                  simpleVal.set(sk, "$entry_" + rec + "." + key);
                  attr.set(key, simpleVal);
                  console.log(sv);
                } else {
                  console.log(v);
                }
              });
            }
          }
        });
        obj.set(attribute.type, attr);
      }
      const mapperContext: JsonStringifierContext = {};
      const forEachL = "#foreach($entry_" + rec + " in $context.arguments." + keyVal + ")\n" +
          new JsonStringifier().stringify(obj, mapperContext) +
          " #end"
      objL.set("L", forEachL);
      return objL;
    }
    return obj;
  }

}

export class EntityModel {

  @JsonProperty() @JsonClassType({type: () => [String]})
  @JsonAlias({values: ['name']})
  name: String;

  @JsonProperty() @JsonClassType({type: () => [Array, [EntityField]]})
  fields: EntityField[];

}