import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { Field } from '../../components/ui/Field';

// F02 spike: find out what THIS device and browser can really do before building scan/photo/signature screens.
// Nothing here talks to the API; it only reports what works.

type BarcodeDetectorLike = { detect(source: CanvasImageSource): Promise<{ rawValue: string }[]> };
type BarcodeDetectorCtor = { new (): BarcodeDetectorLike; getSupportedFormats?: () => Promise<string[]> };
const getDetectorCtor = () => (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector;

type Scan = { value: string; source: 'camera' | 'keyboard'; at: string };

function cameraMessage(error: unknown): string {
  const name = error instanceof DOMException ? error.name : '';
  if (name === 'NotAllowedError') return 'Camera permission was denied. Allow camera access in the browser settings and try again.';
  if (name === 'NotFoundError') return 'No camera was found on this device.';
  if (name === 'NotReadableError') return 'The camera is being used by another app.';
  return 'The camera could not be started.';
}

export function CapabilitySpikePage() {
  return (
    <main className="enquiry-page">
      <h1>Device capability check</h1>
      <p className="enquiry-intro">Developer page. Open it on the phone you will demo with and note what passes.</p>
      <EnvironmentReport />
      <ScanTest />
      <PhotoTest />
      <SignatureTest />
    </main>
  );
}

function EnvironmentReport() {
  const [formats, setFormats] = useState<string[] | null>(null);
  const Ctor = getDetectorCtor();
  useEffect(() => {
    Ctor?.getSupportedFormats?.().then(setFormats).catch(() => setFormats([]));
  }, [Ctor]);
  const yes = (v: boolean) => (v ? '✓ yes' : '✕ no');
  return (
    <section className="spike-section" aria-label="Environment">
      <h2>1. This device</h2>
      <dl className="spike-env">
        <dt>Secure context (HTTPS or localhost)</dt><dd>{yes(window.isSecureContext)}</dd>
        <dt>Camera API available</dt><dd>{yes(Boolean(navigator.mediaDevices?.getUserMedia))}</dd>
        <dt>Barcode detection built in</dt><dd>{yes(Boolean(Ctor))}</dd>
        <dt>Barcode formats</dt><dd>{formats === null ? (Ctor ? 'checking…' : '—') : formats.join(', ') || 'none reported'}</dd>
        <dt>Touch input</dt><dd>{yes(navigator.maxTouchPoints > 0)}</dd>
        <dt>Browser</dt><dd>{navigator.userAgent}</dd>
      </dl>
      {!window.isSecureContext && <p className="form-error" role="alert">Not a secure context: the camera will not work here. Use localhost, USB port forwarding or HTTPS.</p>}
    </section>
  );
}

function ScanTest() {
  const [scans, setScans] = useState<Scan[]>([]);
  const [manual, setManual] = useState('');
  const [state, setState] = useState<{ kind: 'idle' | 'starting' | 'scanning' } | { kind: 'error'; message: string }>({ kind: 'idle' });
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | undefined>(undefined);

  const stop = () => {
    window.clearInterval(timerRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  };
  useEffect(() => stop, []);

  const addScan = (value: string, source: Scan['source']) =>
    setScans((list) => [{ value, source, at: new Date().toLocaleTimeString('en-IN') }, ...list]);

  async function startCamera() {
    const Ctor = getDetectorCtor();
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setState({ kind: 'error', message: 'The camera needs HTTPS or localhost. Use the scanner / keyboard field instead.' });
      return;
    }
    if (!Ctor) {
      setState({ kind: 'error', message: 'This browser cannot read barcodes from the camera. Use a keyboard-style scanner or a JS decoder library.' });
      return;
    }
    setState({ kind: 'starting' });
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) { stop(); return; }
      video.srcObject = stream;
      await video.play();
      const detector = new Ctor();
      setState({ kind: 'scanning' });
      timerRef.current = window.setInterval(() => {
        void detector.detect(video).then((found) => {
          const value = found[0]?.rawValue;
          if (value && streamRef.current) { addScan(value, 'camera'); stop(); setState({ kind: 'idle' }); }
        }).catch(() => undefined);
      }, 300);
    } catch (error) {
      stop();
      setState({ kind: 'error', message: cameraMessage(error) });
    }
  }

  return (
    <section className="spike-section" aria-label="Scan test">
      <h2>2. Scan a serial</h2>
      <form onSubmit={(e) => { e.preventDefault(); const v = manual.trim(); if (v) { addScan(v, 'keyboard'); setManual(''); } }}>
        <Field label="Scanner / keyboard entry" hint="A USB or Bluetooth scanner types the code and presses Enter. Click here, then scan.">
          {(c) => <input {...c} type="text" value={manual} onChange={(e) => setManual(e.target.value)} autoComplete="off" />}
        </Field>
      </form>
      <div>
        {state.kind === 'scanning' ? <button type="button" onClick={() => { stop(); setState({ kind: 'idle' }); }}>Stop camera</button>
          : <button type="button" onClick={() => void startCamera()} disabled={state.kind === 'starting'}>{state.kind === 'starting' ? 'Starting camera…' : 'Scan with camera'}</button>}
      </div>
      <video ref={videoRef} className={state.kind === 'scanning' ? 'scan-video' : 'hidden'} muted playsInline aria-label="Camera preview" />
      {state.kind === 'error' && <p className="form-error" role="alert">{state.message}</p>}
      {scans.length > 0 && (
        <ul className="spike-list" aria-label="Scans">
          {scans.map((s, i) => <li key={`${s.at}-${i}`}><code>{s.value}</code> · from <strong>{s.source}</strong> · {s.at}</li>)}
        </ul>
      )}
    </section>
  );
}

function PhotoTest() {
  const [photo, setPhoto] = useState<{ url: string; name: string; size: number; type: string } | null>(null);
  useEffect(() => () => { if (photo) URL.revokeObjectURL(photo.url); }, [photo]);
  return (
    <section className="spike-section" aria-label="Photo test">
      <h2>3. Take or choose a photo</h2>
      <Field label="Photo" hint="On a phone this opens the camera. On a laptop it opens a file picker.">
        {(c) => (
          <input {...c} type="file" accept="image/*" capture="environment" onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) setPhoto({ url: URL.createObjectURL(file), name: file.name, size: file.size, type: file.type });
          }} />
        )}
      </Field>
      {photo && (
        <>
          <img className="spike-img" src={photo.url} alt="Chosen photo preview" />
          <p className="field-hint">{photo.name} · {photo.type || 'unknown type'} · {(photo.size / 1024).toFixed(0)} KB</p>
        </>
      )}
    </section>
  );
}

function SignatureTest() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [hasInk, setHasInk] = useState(false);
  const [exported, setExported] = useState<string | null>(null);

  const paintBackground = () => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx || !canvasRef.current) return;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvasRef.current.width, canvasRef.current.height);
  };
  useEffect(paintBackground, []);

  const position = (e: PointerEvent<HTMLCanvasElement>) => {
    const c = e.currentTarget;
    const r = c.getBoundingClientRect();
    return { x: (e.clientX - r.left) * (c.width / r.width), y: (e.clientY - r.top) * (c.height / r.height) };
  };

  return (
    <section className="spike-section" aria-label="Signature test">
      <h2>4. Sign with finger or mouse</h2>
      <canvas
        ref={canvasRef} width={600} height={200} className="signature-canvas" aria-label="Signature area"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          drawing.current = true;
          const ctx = e.currentTarget.getContext('2d'); const p = position(e);
          if (ctx) { ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.strokeStyle = '#111111'; ctx.beginPath(); ctx.moveTo(p.x, p.y); }
        }}
        onPointerMove={(e) => {
          if (!drawing.current) return;
          const ctx = e.currentTarget.getContext('2d'); const p = position(e);
          if (ctx) { ctx.lineTo(p.x, p.y); ctx.stroke(); setHasInk(true); }
        }}
        onPointerUp={() => { drawing.current = false; }}
        onPointerCancel={() => { drawing.current = false; }}
      />
      <div className="drawer-actions">
        <button type="button" onClick={() => { paintBackground(); setHasInk(false); setExported(null); }}>Clear</button>
        <button type="button" disabled={!hasInk} onClick={() => canvasRef.current?.toBlob((blob) => setExported(blob ? `${blob.type}, ${(blob.size / 1024).toFixed(1)} KB` : 'export failed'), 'image/png')}>Export image</button>
      </div>
      {!hasInk && <p className="field-hint">Draw a signature to enable export.</p>}
      {exported && <p className="field-hint" role="status">Exported: {exported}</p>}
    </section>
  );
}
