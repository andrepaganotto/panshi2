import ccxt from "ccxt";
import mercado from "./mercado.js";

//Since mercado is not a Pro Certified exchange, we need to add it manually
ccxt.pro.mercado = mercado;
ccxt.pro.exchanges.push('mercado');

import exchangeRepository from "../repositories/exchangeRepository.js";
import { isNetworkError } from "../utils/errors.js";

export const exchanges = {};

//Returns a list of all Pro Certified ccxt exchanges ready to be saved on DB
export async function seedExchanges() {
    return ccxt.pro.exchanges.reduce((acc, exchangeId) => {
        const exchange = new ccxt.pro[exchangeId]();
        if (exchange.certified)
            acc[exchangeId] = {
                name: exchange.name,
                enabled: false,
                created_at: new Date(),
                updated_at: new Date()
            }
        return acc;
    }, {});
}

//Create the exchange instance and try to fetch private data in order to confirm credentials
//This function returns a boolean indicating if the exchange was successfully setup
async function setupExchange(id, apiKey, secret, percentage, updating = false) {
    const exchange = new ccxt.pro[id]({ apiKey, secret });

    try {
        await exchange.loadMarkets();

        const balances = await exchange.fetchBalance();
        if (balances.info) {
            exchange.percentage = percentage;
            exchanges[id] = exchange;
            return true;
        }
    }
    catch (error) {
        if (isNetworkError(error)) return setupExchange(id, apiKey, secret, percentage, updating);

        console.error(`Error on ${id} setup -> [${error.constructor?.name || 'Unknown error'}]: ${error.message || error}`);
        if (!updating) exchangeRepository.disableExchange(id);
        return false;
    }
}

//Load all the enabled exchanges from DB, get all of them decrypted
async function loadExchanges() {
    const enabledExchanges = await exchangeRepository.getExchanges(true, true);

    for (let exchange of enabledExchanges) {
        const { apiKey, secret, percentage } = exchange;
        exchange = await setupExchange(exchange.id, apiKey, secret, percentage);
    }

    console.log('Exchanges ready and loaded!');
}

//Simply removes the exchange from the exchange cache object, so its no longer available to be used in the running app
async function unloadExchange(id) {
    delete exchanges[id];
}

//Returns every symbol available in a certain exchange, filtering it by quote currency (default is USD and BRL, so USDT, USDC and BUSD are included)
export async function getExchangeSymbols(id, refresh = false, quoteFilter = ['USD', 'BRL']) {
    if (!exchanges[id]) return;

    if (refresh) await exchanges[id].loadMarkets(true);

    const markets = Object.entries(exchanges[id].markets);
    const filteredMarkets = markets.filter(([market, data]) => data.type === 'spot' && quoteFilter.some(quote => data.quote.includes(quote)));
    const symbols = Object.keys(Object.fromEntries(filteredMarkets));

    return { id, symbols };
}

export default { seedExchanges, setupExchange, loadExchanges, unloadExchange };