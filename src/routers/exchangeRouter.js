import { Router } from "express";
import controller from "../controllers/exchangeController.js";

const router = Router();

router.post('/cancelall', controller.cancelAllOrders);

router.post('/:id', controller.enableExchange);

router.get('/:id/symbols', controller.getSymbols);

router.get('/', controller.getExchanges);

router.patch('/:id', controller.updateExchange);

router.delete('/:id', controller.disableExchange);

export default router;