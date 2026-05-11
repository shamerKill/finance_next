import { ReactNode } from "react";

export const metadata = { title: "管理" };

export default function AdminLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
