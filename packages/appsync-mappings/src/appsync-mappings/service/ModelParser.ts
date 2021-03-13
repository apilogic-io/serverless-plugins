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
      const forEachArray = new Array<ForEachArrayData>();
      const aggregatedSearch = Array<string>();
      const attributeDefinition =
          this.constructAttributeDefinitions(index_path,
              entityModel.fields,
              new Map<string, string>(),
              0,
              false,
              forEachArray,
              aggregatedSearch);
      this.generatePreVtl(attributeDefinition, "", 0);
      const addToMapSet = new Map<string, Array<string>>();
      this.generateDeclarationSet(attributeDefinition, addToMapSet);
      // this.generateAddToMapSet(preVtl, addToMapSet);
      this.forEachArrayArgsToString(forEachArray, aggregatedSearch);
      // const vtlDeclarations = Array.from(declarationSet).join('\n')
      const vtlString = aggregatedSearch.join("\n") + "\n" + this.generateVtlString(addToMapSet);
      // console.log(vtlDeclarations);
      console.log(vtlString);
      this.putItem(keyDefinition, attributeDefinition, aggregatedSearch);

    })
  }

  private generateVtlString(map: Map<string, Array<string>>) :string {
    let vtl = "";
    //@ts-ignore
    map.forEach((v, k) =>{
      vtl = vtl + "#set(" + k + " = []) \n";
    })
    //@ts-ignore
    map.forEach((v, k) =>{
      vtl = vtl + v.join("\n") + "\n";
    })
    return vtl;
  }


  private generateDeclarationSet(attributeDefinitions: Array<AttributeDefinition>, vtlAttrKey: Map<string, Array<string>>): void {
    // const decl = new Map<string, Array<string>>();
    attributeDefinitions.forEach(attributeDefinition => {
      if(attributeDefinition.field_type == 'M' && attributeDefinition.field_value.get("M") !==undefined) {
        //@ts-ignore
        this.generateDeclarationSet(attributeDefinition.field_value.get("M"), vtlAttrKey);
        //@ts-ignore
        vtlAttrKey.get(attributeDefinition.id).push(attributeDefinition.statement);
      }
      else {
        if (vtlAttrKey.get(attributeDefinition.id) === undefined) {
          const array = new Array<string>();
          array.push(attributeDefinition.statement);
          vtlAttrKey.set(attributeDefinition.id, array);
        } else {
          //@ts-ignore
          vtlAttrKey.get(attributeDefinition.id).push(attributeDefinition.statement);
        }
      }
    })
  }

  private generatePreVtl(attributes: Array<AttributeDefinition>, parentField: string, deph: number): any {
    let key = "$attr_" + deph + "_" + parentField;
    return attributes.map(attr => {
      if(attr.field_type !== "M" || attr.field_value.get("L") !== undefined) {
        attr.id = key;
        attr.statement = "#if(" + attr.selector + ")\n" +
            "#set($idx = '\"" + attr.field_name + "\":{\""+ attr.field_type + "\":\"' + " + attr.selector + " + '\"}')\n" +
            key + ".add($idx)\n" +
            "#end\n";
      }
      else {
        deph = deph + 1;
        attr.id = "$attr_" + deph + "_" + attr.field_name;
        attr.parent_id = key;
        this.generatePreVtl(attr.field_value.get("M"), attr.field_name, deph);
        let statement = "";
        statement = statement + "\n" +
            "#if(!" + attr.id + ".isEmpty())\n" +
            "#set($idx = '" + attr.field_name + ":\n{"+ attr.field_type + ":\n{' + " + attr.id + "+ '}\n}')\n" +
            attr.parent_id + ".add($idx)\n" +
            "#end"

        attr.statement = statement;
      }
    });
  }

  // @ts-ignore
  private forEachArrayArgsToString(table: Array<ForEachArrayData>, aggregatedSearch: Array<string>) :string {
    var root = {id:0, parent_id: null, children: []};
    var node_list = { 0 : root};

    table.sort((a, b) => (a.parent_id > b.parent_id) ? 1 : -1)

    for (var i = 0; i < table.length; i++) {
      //@ts-ignore
      node_list[table[i].id] = table[i];
    }

    for (var i = 0; i < table.length; i++) {
      //@ts-ignore
      if(node_list[table[i].parent_id] === undefined) {
        //@ts-ignore
        node_list[0].children.push(node_list[table[i].id]);
      }
      else {
        //@ts-ignore
        node_list[table[i].parent_id].children.push(node_list[table[i].id]);
      }
    }

    this.getInnerForEachStatements(node_list[0].children, aggregatedSearch);
    console.log(root);
    // console.log(node_list);
  }

  private getInnerForEachStatements(statements: Array<ForEachArrayData>, aggregatedForEach: Array<string>): void{
    statements.forEach(el => {
      if(el.statement) {
        aggregatedForEach.push(el.statement)
        if(el.children.length === 0) {
          aggregatedForEach.push("\n#end")
        }
        else {
          this.getInnerForEachStatements(el.children, aggregatedForEach);
          aggregatedForEach.push("\n#end")
        }
      }
    })
  }


  private putItem(key: {[k: string]: any}, attributes: {[k: string]: any}, forEachArray: Array<string>) : {[k: string]: any} {
    const puItem: {[k: string]: any} = {};
    puItem["key"] = key;
    puItem["attributeValues"] = attributes;
    const putMap = new Map<string, any>(Object.entries(puItem));
    const mapperContext: JsonStringifierContext = {};
    console.log(forEachArray.join("\n"));
    console.log(new JsonStringifier().stringify(putMap, mapperContext));
    return puItem;
  }

  private constructAttributeDefinitions(index_path: string,
                                        fields: EntityField[],
                                        args: Map<string, string>,
                                        parentRec: number,
                                        parentIsList: boolean,
                                        forEachArray: Array<ForEachArrayData>,
                                        aggregatedSearch: Array<string>): Array<AttributeDefinition> {
    let rec = Math.floor(Math.random() * 500);
    return fields.map(field => {
      const dynamoField = field.props.dynamo;
      rec = rec + 1;
      return this.constructDynamoAttributeValues(parentRec,
          parentIsList,
          field.fieldName,
          index_path,
          dynamoField,
          args,
          rec,
          forEachArray,
          aggregatedSearch);
    })
  }

  private constructDynamoAttributeValues(parentRec: number,
                                         parentIsList: boolean,
                                         key: string,
                                         index_path: string,
                                         attribute: DynamoFieldProp,
                                         args: Map<string, string>,
                                         rec: number,
                                         foreEachArray: Array<ForEachArrayData>,
                                         aggregatedSearch: Array<string>
  ): AttributeDefinition {
    if(attribute.ref === undefined) {
      attribute.value = this.replaceValuePlaceHolders(attribute.value, args);
      return this.getDynamoSimplePropertyDefinition(key, parentRec, parentIsList, rec, attribute, foreEachArray, aggregatedSearch);
    }
    else {
      const entityModel = this.readModelInput(index_path, attribute.ref.path, key);
      // @ts-ignore
      attribute.ref.args.forEach((value: string, key: string) => {
        attribute.ref.args.set(key, this.replaceValuePlaceHolders(value, args));
      })
      return this.getDynamoComplexPropertyDefinition(parentRec, key, attribute,
          this.constructAttributeDefinitions(index_path, entityModel.fields, attribute.ref.args, rec, attribute.list, foreEachArray, aggregatedSearch), rec, foreEachArray, aggregatedSearch);
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
                                            forEachArray: Array<ForEachArrayData>,
                                            aggregatedSearch: Array<string>
  ) : AttributeDefinition {
    const obj = new Map<string, any>();
    if(attribute.list) {
      const objectList: { [k: string]: any } = {};
      objectList[attribute.type as keyof string] =  "$entry_" + rec;
      let val = attribute.value;
      if(parentRec !== rec && parentIsList) {
        val = "$entry_" + parentRec + "." + key;
      }
      const forEachArrayData = {parent_id: parentRec,
        id: rec, statement: "#foreach($entry_" + rec + " in " + val + ")" + "\n" +
            "$arr_" + rec + ".add(" + JSON.stringify(objectList) + ")\n",
        children: []
      };
      forEachArray.push(forEachArrayData)
      aggregatedSearch.push("#set($arr_" + rec + " = [])")
      obj.set("L","$arr_" + rec);
    }
    else {
      obj.set(attribute.type, attribute.value);
    }
    //@ts-ignore
    return {field_name: key,
      field_value :obj,
      isMap: false,
      field_type: attribute.type,
      selector: attribute.value};
  }

  private getDynamoComplexPropertyDefinition(parentRec: number,
                                             keyVal: string,
                                             attribute: DynamoFieldProp,
                                             value: {[k: string]: any},
                                             rec: number,
                                             forEachArray: Array<ForEachArrayData>,
                                             aggregatedSearch: Array<string>) : AttributeDefinition {
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
      let forEachString = "#foreach($entry_" + rec + " in $context.arguments." + keyVal + ")" + "\n" +
          "$arr_" + rec + ".add(" + new JsonStringifier().stringify(obj, mapperContext) + ")\n";
      if(parentRec === rec) {
        forEachString = forEachString + "\n" + "#end";
      }
      const forEachArrayData = {parent_id: parentRec, id: rec, statement: forEachString, children: []};
      forEachArray.push(forEachArrayData);
      aggregatedSearch.push("#set($arr_" + rec + " = [])")
      objL.set("L", "$arr_" + rec);
      //@ts-ignore
      return {field_name: keyVal, field_value :objL, isMap: true, field_type: attribute.type, selector: "$arr_" + rec};
    }
    //@ts-ignore
    return {field_name: keyVal, field_value :obj, isMap: true, field_type: attribute.type, selector: attribute.value};
  }

}

export class EntityModel {

  @JsonProperty() @JsonClassType({type: () => [String]})
  @JsonAlias({values: ['name']})
  name: String;

  @JsonProperty() @JsonClassType({type: () => [Array, [EntityField]]})
  fields: EntityField[];

}

interface ForEachArrayData {

  parent_id: number;
  id: number;
  statement: string;
  children: any[];

}

interface AttributeDefinition {
  field_name: string;
  field_value: Map<string, any>
  field_type: string;
  isMap: boolean
  selector: string;
  id: string;
  parent_id: string;
  statement: string;
}
