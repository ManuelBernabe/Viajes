import { Component, type ErrorInfo, type ReactNode } from 'react';

interface State {
  error: Error | null;
}

/** Si una pantalla falla, en vez de quedarse en negro enseña el error y permite volver a Inicio o recargar. */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Fallo en la pantalla', error, info.componentStack);
  }

  render() {
    if (!this.state.error) {
      return this.props.children;
    }
    return (
      <main className="page no-tabs">
        <div className="topbar">
          <h1>Algo ha fallado</h1>
        </div>
        <section className="card">
          <p>Esta pantalla no se ha podido mostrar. Tus datos siguen guardados.</p>
          <p className="muted small" style={{ wordBreak: 'break-word' }}>
            {this.state.error.name}: {this.state.error.message}
          </p>
          <div className="actions">
            <a className="btn primary" href="/">
              Volver a Inicio
            </a>
            <button className="btn" type="button" onClick={() => location.reload()}>
              Recargar
            </button>
          </div>
        </section>
      </main>
    );
  }
}
