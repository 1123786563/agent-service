"use client";

import React, { useTransition } from "react";
import { useRouter } from "next/navigation";

export function CancelOrderButton({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <button
      className="button secondary"
      disabled={isPending}
      onClick={() => {
        startTransition(async () => {
          const response = await fetch(`/api/orders/${orderId}/cancel`, {
            method: "POST"
          });

          if (!response.ok) {
            throw new Error("Could not cancel order");
          }

          router.refresh();
        });
      }}
      type="button"
    >
      {isPending ? "取消中..." : "取消订单"}
    </button>
  );
}
