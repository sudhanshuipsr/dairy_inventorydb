import express from 'express';
import { getSales, getSaleById, createSale, updateSale, deleteSale } from '../controllers/saleController.js';
import { protect, requireAdmin } from '../middleware/authMiddleware.js';

const router = express.Router();

router.use(protect);

router.get('/', getSales);
router.get('/:id', getSaleById);
router.post('/', createSale); // Staff and Admin can record sales & issue receipts
router.put('/:id', requireAdmin, updateSale); // Only Admin can edit/correct wrong staff entry
router.delete('/:id', requireAdmin, deleteSale); // Only Admin can delete/reverse

export default router;
