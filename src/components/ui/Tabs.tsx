import { cn } from '@/utils/cn';
import type { ReactNode } from 'react';

interface Tab {
  id: string;
  label: string;
}

interface TabsProps {
  tabs: Tab[];
  activeTab: string;
  onChange: (tabId: string) => void;
}

export function Tabs({ tabs, activeTab, onChange }: TabsProps) {
  return (
    <div className="flex gap-1 mb-4">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          className={cn(
            'px-4 py-1.5 text-sm font-medium rounded transition-colors',
            activeTab === tab.id
              ? 'bg-primary-50 text-primary-500'
              : 'text-gray-600 hover:bg-gray-100'
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

interface TabPanelProps {
  children: ReactNode;
  isActive: boolean;
}

export function TabPanel({ children, isActive }: TabPanelProps) {
  if (!isActive) return null;
  return <div>{children}</div>;
}
