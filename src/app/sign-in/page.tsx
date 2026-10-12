import { signIn } from "@/auth";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { CredentialsSignin } from "next-auth";
import { redirect } from "next/navigation";

function rejected(error: unknown) {
  return (
    error instanceof CredentialsSignin ||
    (typeof error === "object" &&
      error !== null &&
      "type" in error &&
      error.type === "CredentialsSignin")
  );
}

export const dynamic = "force-dynamic";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  const ready = Boolean(
    process.env.AUTH_SECRET && process.env.DASHBOARD_EMAIL && process.env.DASHBOARD_PASSWORD,
  );
  const failed = params.error === "CredentialsSignin";

  return (
    <main className="mx-auto flex min-h-full w-full max-w-md flex-1 flex-col justify-center px-6 py-16">
      <p className="text-xs uppercase tracking-[0.18em] text-pine">TaxGPT</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">META REPORTING DASHBOARD</h1>
      <p className="mt-4 text-muted">Internal marketing numbers. Use your TaxGPT email.</p>
      {failed ? (
        <p className="mt-4 text-sm text-down">That email or password is wrong.</p>
      ) : null}
      {ready ? (
        <form
          className="mt-8 flex flex-col gap-4"
          action={async (formData) => {
            "use server";
            try {
              await signIn("credentials", {
                email: formData.get("email"),
                password: formData.get("password"),
                redirectTo: "/",
              });
            } catch (error) {
              if (isRedirectError(error)) throw error;
              if (rejected(error)) redirect("/sign-in?error=CredentialsSignin");
              throw error;
            }
          }}
        >
          <label className="flex flex-col gap-2 text-sm">
            Email
            <input
              className="h-11 rounded-md border border-line bg-card px-3"
              name="email"
              type="email"
              autoComplete="username"
              required
            />
          </label>
          <label className="flex flex-col gap-2 text-sm">
            Password
            <input
              className="h-11 rounded-md border border-line bg-card px-3"
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />
          </label>
          <button className="mt-2 h-11 rounded-md bg-pine px-5 text-sm text-white" type="submit">
            Sign in
          </button>
        </form>
      ) : (
        <p className="mt-8 text-sm text-muted">
          Add DASHBOARD_EMAIL and DASHBOARD_PASSWORD before signing in.
        </p>
      )}
    </main>
  );
}
