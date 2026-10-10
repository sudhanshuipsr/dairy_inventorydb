import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { 
  getPurchasesApi, 
  createPurchaseApi, 
  updatePurchaseApi,
  deletePurchaseApi, 
  getProductsApi,
  getSuppliersApi,
  getProductByCodeApi
} from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import Modal from '../components/common/Modal';
import Badge from '../components/common/Badge';
import { 
  ShoppingBag, 
  Plus, 
  Search, 
  Trash2, 
  Calendar, 
  Building2, 
  DollarSign, 
  FileText, 
  RefreshCw, 
  CheckCircle2,
  Package,
  Layers,
  ChevronDown,
  ChevronUp,
  X,
  Truck,
  TrendingDown,
  Edit3
} from 'lucide-react';

export default function Purchases() {
  const [searchParams] = useSearchParams();
  const { isAdmin } = useAuth();
  const { addToast } = useToast();

  const [purchases, setPurchases] = useState([]);
  const [products, setProducts] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [supplierFilter, setSupplierFilter] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Expandable row state
  const [expandedRowId, setExpandedRowId] = useState(null);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Multi-line purchase form state
  const [formData, setFormData] = useState({
    supplierId: '',
    supplierName: '',
    invoiceNumber: '',
    date: new Date().toISOString().split('T')[0],
    notes: '',
    items: [
      {
        tempId: Date.now(),
        productId: '',
        productName: '',
        category: '',
        unit: 'pack',
        costPrice: 30,
        quantity: 10,
        subtotal: 300,
        expiryDate: '',
        batchNumber: ''
      }
    ]
  });

  // Admin Edit Purchase Modal State (Staff Entry Correction)
  const [editingPurchase, setEditingPurchase] = useState(null);
  const [editPurchaseForm, setEditPurchaseForm] = useState({
    supplierName: '',
    supplierId: '',
    invoiceNumber: '',
    date: '',
    notes: '',
    correctionReason: '',
    items: []
  });
  const [savingPurchaseEdit, setSavingPurchaseEdit] = useState(false);

  const handleOpenEditPurchaseModal = (purchase) => {
    const rawItems = Array.isArray(purchase.items) && purchase.items.length > 0
      ? purchase.items.map(it => ({
          productId: it.productId || it.product?._id || it.product?.id,
          quantity: Number(it.quantity || 1),
          costPrice: Number(it.costPrice || 0)
        }))
      : [
          {
            productId: purchase.productId || purchase.product?._id || purchase.product?.id,
            quantity: Number(purchase.quantity || 1),
            costPrice: Number(purchase.costPrice || 0)
          }
        ];

    setEditingPurchase(purchase);
    setEditPurchaseForm({
      supplierName: purchase.supplierName || 'Mother Dairy Cooperative',
      supplierId: purchase.supplierId || '',
      invoiceNumber: purchase.invoiceNumber || '',
      date: purchase.date ? new Date(purchase.date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
      notes: purchase.notes || '',
      correctionReason: '',
      items: rawItems
    });
  };

  const handleEditPurchaseItemChange = (index, field, value) => {
    setEditPurchaseForm(prev => {
      const updated = [...prev.items];
      const item = { ...updated[index] };
      if (field === 'productId') {
        const prod = products.find(p => String(p.id || p._id) === String(value));
        item.productId = value;
        if (prod && !item.costPrice) {
          item.costPrice = Number(prod.costPrice || 0);
        }
      } else if (field === 'quantity') {
        item.quantity = Math.max(0.1, Number(value));
      } else if (field === 'costPrice') {
        item.costPrice = Math.max(0, Number(value));
      } else {
        item[field] = value;
      }
      updated[index] = item;
      return { ...prev, items: updated };
    });
  };

  const handleAddEditPurchaseItem = () => {
    const defaultP = products.length > 0 ? (products[0].id || products[0]._id) : '';
    const defaultCost = products.length > 0 ? Number(products[0].costPrice || 0) : 0;
    setEditPurchaseForm(prev => ({
      ...prev,
      items: [...prev.items, { productId: defaultP, quantity: 1, costPrice: defaultCost }]
    }));
  };

  const handleRemoveEditPurchaseItem = (index) => {
    if (editPurchaseForm.items.length <= 1) {
      addToast('A purchase must have at least one line item', 'warning');
      return;
    }
    setEditPurchaseForm(prev => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== index)
    }));
  };

  const handleSaveEditPurchase = async (e) => {
    e.preventDefault();
    if (!editingPurchase) return;

    try {
      setSavingPurchaseEdit(true);
      const res = await updatePurchaseApi(editingPurchase.id || editingPurchase._id, editPurchaseForm);
      if (res.data?.success) {
        addToast(res.data.message || 'Purchase order corrected and stock reconciled!', 'success');
        setEditingPurchase(null);
        fetchPurchases();
        fetchProducts();
      }
    } catch (err) {
      addToast(err.response?.data?.message || 'Failed to update purchase', 'error');
    } finally {
      setSavingPurchaseEdit(false);
    }
  };

  useEffect(() => {
    fetchProducts();
    fetchSuppliers();
  }, []);

  useEffect(() => {
    fetchPurchases();
  }, [startDate, endDate, supplierFilter]);

  const fetchProducts = async () => {
    try {
      const res = await getProductsApi({ activeOnly: true });
      if (res.data?.success && Array.isArray(res.data.products)) {
        setProducts(res.data.products);
      }
    } catch (e) {
      console.warn('Failed to load products:', e.message);
    }
  };

  const fetchSuppliers = async () => {
    try {
      const res = await getSuppliersApi();
      if (res.data?.success && Array.isArray(res.data.suppliers)) {
        setSuppliers(res.data.suppliers);
      }
    } catch (e) {
      console.warn('Failed to load suppliers:', e.message);
    }
  };

  const fetchPurchases = async () => {
    try {
      setLoading(true);
      const params = {};
      if (startDate) params.startDate = startDate;
      if (endDate) params.endDate = endDate;
      if (supplierFilter !== 'All') params.supplierId = supplierFilter;

      const res = await getPurchasesApi(params);
      if (res.data?.success && Array.isArray(res.data.purchases)) {
        setPurchases(res.data.purchases);
      } else {
        setPurchases([]);
      }
    } catch (e) {
      console.warn('Failed to load purchases:', e.message);
      setPurchases([]);
    } finally {
      setLoading(false);
    }
  };

  // Open New Purchase Form
  const handleOpenCreateModal = () => {
    const defaultInvoice = `INV-${Date.now().toString().slice(-6)}`;
    const defaultProduct = products.length > 0 ? products[0] : null;

    setFormData({
      supplierId: suppliers.length > 0 ? suppliers[0].id : '',
      supplierName: suppliers.length > 0 ? suppliers[0].name : '',
      invoiceNumber: defaultInvoice,
      date: new Date().toISOString().split('T')[0],
      notes: '',
      items: [
        {
          tempId: Date.now(),
          productId: defaultProduct ? defaultProduct.id : '',
          productName: defaultProduct ? defaultProduct.name : '',
          category: defaultProduct ? defaultProduct.category : 'milk',
          unit: defaultProduct ? defaultProduct.unit : 'pack',
          costPrice: defaultProduct ? (Number(defaultProduct.costPrice) || Math.round(Number(defaultProduct.unitPrice || 40) * 0.8)) : 30,
          quantity: 20,
          subtotal: defaultProduct ? (Number(defaultProduct.costPrice || 30) * 20) : 600,
          expiryDate: '',
          batchNumber: ''
        }
      ]
    });
    setIsModalOpen(true);
  };

  // Handle Supplier Select
  const handleSupplierChange = (e) => {
    const sId = e.target.value;
    if (sId === 'other') {
      setFormData({ ...formData, supplierId: '', supplierName: '' });
    } else {
      const sup = suppliers.find(s => String(s.id) === String(sId));
      setFormData({
        ...formData,
        supplierId: sId,
        supplierName: sup ? sup.name : ''
      });
    }
  };

  // Add another product line
  const handleAddLineItem = () => {
    const defaultProd = products.length > 0 ? products[0] : null;
    const cost = defaultProd ? (Number(defaultProd.costPrice) || 30) : 30;
    const qty = 10;
    setFormData((prev) => ({
      ...prev,
      items: [
        ...prev.items,
        {
          tempId: Date.now() + Math.random(),
          productId: defaultProd ? defaultProd.id : '',
          productName: defaultProd ? defaultProd.name : '',
          category: defaultProd ? defaultProd.category : 'milk',
          unit: defaultProd ? defaultProd.unit : 'pack',
          costPrice: cost,
          quantity: qty,
          subtotal: Number((cost * qty).toFixed(2)),
          expiryDate: '',
          batchNumber: ''
        }
      ]
    }));
  };

  // Remove line item
  const handleRemoveLineItem = (index) => {
    if (formData.items.length <= 1) {
      addToast('A bulk order must have at least one item', 'warning');
      return;
    }
    setFormData((prev) => ({
      ...prev,
      items: prev.items.filter((_, idx) => idx !== index)
    }));
  };

  // Update line item property
  const handleLineItemChange = (index, field, value) => {
    setFormData((prev) => {
      const updated = [...prev.items];
      const item = { ...updated[index] };

      if (field === 'productId') {
        const prod = products.find((p) => String(p.id) === String(value));
        if (prod) {
          item.productId = prod.id;
          item.productName = prod.name;
          item.category = prod.category;
          item.unit = prod.unit;
          item.costPrice = Number(prod.costPrice) || Math.round(Number(prod.unitPrice || 40) * 0.8);
          item.subtotal = Number((item.costPrice * item.quantity).toFixed(2));
        }
      } else if (field === 'quantity') {
        const q = Math.max(0, Number(value));
        item.quantity = q;
        item.subtotal = Number((item.costPrice * q).toFixed(2));
      } else if (field === 'costPrice') {
        const c = Math.max(0, Number(value));
        item.costPrice = c;
        item.subtotal = Number((c * item.quantity).toFixed(2));
      } else {
        item[field] = value;
      }

      updated[index] = item;
      return { ...prev, items: updated };
    });
  };

  // Submit Bulk Order
  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      setSubmitting(true);
      const res = await createPurchaseApi(formData);
      if (res.data?.success) {
        addToast(res.data.message || 'Bulk order recorded & stock updated!', 'success');
        setIsModalOpen(false);
        fetchPurchases();
      }
    } catch (error) {
      addToast(error.response?.data?.message || 'Failed to record bulk order', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // Admin Delete & Stock Reversal
  const handleDelete = async (id, inv) => {
    if (!window.confirm(`Delete Purchase #${id} (${inv})? All incremented stock will be automatically reversed.`)) return;
    try {
      const res = await deletePurchaseApi(id);
      if (res.data?.success) {
        addToast(res.data.message || 'Purchase deleted and stock reversed', 'info');
        fetchPurchases();
      }
    } catch (error) {
      addToast(error.response?.data?.message || 'Failed to delete purchase', 'error');
    }
  };

  // Computed Totals for Form
  const grandTotal = formData.items.reduce((sum, it) => sum + Number(it.subtotal || 0), 0);
  const grandUnits = formData.items.reduce((sum, it) => sum + Number(it.quantity || 0), 0);

  // Computed Totals for KPI Cards
  const filteredPurchases = purchases.filter((p) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    const invMatch = (p.invoiceNumber || '').toLowerCase().includes(q);
    const supMatch = (p.supplierName || '').toLowerCase().includes(q);
    const itemsMatch = (p.items || []).some(it => (it.product?.name || '').toLowerCase().includes(q));
    return invMatch || supMatch || itemsMatch;
  });

  const totalSpentAll = filteredPurchases.reduce((sum, p) => sum + Number(p.totalAmount || 0), 0);
  const totalUnitsAll = filteredPurchases.reduce((sum, p) => sum + Number(p.totalQuantity || 0), 0);

  return (
    <div className="space-y-6">
      {/* 1. Header & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200/80">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <ShoppingBag className="w-6 h-6 text-[#0B4F9C]" />
            <span>Bulk Orders (Purchases)</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Record supplier consignments, bulk purchase orders, and automatically sync live inventory.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleOpenCreateModal}
            className="px-4 py-2 bg-[#0B4F9C] hover:bg-[#083D7A] text-white rounded-xl text-xs font-black shadow-md shadow-blue-500/20 transition-all hover:scale-105 active:scale-95 flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            <span>+ New Bulk Order</span>
          </button>

          <button
            onClick={fetchPurchases}
            className="p-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl transition-colors cursor-pointer"
            title="Refresh purchases"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 2. Top Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-4 sm:p-5 rounded-3xl border border-slate-200/80 shadow-soft flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-blue-50 text-[#0B4F9C] flex items-center justify-center font-bold text-lg shrink-0">
            ₹
          </div>
          <div>
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Total Bulk Spent</span>
            <span className="text-xl sm:text-2xl font-black text-slate-900 font-mono">
              ₹{totalSpentAll.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
        </div>

        <div className="bg-white p-4 sm:p-5 rounded-3xl border border-slate-200/80 shadow-soft flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold text-lg shrink-0">
            <Package className="w-6 h-6" />
          </div>
          <div>
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Total Units Procured</span>
            <span className="text-xl sm:text-2xl font-black text-slate-900 font-mono">
              {totalUnitsAll.toLocaleString('en-IN')} Units
            </span>
          </div>
        </div>

        <div className="bg-white p-4 sm:p-5 rounded-3xl border border-slate-200/80 shadow-soft flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-700 flex items-center justify-center font-bold text-lg shrink-0">
            <Truck className="w-6 h-6" />
          </div>
          <div>
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Consignments Recorded</span>
            <span className="text-xl sm:text-2xl font-black text-slate-900 font-mono">
              {filteredPurchases.length} Orders
            </span>
          </div>
        </div>
      </div>

      {/* 3. History Filter Toolbar */}
      <div className="bg-white p-4 rounded-3xl border border-slate-200/80 shadow-sm space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search invoice, vendor, or product..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-[#FAF8F5] border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0B4F9C]"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Supplier Filter */}
            <div className="flex items-center gap-1.5 bg-[#FAF8F5] px-3 py-1.5 rounded-xl border border-slate-200 text-xs">
              <Building2 className="w-3.5 h-3.5 text-slate-400" />
              <select
                value={supplierFilter}
                onChange={(e) => setSupplierFilter(e.target.value)}
                className="bg-transparent font-bold text-slate-700 focus:outline-none text-xs"
              >
                <option value="All">All Suppliers</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Date Range Filters */}
            <div className="flex items-center gap-2 bg-[#FAF8F5] px-3 py-1.5 rounded-xl border border-slate-200 text-xs">
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="bg-transparent text-slate-700 text-xs font-medium focus:outline-none"
                title="Start date"
              />
              <span className="text-slate-400">to</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="bg-transparent text-slate-700 text-xs font-medium focus:outline-none"
                title="End date"
              />
              {(startDate || endDate) && (
                <button
                  onClick={() => { setStartDate(''); setEndDate(''); }}
                  className="text-[10px] text-rose-500 font-bold hover:underline ml-1"
                >
                  Clear
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 4. Purchase History Table */}
      <div className="bg-white rounded-3xl border border-slate-200/90 shadow-soft overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-400 animate-pulse font-bold text-xs">
            Loading purchase consignments...
          </div>
        ) : filteredPurchases.length === 0 ? (
          <div className="p-12 text-center space-y-2">
            <ShoppingBag className="w-10 h-10 text-slate-300 mx-auto" />
            <h3 className="font-extrabold text-sm text-slate-700">No Bulk Orders Found</h3>
            <p className="text-xs text-slate-400">Record a new bulk order to add stock and track inventory history.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#FAF8F5] border-b border-slate-200/80 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="py-3 px-4">Date & Invoice</th>
                  <th className="py-3 px-4">Supplier / Vendor</th>
                  <th className="py-3 px-4">Products & Volume</th>
                  <th className="py-3 px-4 text-right">Total Amount</th>
                  <th className="py-3 px-4">Recorded By</th>
                  <th className="py-3 px-4 text-center">Breakdown</th>
                  {isAdmin && <th className="py-3 px-4 text-right">Action</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredPurchases.map((purchase) => {
                  const isExpanded = expandedRowId === purchase.id;
                  const purchaseItems = purchase.items || [];

                  return (
                    <React.Fragment key={purchase.id}>
                      <tr className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3.5 px-4">
                          <div className="font-black text-slate-900 font-mono">
                            {purchase.invoiceNumber || `INV-${purchase.id}`}
                          </div>
                          <div className="text-[11px] text-slate-400 font-medium">
                            {new Date(purchase.date).toLocaleDateString([], {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric'
                            })}
                          </div>
                        </td>

                        <td className="py-3.5 px-4">
                          <div className="font-bold text-slate-900">
                            {purchase.supplierName}
                          </div>
                          {purchase.supplier?.category && (
                            <span className="text-[10px] text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full font-bold">
                              {purchase.supplier.category}
                            </span>
                          )}
                        </td>

                        <td className="py-3.5 px-4">
                          <div className="font-bold text-slate-800 flex items-center gap-1.5">
                            <Package className="w-3.5 h-3.5 text-slate-400" />
                            <span>{purchase.itemsCount} {purchase.itemsCount === 1 ? 'Product' : 'Products'}</span>
                          </div>
                          <div className="text-[11px] text-slate-500 font-mono">
                            {purchase.totalQuantity} total units
                          </div>
                        </td>

                        <td className="py-3.5 px-4 text-right">
                          <div className="font-black text-slate-900 text-sm font-mono">
                            ₹{Number(purchase.totalAmount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </div>
                          <span className="text-[10px] text-emerald-700 font-bold bg-emerald-50 px-1.5 py-0.5 rounded">
                            Verified
                          </span>
                        </td>

                        <td className="py-3.5 px-4">
                          <div className="font-semibold text-slate-700">
                            {purchase.addedBy?.name || 'Staff User'}
                          </div>
                          <div className="text-[10px] text-slate-400 capitalize">
                            {purchase.addedBy?.role || 'Staff'}
                          </div>
                        </td>

                        <td className="py-3.5 px-4 text-center">
                          <button
                            onClick={() => setExpandedRowId(isExpanded ? null : purchase.id)}
                            className="px-2.5 py-1 bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-[#0B4F9C] rounded-lg text-[11px] font-bold transition-all flex items-center gap-1 mx-auto"
                          >
                            <span>{isExpanded ? 'Hide' : 'View Items'}</span>
                            {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                          </button>
                        </td>

                        {isAdmin && (
                          <td className="py-3.5 px-4 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                onClick={() => handleOpenEditPurchaseModal(purchase)}
                                className="px-2 py-1 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded-lg text-xs font-bold transition-all flex items-center gap-1 cursor-pointer"
                                title="Admin: Correct wrong staff purchase entry"
                              >
                                <Edit3 className="w-3.5 h-3.5 text-amber-600" />
                                <span>Edit</span>
                              </button>
                              <button
                                onClick={() => handleDelete(purchase.id, purchase.invoiceNumber)}
                                className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-xl transition-colors cursor-pointer"
                                title="Delete purchase & reverse stock increments"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>

                      {/* Expandable Line Items Breakdown */}
                      {isExpanded && (
                        <tr className="bg-slate-50/90">
                          <td colSpan={isAdmin ? 7 : 6} className="py-3 px-6">
                            <div className="p-3.5 bg-white rounded-2xl border border-slate-200/80 shadow-xs space-y-2">
                              <div className="flex items-center justify-between text-xs font-bold text-slate-700 border-b border-slate-100 pb-2">
                                <span className="flex items-center gap-1.5">
                                  <Layers className="w-3.5 h-3.5 text-[#0B4F9C]" />
                                  <span>Line Items Breakdown (Purchase #{purchase.id})</span>
                                </span>
                                {purchase.notes && (
                                  <span className="text-[11px] text-slate-400 font-normal italic">
                                    Notes: {purchase.notes}
                                  </span>
                                )}
                              </div>

                              <table className="w-full text-left text-[11px]">
                                <thead className="text-slate-400 font-bold uppercase tracking-wider text-[9px]">
                                  <tr>
                                    <th className="py-1.5">Item / Product</th>
                                    <th className="py-1.5 text-right">Cost / Unit</th>
                                    <th className="py-1.5 text-right">Quantity</th>
                                    <th className="py-1.5 text-right">Line Subtotal</th>
                                    <th className="py-1.5 text-right">Batch Details</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                  {purchaseItems.map((item, idx) => (
                                    <tr key={item.id || idx}>
                                      <td className="py-1.5 font-bold text-slate-900">
                                        {item.product?.name || `Product #${item.productId}`}
                                        <span className="ml-1 text-[10px] text-slate-400 font-normal">
                                          ({item.product?.unit || 'units'})
                                        </span>
                                      </td>
                                      <td className="py-1.5 text-right font-mono text-slate-700">
                                        ₹{Number(item.costPrice).toFixed(2)}
                                      </td>
                                      <td className="py-1.5 text-right font-bold text-slate-900">
                                        +{item.quantity}
                                      </td>
                                      <td className="py-1.5 text-right font-black text-slate-900 font-mono">
                                        ₹{Number(item.subtotal).toFixed(2)}
                                      </td>
                                      <td className="py-1.5 text-right text-slate-500 font-mono text-[10px]">
                                        {item.batchNumber ? `Batch: ${item.batchNumber}` : 'Auto-batch'}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 5. New Bulk Order Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Record New Bulk Order"
        subtitle="Select supplier, add product quantities, and automatically update live stock."
        icon={<ShoppingBag className="w-5 h-5 text-[#0B4F9C]" />}
        maxWidth="max-w-3xl"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Header Row: Supplier & Invoice */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Supplier / Vendor *
              </label>
              <select
                required
                value={formData.supplierId}
                onChange={handleSupplierChange}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0B4F9C]"
              >
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.category})
                  </option>
                ))}
                <option value="other">+ Other / Custom Vendor</option>
              </select>
            </div>

            {formData.supplierId === '' && (
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Custom Vendor Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Enter vendor or farmer name"
                  value={formData.supplierName}
                  onChange={(e) => setFormData({ ...formData, supplierName: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0B4F9C]"
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Invoice / Challan No. *
              </label>
              <input
                type="text"
                required
                value={formData.invoiceNumber}
                onChange={(e) => setFormData({ ...formData, invoiceNumber: e.target.value })}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0B4F9C]"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Consignment Date *
              </label>
              <input
                type="date"
                required
                value={formData.date}
                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0B4F9C]"
              />
            </div>
          </div>

          {/* Line Items Table */}
          <div className="space-y-2 pt-2 border-t border-slate-200">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-[#0B4F9C]" />
                <span>Product Line Items ({formData.items.length})</span>
              </span>

              <button
                type="button"
                onClick={handleAddLineItem}
                className="px-3 py-1 bg-blue-50 hover:bg-blue-100 text-[#0B4F9C] rounded-xl text-xs font-black transition-colors flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>+ Add Product Line</span>
              </button>
            </div>

            <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
              {formData.items.map((item, idx) => (
                <div
                  key={item.tempId || idx}
                  className="p-3 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-2 text-xs"
                >
                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center">
                    {/* Product Selection */}
                    <div className="sm:col-span-5">
                      <select
                        required
                        value={item.productId}
                        onChange={(e) => handleLineItemChange(idx, 'productId', e.target.value)}
                        className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0B4F9C]"
                      >
                        <option value="" disabled>Select Product</option>
                        {products.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} ({p.unit})
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Cost Price */}
                    <div className="sm:col-span-2">
                      <div className="relative">
                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 font-mono text-[11px]">₹</span>
                        <input
                          type="number"
                          step="any"
                          min="0"
                          required
                          placeholder="Cost"
                          value={item.costPrice}
                          onChange={(e) => handleLineItemChange(idx, 'costPrice', e.target.value)}
                          className="w-full pl-6 pr-2 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-900 text-right focus:outline-none focus:ring-2 focus:ring-[#0B4F9C]"
                        />
                      </div>
                    </div>

                    {/* Quantity */}
                    <div className="sm:col-span-2">
                      <div className="relative">
                        <input
                          type="number"
                          step="any"
                          min="0.1"
                          required
                          placeholder="Qty"
                          value={item.quantity}
                          onChange={(e) => handleLineItemChange(idx, 'quantity', e.target.value)}
                          className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-black text-slate-900 text-right focus:outline-none focus:ring-2 focus:ring-[#0B4F9C]"
                        />
                      </div>
                    </div>

                    {/* Line Subtotal */}
                    <div className="sm:col-span-2 text-right">
                      <span className="text-[10px] text-slate-400 block font-semibold">Subtotal</span>
                      <span className="font-black text-slate-900 font-mono text-sm">
                        ₹{item.subtotal.toFixed(2)}
                      </span>
                    </div>

                    {/* Delete Line Button */}
                    <div className="sm:col-span-1 text-center">
                      <button
                        type="button"
                        onClick={() => handleRemoveLineItem(idx)}
                        className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-colors"
                        title="Remove line"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Notes & Summary Banner */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-200 items-center">
            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">
                Consignment Notes (Optional)
              </label>
              <input
                type="text"
                placeholder="Truck number, delivery agent, driver contact..."
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0B4F9C]"
              />
            </div>

            <div className="bg-[#FAF8F5] p-3 rounded-2xl border border-slate-200 text-right">
              <span className="text-[11px] font-bold text-slate-500 block">
                Total Units: <strong className="text-slate-800">{grandUnits}</strong>
              </span>
              <div className="text-xl font-black text-slate-900 font-mono mt-0.5">
                ₹{grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 py-2.5 bg-[#0B4F9C] hover:bg-[#083D7A] disabled:opacity-50 text-white rounded-xl text-xs font-black shadow-md transition-colors"
            >
              {submitting ? 'Recording Bulk Order...' : 'Confirm Bulk Order & Update Stock'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Admin Correction: Edit Purchase Modal */}
      <Modal
        isOpen={Boolean(editingPurchase)}
        onClose={() => setEditingPurchase(null)}
        title={`Admin Correction: Purchase #${editingPurchase?.id || editingPurchase?._id}`}
        size="lg"
      >
        <form onSubmit={handleSaveEditPurchase} className="space-y-4">
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 text-xs font-medium">
            <strong className="block font-bold mb-0.5">Admin Inward Correction Mode</strong>
            Adjust wrong invoice numbers, supplier names, quantities, or cost prices. Live stock levels will be automatically reconciled.
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block mb-1">
                Supplier Name
              </label>
              <input
                type="text"
                required
                value={editPurchaseForm.supplierName}
                onChange={(e) => setEditPurchaseForm({ ...editPurchaseForm, supplierName: e.target.value })}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0B4F9C]"
              />
            </div>

            <div>
              <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block mb-1">
                Invoice / Challan Number
              </label>
              <input
                type="text"
                required
                value={editPurchaseForm.invoiceNumber}
                onChange={(e) => setEditPurchaseForm({ ...editPurchaseForm, invoiceNumber: e.target.value })}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0B4F9C]"
              />
            </div>
          </div>

          {/* Line Items */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-bold text-slate-700">
              <span>Purchase Items & Quantities</span>
              <button
                type="button"
                onClick={handleAddEditPurchaseItem}
                className="text-blue-700 hover:text-blue-800 text-[11px] font-bold flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Item</span>
              </button>
            </div>

            <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
              {editPurchaseForm.items.map((it, idx) => (
                <div key={idx} className="flex items-center gap-2 bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                  <div className="flex-1">
                    <select
                      value={it.productId}
                      onChange={(e) => handleEditPurchaseItemChange(idx, 'productId', e.target.value)}
                      className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-900"
                    >
                      {products.map(p => (
                        <option key={p.id || p._id} value={p.id || p._id}>
                          {p.name} ({p.unit})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="w-24">
                    <input
                      type="number"
                      step="any"
                      min="0.1"
                      required
                      value={it.quantity}
                      onChange={(e) => handleEditPurchaseItemChange(idx, 'quantity', e.target.value)}
                      placeholder="Quantity"
                      className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-bold text-right text-slate-900"
                    />
                  </div>
                  <div className="w-24">
                    <input
                      type="number"
                      step="0.5"
                      min="0"
                      required
                      value={it.costPrice}
                      onChange={(e) => handleEditPurchaseItemChange(idx, 'costPrice', e.target.value)}
                      placeholder="Cost (₹)"
                      className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-bold text-right text-slate-900"
                    />
                  </div>
                  <div className="w-20 text-right font-mono font-bold text-xs text-slate-700">
                    ₹{(Number(it.quantity || 0) * Number(it.costPrice || 0)).toFixed(2)}
                  </div>
                  {editPurchaseForm.items.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveEditPurchaseItem(idx)}
                      className="p-1 text-rose-500 hover:text-rose-700 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block mb-1">
                Purchase Date
              </label>
              <input
                type="date"
                required
                value={editPurchaseForm.date}
                onChange={(e) => setEditPurchaseForm({ ...editPurchaseForm, date: e.target.value })}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900"
              />
            </div>

            <div>
              <label className="text-[11px] font-bold text-amber-800 uppercase tracking-wider block mb-1">
                Reason for Staff Error Correction *
              </label>
              <input
                type="text"
                required
                value={editPurchaseForm.correctionReason}
                onChange={(e) => setEditPurchaseForm({ ...editPurchaseForm, correctionReason: e.target.value })}
                placeholder="e.g. Staff entered 100 crates instead of 10"
                className="w-full px-3 py-2 bg-amber-50/50 border border-amber-300 rounded-xl text-xs font-bold text-slate-900"
              />
            </div>
          </div>

          <div className="flex gap-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setEditingPurchase(null)}
              className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={savingPurchaseEdit}
              className="flex-1 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-black shadow-md transition-all flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Edit3 className="w-4 h-4" />
              <span>{savingPurchaseEdit ? 'Saving Correction...' : 'Save & Reconcile Stock'}</span>
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
