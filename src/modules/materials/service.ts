import type { MaterialAvailability, MaterialFinish, MaterialType, PriceEntryType } from '@prisma/client';

export const MATERIAL_TYPE_LABELS: Record<MaterialType, string> = {
  MARBLE: 'Marmor',
  GRANITE: 'Granitt',
  QUARTZITE: 'Kvartsitt',
  COMPOSITE: 'Kompositt',
  OTHER: 'Annet',
};

export const MATERIAL_FINISH_LABELS: Record<MaterialFinish, string> = {
  POLISHED: 'Polert',
  HONED: 'Honet',
  BRUSHED: 'Børstet',
  OTHER: 'Annet',
};

export const MATERIAL_AVAILABILITY_LABELS: Record<MaterialAvailability, string> = {
  AVAILABLE: 'Tilgjengelig',
  ON_ORDER: 'Bestilt',
  DISCONTINUED: 'Utgått',
};

export const PRICE_ENTRY_TYPE_LABELS: Record<PriceEntryType, string> = {
  PURCHASE: 'Innkjøp',
  SALE: 'Salg',
};

export interface ChartPoint {
  date: Date;
  amountNokMinor: number;
}

/** MA-04: enkel, håndtegnet SVG-linje – ingen ny avhengighet (diagrambibliotek). */
export function buildPriceChartPath(points: ChartPoint[], width = 480, height = 160, padding = 24): string {
  if (points.length === 0) {
    return '';
  }
  if (points.length === 1) {
    const y = height / 2;
    return `M ${padding} ${y} L ${width - padding} ${y}`;
  }

  const values = points.map((point) => point.amountNokMinor);
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const valueRange = maxValue - minValue || 1;

  const minTime = points[0]!.date.getTime();
  const maxTime = points[points.length - 1]!.date.getTime();
  const timeRange = maxTime - minTime || 1;

  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;

  const coords = points.map((point) => {
    const x = padding + ((point.date.getTime() - minTime) / timeRange) * innerWidth;
    const y = padding + innerHeight - ((point.amountNokMinor - minValue) / valueRange) * innerHeight;
    return `${x.toFixed(1)} ${y.toFixed(1)}`;
  });

  return `M ${coords.join(' L ')}`;
}
