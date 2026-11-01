/** The Solar OS mark: a sun rising over a solar panel. Decorative, because the name always sits beside it or labels its link. */
export function BrandMark() {
  return <svg className="brand-mark" viewBox="0 0 32 32" width="32" height="32" aria-hidden="true">
    <rect width="32" height="32" rx="10" fill="#1F2A44" />
    <path d="M9 15a7 7 0 0 1 14 0Z" fill="#C6A75E" />
    <path d="M16 4.5v2.4M7.6 8l1.7 1.7M24.4 8l-1.7 1.7" stroke="#C6A75E" strokeWidth="1.6" strokeLinecap="round" />
    <path d="M6.5 18h19l1.6 8H4.9Z" fill="#E8DCC8" />
    <path d="M12.8 18l-.7 8M19.2 18l.7 8M5.7 22h20.6" stroke="#1F2A44" strokeWidth="1.1" />
  </svg>;
}

export const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? '').join('');

export function Avatar({ name, size }: { name: string; size?: number }) {
  return <span className="avatar" title={name} style={size ? { '--avatar': `${size / 16}rem` } as React.CSSProperties : undefined}><span aria-hidden="true">{initials(name)}</span><span className="visually-hidden">{name}</span></span>;
}

export function AvatarStack({ names, max = 3, size }: { names: string[]; max?: number; size?: number }) {
  const hidden = names.length - max;
  return <span className="avatar-stack">
    {names.slice(0, max).map((name) => <Avatar key={name} name={name} size={size} />)}
    {hidden > 0 && <span className="avatar avatar-more" style={size ? { '--avatar': `${size / 16}rem` } as React.CSSProperties : undefined}>+{hidden}</span>}
  </span>;
}
