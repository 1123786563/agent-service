"use client";

import React from "react";
import { ReactQueryProvider } from "@/providers/ReactQueryProvider";
import { DashboardPage } from "@views/components/DashboardPage";
import "@views/styles.css";

interface DashboardRouteProps {
  params: Promise<{ wsId: string; projectId: string }>;
}

export default function DashboardRoute({ params }: DashboardRouteProps) {
  const { wsId, projectId } = React.use(params);

  return (
    <ReactQueryProvider>
      <DashboardPage wsId={wsId} projectId={projectId} />
    </ReactQueryProvider>
  );
}
