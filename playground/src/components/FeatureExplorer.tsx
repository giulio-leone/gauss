import { useState } from 'react';
import { FEATURES, FEATURE_CATEGORIES, type Feature } from '../data/features';

type CategoryFilter = 'all' | Feature['category'];

export function FeatureExplorer() {
  const [filter, setFilter] = useState<CategoryFilter>('all');
  const [selected, setSelected] = useState<Feature | null>(null);

  const filtered = filter === 'all' ? FEATURES : FEATURES.filter((f) => f.category === filter);

  return (
    <div className="pg-feature-explorer">
      <div className="pg-fe-header">
        <h2>Feature Explorer</h2>
        <span className="pg-fe-count">{FEATURES.length} features</span>
      </div>

      <div className="pg-fe-filters">
        <button
          className={`pg-fe-filter ${filter === 'all' ? 'pg-fe-filter--active' : ''}`}
          onClick={() => setFilter('all')}
        >
          All
        </button>
        {(Object.entries(FEATURE_CATEGORIES) as [Feature['category'], { label: string; color: string }][]).map(
          ([key, cat]) => (
            <button
              key={key}
              className={`pg-fe-filter ${filter === key ? 'pg-fe-filter--active' : ''}`}
              style={{ '--filter-color': cat.color } as React.CSSProperties}
              onClick={() => setFilter(key)}
            >
              {cat.label}
            </button>
          ),
        )}
      </div>

      <div className="pg-fe-grid">
        {filtered.map((feature) => (
          <button
            key={feature.id}
            className={`pg-fe-card ${selected?.id === feature.id ? 'pg-fe-card--active' : ''}`}
            onClick={() => setSelected(selected?.id === feature.id ? null : feature)}
          >
            <div className="pg-fe-card-icon">{feature.icon}</div>
            <div className="pg-fe-card-body">
              <div className="pg-fe-card-top">
                <span className="pg-fe-card-name">{feature.name}</span>
                <span className="pg-fe-card-status">✅</span>
              </div>
              <p className="pg-fe-card-desc">{feature.description}</p>
              <span
                className="pg-fe-card-category"
                style={{ color: FEATURE_CATEGORIES[feature.category].color }}
              >
                {FEATURE_CATEGORIES[feature.category].label}
              </span>
            </div>
          </button>
        ))}
      </div>

      {selected && (
        <div className="pg-fe-detail">
          <div className="pg-fe-detail-header">
            <span className="pg-fe-detail-icon">{selected.icon}</span>
            <h3>{selected.name}</h3>
            <button className="pg-fe-detail-close" onClick={() => setSelected(null)}>✕</button>
          </div>
          <p className="pg-fe-detail-desc">{selected.description}</p>
          <div className="pg-code-block">
            <div className="pg-code-lang">typescript</div>
            <pre><code>{selected.code}</code></pre>
          </div>
        </div>
      )}
    </div>
  );
}
