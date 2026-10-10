import { Op } from 'sequelize';
import { Product, Stock, ExpiryBatch } from '../models/index.js';

/**
 * Reusable utility to evaluate low-stock and expiring products
 */

/**
 * Find all products whose stock is at or below their reorder threshold
 * @param {Object} options - Optional filters (e.g. category, search)
 */
export const getLowStockProducts = async (options = {}) => {
  const whereProduct = { isActive: true };

  if (options.category && options.category !== 'All' && options.category !== 'all') {
    whereProduct.category = options.category;
  }

  if (options.search && options.search.trim()) {
    const s = `%${options.search.trim()}%`;
    whereProduct[Op.or] = [
      { name: { [Op.like]: s } },
      { category: { [Op.like]: s } },
      { barcode: { [Op.like]: s } },
      { qrCode: { [Op.like]: s } }
    ];
  }

  const products = await Product.findAll({
    where: whereProduct,
    include: [{ model: Stock, as: 'stock' }],
    order: [['name', 'ASC']]
  });

  const lowStockItems = [];

  for (const p of products) {
    const currentQty = p.stock ? Number(p.stock.currentQuantity) : 0;
    const threshold = Number(p.reorderThreshold || 20);

    if (currentQty > 0 && currentQty <= threshold) {
      lowStockItems.push({
        id: p.id,
        _id: p.id,
        name: p.name,
        category: p.category,
        unit: p.unit,
        unitPrice: Number(p.unitPrice),
        costPrice: Number(p.costPrice),
        barcode: p.barcode,
        qrCode: p.qrCode,
        currentQuantity: currentQty,
        reorderThreshold: threshold,
        isOutOfStock: currentQty === 0,
        deficit: Math.max(0, threshold - currentQty)
      });
    }
  }

  return {
    count: lowStockItems.length,
    outOfStockCount: lowStockItems.filter((i) => i.isOutOfStock).length,
    products: lowStockItems
  };
};

/**
 * Find all batches expiring within N days or already expired
 * @param {number} daysThreshold - Days window (default: 3 days)
 */
export const getExpiringBatches = async (daysThreshold = 3) => {
  const now = new Date();
  const futureThreshold = new Date(now.getTime() + daysThreshold * 24 * 60 * 60 * 1000);

  const batches = await ExpiryBatch.findAll({
    where: {
      status: { [Op.ne]: 'discarded' },
      expiryDate: { [Op.lte]: futureThreshold }
    },
    include: [
      {
        model: Product,
        as: 'product',
        attributes: ['id', 'name', 'category', 'unit', 'unitPrice']
      }
    ],
    order: [['expiryDate', 'ASC']]
  });

  const formatted = batches.map((b) => {
    const expDate = new Date(b.expiryDate);
    const isExpired = expDate <= now;
    const msRemaining = expDate.getTime() - now.getTime();
    const daysRemaining = Math.ceil(msRemaining / (24 * 60 * 60 * 1000));

    return {
      id: b.id,
      _id: b.id,
      batchNumber: b.batchNumber,
      productId: b.productId,
      productName: b.product?.name || 'Product',
      category: b.product?.category || 'milk',
      unit: b.product?.unit || 'pack',
      quantity: Number(b.quantity),
      expiryDate: b.expiryDate,
      isExpired,
      daysRemaining,
      status: isExpired ? 'expired' : 'near-expiry'
    };
  });

  return {
    count: formatted.length,
    nearExpiryCount: formatted.filter((b) => !b.isExpired).length,
    expiredCount: formatted.filter((b) => b.isExpired).length,
    batches: formatted
  };
};

/**
 * Comprehensive stock & alert summary for dashboard and inventory checks
 */
export const getStockAlertSummary = async () => {
  const [lowStock, expiring] = await Promise.all([
    getLowStockProducts(),
    getExpiringBatches(3)
  ]);

  const totalProducts = await Product.count({ where: { isActive: true } });

  return {
    totalProducts,
    lowStockCount: lowStock.count,
    outOfStockCount: lowStock.outOfStockCount,
    lowStockProducts: lowStock.products,
    nearExpiryCount: expiring.nearExpiryCount,
    expiredCount: expiring.expiredCount,
    expiringBatches: expiring.batches
  };
};
