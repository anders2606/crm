// GR-04: flettefelt i nyhetsbrevmaler. Enkel {{felt}}-erstatning – ingen
// malmotor, kun de tre feltene kravspesifikasjonen nevner.
export interface MergeFieldValues {
  navn: string;
  firma: string;
  kontaktperson: string;
}

export function applyMergeFields(content: string, values: MergeFieldValues): string {
  return content
    .replaceAll('{{navn}}', values.navn)
    .replaceAll('{{firma}}', values.firma)
    .replaceAll('{{kontaktperson}}', values.kontaktperson);
}
