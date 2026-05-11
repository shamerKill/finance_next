"use client";

import { Button } from "@heroui/react";
import Link from "next/link";

export default function Home() {
  return (
    <div className="p-8 flex flex-col gap-3 max-w-sm">
      <Link href="/accounts">
        <Button color="primary">账户</Button>
      </Link>
      <Link href="/api-list">
        <Button variant="flat">策略</Button>
      </Link>
    </div>
  );
}
