import { Button } from "@nextui-org/react";
import Image from "next/image";
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
