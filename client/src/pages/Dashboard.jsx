import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  getDashboardStatsApi, 
  getAnalyticsReportApi,
  getProductsApi,
  getSalesApi,
  getPurchasesApi,
  getExpiryBatchesApi,
  quickStockInwardApi
} from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import Modal from '../components/common/Modal';
import { PRODUCT_CATEGORIES } from '../utils/categories';
import Badge from '../components/common/Badge';
import AnimatedCounter from '../components/common/AnimatedCounter';
import Sparkline from '../components/common/Sparkline';
import { 
  Boxes, 
  ShoppingCart, 
  Truck, 
  AlertTriangle, 
  Clock, 
  TrendingUp, 
  TrendingDown,
  ArrowRight, 
  Plus, 
  Factory, 
  RefreshCw, 
  CheckCircle2, 
  Calendar,
  Sparkles,
  ChevronRight,
  Search,
  X,
  PackageCheck,
  Zap,
  Building2,
  PieChart as PieChartIcon,
  BarChart3,
  ShieldCheck,
  ArrowUpRight,
  ArrowDownRight,
  SlidersHorizontal,
  ShoppingBag,
  FileText,
  Package
} from 'lucide-react';
import { 
  ResponsiveContainer, 
  AreaChart, 
  Area, 
  LineChart, 
  Line, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  Tooltip, 
  CartesianGrid, 
  PieChart, 
  Pie, 
  Cell, 
  Legend,
  RadialBarChart,
  RadialBar
} from 'recharts';

const DONUT_COLORS = ['#1e3a1e', '#2d4a2d', '#3d6b3d', '#6a9c6a', '#d97706', '#be123c', '#0B4F9C'];

// Animation stagger variants
const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.07,
      delayChildren: 0.05
    }
  }
};

const itemVariants = {
  hidden: { opacity: 0, y: 14 },
  show: { 
    opacity: 1, 
    y: 0, 
    transition: { duration: 0.4, ease: 'easeOut' } 
  }
};

const Dashboard = () => {
  const { user, isAdmin } = useAuth();
  const navigate = useNavigate();
  const searchInputRef = useRef(null);

  const [stats, setStats] = useState({
    totalProducts: 0,
    totalStockUnits: 0,
    lowStockCount: 0,
    lowStockItems: [],
    nearExpiryCount: 0,
    nearExpiryBatches: [],
    expiredCount: 0,
    today: {
      salesAmount: 0,
      salesCount: 0,
      purchasesAmount: 0,
      purchasesCount: 0,
      grossProfit: 0,
      netProfit: 0
    },
    recentActivity: { sales: [], purchases: [] }
  });
  const [analytics, setAnalytics] = useState(null);
  const [products, setProducts] = useState([]);
  const [sales, setSales] = useState([]);
  const [purchases, setPurchases] = useState([]);
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(new Date());
  const [autoRefresh, setAutoRefresh] = useState(true);

  // Global Time-range Filter (Today, 7 Days, 30 Days, 90 Days, Custom)
  const [dateRange, setDateRange] = useState('7days');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');

  // Global Search State
  const [searchQuery, setSearchQuery] = useState('');
  const [searchCategory, setSearchCategory] = useState('all');
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  // Dashboard Live Products Filter
  const [stockCategoryFilter, setStockCategoryFilter] = useState('All');

  // Quick Stock Add Modal State
  const { addToast } = useToast();
  const [isStockModalOpen, setIsStockModalOpen] = useState(false);
  const [submittingInward, setSubmittingInward] = useState(false);
  const [stockForm, setStockForm] = useState({
    productId: '',
    productName: '',
    category: 'milk',
    unit: 'litre',
    quantity: 10,
    costPrice: 28,
    unitPrice: 34,
    expiryDate: '',
    batchNumber: '',
    supplierName: 'Mother Dairy Plant / Direct',
    invoiceNumber: '',
    notes: ''
  });

  const handleOpenStockModal = () => {
    const today = new Date();
    const defaultExp = new Date(today.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const firstProd = products && products.length > 0 ? products[0] : null;

    setStockForm({
      productId: firstProd ? (firstProd.id || firstProd._id || '') : '',
      productName: firstProd ? firstProd.name : '',
      category: firstProd ? (firstProd.category || 'milk') : 'milk',
      unit: firstProd ? (firstProd.unit || 'litre') : 'litre',
      quantity: 10,
      costPrice: firstProd && firstProd.costPrice !== undefined ? Number(firstProd.costPrice) : 28,
      unitPrice: firstProd && firstProd.unitPrice !== undefined ? Number(firstProd.unitPrice) : 34,
      expiryDate: defaultExp,
      batchNumber: `BCH-MD-${Date.now().toString().slice(-5)}`,
      supplierName: 'Mother Dairy Plant / Direct',
      invoiceNumber: '',
      notes: ''
    });
    setIsStockModalOpen(true);
  };

  const handleProductSelect = (selectedId) => {
    if (!selectedId) {
      setStockForm(prev => ({ ...prev, productId: '' }));
      return;
    }
    const prod = products.find(p => String(p.id) === String(selectedId) || String(p._id) === String(selectedId));
    if (prod) {
      setStockForm(prev => ({
        ...prev,
        productId: prod.id || prod._id,
        productName: prod.name,
        category: prod.category || prev.category,
        unit: prod.unit || prev.unit,
        costPrice: prod.costPrice !== undefined ? Number(prod.costPrice) : prev.costPrice,
        unitPrice: prod.unitPrice !== undefined ? Number(prod.unitPrice) : prev.unitPrice
      }));
    }
  };

  const handleSubmitStock = async (e) => {
    e.preventDefault();
    const numQty = Number(stockForm.quantity);
    if (!numQty || numQty <= 0) {
      if (addToast) addToast('Please enter a valid quantity greater than 0', 'warning');
      return;
    }
    if (!stockForm.productName.trim()) {
      if (addToast) addToast('Product name is required', 'warning');
      return;
    }

    try {
      setSubmittingInward(true);
      const payload = {
        productId: stockForm.productId || undefined,
        productName: stockForm.productName.trim(),
        name: stockForm.productName.trim(),
        category: stockForm.category,
        unit: stockForm.unit,
        quantity: numQty,
        costPrice: Number(stockForm.costPrice || 0),
        unitPrice: Number(stockForm.unitPrice || 0),
        expiryDate: stockForm.expiryDate,
        batchNumber: stockForm.batchNumber || `BCH-${Date.now().toString().slice(-6)}`,
        supplierName: stockForm.supplierName || 'Plant Direct',
        invoiceNumber: stockForm.invoiceNumber,
        notes: stockForm.notes
      };

      await quickStockInwardApi(payload);
      if (addToast) addToast(`Successfully added +${numQty} ${stockForm.unit} to "${stockForm.productName}" stock!`, 'success');
      setIsStockModalOpen(false);
      window.dispatchEvent(new Event('stock-updated'));
      fetchDashboardData(true);
    } catch (err) {
      console.error('Stock inward error:', err);
      if (addToast) addToast(err.response?.data?.message || 'Failed to add stock', 'error');
    } finally {
      setSubmittingInward(false);
    }
  };

  // Keyboard shortcut Ctrl+K / Cmd+K
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
        setIsSearchOpen(true);
      }
      if (e.key === 'Escape') {
        setIsSearchOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Fetch Dashboard Data
  const fetchDashboardData = async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      setIsRefreshing(true);

      const params = { range: dateRange };
      if (dateRange === 'custom') {
        if (customStartDate) params.startDate = customStartDate;
        if (customEndDate) params.endDate = customEndDate;
      }

      const [statsRes, analyticsRes, productsRes, salesRes, purchasesRes, batchesRes] = await Promise.allSettled([
        getDashboardStatsApi(),
        getAnalyticsReportApi(params),
        getProductsApi({ activeOnly: true }),
        getSalesApi({ limit: 60 }),
        getPurchasesApi({ limit: 60 }),
        getExpiryBatchesApi()
      ]);

      let loadedProducts = [];
      if (productsRes.status === 'fulfilled' && productsRes.value?.data?.success && Array.isArray(productsRes.value.data.products)) {
        loadedProducts = productsRes.value.data.products;
        setProducts(loadedProducts);
      }

      if (salesRes.status === 'fulfilled' && salesRes.value?.data?.success && Array.isArray(salesRes.value.data.sales)) {
        setSales(salesRes.value.data.sales);
      }

      if (purchasesRes.status === 'fulfilled' && purchasesRes.value?.data?.success && Array.isArray(purchasesRes.value.data.purchases)) {
        setPurchases(purchasesRes.value.data.purchases);
      }

      let loadedBatches = [];
      if (batchesRes.status === 'fulfilled' && batchesRes.value?.data?.success && Array.isArray(batchesRes.value.data.batches)) {
        loadedBatches = batchesRes.value.data.batches;
        setBatches(loadedBatches);
      }

      const liveTotalStockUnits = loadedProducts.reduce((sum, p) => sum + (Number(p.currentQuantity) || 0), 0);
      const liveInventoryVal = loadedProducts.reduce((sum, p) => sum + ((Number(p.currentQuantity) || 0) * (Number(p.unitPrice) || 0)), 0);
      const liveLowStock = loadedProducts.filter(p => (Number(p.currentQuantity) || 0) <= (Number(p.reorderThreshold) || 20));

      const now = new Date();
      const threeDaysLater = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
      const liveExpired = loadedBatches.filter(b => b.status === 'expired' || new Date(b.expiryDate) < now);
      const liveNearExpiry = loadedBatches.filter(b => b.status === 'near-expiry' || (new Date(b.expiryDate) >= now && new Date(b.expiryDate) <= threeDaysLater));

      if (statsRes.status === 'fulfilled' && statsRes.value?.data?.success) {
        const s = statsRes.value.data.stats || {};
        setStats({
          ...s,
          totalStockUnits: loadedProducts.length > 0 ? liveTotalStockUnits : (s.totalStockUnits || 0),
          totalInventoryValue: loadedProducts.length > 0 ? liveInventoryVal : (s.totalInventoryValue || 0),
          lowStockCount: liveLowStock.length,
          lowStockItems: liveLowStock.slice(0, 6),
          nearExpiryCount: s.nearExpiryCount !== undefined ? s.nearExpiryCount : liveNearExpiry.length,
          expiredCount: s.expiredCount !== undefined ? s.expiredCount : liveExpired.length
        });
      }

      if (analyticsRes.status === 'fulfilled' && analyticsRes.value?.data?.success) {
        setAnalytics(analyticsRes.value.data);
      }

      setLastUpdated(new Date());
    } catch (error) {
      console.warn('Dashboard fallback active:', error?.message);
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, [dateRange, customStartDate, customEndDate]);

  // Auto-refresh timer (every 60s)
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      fetchDashboardData(true);
    }, 60000);
    return () => clearInterval(interval);
  }, [autoRefresh, dateRange, customStartDate, customEndDate]);

  // Search Filter Computation
  const query = searchQuery.trim().toLowerCase();
  const matchingProducts = query ? (products || []).filter(p => 
    (p.name || '').toLowerCase().includes(query) ||
    (p.category || '').toLowerCase().includes(query) ||
    (p.qrCode || '').toLowerCase().includes(query)
  ) : [];

  const matchingSales = query ? (sales || []).filter(s => 
    (s.customerName || '').toLowerCase().includes(query) ||
    (s.product?.name || s.productName || '').toLowerCase().includes(query) ||
    (s.receiptNumber || '').toLowerCase().includes(query)
  ) : [];

  const matchingPurchases = query ? (purchases || []).filter(p => 
    (p.supplierName || '').toLowerCase().includes(query) ||
    (p.invoiceNumber || '').toLowerCase().includes(query)
  ) : [];

  const matchingBatches = query ? (batches || []).filter(b => 
    (b.batchNumber || '').toLowerCase().includes(query) ||
    (b.product?.name || b.productName || '').toLowerCase().includes(query)
  ) : [];

  const totalResultsCount = matchingProducts.length + matchingSales.length + matchingPurchases.length + matchingBatches.length;

  // Live Products Filter for Inventory Table
  const displayedDashboardProducts = (products || []).filter(p => {
    if (stockCategoryFilter !== 'All' && p.category !== stockCategoryFilter) {
      return false;
    }
    if (query) {
      return (
        (p.name || '').toLowerCase().includes(query) ||
        (p.category || '').toLowerCase().includes(query) ||
        (p.qrCode || '').toLowerCase().includes(query)
      );
    }
    return true;
  });

  const statData = stats || {};
  const summary = analytics?.summary || {};

  // Financial & Operational Metrics
  const todaySalesAmt = Number(statData.today?.salesAmount || 0);
  const todaySalesCount = Number(statData.today?.salesCount || statData.today?.salesQuantity || 0);
  const todayPurchasesAmt = Number(statData.today?.purchasesAmount || 0);
  const todayPurchasesCount = Number(statData.today?.purchasesCount || statData.today?.purchasesQuantity || 0);
  const totalStockUnits = Number(statData.totalStockUnits || 0);
  const totalStockValuation = Number(statData.totalInventoryValue || 0);
  const lowStockCount = Number(statData.lowStockCount || 0);
  const nearExpiryCount = Number(statData.nearExpiryCount || 0);

  // Admin Financial Metrics
  const periodNetProfit = Number(summary.netProfit !== undefined ? summary.netProfit : (statData.today?.netProfit || 0));
  const profitMarginPct = Number(summary.profitMarginPct || 0);
  const netProfitChangePct = Number(summary.netProfitChangePct || 0);
  const isProfitUp = summary.isProfitUp !== false;

  // Extract Sparkline series from timeSeries
  const timeSeriesData = analytics?.timeSeries || [];
  const salesSparkline = useMemo(() => timeSeriesData.map(d => Number(d.sales || d.revenue || 0)), [timeSeriesData]);
  const purchaseSparkline = useMemo(() => timeSeriesData.map(d => Number(d.purchases || 0)), [timeSeriesData]);
  const profitSparkline = useMemo(() => timeSeriesData.map(d => Number(d.profit || 0)), [timeSeriesData]);

  // Feeds for Recent Activity
  const recentSalesFeed = (statData.recentActivity?.sales && statData.recentActivity.sales.length > 0)
    ? statData.recentActivity.sales
    : (sales || []);

  const recentPurchasesFeed = (statData.recentActivity?.purchases && statData.recentActivity.purchases.length > 0)
    ? statData.recentActivity.purchases
    : (purchases || []);

  // Dynamic Stock health data from live inventory
  const healthyCount = (products || []).filter(p => Number(p.currentQuantity || 0) > Number(p.reorderThreshold || 10)).length;
  const lowCount = (products || []).filter(p => Number(p.currentQuantity || 0) <= Number(p.reorderThreshold || 10) && Number(p.currentQuantity || 0) > 0).length;
  const outCount = (products || []).filter(p => Number(p.currentQuantity || 0) === 0).length;
  const totalCount = Math.max(1, (products || []).length);

  const stockHealthData = analytics?.stockHealth || [
    { name: 'Healthy Stock', count: healthyCount, percentage: Math.round((healthyCount / totalCount) * 100), color: '#16a34a' },
    { name: 'Low Stock', count: lowCount, percentage: Math.round((lowCount / totalCount) * 100), color: '#f59e0b' },
    { name: 'Out of Stock', count: outCount, percentage: Math.round((outCount / totalCount) * 100), color: '#ef4444' }
  ];

  // Top selling products for animated horizontal bar chart
  const topSellingProducts = (analytics?.topSelling || []).slice(0, 5);

  return (
    <motion.div 
      className="space-y-6 pb-14 font-sans"
      variants={containerVariants}
      initial="hidden"
      animate="show"
    >
      {/* 1. Header Bar with Role Indicator, Auto-Refresh, and Date Range Filter */}
      <motion.div 
        variants={itemVariants}
        className="bg-white p-5 sm:p-6 rounded-3xl border border-[#a0c396]/30 shadow-soft flex flex-col lg:flex-row lg:items-center justify-between gap-4"
      >
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-[#ebf5eb] text-[#1e3a1e] rounded-full text-[11px] font-bold tracking-wider uppercase border border-[#a0c396]/40">
              <ShieldCheck className="w-3.5 h-3.5 text-[#2d4a2d]" />
              <span>{isAdmin ? 'Admin Financial Dashboard' : 'Staff Operations Dashboard'}</span>
            </span>
            <span className="text-[11px] text-[#3f5a3f] hidden sm:inline">•</span>
            <span className="text-[11px] text-[#3f5a3f] hidden sm:inline">
              Updated {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
          </div>

          <h1 className="font-serif text-2xl sm:text-3xl font-bold text-[#1e3a1e] tracking-tight">
            {isAdmin ? 'Executive Milk Dairy Dashboard' : 'Dairy Outward & POS Operations'}
          </h1>
          <p className="text-xs text-[#3f5a3f] mt-1 max-w-xl">
            {isAdmin 
              ? 'Complete revenue velocity, COGS profit margins, live inventory valuations, and supplier audits.' 
              : 'Daily sales orders, stock balances, low-stock threshold triggers, and expiry batch monitoring.'}
          </p>
        </div>

        {/* Action Controls: Range Selector + Refresh + Purchase + Sales */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Global Date Range Selector */}
          <div className="flex items-center bg-[#f4f8f2] p-1 rounded-2xl border border-[#a0c396]/30 text-xs font-bold">
            {[
              { id: 'today', label: 'Today' },
              { id: '7days', label: '7D' },
              { id: '30days', label: '30D' },
              { id: '90days', label: '90D' }
            ].map(pill => (
              <button
                key={pill.id}
                onClick={() => setDateRange(pill.id)}
                className={`px-3 py-1.5 rounded-xl transition-all cursor-pointer ${
                  dateRange === pill.id 
                    ? 'bg-[#1e3a1e] text-white shadow-2xs font-bold' 
                    : 'text-[#3f5a3f] hover:text-[#1e3a1e]'
                }`}
              >
                {pill.label}
              </button>
            ))}
          </div>

          {/* Auto Refresh Toggle */}
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`px-3 py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer flex items-center gap-1.5 ${
              autoRefresh 
                ? 'bg-[#ebf5eb] text-[#1e3a1e] border-[#a0c396]/50 shadow-2xs' 
                : 'bg-slate-100 text-slate-500 border-slate-200'
            }`}
            title={autoRefresh ? 'Auto-refresh active (every 60s)' : 'Auto-refresh paused'}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-[#1e3a1e]' : ''}`} />
            <span className="hidden sm:inline">{autoRefresh ? 'Live (60s)' : 'Paused'}</span>
          </button>
        </div>
      </motion.div>

      {/* 2. PROMINENT GLOBAL SEARCH BAR */}
      <motion.div variants={itemVariants} className="relative z-30">
        <div className="bg-white/95 backdrop-blur-md rounded-2xl sm:rounded-3xl border-2 border-[#a0c396]/50 p-2 sm:p-2.5 shadow-md hover:border-[#1e3a1e]/60 transition-all focus-within:border-[#1e3a1e] focus-within:ring-4 focus-within:ring-[#a0c396]/20">
          <div className="flex items-center gap-2 sm:gap-3 px-2">
            <Search className="w-5 h-5 text-[#2d4a2d] shrink-0" />
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Global Search: Type product name, category, QR code, customer, supplier, invoice or receipt..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setIsSearchOpen(true);
              }}
              onFocus={() => setIsSearchOpen(true)}
              className="w-full bg-transparent text-sm sm:text-base text-slate-800 placeholder-slate-400 font-medium focus:outline-none py-1.5"
            />

            {searchQuery && (
              <button
                onClick={() => {
                  setSearchQuery('');
                  setIsSearchOpen(false);
                }}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
                title="Clear search"
              >
                <X className="w-4 h-4" />
              </button>
            )}

            <div className="hidden sm:flex items-center gap-1 px-2 py-1 rounded-lg bg-[#ebf5eb] text-[#1e3a1e] border border-[#a0c396]/40 text-[11px] font-mono font-bold shrink-0">
              <span>Ctrl</span>
              <span>+</span>
              <span>K</span>
            </div>
          </div>
        </div>

        {/* Real-Time Dropdown Results Panel */}
        <AnimatePresence>
          {isSearchOpen && searchQuery.trim() && (
            <>
              <div 
                className="fixed inset-0 z-20"
                onClick={() => setIsSearchOpen(false)}
              />

              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.15 }}
                className="absolute top-full left-0 right-0 mt-2 bg-white rounded-3xl border border-slate-200 shadow-2xl overflow-hidden z-30 max-h-[75vh] flex flex-col"
              >
                <div className="px-5 py-3 bg-[#ebf5eb]/60 border-b border-[#a0c396]/30 flex items-center justify-between text-xs">
                  <div className="font-bold text-[#1e3a1e] flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-[#2d4a2d]" />
                    <span>Search Results: {totalResultsCount} found for "{searchQuery}"</span>
                  </div>
                  <button
                    onClick={() => setIsSearchOpen(false)}
                    className="text-xs text-slate-500 hover:text-slate-800 font-semibold cursor-pointer"
                  >
                    Close (Esc)
                  </button>
                </div>

                <div className="p-4 overflow-y-auto space-y-4 divide-y divide-slate-100">
                  {matchingProducts.length > 0 && (
                    <div className="space-y-2 pt-2">
                      <div className="flex items-center justify-between text-xs font-bold text-[#1e3a1e] uppercase">
                        <span>Products ({matchingProducts.length})</span>
                        <Link to="/stock" onClick={() => setIsSearchOpen(false)} className="text-[#0B4F9C] hover:underline">All Stock</Link>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        {matchingProducts.slice(0, 4).map(prod => (
                          <div key={prod.id} className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between text-xs">
                            <div>
                              <div className="font-bold text-slate-900">{prod.name}</div>
                              <div className="text-[10px] text-slate-400">{prod.qrCode} • ₹{prod.unitPrice} / {prod.unit}</div>
                            </div>
                            <span className="font-bold text-slate-700">{prod.currentQuantity} {prod.unit}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {matchingSales.length > 0 && (
                    <div className="space-y-2 pt-3">
                      <div className="text-xs font-bold text-emerald-800 uppercase">Sales ({matchingSales.length})</div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        {matchingSales.slice(0, 4).map(sale => (
                          <div key={sale.id} className="p-2.5 rounded-xl bg-emerald-50/40 border border-emerald-100 flex items-center justify-between text-xs">
                            <div>
                              <div className="font-bold text-slate-900">{sale.customerName} ({sale.receiptNumber})</div>
                              <div className="text-[10px] text-slate-400">{sale.paymentMode}</div>
                            </div>
                            <span className="font-bold text-emerald-700">₹{sale.totalAmount}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </motion.div>

      {/* ─── 2.1 PROMINENT DEDICATED ACTION HUB: STOCK ADD & SALE ─── */}
      <motion.div variants={itemVariants} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* BUTTON / CARD 1: STOCK ADD */}
        <div className="relative overflow-hidden bg-gradient-to-br from-emerald-600 via-emerald-700 to-teal-800 text-white p-5 sm:p-6 rounded-3xl shadow-md border-2 border-emerald-500/50 flex flex-col justify-between group hover:shadow-xl transition-all">
          <div className="absolute top-0 right-0 -mr-6 -mt-6 w-32 h-32 rounded-full bg-white/10 blur-xl pointer-events-none group-hover:scale-125 transition-transform" />
          <div className="relative z-10">
            <div className="flex items-center justify-between mb-2.5">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-white/20 backdrop-blur-md rounded-full text-[11px] font-black tracking-wider uppercase">
                <Boxes className="w-3.5 h-3.5" />
                <span>INVENTORY INWARD (आवक)</span>
              </span>
              <span className="text-emerald-200 text-xs font-semibold">Instant Stock Entry</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-black tracking-tight mb-1 text-white flex items-center gap-2">
              <span>STOCK ADD</span>
            </h2>
            <p className="text-emerald-100 text-xs sm:text-sm mb-4 leading-relaxed">
              Add fresh milk pouches, curd crates, paneer, butter, ghee or allied items directly to stock.
            </p>
          </div>
          <div className="relative z-10 flex flex-wrap items-center gap-2.5 pt-1">
            <button
              onClick={handleOpenStockModal}
              className="px-5 py-3 bg-white text-emerald-900 hover:bg-emerald-50 rounded-2xl text-xs sm:text-sm font-black shadow-md transition-all flex items-center gap-2 hover:scale-105 active:scale-95 cursor-pointer"
            >
              <Plus className="w-4 h-4 text-emerald-700 stroke-[3]" />
              <span>+ Add Stock Now</span>
            </button>
            <Link
              to="/stock"
              className="px-4 py-3 bg-emerald-800/80 hover:bg-emerald-800 text-white rounded-2xl text-xs font-bold transition-all flex items-center gap-1.5 hover:scale-102"
            >
              <span>View Stock Level</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>

        {/* BUTTON / CARD 2: SALE */}
        <div className="relative overflow-hidden bg-gradient-to-br from-[#1e3a1e] via-[#2d4a2d] to-[#122412] text-white p-5 sm:p-6 rounded-3xl shadow-md border-2 border-[#a0c396]/50 flex flex-col justify-between group hover:shadow-xl transition-all">
          <div className="absolute top-0 right-0 -mr-6 -mt-6 w-32 h-32 rounded-full bg-emerald-400/10 blur-xl pointer-events-none group-hover:scale-125 transition-transform" />
          <div className="relative z-10">
            <div className="flex items-center justify-between mb-2.5">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-white/15 backdrop-blur-md rounded-full text-[11px] font-black tracking-wider uppercase text-emerald-200">
                <ShoppingCart className="w-3.5 h-3.5" />
                <span>OUTWARD POS (बिक्री)</span>
              </span>
              <span className="text-emerald-300 text-xs font-semibold">Counter & Barcode Billing</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-black tracking-tight mb-1 text-white flex items-center gap-2">
              <span>NEW SALE</span>
            </h2>
            <p className="text-[#cbe4cb] text-xs sm:text-sm mb-4 leading-relaxed">
              Open POS counter, scan barcode/QR, print thermal receipts, and auto-deduct items from inventory.
            </p>
          </div>
          <div className="relative z-10 flex flex-wrap items-center gap-2.5 pt-1">
            <Link
              to="/sales?new=true"
              className="px-5 py-3 bg-emerald-400 hover:bg-emerald-300 text-[#122412] rounded-2xl text-xs sm:text-sm font-black shadow-md transition-all flex items-center gap-2 hover:scale-105 active:scale-95"
            >
              <ShoppingCart className="w-4 h-4 text-[#122412] stroke-[2.5]" />
              <span>🛒 Start Sale Bill</span>
            </Link>
            <Link
              to="/sales"
              className="px-4 py-3 bg-white/15 hover:bg-white/25 text-white rounded-2xl text-xs font-bold transition-all flex items-center gap-1.5 hover:scale-102"
            >
              <span>Sales History</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </motion.div>

      {/* 3. INTERACTIVE KPI TILES WITH ANIMATED COUNT-UP & MICRO SPARKLINES */}
      <motion.div 
        variants={itemVariants}
        className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 ${isAdmin ? 'xl:grid-cols-6' : 'xl:grid-cols-5'} gap-4`}
      >
        {/* Tile 1: Today's Sales */}
        <motion.div
          whileHover={{ y: -4, scale: 1.01 }}
          onClick={() => navigate('/sales')}
          className="bg-white p-5 rounded-3xl border border-[#a0c396]/30 shadow-soft cursor-pointer flex flex-col justify-between hover:shadow-md transition-shadow relative overflow-hidden group"
        >
          <div>
            <div className="flex items-center justify-between text-[#3f5a3f] mb-1">
              <span className="text-xs font-bold uppercase tracking-wider">Today's Sales</span>
              <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center group-hover:bg-emerald-100 transition-colors">
                <ShoppingCart className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-serif font-bold text-[#1e3a1e] tracking-tight">
              <AnimatedCounter value={todaySalesAmt} prefix="₹" />
            </div>
            <p className="text-[11px] text-[#3f5a3f] font-medium mt-0.5">
              {todaySalesCount} transactions today
            </p>
          </div>

          <div className="mt-3 pt-2 border-t border-slate-100">
            <Sparkline data={salesSparkline} color="#16a34a" height={26} />
          </div>
        </motion.div>

        {/* Tile 2: Today's Purchases */}
        <motion.div
          whileHover={{ y: -4, scale: 1.01 }}
          onClick={() => navigate('/purchases')}
          className="bg-white p-5 rounded-3xl border border-[#a0c396]/30 shadow-soft cursor-pointer flex flex-col justify-between hover:shadow-md transition-shadow relative overflow-hidden group"
        >
          <div>
            <div className="flex items-center justify-between text-[#3f5a3f] mb-1">
              <span className="text-xs font-bold uppercase tracking-wider">Today's Bulk Orders</span>
              <div className="w-8 h-8 rounded-xl bg-blue-50 text-[#0B4F9C] flex items-center justify-center group-hover:bg-blue-100 transition-colors">
                <Truck className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-serif font-bold text-[#0B4F9C] tracking-tight">
              <AnimatedCounter value={todayPurchasesAmt} prefix="₹" />
            </div>
            <p className="text-[11px] text-[#3f5a3f] font-medium mt-0.5">
              {todayPurchasesCount} bulk orders
            </p>
          </div>

          <div className="mt-3 pt-2 border-t border-slate-100">
            <Sparkline data={purchaseSparkline} color="#0B4F9C" height={26} />
          </div>
        </motion.div>

        {/* Tile 3: Stock Valuation (Admin) or Stock Units (Staff) */}
        <motion.div
          whileHover={{ y: -4, scale: 1.01 }}
          onClick={() => navigate('/stock')}
          className="bg-white p-5 rounded-3xl border border-[#a0c396]/30 shadow-soft cursor-pointer flex flex-col justify-between hover:shadow-md transition-shadow relative overflow-hidden group"
        >
          <div>
            <div className="flex items-center justify-between text-[#3f5a3f] mb-1">
              <span className="text-xs font-bold uppercase tracking-wider">
                {isAdmin ? 'Total Stock Value' : 'Stock on Hand'}
              </span>
              <div className="w-8 h-8 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center group-hover:bg-slate-200 transition-colors">
                <Boxes className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-serif font-bold text-[#1e3a1e] tracking-tight">
              {isAdmin ? (
                <AnimatedCounter value={totalStockValuation} prefix="₹" />
              ) : (
                <AnimatedCounter value={totalStockUnits} suffix=" Units" />
              )}
            </div>
            <p className="text-[11px] text-[#3f5a3f] font-medium mt-0.5">
              {totalStockUnits.toLocaleString()} units in inventory
            </p>
          </div>

          <div className="mt-3 pt-2 border-t border-slate-100">
            <Sparkline data={salesSparkline.slice(0, 6)} color="#2d4a2d" height={26} />
          </div>
        </motion.div>

        {/* Tile 4: Low Stock Alert */}
        <motion.div
          whileHover={{ y: -4, scale: 1.01 }}
          onClick={() => navigate('/stock?lowStock=true')}
          className="bg-white p-5 rounded-3xl border border-[#a0c396]/30 shadow-soft cursor-pointer flex flex-col justify-between hover:shadow-md transition-shadow relative overflow-hidden group"
        >
          <div>
            <div className="flex items-center justify-between text-[#3f5a3f] mb-1">
              <span className="text-xs font-bold uppercase tracking-wider">Low Stock</span>
              <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center group-hover:bg-amber-100 transition-colors">
                <AlertTriangle className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-serif font-bold text-amber-700 tracking-tight">
              <AnimatedCounter value={lowStockCount} suffix=" Items" />
            </div>
            <p className="text-[11px] text-amber-600 font-bold mt-0.5 flex items-center gap-1">
              <span>Below reorder trigger</span>
              <ArrowRight className="w-3 h-3" />
            </p>
          </div>

          <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between text-[10px] font-bold text-amber-800">
            <span>Restock Priority</span>
            <span className="px-2 py-0.5 bg-amber-100 rounded-md">Action</span>
          </div>
        </motion.div>

        {/* Tile 5: Expiring Soon Alert */}
        <motion.div
          whileHover={{ y: -4, scale: 1.01 }}
          onClick={() => navigate('/expiry?nearExpiryOnly=true')}
          className="bg-white p-5 rounded-3xl border border-[#a0c396]/30 shadow-soft cursor-pointer flex flex-col justify-between hover:shadow-md transition-shadow relative overflow-hidden group"
        >
          <div>
            <div className="flex items-center justify-between text-[#3f5a3f] mb-1">
              <span className="text-xs font-bold uppercase tracking-wider">Expiring Soon</span>
              <div className="w-8 h-8 rounded-xl bg-rose-50 text-rose-700 flex items-center justify-center group-hover:bg-rose-100 transition-colors">
                <Clock className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-serif font-bold text-rose-700 tracking-tight">
              <AnimatedCounter value={nearExpiryCount} suffix=" Batches" />
            </div>
            <p className="text-[11px] text-rose-600 font-bold mt-0.5 flex items-center gap-1">
              <span>Shelf life &lt; 3 days</span>
              <ArrowRight className="w-3 h-3" />
            </p>
          </div>

          <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between text-[10px] font-bold text-rose-800">
            <span>FIFO Clearance</span>
            <span className="px-2 py-0.5 bg-rose-100 rounded-md">Urgent</span>
          </div>
        </motion.div>

        {/* Tile 6: Net Profit (Admin ONLY) */}
        {isAdmin && (
          <motion.div
            whileHover={{ y: -4, scale: 1.01 }}
            onClick={() => navigate('/reports')}
            className="bg-white p-5 rounded-3xl border border-[#a0c396]/30 shadow-soft cursor-pointer flex flex-col justify-between hover:shadow-md transition-shadow relative overflow-hidden group"
          >
            <div>
              <div className="flex items-center justify-between text-[#3f5a3f] mb-1">
                <span className="text-xs font-bold uppercase tracking-wider">Net Profit</span>
                <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-800 flex items-center justify-center group-hover:bg-emerald-100 transition-colors">
                  <TrendingUp className="w-4 h-4" />
                </div>
              </div>
              <div className={`text-2xl font-serif font-bold tracking-tight ${periodNetProfit >= 0 ? 'text-emerald-800' : 'text-rose-700'}`}>
                <AnimatedCounter value={periodNetProfit} prefix="₹" />
              </div>

              {/* % Change vs previous period badge */}
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md flex items-center gap-0.5 ${
                  isProfitUp ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                }`}>
                  {isProfitUp ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                  <span>{Math.abs(netProfitChangePct)}%</span>
                </span>
                <span className="text-[10px] text-[#3f5a3f]">vs prev</span>
              </div>
            </div>

            <div className="mt-3 pt-2 border-t border-slate-100">
              <Sparkline data={profitSparkline} color={periodNetProfit >= 0 ? '#16a34a' : '#e11d48'} height={26} />
            </div>
          </motion.div>
        )}
      </motion.div>

      {/* 4. ANIMATED CHARTS ROW 1: Sales & Purchases Trend + Category Donut */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Sales & Purchases Inflow Combo Area Chart (2 Cols) */}
        <motion.div 
          variants={itemVariants}
          className="lg:col-span-2 bg-white p-5 sm:p-6 rounded-3xl border border-[#a0c396]/30 shadow-soft flex flex-col justify-between"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
            <div>
              <h3 className="font-serif text-base font-bold text-[#1e3a1e] flex items-center gap-2">
                <span>Sales Revenue vs. Procurement Inflow</span>
                <BarChart3 className="w-4 h-4 text-[#3d6b3d]" />
              </h3>
              <p className="text-xs text-[#3f5a3f]">Comparing customer turnover against raw procurement over time</p>
            </div>

            <div className="flex items-center gap-3 text-xs">
              <span className="flex items-center gap-1.5 font-bold text-[#1e3a1e]">
                <span className="w-2.5 h-2.5 rounded-full bg-[#1e3a1e]" /> Sales (₹)
              </span>
              <span className="flex items-center gap-1.5 font-bold text-[#0B4F9C]">
                <span className="w-2.5 h-2.5 rounded-full bg-[#0B4F9C]" /> Purchases (₹)
              </span>
            </div>
          </div>

          <div className="h-64 w-full">
            {timeSeriesData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={timeSeriesData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="chartSales" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#1e3a1e" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#1e3a1e" stopOpacity={0.0} />
                    </linearGradient>
                    <linearGradient id="chartPurchases" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#0B4F9C" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#0B4F9C" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis 
                    dataKey="date" 
                    tickFormatter={(str) => String(str || '').slice(5)} 
                    tick={{ fill: '#94a3b8', fontSize: 10 }} 
                  />
                  <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#ffffff', borderColor: '#a0c396', borderRadius: '16px', fontSize: '11px' }} 
                    formatter={(val) => `₹${Number(val).toLocaleString()}`}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="sales" 
                    stroke="#1e3a1e" 
                    strokeWidth={2.5} 
                    fillOpacity={1} 
                    fill="url(#chartSales)" 
                    name="Sales (₹)" 
                    isAnimationActive={true}
                    animationDuration={1000}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="purchases" 
                    stroke="#0B4F9C" 
                    strokeWidth={2} 
                    fillOpacity={1} 
                    fill="url(#chartPurchases)" 
                    name="Purchases (₹)" 
                    isAnimationActive={true}
                    animationDuration={1000}
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-xs text-slate-400">
                No transaction trend recorded yet for this range.
              </div>
            )}
          </div>
        </motion.div>

        {/* Category-wise Stock Distribution Donut (1 Col) */}
        <motion.div 
          variants={itemVariants}
          className="bg-white p-5 sm:p-6 rounded-3xl border border-[#a0c396]/30 shadow-soft flex flex-col justify-between"
        >
          <div>
            <h3 className="font-serif text-base font-bold text-[#1e3a1e] flex items-center gap-2 mb-1">
              <span>Category Distribution</span>
              <PieChartIcon className="w-4 h-4 text-[#3d6b3d]" />
            </h3>
            <p className="text-xs text-[#3f5a3f] mb-3">Portfolio balance across dairy categories</p>
          </div>

          <div className="h-56 w-full flex items-center justify-center">
            {analytics?.categoryBreakdown && analytics.categoryBreakdown.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={analytics.categoryBreakdown}
                    dataKey="amount"
                    nameKey="category"
                    cx="50%"
                    cy="50%"
                    innerRadius={46}
                    outerRadius={76}
                    paddingAngle={3}
                    isAnimationActive={true}
                    animationDuration={1000}
                  >
                    {analytics.categoryBreakdown.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={DONUT_COLORS[index % DONUT_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#ffffff', borderRadius: '14px', fontSize: '11px', borderColor: '#a0c396' }} 
                    formatter={(val) => `₹${Number(val).toLocaleString()}`}
                  />
                  <Legend 
                    formatter={(val) => <span className="text-[10px] capitalize text-slate-700 font-bold">{val}</span>} 
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="text-xs text-slate-400">No category records found.</div>
            )}
          </div>

          <div className="pt-2 text-center border-t border-slate-100">
            <Link to="/stock" className="text-xs font-bold text-[#1e3a1e] hover:underline flex items-center justify-center gap-1">
              <span>Inspect Full Inventory</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </motion.div>
      </div>

      {/* 5. ANIMATED CHARTS ROW 2: Stock Health Gauge + Top Selling Products Horizontal Bar Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Stock Health Gauge Radial Chart (1 Col) */}
        <motion.div 
          variants={itemVariants}
          className="bg-white p-5 sm:p-6 rounded-3xl border border-[#a0c396]/30 shadow-soft flex flex-col justify-between"
        >
          <div>
            <h3 className="font-serif text-base font-bold text-[#1e3a1e] mb-1">
              Stock Health Status
            </h3>
            <p className="text-xs text-[#3f5a3f]">Catalog balance: healthy vs low vs depleted</p>
          </div>

          <div className="py-3 space-y-3">
            {stockHealthData.map((item, idx) => (
              <div key={idx} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-800 flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                    <span>{item.name}</span>
                  </span>
                  <span className="font-mono font-bold text-slate-700">
                    {item.count} items ({item.percentage}%)
                  </span>
                </div>
                <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${item.percentage}%` }}
                    transition={{ duration: 0.8, delay: idx * 0.15 }}
                    className="h-full rounded-full"
                    style={{ backgroundColor: item.color }}
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="pt-2 flex items-center justify-between text-xs text-[#3f5a3f] border-t border-slate-100">
            <span>Total Catalog: {products.length} Products</span>
            <Link to="/stock?lowStock=true" className="font-bold text-amber-800 hover:underline">
              Resolve Low Stock
            </Link>
          </div>
        </motion.div>

        {/* Top Selling Products: Horizontal Bar Chart (2 Cols) */}
        <motion.div 
          variants={itemVariants}
          className="lg:col-span-2 bg-white p-5 sm:p-6 rounded-3xl border border-[#a0c396]/30 shadow-soft flex flex-col justify-between"
        >
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-serif text-base font-bold text-[#1e3a1e]">
                🏆 Top Selling Products (Turnover Volume)
              </h3>
              <p className="text-xs text-[#3f5a3f]">Highest grossing products ranked by sales turnover</p>
            </div>
            <span className="text-[11px] font-bold px-2.5 py-1 bg-[#ebf5eb] text-[#1e3a1e] rounded-full border border-[#a0c396]/40">
              Rankings
            </span>
          </div>

          <div className="h-60 w-full">
            {topSellingProducts.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart 
                  layout="vertical" 
                  data={topSellingProducts}
                  margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                  <XAxis type="number" tick={{ fill: '#94a3b8', fontSize: 10 }} />
                  <YAxis 
                    dataKey="name" 
                    type="category" 
                    tick={{ fill: '#1e3a1e', fontSize: 10, fontWeight: 600 }} 
                    width={130}
                    tickFormatter={(name) => String(name || '').slice(0, 18)}
                  />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#ffffff', borderRadius: '14px', fontSize: '11px', borderColor: '#a0c396' }} 
                    formatter={(val) => `₹${Number(val).toLocaleString()}`}
                  />
                  <Bar 
                    dataKey="totalAmount" 
                    fill="#1e3a1e" 
                    radius={[0, 8, 8, 0]} 
                    name="Revenue (₹)" 
                    isAnimationActive={true}
                    animationDuration={1000}
                  />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-xs text-slate-400">
                No product turnover recorded for this period yet.
              </div>
            )}
          </div>
        </motion.div>
      </div>

      {/* 6. ADMIN-ONLY SECTION: Profit Margin Trend & Supplier Performance */}
      {isAdmin && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Profit Margin Trend Line */}
          <motion.div 
            variants={itemVariants}
            className="bg-white p-5 sm:p-6 rounded-3xl border border-[#a0c396]/30 shadow-soft"
          >
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-serif text-base font-bold text-[#1e3a1e]">
                  Profit Margin Trend Line (%)
                </h3>
                <p className="text-xs text-[#3f5a3f]">Daily net margin efficiency over selected time range</p>
              </div>
              <span className="text-[11px] font-bold px-2.5 py-1 bg-emerald-50 text-emerald-800 rounded-full border border-emerald-200">
                Admin Audit
              </span>
            </div>

            <div className="h-56 w-full">
              {timeSeriesData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={timeSeriesData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="date" tickFormatter={(str) => String(str || '').slice(5)} tick={{ fill: '#94a3b8', fontSize: 10 }} />
                    <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} unit="%" />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#ffffff', borderRadius: '14px', fontSize: '11px', borderColor: '#a0c396' }}
                      formatter={(val) => `${Number(val)}%`}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="marginPct" 
                      stroke="#16a34a" 
                      strokeWidth={2.5} 
                      dot={{ r: 3, fill: '#16a34a' }} 
                      name="Margin %" 
                      isAnimationActive={true}
                      animationDuration={900}
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-xs text-slate-400">
                  No margin data recorded for this range.
                </div>
              )}
            </div>
          </motion.div>

          {/* Supplier Performance Bar Chart */}
          <motion.div 
            variants={itemVariants}
            className="bg-white p-5 sm:p-6 rounded-3xl border border-[#a0c396]/30 shadow-soft"
          >
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-serif text-base font-bold text-[#1e3a1e] flex items-center gap-1.5">
                  <Building2 className="w-4 h-4 text-[#0B4F9C]" />
                  <span>Supplier Procurement Volume</span>
                </h3>
                <p className="text-xs text-[#3f5a3f]">Inward spend distribution across dairy federations</p>
              </div>
              <span className="text-[11px] font-bold px-2.5 py-1 bg-blue-50 text-[#0B4F9C] rounded-full border border-blue-200">
                Procurement
              </span>
            </div>

            <div className="h-56 w-full">
              {analytics?.supplierPerformance && analytics.supplierPerformance.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={analytics.supplierPerformance.slice(0, 5)} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="supplierName" tick={{ fill: '#94a3b8', fontSize: 10 }} tickFormatter={(s) => String(s || '').slice(0, 14)} />
                    <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#ffffff', borderRadius: '14px', fontSize: '11px', borderColor: '#a0c396' }}
                      formatter={(val) => `₹${Number(val).toLocaleString()}`}
                    />
                    <Bar 
                      dataKey="totalAmount" 
                      fill="#0B4F9C" 
                      radius={[6, 6, 0, 0]} 
                      name="Purchases (₹)" 
                      isAnimationActive={true}
                      animationDuration={900}
                    />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-xs text-slate-400">
                  No supplier procurement transactions found.
                </div>
              )}
            </div>
          </motion.div>
        </div>
      )}

      {/* 7. LIVE PRODUCT INVENTORY TABLE WITH QUICK SELL */}
      <motion.div 
        variants={itemVariants}
        className="bg-white rounded-3xl border border-[#a0c396]/30 shadow-soft p-5 sm:p-6 space-y-4"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#a0c396]/20">
          <div>
            <div className="flex items-center gap-2">
              <PackageCheck className="w-5 h-5 text-[#1e3a1e]" />
              <h3 className="font-serif text-base font-bold text-[#1e3a1e]">
                Live Product Inventory & Stock Balances
              </h3>
            </div>
            <p className="text-xs text-[#3f5a3f] mt-0.5">
              Live on-hand balance for each Mother Dairy SKU. Decrements atomically upon sales.
            </p>
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none">
            {['All', 'milk', 'curd', 'paneer', 'ghee', 'butter'].map((cat) => (
              <button
                key={cat}
                onClick={() => setStockCategoryFilter(cat)}
                className={`px-3 py-1 rounded-xl text-xs font-bold transition-all capitalize cursor-pointer shrink-0 ${
                  stockCategoryFilter === cat
                    ? 'bg-[#1e3a1e] text-white shadow-2xs'
                    : 'bg-[#f4f8f2] hover:bg-[#ebf5eb] text-[#3f5a3f]'
                }`}
              >
                {cat === 'All' ? 'All Dairy' : cat}
              </button>
            ))}
          </div>
        </div>

        {displayedDashboardProducts.length === 0 ? (
          <div className="py-10 px-4 text-center rounded-2xl bg-[#f4f8f2] border border-dashed border-[#a0c396]/40 space-y-2">
            <PackageCheck className="w-8 h-8 text-[#2d4a2d] mx-auto" />
            <h4 className="font-bold text-sm text-[#1e3a1e]">No Products In This Category</h4>
            <p className="text-xs text-[#3f5a3f]">Select another category or create new items in Catalog.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3.5 pt-1">
            {displayedDashboardProducts.map((prod) => {
              const stock = Number(prod.currentQuantity || 0);
              const threshold = Number(prod.reorderThreshold || 20);
              const isLow = stock <= threshold;
              const isOut = stock <= 0;
              const healthPercent = Math.min(100, Math.round((stock / (threshold * 3)) * 100));

              return (
                <div
                  key={prod.id}
                  className={`p-4 rounded-2xl border transition-all duration-200 flex flex-col justify-between ${
                    isOut
                      ? 'bg-rose-50/50 border-rose-200'
                      : isLow
                      ? 'bg-amber-50/40 border-amber-200'
                      : 'bg-white hover:bg-[#f4f8f2]/60 border-slate-200/90'
                  }`}
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-[#ebf5eb] text-[#2d4a2d]">
                        {prod.category}
                      </span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        isOut
                          ? 'bg-rose-100 text-rose-800'
                          : isLow
                          ? 'bg-amber-100 text-amber-900'
                          : 'bg-emerald-100 text-emerald-800'
                      }`}>
                        {isOut ? 'Out of Stock' : isLow ? 'Low Stock' : 'In Stock'}
                      </span>
                    </div>

                    <h4 className="font-bold text-xs sm:text-sm text-[#1e3a1e] mt-2 line-clamp-1" title={prod.name}>
                      {prod.name}
                    </h4>
                    <div className="text-[10px] font-mono text-slate-400 mt-0.5">
                      {prod.qrCode}
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-100 space-y-2">
                    <div className="flex items-baseline justify-between">
                      <div>
                        <div className="text-[10px] text-slate-400 font-bold uppercase">Stock</div>
                        <div className={`text-base font-bold font-mono ${
                          isOut ? 'text-rose-600' : isLow ? 'text-amber-700' : 'text-[#1e3a1e]'
                        }`}>
                          {stock} <span className="text-xs font-normal text-slate-500">{prod.unit}</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-[10px] text-slate-400 font-bold uppercase">Price</div>
                        <div className="text-sm font-bold text-slate-800 font-mono">₹{prod.unitPrice}</div>
                      </div>
                    </div>

                    <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                      <div 
                        className={`h-full rounded-full transition-all duration-500 ${
                          isOut ? 'bg-rose-500' : isLow ? 'bg-amber-500' : 'bg-emerald-500'
                        }`}
                        style={{ width: `${Math.max(5, healthPercent)}%` }}
                      />
                    </div>

                    <div className="pt-1 flex items-center gap-2">
                      <button
                        onClick={() => navigate(`/sales?product=${prod.id}`)}
                        disabled={isOut}
                        className={`w-full py-1.5 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs ${
                          isOut
                            ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                            : 'bg-[#1e3a1e] hover:bg-[#2d4a2d] text-white hover:scale-[1.02] active:scale-[0.98]'
                        }`}
                      >
                        <Zap className="w-3.5 h-3.5" />
                        <span>Sell This Product</span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </motion.div>

      {/* 8. RECENT ACTIVITY FEED (Counter Receipts & Inward Purchases) */}
      <motion.div 
        variants={itemVariants}
        className="grid grid-cols-1 lg:grid-cols-2 gap-6"
      >
        {/* Latest Sales Outward */}
        <div className="bg-white p-5 sm:p-6 rounded-3xl border border-[#a0c396]/30 shadow-soft space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <ShoppingCart className="w-4 h-4 text-emerald-600" />
              <h3 className="font-serif text-sm font-bold text-[#1e3a1e]">Recent Sales & Counter Receipts</h3>
            </div>
            <Link to="/sales" className="text-xs font-bold text-emerald-700 hover:underline flex items-center gap-0.5">
              <span>View All Sales</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="divide-y divide-slate-100">
            {recentSalesFeed && recentSalesFeed.length > 0 ? (
              recentSalesFeed.slice(0, 5).map((sale, idx) => (
                <div key={sale.id || idx} className="py-3 flex items-center justify-between gap-3 hover:bg-slate-50/60 rounded-xl px-2 transition-colors">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200">
                        {sale.receiptNumber || `REC-${String(sale.id).padStart(4, '0')}`}
                      </span>
                      <span className="text-xs font-bold text-slate-800 truncate">
                        {sale.customerName || 'Walk-in Customer'}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-400 mt-1 flex items-center gap-2">
                      <span>{sale.items?.length ? `${sale.items.length} item(s)` : `${sale.quantity || 1} units`}</span>
                      <span>•</span>
                      <span>{sale.date ? new Date(sale.date).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Recent'}</span>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-mono font-bold text-emerald-700 text-sm">
                      ₹{Number(sale.totalAmount || 0).toLocaleString()}
                    </div>
                    <span className="text-[10px] text-slate-400 uppercase font-semibold">
                      {sale.paymentMode || 'Cash'}
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <div className="py-8 text-center text-xs text-slate-400">
                No recent sales recorded yet.
              </div>
            )}
          </div>
        </div>

        {/* Latest Purchases Inward */}
        <div className="bg-white p-5 sm:p-6 rounded-3xl border border-[#a0c396]/30 shadow-soft space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <Truck className="w-4 h-4 text-[#0B4F9C]" />
              <h3 className="font-serif text-sm font-bold text-[#1e3a1e]">Recent Bulk Orders</h3>
            </div>
            <Link to="/purchases" className="text-xs font-bold text-[#0B4F9C] hover:underline flex items-center gap-0.5">
              <span>View All Bulk Orders</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="divide-y divide-slate-100">
            {recentPurchasesFeed && recentPurchasesFeed.length > 0 ? (
              recentPurchasesFeed.slice(0, 5).map((pur, idx) => (
                <div key={pur.id || idx} className="py-3 flex items-center justify-between gap-3 hover:bg-slate-50/60 rounded-xl px-2 transition-colors">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded bg-blue-50 text-blue-800 border border-blue-200">
                        {pur.invoiceNumber || `INV-${String(pur.id).padStart(4, '0')}`}
                      </span>
                      <span className="text-xs font-bold text-slate-800 truncate">
                        {pur.supplierName || 'Cooperative Dairy Plant'}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-400 mt-1 flex items-center gap-2">
                      <span>{pur.items?.length ? `${pur.items.length} item(s)` : `${pur.quantity || 1} units`}</span>
                      <span>•</span>
                      <span>{pur.date ? new Date(pur.date).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Recent'}</span>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-mono font-bold text-[#0B4F9C] text-sm">
                      ₹{Number(pur.totalAmount || 0).toLocaleString()}
                    </div>
                    <span className="text-[10px] text-slate-400 font-semibold">
                      Bulk Order
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <div className="py-8 text-center text-xs text-slate-400">
                No recent purchases recorded yet.
              </div>
            )}
          </div>
        </div>
      </motion.div>

      {/* ─── QUICK STOCK INWARD MODAL ─── */}
      <Modal
        isOpen={isStockModalOpen}
        onClose={() => setIsStockModalOpen(false)}
        title="Add Stock to Inventory (Stock Inward / आवक)"
        size="lg"
      >
        <form onSubmit={handleSubmitStock} className="space-y-4">
          <p className="text-xs text-slate-500">
            Quickly add fresh dairy stock directly to current inventory with automatic batch creation.
          </p>

          {/* Product Selection / Input */}
          <div>
            <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block mb-1">
              Select Existing Product OR Type New Name *
            </label>
            {products && products.length > 0 && (
              <select
                value={stockForm.productId}
                onChange={(e) => handleProductSelect(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600 mb-2 cursor-pointer"
              >
                <option value="">-- Choose from existing products ({products.length}) --</option>
                {products.map((p) => (
                  <option key={p.id || p._id} value={p.id || p._id}>
                    {p.name} ({p.unit}) - Curr: {p.currentQuantity || 0}
                  </option>
                ))}
              </select>
            )}

            <input
              type="text"
              required
              value={stockForm.productName}
              onChange={(e) => setStockForm({ ...stockForm, productName: e.target.value })}
              placeholder="e.g. Mother Dairy Toned Milk 500ml"
              className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600"
            />
          </div>

          {/* Category & Unit */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block mb-1">
                Category *
              </label>
              <select
                value={stockForm.category}
                onChange={(e) => setStockForm({ ...stockForm, category: e.target.value })}
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600 cursor-pointer"
              >
                {PRODUCT_CATEGORIES.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.icon} {c.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block mb-1">
                Unit *
              </label>
              <select
                value={stockForm.unit}
                onChange={(e) => setStockForm({ ...stockForm, unit: e.target.value })}
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600 cursor-pointer"
              >
                <option value="litre">Litre (L)</option>
                <option value="pack">Pack / Pouch</option>
                <option value="kg">Kilogram (kg)</option>
                <option value="gram">Gram (g)</option>
                <option value="piece">Piece</option>
                <option value="bottle">Bottle</option>
                <option value="cup">Cup</option>
                <option value="tin">Tin</option>
              </select>
            </div>
          </div>

          {/* Quantity & Expiry Date Highlighted */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 bg-emerald-50/70 border border-emerald-200 rounded-2xl">
            <div>
              <label className="text-[11px] font-black text-emerald-950 uppercase tracking-wider block mb-1 flex items-center justify-between">
                <span>Quantity to Add *</span>
                <span className="text-[10px] text-emerald-700 font-semibold">Stock Inward</span>
              </label>
              <div className="relative">
                <input
                  type="number"
                  min="1"
                  step="1"
                  required
                  value={stockForm.quantity}
                  onChange={(e) => setStockForm({ ...stockForm, quantity: e.target.value })}
                  placeholder="Enter quantity..."
                  className="w-full px-3.5 py-2.5 bg-white border-2 border-emerald-600 rounded-xl text-base font-black text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-700"
                />
                <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-emerald-800">
                  {stockForm.unit}
                </span>
              </div>
            </div>

            <div>
              <label className="text-[11px] font-black text-emerald-950 uppercase tracking-wider block mb-1 flex items-center justify-between">
                <span>Expiry Date *</span>
                <span className="text-[10px] text-emerald-700 font-semibold">Batch Expiry</span>
              </label>
              <div className="relative">
                <Calendar className="w-4 h-4 text-emerald-600 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="date"
                  required
                  value={stockForm.expiryDate}
                  onChange={(e) => setStockForm({ ...stockForm, expiryDate: e.target.value })}
                  className="w-full pl-9 pr-3.5 py-2.5 bg-white border-2 border-emerald-600 rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-700"
                />
              </div>
            </div>
          </div>

          {/* Pricing & Batch */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block mb-1">
                Batch Number
              </label>
              <input
                type="text"
                value={stockForm.batchNumber}
                onChange={(e) => setStockForm({ ...stockForm, batchNumber: e.target.value })}
                placeholder="e.g. BCH-MIL-10293"
                className="w-full px-3.5 py-2 bg-white border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600"
              />
            </div>

            <div>
              <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block mb-1">
                Cost Price (₹)
              </label>
              <input
                type="number"
                min="0"
                step="0.5"
                value={stockForm.costPrice}
                onChange={(e) => setStockForm({ ...stockForm, costPrice: e.target.value })}
                placeholder="Purchase cost"
                className="w-full px-3.5 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600"
              />
            </div>

            <div>
              <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block mb-1">
                Selling Price (₹)
              </label>
              <input
                type="number"
                min="0"
                step="0.5"
                value={stockForm.unitPrice}
                onChange={(e) => setStockForm({ ...stockForm, unitPrice: e.target.value })}
                placeholder="Retail sale price"
                className="w-full px-3.5 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600"
              />
            </div>
          </div>

          {/* Supplier & Notes */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block mb-1">
                Supplier / Source
              </label>
              <div className="relative">
                <Truck className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={stockForm.supplierName}
                  onChange={(e) => setStockForm({ ...stockForm, supplierName: e.target.value })}
                  placeholder="Mother Dairy Plant Delivery"
                  className="w-full pl-8 pr-3.5 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600"
                />
              </div>
            </div>

            <div>
              <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block mb-1">
                Invoice / Challan No.
              </label>
              <div className="relative">
                <FileText className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={stockForm.invoiceNumber}
                  onChange={(e) => setStockForm({ ...stockForm, invoiceNumber: e.target.value })}
                  placeholder="INV-2026-001"
                  className="w-full pl-8 pr-3.5 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600"
                />
              </div>
            </div>
          </div>

          {/* Modal Action Buttons */}
          <div className="flex gap-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setIsStockModalOpen(false)}
              className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submittingInward || !stockForm.quantity}
              className="flex-2 py-2.5 bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white rounded-xl text-xs font-black shadow-md shadow-emerald-700/20 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
            >
              {submittingInward ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Adding Stock...</span>
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4 stroke-[3]" />
                  <span>Confirm & Add Stock (+{stockForm.quantity || 0} {stockForm.unit})</span>
                </>
              )}
            </button>
          </div>
        </form>
      </Modal>
    </motion.div>
  );
};

export default Dashboard;
