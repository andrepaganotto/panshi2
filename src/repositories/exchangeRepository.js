import { EntityId, Repository } from "redis-om";
import { encrypt, decrypt } from '../utils/crypto.js';

import database from '../redis.js';
import schema from '../schemas/exchangeSchema.js';

import exchangesApp from "../apps/exchanges.js";

const repository = new Repository(schema, database);

async function createIndex() {
    await repository.createIndex();

    //This will seed the exchanges if there are none in the database, this is useful for the first time the server is started
    //We add Pro Certified exchanges available in ccxt api
    const exchangeCount = await repository.search().count();
    if (!exchangeCount) {
        const exchangesToSeed = await exchangesApp.seedExchanges();
        for (let [id, data] of Object.entries(exchangesToSeed)) {
            await repository.save(id, data);
        }
    }
}


//This function will enable an exchange, it will try to setup the exchange with the provided credentials
async function enableExchange(id, data) {
    let exchange = await repository.fetch(id);
    if (exchange.enabled) return { alreadyEnabled: true };

    exchange.enabled = await exchangesApp.setupExchange(id, data.apiKey, data.secret, data.percentage);
    if (!exchange.enabled) return;

    return updateExchange(data, exchange);
}

//Get an exchange by its ID, option to get the secret decrypted
async function getExchange(id, decrypted = false) {
    const exchange = await repository.fetch(id);
    if (decrypted) exchange.secret = decrypt(exchange.secret);
    else delete exchange.secret;
    return exchange;
}

//The same as the function above, but for all exchanges
async function getExchanges(enabled = true, decrypted = false) {
    let exchanges = await repository.search().where('enabled')[enabled]().returnAll();
    exchanges = exchanges.map(exchange => {
        if (exchange.secret && decrypted) exchange.secret = decrypt(exchange.secret);
        else delete exchange.secret;

        exchange.id = exchange[EntityId];
        return exchange;
    })

    return exchanges;
}

async function updateExchange({ id = null, apiKey, secret, percentage }, cachedExchange = false) {
    let exchange = cachedExchange || await repository.fetch(id);

    exchange.apiKey = apiKey;
    exchange.secret = encrypt(secret);
    exchange.updated_at = new Date();
    exchange.percentage = percentage;
    exchange = await repository.save(exchange);

    delete exchange.secret;
    exchange.id = exchange[EntityId];

    return exchange;
}

//This simply set the exchange as disabled, it will also unload the exchange from the app, an exchange never gets deleted
async function disableExchange(id, cachedExchange = false) {
    const exchange = cachedExchange || await repository.fetch(id);

    delete exchange.apiKey;
    delete exchange.secret;

    exchange.enabled = false;
    exchange.updated_at = new Date();

    exchangesApp.unloadExchange(id);
    return repository.save(exchange);
}

export default { createIndex, enableExchange, getExchange, getExchanges, updateExchange, disableExchange };