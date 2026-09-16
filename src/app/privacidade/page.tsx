import Shell from "@/components/Shell";
import Link from "next/link";

export const metadata = {
  title: "Privacidade — Eita",
};

// LGPD-friendly plain-language privacy note for the demo deployment.
export default function Privacidade() {
  return (
    <Shell>
      <Link href="/perfil" className="text-[1rem] text-muted underline underline-offset-4">
        ← voltar
      </Link>
      <h1 className="mt-4 text-[2rem] font-bold">Sua privacidade</h1>
      <div className="mt-5 space-y-4 text-[1.1rem] leading-relaxed">
        <p>
          O Eita foi feito para respeitar você. Aqui está, em linguagem simples,
          o que acontece com seus dados:
        </p>
        <section className="rounded-2xl bg-surface p-5 shadow-[0_4px_20px_rgba(60,40,20,0.06)]">
          <h2 className="font-semibold">📱 Seu progresso fica no seu aparelho</h2>
          <p className="mt-1.5 text-muted">
            Palavras aprendidas, histórico e preferências são guardados
            localmente. Se você entrar com seu e-mail, uma cópia é sincronizada
            com sua conta para você recuperar em outro aparelho.
          </p>
        </section>
        <section className="rounded-2xl bg-surface p-5 shadow-[0_4px_20px_rgba(60,40,20,0.06)]">
          <h2 className="font-semibold">🎤 Sua voz nunca sai do aparelho</h2>
          <p className="mt-1.5 text-muted">
            O reconhecimento e a gravação de voz acontecem no seu navegador.
            Nenhum áudio é enviado ou guardado nos nossos servidores.
          </p>
        </section>
        <section className="rounded-2xl bg-surface p-5 shadow-[0_4px_20px_rgba(60,40,20,0.06)]">
          <h2 className="font-semibold">📅 Agenda: só leitura</h2>
          <p className="mt-1.5 text-muted">
            Se você conectar o Google Agenda, o Eita apenas lê os compromissos
            do dia para preparar conversinhas. Não escrevemos, alteramos nem
            compartilhamos nada da sua agenda. Você pode desconectar a qualquer
            momento em Perfil.
          </p>
        </section>
        <section className="rounded-2xl bg-surface p-5 shadow-[0_4px_20px_rgba(60,40,20,0.06)]">
          <h2 className="font-semibold">🤖 Conversas personalizadas</h2>
          <p className="mt-1.5 text-muted">
            Para criar uma conversinha de compromisso, enviamos à IA apenas o
            título do evento, o momento do dia e palavras que você já conhece —
            nunca seu e-mail nem dados de contato.
          </p>
        </section>
        <section className="rounded-2xl bg-surface p-5 shadow-[0_4px_20px_rgba(60,40,20,0.06)]">
          <h2 className="font-semibold">🗑️ Apagar tudo</h2>
          <p className="mt-1.5 text-muted">
            Em Perfil → “Recomeçar do zero” você apaga seu progresso deste
            aparelho e da nuvem. Pela LGPD, você também pode pedir acesso,
            correção ou exclusão dos seus dados pelo mesmo caminho.
          </p>
        </section>
        <p className="text-[0.95rem] text-muted">
          Eita · demonstração de hackathon. Dúvidas? Fale com a equipe pelo
          canal do projeto.
        </p>
      </div>
    </Shell>
  );
}
