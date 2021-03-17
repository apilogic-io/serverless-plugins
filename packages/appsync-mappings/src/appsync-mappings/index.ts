import {apply, mergeWith, Rule, SchematicContext, template, Tree, url} from '@angular-devkit/schematics';
import {ModelParser} from "./service/ModelParser";
import * as fs from "fs";
import * as YAML from "yaml"
import {strings} from "@angular-devkit/core";

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
    const mappings = modelParser.parseEntity(templates_path, json);
    const entity = mappings.map(m => m.entity);
    const sourceTemplates = url('./files')
    const sourceParametrizedTemplates = apply(sourceTemplates, [
        template({
          ..._options,
          ...strings,
          ...entity
        })
    ])
    return mergeWith(sourceParametrizedTemplates)
    }

// console.log(mappings);
// tree.create(_options.name || 'hello', 'world');
    // return tree;
  // };
}