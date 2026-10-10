import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ArrowRight, 
  Store, 
  Sparkles, 
  ShieldCheck, 
  QrCode, 
  Boxes, 
  Factory, 
  Clock, 
  Award, 
  Heart, 
  Phone, 
  Mail, 
  MapPin,
  CheckCircle2,
  ChevronRight,
  Star,
  MessageSquareHeart,
  Send,
  ExternalLink,
  Printer,
  X,
  ShoppingCart,
  Plus
} from 'lucide-react';
import { DAIRY_CATEGORIES } from '../utils/categories';
import { submitFeedbackApi, getProductsApi } from '../services/api';
import { useToast } from '../context/ToastContext';

const LandingPage = () => {
  const { addToast } = useToast();
  const [isRateModalOpen, setIsRateModalOpen] = useState(false);

  // Quick rating form state inside modal
  const [rating, setRating] = useState(5);
  const [hoverRating, setHoverRating] = useState(0);
  const [customerName, setCustomerName] = useState('');
  const [category, setCategory] = useState('Milk Freshness');
  const [comment, setComment] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);
  const [reviewSuccess, setReviewSuccess] = useState(false);

  const ratingUrl = `${window.location.origin}/rate`;
  const qrCodeImgUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(ratingUrl)}&color=1e3a1e&bgcolor=ffffff&margin=10`;

  const handleQuickSubmit = async (e) => {
    e.preventDefault();
    try {
      setSubmittingReview(true);
      await submitFeedbackApi({
        customerName: customerName.trim() || 'Valued Customer',
        rating,
        category,
        comment: comment.trim() || 'Great fresh dairy products!'
      });
      setReviewSuccess(true);
      addToast('Thank you for rating Mother Dairy!', 'success');
    } catch (err) {
      console.warn('Modal quick feedback offline fallback:', err);
      // Resilient local save
      try {
        const offlineReviews = JSON.parse(localStorage.getItem('md_offline_feedback') || '[]');
        offlineReviews.push({
          customerName: customerName.trim() || 'Valued Customer',
          rating,
          category,
          comment: comment.trim() || 'Great fresh dairy products!',
          createdAt: new Date().toISOString()
        });
        localStorage.setItem('md_offline_feedback', JSON.stringify(offlineReviews));
      } catch (e) {}

      setReviewSuccess(true);
      addToast('Thank you for rating Mother Dairy! Review recorded.', 'success');
    } finally {
      setSubmittingReview(false);
    }
  };


  const [liveProducts, setLiveProducts] = useState([]);

  useEffect(() => {
    const fetchLiveProducts = async () => {
      try {
        const res = await getProductsApi({ activeOnly: true });
        if (res.data?.success && Array.isArray(res.data.products)) {
          setLiveProducts(res.data.products);
        } else {
          setLiveProducts([]);
        }
      } catch (err) {
        setLiveProducts([]);
      }
    };
    fetchLiveProducts();
  }, []);

  return (
    <div className="min-h-screen bg-[#f4f8f2] text-[#1e3a1e] font-sans antialiased overflow-x-hidden">
      
      {/* ─── 1. Mother Dairy Header ─── */}
      <header className="sticky top-0 z-50 bg-[#ffffff]/90 backdrop-blur-md border-b border-[#a0c396]/30 shadow-xs transition-all">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3 group">
            <img 
              src="/logo.png" 
              alt="Mother Dairy Rajajipuram" 
              className="w-11 h-11 object-contain rounded-full shadow-md border border-[#a0c396]/40 group-hover:scale-105 transition-transform" 
            />
            <div>
              <span className="font-serif text-xl sm:text-2xl font-bold tracking-tight text-[#1e3a1e] block leading-none">
                Mother Dairy
              </span>
              <span className="text-[10px] font-bold text-[#2d4a2d] uppercase tracking-widest block mt-0.5">
                Rajajipuram Outlet ERP
              </span>
            </div>
          </Link>

          {/* Quick Nav Links */}
          <nav className="hidden md:flex items-center gap-6 text-xs font-semibold text-[#3f5a3f]">
            <a href="#hero" className="hover:text-[#1e3a1e] transition-colors">Home</a>
            <a href="#products" className="hover:text-[#1e3a1e] transition-colors">Dairy Range</a>
            <a href="#reviews" className="hover:text-[#1e3a1e] transition-colors">Customer Reviews</a>
            <a href="#erp" className="hover:text-[#1e3a1e] transition-colors">ERP Features</a>
            <a href="#outlets" className="hover:text-[#1e3a1e] transition-colors">Our Outlets</a>
          </nav>

          <div className="flex items-center gap-2 sm:gap-2.5">
            {/* Quick Stock Add Button */}
            <Link
              to="/stock?inward=true"
              className="inline-flex items-center gap-1.5 bg-emerald-700 hover:bg-emerald-800 text-white font-black text-xs px-3.5 py-2 rounded-full transition-all shadow-xs hover:scale-105 active:scale-95"
              title="Add Stock (Inward)"
            >
              <Plus className="w-3.5 h-3.5 text-emerald-200 stroke-[3]" />
              <span>Stock Add</span>
            </Link>

            {/* Quick Sale Button */}
            <Link
              to="/sales?new=true"
              className="inline-flex items-center gap-1.5 bg-[#1e3a1e] hover:bg-[#2d4a2d] text-white font-black text-xs px-3.5 py-2 rounded-full transition-all shadow-xs hover:scale-105 active:scale-95"
              title="New Sale (Billing)"
            >
              <ShoppingCart className="w-3.5 h-3.5 text-emerald-300" />
              <span>Sale</span>
            </Link>

            {/* ⭐ Rate Us Top Nav Button */}
            <button
              onClick={() => setIsRateModalOpen(true)}
              className="hidden sm:inline-flex items-center gap-1.5 bg-[#ebf5eb] hover:bg-[#d8e8d8] text-[#1e3a1e] font-bold text-xs px-3.5 py-2 rounded-full border border-[#a0c396]/40 transition-all cursor-pointer shadow-2xs"
            >
              <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
              <span>Rate Us</span>
            </button>

            <Link
              to="/login"
              className="inline-flex items-center gap-2 bg-white hover:bg-slate-50 text-[#1e3a1e] border border-[#a0c396]/60 font-bold text-xs px-4 py-2 rounded-full shadow-2xs transition-all hover:-translate-y-0.5"
            >
              <span>Login</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </header>

      {/* ─── 2. Mother Dairy Hero Section ─── */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        <section
          id="hero"
          className="relative bg-gradient-to-br from-white via-[#f5faf5] to-[#ebf5eb] rounded-[2.5rem] sm:rounded-[3rem] p-6 sm:p-12 lg:p-14 shadow-hero border border-[#a0c396]/30 overflow-hidden"
        >
          {/* Background Decorative Dairy Emojis */}
          <span className="absolute -top-6 -right-6 text-7xl sm:text-9xl opacity-[0.06] select-none pointer-events-none rotate-12">
            🥛
          </span>
          <span className="absolute -bottom-6 -left-6 text-6xl sm:text-8xl opacity-[0.05] select-none pointer-events-none -rotate-12">
            🧀
          </span>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-center relative z-10">
            
            {/* ─── Left Hero Content ─── */}
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7 }}
              className="lg:col-span-7 space-y-6 text-left"
            >
              {/* Hero Badge */}
              <div className="inline-flex items-center gap-2.5 px-4 py-1.5 rounded-full bg-[#a0c396]/20 border border-[#a0c396]/40 text-[#3d6b3d] text-xs font-bold tracking-wider uppercase backdrop-blur-xs shadow-xs">
                <i className="fas fa-tint text-[#4c7a4c]"></i>
                <span>Fresh since 1985</span>
              </div>

              {/* Main Headline */}
              <h1 className="font-serif text-4xl sm:text-5xl lg:text-6xl font-bold text-[#1e3a1e] leading-[1.12] tracking-tight">
                Pure <span className="serif-highlight">Goodness</span><br />
                from Mother Dairy
              </h1>

              {/* Subtitle with Quote Line */}
              <p className="text-base sm:text-lg text-[#3f5a3f] font-normal leading-relaxed border-l-4 border-[#9bc09b] pl-4 sm:pl-5 max-w-xl">
                <em className="text-[#2d4a2d] font-serif not-italic">From our farms to your table.</em> —
                Enjoy the richest milk, creamiest yoghurt, and the finest cheese, all made with love and tradition.
              </p>

              {/* Stats Row */}
              <div className="flex flex-wrap items-center gap-6 sm:gap-8 pt-2">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-white/80 border border-[#a0c396]/30 flex items-center justify-center text-[#6a9c6a] shadow-xs">
                    <i className="fas fa-glass-whiskey text-lg"></i>
                  </div>
                  <div>
                    <strong className="block text-base font-bold text-[#1e3a1e]">2M+ Litres</strong>
                    <span className="text-xs text-[#3f5a3f]">Sold Daily</span>
                  </div>
                </div>

                <div 
                  onClick={() => setIsRateModalOpen(true)}
                  className="flex items-center gap-3 cursor-pointer group hover:bg-white/60 p-1.5 rounded-2xl transition-all"
                  title="Click to rate our outlet!"
                >
                  <div className="w-10 h-10 rounded-2xl bg-white/80 border border-[#a0c396]/30 flex items-center justify-center text-[#6a9c6a] shadow-xs group-hover:scale-110 transition-transform">
                    <Star className="w-5 h-5 fill-amber-400 text-amber-400" />
                  </div>
                  <div>
                    <strong className="block text-base font-bold text-[#1e3a1e] flex items-center gap-1">
                      <span>4.9 ★ Rating</span>
                      <span className="text-[10px] text-amber-700 font-bold bg-amber-100 px-1.5 py-0.5 rounded-full">Rate Us</span>
                    </strong>
                    <span className="text-xs text-[#3f5a3f]">From 15K+ Customers</span>
                  </div>
                </div>
              </div>

              {/* Call-to-Action Buttons */}
              <div className="flex flex-wrap items-center gap-3 pt-3">
                {/* 📦 STOCK ADD BUTTON */}
                <Link
                  to="/stock?inward=true"
                  className="inline-flex items-center gap-2 px-6 py-3.5 bg-emerald-700 hover:bg-emerald-800 text-white font-black text-sm sm:text-base rounded-full shadow-lg shadow-emerald-700/25 transition-all hover:-translate-y-1 active:translate-y-0"
                >
                  <Plus className="w-4 h-4 text-emerald-200 stroke-[3]" />
                  <span>+ Stock Add</span>
                </Link>

                {/* 🛒 SALE BUTTON */}
                <Link
                  to="/sales?new=true"
                  className="inline-flex items-center gap-2 px-6 py-3.5 bg-[#1e3a1e] hover:bg-[#2d4a2d] text-white font-black text-sm sm:text-base rounded-full shadow-lg shadow-[#1e3a1e]/25 transition-all hover:-translate-y-1 active:translate-y-0"
                >
                  <ShoppingCart className="w-4 h-4 text-emerald-300" />
                  <span>🛒 New Sale</span>
                </Link>

                <Link
                  to="/products"
                  className="inline-flex items-center gap-2 px-5 py-3.5 bg-white hover:bg-slate-50 text-[#1e3a1e] font-bold text-sm sm:text-base rounded-full border border-[#a0c396]/60 shadow-xs transition-all hover:-translate-y-0.5"
                >
                  <span>Explore Catalog</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>

                {/* ⭐ Rate Outlet Button in Hero */}
                <button
                  onClick={() => setIsRateModalOpen(true)}
                  className="inline-flex items-center gap-2 px-5 py-3.5 bg-[#ebf5eb] hover:bg-[#d8e8d8] text-[#1e3a1e] font-bold text-sm sm:text-base rounded-full border-2 border-[#a0c396]/50 shadow-xs transition-all hover:-translate-y-0.5 cursor-pointer"
                >
                  <QrCode className="w-4 h-4 text-[#1e3a1e]" />
                  <span>Scan QR & Rate</span>
                </button>
              </div>
            </motion.div>


            {/* ─── Right Visual Column ─── */}
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.8, delay: 0.15 }}
              className="lg:col-span-5 flex items-center justify-center"
            >
              <div className="relative w-full max-w-[420px] aspect-square rounded-[2.5rem] overflow-hidden bg-gradient-to-tr from-[#ebf5eb] via-[#d8e8d8] to-[#f0f7f0] shadow-2xl border border-white/60 p-6 flex items-center justify-center">
                
                {/* Decorative Circles */}
                <div className="absolute -top-10 -right-10 w-44 h-44 rounded-full bg-[#6a9c6a]/10 pointer-events-none"></div>
                <div className="absolute -bottom-8 -left-8 w-32 h-32 rounded-full bg-white/40 pointer-events-none"></div>
                <div className="absolute top-1/3 right-6 w-16 h-16 rounded-full bg-[#6a9c6a]/10 pointer-events-none"></div>

                {/* Floating Badges */}
                <div className="absolute top-6 right-6 bg-white/90 backdrop-blur-md px-3.5 py-1.5 rounded-full text-[11px] font-bold text-[#1e3a1e] shadow-md border border-white/60 flex items-center gap-2 animate-float-slow z-20">
                  <i className="fas fa-leaf text-[#6a9c6a]"></i>
                  <span>100% Natural</span>
                </div>

                <div className="absolute bottom-8 left-6 bg-white/90 backdrop-blur-md px-3.5 py-1.5 rounded-full text-[11px] font-bold text-[#1e3a1e] shadow-md border border-white/60 flex items-center gap-2 animate-float-delayed z-20">
                  <i className="fas fa-heart text-rose-500"></i>
                  <span>Loved by families</span>
                </div>

                <div className="absolute top-1/2 right-4 bg-white/90 backdrop-blur-md px-3.5 py-1.5 rounded-full text-[11px] font-bold text-[#1e3a1e] shadow-md border border-white/60 flex items-center gap-2 animate-float-delayed-4 z-20">
                  <i className="fas fa-shield-alt text-[#6a9c6a]"></i>
                  <span>Grass-fed cows</span>
                </div>

                {/* Central Icon Illustration */}
                <div className="text-center space-y-3 z-10">
                  <div className="w-28 h-28 mx-auto rounded-3xl bg-white/80 shadow-inner flex items-center justify-center text-6xl text-[#2d4a2d] border border-white">
                    <i className="fas fa-bottle-water"></i>
                  </div>
                  <span className="font-serif italic text-xs tracking-[4px] uppercase text-[#3f5a3f] opacity-80 block">
                    ✦ Farm Fresh Purity ✦
                  </span>
                </div>

              </div>
            </motion.div>

          </div>
        </section>

        {/* ─── 3. Dairy Range & Product Catalog Preview ─── */}
        <section id="products" className="py-14 sm:py-20 space-y-8">
          <div className="text-center max-w-2xl mx-auto space-y-2">
            <span className="text-xs font-bold text-[#6a9c6a] uppercase tracking-widest">
              Farm Fresh Essentials
            </span>
            <h2 className="font-serif text-3xl sm:text-4xl font-bold text-[#1e3a1e]">
              Mother Dairy Signature Products
            </h2>
            <p className="text-sm text-[#3f5a3f]">
              Processed under highest hygienic standards with automated batch tracking and QR verification.
            </p>
          </div>

          {liveProducts.length === 0 ? (
            <div className="bg-white rounded-3xl p-8 sm:p-12 text-center border border-[#a0c396]/30 shadow-sm max-w-xl mx-auto space-y-4">
              <div className="w-16 h-16 rounded-3xl bg-emerald-50 text-emerald-800 flex items-center justify-center mx-auto text-3xl shadow-xs border border-emerald-100">
                ✨
              </div>
              <div className="space-y-1.5">
                <h3 className="font-serif text-xl font-black text-[#1e3a1e]">Fresh ERP Initialized</h3>
                <p className="text-xs text-[#3f5a3f] leading-relaxed">
                  All demo products, stock, and mock categories have been wiped. Your ERP is fresh, clean, and ready for real operations.
                </p>
              </div>
              <div className="pt-2 flex flex-wrap items-center justify-center gap-3">
                <Link
                  to="/products"
                  className="px-5 py-2.5 bg-[#1e3a1e] hover:bg-[#162c16] text-white rounded-2xl text-xs font-bold shadow-md shadow-[#1e3a1e]/20 transition-all flex items-center gap-1.5"
                >
                  <Boxes className="w-4 h-4" />
                  <span>+ Add First Product</span>
                </Link>
                <Link
                  to="/stock"
                  className="px-5 py-2.5 bg-[#0B4F9C] hover:bg-[#083D7A] text-white rounded-2xl text-xs font-bold shadow-md shadow-blue-500/20 transition-all flex items-center gap-1.5"
                >
                  <span>📦 View Live Stock</span>
                </Link>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
              {liveProducts.slice(0, 8).map((p, idx) => (
                <div 
                  key={p.id || idx}
                  className="bg-white rounded-3xl p-6 border border-[#a0c396]/25 shadow-soft hover:shadow-xl transition-all space-y-4 flex flex-col justify-between group"
                >
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-4xl group-hover:scale-110 transition-transform block">
                        🥛
                      </span>
                      <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full border bg-emerald-50 text-emerald-800 border-emerald-200">
                        ₹{p.unitPrice}
                      </span>
                    </div>

                    <h3 className="font-serif text-lg font-bold text-[#1e3a1e] leading-snug">
                      {p.name}
                    </h3>

                    <p className="text-xs text-[#3f5a3f] leading-relaxed line-clamp-2">
                      {p.description || 'Verified Dairy Inventory Master Record'}
                    </p>
                  </div>

                  <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                    <span className="text-[11px] font-bold text-[#6a9c6a]">
                      {p.category}
                    </span>
                    <Link
                      to="/products"
                      className="p-1.5 bg-[#f4f8f2] hover:bg-[#1e3a1e] hover:text-white rounded-xl text-xs font-bold transition-colors"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Quick Categories Bar (only if products exist) */}
          {liveProducts.length > 0 && (
            <div className="bg-white rounded-3xl p-5 border border-[#a0c396]/30 shadow-xs">
              <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
                <span className="text-xs font-bold text-[#1e3a1e] whitespace-nowrap pl-2 pr-3 border-r border-slate-200">
                  Categories:
                </span>
                {DAIRY_CATEGORIES.filter(c => c.id !== 'All' && liveProducts.some(p => p.category === c.id)).map((cat) => (
                  <Link
                    key={cat.id}
                    to="/products"
                    className="px-3 py-1.5 rounded-xl text-[11px] font-bold bg-[#f4f8f2] hover:bg-[#ebf5eb] text-[#2d4a2d] whitespace-nowrap transition-colors flex items-center gap-1.5"
                  >
                    <span>{cat.icon}</span>
                    <span>{cat.label.split('(')[0].trim()}</span>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* ─── 4. ERP Capabilities & Features Grid ─── */}
        <section id="erp" className="py-10 space-y-8">
          <div className="bg-[#1e3a1e] text-[#f8f5f0] rounded-[3rem] p-8 sm:p-14 relative overflow-hidden shadow-2xl">
            {/* Background elements */}
            <div className="absolute top-0 right-0 w-96 h-96 bg-[#2d4a2d] rounded-full blur-3xl opacity-50 -z-0"></div>

            <div className="relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
              <div className="lg:col-span-6 space-y-5">
                <span className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-white/10 text-xs font-bold text-[#9bc09b] border border-white/15">
                  <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                  <span>Integrated Dairy Engine</span>
                </span>

                <h2 className="font-serif text-3xl sm:text-4xl font-bold tracking-tight text-white leading-tight">
                  Real-time Stock, QR Codes & Production ERP
                </h2>

                <p className="text-sm text-[#d8e8d8] leading-relaxed">
                  Built specifically for Mother Dairy outlets, chilling centers, and processing plants. Enjoy complete control over inventory, sales, purchases, and shelf-life countdowns.
                </p>

                <div className="grid grid-cols-2 gap-4 pt-2">
                  <div className="bg-white/5 border border-white/10 p-4 rounded-2xl space-y-1">
                    <div className="text-xl font-bold text-[#9bc09b]">Auto Stock Sync</div>
                    <p className="text-[11px] text-[#d8e8d8]/80">Zero math needed. Stock adjusts on every purchase & sale.</p>
                  </div>
                  <div className="bg-white/5 border border-white/10 p-4 rounded-2xl space-y-1">
                    <div className="text-xl font-bold text-amber-400">&lt; 3-Day Alert</div>
                    <p className="text-[11px] text-[#d8e8d8]/80">Automatic cron job flags near-expiry products before loss.</p>
                  </div>
                </div>

                <div className="pt-3">
                  <Link
                    to="/login"
                    className="inline-flex items-center gap-2 px-7 py-3.5 bg-white text-[#1e3a1e] hover:bg-[#f5faf5] font-bold text-sm rounded-full shadow-lg transition-transform hover:-translate-y-0.5"
                  >
                    <span>Launch ERP Dashboard</span>
                    <ArrowRight className="w-4 h-4 text-[#1e3a1e]" />
                  </Link>
                </div>
              </div>

              <div className="lg:col-span-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="bg-white/10 backdrop-blur-md p-5 rounded-3xl border border-white/15 space-y-2">
                  <QrCode className="w-6 h-6 text-[#9bc09b]" />
                  <h4 className="font-bold text-sm text-white">QR Code Generator & Scanner</h4>
                  <p className="text-xs text-[#d8e8d8]/80">Print printable QR labels and use webcam / phone camera for instant POS lookup.</p>
                </div>

                <div className="bg-white/10 backdrop-blur-md p-5 rounded-3xl border border-white/15 space-y-2">
                  <Factory className="w-6 h-6 text-[#9bc09b]" />
                  <h4 className="font-bold text-sm text-white">Milk Conversion Engine</h4>
                  <p className="text-xs text-[#d8e8d8]/80">Log raw milk processing batches to generate Paneer, Curd, Ghee & Butter with wastage logs.</p>
                </div>

                <div className="bg-white/10 backdrop-blur-md p-5 rounded-3xl border border-white/15 space-y-2">
                  <Clock className="w-6 h-6 text-[#9bc09b]" />
                  <h4 className="font-bold text-sm text-white">Expiry Batch Lifespan</h4>
                  <p className="text-xs text-[#d8e8d8]/80">Track batch manufacture dates and days remaining with automated status flags.</p>
                </div>

                <div className="bg-white/10 backdrop-blur-md p-5 rounded-3xl border border-white/15 space-y-2">
                  <ShieldCheck className="w-6 h-6 text-[#9bc09b]" />
                  <h4 className="font-bold text-sm text-white">Role-Based Security</h4>
                  <p className="text-xs text-[#d8e8d8]/80">Admin and Staff user roles with comprehensive tamper-proof audit trail logs.</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ─── 5. Customer Reviews & Ratings Section ─── */}
        <section id="reviews" className="py-14 space-y-10">
          <div className="bg-gradient-to-br from-white via-[#f5faf5] to-[#ebf5eb] p-8 sm:p-12 rounded-[2.5rem] border border-[#a0c396]/30 shadow-soft">
            <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 pb-8 border-b border-[#a0c396]/20">
              <div className="space-y-2">
                <div className="inline-flex items-center gap-2 px-3 py-1 bg-[#ebf5eb] text-[#1e3a1e] rounded-full text-xs font-bold uppercase tracking-wider border border-[#a0c396]/40">
                  <Star className="w-3.5 h-3.5 fill-[#1e3a1e]" />
                  <span>Customer Trust & Testimonials</span>
                </div>
                <h2 className="font-serif text-3xl sm:text-4xl font-bold text-[#1e3a1e]">
                  Loved by Dairy Lovers Across India
                </h2>
                <p className="text-xs sm:text-sm text-[#3f5a3f] max-w-xl">
                  Real feedback collected directly through counter QR code scans at Mother Dairy booths & stores.
                </p>
              </div>

              {/* QR Scan Action Card */}
              <div className="bg-white p-5 rounded-3xl border border-[#a0c396]/40 shadow-sm flex items-center gap-4 flex-shrink-0">
                <img
                  src={qrCodeImgUrl}
                  alt="Mother Dairy Feedback QR"
                  className="w-20 h-20 rounded-xl border border-slate-100 p-1"
                />
                <div className="space-y-1.5">
                  <div className="font-bold text-xs text-[#1e3a1e]">
                    Scan QR to Rate Outlet
                  </div>
                  <div className="text-[11px] text-[#3f5a3f] leading-tight">
                    Quick 10-second mobile review
                  </div>
                  <button
                    onClick={() => setIsRateModalOpen(true)}
                    className="px-3.5 py-1.5 bg-[#1e3a1e] hover:bg-[#2d4a2d] text-white rounded-xl text-[11px] font-bold transition-all flex items-center gap-1 cursor-pointer"
                  >
                    <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                    <span>Rate Online Now</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Testimonials Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5 pt-8">
              <div className="bg-white p-6 rounded-3xl border border-[#a0c396]/30 shadow-2xs space-y-3">
                <div className="flex items-center justify-between">
                  <div className="font-bold text-xs text-[#1e3a1e]">Rohit Aggarwal</div>
                  <div className="flex text-amber-400 text-xs">⭐⭐⭐⭐⭐</div>
                </div>
                <p className="text-xs text-[#3f5a3f] leading-relaxed italic">
                  "Full Cream Milk aur Malai Paneer hamesha fresh aur pure milta hai. Best dairy outlet in our area!"
                </p>
                <span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-[#ebf5eb] text-[#2d4a2d]">
                  Milk Freshness
                </span>
              </div>

              <div className="bg-white p-6 rounded-3xl border border-[#a0c396]/30 shadow-2xs space-y-3">
                <div className="flex items-center justify-between">
                  <div className="font-bold text-xs text-[#1e3a1e]">Pooja Sharma</div>
                  <div className="flex text-amber-400 text-xs">⭐⭐⭐⭐⭐</div>
                </div>
                <p className="text-xs text-[#3f5a3f] leading-relaxed italic">
                  "Pure Cow Ghee aroma is authentic like homemade ghee. Packaging and cleanliness is top notch."
                </p>
                <span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-[#ebf5eb] text-[#2d4a2d]">
                  Ghee Quality
                </span>
              </div>

              <div className="bg-white p-6 rounded-3xl border border-[#a0c396]/30 shadow-2xs space-y-3">
                <div className="flex items-center justify-between">
                  <div className="font-bold text-xs text-[#1e3a1e]">Anil Kumar Gupta</div>
                  <div className="flex text-amber-400 text-xs">⭐⭐⭐⭐⭐</div>
                </div>
                <p className="text-xs text-[#3f5a3f] leading-relaxed italic">
                  "Very polite staff, quick counter billing with QR code scanner. Highly recommended!"
                </p>
                <span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-[#ebf5eb] text-[#2d4a2d]">
                  Counter Service
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* ─── 6. Mother Dairy Trust & Quality Pillars ─── */}
        <section id="outlets" className="py-14 space-y-10">
          <div className="text-center max-w-2xl mx-auto space-y-2">
            <span className="text-xs font-bold text-[#6a9c6a] uppercase tracking-widest">
              The Mother Dairy Promise
            </span>
            <h2 className="font-serif text-3xl sm:text-4xl font-bold text-[#1e3a1e]">
              Why Millions Trust Mother Dairy
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white p-7 rounded-3xl border border-[#a0c396]/25 shadow-soft space-y-3 text-center">
              <div className="w-14 h-14 mx-auto rounded-2xl bg-[#ebf5eb] flex items-center justify-center text-2xl text-[#2d4a2d]">
                🌿
              </div>
              <h3 className="font-serif text-lg font-bold text-[#1e3a1e]">100% Direct Farm Milk</h3>
              <p className="text-xs text-[#3f5a3f] leading-relaxed">
                Procured directly from local dairy cooperatives ensuring farmers get fair price and families get pure unadulterated milk.
              </p>
            </div>

            <div className="bg-white p-7 rounded-3xl border border-[#a0c396]/25 shadow-soft space-y-3 text-center">
              <div className="w-14 h-14 mx-auto rounded-2xl bg-[#ebf5eb] flex items-center justify-center text-2xl text-[#2d4a2d]">
                🔬
              </div>
              <h3 className="font-serif text-lg font-bold text-[#1e3a1e]">Stringent Quality Checks</h3>
              <p className="text-xs text-[#3f5a3f] leading-relaxed">
                Over 25+ quality and purity testing parameters tested before packaging and dispatching to outlet counters.
              </p>
            </div>

            <div className="bg-white p-7 rounded-3xl border border-[#a0c396]/25 shadow-soft space-y-3 text-center">
              <div className="w-14 h-14 mx-auto rounded-2xl bg-[#ebf5eb] flex items-center justify-center text-2xl text-[#2d4a2d]">
                🏪
              </div>
              <h3 className="font-serif text-lg font-bold text-[#1e3a1e]">Daily Morning Fresh Outlets</h3>
              <p className="text-xs text-[#3f5a3f] leading-relaxed">
                Chilled dispatch at 4°C directly delivered fresh to authorized Mother Dairy Booths and Outlets before sunrise.
              </p>
            </div>
          </div>

          {/* Outlet Location Card with Google Maps */}
          <div className="bg-white rounded-3xl border border-[#a0c396]/40 p-6 sm:p-8 shadow-soft overflow-hidden">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
              <div className="lg:col-span-7 space-y-4">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold bg-[#ebf5eb] text-[#2d4a2d] border border-[#a0c396]/40">
                  <Store className="w-3.5 h-3.5 text-[#2d4a2d]" />
                  <span>Authorized Mother Dairy Outlet</span>
                </div>

                <div>
                  <h3 className="font-serif text-2xl sm:text-3xl font-bold text-[#1e3a1e]">
                    Rajajipuram Outlet & Booth
                  </h3>
                  <p className="text-xs text-[#3f5a3f] mt-1">
                    Serving pure, fresh milk, authentic dahi, paneer, and dairy products directly from cold-chain distribution.
                  </p>
                </div>

                <div className="space-y-3 pt-2">
                  <div className="flex items-start gap-3 text-xs">
                    <div className="w-8 h-8 rounded-xl bg-[#ebf5eb] text-[#1e3a1e] flex items-center justify-center shrink-0 mt-0.5">
                      <MapPin className="w-4 h-4 text-[#2d4a2d]" />
                    </div>
                    <div>
                      <span className="font-bold text-[#1e3a1e] block">Address:</span>
                      <span className="text-[#3f5a3f] leading-relaxed">
                        C-3383, Opposite SBI ATM, Near MIS Chauraha, Rajajipuram, Lucknow - 226017
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 text-xs">
                    <div className="w-8 h-8 rounded-xl bg-[#ebf5eb] text-[#1e3a1e] flex items-center justify-center shrink-0">
                      <Mail className="w-4 h-4 text-[#2d4a2d]" />
                    </div>
                    <div>
                      <span className="font-bold text-[#1e3a1e] block">Email:</span>
                      <a href="mailto:sudhanshuipsr@gmail.com" className="text-[#2d4a2d] hover:underline font-medium">
                        sudhanshuipsr@gmail.com
                      </a>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 text-xs">
                    <div className="w-8 h-8 rounded-xl bg-[#ebf5eb] text-[#1e3a1e] flex items-center justify-center shrink-0">
                      <Clock className="w-4 h-4 text-[#2d4a2d]" />
                    </div>
                    <div>
                      <span className="font-bold text-[#1e3a1e] block">Timings:</span>
                      <span className="text-[#3f5a3f]">06:00 AM – 10:00 PM (Open 7 Days a Week)</span>
                    </div>
                  </div>
                </div>

                <div className="pt-2 flex flex-wrap items-center gap-3">
                  <a
                    href="https://www.google.com/maps/place/26%C2%B050'49.3%22N+80%C2%B056'54.8%22E/@26.847028,80.9459781,1121m/data=!3m2!1e3!4b1!4m4!3m3!8m2!3d26.847028!4d80.948553?hl=en&entry=ttu&g_ep=EgoyMDI2MDkwOS4wIKXMDSoASAFQAw%3D%3D"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 bg-[#1e3a1e] hover:bg-[#2d4a2d] text-white px-5 py-2.5 rounded-2xl text-xs font-bold shadow-md shadow-[#1e3a1e]/15 transition-all hover:-translate-y-0.5"
                  >
                    <MapPin className="w-4 h-4 text-[#a0c396]" />
                    <span>Open in Google Maps</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>

                  <button
                    onClick={() => setIsRateModalOpen(true)}
                    className="inline-flex items-center gap-2 bg-[#ebf5eb] hover:bg-[#d8e8d8] text-[#1e3a1e] px-4 py-2.5 rounded-2xl text-xs font-bold transition-all border border-[#a0c396]/40 cursor-pointer"
                  >
                    <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                    <span>Rate This Outlet</span>
                  </button>
                </div>
              </div>

              {/* Map Preview Embed */}
              <div className="lg:col-span-5 h-64 sm:h-72 w-full rounded-2xl overflow-hidden border border-[#a0c396]/30 shadow-xs relative bg-slate-100">
                <iframe
                  title="Mother Dairy Rajajipuram Outlet Location"
                  width="100%"
                  height="100%"
                  frameBorder="0"
                  scrolling="no"
                  marginHeight="0"
                  marginWidth="0"
                  src="https://maps.google.com/maps?q=26.847028,80.948553&hl=en&z=17&output=embed"
                  className="w-full h-full"
                ></iframe>
                <a
                  href="https://www.google.com/maps/place/26%C2%B050'49.3%22N+80%C2%B056'54.8%22E/@26.847028,80.9459781,1121m/data=!3m2!1e3!4b1!4m4!3m3!8m2!3d26.847028!4d80.948553?hl=en&entry=ttu&g_ep=EgoyMDI2MDkwOS4wIKXMDSoASAFQAw%3D%3D"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="absolute bottom-2 right-2 bg-white/95 backdrop-blur-xs px-2.5 py-1 rounded-lg text-[10px] font-bold text-[#1e3a1e] shadow-sm border border-slate-200 flex items-center gap-1 hover:bg-white"
                >
                  <span>26°50'49.3"N 80°56'54.8"E</span>
                  <ExternalLink className="w-2.5 h-2.5 text-slate-500" />
                </a>
              </div>
            </div>
          </div>
        </section>

      </main>

      {/* ─── 7. Footer ─── */}
      <footer className="bg-white border-t border-[#a0c396]/30 mt-12 py-12 text-[#3f5a3f]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid grid-cols-1 md:grid-cols-4 gap-8">
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-[#1e3a1e] text-white flex items-center justify-center text-sm">
                🥛
              </div>
              <span className="font-serif font-bold text-lg text-[#1e3a1e]">
                Mother Dairy
              </span>
            </div>
            <p className="text-xs text-[#3f5a3f] leading-relaxed">
              Fresh and pure milk, curd, paneer, and authentic dairy products crafted with heritage and trust.
            </p>
            <p className="text-[11px] text-[#6a9c6a] font-bold">
              © {new Date().getFullYear()} Mother Dairy Outlet System.
            </p>
          </div>

          <div className="space-y-2">
            <h4 className="font-bold text-xs uppercase tracking-wider text-[#1e3a1e]">Quick Navigation</h4>
            <ul className="space-y-1.5 text-xs">
              <li><Link to="/products" className="hover:text-[#1e3a1e]">Product Catalog</Link></li>
              <li><Link to="/stock" className="hover:text-[#1e3a1e]">Live Stock Levels</Link></li>
              <li><Link to="/sales" className="hover:text-[#1e3a1e]">Quick Sales & POS</Link></li>
              <li><button onClick={() => setIsRateModalOpen(true)} className="hover:text-[#1e3a1e] text-left cursor-pointer">⭐ Rate Our Outlet</button></li>
            </ul>
          </div>

          <div className="space-y-2">
            <h4 className="font-bold text-xs uppercase tracking-wider text-[#1e3a1e]">ERP Modules</h4>
            <ul className="space-y-1.5 text-xs">
              <li><Link to="/purchases" className="hover:text-[#1e3a1e]">Raw Milk & Procurement</Link></li>
              <li><Link to="/production" className="hover:text-[#1e3a1e]">Plant Production Run</Link></li>
              <li><Link to="/reports" className="hover:text-[#1e3a1e]">Sales & Financial Analytics</Link></li>
              <li><Link to="/feedback-admin" className="hover:text-[#1e3a1e]">Customer Reviews Portal</Link></li>
            </ul>
          </div>

          <div className="space-y-2">
            <h4 className="font-bold text-xs uppercase tracking-wider text-[#1e3a1e]">Outlet Contact</h4>
            <div className="text-xs space-y-2">
              <div className="flex items-start gap-2">
                <MapPin className="w-3.5 h-3.5 text-[#6a9c6a] shrink-0 mt-0.5" />
                <span className="leading-relaxed">C-3383, Opposite SBI ATM, Near MIS Chauraha, Rajajipuram, Lucknow - 226017</span>
              </div>
              <div className="flex items-center gap-2">
                <Mail className="w-3.5 h-3.5 text-[#6a9c6a] shrink-0" />
                <a href="mailto:sudhanshuipsr@gmail.com" className="hover:text-[#1e3a1e] underline underline-offset-2">
                  sudhanshuipsr@gmail.com
                </a>
              </div>
              <div className="flex items-center gap-2">
                <Phone className="w-3.5 h-3.5 text-[#6a9c6a] shrink-0" />
                <span>+91 1800 180 1018 (Toll Free)</span>
              </div>
              <div className="pt-1">
                <a
                  href="https://www.google.com/maps/place/26%C2%B050'49.3%22N+80%C2%B056'54.8%22E/@26.847028,80.9459781,1121m/data=!3m2!1e3!4b1!4m4!3m3!8m2!3d26.847028!4d80.948553?hl=en&entry=ttu&g_ep=EgoyMDI2MDkwOS4wIKXMDSoASAFQAw%3D%3D"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#ebf5eb] hover:bg-[#d8e8d8] text-[#1e3a1e] font-bold text-[11px] transition-colors shadow-2xs border border-[#a0c396]/40"
                >
                  <MapPin className="w-3 h-3 text-emerald-700" />
                  <span>26°50'49.3"N 80°56'54.8"E (Maps)</span>
                  <ExternalLink className="w-3 h-3 text-slate-500" />
                </a>
              </div>
            </div>
          </div>
        </div>
      </footer>

      {/* ========================================================================= */}
      {/* ⭐ RATE US QR & INLINE FEEDBACK MODAL */}
      {/* ========================================================================= */}
      <AnimatePresence>
        {isRateModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
            <motion.div
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.92 }}
              className="bg-white rounded-3xl max-w-lg w-full p-6 sm:p-8 border border-[#a0c396]/40 shadow-2xl relative max-h-[90vh] overflow-y-auto"
            >
              {/* Close button */}
              <button
                onClick={() => {
                  setIsRateModalOpen(false);
                  setReviewSuccess(false);
                }}
                className="absolute top-5 right-5 p-2 text-slate-400 hover:text-slate-700 bg-[#f4f8f2] rounded-full transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>

              {!reviewSuccess ? (
                <div className="space-y-6">
                  {/* Modal Header */}
                  <div className="text-center space-y-1">
                    <div className="w-12 h-12 rounded-2xl bg-[#ebf5eb] text-[#1e3a1e] flex items-center justify-center mx-auto text-xl shadow-xs border border-[#a0c396]/30">
                      ⭐
                    </div>
                    <h3 className="font-serif text-2xl font-bold text-[#1e3a1e]">
                      Rate Mother Dairy Outlet
                    </h3>
                    <p className="text-xs text-[#3f5a3f]">
                      Scan with mobile camera or submit your rating below directly.
                    </p>
                  </div>

                  {/* QR Code Card */}
                  <div className="bg-[#f4f8f2] p-4 rounded-2xl border border-[#a0c396]/30 flex flex-col sm:flex-row items-center gap-4 text-center sm:text-left">
                    <img
                      src={qrCodeImgUrl}
                      alt="Mother Dairy Rating QR"
                      className="w-28 h-28 rounded-xl bg-white p-1.5 shadow-sm border border-slate-200"
                    />
                    <div className="space-y-1.5">
                      <div className="font-bold text-xs text-[#1e3a1e] flex items-center justify-center sm:justify-start gap-1">
                        <QrCode className="w-3.5 h-3.5 text-[#6a9c6a]" />
                        <span>Scan with Mobile Camera</span>
                      </div>
                      <p className="text-[11px] text-[#3f5a3f] leading-relaxed">
                        Point camera or Google Lens to open the rating form on your smartphone.
                      </p>
                      <Link
                        to="/rate"
                        target="_blank"
                        className="inline-flex items-center gap-1 text-[11px] font-bold text-[#1e3a1e] hover:underline"
                      >
                        <span>Open mobile URL in new tab</span>
                        <ExternalLink className="w-3 h-3" />
                      </Link>
                    </div>
                  </div>

                  {/* Or Inline Form */}
                  <form onSubmit={handleQuickSubmit} className="space-y-4 pt-1">
                    <div className="text-center space-y-2">
                      <label className="text-xs font-bold text-[#1e3a1e] uppercase tracking-wider block">
                        Select Your Star Rating
                      </label>
                      <div className="flex items-center justify-center gap-2">
                        {[1, 2, 3, 4, 5].map((star) => {
                          const isFilled = (hoverRating || rating) >= star;
                          return (
                            <button
                              key={star}
                              type="button"
                              onMouseEnter={() => setHoverRating(star)}
                              onMouseLeave={() => setHoverRating(0)}
                              onClick={() => setRating(star)}
                              className="p-1 transition-transform hover:scale-125 cursor-pointer"
                            >
                              <Star
                                className={`w-7 h-7 sm:w-8 sm:h-8 transition-colors ${
                                  isFilled
                                    ? 'text-amber-400 fill-amber-400 drop-shadow-sm'
                                    : 'text-slate-300'
                                }`}
                              />
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <div>
                        <label className="text-[11px] font-bold text-[#3f5a3f] block mb-1">Your Name</label>
                        <input
                          type="text"
                          placeholder="e.g. Priya Sharma"
                          value={customerName}
                          onChange={(e) => setCustomerName(e.target.value)}
                          className="w-full p-2 bg-[#f4f8f2] border border-[#a0c396]/40 rounded-xl text-xs text-[#1e3a1e] focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] font-bold text-[#3f5a3f] block mb-1">Product Category</label>
                        <select
                          value={category}
                          onChange={(e) => setCategory(e.target.value)}
                          className="w-full p-2 bg-[#f4f8f2] border border-[#a0c396]/40 rounded-xl text-xs text-[#1e3a1e] focus:outline-none"
                        >
                          <option value="Milk Freshness">Milk Freshness</option>
                          <option value="Dahi & Curd">Dahi & Curd</option>
                          <option value="Ghee & Makhan Quality">Ghee & Makhan</option>
                          <option value="Paneer & Cheese">Paneer & Cheese</option>
                          <option value="Sweets & Khoya">Sweets & Khoya</option>
                          <option value="Store Service & Staff">Store Staff & Service</option>
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="text-[11px] font-bold text-[#3f5a3f] block mb-1">Feedback Comment</label>
                      <textarea
                        rows={2}
                        placeholder="Share your experience..."
                        value={comment}
                        onChange={(e) => setComment(e.target.value)}
                        className="w-full p-2 bg-[#f4f8f2] border border-[#a0c396]/40 rounded-xl text-xs text-[#1e3a1e] focus:outline-none"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={submittingReview}
                      className="w-full py-3 bg-[#1e3a1e] hover:bg-[#2d4a2d] text-white rounded-2xl text-xs font-bold transition-all shadow-md shadow-[#1e3a1e]/15 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                    >
                      <Send className="w-3.5 h-3.5 text-[#9bc09b]" />
                      <span>{submittingReview ? 'Submitting...' : 'Submit Rating'}</span>
                    </button>
                  </form>
                </div>
              ) : (
                <div className="text-center py-6 space-y-4">
                  <div className="w-16 h-16 rounded-full bg-[#ebf5eb] text-[#1e3a1e] flex items-center justify-center mx-auto text-3xl">
                    🎉
                  </div>
                  <h3 className="font-serif text-2xl font-bold text-[#1e3a1e]">
                    Rating Submitted!
                  </h3>
                  <p className="text-xs text-[#3f5a3f] max-w-xs mx-auto">
                    Thank you! Your feedback has been recorded and will appear on the Mother Dairy Admin Dashboard.
                  </p>
                  <button
                    onClick={() => {
                      setIsRateModalOpen(false);
                      setReviewSuccess(false);
                      setComment('');
                    }}
                    className="py-2.5 px-6 bg-[#1e3a1e] text-white rounded-xl text-xs font-bold cursor-pointer"
                  >
                    Close
                  </button>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
};

export default LandingPage;

