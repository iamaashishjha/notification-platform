export type Principal = {
  user_id: string;
  tenant_id?: string;
  email: string;
  is_platform_admin: boolean;
  permissions: string[];
};

export type ApiList<T> = {
  data: T[];
  meta?: PaginationMeta;
};

export type PaginationMeta = {
  page: number;
  per_page: number;
  total: number;
  total_pages: number;
};
