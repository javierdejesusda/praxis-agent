"use client";

import { useMemo, useState } from "react";

export type Column<Row> = {
  id: string;
  header: string;
  accessor: (row: Row) => React.ReactNode;
  align?: "left" | "right";
  width?: string;
  sortable?: boolean;
  sortValue?: (row: Row) => number | string;
};

export type DataTableProps<Row> = {
  rows: Row[];
  columns: Column<Row>[];
  rowKey: (row: Row) => string;
  emptyLabel?: string;
  onRowClick?: (row: Row) => void;
  initialSort?: { id: string; dir: "asc" | "desc" };
};

export function DataTable<Row>({
  rows,
  columns,
  rowKey,
  emptyLabel = "No data",
  onRowClick,
  initialSort,
}: DataTableProps<Row>) {
  const [sort, setSort] = useState(initialSort);

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.id === sort.id);
    if (!col?.sortable || !col.sortValue) return rows;
    const getter = col.sortValue;
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const av = getter(a);
      const bv = getter(b);
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
  }, [rows, sort, columns]);

  if (rows.length === 0) {
    return (
      <div className="py-12 text-center text-[13px] text-[color:var(--color-muted)]">
        {emptyLabel}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="data-table">
        <thead>
          <tr>
            {columns.map((c) => (
              <th
                key={c.id}
                className={`${c.align === "right" ? "num" : ""} ${c.sortable ? "cursor-pointer" : ""}`}
                style={c.width ? { width: c.width } : undefined}
                onClick={() => {
                  if (!c.sortable) return;
                  setSort((prev) =>
                    prev?.id === c.id
                      ? { id: c.id, dir: prev.dir === "asc" ? "desc" : "asc" }
                      : { id: c.id, dir: "desc" },
                  );
                }}
              >
                <span className={c.sortable ? "cursor-pointer select-none" : ""}>
                  {c.header}
                  {c.sortable && sort?.id === c.id && (
                    <span className="ml-1 text-[color:var(--color-accent)]">{sort.dir === "asc" ? "\u25B2" : "\u25BC"}</span>
                  )}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => (
            <tr
              key={rowKey(r)}
              onClick={onRowClick ? () => onRowClick(r) : undefined}
              className={onRowClick ? "cursor-pointer" : ""}
            >
              {columns.map((c) => (
                <td key={c.id} className={c.align === "right" ? "num" : ""}>
                  {c.accessor(r)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
