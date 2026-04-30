import React from "react";

export function CompleteOrderButton({ orderId }: { orderId: string }) {
  return (
    <form action={`/api/orders/${orderId}/complete`} method="post">
      <button className="button" type="submit">确认完成</button>
    </form>
  );
}
