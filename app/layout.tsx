export const metadata = {
  title: "Assistente IA — Terminal Novo Remanso | AGEO",
  description: "Assistente operacional inteligente para registro e consulta de operações portuárias",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body style={{ margin: 0, padding: 0 }}>{children}</body>
    </html>
  );
}
