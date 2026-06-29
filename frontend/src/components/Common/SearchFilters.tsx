import React from 'react';

export interface FilterOption {
  value: string;
  label: string;
}

export interface FilterGroup {
  key: string;
  label: string;
  multi: boolean;
  options: FilterOption[];
}

interface SearchFiltersProps {
  filterGroups: FilterGroup[];
  compact?: boolean;
  className?: string;
  onChange?: (filters: Record<string, string | string[]>) => void;
}

export const SearchFilters: React.FC<SearchFiltersProps> = ({ filterGroups, _compact, className, _onChange }) => {
  if (filterGroups.length === 0) return null;

  return (
    <div className={className} data-testid="search-filters">
      {filterGroups.map(group => (
        <div key={group.key} data-testid={`filter-group-${group.key}`}>
          <span>{group.label}</span>
        </div>
      ))}
    </div>
  );
};

export default React.memo(SearchFilters);
