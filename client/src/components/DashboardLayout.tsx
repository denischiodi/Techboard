import { useAuth } from "@/_core/hooks/useAuth";
import { assetPath } from "@/const";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { useIsMobile } from "@/hooks/useMobile";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { LayoutDashboard, LogOut, PanelLeft, Users, FolderKanban, CalendarOff, CalendarRange, ShieldCheck, Lock, Database, KeyRound, Mail, Network, Workflow } from "lucide-react";
import { CSSProperties, useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { DashboardLayoutSkeleton } from './DashboardLayoutSkeleton';
import { Button } from "./ui/button";

const menuItems = [
  { icon: LayoutDashboard, label: "Dashboard", path: "/", permKey: "dashboard" as const },
  { icon: Database, label: "Cadastros", path: "/cadastros", permKey: "settings" as const },
  { icon: Users, label: "Recursos", path: "/resources", permKey: "resources" as const },
  { icon: FolderKanban, label: "Projetos", path: "/projects", permKey: "projects" as const },
  { icon: CalendarOff, label: "Férias/Ausências", path: "/absences", permKey: "absences" as const },
  { icon: CalendarRange, label: "Planner Gantt", path: "/planner", permKey: "planner" as const },
  { icon: Network, label: "Organograma", path: "/org-chart", permKey: "organogram" as const },
  { icon: Workflow, label: "TechMove", path: "/techmove", permKey: "techmove" as const },
  { icon: ShieldCheck, label: "Gestão de Acesso", path: "/access", permKey: "access" as const },
];

const SIDEBAR_WIDTH_KEY = "sidebar-width";
const DEFAULT_WIDTH = 280;
const MIN_WIDTH = 200;
const MAX_WIDTH = 480;

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem(SIDEBAR_WIDTH_KEY);
    return saved ? parseInt(saved, 10) : DEFAULT_WIDTH;
  });
  const { loading, user } = useAuth();

  useEffect(() => {
    localStorage.setItem(SIDEBAR_WIDTH_KEY, sidebarWidth.toString());
  }, [sidebarWidth]);

  if (loading) {
    return <DashboardLayoutSkeleton />
  }

  if (!user) {
    return <EmailCodeLogin />;
  }

  return (
    <SidebarProvider
      style={
        {
          "--sidebar-width": `${sidebarWidth}px`,
        } as CSSProperties
      }
    >
      <DashboardLayoutContent setSidebarWidth={setSidebarWidth}>
        {children}
      </DashboardLayoutContent>
    </SidebarProvider>
  );
}

function EmailCodeLogin() {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const utils = trpc.useUtils();

  const [displayCode, setDisplayCode] = useState<string | null>(null);

  const requestCode = trpc.auth.requestCode.useMutation({
    onSuccess: (data) => {
      setCodeSent(true);
      if (data.code) {
        setDisplayCode(data.code);
        setCode(data.code);
        toast.success("Codigo gerado (modo desenvolvimento)");
      } else {
        toast.success("Codigo enviado para seu e-mail");
      }
    },
    onError: error => {
      toast.error(error.message || "Nao foi possivel enviar o codigo");
    },
  });

  const verifyCode = trpc.auth.verifyCode.useMutation({
    onSuccess: async () => {
      toast.success("Acesso liberado");
      await utils.auth.me.invalidate();
    },
    onError: error => {
      toast.error(error.message || "Codigo invalido");
    },
  });

  const submitEmail = (event: React.FormEvent) => {
    event.preventDefault();
    requestCode.mutate({ email });
  };

  const submitCode = (event: React.FormEvent) => {
    event.preventDefault();
    verifyCode.mutate({ email, code });
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4">
      <div className="w-full max-w-md rounded-lg border bg-background p-8 shadow-sm">
        <div className="mb-8 flex flex-col items-center gap-4 text-center">
          <img src={assetPath("/techboard-logo.png")} alt="TechBoard" className="h-12 w-auto object-contain" />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Acesse o TechBoard</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Informe seu e-mail cadastrado. Se ele estiver ativo em Gestão de Acesso, enviaremos um código para entrar.
            </p>
          </div>
        </div>

        <form className="space-y-4" onSubmit={codeSent ? submitCode : submitEmail}>
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="login-email">E-mail</label>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="login-email"
                type="email"
                value={email}
                onChange={event => setEmail(event.target.value)}
                placeholder="seu.email@empresa.com"
                className="pl-9"
                required
                disabled={verifyCode.isPending}
              />
            </div>
          </div>

          {displayCode ? (
            <div className="rounded-md border border-green-200 bg-green-50 p-3 text-center">
              <p className="text-xs font-medium text-green-700 mb-1">Código de acesso (modo dev)</p>
              <p className="text-2xl font-bold tracking-[0.3em] text-green-900">{displayCode}</p>
              <p className="text-xs text-green-600 mt-1">Já preenchido automaticamente — clique Entrar</p>
            </div>
          ) : null}

          {codeSent ? (
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="login-code">Código recebido</label>
              <div className="relative">
                <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="login-code"
                  value={code}
                  onChange={event => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="000000"
                  className="pl-9 tracking-[0.35em]"
                  inputMode="numeric"
                  required
                />
              </div>
            </div>
          ) : null}

          <Button
            type="submit"
            className="w-full"
            disabled={requestCode.isPending || verifyCode.isPending || !email || (codeSent && code.length !== 6)}
          >
            {codeSent ? "Entrar" : requestCode.isPending ? "Enviando..." : "Enviar código"}
          </Button>

          {codeSent ? (
            <Button
              type="button"
              variant="ghost"
              className="w-full"
              disabled={requestCode.isPending}
              onClick={() => requestCode.mutate({ email })}
            >
              Reenviar código
            </Button>
          ) : null}
        </form>
      </div>
    </div>
  );
}

type DashboardLayoutContentProps = {
  children: React.ReactNode;
  setSidebarWidth: (width: number) => void;
};

function DashboardLayoutContent({
  children,
  setSidebarWidth,
}: DashboardLayoutContentProps) {
  const { user, logout } = useAuth();
  const [location, setLocation] = useLocation();
  const { state, toggleSidebar } = useSidebar();
  const isCollapsed = state === "collapsed";
  const [isResizing, setIsResizing] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const activeMenuItem = menuItems.find(item => item.path === location);
  const isMobile = useIsMobile();

  // Fetch user permissions based on email
  const { data: appUser, isLoading: permLoading } = trpc.access.getByEmail.useQuery(
    { email: user?.email || '' },
    { enabled: !!user?.email }
  );

  const userPermissions = appUser?.permissions || (user as any)?.permissions || {
    dashboard: false,
    resources: false,
    projects: false,
    absences: false,
    planner: false,
    organogram: false,
    techmove: false,
    access: false,
    settings: false,
  };

  // Filter menu items based on permissions
  const visibleMenuItems = menuItems.filter(item => userPermissions[item.permKey]);

  // Check if current page is blocked
  const currentMenuItem = menuItems.find(item => item.path === location);
  const isBlocked = currentMenuItem && !userPermissions[currentMenuItem.permKey];

  // Auto-redirect to first allowed page when blocked
  useEffect(() => {
    if (isBlocked && !permLoading) {
      const firstAllowed = visibleMenuItems[0];
      if (firstAllowed) {
        setLocation(firstAllowed.path);
      }
    }
  }, [isBlocked, permLoading, visibleMenuItems, setLocation]);

  useEffect(() => {
    if (isCollapsed) {
      setIsResizing(false);
    }
  }, [isCollapsed]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;

      const sidebarLeft = sidebarRef.current?.getBoundingClientRect().left ?? 0;
      const newWidth = e.clientX - sidebarLeft;
      if (newWidth >= MIN_WIDTH && newWidth <= MAX_WIDTH) {
        setSidebarWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    }

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isResizing, setSidebarWidth]);

  return (
    <>
      <div className="relative" ref={sidebarRef}>
        <Sidebar
          collapsible="icon"
          className="border-r-0"
          disableTransition={isResizing}
        >
          <SidebarHeader className="h-16 justify-center">
            <div className="flex items-center gap-3 px-2 transition-all w-full">
              <button
                onClick={toggleSidebar}
                className="h-8 w-8 flex items-center justify-center hover:bg-accent rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring shrink-0"
                aria-label="Toggle navigation"
              >
                <PanelLeft className="h-4 w-4 text-muted-foreground" />
              </button>
              {!isCollapsed ? (
                <div className="flex min-w-0 flex-1 items-center">
                  <img
                    src={assetPath("/techboard-logo.png")}
                    alt="TechBoard"
                    className="h-9 w-auto max-w-[185px] object-contain"
                  />
                </div>
              ) : null}
            </div>
          </SidebarHeader>

          <SidebarContent className="gap-0">
            <SidebarMenu className="px-2 py-1">
              {visibleMenuItems.map(item => {
                const isActive = location === item.path;
                const label = appUser?.role === 'consultant' && item.path === '/resources'
                  ? 'Meu Cadastro'
                  : appUser?.role === 'consultant' && item.path === '/absences'
                  ? 'Minhas Férias'
                  : item.label;
                return (
                  <SidebarMenuItem key={item.path}>
                    <SidebarMenuButton
                      isActive={isActive}
                      onClick={() => setLocation(item.path)}
                      tooltip={label}
                      className={`h-10 transition-all font-normal`}
                    >
                      <item.icon
                        className={`h-4 w-4 ${isActive ? "text-primary" : ""}`}
                      />
                      <span>{label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarContent>

          <SidebarFooter className="p-3">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-3 rounded-lg px-1 py-1 hover:bg-accent/50 transition-colors w-full text-left group-data-[collapsible=icon]:justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <Avatar className="h-9 w-9 border shrink-0">
                    <AvatarFallback className="text-xs font-medium">
                      {user?.name?.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0 group-data-[collapsible=icon]:hidden">
                    <p className="text-sm font-medium truncate leading-none">
                      {user?.name || "-"}
                    </p>
                    <p className="text-xs text-muted-foreground truncate mt-1.5">
                      {user?.email || "-"}
                    </p>
                  </div>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem
                  onClick={logout}
                  className="cursor-pointer text-destructive focus:text-destructive"
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>Sign out</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarFooter>
        </Sidebar>
        <div
          className={`absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-primary/20 transition-colors ${isCollapsed ? "hidden" : ""}`}
          onMouseDown={() => {
            if (isCollapsed) return;
            setIsResizing(true);
          }}
          style={{ zIndex: 50 }}
        />
      </div>

      <SidebarInset>
        {isMobile && (
          <div className="flex border-b h-14 items-center justify-between bg-background/95 px-2 backdrop-blur supports-[backdrop-filter]:backdrop-blur sticky top-0 z-40">
            <div className="flex items-center gap-2">
              <SidebarTrigger className="h-9 w-9 rounded-lg bg-background" />
              <div className="flex items-center gap-3">
                <div className="flex flex-col gap-1">
                  <span className="tracking-tight text-foreground">
                    {activeMenuItem?.label ?? "Menu"}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
        <main className="min-w-0 flex-1 overflow-x-hidden p-3 sm:p-4">
          {isBlocked ? (
            <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
              <Lock className="h-16 w-16 text-muted-foreground/50" />
              <h2 className="text-xl font-semibold text-muted-foreground">Acesso Restrito</h2>
              <p className="text-sm text-muted-foreground text-center max-w-md">
                Você não tem permissão para acessar esta página. Entre em contato com o administrador para solicitar acesso.
              </p>
              <Button variant="outline" onClick={() => setLocation('/')}>Voltar ao Dashboard</Button>
            </div>
          ) : children}
        </main>
      </SidebarInset>
    </>
  );
}
