exports.up = (client, workingDirectory) => {
    return client.createIndex("items", workingDirectory,  "/items/sample-settings.json", '/items/sample-schema.json');
};