export function SkeletonRows({ rows, cols }: { rows: number; cols: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, row) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: filas estáticas de un skeleton
        <tr key={row} className="skeleton-row" aria-hidden>
          {Array.from({ length: cols }).map((_, col) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: columnas estáticas de un skeleton
            <td key={col}>
              <span className="skeleton" />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}
