import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { healthResponseSchema, readinessResponseSchema } from '@sunshine/contracts';
import { ArrowUpRight, Check, CheckCircle2, ClipboardList, FileText, Search, ShieldCheck } from 'lucide-react';
import { BrandMark } from '../../components/shared/Brand';
import { SolarArt, WaveArt } from '../../components/shared/SolarArt';
import { apiGet } from '../../lib/api';
import './landing.css';

const channels = ['Web form', 'Phone', 'WhatsApp'];

const steps = [
  { area: 'Sales', title: 'Qualify and survey', body: 'Contact, roof suitability and monthly bill go on the enquiry. The technician records roof direction, tilt and cable distance on a phone. No quote until the survey is approved.', pin: 'Survey approved' },
  { area: 'Orders', title: 'Quote a package', body: '1–5 kW On-Grid or Off-Grid packages from seeded templates. Prices, service scope and the full bill of materials freeze into the quote, so later catalogue edits never rewrite it.', pin: 'Quote frozen' },
  { area: 'Finance', title: 'Confirm and record payment', body: 'Confirmation creates the job, invoice and packing list once. Advance, partial and full receipts are recorded separately, and recorded payment gates the work.', pin: 'Payment recorded' },
  { area: 'Warehouse', title: 'Scan and dispatch', body: 'Every inverter, battery, charge controller and panel is scanned before it leaves. Delivery links each unit to the customer and starts its warranty once.', pin: 'Serials scanned' },
  { area: 'Field', title: 'Install and sign off', body: 'The job card holds start and finish times, confirmed components, the checklist, finished-roof photos and the customer’s signature on the installer’s device.', pin: 'Customer signed' },
];

const rules = [
  ['All or nothing', 'Each critical command commits its stock, money and workflow effects together, so a failed step leaves no partial write.'],
  ['Safe to retry', 'A repeated confirmation, payment or delivery must replay, not duplicate records, balances or warranty dates.'],
  ['Stock stays real', 'Duplicate serials and short stock must be rejected, and concurrent reservations of one unit have one winner.'],
  ['Every change explained', 'Material transitions must keep who, when and why. Financial corrections are reversals, not edits.'],
] as const;

const service = [
  { icon: Search, title: 'Find the right unit', body: 'Search by customer name, phone or exact hardware serial, with installation and service history alongside coverage.' },
  { icon: ShieldCheck, title: 'Covered or chargeable', body: 'Each decision saves the unit, dates, policy and reason. Covered work costs the customer nothing but still counts against the job.' },
  { icon: CheckCircle2, title: 'Closed when it works', body: 'A resolved ticket waits for the customer. Closure records who confirmed, how and when.' },
  { icon: FileText, title: 'Month-end without the scramble', body: 'Today, week and month views of profitability, open repairs, unpaid balances and subsidy milestones, with CSV export.' },
];

const figures = [
  { value: 40, prefix: '~', suffix: '', label: 'rooftop projects a month', note: 'the volume the brief describes' },
  { value: 5, prefix: '1–', suffix: ' kW', label: 'On-Grid and Off-Grid packages', note: 'seeded templates with a full bill of materials' },
  { value: 20, prefix: '', suffix: ' yrs', label: 'panel warranty in the brief', note: 'two years for inverters and batteries; policies stay configurable' },
];

export function LandingPage() {
  const root = useRef<HTMLDivElement>(null);
  const [activeStep, setActiveStep] = useState(0);
  const [scrolled, setScrolled] = useState(false);
  const current = steps[activeStep] ?? steps[0]!;

  useEffect(() => {
    const page = root.current;
    if (!page) return;
    const revealables = page.querySelectorAll<HTMLElement>('[data-reveal]');
    const counters = page.querySelectorAll<HTMLElement>('[data-count]');
    const stepItems = page.querySelectorAll<HTMLElement>('[data-step]');
    const canObserve = 'IntersectionObserver' in window;
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });

    // The step tracker is content, not decoration, so it runs whatever the motion preference.
    const stepper = canObserve ? new IntersectionObserver((entries) => {
      for (const entry of entries) if (entry.isIntersecting) setActiveStep(Number((entry.target as HTMLElement).dataset.step));
    }, { rootMargin: '-45% 0px -50% 0px' }) : null;
    stepItems.forEach((element) => stepper?.observe(element));

    // Reveals and count-ups only hide content once this has started, and stopping them always restores final values.
    const startMotion = () => {
      const frames: number[] = [];
      const count = (element: HTMLElement) => {
        const target = Number(element.dataset.count);
        const started = performance.now();
        const tick = (now: number) => {
          const progress = Math.min(1, (now - started) / 1100);
          element.textContent = String(Math.round(target * (1 - Math.pow(1 - progress, 3))));
          if (progress < 1) frames.push(requestAnimationFrame(tick));
        };
        element.textContent = '0';
        frames.push(requestAnimationFrame(tick));
      };
      const reveal = new IntersectionObserver((entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const element = entry.target as HTMLElement;
          element.classList.add('is-in');
          element.querySelectorAll<HTMLElement>('[data-count]').forEach(count);
          reveal.unobserve(element);
        }
      }, { rootMargin: '0px 0px -12% 0px' });
      page.classList.add('lp-motion');
      revealables.forEach((element) => { if (!element.classList.contains('is-in')) reveal.observe(element); });
      return () => {
        reveal.disconnect();
        frames.forEach(cancelAnimationFrame);
        page.classList.remove('lp-motion');
        revealables.forEach((element) => element.classList.add('is-in'));
        counters.forEach((element) => { element.textContent = element.dataset.count ?? ''; });
      };
    };

    const reduce = matchMedia('(prefers-reduced-motion: reduce)');
    let stopMotion: (() => void) | null = null;
    const applyPreference = () => {
      if (reduce.matches || !canObserve) { stopMotion?.(); stopMotion = null; }
      else stopMotion ??= startMotion();
    };
    applyPreference();
    reduce.addEventListener('change', applyPreference);

    return () => {
      window.removeEventListener('scroll', onScroll);
      reduce.removeEventListener('change', applyPreference);
      stepper?.disconnect();
      stopMotion?.();
    };
  }, []);

  return <div className="lp" ref={root}>
    <header className={`lp-nav${scrolled ? ' is-scrolled' : ''}`}>
      <Link to="/" className="lp-brand" aria-label="Solar OS home"><BrandMark /> Solar OS</Link>
      <nav aria-label="Page sections" className="lp-nav-links">
        <a href="#lifecycle">How it works</a>
        <a href="#rules">Rules</a>
        <a href="#service">Service</a>
      </nav>
      <div className="lp-nav-actions">
        <Link to="/login" className="lp-link-quiet">Staff sign in</Link>
        <Link to="/enquire" className="lp-btn lp-btn--gold">Enquire <ArrowUpRight size="1rem" aria-hidden="true" /></Link>
      </div>
    </header>

    <main>
      <section className="lp-hero" aria-labelledby="lp-hero-title">
        <SolarArt className="lp-hero-art" />
        <div className="lp-hero-copy">
          <p className="lp-eyebrow">Solar operations for SunPower Solutions</p>
          <h1 id="lp-hero-title" className="lp-hero-title">
            {['Every', 'rooftop,', 'one', 'connected', 'record.'].map((word, index) => <span key={word}><span className="lp-word" style={{ '--i': index } as React.CSSProperties}>{word}</span>{' '}</span>)}
          </h1>
          <p className="lp-lead">Enquiry, survey, quote, payment, dispatch, installation and service in one system, built for a team handling around 40 rooftop projects a month.</p>
          <div className="lp-actions">
            <Link to="/enquire" className="lp-btn lp-btn--gold">Make a solar enquiry <ArrowUpRight size="1rem" aria-hidden="true" /></Link>
            <Link to="/login" className="lp-btn lp-btn--ghost">Staff sign in</Link>
          </div>
        </div>
        <aside className="lp-jobcard" aria-label="Example job card">
          <div className="lp-jobcard-head"><ClipboardList size="1.125rem" aria-hidden="true" /><span>Job card · 3 kW On-Grid</span><span className="lp-sample">Sample</span></div>
          <ol>
            {steps.map((step, index) => <li key={step.pin} style={{ '--i': index } as React.CSSProperties}><span className="lp-tick"><Check size=".75rem" aria-hidden="true" /></span>{step.pin}</li>)}
          </ol>
        </aside>
      </section>

      <section className="lp-statement" data-reveal>
        <p>Registers, hand-typed quotes and lost paperwork, <span className="lp-hl">replaced by one record</span> that follows the customer from the first call to years of service.</p>
      </section>

      <section className="lp-channels" aria-labelledby="lp-channels-title" data-reveal>
        <h2 id="lp-channels-title">Every enquiry lands in one queue</h2>
        <p>Web enquiries arrive directly. Staff log phone and WhatsApp enquiries with their source, so nothing lives in a notebook.</p>
        <div className="lp-marquee" aria-hidden="true">
          <div className="lp-marquee-track">
            {[0, 1, 2, 3].map((copy) => channels.map((channel) => <span key={`${copy}-${channel}`} className="lp-chip">{channel}</span>))}
          </div>
        </div>
        <ul className="visually-hidden">{channels.map((channel) => <li key={channel}>{channel}</li>)}</ul>
      </section>

      <section id="lifecycle" className="lp-lifecycle" aria-labelledby="lp-lifecycle-title">
        <div className="lp-section-head" data-reveal>
          <p className="lp-eyebrow">How it works</p>
          <h2 id="lp-lifecycle-title">Five steps, each one gated by the last</h2>
        </div>
        <div className="lp-lifecycle-grid">
          <div className="lp-stage" aria-hidden="true">
            <div className="lp-stage-card">
              <span className="lp-stage-area">Step 0{activeStep + 1} · {current.area}</span>
              <div className="lp-stage-rail">{steps.map((step, index) => <span key={step.pin} className={index <= activeStep ? 'is-on' : ''} />)}</div>
              <strong key={activeStep} className="lp-stage-pin"><Check size="1rem" /> {current.pin}</strong>
            </div>
          </div>
          <ol className="lp-steps">
            {steps.map((step, index) => <li key={step.title} data-step={index} className={index === activeStep ? 'is-active' : ''}>
              <span className="lp-step-num">0{index + 1}</span>
              <div><span className="lp-step-area">{step.area}</span><h3>{step.title}</h3><p>{step.body}</p></div>
            </li>)}
          </ol>
        </div>
      </section>

      <section id="rules" className="lp-rules" aria-labelledby="lp-rules-title">
        <WaveArt className="lp-rules-art" />
        <div className="lp-section-head" data-reveal>
          <p className="lp-eyebrow">Required controls</p>
          <h2 id="lp-rules-title">Rules the record is required to hold</h2>
          <p className="lp-rules-note">From the product requirements: the controls every critical workflow must enforce.</p>
        </div>
        <div className="lp-rule-grid">
          {rules.map(([title, body], index) => <article key={title} className="lp-rule" data-reveal style={{ '--i': index } as React.CSSProperties}>
            <span className="lp-rule-num">0{index + 1}</span><h3>{title}</h3><p>{body}</p>
          </article>)}
        </div>
      </section>

      <section id="service" className="lp-service" aria-labelledby="lp-service-title">
        <div className="lp-section-head" data-reveal>
          <p className="lp-eyebrow">After installation</p>
          <h2 id="lp-service-title">Service that remembers every unit</h2>
        </div>
        <div className="lp-card-grid">
          {service.map(({ icon: Icon, title, body }, index) => <article key={title} className="lp-card" data-reveal style={{ '--i': index } as React.CSSProperties}>
            <span className="lp-card-icon"><Icon size="1.25rem" aria-hidden="true" /></span><h3>{title}</h3><p>{body}</p>
          </article>)}
        </div>
      </section>

      <section className="lp-brief" aria-labelledby="lp-brief-title" data-reveal>
        <h2 id="lp-brief-title" className="lp-eyebrow">From the brief</h2>
        <dl className="lp-figures">
          {figures.map((figure) => <div key={figure.label}>
            <dt>{figure.label}</dt>
            <dd><span className="lp-figure">{figure.prefix}<span data-count={figure.value}>{figure.value}</span>{figure.suffix}</span><small>{figure.note}</small></dd>
          </div>)}
        </dl>
      </section>

      <section className="lp-cta" aria-labelledby="lp-cta-title" data-reveal>
        <SolarArt className="lp-cta-art" />
        <div>
          <h2 id="lp-cta-title">Start with one rooftop.</h2>
          <p>Tell us about your site. A technician surveys the roof, and you get a clear, itemised quote.</p>
          <div className="lp-actions">
            <Link to="/enquire" className="lp-btn lp-btn--gold">Make a solar enquiry <ArrowUpRight size="1rem" aria-hidden="true" /></Link>
            <Link to="/login" className="lp-btn lp-btn--ghost">Staff sign in</Link>
          </div>
        </div>
      </section>
    </main>

    <footer className="lp-footer">
      <div className="lp-footer-top">
        <Link to="/" className="lp-brand" aria-label="Solar OS home"><BrandMark /> Solar OS</Link>
        <SystemStatus />
      </div>
      <p className="lp-wordmark" aria-hidden="true">Solar OS</p>
      <p className="lp-footnote">React + NestJS + local PostgreSQL. Shared contracts, clear ownership, real persistence.</p>
    </footer>
  </div>;
}

function SystemStatus() {
  const health = useQuery({ queryKey: ['health'], queryFn: ({ signal }) => apiGet('/health', healthResponseSchema, signal) });
  const database = useQuery({ queryKey: ['readiness'], queryFn: ({ signal }) => apiGet('/health/ready', readinessResponseSchema, signal) });
  return <div className="lp-status" aria-label="Live system status">
    <StatusDot label="Application API" pending={health.isPending} ready={health.isSuccess} onRetry={health.isError ? () => void health.refetch() : undefined} />
    <StatusDot label="PostgreSQL" pending={database.isPending} ready={database.isSuccess} onRetry={database.isError ? () => void database.refetch() : undefined} />
  </div>;
}

function StatusDot({ label, pending, ready, onRetry }: { label: string; pending: boolean; ready: boolean; onRetry?: () => void }) {
  return <span className="lp-status-item">
    <span aria-hidden="true" className={`lp-dot${ready ? ' is-ready' : pending ? '' : ' is-down'}`} />
    <span role="status">{label}: {pending ? 'checking…' : ready ? 'connected' : 'unavailable'}</span>
    {onRetry && <button type="button" className="lp-retry" onClick={onRetry}>Retry</button>}
  </span>;
}
