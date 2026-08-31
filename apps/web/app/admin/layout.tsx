"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

import { useAuth } from "@/components/providers";
import { api, type MeInfo } from "@/lib/api";

const NAV = [
  { href: "/admin/models", label: "模型" },
  { href: "/admin/usage", label: "用量" },
  { href: "/admin/users", label: "用户" },
  { href: "/admin/user-insights", label: "用户洞察" },
  { href: "/admin/audit", label: "审计" },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { me, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const meQuery = useQuery({
    queryKey: ["me-admin"],
    queryFn: () => api<MeInfo>("/me"),
    enabled: Boolean(me),
  });

  useEffect(() => {
    if (!loading && me && meQuery.data && meQuery.data.role !== "admin") {
      router.replace("/ai-tool/home");
    }
  }, [loading, me, meQuery.data, router]);

  if (loading || !me) return <div className="flex flex-1 items-center justify-center text-sm text-dm-text-3">加载中…</div>;
  if (meQuery.isLoading) return <div className="flex flex-1 items-center justify-center text-sm text-dm-text-3">校验权限…</div>;
  if (meQuery.data && meQuery.data.role !== "admin") {
    return <div className="flex flex-1 items-center justify-center text-sm text-dm-text-3">无权访问</div>;
  }

  return (
    <div className="flex min-h-screen flex-1">
      <nav className="w-[160px] shrink-0 border-r border-dm-border px-3 py-6">
        <p className="mb-4 px-2 font-dm-label text-xs text-dm-text-4">管理后台</p>
        {NAV.map((n) => (
          <Link
            key={n.href}
            href={n.href}
            className={`mb-1 block rounded-lg px-3 py-2 text-sm transition-colors ${
              pathname.startsWith(n.href) ? "bg-dm-surface-2 text-dm-text" : "text-dm-text-3 hover:text-dm-text-2"
            }`}
          >
            {n.label}
          </Link>
        ))}
        <Link href="/ai-tool/home" className="mt-6 block px-3 text-xs text-dm-text-4 hover:text-dm-text-2">
          ← 返回主站
        </Link>
      </nav>
      <main className="flex-1 px-8 py-6">{children}</main>
    </div>
  );
}
