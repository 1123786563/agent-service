"use server";

import { ConsultationStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { getConsultationById, updateConsultation } from "@/server/consultations/service";
import { requireCreator } from "@/server/auth/session";
import { createServiceOrder } from "@/server/orders/service";
import { getPaymentProvider } from "@/server/payments/adapter";

function readRequiredText(formData: FormData, key: string, errorMessage: string) {
  const value = String(formData.get(key) ?? "").trim();
  if (!value) {
    throw new Error(errorMessage);
  }

  return value;
}

function readPriceCents(formData: FormData) {
  const value = Number.parseInt(readRequiredText(formData, "priceCents", "Price is required"), 10);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error("Price must be a positive integer amount in cents");
  }

  return value;
}

export async function createConsultationOrderAction(formData: FormData) {
  const creator = await requireCreator();
  const consultationId = readRequiredText(formData, "consultationId", "Consultation ID is required");
  const title = readRequiredText(formData, "title", "Order title is required");
  const scopedSummary = readRequiredText(formData, "scopedSummary", "Scoped summary is required");
  const currency = readRequiredText(formData, "currency", "Currency is required").toUpperCase();
  const priceCents = readPriceCents(formData);

  const consultation = await getConsultationById(consultationId);
  if (!consultation) {
    throw new Error("Consultation not found");
  }

  if (consultation.providerId !== creator.id) {
    throw new Error("Consultation does not belong to this provider");
  }

  if (consultation.status === ConsultationStatus.ORDER_CREATED) {
    throw new Error("Consultation already has an order");
  }

  if (consultation.status !== ConsultationStatus.SCOPED || consultation.scopedSummary !== scopedSummary) {
    await updateConsultation({
      consultationId,
      providerId: creator.id,
      status: ConsultationStatus.SCOPED,
      scopedSummary
    });
  }

  await createServiceOrder({
    consultationId,
    providerId: creator.id,
    title,
    scope: scopedSummary,
    priceCents,
    currency,
    paymentProvider: getPaymentProvider()
  });

  revalidatePath("/creator");
  revalidatePath("/creator/consultations");
  revalidatePath("/creator/orders");
}
