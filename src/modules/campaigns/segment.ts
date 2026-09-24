// GR-01/02: løser ut hvilke kunder en kampanje skal sendes til. Kombinerer
// kundegrupper (tomt utvalg = alle kunder) med valgfrie filtre (AND), og
// utelater deretter kunder som har trukket samtykke til nyhetsbrev.
// Norsk markedsføringslov tillater markedsføring til eksisterende
// kundeforhold uten eget samtykke – derfor er "har ingen registrert
// samtykke" fortsatt kvalifisert, kun et eksplisitt WITHDRAWN utelates.
import { prisma } from '@/lib/db';

export const NEWSLETTER_CONSENT_CHANNEL = 'nyhetsbrev';

export interface CampaignSegmentFilter {
  customerGroupIds: string[];
  filterPurchasedWithinDays: number | null;
  filterCountry: string | null;
  filterMaterialId: string | null;
}

async function customersWhoPurchasedWithinDays(days: number): Promise<Set<string>> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const orders = await prisma.order.findMany({
    where: { createdAt: { gte: since } },
    select: { quote: { select: { customerId: true } } },
  });
  return new Set(orders.map((order) => order.quote.customerId));
}

async function customersInCountry(country: string): Promise<Set<string>> {
  const addresses = await prisma.address.findMany({
    where: { country, customerId: { not: null } },
    select: { customerId: true },
  });
  return new Set(addresses.map((address) => address.customerId!));
}

async function customersInterestedInMaterial(materialId: string): Promise<Set<string>> {
  const lines = await prisma.quoteLine.findMany({
    where: { materialId },
    select: { quote: { select: { customerId: true } } },
  });
  return new Set(lines.map((line) => line.quote.customerId));
}

async function customersWithWithdrawnNewsletterConsent(): Promise<Set<string>> {
  const consents = await prisma.consent.findMany({
    where: { channel: NEWSLETTER_CONSENT_CHANNEL, customerId: { not: null } },
    orderBy: { occurredAt: 'asc' },
    select: { customerId: true, status: true },
  });
  // Siste registrerte status per kunde vinner (listen er sortert eldst -> nyest).
  const latestStatusByCustomer = new Map<string, string>();
  for (const consent of consents) {
    latestStatusByCustomer.set(consent.customerId!, consent.status);
  }
  return new Set(
    [...latestStatusByCustomer.entries()]
      .filter(([, status]) => status === 'WITHDRAWN')
      .map(([customerId]) => customerId),
  );
}

/** Returnerer id-ene til kundene en kampanje med gitt filter skal sendes til. */
export async function resolveCampaignRecipientCustomerIds(filter: CampaignSegmentFilter): Promise<string[]> {
  const basePool = await prisma.customer.findMany({
    where: {
      deletedAt: null,
      email: { not: null },
      ...(filter.customerGroupIds.length > 0 ? { groups: { some: { id: { in: filter.customerGroupIds } } } } : {}),
    },
    select: { id: true },
  });

  let eligible = new Set(basePool.map((customer) => customer.id));

  if (filter.filterPurchasedWithinDays !== null) {
    const purchasers = await customersWhoPurchasedWithinDays(filter.filterPurchasedWithinDays);
    eligible = new Set([...eligible].filter((id) => purchasers.has(id)));
  }

  if (filter.filterCountry) {
    const inCountry = await customersInCountry(filter.filterCountry);
    eligible = new Set([...eligible].filter((id) => inCountry.has(id)));
  }

  if (filter.filterMaterialId) {
    const interested = await customersInterestedInMaterial(filter.filterMaterialId);
    eligible = new Set([...eligible].filter((id) => interested.has(id)));
  }

  const withdrawn = await customersWithWithdrawnNewsletterConsent();
  return [...eligible].filter((id) => !withdrawn.has(id));
}
