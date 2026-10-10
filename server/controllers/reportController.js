import { Op } from 'sequelize';
import { 
  Product, 
  Stock, 
  Purchase, 
  Sale, 
  Production, 
  ExpiryBatch, 
  ProductionOutput, 
  User, 
  PurchaseItem, 
  SaleItem 
} from '../models/index.js';
import { addStock, subtractStock } from '../services/stockSyncService.js';
import { logAudit } from '../middleware/auditLogger.js';

// In-memory cache for dashboard aggregations with 30s TTL
const reportCache = new Map();
const CACHE_TTL = 30 * 1000;

export const clearReportCache = () => {
  reportCache.clear();
};

// @route   GET /api/reports/dashboard-stats
// @desc    Get aggregated stats for dashboard counters and quick alerts
// @access  Private
export const getDashboardStats = async (req, res) => {
  try {
    const isAdmin = req.user?.role === 'admin';
    const cacheKey = `stats_${isAdmin ? 'admin' : 'staff'}`;
    const cached = reportCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) {
      return res.status(200).json(cached.data);
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [
      stocks,
      allProducts,
      todayPurchases,
      todaySales,
      nearExpiryBatches,
      expiredBatches,
      recentSales,
      recentPurchases
    ] = await Promise.all([
      Stock.findAll({ include: [{ model: Product, as: 'product' }] }),
      Product.findAll({ where: { isActive: true } }),
      Purchase.findAll({ 
        where: { date: { [Op.gte]: today } },
        include: [
          { model: PurchaseItem, as: 'items', include: [{ model: Product, as: 'product' }] },
          { model: Product, as: 'product' }
        ]
      }),
      Sale.findAll({ 
        where: { date: { [Op.gte]: today } },
        include: [
          { model: SaleItem, as: 'items', include: [{ model: Product, as: 'product' }] },
          { model: Product, as: 'product' }
        ]
      }),
      ExpiryBatch.findAll({
        where: { status: 'near-expiry' },
        include: [{ model: Product, as: 'product' }]
      }),
      ExpiryBatch.findAll({
        where: { status: 'expired' },
        include: [{ model: Product, as: 'product' }]
      }),
      Sale.findAll({
        limit: 8,
        order: [['date', 'DESC'], ['id', 'DESC']],
        include: [
          { model: SaleItem, as: 'items', include: [{ model: Product, as: 'product', attributes: ['id', 'name', 'unit', 'category'] }] },
          { model: Product, as: 'product', attributes: ['id', 'name', 'unit', 'category'] }
        ]
      }),
      Purchase.findAll({
        limit: 8,
        order: [['date', 'DESC'], ['id', 'DESC']],
        include: [
          { model: PurchaseItem, as: 'items', include: [{ model: Product, as: 'product', attributes: ['id', 'name', 'unit', 'category'] }] },
          { model: Product, as: 'product', attributes: ['id', 'name', 'unit', 'category'] }
        ]
      })
    ]);

    // Map stock for each product ensuring every active product is counted
    const stockMap = new Map();
    stocks.forEach((s) => {
      if (s.productId) stockMap.set(Number(s.productId), s);
    });

    const activeStocks = allProducts.map((p) => {
      const s = stockMap.get(Number(p.id));
      const currentQuantity = s ? Number(s.currentQuantity || 0) : 0;
      const reorderThreshold = s ? Number(s.reorderThreshold || 20) : Number(p.reorderThreshold || 20);
      return {
        product: p,
        productId: p.id,
        currentQuantity,
        reorderThreshold
      };
    });

    const totalStockUnits = activeStocks.reduce((sum, s) => sum + Number(s.currentQuantity || 0), 0);
    const totalInventoryValue = activeStocks.reduce(
      (sum, s) => sum + (Number(s.currentQuantity || 0) * Number(s.product?.unitPrice || 0)),
      0
    );
    const totalInventoryCost = activeStocks.reduce(
      (sum, s) => sum + (Number(s.currentQuantity || 0) * Number(s.product?.costPrice || 0)),
      0
    );

    const lowStockItems = activeStocks.filter((s) => {
      const qty = Number(s.currentQuantity || 0);
      const threshold = Number(s.reorderThreshold || 20);
      return qty > 0 && qty <= threshold;
    });

    // Multi-line sales calculation for today
    let todaySalesTotal = 0;
    let todaySalesQty = 0;
    let todaySalesCOGS = 0;

    todaySales.forEach((s) => {
      todaySalesTotal += Number(s.totalAmount || 0);
      if (s.items && s.items.length > 0) {
        s.items.forEach((item) => {
          todaySalesQty += Number(item.quantity || 0);
          const costPrice = Number(item.costPriceSnapshot !== undefined && item.costPriceSnapshot !== null 
            ? item.costPriceSnapshot 
            : (item.product?.costPrice || 0));
          todaySalesCOGS += costPrice * Number(item.quantity || 0);
        });
      } else {
        todaySalesQty += Number(s.quantity || 0);
        const costPrice = Number(s.costPriceSnapshot !== undefined && s.costPriceSnapshot !== null 
          ? s.costPriceSnapshot 
          : (s.product?.costPrice || 0));
        todaySalesCOGS += costPrice * Number(s.quantity || 0);
      }
    });
    const todayGrossProfit = todaySalesTotal - todaySalesCOGS;

    // Multi-line purchases calculation for today
    let todayPurchasesTotal = 0;
    let todayPurchasesQty = 0;

    todayPurchases.forEach((p) => {
      todayPurchasesTotal += Number(p.totalAmount || 0);
      if (p.items && p.items.length > 0) {
        p.items.forEach((item) => {
          todayPurchasesQty += Number(item.quantity || 0);
        });
      } else {
        todayPurchasesQty += Number(p.quantity || 0);
      }
    });

    // Sanitized activity for staff
    const sanitizedRecentSales = recentSales.map((s) => {
      const j = s.toJSON();
      j._id = j.id;
      if (!isAdmin) {
        delete j.costPriceSnapshot;
        if (j.items) {
          j.items = j.items.map(it => {
            const { costPriceSnapshot, ...rest } = it;
            return rest;
          });
        }
      }
      if (j.product) {
        j.product._id = j.product.id;
        j.productId = j.product;
      }
      return j;
    });

    const sanitizedRecentPurchases = recentPurchases.map((p) => {
      const j = p.toJSON();
      j._id = j.id;
      if (j.product) {
        j.product._id = j.product.id;
        j.productId = j.product;
      }
      return j;
    });

    // Build role-tailored stats object
    const statsPayload = {
      totalProducts: allProducts.length,
      totalStockUnits,
      lowStockCount: lowStockItems.length,
      lowStockItems: lowStockItems.slice(0, 6).map((s) => ({
        id: s.product?.id,
        _id: s.product?.id,
        name: s.product?.name,
        category: s.product?.category,
        unit: s.product?.unit,
        currentQuantity: Number(s.currentQuantity),
        reorderThreshold: Number(s.reorderThreshold)
      })),
      nearExpiryCount: nearExpiryBatches.length,
      nearExpiryBatches: nearExpiryBatches.slice(0, 6).map((b) => ({
        id: b.id,
        _id: b.id,
        batchNumber: b.batchNumber,
        productName: b.product?.name,
        unit: b.product?.unit,
        quantity: Number(b.quantity),
        expiryDate: b.expiryDate
      })),
      expiredCount: expiredBatches.length,
      today: {
        salesAmount: todaySalesTotal,
        salesQuantity: todaySalesQty,
        salesCount: todaySales.length,
        purchasesAmount: todayPurchasesTotal,
        purchasesQuantity: todayPurchasesQty,
        purchasesCount: todayPurchases.length,
        ...(isAdmin ? {
          grossProfit: todayGrossProfit,
          netProfit: todayGrossProfit
        } : {})
      },
      recentActivity: {
        sales: sanitizedRecentSales,
        purchases: sanitizedRecentPurchases
      }
    };

    // Admin-only financial valuations
    if (isAdmin) {
      statsPayload.totalInventoryValue = totalInventoryValue;
      statsPayload.totalInventoryCost = totalInventoryCost;
    } else {
      statsPayload.totalInventoryValue = totalInventoryValue; // Displayed on dashboard for counter value
    }

    const response = {
      success: true,
      stats: statsPayload,
      role: req.user?.role || 'staff'
    };

    reportCache.set(cacheKey, { timestamp: Date.now(), data: response });
    res.status(200).json(response);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @route   GET /api/reports/analytics
// @desc    Get detailed financial & stock reports filterable by date range and product
// @access  Private
export const getAnalyticsReport = async (req, res) => {
  try {
    const isAdmin = req.user?.role === 'admin';
    const { range, startDate, endDate, productId } = req.query;
    const cacheKey = `analytics_${isAdmin ? 'admin' : 'staff'}_${range || 'month'}_${startDate || ''}_${endDate || ''}_${productId || 'all'}`;
    const cached = reportCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) {
      return res.status(200).json(cached.data);
    }

    let start = new Date();
    let end = new Date();
    end.setHours(23, 59, 59, 999);

    if (range === 'today') {
      start.setHours(0, 0, 0, 0);
    } else if (range === 'week' || range === '7days') {
      start.setDate(start.getDate() - 7);
      start.setHours(0, 0, 0, 0);
    } else if (range === 'month' || range === '30days') {
      start.setDate(start.getDate() - 30);
      start.setHours(0, 0, 0, 0);
    } else if (range === '90days') {
      start.setDate(start.getDate() - 90);
      start.setHours(0, 0, 0, 0);
    } else if (range === 'thisMonth') {
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
    } else if (range === 'year') {
      start.setFullYear(start.getFullYear() - 1);
      start.setHours(0, 0, 0, 0);
    } else if (startDate && endDate) {
      start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
    } else {
      start.setDate(start.getDate() - 30);
      start.setHours(0, 0, 0, 0);
    }

    const dateFilter = { [Op.gte]: start, [Op.lte]: end };
    const purchaseWhere = { date: dateFilter };
    const saleWhere = { date: dateFilter };
    const prodWhere = { batchDate: dateFilter };

    const [purchases, sales, productions, discardedBatches, allProductsList] = await Promise.all([
      Purchase.findAll({
        where: purchaseWhere,
        include: [
          { 
            model: PurchaseItem, 
            as: 'items', 
            include: [{ model: Product, as: 'product', attributes: ['id', 'name', 'category', 'unit', 'unitPrice', 'costPrice'] }] 
          },
          { 
            model: Product, 
            as: 'product', 
            attributes: ['id', 'name', 'category', 'unit', 'unitPrice', 'costPrice'] 
          }
        ],
        order: [['date', 'ASC']]
      }),
      Sale.findAll({
        where: saleWhere,
        include: [
          { 
            model: SaleItem, 
            as: 'items', 
            include: [{ model: Product, as: 'product', attributes: ['id', 'name', 'category', 'unit', 'unitPrice', 'costPrice'] }] 
          },
          { 
            model: Product, 
            as: 'product', 
            attributes: ['id', 'name', 'category', 'unit', 'unitPrice', 'costPrice'] 
          }
        ],
        order: [['date', 'ASC']]
      }),
      Production.findAll({
        where: prodWhere,
        include: [{ model: ProductionOutput, as: 'outputProducts' }]
      }),
      ExpiryBatch.findAll({
        where: { status: 'discarded', updatedAt: dateFilter },
        include: [{ model: Product, as: 'product', attributes: ['id', 'name', 'unit', 'costPrice'] }]
      }),
      Product.findAll()
    ]);

    const productLookup = new Map(allProductsList.map((p) => [p.id, p]));

    // Initialize Time Series map for day-by-day trend
    const daysMap = new Map();
    const currentDate = new Date(start);
    while (currentDate <= end) {
      const dateKey = currentDate.toISOString().split('T')[0];
      daysMap.set(dateKey, { date: dateKey, revenue: 0, sales: 0, purchases: 0, cost: 0, profit: 0, marginPct: 0 });
      currentDate.setDate(currentDate.getDate() + 1);
    }

    // Aggregation structures
    let totalSalesAmount = 0;
    let totalSalesQuantity = 0;
    let totalCOGS = 0;

    const productPerformanceMap = new Map();
    const categoryMap = new Map();

    const getProductEntry = (pId, fallbackProd) => {
      const prod = productLookup.get(Number(pId)) || fallbackProd || {};
      if (!productPerformanceMap.has(Number(pId))) {
        productPerformanceMap.set(Number(pId), {
          id: Number(pId),
          name: prod.name || `Product #${pId}`,
          category: prod.category || 'other',
          unit: prod.unit || 'unit',
          unitPrice: Number(prod.unitPrice || 0),
          costPrice: Number(prod.costPrice || 0),
          quantitySold: 0,
          revenue: 0,
          cost: 0,
          profit: 0,
          profitMargin: 0
        });
      }
      return productPerformanceMap.get(Number(pId));
    };

    // Calculate item-level revenue, cost, profit
    sales.forEach((s) => {
      const saleDate = s.date || s.createdAt;
      const dateKey = saleDate ? new Date(saleDate).toISOString().split('T')[0] : '';
      const dayEntry = daysMap.get(dateKey);

      let saleRevenue = 0;
      let saleCost = 0;
      let saleQty = 0;

      if (s.items && s.items.length > 0) {
        s.items.forEach((item) => {
          if (productId && productId !== 'all' && Number(item.productId) !== Number(productId)) {
            return;
          }
          const qty = Number(item.quantity || 0);
          const sellPrice = Number(item.sellingPrice || 0);
          const costPrice = Number(
            item.costPriceSnapshot !== undefined && item.costPriceSnapshot !== null
              ? item.costPriceSnapshot
              : (item.product?.costPrice || 0)
          );
          const itemRev = Number(item.subtotal || (sellPrice * qty));
          const itemCost = costPrice * qty;
          const itemProfit = (sellPrice - costPrice) * qty;

          saleRevenue += itemRev;
          saleCost += itemCost;
          saleQty += qty;

          // Product aggregation
          const pEntry = getProductEntry(item.productId, item.product);
          pEntry.quantitySold += qty;
          pEntry.revenue += itemRev;
          pEntry.cost += itemCost;
          pEntry.profit += itemProfit;

          // Category aggregation
          const cat = item.product?.category || pEntry.category || 'other';
          const catEntry = categoryMap.get(cat) || { category: cat, revenue: 0, cost: 0, profit: 0, quantity: 0 };
          catEntry.revenue += itemRev;
          catEntry.cost += itemCost;
          catEntry.profit += itemProfit;
          catEntry.quantity += qty;
          categoryMap.set(cat, catEntry);
        });

        if ((!productId || productId === 'all') && Number(s.discount || 0) > 0) {
          const discount = Number(s.discount);
          saleRevenue = Math.max(0, saleRevenue - discount);
        }
      } else {
        if (productId && productId !== 'all' && Number(s.productId) !== Number(productId)) {
          return;
        }
        const qty = Number(s.quantity || 0);
        const sellPrice = Number(s.sellingPrice || (qty > 0 ? Number(s.totalAmount) / qty : 0));
        const costPrice = Number(
          s.costPriceSnapshot !== undefined && s.costPriceSnapshot !== null
            ? s.costPriceSnapshot
            : (s.product?.costPrice || 0)
        );
        const itemRev = Number(s.totalAmount || (sellPrice * qty));
        const itemCost = costPrice * qty;
        const itemProfit = itemRev - itemCost;

        saleRevenue += itemRev;
        saleCost += itemCost;
        saleQty += qty;

        const pId = s.productId || s.product?.id;
        if (pId) {
          const pEntry = getProductEntry(pId, s.product);
          pEntry.quantitySold += qty;
          pEntry.revenue += itemRev;
          pEntry.cost += itemCost;
          pEntry.profit += itemProfit;

          const cat = s.product?.category || pEntry.category || 'other';
          const catEntry = categoryMap.get(cat) || { category: cat, revenue: 0, cost: 0, profit: 0, quantity: 0 };
          catEntry.revenue += itemRev;
          catEntry.cost += itemCost;
          catEntry.profit += itemProfit;
          catEntry.quantity += qty;
          categoryMap.set(cat, catEntry);
        }
      }

      totalSalesAmount += saleRevenue;
      totalSalesQuantity += saleQty;
      totalCOGS += saleCost;

      if (dayEntry) {
        dayEntry.revenue += saleRevenue;
        dayEntry.sales += saleRevenue;
        dayEntry.cost += saleCost;
        dayEntry.profit += (saleRevenue - saleCost);
      }
    });

    // Purchases aggregation & Supplier performance
    let totalPurchasesAmount = 0;
    let totalPurchasesQuantity = 0;
    const supplierMap = new Map();

    purchases.forEach((p) => {
      const pDate = p.date || p.createdAt;
      const dateKey = pDate ? new Date(pDate).toISOString().split('T')[0] : '';
      const dayEntry = daysMap.get(dateKey);

      let purchaseAmt = 0;
      let purchaseQty = 0;

      if (p.items && p.items.length > 0) {
        p.items.forEach((item) => {
          if (productId && productId !== 'all' && Number(item.productId) !== Number(productId)) {
            return;
          }
          const qty = Number(item.quantity || 0);
          const subtotal = Number(item.subtotal || (Number(item.costPrice || 0) * qty));
          purchaseAmt += subtotal;
          purchaseQty += qty;
        });
      } else {
        if (productId && productId !== 'all' && Number(p.productId) !== Number(productId)) {
          return;
        }
        purchaseAmt += Number(p.totalAmount || 0);
        purchaseQty += Number(p.quantity || 0);
      }

      totalPurchasesAmount += purchaseAmt;
      totalPurchasesQuantity += purchaseQty;

      if (dayEntry) {
        dayEntry.purchases += purchaseAmt;
      }

      // Supplier Performance aggregation
      const suppName = p.supplierName || 'Cooperative Dairy Hub';
      const curSupp = supplierMap.get(suppName) || { 
        supplierName: suppName, 
        totalAmount: 0, 
        ordersCount: 0, 
        unitsCount: 0 
      };
      curSupp.totalAmount += purchaseAmt;
      curSupp.ordersCount += 1;
      curSupp.unitsCount += purchaseQty;
      supplierMap.set(suppName, curSupp);
    });

    const grossProfit = totalSalesAmount - totalCOGS;

    const batchWastageLoss = discardedBatches.reduce(
      (sum, b) => sum + (Number(b.quantity || 0) * Number(b.product?.costPrice || 0)),
      0
    );
    const totalWastageUnits = discardedBatches.reduce((sum, b) => sum + Number(b.quantity || 0), 0);
    const productionWastageLitres = productions.reduce((sum, p) => sum + Number(p.inputQuantity || 0), 0);

    const netProfit = grossProfit - batchWastageLoss;
    const profitMarginPct = totalSalesAmount > 0 
      ? Number(((grossProfit / totalSalesAmount) * 100).toFixed(2)) 
      : 0;

    // Previous period comparison for Net Profit (Admin only)
    let netProfitChangePct = 0;
    let isProfitUp = true;
    let previousPeriodNetProfit = 0;

    if (isAdmin) {
      try {
        const durationMs = Math.max(86400000, end.getTime() - start.getTime());
        const prevStart = new Date(start.getTime() - durationMs);
        const prevEnd = new Date(start.getTime() - 1);

        const prevSales = await Sale.findAll({
          where: { date: { [Op.gte]: prevStart, [Op.lte]: prevEnd } },
          include: [{ model: SaleItem, as: 'items' }]
        });

        let prevRev = 0;
        let prevCogs = 0;
        prevSales.forEach((s) => {
          prevRev += Number(s.totalAmount || 0);
          if (s.items && s.items.length > 0) {
            s.items.forEach(i => {
              prevCogs += Number(i.costPriceSnapshot || 0) * Number(i.quantity || 0);
            });
          } else {
            prevCogs += Number(s.costPriceSnapshot || 0) * Number(s.quantity || 0);
          }
        });
        previousPeriodNetProfit = prevRev - prevCogs;
        if (previousPeriodNetProfit !== 0) {
          netProfitChangePct = Number((((netProfit - previousPeriodNetProfit) / Math.abs(previousPeriodNetProfit)) * 100).toFixed(1));
        } else {
          netProfitChangePct = netProfit > 0 ? 100 : 0;
        }
        isProfitUp = netProfit >= previousPeriodNetProfit;
      } catch (err) {
        console.warn('Previous period calculation error:', err.message);
      }
    }

    // Stock Health Statistics
    const activeProducts = allProductsList.filter(p => p.isActive !== false);
    let healthyCount = 0;
    let lowCount = 0;
    let outCount = 0;
    activeProducts.forEach((p) => {
      const stock = Number(p.currentQuantity || 0);
      const reorder = Number(p.reorderThreshold || 20);
      if (stock <= 0) {
        outCount++;
      } else if (stock <= reorder) {
        lowCount++;
      } else {
        healthyCount++;
      }
    });
    const totalProdCount = activeProducts.length || 1;
    const stockHealth = [
      { name: 'Healthy Stock', count: healthyCount, percentage: Number(((healthyCount / totalProdCount) * 100).toFixed(1)), color: '#16a34a' },
      { name: 'Low Stock', count: lowCount, percentage: Number(((lowCount / totalProdCount) * 100).toFixed(1)), color: '#f59e0b' },
      { name: 'Out of Stock', count: outCount, percentage: Number(((outCount / totalProdCount) * 100).toFixed(1)), color: '#ef4444' }
    ];

    // Finalize product margins and rankings
    const productList = Array.from(productPerformanceMap.values()).map((p) => {
      const margin = p.revenue > 0 ? Number(((p.profit / p.revenue) * 100).toFixed(2)) : 0;
      return {
        ...p,
        profitMargin: margin,
        totalAmount: p.revenue,
        totalQty: p.quantitySold
      };
    });

    // Best & worst performing products
    const productsWithSales = productList.filter((p) => p.quantitySold > 0 || p.revenue > 0);
    const bestPerforming = [...productsWithSales].sort((a, b) => b.profitMargin - a.profitMargin).slice(0, 8);
    const worstPerforming = [...productsWithSales].sort((a, b) => a.profitMargin - b.profitMargin).slice(0, 8);
    const topSelling = [...productsWithSales].sort((a, b) => b.revenue - a.revenue).slice(0, 8);

    // Finalize category breakdown
    const categoryBreakdown = Array.from(categoryMap.values()).map((c) => ({
      category: c.category,
      amount: c.revenue,
      revenue: c.revenue,
      cost: c.cost,
      profit: c.profit,
      quantity: c.quantity,
      profitMargin: c.revenue > 0 ? Number(((c.profit / c.revenue) * 100).toFixed(2)) : 0
    })).sort((a, b) => b.revenue - a.revenue);

    // Finalize TimeSeries with margin %
    const timeSeries = Array.from(daysMap.values()).map(d => ({
      ...d,
      marginPct: d.revenue > 0 ? Number(((d.profit / d.revenue) * 100).toFixed(1)) : 0
    }));

    // Supplier performance sorted
    const supplierPerformance = Array.from(supplierMap.values()).sort((a, b) => b.totalAmount - a.totalAmount);

    // Build role-tailored summary
    const responseSummary = {
      totalSalesAmount,
      totalSalesQuantity,
      totalPurchasesAmount,
      totalPurchasesQuantity,
      totalRevenue: totalSalesAmount,
      totalPurchases: totalPurchasesAmount,
      totalUnitsSold: totalSalesQuantity,
      ...(isAdmin ? {
        totalCOGS,
        totalCost: totalCOGS,
        grossProfit,
        batchWastageLoss,
        totalWastageUnits,
        productionWastageLitres,
        netProfit,
        profitMarginPct,
        profitMargin: profitMarginPct,
        netProfitChangePct,
        isProfitUp,
        previousPeriodNetProfit
      } : {})
    };

    // Role-tailored sanitized arrays for staff
    let sanitizedTimeSeries = timeSeries;
    let sanitizedCategories = categoryBreakdown;
    let sanitizedTopSelling = topSelling;
    let sanitizedProducts = productList;

    if (!isAdmin) {
      sanitizedTimeSeries = timeSeries.map(({ cost, profit, marginPct, ...rest }) => rest);
      sanitizedCategories = categoryBreakdown.map(({ cost, profit, profitMargin, ...rest }) => rest);
      sanitizedTopSelling = topSelling.map(({ cost, profit, profitMargin, ...rest }) => rest);
      sanitizedProducts = productList.map(({ cost, profit, profitMargin, ...rest }) => rest);
    }

    const payload = {
      success: true,
      role: req.user?.role || 'staff',
      summary: responseSummary,
      timeSeries: sanitizedTimeSeries,
      categoryBreakdown: sanitizedCategories,
      topSelling: sanitizedTopSelling,
      stockHealth,
      ...(isAdmin ? {
        bestPerformingProducts: bestPerforming,
        worstPerformingProducts: worstPerforming,
        productPerformance: sanitizedProducts,
        supplierPerformance
      } : {})
    };

    reportCache.set(cacheKey, { timestamp: Date.now(), data: payload });
    res.status(200).json(payload);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};




// @route   GET /api/reports/export-csv
// @desc    Download CSV reports for all data entities & blank templates
// @access  Private
export const exportReportCsv = async (req, res) => {
  try {
    const { type } = req.query; // 'products' | 'stock' | 'sales' | 'purchases' | 'expiry' | 'production' | 'profit-loss' | 'template-products' | 'template-purchases' | 'template-sales'

    // Export: Profit & Loss Statement CSV
    if (type === 'profit-loss') {
      const sales = await Sale.findAll({
        include: [
          { model: SaleItem, as: 'items', include: [{ model: Product, as: 'product' }] },
          { model: Product, as: 'product' }
        ],
        order: [['date', 'DESC']]
      });

      const pMap = new Map();
      sales.forEach((s) => {
        if (s.items && s.items.length > 0) {
          s.items.forEach((item) => {
            const pId = item.productId;
            const pName = item.product?.name || `Product #${pId}`;
            const pCat = item.product?.category || 'General';
            const pUnit = item.product?.unit || 'unit';
            const qty = Number(item.quantity || 0);
            const sellPrice = Number(item.sellingPrice || 0);
            const costPrice = Number(
              item.costPriceSnapshot !== undefined && item.costPriceSnapshot !== null 
                ? item.costPriceSnapshot 
                : (item.product?.costPrice || 0)
            );
            const rev = Number(item.subtotal || (sellPrice * qty));
            const cost = costPrice * qty;
            const profit = (sellPrice - costPrice) * qty;

            const existing = pMap.get(pId) || { name: pName, category: pCat, unit: pUnit, qty: 0, revenue: 0, cost: 0, profit: 0 };
            existing.qty += qty;
            existing.revenue += rev;
            existing.cost += cost;
            existing.profit += profit;
            pMap.set(pId, existing);
          });
        } else if (s.productId || s.product) {
          const pId = s.productId || s.product?.id;
          const pName = s.product?.name || `Product #${pId}`;
          const pCat = s.product?.category || 'General';
          const pUnit = s.product?.unit || 'unit';
          const qty = Number(s.quantity || 0);
          const sellPrice = Number(s.sellingPrice || 0);
          const costPrice = Number(s.costPriceSnapshot || s.product?.costPrice || 0);
          const rev = Number(s.totalAmount || (sellPrice * qty));
          const cost = costPrice * qty;
          const profit = rev - cost;

          const existing = pMap.get(pId) || { name: pName, category: pCat, unit: pUnit, qty: 0, revenue: 0, cost: 0, profit: 0 };
          existing.qty += qty;
          existing.revenue += rev;
          existing.cost += cost;
          existing.profit += profit;
          pMap.set(pId, existing);
        }
      });

      let csv = 'Product Name,Category,Units Sold,Unit,Gross Revenue (INR),COGS Cost (INR),Gross Profit (INR),Profit Margin (%)\n';
      let totalRev = 0;
      let totalCost = 0;
      let totalProfit = 0;
      let totalUnits = 0;

      Array.from(pMap.values()).forEach((p) => {
        const margin = p.revenue > 0 ? ((p.profit / p.revenue) * 100).toFixed(2) : '0.00';
        totalRev += p.revenue;
        totalCost += p.cost;
        totalProfit += p.profit;
        totalUnits += p.qty;
        csv += `"${p.name}","${p.category}",${p.qty},"${p.unit}",${p.revenue.toFixed(2)},${p.cost.toFixed(2)},${p.profit.toFixed(2)},${margin}%\n`;
      });

      const overallMargin = totalRev > 0 ? ((totalProfit / totalRev) * 100).toFixed(2) : '0.00';
      csv += `\n"TOTAL / AGGREGATE","ALL CATEGORIES",${totalUnits},"-",${totalRev.toFixed(2)},${totalCost.toFixed(2)},${totalProfit.toFixed(2)},${overallMargin}%\n`;

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=mother_dairy_profit_and_loss_report.csv');
      return res.send(csv);
    }

    // Template 1: Products Import Template
    if (type === 'template-products') {
      let csv = 'Product Name,Category,Unit,Unit Price,Cost Price,QR Code,Shelf Life Days,Reorder Threshold,Description\n';
      csv += '"Mother Dairy Cow Ghee 1L","ghee","tin",680,540,"MD-GHEE-COW-1L",180,10,"Pure Cow Ghee Tin"\n';
      csv += '"Mother Dairy Malai Paneer 200g","paneer","packet",95,75,"MD-PANEER-MALAI-200G",15,20,"Fresh Malai Paneer"\n';
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=products_import_template.csv');
      return res.send(csv);
    }

    // Template 2: Purchases Import Template
    if (type === 'template-purchases') {
      let csv = 'Product ID or Name,Quantity,Cost Price,Supplier Name,Invoice Number,Date,Expiry Date,Batch Number\n';
      csv += '"Mother Dairy Full Cream Milk (1L)",100,54,"Mother Dairy Central Plant","INV-9901","2026-08-25","2026-08-27","BCH-MIL-001"\n';
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=purchases_import_template.csv');
      return res.send(csv);
    }

    // Template 3: Sales Import Template
    if (type === 'template-sales') {
      let csv = 'Product ID or Name,Quantity,Selling Price,Customer Name,Payment Mode,Date,Outlet or Route\n';
      csv += '"Mother Dairy Full Cream Milk (1L)",5,68,"Counter Walkin","Cash","2026-08-25","Main Counter POS"\n';
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=sales_import_template.csv');
      return res.send(csv);
    }

    // Export: Products Catalog
    if (type === 'products') {
      const products = await Product.findAll({ order: [['name', 'ASC']] });
      let csv = 'ID,Product Name,Category,Unit,Selling Price (INR),Cost Price (INR),QR Code,Shelf Life (Days),Reorder Threshold,Status\n';
      products.forEach((p) => {
        csv += `"${p.id}","${p.name}","${p.category}","${p.unit}",${p.unitPrice},${p.costPrice},"${p.qrCode}",${p.shelfLifeDays},${p.reorderThreshold},"${p.isActive ? 'Active' : 'Inactive'}"\n`;
      });
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=mother_dairy_products_catalog.csv');
      return res.send(csv);
    }

    // Export: Sales History
    if (type === 'sales') {
      const sales = await Sale.findAll({
        include: [
          { model: SaleItem, as: 'items', include: [{ model: Product, as: 'product' }] },
          { model: Product, as: 'product', attributes: ['id', 'name', 'category', 'unit'] }
        ],
        order: [['date', 'DESC']]
      });
      let csv = 'Sale ID,Receipt No,Date,Product Name,Category,Quantity,Unit,Selling Price (INR),Line Total (INR),Total Invoice (INR),Customer Name,Payment Mode,Route / POS\n';
      sales.forEach((s) => {
        const dateStr = s.date ? new Date(s.date).toISOString().split('T')[0] : '';
        const receiptNo = s.receiptNumber || `REC-${s.id}`;
        if (s.items && s.items.length > 0) {
          s.items.forEach((it) => {
            const pName = it.product?.name || 'Dairy Item';
            const pCat = it.product?.category || 'General';
            const pUnit = it.product?.unit || 'unit';
            const qty = Number(it.quantity || 0);
            const rate = Number(it.sellingPrice || 0);
            const lineTot = Number(it.subtotal || qty * rate);
            csv += `"${s.id}","${receiptNo}","${dateStr}","${pName}","${pCat}",${qty},"${pUnit}",${rate.toFixed(2)},${lineTot.toFixed(2)},${Number(s.totalAmount || 0).toFixed(2)},"${s.customerName || ''}","${s.paymentMode || 'Cash'}","${s.outletOrRoute || 'Counter'}"\n`;
          });
        } else {
          csv += `"${s.id}","${receiptNo}","${dateStr}","${s.product?.name || 'Dairy Item'}","${s.product?.category || 'General'}",${s.quantity || 1},"${s.product?.unit || 'unit'}",${Number(s.sellingPrice || s.totalAmount || 0).toFixed(2)},${Number(s.totalAmount || 0).toFixed(2)},${Number(s.totalAmount || 0).toFixed(2)},"${s.customerName || ''}","${s.paymentMode || 'Cash'}","${s.outletOrRoute || 'Counter'}"\n`;
        }
      });
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=mother_dairy_sales_report.csv');
      return res.send(csv);
    }

    // Export: Purchases Inward
    if (type === 'purchases') {
      const purchases = await Purchase.findAll({
        include: [
          { model: PurchaseItem, as: 'items', include: [{ model: Product, as: 'product' }] },
          { model: Product, as: 'product', attributes: ['id', 'name', 'category', 'unit'] }
        ],
        order: [['date', 'DESC']]
      });
      let csv = 'Purchase ID,Invoice No,Date,Product Name,Category,Quantity,Unit,Cost Price (INR),Line Total (INR),Total Invoice (INR),Supplier Name\n';
      purchases.forEach((p) => {
        const dateStr = p.date ? new Date(p.date).toISOString().split('T')[0] : '';
        const invoiceNo = p.invoiceNumber || `INV-${p.id}`;
        if (p.items && p.items.length > 0) {
          p.items.forEach((it) => {
            const pName = it.product?.name || 'Dairy Inward';
            const pCat = it.product?.category || 'General';
            const pUnit = it.product?.unit || 'unit';
            const qty = Number(it.quantity || 0);
            const rate = Number(it.costPrice || 0);
            const lineTot = Number(it.subtotal || qty * rate);
            csv += `"${p.id}","${invoiceNo}","${dateStr}","${pName}","${pCat}",${qty},"${pUnit}",${rate.toFixed(2)},${lineTot.toFixed(2)},${Number(p.totalAmount || 0).toFixed(2)},"${p.supplierName || ''}"\n`;
          });
        } else {
          csv += `"${p.id}","${invoiceNo}","${dateStr}","${p.product?.name || 'Dairy Inward'}","${p.product?.category || 'General'}",${p.quantity || 1},"${p.product?.unit || 'unit'}",${Number(p.costPrice || p.totalAmount || 0).toFixed(2)},${Number(p.totalAmount || 0).toFixed(2)},${Number(p.totalAmount || 0).toFixed(2)},"${p.supplierName || ''}"\n`;
        }
      });
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=mother_dairy_purchases_report.csv');
      return res.send(csv);
    }

    // Export: Expiry Batches
    if (type === 'expiry') {
      const batches = await ExpiryBatch.findAll({
        include: [{ model: Product, as: 'product', attributes: ['id', 'name', 'category', 'unit'] }],
        order: [['expiryDate', 'ASC']]
      });
      let csv = 'Batch ID,Batch Number,Product Name,Category,Quantity,Unit,Manufacture Date,Expiry Date,Status,Notes\n';
      batches.forEach((b) => {
        csv += `"${b.id}","${b.batchNumber}","${b.product?.name || ''}","${b.product?.category || ''}",${b.quantity},"${b.product?.unit || ''}","${new Date(b.manufactureDate).toISOString().split('T')[0]}","${new Date(b.expiryDate).toISOString().split('T')[0]}","${b.status}","${b.notes || ''}"\n`;
      });
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=mother_dairy_expiry_batches_report.csv');
      return res.send(csv);
    }

    // Export: Production Processing
    if (type === 'production') {
      const productions = await Production.findAll({
        include: [
          { model: Product, as: 'rawMilkProduct', attributes: ['name', 'unit'] },
          { model: ProductionOutput, as: 'outputProducts', include: [{ model: Product, as: 'product', attributes: ['name', 'unit'] }] }
        ],
        order: [['batchDate', 'DESC']]
      });
      let csv = 'Production ID,Batch Date,Raw Milk Processed (L),Outputs Generated,Wastage (L),Notes\n';
      productions.forEach((p) => {
        const outputs = (p.outputProducts || []).map((o) => `${o.product?.name || 'Item'}: ${o.quantity} ${o.product?.unit || 'units'}`).join('; ');
        csv += `"${p.id}","${new Date(p.batchDate).toISOString().split('T')[0]}",${p.inputQuantity},"${outputs}",${p.wastage},"${p.notes || ''}"\n`;
      });
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=mother_dairy_production_log.csv');
      return res.send(csv);
    }

    // Default: Stock Valuation CSV
    const stocks = await Stock.findAll({
      include: [{ model: Product, as: 'product' }],
      order: [['currentQuantity', 'ASC']]
    });
    let csv = 'Product ID,QR Code,Product Name,Category,Unit,Current Quantity,Reorder Threshold,Unit Price (INR),Cost Price (INR),Total Stock Valuation (INR),Stock Status\n';
    stocks.forEach((s) => {
      if (s.product) {
        const isLow = Number(s.currentQuantity) <= Number(s.reorderThreshold);
        const totalVal = Number(s.currentQuantity) * Number(s.product.unitPrice || 0);
        csv += `"${s.product.id}","${s.product.qrCode}","${s.product.name}","${s.product.category}","${s.product.unit}",${s.currentQuantity},${s.reorderThreshold},${s.product.unitPrice},${s.product.costPrice || 0},${totalVal},"${isLow ? 'LOW STOCK' : 'HEALTHY'}"\n`;
      }
    });
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=mother_dairy_stock_valuation_report.csv');
    return res.send(csv);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @route   POST /api/reports/bulk-import
// @desc    Bulk upload and import products, purchases, sales, or batches
// @access  Private/Admin
export const bulkImportData = async (req, res) => {
  try {
    const { type, records } = req.body;
    const userId = req.user.id || req.user._id;

    if (!records || !Array.isArray(records) || records.length === 0) {
      return res.status(400).json({ success: false, message: 'No valid records provided for import.' });
    }

    let successCount = 0;
    const errors = [];

    // --- Bulk Import: Products ---
    if (type === 'products') {
      for (let i = 0; i < records.length; i++) {
        const row = records[i];
        try {
          const name = row.name || row['Product Name'] || row.productName;
          const category = (row.category || row.Category || 'other').toLowerCase();
          const unit = (row.unit || row.Unit || 'packet').toLowerCase();
          const unitPrice = Number(row.unitPrice || row['Unit Price'] || row.price || 0);
          const costPrice = Number(row.costPrice || row['Cost Price'] || Math.round(unitPrice * 0.8));
          const qrCode = row.qrCode || row['QR Code'] || `MD-${category.toUpperCase().slice(0, 3)}-${Date.now().toString().slice(-4)}${i}`;
          const shelfLifeDays = Number(row.shelfLifeDays || row['Shelf Life Days'] || 3);
          const reorderThreshold = Number(row.reorderThreshold || row['Reorder Threshold'] || 20);
          const initialQuantity = Number(row.initialQuantity || row.quantity || 0);

          if (!name || isNaN(unitPrice)) {
            errors.push(`Row ${i + 1}: Name and Unit Price are required.`);
            continue;
          }

          const [product, created] = await Product.findOrCreate({
            where: { [Op.or]: [{ qrCode }, { name }] },
            defaults: {
              name,
              category,
              unit,
              unitPrice,
              costPrice,
              qrCode,
              shelfLifeDays,
              reorderThreshold,
              isActive: true
            }
          });

          // Stock creation
          let stock = await Stock.findOne({ where: { productId: product.id } });
          if (!stock) {
            await Stock.create({
              productId: product.id,
              currentQuantity: initialQuantity,
              reorderThreshold,
              lastUpdated: new Date()
            });
          } else if (initialQuantity > 0) {
            stock.currentQuantity = Number(stock.currentQuantity || 0) + initialQuantity;
            await stock.save();
          }

          successCount++;
        } catch (err) {
          errors.push(`Row ${i + 1}: ${err.message}`);
        }
      }
    }

    // --- Bulk Import: Purchases ---
    else if (type === 'purchases') {
      for (let i = 0; i < records.length; i++) {
        const row = records[i];
        try {
          const prodIdentifier = row.productId || row.product || row['Product ID or Name'] || row.name;
          const qty = Number(row.quantity || row.Quantity || 0);
          const cost = Number(row.costPrice || row['Cost Price'] || 0);
          const supplier = row.supplierName || row['Supplier Name'] || row.supplier || 'Bulk Supplier';
          const invoice = row.invoiceNumber || row['Invoice Number'] || `BULK-INV-${Date.now().toString().slice(-4)}${i}`;
          const pDate = row.date || row.Date ? new Date(row.date || row.Date) : new Date();

          if (!prodIdentifier || qty <= 0) {
            errors.push(`Row ${i + 1}: Product and valid Quantity required.`);
            continue;
          }

          let product = null;
          if (!isNaN(prodIdentifier)) {
            product = await Product.findByPk(prodIdentifier);
          }
          if (!product) {
            product = await Product.findOne({ where: { name: { [Op.like]: `%${prodIdentifier}%` } } });
          }

          if (!product) {
            errors.push(`Row ${i + 1}: Product "${prodIdentifier}" not found.`);
            continue;
          }

          const total = Number((qty * cost).toFixed(2));
          await Purchase.create({
            productId: product.id,
            quantity: qty,
            costPrice: cost,
            totalAmount: total,
            supplierName: supplier,
            invoiceNumber: invoice,
            date: pDate,
            addedBy: userId
          });

          await addStock(product.id, qty);
          successCount++;
        } catch (err) {
          errors.push(`Row ${i + 1}: ${err.message}`);
        }
      }
    }

    // --- Bulk Import: Sales ---
    else if (type === 'sales') {
      for (let i = 0; i < records.length; i++) {
        const row = records[i];
        try {
          const prodIdentifier = row.productId || row.product || row['Product ID or Name'] || row.name;
          const qty = Number(row.quantity || row.Quantity || 0);
          const price = Number(row.sellingPrice || row['Selling Price'] || 0);
          const customer = row.customerName || row['Customer Name'] || 'Bulk POS Customer';
          const mode = row.paymentMode || row['Payment Mode'] || 'Cash';
          const sDate = row.date || row.Date ? new Date(row.date || row.Date) : new Date();

          if (!prodIdentifier || qty <= 0) {
            errors.push(`Row ${i + 1}: Product and valid Quantity required.`);
            continue;
          }

          let product = null;
          if (!isNaN(prodIdentifier)) {
            product = await Product.findByPk(prodIdentifier);
          }
          if (!product) {
            product = await Product.findOne({ where: { name: { [Op.like]: `%${prodIdentifier}%` } } });
          }

          if (!product) {
            errors.push(`Row ${i + 1}: Product "${prodIdentifier}" not found.`);
            continue;
          }

          await subtractStock(product.id, qty);
          const total = Number((qty * (price || product.unitPrice)).toFixed(2));

          await Sale.create({
            productId: product.id,
            quantity: qty,
            sellingPrice: price || product.unitPrice,
            costPriceSnapshot: product.costPrice || 0,
            totalAmount: total,
            customerName: customer,
            paymentMode: ['Cash', 'UPI', 'Card', 'Credit'].includes(mode) ? mode : 'Cash',
            date: sDate,
            addedBy: userId
          });

          successCount++;
        } catch (err) {
          errors.push(`Row ${i + 1}: ${err.message}`);
        }
      }
    } else {
      return res.status(400).json({ success: false, message: `Unsupported import type: ${type}` });
    }

    await logAudit({
      req,
      action: 'BULK_IMPORT',
      entityType: type,
      details: `Bulk imported ${successCount} ${type} records. Errors: ${errors.length}`
    });

    res.status(200).json({
      success: true,
      message: `Successfully imported ${successCount} ${type} records!`,
      successCount,
      failedCount: errors.length,
      errors: errors.slice(0, 10)
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
