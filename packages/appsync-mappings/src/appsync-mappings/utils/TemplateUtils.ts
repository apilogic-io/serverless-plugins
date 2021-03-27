import {KeyAtributesVtl} from "../service/ModelParser";

export class TemplateUtils {

    public static putItem(keyAtributesVtl: KeyAtributesVtl): string {
        return keyAtributesVtl.vtl + "\n" +
            "{\"version\": \"2018-05-29\",\n" +
            "  \"operation\": \"PutItem\",\n" +
            + this.putItemKV(keyAtributesVtl) +
            "}"
    }

    public static transactWriteItems(keyAtributesVtls: KeyAtributesVtl[]): string {
        let vtl = keyAtributesVtls.map(keyAtributesVtl => keyAtributesVtl.vtl).join("\n");
        vtl = vtl + "\n" + "{\"version\": \"2018-05-29\",\n" +
            "\"operation\": \"TransactWriteItems\",\n" +
            "\"transactItems\": [";
        const transactItemsVtl = keyAtributesVtls.map(keyAtributesVtl => {
            return "{\n" +
            "\"table\":\"" +  keyAtributesVtl.table + "\"," +
            "\"operation\":\"PutItem\",\n" +
            this.putItemKV(keyAtributesVtl) +
            "}";
        });
        return vtl + transactItemsVtl.join(",") + "]\n}";
    }

    public static putItemKV(keyAtributesVtl: KeyAtributesVtl): string {
        return "\"key\" : $util.toJson(" + keyAtributesVtl.key + "),\n" +
                "\"attributeValues\" : $util.toJson(" + keyAtributesVtl.attributes + ")\n";
    }

    public static getItem(path: string, parentCtx: string, ctx: string) {
        const paths = path.split("[]")
        if(paths.length > 1) {

        }
        else {
            let context = ["$ctx.stash",parentCtx, ctx].join(".")
            if(parentCtx === ctx) {
                context = ["$ctx.stash",parentCtx].join(".")
            }
            if(parentCtx === undefined ) {
                context = ["$ctx.arguments",ctx].join(".")
            }
            return paths.map(sp => {
                return "{\"version\": \"2018-05-29\",\n" +
                    "  \"operation\": \"GetItem\",\n" +
                    "\"key\": {" +
                    "\"id\":" + context + "." + sp + "}" +
                    "}"
            })
        }
    }


}