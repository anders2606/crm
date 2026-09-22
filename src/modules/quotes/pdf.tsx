// TO-06: tilbud genereres som PDF. @react-pdf/renderer er navngitt i kap. 15
// som eneste tillatte PDF-avhengighet. Viser aldri dekningsbidrag (DB) –
// det er kun til internt bruk (TO-05).
//
// @react-pdf/renderer (via @react-pdf/textkit) gjør en statisk ESM-import av
// en underpakke (@react-pdf/hyphenate/en-us) som ikke har et "require"-vilkår
// i sin package.json "exports". Både workeren og denne appen kjøres uten
// "type": "module" i package.json, så et vanlig (statisk) import her ville
// blitt transpilert til require() og feile med
// ERR_PACKAGE_PATH_NOT_EXPORTED. Et ekte dynamisk import() går derimot
// alltid via Node sin ESM-laster, som respekterer "import"-vilkåret riktig –
// derfor lastes hele modulen dynamisk her.
import type * as ReactPdfModule from '@react-pdf/renderer';
// Eksplisitt React-import: denne filen kjøres av workeren via tsx/esbuild
// (ikke Next.js' egen SWC-kompilator), som her faller tilbake til klassisk
// JSX-transformasjon og derfor trenger React i scope.
import React from 'react';

import { formatMoney } from '@/lib/money';
import { QUOTE_STATUS_LABELS } from '@/modules/quotes/service';

void React;

async function loadReactPdf(): Promise<typeof ReactPdfModule> {
  return import('@react-pdf/renderer');
}

function formatQuantity(quantityMilli: number, unit: string): string {
  const value = quantityMilli / 1000;
  const formatted = value % 1 === 0 ? value.toFixed(0) : value.toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
  return `${formatted.replace('.', ',')} ${unit}`;
}

function formatDate(date: Date | null): string {
  if (!date) {
    return '';
  }
  return new Intl.DateTimeFormat('nb-NO', { dateStyle: 'long' }).format(date);
}

export interface QuotePdfLine {
  description: string;
  quantityMilli: number;
  unit: string;
  unitPriceMinor: number;
  discountPercent: number;
  lineTotalMinor: number;
}

export interface QuotePdfInput {
  number: string;
  status: import('@prisma/client').QuoteStatus;
  currency: string;
  validUntil: Date | null;
  createdAt: Date;
  customerName: string;
  customerAddress?: string | null;
  lines: QuotePdfLine[];
  subtotalMinor: number;
  discountMinor: number;
  vatMinor: number;
  totalMinor: number;
  termsSnapshot: string | null;
}

function QuotePdfDocument({ quote, RP }: { quote: QuotePdfInput; RP: typeof ReactPdfModule }) {
  const { Document, Page, Text, View, StyleSheet } = RP;

  const styles = StyleSheet.create({
    page: { padding: 40, fontSize: 10, fontFamily: 'Helvetica' },
    header: { marginBottom: 24 },
    companyName: { fontSize: 16, fontWeight: 700 },
    title: { fontSize: 14, marginTop: 16, marginBottom: 4, fontWeight: 700 },
    metaRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 },
    customerBlock: { marginBottom: 20 },
    table: { marginTop: 12, marginBottom: 12 },
    tableHeaderRow: {
      flexDirection: 'row',
      borderBottomWidth: 1,
      borderBottomColor: '#333',
      paddingBottom: 4,
      marginBottom: 4,
      fontWeight: 700,
    },
    tableRow: { flexDirection: 'row', paddingVertical: 3, borderBottomWidth: 0.5, borderBottomColor: '#ccc' },
    colDescription: { flex: 3 },
    colQty: { flex: 1, textAlign: 'right' },
    colPrice: { flex: 1.2, textAlign: 'right' },
    colDiscount: { flex: 1, textAlign: 'right' },
    colTotal: { flex: 1.3, textAlign: 'right' },
    totalsBlock: { marginTop: 8, alignItems: 'flex-end' },
    totalsRow: { flexDirection: 'row', width: 220, justifyContent: 'space-between', marginBottom: 2 },
    totalsRowBold: { flexDirection: 'row', width: 220, justifyContent: 'space-between', marginTop: 4, fontWeight: 700 },
    terms: { marginTop: 24, fontSize: 9, color: '#333' },
  });

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.companyName}>Pietra Unica</Text>
          <Text>marmor.no</Text>
        </View>

        <Text style={styles.title}>Tilbud {quote.number}</Text>
        <View style={styles.metaRow}>
          <Text>Dato: {formatDate(quote.createdAt)}</Text>
          <Text>Status: {QUOTE_STATUS_LABELS[quote.status]}</Text>
        </View>
        {quote.validUntil && (
          <View style={styles.metaRow}>
            <Text>Gyldig til: {formatDate(quote.validUntil)}</Text>
          </View>
        )}

        <View style={styles.customerBlock}>
          <Text>{quote.customerName}</Text>
          {quote.customerAddress && <Text>{quote.customerAddress}</Text>}
        </View>

        <View style={styles.table}>
          <View style={styles.tableHeaderRow}>
            <Text style={styles.colDescription}>Beskrivelse</Text>
            <Text style={styles.colQty}>Antall</Text>
            <Text style={styles.colPrice}>Enhetspris</Text>
            <Text style={styles.colDiscount}>Rabatt</Text>
            <Text style={styles.colTotal}>Sum</Text>
          </View>
          {quote.lines.map((line, index) => (
            <View key={index} style={styles.tableRow}>
              <Text style={styles.colDescription}>{line.description}</Text>
              <Text style={styles.colQty}>{formatQuantity(line.quantityMilli, line.unit)}</Text>
              <Text style={styles.colPrice}>{formatMoney(line.unitPriceMinor, quote.currency)}</Text>
              <Text style={styles.colDiscount}>{line.discountPercent > 0 ? `${line.discountPercent} %` : '–'}</Text>
              <Text style={styles.colTotal}>{formatMoney(line.lineTotalMinor, quote.currency)}</Text>
            </View>
          ))}
        </View>

        <View style={styles.totalsBlock}>
          <View style={styles.totalsRow}>
            <Text>Sum</Text>
            <Text>{formatMoney(quote.subtotalMinor, quote.currency)}</Text>
          </View>
          {quote.discountMinor > 0 && (
            <View style={styles.totalsRow}>
              <Text>Rabatt</Text>
              <Text>-{formatMoney(quote.discountMinor, quote.currency)}</Text>
            </View>
          )}
          <View style={styles.totalsRow}>
            <Text>MVA</Text>
            <Text>{formatMoney(quote.vatMinor, quote.currency)}</Text>
          </View>
          <View style={styles.totalsRowBold}>
            <Text>Totalt</Text>
            <Text>{formatMoney(quote.totalMinor, quote.currency)}</Text>
          </View>
        </View>

        {quote.termsSnapshot && (
          <View style={styles.terms}>
            {quote.termsSnapshot.split('\n').map((line, index) => (
              <Text key={index}>{line}</Text>
            ))}
          </View>
        )}
      </Page>
    </Document>
  );
}

export async function renderQuotePdf(quote: QuotePdfInput): Promise<Buffer> {
  const RP = await loadReactPdf();
  return RP.renderToBuffer(<QuotePdfDocument quote={quote} RP={RP} />);
}
