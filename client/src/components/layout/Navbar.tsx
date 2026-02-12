import { Link, useLocation } from "wouter";
import { Search, User, LogOut, Menu, X, BarChart3, Layers, Newspaper, Crown, CalendarDays, KeyRound, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";
import { useState, useEffect, useRef, useCallback } from "react";
import { cn } from "@/lib/utils";
import { useMarketStatus } from "@/hooks/use-market";
import { useToast } from "@/hooks/use-toast";
import logoImg from "@/assets/logo.webp";

const ADMIN_ID = '54198443';

interface SearchResult {
  symbol: string;
  name: string;
  sector: string;
  industry: string;
}

export function Navbar() {
  const [location, setLocation] = useLocation();
  const { user, logout } = useAuth();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [mobileSearch, setMobileSearch] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [mobileResults, setMobileResults] = useState<SearchResult[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showPwDialog, setShowPwDialog] = useState(false);
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [pwLoading, setPwLoading] = useState(false);
  const { data: status } = useMarketStatus();
  const dropdownRef = useRef<HTMLDivElement>(null);
  const isFreeUser = !!(user as any)?._freeUser;
  const isAdmin = user?.id === ADMIN_ID;

  async function handlePasswordChange(e: React.FormEvent) {
    e.preventDefault();
    if (!currentPw || !newPw || newPw.length < 6) {
      toast({ title: "Password must be at least 6 characters", variant: "destructive" });
      return;
    }
    setPwLoading(true);
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: currentPw, newPassword: newPw }),
        credentials: 'include',
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: "Error", description: data.message, variant: "destructive" });
        return;
      }
      toast({ title: "Password updated" });
      setShowPwDialog(false);
      setCurrentPw('');
      setNewPw('');
    } catch {
      toast({ title: "Failed to change password", variant: "destructive" });
    } finally {
      setPwLoading(false);
    }
  }
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const mobileDebounceRef = useRef<ReturnType<typeof setTimeout>>();

  const fetchResults = useCallback(async (query: string) => {
    if (!query || query.length < 1) {
      setResults([]);
      setShowDropdown(false);
      return;
    }
    try {
      const res = await fetch(`/api/stocks/search?q=${encodeURIComponent(query)}`);
      const data = await res.json();
      setResults(data);
      setShowDropdown(data.length > 0);
      setSelectedIndex(-1);
    } catch {
      setResults([]);
    }
  }, []);

  const fetchMobileResults = useCallback(async (query: string) => {
    if (!query || query.length < 1) {
      setMobileResults([]);
      return;
    }
    try {
      const res = await fetch(`/api/stocks/search?q=${encodeURIComponent(query)}`);
      const data = await res.json();
      setMobileResults(data);
    } catch {
      setMobileResults([]);
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchResults(search);
    }, 150);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [search, fetchResults]);

  useEffect(() => {
    if (mobileDebounceRef.current) clearTimeout(mobileDebounceRef.current);
    mobileDebounceRef.current = setTimeout(() => {
      fetchMobileResults(mobileSearch);
    }, 150);
    return () => { if (mobileDebounceRef.current) clearTimeout(mobileDebounceRef.current); };
  }, [mobileSearch, fetchMobileResults]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location]);

  const selectStock = (symbol: string) => {
    setLocation(`/stocks/${symbol}`);
    setSearch("");
    setMobileSearch("");
    setShowDropdown(false);
    setResults([]);
    setMobileResults([]);
    setMobileMenuOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showDropdown || results.length === 0) {
      if (e.key === 'Enter' && search.trim()) {
        e.preventDefault();
        selectStock(search.toUpperCase());
      }
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => Math.min(prev + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => Math.max(prev - 1, -1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (selectedIndex >= 0 && selectedIndex < results.length) {
        selectStock(results[selectedIndex].symbol);
      } else if (search.trim()) {
        selectStock(search.toUpperCase());
      }
    } else if (e.key === 'Escape') {
      setShowDropdown(false);
    }
  };

  const navItems = [
    { label: "Capital Flow", href: "/", icon: BarChart3 },
    { label: "Megatrends", href: "/markets", icon: Layers },
    { label: "Leaders", href: "/leaders", icon: Crown },
    { label: "Earnings", href: "/earnings", icon: CalendarDays },
    { label: "News", href: "/news", icon: Newspaper },
  ];

  return (
    <>
      <nav className="glass sticky top-0 z-[999] h-14 w-full" data-testid="navbar">
        <div className="max-w-[1400px] mx-auto h-full px-3 sm:px-6 flex items-center justify-between gap-3 sm:gap-6">
          <div className="flex items-center gap-4 sm:gap-8">
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden text-white/50 min-w-[44px] min-h-[44px]"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              data-testid="button-mobile-menu"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </Button>

            <Link href="/" className="flex items-center gap-2.5 group" data-testid="link-home">
              <img src={logoImg} alt="TradeDeck" className="h-7 w-7 rounded flex-shrink-0" loading="eager" decoding="async" />
              <span className="font-semibold text-[15px] tracking-tight hidden md:block text-white/90">TradeDeck</span>
            </Link>

            <div className="hidden md:flex items-center gap-1">
              {navItems.map((item) => {
                const isActive = location === item.href || (item.href !== '/' && location.startsWith(item.href));
                return (
                  <Link key={item.href} href={item.href}>
                    <button
                      className={cn(
                        "px-3 py-1.5 rounded-md text-[13px] font-medium uppercase tracking-[0.1em] transition-all duration-200",
                        isActive
                          ? "text-white bg-white/10"
                          : "text-white/40 hover:text-white/70"
                      )}
                      data-testid={`nav-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
                    >
                      {item.label}
                    </button>
                  </Link>
                );
              })}
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3 flex-1 justify-end">
            <div className="flex items-center gap-2 mr-1 sm:mr-2">
              <div className={cn(
                "w-1.5 h-1.5 rounded-full",
                status?.isOpen ? "bg-[#30d158] animate-pulse" : "bg-[#ff453a]"
              )} />
              <span className="text-[11px] text-white/40 font-medium hidden sm:block">
                {status?.isOpen ? 'Market Open' : 'Market Closed'}
              </span>
            </div>

            <div className="relative w-full max-w-[280px] hidden sm:block" ref={dropdownRef}>
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30 z-10" />
              <Input
                ref={inputRef}
                placeholder="Search ticker..."
                className="pl-8 h-8 text-[13px] bg-[#1a1a1a] border-white/10 text-white placeholder:text-white/30 focus-visible:ring-white/20 focus-visible:border-white/20"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={handleKeyDown}
                onFocus={() => { if (results.length > 0) setShowDropdown(true); }}
                data-testid="input-search"
                autoComplete="off"
              />
              {showDropdown && results.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 rounded-lg border border-white/10 bg-[#1a1a1a] shadow-xl overflow-hidden z-[1000]" data-testid="search-results-dropdown">
                  {results.map((result, index) => (
                    <div
                      key={result.symbol}
                      className={cn(
                        "px-3 py-2.5 cursor-pointer flex items-center justify-between gap-3 transition-colors",
                        index === selectedIndex ? "bg-white/10" : "hover:bg-white/5"
                      )}
                      onClick={() => selectStock(result.symbol)}
                      data-testid={`search-result-${result.symbol}`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="text-[13px] font-semibold text-white font-mono-nums w-14 flex-shrink-0">{result.symbol}</span>
                        <span className="text-[12px] text-white/40 truncate">{result.name}</span>
                      </div>
                      <span className="text-[10px] text-white/20 flex-shrink-0 uppercase tracking-wider">{result.sector}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {user ? (
              <div className="flex items-center gap-1">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="rounded-full min-w-[44px] min-h-[44px] bg-white/5 border border-white/10 text-white/60 hover:text-white">
                      <User className="w-3.5 h-3.5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-52 bg-[#1a1a1a] border-white/10">
                    <DropdownMenuLabel>
                      <div className="flex flex-col space-y-1">
                        <p className="text-sm font-medium text-white">{user.firstName} {user.lastName}</p>
                        <p className="text-xs text-white/40">{user.email}</p>
                      </div>
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator className="bg-white/10" />
                    {isAdmin && (
                      <DropdownMenuItem className="text-white/60 hover:text-white focus:text-white" onClick={() => setLocation('/admin')} data-testid="menu-admin">
                        <Shield className="mr-2 h-3.5 w-3.5" />
                        Manage Users
                      </DropdownMenuItem>
                    )}
                    {isFreeUser && (
                      <DropdownMenuItem className="text-white/60 hover:text-white focus:text-white" onClick={() => setShowPwDialog(true)} data-testid="menu-change-password">
                        <KeyRound className="mr-2 h-3.5 w-3.5" />
                        Change Password
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem className="text-white/60 hover:text-white focus:text-white" onClick={() => logout()}>
                      <LogOut className="mr-2 h-3.5 w-3.5" />
                      Log out
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>

                <Dialog open={showPwDialog} onOpenChange={setShowPwDialog}>
                  <DialogContent className="bg-[#1a1a1a] border-white/10 sm:max-w-sm">
                    <DialogHeader>
                      <DialogTitle className="text-white">Change Password</DialogTitle>
                      <DialogDescription className="text-white/40">Enter your current and new password</DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handlePasswordChange} className="space-y-3">
                      <Input
                        type="password"
                        placeholder="Current password"
                        value={currentPw}
                        onChange={(e) => setCurrentPw(e.target.value)}
                        className="bg-white/5 border-white/10 text-white placeholder:text-white/30"
                        data-testid="input-current-password"
                      />
                      <Input
                        type="password"
                        placeholder="New password (min 6 characters)"
                        value={newPw}
                        onChange={(e) => setNewPw(e.target.value)}
                        className="bg-white/5 border-white/10 text-white placeholder:text-white/30"
                        data-testid="input-new-password"
                      />
                      <Button
                        type="submit"
                        className="w-full min-h-[44px]"
                        disabled={pwLoading || !currentPw || !newPw}
                        data-testid="button-save-password"
                      >
                        {pwLoading ? "Saving..." : "Update Password"}
                      </Button>
                    </form>
                  </DialogContent>
                </Dialog>
              </div>
            ) : (
              <a href="/api/login" data-testid="button-login">
                <Button size="sm" variant="outline" className="min-h-[44px] text-[13px] text-white/70 font-medium">
                  Log In
                </Button>
              </a>
            )}
          </div>
        </div>
      </nav>

      {mobileMenuOpen && (
        <div className="md:hidden fixed inset-x-0 top-14 bottom-0 z-[998] bg-background/95 backdrop-blur-xl" data-testid="mobile-menu">
          <div className="flex flex-col p-4 gap-2">
            <div className="relative mb-2">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30 z-10" />
              <Input
                placeholder="Search ticker..."
                className="pl-8 h-10 text-[14px] bg-white/5 border-white/10 text-white placeholder:text-white/30 focus-visible:ring-white/20"
                value={mobileSearch}
                onChange={(e) => setMobileSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && mobileSearch.trim()) {
                    e.preventDefault();
                    selectStock(mobileSearch.toUpperCase());
                  }
                }}
                data-testid="input-mobile-search"
                autoComplete="off"
                autoFocus
              />
            </div>

            {mobileResults.length > 0 && (
              <div className="rounded-lg border border-white/10 bg-[#1a1a1a] overflow-hidden mb-2" data-testid="mobile-search-results">
                {mobileResults.slice(0, 6).map((result) => (
                  <div
                    key={result.symbol}
                    className="px-3 py-3 cursor-pointer flex items-center justify-between gap-3 hover:bg-white/5 transition-colors"
                    onClick={() => selectStock(result.symbol)}
                    data-testid={`mobile-search-result-${result.symbol}`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="text-[14px] font-semibold text-white font-mono-nums w-14 flex-shrink-0">{result.symbol}</span>
                      <span className="text-[13px] text-white/40 truncate">{result.name}</span>
                    </div>
                    <span className="text-[11px] text-white/20 flex-shrink-0 uppercase tracking-wider">{result.sector}</span>
                  </div>
                ))}
              </div>
            )}

            {navItems.map((item) => {
              const isActive = location === item.href || (item.href !== '/' && location.startsWith(item.href));
              const Icon = item.icon;
              return (
                <Link key={item.href} href={item.href}>
                  <div
                    className={cn(
                      "flex items-center gap-3 px-4 py-3.5 rounded-lg transition-colors",
                      isActive
                        ? "bg-white/10 text-white"
                        : "text-white/50 hover:bg-white/5 hover:text-white/70"
                    )}
                    data-testid={`mobile-nav-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
                  >
                    <Icon className="w-5 h-5" />
                    <span className="text-[15px] font-medium">{item.label}</span>
                  </div>
                </Link>
              );
            })}

            {user && (
              <div className="border-t border-white/[0.06] mt-2 pt-3">
                <div className="px-4 py-2 text-[13px] text-white/40">
                  {user.firstName} {user.lastName}
                </div>
                <div
                  className="flex items-center gap-3 px-4 py-3 rounded-lg text-white/50 hover:bg-white/5 hover:text-white/70 cursor-pointer transition-colors"
                  onClick={() => { logout(); setMobileMenuOpen(false); }}
                  data-testid="mobile-nav-logout"
                >
                  <LogOut className="w-5 h-5" />
                  <span className="text-[15px] font-medium">Log out</span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
