import { Link, useLocation } from "wouter";
import { Search, Bell, User, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";
import { useState, useEffect, useRef, useCallback } from "react";
import { cn } from "@/lib/utils";
import { useMarketStatus } from "@/hooks/use-market";
import logoImg from "@assets/Screenshot_2026-02-06_alle_10.14.14_1770369914698.png";

interface SearchResult {
  symbol: string;
  name: string;
  sector: string;
  industry: string;
}

export function Navbar() {
  const [location, setLocation] = useLocation();
  const { user, logout } = useAuth();
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const { data: status } = useMarketStatus();
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

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

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchResults(search);
    }, 150);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [search, fetchResults]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectStock = (symbol: string) => {
    setLocation(`/stocks/${symbol}`);
    setSearch("");
    setShowDropdown(false);
    setResults([]);
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
    { label: "Dashboard", href: "/" },
    { label: "Themes", href: "/markets" },
  ];

  return (
    <nav className="glass sticky top-0 z-[999] h-14 w-full" data-testid="navbar">
      <div className="max-w-[1400px] mx-auto h-full px-6 flex items-center justify-between gap-6">
        <div className="flex items-center gap-8">
          <Link href="/" className="flex items-center gap-2.5 group" data-testid="link-home">
            <img src={logoImg} alt="TradeDeck" className="h-7 w-7 rounded flex-shrink-0" />
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
                    data-testid={`nav-${item.label.toLowerCase()}`}
                  >
                    {item.label}
                  </button>
                </Link>
              );
            })}
          </div>
        </div>

        <div className="flex items-center gap-3 flex-1 justify-end">
          <div className="flex items-center gap-2 mr-2">
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
              className="pl-8 h-8 text-[13px] bg-white/5 border-white/10 text-white placeholder:text-white/30 focus-visible:ring-white/20 focus-visible:border-white/20"
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
              <Button variant="ghost" size="icon" className="text-white/40 hover:text-white/70 h-8 w-8">
                <Bell className="w-4 h-4" />
              </Button>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="rounded-full w-8 h-8 bg-white/5 border border-white/10 text-white/60 hover:text-white">
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
                  <DropdownMenuItem className="text-white/60 hover:text-white focus:text-white" onClick={() => logout()}>
                    <LogOut className="mr-2 h-3.5 w-3.5" />
                    Log out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ) : (
            <a href="/api/login" data-testid="button-login">
              <Button size="sm" variant="outline" className="h-8 text-[13px] text-white/70 font-medium">
                Log In
              </Button>
            </a>
          )}
        </div>
      </div>
    </nav>
  );
}
