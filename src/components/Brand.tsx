import logo from "../assets/logo.svg";

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className={compact ? "brand compact" : "brand"}>
      <img src={logo} alt="Facturita" className="brand-logo" />
      <div className="brand-text">
        <span className="brand-name">Facturita</span>
        <span className="brand-sub">Clases, ingresos y facturas</span>
      </div>
    </div>
  );
}
