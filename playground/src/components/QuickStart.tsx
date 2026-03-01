import { useState } from 'react';
import { QUICK_START_SNIPPETS } from '../data/features';

export function QuickStart() {
  const [activeIdx, setActiveIdx] = useState(0);
  const snippet = QUICK_START_SNIPPETS[activeIdx];

  return (
    <div className="pg-quickstart">
      <div className="pg-qs-header">
        <h2>Quick Start</h2>
        <span className="pg-qs-hint">Get running in minutes</span>
      </div>

      <div className="pg-qs-tabs">
        {QUICK_START_SNIPPETS.map((s, i) => (
          <button
            key={s.id}
            className={`pg-qs-tab ${i === activeIdx ? 'pg-qs-tab--active' : ''}`}
            onClick={() => setActiveIdx(i)}
          >
            {s.title}
          </button>
        ))}
      </div>

      <div className="pg-code-block pg-qs-code">
        <div className="pg-code-lang">typescript</div>
        <pre><code>{snippet.code}</code></pre>
      </div>

      <div className="pg-qs-install">
        <div className="pg-code-block">
          <div className="pg-code-lang">bash</div>
          <pre><code>npm install gauss-ts</code></pre>
        </div>
      </div>
    </div>
  );
}
