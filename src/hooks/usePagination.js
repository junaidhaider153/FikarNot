import { useEffect, useMemo, useState } from "react";

/**
 * Paginates an array client-side. Resets to page 1 whenever the list length
 * or its first item's identity changes (i.e. a new filter/sort was applied),
 * so filtering never leaves the user stranded on an empty page 4.
 */
export function usePagination(list, pageSize = 10) {
  const [page, setPage] = useState(1);
  const total = list.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  const resetKey = `${total}:${list[0]?.id ?? ""}`;
  useEffect(() => {
    setPage(1);
  }, [resetKey]);

  const safePage = Math.min(page, pageCount);
  const start = (safePage - 1) * pageSize;
  const pageItems = useMemo(() => list.slice(start, start + pageSize), [list, start, pageSize]);

  return {
    page: safePage,
    pageCount,
    pageItems,
    total,
    setPage,
    start: total === 0 ? 0 : start + 1,
    end: Math.min(start + pageSize, total),
  };
}
