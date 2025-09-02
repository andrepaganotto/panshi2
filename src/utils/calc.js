export function getMinPrice(price, dolar, { spread, executionSpread, minPrice, slipage }, sameSymbol = false) {
    if (!price || !dolar) return;

    let spreadPrice = parseFloat((price * (sameSymbol ? 1 : dolar) * spread).toFixed(8));
    let executionPrice = executionSpread ? parseFloat((price * (sameSymbol ? 1 : dolar) * executionSpread).toFixed(8)) : false;

    if (minPrice) {
        const priceDiff = Math.abs(minPrice / spreadPrice - 1) * 100;
        if (priceDiff < slipage) spreadPrice = false;
    }

    return { minPrice: spreadPrice, executionPrice };
}

export function getTargetPrice(book, { side, minPrice, maxVol, lastPrice = 0, priceTick, allowedToGoBack, executionPrice } = {}) {
    if (!book || !minPrice) return;

    let volSum = 0;
    let targetPrice;

    const orders = side === 'buy' ? book.bids : book.asks;
    const oppositeOrders = side === 'buy' ? book.asks : book.bids;
    const priceComparison = side === 'buy' ? (a, b) => a <= b : (a, b) => a >= b;
    const priceAdjustment = side === 'buy' ? priceTick : -priceTick;

    //I iterate trough the opposite orders to find the target price, if there is a order with the same price as the execution price, the target price will be that price
    if (executionPrice) for (let i = 0; i < oppositeOrders.length; i++) {
        const price = oppositeOrders[i][0];
        if (priceComparison(price, executionPrice)) targetPrice = price;
        else break;
    }

    //Here I iterate trough the orders to find the target price, if there is no target price yet, I will find the first price that is lower than the minPrice
    if (!targetPrice) for (let i = 0; i < orders.length; i++) {
        let price = orders[i][0];

        if (priceComparison(price, minPrice)) {
            for (; i < orders.length; i++) {
                price = orders[i][0];
                let qty = orders[i][1];
                let vol = price * qty;

                volSum += vol;
                if (volSum > maxVol) break;
                if (price === lastPrice && !allowedToGoBack) return false;
            }

            targetPrice = parseFloat((price + priceAdjustment).toFixed(8));
            if (targetPrice === lastPrice) return false;
            break;
        }
    }

    return targetPrice;
}

/*

The above function is basically perfect, it will always return false or the targetPrice, it simply dont throw errors
it only fails when data that comes in is not in correct format, so to avoid any confusion and to avoid to function being considered faulty
I state here the format in which the incoming book data should be for the function to work properly

The book object MUST be like this: 
    book = {
        bids: [
            [99, 5],
            [98.99, 2.6],
            [98, 9],
            [97.3, 0.5],
            ...
        ]
        asks: [
            [100, 1.5],
            [101, 0.7],
            [101.9, 1.1],
            [102, 3],
            ...
        ]
    }
Where each element on bids and asks array is a price level, being the first element the price and the second element the amount on that price

Whenever there is orders on the book, their price levels should be removed from the book by subtracting their volume from the level, e.g:
    myBuyOrders = [
        [98.99, 1.1],
        [97.3, 0.5]
    ]

    mySellOrders = [
        [101, 0.2]
    ]


    So after removing my orders from the book it should look like this:
    book = {
        bids: [
            [99, 5],
            [98.99, 1.5], (2.6 - 1.1)
            [98, 9],
            [97.3, 0], (0.5 - 0.5)
            ...
        ]
        asks: [
            [100, 1.5],
            [101, 0.5], (0.7 - 0.2)
            [101.9, 1.1],
            [102, 3],
            ...
        ]
    }

If the book object always come in the correct format theres is no reason for getting errors, of course if any that is undefined or something like that the
function will throw errors, but again, due to parameter not being correct.

Two most common errors on formating the book object are the following:
1. Competing with itself - When receiving outdated book data there a chance some old order of our own is still there even after being canceled, since the bot is already using the next price
and not considering the old price we see on the book anymore it will be considered another persons order, but we know it is not, it is our order that due to a broadcast
delay was sent on the book data. This will cause the function to give the target price based on that order (if there is no bigger order on front) and the bot will
basically start to compete with itself, entering an infinite loop until there is a low latency data or there is a bigger order on front of ours.

2. Creating orders on nonsense prices - If for some reason when subtracting our order volumes from the book price levels we subtract a value that is already 0 we will
get negative values, which will result on the function going deeper on price levels to reach a level in which the maxVol criteria is met. Since there is a price level
with a negative amount value, it will need to sum more on the volSum than needed.


*/