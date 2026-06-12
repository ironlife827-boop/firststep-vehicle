import { AdminPanel } from "./admin-panel";

const ADMIN_KEY = "firststep2026";

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ key?: string }>;
}) {
  const params = await searchParams;

  if (params.key !== ADMIN_KEY) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-emerald-50 px-5 text-stone-950">
        <div className="w-full max-w-[430px] rounded-lg border border-emerald-100 bg-white p-6 text-center shadow-sm">
          <h1 className="text-xl font-black text-emerald-900">관리자 접근</h1>
          <p className="mt-3 text-sm font-medium text-stone-500">
            올바른 관리자 경로로 접속해 주세요.
          </p>
        </div>
      </main>
    );
  }

  return <AdminPanel />;
}
