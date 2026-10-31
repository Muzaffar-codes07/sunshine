import { useCallback, useEffect, useId, useRef, useState } from 'react';

export type ScanSource = 'camera' | 'manual';

export interface ScanInputProps {
  id?: string;
  label?: string;
  hint?: string;
  placeholder?: string;
  onScan: (value: string, source: ScanSource) => void;
  disabled?: boolean;
  autoFocus?: boolean;
}

type CameraState =
  | { status: 'idle' }
  | { status: 'starting' }
  | { status: 'scanning' }
  | { status: 'error'; message: string };

type BarcodeDetectorLike = {
  detect(source: CanvasImageSource): Promise<Array<{ rawValue: string }>>;
};

type BarcodeDetectorCtor = {
  new (): BarcodeDetectorLike;
  getSupportedFormats?: () => Promise<string[]>;
};

function getDetectorCtor(): BarcodeDetectorCtor | undefined {
  if (typeof window === 'undefined') return undefined;
  return (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector;
}

function getCameraErrorMessage(error: unknown): string {
  if (typeof window !== 'undefined' && !window.isSecureContext) {
    return 'Camera access requires a secure context (HTTPS or localhost). Use manual entry or a USB/Bluetooth scanner.';
  }
  const name = error instanceof DOMException ? error.name : (error as { name?: string })?.name;
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
    return 'Camera permission was denied. Allow camera access in your browser settings and try again.';
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    return 'No camera was found on this device.';
  }
  if (name === 'NotReadableError' || name === 'TrackStartError') {
    return 'The camera is being used by another app.';
  }
  return 'The camera could not be started.';
}

export function ScanInput({
  id: propId,
  label = 'Barcode / serial number',
  hint = 'Scan using the camera, or type / scan using a USB or Bluetooth scanner and press Enter.',
  placeholder = 'Scan or type serial number…',
  onScan,
  disabled = false,
  autoFocus = false,
}: ScanInputProps) {
  const generatedId = useId();
  const inputId = propId || `scan-${generatedId}`;
  const hintId = `${inputId}-hint`;

  const [manualText, setManualText] = useState('');
  const [cameraState, setCameraState] = useState<CameraState>({ status: 'idle' });

  const videoRef = useRef<HTMLVideoElement>(null);
  const attemptRef = useRef(0);
  const streamRef = useRef<MediaStream | null>(null);
  const intervalRef = useRef<number | undefined>(undefined);

  const stopCamera = useCallback(() => {
    attemptRef.current += 1;
    if (intervalRef.current !== undefined) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = undefined;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, [stopCamera]);

  useEffect(() => {
    if (disabled) { stopCamera(); setCameraState({ status: 'idle' }); }
  }, [disabled, stopCamera]);

  const handleStopCamera = () => {
    stopCamera();
    setCameraState({ status: 'idle' });
  };

  const startCamera = async () => {
    if (!window.isSecureContext) {
      setCameraState({
        status: 'error',
        message: 'Camera access requires a secure context (HTTPS or localhost). Use manual entry or a USB/Bluetooth scanner.',
      });
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraState({
        status: 'error',
        message: 'Camera access is not supported by this browser. Use manual entry or a USB/Bluetooth scanner.',
      });
      return;
    }

    const Detector = getDetectorCtor();
    if (!Detector) {
      setCameraState({
        status: 'error',
        message: 'This browser cannot read barcodes from the camera. Use a USB/Bluetooth scanner or manual keyboard entry.',
      });
      return;
    }

    stopCamera();
    const attempt = attemptRef.current;
    const current = () => attemptRef.current === attempt;
    setCameraState({ status: 'starting' });
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      });
      if (!current()) { stream.getTracks().forEach((track) => track.stop()); return; }
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      if (!current()) return;
      setCameraState({ status: 'scanning' });

      const detector = new Detector();
      let detecting = false;
      intervalRef.current = window.setInterval(async () => {
        if (!current() || detecting || !videoRef.current || videoRef.current.readyState < 2) return;
        detecting = true;
        try {
          const results = await detector.detect(videoRef.current);
          if (!current()) return;
          if (results.length > 0 && results[0]?.rawValue) {
            const detectedValue = results[0].rawValue.trim();
            if (detectedValue) {
              stopCamera();
              setCameraState({ status: 'idle' });
              onScan(detectedValue, 'camera');
            }
          }
        } catch {
          // A frame may be undecodable; retry after this detection settles.
        } finally { detecting = false; }
      }, 250);
    } catch (err) {
      if (!current()) return;
      stopCamera();
      setCameraState({
        status: 'error',
        message: getCameraErrorMessage(err),
      });
    }
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = manualText.trim();
    if (trimmed && !disabled) {
      handleStopCamera();
      onScan(trimmed, 'manual');
      setManualText('');
    }
  };

  return (
    <div className="scan-input-root">
      <form onSubmit={handleManualSubmit} className="scan-form">
        <div className="field">
          <label htmlFor={inputId}>{label}</label>
          <div className="scan-input-group">
            <input
              id={inputId}
              type="text"
              value={manualText}
              onChange={(e) => setManualText(e.target.value)}
              placeholder={placeholder}
              disabled={disabled}
              autoFocus={autoFocus}
              autoComplete="off"
              aria-describedby={hint ? hintId : undefined}
            />
            <button type="submit" disabled={disabled || !manualText.trim()}>
              Submit code
            </button>
          </div>
          {hint && <p id={hintId} className="field-hint">{hint}</p>}
        </div>
      </form>

      <div className="scan-camera-section">
        {cameraState.status === 'scanning' || cameraState.status === 'starting' ? (
          <button type="button" onClick={handleStopCamera}>
            {cameraState.status === 'starting' ? 'Cancel camera' : 'Stop camera'}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void startCamera()}
            disabled={disabled}
          >
            Scan with camera
          </button>
        )}

        <video
          ref={videoRef}
          className={cameraState.status === 'scanning' ? 'scan-video' : 'hidden'}
          muted
          playsInline
          aria-label="Camera barcode scanner preview"
        />

        {cameraState.status === 'error' && (
          <p className="form-error" role="alert">
            {cameraState.message}
          </p>
        )}
      </div>
    </div>
  );
}
