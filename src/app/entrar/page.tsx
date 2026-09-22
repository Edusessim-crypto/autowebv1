import { AuthLayout } from "@/components/auth-layout";
import { AuthForm } from "@/components/auth-form";
export default function Login() {
  return (
    <AuthLayout>
      <h1>Bom ter você de volta.</h1>
      <p className="auth-subtitle">Entre para acompanhar sua revenda.</p>
      <AuthForm mode="login" />
    </AuthLayout>
  );
}
