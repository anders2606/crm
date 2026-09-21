'use server';

import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';

import { prisma } from '@/lib/db';
import { logAudit } from '@/lib/audit/log';
import { PENDING_COOKIE_NAME } from '@/lib/auth/constants';
import { createPendingToken, verifyPendingToken } from '@/lib/auth/pending';
import { verifyPassword } from '@/lib/auth/password';
import { createSession, destroySession, getSession } from '@/lib/auth/session';
import { verifyTotp } from '@/lib/auth/totp';

function requestMeta(): { ipAddress?: string; userAgent?: string } {
  const headerList = headers();
  return {
    ipAddress: headerList.get('x-forwarded-for') ?? undefined,
    userAgent: headerList.get('user-agent') ?? undefined,
  };
}

function safeNextPath(next: FormDataEntryValue | null): string {
  const value = typeof next === 'string' ? next : '/';
  // Kun interne stier – aldri følg en ekstern URL fra et skjemafelt.
  return value.startsWith('/') && !value.startsWith('//') ? value : '/';
}

export async function loginWithPassword(formData: FormData): Promise<void> {
  const email = String(formData.get('email') ?? '')
    .trim()
    .toLowerCase();
  const password = String(formData.get('password') ?? '');
  const next = safeNextPath(formData.get('next'));

  const user = email ? await prisma.user.findUnique({ where: { email } }) : null;
  const passwordOk = user ? await verifyPassword(password, user.passwordHash) : false;

  if (!user || !user.active || !passwordOk) {
    await logAudit({
      userId: user?.id ?? null,
      action: 'login_failed',
      entityType: 'User',
      entityId: user?.id,
      after: { email },
    });
    redirect(`/login?error=invalid&next=${encodeURIComponent(next)}`);
  }

  const { value, expiresAt } = createPendingToken(user.id);
  cookies().set(PENDING_COOKIE_NAME, value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    expires: expiresAt,
  });

  redirect(`/login?next=${encodeURIComponent(next)}`);
}

export async function verifyTotpCode(formData: FormData): Promise<void> {
  const code = String(formData.get('code') ?? '');
  const next = safeNextPath(formData.get('next'));
  const token = cookies().get(PENDING_COOKIE_NAME)?.value;
  const userId = token ? verifyPendingToken(token) : null;

  if (!userId) {
    redirect('/login?error=expired');
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !user.active || !user.totpSecret) {
    redirect('/login?error=expired');
  }

  const valid = verifyTotp(user.totpSecret, code);
  if (!valid) {
    await logAudit({ userId: user.id, action: 'login_failed', entityType: 'User', entityId: user.id });
    redirect(`/login?error=invalid_code&next=${encodeURIComponent(next)}`);
  }

  if (!user.totpEnabled) {
    await prisma.user.update({ where: { id: user.id }, data: { totpEnabled: true } });
  }

  cookies().delete(PENDING_COOKIE_NAME);
  await createSession(user.id, requestMeta());
  await logAudit({ userId: user.id, action: 'login', entityType: 'User', entityId: user.id });
  redirect(next);
}

export async function logoutAction(): Promise<void> {
  const session = await getSession();
  await destroySession();
  if (session) {
    await logAudit({ userId: session.id, action: 'logout', entityType: 'User', entityId: session.id });
  }
  redirect('/login');
}
