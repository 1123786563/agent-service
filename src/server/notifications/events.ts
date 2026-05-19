import { NotificationType } from "@prisma/client";
import { dispatchNotification } from "./service";

export async function notifyOrderPaid(providerId: string, orderTitle: string, orderId: string) {
  return dispatchNotification({
    userId: providerId,
    type: NotificationType.ORDER_PAID,
    title: "订单已付款",
    body: `您的服务订单「${orderTitle}」已收到付款，请开始工作。`,
    actionUrl: `/creator/orders`,
    dedupKey: `order-paid:${orderId}`,
  });
}

export async function notifyOrderDisputed(providerId: string, orderTitle: string, orderId: string) {
  return dispatchNotification({
    userId: providerId,
    type: NotificationType.ORDER_DISPUTED,
    title: "订单争议",
    body: `您的服务订单「${orderTitle}」已被买家发起争议，请及时处理。`,
    actionUrl: `/creator/orders`,
    dedupKey: `order-disputed:${orderId}`,
  });
}

export async function notifyOrderCancelled(userId: string, orderTitle: string, orderId: string) {
  return dispatchNotification({
    userId,
    type: NotificationType.ORDER_CANCELLED,
    title: "订单已取消",
    body: `服务订单「${orderTitle}」已取消。`,
    actionUrl: `/account/orders`,
    dedupKey: `order-cancelled:${orderId}`,
  });
}

export async function notifyDeliverySubmitted(
  buyerUserId: string | null,
  buyerEmail: string,
  orderTitle: string,
  orderId: string
) {
  if (!buyerUserId) return;
  return dispatchNotification({
    userId: buyerUserId,
    type: NotificationType.DELIVERY_SUBMITTED,
    title: "交付已提交",
    body: `您的服务订单「${orderTitle}」已有新的交付，请查看并验收。`,
    actionUrl: `/account/orders`,
    dedupKey: `delivery-submitted:${orderId}`,
  });
}

export async function notifyOrderCompleted(
  providerId: string,
  buyerUserId: string | null,
  orderTitle: string,
  orderId: string
) {
  const promises = [
    dispatchNotification({
      userId: providerId,
      type: NotificationType.ORDER_COMPLETED,
      title: "订单已完成",
      body: `服务订单「${orderTitle}」已完成。`,
      actionUrl: `/creator/orders`,
      dedupKey: `order-completed:${orderId}`,
    }),
  ];

  if (buyerUserId) {
    promises.push(
      dispatchNotification({
        userId: buyerUserId,
        type: NotificationType.ORDER_COMPLETED,
        title: "订单已完成",
        body: `您的服务订单「${orderTitle}」已完成。`,
        actionUrl: `/account/orders`,
        dedupKey: `order-completed-buyer:${orderId}`,
      })
    );
  }

  return Promise.all(promises);
}

export async function notifyConsultationNew(providerId: string, agentName: string, consultationId: string) {
  return dispatchNotification({
    userId: providerId,
    type: NotificationType.CONSULTATION_NEW,
    title: "新咨询",
    body: `您的智能体「${agentName}」收到了一条新的咨询。`,
    actionUrl: `/creator/consultations`,
    dedupKey: `consultation-new:${consultationId}`,
  });
}

export async function notifyReviewReceived(ownerId: string, agentName: string, reviewId: string) {
  return dispatchNotification({
    userId: ownerId,
    type: NotificationType.REVIEW_RECEIVED,
    title: "收到评价",
    body: `您的智能体「${agentName}」收到了新的评价。`,
    actionUrl: `/creator/agents`,
    dedupKey: `review-received:${reviewId}`,
  });
}

export async function notifyPackagePublished(ownerId: string, agentName: string, packageSlug: string) {
  return dispatchNotification({
    userId: ownerId,
    type: NotificationType.PACKAGE_PUBLISHED,
    title: "智能体已发布",
    body: `您的智能体「${agentName}」已成功发布到市场。`,
    actionUrl: `/agents/${packageSlug}`,
    dedupKey: `package-published:${packageSlug}`,
  });
}
