export interface ShareLobbyOptions {
  roomId: string;
  roomTitle?: string;
  mode?: 'small-room' | 'remote';
  member?: string;
  email?: string;
}

/**
 * Builds the canonical URL routing directly to the room's lobby.
 */
export function buildLobbyUrl(
  options: ShareLobbyOptions,
  origin?: string
): string {
  const baseOrigin =
    origin || (typeof window !== 'undefined' ? window.location.origin : '');
  const cleanRoomId = encodeURIComponent(options.roomId.trim());
  const params = new URLSearchParams();

  if (options.mode) {
    params.set('mode', options.mode);
  }
  if (options.member?.trim()) {
    params.set('member', options.member.trim());
  }
  if (options.email?.trim()) {
    params.set('email', options.email.trim().toLowerCase());
  }

  const query = params.toString();
  return `${baseOrigin}/rooms/${cleanRoomId}${query ? `?${query}` : ''}`;
}

/**
 * Robust parser for room codes and invite/lobby links.
 * Accepts:
 * - Room codes: "abc-123"
 * - Full URLs: "https://podmeet.app/rooms/abc-123?mode=small-room"
 * - Lobby URLs: "https://podmeet.app/lobby/abc-123?mode=small-room"
 * - Relative URLs: "/rooms/abc-123" or "/lobby/abc-123"
 * - URLs with search params and hash fragments
 */
export function parseRoomJoinInput(raw: string): {
  roomId: string;
  queryString: string;
} {
  let cleaned = (raw || '').trim();
  if (!cleaned) return { roomId: '', queryString: '' };

  let queryString = '';

  try {
    const urlString =
      cleaned.startsWith('http://') || cleaned.startsWith('https://')
        ? cleaned
        : cleaned.includes('/')
        ? `https://dummy.local/${cleaned.replace(/^\/+/, '')}`
        : null;

    if (urlString) {
      const parsed = new URL(urlString);
      queryString = parsed.search ? parsed.search.replace(/^\?/, '') : '';
      const pathParts = parsed.pathname.split('/').filter(Boolean);

      // Check for /rooms/:id or /lobby/:id
      const roomIdx = pathParts.findIndex(
        (p) => p.toLowerCase() === 'rooms' || p.toLowerCase() === 'lobby'
      );
      if (roomIdx !== -1 && pathParts[roomIdx + 1]) {
        return {
          roomId: decodeURIComponent(pathParts[roomIdx + 1]),
          queryString,
        };
      }

      if (pathParts.length > 0) {
        return {
          roomId: decodeURIComponent(pathParts[pathParts.length - 1]),
          queryString,
        };
      }
    }
  } catch {
    // Fallback if URL parsing throws
  }

  if (cleaned.includes('?')) {
    const [codePart, queryPart] = cleaned.split('?');
    cleaned = codePart.trim();
    queryString = queryPart ? queryPart.trim() : '';
  }

  cleaned = cleaned.split('#')[0].replace(/^\/+|\/+$/g, '');

  return { roomId: cleaned, queryString };
}

/**
 * Mobile-first sharing helper. Uses native Web Share API on mobile devices
 * with seamless fallback to clipboard copy.
 */
export async function shareLobbyLink(
  options: ShareLobbyOptions
): Promise<{ success: boolean; method: 'native-share' | 'clipboard' | 'cancelled'; url: string }> {
  const url = buildLobbyUrl(options);
  const title = options.roomTitle
    ? `AcidReflux: ${options.roomTitle}`
    : `AcidReflux Studio Lobby - ${options.roomId}`;
  const text = `Join the podcast studio lobby for "${
    options.roomTitle || options.roomId
  }" on your phone:`;

  if (
    typeof navigator !== 'undefined' &&
    typeof navigator.share === 'function'
  ) {
    try {
      await navigator.share({ title, text, url });
      return { success: true, method: 'native-share', url };
    } catch (err: unknown) {
      const errorObj = err as { name?: string };
      if (errorObj?.name === 'AbortError') {
        return { success: false, method: 'cancelled', url };
      }
    }
  }

  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(url);
      return { success: true, method: 'clipboard', url };
    } catch {
      // Clipboard write failed
    }
  }

  return { success: false, method: 'clipboard', url };
}
