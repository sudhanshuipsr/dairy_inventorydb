import { Op } from 'sequelize';
import { Sale, SaleItem, Product, Stock, User, sequelize } from '../models/index.js';
import { subtractStock, addStock } from '../services/stockSyncService.js';
import { logAudit } from '../middleware/auditLogger.js';

// Helper to generate unique receipt numbers
export const generateReceiptNumber = () => {
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
  const timeStr = String(now.getHours()).padStart(2, '0') + String(now.getMinutes()).padStart(2, '0') + String(now.getSeconds()).padStart(2, '0');
  const rand = Math.floor(100 + Math.random() * 900);
  return `REC-${dateStr}-${timeStr}-${rand}`;
};

// @route   GET /api/sales
// @desc    Get all sales transactions with filters
// @access  Private
export const getSales = async (req, res) => {
  try {
    const { startDate, endDate, productId, customer, receiptNumber } = req.query;
    const where = {};

    if (startDate || endDate) {
      where.date = {};
      if (startDate) where.date[Op.gte] = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        where.date[Op.lte] = end;
      }
    }

    if (receiptNumber) {
      where.receiptNumber = { [Op.like]: `%${receiptNumber.trim()}%` };
    }

    if (customer) {
      where.customerName = { [Op.like]: `%${customer.trim()}%` };
    }

    const includeOptions = [
      {
        model: SaleItem,
        as: 'items',
        include: [
          {
            model: Product,
            as: 'product',
            attributes: ['id', 'name', 'category', 'unit', 'qrCode', 'barcode', 'costPrice', 'unitPrice']
          }
        ]
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
    ];

    let sales = await Sale.findAll({
      where,
      include: includeOptions,
      order: [['date', 'DESC'], ['id', 'DESC']]
    });

    // If filtered by productId, filter orders containing this product (either legacy or in items)
    if (productId) {
      const pIdNum = Number(productId);
      sales = sales.filter((s) => {
        const matchLegacy = Number(s.productId) === pIdNum;
        const matchItem = Array.isArray(s.items) && s.items.some((it) => Number(it.productId) === pIdNum);
        return matchLegacy || matchItem;
      });
    }

    const formattedSales = sales.map((s) => {
      const sJson = s.toJSON();
      sJson._id = sJson.id;
      if (sJson.product) {
        sJson.product._id = sJson.product.id;
        sJson.productId = sJson.product;
      }
      if (sJson.user) {
        sJson.user._id = sJson.user.id;
        sJson.addedBy = sJson.user;
      }

      sJson.subtotal = Number(sJson.subtotal || sJson.totalAmount || 0);
      sJson.discount = Number(sJson.discount || 0);
      sJson.totalAmount = Number(sJson.totalAmount || 0);
      sJson.quantity = Number(sJson.quantity || 0);
      sJson.sellingPrice = Number(sJson.sellingPrice || 0);

      if (Array.isArray(sJson.items)) {
        sJson.items = sJson.items.map((it) => ({
          ...it,
          _id: it.id,
          quantity: Number(it.quantity || 0),
          sellingPrice: Number(it.sellingPrice || 0),
          costPriceSnapshot: Number(it.costPriceSnapshot || 0),
          subtotal: Number(it.subtotal || 0),
          product: it.product ? { ...it.product, _id: it.product.id } : null
        }));
      }

      return sJson;
    });

    const totalRevenue = formattedSales.reduce((sum, s) => sum + Number(s.totalAmount || 0), 0);
    const totalDiscount = formattedSales.reduce((sum, s) => sum + Number(s.discount || 0), 0);
    const totalTransactions = formattedSales.length;
    const totalQuantity = formattedSales.reduce((sum, s) => {
      if (Array.isArray(s.items) && s.items.length > 0) {
        return sum + s.items.reduce((iSum, it) => iSum + Number(it.quantity || 0), 0);
      }
      return sum + Number(s.quantity || 0);
    }, 0);

    res.status(200).json({
      success: true,
      count: formattedSales.length,
      totalRevenue,
      totalDiscount,
      totalTransactions,
      totalQuantity,
      sales: formattedSales
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @route   GET /api/sales/:id
// @desc    Get single sale by ID with full item details (for receipts)
// @access  Private
export const getSaleById = async (req, res) => {
  try {
    const sale = await Sale.findByPk(req.params.id, {
      include: [
        {
          model: SaleItem,
          as: 'items',
          include: [
            {
              model: Product,
              as: 'product',
              attributes: ['id', 'name', 'category', 'unit', 'qrCode', 'barcode', 'costPrice', 'unitPrice']
            }
          ]
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
      ]
    });

    if (!sale) {
      return res.status(404).json({ success: false, message: 'Sale record not found' });
    }

    const sJson = sale.toJSON();
    sJson._id = sJson.id;
    if (sJson.product) {
      sJson.product._id = sJson.product.id;
      sJson.productId = sJson.product;
    }
    if (sJson.user) {
      sJson.user._id = sJson.user.id;
      sJson.addedBy = sJson.user;
    }

    sJson.subtotal = Number(sJson.subtotal || sJson.totalAmount || 0);
    sJson.discount = Number(sJson.discount || 0);
    sJson.totalAmount = Number(sJson.totalAmount || 0);

    if (Array.isArray(sJson.items)) {
      sJson.items = sJson.items.map((it) => ({
        ...it,
        _id: it.id,
        quantity: Number(it.quantity || 0),
        sellingPrice: Number(it.sellingPrice || 0),
        costPriceSnapshot: Number(it.costPriceSnapshot || 0),
        subtotal: Number(it.subtotal || 0),
        product: it.product ? { ...it.product, _id: it.product.id } : null
      }));
    }

    res.status(200).json({ success: true, sale: sJson });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @route   POST /api/sales
// @desc    Record sale + AUTO STOCK DEDUCT + TRANSACTIONAL RECEIPT GENERATION
// @access  Private
export const createSale = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const {
      items, // Multi-line items array: [{ productId, quantity, sellingPrice }]
      productId, // Legacy single product
      quantity,
      sellingPrice,
      customerName,
      outletOrRoute,
      paymentMode,
      discount,
      receiptNumber: customReceiptNumber,
      date,
      notes
    } = req.body;

    // 1. Normalize line items
    let lineItems = [];
    if (Array.isArray(items) && items.length > 0) {
      lineItems = items.map((it) => ({
        productId: it.productId || it.product?._id || it.product?.id || it.product,
        quantity: Number(it.quantity),
        sellingPrice: Number(it.sellingPrice !== undefined ? it.sellingPrice : it.unitPrice || 0)
      }));
    } else if (productId && quantity) {
      lineItems = [
        {
          productId,
          quantity: Number(quantity),
          sellingPrice: Number(sellingPrice || 0)
        }
      ];
    }

    if (lineItems.length === 0) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'At least one sale item is required'
      });
    }

    // 2. Validate line items structure & quantities
    for (let i = 0; i < lineItems.length; i++) {
      const item = lineItems[i];
      if (!item.productId) {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: `Product is required for line item #${i + 1}`
        });
      }
      if (isNaN(item.quantity) || item.quantity <= 0) {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: `Quantity must be greater than zero for line item #${i + 1}`
        });
      }
      if (isNaN(item.sellingPrice) || item.sellingPrice < 0) {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: `Selling price must be valid for line item #${i + 1}`
        });
      }
    }

    // 3. STRICT STOCK AVAILABILITY CHECK BEFORE DEDUCTION
    // Aggregating requested quantity per product in case product appears multiple times
    const productQtyMap = {};
    for (const it of lineItems) {
      productQtyMap[it.productId] = (productQtyMap[it.productId] || 0) + it.quantity;
    }

    const productMap = {};
    for (const pId of Object.keys(productQtyMap)) {
      const product = await Product.findByPk(pId, { transaction });
      if (!product) {
        await transaction.rollback();
        return res.status(404).json({
          success: false,
          message: `Product with ID "${pId}" was not found.`
        });
      }

      const stock = await Stock.findOne({ where: { productId: pId }, transaction });
      const availableQty = Number(stock ? stock.currentQuantity : 0);
      const requestedQty = productQtyMap[pId];

      if (availableQty < requestedQty) {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: `Insufficient stock for "${product.name}". Available: ${availableQty} ${product.unit}, Requested: ${requestedQty} ${product.unit}. Sale blocked.`
        });
      }

      productMap[pId] = product;
    }

    // 4. Calculate Subtotal, Discount, and Net Grand Total
    let subtotal = 0;
    const preparedItems = [];
    for (const it of lineItems) {
      const product = productMap[it.productId];
      const lineSubtotal = Number((it.quantity * it.sellingPrice).toFixed(2));
      subtotal += lineSubtotal;
      const costPriceSnapshot = Number(product.costPrice || 0);

      preparedItems.push({
        productId: it.productId,
        quantity: it.quantity,
        sellingPrice: it.sellingPrice,
        costPriceSnapshot,
        subtotal: lineSubtotal
      });
    }

    subtotal = Number(subtotal.toFixed(2));
    const discountAmount = Math.max(0, Number(Number(discount || 0).toFixed(2)));
    const totalAmount = Math.max(0, Number((subtotal - discountAmount).toFixed(2)));

    // 5. Generate Unique Receipt Number
    let receiptNum = customReceiptNumber?.trim() || generateReceiptNumber();
    // Ensure uniqueness
    const existingRec = await Sale.findOne({ where: { receiptNumber: receiptNum }, transaction });
    if (existingRec) {
      receiptNum = generateReceiptNumber();
    }

    const userId = req.user?.id || req.user?._id;

    // 6. Create Sale Header
    const firstItem = preparedItems[0];
    const sale = await Sale.create(
      {
        receiptNumber: receiptNum,
        customerName: customerName || 'Walk-in Customer',
        outletOrRoute: outletOrRoute || 'Counter POS',
        paymentMode: paymentMode || 'Cash',
        subtotal,
        discount: discountAmount,
        totalAmount,
        date: date ? new Date(date) : new Date(),
        addedBy: userId,
        notes: notes || '',
        // For legacy single-item consumers:
        productId: lineItems.length === 1 ? firstItem.productId : null,
        quantity: lineItems.length === 1 ? firstItem.quantity : null,
        sellingPrice: lineItems.length === 1 ? firstItem.sellingPrice : null,
        costPriceSnapshot: lineItems.length === 1 ? firstItem.costPriceSnapshot : null
      },
      { transaction }
    );

    // 7. Create SaleItem rows & atomically subtract stock in the transaction
    for (const item of preparedItems) {
      await SaleItem.create(
        {
          saleId: sale.id,
          productId: item.productId,
          quantity: item.quantity,
          sellingPrice: item.sellingPrice,
          costPriceSnapshot: item.costPriceSnapshot,
          subtotal: item.subtotal
        },
        { transaction }
      );

      // Decrement stock in transaction
      await subtractStock(item.productId, item.quantity, { transaction });
    }

    // 8. Commit Transaction
    await transaction.commit();

    // 9. Audit Logging
    await logAudit({
      req,
      action: 'CREATE',
      entityType: 'Sale',
      entityId: sale.id,
      details: `Generated Receipt #${receiptNum} for ₹${totalAmount} (${paymentMode}) with ${preparedItems.length} item(s). Stock deducted.`
    });

    // 10. Fetch Complete Populated Sale for Client Receipt Rendering
    const populated = await Sale.findByPk(sale.id, {
      include: [
        {
          model: SaleItem,
          as: 'items',
          include: [
            {
              model: Product,
              as: 'product',
              attributes: ['id', 'name', 'category', 'unit', 'qrCode', 'barcode', 'costPrice', 'unitPrice']
            }
          ]
        },
        {
          model: Product,
          as: 'product',
          attributes: ['id', 'name', 'category', 'unit', 'qrCode', 'barcode']
        },
        {
          model: User,
          as: 'user',
          attributes: ['id', 'name', 'email']
        }
      ]
    });

    const sJson = populated.toJSON();
    sJson._id = sJson.id;
    if (sJson.product) {
      sJson.product._id = sJson.product.id;
      sJson.productId = sJson.product;
    }
    if (sJson.user) {
      sJson.user._id = sJson.user.id;
      sJson.addedBy = sJson.user;
    }

    res.status(201).json({
      success: true,
      message: `Sale completed! Receipt #${receiptNum} issued for ₹${totalAmount}.`,
      receiptNumber: receiptNum,
      sale: sJson
    });
  } catch (error) {
    if (!transaction.finished) {
      await transaction.rollback();
    }
    res.status(400).json({ success: false, message: error.message });
  }
};

// @route   DELETE /api/sales/:id
// @desc    Delete sale + RESTOCK REVERSED QUANTITIES IN TRANSACTION (Admin only)
// @access  Private/Admin
export const deleteSale = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const sale = await Sale.findByPk(req.params.id, {
      include: [
        { model: SaleItem, as: 'items' },
        { model: Product, as: 'product' }
      ],
      transaction
    });

    if (!sale) {
      await transaction.rollback();
      return res.status(404).json({ success: false, message: 'Sale record not found' });
    }

    // Restock all items
    if (Array.isArray(sale.items) && sale.items.length > 0) {
      for (const item of sale.items) {
        await addStock(item.productId, item.quantity, { transaction });
      }
    } else if (sale.productId && sale.quantity) {
      await addStock(sale.productId, sale.quantity, { transaction });
    }

    const receipt = sale.receiptNumber || `ID ${sale.id}`;
    await sale.destroy({ transaction });
    await transaction.commit();

    await logAudit({
      req,
      action: 'DELETE',
      entityType: 'Sale',
      entityId: req.params.id,
      details: `Admin voided/deleted Sale Receipt #${receipt}. Stock quantities reversed.`
    });

    res.status(200).json({
      success: true,
      message: `Sale Receipt #${receipt} deleted and inventory restocked successfully`
    });
  } catch (error) {
    if (!transaction.finished) {
      await transaction.rollback();
    }
    res.status(500).json({ success: false, message: error.message });
  }
};

// @route   PUT /api/sales/:id
// @desc    Edit/Correct sale order + re-adjust stock (Admin only: fix wrong staff entry)
// @access  Private/Admin
export const updateSale = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const sale = await Sale.findByPk(req.params.id, {
      include: [
        { model: SaleItem, as: 'items' },
        { model: Product, as: 'product' }
      ],
      transaction
    });

    if (!sale) {
      await transaction.rollback();
      return res.status(404).json({ success: false, message: 'Sale record not found' });
    }

    const {
      customerName,
      outletOrRoute,
      paymentMode,
      discount,
      date,
      notes,
      correctionReason,
      items
    } = req.body;

    // 1. If items are being modified, reconcile stock
    if (Array.isArray(items) && items.length > 0) {
      // Step A: Revert old stock deductions
      if (Array.isArray(sale.items) && sale.items.length > 0) {
        for (const oldIt of sale.items) {
          await addStock(oldIt.productId, oldIt.quantity, { transaction });
        }
      } else if (sale.productId && sale.quantity) {
        await addStock(sale.productId, sale.quantity, { transaction });
      }

      // Step B: Validate new items and check stock
      let newSubtotal = 0;
      const preparedNewItems = [];

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const numQty = Number(item.quantity);
        const numPrice = Number(item.sellingPrice);

        if (!item.productId || isNaN(numQty) || numQty <= 0) {
          await transaction.rollback();
          return res.status(400).json({
            success: false,
            message: `Valid product and positive quantity required for item #${i + 1}`
          });
        }

        const product = await Product.findByPk(item.productId, { transaction });
        if (!product) {
          await transaction.rollback();
          return res.status(404).json({
            success: false,
            message: `Product ID ${item.productId} not found`
          });
        }

        const stock = await Stock.findOne({ where: { productId: item.productId }, transaction });
        const available = Number(stock ? stock.currentQuantity : 0);
        if (available < numQty) {
          await transaction.rollback();
          return res.status(400).json({
            success: false,
            message: `Insufficient stock for "${product.name}". Available after adjustment: ${available}, Requested: ${numQty}`
          });
        }

        const lineSub = Number((numQty * numPrice).toFixed(2));
        newSubtotal += lineSub;

        preparedNewItems.push({
          productId: item.productId,
          quantity: numQty,
          sellingPrice: numPrice,
          costPriceSnapshot: Number(product.costPrice || 0),
          subtotal: lineSub
        });
      }

      // Step C: Deduct new stock and update SaleItems
      await SaleItem.destroy({ where: { saleId: sale.id }, transaction });

      for (const pIt of preparedNewItems) {
        await SaleItem.create(
          {
            saleId: sale.id,
            productId: pIt.productId,
            quantity: pIt.quantity,
            sellingPrice: pIt.sellingPrice,
            costPriceSnapshot: pIt.costPriceSnapshot,
            subtotal: pIt.subtotal
          },
          { transaction }
        );
        await subtractStock(pIt.productId, pIt.quantity, { transaction });
      }

      const disc = discount !== undefined ? Math.max(0, Number(discount)) : Number(sale.discount || 0);
      sale.subtotal = Number(newSubtotal.toFixed(2));
      sale.discount = Number(disc.toFixed(2));
      sale.totalAmount = Math.max(0, Number((newSubtotal - disc).toFixed(2)));

      if (preparedNewItems.length === 1) {
        sale.productId = preparedNewItems[0].productId;
        sale.quantity = preparedNewItems[0].quantity;
        sale.sellingPrice = preparedNewItems[0].sellingPrice;
        sale.costPriceSnapshot = preparedNewItems[0].costPriceSnapshot;
      } else {
        sale.productId = null;
        sale.quantity = null;
        sale.sellingPrice = null;
        sale.costPriceSnapshot = null;
      }
    } else if (discount !== undefined) {
      const disc = Math.max(0, Number(discount));
      sale.discount = Number(disc.toFixed(2));
      sale.totalAmount = Math.max(0, Number((Number(sale.subtotal || 0) - disc).toFixed(2)));
    }

    if (customerName !== undefined) sale.customerName = customerName.trim() || 'Walk-in Customer';
    if (outletOrRoute !== undefined) sale.outletOrRoute = outletOrRoute;
    if (paymentMode !== undefined) sale.paymentMode = paymentMode;
    if (date !== undefined && date) sale.date = new Date(date);
    if (notes !== undefined) {
      sale.notes = correctionReason 
        ? `${notes} (Admin Correction: ${correctionReason})`.trim()
        : notes;
    }

    await sale.save({ transaction });
    await transaction.commit();

    await logAudit({
      req,
      action: 'UPDATE',
      entityType: 'Sale',
      entityId: sale.id,
      details: `Admin corrected Sale #${sale.receiptNumber}. New Total: ₹${sale.totalAmount}. Reason: ${correctionReason || 'Staff entry error corrected'}`
    });

    const updatedSale = await Sale.findByPk(sale.id, {
      include: [
        {
          model: SaleItem,
          as: 'items',
          include: [{ model: Product, as: 'product', attributes: ['id', 'name', 'category', 'unit', 'costPrice', 'unitPrice'] }]
        },
        { model: Product, as: 'product' },
        { model: User, as: 'user', attributes: ['id', 'name', 'email'] }
      ]
    });

    res.status(200).json({
      success: true,
      message: `Sale #${sale.receiptNumber} successfully corrected by Admin. Inventory synced!`,
      sale: updatedSale
    });
  } catch (error) {
    if (!transaction.finished) {
      await transaction.rollback();
    }
    console.error('updateSale error:', error);
    res.status(500).json({ success: false, message: error.message || 'Failed to update sale' });
  }
};
