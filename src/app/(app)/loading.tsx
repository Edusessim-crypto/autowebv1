export default function Loading() {
  return (
    <div aria-label="Carregando conteúdo" role="status">
      <div className="skeleton skeleton-title" />
      <div className="metrics">
        {[1, 2, 3, 4].map((i) => (
          <div className="skeleton skeleton-card" key={i} />
        ))}
      </div>
      <div className="skeleton skeleton-panel" />
    </div>
  );
}
