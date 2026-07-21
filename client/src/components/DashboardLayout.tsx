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
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
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
import { LogOut, PanelLeft, Lock, KeyRound, Mail, Bell, ChevronDown, Grid2X2 } from "lucide-react";
import { CSSProperties, useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { DashboardLayoutSkeleton } from './DashboardLayoutSkeleton';
import { Button } from "./ui/button";
import { canAccessPath, canAccessProduct, canViewMenuItem, productForPath, PRODUCTS, type ProductId } from "@/lib/productCatalog";
import { DEFAULT_PERMISSIONS } from "../../../shared/types";
import { ProductLogo } from "@/components/ProductLogo";

const menuItems = PRODUCTS.flatMap(product => product.menus.map(item => ({ ...item, productId: product.id, permKey: item.permission })));

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

export function EmailCodeLogin() {
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
  const { state, toggleSidebar, setOpenMobile } = useSidebar();
  const isCollapsed = state === "collapsed";
  const [isResizing, setIsResizing] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const activeProduct = productForPath(location);
  const activeMenuItem = menuItems.filter(item => location === item.path || location.startsWith(`${item.path}/`)).sort((a, b) => b.path.length - a.path.length)[0];
  const isMobile = useIsMobile();
  const [expandedProducts, setExpandedProducts] = useState<Partial<Record<ProductId, boolean>>>(() => (
    activeProduct ? { [activeProduct.id]: true } : {}
  ));

  // Fetch user permissions based on email
  const { data: appUser, isLoading: permLoading } = trpc.access.getByEmail.useQuery(
    { email: user?.email || '' },
    { enabled: !!user?.email }
  );

  const userPermissions = appUser?.permissions || (user as any)?.permissions || DEFAULT_PERMISSIONS.viewer;
  const notificationsQuery = trpc.activities.notifications.useQuery(undefined, {
    enabled: Boolean(appUser?.permissions.activities),
    refetchInterval: 60_000,
  });
  const markNotificationsRead = trpc.activities.markNotificationsRead.useMutation({
    onSuccess: () => notificationsQuery.refetch(),
  });
  const notifications = notificationsQuery.data || [];
  const unreadNotifications = notifications.filter(notification => !notification.readAt);

  const notificationButton = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label={`${unreadNotifications.length} notificações não lidas`}>
          <Bell className="h-4 w-4" />
          {unreadNotifications.length > 0 && <span className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] text-destructive-foreground">{unreadNotifications.length > 9 ? "9+" : unreadNotifications.length}</span>}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-h-96 w-80 overflow-y-auto">
        <div className="flex items-center justify-between px-2 py-1.5"><span className="text-sm font-semibold">Notificações</span>{unreadNotifications.length > 0 && <Button variant="ghost" size="sm" onClick={() => markNotificationsRead.mutate({})}>Marcar lidas</Button>}</div>
        {notifications.slice(0, 20).map(notification => <DropdownMenuItem key={notification.id} className={`block cursor-pointer whitespace-normal ${notification.readAt ? "opacity-60" : "bg-muted/50"}`} onClick={() => { markNotificationsRead.mutate({ id: notification.id }); setLocation(`/techtask/board?activityId=${encodeURIComponent(notification.activityId)}`); }}><p className="text-sm font-medium">{notification.title}</p><p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{notification.message}</p></DropdownMenuItem>)}
        {notifications.length === 0 && <p className="p-4 text-center text-sm text-muted-foreground">Nenhuma notificação.</p>}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const visibleProducts = PRODUCTS
    .filter(product => canAccessProduct(product, userPermissions))
    .map(product => ({ ...product, visibleMenus: product.menus.filter(item => canViewMenuItem(item, userPermissions)) }))
    .filter(product => product.visibleMenus.length > 0);

  // Check if current page is blocked
  const isBlocked = location !== "/" && !canAccessPath(location, userPermissions);

  // Auto-redirect to first allowed page when blocked
  useEffect(() => {
    if (isBlocked && !permLoading) {
      setLocation("/");
    }
  }, [isBlocked, permLoading, setLocation]);

  useEffect(() => {
    if (!activeProduct) return;
    setExpandedProducts(current => ({ ...current, [activeProduct.id]: true }));
  }, [activeProduct?.id]);

  const navigateFromSidebar = (path: string) => {
    setLocation(path);
    if (isMobile) setOpenMobile(false);
  };

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
                  <button onClick={() => navigateFromSidebar("/")} className="flex min-w-0 items-center gap-2 rounded-lg px-2 py-1 hover:bg-accent">
                    <Grid2X2 className="h-5 w-5 shrink-0" /><span className="truncate font-semibold">Portal Tech</span>
                  </button>
                </div>
              ) : null}
            </div>
          </SidebarHeader>

          <SidebarContent className="gap-0">
            <div className="px-2 pb-2">
              <Button variant="ghost" className="w-full justify-start gap-2 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-2" onClick={() => navigateFromSidebar("/")} title="Todas as ferramentas">
                <Grid2X2 className="h-4 w-4" /><span className="group-data-[collapsible=icon]:hidden">Todas as ferramentas</span>
              </Button>
            </div>
            <div className="space-y-1 px-2 pb-3">
              {visibleProducts.map(product => {
                const ProductIcon = product.icon;
                const open = isCollapsed || Boolean(expandedProducts[product.id]);
                return (
                  <Collapsible key={product.id} open={open} onOpenChange={value => setExpandedProducts(current => ({ ...current, [product.id]: value }))}>
                    <CollapsibleTrigger asChild>
                      <Button
                        variant={activeProduct?.id === product.id ? "secondary" : "ghost"}
                        className="h-10 w-full justify-start gap-2 px-2 font-semibold group-data-[collapsible=icon]:justify-center"
                        title={product.name}
                      >
                        <ProductIcon className="h-4 w-4 shrink-0" />
                        <span className="min-w-0 flex-1 truncate text-left group-data-[collapsible=icon]:hidden">{product.name}</span>
                        <ChevronDown className={`h-4 w-4 shrink-0 transition-transform group-data-[collapsible=icon]:hidden ${open ? "rotate-180" : ""}`} />
                      </Button>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="group-data-[collapsible=icon]:hidden">
                      <SidebarMenu className="mt-1 border-l pl-3">
                        {product.visibleMenus.map(item => {
                          const isActive = location === item.path || (item.path !== product.homePath && location.startsWith(`${item.path}/`));
                          const label = appUser?.role === 'consultant' && item.path === '/techboard/resources'
                            ? 'Meu Cadastro'
                            : appUser?.role === 'consultant' && item.path === '/techboard/absences'
                            ? 'Minhas Férias'
                            : item.label;
                          return (
                            <SidebarMenuItem key={item.path}>
                              <SidebarMenuButton isActive={isActive} onClick={() => navigateFromSidebar(item.path)} tooltip={label} className="h-9 font-normal">
                                <item.icon className={`h-4 w-4 ${isActive ? "text-primary" : ""}`} />
                                <span>{label}</span>
                              </SidebarMenuButton>
                            </SidebarMenuItem>
                          );
                        })}
                      </SidebarMenu>
                    </CollapsibleContent>
                  </Collapsible>
                );
              })}
            </div>
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
                  {activeProduct && <ProductLogo product={activeProduct} compact className="h-8 w-24 rounded-lg" imageClassName="p-1" />}
                  <span className="tracking-tight text-foreground">
                    {activeMenuItem?.label ?? "Menu"}
                  </span>
                </div>
              </div>
            </div>
            {appUser?.permissions.activities && notificationButton}
          </div>
        )}
        {!isMobile && appUser?.permissions.activities && <div className="flex h-12 items-center justify-end border-b px-4">{notificationButton}</div>}
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
