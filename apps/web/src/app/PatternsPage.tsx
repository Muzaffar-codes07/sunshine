import { useState } from 'react';
import { ActionDrawer, DetailPattern, FormPattern, ListPattern, SummaryPattern, TimelinePattern } from '../components/shared/patterns';
import { Field } from '../components/ui/Field';

/** Development-only component examples. These are not business records or completed actions. */
export function PatternsPage() {
  const [drawer, setDrawer] = useState(false);
  const [message, setMessage] = useState('');
  return <main className="enquiry-page"><h1>Six page patterns</h1><p>Development examples only. No business data is read or written.</p>
    <h2>List</h2><ListPattern title="Example list" columns={[{ id: 'name', label: 'Name' }]} rows={[]} />
    <DetailPattern title="Detail" entries={[{ id: 'state', label: 'State', value: 'Example only' }]} />
    <FormPattern title="Form example" submitLabel="Check example" onSubmit={(event) => { event.preventDefault(); setMessage('Example form submitted locally. Nothing was saved.'); }}>
      <Field label="Example text">{(control) => <input {...control} name="example" />}</Field>
    </FormPattern>{message && <p role="status">{message}</p>}
    <TimelinePattern title="Timeline" events={[]} />
    <button onClick={() => setDrawer(true)}>Open action drawer</button><ActionDrawer open={drawer} title="Action drawer" onClose={() => setDrawer(false)}><p>Place a contextual form here.</p></ActionDrawer>
    <SummaryPattern title="Summary / reconciliation" entries={[{ id: 'source', label: 'Source', value: 'Awaiting API data' }]} note="Calculations and eligibility come from the backend." />
  </main>;
}
