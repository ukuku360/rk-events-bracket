import type { FormEvent } from 'react';
import { useState } from 'react';

interface RegistrationPanelProps {
  buttonText: string;
  disabled: boolean;
  onSubmit: (input: { name: string; aura: string; weak: string }) => Promise<boolean>;
}

export function RegistrationPanel({
  buttonText,
  disabled,
  onSubmit,
}: RegistrationPanelProps) {
  const [name, setName] = useState('');
  const [aura, setAura] = useState('');
  const [weak, setWeak] = useState('');

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const saved = await onSubmit({ name, aura, weak });

    if (!saved) {
      return;
    }

    setName('');
    setAura('');
    setWeak('');
  }

  return (
    <section className="panel user-card registration-panel">
      <h2>Player Registration</h2>
      <form onSubmit={handleSubmit}>
        <label>
          <span>Name</span>
          <input
            name="name"
            type="text"
            placeholder="e.g. Minji"
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <label>
          <span>Aura Skill</span>
          <input
            name="aura"
            type="text"
            placeholder="e.g. Quick reflex"
            required
            value={aura}
            onChange={(event) => setAura(event.target.value)}
          />
        </label>
        <label>
          <span>Weak Point (for fun)</span>
          <input
            name="weak"
            type="text"
            placeholder="e.g. Slow in long rallies"
            required
            value={weak}
            onChange={(event) => setWeak(event.target.value)}
          />
        </label>
        <button id="addButton" type="submit" disabled={disabled}>
          {buttonText}
        </button>
      </form>
    </section>
  );
}
