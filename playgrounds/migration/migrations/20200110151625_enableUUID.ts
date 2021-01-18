exports.checkIndex = (client) => {
    return client.client.indices.exists({ index: "items" });
};

exports.create = (client, fs, workingDirectory) => {
    const settings = JSON.parse(fs.readFileSync(workingDirectory + '/items/sample-settings.json'));
    const index = 'items';
    const body = {
        settings
    };
    const template = {
        index,
        body

    };
    return client.client.indices.create(template);
};

exports.mappings = (client, fs, workingDirectory) => {
    const properties = JSON.parse(fs.readFileSync(workingDirectory + '/items/sample-schema.json'));
    const index = 'items';
    const body = {
        properties
    };
    const template = {
        index,
        body

    };
    return client.client.indices.putMapping(template);
};

exports.down = (client, fs) => {
    console.log('[new dynamodb event received] :=> ', "DOWN");
};
