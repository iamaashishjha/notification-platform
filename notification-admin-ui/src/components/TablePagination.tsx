import type { PaginationMeta } from '../types/api';

type Props = {
  meta?: PaginationMeta;
  page: number;
  perPage: number;
  onPageChange: (page: number) => void;
  onPerPageChange: (perPage: number) => void;
};

export function TablePagination({ meta, page, perPage, onPageChange, onPerPageChange }: Props) {
  const total = meta?.total ?? 0;
  const totalPages = Math.max(1, meta?.total_pages ?? 1);
  const from = total === 0 ? 0 : (page - 1) * perPage + 1;
  const to = Math.min(page * perPage, total);

  return (
    <div className="table-pagination">
      <div className="table-pagination-summary">{from}-{to} of {total}</div>
      <label className="table-pagination-size">
        Rows
        <select value={perPage} onChange={(event) => onPerPageChange(Number(event.target.value))} aria-label="Rows per page">
          {[10, 25, 50, 100].map((size) => <option key={size} value={size}>{size}</option>)}
        </select>
      </label>
      <button type="button" onClick={() => onPageChange(page - 1)} disabled={page <= 1}>Previous</button>
      <span className="table-pagination-page">Page {page} of {totalPages}</span>
      <button type="button" onClick={() => onPageChange(page + 1)} disabled={page >= totalPages}>Next</button>
    </div>
  );
}
