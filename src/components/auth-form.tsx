"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowRight, Eye, EyeOff, ShieldCheck } from "lucide-react";
import { Button } from "./ui";
export function AuthForm({
  mode,
}: {
  mode: "login" | "register" | "onboarding";
}) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [show, setShow] = useState(false);
  const register = mode === "register";
  const onboarding = mode === "onboarding";
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError("");
    try {
      const data = Object.fromEntries(new FormData(e.currentTarget));
      const response = await fetch(
        onboarding ? "/api/onboarding" : `/api/auth/${mode}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        },
      );
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      router.push(result.redirect);
      router.refresh();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Confira sua conexão e tente novamente.",
      );
    } finally {
      setPending(false);
    }
  }
  return (
    <form className="auth-form" onSubmit={submit}>
      {onboarding ? (
        <>
          <label>
            Nome da revenda
            <input
              name="tradeName"
              placeholder="Como sua revenda é conhecida?"
              required
              maxLength={100}
              autoComplete="organization"
            />
          </label>
          <div className="form-grid">
            <label>
              CNPJ
              <input
                name="cnpj"
                placeholder="00.000.000/0001-00"
                required
                maxLength={18}
                inputMode="numeric"
              />
            </label>
            <label>
              Telefone
              <input
                name="phone"
                placeholder="(11) 99999-9999"
                required
                maxLength={20}
                autoComplete="tel"
              />
            </label>
          </div>
          <div className="form-grid">
            <label>
              Cidade
              <input
                name="city"
                placeholder="Sua cidade"
                required
                autoComplete="address-level2"
              />
            </label>
            <label>
              Estado
              <select name="state" required defaultValue="">
                <option value="" disabled>
                  Selecione
                </option>
                {"AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO"
                  .split(" ")
                  .map((s) => (
                    <option key={s}>{s}</option>
                  ))}
              </select>
            </label>
          </div>
        </>
      ) : (
        <>
          {register && (
            <label>
              Seu nome
              <input
                name="name"
                required
                minLength={2}
                maxLength={100}
                placeholder="Nome e sobrenome"
                autoComplete="name"
              />
            </label>
          )}
          <label>
            E-mail
            <input
              name="email"
              type="email"
              required
              placeholder="voce@suarevenda.com.br"
              autoComplete="email"
            />
          </label>
          <label>
            Senha
            <div className="password-field">
              <input
                name="password"
                type={show ? "text" : "password"}
                minLength={12}
                maxLength={128}
                required
                placeholder={
                  register
                    ? "Crie uma senha com 12 caracteres ou mais"
                    : "Sua senha"
                }
                autoComplete={register ? "new-password" : "current-password"}
              />
              <button
                type="button"
                aria-label={show ? "Ocultar senha" : "Mostrar senha"}
                onClick={() => setShow(!show)}
              >
                {show ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </label>
        </>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <Button type="submit" disabled={pending}>
        {pending
          ? "Aguarde…"
          : onboarding
            ? "Começar meu período de teste"
            : register
              ? "Criar minha conta"
              : "Entrar na AutoWeb"}
        <ArrowRight size={18} />
      </Button>
      {!onboarding && (
        <p className="auth-switch">
          {register ? "Já tem uma conta?" : "Ainda não usa a AutoWeb?"}{" "}
          <Link href={register ? "/entrar" : "/criar-conta"}>
            {register ? "Entrar" : "Experimente grátis"}
          </Link>
        </p>
      )}
      <div className="secure-note">
        <ShieldCheck size={15} />
        {register || onboarding
          ? "7 dias grátis · Até 5 veículos · Sem cartão"
          : "Acesso seguro à sua revenda"}
      </div>
    </form>
  );
}
