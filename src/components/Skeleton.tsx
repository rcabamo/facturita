export function SkeletonRows({ rows, cols }: { rows: number; cols: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, row) => (
        <tr key={row} className="skeleton-row" aria-hidden>
          {Array.from({ length: cols }).map((_, col) => (
            <td key={col}>
              <span className="skeleton" />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}
