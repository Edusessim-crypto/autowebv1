"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <div className="standalone-state">
      <h1>Não foi possível abrir esta página.</h1>
      <p>Seus dados continuam salvos. Tente novamente.</p>
      <button className="button primary" onClick={reset}>
        Tentar novamente
      </button>
    </div>
  );
}
