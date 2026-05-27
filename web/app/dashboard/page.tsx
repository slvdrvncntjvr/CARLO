"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { 
  getInventory, 
  getLeads, 
  getCalls, 
  addInventory, 
  updateCarStatus, 
  Car, 
  Lead, 
  CallLog 
} from "@/services/api";

type Tab = "inventory" | "leads" | "calls" | "settings";

export default function DashboardPage() {
  const [activeTab, setActiveTab] = useState<Tab>("inventory");
  const [cars, setCars] = useState<Car[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [calls, setCalls] = useState<CallLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Add Car Form State
  const [showAddModal, setShowAddModal] = useState(false);
  const [newCar, setNewCar] = useState({
    make: "",
    model: "",
    year: new Date().getFullYear(),
    color: "",
    mileage: 0,
    transmission: "Automatic",
    fuel_type: "Gasoline",
    condition: "Excellent",
    asking_price: 0,
    floor_price: 0,
    location: "Manila",
    registration_expiry: "",
    accident_free: 1,
  });

  // Settings State
  const [settings, setSettings] = useState({
    dealershipName: "Carlo Motors Manila",
    greetingMessage: "Hello! Ako si CARLO, ang inyong virtual sales assistant. Naghahanap ba kayo ng de-kalidad na sasakyan?",
    language: "Taglish",
    showFloorPrices: false
  });
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Lead Transcripts Expanded State
  const [expandedLeadId, setExpandedLeadId] = useState<number | null>(null);

  // Fetch all dashboard data
  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [inventoryData, leadsData, callsData] = await Promise.all([
        getInventory(),
        getLeads(),
        getCalls()
      ]);
      setCars(inventoryData);
      setLeads(leadsData);
      setCalls(callsData);
    } catch (err) {
      console.error("Error loading dashboard data:", err);
      setError("Failed to fetch dashboard records. Make sure the backend server is running.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleStatusToggle = async (carId: number, currentStatus: string) => {
    const newStatus = currentStatus === "available" ? "sold" : "available";
    try {
      await updateCarStatus(carId, newStatus);
      setCars(prev => prev.map(c => c.id === carId ? { ...c, status: newStatus } : c));
    } catch (err) {
      console.error("Failed to update status:", err);
      alert("Error updating unit status.");
    }
  };

  const handleAddCarSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await addInventory(newCar);
      setShowAddModal(false);
      // Reset form
      setNewCar({
        make: "",
        model: "",
        year: new Date().getFullYear(),
        color: "",
        mileage: 0,
        transmission: "Automatic",
        fuel_type: "Gasoline",
        condition: "Excellent",
        asking_price: 0,
        floor_price: 0,
        location: "Manila",
        registration_expiry: "",
        accident_free: 1,
      });
      // Refresh inventory
      fetchData();
    } catch (err) {
      console.error("Error adding car:", err);
      alert("Error adding vehicle. Please verify input data.");
    }
  };

  const handleSaveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3000);
  };

  // Helper formatting functions
  const formatDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString("en-PH", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit"
      });
    } catch {
      return dateStr;
    }
  };

  const formatDuration = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  return (
    <div className="flex h-screen bg-slate-50 text-slate-800 font-sans overflow-hidden">
      {/* Sidebar Navigation */}
      <aside className="w-64 bg-white border-r border-slate-200 flex flex-col justify-between">
        <div>
          <div className="p-6 border-b border-slate-100 flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-emerald-500 flex items-center justify-center text-white font-bold text-lg">
              C
            </div>
            <div>
              <h1 className="font-extrabold text-slate-900 leading-none">CARLO</h1>
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                Dealership CRM
              </span>
            </div>
          </div>
          
          <nav className="p-4 space-y-1">
            <button
              onClick={() => setActiveTab("inventory")}
              className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors cursor-pointer ${
                activeTab === "inventory" 
                  ? "bg-emerald-50 text-emerald-700" 
                  : "text-slate-500 hover:bg-slate-100 hover:text-slate-800"
              }`}
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
              </svg>
              Inventory Units
            </button>

            <button
              onClick={() => setActiveTab("leads")}
              className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors cursor-pointer ${
                activeTab === "leads" 
                  ? "bg-emerald-50 text-emerald-700" 
                  : "text-slate-500 hover:bg-slate-100 hover:text-slate-800"
              }`}
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
              CRM Leads
              {leads.filter(l => l.lead_score === "Hot").length > 0 && (
                <span className="ml-auto bg-emerald-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                  {leads.filter(l => l.lead_score === "Hot").length} Hot
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab("calls")}
              className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors cursor-pointer ${
                activeTab === "calls" 
                  ? "bg-emerald-50 text-emerald-700" 
                  : "text-slate-500 hover:bg-slate-100 hover:text-slate-800"
              }`}
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.94.725l.548 2.2a1 1 0 00.91.686h1.5a1 1 0 00.91-.686l.549-2.2a1 1 0 01.94-.725H19a2 2 0 012 2v3.28a1 1 0 01-.725.94l-2.2.549a1 1 0 00-.686.91v1.5a1 1 0 00.686.91l2.2.549a1 1 0 01.725.94V19a2 2 0 01-2 2h-3.28a1 1 0 01-.94-.725l-.548-2.2a1 1 0 00-.91-.686h-1.5a1 1 0 00-.91.686l-.549 2.2a1 1 0 01-.94.725H5a2 2 0 01-2-2v-3.28a1 1 0 01.725-.94l2.2-.549a1 1 0 00.686-.91v-1.5a1 1 0 00-.686-.91l-2.2-.549A1 1 0 013 9.28V5z" />
              </svg>
              Call History
            </button>

            <button
              onClick={() => setActiveTab("settings")}
              className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors cursor-pointer ${
                activeTab === "settings" 
                  ? "bg-emerald-50 text-emerald-700" 
                  : "text-slate-500 hover:bg-slate-100 hover:text-slate-800"
              }`}
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Settings
            </button>
          </nav>
        </div>

        <div className="p-4 border-t border-slate-100 text-center">
          <button
            onClick={fetchData}
            className="w-full flex items-center justify-center gap-2 py-2 border border-slate-200 hover:bg-slate-50 rounded-xl text-xs font-semibold text-slate-600 transition-all cursor-pointer"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.21 8H18.5" />
            </svg>
            Sync Data
          </button>
        </div>
      </aside>

      {/* Main Content Dashboard */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        
        {/* Header */}
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-8 z-10">
          <div>
            <h2 className="text-xl font-bold text-slate-900 capitalize">
              {activeTab === "calls" ? "Call logs" : activeTab}
            </h2>
          </div>
          
          <div className="flex items-center gap-4">
            {activeTab === "inventory" && (
              <button
                onClick={() => setShowAddModal(true)}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-semibold transition-all cursor-pointer"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                </svg>
                Add Unit
              </button>
            )}
            <span className="text-xs text-slate-400 font-medium">Dealer: {settings.dealershipName}</span>
          </div>
        </header>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-8">
          
          {loading ? (
            <div className="h-full flex items-center justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500"></div>
            </div>
          ) : error ? (
            <div className="max-w-md mx-auto bg-red-50 border border-red-200 text-red-700 rounded-xl p-4 text-center">
              <p className="font-semibold text-sm">{error}</p>
              <button onClick={fetchData} className="mt-3 text-xs bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer">
                Try Re-syncing
              </button>
            </div>
          ) : (
            <>
              {/* INVENTORY TAB */}
              {activeTab === "inventory" && (
                <div className="space-y-6">
                  {/* Summary Stats Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                    <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
                      <span className="text-slate-400 text-xs font-semibold uppercase tracking-wider block">Total Vehicles</span>
                      <span className="text-3xl font-extrabold text-slate-900 mt-1 block">{cars.length} Units</span>
                    </div>
                    <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
                      <span className="text-slate-400 text-xs font-semibold uppercase tracking-wider block">Available</span>
                      <span className="text-3xl font-extrabold text-emerald-600 mt-1 block">
                        {cars.filter(c => c.status === "available").length} Units
                      </span>
                    </div>
                    <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
                      <span className="text-slate-400 text-xs font-semibold uppercase tracking-wider block">Sold</span>
                      <span className="text-3xl font-extrabold text-slate-400 mt-1 block">
                        {cars.filter(c => c.status === "sold").length} Units
                      </span>
                    </div>
                  </div>

                  {/* Cars Grid */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
                    {cars.map((car) => (
                      <div key={car.id} className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm flex flex-col justify-between">
                        <div className="p-6">
                          <div className="flex justify-between items-start mb-2">
                            <span className="text-xs font-bold text-slate-400 uppercase tracking-wide">
                              {car.year} Model
                            </span>
                            <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                              car.status === "available" 
                                ? "bg-emerald-100 text-emerald-700 border border-emerald-200" 
                                : "bg-slate-100 text-slate-500 border border-slate-200"
                            }`}>
                              {car.status}
                            </span>
                          </div>
                          
                          <h3 className="text-xl font-bold text-slate-900 mb-1">{car.make} {car.model}</h3>
                          <div className="text-2xl font-extrabold text-slate-900 mb-4">₱{car.asking_price.toLocaleString()}</div>
                          
                          <div className="grid grid-cols-2 gap-y-2 gap-x-4 text-xs text-slate-600 border-t border-b border-slate-100 py-3 mb-4">
                            <div><span className="text-slate-400 block text-[10px]">Transmission</span><strong>{car.transmission}</strong></div>
                            <div><span className="text-slate-400 block text-[10px]">Mileage</span><strong>{car.mileage.toLocaleString()} km</strong></div>
                            <div><span className="text-slate-400 block text-[10px]">Fuel</span><strong>{car.fuel_type}</strong></div>
                            <div><span className="text-slate-400 block text-[10px]">Location</span><strong>{car.location}</strong></div>
                          </div>

                          {/* Floor price confidential lock block */}
                          <div className="flex items-center gap-2 bg-slate-50 border border-slate-200/60 rounded-xl px-3 py-2 text-xs text-slate-500 mb-2">
                            <svg className="h-4 w-4 text-slate-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                            </svg>
                            <div className="flex-1 flex justify-between items-center">
                              <span>Internal Floor Price:</span>
                              <span className="font-bold text-slate-700 font-mono">
                                {settings.showFloorPrices ? `₱${car.floor_price.toLocaleString()}` : "₱•••,•••"}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="px-6 pb-6 pt-2 flex items-center justify-between gap-3 bg-slate-50/50 border-t border-slate-100">
                          {/* Status toggle */}
                          <button
                            onClick={() => handleStatusToggle(car.id, car.status)}
                            className="text-xs font-semibold text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
                          >
                            Mark as {car.status === "available" ? "Sold" : "Available"}
                          </button>

                          {/* Live test voice call launcher */}
                          <Link
                            href={`/call/${car.id}`}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-[0_2px_8px_rgba(16,185,129,0.15)] transition-all cursor-pointer"
                          >
                            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.94.725l.548 2.2a1 1 0 00.91.686h1.5a1 1 0 00.91-.686l.549-2.2a1 1 0 01.94-.725H19a2 2 0 012 2v3.28a1 1 0 01-.725.94l-2.2.549a1 1 0 00-.686.91v1.5a1 1 0 00.686.91l2.2.549a1 1 0 01.725.94V19a2 2 0 01-2 2h-3.28a1 1 0 01-.94-.725l-.548-2.2a1 1 0 00-.91-.686h-1.5a1 1 0 00-.91.686l-.549 2.2a1 1 0 01-.94.725H5a2 2 0 01-2-2v-3.28a1 1 0 01.725-.94l2.2-.549a1 1 0 00.686-.91v-1.5a1 1 0 00-.686-.91l-2.2-.549A1 1 0 013 9.28V5z" />
                            </svg>
                            Test Call
                          </Link>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* LEADS TAB */}
              {activeTab === "leads" && (
                <div className="space-y-6">
                  {leads.length === 0 ? (
                    <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center text-slate-400">
                      <svg className="h-12 w-12 mx-auto mb-4 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                      </svg>
                      <h3 className="text-lg font-bold mb-1">No Leads Captured Yet</h3>
                      <p className="text-sm max-w-sm mx-auto">Leads are generated automatically by CARLO at the end of a successful phone call conversation.</p>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      {leads.map((lead) => (
                        <div key={lead.id} className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                          <div className="p-6">
                            {/* Lead header card */}
                            <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3 border-b border-slate-100 pb-4 mb-4">
                              <div className="flex items-center gap-3">
                                <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${
                                  lead.lead_score === "Hot" 
                                    ? "bg-red-500/10 text-red-600 border border-red-500/20"
                                    : lead.lead_score === "Warm"
                                      ? "bg-amber-500/10 text-amber-600 border border-amber-500/20"
                                      : "bg-slate-100 text-slate-500 border border-slate-200"
                                }`}>
                                  {lead.lead_score} Lead
                                </span>
                                <span className="text-xs text-slate-400">{formatDate(lead.created_at)}</span>
                              </div>
                              <div className="text-xs font-bold text-slate-500">
                                Car: <span className="text-slate-900">{lead.year} {lead.make} {lead.model}</span> (₱{lead.asking_price.toLocaleString()})
                              </div>
                            </div>
                            
                            {/* Lead body details */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
                              <div>
                                <span className="text-slate-400 text-xs font-semibold uppercase tracking-wider block">Buyer Info</span>
                                <span className="font-bold text-slate-900 block mt-1">{lead.buyer_name || "Anonymous Caller"}</span>
                                {lead.buyer_phone ? (
                                  <a href={`tel:${lead.buyer_phone}`} className="text-sm text-emerald-600 hover:text-emerald-700 font-mono font-bold mt-0.5 block hover:underline">
                                    {lead.buyer_phone}
                                  </a>
                                ) : (
                                  <span className="text-xs italic text-slate-400 mt-0.5 block">No Phone Number</span>
                                )}
                              </div>
                              <div>
                                <span className="text-slate-400 text-xs font-semibold uppercase tracking-wider block">Final offer discussed</span>
                                <span className="font-extrabold text-slate-900 block mt-1">
                                  {lead.final_offer ? `₱${lead.final_offer.toLocaleString()}` : "No Offer Made"}
                                </span>
                                <span className="text-xs text-slate-500 mt-0.5 block">Status: <strong>{lead.outcome}</strong></span>
                              </div>
                              <div>
                                <span className="text-slate-400 text-xs font-semibold uppercase tracking-wider block">CARLO Summary</span>
                                <p className="text-sm text-slate-600 mt-1 font-medium leading-relaxed">{lead.summary}</p>
                              </div>
                            </div>

                            {/* Conversation transcript expand button */}
                            <div className="flex justify-start">
                              <button
                                onClick={() => setExpandedLeadId(expandedLeadId === lead.id ? null : lead.id)}
                                className="flex items-center gap-1 text-xs font-bold text-emerald-600 hover:text-emerald-700 transition-colors cursor-pointer"
                              >
                                {expandedLeadId === lead.id ? (
                                  <>
                                    <span>Hide Transcript</span>
                                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 15l7-7 7 7" />
                                    </svg>
                                  </>
                                ) : (
                                  <>
                                    <span>View Conversation Transcript</span>
                                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" />
                                    </svg>
                                  </>
                                )}
                              </button>
                            </div>
                          </div>

                          {/* Expanded scrollable transcript */}
                          {expandedLeadId === lead.id && (
                            <div className="bg-slate-50 border-t border-slate-200/80 p-6">
                              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">Call Transcription</h4>
                              {/* Search for call transcription log matching this lead */}
                              {(() => {
                                // Find call by car_id and name/date approximate matching
                                const matchedCall = calls.find(c => c.car_id === lead.car_id);
                                if (!matchedCall || !matchedCall.transcript) {
                                  return <div className="text-xs italic text-slate-400">Complete dialogue is archived under Call History.</div>;
                                }
                                return (
                                  <div className="max-h-60 overflow-y-auto space-y-4 pr-2 font-sans text-xs">
                                    {matchedCall.transcript.split("\n").map((line, lidx) => {
                                      const isCarlo = line.startsWith("Carlo:") || line.startsWith("CARLO:");
                                      const cleanLine = line.replace(/^(Carlo|Buyer|CARLO|Customer|User):\s*/i, "");
                                      return (
                                        <div key={lidx} className={`flex ${isCarlo ? 'justify-start' : 'justify-end'}`}>
                                          <div className={`max-w-[80%] rounded-2xl px-4 py-2 ${
                                            isCarlo 
                                              ? 'bg-emerald-50 text-emerald-800 border border-emerald-100 rounded-tl-none font-medium' 
                                              : 'bg-white border border-slate-200 text-slate-800 rounded-tr-none shadow-sm'
                                          }`}>
                                            <span className="font-bold text-[10px] block opacity-50 mb-0.5">{isCarlo ? 'CARLO' : 'Customer'}</span>
                                            {cleanLine}
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                );
                              })()}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* CALL LOGS TAB */}
              {activeTab === "calls" && (
                <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                  {calls.length === 0 ? (
                    <div className="p-12 text-center text-slate-400">
                      <svg className="h-12 w-12 mx-auto mb-4 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <h3 className="text-lg font-bold mb-1">No Call Logs</h3>
                      <p className="text-sm">Call recordings will appear here once audio connections are established.</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-slate-50 text-slate-400 text-xs font-semibold uppercase tracking-wider border-b border-slate-200">
                            <th className="p-4 pl-6">Time Started</th>
                            <th className="p-4">Car Discussed</th>
                            <th className="p-4">Duration</th>
                            <th className="p-4">Session ID</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-sm">
                          {calls.map((call) => (
                            <tr key={call.id} className="hover:bg-slate-50/50 transition-colors">
                              <td className="p-4 pl-6 font-medium text-slate-700">{formatDate(call.created_at)}</td>
                              <td className="p-4 text-slate-900 font-semibold">
                                {call.year} {call.make} {call.model}
                              </td>
                              <td className="p-4 font-mono font-medium text-slate-600">{formatDuration(call.duration)}</td>
                              <td className="p-4 text-xs font-mono text-slate-400">{call.session_id.substring(0, 16)}...</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* SETTINGS TAB */}
              {activeTab === "settings" && (
                <div className="max-w-2xl bg-white border border-slate-200 rounded-2xl p-8 shadow-sm">
                  <form onSubmit={handleSaveSettings} className="space-y-6">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Dealership Name</label>
                      <input 
                        type="text" 
                        value={settings.dealershipName}
                        onChange={(e) => setSettings({ ...settings, dealershipName: e.target.value })}
                        className="w-full border border-slate-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-emerald-500"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">CARLO Voice Greeting Message</label>
                      <textarea 
                        value={settings.greetingMessage}
                        onChange={(e) => setSettings({ ...settings, greetingMessage: e.target.value })}
                        rows={3}
                        className="w-full border border-slate-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-emerald-500"
                        required
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-6">
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Negotiation Language</label>
                        <select 
                          value={settings.language}
                          onChange={(e) => setSettings({ ...settings, language: e.target.value })}
                          className="w-full border border-slate-200 bg-white rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-emerald-500"
                        >
                          <option value="Taglish">Taglish (Filipino/English)</option>
                          <option value="English">English Only</option>
                          <option value="Tagalog">Pure Tagalog</option>
                        </select>
                      </div>

                      <div className="flex items-center pt-6">
                        <label className="flex items-center gap-2 text-sm text-slate-600 font-semibold cursor-pointer">
                          <input 
                            type="checkbox"
                            checked={settings.showFloorPrices}
                            onChange={(e) => setSettings({ ...settings, showFloorPrices: e.target.checked })}
                            className="h-4 w-4 border-slate-300 rounded text-emerald-600 focus:ring-emerald-500"
                          />
                          Reveal Floor Prices in CRM
                        </label>
                      </div>
                    </div>

                    <div className="border-t border-slate-100 pt-6 flex items-center justify-between">
                      <button
                        type="submit"
                        className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-sm transition-all cursor-pointer"
                      >
                        Save Configurations
                      </button>

                      {saveSuccess && (
                        <span className="text-xs text-emerald-600 font-semibold flex items-center gap-1 animate-pulse">
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
                          </svg>
                          Settings updated successfully
                        </span>
                      )}
                    </div>
                  </form>
                </div>
              )}
            </>
          )}
        </div>
      </main>

      {/* Add Car Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-xl w-full border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            
            <header className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <h3 className="font-bold text-slate-900 text-lg">Add Vehicle Profile</h3>
              <button 
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </header>

            <form onSubmit={handleAddCarSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Make</label>
                  <input 
                    type="text" 
                    placeholder="e.g. Toyota" 
                    value={newCar.make}
                    onChange={(e) => setNewCar({ ...newCar, make: e.target.value })}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-emerald-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Model</label>
                  <input 
                    type="text" 
                    placeholder="e.g. Vios" 
                    value={newCar.model}
                    onChange={(e) => setNewCar({ ...newCar, model: e.target.value })}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-emerald-500"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Year</label>
                  <input 
                    type="number" 
                    value={newCar.year}
                    onChange={(e) => setNewCar({ ...newCar, year: Number(e.target.value) })}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-emerald-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Color</label>
                  <input 
                    type="text" 
                    placeholder="e.g. Red" 
                    value={newCar.color}
                    onChange={(e) => setNewCar({ ...newCar, color: e.target.value })}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-emerald-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Mileage (km)</label>
                  <input 
                    type="number" 
                    value={newCar.mileage}
                    onChange={(e) => setNewCar({ ...newCar, mileage: Number(e.target.value) })}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-emerald-500"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                {/* Asking price */}
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Asking Price (₱)</label>
                  <input 
                    type="number" 
                    placeholder="e.g. 480000" 
                    value={newCar.asking_price || ""}
                    onChange={(e) => setNewCar({ ...newCar, asking_price: Number(e.target.value) })}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-emerald-500 font-bold"
                    required
                  />
                </div>
                {/* Floor price confidential lock input */}
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1 flex items-center gap-1">
                    <svg className="h-3 w-3 text-slate-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                    Floor Price (Confidential)
                  </label>
                  <input 
                    type="number" 
                    placeholder="e.g. 430000" 
                    value={newCar.floor_price || ""}
                    onChange={(e) => setNewCar({ ...newCar, floor_price: Number(e.target.value) })}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-emerald-500 font-bold bg-[#fafbff]"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Transmission</label>
                  <select 
                    value={newCar.transmission}
                    onChange={(e) => setNewCar({ ...newCar, transmission: e.target.value })}
                    className="w-full border border-slate-200 bg-white rounded-lg px-2 py-2 text-xs focus:outline-none focus:border-emerald-500"
                  >
                    <option value="Automatic">Automatic</option>
                    <option value="Manual">Manual</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Fuel Type</label>
                  <select 
                    value={newCar.fuel_type}
                    onChange={(e) => setNewCar({ ...newCar, fuel_type: e.target.value })}
                    className="w-full border border-slate-200 bg-white rounded-lg px-2 py-2 text-xs focus:outline-none focus:border-emerald-500"
                  >
                    <option value="Gasoline">Gasoline</option>
                    <option value="Diesel">Diesel</option>
                    <option value="Hybrid">Hybrid</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Condition</label>
                  <select 
                    value={newCar.condition}
                    onChange={(e) => setNewCar({ ...newCar, condition: e.target.value })}
                    className="w-full border border-slate-200 bg-white rounded-lg px-2 py-2 text-xs focus:outline-none focus:border-emerald-500"
                  >
                    <option value="Excellent">Excellent</option>
                    <option value="Very Good">Very Good</option>
                    <option value="Good">Good</option>
                    <option value="Fair">Fair</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Location</label>
                  <input 
                    type="text" 
                    placeholder="e.g. Pasig" 
                    value={newCar.location}
                    onChange={(e) => setNewCar({ ...newCar, location: e.target.value })}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-emerald-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">LTO Expiry Date</label>
                  <input 
                    type="date" 
                    value={newCar.registration_expiry}
                    onChange={(e) => setNewCar({ ...newCar, registration_expiry: e.target.value })}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-emerald-500"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">100% Accident Free?</label>
                <select 
                  value={newCar.accident_free}
                  onChange={(e) => setNewCar({ ...newCar, accident_free: Number(e.target.value) })}
                  className="w-full border border-slate-200 bg-white rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-emerald-500"
                >
                  <option value={1}>Yes, 100% accident-free record</option>
                  <option value={0}>No record / Has minor accidents</option>
                </select>
              </div>

              <footer className="border-t border-slate-100 pt-4 flex items-center justify-end gap-3 bg-slate-50/20 -mx-6 -mb-6 p-6">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 border border-slate-200 hover:bg-slate-50 rounded-xl text-xs font-semibold text-slate-600 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs shadow-md transition-all cursor-pointer"
                >
                  Save Vehicle Profile
                </button>
              </footer>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
