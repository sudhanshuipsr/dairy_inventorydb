import { Op } from 'sequelize';
import { sequelize, Purchase, PurchaseItem, Product, ExpiryBatch, User, Supplier } from '../models/index.js';
import { addStock, subtractStock } from '../services/stockSyncService.js';
import { logAudit } from '../middleware/auditLogger.js';

// @route   GET /api/purchases
// @desc    Get all purchase inward transactions with multi-item support and history filters
// @access  Private
export const getPurchases = async (req, res) => {
  try {
    const { startDate, endDate, productId, supplier, supplierId } = req.query;
    const where = {};

    if (startDate || endDate) {
      where.date = {};
      if (startDate) where.date[Op.gte] = new Date(startDate);
      if (endDate) where.date[Op.lte] = new Date(endDate + 'T23:59:59.999Z');
    }

    if (supplierId) {
      where.supplierId = Number(supplierId);
    }

    if (supplier && supplier.trim()) {
      where.supplierName = { [Op.like]: `%${supplier.trim()}%` };
    }

    const purchases = await Purchase.findAll({
      where,
      include: [
        {
          model: PurchaseItem,
          as: 'items',
          include: [
            {
              model: Product,
              as: 'product',
              attributes: ['id', 'name', 'category', 'unit', 'qrCode', 'barcode']
            }
          ]
        },
        {
          model: Supplier,
          as: 'supplier',
          attributes: ['id', 'name', 'phone', 'email', 'gstNumber', 'category']
        },
        {
          model: Product,
          as: 'product',
          attributes: ['id', 'name', 'category', 'unit', 'qrCode', 'barcode']
        },
        {
          model: User,
          as: 'user',
          attributes: ['id', 'name', 'email', 'role']
        }
      ],
      order: [['date', 'DESC']]
    });

    let formatted = purchases.map((p) => {
      const pJson = p.toJSON();
      pJson._id = pJson.id;

      // Handle legacy single-item purchases vs new multi-item purchases
      let items = (pJson.items || []).map((it) => ({
        ...it,
        _id: it.id,
        quantity: Number(it.quantity || 0),
        costPrice: Number(it.costPrice || 0),
        subtotal: Number(it.subtotal || 0),
        product: it.product ? { ...it.product, _id: it.product.id } : null
      }));

      // Fallback: If no items relation exists but legacy productId/quantity is populated
      if (items.length === 0 && pJson.productId && pJson.product) {
        items = [
          {
            id: `legacy-${pJson.id}`,
            _id: `legacy-${pJson.id}`,
            productId: pJson.productId,
            quantity: Number(pJson.quantity || 0),
            costPrice: Number(pJson.costPrice || 0),
            subtotal: Number(pJson.totalAmount || 0),
            product: { ...pJson.product, _id: pJson.product.id }
          }
        ];
      }

      const totalQuantity = items.reduce((sum, it) => sum + Number(it.quantity || 0), 0) || Number(pJson.quantity || 0);

      return {
        ...pJson,
        totalAmount: Number(pJson.totalAmount || 0),
        totalQuantity,
        itemsCount: items.length,
        items,
        supplierName: pJson.supplier?.name || pJson.supplierName || 'Mother Dairy Cooperative',
        addedBy: pJson.user ? { ...pJson.user, _id: pJson.user.id } : null
      };
    });

    // Optional productId filter (filter purchases containing this productId in header or items)
    if (productId) {
      const pIdNum = Number(productId);
      formatted = formatted.filter(
        (p) => p.productId === pIdNum || (p.items || []).some((it) => it.productId === pIdNum)
      );
    }

    const totalSpent = formatted.reduce((sum, p) => sum + Number(p.totalAmount || 0), 0);
    const totalQuantity = formatted.reduce((sum, p) => sum + Number(p.totalQuantity || 0), 0);

    res.status(200).json({
      success: true,
      count: formatted.length,
      totalSpent: Number(totalSpent.toFixed(2)),
      totalQuantity,
      purchases: formatted
    });
  } catch (error) {
    console.error('getPurchases error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @route   GET /api/purchases/:id
// @desc    Get single purchase with items breakdown
// @access  Private
export const getPurchaseById = async (req, res) => {
  try {
    const purchase = await Purchase.findByPk(req.params.id, {
      include: [
        {
          model: PurchaseItem,
          as: 'items',
          include: [
            {
              model: Product,
              as: 'product',
              attributes: ['id', 'name', 'category', 'unit', 'qrCode', 'barcode']
            }
          ]
        },
        {
          model: Supplier,
          as: 'supplier'
        },
        {
          model: User,
          as: 'user',
          attributes: ['id', 'name', 'email', 'role']
        }
      ]
    });

    if (!purchase) {
      return res.status(404).json({ success: false, message: 'Purchase not found' });
    }

    const pJson = purchase.toJSON();
    pJson._id = pJson.id;
    res.status(200).json({ success: true, purchase: pJson });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @route   POST /api/purchases
// @desc    Create purchase order with line items + ATOMIC SEQUELIZE TRANSACTION + STOCK SYNC
// @access  Private
export const createPurchase = async (req, res) => {
  const t = await sequelize.transaction();

  try {
    const {
      supplierId,
      supplierName,
      invoiceNumber,
      date,
      notes,
      items
    } = req.body;

    // Support both multi-item payload (items: [...]) and legacy single-item payload
    let lineItems = [];
    if (Array.isArray(items) && items.length > 0) {
      lineItems = items;
    } else if (req.body.productId && req.body.quantity) {
      lineItems = [
        {
          productId: req.body.productId,
          quantity: req.body.quantity,
          costPrice: req.body.costPrice,
          expiryDate: req.body.expiryDate,
          batchNumber: req.body.batchNumber
        }
      ];
    }

    if (lineItems.length === 0) {
      await t.rollback();
      return res.status(400).json({
        success: false,
        message: 'At least one product line item is required'
      });
    }

    // Validate line items
    const validatedItems = [];
    for (let idx = 0; idx < lineItems.length; idx++) {
      const it = lineItems[idx];
      const prodId = Number(it.productId);
      const qty = Number(it.quantity);
      const cost = Number(it.costPrice);

      if (!prodId || isNaN(prodId)) {
        await t.rollback();
        return res.status(400).json({ success: false, message: `Line ${idx + 1}: Valid product is required` });
      }

      if (!qty || qty <= 0 || isNaN(qty)) {
        await t.rollback();
        return res.status(400).json({ success: false, message: `Line ${idx + 1}: Quantity must be greater than 0` });
      }

      if (cost < 0 || isNaN(cost)) {
        await t.rollback();
        return res.status(400).json({ success: false, message: `Line ${idx + 1}: Cost price cannot be negative` });
      }

      const subtotal = Number((qty * cost).toFixed(2));
      validatedItems.push({
        productId: prodId,
        quantity: qty,
        costPrice: cost,
        subtotal,
        expiryDate: it.expiryDate || null,
        batchNumber: it.batchNumber || null
      });
    }

    // Calculate Grand Total
    const totalAmount = Number(
      validatedItems.reduce((sum, it) => sum + it.subtotal, 0).toFixed(2)
    );

    const purchaseDate = date ? new Date(date) : new Date();
    const userId = req.user?.id || req.user?._id || 1;

    // Resolve Supplier
    let resolvedSupplierName = supplierName ? supplierName.trim() : '';
    let validSupplierId = null;

    if (supplierId) {
      const sup = await Supplier.findByPk(supplierId, { transaction: t });
      if (sup) {
        validSupplierId = sup.id;
        if (!resolvedSupplierName) resolvedSupplierName = sup.name;
      }
    }

    if (!resolvedSupplierName) {
      resolvedSupplierName = 'Mother Dairy Inward Procurement';
    }

    const effectiveInvoice = invoiceNumber && invoiceNumber.trim()
      ? invoiceNumber.trim()
      : `INV-${Date.now().toString().slice(-6)}`;

    // 1. Create Purchase Master Record inside transaction
    const purchase = await Purchase.create(
      {
        supplierId: validSupplierId,
        supplierName: resolvedSupplierName,
        invoiceNumber: effectiveInvoice,
        date: purchaseDate,
        totalAmount,
        addedBy: userId,
        notes: notes || '',
        // Populate header fields if single item for backward compatibility
        productId: validatedItems.length === 1 ? validatedItems[0].productId : null,
        quantity: validatedItems.length === 1 ? validatedItems[0].quantity : null,
        costPrice: validatedItems.length === 1 ? validatedItems[0].costPrice : null
      },
      { transaction: t }
    );

    // 2. Create PurchaseItems & Atomically Increment Stock & Create Expiry Batches
    const createdItems = [];
    const createdBatches = [];

    for (const it of validatedItems) {
      const product = await Product.findByPk(it.productId, { transaction: t });
      if (!product) {
        await t.rollback();
        return res.status(404).json({ success: false, message: `Product #${it.productId} not found` });
      }

      // 2a. Insert PurchaseItem
      const pItem = await PurchaseItem.create(
        {
          purchaseId: purchase.id,
          productId: it.productId,
          quantity: it.quantity,
          costPrice: it.costPrice,
          subtotal: it.subtotal,
          batchNumber: it.batchNumber,
          expiryDate: it.expiryDate ? new Date(it.expiryDate) : null
        },
        { transaction: t }
      );
      createdItems.push(pItem);

      // 2b. Atomic Stock Increment inside transaction
      await addStock(it.productId, it.quantity, { transaction: t });

      // 2c. Expiry Batch Generation
      const calculatedExpiry = it.expiryDate
        ? new Date(it.expiryDate)
        : new Date(purchaseDate.getTime() + (product.shelfLifeDays || 3) * 24 * 60 * 60 * 1000);

      const generatedBatchNo = it.batchNumber && it.batchNumber.trim()
        ? it.batchNumber.trim()
        : `BCH-${product.category.toUpperCase().slice(0, 3)}-${Date.now().toString().slice(-5)}`;

      const expiryBatch = await ExpiryBatch.create(
        {
          productId: product.id,
          batchNumber: generatedBatchNo,
          manufactureDate: purchaseDate,
          expiryDate: calculatedExpiry,
          quantity: it.quantity,
          status: calculatedExpiry > new Date() ? 'fresh' : 'expired',
          addedBy: userId,
          notes: `Auto-created from Purchase Order #${purchase.id} (${effectiveInvoice})`
        },
        { transaction: t }
      );
      createdBatches.push(expiryBatch);
    }

    // 3. Log Audit Trail
    await logAudit({
      req,
      action: 'CREATE',
      entityType: 'Purchase',
      entityId: purchase.id,
      details: `Purchase #${purchase.id} (Invoice: ${effectiveInvoice}) recorded from ${resolvedSupplierName}: ${validatedItems.length} line items totaling ₹${totalAmount}. Stock incremented atomically.`
    });

    // 4. Commit Transaction
    await t.commit();

    // 5. Fetch Populated Record
    const populated = await Purchase.findByPk(purchase.id, {
      include: [
        {
          model: PurchaseItem,
          as: 'items',
          include: [{ model: Product, as: 'product', attributes: ['id', 'name', 'category', 'unit'] }]
        },
        { model: Supplier, as: 'supplier' },
        { model: User, as: 'user', attributes: ['id', 'name', 'email'] }
      ]
    });

    const pJson = populated.toJSON();
    pJson._id = pJson.id;

    res.status(201).json({
      success: true,
      message: `Purchase Order with ${validatedItems.length} items recorded and stock updated atomically!`,
      purchase: pJson,
      items: createdItems,
      expiryBatches: createdBatches
    });
  } catch (error) {
    if (t && !t.finished) {
      await t.rollback();
    }
    console.error('createPurchase error:', error);
    res.status(500).json({ success: false, message: error.message || 'Failed to create purchase order' });
  }
};

// @route   DELETE /api/purchases/:id
// @desc    Delete purchase order and reverse stock addition in atomic transaction (Admin only)
// @access  Private/Admin
export const deletePurchase = async (req, res) => {
  const t = await sequelize.transaction();

  try {
    const purchase = await Purchase.findByPk(req.params.id, {
      include: [
        { model: PurchaseItem, as: 'items' },
        { model: Product, as: 'product' }
      ],
      transaction: t
    });

    if (!purchase) {
      await t.rollback();
      return res.status(404).json({ success: false, message: 'Purchase record not found' });
    }

    // Reverse stock for all line items
    if (Array.isArray(purchase.items) && purchase.items.length > 0) {
      for (const item of purchase.items) {
        await subtractStock(item.productId, item.quantity, { transaction: t });
      }
    } else if (purchase.productId && purchase.quantity) {
      // Legacy fallback
      await subtractStock(purchase.productId, purchase.quantity, { transaction: t });
    }

    const purId = purchase.id;
    const inv = purchase.invoiceNumber;
    await purchase.destroy({ transaction: t });

    await logAudit({
      req,
      action: 'DELETE',
      entityType: 'Purchase',
      entityId: purId,
      details: `Admin deleted purchase #${purId} (Invoice: ${inv}). Stock increments were reversed atomically.`
    });

    await t.commit();

    res.status(200).json({
      success: true,
      message: `Purchase #${purId} deleted and all associated product stock reversed successfully`
    });
  } catch (error) {
    if (t && !t.finished) {
      await t.rollback();
    }
    console.error('deletePurchase error:', error);
    res.status(500).json({ success: false, message: error.message || 'Failed to delete purchase' });
  }
};

// @route   PUT /api/purchases/:id
// @desc    Edit/Correct purchase inward + re-adjust stock (Admin only: fix wrong staff entry)
// @access  Private/Admin
export const updatePurchase = async (req, res) => {
  const t = await sequelize.transaction();

  try {
    const purchase = await Purchase.findByPk(req.params.id, {
      include: [
        { model: PurchaseItem, as: 'items' },
        { model: Product, as: 'product' }
      ],
      transaction: t
    });

    if (!purchase) {
      await t.rollback();
      return res.status(404).json({ success: false, message: 'Purchase record not found' });
    }

    const {
      invoiceNumber,
      supplierName,
      supplierId,
      date,
      notes,
      correctionReason,
      items
    } = req.body;

    // 1. If items modified, adjust stock additions
    if (Array.isArray(items) && items.length > 0) {
      // Step A: Revert old purchase stock addition (subtract old)
      if (Array.isArray(purchase.items) && purchase.items.length > 0) {
        for (const oldIt of purchase.items) {
          await subtractStock(oldIt.productId, oldIt.quantity, { transaction: t });
        }
      } else if (purchase.productId && purchase.quantity) {
        await subtractStock(purchase.productId, purchase.quantity, { transaction: t });
      }

      // Step B: Validate new items and calculate total
      let newTotal = 0;
      const preparedItems = [];

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const numQty = Number(item.quantity);
        const numCost = Number(item.costPrice);

        if (!item.productId || isNaN(numQty) || numQty <= 0) {
          await t.rollback();
          return res.status(400).json({
            success: false,
            message: `Valid product and positive quantity required for line item #${i + 1}`
          });
        }

        const product = await Product.findByPk(item.productId, { transaction: t });
        if (!product) {
          await t.rollback();
          return res.status(404).json({ success: false, message: `Product #${item.productId} not found` });
        }

        const lineSub = Number((numQty * numCost).toFixed(2));
        newTotal += lineSub;

        preparedItems.push({
          productId: item.productId,
          quantity: numQty,
          costPrice: numCost,
          subtotal: lineSub
        });
      }

      // Step C: Delete old purchase items & insert new ones + add new stock
      await PurchaseItem.destroy({ where: { purchaseId: purchase.id }, transaction: t });

      for (const pIt of preparedItems) {
        await PurchaseItem.create(
          {
            purchaseId: purchase.id,
            productId: pIt.productId,
            quantity: pIt.quantity,
            costPrice: pIt.costPrice,
            subtotal: pIt.subtotal
          },
          { transaction: t }
        );
        await addStock(pIt.productId, pIt.quantity, { transaction: t });
      }

      purchase.totalAmount = Number(newTotal.toFixed(2));
      if (preparedItems.length === 1) {
        purchase.productId = preparedItems[0].productId;
        purchase.quantity = preparedItems[0].quantity;
        purchase.costPrice = preparedItems[0].costPrice;
      } else {
        purchase.productId = null;
        purchase.quantity = null;
        purchase.costPrice = null;
      }
    }

    if (invoiceNumber !== undefined && invoiceNumber.trim()) purchase.invoiceNumber = invoiceNumber.trim();
    if (supplierName !== undefined && supplierName.trim()) purchase.supplierName = supplierName.trim();
    if (supplierId !== undefined) purchase.supplierId = supplierId || null;
    if (date !== undefined && date) purchase.date = new Date(date);
    if (notes !== undefined) {
      purchase.notes = correctionReason
        ? `${notes} (Admin Correction: ${correctionReason})`.trim()
        : notes;
    }

    await purchase.save({ transaction: t });
    await t.commit();

    await logAudit({
      req,
      action: 'UPDATE',
      entityType: 'Purchase',
      entityId: purchase.id,
      details: `Admin corrected Purchase #${purchase.id} (Invoice: ${purchase.invoiceNumber}). Stock adjusted. Reason: ${correctionReason || 'Staff error correction'}`
    });

    const updated = await Purchase.findByPk(purchase.id, {
      include: [
        {
          model: PurchaseItem,
          as: 'items',
          include: [{ model: Product, as: 'product', attributes: ['id', 'name', 'category', 'unit'] }]
        },
        { model: Supplier, as: 'supplier' },
        { model: User, as: 'user', attributes: ['id', 'name', 'email'] }
      ]
    });

    res.status(200).json({
      success: true,
      message: `Purchase #${purchase.id} successfully corrected by Admin. Stock reconciled!`,
      purchase: updated
    });
  } catch (error) {
    if (t && !t.finished) {
      await t.rollback();
    }
    console.error('updatePurchase error:', error);
    res.status(500).json({ success: false, message: error.message || 'Failed to update purchase' });
  }
};
