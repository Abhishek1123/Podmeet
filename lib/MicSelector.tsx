'use client';

import React, { useState } from 'react';
import {
  Mic,
  MicOff,
  Smartphone,
  Headphones,
  RefreshCw,
  Check,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import {
  MicSourceMode,
  classifyAudioInputDevices,
  classifyMicLabel,
  findBestMicForMode,
  saveMicSelection,
} from './mic-utils';
import toast from 'react-hot-toast';

export interface MicSelectorProps {
  audioDevices: MediaDeviceInfo[];
  selectedDeviceId: string;
  micMode: MicSourceMode;
  activeHardwareLabel?: string;
  audioEnabled?: boolean;
  audioLevel?: number;
  onSelectMic: (deviceId: string, mode: MicSourceMode) => void;
  onToggleAudio?: () => void;
  onRescanDevices?: () => Promise<MediaDeviceInfo[] | void> | void;
  compact?: boolean;
}

export default function MicSelector({
  audioDevices,
  selectedDeviceId,
  micMode,
  activeHardwareLabel,
  audioEnabled = true,
  audioLevel = 0,
  onSelectMic,
  onToggleAudio,
  onRescanDevices,
  compact = false,
}: MicSelectorProps) {
  const [scanning, setScanning] = useState(false);
  const [showAllDevices, setShowAllDevices] = useState(false);

  const classifiedList = classifyAudioInputDevices(audioDevices);
  const hasExplicitHeadphone = classifiedList.some(
    (d) => d.category === 'headphone'
  );

  // Determine effective active label to display to the user
  const selectedClassified =
    classifiedList.find((d) => d.deviceId === selectedDeviceId) ||
    (activeHardwareLabel
      ? classifyMicLabel(activeHardwareLabel, selectedDeviceId, 0)
      : null);

  const effectiveMode: MicSourceMode =
    micMode === 'headphone' ||
    selectedClassified?.category === 'headphone'
      ? 'headphone'
      : micMode === 'phone' || selectedClassified?.category === 'phone'
      ? 'phone'
      : 'phone';

  const activeDisplayName =
    activeHardwareLabel ||
    selectedClassified?.rawLabel ||
    (effectiveMode === 'headphone'
      ? 'Headphone / Earphone Mic'
      : "Phone's Built-in Mic");

  const handleChooseMode = async (targetMode: 'phone' | 'headphone') => {
    let currentDevs = audioDevices;
    if (onRescanDevices) {
      setScanning(true);
      try {
        const refreshed = await onRescanDevices();
        if (Array.isArray(refreshed) && refreshed.length > 0) {
          currentDevs = refreshed;
        }
      } catch {
        // ignore
      } finally {
        setScanning(false);
      }
    }

    const best = findBestMicForMode(currentDevs, targetMode);
    if (targetMode === 'headphone') {
      const nextId = best?.deviceId || selectedDeviceId || '';
      saveMicSelection('headphone', nextId);
      onSelectMic(nextId, 'headphone');
      if (best) {
        toast.success(
          `Switched to Headphone Mic${best.label ? ` (${best.label})` : ''}`
        );
      } else {
        toast.success(
          'Headphone Mic mode selected! If using wired or Bluetooth earphones, speak to test the level bar.'
        );
      }
    } else {
      const nextId = best?.deviceId || '';
      saveMicSelection('phone', nextId);
      onSelectMic(nextId, 'phone');
      toast.success(
        `Switched to Phone's Mic${best?.label ? ` (${best.label})` : ''}`
      );
    }
  };

  const handleSelectSpecificDevice = (deviceId: string) => {
    const dev = classifiedList.find((c) => c.deviceId === deviceId);
    const inferredMode: MicSourceMode =
      dev?.category === 'headphone'
        ? 'headphone'
        : dev?.category === 'phone'
        ? 'phone'
        : 'custom';
    saveMicSelection(inferredMode, deviceId);
    onSelectMic(deviceId, inferredMode);
    toast.success(`Mic input: ${dev?.friendlyLabel || 'Default Microphone'}`);
  };

  const handleRescan = async () => {
    if (!onRescanDevices) return;
    setScanning(true);
    try {
      await onRescanDevices();
      toast.success('Microphones refreshed!');
    } finally {
      setScanning(false);
    }
  };

  return (
    <div className="rounded-2xl bg-zinc-950/95 border border-white/15 p-3.5 sm:p-4 space-y-3 shadow-inner">
      {/* Header Row: Title + Rescan Button */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {onToggleAudio ? (
            <button
              type="button"
              onClick={onToggleAudio}
              title={audioEnabled ? 'Mute Microphone' : 'Unmute Microphone'}
              className={`w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 transition active:scale-95 ${
                audioEnabled
                  ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                  : 'bg-rose-500 border-rose-400 text-white'
              }`}
            >
              {audioEnabled ? (
                <Mic className="w-4 h-4" />
              ) : (
                <MicOff className="w-4 h-4" />
              )}
            </button>
          ) : (
            <div className="w-8 h-8 rounded-xl bg-emerald-500/15 border border-emerald-500/40 flex items-center justify-center text-emerald-300 shrink-0">
              <Mic className="w-4 h-4" />
            </div>
          )}

          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-xs sm:text-sm font-extrabold text-white">
                Select Your Mic
              </span>
              <span
                className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border ${
                  !audioEnabled
                    ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                    : effectiveMode === 'headphone'
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                    : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                }`}
              >
                {!audioEnabled
                  ? 'Muted'
                  : effectiveMode === 'headphone'
                  ? 'Headphone Mic'
                  : "Phone's Mic"}
              </span>
            </div>
            <p className="text-[11px] text-zinc-400 truncate mt-0.5">
              Active: <span className="text-zinc-200 font-medium">{activeDisplayName}</span>
            </p>
          </div>
        </div>

        {onRescanDevices && (
          <button
            type="button"
            onClick={handleRescan}
            disabled={scanning}
            title="Scan for newly plugged-in headphones or mics"
            className="px-2.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-[11px] font-semibold text-zinc-300 hover:text-white flex items-center gap-1.5 shrink-0 active:scale-95 transition"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 text-emerald-400 ${
                scanning ? 'animate-spin' : ''
              }`}
            />
            <span>Scan Mics</span>
          </button>
        )}
      </div>

      {/* Two Big 1-Tap Mobile Cards: Phone's Mic vs Headphone Mic */}
      <div className="grid grid-cols-2 gap-2.5">
        <button
          type="button"
          onClick={() => handleChooseMode('phone')}
          className={`relative p-3 rounded-2xl border text-left transition active:scale-[0.98] flex flex-col justify-between min-h-[82px] ${
            effectiveMode === 'phone'
              ? 'bg-emerald-500/15 border-emerald-500/60 text-white shadow-lg shadow-emerald-500/10 ring-1 ring-emerald-500/40'
              : 'bg-zinc-900/90 border-white/10 text-zinc-400 hover:text-zinc-200 hover:border-white/20'
          }`}
        >
          <div className="flex items-center justify-between w-full mb-1.5">
            <div
              className={`w-8 h-8 rounded-xl flex items-center justify-center ${
                effectiveMode === 'phone'
                  ? 'bg-emerald-500 text-zinc-950'
                  : 'bg-white/5 text-zinc-400'
              }`}
            >
              <Smartphone className="w-4 h-4" />
            </div>
            {effectiveMode === 'phone' && (
              <span className="inline-flex items-center gap-0.5 text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded-full bg-emerald-500/25 text-emerald-300 border border-emerald-500/40">
                <Check className="w-2.5 h-2.5" />
                Active
              </span>
            )}
          </div>
          <div>
            <p className="text-xs sm:text-sm font-extrabold text-white leading-tight">
              Phone&apos;s Mic
            </p>
            <p className="text-[10px] text-zinc-400 mt-0.5 leading-snug">
              Built-in mic • Hold 6–8 in. away
            </p>
          </div>
        </button>

        <button
          type="button"
          onClick={() => handleChooseMode('headphone')}
          className={`relative p-3 rounded-2xl border text-left transition active:scale-[0.98] flex flex-col justify-between min-h-[82px] ${
            effectiveMode === 'headphone'
              ? 'bg-amber-500/15 border-amber-500/60 text-white shadow-lg shadow-amber-500/10 ring-1 ring-amber-500/40'
              : 'bg-zinc-900/90 border-white/10 text-zinc-400 hover:text-zinc-200 hover:border-white/20'
          }`}
        >
          <div className="flex items-center justify-between w-full mb-1.5">
            <div
              className={`w-8 h-8 rounded-xl flex items-center justify-center ${
                effectiveMode === 'headphone'
                  ? 'bg-amber-400 text-zinc-950'
                  : 'bg-white/5 text-zinc-400'
              }`}
            >
              <Headphones className="w-4 h-4" />
            </div>
            {effectiveMode === 'headphone' ? (
              <span className="inline-flex items-center gap-0.5 text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded-full bg-amber-500/25 text-amber-300 border border-amber-500/40">
                <Check className="w-2.5 h-2.5" />
                Active
              </span>
            ) : hasExplicitHeadphone ? (
              <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300">
                Detected
              </span>
            ) : null}
          </div>
          <div>
            <p className="text-xs sm:text-sm font-extrabold text-white leading-tight">
              Headphone Mic
            </p>
            <p className="text-[10px] text-zinc-400 mt-0.5 leading-snug">
              Wired earphones, headset or AirPods
            </p>
          </div>
        </button>
      </div>

      {/* Live Voice Level Meter Bar */}
      {!compact && (
        <div className="space-y-1">
          <div className="flex items-center justify-between text-[10px] text-zinc-400">
            <span>
              {audioEnabled
                ? effectiveMode === 'headphone'
                  ? 'Tap or speak into your headphone mic to verify:'
                  : 'Speak into your phone mic to verify:'
                : 'Microphone is muted'}
            </span>
            <span className="font-mono font-bold text-emerald-400">
              {audioEnabled ? `${audioLevel}%` : 'MUTED'}
            </span>
          </div>
          <div className="h-3 w-full rounded-full bg-white/10 overflow-hidden p-0.5">
            <div
              className="h-full rounded-full bg-gradient-to-r from-emerald-400 via-amber-400 to-rose-500 transition-all duration-75"
              style={{
                width: `${audioEnabled ? Math.max(4, audioLevel) : 0}%`,
              }}
            />
          </div>
        </div>
      )}

      {/* Specific Hardware Input Picker (Dropdown + Expandable List when > 1 device) */}
      <div className="pt-1 border-t border-white/10 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <label className="text-[11px] font-semibold text-zinc-300">
            Hardware Audio Input ({classifiedList.length || 1} found)
          </label>
          {classifiedList.length > 1 && (
            <button
              type="button"
              onClick={() => setShowAllDevices(!showAllDevices)}
              className="text-[11px] font-semibold text-emerald-400 flex items-center gap-1"
            >
              <span>{showAllDevices ? 'Hide List' : 'Show All Mics'}</span>
              {showAllDevices ? (
                <ChevronUp className="w-3.5 h-3.5" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5" />
              )}
            </button>
          )}
        </div>

        <select
          value={selectedDeviceId}
          onChange={(e) => handleSelectSpecificDevice(e.target.value)}
          aria-label="Select Microphone Input Device"
          className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-900 border border-white/15 text-xs sm:text-sm text-zinc-100 focus:outline-none focus:border-emerald-400"
        >
          <option value="">
            System Default ({effectiveMode === 'headphone' ? 'Headphone / Auto' : "Phone's Mic / Auto"})
          </option>
          {classifiedList.map((d, i) => (
            <option key={d.deviceId || i} value={d.deviceId}>
              {d.category === 'headphone' ? '🎧 ' : '📱 '}
              {d.friendlyLabel}
            </option>
          ))}
        </select>

        {showAllDevices && classifiedList.length > 1 && (
          <div className="space-y-1.5 pt-1">
            {classifiedList.map((d, i) => {
              const isSelected = selectedDeviceId === d.deviceId;
              return (
                <button
                  key={d.deviceId || i}
                  type="button"
                  onClick={() => handleSelectSpecificDevice(d.deviceId)}
                  className={`w-full px-3 py-2.5 rounded-xl border text-left text-xs flex items-center justify-between gap-2 transition ${
                    isSelected
                      ? 'bg-emerald-500/15 border-emerald-500/50 text-white font-bold'
                      : 'bg-zinc-900/70 border-white/10 text-zinc-300 hover:bg-zinc-900'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {d.category === 'headphone' ? (
                      <Headphones className="w-4 h-4 text-amber-400 shrink-0" />
                    ) : (
                      <Smartphone className="w-4 h-4 text-emerald-400 shrink-0" />
                    )}
                    <span className="truncate">{d.friendlyLabel}</span>
                  </div>
                  {isSelected && (
                    <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

