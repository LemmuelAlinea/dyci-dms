import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';
import { Spinner } from '@/components/ui/Spinner';

declare global {
  interface Window {
    DocsAPI?: { DocEditor: new (id: string, config: unknown) => { destroyEditor: () => void } };
  }
}

let scriptPromise: Promise<void> | null = null;
function loadScript(src: string): Promise<void> {
  if (window.DocsAPI) return Promise.resolve();
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = () => resolve();
      s.onerror = () => {
        scriptPromise = null; // allow a retry on the next mount
        reject(new Error('Failed to load the OnlyOffice editor script'));
      };
      document.head.appendChild(s);
    });
  }
  return scriptPromise;
}

/**
 * Embeds the OnlyOffice editor for a file. Saving is handled by the backend
 * callback; `onClosed` fires when an initialized editor is torn down so the
 * parent can refresh version history.
 */
export function OnlyOfficeEditor({ fileId, onClosed, className }: { fileId: string; onClosed?: () => void; className?: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<{ destroyEditor: () => void } | null>(null);
  const idRef = useRef(`onlyoffice-${Math.random().toString(36).slice(2)}`);
  const onClosedRef = useRef(onClosed);
  const initializedRef = useRef(false);
  const [loading, setLoading] = useState(true);

  // Keep the latest onClosed without retriggering the editor effect.
  useEffect(() => {
    onClosedRef.current = onClosed;
  }, [onClosed]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    initializedRef.current = false;
    const containerId = idRef.current;
    (async () => {
      try {
        const { config, scriptUrl } = await api.onlyofficeConfig(fileId);
        await loadScript(scriptUrl);
        if (cancelled || !window.DocsAPI || !containerRef.current) return;
        containerRef.current.id = containerId;
        editorRef.current = new window.DocsAPI.DocEditor(containerId, {
          ...config,
          events: { onAppReady: () => setLoading(false) },
          height: '100%',
          width: '100%',
        });
        initializedRef.current = true;
      } catch (e) {
        if (!cancelled) {
          toast.error((e as Error).message);
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
      try {
        editorRef.current?.destroyEditor();
      } catch {
        /* already gone */
      }
      editorRef.current = null;
      if (initializedRef.current) onClosedRef.current?.();
    };
  }, [fileId]);

  return (
    <div className={className ?? 'relative h-[620px] w-full'}>
      {loading && (
        <div className="absolute inset-0 grid place-items-center">
          <Spinner className="h-7 w-7" />
        </div>
      )}
      <div ref={containerRef} className="h-full w-full" />
    </div>
  );
}
