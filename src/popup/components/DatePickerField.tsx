import { createPortal } from 'react-dom';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, Clock3, Sparkles } from 'lucide-react';
import { getLastTradingDay, getShanghaiToday, getShanghaiYesterday } from '../../shared/fetch';
import {
  buildCalendarWeeks,
  getDatePickerTriggerLabel,
  getMonthKey,
  getMonthTitle,
  shiftMonthKey,
} from './date-picker-utils';

type Props = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  minDate?: string;
  maxDate?: string;
  placeholder?: string;
};

function compareDateKey(a: string, b: string): number {
  return a.localeCompare(b);
}

export default function DatePickerField({
  label,
  value,
  onChange,
  minDate,
  maxDate,
  placeholder = '选择日期',
}: Props) {
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [viewDateKey, setViewDateKey] = useState(() => getMonthKey(value || getShanghaiToday()));
  const [position, setPosition] = useState({ top: 0, left: 0, width: 360 });

  const today = getShanghaiToday();

  useEffect(() => {
    if (open) setViewDateKey(getMonthKey(value || today));
  }, [open, today, value]);

  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;

    const rect = trigger.getBoundingClientRect();
    const width = Math.min(332, Math.max(288, Math.floor(window.innerWidth - 16)));
    const height = popoverRef.current?.offsetHeight ?? 412;

    let left = rect.left;
    if (left + width > window.innerWidth - 8) left = window.innerWidth - width - 8;
    if (left < 8) left = 8;

    let top = rect.bottom + 8;
    if (top + height > window.innerHeight - 8) {
      top = Math.max(8, rect.top - height - 8);
    }

    setPosition({ top, left, width });
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    updatePosition();
  }, [open, updatePosition, viewDateKey, value]);

  useEffect(() => {
    if (!open) return;

    const handleResize = () => updatePosition();
    const handleScroll = () => updatePosition();
    const handleDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || popoverRef.current?.contains(target)) return;
      setOpen(false);
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('scroll', handleScroll, true);
    document.addEventListener('mousedown', handleDown);
    document.addEventListener('keydown', handleKey);

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('scroll', handleScroll, true);
      document.removeEventListener('mousedown', handleDown);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open, updatePosition]);

  const weeks = useMemo(() => buildCalendarWeeks(viewDateKey, value, today), [today, value, viewDateKey]);

  const isSelectable = (dateKey: string) => {
    if (minDate && compareDateKey(dateKey, minDate) < 0) return false;
    if (maxDate && compareDateKey(dateKey, maxDate) > 0) return false;
    return true;
  };

  const pickDate = (dateKey: string) => {
    if (!isSelectable(dateKey)) return;
    onChange(dateKey);
    setOpen(false);
  };

  const actionItems = [
    { label: '今天', value: today, icon: Sparkles },
    { label: '昨日', value: getShanghaiYesterday(), icon: CalendarDays },
    { label: '最近交易日', value: getLastTradingDay(), icon: Clock3 },
  ].filter((item) => isSelectable(item.value));

  const popover = open && typeof document !== 'undefined'
    ? createPortal(
      <div
        ref={popoverRef}
        className="date-picker-popover"
        style={{ top: position.top, left: position.left, width: position.width }}
      >
        <div className="date-picker-header">
          <div className="date-picker-title-wrap">
            <span className="date-picker-title">{getMonthTitle(viewDateKey)}</span>
            <span className="date-picker-subtitle">交易日用绿色标识，周末显示为休市</span>
          </div>
          <div className="date-picker-nav">
            <button type="button" className="date-picker-nav-btn" onClick={() => setViewDateKey((prev) => shiftMonthKey(prev, -1))} aria-label="上个月">
              <ChevronLeft size={15} />
            </button>
            <button type="button" className="date-picker-nav-btn" onClick={() => setViewDateKey((prev) => shiftMonthKey(prev, 1))} aria-label="下个月">
              <ChevronRight size={15} />
            </button>
          </div>
        </div>

        <div className="date-picker-actions">
          {actionItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.label}
                type="button"
                className={`date-picker-chip ${item.value === value ? 'is-active' : ''}`}
                onClick={() => pickDate(item.value)}
              >
                <Icon size={12} />
                {item.label}
              </button>
            );
          })}
        </div>

        <div className="date-picker-legend">
          <span><i className="date-picker-dot is-trading" />交易日</span>
          <span><i className="date-picker-dot is-closed" />休市</span>
          <span>点击日期即可填写</span>
        </div>

        <div className="date-picker-weekdays">
          {['一', '二', '三', '四', '五', '六', '日'].map((day) => (
            <span key={day}>{day}</span>
          ))}
        </div>

        <div className="date-picker-grid">
          {weeks.flat().map((cell) => {
            const disabled = !isSelectable(cell.dateKey);
            return (
              <button
                key={cell.dateKey}
                type="button"
                className={[
                  'date-picker-day',
                  cell.inMonth ? '' : 'is-outside',
                  cell.isTradingDay ? 'is-trading' : 'is-closed',
                  cell.isSelected ? 'is-selected' : '',
                  cell.isToday ? 'is-today' : '',
                ].filter(Boolean).join(' ')}
                disabled={disabled}
                onClick={() => pickDate(cell.dateKey)}
              >
                <span className="date-picker-day-number">{cell.dayNumber}</span>
                <span className="date-picker-day-meta">{cell.tradingLabel}</span>
                {cell.isToday ? <span className="date-picker-day-badge">今</span> : null}
              </button>
            );
          })}
        </div>
      </div>,
      document.body,
    )
    : null;

  return (
    <div className="date-picker-field">
      <button
        ref={triggerRef}
        type="button"
        className={`date-picker-trigger ${open ? 'is-open' : ''}`}
        onClick={() => setOpen((prev) => !prev)}
      >
        <span className="date-picker-trigger-body">
          <span className="date-picker-trigger-label">{label}</span>
          <span className={`date-picker-trigger-value ${value ? '' : 'is-placeholder'}`}>
            {value ? getDatePickerTriggerLabel(value) : placeholder}
          </span>
        </span>
        <CalendarDays size={15} className="date-picker-trigger-icon" />
      </button>
      {popover}
    </div>
  );
}
