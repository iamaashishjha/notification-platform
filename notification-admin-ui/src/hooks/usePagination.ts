import { useEffect, useState } from 'react';

export function usePagination(resetKeys: unknown[] = []) {
  const [page, setPage] = useState(1);
  const [perPage, setPerPageValue] = useState(25);

  useEffect(() => setPage(1), resetKeys);

  function setPerPage(value: number) {
    setPerPageValue(value);
    setPage(1);
  }

  return { page, perPage, setPage, setPerPage };
}
