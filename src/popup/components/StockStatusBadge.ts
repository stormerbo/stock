import React from 'react';

type Props = {
  suspended?: boolean;
};

export default function StockStatusBadge({ suspended = false }: Props) {
  if (!suspended) return null;
  return React.createElement('span', { className: 'stock-badge suspended', title: '停牌' }, '停');
}
