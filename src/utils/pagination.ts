import { z } from "zod";

export const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(25)
});

export const getPagination = (query: unknown) => {
  const { page, limit } = paginationSchema.parse(query);
  return {
    page,
    limit,
    skip: (page - 1) * limit
  };
};

export const paginated = <T>(items: T[], total: number, page: number, limit: number) => ({
  items,
  pagination: {
    page,
    limit,
    total,
    pages: Math.ceil(total / limit)
  }
});
