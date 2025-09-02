import app from "./app.js";
import redis from './redis.js';
import bot from "./apps/bot.js";
import exchanges from "./apps/exchanges.js";

//Load the repositories
import exchangeRepository from './repositories/exchangeRepository.js';
import automationsRepository from "./repositories/automationsRepository.js";

//Used to get the dolar value in real time
import dolar from './utils/dolar.js';

//Server
const port = parseInt(process.env.PORT);
const server = app.listen(port, () => console.log(`Server running on port: ${port}`));

import wsServer from "./wss.js";
export const wss = wsServer(server);

async function run() {
	try {
		//Connect to Redis instance
		await redis.connect();

		//Create the indexes for Redis collections
		await exchangeRepository.createIndex();
		await automationsRepository.createIndex();

		//Load the exchanges
		await exchanges.loadExchanges();

		//Starts the dolar listener
		await dolar.start();

		//Starts the bot after everything is ready and loaded
		bot.start();
	}
	catch (error) {
		console.error('Error on server startup', error);
	}
}

run();