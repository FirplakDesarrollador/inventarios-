"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const ERRORES: Record<string, string> = {
  invalid_credentials: "Correo o contraseña incorrectos.",
  email_not_confirmed: "Debes confirmar tu correo antes de ingresar.",
  over_request_rate_limit: "Demasiados intentos. Espera un momento e inténtalo de nuevo.",
};

export async function signIn(
  _prevState: { error: string | null },
  formData: FormData,
): Promise<{ error: string | null }> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: (error.code && ERRORES[error.code]) ?? error.message };
  }

  redirect("/");
}
