import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { 
  getSalesApi, 
  getSaleByIdApi,
  createSaleApi, 
  deleteSaleApi, 
  getProductsApi,
  getProductByCodeApi
} from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import Modal from '../components/common/Modal';
import Badge from '../components/common/Badge';
import ReceiptModal from '../components/common/ReceiptModal';
import { 
  ShoppingCart, 
  Plus, 
  Search, 
  Trash2, 
  Calendar, 
  TrendingUp, 
  DollarSign, 
  Receipt, 
  RefreshCw, 
  CreditCard,
  Banknote,
  QrCode,
  FileText,
  Printer,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  Layers
} from 'lucide-react';

const Sales = () => {
  const [searchParams] = useSearchParams();
  const { isAdmin } = useAuth();
  const { addToast } = useToast();

  const [sales, setSales] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filter States
  const [searchTerm, setSearchTerm] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [filterProduct, setFilterProduct] = useState('');

  // Expandable History Rows State
  const [expandedSaleId, setExpandedSaleId] = useState(null);

  // New Sale POS Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Active Receipt Modal State
  const [activeReceiptSale, setActiveReceiptSale] = useState(null);
  const [isReceiptOpen, setIsReceiptOpen] = useState(false);

  // POS Form State (Multi-Item Cart)
  const [formData, setFormData] = useState({
    customerName: 'Walk-in Customer',
    outletOrRoute: 'Main Dairy Counter',
    paymentMode: 'Cash',
    discount: 0,
    date: new Date().toISOString().split('T')[0],
    notes: '',
    items: [
      { productId: '', quantity: 1, sellingPrice: 0 }
    ]
  });

  useEffect(() => {
    fetchProducts();
    fetchSales();
  }, [startDate, endDate]);

  useEffect(() => {
    const qrParam = searchParams.get('qr');
    const prodParam = searchParams.get('product');

    if (qrParam && products.length > 0) {
      const match = products.find(
        (p) => String(p._id) === String(qrParam) || String(p.id) === String(qrParam) || p.qrCode === qrParam
      );
      if (match) {
        addItemToCart(match);
        setIsModalOpen(true);
      }
    } else if (prodParam && products.length > 0) {
      const match = products.find(
        (p) => String(p._id) === String(prodParam) || String(p.id) === String(prodParam) || p.qrCode === prodParam
      );
      if (match) {
        addItemToCart(match);
        setIsModalOpen(true);
      }
    }
    const isNewSale = searchParams.get('new') === 'true' || searchParams.get('action') === 'new';
    if (isNewSale) {
      setIsModalOpen(true);
    }
  }, [searchParams, products]);

  const fetchProducts = async () => {
    try {
      const res = await getProductsApi({ activeOnly: true });
      if (res.data?.success && Array.isArray(res.data.products)) {
        setProducts(res.data.products);
      } else {
        setProducts([]);
      }
    } catch (e) {
      setProducts([]);
    }
  };

  const fetchSales = async () => {
    try {
      setLoading(true);
      const params = {};
      if (startDate) params.startDate = startDate;
      if (endDate) params.endDate = endDate;
      if (filterProduct) params.productId = filterProduct;

      const res = await getSalesApi(params);
      if (res.data?.success && Array.isArray(res.data.sales)) {
        setSales(res.data.sales);
      } else {
        setSales([]);
      }
    } catch (error) {
      console.warn('Sales load error:', error?.message);
      setSales([]);
    } finally {
      setLoading(false);
    }
  };

  // Helper to add product into cart or increment if exists
  const addItemToCart = (product) => {
    if (!product) return;
    const pId = String(product._id || product.id);
    const existingIndex = formData.items.findIndex(it => String(it.productId) === pId);

    if (existingIndex >= 0) {
      const updated = [...formData.items];
      updated[existingIndex].quantity = Number(updated[existingIndex].quantity || 1) + 1;
      setFormData({ ...formData, items: updated });
    } else {
      // If first row is empty, replace it
      if (formData.items.length === 1 && !formData.items[0].productId) {
        setFormData({
          ...formData,
          items: [{ productId: pId, quantity: 1, sellingPrice: Number(product.unitPrice || 0) }]
        });
      } else {
        setFormData({
          ...formData,
          items: [
            ...formData.items,
            { productId: pId, quantity: 1, sellingPrice: Number(product.unitPrice || 0) }
          ]
        });
      }
    }
  };

  // Line Item Form Handlers
  const handleLineItemChange = (index, field, value) => {
    const updated = [...formData.items];
    updated[index][field] = value;

    if (field === 'productId') {
      const prod = products.find((p) => String(p._id || p.id) === String(value));
      if (prod) {
        updated[index].sellingPrice = Number(prod.unitPrice || 0);
      }
    }
    setFormData({ ...formData, items: updated });
  };

  const handleAddLineItem = () => {
    setFormData({
      ...formData,
      items: [...formData.items, { productId: '', quantity: 1, sellingPrice: 0 }]
    });
  };

  const handleRemoveLineItem = (index) => {
    if (formData.items.length <= 1) {
      setFormData({
        ...formData,
        items: [{ productId: '', quantity: 1, sellingPrice: 0 }]
      });
      return;
    }
    const updated = formData.items.filter((_, i) => i !== index);
    setFormData({ ...formData, items: updated });
  };

  // Calculation Helpers
  const calculateSubtotal = () => {
    return formData.items.reduce((sum, item) => {
      const q = Number(item.quantity || 0);
      const p = Number(item.sellingPrice || 0);
      return sum + (q * p);
    }, 0);
  };

  const subtotal = calculateSubtotal();
  const discountAmount = Math.max(0, Number(formData.discount || 0));
  const grandTotal = Math.max(0, subtotal - discountAmount);

  // Check if any cart item exceeds available stock
  const hasInsufficientStock = formData.items.some((item) => {
    if (!item.productId) return false;
    const prod = products.find((p) => String(p._id || p.id) === String(item.productId));
    if (!prod) return false;
    const available = Number(prod.currentQuantity || 0);
    return Number(item.quantity || 0) > available;
  });

  // Submit Sale Order Handler
  const handleSubmitSale = async (e) => {
    e.preventDefault();

    const validItems = formData.items.filter(it => it.productId && Number(it.quantity) > 0);
    if (validItems.length === 0) {
      addToast('Please add at least one valid product line with quantity', 'warning');
      return;
    }

    if (hasInsufficientStock) {
      addToast('Cannot complete sale: requested quantity exceeds available stock for one or more items', 'error');
      return;
    }

    try {
      setSubmitting(true);
      const payload = {
        customerName: formData.customerName,
        outletOrRoute: formData.outletOrRoute,
        paymentMode: formData.paymentMode,
        discount: discountAmount,
        date: formData.date,
        notes: formData.notes,
        items: validItems
      };

      const res = await createSaleApi(payload);
      if (res.data?.success) {
        addToast(res.data.message || 'Sale completed successfully!', 'success');
        setIsModalOpen(false);

        // Reset Form
        setFormData({
          customerName: 'Walk-in Customer',
          outletOrRoute: 'Main Dairy Counter',
          paymentMode: 'Cash',
          discount: 0,
          date: new Date().toISOString().split('T')[0],
          notes: '',
          items: [{ productId: '', quantity: 1, sellingPrice: 0 }]
        });

        // Open Receipt Modal immediately for user preview / print / PDF download!
        if (res.data.sale) {
          setActiveReceiptSale(res.data.sale);
          setIsReceiptOpen(true);
        }

        fetchSales();
        fetchProducts(); // Refresh stocks
      }
    } catch (error) {
      const msg = error.response?.data?.message || 'Failed to record sale';
      addToast(msg, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // Delete & Restock Sale (Admin only)
  const handleDeleteSale = async (saleId) => {
    if (!window.confirm('Are you sure you want to void/delete this sale? All sold items will be automatically restocked into inventory.')) {
      return;
    }

    try {
      const res = await deleteSaleApi(saleId);
      if (res.data?.success) {
        addToast(res.data.message, 'info');
        fetchSales();
        fetchProducts();
      }
    } catch (error) {
      addToast(error.response?.data?.message || 'Failed to void sale', 'error');
    }
  };

  // View Receipt from History
  const handleOpenReceipt = async (sale) => {
    try {
      const res = await getSaleByIdApi(sale._id || sale.id);
      if (res.data?.success && res.data.sale) {
        setActiveReceiptSale(res.data.sale);
      } else {
        setActiveReceiptSale(sale);
      }
    } catch (e) {
      setActiveReceiptSale(sale);
    }
    setIsReceiptOpen(true);
  };

  // Filter Sales
  const searchLower = (searchTerm || '').toLowerCase();
  const filteredSales = sales.filter((s) => {
    if (!s) return false;
    const cust = (s.customerName || '').toLowerCase();
    const rec = (s.receiptNumber || '').toLowerCase();
    const mode = (s.paymentMode || '').toLowerCase();
    const matchesSearch = cust.includes(searchLower) || rec.includes(searchLower) || mode.includes(searchLower);

    let matchesProd = true;
    if (filterProduct) {
      const pIdNum = Number(filterProduct);
      const matchLegacy = Number(s.productId?.id || s.productId?._id || s.productId) === pIdNum;
      const matchItem = Array.isArray(s.items) && s.items.some(it => Number(it.productId?.id || it.productId || it.product?._id) === pIdNum);
      matchesProd = matchLegacy || matchItem;
    }

    return matchesSearch && matchesProd;
  });

  // Calculate Aggregates for KPI Banner
  const totalRevenue = sales.reduce((sum, s) => sum + Number(s.totalAmount || 0), 0);
  const totalDiscounts = sales.reduce((sum, s) => sum + Number(s.discount || 0), 0);
  const totalReceipts = sales.length;

  return (
    <div className="space-y-6">
      {/* 1. Header & Quick Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200/80">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <ShoppingCart className="w-6 h-6 text-emerald-600" />
            <span>Sales & Outward Counter (POS)</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Fast POS billing, multi-line cart checkout, live stock validation, itemized tax invoices & thermal receipts.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* New POS Sale Trigger */}
          <button
            onClick={() => setIsModalOpen(true)}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black shadow-md shadow-emerald-500/20 transition-all hover:scale-105 active:scale-95 flex items-center gap-1.5 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>+ New POS Sale</span>
          </button>
        </div>
      </div>

      {/* 2. Top Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-3xl border border-slate-200/90 shadow-2xs flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
              Total Sales Revenue
            </span>
            <span className="text-2xl font-black text-emerald-700">
              ₹{totalRevenue.toLocaleString()}
            </span>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <TrendingUp className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-3xl border border-slate-200/90 shadow-2xs flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
              Receipts Issued
            </span>
            <span className="text-2xl font-black text-slate-800">
              {totalReceipts}
            </span>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-blue-50 text-[#0B4F9C] flex items-center justify-center">
            <Receipt className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-3xl border border-slate-200/90 shadow-2xs flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
              Total Discounts Given
            </span>
            <span className="text-2xl font-black text-purple-700">
              ₹{totalDiscounts.toLocaleString()}
            </span>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-purple-50 text-purple-600 flex items-center justify-center">
            <DollarSign className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* 3. Filters & Search Bar */}
      <div className="bg-white p-4 rounded-3xl border border-slate-200/80 shadow-sm flex flex-wrap items-center justify-between gap-3">
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search receipt # (e.g. REC-...), customer, or mode..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-[#FAF8F5] border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          {/* Product Filter */}
          <select
            value={filterProduct}
            onChange={(e) => setFilterProduct(e.target.value)}
            className="bg-[#FAF8F5] border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-slate-700 font-medium"
          >
            <option value="">All Products</option>
            {products.map((p) => (
              <option key={p._id || p.id} value={p._id || p.id}>
                {p.name}
              </option>
            ))}
          </select>

          {/* Date Range */}
          <div className="flex items-center gap-1.5 bg-[#FAF8F5] border border-slate-200 rounded-xl px-2.5 py-1">
            <Calendar className="w-3.5 h-3.5 text-slate-400" />
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="bg-transparent text-xs text-slate-700 focus:outline-none"
            />
            <span className="text-slate-400 text-[10px]">to</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="bg-transparent text-xs text-slate-700 focus:outline-none"
            />
          </div>

          {(startDate || endDate || filterProduct || searchTerm) && (
            <button
              onClick={() => {
                setStartDate('');
                setEndDate('');
                setFilterProduct('');
                setSearchTerm('');
              }}
              className="text-xs text-rose-500 hover:underline font-bold ml-1 cursor-pointer"
            >
              Clear Filters
            </button>
          )}
        </div>
      </div>

      {/* 4. Sales History Table */}
      {loading ? (
        <div className="bg-white rounded-3xl p-12 text-center text-slate-400 animate-pulse">
          Loading sales and receipt records...
        </div>
      ) : filteredSales.length === 0 ? (
        <div className="bg-white rounded-3xl p-12 text-center border border-slate-200 shadow-sm space-y-2">
          <ShoppingCart className="w-10 h-10 text-slate-300 mx-auto" />
          <h3 className="font-extrabold text-sm text-slate-700">No Sales Recorded</h3>
          <p className="text-xs text-slate-400">
            Click "+ New POS Sale" to record outward counter sales and generate receipts.
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-3xl border border-slate-200/90 shadow-soft overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#FAF8F5] text-slate-500 uppercase text-[10px] tracking-wider border-b border-slate-200">
                <tr>
                  <th className="py-3.5 px-4 font-black">Date</th>
                  <th className="py-3.5 px-4 font-black">Receipt #</th>
                  <th className="py-3.5 px-4 font-black">Customer / Route</th>
                  <th className="py-3.5 px-4 font-black">Items Summary</th>
                  <th className="py-3.5 px-4 font-black">Subtotal</th>
                  <th className="py-3.5 px-4 font-black">Discount</th>
                  <th className="py-3.5 px-4 font-black">Net Amount</th>
                  <th className="py-3.5 px-4 font-black">Payment</th>
                  <th className="py-3.5 px-4 font-black">Cashier</th>
                  <th className="py-3.5 px-4 font-black text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {filteredSales.map((sale) => {
                  const isExpanded = expandedSaleId === sale._id;
                  const saleItems = Array.isArray(sale.items) && sale.items.length > 0
                    ? sale.items
                    : [
                        {
                          product: sale.productId || sale.product,
                          quantity: sale.quantity,
                          sellingPrice: sale.sellingPrice,
                          subtotal: sale.totalAmount
                        }
                      ];

                  return (
                    <React.Fragment key={sale._id}>
                      <tr className="hover:bg-emerald-50/20 transition-colors">
                        <td className="py-3.5 px-4 text-slate-500 whitespace-nowrap">
                          {new Date(sale.date).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
                          <div className="text-[10px] text-slate-400">
                            {new Date(sale.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        </td>

                        <td className="py-3.5 px-4">
                          <span className="font-mono font-bold text-xs text-[#0B4F9C] bg-blue-50 px-2 py-0.5 rounded-lg border border-blue-100">
                            {sale.receiptNumber || `REC-${sale._id}`}
                          </span>
                        </td>

                        <td className="py-3.5 px-4">
                          <div className="font-bold text-slate-900">{sale.customerName || 'Walk-in Customer'}</div>
                          <div className="text-[10px] text-slate-400">{sale.outletOrRoute || 'Counter POS'}</div>
                        </td>

                        <td className="py-3.5 px-4">
                          <button
                            onClick={() => setExpandedSaleId(isExpanded ? null : sale._id)}
                            className="inline-flex items-center gap-1 text-slate-700 hover:text-emerald-700 font-bold bg-slate-100 hover:bg-slate-200 px-2 py-1 rounded-lg transition-colors cursor-pointer"
                          >
                            <span>{saleItems.length} item{saleItems.length > 1 ? 's' : ''}</span>
                            {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                          </button>
                        </td>

                        <td className="py-3.5 px-4 text-slate-600 font-mono">
                          ₹{Number(sale.subtotal || sale.totalAmount).toLocaleString()}
                        </td>

                        <td className="py-3.5 px-4 text-purple-700 font-mono">
                          {Number(sale.discount || 0) > 0 ? `-₹${Number(sale.discount).toLocaleString()}` : '₹0'}
                        </td>

                        <td className="py-3.5 px-4 font-black text-emerald-800 font-mono text-sm">
                          ₹{Number(sale.totalAmount).toLocaleString()}
                        </td>

                        <td className="py-3.5 px-4">
                          <Badge variant={sale.paymentMode === 'UPI' ? 'primary' : sale.paymentMode === 'Card' ? 'purple' : 'success'}>
                            {sale.paymentMode}
                          </Badge>
                        </td>

                        <td className="py-3.5 px-4 text-slate-500">
                          {sale.user?.name || sale.addedBy?.name || 'Staff'}
                        </td>

                        <td className="py-3.5 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {/* View Receipt Button */}
                            <button
                              onClick={() => handleOpenReceipt(sale)}
                              className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-lg text-xs font-bold transition-all flex items-center gap-1 cursor-pointer"
                              title="View and Print Receipt"
                            >
                              <Receipt className="w-3.5 h-3.5" />
                              <span>Receipt</span>
                            </button>

                            {/* Admin Delete Reversal */}
                            {isAdmin && (
                              <button
                                onClick={() => handleDeleteSale(sale._id)}
                                className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-50 hover:text-rose-700 transition-colors cursor-pointer"
                                title="Void sale and restock quantities"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>

                      {/* Expandable Order Breakdown */}
                      {isExpanded && (
                        <tr className="bg-slate-50/70 border-b border-slate-200/80">
                          <td colSpan={10} className="p-4">
                            <div className="bg-white rounded-2xl p-3.5 border border-slate-200 shadow-2xs space-y-2">
                              <div className="flex items-center justify-between text-xs font-bold text-slate-700 pb-2 border-b border-slate-100">
                                <span>Itemized Products for Receipt #{sale.receiptNumber || sale._id}</span>
                                <span className="text-[10px] text-slate-400 font-normal">
                                  Notes: {sale.notes || 'None'}
                                </span>
                              </div>
                              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                                {saleItems.map((item, idx) => (
                                  <div key={idx} className="p-2.5 bg-slate-50 rounded-xl border border-slate-200/60 flex items-center justify-between text-xs">
                                    <div>
                                      <div className="font-bold text-slate-900">
                                        {item.product?.name || item.productId?.name || 'Dairy Item'}
                                      </div>
                                      <div className="text-[10px] text-slate-400">
                                        {item.quantity} {item.product?.unit || item.productId?.unit || 'units'} @ ₹{item.sellingPrice}
                                      </div>
                                    </div>
                                    <span className="font-mono font-bold text-emerald-800">
                                      ₹{(Number(item.subtotal || item.quantity * item.sellingPrice)).toLocaleString()}
                                    </span>
                                  </div>
                                ))}
                              </div>
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
        </div>
      )}

      {/* 5. POS-Style New Sale Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="POS New Outward Sale"
        subtitle="Itemized billing with live stock checks. Automatically decrements inventory and generates tax invoice."
        icon={<ShoppingCart className="w-5 h-5 text-emerald-600" />}
        maxWidth="max-w-3xl"
      >
        <form onSubmit={handleSubmitSale} className="space-y-4">
          {/* Header Customer Details */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3 bg-slate-50 rounded-2xl border border-slate-200/80">
            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">
                Customer Name / Party
              </label>
              <input
                type="text"
                required
                placeholder="Walk-in Customer or Account"
                value={formData.customerName}
                onChange={(e) => setFormData({ ...formData, customerName: e.target.value })}
                className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">
                Counter / Route Outlet
              </label>
              <input
                type="text"
                placeholder="Main Dairy Counter"
                value={formData.outletOrRoute}
                onChange={(e) => setFormData({ ...formData, outletOrRoute: e.target.value })}
                className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">
                Payment Method
              </label>
              <select
                value={formData.paymentMode}
                onChange={(e) => setFormData({ ...formData, paymentMode: e.target.value })}
                className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="Cash">Cash</option>
                <option value="UPI">UPI / QR</option>
                <option value="Card">Card</option>
                <option value="Credit">Credit / Account</option>
              </select>
            </div>
          </div>

          {/* Cart Item Rows Builder */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                <Layers className="w-4 h-4 text-emerald-600" />
                <span>Cart Products ({formData.items.length})</span>
              </label>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleAddLineItem}
                  className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-lg text-xs font-bold flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Line</span>
                </button>
              </div>
            </div>

            <div className="space-y-2.5 max-h-[360px] overflow-y-auto pr-1">
              {formData.items.map((line, index) => {
                const selectedProd = products.find((p) => String(p._id || p.id) === String(line.productId));
                const availableStock = Number(selectedProd?.currentQuantity || 0);
                const isOverStock = selectedProd && Number(line.quantity || 0) > availableStock;
                const lineTotal = Number(line.quantity || 0) * Number(line.sellingPrice || 0);

                return (
                  <div
                    key={index}
                    className={`p-3 rounded-2xl border transition-all ${
                      isOverStock
                        ? 'bg-rose-50/80 border-rose-300 ring-1 ring-rose-400'
                        : 'bg-white border-slate-200/90 shadow-2xs'
                    }`}
                  >
                    <div className="grid grid-cols-12 gap-2 items-center">
                      {/* Product Selector */}
                      <div className="col-span-12 sm:col-span-5 flex items-center gap-1.5">
                        <select
                          required
                          value={line.productId}
                          onChange={(e) => handleLineItemChange(index, 'productId', e.target.value)}
                          className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        >
                          <option value="">-- Select Dairy Product --</option>
                          {products.map((p) => (
                            <option key={p._id || p.id} value={p._id || p.id}>
                              {p.name} (Stock: {p.currentQuantity || 0} {p.unit})
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Quantity Input */}
                      <div className="col-span-4 sm:col-span-2">
                        <input
                          type="number"
                          step="any"
                          min="0.1"
                          required
                          placeholder="Qty"
                          value={line.quantity}
                          onChange={(e) => handleLineItemChange(index, 'quantity', e.target.value)}
                          className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-black text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-center"
                        />
                      </div>

                      {/* Selling Price Input */}
                      <div className="col-span-4 sm:col-span-2">
                        <input
                          type="number"
                          step="any"
                          min="0"
                          required
                          placeholder="Price"
                          value={line.sellingPrice}
                          onChange={(e) => handleLineItemChange(index, 'sellingPrice', e.target.value)}
                          className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-right"
                        />
                      </div>

                      {/* Line Subtotal */}
                      <div className="col-span-3 sm:col-span-2 text-right">
                        <span className="font-mono font-black text-xs text-slate-900">
                          ₹{lineTotal.toFixed(2)}
                        </span>
                      </div>

                      {/* Remove Row Button */}
                      <div className="col-span-1 sm:col-span-1 text-right">
                        <button
                          type="button"
                          onClick={() => handleRemoveLineItem(index)}
                          className="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Stock Status Bar */}
                    {selectedProd && (
                      <div className="flex items-center justify-between text-[10px] mt-1.5 pt-1.5 border-t border-slate-100">
                        <span className="text-slate-400">
                          Unit: <strong className="text-slate-700">{selectedProd.unit}</strong>
                        </span>

                        {isOverStock ? (
                          <span className="text-rose-600 font-bold flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3 text-rose-500" />
                            Exceeds available stock! (Available: {availableStock} {selectedProd.unit})
                          </span>
                        ) : (
                          <span className="text-emerald-700 font-medium">
                            Stock Available: <strong>{availableStock} {selectedProd.unit}</strong>
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Pricing Summary & Discount Field */}
          <div className="p-4 bg-[#FAF8F5] border border-slate-200 rounded-2xl space-y-2">
            <div className="flex justify-between items-center text-xs">
              <span className="font-bold text-slate-600">Cart Subtotal:</span>
              <span className="font-mono font-bold text-slate-900 text-sm">
                ₹{subtotal.toFixed(2)}
              </span>
            </div>

            <div className="flex justify-between items-center text-xs">
              <label className="font-bold text-purple-700 flex items-center gap-1">
                <span>Special Discount (₹):</span>
              </label>
              <input
                type="number"
                min="0"
                step="any"
                value={formData.discount}
                onChange={(e) => setFormData({ ...formData, discount: e.target.value })}
                className="w-28 px-2 py-1 bg-white border border-purple-200 rounded-lg text-xs font-bold text-right text-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>

            <div className="flex justify-between items-center pt-2 border-t border-slate-200">
              <span className="text-sm font-black text-slate-900">Total Net Amount:</span>
              <span className="text-xl font-black text-emerald-700 font-mono">
                ₹{grandTotal.toFixed(2)}
              </span>
            </div>
          </div>

          {hasInsufficientStock && (
            <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs font-bold flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0" />
              <span>Please adjust quantities. Selling more than available stock is blocked.</span>
            </div>
          )}

          {/* Modal Bottom Actions */}
          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || hasInsufficientStock || subtotal <= 0}
              className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl text-xs font-black shadow-md shadow-emerald-500/20 transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <Receipt className="w-4 h-4" />
              <span>{submitting ? 'Processing Transaction...' : 'Complete Sale & Issue Receipt'}</span>
            </button>
          </div>
        </form>
      </Modal>

      {/* 6. Thermal Receipt Modal (Print & PDF Download) */}
      <ReceiptModal
        isOpen={isReceiptOpen}
        onClose={() => setIsReceiptOpen(false)}
        sale={activeReceiptSale}
      />
    </div>
  );
};

export default Sales;
