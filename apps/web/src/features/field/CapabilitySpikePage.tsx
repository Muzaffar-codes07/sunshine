import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ScanInput, type ScanSource } from '../../components/device/ScanInput';
import { PhotoCapture, type CapturedPhoto } from '../../components/device/PhotoCapture';
import { SignaturePad } from '../../components/device/SignaturePad';

interface ScanRecord {
  id: string;
  value: string;
  source: ScanSource;
  at: string;
}

type BarcodeDetectorCtor = {
  getSupportedFormats?: () => Promise<string[]>;
};

function getDetectorCtor(): BarcodeDetectorCtor | undefined {
  if (typeof window === 'undefined') return undefined;
  return (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector;
}

export function CapabilitySpikePage() {
  const [scans, setScans] = useState<ScanRecord[]>([]);
  const [lastPhoto, setLastPhoto] = useState<CapturedPhoto | null>(null);
  const [exportedSignature, setExportedSignature] = useState<{
    dataUrl: string;
    sizeKb: string;
  } | null>(null);

  const handleScan = (value: string, source: ScanSource) => {
    const record: ScanRecord = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      value,
      source,
      at: new Date().toLocaleTimeString('en-IN'),
    };
    setScans((prev) => [record, ...prev]);
  };

  const handlePhotoChange = (_file: File | null, photo: CapturedPhoto | null) => {
    setLastPhoto(photo);
  };

  const handleSignatureExport = (blob: Blob, dataUrl: string) => {
    setExportedSignature({
      dataUrl,
      sizeKb: (blob.size / 1024).toFixed(1),
    });
  };

  const handleSignatureClear = () => {
    setExportedSignature(null);
  };

  return (
    <main className="spike-page">
      <header className="spike-header">
        <div>
          <span className="stage">Development only · F02</span>
          <h1>Device capability check</h1>
          <p className="field-hint">
            Verify camera barcode scanning, photo capture, and digital signature controls on this device.
          </p>
        </div>
        <nav>
          <Link to="/">← Back to home</Link>
        </nav>
      </header>

      {/* 1. Device Environment Report */}
      <EnvironmentReport />

      {/* 2. Barcode & Serial Scanner */}
      <section className="spike-section" aria-labelledby="scan-heading">
        <h2 id="scan-heading">2. Barcode & Serial Scanner (ScanInput)</h2>
        <p className="field-hint">
          Supports camera scanning via BarcodeDetector API with mandatory keyboard / USB / Bluetooth scanner fallback.
        </p>
        <ScanInput onScan={handleScan} />

        {scans.length > 0 && (
          <div className="spike-scans-list">
            <div className="spike-scans-header">
              <h3>Scanned codes ({scans.length})</h3>
              <button
                type="button"
                onClick={() => setScans([])}
                className="button-small"
              >
                Clear log
              </button>
            </div>
            <ul className="spike-list" aria-label="Scanned codes">
              {scans.map((scan) => (
                <li key={scan.id}>
                  <div>
                    <code>{scan.value}</code>
                    <span className="spike-source-badge">via {scan.source}</span>
                  </div>
                  <time>{scan.at}</time>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* 3. Photo Capture */}
      <section className="spike-section" aria-labelledby="photo-heading">
        <h2 id="photo-heading">3. Photo Capture (PhotoCapture)</h2>
        <p className="field-hint">
          Uses camera on mobile devices (via capture=&quot;environment&quot;) or file picker on desktop. Includes image preview, metadata display, and cleanup.
        </p>
        <PhotoCapture onChange={handlePhotoChange} />
        {lastPhoto && (
          <p className="field-hint" role="status">
            Active photo registered: {lastPhoto.name} ({(lastPhoto.size / 1024).toFixed(1)} KB)
          </p>
        )}
      </section>

      {/* 4. Signature Capture */}
      <section className="spike-section" aria-labelledby="signature-heading">
        <h2 id="signature-heading">4. Signature Capture (SignaturePad)</h2>
        <p className="field-hint">
          Supports finger, stylus, and mouse drawing with clear button and disabled PNG export until ink is recorded.
        </p>
        <SignaturePad
          onExport={handleSignatureExport}
          onClear={handleSignatureClear}
        />
        {exportedSignature && (
          <div className="spike-exported-signature">
            <h3>Exported signature ({exportedSignature.sizeKb} KB PNG)</h3>
            <img
              src={exportedSignature.dataUrl}
              alt="Exported signature preview"
              className="signature-preview-thumbnail"
            />
          </div>
        )}
      </section>
    </main>
  );
}

function EnvironmentReport() {
  const [formats, setFormats] = useState<string[] | null>(null);
  const Ctor = getDetectorCtor();

  useEffect(() => {
    if (Ctor?.getSupportedFormats) {
      Ctor.getSupportedFormats()
        .then(setFormats)
        .catch(() => setFormats([]));
    } else {
      setFormats(null);
    }
  }, [Ctor]);

  const yes = (val: boolean) => (val ? '✓ yes' : '✕ no');

  const isSecure = typeof window !== 'undefined' && window.isSecureContext;
  const hasGetUserMedia =
    typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia);
  const hasBarcodeDetector = Boolean(Ctor);
  const touchPoints = typeof navigator !== 'undefined' ? navigator.maxTouchPoints : 0;
  const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : 'Unknown';

  return (
    <section className="spike-section" aria-labelledby="env-heading">
      <h2 id="env-heading">1. Device Environment</h2>
      <dl className="spike-env">
        <div>
          <dt>Secure context (HTTPS or localhost)</dt>
          <dd>{yes(isSecure)}</dd>
        </div>
        <div>
          <dt>Camera API available (getUserMedia)</dt>
          <dd>{yes(hasGetUserMedia)}</dd>
        </div>
        <div>
          <dt>BarcodeDetector built-in</dt>
          <dd>{yes(hasBarcodeDetector)}</dd>
        </div>
        <div>
          <dt>Supported barcode formats</dt>
          <dd>
            {formats === null
              ? hasBarcodeDetector
                ? 'checking…'
                : 'not supported by browser'
              : formats.length > 0
                ? formats.join(', ')
                : 'none reported'}
          </dd>
        </div>
        <div>
          <dt>Touch support (maxTouchPoints)</dt>
          <dd>{touchPoints > 0 ? `✓ yes (${touchPoints} points)` : '✕ no'}</dd>
        </div>
        <div>
          <dt>Browser User Agent</dt>
          <dd className="spike-ua">{userAgent}</dd>
        </div>
      </dl>

      {!isSecure && (
        <p className="form-error" role="alert">
          Not in a secure context: camera APIs are restricted by the browser. Run on localhost, port forwarding, or HTTPS.
        </p>
      )}
    </section>
  );
}
