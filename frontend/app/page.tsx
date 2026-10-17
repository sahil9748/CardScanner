"use client";

import React, { useState, useEffect, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CreditCard, Shield, Lock, Delete, ArrowRight, AlertCircle, RefreshCw } from "lucide-react";
import { api, ApiError } from "@/lib/api";

function PinEntryContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pin, setPin] = useState<string>("");
  const [targetLength, setTargetLength] = useState<4 | 5>(4);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lockoutSeconds, setLockoutSeconds] = useState<number>(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const autoSubmittedRef = useRef<boolean>(false);

  // Auto-detect magic link ?pin=XXXX in URL
  useEffect(() => {
    const urlPin = searchParams.get("pin");
    if (urlPin && /^\d{4,5}$/.test(urlPin) && !autoSubmittedRef.current) {
      autoSubmittedRef.current = true;
      const len = urlPin.length as 4 | 5;
      setTargetLength(len);
      setPin(urlPin);
      submitPin(urlPin);
    }
  }, [searchParams]);

  // Focus input automatically
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Handle countdown timer if locked out
  useEffect(() => {
    if (lockoutSeconds <= 0) return;
    const interval = setInterval(() => {
      setLockoutSeconds((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          setErrorMessage(null);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [lockoutSeconds]);

  const handleDigitPress = (digit: string) => {
    if (isLoading || lockoutSeconds > 0) return;
    if (pin.length < targetLength) {
      const nextPin = pin + digit;
      setPin(nextPin);
      setErrorMessage(null);
      if (nextPin.length === targetLength) {
        submitPin(nextPin);
      }
    }
  };

  const handleBackspace = () => {
    if (isLoading || lockoutSeconds > 0) return;
    setPin((prev) => prev.slice(0, -1));
    setErrorMessage(null);
  };

  const handleClear = () => {
    if (isLoading || lockoutSeconds > 0) return;
    setPin("");
    setErrorMessage(null);
    inputRef.current?.focus();
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    if (isLoading || lockoutSeconds > 0) return;
    const pasted = e.clipboardData.getData("text").trim();
    if (/^\d{4,5}$/.test(pasted)) {
      const len = pasted.length as 4 | 5;
      setTargetLength(len);
      setPin(pasted);
      submitPin(pasted);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace") {
      handleBackspace();
    } else if (e.key === "Enter" && pin.length >= 4) {
      submitPin(pin);
    } else if (/^[0-9]$/.test(e.key)) {
      e.preventDefault();
      handleDigitPress(e.key);
    }
  };

  const submitPin = async (pinToSubmit: string) => {
    if (isLoading || lockoutSeconds > 0) return;
    if (pinToSubmit.length < 4 || pinToSubmit.length > 5) {
      setErrorMessage("Please enter a valid 4 or 5 digit PIN.");
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    try {
      const result = await api.validatePin(pinToSubmit);
      if (result.success) {
        if (result.redirect_url) {
          localStorage.setItem("cardscan_redirect_url", result.redirect_url);
        } else {
          localStorage.removeItem("cardscan_redirect_url");
        }
        router.push("/scan");
      }
    } catch (err: any) {
      const apiErr = err as ApiError;
      if (apiErr.status === 429) {
        // Extract seconds if present
        const match = apiErr.detail.match(/(\d+)\s*seconds/i);
        const secs = match ? parseInt(match[1], 10) : 60;
        setLockoutSeconds(secs);
        setErrorMessage(`Too many failed attempts. Security cooldown active (${secs}s).`);
      } else {
        setErrorMessage(apiErr.detail || "Invalid access PIN. Please try again.");
      }
      setPin("");
      inputRef.current?.focus();
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between items-center p-4 sm:p-8">
      {/* Top Header */}
      <header className="w-full max-w-md flex justify-between items-center py-4 border-b border-slate-800">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <CreditCard className="w-5 h-5 text-white" />
          </div>
          <div>
            <span className="font-bold text-lg tracking-tight text-white flex items-center gap-1.5">
              CardScan
              <span className="text-[10px] uppercase font-semibold tracking-wider px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                Auto
              </span>
            </span>
            <p className="text-xs text-slate-400">Automated Gift Card Capture</p>
          </div>
        </div>

        <a
          href="/admin"
          className="text-xs text-slate-400 hover:text-slate-200 transition-colors flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-800 hover:border-slate-700 bg-slate-900/50"
        >
          <Lock className="w-3.5 h-3.5" />
          Admin
        </a>
      </header>

      {/* Main Card Content */}
      <div className="w-full max-w-md my-auto py-6">
        <div className="bg-slate-900/80 border border-slate-800/80 rounded-3xl p-6 sm:p-8 shadow-2xl backdrop-blur-xl">
          {/* Instructions */}
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 mb-3">
              <Shield className="w-6 h-6" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-white">Enter Access PIN</h1>
            <p className="text-sm text-slate-400 mt-1">
              Enter your authorized 4 or 5 digit numeric PIN to begin scanning your physical gift card.
            </p>
          </div>

          {/* Hidden Keyboard Input */}
          <input
            ref={inputRef}
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            value={pin}
            onChange={(e) => {
              const val = e.target.value.replace(/\D/g, "");
              if (val.length <= targetLength) {
                setPin(val);
                if (val.length === targetLength) {
                  submitPin(val);
                }
              }
            }}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            className="sr-only"
            aria-label="Access PIN Input"
            disabled={isLoading || lockoutSeconds > 0}
          />

          {/* Length Selector Toggle */}
          <div className="flex justify-center mb-5">
            <div className="inline-flex p-1 rounded-xl bg-slate-950 border border-slate-800">
              <button
                type="button"
                onClick={() => {
                  setTargetLength(4);
                  if (pin.length > 4) setPin(pin.slice(0, 4));
                }}
                className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all ${
                  targetLength === 4
                    ? "bg-indigo-600 text-white shadow-sm"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                4 Digits
              </button>
              <button
                type="button"
                onClick={() => setTargetLength(5)}
                className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all ${
                  targetLength === 5
                    ? "bg-indigo-600 text-white shadow-sm"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                5 Digits
              </button>
            </div>
          </div>

          {/* Visual PIN Bubbles */}
          <div
            onClick={() => inputRef.current?.focus()}
            className="flex justify-center items-center gap-3 sm:gap-4 mb-6 cursor-pointer py-2"
          >
            {Array.from({ length: targetLength }).map((_, index) => {
              const isFilled = index < pin.length;
              const isCurrent = index === pin.length;

              return (
                <div
                  key={index}
                  className={`w-12 h-14 sm:w-14 sm:h-16 rounded-2xl flex items-center justify-center text-2xl font-bold transition-all duration-200 ${
                    isFilled
                      ? "bg-indigo-600/20 border-2 border-indigo-500 text-white shadow-md shadow-indigo-500/20 scale-105"
                      : isCurrent
                      ? "bg-slate-800/80 border-2 border-indigo-400/60 text-slate-300 ring-2 ring-indigo-500/20 animate-pulse"
                      : "bg-slate-950/60 border border-slate-800 text-slate-600"
                  }`}
                >
                  {isFilled ? (
                    <span className="font-mono text-indigo-300">{pin[index]}</span>
                  ) : (
                    <span className="w-2.5 h-2.5 rounded-full bg-slate-700" />
                  )}
                </div>
              );
            })}
          </div>

          {/* Error Message */}
          {errorMessage && (
            <div className="mb-5 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* On-screen Numeric Keypad */}
          <div className="grid grid-cols-3 gap-2.5 sm:gap-3 mb-5">
            {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((num) => (
              <button
                key={num}
                type="button"
                onClick={() => handleDigitPress(num)}
                disabled={isLoading || lockoutSeconds > 0}
                className="h-13 sm:h-14 rounded-2xl bg-slate-800/70 hover:bg-slate-700/80 active:bg-slate-600 text-white font-semibold text-xl border border-slate-700/50 shadow-sm transition-all duration-150 flex items-center justify-center active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {num}
              </button>
            ))}

            {/* Clear Button */}
            <button
              type="button"
              onClick={handleClear}
              disabled={isLoading || lockoutSeconds > 0 || pin.length === 0}
              className="h-13 sm:h-14 rounded-2xl bg-slate-950/60 hover:bg-slate-800/60 text-slate-400 hover:text-slate-200 font-medium text-xs border border-slate-800 transition-all flex items-center justify-center uppercase tracking-wider active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Clear
            </button>

            {/* Zero Button */}
            <button
              type="button"
              onClick={() => handleDigitPress("0")}
              disabled={isLoading || lockoutSeconds > 0}
              className="h-13 sm:h-14 rounded-2xl bg-slate-800/70 hover:bg-slate-700/80 active:bg-slate-600 text-white font-semibold text-xl border border-slate-700/50 shadow-sm transition-all flex items-center justify-center active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              0
            </button>

            {/* Backspace Button */}
            <button
              type="button"
              onClick={handleBackspace}
              disabled={isLoading || lockoutSeconds > 0 || pin.length === 0}
              className="h-13 sm:h-14 rounded-2xl bg-slate-950/60 hover:bg-slate-800/60 text-slate-300 font-semibold border border-slate-800 transition-all flex items-center justify-center active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
              aria-label="Backspace"
            >
              <Delete className="w-5 h-5" />
            </button>
          </div>

          {/* Continue / Submit Button */}
          <button
            type="button"
            onClick={() => submitPin(pin)}
            disabled={isLoading || pin.length < 4 || lockoutSeconds > 0}
            className="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-semibold text-sm shadow-lg shadow-indigo-600/30 transition-all duration-150 flex items-center justify-center gap-2 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none"
          >
            {isLoading ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin text-white" />
                <span>Verifying PIN...</span>
              </>
            ) : lockoutSeconds > 0 ? (
              <span>Locked ({lockoutSeconds}s)</span>
            ) : (
              <>
                <span>Continue to Scanner</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </div>
      </div>

      {/* Footer */}
      <footer className="w-full max-w-md text-center py-4 border-t border-slate-800/60 text-xs text-slate-500">
        <p>Protected by CardScan Secure Gateway &bull; Keyed HMAC Verification</p>
      </footer>
    </main>
  );
}

export default function PinEntryPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-950 flex items-center justify-center text-indigo-400 font-medium text-sm">
          Loading CardScan...
        </div>
      }
    >
      <PinEntryContent />
    </Suspense>
  );
}
