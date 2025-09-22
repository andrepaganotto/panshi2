/**
 * This is the brain of the bot, here we have the main functions that will handle the automations, operations, trades and everything else
 * This file is responsible for handling the automations, it will create, edit, delete and start them.
 * All the math involving trades, prices, amounts and everything else is done here.
 * 
 * The latest version of this file is this one you are reading now, everything here is up to date and working. Every major problem that was
 * encountered along the developing of this bot is already solved here.
 * Unless a major change happens in mercado bitcoin API or in the ccxt library, this bot should work perfectly, as it is now.
 * So avoid in any circunstance to change this file, unless you are sure of what you are doing.
 */

//Libs
import ccxt from 'ccxt';
import chalk from "chalk";

//Repositories
import repository from "../repositories/automationsRepository.js";

//Controllers
import { exchanges } from './exchanges.js';
import { settings } from '../controllers/settingsController.js';

//Utils
import { getMinPrice, getTargetPrice } from "../utils/calc.js";
import { debounce, oppoSide, delay } from '../utils/generics.js';
import { belowMinimumAmount, isNetworkError, reportError } from '../utils/errors.js';
import { dolar } from '../utils/dolar.js';
import { wss } from '../server.js';

export const automations = {};
const intervals = {};

/*

     START HANDLER FUNCTIONS

    These functions are used to handle requests to the exchanges, they are responsible for making requests to the exchanges and retrying them.
    They are used to standardize the requests responses and make sure that the bot will not crash if there is any network error or any other.
    They are also responsible for logging the requests and errors, so we can track them and know what is happening.

    All they do is basically try to make a request to the exchange, if it fails it will retry a few times, if it fails again it will
    report the error and return false

*/

async function cancelAllOrders(exchange, symbol) {
    let retries = 0;
    const maxRetries = 15;

    async function tryCancelAllOrders() {
        try {
            await exchanges[exchange].cancelAllOrders(symbol);
            return true;
        }
        catch (error) {
            if (isNetworkError(error))
                if (retries < maxRetries) {
                    retries++;
                    retries < 4 ? await delay(3000) : await delay(15000);
                    return false;
                }
                else throw error;
            else throw error;
        }
    }

    while (true) {
        try {
            const resp = await tryCancelAllOrders();
            if (resp !== false) break;
            else settings.LOGS.botSys && console.log(`${new Date().toLocaleTimeString()} (${chalk.yellowBright(`${exchange} | ${symbol}`)}) is retrying a request on ${chalk.green('cancelAllOrders()')}, attempt: ${retries}/${maxRetries}`);
        }
        catch (error) {
            reportError(`cancelAllOrders() (${exchange} | ${symbol}) [${error.constructor?.name || 'Unknown error'}]: ${error.message || error}`);
            break;
        }
    }
}

async function fetchOrderBook(exchange, symbol) {
    let retries = 0;
    const maxRetries = 15;

    async function tryFetching() {
        try {
            const book = await exchanges[exchange].fetchOrderBook(symbol, 50);
            return book || {}; //No error, but bad data received, this will make the handler ignore it
        }
        catch (error) {
            if (isNetworkError(error))
                if (retries < maxRetries) {
                    retries++;
                    retries < 4 ? await delay(3000) : await delay(15000);
                    return false;
                }
                else throw error;
            else throw error;
        }
    }

    while (true) {
        try {
            const book = await tryFetching();
            if (book !== false) return book;
            else settings.LOGS.botSys && console.log(`${new Date().toLocaleTimeString()} (${chalk.yellowBright(`${exchange} | ${symbol}`)}) is retrying a request on ${chalk.green('fetchOrderBook()')}, attempt: ${retries}/${maxRetries}`);
        }
        catch (error) {
            reportError(`fetchOrderBook() (${exchange} | ${symbol}) [${error.constructor?.name || 'Unknown error'}]: ${error.message || error}`);
            return false;
        }
    }
}

async function fetchTicker(exchange, symbol) {
    let retries = 0;
    const maxRetries = 15;

    async function tryFetching() {
        try {
            const ticker = await exchanges[exchange].fetchTicker(symbol, 0, 1);
            return ticker || {}; //No error, but bad data received, this will make the handler ignore it
        }
        catch (error) {
            if (isNetworkError(error))
                if (retries < maxRetries) {
                    retries++;
                    retries < 4 ? await delay(3000) : await delay(15000);
                    return false;
                }
                else throw error;
            else throw error;
        }
    }

    while (true) {
        try {
            const ticker = await tryFetching();
            if (ticker !== false) return ticker;
            else settings.LOGS.botSys && console.log(`${new Date().toLocaleTimeString()} (${chalk.yellowBright(`${exchange} | ${symbol}`)}) is retrying a request on ${chalk.green('fetchTicker()')}, attempt: ${retries}/${maxRetries}`);
        }
        catch (error) {
            reportError(`fetchTicker() (${exchange} | ${symbol}) [${error.constructor?.name || 'Unknown error'}]: ${error.message || error}`);
            return false;
        }
    }
}

async function createOrder(exchange, symbol, side, amount, price, spread, minPrice) {
    let retries = 0;
    const maxRetries = exchange === 'mercado' ? 15 : 5;

    settings.LOGS.botOps && console.log(`${new Date().toLocaleTimeString()} (${chalk.yellowBright(`${exchange} | ${symbol}`)}) Creating ${chalk[`${side === 'buy' ? 'green' : 'red'}Bright`](`${side} order`)} at price: ${chalk[`${side === 'buy' ? 'green' : 'red'}Bright`](price)} (${spread}) | minPrice: ${minPrice}`);

    async function tryCreateOrder() {
        try {
            const order = await exchanges[exchange].createOrder(symbol, 'limit', side, amount, price);
            if (!order.id) throw new Error(`Couldnt get order id`);

            return order.id;
        }
        catch (error) {
            //Retry unlimited times in case of network error or retry untill max retries in case of not enough funds
            if (isNetworkError(error))
                if (retries < maxRetries) {
                    retries++;
                    retries < 4 ? await delay(3000) : await delay(15000);
                    return false;
                }
                else throw error;
            else if (error instanceof ccxt.InsufficientFunds) {
                if (retries < maxRetries) {
                    retries++;
                    retries < 4 ? await delay(3000) : await delay(15000);
                    return false;
                }
                else throw error;
            }
            else throw error;
        }
    }

    while (true) {
        try {
            const id = await tryCreateOrder();
            if (id !== false) return id;
            else settings.LOGS.botSys && console.log(`${new Date().toLocaleTimeString()} (${chalk.yellowBright(`${exchange} | ${symbol}`)}) is retrying a request on ${chalk.green('createOrder()')}, attempt: ${retries}/${maxRetries}`);
        }
        catch (error) {
            //If here we should pause the operation because the order could not be placed
            reportError(`placeOrder() (${exchange} | ${symbol} | ${side}) [${error.constructor?.name || 'Unknown error'}]: ${error.message || error}`);
            return false;
        }
    }
}

async function fetchOrder(exchange, id, symbol) {
    let retries = 0;
    const maxRetries = 15;

    async function tryFetchOrder() {
        try {
            const order = await exchanges[exchange].fetchOrder(id, symbol);
            if (order.status === 'processing') {
                if (retries < maxRetries) {
                    retries++;
                    retries < 4 ? await delay(3000) : await delay(15000);
                    return false;
                }
                else throw new Error('Order is always processing');
            }
            return order;
        }
        catch (error) {
            // IMPORTANT: do NOT treat ORDER_NOT_FOUND as network error – bubble it up so operate() can recreate.
            if (error instanceof ccxt.OrderNotFound) throw error;

            if (isNetworkError(error)) {
                if (retries < maxRetries) {
                    retries++;
                    retries < 4 ? await delay(3000) : await delay(15000);
                    return false;
                }
                else throw error;
            }
            else throw error;
        }
    }

    while (true) {
        try {
            const order = await tryFetchOrder();
            if (order !== false && order.status !== 'processing') return order;
            else settings.LOGS.botSys && console.log(`${new Date().toLocaleTimeString()} (${chalk.yellowBright(`${exchange} | ${symbol}`)}) is retrying a request on ${chalk.green('fetchOrder()')}, attempt: ${retries}/${maxRetries}`);
        }
        catch (error) {
            // If it's an ORDER_NOT_FOUND, let the caller handle (we recreate there).
            if (error instanceof ccxt.OrderNotFound) throw error;

            reportError(`fetchOrder() (${exchange} | ${symbol}) [${error.constructor?.name || 'Unknown error'}]: ${error.message || error}`);
            return false;
        }
    }
}

async function fetchOpenOrders(exchange, symbol) {
    let retries = 0;
    const maxRetries = 15;

    async function tryFetchOpenOrders() {
        try {
            const orders = await exchanges[exchange].fetchOpenOrders(symbol);
            return orders;
        }
        catch (error) {
            if (isNetworkError(error))
                if (retries < maxRetries) {
                    retries++;
                    retries < 4 ? await delay(3000) : await delay(15000);
                    return false;
                }
                else throw error;
            else throw error;
        }
    }

    while (true) {
        try {
            const orders = await tryFetchOpenOrders();
            if (orders !== false) return orders;
            else settings.LOGS.botSys && console.log(`${new Date().toLocaleTimeString()} (${chalk.yellowBright(`${exchange} | ${symbol}`)}) is retrying a request on ${chalk.green('fetchOpenOrders()')}, attempt: ${retries}/${maxRetries}`);
        }
        catch (error) {
            reportError(`fetchOpenOrders() (${exchange} | ${symbol}) [${error.constructor?.name || 'Unknown error'}]: ${error.message || error}`);
            return false;
        }
    }
}

async function cancelOrder(exchange, id, symbol) {
    let retries = 0;
    const maxRetries = 15;

    async function tryCancelOrder() {
        try {
            const order = await exchanges[exchange].cancelOrder(id, symbol);
            return order;
        }
        catch (error) {
            if (isNetworkError(error))
                if (retries < maxRetries) {
                    retries++;
                    retries < 4 ? await delay(3000) : await delay(15000);
                    return false;
                }
                else throw error;
            else throw error;
        }
    }

    while (true) {
        try {
            const order = await tryCancelOrder();
            if (order !== false) return order;
            else settings.LOGS.botSys && console.log(`${new Date().toLocaleTimeString()} (${chalk.yellowBright(`${exchange} | ${symbol}`)}) is retrying a request on ${chalk.green('cancelOrder()')}, attempt: ${retries}/${maxRetries}`);
        }
        catch (error) {
            reportError(`cancelOrder() (${exchange} | ${symbol}) [${error.constructor?.name || 'Unknown error'}]: ${error.message || error}`);
            return false;
        }
    }
}

/*
 
    END HANDLER FUNCTIONS

*/


/*
    The operate function, a brief description:

    Here is where magic happens, this function is responsible for creating the first order, canceling the order and changing its price, performing
    the opposite order on exchange B, saving trades on database and many more things on an operation.
    An automation can have many operations, and only one of them at time can pass through operate(), while an operation is in here the whole automation gets basically
    "paused" avoiding any risks of unwanted data coming in at the wrong time, we need to finish everything we need to do with the current operation before we can
    put another one here, we do that because when there is at least one buy and one sell operation they can interact with each other, and this may cause problems if
    one operation tries to interact with other that is currently perform some tasks like switching its place on the orderbook.

    One important thing to know about this function is that it performs 4 requests on exchange A, since exchange A will basically always be mercado, it has a rate limiting
    of 1850 request / minute
*/

async function operate(automation, operation) {
    operation.isDead();
    operation.keepAlive();
    operation.goBack();
    operation.mustCheck = false;

    if (!automation || automation.mustDelete || !automations[automation.id]) return;

    const { id, exchangeA, symbolA, exchangeB, symbolB } = automation;
    const { orderId, side, spread } = operation;

    //This function stops an operation and sends this info to frontend. This does not stops the entire automation.
    function pauseOperation(reason, status = false) {
        operation.reason = `${new Date().toLocaleTimeString()} ${reason}`;
        operation.status = status || 'paused';
        repository.updateAutomation(automation);
        wss.broadcast({
            type: 'operation',
            automationId: automation.id,
            operationId: operation.bubbleId,
            fields: [
                { field: 'status', data: 'paused' },
                { field: 'reason', data: operation.reason }
            ]
        });
    }

    //Rebalance the filled volume among the opposite operations
    function rebalance(amount) {
        //This filtering doesn't change the operations array, it do not remove any operation from the array
        for (let op of automation.operations.filter(o => o.side === oppoSide[side])) {
            op.amount += op.percentage * amount;
            op.remaining += op.percentage * amount;
            op.status = 'running'; //TODO -> review
            op.mustCheck = true;
            /**
             If the opposite order which we are rebalancing volume has the "finished" status it will have an orderID and since we set it "mustCheck" to true
             in the next iteration it will check the order and since it already has an orderID it will check it and see that it is filled and will perform the trade
             on the opposite side.
             Lets work on an example so we can understand what is happening:
             OP A sold 100
             it will set the buy OPs to check and perform its trade and rebalance
             so OP B (buy) now has 150 in its amount
             in the next iteration the buy OP got filled and is now closed, it will rebalance the volume on the sell OP which now may have 150
             and will perform the trade
             then in the next iteration the sell OP will be checked and since it already has an orderID it will see that the order is filled and will perfome
             the trade and rebalance, so now the sell OP has 0 on its amount and the buy OP has 150 and have its mustCheck set to true which will make it in the
             next iteration to be checked and the trade will be performed, and the cycle repeats, since both OP's are filled and already have some orderID
             
             >>>>>>> So the solution is: <<<<<<<<<<
             Whenever a OP is completely filled we MUST remove its orderID so this way if in the next iteration the opposite OP is completely filled too it wont
             make the sell OP to perform the trade again             
             */
        }
    }

    //This function is used to perform the opposite operation on exchange 
    async function trade(amount) {
        async function tryTrade() {
            try {
                const price = automation.ticker[side === 'buy' ? 'bid' : 'ask'] * Math.abs(exchanges[exchangeB].percentage + (side === 'buy' ? -1 : 1));
                await exchanges[exchangeB].createOrder(symbolB, 'limit', oppoSide[side], amount, price);

                operation.waitingAmount = 0;

                return true;
            }
            catch (error) {
                if (isNetworkError(error)) //Retry on network errors
                    return false;
                else if (belowMinimumAmount(error)) { //Sum the amount if its not higher than minimum
                    settings.LOGS.botOps && console.log(`${new Date().toLocaleTimeString()} (${chalk.yellowBright(`${exchangeB} | ${oppoSide[side]}`)}) Order amount is below minimum, ${chalk.cyanBright('summing')}: ${amount}`);
                    return operation.waitingAmount += amount;
                }
                else throw error;
            }
        }

        while (true) {
            try {
                const request = await tryTrade();
                if (request !== false) break;
                else settings.LOGS.botSys && console.log(`${new Date().toLocaleTimeString()} (${chalk.yellowBright(`${exchangeB} | ${symbolB}`)}) is retrying a request on ${chalk.green('trade()')}`);
            }
            catch (error) {
                reportError(`trade() (${exchangeB} | ${symbolB} | ${side}) [${error.constructor?.name || 'Unknown error'}]: ${error.message || error}`, 'warning');
                break;
            }
        }
    }

    //If theres no order yet in the operation so it creates the first one
    if (!orderId) {
        operation.orderId = await createOrder(exchangeA, symbolA, side, operation.remaining, operation.lastPrice, spread, operation.minPrice);

        wss.broadcast({ type: 'automation', data: automation });

        if (!operation.orderId) return pauseOperation('Não foi possível criar a primeira ordem');

        if (automations[id]) await repository.updateAutomation(automation);

        return;
    }

    //1st request, used to check the order status
    let order;
    try {
        order = await fetchOrder(exchangeA, orderId, symbolA);
    } catch (error) {
        if (error instanceof ccxt.OrderNotFound) {
            // Special handling: recreate the same order instead of retrying fetch 15x
            settings.LOGS.botOps && console.log(chalk.bgYellowBright.black(`${new Date().toLocaleTimeString()} (${symbolA} | ${side} | ${spread}) ORDER NOT FOUND. Recriando ordem...`));
            reportError(`[1ª tentativa] - (${symbolA} | ${side}) ORDER NOT FOUND. Recriando ordem...`, 'warning');

            operation.orderId = await createOrder(exchangeA, symbolA, side, operation.remaining, operation.lastPrice, spread, operation.minPrice);
            wss.broadcast({ type: 'automation', data: automation });

            if (!operation.orderId) return pauseOperation('Não foi possível recriar a ordem (1ª tentativa)');

            if (automations[id]) await repository.updateAutomation(automation);
            return;
        }
        // Any other unexpected error -> pause
        return pauseOperation('Não foi possível obter dados da ordem (1ª tentativa)');
    }
    if (!order) return pauseOperation('Não foi possível obter dados da ordem (1ª tentativa)');

    //Order was manually canceled by the user in the exchange interface, operation gets paused.
    if (order.status === 'canceled') {
        settings.LOGS.botOps && console.log(chalk.bgYellowBright.black(`${new Date().toLocaleTimeString()} (${symbolA} | ${side} | ${spread}) ORDER CANCELED BY USER!`));

        operation.remaining = 0;
        operation.amount = 0;

        if (automations[id]) await repository.updateAutomation(automation);

        return pauseOperation('Ordem cancelada manualmente na corretora');
    }

    //If it is not closed and not canceled it can only be open, so we cancell it
    if (order.status !== 'closed') {
        //2nd request, used to cancel the order
        let canceled = await cancelOrder(exchangeA, orderId, symbolA);
        if (!canceled) return pauseOperation('Não foi possível cancelar a ordem');

        if (canceled.status === 'closed') {
            //If order is surely canceled, it will ignore this condition and keep going, otherwise we can assume that the order amount is filled
            //This is a workaround to mercado API, that returns an error when trying to cancel an order that is already filled, thats the reason we assume it is filled
            order.filled = order.amount;
            order.status = 'closed';
        }
        else {
            //3rd request, another status checking to also make sure the order was not partially filled in the meantime while trying to cancel the order
            try {
                order = await fetchOrder(exchangeA, orderId, symbolA);
            } catch (error) {
                if (error instanceof ccxt.OrderNotFound) {
                    // Again: treat as missing on exchange -> recreate the order with same data
                    settings.LOGS.botOps && console.log(chalk.bgYellowBright.black(`${new Date().toLocaleTimeString()} (${symbolA} | ${side} | ${spread}) ORDER NOT FOUND after cancel check. Recreating with same params...`));
                    reportError(`[2ª tentativa] - (${symbolA} | ${side}) ORDER NOT FOUND. Recriando ordem...`, 'warning');

                    operation.orderId = await createOrder(exchangeA, symbolA, side, operation.remaining, operation.lastPrice, spread, operation.minPrice);
                    wss.broadcast({ type: 'automation', data: automation });

                    if (!operation.orderId) return pauseOperation('Não foi possível recriar a ordem (2ª tentativa)');

                    if (automations[id]) await repository.updateAutomation(automation);
                    return;
                }
                return pauseOperation('Não foi possível obter dados da ordem (2ª tentativa)');
            }
            if (!order) return pauseOperation('Não foi possível obter dados da ordem (2ª tentativa)');
        }
    }

    //When order has any execution, it should perform the opposite side trade on exchange B
    if (order.filled) {
        if (operation.trade) {
            //Perform the opposite operation on exchangeB and rebalance the filled amount on exchangeA
            await trade(order.filled + operation.waitingAmount);
            rebalance(order.filled);
        }

        operation.remaining -= order.filled;

        //If the order is tottaly filled, it will pause the operation, but it can start it again if the opposite operation volume gets filled too
        if (order.status === 'closed') {
            settings.LOGS.botOps && console.log(chalk.bgCyanBright.black(`${new Date().toLocaleTimeString()} (${symbolA} | ${side} | ${spread}) ORDER TOTTALY FILLED => ${order.filled}`));
            operation.orderId = false;
            operation.amount = 0;
            return pauseOperation('Ordem completamente executada', 'finished');
        }

        await repository.updateAutomation(automation);

        settings.LOGS.botOps && console.log(chalk.bgGreenBright.black(`${new Date().toLocaleTimeString()} (${symbolA} | ${side} | ${spread}) ORDER PARTIALLY FILLED, QTY: ${order.filled} => LEFT: ${order.remaining}`));

        wss.broadcast({
            type: 'operation',
            automationId: automation.id,
            operationId: operation.bubbleId,
            fields: [
                { field: 'remaining', data: operation.remaining }
            ]
        })
    }

    //4th request, used to create the new order
    operation.orderId = await createOrder(exchangeA, symbolA, side, operation.remaining, operation.lastPrice, spread, operation.minPrice);
    if (!operation.orderId) return pauseOperation('Não foi possível reposicionar a ordem');
}


//Data coming from exchange B
function handleTicker(automation, ticker) {
    if (!automation || !dolar.value || !ticker || !ticker.ask || !ticker.bid) return;

    //Keeps data cache on automation for faster access
    automation.ticker = {
        bid: ticker.bid,
        ask: ticker.ask
    };

    for (let operation of automation.operations) {
        if (operation.fixedMinPrice) continue;

        const price = ticker[operation.side === 'buy' ? 'bid' : 'ask'];
        const sameQuoteOrSymbol = (automation.symbolA === automation.symbolB) ||
            (automation.symbolA.split('/')[1] === automation.symbolB.split('/')[1]) ||
            (automation.symbolA.split('/')[1].includes('USD') && automation.symbolB.split('/')[1].includes('USD'));
        const { minPrice, executionPrice } = getMinPrice(price, dolar.value, operation, sameQuoteOrSymbol);

        if (minPrice) {
            settings.LOGS.botOps && console.log(`${new Date().toLocaleTimeString()} (${chalk.yellowBright(automation.symbolA)}) New ${chalk.cyanBright('minPrice')} for ${chalk[`${operation.side === 'buy' ? 'green' : 'red'}Bright`](`${operation.side} (${operation.spread})`)}: ${minPrice} | ${price}`);

            //If there is minPrice (its not false) so we assume theres also a executionPrice, since both are calculated the same way. So if theres no minPrice
            //we dont change anything
            operation.minPrice = minPrice;
            operation.executionPrice = executionPrice;
            operation.exchangePrice = price;

            wss.broadcast({
                type: 'operation',
                automationId: automation.id,
                operationId: operation.bubbleId,
                fields: [
                    { field: 'minPrice', data: minPrice },
                    { field: 'executionPrice', data: executionPrice },
                    { field: 'exchangePrice', data: price }
                ]
            })
        }
    }
}

//Data coming from exchange A
async function handleOrderBook(automation, book) {
    if (!automation || automation.busy || !automation.ticker || !book || !book.bids || !book.asks) return;

    automation.busy = true;

    //Remove the volume from the price levels in which I have orders, if I dont do that, the calculation will consider my orders as part of the book and will
    //try to place orders on top of them, entering in an infinite loop
    for (let operation of automation.operations) {
        for (let price of operation.side === 'buy' ? book.bids : book.asks) {
            if (price[0] === operation.lastPrice) {
                price[1] = Math.max(0, price[1] -= operation.remaining);
                break;
            }
        }
    }

    async function iterate() {
        //Iterate through operations, sells first
        for (let operation of automation.operations) {
            //Cant get target price without min price and cant create any order without amount
            if (operation.status !== 'running' || !operation.minPrice || !operation.remaining || !operation.amount) {
                //Here we make sure operation.mustCheck is set back to false, because sometimes can happen that an operation is inside operate() and it is totally filled
                //since it is inside operate() the bot will know, but, the handleTrades() might also find out the same and set the mustCheck to true, but since the order
                //is already filled and has no amount left it will continue this loop and never check the order, cus when there's no amount it will ignore the mustCheck
                //since it only gets checked after this "if" statement, this way we would enter an infinite loop, never checking the operation and always keeping it
                //mustCheck property true because the "while" loop after this iterate() function would cause it to run again and so on...
                operation.mustCheck = false;
                continue;
            }

            //Try to get a new target price, if a value is returned is assumed that the order must change its price
            const newPrice = getTargetPrice(book, operation);

            if (newPrice) {
                operation.lastPrice = newPrice

                wss.broadcast({
                    type: 'operation',
                    automationId: automation.id,
                    operationId: operation.bubbleId,
                    fields: [
                        { field: 'lastPrice', data: newPrice },
                        { field: 'status', data: 'running' }
                    ]
                });
            }

            //If theres no minPrice and theres no need to check, goes to next
            if (!newPrice && !operation.mustCheck) continue;


            //The only place where operate can be called, no other function should call the operate function
            await operate(automation, operation);

            //If the automation gets edited/canceled this automation must be deleted, but it will wait untill the iteration has finished to delete it
            //but sometimes theres no enough funds to create an order and it will get stuck in the createOrder() function untill all the retries has finished
            //this will cause the bot to create a duplicate automation because the editAutomation() doesn't wait for the cancelAutomation() to finished and it
            //could never do that because the cancelAutomation() is async, if it cant delete it will set the mustDelete to true and the iteration resolves it
            //here
        }
    }

    //This iterates each operation using the operate function
    await iterate();

    //If after iterating, for some reason the operation needs to be checked we iterate again untill all checks are done
    while (true) {
        if (automation.operations.some(op => op.mustCheck)) {
            settings.LOGS.botSys && console.log(`${new Date().toLocaleTimeString()} (${automation.symbolA}) Iterating again...`);
            await iterate();
        }
        else break;
    }

    if (automation.mustDelete)
        stopAutomation(automation.id, true);
    else
        automation.busy = false;
}

//Data coming from exchange A
function handleTrades(automation, price) {
    //This function is used to check if any of the automation's operations has its order filled, if so it will perform the opposite operation on exchange B 
    if (!automation) return;

    for (let operation of automation.operations) {
        if (!operation.amount || !operation.lastPrice) continue;
        if (operation.side === 'buy' && price > operation.lastPrice) continue;
        if (operation.side === 'sell' && price < operation.lastPrice) continue;

        operation.mustCheck = true;

        settings.LOGS.botOps && console.log(`${new Date().toLocaleTimeString()} (${automation.symbolA}) ${chalk[`${operation.side === 'buy' ? 'green' : 'red'}Bright`](`${operation.side} (${operation.spread})`)} order at ${operation.lastPrice} ${chalk.cyanBright('EXECUTED')}`);
    }
}



function startAutomation(automation) {
    const { id, exchangeA, symbolA, exchangeB, symbolB, buyAmount, sellAmount } = automation;

    if (!exchanges[exchangeA] || !exchanges[exchangeB]) return;
    //Here we make sure that we at least try, to cancel any open order if there is any operation with an orderId. This is done asynchronously because if the bot
    //tries to place an order and there's no balance it will retry a few times, so in case the canceling request takes some time we make sure we still create the order
    if (automation.operations.some(op => op.orderId)) cancelAllOrders(exchangeA, symbolA);

    //When we perform this iteration we sort the operations array with sells first, we do that because the bookHandler needs to iterate from sells first
    for (let operation of automation.operations.sort((a, b) => a.side === 'sell' ? -1 : 1)) {
        operation.status = operation.status || 'running';

        //Set the amount in crypto this operation will use, if there is already an amount from a previously running operation, it will use it
        operation.amount = operation.remaining || operation.percentage * (operation.side === 'buy' ? buyAmount : sellAmount);
        operation.remaining = operation.amount;

        operation.orderId = false; //This will be used to store the orderId returned by the exchange A when the order is created
        operation.lastPrice = false; //This is the last price calculated by the bot based on the operation parameters set by the user
        operation.mustCheck = false; //This will be used to force the bot to check the order status in the next iteration
        operation.allowedToGoBack = true; //This tells the bot if its allowed to go back to the best price or if should keep front running

        if (!operation.waitingAmount) operation.waitingAmount = 0; //If a trade is not possible because of minimum amount, it will store the amount here
        if (!operation.fixedMinPrice) operation.minPrice = false; //This is the minimum price the bot will accept to place the order
        if (!operation.executionSpread) operation.executionSpread = false;
        if (operation.executionSpread || !operation.executionPrice) operation.executionPrice = false;

        operation.allowGoingBack = debounce(function () {
            if (!automations[id]) return;

            operation.allowedToGoBack = true;
            settings.LOGS.botOps && console.log(`${new Date().toLocaleTimeString()} (${chalk.yellowBright(symbolA)} | ${operation.side} | ${operation.spread}) Going back to best price...`);
        }, 30000);

        operation.goBack = function () {
            if (!automations[id]) return;

            operation.allowedToGoBack = false;
            operation.allowGoingBack();
        };

        //This will make sure that if the order didnt get checked in the last 3 minutes it will force it to check its operations orders
        operation.keepAlive = debounce(async () => {
            if (!automations[id]) return;

            operation.mustCheck = true;

            const book = await fetchOrderBook(exchangeA, symbolA);
            handleOrderBook(automation, book);

            settings.LOGS.botSys && console.log(`${new Date().toLocaleTimeString()} (${chalk.yellowBright(`${symbolA} | ${operation.side}`)} KEEP ALIVE) Fetching ${chalk.green('book')} due to ${chalk.green(exchangeA)} inactivity`);
        }, 180000);

        operation.isDead = debounce(async () => {
            if (!automations[id] || operation.status === 'finished') return;

            //This dont change the operation status to paused, it only alerts the frontend, because if the status was changed to paused, it would never
            //try again to reanimate the operation, but all of this is an error, because it SHOULD be forcing the order to move every 3 minutes, and thats not happening
            wss.broadcast({
                type: 'operation',
                automationId: automation.id,
                operationId: operation.bubbleId,
                fields: [
                    { field: 'status', data: 'paused' },
                    { field: 'reason', data: 'Operação parada há mais de 5 minutos' }
                ]
            });
            console.log(`${new Date().toLocaleTimeString()} (${symbolA}) Operação parada:`, operation)
            reportError(`(${symbolA}) Operação parada há mais de 5 minutos`);
        }, 300000);
    }

    //Count how many orders there are for the symbol every 3 minutes and send it to frontend, so if there is more than should be we can do something
    if (intervals[id]) clearInterval(id);

    intervals[id] = setInterval(async () => {
        const openOrders = await fetchOpenOrders(exchangeA, symbolA);
        automation.orderCount = openOrders.length;
        wss.broadcast({ type: 'automationField', id, field: 'orderCount', data: automation.orderCount });
    }, 180000);

    automation.orderCount = automation.operations.length;
    automation.busy = false;

    if (!automations[id]) automations[id] = automation;

    //Starter functions
    async function startTicker() {
        automation.tickerStream = true;

        const firstData = await fetchTicker(exchangeB, symbolB);
        handleTicker(automation, firstData);

        (async () => {
            while (automation.tickerStream) {
                if (!automations[id]) break;

                try {
                    // Create a promise that after 10 seconds fetch the data instead of waiting for the websocket
                    const timeout = new Promise((_, reject) => setTimeout(() => reject(new ccxt.InvalidAddress()), 10000));

                    // Fetch the exchange ticker data with a race against the timeout, if the stream resolvers first we will use its data, instead we do a request
                    const ticker = await Promise.race([exchanges[exchangeB].watchTicker(symbolB), timeout]);

                    // This way, we will always have data to use here
                    handleTicker(automations[id], ticker);
                }
                catch (error) {
                    if (error instanceof ccxt.InvalidAddress) {
                        const ticker = await fetchTicker(exchangeB, symbolB);
                        handleTicker(automations[id], ticker);
                        settings.LOGS.botSys && console.log(`${new Date().toLocaleTimeString()} (${chalk.yellowBright(`${exchangeB} | ${symbolB}`)}) Fetching ${chalk.green('ticker')} due to ${chalk.green(exchangeB)} inactivity`);
                    }
                    else if (!isNetworkError(error))
                        reportError(`tickerStream (${exchangeB} | ${symbolB}) [${error.constructor?.name || 'Unknown error'}]: ${error.message || error}`);
                }
            }
            settings.LOGS.botSys && console.log(`${new Date().toLocaleTimeString()} (${chalk.yellowBright(`${exchangeB} | ${symbolB}`)}) Successfully stoped ${chalk.green('ticker')} stream`);
        })()
    }

    async function startBook() {
        automation.bookStream = true;

        const firstData = await fetchOrderBook(exchangeA, symbolA);
        if (firstData !== false) await handleOrderBook(automations[id], firstData);

        (async () => {
            while (automation.bookStream) {
                if (!automations[id]) break;

                try {
                    const book = await exchanges[exchangeA].watchOrderBook(symbolA, 50);
                    handleOrderBook(automations[id], book);
                }
                catch (error) {
                    if (!isNetworkError(error))
                        reportError(`tickerStream (${exchangeB} | ${symbolB}) [${error.constructor?.name || 'Unknown error'}]: ${error.message || error}`);
                }
            }
            settings.LOGS.botSys && console.log(`${new Date().toLocaleTimeString()} (${chalk.yellowBright(`${exchangeA} | ${symbolA}`)}) Successfully stoped ${chalk.green('book')} stream`);
        })()
    }

    function startTrades() {
        automation.tradeStream = true;

        (async () => {
            while (automation.tradeStream) {
                if (!automations[id]) break;

                try {
                    const trade = await exchanges[exchangeA].watchTrades(symbolA, 0, 1);
                    const ticker = await exchanges[exchangeA].watchTicker(symbolA);
                    if (trade && trade.side && ticker && ticker.last) handleTrades(automations[id], ticker.last);
                }
                catch (error) {
                    if (!isNetworkError(error))
                        reportError(`tickerStream (${exchangeB} | ${symbolB}) [${error.constructor?.name || 'Unknown error'}]: ${error.message || error}`);
                }
            }
            settings.LOGS.botSys && console.log(`${new Date().toLocaleTimeString()} (${chalk.yellowBright(`${exchangeA} | ${symbolA}`)}) Successfully stoped ${chalk.green('trades')} stream`);
        })()
    }

    startTicker().then(() => startBook().then(() => startTrades()));
}

async function start() {
    const activeAutomations = await repository.getAutomations();
    if (!activeAutomations.length) return;

    for (let automation of activeAutomations) {
        //We wait 1.5 seconds before starting the automation to avoid getting rate limited on the first requests
        await delay(1500);
        startAutomation(automation);
    }
}

const waitingAutomations = {};

function stopAutomation(id, force = false) {
    if (intervals[id]) clearInterval(id);

    const automation = automations[id];
    if (!automation) return false;

    const { exchangeA, symbolA } = automation;

    if (automation.busy && !force) {
        automation.mustDelete = true;
        return;
    }

    delete automations[id];

    repository.deleteAutomation(id);

    wss.broadcast({ type: 'delete', automationId: id });

    if (exchangeA && symbolA) cancelAllOrders(exchangeA, symbolA);

    settings.LOGS.botSys && console.log(`${new Date().toLocaleTimeString()} (${chalk.green(exchangeA)} | ${chalk.yellowBright(symbolA)}) Stoped automation successfully`);

    if (waitingAutomations[id]) {
        const automationToStart = waitingAutomations[id];
        delete waitingAutomations[id];
        startAutomation(automationToStart);
    }

    return true;
}

function editAutomation(id, automation) {
    const stoped = stopAutomation(id);

    if (!stoped) waitingAutomations[id] = automation;
    else startAutomation(automation);
}

export default { startAutomation, start, stopAutomation, editAutomation };