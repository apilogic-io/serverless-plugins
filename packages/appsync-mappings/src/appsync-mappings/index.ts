import { Rule, SchematicContext, Tree } from '@angular-devkit/schematics';
import {ModelParser} from "./service/ModelParser";


// You don't have to export the function as default. You can also have more than one rule factory
// per file.
export function appsyncMappings(_options: any): Rule {
  return (tree: Tree, _context: SchematicContext) => {
    const modelParser = new ModelParser();
    const path = _options.curPath;
    const index = _options.name;
    const index_path = process.cwd() + "/" + path + "/" + index;
    modelParser.parseEntity(index_path, index);
    tree.create(_options.name || 'hello', 'world');
    return tree;
  };
}