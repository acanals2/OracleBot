'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';

export function CheckoutButton({ productKey }: { productKey: string }) {
  const [loading, setLoading] = useState(false);

  async function go() {
    setLoading(true);
    try {
      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ productKey }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        alert(json?.message ?? json?.error ?? 'Checkout failed');
        setLoading(false);
        return;
      }
      window.location.href = json.data.url;
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
      setLoading(false);
    }
  }

  return (
    <Button size="sm" variant="secondary" onClick={go} disabled={loading} className="mt-2">
      {loading ? '…' : 'Buy'}
    </Button>
  );
}
