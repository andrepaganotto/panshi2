import { createClient } from 'redis';

const redis = createClient({
    password: process.env.DB_PASSWORD,
    socket: {
        host: process.env.DB_HOST,
        port: parseInt(process.env.DB_PORT)
    }
});
redis.on('error', (err) => console.log('Redis Client Error', err));
redis.on('connect', async () => console.log('Running Redis Database Client'));

export default redis;
