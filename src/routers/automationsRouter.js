import { Router } from "express";
import controller from "../controllers/automationsController.js";
import tradingMiddleware from "../middlewares/tradingMiddleware.js";

const router = Router();

router.post('/', tradingMiddleware, controller.createAutomation);

router.get('/db', controller.getAutomationsDB);

router.get('/:id', controller.getAutomation);

router.get('/', controller.getAutomations);

router.patch('/:id', tradingMiddleware, controller.updateAutomation);

router.delete('/db/:id', controller.deleteAutomationDB);

router.delete('/:id', controller.stopAutomation);

export default router;