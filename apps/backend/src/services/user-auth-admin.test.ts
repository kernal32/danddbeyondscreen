import { describe, expect, it } from 'vitest';
import { openAppDatabase } from '../db/sqlite.js';
import { UserAuthService } from './user-auth.service.js';

let sqliteOk = false;
try {
  const d = openAppDatabase(':memory:');
  d.prepare('SELECT 1').get();
  d.close();
  sqliteOk = true;
} catch {
  sqliteOk = false;
}

describe.skipIf(!sqliteOk)('UserAuthService admin / soft-delete', () => {
  it('refuses soft-delete for the only active allowlisted account', () => {
    const db = openAppDatabase(':memory:');
    const svc = new UserAuthService(db);
    const r = svc.register('admin@x.test', 'passwordlong1');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const allow = new Set(['admin@x.test']);
    expect(svc.softDeleteUser(r.id, allow)).toEqual({ ok: false, reason: 'last_admin' });
  });

  it('allows soft-delete of allowlisted user when another allowlisted user is active', () => {
    const db = openAppDatabase(':memory:');
    const svc = new UserAuthService(db);
    const a = svc.register('a@x.test', 'passwordlong1');
    const b = svc.register('b@x.test', 'passwordlong1');
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    const allow = new Set(['a@x.test', 'b@x.test']);
    expect(svc.softDeleteUser(a.id, allow)).toEqual({ ok: true });
    expect(svc.getById(a.id)).toBeNull();
    expect(svc.getById(b.id)).not.toBeNull();
  });

  it('allows soft-delete of non-allowlisted user even if sole allowlisted admin exists', () => {
    const db = openAppDatabase(':memory:');
    const svc = new UserAuthService(db);
    const admin = svc.register('admin@x.test', 'passwordlong1');
    const user = svc.register('user@x.test', 'passwordlong1');
    expect(admin.ok && user.ok).toBe(true);
    if (!admin.ok || !user.ok) return;
    const allow = new Set(['admin@x.test']);
    expect(svc.softDeleteUser(user.id, allow)).toEqual({ ok: true });
    expect(svc.getById(admin.id)).not.toBeNull();
  });

  it('excludes soft-deleted users from login and getById', () => {
    const db = openAppDatabase(':memory:');
    const svc = new UserAuthService(db);
    const u = svc.register('u@x.test', 'passwordlong1');
    expect(u.ok).toBe(true);
    if (!u.ok) return;
    const allow = new Set<string>();
    expect(svc.softDeleteUser(u.id, allow)).toEqual({ ok: true });
    expect(svc.login('u@x.test', 'passwordlong1')).toBeNull();
    expect(svc.getById(u.id)).toBeNull();
  });
});
