import { Link, useLocation } from "wouter";
import { Search, Bell, User, LogOut, LayoutDashboard, TrendingUp, Newspaper } from "lucide-react";
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
import { useState } from "react";
import { cn } from "@/lib/utils";
import { useMarketStatus } from "@/hooks/use-market";
import logoImg from "@assets/download_(3)_1770368859583.png";

export function Navbar() {
  const [location, setLocation] = useLocation();
  const { user, logout } = useAuth();
  const [search, setSearch] = useState("");
  const { data: status } = useMarketStatus();

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (search.trim()) {
      setLocation(`/stocks/${search.toUpperCase()}`);
      setSearch("");
    }
  };

  const navItems = [
    { label: "Dashboard", href: "/", icon: LayoutDashboard },
    { label: "Markets", href: "/markets", icon: TrendingUp },
    { label: "News", href: "/news", icon: Newspaper },
  ];

  return (
    <nav className="glass sticky top-0 z-[999] h-14 w-full" data-testid="navbar">
      <div className="max-w-[1400px] mx-auto h-full px-6 flex items-center justify-between gap-6">
        <div className="flex items-center gap-8">
          <Link href="/" className="flex items-center gap-2.5 group" data-testid="link-home">
            <div className="w-7 h-7 rounded overflow-hidden flex-shrink-0">
              <img src={logoImg} alt="TradeDeck" className="h-7 w-7 object-cover object-[25%_center]" />
            </div>
            <span className="font-semibold text-[15px] tracking-tight hidden md:block text-white/90">TradeDeck</span>
          </Link>

          <div className="hidden md:flex items-center gap-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = location === item.href || (item.href !== '/' && location.startsWith(item.href));
              return (
                <Link key={item.href} href={item.href}>
                  <button
                    className={cn(
                      "px-3 py-1.5 rounded-md text-[13px] font-medium flex items-center gap-2 transition-all duration-200",
                      isActive
                        ? "text-white bg-white/10"
                        : "text-white/50 hover:text-white/80"
                    )}
                    data-testid={`nav-${item.label.toLowerCase()}`}
                  >
                    <Icon className="w-3.5 h-3.5" />
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

          <form onSubmit={handleSearch} className="relative w-full max-w-[240px] hidden sm:block">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30" />
            <Input
              placeholder="Search ticker..."
              className="pl-8 h-8 text-[13px] bg-white/5 border-white/10 text-white placeholder:text-white/30 focus-visible:ring-[#0a84ff]/50 focus-visible:border-white/20"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              data-testid="input-search"
            />
          </form>

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
              <Button size="sm" className="h-8 text-[13px] bg-[#0a84ff] hover:bg-[#0a84ff]/80 text-white font-medium">
                Log In
              </Button>
            </a>
          )}
        </div>
      </div>
    </nav>
  );
}
