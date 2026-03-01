import { FEATURES, FEATURE_CATEGORIES, type Feature } from '../data/features';

const grouped = FEATURES.reduce(
  (acc, f) => {
    (acc[f.category] ??= []).push(f);
    return acc;
  },
  {} as Record<Feature['category'], Feature[]>,
);

interface FeatureSidebarProps {
  onSelectFeature: (id: string) => void;
  activeFeatureId: string | null;
}

export function FeatureSidebar({ onSelectFeature, activeFeatureId }: FeatureSidebarProps) {
  return (
    <div className="pg-feature-sidebar">
      <div className="pg-fs-title">Features</div>
      {(Object.entries(grouped) as [Feature['category'], Feature[]][]).map(([cat, features]) => (
        <div key={cat} className="pg-fs-group">
          <div
            className="pg-fs-group-label"
            style={{ color: FEATURE_CATEGORIES[cat].color }}
          >
            {FEATURE_CATEGORIES[cat].label}
          </div>
          {features.map((f) => (
            <button
              key={f.id}
              className={`pg-fs-item ${activeFeatureId === f.id ? 'pg-fs-item--active' : ''}`}
              onClick={() => onSelectFeature(f.id)}
            >
              <span className="pg-fs-item-icon">{f.icon}</span>
              <span className="pg-fs-item-name">{f.name}</span>
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}
