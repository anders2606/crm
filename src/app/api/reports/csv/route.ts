// GE-10: CSV-eksport av salgsrapportene. Excel/Numbers åpner filen direkte.
import { NextResponse } from 'next/server';

import { buildCsv } from '@/lib/csv';
import { formatMoney } from '@/lib/money';
import { AuthenticationRequiredError, PermissionDeniedError, PERMISSIONS, requirePermission } from '@/lib/rbac/permissions';
import {
  quoteConversionSummary,
  salesByCustomer,
  salesByCustomerGroup,
  salesByMaterial,
} from '@/modules/reports/service';

const REPORT_TYPES = ['customer', 'customer-group', 'material', 'quote-conversion'] as const;
type ReportType = (typeof REPORT_TYPES)[number];

function isReportType(value: string | null): value is ReportType {
  return REPORT_TYPES.includes(value as ReportType);
}

function parseDate(value: string | null): Date | undefined {
  if (!value) {
    return undefined;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

export async function GET(request: Request) {
  try {
    await requirePermission(PERMISSIONS.REPORTS_READ);
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) {
      return new NextResponse('Ikke innlogget', { status: 401 });
    }
    if (error instanceof PermissionDeniedError) {
      return new NextResponse('Ingen tilgang', { status: 403 });
    }
    throw error;
  }

  const url = new URL(request.url);
  const type = url.searchParams.get('type');
  if (!isReportType(type)) {
    return new NextResponse('Ukjent rapporttype', { status: 400 });
  }
  const range = { from: parseDate(url.searchParams.get('from')), to: parseDate(url.searchParams.get('to')) };

  let csv: string;
  switch (type) {
    case 'customer': {
      const rows = await salesByCustomer(range);
      csv = buildCsv(
        ['Kunde', 'Antall ordre', 'Sum', 'Valuta'],
        rows.map((row) => [row.customerName, row.orderCount, formatMoney(row.totalMinor, row.currency), row.currency]),
      );
      break;
    }
    case 'customer-group': {
      const rows = await salesByCustomerGroup(range);
      csv = buildCsv(
        ['Kundegruppe', 'Antall ordre', 'Sum', 'Valuta'],
        rows.map((row) => [row.groupName, row.orderCount, formatMoney(row.totalMinor, row.currency), row.currency]),
      );
      break;
    }
    case 'material': {
      const rows = await salesByMaterial(range);
      csv = buildCsv(
        ['Materiale', 'Antall', 'Enhet', 'Sum', 'Valuta'],
        rows.map((row) => [row.materialName, row.quantityMilli / 1000, row.unit, formatMoney(row.totalMinor, row.currency), row.currency]),
      );
      break;
    }
    case 'quote-conversion': {
      const summary = await quoteConversionSummary(range);
      csv = buildCsv(
        ['Sendte tilbud', 'Konvertert til ordre', 'Konverteringsgrad (%)'],
        [[summary.totalSentQuotes, summary.convertedQuotes, summary.conversionRatePercent]],
      );
      break;
    }
  }

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${type}.csv"`,
    },
  });
}
