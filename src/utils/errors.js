import ccxt from "ccxt";
import { wss } from "../server.js";

export const lastErrors = [];

export function belowMinimumAmount(e) {
    if (e instanceof ccxt.BadRequest && e.message.includes('NOTIONAL'))
        return true;
    else if (e instanceof ccxt.InvalidOrder && e.message.includes('must be greater than minimum'))
        return true;
    else if (e instanceof ccxt.BadRequest && e.message.includes('is too small'))
        return true;
    else if (e instanceof ccxt.InvalidOrder && e.message.includes('cannot be less than')) //mex
        return true;
    else
        return false;
}

export function isNetworkError(e) {
    if (e instanceof ccxt.DDoSProtection || e?.message?.includes('ECONNRESET'))
        return true;
    else if (e instanceof ccxt.RequestTimeout)
        return true;
    else if (e instanceof ccxt.NetworkError)
        return true;
    else
        return false;
}

export function mercadoNetworkError(code, status) {
    if (code === 'API_GENERIC_ERROR')
        return true;
    else if (code === 'AxiosError: AggregateError' || code.includes('AggregateError'))
        return true;
    else if (code === 'AxiosError: Request failed with status code 401' || status === 401)
        return true;
    else if (code === 'AxiosError: Request failed with status code 403' || status === 403)
        return true;
    else if (code === 'AxiosError: Request failed with status code 429' || status === 429) //Limit exceeded
        return true;
    else if (code === 'AxiosError: Request failed with status code 524' || status === 524)
        return true;
    else if (code === 'AxiosError: Request failed with status code 520' || status === 520)
        return true;
    else if (code === 'AxiosError: Request failed with status code 504' || status === 504)
        return true;
    else if (code === 'AxiosError: Request failed with status code 503' || status === 503)
        return true;
    else if (code === 'AxiosError: Request failed with status code 502' || status === 502)
        return true;
    else if (code === 'AxiosError: Request failed with status code 500' || status === 500)
        return true;
    else if (code === 'socket hang up')
        return true;
    else
        return false;
}

//Sends the error message to frontend via websockets
export function reportError(error, level = false) {
    error = `${new Date().toLocaleTimeString()} ${error}`;

    lastErrors.unshift(error);
    if (lastErrors.length > 500) lastErrors.pop();

    console.error(error);

    wss.broadcast({
        type: level || 'error',
        data: error
    });
}
