import { X } from 'lucide-react';
import { getTagColor } from '../../shared/tags';
import { Badge } from '../components/ui';

type TagBadgeProps = {
  tag: string;
  color?: string;
  onRemove?: (tag: string) => void;
  size?: 'small' | 'medium';
};

export default function TagBadge({ tag, color, onRemove, size = 'small' }: TagBadgeProps) {
  const bgColor = color ?? getTagColor(tag);

  return (
    <Badge
      tone="accent"
      size={size === 'medium' ? 'md' : 'sm'}
      color={bgColor}
      className={`tag-badge tag-badge-${size}`}
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
    </Badge>
  );
}
