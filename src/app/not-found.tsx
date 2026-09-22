import Link from "next/link";
export default function NotFound() {
  return (
    <div className="standalone-state">
      <span className="eyebrow">404</span>
      <h1>Página não encontrada.</h1>
      <p>O conteúdo não existe ou não está disponível para sua revenda.</p>
      <Link className="button primary" href="/painel">
        Voltar ao painel
      </Link>
    </div>
  );
}
