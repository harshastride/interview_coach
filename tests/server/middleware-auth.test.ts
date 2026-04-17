import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the middleware functions directly (unit test without Express)
describe('Auth Middleware', () => {
  const mockReq = (overrides: Record<string, unknown> = {}) => ({
    isAuthenticated: vi.fn(() => true),
    user: { id: 1, email: 'test@example.com', name: 'Test', role: 'viewer', is_allowed: 1 },
    ...overrides,
  });

  const mockRes = () => {
    const res: Record<string, unknown> = {};
    res.status = vi.fn().mockReturnValue(res);
    res.json = vi.fn().mockReturnValue(res);
    return res;
  };

  const mockNext = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('requireAuth', () => {
    it('should call next() for authenticated and allowed user', async () => {
      const { requireAuth } = await import('../../src/server/middleware/auth.js');
      const req = mockReq();
      const res = mockRes();
      requireAuth(req as any, res as any, mockNext);
      expect(mockNext).toHaveBeenCalled();
    });

    it('should return 401 for unauthenticated user', async () => {
      const { requireAuth } = await import('../../src/server/middleware/auth.js');
      const req = mockReq({ isAuthenticated: vi.fn(() => false) });
      const res = mockRes();
      requireAuth(req as any, res as any, mockNext);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should return 403 for authenticated but not allowed user', async () => {
      const { requireAuth } = await import('../../src/server/middleware/auth.js');
      const req = mockReq({ user: { id: 1, role: 'viewer', is_allowed: 0 } });
      const res = mockRes();
      requireAuth(req as any, res as any, mockNext);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe('requireAdmin', () => {
    it('should call next() for admin user', async () => {
      const { requireAdmin } = await import('../../src/server/middleware/auth.js');
      const req = mockReq({ user: { id: 1, role: 'admin', is_allowed: 1 } });
      const res = mockRes();
      requireAdmin(req as any, res as any, mockNext);
      expect(mockNext).toHaveBeenCalled();
    });

    it('should return 403 for non-admin user', async () => {
      const { requireAdmin } = await import('../../src/server/middleware/auth.js');
      const req = mockReq({ user: { id: 1, role: 'viewer', is_allowed: 1 } });
      const res = mockRes();
      requireAdmin(req as any, res as any, mockNext);
      expect(res.status).toHaveBeenCalledWith(403);
    });
  });

  describe('requireUploader', () => {
    it('should call next() for admin', async () => {
      const { requireUploader } = await import('../../src/server/middleware/auth.js');
      const req = mockReq({ user: { id: 1, role: 'admin', is_allowed: 1 } });
      const res = mockRes();
      requireUploader(req as any, res as any, mockNext);
      expect(mockNext).toHaveBeenCalled();
    });

    it('should call next() for manager', async () => {
      const { requireUploader } = await import('../../src/server/middleware/auth.js');
      const req = mockReq({ user: { id: 1, role: 'manager', is_allowed: 1 } });
      const res = mockRes();
      requireUploader(req as any, res as any, mockNext);
      expect(mockNext).toHaveBeenCalled();
    });

    it('should return 403 for viewer', async () => {
      const { requireUploader } = await import('../../src/server/middleware/auth.js');
      const req = mockReq({ user: { id: 1, role: 'viewer', is_allowed: 1 } });
      const res = mockRes();
      requireUploader(req as any, res as any, mockNext);
      expect(res.status).toHaveBeenCalledWith(403);
    });
  });
});
