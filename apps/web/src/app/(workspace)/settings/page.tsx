import Link from 'next/link';
import { SETTINGS_NAV } from '@/components/workspace-nav';

export default function SettingsIndexPage() {
  const groups = SETTINGS_NAV.reduce<string[]>((acc, category) => {
    if (!acc.includes(category.group)) acc.push(category.group);
    return acc;
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Settings</h1>
        <p className="mt-1 text-sm text-slate-500">
          Every configuration screen for this workspace lives here.
        </p>
      </div>

      {groups.map((group) => (
        <section key={group} aria-labelledby={`settings-group-${group}`}>
          <h2
            id={`settings-group-${group}`}
            className="text-xs font-semibold uppercase tracking-wide text-slate-400"
          >
            {group}
          </h2>
          <ul className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {SETTINGS_NAV.filter((c) => c.group === group).map((category) => (
              <li key={category.href}>
                <Link
                  href={category.href}
                  className="block h-full rounded-xl border border-slate-200 bg-white p-4 transition-colors duration-200 hover:border-indigo-300 hover:bg-indigo-50/40"
                >
                  <span className="block text-sm font-medium text-slate-900">
                    {category.label}
                  </span>
                  <span className="mt-1 block text-xs text-slate-500">{category.description}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
