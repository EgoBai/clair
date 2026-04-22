import React, { useCallback } from 'react';

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

// 使用React.memo包装分页组件
const Pagination: React.FC<PaginationProps> = React.memo(({ 
  currentPage, 
  totalPages, 
  onPageChange 
}) => {
  // removed: console.log
  
  // 使用useCallback避免函数重新创建
  const handlePrevPage = useCallback(() => {
    onPageChange(Math.max(1, currentPage - 1));
  }, [currentPage, onPageChange]);

  const handleNextPage = useCallback(() => {
    onPageChange(Math.min(totalPages, currentPage + 1));
  }, [currentPage, totalPages, onPageChange]);

  const handlePageClick = useCallback((page: number) => {
    onPageChange(page);
  }, [onPageChange]);

  // 生成页码数组
  const pageNumbers = React.useMemo(() => {
    const pages = [];
    const maxVisiblePages = 5;
    
    if (totalPages <= maxVisiblePages) {
      // 如果总页数小于等于5，显示所有页码
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else if (currentPage <= 3) {
      // 当前页在前3页，显示1-5页
      for (let i = 1; i <= maxVisiblePages; i++) {
        pages.push(i);
      }
    } else if (currentPage >= totalPages - 2) {
      // 当前页在后3页，显示最后5页
      for (let i = totalPages - 4; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      // 当前页在中间，显示当前页前后各2页
      for (let i = currentPage - 2; i <= currentPage + 2; i++) {
        pages.push(i);
      }
    }
    
    return pages;
  }, [currentPage, totalPages]);

  if (totalPages <= 1) {
    return null;
  }

  return (
    <div className="pagination">
      <button
        className="page-btn"
        onClick={handlePrevPage}
        disabled={currentPage === 1}
      >
        上一页
      </button>
      
      <div className="page-numbers">
        {pageNumbers.map(pageNum => (
          <button
            key={pageNum}
            className={`page-number ${currentPage === pageNum ? 'active' : ''}`}
            onClick={() => handlePageClick(pageNum)}
          >
            {pageNum}
          </button>
        ))}
      </div>
      
      <button
        className="page-btn"
        onClick={handleNextPage}
        disabled={currentPage === totalPages}
      >
        下一页
      </button>
      
      <div className="page-info">
        第 {currentPage} 页，共 {totalPages} 页
      </div>
    </div>
  );
}, (prevProps, nextProps) => {
  // 只有当当前页或总页数发生变化时才重新渲染
  return (
    prevProps.currentPage === nextProps.currentPage &&
    prevProps.totalPages === nextProps.totalPages
  );
});

export default Pagination;