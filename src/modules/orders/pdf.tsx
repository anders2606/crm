// TO-08: ordrebekreftelse genereres fra mal. Samme dynamiske import()-mønster
// som src/modules/quotes/pdf.tsx (se forklaringen der) for å unngå at
// @react-pdf/hyphenate sin manglende "require"-eksport krasjer workeren.
import type * as ReactPdfModule from '@react-pdf/renderer';
import React from 'react';

import { formatMoney } from '@/lib/money';

void React;

async function loadReactPdf(): Promise<typeof ReactPdfModule> {
  return import('@react-pdf/renderer');
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('nb-NO', { dateStyle: 'long' }).format(date);
}

export interface OrderConfirmationLine {
  description: string;
  lineTotalMinor: number;
}

export interface OrderConfirmationInput {
  orderNumber: string;
  quoteNumber: string;
  createdAt: Date;
  customerName: string;
  customerAddress?: string | null;
  currency: string;
  lines: OrderConfirmationLine[];
  totalMinor: number;
  confirmationText: string | null;
}

function OrderConfirmationDocument({ order, RP }: { order: OrderConfirmationInput; RP: typeof ReactPdfModule }) {
  const { Document, Page, Text, View, StyleSheet } = RP;

  const styles = StyleSheet.create({
    page: { padding: 40, fontSize: 10, fontFamily: 'Helvetica' },
    header: { marginBottom: 24 },
    companyName: { fontSize: 16, fontWeight: 700 },
    title: { fontSize: 14, marginTop: 16, marginBottom: 4, fontWeight: 700 },
    metaRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 },
    customerBlock: { marginVertical: 20 },
    lineRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3, borderBottomWidth: 0.5, borderBottomColor: '#ccc' },
    totalRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8, fontWeight: 700 },
    confirmationText: { marginTop: 24, fontSize: 9, color: '#333' },
  });

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.companyName}>Pietra Unica</Text>
          <Text>marmor.no</Text>
        </View>

        <Text style={styles.title}>Ordrebekreftelse {order.orderNumber}</Text>
        <View style={styles.metaRow}>
          <Text>Dato: {formatDate(order.createdAt)}</Text>
          <Text>Basert på tilbud: {order.quoteNumber}</Text>
        </View>

        <View style={styles.customerBlock}>
          <Text>{order.customerName}</Text>
          {order.customerAddress && <Text>{order.customerAddress}</Text>}
        </View>

        {order.lines.map((line, index) => (
          <View key={index} style={styles.lineRow}>
            <Text>{line.description}</Text>
            <Text>{formatMoney(line.lineTotalMinor, order.currency)}</Text>
          </View>
        ))}

        <View style={styles.totalRow}>
          <Text>Totalt</Text>
          <Text>{formatMoney(order.totalMinor, order.currency)}</Text>
        </View>

        {order.confirmationText && (
          <View style={styles.confirmationText}>
            {order.confirmationText.split('\n').map((line, index) => (
              <Text key={index}>{line}</Text>
            ))}
          </View>
        )}
      </Page>
    </Document>
  );
}

export async function renderOrderConfirmationPdf(order: OrderConfirmationInput): Promise<Buffer> {
  const RP = await loadReactPdf();
  return RP.renderToBuffer(<OrderConfirmationDocument order={order} RP={RP} />);
}
