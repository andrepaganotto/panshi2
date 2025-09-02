import { Schema } from "redis-om";

const tradeSchema = new Schema('trade', {
    DATA: { type: 'date' },
    TIPO: { type: 'string' },
    CORRETORA: { type: 'string' },
    ATIVO: { type: 'string' },
    QUANTIDADE: { type: 'number' },
    VALOR: { type: 'number' },
    DOLAR: { type: 'number' }
});

export default tradeSchema;