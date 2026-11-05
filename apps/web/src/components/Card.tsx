import type { Card as CardModel } from "@hooktax/core";

export function HookCard({ card }: { card: CardModel }) {
  return (
    <section className="card">
      <h3>HookTax card</h3>
      <dl>
        {card.lines.map((l) => (
          <div key={l.label} className={`cardline tone-${l.tone}`}>
            <dt>{l.label}</dt>
            <dd>{l.value}</dd>
          </div>
        ))}
      </dl>
      <h4>Capability rules triggered</h4>
      <ul className="caps">
        {card.capabilities.map((c) => (
          <li key={c.id} className={c.id.startsWith("worst-case") ? "risk" : c.id === "no-swap-cut" ? "ok" : ""}>
            {c.text}
          </li>
        ))}
      </ul>
      <p className="muted small">
        Measurement, not an audit. Numbers come from swaps on a mainnet fork at one block; capabilities come from the
        hook address bits, proxy slots and pool fee flag.
      </p>
    </section>
  );
}
