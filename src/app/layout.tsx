import type { Metadata, Viewport } from "next";
import "./globals.css";
import { LearnerProvider } from "@/lib/store";
import PrefsBootstrap from "@/components/PrefsBootstrap";

export const metadata: Metadata = {
  title: "Eita — Chinês que cabe no seu dia",
  description:
    "Conversinhas de mandarim na hora certa — antes dos seus compromissos, para quem já aprendeu um pouco.",
};

export const viewport: Viewport = {
  themeColor: "#faf6ef",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR" className="h-full">
      <body className="min-h-full">
        <PrefsBootstrap />
        <LearnerProvider>{children}</LearnerProvider>
      </body>
    </html>
  );
}
