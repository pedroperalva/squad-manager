import Image from "next/image";
import Link from "next/link";
import { listSaves } from "@/db/save";
import SavesTable from "@/components/SavesTable";
import QuitGameButton from "@/components/QuitGameButton";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const saves = listSaves();

  return (
    <main className="ef-landing">
      <header className="mx-auto mb-10 max-w-lg text-center">
        <div className="mx-auto mb-6 flex justify-center">
          <Image
            src="/squad-manager-logo.png"
            alt="Squad Manager"
            width={220}
            height={280}
            priority
            className="h-auto w-44 drop-shadow-md sm:w-52"
          />
        </div>
        <p className="ef-landing-hero-kicker text-sm font-medium uppercase tracking-[0.25em]">
          Manager de futebol
        </p>
        <p className="ef-landing-hero-muted mx-auto mt-4 max-w-md text-base leading-relaxed">
          Comece na 4<span className="ef-landing-ordinal">ª</span> divisão, monte
          seu elenco e escreva a sua história como treinador.
        </p>
      </header>

      <div className="ef-landing-card mx-auto mb-8 max-w-md p-6 text-center">
        <h2 className="ef-landing-title mb-2 text-lg">Começar agora</h2>
        <p className="ef-landing-muted mb-5 text-sm">
          Crie um novo save ou continue uma carreira em andamento.
        </p>
        <Link href="/new" className="ef-landing-btn-primary w-full sm:w-auto">
          Novo jogo
        </Link>
        <div className="mt-4 flex justify-center">
          <QuitGameButton variant="landing" />
        </div>
      </div>

      {saves.length > 0 ? (
        <div className="mx-auto max-w-3xl">
          <SavesTable saves={saves} variant="landing" />
        </div>
      ) : (
        <p className="ef-landing-hero-muted text-center text-sm">
          Nenhum save encontrado. Inicie um novo jogo para começar sua jornada.
        </p>
      )}
    </main>
  );
}
