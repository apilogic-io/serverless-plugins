exports.up = (client, workingDirectory) => {
    return client.updateIndex("items", workingDirectory, '/items/sample-schema1.json');
};