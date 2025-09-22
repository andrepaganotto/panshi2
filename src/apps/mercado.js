/**
 * Mercado Bitcoin API
 * This class is responsible for handling all the requests to the Mercado Bitcoin API
 * it IMITATES the ccxt library standard to handle the requests and responses. I did this because
 * native version of mercado available in ccxt doesnt have support to websockets and still uses the old v3 API
 * which is deprecated.
 * 
 * THIS SHOULD NEVER BE ADDED TO THE CCXT LIBRARY, IT IS A CUSTOM IMPLEMENTATION FOR THIS PROJECT
 * Adding this to the ccxt library would lead to more concurrents in the market, since other bots doesnt have access to 
 * Mercado Bitcoin websockets, having this custom implementation is a market advantage for us. And even if someone wants to
 * add this to the ccxt library would have to write it in the ccxt standard way, which is not the case here, this code only
 * imitates the ccxt behavior to work along with the bot, since all other exchanges are handled by ccxt library.
 */


import { rateLimiter, debounce, getDelay, delay } from "../utils/generics.js";
import { settings } from "../controllers/settingsController.js";
import { WebSocket } from 'ws';
import chalk from "chalk";
import ccxt from "ccxt";
import { mercadoNetworkError } from "../utils/errors.js";

const order_status = {
    created: 'processing',
    working: 'open',
    filled: 'closed',
    cancelled: 'canceled'
};

const request = rateLimiter(1650, 60000);

const parse = {
    MyTrades(order) {
        return order.executions.map(trade => {
            return {
                id: trade.id.toString(),
                timestamp: trade.executed_at,
                datetime: new Date(trade.executed_at * 1000).toISOString(),
                symbol: trade.instrument.replace('-', '/'),
                order: order.id,
                type: order.type,
                side: trade.side,
                takerOrMaker: trade.liquidity,
                price: trade.price,
                amount: parseFloat(trade.qty),
                cost: parseFloat((trade.price * parseFloat(trade.qty)).toFixed(2)),
                fee: {
                    cost: parseFloat(trade.fee_rate),
                    currency: trade.side === 'buy' ? trade.instrument.match(/^[^-]+/)[0] : trade.instrument.match(/[^-]+$/)[0]
                },
                fees: [{
                    cost: parseFloat(trade.fee_rate),
                    currency: trade.side === 'buy' ? trade.instrument.match(/^[^-]+/)[0] : trade.instrument.match(/[^-]+$/)[0]
                }]
            }
        })
    },

    Order(order) {
        return {
            info: order,
            id: order.id || undefined,
            clientOrderId: order.triggerOrderId || undefined,
            timestamp: order.created_at || undefined,
            datetime: order.created_at ? new Date(order.created_at * 1000).toISOString() : undefined,
            lastTradeTimestamp: order.executions?.length ? order.executions[order.executions.length - 1].executed_at : undefined,
            lastUpdateTimestamp: order.updated_at || undefined,
            symbol: order.instrument ? order.instrument.replace('-', '/') : undefined,
            type: order.type || undefined,
            side: order.side || undefined,
            price: order.type === 'market' ? order.avgPrice : (order.limitPrice || undefined),
            amount: order.qty ? parseFloat(order.qty) : undefined,
            cost: (order.filledQty && order.avgPrice) ? parseFloat((parseFloat(order.filledQty) * order.avgPrice).toFixed(2)) : undefined,
            average: order.avgPrice || undefined,
            filled: parseFloat(order.filledQty) || undefined,
            remaining: (order.qty && order.filledQty) ? parseFloat(order.qty) - parseFloat(order.filledQty) : undefined,
            status: order_status[order.status] || undefined,
            fee: (order.side && order.fee && order.instrument) ? { currency: order.side === 'buy' ? order.instrument.split('-')[0] : order.instrument.split('-')[1], cost: parseFloat(order.fee) } : undefined,
            trades: order.executions?.length ? parse.MyTrades(order) : undefined,
            fees: []
        }
    },

    Ticker(ticker) {
        return {
            symbol: ticker.symbol || ticker.pair.replace('-', '/'),
            timestamp: ticker.date * 1000,
            datetime: new Date(ticker.date * 1000).toISOString(),
            high: parseFloat(ticker.high),
            low: parseFloat(ticker.low),
            bid: parseFloat(ticker.buy),
            ask: parseFloat(ticker.sell),
            open: parseFloat(ticker.open),
            close: parseFloat(ticker.last),
            last: parseFloat(ticker.last),
            baseVolume: parseFloat(ticker.vol),
            change: parseFloat((parseFloat(ticker.last) - parseFloat(ticker.open)).toFixed(8)),
            percentage: parseFloat((((parseFloat(ticker.last) / parseFloat(ticker.open)) - 1) * 100).toFixed(3))
        }
    },

    OrderBook(orderbook) {
        return {
            symbol: orderbook.symbol,
            bids: orderbook.bids.slice(0, orderbook.limit || orderbook.bids.length).map(b => [parseFloat(b[0]), parseFloat(b[1])]),
            asks: orderbook.asks.slice(0, orderbook.limit || orderbook.asks.length).map(a => [parseFloat(a[0]), parseFloat(a[1])]),
            timestamp: orderbook.timestamp,
            datetime: new Date(orderbook.timestamp / 1e6).toISOString()
        }
    },

    Trades(trade) {
        return {
            timestamp: trade.date * 1000,
            datetime: new Date(trade.date * 1000).toISOString(),
            symbol: trade.symbol,
            id: trade.tid,
            side: trade.type,
            price: parseFloat(trade.price),
            amount: parseFloat(trade.amount),
            cost: parseFloat((parseFloat(trade.price) * parseFloat(trade.amount)).toFixed(8))
        }
    }
}

export default class mercado {
    constructor({ apiKey, secret } = {}) {
        //ccxt
        this.id = 'mercado';
        this.name = 'Mercado Bitcoin';
        this.certified = true;

        //data
        this.markets = {};
        this.loadedMarkets = false;
        this.cache = {};

        //rest api
        this.baseUrl = 'https://api.mercadobitcoin.net/api/v4';
        this.apiKey = apiKey || undefined;
        this.secret = secret || undefined;
        this.accountId = false;
        this.accessToken = false;

        //websockets
        this.streamUrl = 'wss://ws.mercadobitcoin.net/ws';
        this.endpoints = {};
        this.heartBeatInterval = 10000;
        this.heartBeat = debounce((callback) => callback(), this.heartBeatInterval);
    }

    async watch(channel, symbol, limit = 50) {
        if (!this.loadedMarkets) await this.loadMarkets();
        const endpoint = `${channel}:${symbol}`;

        return new Promise((resolve, reject) => {
            let client = this.endpoints[endpoint];

            if (!client) {
                client = new WebSocket(this.streamUrl);

                client.onopen = async () => {
                    settings.LOGS.mercado && console.log(`mercado => Opening WS connection: ${chalk.green(endpoint)}`);

                    client.heartBeat = setInterval(() => client.send(JSON.stringify({ type: "ping" })), this.heartBeatInterval);

                    const firstData = await this[`fetch${channel}`](symbol, limit);
                    this.cache[endpoint] = firstData[0] || firstData;
                    this.cache[endpoint].busy = false;
                    resolve(this.cache[endpoint]);

                    this.endpoints[endpoint] = client;

                    client.send(JSON.stringify({
                        type: 'subscribe',
                        subscription: {
                            name: channel.toLowerCase().replace('s', ''),
                            id: this.markets[symbol].quote + this.markets[symbol].base,
                            limit: 200
                        }
                    }));
                };
            }

            client.onerror = (error) => reject(error);

            client.onclose = () => {
                settings.LOGS.mercado && console.log(`mercado => WS connection has been closed: ${chalk.green(endpoint)}`);
                clearInterval(client.heartBeat);
                delete this.endpoints[endpoint];
                reject(new ccxt.NetworkError(`(${endpoint}) Connection was closed`));
            };

            client.onmessage = async (event) => {
                const msg = JSON.parse(event.data);

                if (msg.type === 'error') return reject(msg);

                if (!msg || !msg.type || !msg.id || !msg.data) return;

                if (this.cache[endpoint].busy) return;

                const data = msg.data;
                const timestamp = data.date ? data.date * 1000 : data.timestamp;

                if (timestamp > this.cache[endpoint].timestamp) {
                    this.cache[endpoint].busy = true;

                    const delay = getDelay(data.date ? timestamp : timestamp / 1e6, settings.LOGS.mercado ? endpoint : false);

                    if (delay > settings.DELAYS[channel]) {
                        settings.LOGS.mercado && console.log(`Fetching data for ${endpoint}`);

                        const fetchData = await this[`fetch${channel}`](symbol, limit);
                        if (!fetchData) return reject('Failed to fetch data for endpoint', endpoint);
                        this.cache[endpoint] = fetchData;
                    }
                    else
                        this.cache[endpoint] = parse[channel]({ ...data, symbol, limit });

                    this.cache[endpoint].busy = false;
                    resolve(this.cache[endpoint]);
                }
            };
        })
    }

    //public streams
    watchTicker(symbol, limit) {
        return this.watch('Ticker', symbol);
    }

    watchOrderBook(symbol, limit) {
        return this.watch('OrderBook', symbol, limit);
    }

    watchTrades(symbol, limit) {
        return this.watch('Trades', symbol);
    }



    /*
        PUBLIC METHODS

        Here, we will try to fetch for network errors inside the function itself, since its a public method theres no risk of affecting the account.
        So what we do is, if there is any unknown error it will log so we can fix it later and return a false value so the function caller can handle it properly
        returning the latest value it has on cache, it doesn't matter if it is outdated data since it will result in nothing basically, and the worst that can happen
        is the order to pass in front of itself due to outdated data, but as soon as new data arrives it will go back to normal.
        
        >> THE SAME APPLIES TO ALL PUBLIC FETCHING METHODS <<
    */

    publicCall(path) {
        return request({ url: this.baseUrl + path });
    }

    async loadMarkets(reload = false) {
        if (this.loadedMarkets && !reload) return this.markets;

        const tryToFetch = async () => {
            try {
                const data = await this.publicCall('/symbols');

                return data.symbol.reduce((acc, symbol, i) => {
                    const type = data.type[i];
                    if (type !== "DIGITAL_ASSET" && type !== "DIGITAL_VARIABLE_INCOME")
                        acc[symbol.replace('-', '/')] = {
                            id: symbol,
                            lowercaseId: symbol.toLowerCase(),
                            symbol: symbol.replace('-', '/'),
                            base: data['base-currency'][i],
                            quote: data.currency[i],
                            type: 'spot',
                            spot: true,
                            margin: false,
                            active: (data['exchange-listed'][i] && data['exchange-traded'][i])
                        }
                    return acc;
                }, {})
            }
            catch (error) {
                const code = error.response?.data?.code?.split('|')[2] || error.message;
                console.error(`mercado => Error loading symbols`, code);
                return false;
            }
        }

        while (true) {
            this.markets = await tryToFetch();
            if (this.markets !== false) break;
        }

        this.loadedMarkets = true;
        settings.LOGS.mercado && console.log('Successfully loaded markets!');

        return this.markets;
    }

    async fetchTickers(symbols) {
        if (!this.loadedMarkets) await this.loadMarkets();

        if (!Array.isArray(symbols)) {
            if (!symbols || !this.markets[symbols]) throw new ccxt.BadRequest('You must provide a valid symbol');
            symbols = [symbols];
        }
        else if (!symbols.every(s => s && markets[s])) throw new ccxt.BadRequest('One of your symbols is not valid');

        const tryToFetch = async () => {
            try {
                const queryParams = '?symbols=' + symbols.map(s => this.markets[s].id).toString();
                const tickers = await this.publicCall('/tickers' + queryParams);

                if (!tickers.length) throw new ccxt.BadSymbol('No response data');

                return tickers.reduce((acc, ticker) => {
                    acc[ticker.pair.replace('-', '/')] = parse.Ticker(ticker);
                    return acc;
                }, {});
            }
            catch (error) {
                if (error instanceof ccxt.BadSymbol) throw error;
                return false;
            }
        }

        let tickers;

        while (true) {
            try {
                tickers = await tryToFetch();
                if (tickers !== false) break;
            }
            catch (error) {
                console.error(`(${symbols}) mercado.fetchTickers() [Invalid Symbol]: Probably got delisted`, error);
                tickers = false;
                break;
            }
        }

        return tickers;
    }

    async fetchTicker(symbol) {
        if (!symbol || !this.markets[symbol]) throw new ccxt.BadRequest('You must provide a valid symbol');

        const ticker = await this.fetchTickers(symbol);

        return ticker[symbol] || ticker;
    }

    async fetchOrderBook(symbol, limit = 50) {
        if (!this.loadedMarkets) await this.loadMarkets();

        if (!symbol || !this.markets[symbol]) throw new ccxt.BadRequest('You must provide a valid symbol');

        const tryToFetch = async () => {
            try {
                const orderbook = await this.publicCall(`/${this.markets[symbol].id}/orderbook?limit=200`);

                return parse.OrderBook({ symbol, limit, ...orderbook });
            }
            catch (error) {
                const code = error.response?.data?.code?.split('|')[2] || error.message;
                if (code === 'INVALID_BASE_QUOTE') throw error;
                else return false;
            }
        }

        let orderbook;

        while (true) {
            try {
                orderbook = await tryToFetch();
                if (orderbook !== false) break;
            }
            catch (error) {
                console.error(`(${symbol}) mercado.fetchOrderBook() [Invalid Symbol]: Probably got delisted`, error);
                orderbook = false;
                break;
            }
        }

        return orderbook;
    }

    async fetchTrades(symbol, since, limit = 1) {
        if (!this.loadedMarkets) await this.loadMarkets();

        if (!symbol || !this.markets[symbol]) throw new ccxt.BadRequest('You must provide a valid symbol');

        const tryToFetch = async () => {
            try {
                const queryParams = `${since ? `?from=${since}&to=${Date.now()}` : ''}${(limit && since) ? `&limit=${limit}` : limit ? `?limit=${limit}` : ''}`;
                const trades = await this.publicCall(`/${this.markets[symbol].id}/trades` + queryParams);

                if (limit > 1)
                    return trades.map(trade => parse.Trades({ ...trade, symbol }));

                return parse.Trades({ ...trades[0], symbol });
            }
            catch (error) {
                const code = error.response?.data?.code?.split('|')[2] || error.message;
                if (code === 'INVALID_BASE_QUOTE') throw error;
                else return false;
            }
        }

        let trades;

        while (true) {
            try {
                trades = await tryToFetch();
                if (trades !== false) break;
            }
            catch (error) {
                console.error(`(${symbol}) mercado.fetchTrades() [Invalid Symbol]: Probably got delisted`, error);
                trades = false;
                break;
            }
        }

        return trades;
    }



    //private

    /*
     NOTES: 
        When a new order is made using the exchange frontend it is created with a Numerical Unique ID, like that: 6018544104,
        and when it is made using the API endpoints its ID will be an alphanumeric string like that: 01HCDAA7YJ68ZJ0FTEPR7DYDS1 along with
        the numerical unique ID
 
    */

    async getAccountId() {
        const url = this.baseUrl + '/accounts';
        const headers = { Authorization: "Bearer " + this.accessToken };
        try {
            const data = await request({ url, headers });
            this.accountId = data[0].id;
        }
        catch (error) {
            const code = error.response ? error.response.data?.code?.split('|')[2] : error.message;
            console.error(`Error getting accountId`, code);
            return this.getAccountId();
        }
    }

    async login() {
        const url = this.baseUrl + '/authorize';
        const body = { login: this.apiKey, password: this.secret };
        try {
            const data = await request({ method: 'post', url, data: body });
            this.accessToken = data.access_token;

            settings.LOGS.mercado && console.log("Logged in Mercado Bitcoin!");

            if (!this.accountId) await this.getAccountId();

            setTimeout(() => this.login(), (data.expiration * 1000) - Date.now() - 120000);
        }
        catch (error) {
            console.log('(LOGIN) Failed to authenticate...');
            console.error(error.response ? error.response.data : error.message);
            return this.login();
        }

    }

    async privateCall({ method, data, path }) {
        if (!this.accessToken) await this.login();
        return request({
            method,
            data,
            url: `${this.baseUrl}/accounts/${this.accountId}` + path,
            headers: { Authorization: 'Bearer ' + this.accessToken }
        });
    }


    //3 req/sec
    async fetchBalance() {
        try {
            const balances = await this.privateCall({
                path: '/balances'
            });

            const parsedBalances = {
                free: {},
                used: {},
                total: {},
                timestamp: Date.now(),
                datetime: new Date(Date.now()).toISOString(),
                info: true
            }

            for (let balance of balances) {
                parsedBalances.free[balance.symbol] = parseFloat(balance.available);
                parsedBalances.used[balance.symbol] = parseFloat(balance.on_hold);
                parsedBalances.total[balance.symbol] = parseFloat(balance.total);

                parsedBalances[balance.symbol] = {
                    free: parseFloat(balance.available),
                    used: parseFloat(balance.on_hold),
                    total: parseFloat(balance.total)
                }
            }

            return parsedBalances;
        }
        catch (error) {
            const code = error.response?.data?.code?.split('|')[2] || error.message;

            if (mercadoNetworkError(code, error.response?.status))
                throw new ccxt.NetworkError(code);
            else
                throw error;
        }
    }

    //3 req/sec
    async createOrder(symbol, type, side, amount, price) {
        if (!this.loadedMarkets) await this.loadMarkets();

        if (!symbol || !this.markets[symbol]) throw new ccxt.BadRequest('You must provide a valid symbol');

        try {
            const order = await this.privateCall({
                method: 'post',
                path: `/${this.markets[symbol].id}/orders`,
                data: { type, side, qty: amount.toString(), limitPrice: price, async: false }
            });
            if (order.orderId) return parse.Order({
                id: order.orderId,
                qty: amount,
                instrument: symbol,
                limitPrice: price,
                type,
                side
            });
        }
        catch (error) {
            const code = error.response?.data?.code?.split('|')[2] || error.message;
            const message = error.response?.data?.message;

            if (mercadoNetworkError(code, error.response?.status))
                throw new ccxt.NetworkError(code);
            else if (code === 'INSUFFICIENT_BALANCE')
                throw new ccxt.InsufficientFunds('There is not enough balance to fulfill the amount');
            else if (code === 'INVALID_MIN_QUANTITY')
                throw new ccxt.InvalidOrder(`Amount is not greater than minimum amount (${message?.match(/\{([^{}]+)\}/g)[1]})`);
            else if (code === 'INVALID_MAX_QUANTITY')
                throw new ccxt.InvalidOrder(`Amount is greater than maximum amount allowed (${message?.match(/\{([^{}]+)\}/g)[1]})`);
            else if (code === 'INVALID_MIN_LIMIT_PRICE')
                throw new ccxt.InvalidOrder(`Limit price is lower than minimum price (${message?.match(/\{([^{}]+)\}/g)[1]})`);
            else if (code === 'INVALID_MAX_LIMIT_PRICE')
                throw new ccxt.InvalidOrder(`Limit price is higher than maximum price allowed (${message?.match(/\{([^{}]+)\}/g)[1]})`);
            else if (code === 'EXCEEDED_COST_LIMIT')
                throw new ccxt.InvalidOrder(`Total order cost (amount * price) is lower than minimum (around R$ 1) or higher than maximum`);
            else
                throw error;
        }
    }

    async fetchOrder(id, symbol) {
        if (!this.loadedMarkets) await this.loadMarkets();

        if (!id || id.length < 20) throw new ccxt.BadRequest('You must provide an order ID');
        if (!symbol || !this.markets[symbol]) throw new ccxt.BadRequest('You must provide a valid symbol');

        try {
            const order = await this.privateCall({
                path: `/${this.markets[symbol].id}/orders/${id}`
            });

            return parse.Order(order);
        }
        catch (error) {
            const code = error.response?.data?.code?.split('|')[2] || error.message;

            if (mercadoNetworkError(code, error.response?.status))
                throw new ccxt.NetworkError(code);
            else if (code === 'ORDER_NOT_FOUND') {
                // SPECIAL: raise a real "not found" so the bot can recreate instead of retrying like a network error
                console.log(`${symbol} ORDER NOT FOUND (ID: ${id})`);
                const err = new ccxt.OrderNotFound(`${code} ORDER ID: ${id}`);
                err.code = 'ORDER_NOT_FOUND';
                err.orderId = id;
                err.symbol = symbol;
                throw err;
            }
            else
                throw error;
        }

        // Note: Mercado sometimes returns ORDER_NOT_FOUND even for valid IDs (suspected API issue).
        // We surface it distinctly so the caller can recreate with the same params.
    }

    async cancelAllOrders(symbol) {
        if (!this.loadedMarkets) await this.loadMarkets();

        if (!symbol || !this.markets[symbol]) throw new ccxt.BadRequest('You must provide a valid symbol');

        try {
            const canceledOrder = await this.privateCall({
                method: 'delete',
                path: `/cancel_all_open_orders${symbol ? `?symbol=${this.markets[symbol].id}` : ''}`, //if no symbol is provided it will cancel all orders
            });

            if (canceledOrder) return true;
        }
        catch (error) {
            const code = error.response?.data?.code?.split('|')[2] || error.message;

            if (mercadoNetworkError(code, error.response?.status))
                throw new ccxt.NetworkError(code);
            else
                throw error;
        }

    }

    //3 req/sec
    async cancelOrder(id, symbol) {
        if (!this.loadedMarkets) await this.loadMarkets();

        if (!id || id.length < 20) throw new ccxt.BadRequest('You must provide an order ID');
        if (!symbol || !this.markets[symbol]) throw new ccxt.BadRequest('You must provide a valid symbol');

        try {
            const canceledOrder = await this.privateCall({
                method: 'delete',
                path: `/${this.markets[symbol].id}/orders/${id}?async=false`,
            });

            if (canceledOrder) return parse.Order({
                id,
                status: 'cancelled',
                instrument: symbol
            });
        }
        catch (error) {
            const code = error.response?.data?.code?.split('|')[2] || error.message;

            if (mercadoNetworkError(code, error.response?.status))
                throw new ccxt.NetworkError(code);
            else if (code === 'ORDER_NOT_FOUND') {
                throw new ccxt.NetworkError(code);
            }
            else if (code === 'INVALID_STATUS') {
                return parse.Order({
                    id,
                    status: 'filled',
                    instrument: symbol
                });
            }
            else
                throw error;
        }

        //IMPORTANT NOTE: Whenever we get the error code "INVALID_STATUS" it means the order status is either "processing" or "closed", if we try to cancel an already
        //canceled order it wont return any error, so we do it mannually since we know. But using our logic on the bot we will know beforehand if the order is processing,
        //since we fetch it before canceling. This way we can (taking the risk) assume that the order is filled or perform another request to fetch the order again
    }

    //1 req/sec
    async fetchOrders(symbol, since, limit) {
        if (!this.loadedMarkets) await this.loadMarkets();
        const queryParams = `${since ? `&created_at_from=${since}` : ''}${limit ? `&created_at_to=${limit}` : ''}`;
        const orders = await this.privateCall({
            path: `/${this.markets[symbol].id}/orders` + queryParams
        });
        return orders.map(order => parse.Order(order));
    }

    //10 req/sec
    async fetchOpenOrders(symbol, since, limit) {
        if (!this.loadedMarkets) await this.loadMarkets();

        if (!symbol || !this.markets[symbol]) throw new ccxt.BadRequest('You must provide a valid symbol');

        try {
            const queryParams = `${since ? `&created_at_from=${since}` : ''}${limit ? `&created_at_to=${limit}` : ''}`;
            const orders = await this.privateCall({
                path: `/${this.markets[symbol].id}/orders?status=working` + queryParams
            });
            return orders.map(order => parse.Order(order));
        }
        catch (error) {
            const code = error.response?.data?.code?.split('|')[2] || error.message;

            if (mercadoNetworkError(code, error.response?.status))
                throw new ccxt.NetworkError(code);
            else
                throw error;
        }
    }

    //10 req/sec
    async fetchClosedOrders(symbol, since, limit) {
        if (!this.loadedMarkets) await this.loadMarkets();
        const queryParams = `${since ? `&created_at_from=${since}` : ''}${limit ? `&created_at_to=${limit}` : ''}`;
        const orders = await this.privateCall({
            path: `/${this.markets[symbol].id}/orders?status=cancelled` + queryParams
        });
        return orders.map(order => parse.Order(order));
    }

    //10 req/sec
    async fetchMyTrades(symbol, since, limit) {
        if (!this.loadedMarkets) await this.loadMarkets();
        const queryParams = `${since ? `&created_at_from=${since}` : ''}${limit ? `&created_at_to=${limit}` : ''}`;
        const orders = await this.privateCall({
            path: `/${this.markets[symbol].id}/orders?has_executions=true` + queryParams
        });

        return orders.flatMap(order => parse.MyTrades(order))
    }
}

//TODO -> debug this error: "COIN_PAIR_DISABLED" it happens when the crypto is unavailable to trade