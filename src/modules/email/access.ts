// EP-03: en bruker har tilgang til sin egen postboks, pluss felles postbokser
// der administrator har gitt en av brukerens roller tilgang.
import { prisma } from '@/lib/db';

export async function getAccessibleEmailAccounts(userId: string) {
  const userRoles = await prisma.userRole.findMany({ where: { userId }, select: { roleId: true } });
  const roleIds = userRoles.map((userRole) => userRole.roleId);

  return prisma.emailAccount.findMany({
    where: {
      active: true,
      OR: [
        { ownerUserId: userId },
        { shared: true, accessRoles: { some: { roleId: { in: roleIds } } } },
      ],
    },
    select: {
      id: true,
      address: true,
      shared: true,
      ownerUserId: true,
    },
    orderBy: { address: 'asc' },
  });
}
