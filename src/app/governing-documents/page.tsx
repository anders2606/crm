import Link from 'next/link';
import { redirect } from 'next/navigation';

import { DocumentUploadForm } from '@/components/document-upload-form';
import { ENTITY_TYPES, GOVERNING_DOCUMENTS_ENTITY_ID } from '@/lib/entity-types';
import { AuthenticationRequiredError, hasPermission, PERMISSIONS, requireSession } from '@/lib/rbac/permissions';
import { formatFileSize, isPreviewableInBrowser, listDocumentGroupsForEntity } from '@/modules/documents/service';

import { uploadGoverningDocument } from './actions';

// SD-01: eget område for planer (forretningsplan, budsjett, markedsplan) og
// styrende dokumenter (rutiner, HMS, internkontroll, prislister, vilkår).
// Tilgjengelig for alle innloggede brukere å lese; kun administrator kan
// laste opp/endre (samme rettighet som malbiblioteket).
export default async function GoverningDocumentsPage() {
  let session;
  try {
    session = await requireSession();
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) {
      redirect('/login?next=/governing-documents');
    }
    throw error;
  }

  const canWrite = hasPermission(session, PERMISSIONS.TEMPLATE_MANAGE);
  const documentGroups = await listDocumentGroupsForEntity(
    ENTITY_TYPES.GOVERNING_DOCUMENTS,
    GOVERNING_DOCUMENTS_ENTITY_ID,
  );

  return (
    <main className="mx-auto max-w-2xl space-y-8 px-4 py-10">
      <div>
        <Link href="/" className="text-sm text-slate-600 underline">
          ← Dashbord
        </Link>
        <h1 className="mt-1 text-xl font-semibold">Planer og styrende dokumenter</h1>
        <p className="text-sm text-slate-600">
          Forretningsplan, budsjett, markedsplan, rutiner, HMS, internkontroll, prislister og vilkår (SD-01).
        </p>
      </div>

      {documentGroups.length === 0 ? (
        <p className="text-sm text-slate-600">Ingen dokumenter lastet opp ennå.</p>
      ) : (
        <ul className="space-y-4 text-sm">
          {documentGroups.map((group) => (
            <li key={group.groupId} className="rounded-lg border border-slate-200 bg-white p-4">
              <div>
                <a
                  href={`/api/documents/${group.current.id}/file`}
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium underline"
                >
                  {group.current.fileName}
                </a>
                <span className="ml-2 text-slate-500">
                  v{group.current.version} (gjeldende) – {formatFileSize(group.current.sizeBytes)}
                </span>
              </div>

              {isPreviewableInBrowser(group.current.mimeType) &&
                (group.current.mimeType.startsWith('image/') ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={`/api/documents/${group.current.id}/file`}
                    alt={group.current.fileName}
                    className="mt-2 max-h-48 rounded border border-slate-200"
                  />
                ) : (
                  <embed
                    src={`/api/documents/${group.current.id}/file`}
                    type="application/pdf"
                    className="mt-2 h-64 w-full rounded border border-slate-200"
                  />
                ))}

              {group.previousVersions.length > 0 && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-xs text-slate-600">
                    Tidligere versjoner ({group.previousVersions.length})
                  </summary>
                  <ul className="mt-1 space-y-1 pl-4 text-xs">
                    {group.previousVersions.map((version) => (
                      <li key={version.id}>
                        <a href={`/api/documents/${version.id}/file`} target="_blank" rel="noreferrer" className="underline">
                          v{version.version} – {version.fileName}
                        </a>
                      </li>
                    ))}
                  </ul>
                </details>
              )}

              {canWrite && (
                <div className="mt-3 border-t border-slate-100 pt-3">
                  <DocumentUploadForm
                    action={uploadGoverningDocument}
                    hiddenFields={{ replacesDocumentId: group.current.id }}
                    showCategory={false}
                    submitLabel="Last opp ny versjon"
                  />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {canWrite && (
        <section className="rounded-lg border border-slate-200 bg-white p-6">
          <h2 className="mb-4 font-medium">Last opp nytt dokument</h2>
          <DocumentUploadForm action={uploadGoverningDocument} hiddenFields={{}} showCategory={false} />
        </section>
      )}
    </main>
  );
}
