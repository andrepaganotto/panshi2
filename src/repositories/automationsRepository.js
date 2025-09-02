import { Repository, EntityId } from "redis-om";

import database from '../redis.js';
import schema from '../schemas/automationSchema.js';

const repository = new Repository(schema, database);

function createIndex() {
    return repository.createIndex();
}

async function createAutomation(automation) {
    try {
        automation.created_at = new Date();
        automation.updated_at = new Date();

        automation = await repository.save(automation);
        automation.id = automation[EntityId];

        return automation;
    }
    catch (error) {
        console.error('Failed to INSERT automation in database', error);
        return false;
    }
}

async function getAutomation(id) {
    try {
        const automation = await repository.fetch(id);
        return automation;
    }
    catch (error) {
        console.error('Failed do FETCH automation from database', error);
        return false;
    }

}

async function getAutomations() {
    try {
        const automations = await repository.search().returnAll();
        return automations;
    }
    catch (error) {
        console.error('Failed do FETCH automations from database', error);
        return false;
    }
}

async function updateAutomation(automation) {
    try {
        automation.updated_at = new Date();
        await repository.save(automation);
        return automation;
    }
    catch (error) {
        console.error('Failed to UPDATE automation on database', error);
        return false;
    }
}

async function deleteAutomation(id) {
    try {
        await repository.remove(id);
        return true;
    }
    catch (error) {
        console.error('Failed to DELETE automation from database', error);
        return false;
    }
}

export default { createIndex, createAutomation, getAutomation, getAutomations, updateAutomation, deleteAutomation }

/*
    Automations format (used to display them in the frontend)
    
    + | ; are splitters

    + is used to split the exchange and the automations
    | is used to split the automation's ID, its data and its operations
    ; is used to split automation's data and its operations data
    
    {
        1 "exchange": "binance"
        +
        2...N "automation": 
            1 "id": "01J72CV3Z0P2NMPBA6AP8HYBK5",
            |
            2
                2.1 "exchangeA": "mercado"
                ;
                2.2 "symbolA": "MEME/BRL"
                ;
                2.3 "buyAmount": 200
                ;
                2.4 "sellAmount": 200
                ;
                2.5 "orderCount": 2
            |
            3...N "operations"
                N.1  "side": "sell",
                ;
                N.2  "lastPrice": 0.05279706,  //CHANGES
                ;
                N.3  "executionPrice": 123,    //MAY CHANGE
                ; and so on...
                N.4  "remaining": 200,         //CHANGES
                N.5  "amount": 200,            //CHANGES
                N.6  "percentage": 1,
                N.7  "spread": 1.05,           //If theres no spread we can assume the "fixedMinPrice" is true
                N.8  "executionSpread": 123,   //For this to have a value "fixedMinPrice" needs to be false, but it may or may not have a value
                N.9  "minPrice": 0.05230462,   //MAY CHANGE
                N.10 "exchangePrice": 0.00887, //MAY CHANGE
                N.11 "trade": true,
                N.12 "status": "running",      //MAY CHANGE
                N.13 "reason": "OK"            //MAY CHANGE
        +
    }
*/