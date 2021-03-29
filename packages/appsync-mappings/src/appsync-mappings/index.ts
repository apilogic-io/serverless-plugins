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
    //@ts-ignore
    const rules = [];
    rules.push(...createMappingsTemplates(operations, _options))
    rules.push(...createFunctionsTemplates(operations, _options))
    rules.push(...[createServerlessTemplate(operations, _options)]);

    //@ts-ignore
    return chain(rules);
}

function createServerlessTemplate(operations: Operation[], _options: any): Rule {
    const sourceTemplates = url('./files/serverless')
    const mappings = operations.filter(op => op.mainDataSource === op.dataSource);
    const functions = operations;
    const sourceParametrizedTemplates = apply(sourceTemplates, [
        template({
            ..._options,
            ...strings,
            mappings,
            functions
        }), move(_options.projPath)])
    //@ts-ignore
    return mergeWith(sourceParametrizedTemplates);
}

function createMappingsTemplates(operations: Operation[], _options: any): Rule[] {
    const sourceTemplates = url('./files/mappings')
    const group = new Map(Object.entries(_.groupBy(operations, "name")));
    //@ts-ignore
    const rules = []
    group.forEach((operations, entity) => {
        const functions = operations.map(op => op.func);
        const mainOperation = operations.filter(op => op.name === entity)[0];
        const func = mainOperation.func
        const type = mainOperation.type
        const mainType = mainOperation.mainType
        const dataSource = mainOperation.dataSource
        const sourceParametrizedTemplates = apply(sourceTemplates, [
            template({
                ..._options,
                ...strings,
                entity,
                func,
                type,
                mainType,
                functions,
                dataSource

            }), move(_options.projPath + "/mapping-templates")])
        rules.push(mergeWith(sourceParametrizedTemplates))
    })
    //@ts-ignore
    return rules;
}

function createFunctionsTemplates(operations: Operation[], _options: any): Rule[] {
    const sourceTemplates = url('./files/functions')
    return operations.map(operation => {
        const func = operation.func
        const type = operation.type
        const templateVtl = operation.template
        const dataSource = operation.dataSource
        const entity = operation.name
        const sourceParametrizedTemplates = apply(sourceTemplates, [
            template({
                ..._options,
                ...strings,
                entity,
                func,
                type,
                templateVtl,
                dataSource

            }), move(_options.projPath + "/mapping-templates")])
        return mergeWith(sourceParametrizedTemplates)
    })
}
