// IN-01/KU-08: toveis synkronisering av kunder og leverandører. Kalles KUN
// fra workeren (arbeidsregel 12, se src/worker/index.ts) – dette er den ene
// modulen som faktisk utfører PowerOffice-kall, ikke bare legger jobber i kø.
import type { PowerOfficeSyncJobData } from '@/lib/jobs';
import { prisma } from '@/lib/db';
import { getPowerOfficeClient, type PowerOfficeClient } from '@/integrations/poweroffice';

import { getPowerOfficeCredentials, isPowerOfficeWriteEnabled } from './settings';
import { recordSyncLog } from './sync-log';

async function getClientOrSkip(): Promise<PowerOfficeClient | null> {
  const credentials = await getPowerOfficeCredentials();
  if (!credentials) {
    return null;
  }
  return getPowerOfficeClient(credentials);
}

/**
 * IN-01: når en kunde registreres i CRM og allerede finnes i PowerOffice
 * (samme org.nr. eller e-post), kobles de sammen i stedet for å opprette
 * duplikat. Finnes ingen match og skriving er aktivert, opprettes en ny post.
 */
export async function matchOrCreateCustomer(customerId: string): Promise<void> {
  const client = await getClientOrSkip();
  if (!client) {
    return;
  }

  const customer = await prisma.customer.findUnique({ where: { id: customerId } });
  if (!customer || customer.poweroffice_id) {
    return;
  }

  try {
    const match = await client.findCustomerByOrgNrOrEmail(customer.orgNr, customer.email);
    if (match) {
      await prisma.customer.update({ where: { id: customerId }, data: { poweroffice_id: match.powerOfficeId } });
      await recordSyncLog({
        direction: 'in',
        status: 'success',
        entityType: 'Customer',
        entityId: customerId,
        message: `Koblet til eksisterende PowerOffice-kunde ${match.powerOfficeId} (${match.name})`,
      });
      return;
    }

    if (!(await isPowerOfficeWriteEnabled())) {
      await recordSyncLog({
        direction: 'out',
        status: 'error',
        entityType: 'Customer',
        entityId: customerId,
        message: 'Fant ingen match i PowerOffice. Skriving er ikke aktivert, så ingen ny post ble opprettet.',
      });
      return;
    }

    const powerOfficeId = await client.createCustomer({
      name: customer.name,
      orgNr: customer.orgNr,
      email: customer.email,
      phone: customer.phone,
      paymentTermsDays: customer.paymentTermsDays,
    });
    await prisma.customer.update({ where: { id: customerId }, data: { poweroffice_id: powerOfficeId } });
    await recordSyncLog({
      direction: 'out',
      status: 'success',
      entityType: 'Customer',
      entityId: customerId,
      message: `Opprettet ny PowerOffice-kunde ${powerOfficeId}`,
    });
  } catch (error) {
    await recordSyncLog({
      direction: 'out',
      status: 'error',
      entityType: 'Customer',
      entityId: customerId,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function matchOrCreateSupplier(supplierId: string): Promise<void> {
  const client = await getClientOrSkip();
  if (!client) {
    return;
  }

  const supplier = await prisma.supplier.findUnique({ where: { id: supplierId } });
  if (!supplier || supplier.poweroffice_id) {
    return;
  }

  try {
    const match = await client.findSupplierByOrgNrOrEmail(null, supplier.email);
    if (match) {
      await prisma.supplier.update({ where: { id: supplierId }, data: { poweroffice_id: match.powerOfficeId } });
      await recordSyncLog({
        direction: 'in',
        status: 'success',
        entityType: 'Supplier',
        entityId: supplierId,
        message: `Koblet til eksisterende PowerOffice-leverandør ${match.powerOfficeId} (${match.name})`,
      });
      return;
    }

    if (!(await isPowerOfficeWriteEnabled())) {
      await recordSyncLog({
        direction: 'out',
        status: 'error',
        entityType: 'Supplier',
        entityId: supplierId,
        message: 'Fant ingen match i PowerOffice. Skriving er ikke aktivert, så ingen ny post ble opprettet.',
      });
      return;
    }

    const powerOfficeId = await client.createSupplier({
      name: supplier.name,
      orgNr: null,
      email: supplier.email,
      phone: supplier.phone,
      paymentTermsDays: supplier.paymentTermsDays,
    });
    await prisma.supplier.update({ where: { id: supplierId }, data: { poweroffice_id: powerOfficeId } });
    await recordSyncLog({
      direction: 'out',
      status: 'success',
      entityType: 'Supplier',
      entityId: supplierId,
      message: `Opprettet ny PowerOffice-leverandør ${powerOfficeId}`,
    });
  } catch (error) {
    await recordSyncLog({
      direction: 'out',
      status: 'error',
      entityType: 'Supplier',
      entityId: supplierId,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * IN-01: administrator velger å hente inn "alle" – oppretter en CRM-post for
 * hver PowerOffice-kunde/-leverandør som ikke allerede er koblet, og kobler
 * (fremfor å duplisere) når en CRM-post med samme org.nr. finnes fra før.
 */
export async function importAllFromPowerOffice(): Promise<{ customers: number; suppliers: number }> {
  const client = await getClientOrSkip();
  if (!client) {
    await recordSyncLog({
      direction: 'in',
      status: 'error',
      message: 'PowerOffice er ikke satt opp – kan ikke hente inn kunder/leverandører.',
    });
    return { customers: 0, suppliers: 0 };
  }

  let customersImported = 0;
  let suppliersImported = 0;

  try {
    const remoteCustomers = await client.listCustomers();
    for (const remote of remoteCustomers) {
      const alreadyLinked = await prisma.customer.findUnique({ where: { poweroffice_id: remote.powerOfficeId } });
      if (alreadyLinked) {
        continue;
      }
      const existingByOrgNr = remote.orgNr
        ? await prisma.customer.findFirst({ where: { orgNr: remote.orgNr, poweroffice_id: null } })
        : null;
      if (existingByOrgNr) {
        await prisma.customer.update({
          where: { id: existingByOrgNr.id },
          data: { poweroffice_id: remote.powerOfficeId },
        });
      } else {
        await prisma.customer.create({
          data: {
            type: 'COMPANY',
            name: remote.name,
            orgNr: remote.orgNr,
            email: remote.email,
            phone: remote.phone,
            paymentTermsDays: remote.paymentTermsDays,
            poweroffice_id: remote.powerOfficeId,
          },
        });
      }
      customersImported += 1;
    }

    const remoteSuppliers = await client.listSuppliers();
    for (const remote of remoteSuppliers) {
      const alreadyLinked = await prisma.supplier.findUnique({ where: { poweroffice_id: remote.powerOfficeId } });
      if (alreadyLinked) {
        continue;
      }
      // Supplier har ingen orgNr-kolonne (internasjonale leverandører, kap. 9)
      // – match på e-post mot ulenkede leverandører i stedet.
      const existingByEmail = remote.email
        ? await prisma.supplier.findFirst({ where: { email: remote.email, poweroffice_id: null } })
        : null;
      if (existingByEmail) {
        await prisma.supplier.update({
          where: { id: existingByEmail.id },
          data: { poweroffice_id: remote.powerOfficeId },
        });
      } else {
        await prisma.supplier.create({
          data: {
            name: remote.name,
            country: 'NO',
            email: remote.email,
            phone: remote.phone,
            paymentTermsDays: remote.paymentTermsDays,
            poweroffice_id: remote.powerOfficeId,
          },
        });
      }
      suppliersImported += 1;
    }

    await recordSyncLog({
      direction: 'in',
      status: 'success',
      message: `Hentet inn ${customersImported} kunde(r) og ${suppliersImported} leverandør(er) fra PowerOffice.`,
    });
  } catch (error) {
    await recordSyncLog({
      direction: 'in',
      status: 'error',
      message: error instanceof Error ? error.message : String(error),
    });
  }

  return { customers: customersImported, suppliers: suppliersImported };
}

/** IN-01: "et utvalg" – slår opp én bestemt kunde/leverandør på org.nr. */
export async function lookupAndLinkByOrgNr(entityType: 'Customer' | 'Supplier', orgNr: string): Promise<void> {
  const client = await getClientOrSkip();
  if (!client) {
    await recordSyncLog({
      direction: 'in',
      status: 'error',
      entityType,
      message: `PowerOffice er ikke satt opp – kan ikke slå opp org.nr. ${orgNr}.`,
    });
    return;
  }

  try {
    if (entityType === 'Customer') {
      const match = await client.findCustomerByOrgNrOrEmail(orgNr, null);
      if (!match) {
        await recordSyncLog({ direction: 'in', status: 'error', entityType, message: `Fant ingen PowerOffice-kunde med org.nr. ${orgNr}.` });
        return;
      }
      const existing = await prisma.customer.findFirst({ where: { orgNr, poweroffice_id: null } });
      if (existing) {
        await prisma.customer.update({ where: { id: existing.id }, data: { poweroffice_id: match.powerOfficeId } });
      } else {
        await prisma.customer.create({
          data: { type: 'COMPANY', name: match.name, orgNr: match.orgNr, email: match.email, poweroffice_id: match.powerOfficeId },
        });
      }
    } else {
      const match = await client.findSupplierByOrgNrOrEmail(orgNr, null);
      if (!match) {
        await recordSyncLog({ direction: 'in', status: 'error', entityType, message: `Fant ingen PowerOffice-leverandør med org.nr. ${orgNr}.` });
        return;
      }
      // Supplier har ingen orgNr-kolonne (kap. 9) – match på e-post fra
      // PowerOffice-treffet i stedet.
      const existing = match.email
        ? await prisma.supplier.findFirst({ where: { email: match.email, poweroffice_id: null } })
        : null;
      if (existing) {
        await prisma.supplier.update({ where: { id: existing.id }, data: { poweroffice_id: match.powerOfficeId } });
      } else {
        await prisma.supplier.create({
          data: { name: match.name, country: 'NO', email: match.email, poweroffice_id: match.powerOfficeId },
        });
      }
    }
    await recordSyncLog({ direction: 'in', status: 'success', entityType, message: `Hentet inn org.nr. ${orgNr} fra PowerOffice.` });
  } catch (error) {
    await recordSyncLog({
      direction: 'in',
      status: 'error',
      entityType,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function runPowerOfficeSyncJob(data: PowerOfficeSyncJobData): Promise<void> {
  switch (data.kind) {
    case 'match-customer':
      return matchOrCreateCustomer(data.customerId);
    case 'match-supplier':
      return matchOrCreateSupplier(data.supplierId);
    case 'import-all':
      await importAllFromPowerOffice();
      return;
    case 'lookup-org-nr':
      return lookupAndLinkByOrgNr(data.entityType, data.orgNr);
  }
}
