import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Squad Manager",
  description: "Manager de futebol — monte elenco, dispute ligas e conquiste títulos.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body className="min-h-screen font-sans antialiased">
        <div className="mx-auto min-h-screen max-w-5xl px-4 py-6">{children}</div>
      </body>
    </html>
  );
}
