"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Shield,
  CreditCard,
  Key,
  FileText,
  Lock,
  LogOut,
  RefreshCw,
  Search,
  Plus,
  Copy,
  Check,
  AlertCircle,
  Archive,
  Trash2,
  Download,
  Eye,
  TrendingUp,
  Clock,
  Sparkles,
  Users,
  UserPlus,
  UserCheck,
  UserX,
  Code,
  ExternalLink,
} from "lucide-react";
import { api, ApiError } from "@/lib/api";

type AdminTab = "dashboard" | "cards" | "pins" | "audit" | "users" | "api_keys";

export default function AdminPortal() {
  const router = useRouter();

  // Auth state
  const [adminUser, setAdminUser] = useState<any>(null);
  const [isAuthLoading, setIsAuthLoading] = useState<boolean>(true);
  const [activeTab, setActiveTab] = useState<AdminTab>("dashboard");

  // Login form state
  const [loginEmail, setLoginEmail] = useState<string>("");
  const [loginPassword, setLoginPassword] = useState<string>("");
  const [isLoggingIn, setIsLoggingIn] = useState<boolean>(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  // Dashboard state
  const [metrics, setMetrics] = useState<any>(null);
  const [isMetricsLoading, setIsMetricsLoading] = useState<boolean>(false);

  // Cards state
  const [cards, setCards] = useState<any[]>([]);
  const [cardTotal, setCardTotal] = useState<number>(0);
  const [cardPage, setCardPage] = useState<number>(1);
  const [cardQuery, setCardQuery] = useState<string>("");
  const [cardTypeFilter, setCardTypeFilter] = useState<string>("");
  const [cardStatusFilter, setCardStatusFilter] = useState<string>("");
  const [isCardsLoading, setIsCardsLoading] = useState<boolean>(false);
  const [selectedCard, setSelectedCard] = useState<any>(null);
  const [editNotes, setEditNotes] = useState<string>("");
  const [editBrand, setEditBrand] = useState<string>("");
  const [editDenomination, setEditDenomination] = useState<string>("");
  const [isSavingCard, setIsSavingCard] = useState<boolean>(false);

  // PINs state
  const [pins, setPins] = useState<any[]>([]);
  const [pinTotal, setPinTotal] = useState<number>(0);
  const [pinPage, setPinPage] = useState<number>(1);
  const [pinStatusFilter, setPinStatusFilter] = useState<string>("");
  const [isPinsLoading, setIsPinsLoading] = useState<boolean>(false);

  // PIN Generation Modal state
  const [showPinModal, setShowPinModal] = useState<boolean>(false);
  const [newPinLength, setNewPinLength] = useState<number>(4);
  const [newPinLabel, setNewPinLabel] = useState<string>("");
  const [newPinMaxScans, setNewPinMaxScans] = useState<number>(1);
  const [isBatchMode, setIsBatchMode] = useState<boolean>(false);
  const [batchCount, setBatchCount] = useState<number>(5);
  const [isGeneratingPin, setIsGeneratingPin] = useState<boolean>(false);
  const [generatedResult, setGeneratedResult] = useState<any>(null);
  const [pinError, setPinError] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Audit logs state
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [auditTotal, setAuditTotal] = useState<number>(0);
  const [auditPage, setAuditPage] = useState<number>(1);
  const [isAuditLoading, setIsAuditLoading] = useState<boolean>(false);

  // User Management state (Admin only)
  const [users, setUsers] = useState<any[]>([]);
  const [userTotal, setUserTotal] = useState<number>(0);
  const [isUsersLoading, setIsUsersLoading] = useState<boolean>(false);
  const [showUserModal, setShowUserModal] = useState<boolean>(false);
  const [newUserEmail, setNewUserEmail] = useState<string>("");
  const [newUserPassword, setNewUserPassword] = useState<string>("");
  const [newUserRole, setNewUserRole] = useState<"employee" | "admin">("employee");
  const [isCreatingUser, setIsCreatingUser] = useState<boolean>(false);
  const [userError, setUserError] = useState<string | null>(null);

  // API Key Management state (Admin only)
  const [apiKeys, setApiKeys] = useState<any[]>([]);
  const [isApiKeysLoading, setIsApiKeysLoading] = useState<boolean>(false);
  const [showApiKeyModal, setShowApiKeyModal] = useState<boolean>(false);
  const [newKeyName, setNewKeyName] = useState<string>("");
  const [isCreatingKey, setIsCreatingKey] = useState<boolean>(false);
  const [apiKeyError, setApiKeyError] = useState<string | null>(null);
  const [createdApiKeyData, setCreatedApiKeyData] = useState<any | null>(null);
  const [showDocsModal, setShowDocsModal] = useState<boolean>(false);

  // Check auth session on mount
  useEffect(() => {
    async function checkAuth() {
      try {
        const user = await api.getAdminProfile();
        setAdminUser(user);
      } catch (_) {
        setAdminUser(null);
      } finally {
        setIsAuthLoading(false);
      }
    }
    checkAuth();
  }, []);

  // Fetch dashboard metrics
  const loadDashboard = useCallback(async () => {
    setIsMetricsLoading(true);
    try {
      const res = await api.getAdminDashboard();
      setMetrics(res.metrics);
    } catch (e) {
      console.error(e);
    } finally {
      setIsMetricsLoading(false);
    }
  }, []);

  // Fetch Cards
  const loadCards = useCallback(async () => {
    setIsCardsLoading(true);
    try {
      const res = await api.listCards({
        query: cardQuery,
        card_type: cardTypeFilter,
        status: cardStatusFilter,
        page: cardPage,
        page_size: 10,
      });
      setCards(res.items);
      setCardTotal(res.total);
    } catch (e) {
      console.error(e);
    } finally {
      setIsCardsLoading(false);
    }
  }, [cardQuery, cardTypeFilter, cardStatusFilter, cardPage]);

  // Fetch PINs
  const loadPins = useCallback(async () => {
    setIsPinsLoading(true);
    try {
      const res = await api.listAccessPins({
        status_filter: pinStatusFilter,
        page: pinPage,
        page_size: 15,
      });
      setPins(res.items);
      setPinTotal(res.total);
    } catch (e) {
      console.error(e);
    } finally {
      setIsPinsLoading(false);
    }
  }, [pinStatusFilter, pinPage]);

  // Fetch Audit Logs
  const loadAudit = useCallback(async () => {
    setIsAuditLoading(true);
    try {
      const res = await api.getAuditLogs({
        page: auditPage,
        page_size: 20,
      });
      setAuditLogs(res.items);
      setAuditTotal(res.total);
    } catch (e) {
      console.error(e);
    } finally {
      setIsAuditLoading(false);
    }
  }, [auditPage]);

  // Fetch Users (Admin only)
  const loadUsers = useCallback(async () => {
    if (adminUser?.role !== "admin") return;
    setIsUsersLoading(true);
    try {
      const res = await api.listUsers();
      setUsers(res.items);
      setUserTotal(res.total);
    } catch (e) {
      console.error(e);
    } finally {
      setIsUsersLoading(false);
    }
  }, [adminUser]);

  // Fetch API Keys (Admin only)
  const loadApiKeys = useCallback(async () => {
    if (adminUser?.role !== "admin") return;
    setIsApiKeysLoading(true);
    try {
      const res = await api.listApiKeys();
      setApiKeys(res);
    } catch (e) {
      console.error(e);
    } finally {
      setIsApiKeysLoading(false);
    }
  }, [adminUser]);

  // Tab switch effect
  useEffect(() => {
    if (!adminUser) return;
    if (activeTab === "dashboard") loadDashboard();
    if (activeTab === "cards") loadCards();
    if (activeTab === "pins") loadPins();
    if (activeTab === "audit") loadAudit();
    if (activeTab === "users" && adminUser.role === "admin") loadUsers();
    if (activeTab === "api_keys" && adminUser.role === "admin") loadApiKeys();
  }, [adminUser, activeTab, loadDashboard, loadCards, loadPins, loadAudit, loadUsers, loadApiKeys]);

  // Login handler
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoggingIn(true);
    setLoginError(null);

    try {
      const res = await api.adminLogin(loginEmail, loginPassword);
      setAdminUser(res.user);
      loadDashboard();
    } catch (err: any) {
      const apiErr = err as ApiError;
      setLoginError(apiErr.detail || "Authentication failed");
    } finally {
      setIsLoggingIn(false);
    }
  };

  // Logout handler
  const handleLogout = async () => {
    try {
      await api.adminLogout();
    } catch (_) {}
    setAdminUser(null);
  };

  // Handle PIN generation (Accessible to admin and employees)
  const handleGeneratePin = async () => {
    setIsGeneratingPin(true);
    setPinError(null);
    try {
      if (isBatchMode) {
        const res = await api.createBatchPins({
          count: batchCount,
          pin_length: newPinLength,
          label_prefix: newPinLabel || "Batch",
          max_completed_scans: newPinMaxScans > 0 ? newPinMaxScans : null,
        });
        setGeneratedResult(res);
      } else {
        const res = await api.createPin({
          pin_length: newPinLength,
          label: newPinLabel || "Customer Access",
          max_completed_scans: newPinMaxScans > 0 ? newPinMaxScans : null,
        });
        setGeneratedResult(res);
      }
      loadPins();
    } catch (e: any) {
      console.error("PIN Generation Error:", e);
      setPinError(e.detail || e.message || "Failed to generate PIN. Please check connection and permissions.");
    } finally {
      setIsGeneratingPin(false);
    }
  };

  // Revoke PIN
  const handleRevokePin = async (id: string) => {
    if (!confirm("Are you sure you want to revoke this PIN immediately?")) return;
    try {
      await api.revokePin(id);
      loadPins();
    } catch (e) {
      console.error(e);
    }
  };

  // Create User (Admin only)
  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsCreatingUser(true);
    setUserError(null);

    try {
      await api.createUser({
        email: newUserEmail,
        password: newUserPassword,
        role: newUserRole,
      });
      setShowUserModal(false);
      setNewUserEmail("");
      setNewUserPassword("");
      setNewUserRole("employee");
      loadUsers();
    } catch (err: any) {
      const apiErr = err as ApiError;
      setUserError(apiErr.detail || "Failed to create user account");
    } finally {
      setIsCreatingUser(false);
    }
  };

  // Toggle User Status (Activate/Disable)
  const handleToggleUserStatus = async (user: any) => {
    const nextStatus = user.status === "active" ? "disabled" : "active";
    if (user.id === adminUser.id) {
      alert("You cannot disable your own administrator account.");
      return;
    }
    try {
      await api.updateUser(user.id, { status: nextStatus });
      loadUsers();
    } catch (e) {
      console.error(e);
    }
  };

  // Delete User (Admin only)
  const handleDeleteUser = async (user: any) => {
    if (user.id === adminUser.id) {
      alert("You cannot delete your own administrator account.");
      return;
    }
    if (!confirm(`Permanently delete user '${user.email}'?`)) return;
    try {
      await api.deleteUser(user.id);
      loadUsers();
    } catch (e) {
      console.error(e);
    }
  };

  // Create API Key (Admin only)
  const handleCreateApiKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKeyName.trim()) return;
    setIsCreatingKey(true);
    setApiKeyError(null);

    try {
      const res = await api.createApiKey(newKeyName.trim());
      setCreatedApiKeyData(res);
      setNewKeyName("");
      loadApiKeys();
    } catch (err: any) {
      const apiErr = err as ApiError;
      setApiKeyError(apiErr.detail || "Failed to create API key");
    } finally {
      setIsCreatingKey(false);
    }
  };

  // Revoke API Key (Admin only)
  const handleRevokeApiKey = async (key: any) => {
    if (!confirm(`Are you sure you want to revoke API key '${key.name}' (${key.key_prefix})? Connected external applications will immediately lose access.`)) {
      return;
    }
    try {
      await api.revokeApiKey(key.id);
      loadApiKeys();
    } catch (err: any) {
      const apiErr = err as ApiError;
      alert(apiErr.detail || "Failed to revoke API key");
    }
  };

  // Save Card Edits
  const handleSaveCard = async () => {
    if (!selectedCard) return;
    setIsSavingCard(true);
    try {
      const updated = await api.updateCard(selectedCard.id, {
        brand: editBrand,
        denomination: editDenomination,
        notes: editNotes,
      });
      setSelectedCard(updated);
      loadCards();
    } catch (e) {
      console.error(e);
    } finally {
      setIsSavingCard(false);
    }
  };

  // Archive Card (Admin only)
  const handleArchiveCard = async (id: string) => {
    if (!confirm("Archive this gift card record?")) return;
    try {
      await api.archiveCard(id);
      setSelectedCard(null);
      loadCards();
    } catch (e) {
      console.error(e);
    }
  };

  // Delete Card (Strictly Admin only)
  const handleDeleteCard = async (id: string) => {
    if (adminUser?.role !== "admin") {
      alert("Permission denied. Deletion can only be performed by administrators.");
      return;
    }
    if (!confirm("Permanently delete this card record and remove image files? This action cannot be undone.")) return;
    try {
      await api.deleteCard(id);
      setSelectedCard(null);
      loadCards();
    } catch (e) {
      console.error(e);
    }
  };

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  if (isAuthLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-400">
        <RefreshCw className="w-8 h-8 animate-spin text-indigo-500" />
      </div>
    );
  }

  // ==========================================
  // VIEW 1: UNAUTHENTICATED LOGIN
  // ==========================================
  if (!adminUser) {
    return (
      <main className="min-h-screen bg-slate-950 flex flex-col justify-center items-center p-4">
        <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl backdrop-blur-xl">
          <div className="text-center mb-8">
            <div className="w-12 h-12 rounded-2xl bg-indigo-600/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center mx-auto mb-3 shadow-md">
              <Lock className="w-6 h-6" />
            </div>
            <h1 className="text-2xl font-bold text-white tracking-tight">Staff &amp; Admin Portal</h1>
            <p className="text-xs text-slate-400 mt-1">Authorized personnel only &bull; CardScan Management</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">Email Address</label>
              <input
                type="email"
                required
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                placeholder="operator@cardscan.io or admin@cardscan.io"
                className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white placeholder-slate-600 text-sm focus:outline-none focus:border-indigo-500 transition-colors"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">Password</label>
              <input
                type="password"
                required
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white placeholder-slate-600 text-sm focus:outline-none focus:border-indigo-500 transition-colors"
              />
            </div>

            {loginError && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                <span>{loginError}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={isLoggingIn}
              className="w-full py-3 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs shadow-lg shadow-indigo-600/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {isLoggingIn ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Verifying Credentials...</span>
                </>
              ) : (
                <span>Sign In to Console</span>
              )}
            </button>
          </form>

          <div className="mt-6 pt-4 border-t border-slate-800/80 text-center text-xs text-slate-500">
            <p>
              Bootstrap administrator via CLI: <br />
              <code className="text-slate-400">python -m app.cli create-admin</code>
            </p>
          </div>
        </div>
      </main>
    );
  }

  // ==========================================
  // VIEW 2: AUTHENTICATED STAFF PORTAL
  // ==========================================
  const isAdmin = adminUser.role === "admin";

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* Top Admin Header */}
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur-md px-4 sm:px-8 py-3.5 flex flex-wrap justify-between items-center gap-4 sticky top-0 z-30">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center shadow-md shadow-indigo-500/20">
            <Shield className="w-4 h-4 text-white" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-white flex items-center gap-2">
              CardScan Operations Console
              <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full border ${
                isAdmin
                  ? "bg-indigo-500/20 text-indigo-300 border-indigo-500/30"
                  : "bg-emerald-500/20 text-emerald-300 border-emerald-500/30"
              }`}>
                {adminUser.role}
              </span>
            </h1>
            <p className="text-xs text-slate-400">
              {isAdmin ? "Full Administrator Access" : "Employee Workspace: PIN Generation & Card Review"}
            </p>
          </div>
        </div>

        {/* Tab Navigation */}
        <nav className="flex items-center gap-1.5 p-1 rounded-xl bg-slate-950 border border-slate-800">
          <button
            type="button"
            onClick={() => setActiveTab("dashboard")}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center gap-1.5 ${
              activeTab === "dashboard"
                ? "bg-indigo-600 text-white shadow-sm"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <TrendingUp className="w-3.5 h-3.5" />
            Dashboard
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("cards")}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center gap-1.5 ${
              activeTab === "cards"
                ? "bg-indigo-600 text-white shadow-sm"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <CreditCard className="w-3.5 h-3.5" />
            Gift Cards
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("pins")}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center gap-1.5 ${
              activeTab === "pins"
                ? "bg-indigo-600 text-white shadow-sm"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Key className="w-3.5 h-3.5" />
            Access PINs
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("audit")}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center gap-1.5 ${
              activeTab === "audit"
                ? "bg-indigo-600 text-white shadow-sm"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            Audit Logs
          </button>

          {/* Users tab: visible to Admins only */}
          {isAdmin && (
            <button
              type="button"
              onClick={() => setActiveTab("users")}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center gap-1.5 ${
                activeTab === "users"
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              Users &amp; Roles
            </button>
          )}

          {/* API Keys tab: visible to Admins only */}
          {isAdmin && (
            <button
              type="button"
              onClick={() => setActiveTab("api_keys")}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center gap-1.5 ${
                activeTab === "api_keys"
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Code className="w-3.5 h-3.5" />
              API Keys &amp; Integrations
            </button>
          )}
        </nav>

        {/* User Info & Logout */}
        <div className="flex items-center gap-3">
          <div className="hidden sm:block text-right">
            <span className="text-xs font-semibold text-slate-200 block">{adminUser.email}</span>
            <span className="text-[10px] uppercase font-bold text-indigo-400 tracking-wider">
              {adminUser.role}
            </span>
          </div>

          <button
            type="button"
            onClick={handleLogout}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition-all"
            title="Sign Out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 p-4 sm:p-8 max-w-7xl w-full mx-auto">
        {/* ========================================================= */}
        {/* TAB 1: DASHBOARD OVERVIEW                                  */}
        {/* ========================================================= */}
        {activeTab === "dashboard" && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg">
                <span className="text-xs text-slate-400 font-medium block mb-1">Total Cards</span>
                <span className="text-3xl font-bold text-white font-mono">
                  {metrics?.total_cards ?? "..."}
                </span>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg">
                <span className="text-xs text-emerald-400 font-medium block mb-1">Completed Scans</span>
                <span className="text-3xl font-bold text-emerald-400 font-mono">
                  {metrics?.completed_scans ?? "..."}
                </span>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg">
                <span className="text-xs text-amber-400 font-medium block mb-1">Incomplete Scans</span>
                <span className="text-3xl font-bold text-amber-400 font-mono">
                  {metrics?.incomplete_scans ?? "..."}
                </span>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg">
                <span className="text-xs text-indigo-400 font-medium block mb-1">Scans Today</span>
                <span className="text-3xl font-bold text-indigo-400 font-mono">
                  {metrics?.scans_today ?? "..."}
                </span>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg">
                <span className="text-xs text-violet-400 font-medium block mb-1">Active PINs</span>
                <span className="text-3xl font-bold text-violet-400 font-mono">
                  {metrics?.active_pins ?? "..."}
                </span>
              </div>
            </div>

            {/* Recent Cards & Activity Feed */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-base font-bold text-white flex items-center gap-2">
                    <CreditCard className="w-4 h-4 text-indigo-400" />
                    Recently Scanned Cards
                  </h2>
                  <button
                    onClick={() => setActiveTab("cards")}
                    className="text-xs text-indigo-400 hover:text-indigo-300 font-semibold"
                  >
                    View All &rarr;
                  </button>
                </div>

                {metrics?.recent_cards?.length === 0 ? (
                  <p className="text-xs text-slate-500 py-8 text-center">No cards scanned yet.</p>
                ) : (
                  <div className="divide-y divide-slate-800">
                    {metrics?.recent_cards?.map((card: any) => (
                      <div key={card.id} className="py-3 flex justify-between items-center">
                        <div>
                          <span className="text-xs font-mono font-bold text-indigo-300 block">
                            {card.reference_code}
                          </span>
                          <span className="text-[11px] text-slate-400">
                            {card.card_type === "double" ? "Two-Sided" : "Single-Sided"} &bull; {card.brand || "Uncategorized"}
                          </span>
                        </div>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 font-medium">
                          {card.status}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-base font-bold text-white flex items-center gap-2">
                    <Clock className="w-4 h-4 text-violet-400" />
                    Recent Activity
                  </h2>
                  <button
                    onClick={() => setActiveTab("audit")}
                    className="text-xs text-violet-400 hover:text-violet-300 font-semibold"
                  >
                    View Audit Trail &rarr;
                  </button>
                </div>

                {metrics?.recent_activity?.length === 0 ? (
                  <p className="text-xs text-slate-500 py-8 text-center">No audit activity recorded.</p>
                ) : (
                  <div className="divide-y divide-slate-800">
                    {metrics?.recent_activity?.map((act: any) => (
                      <div key={act.id} className="py-2.5 flex justify-between items-center text-xs">
                        <div>
                          <span className="font-semibold text-slate-300 block">{act.action}</span>
                          <span className="text-[10px] text-slate-500">
                            {act.actor_type}: {act.actor_id || "Anonymous"} &bull; {act.resource_type}
                          </span>
                        </div>
                        <span className="text-[10px] font-mono text-slate-400">
                          {new Date(act.timestamp).toLocaleTimeString()}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 2: GIFT CARD MANAGEMENT                                */}
        {/* ========================================================= */}
        {activeTab === "cards" && (
          <div className="space-y-6">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-wrap gap-3 items-center justify-between">
              <div className="flex items-center gap-2 flex-1 min-w-[240px]">
                <Search className="w-4 h-4 text-slate-500" />
                <input
                  type="text"
                  placeholder="Search reference code, brand, or notes..."
                  value={cardQuery}
                  onChange={(e) => setCardQuery(e.target.value)}
                  className="bg-transparent border-none text-xs text-white placeholder-slate-500 outline-none w-full"
                />
              </div>

              <div className="flex items-center gap-2">
                <select
                  value={cardTypeFilter}
                  onChange={(e) => setCardTypeFilter(e.target.value)}
                  className="bg-slate-950 text-xs text-slate-300 border border-slate-800 rounded-lg px-3 py-1.5 outline-none"
                >
                  <option value="">All Card Types</option>
                  <option value="single">Single-Sided</option>
                  <option value="double">Two-Sided</option>
                </select>

                <select
                  value={cardStatusFilter}
                  onChange={(e) => setCardStatusFilter(e.target.value)}
                  className="bg-slate-950 text-xs text-slate-300 border border-slate-800 rounded-lg px-3 py-1.5 outline-none"
                >
                  <option value="">All Statuses</option>
                  <option value="completed">Completed</option>
                  <option value="archived">Archived</option>
                </select>
              </div>
            </div>

            {isCardsLoading ? (
              <div className="text-center py-16">
                <RefreshCw className="w-6 h-6 animate-spin text-indigo-500 mx-auto mb-2" />
                <p className="text-xs text-slate-500">Loading cards...</p>
              </div>
            ) : cards.length === 0 ? (
              <div className="text-center py-16 bg-slate-900 border border-slate-800 rounded-3xl">
                <CreditCard className="w-10 h-10 text-slate-600 mx-auto mb-3" />
                <h3 className="text-sm font-bold text-slate-300">No Gift Cards Found</h3>
                <p className="text-xs text-slate-500 mt-1">Cards scanned by customers will appear here.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {cards.map((card) => {
                  const frontImg = card.images.find((i: any) => i.side === "front");

                  return (
                    <div
                      key={card.id}
                      onClick={() => {
                        setSelectedCard(card);
                        setEditBrand(card.brand || "");
                        setEditDenomination(card.denomination || "");
                        setEditNotes(card.notes || "");
                      }}
                      className="bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-3xl p-5 shadow-lg transition-all cursor-pointer flex flex-col justify-between group"
                    >
                      <div>
                        <div className="relative aspect-[1.586/1] w-full rounded-2xl overflow-hidden bg-slate-950 border border-slate-800 mb-4">
                          {frontImg ? (
                            <img
                              src={frontImg.thumbnail_url}
                              alt={card.reference_code}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-slate-600 text-xs">
                              No Image
                            </div>
                          )}

                          <div className="absolute top-2 left-2 bg-slate-950/80 px-2 py-0.5 rounded text-[10px] font-mono text-indigo-300 border border-slate-800">
                            {card.card_type === "double" ? "2-Sided" : "1-Sided"}
                          </div>
                        </div>

                        <div className="flex justify-between items-start mb-2">
                          <h3 className="text-sm font-mono font-bold text-white group-hover:text-indigo-400 transition-colors">
                            {card.reference_code}
                          </h3>
                          <span
                            className={`text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase ${
                              card.status === "completed"
                                ? "bg-emerald-500/10 text-emerald-300 border border-emerald-500/20"
                                : "bg-slate-800 text-slate-400 border border-slate-700"
                            }`}
                          >
                            {card.status}
                          </span>
                        </div>

                        <p className="text-xs text-slate-400 mb-1">
                          {card.brand ? <strong className="text-slate-200">{card.brand}</strong> : "Unbranded"}
                          {card.denomination && ` &bull; ${card.denomination}`}
                        </p>

                        {card.notes && (
                          <p className="text-[11px] text-slate-500 italic line-clamp-2 mt-1">{card.notes}</p>
                        )}
                      </div>

                      <div className="pt-3 mt-3 border-t border-slate-800/80 flex justify-between items-center text-[10px] text-slate-500">
                        <span>{new Date(card.created_at).toLocaleDateString()}</span>
                        <span className="flex items-center gap-1 text-indigo-400 group-hover:underline">
                          Inspect &rarr;
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 3: ACCESS PIN MANAGEMENT                              */}
        {/* ========================================================= */}
        {activeTab === "pins" && (
          <div className="space-y-6">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex justify-between items-center">
              <div>
                <h2 className="text-sm font-bold text-white">Customer Access PINs</h2>
                <p className="text-xs text-slate-400">
                  Generate secure 4 or 5 digit numeric PINs. Both admins and employees can generate PINs.
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  setGeneratedResult(null);
                  setShowPinModal(true);
                }}
                className="py-2 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs shadow-md transition-all flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" />
                <span>Generate PIN</span>
              </button>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-xl">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950 border-b border-slate-800 text-slate-400">
                  <tr>
                    <th className="py-3.5 px-4 font-semibold">PIN Length</th>
                    <th className="py-3.5 px-4 font-semibold">Label / Reference</th>
                    <th className="py-3.5 px-4 font-semibold">Status</th>
                    <th className="py-3.5 px-4 font-semibold">Scans Used</th>
                    <th className="py-3.5 px-4 font-semibold">Created</th>
                    <th className="py-3.5 px-4 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {pins.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-slate-500">
                        No PINs generated yet. Click &quot;Generate PIN&quot; to create customer access codes.
                      </td>
                    </tr>
                  ) : (
                    pins.map((p) => (
                      <tr key={p.id} className="hover:bg-slate-800/40 transition-colors">
                        <td className="py-3.5 px-4 font-mono font-bold text-indigo-300">
                          {p.pin_length}-Digit
                        </td>
                        <td className="py-3.5 px-4 text-slate-300 font-medium">{p.label || "—"}</td>
                        <td className="py-3.5 px-4">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase ${
                              p.status === "active"
                                ? "bg-emerald-500/10 text-emerald-300 border border-emerald-500/20"
                                : p.status === "exhausted"
                                ? "bg-amber-500/10 text-amber-300 border border-amber-500/20"
                                : "bg-rose-500/10 text-rose-300 border border-rose-500/20"
                            }`}
                          >
                            {p.status}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-slate-300">
                          {p.completed_scans} / {p.max_completed_scans ?? "∞"}
                        </td>
                        <td className="py-3.5 px-4 text-slate-500">
                          {new Date(p.created_at).toLocaleDateString()}
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          {p.status === "active" && (
                            <button
                              type="button"
                              onClick={() => handleRevokePin(p.id)}
                              className="px-2.5 py-1 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 text-[11px] font-medium transition-all"
                            >
                              Revoke
                            </button>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 4: AUDIT LOGS                                          */}
        {/* ========================================================= */}
        {activeTab === "audit" && (
          <div className="space-y-6">
            <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-xl">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950 border-b border-slate-800 text-slate-400">
                  <tr>
                    <th className="py-3.5 px-4 font-semibold">Timestamp</th>
                    <th className="py-3.5 px-4 font-semibold">Action</th>
                    <th className="py-3.5 px-4 font-semibold">Actor</th>
                    <th className="py-3.5 px-4 font-semibold">Resource</th>
                    <th className="py-3.5 px-4 font-semibold">IP Address</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800 font-mono">
                  {auditLogs.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-slate-500 font-sans">
                        No audit events recorded yet.
                      </td>
                    </tr>
                  ) : (
                    auditLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-slate-800/40 transition-colors">
                        <td className="py-3 px-4 text-slate-400">
                          {new Date(log.timestamp).toLocaleString()}
                        </td>
                        <td className="py-3 px-4 font-semibold text-indigo-300">{log.action}</td>
                        <td className="py-3 px-4 text-slate-300">
                          {log.actor_type}: {log.actor_id || "System"}
                        </td>
                        <td className="py-3 px-4 text-slate-400">
                          {log.resource_type}: {log.resource_id?.slice(0, 8)}...
                        </td>
                        <td className="py-3 px-4 text-slate-500">{log.ip_address || "—"}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 5: USERS & ROLES (Admin Only)                          */}
        {/* ========================================================= */}
        {activeTab === "users" && isAdmin && (
          <div className="space-y-6">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex justify-between items-center">
              <div>
                <h2 className="text-sm font-bold text-white flex items-center gap-2">
                  <Users className="w-4 h-4 text-indigo-400" />
                  Staff &amp; User Accounts
                </h2>
                <p className="text-xs text-slate-400">
                  Create and manage employee and administrator credentials.
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  setUserError(null);
                  setShowUserModal(true);
                }}
                className="py-2 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs shadow-md transition-all flex items-center gap-1.5"
              >
                <UserPlus className="w-4 h-4" />
                <span>Add User</span>
              </button>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-xl">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950 border-b border-slate-800 text-slate-400">
                  <tr>
                    <th className="py-3.5 px-4 font-semibold">User Email</th>
                    <th className="py-3.5 px-4 font-semibold">Role</th>
                    <th className="py-3.5 px-4 font-semibold">Status</th>
                    <th className="py-3.5 px-4 font-semibold">Created Date</th>
                    <th className="py-3.5 px-4 font-semibold">Last Login</th>
                    <th className="py-3.5 px-4 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {users.map((u) => {
                    const isSelf = u.id === adminUser.id;

                    return (
                      <tr key={u.id} className="hover:bg-slate-800/40 transition-colors">
                        <td className="py-3.5 px-4 font-medium text-white flex items-center gap-2">
                          {u.email}
                          {isSelf && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 font-semibold">
                              You
                            </span>
                          )}
                        </td>
                        <td className="py-3.5 px-4">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                              u.role === "admin"
                                ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/30"
                                : "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                            }`}
                          >
                            {u.role}
                          </span>
                        </td>
                        <td className="py-3.5 px-4">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase ${
                              u.status === "active"
                                ? "bg-emerald-500/10 text-emerald-300 border border-emerald-500/20"
                                : "bg-rose-500/10 text-rose-300 border border-rose-500/20"
                            }`}
                          >
                            {u.status}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-slate-500">
                          {new Date(u.created_at).toLocaleDateString()}
                        </td>
                        <td className="py-3.5 px-4 text-slate-400 font-mono text-[11px]">
                          {u.last_login_at ? new Date(u.last_login_at).toLocaleDateString() : "Never"}
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => handleToggleUserStatus(u)}
                              disabled={isSelf}
                              className={`px-2 py-1 rounded-lg text-[11px] font-medium transition-all ${
                                u.status === "active"
                                  ? "bg-slate-800 hover:bg-slate-700 text-slate-300"
                                  : "bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/20"
                              } disabled:opacity-30 disabled:cursor-not-allowed`}
                            >
                              {u.status === "active" ? "Disable" : "Activate"}
                            </button>

                            <button
                              type="button"
                              onClick={() => handleDeleteUser(u)}
                              disabled={isSelf}
                              className="px-2 py-1 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/20 text-[11px] font-medium transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 6: API KEYS & INTEGRATIONS (ADMIN ONLY)               */}
        {/* ========================================================= */}
        {activeTab === "api_keys" && isAdmin && (
          <div className="space-y-6">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-wrap justify-between items-center gap-3">
              <div>
                <h2 className="text-sm font-bold text-white flex items-center gap-2">
                  <Code className="w-4 h-4 text-indigo-400" />
                  API Keys &amp; Web App Integrations
                </h2>
                <p className="text-xs text-slate-400">
                  Allow your external web applications to generate PINs and preview scanned cards.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowDocsModal(true)}
                  className="py-2 px-3.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs border border-slate-700 transition-all flex items-center gap-1.5"
                >
                  <FileText className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Integration Guide</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setCreatedApiKeyData(null);
                    setApiKeyError(null);
                    setNewKeyName("");
                    setShowApiKeyModal(true);
                  }}
                  className="py-2 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs shadow-md transition-all flex items-center gap-1.5"
                >
                  <Plus className="w-4 h-4" />
                  <span>Generate New API Key</span>
                </button>
              </div>
            </div>

            {/* API Keys Table */}
            <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-xl">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950 border-b border-slate-800 text-slate-400">
                  <tr>
                    <th className="py-3.5 px-4 font-semibold">Application Name</th>
                    <th className="py-3.5 px-4 font-semibold">Key Identifier</th>
                    <th className="py-3.5 px-4 font-semibold">Status</th>
                    <th className="py-3.5 px-4 font-semibold">Created Date</th>
                    <th className="py-3.5 px-4 font-semibold">Last Used</th>
                    <th className="py-3.5 px-4 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {apiKeys.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-slate-500">
                        {isApiKeysLoading ? "Loading API keys..." : "No API keys generated yet. Click 'Generate New API Key' above to get started."}
                      </td>
                    </tr>
                  ) : (
                    apiKeys.map((k) => (
                      <tr key={k.id} className="hover:bg-slate-800/40 transition-colors">
                        <td className="py-3.5 px-4 font-semibold text-white">
                          {k.name}
                        </td>
                        <td className="py-3.5 px-4 font-mono text-slate-300">
                          <span className="px-2 py-1 rounded bg-slate-950 border border-slate-800 text-[11px]">
                            {k.key_prefix}
                          </span>
                        </td>
                        <td className="py-3.5 px-4">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                              k.is_active
                                ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                                : "bg-slate-800 text-slate-400 border border-slate-700"
                            }`}
                          >
                            {k.is_active ? "Active" : "Revoked"}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-slate-400">
                          {new Date(k.created_at).toLocaleDateString()}
                        </td>
                        <td className="py-3.5 px-4 text-slate-400 font-mono text-[11px]">
                          {k.last_used_at ? new Date(k.last_used_at).toLocaleString() : "Never"}
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          {k.is_active ? (
                            <button
                              type="button"
                              onClick={() => handleRevokeApiKey(k)}
                              className="px-2.5 py-1 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/20 text-[11px] font-medium transition-all"
                            >
                              Revoke
                            </button>
                          ) : (
                            <span className="text-[11px] text-slate-600 italic">Revoked</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Integration Quick Reference Card */}
            <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-5 sm:p-6">
              <h3 className="text-xs font-bold uppercase tracking-wider text-indigo-400 mb-3 flex items-center gap-2">
                <Sparkles className="w-4 h-4" />
                How It Works with Your Other Apps
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-slate-300">
                <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800">
                  <span className="w-5 h-5 rounded-full bg-indigo-600/30 text-indigo-300 font-bold flex items-center justify-center mb-2">1</span>
                  <strong className="text-white block mb-1">Generate PIN &amp; Magic Link</strong>
                  <p className="text-slate-400">
                    Your other web app calls <code className="text-indigo-300">POST /api/v1/integrations/pins</code> with your API key. It receives a 4-digit PIN and a direct URL <code className="text-indigo-300">https://1scan.top/?pin=XXXX</code>.
                  </p>
                </div>
                <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800">
                  <span className="w-5 h-5 rounded-full bg-indigo-600/30 text-indigo-300 font-bold flex items-center justify-center mb-2">2</span>
                  <strong className="text-white block mb-1">Customer Scans Card</strong>
                  <p className="text-slate-400">
                    The customer opens the link on their mobile phone, snaps front and back photos without typing, and the server auto-crops the card.
                  </p>
                </div>
                <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800">
                  <span className="w-5 h-5 rounded-full bg-indigo-600/30 text-indigo-300 font-bold flex items-center justify-center mb-2">3</span>
                  <strong className="text-white block mb-1">Instant Preview &amp; Webhook</strong>
                  <p className="text-slate-400">
                    Your other web app receives the webhook with the card reference code, and displays the image using <code className="text-indigo-300">&lt;img src=&quot;.../images/front?api_key=...&quot;&gt;</code>.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* ========================================================= */}
      {/* CARD DETAIL & EDIT SLIDEOVER MODAL                         */}
      {/* ========================================================= */}
      {selectedCard && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-3xl w-full max-h-[90vh] overflow-y-auto p-6 sm:p-8 shadow-2xl">
            <div className="flex justify-between items-start mb-6">
              <div>
                <span className="text-xs uppercase font-bold text-indigo-400 tracking-wider block mb-1">
                  Card Inspection
                </span>
                <h2 className="text-2xl font-mono font-bold text-white">{selectedCard.reference_code}</h2>
              </div>
              <button
                type="button"
                onClick={() => setSelectedCard(null)}
                className="p-2 rounded-xl bg-slate-800 text-slate-400 hover:text-white"
              >
                &times;
              </button>
            </div>

            {/* Images Preview Section */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
              {selectedCard.images.map((img: any) => (
                <div key={img.id} className="bg-slate-950 rounded-2xl p-3 border border-slate-800">
                  <div className="flex justify-between items-center text-xs mb-2">
                    <span className="font-semibold text-slate-300 capitalize">{img.side} Side (Processed)</span>
                    <a
                      href={img.download_url}
                      className="text-indigo-400 hover:text-indigo-300 flex items-center gap-1 font-medium"
                      download
                    >
                      <Download className="w-3.5 h-3.5" />
                      Download
                    </a>
                  </div>
                  <div className="relative aspect-[1.586/1] w-full rounded-xl overflow-hidden bg-slate-900 border border-slate-800">
                    <img src={img.processed_url} alt={img.side} className="w-full h-full object-cover" />
                  </div>
                  <div className="mt-2 text-[10px] text-slate-500 font-mono flex justify-between">
                    <span>{img.processed_width} &times; {img.processed_height}</span>
                    <span>{Math.round(img.file_size / 1024)} KB</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Metadata Fields */}
            <div className="grid grid-cols-2 gap-4 mb-6">
              <div>
                <label className="text-xs font-semibold text-slate-400 block mb-1">Brand Name</label>
                <input
                  type="text"
                  value={editBrand}
                  onChange={(e) => setEditBrand(e.target.value)}
                  placeholder="e.g. Amazon, Target, Sephora"
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-400 block mb-1">Denomination / Value</label>
                <input
                  type="text"
                  value={editDenomination}
                  onChange={(e) => setEditDenomination(e.target.value)}
                  placeholder="e.g. $50 USD"
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white"
                />
              </div>
            </div>

            <div className="mb-6">
              <label className="text-xs font-semibold text-slate-400 block mb-1">Internal Notes</label>
              <textarea
                rows={3}
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                placeholder="Add operator notes, card condition, etc."
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white"
              />
            </div>

            {/* Action Bar */}
            <div className="flex flex-wrap justify-between items-center gap-3 pt-4 border-t border-slate-800">
              <div className="flex gap-2 items-center">
                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => handleArchiveCard(selectedCard.id)}
                    className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold flex items-center gap-1.5"
                  >
                    <Archive className="w-3.5 h-3.5" />
                    Archive
                  </button>
                )}

                {/* STRICT ROLE ENFORCEMENT: DELETION CAN ONLY BE DONE BY ADMIN */}
                {isAdmin ? (
                  <button
                    type="button"
                    onClick={() => handleDeleteCard(selectedCard.id)}
                    className="px-3 py-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 text-xs font-semibold flex items-center gap-1.5"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Delete
                  </button>
                ) : (
                  <span className="text-[11px] text-slate-500 italic flex items-center gap-1.5 px-3 py-1.5 bg-slate-950 rounded-xl border border-slate-800">
                    <Lock className="w-3 h-3 text-slate-600" />
                    Deletion restricted to administrator
                  </span>
                )}
              </div>

              <button
                type="button"
                onClick={handleSaveCard}
                disabled={isSavingCard}
                className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-md flex items-center gap-1.5"
              >
                {isSavingCard ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                Save Notes &amp; Metadata
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* PIN GENERATION MODAL                                       */}
      {/* ========================================================= */}
      {showPinModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-6 sm:p-8 shadow-2xl">
            <h2 className="text-xl font-bold text-white mb-1">Generate Customer Access PIN</h2>
            <p className="text-xs text-slate-400 mb-6">
              PIN is generated via cryptographically secure RNG.
            </p>

            {generatedResult ? (
              <div className="space-y-4">
                <div className="p-4 rounded-2xl bg-indigo-500/10 border-2 border-indigo-500/40 text-center">
                  <span className="text-xs font-semibold text-indigo-300 uppercase tracking-wider block mb-2">
                    Access PIN Created!
                  </span>

                  {isBatchMode ? (
                    <div className="max-h-48 overflow-y-auto space-y-2 text-left my-2">
                      {generatedResult.items.map((item: any) => (
                        <div
                          key={item.id}
                          className="flex justify-between items-center bg-slate-950 p-2 rounded-lg border border-slate-800"
                        >
                          <span className="font-mono text-base font-bold text-white">{item.pin}</span>
                          <span className="text-[10px] text-slate-500">{item.label}</span>
                          <button
                            type="button"
                            onClick={() => copyToClipboard(item.pin, item.id)}
                            className="p-1 rounded bg-slate-800 text-slate-300 hover:text-white"
                          >
                            {copiedKey === item.id ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex items-center justify-center gap-3 my-3">
                      <span className="text-4xl font-mono font-bold text-white tracking-widest">
                        {generatedResult.pin}
                      </span>
                      <button
                        type="button"
                        onClick={() => copyToClipboard(generatedResult.pin, "single")}
                        className="p-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white shadow"
                        title="Copy PIN"
                      >
                        {copiedKey === "single" ? <Check className="w-4 h-4 text-emerald-300" /> : <Copy className="w-4 h-4" />}
                      </button>
                    </div>
                  )}

                  <p className="text-[11px] text-amber-300 mt-2">
                    IMPORTANT: Copy this PIN now. For customer security, plaintext PINs cannot be viewed again.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setShowPinModal(false)}
                  className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold"
                >
                  Done
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1.5">PIN Length</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setNewPinLength(4)}
                      className={`py-2 rounded-xl text-xs font-semibold border ${
                        newPinLength === 4
                          ? "bg-indigo-600/20 border-indigo-500 text-indigo-300"
                          : "bg-slate-950 border-slate-800 text-slate-400"
                      }`}
                    >
                      4 Digits (e.g. 0047)
                    </button>
                    <button
                      type="button"
                      onClick={() => setNewPinLength(5)}
                      className={`py-2 rounded-xl text-xs font-semibold border ${
                        newPinLength === 5
                          ? "bg-indigo-600/20 border-indigo-500 text-indigo-300"
                          : "bg-slate-950 border-slate-800 text-slate-400"
                      }`}
                    >
                      5 Digits (e.g. 03829)
                    </button>
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">Label or Customer Ref</label>
                  <input
                    type="text"
                    value={newPinLabel}
                    onChange={(e) => setNewPinLabel(e.target.value)}
                    placeholder="e.g. Store #14, Customer John D."
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">Max Completed Scans</label>
                  <input
                    type="number"
                    min={0}
                    value={newPinMaxScans}
                    onChange={(e) => setNewPinMaxScans(parseInt(e.target.value, 10) || 0)}
                    placeholder="1 (0 for unlimited)"
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white"
                  />
                  <span className="text-[10px] text-slate-500 mt-1 block">
                    Counts completed gift card records (not individual pictures or retakes).
                  </span>
                </div>

                <div className="flex items-center justify-between pt-2">
                  <label className="text-xs text-slate-300">Generate multiple PINs in batch</label>
                  <input
                    type="checkbox"
                    checked={isBatchMode}
                    onChange={(e) => setIsBatchMode(e.target.checked)}
                    className="rounded bg-slate-950 border-slate-800 text-indigo-600"
                  />
                </div>

                {isBatchMode && (
                  <div>
                    <label className="text-xs font-semibold text-slate-300 block mb-1">Batch Count (1–50)</label>
                    <input
                      type="number"
                      min={1}
                      max={50}
                      value={batchCount}
                      onChange={(e) => setBatchCount(parseInt(e.target.value, 10) || 5)}
                      className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white"
                    />
                  </div>
                )}

                {pinError && (
                  <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                    <span>{pinError}</span>
                  </div>
                )}

                <div className="flex gap-2 pt-3">
                  <button
                    type="button"
                    onClick={() => setShowPinModal(false)}
                    className="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleGeneratePin}
                    disabled={isGeneratingPin}
                    className="flex-2 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-md flex items-center justify-center gap-1.5"
                  >
                    {isGeneratingPin ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                    <span>Generate Now</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* USER CREATION MODAL (Admin Only)                           */}
      {/* ========================================================= */}
      {showUserModal && isAdmin && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-6 sm:p-8 shadow-2xl">
            <h2 className="text-xl font-bold text-white mb-1">Create User Account</h2>
            <p className="text-xs text-slate-400 mb-6">
              Create an employee or administrator account.
            </p>

            <form onSubmit={handleCreateUser} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">Email Address</label>
                <input
                  type="email"
                  required
                  value={newUserEmail}
                  onChange={(e) => setNewUserEmail(e.target.value)}
                  placeholder="operator@cardscan.io"
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">Temporary Password (min 8 chars)</label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={newUserPassword}
                  onChange={(e) => setNewUserPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1.5">Role</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setNewUserRole("employee")}
                    className={`py-2 rounded-xl text-xs font-semibold border ${
                      newUserRole === "employee"
                        ? "bg-emerald-500/20 border-emerald-500 text-emerald-300"
                        : "bg-slate-950 border-slate-800 text-slate-400"
                    }`}
                  >
                    Employee
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewUserRole("admin")}
                    className={`py-2 rounded-xl text-xs font-semibold border ${
                      newUserRole === "admin"
                        ? "bg-indigo-600/20 border-indigo-500 text-indigo-300"
                        : "bg-slate-950 border-slate-800 text-slate-400"
                    }`}
                  >
                    Administrator
                  </button>
                </div>
                <p className="text-[11px] text-slate-400 mt-2 bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                  {newUserRole === "employee" ? (
                    <>
                      <strong>Employee:</strong> Can generate access PINs and inspect received cards. Cannot delete records or manage other users.
                    </>
                  ) : (
                    <>
                      <strong>Administrator:</strong> Full access including permanent deletion, archiving, and user account management.
                    </>
                  )}
                </p>
              </div>

              {userError && (
                <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                  <span>{userError}</span>
                </div>
              )}

              <div className="flex gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setShowUserModal(false)}
                  className="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isCreatingUser}
                  className="flex-2 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-md flex items-center justify-center gap-1.5"
                >
                  {isCreatingUser ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <UserPlus className="w-3.5 h-3.5" />}
                  <span>Create Account</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* API KEY CREATION MODAL (Admin Only)                       */}
      {/* ========================================================= */}
      {showApiKeyModal && isAdmin && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-6 sm:p-8 shadow-2xl">
            {!createdApiKeyData ? (
              <>
                <h2 className="text-xl font-bold text-white mb-1">Generate Integration API Key</h2>
                <p className="text-xs text-slate-400 mb-6">
                  Create a secure key for your external web application or backend service.
                </p>

                <form onSubmit={handleCreateApiKey} className="space-y-4">
                  <div>
                    <label className="text-xs font-semibold text-slate-300 block mb-1">Application / Service Name</label>
                    <input
                      type="text"
                      required
                      value={newKeyName}
                      onChange={(e) => setNewKeyName(e.target.value)}
                      placeholder="e.g. Shopify Store, Support CRM, Order Backend"
                      className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  {apiKeyError && (
                    <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                      <span>{apiKeyError}</span>
                    </div>
                  )}

                  <div className="flex gap-2 pt-3">
                    <button
                      type="button"
                      onClick={() => setShowApiKeyModal(false)}
                      className="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isCreatingKey}
                      className="flex-2 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-md flex items-center justify-center gap-1.5"
                    >
                      {isCreatingKey ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                      <span>Generate Key</span>
                    </button>
                  </div>
                </form>
              </>
            ) : (
              <div className="text-center">
                <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto mb-3">
                  <Check className="w-6 h-6" />
                </div>
                <h2 className="text-xl font-bold text-white mb-1">API Key Generated</h2>
                <p className="text-xs text-slate-400 mb-5">
                  Key created for <strong className="text-white">{createdApiKeyData.name}</strong>.
                </p>

                <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 mb-4 text-left">
                  <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider block mb-1">
                    Your Secret API Key
                  </span>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      readOnly
                      value={createdApiKeyData.api_key}
                      className="bg-transparent font-mono text-xs text-indigo-300 select-all flex-1 outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(createdApiKeyData.api_key);
                        setCopiedKey(createdApiKeyData.id);
                        setTimeout(() => setCopiedKey(null), 2500);
                      }}
                      className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs flex items-center gap-1.5 shrink-0"
                    >
                      {copiedKey === createdApiKeyData.id ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedKey === createdApiKeyData.id ? "Copied" : "Copy"}</span>
                    </button>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs text-left mb-6">
                  <strong>Important:</strong> Copy this secret key now. For security, it is hashed with SHA-256 and will never be shown to you again.
                </div>

                <button
                  type="button"
                  onClick={() => setShowApiKeyModal(false)}
                  className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold"
                >
                  Done
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* INTEGRATION GUIDE MODAL                                   */}
      {/* ========================================================= */}
      {showDocsModal && (
        <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-2xl w-full max-h-[88vh] overflow-y-auto p-6 sm:p-8 shadow-2xl">
            <div className="flex justify-between items-center mb-5 pb-4 border-b border-slate-800">
              <div>
                <span className="text-xs font-bold text-indigo-400 uppercase tracking-wider block mb-1">
                  Developer Documentation
                </span>
                <h2 className="text-xl font-bold text-white">Connecting Your Other Web Apps</h2>
              </div>
              <button
                type="button"
                onClick={() => setShowDocsModal(false)}
                className="text-slate-400 hover:text-slate-200 text-xs px-2.5 py-1.5 rounded-lg border border-slate-800"
              >
                Close
              </button>
            </div>

            <div className="space-y-6 text-xs text-slate-300">
              {/* Step 1 */}
              <div>
                <h3 className="font-bold text-white text-sm mb-2 flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-indigo-600 flex items-center justify-center text-[10px] text-white">1</span>
                  Generate PIN &amp; Magic Link (From your server)
                </h3>
                <p className="text-slate-400 mb-2">
                  Make a POST request with your API Key to create a customer access PIN:
                </p>
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 font-mono text-[11px] text-slate-300 overflow-x-auto">
                  <pre>{`curl -X POST "https://1scan.top/api/v1/integrations/pins" \\
  -H "X-API-Key: YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "label": "Order #1042",
    "card_type": "single",
    "max_scans": 1,
    "expires_in_hours": 24,
    "webhook_url": "https://yourapp.com/webhooks/card-scanned",
    "redirect_url": "https://yourapp.com/order/1042/success"
  }'`}</pre>
                </div>
              </div>

              {/* Step 2 */}
              <div>
                <h3 className="font-bold text-white text-sm mb-2 flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-indigo-600 flex items-center justify-center text-[10px] text-white">2</span>
                  Send Magic Link to Customer
                </h3>
                <p className="text-slate-400 mb-2">
                  The API response gives you a <code className="text-indigo-300">scan_url</code> (e.g. <code className="text-indigo-300">https://1scan.top/?pin=4829</code>). Give this URL or QR code to your customer. They open it on mobile, the camera opens automatically, and the card is rectified.
                </p>
              </div>

              {/* Step 3 */}
              <div>
                <h3 className="font-bold text-white text-sm mb-2 flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-indigo-600 flex items-center justify-center text-[10px] text-white">3</span>
                  Display Card Preview in Your Web App
                </h3>
                <p className="text-slate-400 mb-2">
                  You can directly render the scanned gift card photo in your other app&apos;s HTML / React templates:
                </p>
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 font-mono text-[11px] text-slate-300 overflow-x-auto">
                  <pre>{`<!-- In HTML or React -->
<img 
  src="https://1scan.top/api/v1/integrations/cards/{card_id}/images/front?api_key=YOUR_API_KEY"
  alt="Gift Card Preview"
  style={{ borderRadius: "12px", width: "100%", maxWidth: "420px" }}
/>`}</pre>
                </div>
              </div>

              {/* Step 4 */}
              <div>
                <h3 className="font-bold text-white text-sm mb-2 flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-indigo-600 flex items-center justify-center text-[10px] text-white">4</span>
                  Real-time Webhook Notification
                </h3>
                <p className="text-slate-400 mb-2">
                  When the customer saves the card, 1scan sends an instant JSON POST payload to your <code className="text-indigo-300">webhook_url</code> containing the card reference code, IDs, and image stream URLs.
                </p>
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-slate-800 text-right">
              <button
                type="button"
                onClick={() => setShowDocsModal(false)}
                className="py-2 px-5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-md"
              >
                Close Documentation
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
