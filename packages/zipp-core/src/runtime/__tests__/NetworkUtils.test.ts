import { describe, it, expect } from '@jest/globals';
import {
  isLocalNetworkUrl,
  getHostPort,
  matchesWhitelistEntry,
  isUrlWhitelisted,
} from '../NetworkUtils.js';

describe('NetworkUtils', () => {
  describe('isLocalNetworkUrl', () => {
    describe('localhost variants', () => {
      it('should detect localhost', () => {
        expect(isLocalNetworkUrl('http://localhost')).toBe(true);
        expect(isLocalNetworkUrl('http://localhost:3000')).toBe(true);
        expect(isLocalNetworkUrl('https://localhost:443')).toBe(true);
      });

      it('should detect 127.0.0.1', () => {
        expect(isLocalNetworkUrl('http://127.0.0.1')).toBe(true);
        expect(isLocalNetworkUrl('http://127.0.0.1:8080')).toBe(true);
      });

      it('should detect IPv6 localhost', () => {
        expect(isLocalNetworkUrl('http://[::1]')).toBe(true);
        expect(isLocalNetworkUrl('http://[::1]:3000')).toBe(true);
      });
    });

    describe('private IP ranges', () => {
      it('should detect 10.0.0.0/8 range', () => {
        expect(isLocalNetworkUrl('http://10.0.0.1')).toBe(true);
        expect(isLocalNetworkUrl('http://10.255.255.255')).toBe(true);
        expect(isLocalNetworkUrl('http://10.1.2.3:8080')).toBe(true);
      });

      it('should detect 172.16.0.0/12 range', () => {
        expect(isLocalNetworkUrl('http://172.16.0.1')).toBe(true);
        expect(isLocalNetworkUrl('http://172.31.255.255')).toBe(true);
        expect(isLocalNetworkUrl('http://172.20.1.1:3000')).toBe(true);
      });

      it('should not detect 172.15.x.x or 172.32.x.x', () => {
        expect(isLocalNetworkUrl('http://172.15.0.1')).toBe(false);
        expect(isLocalNetworkUrl('http://172.32.0.1')).toBe(false);
      });

      it('should detect 192.168.0.0/16 range', () => {
        expect(isLocalNetworkUrl('http://192.168.0.1')).toBe(true);
        expect(isLocalNetworkUrl('http://192.168.1.100')).toBe(true);
        expect(isLocalNetworkUrl('http://192.168.255.255:8080')).toBe(true);
      });

      it('should detect 169.254.0.0/16 link-local range', () => {
        expect(isLocalNetworkUrl('http://169.254.0.1')).toBe(true);
        expect(isLocalNetworkUrl('http://169.254.255.255')).toBe(true);
      });
    });

    describe('public addresses', () => {
      it('should not detect public URLs', () => {
        expect(isLocalNetworkUrl('https://example.com')).toBe(false);
        expect(isLocalNetworkUrl('https://google.com')).toBe(false);
        expect(isLocalNetworkUrl('http://8.8.8.8')).toBe(false);
      });

      it('should not detect 192.169.x.x', () => {
        expect(isLocalNetworkUrl('http://192.169.0.1')).toBe(false);
      });
    });

    describe('edge cases', () => {
      it('should handle invalid URLs', () => {
        expect(isLocalNetworkUrl('not-a-url')).toBe(false);
        expect(isLocalNetworkUrl('')).toBe(false);
      });

      it('should handle case-insensitive localhost', () => {
        expect(isLocalNetworkUrl('http://LOCALHOST')).toBe(true);
        expect(isLocalNetworkUrl('http://LocalHost:3000')).toBe(true);
      });
    });
  });

  describe('getHostPort', () => {
    it('should extract host and port', () => {
      expect(getHostPort('http://localhost:3000')).toBe('localhost:3000');
      expect(getHostPort('http://192.168.1.1:8080')).toBe('192.168.1.1:8080');
    });

    it('should use default port 80 for http', () => {
      expect(getHostPort('http://localhost')).toBe('localhost:80');
      expect(getHostPort('http://example.com')).toBe('example.com:80');
    });

    it('should use default port 443 for https', () => {
      expect(getHostPort('https://localhost')).toBe('localhost:443');
      expect(getHostPort('https://example.com')).toBe('example.com:443');
    });

    it('should handle explicit default ports', () => {
      expect(getHostPort('http://localhost:80')).toBe('localhost:80');
      expect(getHostPort('https://localhost:443')).toBe('localhost:443');
    });

    it('should return empty string for invalid URLs', () => {
      expect(getHostPort('not-a-url')).toBe('');
      expect(getHostPort('')).toBe('');
    });
  });

  describe('matchesWhitelistEntry', () => {
    it('should match exact host:port', () => {
      expect(matchesWhitelistEntry('localhost:3000', 'localhost:3000')).toBe(true);
      expect(matchesWhitelistEntry('localhost:3000', 'localhost:8080')).toBe(false);
    });

    it('should match host only (any port)', () => {
      expect(matchesWhitelistEntry('localhost:3000', 'localhost')).toBe(true);
      expect(matchesWhitelistEntry('localhost:8080', 'localhost')).toBe(true);
      expect(matchesWhitelistEntry('other:3000', 'localhost')).toBe(false);
    });

    it('should match wildcard port', () => {
      expect(matchesWhitelistEntry('localhost:3000', 'localhost:*')).toBe(true);
      expect(matchesWhitelistEntry('localhost:8080', 'localhost:*')).toBe(true);
      expect(matchesWhitelistEntry('other:3000', 'localhost:*')).toBe(false);
    });

    it('should handle IP addresses', () => {
      expect(matchesWhitelistEntry('192.168.1.1:8080', '192.168.1.1:8080')).toBe(true);
      expect(matchesWhitelistEntry('192.168.1.1:8080', '192.168.1.1')).toBe(true);
      expect(matchesWhitelistEntry('192.168.1.1:8080', '192.168.1.1:*')).toBe(true);
    });
  });

  describe('isUrlWhitelisted', () => {
    const whitelist = ['localhost:3000', '192.168.1.1', 'api.local:*'];

    it('should allow whitelisted URLs', () => {
      expect(isUrlWhitelisted('http://localhost:3000', whitelist)).toBe(true);
      expect(isUrlWhitelisted('http://192.168.1.1:8080', whitelist)).toBe(true);
      expect(isUrlWhitelisted('http://api.local:3000', whitelist)).toBe(true);
      expect(isUrlWhitelisted('http://api.local:8080', whitelist)).toBe(true);
    });

    it('should deny non-whitelisted URLs', () => {
      expect(isUrlWhitelisted('http://localhost:8080', whitelist)).toBe(false);
      expect(isUrlWhitelisted('http://192.168.1.2:8080', whitelist)).toBe(false);
      expect(isUrlWhitelisted('http://other.local:3000', whitelist)).toBe(false);
    });

    it('should allow all when allowAll is true', () => {
      expect(isUrlWhitelisted('http://anything:9999', [], true)).toBe(true);
      expect(isUrlWhitelisted('http://localhost:3000', [], true)).toBe(true);
    });

    it('should handle empty whitelist', () => {
      expect(isUrlWhitelisted('http://localhost:3000', [])).toBe(false);
    });

    it('should handle invalid URLs', () => {
      expect(isUrlWhitelisted('not-a-url', whitelist)).toBe(false);
    });
  });
});
