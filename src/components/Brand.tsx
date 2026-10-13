import logo from "../assets/logo.svg";

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className={compact ? "brand compact" : "brand"}>
      <img src={logo} alt="Facturita" className="brand-logo" />
      <div className="brand-text">
        <span className="brand-name">Facturita</span>
        <span className="brand-sub">Clases de inglés · por mes y cliente</span>
      </div>
    </div>
  );
}
