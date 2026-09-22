import { CarFront, Layers3, PanelsTopLeft, ArrowUpRight } from "lucide-react";
import { AutoWebLogo } from "./ui";
export function AuthLayout({
  children,
  step,
}: {
  children: React.ReactNode;
  step?: string;
}) {
  return (
    <div className="auth-page">
      <aside className="auth-story">
        <AutoWebLogo large />
        <div className="auth-story-content">
          <div className="eyebrow">A INFRAESTRUTURA DIGITAL DA REVENDA</div>
          <h1>
            Sua operação.
            <br />
            Seu próximo passo.
            <br />
            <span>Tudo conectado.</span>
          </h1>
          <p>
            O veículo entra uma vez.
            <br />
            Sua revenda ganha novas possibilidades.
          </p>
          <div className="flow-visual">
            <div>
              <CarFront />
              <span>Estoque</span>
            </div>
            <span className="flow-line" />
            <div>
              <Layers3 />
              <span>Conteúdo</span>
            </div>
            <span className="flow-line" />
            <div>
              <PanelsTopLeft />
              <span>Vendas</span>
            </div>
          </div>
        </div>
        <div className="auth-story-footer">
          TECNOLOGIA PARA QUEM MOVE NEGÓCIOS
          <ArrowUpRight size={20} />
        </div>
      </aside>
      <main className="auth-main">
        <div className="auth-mobile-logo">
          <AutoWebLogo />
        </div>
        <div className="auth-box">
          {step && <span className="eyebrow">{step}</span>}
          {children}
        </div>
        <footer>AutoWeb · Tecnologia para revendas de veículos.</footer>
      </main>
    </div>
  );
}
