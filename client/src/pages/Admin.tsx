import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { Navbar } from "@/components/layout/Navbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Trash2, UserPlus, ArrowLeft, Mail, User, Shield, Users, Copy, Download } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

const ADMIN_ID = '54198443';

interface FreeUserEntry {
  id: number;
  name: string;
  email: string;
  createdAt: string;
}

interface WaitlistEntry {
  id: number;
  email: string;
  createdAt: string;
}

export default function Admin() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');

  const isAdminUser = user?.id === ADMIN_ID;

  const { data: freeUsers = [], isLoading } = useQuery<FreeUserEntry[]>({
    queryKey: ['/api/admin/free-users'],
    enabled: isAdminUser,
  });

  const { data: waitlistEntries = [], isLoading: waitlistLoading } = useQuery<WaitlistEntry[]>({
    queryKey: ['/api/admin/waitlist'],
    enabled: isAdminUser,
  });

  const addMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/admin/free-users', { name: name.trim(), email: email.trim() });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/free-users'] });
      setName('');
      setEmail('');
      toast({ title: "User added", description: `${email.trim()} now has free access (password: tradedeck)` });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message || "Failed to add user", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest('DELETE', `/api/admin/free-users/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/free-users'] });
      toast({ title: "User removed" });
    },
  });

  if (!isAdminUser) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-white/40">Admin access required</p>
      </div>
    );
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim()) return;
    addMutation.mutate();
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />
      <main className="flex-1">
        <div className="max-w-[800px] mx-auto px-3 sm:px-6 py-4 sm:py-8">
          <div className="flex items-center gap-3 mb-6">
            <Button variant="ghost" size="sm" onClick={() => setLocation('/')} data-testid="button-admin-back">
              <ArrowLeft className="w-4 h-4 mr-1" />
              Back
            </Button>
            <div>
              <h1 className="text-xl font-bold text-white" data-testid="text-admin-title">Admin Panel</h1>
              <p className="text-[13px] text-white/40">Manage waitlist and free access users</p>
            </div>
          </div>

          <Card className="mb-6">
            <CardHeader className="pb-3 flex flex-row items-center justify-between gap-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Users className="w-4 h-4" />
                Waitlist ({waitlistEntries.length})
              </CardTitle>
              {waitlistEntries.length > 0 && (
                <div className="flex items-center gap-1.5">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      const emails = waitlistEntries.map(e => e.email).join('\n');
                      navigator.clipboard.writeText(emails);
                      toast({ title: "Copied", description: `${waitlistEntries.length} emails copied to clipboard` });
                    }}
                    data-testid="button-copy-waitlist"
                  >
                    <Copy className="w-3.5 h-3.5 mr-1" />
                    Copy All
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      const header = 'Email,Date Joined';
                      const rows = waitlistEntries.map(e =>
                        `${e.email},${e.createdAt ? new Date(e.createdAt).toISOString().split('T')[0] : ''}`
                      );
                      const csv = [header, ...rows].join('\n');
                      const blob = new Blob([csv], { type: 'text/csv' });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = `tradedeck-waitlist-${new Date().toISOString().split('T')[0]}.csv`;
                      a.click();
                      URL.revokeObjectURL(url);
                    }}
                    data-testid="button-export-waitlist"
                  >
                    <Download className="w-3.5 h-3.5 mr-1" />
                    Export CSV
                  </Button>
                </div>
              )}
            </CardHeader>
            <CardContent>
              {waitlistLoading ? (
                <p className="text-white/30 text-sm">Loading...</p>
              ) : waitlistEntries.length === 0 ? (
                <p className="text-white/30 text-sm" data-testid="text-no-waitlist">No waitlist signups yet</p>
              ) : (
                <div className="space-y-1.5">
                  {waitlistEntries.map((entry, i) => (
                    <div
                      key={entry.id}
                      className="flex items-center justify-between gap-3 px-3 py-2 rounded-md bg-white/[0.03] border border-white/[0.06]"
                      data-testid={`waitlist-row-${entry.id}`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="text-[11px] text-white/20 font-mono w-5 text-right shrink-0">{i + 1}</span>
                        <span className="text-[13px] text-white/80 truncate" data-testid={`text-waitlist-email-${entry.id}`}>{entry.email}</span>
                      </div>
                      <span className="text-[11px] text-white/25 shrink-0">
                        {entry.createdAt ? new Date(entry.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="mb-6">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <UserPlus className="w-4 h-4" />
                Add New Free User
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <User className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30" />
                  <Input
                    placeholder="Full name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="pl-8 bg-white/5 border-white/10 text-white placeholder:text-white/30"
                    data-testid="input-free-user-name"
                  />
                </div>
                <div className="relative flex-1">
                  <Mail className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30" />
                  <Input
                    placeholder="Email address"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-8 bg-white/5 border-white/10 text-white placeholder:text-white/30"
                    data-testid="input-free-user-email"
                  />
                </div>
                <Button
                  type="submit"
                  disabled={addMutation.isPending || !name.trim() || !email.trim()}
                  className="min-h-[44px] sm:w-auto"
                  data-testid="button-add-free-user"
                >
                  {addMutation.isPending ? "Adding..." : "Add User"}
                </Button>
              </form>
              <p className="text-[11px] text-white/25 mt-2">
                Default password: <span className="font-mono text-white/40">tradedeck</span> — user can change it after login
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Shield className="w-4 h-4" />
                Current Free Users ({freeUsers.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <p className="text-white/30 text-sm">Loading...</p>
              ) : freeUsers.length === 0 ? (
                <p className="text-white/30 text-sm" data-testid="text-no-free-users">No free users added yet</p>
              ) : (
                <div className="space-y-2">
                  {freeUsers.map((fu) => (
                    <div
                      key={fu.id}
                      className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-md bg-white/[0.03] border border-white/[0.06]"
                      data-testid={`free-user-row-${fu.id}`}
                    >
                      <div className="min-w-0">
                        <div className="text-[14px] font-medium text-white truncate" data-testid={`text-free-user-name-${fu.id}`}>{fu.name}</div>
                        <div className="text-[12px] text-white/40 truncate" data-testid={`text-free-user-email-${fu.id}`}>{fu.email}</div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => deleteMutation.mutate(fu.id)}
                        disabled={deleteMutation.isPending}
                        className="text-white/30 hover:text-red-400 flex-shrink-0"
                        data-testid={`button-delete-free-user-${fu.id}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
