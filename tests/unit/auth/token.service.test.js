'use strict';

const {
  generateToken,
  generateRefreshToken,
  verifyRefreshToken,
  verifyToken,
  decodeToken,
} = require('../../../apps/api/src/modules/auth/token.service');

describe('token.service', () => {
  const mockUser = {
    user_id: '550e8400-e29b-41d4-a716-446655440000',
    email: 'test@example.com',
    role: 'admin',
  };

  // ─── generateToken ───────────────────────────────────────
  describe('generateToken()', () => {
    it('should return a string token', () => {
      const token = generateToken(mockUser);
      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(3); // JWT has 3 parts
    });

    it('should embed user_id, email, role in payload', () => {
      const token = generateToken(mockUser);
      const decoded = decodeToken(token);
      expect(decoded.user_id).toBe(mockUser.user_id);
      expect(decoded.email).toBe(mockUser.email);
      expect(decoded.role).toBe(mockUser.role);
    });

    it('should set issuer and audience claims', () => {
      const token = generateToken(mockUser);
      const decoded = decodeToken(token);
      expect(decoded.iss).toBe('finance-api');
      expect(decoded.aud).toBe('finance-client');
    });

    it('should set expiry (~1 hour from now)', () => {
      const before = Math.floor(Date.now() / 1000);
      const token = generateToken(mockUser);
      const decoded = decodeToken(token);
      const oneHour = 3600;
      expect(decoded.exp - decoded.iat).toBe(oneHour);
      expect(decoded.iat).toBeGreaterThanOrEqual(before);
    });

    it('should accept user_id or id field', () => {
      const withId = { id: mockUser.user_id, email: mockUser.email, role: mockUser.role };
      const token = generateToken(withId);
      const decoded = decodeToken(token);
      expect(decoded.user_id).toBe(mockUser.user_id);
    });

    it('should throw if JWT_SECRET is missing', () => {
      const secret = process.env.JWT_SECRET;
      delete process.env.JWT_SECRET;
      expect(() => generateToken(mockUser)).toThrow('JWT_SECRET');
      process.env.JWT_SECRET = secret;
    });
  });

  // ─── verifyToken ─────────────────────────────────────────
  describe('verifyToken()', () => {
    it('should return decoded payload for a valid token', () => {
      const token = generateToken(mockUser);
      const payload = verifyToken(token);
      expect(payload.user_id).toBe(mockUser.user_id);
      expect(payload.role).toBe(mockUser.role);
    });

    it('should throw JsonWebTokenError for an invalid token', () => {
      expect(() => verifyToken('invalid.token.here')).toThrow();
    });

    it('should throw TokenExpiredError for an expired token', () => {
      // Generate token with -1s expiry (already expired)
      const jwt = require('jsonwebtoken');
      const expired = jwt.sign(
        { user_id: 'x', email: 'x@x.com', role: 'viewer' },
        process.env.JWT_SECRET,
        { expiresIn: -1, issuer: 'finance-api', audience: 'finance-client' }
      );
      expect(() => verifyToken(expired)).toThrow('expired');
    });

    it('should throw for a token signed with wrong secret', () => {
      const jwt = require('jsonwebtoken');
      const wrongToken = jwt.sign({ user_id: 'x' }, 'wrong-secret-12345678901234567890');
      expect(() => verifyToken(wrongToken)).toThrow();
    });

    it('should throw if JWT_SECRET is missing', () => {
      const secret = process.env.JWT_SECRET;
      const token = generateToken(mockUser);
      delete process.env.JWT_SECRET;
      expect(() => verifyToken(token)).toThrow('JWT_SECRET');
      process.env.JWT_SECRET = secret;
    });
  });

  // ─── decodeToken ─────────────────────────────────────────
  describe('decodeToken()', () => {
    it('should decode without verification', () => {
      const token = generateToken(mockUser);
      const decoded = decodeToken(token);
      expect(decoded.user_id).toBe(mockUser.user_id);
    });

    it('should return null for completely invalid token', () => {
      const decoded = decodeToken('not-a-jwt-at-all');
      expect(decoded).toBeNull();
    });
  });

  // ─── Refresh Tokens ──────────────────────────────────────
  describe('refresh token lifecycle', () => {
    it('should generate refresh token with required claims', () => {
      const token = generateRefreshToken(mockUser, {
        session_id: 'a3ec5b89-6df4-4d79-a2c6-8db8a6f26f40',
        device_id: 'web',
      });

      const decoded = decodeToken(token);
      expect(decoded.token_type).toBe('refresh');
      expect(decoded.session_id).toBe('a3ec5b89-6df4-4d79-a2c6-8db8a6f26f40');
      expect(decoded.device_id).toBe('web');
    });

    it('should verify a valid refresh token', () => {
      const token = generateRefreshToken(mockUser, {
        session_id: '0d3e5c76-4df8-43b4-87db-7ac385516253',
        device_id: 'mobile',
      });

      const payload = verifyRefreshToken(token);
      expect(payload.token_type).toBe('refresh');
      expect(payload.device_id).toBe('mobile');
    });

    it('should reject refresh token in access-token verifier', () => {
      const token = generateRefreshToken(mockUser, {
        session_id: 'f7e16b1a-a63e-432d-9538-66f6b1cf087d',
        device_id: 'web',
      });

      expect(() => verifyToken(token)).toThrow('Refresh token');
    });
  });
});
