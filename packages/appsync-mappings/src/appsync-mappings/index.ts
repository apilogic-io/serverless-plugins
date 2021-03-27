import {apply, chain, mergeWith, move, Rule, SchematicContext, template, Tree, url} from '@angular-devkit/schematics';
import {ModelParser, Operation} from "./service/ModelParser";
import * as fs from "fs";
import * as YAML from "yaml"
import {strings} from "@angular-devkit/core";
import * as _ from "lodash";

// You don't have to export the function as default. You can also have more than one rule factory
// per file.
export function appsyncMappings(_options: any): Rule {
  return (tree: Tree, _context: SchematicContext) => {
    console.log(tree);
    const modelParser = new ModelParser();
    const infra_path = _options.infraPath;
    const templates_path = process.cwd() + "/" + _options.templatesPath;
    const file = fs.readFileSync(infra_path, 'utf8')
    const json = YAML.parse(file)
    const operations = modelParser.parseEntity(templates_path, json);
    return createContextTemplates(operations, _options);
    }

  }

  function createContextTemplates(operations: Operation[], _options: any): Rule {
    const sourceTemplates = url('./files')
    const group =  new Map(Object.entries(_.groupBy(operations, "name")));
    //@ts-ignore
    const rules = []
    group.forEach((operations, entity) => {
      const functions = operations.map(op => op.func);
      // const operationType =
      rules.push(...operations.map(operation => {
        const func = operation.func
        const type = operation.type
        const templateVtl = operation.template
        const mainType = operation.mainType
        const dataSource = operation.dataSource
        // const inputContext = operation.path
        // let path = [operation.name, operation.type, operation.path].join("/")
        // if(operation.context === operation.path) {
        //   path = [operation.name, operation.type].join("/")
        // }
        const sourceParametrizedTemplates = apply(sourceTemplates, [
          template({
            ..._options,
            ...strings,
            entity,
            func,
            type,
            templateVtl,
            functions,
            mainType,
            dataSource
          }), move( "/")])
        return mergeWith(sourceParametrizedTemplates)
      }))
    })
    //@ts-ignore
    return chain(rules);
  }
