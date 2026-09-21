import { describe, expect, it, vi } from 'vitest';

import { getSession } from '@/lib/auth/session';
import {
  AuthenticationRequiredError,
  hasPermission,
  PERMISSIONS,
  PermissionDeniedError,
  requirePermission,
} from '@/lib/rbac/permissions';

vi.mock('@/lib/auth/session', () => ({
  getSession: vi.fn(),
}));

const mockedGetSession = vi.mocked(getSession);

describe('RBAC (GE-03, arbeidsregel 8: rettigheter sjekkes på serveren)', () => {
  it('hasPermission er false uten sesjon', () => {
    expect(hasPermission(null, PERMISSIONS.CUSTOMER_READ)).toBe(false);
  });

  it('hasPermission sjekker faktisk rettighetsnøkkel', () => {
    const session = {
      id: '1',
      name: 'Test',
      email: 't@example.test',
      roles: ['Selger'],
      permissions: [PERMISSIONS.CUSTOMER_READ],
    };
    expect(hasPermission(session, PERMISSIONS.CUSTOMER_READ)).toBe(true);
    expect(hasPermission(session, PERMISSIONS.ADMIN_ROLES_MANAGE)).toBe(false);
  });

  it('requirePermission kaster AuthenticationRequiredError uten innlogget bruker', async () => {
    mockedGetSession.mockResolvedValueOnce(null);
    await expect(requirePermission(PERMISSIONS.CUSTOMER_READ)).rejects.toBeInstanceOf(
      AuthenticationRequiredError,
    );
  });

  it('requirePermission kaster PermissionDeniedError – en selger nektes admin-rettigheter', async () => {
    mockedGetSession.mockResolvedValueOnce({
      id: '1',
      name: 'Selger',
      email: 'selger@marmor.no',
      roles: ['Selger'],
      permissions: [PERMISSIONS.CUSTOMER_READ],
    });
    await expect(requirePermission(PERMISSIONS.ADMIN_ROLES_MANAGE)).rejects.toBeInstanceOf(
      PermissionDeniedError,
    );
  });

  it('requirePermission returnerer sesjonen når rettigheten finnes', async () => {
    const session = {
      id: '1',
      name: 'Admin',
      email: 'admin@marmor.no',
      roles: ['Administrator'],
      permissions: [PERMISSIONS.ADMIN_ROLES_MANAGE],
    };
    mockedGetSession.mockResolvedValueOnce(session);
    await expect(requirePermission(PERMISSIONS.ADMIN_ROLES_MANAGE)).resolves.toEqual(session);
  });
});
