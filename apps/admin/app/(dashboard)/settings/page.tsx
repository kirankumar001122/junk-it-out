'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Settings,
  Building2,
  Truck,
  Layers,
  Shield,
  RotateCcw,
  Save,
  CheckCircle2,
  AlertTriangle,
  Radio,
  Phone,
  Mail,
  MapPin,
  Clock,
  Key,
  MessageSquare,
  Flame,
  Undo2,
  Smartphone,
  Lock,
} from 'lucide-react';

interface SystemSettingsConfig {
  companyName: string;
  dpiitNumber: string;
  sector: string;
  supportPhone: string;
  supportEmail: string;
  headquarters: string;
  dispatchSlaMinutes: number;
  autoAssignEnabled: boolean;
  instantQuotation: boolean;
  maxServiceRadiusKm: number;
  operatingHours: string;
  razorpayKeyId: string;
  whatsappApiStatus: 'CONNECTED' | 'MAINTENANCE' | 'DISCONNECTED';
  smsGatewayStatus: 'OPERATIONAL' | 'DEGRADED' | 'OFFLINE';
  sessionTimeoutMinutes: number;
  requireDangerousActionOtp: boolean;
}

const INITIAL_SETTINGS: SystemSettingsConfig = {
  companyName: 'Junk It Out Technologies Private Limited',
  dpiitNumber: 'DIPP265455',
  sector: 'Green Technology / Waste Management',
  supportPhone: '+91 7676272709 / +91 9591883174',
  supportEmail: 'support@junkitout.in',
  headquarters: 'Bengaluru, Karnataka, India',
  dispatchSlaMinutes: 30,
  autoAssignEnabled: true,
  instantQuotation: true,
  maxServiceRadiusKm: 25,
  operatingHours: '08:00 AM - 08:00 PM',
  razorpayKeyId: 'rzp_live_JunkItOut2026',
  whatsappApiStatus: 'CONNECTED',
  smsGatewayStatus: 'OPERATIONAL',
  sessionTimeoutMinutes: 60,
  requireDangerousActionOtp: true,
};

type ActiveTab = 'business' | 'dispatch' | 'integrations' | 'security';

export default function AdminSettingsPage() {
  const [settings, setSettings] = useState<SystemSettingsConfig>(INITIAL_SETTINGS);
  const [savedSettings, setSavedSettings] = useState<SystemSettingsConfig>(INITIAL_SETTINGS);
  const [activeTab, setActiveTab] = useState<ActiveTab>('business');

  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fetchSettings = useCallback(async (isManualRefresh = false) => {
    try {
      if (isManualRefresh) setRefreshing(true);
      else setLoading(true);
      setErrorMessage(null);

      const res = await fetch('/api/admin/settings');
      if (!res.ok) {
        throw new Error(`Failed to load system settings: ${res.statusText}`);
      }

      const json = await res.json();
      if (json.success && json.data) {
        setSettings(json.data);
        setSavedSettings(json.data);
      } else {
        throw new Error(json.message || 'Unable to retrieve settings');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to load settings');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const handleSave = async () => {
    try {
      setSaving(true);
      setErrorMessage(null);
      setSuccessMessage(null);

      // Client-side validation
      if (!settings.companyName.trim()) {
        throw new Error('Registered company name is required.');
      }
      if (settings.companyName.trim().length < 3) {
        throw new Error('Registered company name must be at least 3 characters.');
      }
      if (settings.dispatchSlaMinutes < 5 || settings.dispatchSlaMinutes > 300) {
        throw new Error('Dispatch SLA target must be between 5 and 300 minutes.');
      }
      if (settings.maxServiceRadiusKm < 1 || settings.maxServiceRadiusKm > 150) {
        throw new Error('Service radius must be between 1 and 150 km.');
      }

      const res = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.message || 'Failed to update system settings');
      }

      setSavedSettings(json.data);
      setSettings(json.data);
      setSuccessMessage('System configuration saved and committed to immutable audit ledger.');

      setTimeout(() => {
        setSuccessMessage(null);
      }, 5000);
    } catch (err: any) {
      setErrorMessage(err.message || 'Error saving settings');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setSettings({ ...savedSettings });
    setErrorMessage(null);
    setSuccessMessage('Changes reverted to last saved configuration.');
    setTimeout(() => {
      setSuccessMessage(null);
    }, 3000);
  };

  const isDirty = JSON.stringify(settings) !== JSON.stringify(savedSettings);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
        <div>
          <span className="text-xs font-bold text-emerald-700 bg-emerald-100 px-3 py-1 rounded-full uppercase tracking-wider inline-flex items-center gap-1.5">
            <Settings className="w-3.5 h-3.5" /> System Configuration & Governance
          </span>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight mt-1.5">
            API & Business Settings
          </h1>
          <p className="text-xs text-slate-500">
            Operational parameters, enterprise details, integration statuses, and dispatch defaults.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => fetchSettings(true)}
            disabled={refreshing || saving}
            className="flex items-center gap-2 px-3.5 py-2 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-all shadow-sm active:scale-95 disabled:opacity-50"
          >
            <RotateCcw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            onClick={handleReset}
            disabled={!isDirty || saving}
            className="flex items-center gap-2 px-3.5 py-2 text-xs font-bold text-slate-600 bg-slate-50 hover:bg-slate-100 rounded-xl transition-all shadow-sm active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed border border-slate-200"
          >
            <Undo2 className="w-3.5 h-3.5" />
            Reset
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-xl transition-all shadow-sm active:scale-95 disabled:opacity-50"
          >
            <Save className={`w-3.5 h-3.5 ${saving ? 'animate-pulse' : ''}`} />
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>

      {/* Success / Error Feedback Banners */}
      {successMessage && (
        <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-200 text-xs font-bold text-emerald-800 flex items-center justify-between animate-in fade-in duration-200">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{successMessage}</span>
          </div>
          <button onClick={() => setSuccessMessage(null)} className="text-emerald-600 hover:text-emerald-800">
            ✕
          </button>
        </div>
      )}

      {errorMessage && (
        <div className="p-4 bg-rose-50 rounded-2xl border border-rose-200 text-xs font-bold text-rose-800 flex items-center justify-between animate-in fade-in duration-200">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{errorMessage}</span>
          </div>
          <button onClick={() => setErrorMessage(null)} className="text-rose-600 hover:text-rose-800">
            ✕
          </button>
        </div>
      )}

      {/* Tabs Navigation */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2 overflow-x-auto">
        <button
          onClick={() => setActiveTab('business')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-extrabold transition-all whitespace-nowrap ${
            activeTab === 'business'
              ? 'bg-slate-900 text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
          }`}
        >
          <Building2 className="w-3.5 h-3.5" />
          Business Identity
        </button>

        <button
          onClick={() => setActiveTab('dispatch')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-extrabold transition-all whitespace-nowrap ${
            activeTab === 'dispatch'
              ? 'bg-slate-900 text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
          }`}
        >
          <Truck className="w-3.5 h-3.5" />
          Dispatch & Operations
        </button>

        <button
          onClick={() => setActiveTab('integrations')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-extrabold transition-all whitespace-nowrap ${
            activeTab === 'integrations'
              ? 'bg-slate-900 text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          Gateways & Integrations
        </button>

        <button
          onClick={() => setActiveTab('security')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-extrabold transition-all whitespace-nowrap ${
            activeTab === 'security'
              ? 'bg-slate-900 text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
          }`}
        >
          <Shield className="w-3.5 h-3.5" />
          Security & Governance
        </button>
      </div>

      {/* Main Settings Card */}
      <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
        {loading ? (
          <div className="p-12 text-center text-slate-400 text-xs font-bold space-y-2">
            <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto" />
            <p>Loading system configuration...</p>
          </div>
        ) : (
          <div>
            {/* TAB 1: Business Identity */}
            {activeTab === 'business' && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-sm font-extrabold text-slate-900 uppercase tracking-wider">
                    Enterprise Registration & Entity Profile
                  </h3>
                  <p className="text-xs text-slate-500">
                    Legal company information displayed across customer receipts, invoices, and agreements.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                      <Building2 className="w-3.5 h-3.5 text-slate-400" />
                      Registered Entity Name *
                    </label>
                    <input
                      type="text"
                      value={settings.companyName}
                      onChange={(e) => setSettings({ ...settings, companyName: e.target.value })}
                      placeholder="e.g. Junk It Out Technologies Private Limited"
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-slate-900"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                      <Flame className="w-3.5 h-3.5 text-orange-500" />
                      DPIIT Startup Recognition Number
                    </label>
                    <input
                      type="text"
                      value={settings.dpiitNumber}
                      onChange={(e) => setSettings({ ...settings, dpiitNumber: e.target.value })}
                      placeholder="e.g. DIPP265455"
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-slate-900 font-mono"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                      <Radio className="w-3.5 h-3.5 text-slate-400" />
                      Industry Sector / Domain
                    </label>
                    <input
                      type="text"
                      value={settings.sector}
                      onChange={(e) => setSettings({ ...settings, sector: e.target.value })}
                      placeholder="e.g. Green Technology / Waste Management"
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-slate-900"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-slate-400" />
                      Operational Headquarters
                    </label>
                    <input
                      type="text"
                      value={settings.headquarters}
                      onChange={(e) => setSettings({ ...settings, headquarters: e.target.value })}
                      placeholder="e.g. Bengaluru, Karnataka, India"
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-slate-900"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                      <Phone className="w-3.5 h-3.5 text-slate-400" />
                      Primary Support Contact Numbers
                    </label>
                    <input
                      type="text"
                      value={settings.supportPhone}
                      onChange={(e) => setSettings({ ...settings, supportPhone: e.target.value })}
                      placeholder="e.g. +91 7676272709 / +91 9591883174"
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-slate-900 font-mono"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                      <Mail className="w-3.5 h-3.5 text-slate-400" />
                      Official Support Email Address
                    </label>
                    <input
                      type="email"
                      value={settings.supportEmail}
                      onChange={(e) => setSettings({ ...settings, supportEmail: e.target.value })}
                      placeholder="e.g. support@junkitout.in"
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-slate-900 font-mono"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* TAB 2: Dispatch & Operations */}
            {activeTab === 'dispatch' && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-sm font-extrabold text-slate-900 uppercase tracking-wider">
                    Logistics & Pickup Routing Parameters
                  </h3>
                  <p className="text-xs text-slate-500">
                    Control agent routing boundaries, dispatch SLA thresholds, and booking automation.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-slate-400" />
                      Dispatch SLA Target (Minutes) *
                    </label>
                    <input
                      type="number"
                      min={5}
                      max={300}
                      value={settings.dispatchSlaMinutes}
                      onChange={(e) => setSettings({ ...settings, dispatchSlaMinutes: Number(e.target.value) })}
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-slate-900 font-mono"
                    />
                    <p className="text-[11px] text-slate-400">Target response window for assigning nearby pickup agents.</p>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-slate-400" />
                      Maximum Service Radius (Kilometers) *
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={150}
                      value={settings.maxServiceRadiusKm}
                      onChange={(e) => setSettings({ ...settings, maxServiceRadiusKm: Number(e.target.value) })}
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-slate-900 font-mono"
                    />
                    <p className="text-[11px] text-slate-400">Furthest distance an agent can be routed from hub centers.</p>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-slate-400" />
                      Standard Operating Hours
                    </label>
                    <input
                      type="text"
                      value={settings.operatingHours}
                      onChange={(e) => setSettings({ ...settings, operatingHours: e.target.value })}
                      placeholder="e.g. 08:00 AM - 08:00 PM"
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-slate-900"
                    />
                  </div>

                  <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-xs font-bold text-slate-900">Auto-Assign Nearby Field Agents</div>
                        <div className="text-[11px] text-slate-500">Automatically broadcast booking to available agents in polygon.</div>
                      </div>
                      <input
                        type="checkbox"
                        checked={settings.autoAssignEnabled}
                        onChange={(e) => setSettings({ ...settings, autoAssignEnabled: e.target.checked })}
                        className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                      />
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-slate-200">
                      <div>
                        <div className="text-xs font-bold text-slate-900">Instant Scrap Valuation Mode</div>
                        <div className="text-[11px] text-slate-500">Display authoritative unit scrap prices before customer confirmation.</div>
                      </div>
                      <input
                        type="checkbox"
                        checked={settings.instantQuotation}
                        onChange={(e) => setSettings({ ...settings, instantQuotation: e.target.checked })}
                        className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 3: Gateways & Integrations */}
            {activeTab === 'integrations' && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-sm font-extrabold text-slate-900 uppercase tracking-wider">
                    External API Gateways & Connectivity
                  </h3>
                  <p className="text-xs text-slate-500">
                    Configuration and health monitors for payment processors, SMS providers, and WhatsApp Cloud.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                      <Key className="w-3.5 h-3.5 text-slate-400" />
                      Razorpay Key ID
                    </label>
                    <input
                      type="text"
                      value={settings.razorpayKeyId}
                      onChange={(e) => setSettings({ ...settings, razorpayKeyId: e.target.value })}
                      placeholder="e.g. rzp_live_JunkItOut2026"
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-slate-900 font-mono"
                    />
                    <div className="text-[11px] text-slate-400 flex items-center gap-1 mt-1">
                      <Lock className="w-3 h-3 text-emerald-600" />
                      Razorpay Key Secret is encrypted and managed via environment secrets.
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                      <MessageSquare className="w-3.5 h-3.5 text-emerald-600" />
                      WhatsApp Cloud API Channel Status
                    </label>
                    <select
                      value={settings.whatsappApiStatus}
                      onChange={(e) => setSettings({ ...settings, whatsappApiStatus: e.target.value as any })}
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                    >
                      <option value="CONNECTED">CONNECTED (Production Gateway Active)</option>
                      <option value="MAINTENANCE">MAINTENANCE (Degraded Queue Mode)</option>
                      <option value="DISCONNECTED">DISCONNECTED (Offline)</option>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                      <Smartphone className="w-3.5 h-3.5 text-blue-600" />
                      Fast2SMS Gateway Status
                    </label>
                    <select
                      value={settings.smsGatewayStatus}
                      onChange={(e) => setSettings({ ...settings, smsGatewayStatus: e.target.value as any })}
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                    >
                      <option value="OPERATIONAL">OPERATIONAL (Template OTPs Enabled)</option>
                      <option value="DEGRADED">DEGRADED (High Latency Alerts)</option>
                      <option value="OFFLINE">OFFLINE (Disabled)</option>
                    </select>
                  </div>

                  <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-2">
                    <div className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-emerald-600" />
                      PostGIS Geofence Serviceability Engine
                    </div>
                    <p className="text-[11px] text-slate-500">
                      Polygon containment checks are executed against localized database coordinates without relying on external geocoding calls.
                    </p>
                    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-100 text-emerald-800 rounded-md text-[10px] font-extrabold uppercase">
                      Engine Status: Operational & Verified
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 4: Security & Governance */}
            {activeTab === 'security' && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-sm font-extrabold text-slate-900 uppercase tracking-wider">
                    Administrative Access & Session Governance
                  </h3>
                  <p className="text-xs text-slate-500">
                    Session timeout policies, multi-factor verification triggers, and active administrator session status.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-slate-400" />
                      Session Inactivity Timeout (Minutes)
                    </label>
                    <select
                      value={settings.sessionTimeoutMinutes}
                      onChange={(e) => setSettings({ ...settings, sessionTimeoutMinutes: Number(e.target.value) })}
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                    >
                      <option value="15">15 Minutes (Strict Security Mode)</option>
                      <option value="30">30 Minutes (Standard Operations)</option>
                      <option value="60">60 Minutes (Default)</option>
                      <option value="240">240 Minutes (Extended Ops Shift)</option>
                    </select>
                  </div>

                  <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 flex items-center justify-between">
                    <div>
                      <div className="text-xs font-bold text-slate-900">OTP Guard for Dangerous Mutations</div>
                      <div className="text-[11px] text-slate-500">
                        Require re-authentication OTP before deleting waste categories, zones or admins.
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={settings.requireDangerousActionOtp}
                      onChange={(e) => setSettings({ ...settings, requireDangerousActionOtp: e.target.checked })}
                      className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                    />
                  </div>

                  <div className="col-span-1 md:col-span-2 bg-slate-900 text-white p-5 rounded-2xl border border-slate-800 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Shield className="w-4 h-4 text-emerald-400" />
                        <span className="text-xs font-bold tracking-wide">Active Administrator Credentials</span>
                      </div>
                      <span className="text-[10px] font-extrabold uppercase bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-full">
                        Authenticated Session Active
                      </span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs pt-1">
                      <div>
                        <span className="text-slate-400 block text-[10px] uppercase font-bold">Name</span>
                        <span className="font-bold text-white">Manoj Kumar M</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[10px] uppercase font-bold">Mobile</span>
                        <span className="font-mono text-white">+91 8123767934</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[10px] uppercase font-bold">Role</span>
                        <span className="font-bold text-emerald-400">ADMIN</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[10px] uppercase font-bold">Permissions</span>
                        <span className="font-bold text-white">FULL ACCESS</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
