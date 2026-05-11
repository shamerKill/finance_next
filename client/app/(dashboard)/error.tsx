"use client";

import { Button } from "@heroui/react";
import { useEffect } from "react";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="rounded border border-danger-200 bg-danger-50 p-6 max-w-xl mx-auto mt-12">
      <h2 className="text-lg font-medium text-danger-700 mb-2">页面出错了</h2>
      <p className="text-sm text-default-700 mb-4">
        {error.message || "未知错误"}
      </p>
      <Button color="primary" onPress={reset}>
        重试
      </Button>
    </div>
  );
}
