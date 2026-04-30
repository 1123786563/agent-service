"use client";

import React from "react";
import { useState } from "react";
import { ConsultationStatusPill, type ConsultationStatusValue } from "./consultation-status-pill";

type ConsultationFormProps = {
  agentSlug: string;
};

type ConsultationFormState = {
  errors: string[];
  consultationId?: string;
  status?: ConsultationStatusValue;
};

const INITIAL_STATE: ConsultationFormState = {
  errors: []
};

export function ConsultationForm({ agentSlug }: ConsultationFormProps) {
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<ConsultationFormState>(INITIAL_STATE);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setResult(INITIAL_STATE);

    const form = event.currentTarget;
    const formData = new FormData(form);
    const payload = {
      agentSlug,
      buyerEmail: String(formData.get("buyerEmail") ?? ""),
      requirement: String(formData.get("requirement") ?? "")
    };

    try {
      const response = await fetch("/api/consultations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });
      const body = await response.json();

      if (!response.ok) {
        setResult({
          errors: Array.isArray(body.errors) ? body.errors : ["咨询提交失败"]
        });
        return;
      }

      form.reset();
      setResult({
        errors: [],
        consultationId: body.consultation.id,
        status: body.consultation.status
      });
    } catch {
      setResult({
        errors: ["咨询提交失败，请稍后重试"]
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="form" onSubmit={handleSubmit}>
      <label>
        联系邮箱
        <input
          autoComplete="email"
          name="buyerEmail"
          placeholder="you@example.com"
          required
          type="email"
        />
      </label>

      <label>
        需求说明
        <textarea
          className="textarea"
          maxLength={5000}
          name="requirement"
          placeholder="描述你想要的定制、部署或培训服务"
          required
          rows={5}
        />
      </label>

      <button className="button" disabled={submitting} type="submit">
        {submitting ? "提交中..." : "咨询服务"}
      </button>

      {result.status ? (
        <div className="inline-status" role="status">
          <ConsultationStatusPill status={result.status} />
          <span className="muted">咨询已创建，后续可据此生成服务订单。</span>
        </div>
      ) : null}

      {result.errors.length > 0 ? (
        <ul className="error-list">
          {result.errors.map((error) => (
            <li key={error}>{error}</li>
          ))}
        </ul>
      ) : null}
    </form>
  );
}
