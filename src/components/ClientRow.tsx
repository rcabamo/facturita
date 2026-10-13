import type { ReactNode } from "react";

export function ClientRow({
  name,
  email,
  classes,
  amount,
  open,
  onToggle,
  stopNamePropagation = false,
}: {
  name: ReactNode;
  email: string;
  classes: number;
  amount: string;
  open: boolean;
  onToggle: () => void;
  stopNamePropagation?: boolean;
}) {
  return (
    <tr
      className="client-row"
      tabIndex={0}
      aria-expanded={open}
      onClick={onToggle}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onToggle();
        }
      }}
    >
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: solo detiene la propagación del clic, no es una acción */}
      <td onClick={stopNamePropagation ? (event) => event.stopPropagation() : undefined}>{name}</td>
      <td className="muted small">{email}</td>
      <td className="num strong">{classes}</td>
      <td className="num strong">{amount}</td>
    </tr>
  );
}
