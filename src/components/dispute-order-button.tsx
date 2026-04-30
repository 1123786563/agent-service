import React from "react";

export function DisputeOrderButton({ orderId }: { orderId: string }) {
  return (
    <form action={`/api/orders/${orderId}/dispute`} method="post">
      <button className="button secondary" type="submit">发起争议</button>
    </form>
  );
}
