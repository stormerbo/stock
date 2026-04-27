import { getTagColor } from '../shared/tags';
import type { TagDefinition } from '../shared/tags';

type TagFilterBarProps = {
  tags: TagDefinition[];
  selected: string[];
  onToggle: (tagName: string) => void;
  onClear: () => void;
};

export default function TagFilterBar({ tags, selected, onToggle, onClear }: TagFilterBarProps) {
  if (tags.length === 0) return null;

  return (
    <div className="tag-filter-bar">
      <button
        type="button"
        className={`tag-filter-btn ${selected.length === 0 ? 'active' : ''}`}
        onClick={onClear}
      >
        全部
      </button>
      {tags.map((t) => {
        const isSelected = selected.includes(t.name);
        const color = t.color ?? getTagColor(t.name);
        return (
          <button
            key={t.name}
            type="button"
            className={`tag-filter-btn ${isSelected ? 'active' : ''}`}
            style={{
              ...(isSelected ? {
                backgroundColor: color + '33',
                borderColor: color + '66',
                color,
              } : {}),
            }}
            onClick={() => onToggle(t.name)}
          >
            {t.name}
          </button>
        );
      })}
    </div>
  );
}
