import repository from "../repositories/exchangeRepository.js";
import exchanges, { getExchangeSymbols } from "../apps/exchanges.js";

async function cancelAllOrders(req, res) {
    try {
        await exchanges.mercado.cancelAllOrders();

        return res.status(200).json({ message: 'ok' });
    }
    catch (error) {
        return res.status(400).json({ message: 'Error cancelling orders' });
    }
}

async function enableExchange(req, res) {
    const id = req.params.id;
    const data = req.body;

    if (!data.apiKey || !data.secret || !data.percentage)
        return res.status(400).json({ message: 'Missing data' });

    const exchange = await repository.enableExchange(id, data);

    if (exchange && exchange.alreadyEnabled)
        return res.status(409).json({ message: 'Exchange already enabled!' });
    else if (!exchange)
        return res.status(409).json({ message: 'Invalid API key and/or secret' });

    return res.status(201).json(exchange);
}

async function getExchanges(req, res) {
    const disabledExchanges = await repository.getExchanges();
    const enabledExchanges = await repository.getExchanges(false);
    return res.json([...disabledExchanges, ...enabledExchanges]);
}

async function updateExchange(req, res) {
    const id = req.params.id;
    const data = req.body;

    let exchange = await repository.getExchange(id);
    if (!Object.keys(exchange).length || !exchange.enabled)
        return res.status(400).json({ message: `Exchange can't be updated` });

    if (!data.apiKey || !data.secret)
        return res.status(400).json({ message: 'Missing data' });

    const credentialIsValid = await exchanges.setupExchange(id, data, true);
    if (!credentialIsValid)
        return res.status(409).json({ message: 'Invalid API key and/or secret' });

    exchange = await repository.updateExchange(data, exchange);
    return res.json(exchange);
}

async function disableExchange(req, res) {
    const id = req.params.id;
    const exchange = await repository.getExchange(id);

    if (!Object.keys(exchange).length || !exchange.enabled)
        return res.status(400).json({ message: 'Exchange not found or not even enabled' });

    await repository.disableExchange(id, exchange);
    return res.status(204).end();
}

async function getSymbols(req, res) {
    const id = req.params.id;
    const refresh = req.query.refresh;
    const filter = req.query.filter;

    const symbols = await getExchangeSymbols(id, refresh, filter);
    if (!symbols) return res.status(400).json({ message: 'Exchange not found or not even enabled' });

    return res.json(symbols);
}

export default { enableExchange, getExchanges, updateExchange, disableExchange, getSymbols, cancelAllOrders };