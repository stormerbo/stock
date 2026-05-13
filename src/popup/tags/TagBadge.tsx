import { X } from 'lucide-react';
import { getTagColor } from '../../shared/tags';

type TagBadgeProps = {
  tag: string;
  color?: string;
  onRemove?: (tag: string) => void;
  size?: 'small' | 'medium';
};

export default function TagBadge({ tag, color, onRemove, size = 'small' }: TagBadgeProps) {
  const bgColor = color ?? getTagColor(tag);

  return (
    <span
      className={`tag-badge tag-badge-${size}`}
      style={{ backgroundColor: bgColor + '22', borderColor: bgColor + '44', color: bgColor }}
    >
      <span className="tag-badge-text">{tag}</span>
      {onRemove && (
        <button
          type="button"
          className="tag-badge-remove"
          onClick={(e) => { e.stopPropagation(); onRemove(tag); }}
          title="移除标签"
        >
          <X size={10} />
        </button>
      )}
    </span>
  );
}
