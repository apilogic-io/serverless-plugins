import {KeyAtributesVtl} from "../service/ModelParser";

export class TemplateUtils {

    public static putItem(keyAtributesVtl: KeyAtributesVtl): string {
        return keyAtributesVtl.vtl + "\n" +
            "{\"version\": \"2018-05-29\",\n" +
            "  \"operation\": \"PutItem\",\n" +
            "\"key\" : $util.toJson(" + keyAtributesVtl.key + "),\n" +
            "\"attributeValues\" : $util.toJson(" + keyAtributesVtl.attributes + ")\n" +
            "}"
    }

    public static transactWriteItems(keyAtributesVtls: KeyAtributesVtl[]): string {

        return keyAtributesVtl.vtl + "\n" +
            "{\"version\": \"2018-05-29\",\n" +
            "  \"operation\": \"PutItem\",\n" +
            "\"key\" : $util.toJson(" + keyAtributesVtl.key + "),\n" +
            "\"attributeValues\" : $util.toJson(" + keyAtributesVtl.attributes + ")\n" +
            "}"
    }

}