import { Schema } from "redis-om";

const exchangeSchema = new Schema('exchange', {
    enabled: { type: 'boolean' },
    name: { type: 'string' },
    apiKey: { type: 'string' },
    secret: { type: 'string' },
    created_at: { type: 'date' },
    updated_at: { type: 'date' },
    percentage: { type: 'number' }
});

export default exchangeSchema;