import { Router } from "express";
import settingsController from "../controllers/settingsController.js";

const router = Router();

router.get('/', settingsController.getSettings);

router.post('/logs/:channel', settingsController.toggleLogs);

router.post('/delays/:channel', settingsController.changeDelay);

router.delete('/stop', settingsController.stop);

router.delete('/', settingsController.restart);

export default router;