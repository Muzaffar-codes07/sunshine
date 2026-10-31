import { useEffect, useId, useRef, useState, type PointerEvent } from 'react';

export interface SignaturePadProps {
  id?: string;
  label?: string;
  hint?: string;
  width?: number;
  height?: number;
  onExport?: (blob: Blob, dataUrl: string) => void;
  onClear?: () => void;
  onChange?: (hasInk: boolean) => void;
  disabled?: boolean;
}

export function SignaturePad({
  id: propId,
  label = 'Customer / technician signature',
  hint = 'Draw signature using finger, stylus, or mouse.',
  width = 600,
  height = 200,
  onExport,
  onClear,
  onChange,
  disabled = false,
}: SignaturePadProps) {
  const generatedId = useId();
  const padId = propId || `signature-${generatedId}`;
  const instructionsId = `${padId}-instructions`;
  const statusId = `${padId}-status`;

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawing = useRef(false);
  const [hasInk, setHasInk] = useState(false);
  const [exportedStatus, setExportedStatus] = useState<string | null>(null);

  const initCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  };

  useEffect(() => {
    initCanvas();
  }, []);

  const getPos = (e: PointerEvent<HTMLCanvasElement>) => {
    const canvas = e.currentTarget;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  const handlePointerDown = (e: PointerEvent<HTMLCanvasElement>) => {
    if (disabled) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    isDrawing.current = true;
    const ctx = e.currentTarget.getContext('2d');
    if (!ctx) return;
    const { x, y } = getPos(e);
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#111827';
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const handlePointerMove = (e: PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawing.current || disabled) return;
    const ctx = e.currentTarget.getContext('2d');
    if (!ctx) return;
    const { x, y } = getPos(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    if (!hasInk) {
      setHasInk(true);
      onChange?.(true);
    }
  };

  const handlePointerUp = (e: PointerEvent<HTMLCanvasElement>) => {
    isDrawing.current = false;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  const handleClear = () => {
    initCanvas();
    setHasInk(false);
    setExportedStatus(null);
    onChange?.(false);
    onClear?.();
  };

  const handleExport = () => {
    const canvas = canvasRef.current;
    if (!canvas || !hasInk) return;
    canvas.toBlob((blob) => {
      if (!blob) {
        setExportedStatus('Export failed: unable to create image.');
        return;
      }
      const dataUrl = canvas.toDataURL('image/png');
      const sizeKb = (blob.size / 1024).toFixed(1);
      const statusText = `Exported image (${blob.type}, ${sizeKb} KB)`;
      setExportedStatus(statusText);
      onExport?.(blob, dataUrl);
    }, 'image/png');
  };

  return (
    <div className="signature-pad-root">
      <div className="field">
        <label id={`${padId}-label`}>{label}</label>
        {hint && <p className="field-hint">{hint}</p>}
        <p id={instructionsId} className="field-hint">
          Keyboard users: drawing requires pointer or touch input. Use Tab to move between Clear and Export controls.
        </p>

        <canvas
          ref={canvasRef}
          width={width}
          height={height}
          className="signature-canvas"
          role="img"
          tabIndex={0}
          aria-labelledby={`${padId}-label`}
          aria-describedby={`${instructionsId} ${statusId}`}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        />

        <div className="signature-actions">
          <button
            type="button"
            onClick={handleClear}
            disabled={disabled}
          >
            Clear signature
          </button>
          <button
            type="button"
            onClick={handleExport}
            disabled={!hasInk || disabled}
          >
            Export PNG
          </button>
        </div>

        <p id={statusId} className="field-hint signature-status" role="status" aria-live="polite">
          {exportedStatus ?? (hasInk ? 'Signature recorded. Ready to export.' : 'No signature recorded yet.')}
        </p>
      </div>
    </div>
  );
}
