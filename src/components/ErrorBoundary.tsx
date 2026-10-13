import { Component, type ErrorInfo, type ReactNode } from "react";

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Error no controlado:", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="center">
          <div className="card form">
            <h1>Algo ha fallado</h1>
            <p className="muted">
              Se produjo un error inesperado. Puedes recargar la aplicación para continuar; tus
              datos no se han modificado.
            </p>
            <pre className="error-detail">{String(this.state.error)}</pre>
            <button type="button" onClick={() => window.location.reload()}>
              Recargar
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
