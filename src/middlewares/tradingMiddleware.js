import { exchanges } from "../apps/exchanges.js";
import { isNetworkError } from "../utils/errors.js";

export default async function (req, res, next) {
    let { exchangeA, symbolA, exchangeB, symbolB, buyAmount, sellAmount } = req.body;

    if (!exchangeA || !symbolA || !exchangeB || !symbolB || (!sellAmount && !buyAmount) || !req.body.operations.length)
        return res.status(400).json({ message: 'Missing data' });

    if (!exchanges[exchangeA] || !exchanges[exchangeB])
        return res.status(404).json({ message: 'Exchanges unavailable!' });

    if (!exchanges[exchangeA].markets[symbolA] || !exchanges[exchangeB].markets[symbolB])
        return res.status(404).json({ message: 'Symbols unavailable!' });

    //When no operation is being executed on the other side theres no need to check for balance
    if (req.body.operations.every(op => !op.trade)) {
        for (let operation of req.body.operations) {
            //This is performed once, the spread and slipage fields are modified forever, to fit the desired format used by the bot
            if (operation.executionSpread) operation.executionSpread = Math.abs(operation.executionSpread + (operation.side === 'buy' ? -1 : 1));
            operation.spread = Math.abs(operation.spread + (operation.side === 'buy' ? -1 : 1));
            operation.slipage = parseFloat((operation.slipage * 100).toFixed(2));
        }

        return next();
    }


    const [baseA, quoteA] = symbolA.split('/');
    const [baseB, quoteB] = symbolB.split('/');

    let balanceA = false, balanceB = false;

    async function tryFetchBalance(side) {
        try {
            const balance = await exchanges[side === 'A' ? exchangeA : exchangeB].fetchBalance();
            return balance[side === 'A' ? baseA : baseB].total;
        }
        catch (error) {
            if (isNetworkError(error)) return false;
            else throw error;
        }
    }

    while (true) {
        try {
            if (sellAmount && balanceA === false) balanceA = await tryFetchBalance('A');
            if (buyAmount && balanceB === false) balanceB = await tryFetchBalance('B');
            if ((sellAmount && balanceA !== false) || (buyAmount && balanceB !== false)) break;
        }
        catch (error) {
            console.error('Failed to fetch balances on tradingMiddleware', error);
            return res.status(500).json({ message: 'Error fetching balances, try again later' });
        }
    }

    if (sellAmount && balanceA < sellAmount)
        return res.status(422).json({ message: `Insufficient balance on ${exchangeA}` });
    if (buyAmount && balanceB < buyAmount)
        return res.status(422).json({ message: `Insufficient balance on ${exchangeB}` });

    for (let operation of req.body.operations) {
        //This is performed once, the spread and slipage fields are modified forever, to fit the desired format used by the bot
        if (operation.executionSpread) operation.executionSpread = Math.abs(operation.executionSpread + (operation.side === 'buy' ? -1 : 1));
        operation.spread = Math.abs(operation.spread + (operation.side === 'buy' ? -1 : 1));
        operation.slipage = parseFloat((operation.slipage * 100).toFixed(2));
    }

    return next();
}

/*
    raw operation = {
        bubbleId,
        side,
        percentage -> used to calculate the "amount",
        spread -> used to calculate the "agio",
        maxVol,
        priceTick,
        slipage
    }
*/