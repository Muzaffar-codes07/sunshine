import { useEffect, useRef, useState } from 'react';
import { describeD4Error } from '../service/d4-http';
import { readCsv } from './report-api';

export function CsvDownload({ url, label }: { url: string; label: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const request = useRef<AbortController | null>(null);
  useEffect(() => {
    setPending(false); setError('');
    return () => { request.current?.abort(); request.current = null; };
  }, [url]);

  async function download() {
    if (request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setPending(true); setError('');
    try {
      const blob = await readCsv(url, controller.signal);
      if (controller.signal.aborted) return;
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl; link.download = 'sunshine-report.csv';
      document.body.append(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } catch (failure) {
      if (!controller.signal.aborted) setError(describeD4Error(failure));
    } finally {
      if (request.current === controller) { request.current = null; setPending(false); }
    }
  }

  return <div><button type="button" disabled={pending} onClick={() => void download()}>
    {pending ? 'Preparing CSV…' : label}
  </button>{error && <p role="alert">{error}</p>}</div>;
}
