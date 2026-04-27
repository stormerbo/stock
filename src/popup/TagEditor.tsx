import { useState, useRef, useEffect } from 'react';
import { X, Plus } from 'lucide-react';
import TagBadge from './TagBadge';
import {
  type TagDefinition,
  MAX_TAGS_PER_HOLDING,
  MAX_TAG_NAME_LENGTH,
} from '../shared/tags';

type TagEditorProps = {
  currentTags: string[];
  globalTags: TagDefinition[];
  onSave: (tags: string[]) => void;
  onClose: () => void;
  onCreateTag: (name: string) => void;
  onDeleteTag: (name: string) => void;
};

export default function TagEditor({
  currentTags,
  globalTags,
  onSave,
  onClose,
  onCreateTag,
  onDeleteTag,
}: TagEditorProps) {
  const [selectedTags, setSelectedTags] = useState<string[]>([...currentTags]);
  const [newTagName, setNewTagName] = useState('');
  const [showNewInput, setShowNewInput] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (showNewInput && inputRef.current) {
      inputRef.current.focus();
    }
  }, [showNewInput]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  const availableTags = globalTags
    .map(t => t.name)
    .filter(name => !selectedTags.includes(name));

  const handleToggleTag = (name: string) => {
    if (selectedTags.includes(name)) {
      setSelectedTags(selectedTags.filter(t => t !== name));
    } else {
      if (selectedTags.length >= MAX_TAGS_PER_HOLDING) return;
      setSelectedTags([...selectedTags, name]);
    }
  };

  const handleCreateTag = () => {
    const name = newTagName.trim().slice(0, MAX_TAG_NAME_LENGTH);
    if (!name) return;
    if (globalTags.some(t => t.name === name)) {
      // Already exists, just add it
      if (!selectedTags.includes(name) && selectedTags.length < MAX_TAGS_PER_HOLDING) {
        setSelectedTags([...selectedTags, name]);
      }
    } else {
      onCreateTag(name);
      if (selectedTags.length < MAX_TAGS_PER_HOLDING) {
        setSelectedTags([...selectedTags, name]);
      }
    }
    setNewTagName('');
    setShowNewInput(false);
  };

  const handleRemove = (tag: string) => {
    setSelectedTags(selectedTags.filter(t => t !== tag));
  };

  return (
    <div className="tag-editor-overlay">
      <div className="tag-editor-modal" ref={modalRef}>
        <div className="tag-editor-header">
          <span className="tag-editor-title">管理标签</span>
          <button type="button" className="tag-editor-close" onClick={onClose}>
            <X size={14} />
          </button>
        </div>

        <div className="tag-editor-body">
          {/* Current tags */}
          <div className="tag-editor-section">
            <span className="tag-editor-label">
              已选标签（{selectedTags.length}/{MAX_TAGS_PER_HOLDING}）
            </span>
            <div className="tag-editor-current">
              {selectedTags.length === 0 ? (
                <span className="tag-editor-empty">暂无标签</span>
              ) : (
                selectedTags.map(tag => (
                  <TagBadge key={tag} tag={tag} onRemove={handleRemove} size="medium" />
                ))
              )}
            </div>
          </div>

          {/* Available tags */}
          {availableTags.length > 0 && (
            <div className="tag-editor-section">
              <span className="tag-editor-label">可选标签</span>
              <div className="tag-editor-available">
                {availableTags.map(name => (
                  <button
                    key={name}
                    type="button"
                    className="tag-editor-option"
                    onClick={() => handleToggleTag(name)}
                    disabled={selectedTags.length >= MAX_TAGS_PER_HOLDING}
                  >
                    {name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Create new tag */}
          {showNewInput ? (
            <div className="tag-editor-new-form">
              <input
                ref={inputRef}
                className="tag-editor-new-input"
                value={newTagName}
                onChange={e => setNewTagName(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') handleCreateTag();
                  if (e.key === 'Escape') setShowNewInput(false);
                }}
                placeholder="输入标签名，回车确认"
                maxLength={MAX_TAG_NAME_LENGTH}
              />
              <button type="button" className="tag-editor-confirm-btn" onClick={handleCreateTag}>
                确定
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="tag-editor-add-btn"
              onClick={() => setShowNewInput(true)}
            >
              <Plus size={12} /> 新建标签
            </button>
          )}
        </div>

        <div className="tag-editor-footer">
          <button type="button" className="tag-editor-btn tag-editor-btn-cancel" onClick={onClose}>
            取消
          </button>
          <button
            type="button"
            className="tag-editor-btn tag-editor-btn-save"
            onClick={() => onSave(selectedTags)}
          >
            保存
          </button>
        </div>
      </div>
    </div>
  );
}
