import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Download, 
  Upload, 
  FileSpreadsheet, 
  FileText, 
  Database, 
  CheckCircle2, 
  AlertCircle, 
  RefreshCw, 
  Trash2, 
  ArrowRight, 
  UploadCloud, 
  Sparkles, 
  FileCheck,
  Boxes,
  ShoppingCart,
  ShoppingBag,
  Clock,
  Factory,
  Check,
  X
} from 'lucide-react';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';
import { 
  getExportCsvUrl, 
  bulkImportApi, 
  seedDemoDataApi, 
  clearDemoDataApi,
  wipeAllTransactionDataApi,
  resetAllStockToZeroApi
} from '../services/api';

const DataHub = () => {
  const [activeTab, setActiveTab] = useState('download'); // 'download' | 'upload'
  const { addToast } = useToast();
  const { isAdmin } = useAuth();
  
  // Upload State
  const [uploadType, setUploadType] = useState('products'); // 'products' | 'purchases' | 'sales'
  const [parsedRows, setParsedRows] = useState([]);
  const [headers, setHeaders] = useState([]);
  const [fileName, setFileName] = useState('');
  const [isParsing, setIsParsing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef(null);

  // Admin action state
  const [isSeeding, setIsSeeding] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [isWipingTransactions, setIsWipingTransactions] = useState(false);

  // Direct CSV trigger
  const handleDownload = (type, filename) => {
    const url = getExportCsvUrl(type);
    const token = localStorage.getItem('dairy_token');
    
    fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    })
      .then((res) => {
        if (!res.ok) throw new Error('Failed to download report');
        return res.blob();
      })
      .then((blob) => {
        const downloadUrl = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = filename || `${type}_export.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(downloadUrl);
        addToast(`Downloaded ${filename || type} successfully!`, 'success');
      })
      .catch((err) => {
        addToast(err.message || 'Download failed', 'error');
      });
  };

  // Parse CSV File on Client
  const handleFileUpload = (file) => {
    if (!file) return;
    if (!file.name.endsWith('.csv') && !file.name.endsWith('.txt')) {
      addToast('Please upload a standard CSV (.csv) file', 'warning');
      return;
    }

    setFileName(file.name);
    setIsParsing(true);
    setImportResult(null);

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target.result;
        const lines = content
          .split(/\r\n|\n/)
          .map((l) => l.trim())
          .filter((l) => l.length > 0);

        if (lines.length < 2) {
          addToast('Uploaded CSV file is empty or missing data rows.', 'warning');
          setIsParsing(false);
          return;
        }

        // Parse CSV line taking quotes into account
        const parseCsvLine = (line) => {
          const result = [];
          let cur = '';
          let inQuotes = false;
          for (let i = 0; i < line.length; i++) {
            const char = line[i];
            if (char === '"' || char === "'") {
              inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
              result.push(cur.trim().replace(/^["']|["']$/g, ''));
              cur = '';
            } else {
              cur += char;
            }
          }
          result.push(cur.trim().replace(/^["']|["']$/g, ''));
          return result;
        };

        const parsedHeaders = parseCsvLine(lines[0]);
        const rows = [];

        for (let i = 1; i < lines.length; i++) {
          const values = parseCsvLine(lines[i]);
          if (values.length === 0 || (values.length === 1 && values[0] === '')) continue;
          const rowObj = {};
          parsedHeaders.forEach((h, idx) => {
            rowObj[h] = values[idx] !== undefined ? values[idx] : '';
          });
          rows.push(rowObj);
        }

        setHeaders(parsedHeaders);
        setParsedRows(rows);
        addToast(`Parsed ${rows.length} rows from "${file.name}"`, 'info');
      } catch (err) {
        addToast(`Failed to parse CSV: ${err.message}`, 'error');
      } finally {
        setIsParsing(false);
      }
    };
    reader.readAsText(file);
  };

  const handleConfirmImport = async () => {
    if (parsedRows.length === 0) {
      addToast('No data rows to import', 'warning');
      return;
    }

    try {
      setIsImporting(true);
      const res = await bulkImportApi({
        type: uploadType,
        records: parsedRows
      });

      if (res.data.success) {
        setImportResult(res.data);
        addToast(res.data.message || `Successfully imported ${res.data.successCount} records!`, 'success');
        setParsedRows([]);
        setFileName('');
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    } catch (err) {
      addToast(err.response?.data?.message || err.message || 'Import failed', 'error');
    } finally {
      setIsImporting(false);
    }
  };

  const handleSeedDemo = async () => {
    try {
      setIsSeeding(true);
      const res = await seedDemoDataApi();
      addToast(res.data.message || 'Demo products loaded successfully!', 'success');
    } catch (err) {
      addToast(err.message || 'Failed to seed demo data', 'error');
    } finally {
      setIsSeeding(false);
    }
  };

  const handleClearDemo = async () => {
    if (!window.confirm('Are you sure you want to remove all products, stock, and transactions? Admin logins will be preserved.')) {
      return;
    }
    try {
      setIsClearing(true);
      const res = await clearDemoDataApi();
      addToast(res.data.message || 'Database cleaned successfully.', 'success');
    } catch (err) {
      addToast(err.message || 'Failed to clear data', 'error');
    } finally {
      setIsClearing(false);
    }
  };

  const handleWipeAllTransactions = async () => {
    if (!window.confirm('WARNING: Kya aap sach me sabhi online transactions (Sales, Purchases, Batches, Feedbacks) delete karke saara Stock ZERO (0) karna chahte hain? Offline cache bhi clear ho jayega.')) {
      return;
    }
    try {
      setIsWipingTransactions(true);
      const res = await wipeAllTransactionDataApi();
      // Clear offline stored items
      localStorage.removeItem('md_offline_feedback');
      localStorage.removeItem('md_offline_sales');
      localStorage.removeItem('md_offline_purchases');
      localStorage.removeItem('md_cart');
      localStorage.removeItem('dairy_cart');
      window.dispatchEvent(new Event('stock-updated'));
      addToast(res.data?.message || 'Saare transactions delete kar diye gaye aur stock 0 kar diya gaya!', 'success');
    } catch (err) {
      console.error(err);
      addToast(err.response?.data?.message || 'Failed to wipe transactions', 'error');
    } finally {
      setIsWipingTransactions(false);
    }
  };

  const downloadCards = [
    {
      title: 'Mother Dairy Product Catalog',
      type: 'products',
      filename: 'mother_dairy_products_catalog.csv',
      desc: 'Complete catalog of all 18 dairy categories, SKU codes, pricing & shelf life.',
      icon: <Boxes className="w-6 h-6 text-[#1e3a1e]" />,
      badge: 'CSV / Excel'
    },
    {
      title: 'Stock Valuation & Inventory Levels',
      type: 'stock',
      filename: 'mother_dairy_stock_valuation.csv',
      desc: 'Live stock quantities on hand, reorder thresholds, inventory valuation in INR.',
      icon: <Database className="w-6 h-6 text-[#2d4a2d]" />,
      badge: 'Real-time Stock'
    },
    {
      title: 'Sales & POS Transaction Invoices',
      type: 'sales',
      filename: 'mother_dairy_sales_report.csv',
      desc: 'Detailed counter sales, customer names, payment modes, and gross revenue.',
      icon: <ShoppingCart className="w-6 h-6 text-[#3d6b3d]" />,
      badge: 'Sales Ledger'
    },
    {
      title: 'Bulk Orders Log (Purchases)',
      type: 'purchases',
      filename: 'mother_dairy_purchases_report.csv',
      desc: 'Supplier bulk orders, procurement costs, and invoices.',
      icon: <ShoppingBag className="w-6 h-6 text-[#1e3a1e]" />,
      badge: 'Procurement'
    },
    {
      title: 'Expiry Batches & Wastage Log',
      type: 'expiry',
      filename: 'mother_dairy_expiry_batches.csv',
      desc: 'Batch numbers, expiration dates, fresh vs expired counts & written-off units.',
      icon: <Clock className="w-6 h-6 text-[#6a9c6a]" />,
      badge: 'Quality & Expiry'
    },
    {
      title: 'Milk Production & Processing Log',
      type: 'production',
      filename: 'mother_dairy_production_log.csv',
      desc: 'Raw milk batch conversion into curd, paneer, ghee, butter with wastage.',
      icon: <Factory className="w-6 h-6 text-[#2d4a2d]" />,
      badge: 'Plant Operations'
    }
  ];

  const templateCards = [
    {
      title: 'Product Import Template',
      type: 'template-products',
      filename: 'products_import_template.csv',
      desc: 'Header template with sample products for bulk catalog creation.'
    },
    {
      title: 'Bulk Orders Template',
      type: 'template-purchases',
      filename: 'purchases_import_template.csv',
      desc: 'Template for uploading bulk orders and syncing stock automatically.'
    },
    {
      title: 'Sales Invoices Template',
      type: 'template-sales',
      filename: 'sales_import_template.csv',
      desc: 'Template for uploading bulk retail sales transactions.'
    }
  ];

  return (
    <div className="space-y-8 pb-12 font-sans">
      {/* Header Banner */}
      <div className="bg-white rounded-3xl p-6 sm:p-8 border border-[#a0c396]/30 shadow-soft relative overflow-hidden">
        <div className="absolute -right-10 -bottom-10 w-60 h-60 bg-[#ebf5eb] rounded-full blur-3xl pointer-events-none"></div>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-3 py-1 rounded-full bg-[#ebf5eb] text-[#1e3a1e] text-[11px] font-bold tracking-wider uppercase border border-[#a0c396]/40">
                Data Integration Center
              </span>
            </div>
            <h1 className="font-serif text-2xl sm:text-3xl font-bold text-[#1e3a1e] mt-2 tracking-tight">
              Download & Upload Hub
            </h1>
            <p className="text-xs sm:text-sm text-[#3f5a3f] mt-1 max-w-2xl">
              Export comprehensive dairy inventory ledgers in CSV/Excel, download bulk import templates, or upload datasets to update stock in seconds.
            </p>
          </div>

          {/* Tab Switcher */}
          <div className="flex items-center p-1.5 bg-[#f4f8f2] border border-[#a0c396]/40 rounded-2xl flex-shrink-0">
            <button
              onClick={() => setActiveTab('download')}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-xs transition-all cursor-pointer ${
                activeTab === 'download'
                  ? 'bg-[#1e3a1e] text-[#f8f5f0] shadow-md shadow-[#1e3a1e]/15'
                  : 'text-[#3f5a3f] hover:text-[#1e3a1e]'
              }`}
            >
              <Download className="w-4 h-4" />
              <span>Download Hub</span>
            </button>
            <button
              onClick={() => setActiveTab('upload')}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-xs transition-all cursor-pointer ${
                activeTab === 'upload'
                  ? 'bg-[#1e3a1e] text-[#f8f5f0] shadow-md shadow-[#1e3a1e]/15'
                  : 'text-[#3f5a3f] hover:text-[#1e3a1e]'
              }`}
            >
              <Upload className="w-4 h-4" />
              <span>Upload Hub</span>
            </button>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: DOWNLOAD HUB */}
      {/* ========================================================================= */}
      {activeTab === 'download' && (
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="space-y-8"
        >
          {/* Main Datasets Grid */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="font-serif text-lg font-bold text-[#1e3a1e]">
                  Export System Datasets
                </h2>
                <p className="text-xs text-[#3f5a3f]">Download full inventory, sales, purchases, and production logs.</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
              {downloadCards.map((card, idx) => (
                <div
                  key={idx}
                  className="bg-white p-5 rounded-3xl border border-[#a0c396]/30 shadow-soft hover:shadow-md hover:border-[#6a9c6a] transition-all flex flex-col justify-between group"
                >
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="p-3 rounded-2xl bg-[#ebf5eb] border border-[#a0c396]/30 group-hover:scale-105 transition-transform">
                        {card.icon}
                      </div>
                      <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-[#f4f8f2] text-[#1e3a1e] border border-[#a0c396]/40 uppercase tracking-wider">
                        {card.badge}
                      </span>
                    </div>

                    <div>
                      <h3 className="font-bold text-sm text-[#1e3a1e] group-hover:text-[#2d4a2d] transition-colors">
                        {card.title}
                      </h3>
                      <p className="text-xs text-[#3f5a3f] mt-1 leading-relaxed">
                        {card.desc}
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={() => handleDownload(card.type, card.filename)}
                    className="mt-4 w-full py-2.5 px-4 bg-[#f4f8f2] hover:bg-[#1e3a1e] text-[#1e3a1e] hover:text-white border border-[#a0c396]/40 hover:border-transparent rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer shadow-2xs"
                  >
                    <Download className="w-4 h-4" />
                    <span>Download CSV Report</span>
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Import Templates Section */}
          <div className="bg-[#f4f8f2] p-6 sm:p-7 rounded-3xl border border-[#a0c396]/40">
            <div className="flex items-center gap-2 mb-4">
              <FileSpreadsheet className="w-5 h-5 text-[#1e3a1e]" />
              <h2 className="font-serif text-lg font-bold text-[#1e3a1e]">
                Blank CSV Templates (For Bulk Upload)
              </h2>
            </div>
            <p className="text-xs text-[#3f5a3f] mb-5 max-w-xl">
              Use these pre-formatted templates to prepare your Excel/CSV sheets before uploading into the Upload Hub.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {templateCards.map((t, idx) => (
                <div key={idx} className="bg-white p-4 rounded-2xl border border-[#a0c396]/30 shadow-2xs flex flex-col justify-between">
                  <div>
                    <h4 className="font-bold text-xs text-[#1e3a1e]">{t.title}</h4>
                    <p className="text-[11px] text-[#3f5a3f] mt-1">{t.desc}</p>
                  </div>
                  <button
                    onClick={() => handleDownload(t.type, t.filename)}
                    className="mt-3 py-1.5 px-3 bg-[#ebf5eb] hover:bg-[#d8e8d8] text-[#1e3a1e] rounded-lg text-xs font-bold transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download Template</span>
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Admin Demo Management Actions */}
          {isAdmin && (
            <div className="space-y-4">
              {/* Wipe & Reset Stock Card */}
              <div className="bg-rose-50/70 p-6 rounded-3xl border border-rose-200 shadow-soft flex flex-col sm:flex-row items-center justify-between gap-4">
                <div>
                  <h3 className="font-bold text-sm text-rose-950 flex items-center gap-2">
                    <Trash2 className="w-4 h-4 text-rose-600" />
                    <span>Sab Zero Karein (Wipe Transactions & Set All Stock to 0)</span>
                  </h3>
                  <p className="text-xs text-rose-700 mt-0.5">
                    Delete all Sales, Purchases, Batches, Customer Feedbacks both online & offline, and reset all product quantities to 0. (Products catalog bacha rahega).
                  </p>
                </div>

                <div className="flex items-center gap-2.5 shrink-0">
                  <button
                    onClick={handleWipeAllTransactions}
                    disabled={isWipingTransactions}
                    className="px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-rose-600/20 flex items-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    <Trash2 className={`w-3.5 h-3.5 ${isWipingTransactions ? 'animate-spin' : ''}`} />
                    <span>{isWipingTransactions ? 'Wiping Everything...' : 'Wipe All Entries & Set Stock to 0'}</span>
                  </button>
                </div>
              </div>

              {/* Demo Products & Catalog Management */}
              <div className="bg-white p-6 rounded-3xl border border-[#a0c396]/30 shadow-soft flex flex-col sm:flex-row items-center justify-between gap-4">
                <div>
                  <h3 className="font-bold text-sm text-[#1e3a1e] flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-[#6a9c6a]" />
                    <span>Demo Products & Catalog Management</span>
                  </h3>
                  <p className="text-xs text-[#3f5a3f] mt-0.5">
                    Reload 27 authentic Mother Dairy products or reset sample records anytime.
                  </p>
                </div>

                <div className="flex items-center gap-2.5 shrink-0">
                  <button
                    onClick={handleSeedDemo}
                    disabled={isSeeding}
                    className="px-4 py-2 bg-[#1e3a1e] hover:bg-[#2d4a2d] text-white rounded-xl text-xs font-bold transition-all shadow-sm flex items-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isSeeding ? 'animate-spin' : ''}`} />
                    <span>{isSeeding ? 'Seeding...' : 'Load 27 Demo Products'}</span>
                  </button>

                  <button
                    onClick={handleClearDemo}
                    disabled={isClearing}
                    className="px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>{isClearing ? 'Clearing...' : 'Clear All Data'}</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </motion.div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: UPLOAD HUB */}
      {/* ========================================================================= */}
      {activeTab === 'upload' && (
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="space-y-6"
        >
          {/* 1. Target Selector & Template Download */}
          <div className="bg-white p-6 rounded-3xl border border-[#a0c396]/30 shadow-soft space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <label className="text-xs font-bold text-[#1e3a1e] uppercase tracking-wider block">
                  1. Select Target Dataset to Import
                </label>
                <p className="text-xs text-[#3f5a3f] mt-0.5">
                  Choose what type of dairy data you are importing.
                </p>
              </div>

              {/* Template Shortcut */}
              <button
                onClick={() => handleDownload(`template-${uploadType}`, `${uploadType}_template.csv`)}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-[#ebf5eb] hover:bg-[#d8e8d8] text-[#1e3a1e] border border-[#a0c396]/40 rounded-xl text-xs font-bold transition-colors cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download {uploadType.toUpperCase()} Template</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {[
                { id: 'products', label: '📦 Product Catalog', desc: 'Create products & initial inventory' },
                { id: 'purchases', label: '📥 Bulk Orders', desc: 'Add bulk stock & log supplier invoices' },
                { id: 'sales', label: '🛒 Sales Transactions', desc: 'Log customer orders & deduct stock' }
              ].map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => {
                    setUploadType(opt.id);
                    setParsedRows([]);
                    setFileName('');
                  }}
                  className={`p-4 rounded-2xl border text-left transition-all cursor-pointer ${
                    uploadType === opt.id
                      ? 'bg-[#ebf5eb] border-[#1e3a1e] ring-2 ring-[#1e3a1e]/20'
                      : 'bg-white border-[#a0c396]/30 hover:bg-[#f4f8f2]'
                  }`}
                >
                  <div className="font-bold text-xs text-[#1e3a1e]">{opt.label}</div>
                  <div className="text-[11px] text-[#3f5a3f] mt-0.5">{opt.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* 2. Drag & Drop File Zone */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragging(false);
              if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                handleFileUpload(e.dataTransfer.files[0]);
              }
            }}
            className={`border-2 border-dashed rounded-3xl p-8 sm:p-12 text-center transition-all bg-white ${
              isDragging
                ? 'border-[#1e3a1e] bg-[#ebf5eb]/50 scale-[1.01]'
                : 'border-[#a0c396]/60 hover:border-[#1e3a1e]'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.txt"
              onChange={(e) => {
                if (e.target.files && e.target.files[0]) {
                  handleFileUpload(e.target.files[0]);
                }
              }}
              className="hidden"
            />

            <div className="w-16 h-16 rounded-3xl bg-[#ebf5eb] text-[#1e3a1e] flex items-center justify-center text-2xl mx-auto shadow-sm mb-4">
              <UploadCloud className="w-8 h-8 text-[#1e3a1e]" />
            </div>

            <h3 className="font-serif text-lg font-bold text-[#1e3a1e]">
              Upload CSV File for {uploadType.toUpperCase()}
            </h3>
            <p className="text-xs text-[#3f5a3f] mt-1 max-w-md mx-auto">
              Drag & drop your CSV spreadsheet file here, or browse from your computer.
            </p>

            <button
              type="button"
              onClick={() => fileInputRef.current && fileInputRef.current.click()}
              className="mt-5 px-6 py-2.5 bg-[#1e3a1e] hover:bg-[#2d4a2d] text-white rounded-full text-xs font-bold transition-all shadow-md shadow-[#1e3a1e]/15 cursor-pointer inline-flex items-center gap-2"
            >
              <FileSpreadsheet className="w-4 h-4 text-[#9bc09b]" />
              <span>Browse CSV File</span>
            </button>

            {fileName && (
              <div className="mt-4 inline-flex items-center gap-2 px-3 py-1 bg-[#ebf5eb] border border-[#a0c396]/40 rounded-full text-xs font-bold text-[#1e3a1e]">
                <FileCheck className="w-3.5 h-3.5 text-[#6a9c6a]" />
                <span>Selected: {fileName}</span>
              </div>
            )}
          </div>

          {/* 3. Live Parsed Data Preview Table */}
          {parsedRows.length > 0 && (
            <div className="bg-white rounded-3xl border border-[#a0c396]/30 shadow-soft p-6 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#a0c396]/20 pb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-[#6a9c6a]" />
                    <h3 className="font-serif text-base font-bold text-[#1e3a1e]">
                      Data Preview ({parsedRows.length} Rows Ready)
                    </h3>
                  </div>
                  <p className="text-xs text-[#3f5a3f] mt-0.5">
                    Review parsed columns below before writing into MySQL database.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setParsedRows([]);
                      setFileName('');
                    }}
                    className="px-3 py-1.5 text-slate-500 hover:text-slate-700 text-xs font-bold transition-colors cursor-pointer"
                  >
                    Discard
                  </button>

                  <button
                    type="button"
                    onClick={handleConfirmImport}
                    disabled={isImporting}
                    className="px-5 py-2 bg-[#1e3a1e] hover:bg-[#2d4a2d] text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-[#1e3a1e]/15 flex items-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    <Check className="w-4 h-4" />
                    <span>{isImporting ? 'Importing...' : `Import ${parsedRows.length} Records to DB`}</span>
                  </button>
                </div>
              </div>

              {/* Scrollable Table Preview */}
              <div className="overflow-x-auto rounded-2xl border border-slate-100 max-h-80">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#f4f8f2] text-[#1e3a1e] font-bold sticky top-0 border-b border-[#a0c396]/30">
                    <tr>
                      <th className="p-3 w-12 text-center">#</th>
                      {headers.map((h, i) => (
                        <th key={i} className="p-3 whitespace-nowrap">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {parsedRows.slice(0, 15).map((row, rIdx) => (
                      <tr key={rIdx} className="hover:bg-slate-50 transition-colors">
                        <td className="p-3 text-center text-slate-400 font-mono text-[11px]">
                          {rIdx + 1}
                        </td>
                        {headers.map((h, cIdx) => (
                          <td key={cIdx} className="p-3 whitespace-nowrap text-slate-700 font-medium">
                            {row[h] || '-'}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {parsedRows.length > 15 && (
                <div className="text-center text-[11px] text-slate-400 font-bold">
                  Showing first 15 of {parsedRows.length} total rows.
                </div>
              )}
            </div>
          )}

          {/* Import Result Feedback Card */}
          {importResult && (
            <div className="bg-[#ebf5eb] p-5 rounded-2xl border border-[#a0c396]/50 flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-[#6a9c6a] flex-shrink-0 mt-0.5" />
              <div>
                <h4 className="font-bold text-xs text-[#1e3a1e]">
                  Import Batch Completed!
                </h4>
                <p className="text-xs text-[#3f5a3f] mt-0.5">
                  Successfully imported <strong>{importResult.successCount}</strong> records into MySQL database.
                </p>
                {importResult.failedCount > 0 && (
                  <div className="text-[11px] text-rose-600 mt-2 font-medium">
                    Skipped {importResult.failedCount} rows due to invalid columns.
                  </div>
                )}
              </div>
            </div>
          )}
        </motion.div>
      )}
    </div>
  );
};

export default DataHub;
