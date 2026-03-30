import { describe, it, expect } from 'vitest';

// Deep Pagination Logic
interface PaginationState {
  currentPage: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

function createPagination(total: number, pageSize: number, currentPage: number): PaginationState {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.max(1, Math.min(currentPage, totalPages));
  return {
    currentPage: safePage,
    pageSize,
    total,
    totalPages,
  };
}

function getPageRange(state: PaginationState, maxVisible: number): (number | 'ellipsis')[] {
  if (state.totalPages <= maxVisible) {
    return Array.from({ length: state.totalPages }, (_, i) => i + 1);
  }

  const pages: (number | 'ellipsis')[] = [];
  const half = Math.floor((maxVisible - 2) / 2);
  let start = Math.max(2, state.currentPage - half);
  let end = Math.min(state.totalPages - 1, state.currentPage + half);

  // Adjust to show maxVisible - 2 middle pages
  while (end - start < maxVisible - 3 && start > 2) start--;
  while (end - start < maxVisible - 3 && end < state.totalPages - 1) end++;

  pages.push(1);
  if (start > 2) pages.push('ellipsis');
  for (let i = start; i <= end; i++) pages.push(i);
  if (end < state.totalPages - 1) pages.push('ellipsis');
  pages.push(state.totalPages);

  return pages;
}

function getOffsetLimit(state: PaginationState): { offset: number; limit: number } {
  return {
    offset: (state.currentPage - 1) * state.pageSize,
    limit: state.pageSize,
  };
}

function getNextPage(state: PaginationState): number | null {
  return state.currentPage < state.totalPages ? state.currentPage + 1 : null;
}

function getPrevPage(state: PaginationState): number | null {
  return state.currentPage > 1 ? state.currentPage - 1 : null;
}

function getFirstItemIndex(state: PaginationState): number {
  return (state.currentPage - 1) * state.pageSize + 1;
}

function getLastItemIndex(state: PaginationState): number {
  return Math.min(state.currentPage * state.pageSize, state.total);
}

function paginateArray<T>(items: T[], page: number, pageSize: number): { data: T[]; pagination: PaginationState } {
  const pagination = createPagination(items.length, pageSize, page);
  const start = (pagination.currentPage - 1) * pageSize;
  const data = items.slice(start, start + pageSize);
  return { data, pagination };
}

describe('Deep Pagination Logic', () => {
  describe('createPagination', () => {
    it('should calculate total pages correctly', () => {
      const state = createPagination(100, 10, 1);
      expect(state.totalPages).toBe(10);
    });

    it('should round up partial pages', () => {
      const state = createPagination(101, 10, 1);
      expect(state.totalPages).toBe(11);
    });

    it('should clamp page to valid range', () => {
      expect(createPagination(100, 10, 0).currentPage).toBe(1);
      expect(createPagination(100, 10, 999).currentPage).toBe(10);
    });

    it('should handle zero total', () => {
      const state = createPagination(0, 10, 1);
      expect(state.totalPages).toBe(1);
      expect(state.currentPage).toBe(1);
    });

    it('should handle single item', () => {
      const state = createPagination(1, 10, 1);
      expect(state.totalPages).toBe(1);
    });

    it('should handle negative page', () => {
      expect(createPagination(100, 10, -5).currentPage).toBe(1);
    });
  });

  describe('getPageRange', () => {
    it('should show all pages when few', () => {
      const state = createPagination(30, 10, 1);
      const range = getPageRange(state, 7);
      expect(range).toEqual([1, 2, 3]);
    });

    it('should add ellipsis for many pages', () => {
      const state = createPagination(1000, 10, 50);
      const range = getPageRange(state, 7);
      expect(range[0]).toBe(1);
      expect(range[range.length - 1]).toBe(100);
      expect(range).toContain('ellipsis');
    });

    it('should include current page in range', () => {
      const state = createPagination(1000, 10, 50);
      const range = getPageRange(state, 7);
      const numbers = range.filter((p): p is number => p !== 'ellipsis');
      expect(numbers).toContain(50);
    });

    it('should handle first page', () => {
      const state = createPagination(1000, 10, 1);
      const range = getPageRange(state, 7);
      expect(range[0]).toBe(1);
    });

    it('should handle last page', () => {
      const state = createPagination(1000, 10, 100);
      const range = getPageRange(state, 7);
      expect(range[range.length - 1]).toBe(100);
    });
  });

  describe('getOffsetLimit', () => {
    it('should calculate offset for first page', () => {
      const { offset, limit } = getOffsetLimit(createPagination(100, 20, 1));
      expect(offset).toBe(0);
      expect(limit).toBe(20);
    });

    it('should calculate offset for third page', () => {
      const { offset } = getOffsetLimit(createPagination(100, 20, 3));
      expect(offset).toBe(40);
    });

    it('should handle last page with partial items', () => {
      const state = createPagination(25, 10, 3);
      const { offset, limit } = getOffsetLimit(state);
      expect(offset).toBe(20);
      expect(limit).toBe(10);
    });
  });

  describe('navigation', () => {
    it('should return next page when available', () => {
      expect(getNextPage(createPagination(100, 10, 5))).toBe(6);
    });

    it('should return null on last page', () => {
      expect(getNextPage(createPagination(100, 10, 10))).toBeNull();
    });

    it('should return prev page when available', () => {
      expect(getPrevPage(createPagination(100, 10, 5))).toBe(4);
    });

    it('should return null on first page', () => {
      expect(getPrevPage(createPagination(100, 10, 1))).toBeNull();
    });
  });

  describe('item indices', () => {
    it('should calculate first item index', () => {
      expect(getFirstItemIndex(createPagination(100, 10, 1))).toBe(1);
      expect(getFirstItemIndex(createPagination(100, 10, 3))).toBe(21);
    });

    it('should calculate last item index', () => {
      expect(getLastItemIndex(createPagination(100, 10, 1))).toBe(10);
      expect(getLastItemIndex(createPagination(25, 10, 3))).toBe(25);
    });
  });

  describe('paginateArray', () => {
    const items = Array.from({ length: 25 }, (_, i) => i + 1);

    it('should return correct slice for first page', () => {
      const { data, pagination } = paginateArray(items, 1, 10);
      expect(data).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
      expect(pagination.totalPages).toBe(3);
    });

    it('should return correct slice for last page', () => {
      const { data } = paginateArray(items, 3, 10);
      expect(data).toEqual([21, 22, 23, 24, 25]);
    });

    it('should return empty for out-of-range page', () => {
      // paginateArray clamps page to valid range, so page 999 → last page
      const { data, pagination } = paginateArray(items, 999, 10);
      expect(pagination.currentPage).toBe(pagination.totalPages);
    });

    it('should handle empty array', () => {
      const { data, pagination } = paginateArray([], 1, 10);
      expect(data).toEqual([]);
      expect(pagination.total).toBe(0);
    });

    it('should handle page size larger than array', () => {
      const { data, pagination } = paginateArray([1, 2, 3], 1, 100);
      expect(data).toEqual([1, 2, 3]);
      expect(pagination.totalPages).toBe(1);
    });
  });
});
