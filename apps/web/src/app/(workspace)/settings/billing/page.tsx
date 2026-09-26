'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { api } from '@/lib/api';
import SettingsPage from '@/components/settings/SettingsPage';

type Plan = {
  id: string;
  name: string;
  description: string | null;
  priceCents: number;
  currency: string;
  interval: string;
  features: string[];
  limits: Record<string, unknown>;
  isActive: boolean;
  sortOrder: number;
};

type Subscription = {
  id: string;
  planId: string;
  status: string;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  trialEndsAt: string | null;
  canceledAt: string | null;
  plan?: Plan;
};

type Invoice = {
  id: string;
  status: string;
  amountCents: number;
  currency: string;
  periodStart: string;
  periodEnd: string;
  dueAt: string | null;
  paidAt: string | null;
  pdfUrl: string | null;
  createdAt: string;
};

type PaymentMethod = {
  id: string;
  type: string;
  provider: string;
  last4: string | null;
  brand: string | null;
  expMonth: number | null;
  expYear: number | null;
  isDefault: boolean;
};

function formatPrice(cents: number, currency = 'USD', interval: string) {
  return `${(cents / 100).toFixed(2)} ${currency}/${interval}`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function statusBadge(status: string) {
  const colors: Record<string, string> = {
    active: 'bg-emerald-100 text-emerald-700',
    trial: 'bg-indigo-100 text-indigo-700',
    past_due: 'bg-amber-100 text-amber-700',
    canceled: 'bg-slate-100 text-slate-700',
    draft: 'bg-slate-100 text-slate-700',
    paid: 'bg-emerald-100 text-emerald-700',
    open: 'bg-indigo-100 text-indigo-700',
  };
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-medium ${colors[status] || 'bg-slate-100 text-slate-700'}`}
    >
      {status}
    </span>
  );
}

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-slate-200 bg-white p-5 ${className}`}>{children}</div>
  );
}

export default function BillingPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [flash, setFlash] = useState<{ ok: boolean; text: string } | null>(null);

  const [plans, setPlans] = useState<Plan[]>([]);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);

  const [busyPlan, setBusyPlan] = useState<string | null>(null);
  const [busyPayment, setBusyPayment] = useState<string | null>(null);
  const [busySubscription, setBusySubscription] = useState(false);

  const [newPm, setNewPm] = useState({
    type: 'card',
    provider: 'stripe',
    providerPaymentMethodId: '',
    last4: '',
    brand: '',
    expMonth: '',
    expYear: '',
    isDefault: false,
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [p, s, i, pm] = await Promise.all([
        api<{ plans: Plan[] }>('/api/v1/billing/plans'),
        api<{ subscription: Subscription | null; plan: Plan | null }>(
          '/api/v1/billing/subscription',
        ),
        api<{ invoices: Invoice[] }>('/api/v1/billing/invoices'),
        api<{ paymentMethods: PaymentMethod[] }>('/api/v1/billing/payment-methods'),
      ]);
      setPlans(p.plans);
      setSubscription(s.subscription ? { ...s.subscription, plan: s.plan || undefined } : null);
      setInvoices(i.invoices);
      setPaymentMethods(pm.paymentMethods);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleSubscribe(e: FormEvent, planId: string) {
    e.preventDefault();
    setBusyPlan(planId);
    setFlash(null);
    try {
      await api<{ subscription: Subscription }>('/api/v1/billing/subscription', {
        method: 'POST',
        body: { planId },
      });
      setFlash({ ok: true, text: 'Subscription created' });
      void load();
    } catch (err) {
      setFlash({ ok: false, text: err instanceof Error ? err.message : 'Failed to subscribe' });
    } finally {
      setBusyPlan(null);
    }
  }

  async function handleChangePlan(planId: string) {
    setBusySubscription(true);
    setFlash(null);
    try {
      await api<{ ok: boolean }>('/api/v1/billing/subscription', {
        method: 'PATCH',
        body: { planId },
      });
      setFlash({ ok: true, text: 'Plan changed' });
      void load();
    } catch (err) {
      setFlash({ ok: false, text: err instanceof Error ? err.message : 'Failed to change plan' });
    } finally {
      setBusySubscription(false);
    }
  }

  async function handleCancel() {
    if (!window.confirm('Cancel subscription? Access continues until period end.')) return;
    setBusySubscription(true);
    setFlash(null);
    try {
      await api<{ ok: boolean }>('/api/v1/billing/subscription', { method: 'DELETE' });
      setFlash({ ok: true, text: 'Subscription canceled' });
      void load();
    } catch (err) {
      setFlash({ ok: false, text: err instanceof Error ? err.message : 'Failed to cancel' });
    } finally {
      setBusySubscription(false);
    }
  }

  async function handleAddPaymentMethod(e: FormEvent) {
    e.preventDefault();
    setBusyPayment('add');
    setFlash(null);
    try {
      const body = {
        type: newPm.type,
        provider: newPm.provider,
        providerPaymentMethodId: newPm.providerPaymentMethodId,
        last4: newPm.last4 || null,
        brand: newPm.brand || null,
        expMonth: newPm.expMonth ? Number(newPm.expMonth) : null,
        expYear: newPm.expYear ? Number(newPm.expYear) : null,
        isDefault: newPm.isDefault,
      };
      await api<{ paymentMethod: PaymentMethod }>('/api/v1/billing/payment-methods', {
        method: 'POST',
        body,
      });
      setFlash({ ok: true, text: 'Payment method added' });
      setNewPm({
        type: 'card',
        provider: 'stripe',
        providerPaymentMethodId: '',
        last4: '',
        brand: '',
        expMonth: '',
        expYear: '',
        isDefault: false,
      });
      void load();
    } catch (err) {
      setFlash({
        ok: false,
        text: err instanceof Error ? err.message : 'Failed to add payment method',
      });
    } finally {
      setBusyPayment(null);
    }
  }

  async function handleRemovePaymentMethod(id: string) {
    if (!window.confirm('Remove this payment method?')) return;
    setBusyPayment(id);
    setFlash(null);
    try {
      await api<{ ok: boolean }>(`/api/v1/billing/payment-methods/${id}`, { method: 'DELETE' });
      setFlash({ ok: true, text: 'Payment method removed' });
      void load();
    } catch (err) {
      setFlash({ ok: false, text: err instanceof Error ? err.message : 'Failed to remove' });
    } finally {
      setBusyPayment(null);
    }
  }

  if (loading) {
    return <SettingsPage title="Billing" loading />;
  }

  const hasSubscription = !!subscription;
  const currentPlan = subscription?.plan;
  const isTrial = subscription?.status === 'trial';
  const trialEnds = subscription?.trialEndsAt ? new Date(subscription.trialEndsAt) : null;
  const trialDaysLeft = trialEnds
    ? Math.max(0, Math.ceil((trialEnds.getTime() - Date.now()) / 86400000))
    : 0;

  return (
    <SettingsPage
      title="Billing"
      description="Manage your subscription, invoices, and payment methods."
      width="wide"
      error={error}
      onRetry={() => void load()}
      notice={flash}
      action={
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-white"
        >
          Refresh
        </button>
      }
    >
      <section aria-label="Current plan">
        <h2 className="mb-3 text-sm font-semibold text-slate-800">Current Plan</h2>
        {hasSubscription ? (
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-lg font-semibold text-slate-900">
                  {currentPlan?.name || 'Unknown Plan'}
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  {currentPlan
                    ? formatPrice(
                        currentPlan.priceCents,
                        currentPlan.currency,
                        currentPlan.interval,
                      )
                    : ''}
                  {isTrial &&
                    trialEnds &&
                    ` · Trial ends in ${trialDaysLeft} day${trialDaysLeft !== 1 ? 's' : ''}`}
                </p>
                {currentPlan?.description && (
                  <p className="mt-1 text-sm text-slate-500">{currentPlan.description}</p>
                )}
              </div>
              <div className="flex items-center gap-2">
                {statusBadge(subscription!.status)}
                {!subscription?.canceledAt && (
                  <>
                    <button
                      type="button"
                      onClick={() => handleChangePlan(currentPlan!.id)}
                      disabled={busySubscription}
                      className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-white disabled:opacity-50"
                    >
                      Change Plan
                    </button>
                    <button
                      type="button"
                      onClick={handleCancel}
                      disabled={busySubscription}
                      className="rounded-lg border border-red-200 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
                    >
                      Cancel
                    </button>
                  </>
                )}
              </div>
            </div>
            {currentPlan?.features.length && (
              <ul className="mt-4 space-y-1">
                {currentPlan.features.map((f, i) => (
                  <li key={i} className="flex items-center gap-2 text-sm text-slate-600">
                    <svg
                      aria-hidden
                      className="h-4 w-4 shrink-0 text-emerald-500"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path
                        fillRule="evenodd"
                        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                        clipRule="evenodd"
                      />
                    </svg>
                    {f}
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-3 text-xs text-slate-500">
              Billing period: {formatDate(subscription!.currentPeriodStart)} –{' '}
              {formatDate(subscription!.currentPeriodEnd)}
              {subscription?.canceledAt && ` · Canceled on ${formatDate(subscription.canceledAt)}`}
            </p>
          </Card>
        ) : (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
            <p className="text-sm font-medium text-slate-600">No active subscription</p>
            <p className="mt-1 text-sm text-slate-500">Choose a plan below to get started.</p>
          </div>
        )}
      </section>

      <section aria-label="Available plans">
        <h2 className="mb-3 text-sm font-semibold text-slate-800">Available Plans</h2>
        {plans.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
            <p className="text-sm font-medium text-slate-600">No plans configured</p>
            <p className="mt-1 text-sm text-slate-500">
              Contact your administrator to set up billing plans.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {plans
              .filter((p) => p.isActive)
              .map((plan) => (
                <Card
                  key={plan.id}
                  className={currentPlan?.id === plan.id ? 'ring-2 ring-indigo-500' : ''}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-medium text-slate-900">{plan.name}</p>
                      <p className="mt-1 text-2xl font-semibold text-slate-900">
                        {formatPrice(plan.priceCents, plan.currency, plan.interval)}
                      </p>
                    </div>
                    {currentPlan?.id === plan.id && (
                      <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-700">
                        Current
                      </span>
                    )}
                  </div>
                  {plan.description && (
                    <p className="mt-2 text-sm text-slate-500">{plan.description}</p>
                  )}
                  {plan.features.length > 0 && (
                    <ul className="mt-3 space-y-1 max-h-32 overflow-auto">
                      {plan.features.slice(0, 6).map((f, i) => (
                        <li key={i} className="flex items-center gap-2 text-sm text-slate-600">
                          <svg
                            aria-hidden
                            className="h-3.5 w-3.5 shrink-0 text-emerald-500"
                            viewBox="0 0 20 20"
                            fill="currentColor"
                          >
                            <path
                              fillRule="evenodd"
                              d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                              clipRule="evenodd"
                            />
                          </svg>
                          {f}
                        </li>
                      ))}
                      {plan.features.length > 6 && (
                        <li className="text-xs text-slate-400">+{plan.features.length - 6} more</li>
                      )}
                    </ul>
                  )}
                  <div className="mt-4">
                    {hasSubscription && currentPlan?.id === plan.id ? (
                      <button
                        disabled
                        className="w-full rounded-lg bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-500"
                      >
                        Current Plan
                      </button>
                    ) : hasSubscription ? (
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          handleChangePlan(plan.id);
                        }}
                      >
                        <button
                          type="submit"
                          disabled={busySubscription || busyPlan === plan.id}
                          className="w-full rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                        >
                          {busyPlan === plan.id
                            ? 'Changing…'
                            : currentPlan
                              ? 'Switch to this plan'
                              : 'Subscribe'}
                        </button>
                      </form>
                    ) : (
                      <form onSubmit={(e) => void handleSubscribe(e, plan.id)}>
                        <button
                          type="submit"
                          disabled={busyPlan === plan.id}
                          className="w-full rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                        >
                          {busyPlan === plan.id ? 'Subscribing…' : 'Subscribe'}
                        </button>
                      </form>
                    )}
                  </div>
                </Card>
              ))}
          </div>
        )}
      </section>

      <section aria-label="Invoices">
        <h2 className="mb-3 text-sm font-semibold text-slate-800">Invoices</h2>
        {invoices.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
            <p className="text-sm font-medium text-slate-600">No invoices yet</p>
            <p className="mt-1 text-sm text-slate-500">
              Invoices will appear here after your first billing cycle.
            </p>
          </div>
        ) : (
          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">Invoice</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">Period</th>
                  <th className="text-right px-4 py-3 font-medium text-slate-600">Amount</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">Status</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {invoices.map((inv) => (
                  <tr key={inv.id}>
                    <td className="px-4 py-3 text-slate-900">{inv.id.slice(0, 8)}…</td>
                    <td className="px-4 py-3 text-slate-500">
                      {formatDate(inv.periodStart)} – {formatDate(inv.periodEnd)}
                    </td>
                    <td className="text-right px-4 py-3 text-slate-900 font-medium">
                      ${(inv.amountCents / 100).toFixed(2)} {inv.currency}
                    </td>
                    <td className="px-4 py-3">{statusBadge(inv.status)}</td>
                    <td className="px-4 py-3">
                      {inv.pdfUrl && (
                        <a
                          href={inv.pdfUrl}
                          target="_blank"
                          rel="noopener"
                          className="text-sm text-indigo-600 hover:underline"
                        >
                          Download PDF
                        </a>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section aria-label="Payment methods">
        <h2 className="mb-3 text-sm font-semibold text-slate-800">Payment Methods</h2>
        <Card>
          {paymentMethods.length === 0 ? (
            <p className="text-sm text-slate-500">No payment methods on file.</p>
          ) : (
            <ul className="space-y-3">
              {paymentMethods.map((pm) => (
                <li
                  key={pm.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 p-3"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                      <svg
                        aria-hidden
                        className="h-5 w-5"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                      >
                        <path d="M21 12V7H5a2 2 0 010-4h14v4" />
                        <path d="M3 11.5V18a2 2 0 002 2h14" />
                        <path d="M15 11.5h3.5a1.5 1.5 0 010 3H15" />
                      </svg>
                    </div>
                    <div>
                      <p className="font-medium text-slate-900">
                        {pm.brand || pm.type} ending in {pm.last4 || '****'}
                      </p>
                      <p className="text-xs text-slate-500">
                        {pm.provider} ·{' '}
                        {pm.expMonth && pm.expYear
                          ? `${pm.expMonth}/${String(pm.expYear).slice(2)}`
                          : ''}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {pm.isDefault && (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
                        Default
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => void handleRemovePaymentMethod(pm.id)}
                      disabled={busyPayment === pm.id}
                      className="rounded border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50"
                    >
                      Remove
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <form
            onSubmit={handleAddPaymentMethod}
            className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
          >
            <div className="sm:col-span-2">
              <label htmlFor="pm-id" className="block text-xs font-medium text-slate-600">
                Payment Method ID (from Stripe) <span aria-hidden>*</span>
              </label>
              <input
                id="pm-id"
                type="text"
                required
                value={newPm.providerPaymentMethodId}
                onChange={(e) => setNewPm({ ...newPm, providerPaymentMethodId: e.target.value })}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                placeholder="pm_..."
              />
            </div>
            <div>
              <label htmlFor="pm-last4" className="block text-xs font-medium text-slate-600">
                Last 4
              </label>
              <input
                id="pm-last4"
                type="text"
                maxLength={4}
                value={newPm.last4}
                onChange={(e) => setNewPm({ ...newPm, last4: e.target.value })}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                placeholder="4242"
              />
            </div>
            <div>
              <label htmlFor="pm-brand" className="block text-xs font-medium text-slate-600">
                Brand
              </label>
              <input
                id="pm-brand"
                type="text"
                value={newPm.brand}
                onChange={(e) => setNewPm({ ...newPm, brand: e.target.value })}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                placeholder="Visa"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label htmlFor="pm-exp-m" className="block text-xs font-medium text-slate-600">
                  Exp Month
                </label>
                <input
                  id="pm-exp-m"
                  type="number"
                  min={1}
                  max={12}
                  value={newPm.expMonth}
                  onChange={(e) => setNewPm({ ...newPm, expMonth: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  placeholder="12"
                />
              </div>
              <div>
                <label htmlFor="pm-exp-y" className="block text-xs font-medium text-slate-600">
                  Exp Year
                </label>
                <input
                  id="pm-exp-y"
                  type="number"
                  min={2024}
                  max={2050}
                  value={newPm.expYear}
                  onChange={(e) => setNewPm({ ...newPm, expYear: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  placeholder="2028"
                />
              </div>
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={newPm.isDefault}
                  onChange={(e) => setNewPm({ ...newPm, isDefault: e.target.checked })}
                  className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
                <span className="text-sm text-slate-600">Set as default</span>
              </label>
            </div>
            <div className="lg:col-span-4">
              <button
                type="submit"
                disabled={busyPayment === 'add' || !newPm.providerPaymentMethodId.trim()}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {busyPayment === 'add' ? 'Adding…' : 'Add Payment Method'}
              </button>
            </div>
          </form>
        </Card>
      </section>
    </SettingsPage>
  );
}
