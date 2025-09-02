import { Schema } from "redis-om";

const automationSchema = new Schema('automation', {
    exchangeA: { type: 'string' },
    symbolA: { type: 'string' },      //REQUIRED
    exchangeB: { type: 'string' },    //REQUIRED
    symbolB: { type: 'string' },      //REQUIRED
    buyAmount: { type: 'number' },    //REQUIRED
    sellAmount: { type: 'number' },   //REQUIRED
    created_at: { type: 'date' },
    updated_at: { type: 'date' }
});

export default automationSchema;