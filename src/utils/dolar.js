import ccxt from 'ccxt';
import { wss } from '../server.js';

const binance = new ccxt.pro.binance();

export const dolar = { value: false };

async function start() {
    await binance.loadMarkets();

    (async () => {
        while (true) {
            try {
                const data = await binance.watchTicker('USDT/BRL');
                if (data && data.last && data.last !== dolar.value) {
                    wss.broadcast({ type: 'dolar', data: dolar.value });
                    dolar.value = data.last;
                }
            }
            catch (error) {
                if (!error instanceof ccxt.NetworkError)
                    console.error(`Error on dolar stream => [${error.constructor.name}]: ${error.message}`);
            }
        }
    })()

    return;
}

export default { start };