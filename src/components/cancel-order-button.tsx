import React from "react";

export function CancelOrderButton({ orderId }: { orderId: string }) {
  return (
    <form action={`/api/orders/${orderId}/cancel`} method="post">
      <button className="button secondary" type="submit">取消订单</button>
    </form>
  );
}
