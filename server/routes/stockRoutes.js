import express from 'express';
import { 
  getStockLevels, 
  updateReorderThreshold, 
  quickStockInward, 
  getStockAlerts, 
  resetAllStockToZero,
  adjustProductStock,
  wipeAllTransactionData
} from '../controllers/stockController.js';
import { protect, requireAdmin } from '../middleware/authMiddleware.js';

const router = express.Router();

router.use(protect);

router.get('/', getStockLevels);
router.get('/alerts', getStockAlerts);
router.post('/inward', quickStockInward);
router.post('/reset-zero', requireAdmin, resetAllStockToZero);
router.post('/wipe-data', requireAdmin, wipeAllTransactionData);
router.put('/:productId/threshold', requireAdmin, updateReorderThreshold);
router.put('/:productId/adjust', requireAdmin, adjustProductStock);

export default router;
