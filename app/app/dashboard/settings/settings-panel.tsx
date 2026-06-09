"use client";

import Link from "next/link";
import { useState, useRef } from "react";

import { useDashboardUser } from "@/app/app/dashboard/dashboard-user-context";

type SettingsPanelProps = {
  email?: string;
};

export function SettingsPanel({ email: emailProp }: SettingsPanelProps = {}) {
  const dashboardUser = useDashboardUser();
  const email = emailProp ?? dashboardUser.email;

  // Form states
  const [name, setName] = useState("Jane Doe");
  const [bio, setBio] = useState("Audio engineer and AI enthusiast building voice applications.");
  const [language, setLanguage] = useState("en");
  const [timezone, setTimezone] = useState("ict");
  
  // Security states
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(true);

  // Notification states
  const [weeklyReport, setWeeklyReport] = useState(true);
  const [productUpdates, setProductUpdates] = useState(false);
  const [generationCompletions, setGenerationCompletions] = useState(true);
  const [lowTokenWarnings, setLowTokenWarnings] = useState(true);

  // Loading/Feedback states
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMessage, setProfileMessage] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState("");

  // Profile avatar states & ref
  const [avatarUrl, setAvatarUrl] = useState(
    "https://lh3.googleusercontent.com/aida-public/AB6AXuDVnhNU2jNTo7mLWZx7jhPbz68QOO9cHOkcMwa7K8bQQnDqr08vIosOBLhnLyA5QBADRuvF-4Ni55VriOPnNl8vEuo76tgLIUDzscLdEgdeVrNvhXSs4iB6YOxllELFqMdHh1hi17l2Z67cUbpRkt6Z0_VpokA2UXYyeOarhxfPz5hTVJl2Rjj_Cx3p9_efLtd-6CiXNGjVighua6rgsnDWYHb6R4pfK2CGNHoU9cEChzLVAwoHgY9HiDIWcttxeSnDgOvKdOM8NF52"
  );
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setAvatarUrl(url);
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    setProfileMessage("");
    await new Promise((resolve) => setTimeout(resolve, 800));
    setSavingProfile(false);
    setProfileMessage("Profile updated successfully!");
    setTimeout(() => setProfileMessage(""), 3000);
  };

  const handleSavePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPassword) {
      setPasswordMessage("Please enter your current password.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordMessage("New passwords do not match.");
      return;
    }
    if (newPassword.length < 8) {
      setPasswordMessage("Password must be at least 8 characters.");
      return;
    }

    setSavingPassword(true);
    setPasswordMessage("");
    await new Promise((resolve) => setTimeout(resolve, 800));
    setSavingPassword(false);
    setPasswordMessage("Password updated successfully!");
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setTimeout(() => setPasswordMessage(""), 3000);
  };

  return (
    <section className="dashboard-enter grid gap-5">
      <header className="mb-8">
        <h2 className="font-headline text-5xl md:text-6xl font-black uppercase tracking-tighter text-primary mb-2">
          Settings
        </h2>
        <p className="text-xl text-[#4a4a4a] max-w-2xl font-body">
          Configure your account preferences, security settings, and system defaults.
        </p>
      </header>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-8">
        {/* Left Column: Profile & Regional */}
        <div className="xl:col-span-7 flex flex-col gap-8">
          {/* Profile Settings */}
          <section className="bg-white border-4 border-primary p-6 md:p-8 shadow-[4px_4px_0px_0px_#1a1a1a] relative">
            <div className="absolute -top-4 -left-4 bg-[#ffcc00] border-3 border-primary px-4 py-1 z-10 shadow-[4px_4px_0px_0px_#1a1a1a] font-headline font-bold uppercase text-primary">
              Profile
            </div>
            
            <form onSubmit={handleSaveProfile} className="mt-4 flex flex-col md:flex-row gap-8 items-start">
              <div className="flex flex-col items-center gap-4 shrink-0">
                <input
                  type="file"
                  ref={fileInputRef}
                  className="hidden"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={handleFileChange}
                />
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="w-32 h-32 border-4 border-primary overflow-hidden relative group cursor-pointer bg-[#f5f0e8] select-none"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    alt="Profile Avatar"
                    className="w-full h-full object-cover grayscale group-hover:grayscale-0 transition-all duration-300"
                    src={avatarUrl}
                  />
                  <div className="absolute inset-0 bg-[#1a1a1a]/85 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                    <span className="material-symbols-outlined text-[#f5f0e8] text-3xl">upload</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="font-label font-bold text-sm uppercase text-[#0055ff] hover:underline"
                >
                  Change Image
                </button>
              </div>

              <div className="flex-grow w-full space-y-6">
                <div>
                  <label className="block font-label font-bold uppercase text-sm mb-2 text-primary">
                    Full Name
                  </label>
                  <input
                    className="w-full border-[3px] border-primary bg-white p-3 font-body text-primary focus:outline-none focus:border-[#0055ff] transition-colors"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                  />
                </div>

                <div>
                  <label className="block font-label font-bold uppercase text-sm mb-2 text-primary flex justify-between">
                    Email Address
                    <span className="text-xs bg-[#f5f0e8] border-2 border-primary px-2 py-0.5 text-[#00a859] font-bold">
                      VERIFIED
                    </span>
                  </label>
                  <input
                    className="w-full border-[3px] border-primary bg-[#eee9e0] p-3 font-body text-[#4a4a4a] cursor-not-allowed outline-none select-none"
                    readOnly
                    type="email"
                    value={email}
                  />
                </div>

                <div>
                  <label className="block font-label font-bold uppercase text-sm mb-2 text-primary">
                    Bio / Description
                  </label>
                  <textarea
                    className="w-full border-[3px] border-primary bg-white p-3 font-body text-primary focus:outline-none focus:border-[#0055ff] transition-colors resize-none"
                    rows={3}
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                  />
                </div>

                {profileMessage && (
                  <p className="border-2 border-primary bg-[#def3e5] p-3 text-xs font-bold text-emerald-800 shadow-[2px_2px_0px_0px_rgba(26,26,26,1)]">
                    {profileMessage}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={savingProfile}
                  className="bg-[#ffcc00] text-primary font-headline font-black text-lg uppercase py-3 px-8 border-4 border-primary shadow-[4px_4px_0px_0px_#1a1a1a] hover:bg-[#1a1a1a] hover:text-[#ffcc00] hover:translate-x-[2px] hover:translate-y-[2px] active:translate-x-[4px] active:translate-y-[4px] active:shadow-none transition-all cursor-pointer disabled:opacity-50"
                >
                  {savingProfile ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </form>
          </section>

          {/* Regional Settings */}
          <section className="bg-white border-4 border-primary p-6 md:p-8 shadow-[4px_4px_0px_0px_#1a1a1a] relative">
            <div className="absolute -top-4 -left-4 bg-[#0055ff] text-[#f5f0e8] border-3 border-primary px-4 py-1 z-10 shadow-[4px_4px_0px_0px_#1a1a1a] font-headline font-bold uppercase">
              Regional
            </div>
            
            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block font-label font-bold uppercase text-sm mb-2 text-primary">
                  Preferred Language
                </label>
                <div className="relative">
                  <select
                    className="w-full border-[3px] border-primary bg-white p-3 font-body text-primary appearance-none focus:outline-none focus:border-[#0055ff] transition-colors cursor-pointer"
                    value={language}
                    onChange={(e) => setLanguage(e.target.value)}
                  >
                    <option value="km">Khmer</option>
                    <option value="en">English</option>
                  </select>
                  <span className="material-symbols-outlined absolute right-3 top-3.5 pointer-events-none select-none">
                    expand_more
                  </span>
                </div>
              </div>

              <div>
                <label className="block font-label font-bold uppercase text-sm mb-2 text-primary">
                  Timezone
                </label>
                <div className="relative">
                  <select
                    className="w-full border-[3px] border-primary bg-white p-3 font-body text-primary appearance-none focus:outline-none focus:border-[#0055ff] transition-colors cursor-pointer"
                    value={timezone}
                    onChange={(e) => setTimezone(e.target.value)}
                  >
                    <option value="utc">UTC (Coordinated Universal Time)</option>
                    <option value="ict">ICT (Indochina Time)</option>
                    <option value="pst">PST (Pacific Standard Time)</option>
                  </select>
                  <span className="material-symbols-outlined absolute right-3 top-3.5 pointer-events-none select-none">
                    expand_more
                  </span>
                </div>
              </div>
            </div>
          </section>
        </div>

        {/* Right Column: Security & Notifications */}
        <div className="xl:col-span-5 flex flex-col gap-8">
          {/* Account Security */}
          <section className="bg-white border-4 border-primary p-6 md:p-8 shadow-[4px_4px_0px_0px_#1a1a1a] relative">
            <div className="absolute -top-4 -right-4 bg-[#e63b2e] text-white border-3 border-primary px-4 py-1 z-10 shadow-[4px_4px_0px_0px_#1a1a1a] font-headline font-bold uppercase">
              Security
            </div>
            
            <div className="mt-4 space-y-8">
              {/* Password Form */}
              <form onSubmit={handleSavePassword} className="space-y-4">
                <h4 className="font-label font-bold uppercase text-lg border-b-4 border-primary pb-2 mb-4">
                  Change Password
                </h4>
                
                <div>
                  <label className="block font-label font-bold uppercase text-xs mb-1 text-primary">
                    Current Password
                  </label>
                  <input
                    className="w-full border-[3px] border-primary bg-white p-2 font-body focus:outline-none focus:border-[#0055ff] transition-colors"
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                  />
                </div>

                <div>
                  <label className="block font-label font-bold uppercase text-xs mb-1 text-primary">
                    New Password
                  </label>
                  <input
                    className="w-full border-[3px] border-primary bg-white p-2 font-body focus:outline-none focus:border-[#0055ff] transition-colors"
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                  />
                </div>

                <div>
                  <label className="block font-label font-bold uppercase text-xs mb-1 text-primary">
                    Confirm Password
                  </label>
                  <input
                    className="w-full border-[3px] border-primary bg-white p-2 font-body focus:outline-none focus:border-[#0055ff] transition-colors"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                  />
                </div>

                {passwordMessage && (
                  <p className={`border-2 border-primary p-3 text-xs font-bold shadow-[2px_2px_0px_0px_rgba(26,26,26,1)] ${
                    passwordMessage.includes("success") ? "bg-[#def3e5] text-emerald-800" : "bg-[#ffdad6] text-[#93000a]"
                  }`}>
                    {passwordMessage}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={savingPassword}
                  className="bg-[#1a1a1a] text-[#f5f0e8] font-label font-bold uppercase py-2 px-6 border-3 border-primary shadow-[4px_4px_0px_0px_#1a1a1a] hover:bg-[#0055ff] hover:-translate-y-1 hover:translate-x-1 hover:shadow-[6px_6px_0px_0px_#1a1a1a] transition-all cursor-pointer disabled:opacity-50"
                >
                  {savingPassword ? "Updating..." : "Update Password"}
                </button>
              </form>

              {/* 2FA */}
              <div className="border-t-4 border-primary pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-label font-bold uppercase text-lg">Two-Factor Auth</h4>
                    <p className="text-sm text-[#4a4a4a] font-body mt-1">
                      Add an extra layer of security.
                    </p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer select-none">
                    <input
                      type="checkbox"
                      className="sr-only peer"
                      checked={twoFactorEnabled}
                      onChange={(e) => setTwoFactorEnabled(e.target.checked)}
                    />
                    <div className="w-14 h-7 bg-[#eee9e0] border-3 border-primary peer-focus:outline-none peer-checked:bg-[#ffcc00] peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[3px] after:left-[3px] after:bg-[#1a1a1a] after:border after:border-[#1a1a1a] after:h-5 after:w-5 after:transition-all"></div>
                  </label>
                </div>
                
                {twoFactorEnabled && (
                  <div className="mt-4 p-3 bg-[#f5f0e8] border-2 border-primary border-l-8 flex gap-3 items-start">
                    <span className="material-symbols-outlined text-[#00a859] select-none">check_circle</span>
                    <p className="text-sm font-body font-medium">
                      2FA is currently <strong className="uppercase text-[#00a859]">Enabled</strong> via Authenticator App.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* Notification Preferences */}
          <section className="bg-white border-4 border-primary p-6 md:p-8 shadow-[4px_4px_0px_0px_#1a1a1a] relative">
            <div className="absolute -top-4 -left-4 bg-[#f5f0e8] text-primary border-3 border-primary px-4 py-1 z-10 shadow-[4px_4px_0px_0px_#1a1a1a] font-headline font-bold uppercase">
              Notifications
            </div>
            
            <div className="mt-4 space-y-6">
              <div>
                <h4 className="font-label font-bold uppercase text-lg border-b-4 border-primary pb-2 mb-4">
                  Email Notifications
                </h4>
                <div className="space-y-3">
                  <label className="flex items-center gap-3 cursor-pointer group select-none">
                    <input
                      type="checkbox"
                      checked={weeklyReport}
                      onChange={(e) => setWeeklyReport(e.target.checked)}
                      className="w-6 h-6 border-[3px] border-primary text-[#1a1a1a] focus:ring-0 cursor-pointer bg-white"
                    />
                    <span className="font-body font-medium group-hover:text-[#0055ff] transition-colors">
                      Weekly Usage Reports
                    </span>
                  </label>
                  
                  <label className="flex items-center gap-3 cursor-not-allowed group select-none">
                    <input
                      type="checkbox"
                      checked={true}
                      disabled
                      className="w-6 h-6 border-[3px] border-primary text-[#1a1a1a] opacity-50 cursor-not-allowed bg-white"
                    />
                    <span className="font-body font-medium text-[#4a4a4a]">
                      Security Alerts (Required)
                    </span>
                  </label>
                  
                  <label className="flex items-center gap-3 cursor-pointer group select-none">
                    <input
                      type="checkbox"
                      checked={productUpdates}
                      onChange={(e) => setProductUpdates(e.target.checked)}
                      className="w-6 h-6 border-[3px] border-primary text-[#1a1a1a] focus:ring-0 cursor-pointer bg-white"
                    />
                    <span className="font-body font-medium group-hover:text-[#0055ff] transition-colors">
                      Product Updates & News
                    </span>
                  </label>
                </div>
              </div>

              <div>
                <h4 className="font-label font-bold uppercase text-lg border-b-4 border-primary pb-2 mb-4">
                  In-App Alerts
                </h4>
                <div className="space-y-3">
                  <label className="flex items-center gap-3 cursor-pointer group select-none">
                    <input
                      type="checkbox"
                      checked={generationCompletions}
                      onChange={(e) => setGenerationCompletions(e.target.checked)}
                      className="w-6 h-6 border-[3px] border-primary text-[#1a1a1a] focus:ring-0 cursor-pointer bg-white"
                    />
                    <span className="font-body font-medium group-hover:text-[#0055ff] transition-colors">
                      Generation Completions
                    </span>
                  </label>
                  
                  <label className="flex items-center gap-3 cursor-pointer group select-none">
                    <input
                      type="checkbox"
                      checked={lowTokenWarnings}
                      onChange={(e) => setLowTokenWarnings(e.target.checked)}
                      className="w-6 h-6 border-[3px] border-primary text-[#1a1a1a] focus:ring-0 cursor-pointer bg-white"
                    />
                    <span className="font-body font-medium group-hover:text-[#0055ff] transition-colors">
                      Low Token Warnings
                    </span>
                  </label>
                </div>
              </div>
            </div>
          </section>

          {/* Legal & Policies */}
          <section className="bg-white border-4 border-primary p-6 md:p-8 shadow-[4px_4px_0px_0px_#1a1a1a] relative">
            <div className="absolute -top-4 -left-4 bg-[#ffcc00] border-3 border-primary px-4 py-1 z-10 shadow-[4px_4px_0px_0px_#1a1a1a] font-headline font-bold uppercase text-primary">
              Legal & Policies
            </div>
            
            <div className="mt-4 space-y-4">
              <p className="text-sm text-[#4a4a4a] font-body">
                Please review our terms of service, privacy policy, and refund rules.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <a
                  href="/terms"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center font-label font-bold uppercase text-xs border-2 border-primary bg-white py-3 hover:bg-[#eee9e0] hover:-translate-y-0.5 hover:translate-x-0.5 hover:shadow-[2px_2px_0px_0px_#1a1a1a] transition-all text-center"
                >
                  Terms of Service
                </a>
                <a
                  href="/privacy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center font-label font-bold uppercase text-xs border-2 border-primary bg-white py-3 hover:bg-[#eee9e0] hover:-translate-y-0.5 hover:translate-x-0.5 hover:shadow-[2px_2px_0px_0px_#1a1a1a] transition-all text-center"
                >
                  Privacy Policy
                </a>
                <a
                  href="/refund-policy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center font-label font-bold uppercase text-xs border-2 border-primary bg-white py-3 hover:bg-[#eee9e0] hover:-translate-y-0.5 hover:translate-x-0.5 hover:shadow-[2px_2px_0px_0px_#1a1a1a] transition-all text-center"
                >
                  Refund Policy
                </a>
              </div>
            </div>
          </section>
        </div>
      </div>
    </section>
  );
}
