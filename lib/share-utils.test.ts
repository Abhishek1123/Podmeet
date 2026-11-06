import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  buildLobbyUrl,
  parseRoomJoinInput,
  shareLobbyLink,
} from './share-utils';

describe('share-utils', () => {
  describe('buildLobbyUrl', () => {
    it('builds a canonical room lobby URL', () => {
      const url = buildLobbyUrl(
        { roomId: 'ep-001', mode: 'small-room' },
        'https://acidreflux.app'
      );
      expect(url).toBe('https://acidreflux.app/rooms/ep-001?mode=small-room');
    });

    it('includes member name and email if provided', () => {
      const url = buildLobbyUrl(
        {
          roomId: 'ep-001',
          mode: 'remote',
          member: 'Abhishek Chatterjee',
          email: 'abhi@test.com',
        },
        'https://acidreflux.app'
      );
      expect(url).toContain('/rooms/ep-001');
      expect(url).toContain('mode=remote');
      expect(url).toContain('member=Abhishek+Chatterjee');
      expect(url).toContain('email=abhi%40test.com');
    });

    it('properly encodes special characters in roomId', () => {
      const url = buildLobbyUrl(
        { roomId: 'my room #1' },
        'https://acidreflux.app'
      );
      expect(url).toBe('https://acidreflux.app/rooms/my%20room%20%231');
    });
  });

  describe('parseRoomJoinInput', () => {
    it('returns empty for empty input', () => {
      expect(parseRoomJoinInput('')).toEqual({ roomId: '', queryString: '' });
      expect(parseRoomJoinInput('   ')).toEqual({ roomId: '', queryString: '' });
    });

    it('parses bare room codes', () => {
      expect(parseRoomJoinInput('ep-101')).toEqual({
        roomId: 'ep-101',
        queryString: '',
      });
      expect(parseRoomJoinInput('  my-room-abc  ')).toEqual({
        roomId: 'my-room-abc',
        queryString: '',
      });
    });

    it('parses relative /rooms/ URLs', () => {
      expect(parseRoomJoinInput('/rooms/ep-101')).toEqual({
        roomId: 'ep-101',
        queryString: '',
      });
      expect(parseRoomJoinInput('rooms/ep-101?mode=small-room')).toEqual({
        roomId: 'ep-101',
        queryString: 'mode=small-room',
      });
    });

    it('parses relative /lobby/ URLs', () => {
      expect(parseRoomJoinInput('/lobby/ep-101')).toEqual({
        roomId: 'ep-101',
        queryString: '',
      });
      expect(parseRoomJoinInput('lobby/ep-101?mode=remote')).toEqual({
        roomId: 'ep-101',
        queryString: 'mode=remote',
      });
    });

    it('parses absolute /rooms/ URLs with full host', () => {
      const fullUrl = 'https://acidreflux.vercel.app/rooms/ep-101?mode=small-room';
      expect(parseRoomJoinInput(fullUrl)).toEqual({
        roomId: 'ep-101',
        queryString: 'mode=small-room',
      });
    });

    it('parses absolute /lobby/ URLs with full host', () => {
      const fullUrl =
        'https://acidreflux.vercel.app/lobby/ep-101?mode=remote&member=John';
      expect(parseRoomJoinInput(fullUrl)).toEqual({
        roomId: 'ep-101',
        queryString: 'mode=remote&member=John',
      });
    });

    it('strips hash fragments cleanly', () => {
      expect(
        parseRoomJoinInput('https://domain.com/rooms/ep-101#studio')
      ).toEqual({
        roomId: 'ep-101',
        queryString: '',
      });
    });
  });

  describe('shareLobbyLink', () => {
    beforeEach(() => {
      vi.restoreAllMocks();
    });

    it('uses navigator.share when available', async () => {
      const shareMock = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(globalThis.navigator, 'share', {
        value: shareMock,
        configurable: true,
      });

      const res = await shareLobbyLink({
        roomId: 'ep-99',
        roomTitle: 'Hot Take Episode',
        mode: 'small-room',
      });

      expect(shareMock).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'AcidReflux: Hot Take Episode',
          url: expect.stringContaining('/rooms/ep-99?mode=small-room'),
        })
      );
      expect(res.success).toBe(true);
      expect(res.method).toBe('native-share');
    });

    it('falls back to clipboard.writeText when navigator.share is missing', async () => {
      Object.defineProperty(globalThis.navigator, 'share', {
        value: undefined,
        configurable: true,
      });
      const writeTextMock = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(globalThis.navigator, 'clipboard', {
        value: { writeText: writeTextMock },
        configurable: true,
      });

      const res = await shareLobbyLink({
        roomId: 'ep-99',
        roomTitle: 'Hot Take Episode',
        mode: 'small-room',
      });

      expect(writeTextMock).toHaveBeenCalledWith(
        expect.stringContaining('/rooms/ep-99?mode=small-room')
      );
      expect(res.success).toBe(true);
      expect(res.method).toBe('clipboard');
    });
  });
});
