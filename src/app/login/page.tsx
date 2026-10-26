"use client";

import Image from "next/image";
import { useActionState } from "react";
import { signIn } from "./actions";

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(signIn, { error: null });

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <aside className="relative hidden overflow-hidden bg-brand p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <p className="text-xs font-semibold tracking-[0.3em] text-white/60 uppercase">Costos e Inventarios</p>

        <div>
          <h2 className="max-w-md text-4xl leading-tight font-semibold">
            Inventarios cíclicos y existencias en un solo tablero.
          </h2>
          <p className="mt-4 max-w-md text-white/70">
            Resultados por bodega desde SharePoint y saldos de SAP, actualizados para el equipo de inventarios.
          </p>
        </div>

        <p className="text-sm text-white/50">FIRPLAK · inspirando hogares</p>

        <div aria-hidden className="absolute -right-24 -bottom-24 size-96 rounded-full border-[48px] border-brand-secondary/30" />
      </aside>

      <main className="flex items-center justify-center bg-cream px-4 py-12">
        <div className="w-full max-w-sm">
          <Image
            src="/logo-firplak.png"
            alt="FIRPLAK"
            width={1024}
            height={350}
            priority
            className="mx-auto mb-10 h-auto w-48"
          />

          <form action={formAction} className="rounded-2xl border border-line bg-white p-8 shadow-sm">
            <h1 className="text-xl font-semibold text-brand">Inventarios</h1>
            <p className="mt-1 mb-6 text-sm text-brand-secondary">Ingresa con tu cuenta corporativa</p>

            <label className="mb-1 block text-sm font-medium text-ink" htmlFor="email">
              Correo
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              placeholder="nombre@firplak.com"
              className="mb-4 w-full rounded-lg border border-line bg-white px-3 py-2.5 text-sm text-ink placeholder:text-brand-secondary/60 focus:border-brand focus:ring-2 focus:ring-brand/15 focus:outline-none"
            />

            <label className="mb-1 block text-sm font-medium text-ink" htmlFor="password">
              Contraseña
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              className="mb-4 w-full rounded-lg border border-line bg-white px-3 py-2.5 text-sm text-ink focus:border-brand focus:ring-2 focus:ring-brand/15 focus:outline-none"
            />

            {state.error && (
              <p role="alert" className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                {state.error}
              </p>
            )}

            <button
              type="submit"
              disabled={pending}
              className="w-full rounded-lg bg-brand px-3 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-dark disabled:opacity-60"
            >
              {pending ? "Ingresando..." : "Ingresar"}
            </button>
          </form>

          <p className="mt-6 text-center text-xs text-brand-secondary">
            ¿Sin acceso? Solicítalo a la Mesa de Ayuda de TI.
          </p>
        </div>
      </main>
    </div>
  );
}
