import type { RefObject } from "react";
import type { Updater } from "../lib/useUpdater";
import type { Theme } from "../lib/view";
import { HelpIcon, LogoutIcon, MonitorIcon, MoonIcon, RefreshIcon, SunIcon } from "./icons";

export function AccountMenu({
  email,
  open,
  onToggle,
  theme,
  onThemeChange,
  updater,
  onCheckUpdates,
  onShowTour,
  onDisconnect,
  version,
  containerRef,
}: {
  email: string | null;
  open: boolean;
  onToggle: () => void;
  theme: Theme;
  onThemeChange: (theme: Theme) => void;
  updater: Updater;
  onCheckUpdates: () => void;
  onShowTour: () => void;
  onDisconnect: () => void;
  version: string;
  containerRef: RefObject<HTMLDivElement | null>;
}) {
  return (
    <div className="account-menu" ref={containerRef}>
      <button
        type="button"
        className="account"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={onToggle}
      >
        {email ?? "Cuenta"}
        <span className="caret-sm" aria-hidden>
          ▾
        </span>
      </button>
      {open && (
        <div className="menu" role="menu">
          <div className="menu-label" id="theme-label">
            Tema
          </div>
          {/* biome-ignore lint/a11y/useSemanticElements: agrupación de botones de tema dentro del menú */}
          <div className="menu-theme" role="group" aria-labelledby="theme-label">
            {(
              [
                ["system", "Sistema"],
                ["light", "Claro"],
                ["dark", "Oscuro"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="menuitemradio"
                aria-checked={theme === value}
                className={theme === value ? "menu-item active" : "menu-item"}
                onClick={() => onThemeChange(value)}
              >
                <span className="menu-item-icon">
                  {value === "system" ? (
                    <MonitorIcon size={15} />
                  ) : value === "light" ? (
                    <SunIcon size={15} />
                  ) : (
                    <MoonIcon size={15} />
                  )}
                </span>
                {label}
                {theme === value && (
                  <span className="menu-check" aria-hidden>
                    ✓
                  </span>
                )}
              </button>
            ))}
          </div>
          {/* biome-ignore lint/a11y/useSemanticElements: separador visual del menú */}
          <div className="menu-sep" role="separator" />
          <button type="button" role="menuitem" className="menu-item" onClick={onShowTour}>
            <span className="menu-item-icon">
              <HelpIcon size={15} />
            </span>
            Ver guía
          </button>
          <button
            type="button"
            role="menuitem"
            className="menu-item"
            disabled={updater.checking}
            onClick={onCheckUpdates}
          >
            <span className="menu-item-icon">
              <RefreshIcon size={15} />
            </span>
            {updater.checking ? "Buscando…" : "Buscar actualizaciones"}
          </button>
          <button type="button" role="menuitem" className="menu-item danger" onClick={onDisconnect}>
            <span className="menu-item-icon">
              <LogoutIcon size={15} />
            </span>
            Desconectar
          </button>
          {version && <div className="menu-version">Facturita v{version}</div>}
        </div>
      )}
    </div>
  );
}
