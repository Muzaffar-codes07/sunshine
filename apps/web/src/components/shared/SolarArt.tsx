/** A generic rooftop array for navy surfaces. It's decoration, never presented as a photo of a customer's site. */
export function SolarArt({ className }: { className?: string }) {
  const rows = [0, 1, 2, 3, 4, 5, 6];
  return <svg className={className} viewBox="0 0 400 400" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    <defs>
      <radialGradient id="solar-sun" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stopColor="#E8DCC8" />
        <stop offset="38%" stopColor="#C6A75E" />
        <stop offset="100%" stopColor="#C6A75E" stopOpacity="0" />
      </radialGradient>
      <linearGradient id="solar-panel" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#3A4A70" />
        <stop offset="100%" stopColor="#1F2A44" />
      </linearGradient>
    </defs>
    <circle cx="288" cy="98" r="120" fill="url(#solar-sun)" opacity=".55" />
    <circle cx="288" cy="98" r="30" fill="#E8DCC8" />
    <g transform="translate(200 236) skewX(-24) scale(1 .62) rotate(-8)">
      <rect x="-210" y="-150" width="420" height="300" rx="10" fill="url(#solar-panel)" stroke="#C6A75E" strokeOpacity=".55" strokeWidth="2" />
      {rows.map((row) => <line key={`h${row}`} x1="-210" x2="210" y1={-150 + (row + 1) * 37.5} y2={-150 + (row + 1) * 37.5} stroke="#E8DCC8" strokeOpacity=".22" strokeWidth="1.5" />)}
      {rows.map((row) => <line key={`v${row}`} y1="-150" y2="150" x1={-210 + (row + 1) * 52.5} x2={-210 + (row + 1) * 52.5} stroke="#E8DCC8" strokeOpacity=".22" strokeWidth="1.5" />)}
      <path d="M-210 -150 L40 -150 L-120 150 L-210 150 Z" fill="#E8DCC8" opacity=".06" />
    </g>
  </svg>;
}

/** Slow flowing lines behind the dark operations panel. */
export function WaveArt({ className }: { className?: string }) {
  const lines = Array.from({ length: 9 }, (_, index) => index);
  return <svg className={className} viewBox="0 0 600 240" preserveAspectRatio="none" aria-hidden="true">
    {lines.map((index) => <path key={index} d={`M${60 + index * 22} 260 C ${180 + index * 18} ${150 - index * 8}, ${250 + index * 14} ${120 + index * 6}, ${360 + index * 12} -20`} fill="none" stroke="#C6A75E" strokeOpacity={0.08 + index * 0.012} strokeWidth="1.5" />)}
  </svg>;
}
