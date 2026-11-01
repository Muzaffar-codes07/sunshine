import type { ReactNode } from 'react';
import { Check } from 'lucide-react';

/** A record's progress and the one thing to do next. `current` past the last stage means everything is done. */
export function StageHero({ label, stages, current, next, facts }: { label: string; stages: string[]; current: number; next: ReactNode; facts: { id: string; label: string; value: ReactNode }[] }) {
  return <section className="progress-hero" aria-label={label}>
    <ol className="stage-steps" aria-label={`Stage ${Math.min(current + 1, stages.length)} of ${stages.length}`}>
      {stages.map((stage, index) => <li key={stage} className={index < current ? 'is-done' : index === current ? 'is-now' : ''} aria-current={index === current ? 'step' : undefined}>
        <span className="step-dot" aria-hidden="true">{index < current ? <Check size="0.875rem" strokeWidth={3} /> : index + 1}</span>{stage}
      </li>)}
    </ol>
    <div className="hero-next"><span>{current >= stages.length ? 'Status' : 'Next step'}</span><strong>{next}</strong></div>
    <dl className="hero-facts">{facts.map((fact) => <div key={fact.id}><dt>{fact.label}</dt><dd>{fact.value}</dd></div>)}</dl>
  </section>;
}
