'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { logAudit } from '@/lib/audit/log';
import { API_SCOPES, generateApiKey, hashApiKey, NEW_API_KEY_COOKIE } from '@/lib/api-keys';
import { prisma } from '@/lib/db';
import { PERMISSIONS, requirePermission } from '@/lib/rbac/permissions';

const VALID_SCOPES: string[] = Object.values(API_SCOPES);

// GE-11: nøkkelen vises kun én gang (kort levetid i en httpOnly-cookie
// fremfor en spørrestreng, som ellers ville havnet i nettleserhistorikk og
// tilgangslogger).
export async function createApiKeyAction(formData: FormData): Promise<void> {
  const session = await requirePermission(PERMISSIONS.API_KEYS_MANAGE);
  const label = String(formData.get('label') ?? '').trim();
  const scopes = formData.getAll('scopes').map(String).filter((scope) => VALID_SCOPES.includes(scope));

  if (!label || scopes.length === 0) {
    redirect('/admin/api-keys?error=missing_fields');
  }

  const key = generateApiKey();
  const apiKey = await prisma.apiKey.create({
    data: { label, hashedKey: hashApiKey(key), scopes, createdById: session.id },
  });

  await logAudit({
    userId: session.id,
    action: 'create',
    entityType: 'ApiKey',
    entityId: apiKey.id,
    after: { label, scopes },
  });

  cookies().set(NEW_API_KEY_COOKIE, key, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/admin/api-keys',
    maxAge: 30,
  });

  revalidatePath('/admin/api-keys');
}

export async function revokeApiKeyAction(formData: FormData): Promise<void> {
  const session = await requirePermission(PERMISSIONS.API_KEYS_MANAGE);
  const id = String(formData.get('id') ?? '');

  await prisma.apiKey.update({ where: { id }, data: { active: false } });

  await logAudit({
    userId: session.id,
    action: 'update',
    entityType: 'ApiKey',
    entityId: id,
    after: { active: false },
  });

  revalidatePath('/admin/api-keys');
}
