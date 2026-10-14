import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { SECTION_LABELS, type Section } from "../lib/view";

interface TourStep {
  title: string;
  body: string;
  section?: Section;
}

const SECTION_STEPS: Section[] = ["import", "history", "clients", "billing", "settings"];

const SECTION_BODY: Record<Section, string> = {
  import:
    "Conecta tus clases de Google Calendar. Elige el periodo, pulsa Importar y revisa las clases detectadas. Al aceptarlas, se sumarán al Histórico y a los importes por cliente.",
  history:
    "Consulta las clases y los ingresos por mes y por cliente, compáralos con el mes anterior y exporta a CSV cuando lo necesites.",
  clients:
    "Aquí ves cada alumno con sus clases e importes acumulados. Puedes ponerle un nombre, ajustar su tarifa (con histórico por mes) y emitir su factura.",
  billing:
    "Rellena tus datos fiscales como emisor y consulta o vuelve a exportar las facturas que ya has emitido.",
  settings:
    "Configura las tarifas globales (normal y compartida) y la moneda, y haz copias de seguridad de todos tus datos.",
};

const STEPS: TourStep[] = [
  {
    title: "Bienvenida a Facturita",
    body: "Te enseñamos en un minuto cómo funciona, sección por sección. Puedes saltar la guía cuando quieras.",
  },
  ...SECTION_STEPS.map((section) => ({
    title: SECTION_LABELS[section],
    body: SECTION_BODY[section],
    section,
  })),
  {
    title: "¡Todo listo!",
    body: "Ya puedes empezar a importar tus clases. Si quieres repasar esta guía, ábrela desde el menú de tu cuenta, arriba a la derecha.",
  },
];

const SPOT_PAD = 8;
const TIP_GAP = 14;
const EDGE = 12;

export function OnboardingTour({
  open,
  onNavigate,
  onFinish,
}: {
  open: boolean;
  onNavigate: (section: Section) => void;
  onFinish: () => void;
}) {
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [tipPos, setTipPos] = useState<{ top: number; left: number } | null>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const primaryRef = useRef<HTMLButtonElement>(null);

  const step = STEPS[index];
  const isLast = index === STEPS.length - 1;
  const isFirst = index === 0;

  const measure = useCallback(() => {
    const current = STEPS[index];
    if (!current.section) {
      setRect(null);
      return;
    }
    const el = document.querySelector(`[data-section="${current.section}"]`);
    setRect(el ? el.getBoundingClientRect() : null);
  }, [index]);

  useEffect(() => {
    if (!open) return;
    setIndex(0);
  }, [open]);

  useLayoutEffect(() => {
    if (!open) return;
    measure();
  }, [open, measure]);

  useEffect(() => {
    if (!open) return;
    const onResize = () => measure();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [open, measure]);

  useEffect(() => {
    if (!open) return;
    const current = STEPS[index];
    if (current.section) onNavigate(current.section);
  }, [open, index, onNavigate]);

  useLayoutEffect(() => {
    if (!open) return;
    const tip = tipRef.current;
    if (!tip || !rect) {
      setTipPos(null);
      return;
    }
    const { offsetWidth: w, offsetHeight: h } = tip;
    let top = rect.bottom + TIP_GAP;
    if (top + h > window.innerHeight - EDGE) {
      top = rect.top - TIP_GAP - h;
    }
    if (top < EDGE) top = EDGE;
    let left = rect.left + rect.width / 2 - w / 2;
    left = Math.max(EDGE, Math.min(left, window.innerWidth - w - EDGE));
    setTipPos({ top, left });
  }, [open, rect]);

  useEffect(() => {
    if (!open) return;
    primaryRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onFinish();
      } else if (event.key === "ArrowRight") {
        setIndex((current) => Math.min(current + 1, STEPS.length - 1));
      } else if (event.key === "ArrowLeft") {
        setIndex((current) => Math.max(current - 1, 0));
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onFinish]);

  if (!open) return null;

  const centered = !rect;

  return (
    <div className="tour-overlay" role="presentation">
      {rect && (
        <div
          className="tour-spotlight"
          style={{
            top: rect.top - SPOT_PAD,
            left: rect.left - SPOT_PAD,
            width: rect.width + SPOT_PAD * 2,
            height: rect.height + SPOT_PAD * 2,
          }}
        />
      )}
      <div
        ref={tipRef}
        className={centered ? "tour-tip centered" : "tour-tip"}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-title"
        style={tipPos ? { top: tipPos.top, left: tipPos.left } : undefined}
      >
        <div className="tour-step-count">
          Paso {index + 1} de {STEPS.length}
        </div>
        <h2 id="tour-title">{step.title}</h2>
        <p className="muted">{step.body}</p>
        <div className="tour-dots" aria-hidden>
          {STEPS.map((dotStep, dotIndex) => (
            <span key={dotStep.title} className={dotIndex === index ? "dot active" : "dot"} />
          ))}
        </div>
        <div className="tour-actions">
          {!isLast && (
            <button type="button" className="link" onClick={onFinish}>
              Saltar
            </button>
          )}
          <div className="tour-actions-end">
            <button
              type="button"
              className="ghost"
              disabled={isFirst}
              onClick={() => setIndex((current) => Math.max(current - 1, 0))}
            >
              Anterior
            </button>
            <button
              ref={primaryRef}
              type="button"
              onClick={() => (isLast ? onFinish() : setIndex((current) => current + 1))}
            >
              {isLast ? "Empezar" : "Siguiente"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
