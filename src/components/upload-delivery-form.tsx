import React from "react";

export function UploadDeliveryForm({ orderId }: { orderId: string }) {
  return (
    <form action={`/api/orders/${orderId}/deliveries`} className="form" encType="multipart/form-data" method="post">
      <label>
        交付文件
        <input name="file" required type="file" />
      </label>
      <label>
        交付说明
        <textarea
          className="textarea"
          maxLength={5000}
          name="note"
          placeholder="说明交付内容、部署位置或后续使用注意事项"
          rows={4}
        />
      </label>
      <button className="button" type="submit">上传交付物</button>
    </form>
  );
}
