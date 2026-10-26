import Image from "next/image";
import { signOut } from "@/app/actions";
import { createClient } from "@/lib/supabase/server";

export async function AppHeader() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <header className="border-b border-line bg-white">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-6 py-3">
        <div className="flex items-center gap-4">
          <Image src="/logo-firplak.png" alt="FIRPLAK" width={1024} height={350} className="h-auto w-24" />
          <span className="h-6 w-px bg-line" aria-hidden />
          <span className="text-sm font-semibold text-brand">Inventarios</span>
        </div>

        <div className="flex items-center gap-4">
          <span className="hidden text-sm text-brand-secondary sm:inline">{user?.email}</span>
          <form action={signOut}>
            <button
              type="submit"
              className="rounded-lg border border-line px-3 py-1.5 text-sm font-medium text-brand transition hover:bg-cream"
            >
              Salir
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
