import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Menu, QrCode, Sparkles, Clock, Bell, Download, Smartphone, Plus, ShoppingCart } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

const Navbar = ({ onOpenMobileMenu }) => {
  const { user } = useAuth();
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    // Check if app is already running in standalone mode (installed PWA)
    if (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true) {
      setIsInstalled(true);
    }

    if (window.deferredPwaPrompt) {
      setDeferredPrompt(window.deferredPwaPrompt);
    }

    const handleBeforeInstall = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      window.deferredPwaPrompt = e;
    };

    const handlePromptAvailable = (e) => {
      if (e.detail) {
        setDeferredPrompt(e.detail);
      } else if (window.deferredPwaPrompt) {
        setDeferredPrompt(window.deferredPwaPrompt);
      }
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
      window.deferredPwaPrompt = null;
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    window.addEventListener('pwa-prompt-available', handlePromptAvailable);
    window.addEventListener('appinstalled', handleAppInstalled);
    window.addEventListener('pwa-app-installed', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
      window.removeEventListener('pwa-prompt-available', handlePromptAvailable);
      window.removeEventListener('appinstalled', handleAppInstalled);
      window.removeEventListener('pwa-app-installed', handleAppInstalled);
    };
  }, []);

  const handleInstallClick = async () => {
    const promptEvent = deferredPrompt || window.deferredPwaPrompt;
    if (promptEvent) {
      try {
        promptEvent.prompt();
        const choice = await promptEvent.userChoice;
        if (choice && choice.outcome === 'accepted') {
          setIsInstalled(true);
        }
        setDeferredPrompt(null);
        window.deferredPwaPrompt = null;
        return;
      } catch (err) {
        console.warn('[PWA] Direct prompt error, falling back to modal:', err);
      }
    }
    // Open install modal with platform-specific instructions or 1-tap retry
    window.dispatchEvent(new CustomEvent('open-pwa-install-modal'));
  };

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });

  return (
    <header className="sticky top-0 z-30 bg-white/90 backdrop-blur-md border-b border-[#a0c396]/30 px-4 sm:px-6 py-3.5 flex items-center justify-between gap-4 shadow-xs">
      {/* Mobile Hamburger & Breadcrumb */}
      <div className="flex items-center gap-3">
        <button
          onClick={onOpenMobileMenu}
          className="md:hidden p-2 rounded-xl text-[#2d4a2d] hover:bg-[#f4f8f2] transition-colors"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2">
          <img 
            src="/logo.png" 
            alt="Mother Dairy" 
            className="w-7 h-7 object-contain rounded-full shadow-2xs border border-[#a0c396]/40" 
          />
          <span className="text-xs font-bold text-[#1e3a1e] tracking-tight hidden sm:inline">
            Mother Dairy Rajajipuram •
          </span>
          <span className="text-xs text-[#3f5a3f] font-medium">
            {today}
          </span>
        </div>
      </div>

      {/* Right Controls: Stock Add, Sale, Install App & User Pill */}
      <div className="flex items-center gap-2 sm:gap-2.5">
        {/* Quick Stock Add Navbar Link */}
        <Link
          to="/stock?inward=true"
          className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-full text-xs font-black transition-all flex items-center gap-1 shadow-xs hover:scale-105 active:scale-95"
          title="Fast Stock Inward"
        >
          <Plus className="w-3.5 h-3.5 text-emerald-100 stroke-[3]" />
          <span>+ Stock Add</span>
        </Link>

        {/* Quick Sale Navbar Link */}
        <Link
          to="/sales?new=true"
          className="px-3 py-1.5 bg-[#1e3a1e] hover:bg-[#2d4a2d] text-white rounded-full text-xs font-black transition-all flex items-center gap-1 shadow-xs hover:scale-105 active:scale-95"
          title="New Sale Billing Counter"
        >
          <ShoppingCart className="w-3.5 h-3.5 text-emerald-300" />
          <span>Sale</span>
        </Link>

        {/* PWA Install Button */}
        {!isInstalled && (
          <button
            onClick={handleInstallClick}
            className="px-3 py-1.5 bg-[#f4f8f2] hover:bg-emerald-50 text-emerald-900 border border-emerald-300/80 rounded-full text-xs font-bold transition-all flex items-center gap-1.5 shadow-xs hover:scale-105 active:scale-95 hidden sm:flex"
            title="Install Mother Dairy Outlet PWA App on Phone or PC"
          >
            <Smartphone className="w-3.5 h-3.5 text-emerald-700" />
            <span>Install App</span>
          </button>
        )}

        {/* User Info Tag */}
        <div className="flex items-center gap-2 bg-[#f4f8f2] border border-[#a0c396]/40 py-1.5 px-3 rounded-full text-xs">
          <div className="w-6 h-6 rounded-full bg-[#1e3a1e] text-[#f8f5f0] flex items-center justify-center font-bold text-[10px]">
            {user?.name?.charAt(0)}
          </div>
          <span className="font-bold text-[#1e3a1e] hidden md:inline max-w-[120px] truncate">
            {user?.name}
          </span>
        </div>
      </div>
    </header>
  );
};

export default Navbar;
