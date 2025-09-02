import { capitalize, toggleRequestLogs } from "../utils/generics.js";
import pm2 from 'pm2';

export const settings = {
    LOGS: {
        botSys: false,
        botOps: false,
        mercado: false,
        request: true
    },

    //Acceptable delay (in seconds) for each Websocket channel on Mercado Bitcoin
    DELAYS: {
        Ticker: 1.5,
        OrderBook: 1.2,
        Trades: 5
    }
}

function toggleLogs(req, res) {
    const channel = req.params.channel;

    if (!(channel in settings.LOGS))
        return res.status(404).json({ message: 'Channel not found' });

    settings.LOGS[channel] = !settings.LOGS[channel];

    return res.json({ LOGGING: settings.LOGS[channel] });
}

function changeDelay(req, res) {
    const channel = capitalize(req.params.channel);
    const value = parseFloat(req.body.value);

    if (!(channel in settings.DELAYS))
        return res.status(404).json({ message: 'Channel not found' });

    if (!value)
        return res.status(400).json({ message: 'Invalid value' });

    settings.DELAYS[channel] = value;

    return res.json({ value });
}

function getSettings(req, res) {
    return res.json(settings);
}

function restart(req, res) {
    res.status(200).end();
    process.exit(1);
}

function stop(req, res) {
    res.status(200).end();
    pm2.connect((err) => {
        if (err) {
            console.error('ERROR TRYING TO STOP APPLICATION (PM2 CONNECT):', err);
            process.exit(2);
        }

        // This stops the process without restarting it
        pm2.stop('panshi', (err) => {
            pm2.disconnect();   // Disconnects the PM2 instance
            if (err) {
                console.error('ERROR TRYING TO STOP APPLICATION (PM2 STOP):', err);
                process.exit(2);
            }
        });
    });
}

export default { toggleLogs, changeDelay, getSettings, stop, restart };