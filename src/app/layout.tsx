import type { Metadata } from "next";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/poppins/500.css";
import "@fontsource/poppins/600.css";
import "@fontsource/poppins/700.css";
import "./globals.css";
export const metadata: Metadata = {
  title: { default: "AutoWeb · Gestão de revendas", template: "%s · AutoWeb" },
  description: "A infraestrutura digital da sua revenda.",
  robots: { index: false, follow: false },
  icons: { icon: "/brand/autoweb.png" },
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
