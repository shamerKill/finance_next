"use client";

import { Button } from "@heroui/react";
import Link from "next/link";

export default function Home() {
  return (
    <div className="p-8 flex flex-col gap-3 max-w-sm">
      <Link href="/accounts">
        <Button color="primary">Accounts</Button>
      </Link>
      <Link href="/api-list">
        <Button variant="flat">Strategies</Button>
      </Link>
    </div>
  );
}
