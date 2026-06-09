"use client";

import { useEffect, useState } from "react";

type VoxLoaderProps = {
  label?: string;
  variant?: "page" | "panel" | "inline" | "compact";
  className?: string;
};

export function VoxLoader({
  label = "Loading",
  variant = "panel",
  className = "",
}: VoxLoaderProps) {
  const [headline, setHeadline] = useState("Calibrating Vocal Cords...");
  const [subtext, setSubtext] = useState("Khmer Vox is getting ready for you.");

  useEffect(() => {
    if (variant !== "page") return;
    const timer = setTimeout(() => {
      setHeadline("SYSTEM READY");
      setSubtext("Redirecting to Studio...");
    }, 3000); // 3 seconds matching the progress-fill animation
    return () => clearTimeout(timer);
  }, [variant]);

  // Page level loader (Large, full screen with floating shapes and progress bar)
  if (variant === "page") {
    return (
      <div className={`fixed inset-0 bg-[#FFF9E5] text-[#1a1a1a] font-body overflow-hidden flex flex-col items-center justify-center z-50 ${className}`}>
        {/* Keyframe animations style block */}
        <style dangerouslySetInnerHTML={{ __html: `
          @keyframes botBounce {
            0%, 100% { transform: translateY(0) scale(1); }
            50% { transform: translateY(-20px) scale(1.05); }
          }
          @keyframes botEyes {
            0% { transform: scaleY(1); }
            45% { transform: scaleY(1); }
            50% { transform: scaleY(0.1); }
            55% { transform: scaleY(1); }
            100% { transform: scaleY(1); }
          }
          @keyframes floatShape1 {
            0%, 100% { transform: translateY(0) rotate(0deg); }
            50% { transform: translateY(-30px) rotate(45deg); }
          }
          @keyframes floatShape2 {
            0%, 100% { transform: translateY(0) rotate(0deg); }
            50% { transform: translateY(40px) rotate(-90deg); }
          }
          @keyframes floatShape3 {
            0%, 100% { transform: translateY(0) scale(1); }
            50% { transform: translateY(-25px) scale(1.2); }
          }
          @keyframes fillBar {
            0% { width: 0%; }
            100% { width: 100%; }
          }
          .animate-bounce-bot { animation: botBounce 2s infinite ease-in-out; }
          .animate-pulse-eyes { animation: botEyes 1.5s infinite alternate; }
          .animate-float-1 { animation: floatShape1 6s infinite ease-in-out; }
          .animate-float-2 { animation: floatShape2 8s infinite ease-in-out reverse; }
          .animate-float-3 { animation: floatShape3 7s infinite ease-in-out 1s; }
          .animate-progress-fill { animation: fillBar 3s ease-in-out forwards; }
        `}} />

        {/* Background Floating Shapes */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden opacity-80 z-0">
          <div className="absolute top-[15%] left-[10%] w-16 h-16 bg-[#e63b2e] rounded-full border-4 border-[#1a1a1a] animate-float-1"></div>
          <div className="absolute top-[60%] left-[15%] w-20 h-20 bg-[#ffcc00] border-4 border-[#1a1a1a] animate-float-2"></div>
          <div className="absolute top-[20%] right-[15%] w-0 h-0 border-l-[40px] border-l-transparent border-b-[69.3px] border-b-[#0055ff] border-r-[40px] border-r-transparent animate-float-3 relative">
            <div className="absolute -top-[4px] -left-[44px] w-0 h-0 border-l-[44px] border-l-transparent border-b-[76px] border-b-[#1a1a1a] border-r-[44px] border-r-transparent -z-10"></div>
          </div>
          <div className="absolute bottom-[20%] right-[10%] w-12 h-12 border-4 border-[#1a1a1a] bg-transparent animate-float-1" style={{ animationDelay: "2s" }}></div>
          <div className="absolute top-[40%] right-[25%] w-8 h-8 bg-[#e63b2e] border-4 border-[#1a1a1a] animate-float-2" style={{ animationDelay: "1s" }}></div>
        </div>

        {/* Main Loading Panel */}
        <main className="relative z-10 flex flex-col items-center w-full max-w-lg px-6">
          {/* Character */}
          <div className="animate-bounce-bot mb-16 relative">
            <div className="absolute -top-12 left-1/2 -translate-x-1/2 flex flex-col items-center">
              <div className="w-6 h-6 bg-[#e63b2e] rounded-full border-4 border-[#1a1a1a] shadow-[4px_4px_0px_0px_#1a1a1a] z-10"></div>
              <div className="w-2 h-8 bg-[#1a1a1a] -mt-1"></div>
            </div>
            
            <div className="w-48 h-40 bg-white border-8 border-[#1a1a1a] shadow-[8px_8px_0px_0px_#1a1a1a] flex flex-col items-center justify-center relative overflow-hidden">
              <div className="w-40 h-24 bg-[#ffcc00] border-4 border-[#1a1a1a] flex items-center justify-center gap-6 mt-2 relative">
                <div className="w-6 h-10 bg-[#1a1a1a] rounded-full animate-pulse-eyes"></div>
                <div className="w-6 h-10 bg-[#1a1a1a] rounded-full animate-pulse-eyes"></div>
                <div className="absolute bottom-2 left-4 w-4 h-2 bg-[#e63b2e] opacity-50 rounded-full"></div>
                <div className="absolute bottom-2 right-4 w-4 h-2 bg-[#e63b2e] opacity-50 rounded-full"></div>
              </div>
              
              <div className="flex items-end gap-1 mt-3 h-4">
                <div className="w-2 h-2 bg-[#1a1a1a]"></div>
                <div className="w-2 h-4 bg-[#1a1a1a]"></div>
                <div className="w-2 h-3 bg-[#1a1a1a]"></div>
                <div className="w-2 h-2 bg-[#1a1a1a]"></div>
              </div>
            </div>
            
            <div className="w-32 h-12 bg-[#0055ff] border-x-8 border-b-8 border-[#1a1a1a] shadow-[4px_4px_0px_0px_#1a1a1a] mx-auto -mt-2 relative z-[-1] rounded-b-xl">
              <div className="absolute inset-0 flex justify-center items-center">
                <span className="material-symbols-outlined text-white font-bold" style={{ fontVariationSettings: "'FILL' 1" }}>graphic_eq</span>
              </div>
            </div>
          </div>

          {/* Slogans */}
          <div className="text-center mb-10 w-full">
            <h1 className={`font-headline font-black text-3xl md:text-4xl uppercase tracking-tighter text-primary mb-2 shadow-sm ${
              headline === "SYSTEM READY" ? "scale-110 text-[#e63b2e] transition-transform duration-300" : ""
            }`}>
              {headline}
            </h1>
            <p className="font-body text-[#4a4a4a] font-medium text-lg">
              {subtext}
            </p>
          </div>

          {/* Progress Bar */}
          <div className="w-full max-w-md h-10 bg-white border-4 border-[#1a1a1a] shadow-[4px_4px_0px_0px_#1a1a1a] relative overflow-hidden">
            <div className="h-full bg-[#10b981] border-r-4 border-[#1a1a1a] animate-progress-fill flex items-center justify-end px-2">
              <div className="w-2 h-full bg-white opacity-50"></div>
            </div>
          </div>

          {/* Bounce Indicator */}
          <div className="mt-8 flex gap-2">
            <div className="w-3 h-3 bg-[#1a1a1a] rounded-full animate-bounce" style={{ animationDelay: "0s" }}></div>
            <div className="w-3 h-3 bg-[#1a1a1a] rounded-full animate-bounce" style={{ animationDelay: "0.15s" }}></div>
            <div className="w-3 h-3 bg-[#1a1a1a] rounded-full animate-bounce" style={{ animationDelay: "0.3s" }}></div>
          </div>
        </main>
      </div>
    );
  }

  // Panel, inline, and compact loaders (Scaled-down, reusable Voice Bot)
  const containerClass =
    variant === "compact"
      ? "min-h-0 py-2"
      : variant === "inline"
        ? "min-h-[120px] py-4"
        : "min-h-[260px] border-4 border-primary bg-white p-6 shadow-[4px_4px_0px_0px_#1a1a1a]";

  return (
    <div
      role="status"
      aria-live="polite"
      className={`vox-loader-wrap flex flex-col items-center justify-center text-center ${containerClass} ${className}`}
    >
      {/* Keyframe animations style block */}
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes botBounceSmall {
          0%, 100% { transform: translateY(0) scale(1); }
          50% { transform: translateY(-12px) scale(1.03); }
        }
        @keyframes botEyesSmall {
          0% { transform: scaleY(1); }
          45% { transform: scaleY(1); }
          50% { transform: scaleY(0.1); }
          55% { transform: scaleY(1); }
          100% { transform: scaleY(1); }
        }
        .animate-bounce-bot-small { animation: botBounceSmall 2s infinite ease-in-out; }
        .animate-pulse-eyes-small { animation: botEyesSmall 1.5s infinite alternate; }
      `}} />

      <div className="animate-bounce-bot-small mb-6 relative mt-4 shrink-0 select-none">
        {/* Bot Antenna */}
        <div className="absolute -top-8 left-1/2 -translate-x-1/2 flex flex-col items-center">
          <div className="w-4 h-4 bg-[#e63b2e] rounded-full border-3 border-[#1a1a1a] shadow-[2px_2px_0px_0px_#1a1a1a] z-10"></div>
          <div className="w-1.5 h-5 bg-[#1a1a1a] -mt-0.5"></div>
        </div>
        
        {/* Bot Head */}
        <div className="w-32 h-28 bg-white border-6 border-[#1a1a1a] shadow-[4px_4px_0px_0px_#1a1a1a] flex flex-col items-center justify-center relative overflow-hidden">
          {/* Inner Screen */}
          <div className="w-26 h-16 bg-[#ffcc00] border-3 border-[#1a1a1a] flex items-center justify-center gap-4 mt-1.5 relative">
            <div className="w-3.5 h-6 bg-[#1a1a1a] rounded-full animate-pulse-eyes-small"></div>
            <div className="w-3.5 h-6 bg-[#1a1a1a] rounded-full animate-pulse-eyes-small"></div>
            <div className="absolute bottom-1 left-2.5 w-2.5 h-1.5 bg-[#e63b2e] opacity-50 rounded-full"></div>
            <div className="absolute bottom-1 right-2.5 w-2.5 h-1.5 bg-[#e63b2e] opacity-50 rounded-full"></div>
          </div>
          
          {/* Bot Mouth */}
          <div className="flex items-end gap-0.5 mt-2 h-3">
            <div className="w-1.5 h-1.5 bg-[#1a1a1a]"></div>
            <div className="w-1.5 h-3 bg-[#1a1a1a]"></div>
            <div className="w-1.5 h-2 bg-[#1a1a1a]"></div>
            <div className="w-1.5 h-1.5 bg-[#1a1a1a]"></div>
          </div>
        </div>
        
        {/* Bot Body base */}
        <div className="w-20 h-8 bg-[#0055ff] border-x-6 border-b-6 border-[#1a1a1a] shadow-[2px_2px_0px_0px_#1a1a1a] mx-auto -mt-1.5 relative z-[-1] rounded-b-lg">
          <div className="absolute inset-0 flex justify-center items-center">
            <span className="material-symbols-outlined text-white font-bold text-base" style={{ fontVariationSettings: "'FILL' 1" }}>graphic_eq</span>
          </div>
        </div>
      </div>

      {label ? (
        <p className="font-headline font-black text-xs uppercase tracking-wide text-primary mt-2">{label}</p>
      ) : null}

      {/* Bouncing dots */}
      <div className="mt-4 flex gap-1.5">
        <div className="w-2.5 h-2.5 bg-[#1a1a1a] rounded-full animate-bounce" style={{ animationDelay: "0s" }}></div>
        <div className="w-2.5 h-2.5 bg-[#1a1a1a] rounded-full animate-bounce" style={{ animationDelay: "0.15s" }}></div>
        <div className="w-2.5 h-2.5 bg-[#1a1a1a] rounded-full animate-bounce" style={{ animationDelay: "0.3s" }}></div>
      </div>
    </div>
  );
}
