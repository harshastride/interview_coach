import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';
import { devAuth, devAuthEnabled } from '../../src/server/middleware/devAuth';
import type { DbUser } from '../../src/server/middleware/auth';

const user: DbUser = {
  id: 42, google_id: 'local-development-bypass',
  email: 'local-developer@example.invalid', name: 'Local Developer',
  avatar_url: null, role: 'viewer', is_allowed: 0,
};

afterEach(() => vi.unstubAllEnvs());

describe('local authentication bypass', () => {
  it('requires explicit opt-in in development', () => {
    expect(devAuthEnabled({})).toBe(false);
    expect(devAuthEnabled({ DEV_AUTH_BYPASS: 'false' })).toBe(false);
    expect(devAuthEnabled({ DEV_AUTH_BYPASS: 'true' })).toBe(true);
    expect(devAuthEnabled({ DEV_AUTH_BYPASS: 'true', NODE_ENV: 'development' })).toBe(true);
  });

  it.each(['production', 'test', 'staging'])('never enables in %s', (mode) => {
    expect(devAuthEnabled({ DEV_AUTH_BYPASS: 'true', NODE_ENV: mode })).toBe(false);
  });

  it.each(['127.0.0.1', '::1', '::ffff:127.0.0.1'])('provides a request-only identity for %s', (address) => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('DEV_AUTH_BYPASS', 'true');
    const req = { socket: { remoteAddress: address } } as Request;
    const next = vi.fn();
    devAuth(user)(req, {} as Response, next);
    expect(req.user).toMatchObject({ id: 42, role: 'admin', is_allowed: 1 });
    expect(user).toMatchObject({ role: 'viewer', is_allowed: 0 });
    expect(req.session).toBeUndefined();
    expect(next).toHaveBeenCalledOnce();
  });

  it.each([
    ['development', 'true', '192.168.1.10'],
    ['production', 'true', '127.0.0.1'],
    ['development', 'false', '127.0.0.1'],
  ])('preserves normal auth for mode=%s flag=%s address=%s', (mode, flag, address) => {
    vi.stubEnv('NODE_ENV', mode);
    vi.stubEnv('DEV_AUTH_BYPASS', flag);
    const req = { socket: { remoteAddress: address }, user } as Request;
    const next = vi.fn();
    devAuth(user)(req, {} as Response, next);
    expect(req.user).toBe(user);
    expect(next).toHaveBeenCalledOnce();
  });
});
