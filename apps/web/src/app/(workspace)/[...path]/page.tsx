export default async function ModulePlaceholder({
  params,
}: {
  params: Promise<{ path: string[] }>;
}) {
  const { path } = await params;
  const label = path.join('/');

  return (
    <div className="mx-auto max-w-lg rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
      <p className="text-sm font-medium text-slate-500">Module</p>
      <h1 className="mt-1 text-xl font-semibold text-slate-900">{label}</h1>
      <p className="mt-2 text-sm text-slate-500">
        This screen is wired for navigation but not built yet. Dashboard is live.
      </p>
    </div>
  );
}
