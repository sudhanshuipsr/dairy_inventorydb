import express from 'express';
import { getStockLevels, updateReorderThreshold, quickStockInward, getStockAlerts, resetAllStockToZero } from '../controllers/stockController.js';
import { protect, requireAdmin } from '../middleware/authMiddleware.js';

const router = express.Router();

router.use(protect);

router.get('/', getStockLevels);
router.get('/alerts', getStockAlerts);
router.post('/inward', quickStockInward);
router.post('/reset-zero', resetAllStockToZero);
router.put('/:productId/threshold', requireAdmin, updateReorderThreshold);

export default router;
