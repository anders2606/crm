'use client';

// DO-05: dra-og-slipp-opplasting. Fungerer også som vanlig filvelger, som på
// mobil tilbyr kameraopplasting via nettleserens innebygde filvalgdialog.
import { useRef, useState, type DragEvent } from 'react';

const CATEGORY_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'DRAWING', label: 'Tegning' },
  { value: 'PHOTO', label: 'Bilde' },
  { value: 'QUOTE_SENT', label: 'Tilbud sendt' },
  { value: 'QUOTE_RECEIVED', label: 'Tilbud mottatt' },
  { value: 'ORDER_CONFIRMATION', label: 'Ordrebekreftelse' },
  { value: 'INVOICE', label: 'Faktura' },
  { value: 'CONTRACT', label: 'Kontrakt' },
  { value: 'OTHER', label: 'Annet' },
];

interface DocumentUploadFormProps {
  action: (formData: FormData) => void | Promise<void>;
  hiddenFields: Record<string, string>;
  showCategory?: boolean;
  submitLabel?: string;
}

export function DocumentUploadForm({
  action,
  hiddenFields,
  showCategory = true,
  submitLabel = 'Last opp',
}: DocumentUploadFormProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragOver(false);
    const file = event.dataTransfer.files?.[0];
    if (file && fileInputRef.current) {
      const transfer = new DataTransfer();
      transfer.items.add(file);
      fileInputRef.current.files = transfer.files;
      setFileName(file.name);
    }
  }

  return (
    <form action={action} className="space-y-3 text-sm">
      {Object.entries(hiddenFields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}

      <div
        role="button"
        tabIndex={0}
        onDragOver={(event) => {
          event.preventDefault();
          setIsDragOver(true);
        }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            fileInputRef.current?.click();
          }
        }}
        className={`cursor-pointer rounded border-2 border-dashed px-4 py-6 text-center text-slate-600 ${
          isDragOver ? 'border-slate-500 bg-slate-50' : 'border-slate-300'
        }`}
      >
        <p>{fileName ?? 'Dra og slipp en fil her, eller klikk for å velge (mobil: også fra kamera)'}</p>
        <input
          ref={fileInputRef}
          type="file"
          name="file"
          className="hidden"
          onChange={(event) => setFileName(event.target.files?.[0]?.name ?? null)}
        />
      </div>

      {showCategory && (
        <label className="block font-medium">
          Kategori
          <select
            name="category"
            defaultValue="OTHER"
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
          >
            {CATEGORY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      )}

      <button type="submit" className="rounded border border-slate-300 px-3 py-1.5 hover:bg-slate-50">
        {submitLabel}
      </button>
    </form>
  );
}
