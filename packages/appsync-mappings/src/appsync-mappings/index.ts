import { Rule, SchematicContext, Tree } from '@angular-devkit/schematics';
import {ModelParser} from "./service/ModelParser";
import * as fs from "fs";
import * as YAML from "yaml"

// You don't have to export the function as default. You can also have more than one rule factory
// per file.
export function appsyncMappings(_options: any): Rule {
  return (tree: Tree, _context: SchematicContext) => {
    const modelParser = new ModelParser();
    const infra_path = _options.infraPath;
    const templates_path = process.cwd() + "/" + _options.templatesPath;
    const file = fs.readFileSync(infra_path, 'utf8')
    const json = YAML.parse(file)
    modelParser.parseEntity(templates_path, json);
    tree.create(_options.name || 'hello', 'world');
    return tree;
  };
}