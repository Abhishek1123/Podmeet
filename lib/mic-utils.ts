export type MicSourceMode = 'phone' | 'headphone' | 'custom';

export interface ClassifiedMic {
  deviceId: string;
  rawLabel: string;
  friendlyLabel: string;
  shortBadge: string;
  category: 'phone' | 'headphone' | 'default';
}

const HEADPHONE_REGEX =
  /headset|headphone|earphone|earpod|airpod|buds|bluetooth|wired|hands-free|handsfree|external|usb|lavalier|rode|shure|yeti|aux|line in|jack|bt\b/i;

const PHONE_REGEX =
  /iphone|ipad|android|phone|built-in|internal|speakerphone|bottom|front|back|handset|camcorder|receiver|device mic|macbook|laptop/i;

export function classifyMicLabel(
  rawLabel: string,
  deviceId = '',
  index = 0
): ClassifiedMic {
  const label = (rawLabel || '').trim();
  const isDefaultId =
    deviceId === 'default' ||
    deviceId === 'communications' ||
    /^default\b/i.test(label);

  if (HEADPHONE_REGEX.test(label)) {
    const clean = label.replace(/^default\s*[-–—:]\s*/i, '').trim();
    return {
      deviceId,
      rawLabel: label,
      friendlyLabel: clean ? `Headphone Mic (${clean})` : 'Headphone / Earphone Mic',
      shortBadge: 'Headphone Mic',
      category: 'headphone',
    };
  }

  if (PHONE_REGEX.test(label)) {
    const clean = label.replace(/^default\s*[-–—:]\s*/i, '').trim();
    return {
      deviceId,
      rawLabel: label,
      friendlyLabel: clean ? `Phone's Mic (${clean})` : "Phone's Built-in Mic",
      shortBadge: "Phone's Mic",
      category: 'phone',
    };
  }

  if (isDefaultId) {
    return {
      deviceId,
      rawLabel: label || 'System Default Microphone',
      friendlyLabel: label || 'System Default Microphone',
      shortBadge: 'Default Mic',
      category: 'default',
    };
  }

  if (index === 0) {
    return {
      deviceId,
      rawLabel: label || 'Microphone 1',
      friendlyLabel: label ? `Phone's Mic (${label})` : "Phone's Built-in Mic",
      shortBadge: "Phone's Mic",
      category: 'phone',
    };
  }

  return {
    deviceId,
    rawLabel: label || `Microphone ${index + 1}`,
    friendlyLabel: label
      ? `Headphone / External (${label})`
      : `Headphone / External Mic ${index}`,
    shortBadge: 'Headphone Mic',
    category: 'headphone',
  };
}

export function classifyAudioInputDevices(
  devices: MediaDeviceInfo[]
): ClassifiedMic[] {
  const audioInputs = devices.filter((d) => d.kind === 'audioinput');
  return audioInputs.map((d, idx) =>
    classifyMicLabel(d.label, d.deviceId, idx)
  );
}

/**
 * Finds the best matching MediaDeviceInfo when the user taps "Phone's Mic" or "Headphone Mic".
 */
export function findBestMicForMode(
  devices: MediaDeviceInfo[],
  mode: 'phone' | 'headphone'
): MediaDeviceInfo | undefined {
  const audioInputs = devices.filter((d) => d.kind === 'audioinput');
  if (audioInputs.length === 0) return undefined;

  const classified = audioInputs.map((device, idx) => ({
    device,
    meta: classifyMicLabel(device.label, device.deviceId, idx),
  }));

  if (mode === 'headphone') {
    // 1. Prefer a non-default device explicitly classified as headphone/headset/external
    const explicitNonDefault = classified.find(
      (c) =>
        c.meta.category === 'headphone' &&
        c.device.deviceId !== 'default' &&
        c.device.deviceId !== 'communications'
    );
    if (explicitNonDefault) return explicitNonDefault.device;

    // 2. Any device classified as headphone (even if it is the default route)
    const anyHeadphone = classified.find((c) => c.meta.category === 'headphone');
    if (anyHeadphone) return anyHeadphone.device;

    // 3. If multiple distinct hardware devices exist, pick the non-primary one
    const nonDefaultList = audioInputs.filter(
      (d) => d.deviceId !== 'default' && d.deviceId !== 'communications'
    );
    if (nonDefaultList.length >= 2) {
      const nonSpeaker = nonDefaultList.find(
        (d) => !/speakerphone/i.test(d.label)
      );
      return nonSpeaker || nonDefaultList[1];
    }

    return undefined;
  }

  // mode === 'phone'
  // 1. Prefer a non-default phone mic that is NOT speakerphone (handset/bottom mic has far less room echo)
  const cleanPhoneMic = classified.find(
    (c) =>
      c.meta.category === 'phone' &&
      c.device.deviceId !== 'default' &&
      c.device.deviceId !== 'communications' &&
      !/speakerphone/i.test(c.device.label)
  );
  if (cleanPhoneMic) return cleanPhoneMic.device;

  // 2. Any phone category mic
  const anyPhoneMic = classified.find((c) => c.meta.category === 'phone');
  if (anyPhoneMic) return anyPhoneMic.device;

  // 3. Fallback to first available input
  return audioInputs[0];
}

const STORAGE_MODE_KEY = 'acidreflux_mic_mode';
const STORAGE_DEVICE_KEY = 'acidreflux_mic_device_id';

export function getSavedMicSelection(): {
  mode: MicSourceMode;
  deviceId: string;
} {
  if (typeof window === 'undefined') {
    return { mode: 'phone', deviceId: '' };
  }
  try {
    const mode =
      (localStorage.getItem(STORAGE_MODE_KEY) as MicSourceMode) || 'phone';
    const deviceId = localStorage.getItem(STORAGE_DEVICE_KEY) || '';
    return {
      mode:
        mode === 'phone' || mode === 'headphone' || mode === 'custom'
          ? mode
          : 'phone',
      deviceId,
    };
  } catch {
    return { mode: 'phone', deviceId: '' };
  }
}

export function saveMicSelection(mode: MicSourceMode, deviceId: string): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_MODE_KEY, mode);
    localStorage.setItem(STORAGE_DEVICE_KEY, deviceId || '');
  } catch {
    // ignore storage errors
  }
}

