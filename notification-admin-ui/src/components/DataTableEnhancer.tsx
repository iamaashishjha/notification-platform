import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

const cellText = (row: HTMLTableRowElement, index: number) => (row.cells[index]?.textContent || '').trim();
function compare(a: string, b: string) {
  const an = Number(a.replace(/[^0-9.-]/g, '')), bn = Number(b.replace(/[^0-9.-]/g, ''));
  if (a && b && Number.isFinite(an) && Number.isFinite(bn)) return an - bn;
  const ad = Date.parse(a), bd = Date.parse(b);
  if (!Number.isNaN(ad) && !Number.isNaN(bd) && /[-/:T]/.test(a + b)) return ad - bd;
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

export function DataTableEnhancer() {
  const location = useLocation();
  useEffect(() => {
    const cleanups: (() => void)[] = [];
    const enhance = (table: HTMLTableElement) => {
      if (table.dataset.datatable || !table.tHead || !table.tBodies[0]) return;
      const headers = Array.from(table.tHead.rows[0]?.cells || []); if (!headers.length) return;
      table.dataset.datatable = 'true';
      const host = table.parentElement!;
      const panel = host.parentElement;
      panel?.querySelectorAll<HTMLElement>(':scope > .datatable-tools').forEach((node) => node.remove());
      const tools = document.createElement('div'); tools.className = 'datatable-tools';
      tools.innerHTML = `<div class="datatable-search"><span>⌕</span><input aria-label="Filter table" placeholder="Search this list…" /></div><label class="datatable-size">Rows <input data-size type="number" min="1" max="100" value="25" aria-label="Rows per page" /></label><span class="datatable-count"></span><button type="button" data-prev>Previous</button><button type="button" data-next>Next</button>`;
      panel?.insertBefore(tools, host);
      const input = tools.querySelector<HTMLInputElement>('.datatable-search input')!, size = tools.querySelector<HTMLInputElement>('[data-size]')!; let page = 1, sort = -1, direction = 1;
      const render = () => {
        const rows = Array.from(table.tBodies[0].rows), query = input.value.toLowerCase().trim();
        rows.forEach((row) => row.hidden = !!query && !row.textContent?.toLowerCase().includes(query));
        const matching = rows.filter((row) => !row.hidden);
        if (sort >= 0) matching.sort((a,b)=>compare(cellText(a,sort),cellText(b,sort))*direction).forEach((row)=>table.tBodies[0].appendChild(row));
        const perPage=Number(size.value), pages=Math.max(1,Math.ceil(matching.length/perPage)); page=Math.min(page,pages);
        matching.forEach((row,index)=>row.hidden=index<(page-1)*perPage||index>=page*perPage);
        tools.querySelector('.datatable-count')!.textContent=`${matching.length?(page-1)*perPage+1:0}–${Math.min(page*perPage,matching.length)} of ${matching.length}`;
        (tools.querySelector('[data-prev]') as HTMLButtonElement).disabled=page<=1; (tools.querySelector('[data-next]') as HTMLButtonElement).disabled=page>=pages;
      };
      input.addEventListener('input',()=>{page=1;render()}); size.addEventListener('change',()=>{page=1;render()});
      tools.querySelector('[data-prev]')!.addEventListener('click',()=>{page--;render()}); tools.querySelector('[data-next]')!.addEventListener('click',()=>{page++;render()});
      headers.forEach((header,index)=>{if(/actions?/i.test(header.textContent||'')||!header.textContent?.trim())return;header.classList.add('datatable-sortable');header.title='Sort by this column';header.addEventListener('click',()=>{direction=sort===index?-direction:1;sort=index;headers.forEach((h)=>h.removeAttribute('data-sort'));header.dataset.sort=direction===1?'asc':'desc';render()})});
      render(); cleanups.push(()=>{tools.remove();delete table.dataset.datatable;Array.from(table.tBodies[0].rows).forEach((r)=>r.hidden=false)});
    };
    const scan=()=>{
      document.querySelectorAll<HTMLElement>('main .datatable-tools').forEach((tools) => {
        const next = tools.nextElementSibling;
        if (!next?.querySelector('table')) tools.remove();
      });
      document.querySelectorAll<HTMLTableElement>('main table').forEach(enhance);
    }; scan();
    const observer=new MutationObserver(scan), main=document.querySelector('main'); if(main)observer.observe(main,{childList:true,subtree:true});
    return()=>{observer.disconnect();cleanups.forEach((cleanup)=>cleanup())};
  },[location.pathname]);
  return null;
}
