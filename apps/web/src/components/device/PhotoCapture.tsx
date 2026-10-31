import { useEffect, useId, useRef, useState } from 'react';

export interface CapturedPhoto {
  file: File;
  url: string;
  name: string;
  size: number;
  type: string;
}

export interface PhotoCaptureProps {
  id?: string;
  label?: string;
  hint?: string;
  onChange?: (file: File | null, photo: CapturedPhoto | null) => void;
  disabled?: boolean;
}

export function PhotoCapture({
  id: propId,
  label = 'Capture photo',
  hint = 'On a mobile device, this opens the camera. On desktop, select an image file.',
  onChange,
  disabled = false,
}: PhotoCaptureProps) {
  const generatedId = useId();
  const inputId = propId || `photo-${generatedId}`;
  const hintId = `${inputId}-hint`;

  const [photo, setPhoto] = useState<CapturedPhoto | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const currentUrlRef = useRef<string | null>(null);

  // Keep track of the active URL for unmount cleanup
  currentUrlRef.current = photo?.url ?? null;

  useEffect(() => {
    return () => {
      if (currentUrlRef.current) {
        URL.revokeObjectURL(currentUrlRef.current);
      }
    };
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (photo?.url) {
        URL.revokeObjectURL(photo.url);
      }
      const url = URL.createObjectURL(file);
      const newPhoto: CapturedPhoto = {
        file,
        url,
        name: file.name,
        size: file.size,
        type: file.type || 'image/jpeg',
      };
      setPhoto(newPhoto);
      onChange?.(file, newPhoto);
    }
  };

  const handleRemove = () => {
    if (photo?.url) {
      URL.revokeObjectURL(photo.url);
    }
    setPhoto(null);
    if (inputRef.current) {
      inputRef.current.value = '';
    }
    onChange?.(null, null);
  };

  const handleReplace = () => {
    inputRef.current?.click();
  };

  return (
    <div className="photo-capture-root">
      <div className="field">
        <label htmlFor={inputId}>{label}</label>
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleFileChange}
          disabled={disabled}
          aria-describedby={hint ? hintId : undefined}
          className={photo ? 'hidden' : 'photo-input'}
        />
        {hint && <p id={hintId} className="field-hint">{hint}</p>}
      </div>

      {photo && (
        <div className="photo-preview-card">
          <img
            src={photo.url}
            alt="Selected capture preview"
            className="photo-preview"
          />
          <p className="photo-meta" role="status">
            <strong>{photo.name}</strong> · {photo.type || 'unknown type'} ·{' '}
            {(photo.size / 1024).toFixed(1)} KB
          </p>
          <div className="photo-actions">
            <button
              type="button"
              onClick={handleReplace}
              disabled={disabled}
            >
              Replace photo
            </button>
            <button
              type="button"
              onClick={handleRemove}
              disabled={disabled}
            >
              Remove photo
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
