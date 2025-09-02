import axios from "axios";
import chalk from "chalk";
import { wss } from '../server.js';
import { settings } from "../controllers/settingsController.js";

export const oppoSide = { buy: 'sell', sell: 'buy' };

export function debounce(callback, delay = 15000) {
    let timeout;
    return function (...args) {
        const context = this;
        clearTimeout(timeout);
        timeout = setTimeout(function () {
            callback.apply(context, args);
        }, delay);
    }
}

export const randInt = max => Math.ceil(Math.random() * max);

export const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

export const capitalize = str => str.charAt(0).toUpperCase() + str.slice(1);

export function getDelay(created_at, origin = false) {
    const now = Date.now();
    const delay = parseFloat(((now - created_at) / 1000).toFixed(3)); //time difference between the data creation ts and the ts the data arrived here
    origin && console.log(`(${origin}) ${chalk.yellowBright(new Date(created_at).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo' }))} > ${chalk.yellowBright(new Date(now).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo' }))} | DELAY: ${chalk.green(delay)}`);
    return delay;
}

export const toggleRequestLogs = () => LOGS = !LOGS;
export function rateLimiter(limit = 500, interval = 60000) {
    const queue = [];
    const timestamps = [];

    async function processQueue() {
        while (timestamps[0] <= Date.now() - interval) timestamps.shift();
        settings.LOGS.request && wss.broadcast({ type: 'requests', data: timestamps.length });
        while (queue.length && timestamps.length < limit) {
            timestamps.push(Date.now());
            call(queue.shift());
        }
    }
    setInterval(processQueue, 1000);

    async function call(request) {
        const { config, resolve, reject } = request;

        try {
            const response = await axios.request(config);
            if (response && response.data) resolve(response.data);
        }
        catch (error) {
            reject(error);
        }

        processQueue();
    }

    return (config = { method, headers, data, url }) => new Promise((resolve, reject) => {
        queue.push({ config, resolve, reject });
        processQueue();
    });
}