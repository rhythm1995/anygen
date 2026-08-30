"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Plus, FolderClosed, Shapes, Sparkles, Bell, Code2, Box, Settings, LogOut, ShieldCheck } from "lucide-react";

import { useAuth } from "@/components/providers";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

export function DreaminaLogo({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden>
      <path
        d="M16 1c1.2 7.4 5.6 11.8 13 13-7.4 1.2-11.8 5.6-13 13-1.2-7.4-5.6-11.8-13-13C10.4 12.8 14.8 8.4 16 1Z"
        fill="#2f7bff"
      />
      <path d="M25.5 20c.5 3 2.2 4.7 5.2 5.2-3 .5-4.7 2.2-5.2 5.2-.5-3-2.2-4.7-5.2-5.2 3-.5 4.7-2.2 5.2-5.2Z" fill="#5aa2ff" />
    </svg>
  );
}

type RailItem =
  | { kind: "link"; href: string; label: string; icon: React.ReactNode; badge?: string }
  | { kind: "button"; label: string; icon: React.ReactNode; onClick: () => void; badge?: string };

export function SideRail() {
  const pathname = usePathname();
  const { session, me, loading, signIn, signUp, signOut } = useAuth();
  const [authOpen, setAuthOpen] = useState(false);
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const items: RailItem[] = [
    { kind: "link", href: "/ai-tool/home", label: "灵感", icon: <Home size={19} strokeWidth={1.6} /> },
    { kind: "link", href: "/ai-tool/generate", label: "生成", icon: <Plus size={19} strokeWidth={1.6} /> },
    { kind: "link", href: "/ai-tool/assets", label: "资产", icon: <FolderClosed size={19} strokeWidth={1.6} /> },
    { kind: "link", href: "/ai-tool/assets-canvas", label: "画布", icon: <Shapes size={19} strokeWidth={1.6} /> },
    ...(session
      ? ([
          { kind: "button", label: "Octo", icon: <Sparkles size={19} strokeWidth={1.6} />, onClick: () => {}, badge: "Beta" },
        ] as RailItem[])
      : []),
  ];

  const bottomItems: RailItem[] = session
    ? [
        ...(me?.role === "admin"
          ? ([{ kind: "link", href: "/admin/models", label: "管理", icon: <ShieldCheck size={19} strokeWidth={1.6} /> }] as RailItem[])
          : []),
        { kind: "button", label: "升级", icon: <span className="text-[10px] font-dm-label">+50</span>, onClick: () => {} },
        { kind: "button", label: "通知", icon: <Bell size={19} strokeWidth={1.6} />, onClick: () => {} },
        { kind: "button", label: "API", icon: <Code2 size={19} strokeWidth={1.6} />, onClick: () => {} },
        { kind: "button", label: "3D", icon: <Box size={19} strokeWidth={1.6} />, onClick: () => {} },
        { kind: "button", label: "设置", icon: <Settings size={19} strokeWidth={1.6} />, onClick: () => {} },
      ]
    : [
        { kind: "button", label: "API", icon: <Code2 size={19} strokeWidth={1.6} />, onClick: () => {} },
        { kind: "button", label: "3D", icon: <Box size={19} strokeWidth={1.6} />, onClick: () => {} },
      ];

  const renderItem = (item: RailItem) => {
    const active = item.kind === "link" && (pathname === item.href || (item.href !== "/ai-tool/home" && pathname.startsWith(item.href)));
    const inner = (
      <span
        className={`flex w-full flex-col items-center gap-1 rounded-lg px-1 py-2 transition-colors ${
          active ? "text-dm-text" : "text-dm-text-3 hover:text-dm-text-2"
        }`}
      >
        <span className="relative">
          {item.icon}
          {item.badge && (
            <span className="absolute -bottom-2 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-dm-accent-dim px-1 text-[8px] font-medium leading-3 text-dm-accent">
              {item.badge}
            </span>
          )}
        </span>
        <span className="font-dm-label text-[10px] font-normal leading-none">{item.label}</span>
      </span>
    );
    return item.kind === "link" ? (
      <Link key={item.label} href={item.href} aria-label={item.label}>
        {inner}
      </Link>
    ) : (
      <button key={item.label} aria-label={item.label} onClick={item.onClick} className="w-full">
        {inner}
      </button>
    );
  };

  const submitAuth = async () => {
    setBusy(true);
    setError(null);
    const err = mode === "signin" ? await signIn(email, password) : await signUp(email, password);
    setBusy(false);
    if (err) setError(err);
    else setAuthOpen(false);
  };

  return (
    <>
      <aside className="fixed inset-y-0 left-0 z-40 flex w-[76px] flex-col items-center px-[10px] py-5">
        <Link href="/ai-tool/home" aria-label="Dreamina home" className="mb-6">
          <DreaminaLogo />
        </Link>
        <nav className="flex flex-1 flex-col items-center gap-1.5 self-stretch">
          {items.map(renderItem)}
          <div className="flex-1" />
          {session ? (
            <button
              onClick={() => void signOut()}
              className="flex w-full flex-col items-center gap-1 rounded-lg px-1 py-2 text-dm-text-3 transition-colors hover:text-dm-text-2"
              aria-label="退出登录"
            >
              <LogOut size={19} strokeWidth={1.6} />
              <span className="font-dm-label text-[10px] leading-none">{me?.name?.slice(0, 6) ?? "You"}</span>
            </button>
          ) : (
            !loading && (
              <>
                <span className="rounded-full bg-dm-accent px-2 py-0.5 text-[9px] text-[#04252a]">Free credits</span>
                <button
                  onClick={() => {
                    setMode("signin");
                    setAuthOpen(true);
                  }}
                  className="mt-1 flex w-full flex-col items-center gap-1 rounded-lg px-1 py-2 text-dm-text-3 transition-colors hover:text-dm-text-2"
                  aria-label="Sign in"
                >
                  <span className="font-dm-label text-[10px]">Sign in</span>
                </button>
              </>
            )
          )}
          {bottomItems.map(renderItem)}
        </nav>
      </aside>

      <Dialog open={authOpen} onOpenChange={setAuthOpen}>
        <DialogContent className="border-dm-border bg-dm-surface sm:max-w-[380px]">
          <DialogHeader>
            <DialogTitle className="font-dm-label">
              {mode === "signin" ? "登录即梦" : "创建账号"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              placeholder="邮箱"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="border-dm-border bg-dm-surface-2 text-dm-text placeholder:text-dm-text-4"
            />
            <Input
              placeholder="密码"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="border-dm-border bg-dm-surface-2 text-dm-text placeholder:text-dm-text-4"
            />
            {error && <p className="text-xs text-red-400">{error}</p>}
            <Button
              onClick={() => void submitAuth()}
              disabled={busy || !email || !password}
              className="w-full bg-dm-accent font-dm-label text-[#04252a] hover:bg-dm-accent/90"
            >
              {busy ? "…" : mode === "signin" ? "登录" : "注册"}
            </Button>
            <button
              className="w-full text-center text-xs text-dm-text-3 hover:text-dm-text-2"
              onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
            >
              {mode === "signin" ? "没有账号？注册即送 $5.00 创作额度" : "已有账号？直接登录"}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
