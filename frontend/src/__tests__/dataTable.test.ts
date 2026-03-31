import { describe, it, expect } from 'vitest';
import { DataTableProcessor, exportToCSV } from '../utils/dataTable';

const sampleData = [
  { name: 'AAPL', price: 150, change: 2.5, sector: 'Tech' },
  { name: 'GOOG', price: 2800, change: -1.2, sector: 'Tech' },
  { name: 'JPM', price: 160, change: 0.5, sector: 'Finance' },
  { name: 'BAC', price: 40, change: -0.8, sector: 'Finance' },
  { name: 'MSFT', price: 300, change: 1.8, sector: 'Tech' },
];

describe('DataTableProcessor', () => {
  it('should return all data without filters', () => {
    const result = new DataTableProcessor(sampleData).execute();
    expect(result.data).toHaveLength(5);
    expect(result.pagination.total).toBe(5);
  });

  it('should sort ascending', () => {
    const result = new DataTableProcessor(sampleData)
      .sortBy('price', 'asc')
      .execute();
    expect(result.data[0].name).toBe('BAC');
    expect(result.data[4].name).toBe('GOOG');
  });

  it('should sort descending', () => {
    const result = new DataTableProcessor(sampleData)
      .sortBy('price', 'desc')
      .execute();
    expect(result.data[0].name).toBe('GOOG');
  });

  it('should filter by eq', () => {
    const result = new DataTableProcessor(sampleData)
      .filter({ column: 'sector', operator: 'eq', value: 'Tech' })
      .execute();
    expect(result.data).toHaveLength(3);
  });

  it('should filter by gt', () => {
    const result = new DataTableProcessor(sampleData)
      .filter({ column: 'price', operator: 'gt', value: 200 })
      .execute();
    expect(result.data).toHaveLength(2);
  });

  it('should filter by contains', () => {
    const result = new DataTableProcessor(sampleData)
      .filter({ column: 'name', operator: 'contains', value: 'A' })
      .execute();
    expect(result.data.length).toBeGreaterThan(0);
  });

  it('should filter by in', () => {
    const result = new DataTableProcessor(sampleData)
      .filter({ column: 'sector', operator: 'in', value: ['Tech'] })
      .execute();
    expect(result.data).toHaveLength(3);
  });

  it('should paginate', () => {
    const result = new DataTableProcessor(sampleData)
      .paginate(1, 2)
      .execute();
    expect(result.data).toHaveLength(2);
    expect(result.pagination.page).toBe(1);
    expect(result.pagination.total).toBe(5);
  });

  it('should paginate second page', () => {
    const result = new DataTableProcessor(sampleData)
      .paginate(2, 2)
      .execute();
    expect(result.data).toHaveLength(2);
    expect(result.pagination.page).toBe(2);
  });

  it('should chain sort, filter, and paginate', () => {
    const result = new DataTableProcessor(sampleData)
      .filter({ column: 'sector', operator: 'eq', value: 'Tech' })
      .sortBy('price', 'desc')
      .paginate(1, 2)
      .execute();
    expect(result.data).toHaveLength(2);
    expect(result.data[0].name).toBe('GOOG');
  });

  it('should clear filters', () => {
    const proc = new DataTableProcessor(sampleData)
      .filter({ column: 'sector', operator: 'eq', value: 'Tech' });
    proc.clearFilters();
    const result = proc.execute();
    expect(result.data).toHaveLength(5);
  });

  it('should get unique values', () => {
    const values = new DataTableProcessor(sampleData).uniqueValues('sector');
    expect(values).toEqual(['Finance', 'Tech']);
  });

  it('should track sort config', () => {
    const result = new DataTableProcessor(sampleData)
      .sortBy('price', 'asc')
      .execute();
    expect(result.sort).toEqual({ column: 'price', direction: 'asc' });
  });

  it('should handle null sort direction', () => {
    const result = new DataTableProcessor(sampleData)
      .sortBy('price', null)
      .execute();
    expect(result.sort).toBeNull();
  });
});

describe('exportToCSV', () => {
  it('should export data as CSV', () => {
    const data = [{ name: 'AAPL', price: 150 }];
    const csv = exportToCSV(data, [
      { key: 'name', label: 'Name' },
      { key: 'price', label: 'Price' },
    ]);
    expect(csv).toBe('Name,Price\nAAPL,150');
  });

  it('should handle commas in values', () => {
    const data = [{ name: 'Apple, Inc.', price: 150 }];
    const csv = exportToCSV(data, [
      { key: 'name', label: 'Name' },
      { key: 'price', label: 'Price' },
    ]);
    expect(csv).toContain('"Apple, Inc."');
  });

  it('should handle empty data', () => {
    const csv = exportToCSV([], [{ key: 'name', label: 'Name' }]);
    expect(csv).toBe('Name');
  });

  it('should handle null values', () => {
    const data = [{ name: null, price: 150 }];
    const csv = exportToCSV(data, [
      { key: 'name', label: 'Name' },
      { key: 'price', label: 'Price' },
    ]);
    expect(csv).toBe('Name,Price\n,150');
  });
});
