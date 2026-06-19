# Collaborative Editing — Plan 2: Universal Preview

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the PDF-only preview in the file detail page with a `<FilePreview>` that renders PDF, images, and text/CSV/Markdown inline, and shows a clean fallback card for everything else. (Office-file preview is added in Plan 3 via OnlyOffice; until then office files use the fallback card.)

**Architecture:** One focused presentational component, `FilePreview`, that fetches a signed URL for the current version and switches on a derived "preview category". Wired into `FileDetailPage`, replacing the existing PDF block. No backend or DB changes.

**Tech Stack:** React + TypeScript, Tailwind, Supabase storage signed URLs.

**Spec:** `docs/superpowers/specs/2026-06-19-collaborative-editing-design.md` (Component 5).

**Depends on:** Plan 1 (uses `isEditableKind` only indirectly; otherwise standalone).

---

### Task 1: Preview category helper

**Files:**
- Modify: `frontend/src/lib/utils.ts` (append)

- [ ] **Step 1: Add the categorizer**

Append to `utils.ts`:

```ts
export type PreviewCategory = 'pdf' | 'image' | 'office' | 'text' | 'none';

const IMAGE_EXT = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'];
const TEXT_EXT = ['txt', 'csv', 'md', 'markdown', 'json', 'log'];

/** Decide how to preview a file from its name + kind. */
export function previewCategory(fileName: string, kind: string): PreviewCategory {
  const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
  if (kind === 'pdf' || ext === 'pdf') return 'pdf';
  if (IMAGE_EXT.includes(ext)) return 'image';
  if (TEXT_EXT.includes(ext)) return 'text';
  if (kind === 'docx' || kind === 'xlsx' || kind === 'pptx') return 'office';
  return 'none';
}
```

- [ ] **Step 2: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/utils.ts
git commit -m "feat(utils): add previewCategory for universal preview"
```

---

### Task 2: `FilePreview` component

**Files:**
- Create: `frontend/src/components/drive/FilePreview.tsx`

- [ ] **Step 1: Create the component**

```tsx
import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Download } from 'lucide-react';
import { signedUrlForVersion } from '@/lib/drive';
import { previewCategory } from '@/lib/utils';
import { formatBytes } from '@/lib/utils';
import { FileKindIcon } from '@/components/ui/FileKindIcon';
import { Spinner } from '@/components/ui/Spinner';
import type { FileItem } from '@/lib/types';

/**
 * Inline preview for the file detail page. Renders PDF, images and text/CSV/MD;
 * everything else (including office files until Plan 3) shows a download card.
 * `canDownload` hides the download affordance when a viewer lacks permission.
 */
export function FilePreview({ file, canDownload = true }: { file: FileItem; canDownload?: boolean }) {
  const category = previewCategory(file.name, file.kind);
  const [url, setUrl] = useState<string | null>(null);
  const [text, setText] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;
    if (category === 'pdf' || category === 'image' || category === 'text') {
      setLoading(true);
      signedUrlForVersion(file.id, file.current_version)
        .then(async (u) => {
          if (!active) return;
          setUrl(u);
          if (category === 'text') {
            const res = await fetch(u);
            const body = await res.text();
            if (active) setText(body.slice(0, 100_000)); // cap very large files
          }
        })
        .catch((e) => toast.error((e as Error).message))
        .finally(() => active && setLoading(false));
    }
    return () => {
      active = false;
    };
  }, [file.id, file.current_version, category]);

  const download = async () =>
    window.open(await signedUrlForVersion(file.id, file.current_version, true), '_blank');

  if (loading) {
    return (
      <div className="grid place-items-center py-20">
        <Spinner className="h-7 w-7" />
      </div>
    );
  }

  if (category === 'pdf' && url) {
    return <iframe title="preview" src={url} className="h-[560px] w-full" />;
  }

  if (category === 'image' && url) {
    return (
      <div className="grid place-items-center bg-slate-50 p-4 dark:bg-white/5">
        <img src={url} alt={file.name} className="max-h-[560px] max-w-full rounded-lg object-contain" />
      </div>
    );
  }

  if (category === 'text' && text != null) {
    const isCsv = file.name.toLowerCase().endsWith('.csv');
    return isCsv ? (
      <CsvTable text={text} />
    ) : (
      <pre className="max-h-[560px] overflow-auto whitespace-pre-wrap p-4 text-xs leading-relaxed text-slate-700 dark:text-slate-200">
        {text}
      </pre>
    );
  }

  // Fallback (office until Plan 3, and all unsupported types)
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
      <FileKindIcon kind={file.kind} size={44} />
      <p className="text-sm text-slate-500">No inline preview for this file type.</p>
      <p className="text-xs text-slate-400">{formatBytes(file.size_bytes)}</p>
      {canDownload && (
        <button onClick={download} className="btn-primary">
          <Download size={16} /> Download to view
        </button>
      )}
    </div>
  );
}

function CsvTable({ text }: { text: string }) {
  const rows = text
    .split(/\r?\n/)
    .filter((r) => r.length)
    .slice(0, 200)
    .map((r) => r.split(','));
  return (
    <div className="max-h-[560px] overflow-auto p-2">
      <table className="w-full border-collapse text-xs">
        <tbody>
          {rows.map((cells, i) => (
            <tr key={i} className={i === 0 ? 'font-semibold' : ''}>
              {cells.map((c, j) => (
                <td key={j} className="border border-slate-100 px-2 py-1 dark:border-white/10">
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/drive/FilePreview.tsx
git commit -m "feat(preview): FilePreview component (pdf/image/text/csv + fallback)"
```

---

### Task 3: Wire `FilePreview` into the detail page

**Files:**
- Modify: `frontend/src/features/drive/FileDetailPage.tsx:229-249` (the Preview card body), and remove the now-unused `preview`/`loadPreview`/`canPreviewPdf` state.

- [ ] **Step 1: Replace the preview card body**

Replace the entire Preview card (the `<div className="card overflow-hidden">…</div>` block, lines ~230-249) with:

```tsx
          {/* Preview */}
          <div className="card overflow-hidden">
            <div className="border-b border-slate-100 px-5 py-3 text-sm font-semibold text-navy-900 dark:border-white/10 dark:text-white">
              Preview
            </div>
            <FilePreview file={file} />
          </div>
```

- [ ] **Step 2: Remove dead code**

Delete these now-unused lines:
- `const [preview, setPreview] = useState<string | null>(null);` (line ~45)
- the `loadPreview` function (lines ~79-86)
- `const canPreviewPdf = file.kind === 'pdf';` (line ~109)

Add the import near the other `@/components/drive` imports:

```ts
import { FilePreview } from '@/components/drive/FilePreview';
```

Remove `signedUrlForVersion` from imports only if no longer used — it is still used by the Download buttons, so keep it.

- [ ] **Step 3: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: PASS (no unused-variable errors).

- [ ] **Step 4: Manual verification**

Run: `cd frontend && npm run dev`. Open detail pages for:
- a PDF → renders inline in the iframe (no "Load preview" button anymore)
- an image → renders inline
- a `.txt` and a `.csv` → text shows; CSV shows a table
- a `.docx`/`.xlsx`/`.zip` → fallback card with Download

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/drive/FileDetailPage.tsx
git commit -m "feat(preview): use FilePreview in file detail page"
```

---

## Self-Review Notes (for the implementer)
- Office files intentionally fall back here; Plan 3 replaces the `'office'` branch with the OnlyOffice viewer.
- Text fetch is capped at 100 KB and CSV at 200 rows to avoid rendering huge files.
- `FilePreview` accepts `canDownload` for Plan 1/Plan 3 to pass through; the detail page (owner view) defaults to `true`.
- SVG images render via `<img>`; this is acceptable for trusted org uploads.
