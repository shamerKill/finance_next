"use client";

import { Button } from "@heroui/react";
import Link from "next/link";

export default function Home() {
  return (
    <div>
      <Link href="/api-list">
        <Button color="primary">api页面</Button>
      </Link>
    </div>
  );
}
