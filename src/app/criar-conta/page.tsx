import { AuthLayout } from "@/components/auth-layout";
import { AuthForm } from "@/components/auth-form";
export default function Register() {
  return (
    <AuthLayout step="01 / 02 · SEU ACESSO">
      <h1>
        Seu próximo passo
        <br />
        começa aqui.
      </h1>
      <p className="auth-subtitle">Crie sua conta e experimente a AutoWeb.</p>
      <AuthForm mode="register" />
    </AuthLayout>
  );
}
