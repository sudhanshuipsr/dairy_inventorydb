import { Op } from 'sequelize';
import { Stock, Product, Purchase, ExpiryBatch } from '../models/index.js';
import { addStock } from '../services/stockSyncService.js';
import { logAudit } from '../middleware/auditLogger.js';

// @route   GET /api/stock
// @desc    Get real-time stock levels for all products
// @access  Private
export const getStockLevels = async (req, res) => {
  try {
    const { lowStockOnly } = req.query;

    const stocks = await Stock.findAll({
      include: [
        {
          model: Product,
          as: 'product',
          attributes: ['id', 'name', 'category', 'unit', 'unitPrice', 'costPrice', 'qrCode', 'imageUrl', 'isActive', 'shelfLifeDays']
        }
      ],
      order: [['currentQuantity', 'ASC']]
    });

    let filtered = stocks
      .map((s) => {
        const sJson = s.toJSON();
        const p = sJson.product;
        if (!p || !p.isActive) return null;
        p._id = p.id;
        return {
          ...sJson,
          _id: sJson.id,
          productId: p
        };
      })
      .filter(Boolean);

    if (lowStockOnly === 'true') {
      filtered = filtered.filter((s) => Number(s.currentQuantity) <= Number(s.reorderThreshold));
    }

    const summary = {
      totalProducts: filtered.length,
      totalQuantity: filtered.reduce((sum, s) => sum + Number(s.currentQuantity || 0), 0),
      totalValue: filtered.reduce((sum, s) => sum + (Number(s.currentQuantity || 0) * Number(s.productId?.unitPrice || 0)), 0),
      totalCostValue: filtered.reduce((sum, s) => sum + (Number(s.currentQuantity || 0) * Number(s.productId?.costPrice || 0)), 0),
      lowStockCount: filtered.filter((s) => Number(s.currentQuantity) <= Number(s.reorderThreshold)).length,
      outOfStockCount: filtered.filter((s) => Number(s.currentQuantity) === 0).length
    };

    res.status(200).json({
      success: true,
      summary,
      stocks: filtered
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @route   PUT /api/stock/:productId/threshold
// @desc    Update reorder threshold for a product (Admin only)
// @access  Private/Admin
export const updateReorderThreshold = async (req, res) => {
  try {
    const { reorderThreshold } = req.body;
    const { productId } = req.params;

    if (reorderThreshold === undefined || Number(reorderThreshold) < 0) {
      return res.status(400).json({ success: false, message: 'Valid non-negative reorder threshold is required' });
    }

    const stock = await Stock.findOne({
      where: { productId },
      include: [{ model: Product, as: 'product' }]
    });

    if (!stock) {
      return res.status(404).json({ success: false, message: 'Stock record not found for product' });
    }

    stock.reorderThreshold = Number(reorderThreshold);
    stock.lastUpdated = new Date();
    await stock.save();

    await logAudit({
      req,
      action: 'UPDATE',
      entityType: 'Stock',
      entityId: stock.id,
      details: `Admin changed reorder threshold to ${reorderThreshold} for ${stock.product?.name}`
    });

    const sJson = stock.toJSON();
    sJson._id = sJson.id;
    if (sJson.product) {
      sJson.product._id = sJson.product.id;
      sJson.productId = sJson.product;
    }

    res.status(200).json({
      success: true,
      message: `Reorder threshold updated to ${reorderThreshold}`,
      stock: sJson
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @route   POST /api/stock/inward
// @desc    Fast Barcode Inward: Auto-fills price, expiry, creates purchase & batch, adds to stock
// @access  Private
export const quickStockInward = async (req, res) => {
  try {
    const {
      productId,
      barcode,
      quantity,
      costPrice,
      expiryDate,
      batchNumber,
      supplierName,
      invoiceNumber,
      notes
    } = req.body;

    const numQty = Number(quantity);
    if (!numQty || numQty <= 0) {
      return res.status(400).json({ success: false, message: 'Valid positive quantity is required' });
    }

    let product = null;

    if (productId) {
      product = await Product.findByPk(productId);
    }

    if (!product && barcode) {
      const cleanCode = barcode.toString().trim();
      product = await Product.findOne({
        where: {
          [Op.or]: [
            { barcode: cleanCode },
            { qrCode: cleanCode },
            { id: isNaN(cleanCode) ? -1 : Number(cleanCode) }
          ]
        }
      });
    }

    if (product) {
      let changed = false;
      if (req.body.unitPrice && Number(req.body.unitPrice) > 0 && Number(product.unitPrice) !== Number(req.body.unitPrice)) {
        product.unitPrice = Number(req.body.unitPrice);
        changed = true;
      }
      if (costPrice !== undefined && costPrice !== '' && Number(costPrice) > 0 && Number(product.costPrice) !== Number(costPrice)) {
        product.costPrice = Number(costPrice);
        changed = true;
      }
      if (req.body.productName && req.body.productName.trim() && req.body.productName.trim() !== product.name) {
        product.name = req.body.productName.trim();
        changed = true;
      }
      if (changed) {
        await product.save();
      }
    } else {
      const cleanCode = (barcode || '').toString().trim();
      const prodName = req.body.productName || req.body.name || (cleanCode ? `Item (${cleanCode})` : 'New Scanned Item');
      const uPrice = Number(req.body.unitPrice) || (costPrice ? Math.round(Number(costPrice) * 1.25) : 50);
      const cPrice = costPrice !== undefined && costPrice !== '' ? Number(costPrice) : Math.round(uPrice * 0.8);
      product = await Product.create({
        name: prodName,
        category: req.body.category || 'dairy',
        unit: req.body.unit || 'pack',
        unitPrice: uPrice,
        costPrice: cPrice,
        barcode: cleanCode || null,
        qrCode: `MD-${cleanCode || Date.now().toString().slice(-6)}`,
        shelfLifeDays: Number(req.body.shelfLifeDays) || 60,
        reorderThreshold: 15,
        isActive: true
      });
    }

    const numCost = costPrice !== undefined && costPrice !== ''
      ? Number(costPrice)
      : Number(product.costPrice || Math.round(Number(product.unitPrice || 0) * 0.8));

    const totalAmount = Number((numQty * numCost).toFixed(2));
    const now = new Date();
    const userId = req.user?.id || req.user?._id || 1;

    // Calculate expiry date if not provided (Today + shelfLifeDays)
    const shelfDays = Number(product.shelfLifeDays || 30);
    const calculatedExpiry = expiryDate && expiryDate.trim()
      ? new Date(expiryDate)
      : new Date(now.getTime() + shelfDays * 24 * 60 * 60 * 1000);

    const generatedBatchNo = batchNumber && batchNumber.trim()
      ? batchNumber.trim()
      : `BCH-${product.category.toUpperCase().slice(0, 3)}-${Date.now().toString().slice(-5)}`;

    const supplier = supplierName && supplierName.trim()
      ? supplierName.trim()
      : (product.brand ? `${product.brand} Distributor` : `${product.name.split(' ')[0]} Direct Supplier`);


    // 1. Create Purchase Inward record
    const purchase = await Purchase.create({
      productId: product.id,
      quantity: numQty,
      costPrice: numCost,
      totalAmount,
      supplierName: supplier,
      invoiceNumber: invoiceNumber || `BAR-${Date.now().toString().slice(-6)}`,
      date: now,
      addedBy: userId,
      notes: notes || `Quick Barcode Stock Inward [${barcode || product.qrCode}]`
    });

    // 2. Add Stock
    const updatedStock = await addStock(product.id, numQty);

    // 3. Create Expiry Batch
    const expiryBatch = await ExpiryBatch.create({
      productId: product.id,
      batchNumber: generatedBatchNo,
      manufactureDate: now,
      expiryDate: calculatedExpiry,
      quantity: numQty,
      status: calculatedExpiry > now ? 'fresh' : 'expired',
      addedBy: userId,
      notes: `Barcode Inward for Purchase #${purchase.id}`
    });

    // 4. Audit Log
    await logAudit({
      req,
      action: 'CREATE',
      entityType: 'Stock',
      entityId: product.id,
      details: `Barcode Inward: Added ${numQty} ${product.unit} of "${product.name}" (Cost: ₹${numCost}/unit, Exp: ${calculatedExpiry.toISOString().split('T')[0]}, Batch: ${generatedBatchNo}).`
    });

    res.status(201).json({
      success: true,
      message: `Successfully added ${numQty} ${product.unit} of "${product.name}" to stock!`,
      currentQuantity: Number(updatedStock?.currentQuantity || numQty),
      product: {
        ...product.toJSON(),
        _id: product.id,
        currentQuantity: Number(updatedStock?.currentQuantity || numQty)
      },
      batch: {
        batchNumber: generatedBatchNo,
        expiryDate: calculatedExpiry.toISOString().split('T')[0]
      },
      purchaseId: purchase.id
    });
  } catch (error) {
    console.error('Quick Stock Inward Error:', error);
    res.status(500).json({ success: false, message: error.message || 'Failed to add barcode stock' });
  }
};

// @route   POST /api/stock/reset-zero
// @desc    Reset all product stock levels and batch quantities to 0
// @access  Private
export const resetAllStockToZero = async (req, res) => {
  try {
    const [stocksUpdated] = await Stock.update(
      { currentQuantity: 0, lastUpdated: new Date() },
      { where: {} }
    );
    const [batchesUpdated] = await ExpiryBatch.update(
      { quantity: 0 },
      { where: {} }
    );

    await logAudit({
      req,
      action: 'UPDATE',
      entityType: 'Stock',
      entityId: 0,
      details: `Admin/User reset all stock to 0 (${stocksUpdated} stocks, ${batchesUpdated} batches set to 0)`
    });

    res.status(200).json({
      success: true,
      message: `All stock successfully reset to zero (${stocksUpdated} stocks, ${batchesUpdated} batches set to 0).`,
      stocksUpdated,
      batchesUpdated
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @route   GET /api/stock/alerts
// @desc    Get low-stock items and near-expiry alert metrics using stockAlertUtils
// @access  Private (Staff & Admin)
export const getStockAlerts = async (req, res) => {
  try {
    const { getStockAlertSummary } = await import('../utils/stockAlertUtils.js');
    const alertsData = await getStockAlertSummary();
    const formattedSummary = {
      ...alertsData,
      expiringSoonCount: alertsData.nearExpiryCount
    };
    res.status(200).json({
      success: true,
      summary: formattedSummary,
      alerts: formattedSummary
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @route   PUT /api/stock/:productId/adjust
// @desc    Admin direct stock correction (fix wrong staff count or audit mismatch)
// @access  Private/Admin
export const adjustProductStock = async (req, res) => {
  try {
    const { productId } = req.params;
    const { newQuantity, adjustmentQuantity, reason } = req.body;

    const stock = await Stock.findOne({
      where: { productId },
      include: [{ model: Product, as: 'product' }]
    });

    if (!stock) {
      return res.status(404).json({ success: false, message: 'Stock record not found for product' });
    }

    const oldQty = Number(stock.currentQuantity || 0);
    let targetQty = oldQty;

    if (newQuantity !== undefined && !isNaN(Number(newQuantity))) {
      targetQty = Math.max(0, Number(newQuantity));
    } else if (adjustmentQuantity !== undefined && !isNaN(Number(adjustmentQuantity))) {
      targetQty = Math.max(0, oldQty + Number(adjustmentQuantity));
    } else {
      return res.status(400).json({ success: false, message: 'Valid newQuantity or adjustmentQuantity is required' });
    }

    stock.currentQuantity = targetQty;
    stock.lastUpdated = new Date();
    await stock.save();

    const prodName = stock.product?.name || `Product #${productId}`;
    const diff = targetQty - oldQty;
    const diffStr = diff >= 0 ? `+${diff}` : `${diff}`;

    await logAudit({
      req,
      action: 'UPDATE',
      entityType: 'Stock',
      entityId: stock.id,
      details: `Admin corrected stock for "${prodName}": ${oldQty} -> ${targetQty} (${diffStr} units). Reason: ${reason || 'Manual Admin stock correction'}`
    });

    res.status(200).json({
      success: true,
      message: `Stock for "${prodName}" successfully corrected from ${oldQty} to ${targetQty} units!`,
      currentQuantity: targetQty,
      previousQuantity: oldQty,
      stock
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @route   POST /api/stock/wipe-data
// @desc    Complete wipe of all transactions (sales, purchases, batches, feedback) & zero stock
// @access  Private/Admin
export const wipeAllTransactionData = async (req, res) => {
  try {
    const { SaleItem, Sale, PurchaseItem, Purchase, ExpiryBatch, Feedback, ProductionOutput, Production } = await import('../models/index.js');
    
    await SaleItem.destroy({ where: {} });
    await Sale.destroy({ where: {} });
    await PurchaseItem.destroy({ where: {} });
    await Purchase.destroy({ where: {} });
    await ExpiryBatch.destroy({ where: {} });
    try { await Feedback.destroy({ where: {} }); } catch (e) {}
    try { await ProductionOutput.destroy({ where: {} }); } catch (e) {}
    try { await Production.destroy({ where: {} }); } catch (e) {}

    const [stocksUpdated] = await Stock.update(
      { currentQuantity: 0, lastUpdated: new Date() },
      { where: {} }
    );

    await logAudit({
      req,
      action: 'DELETE',
      entityType: 'System',
      entityId: 0,
      details: 'Admin performed full data wipe: Deleted all sales, purchases, batches, feedback and reset all stocks to 0.'
    });

    res.status(200).json({
      success: true,
      message: `Complete reset successful: All sales, purchases, batches, feedback deleted and ${stocksUpdated} stocks set to 0.`,
      stocksUpdated
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

