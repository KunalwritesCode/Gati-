import { useState } from 'react';
import { useData } from '../state/data';
import { usePrefs } from '../state/prefs';
import { boardableStops, destinationsFrom } from '../lib/bus';
import { Button, Sheet } from '../components/ui';
import { StopOptions } from '../components/StopPicker';

/** Two quick, skippable questions on first launch. */
export function Onboarding() {
  const { data } = useData();
  const { prefs, update } = usePrefs();
  const [step, setStep] = useState<1 | 2>(1);
  const [stop, setStop] = useState<string | null>(null);
  const open = !prefs.onboarded;
  const skip = () => update({ onboarded: true });

  return (
    <Sheet
      open={open}
      onClose={skip}
      title={step === 1 ? 'Where do you usually catch the bus?' : 'Where are you usually headed?'}
      footer={
        <div className="flex items-center justify-between gap-3">
          <Button variant="quiet" onClick={skip}>
            Skip for now
          </Button>
          {step === 2 && (
            <Button variant="primary" onClick={() => update({ stopId: stop, destinationId: null, onboarded: true })}>
              Any direction
            </Button>
          )}
        </div>
      }
    >
      {step === 1 ? (
        <>
          <p className="mb-3 text-[14px] text-muted">Gati shows the next bus from this stop on your home screen. You can change it any time.</p>
          <StopOptions
            stops={boardableStops(data.bus)}
            value={stop}
            onPick={(id) => {
              setStop(id);
              setStep(2);
            }}
          />
        </>
      ) : (
        <>
          <p className="mb-3 text-[14px] text-muted">Optional. Pick a destination to see only buses going that way.</p>
          <StopOptions hints={false} stops={stop ? destinationsFrom(data.bus, stop) : []} value={null} onPick={(id) => update({ stopId: stop, destinationId: id, onboarded: true })} />
          <button onClick={() => setStep(1)} className="mt-3 px-3 text-[14px] font-medium text-accent">
            ‹ Change boarding stop
          </button>
        </>
      )}
    </Sheet>
  );
}
