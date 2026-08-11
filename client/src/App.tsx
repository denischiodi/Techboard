import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { APP_BASE_PATH } from "@/const";
import NotFound from "@/pages/NotFound";
import { Redirect, Route, Router as WouterRouter, Switch, useLocation } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import DashboardLayout from "./components/DashboardLayout";
import Dashboard from "./pages/Dashboard";
import Resources from "./pages/Resources";
import Projects from "./pages/Projects";
import Absences from "./pages/Absences";
import Planner from "./pages/Planner";
import Access from "./pages/Access";
import Cadastros from "./pages/Cadastros";
import OrgChart from "./pages/OrgChart";
import ProjectWorkflow from "./pages/workflow/ProjectWorkflow";
import ScopeItemsPage from "./pages/workflow/ScopeItemsPage";
import BDCQPage from "./pages/workflow/BDCQPage";
import WorkshopsPage from "./pages/workflow/WorkshopsPage";
import DCDPage from "./pages/workflow/DCDPage";
import GapsPage from "./pages/workflow/GapsPage";
import ConfigurationsPage from "./pages/workflow/ConfigurationsPage";
import TestsPage from "./pages/workflow/TestsPage";
import Activities from "./pages/Activities";
import AppLauncher from "./pages/AppLauncher";
import ProductOverview from "./pages/ProductOverview";
import TechMoveTeams from "./pages/TechMoveTeams";
import StandardConfigurations from "./pages/StandardConfigurations";
import GovernancePage from "./pages/workflow/GovernancePage";
import RaidPage from "./pages/workflow/RaidPage";
import TrailStagePage from "./pages/workflow/TrailStagePage";
import TechMoveDashboard from "./pages/TechMoveDashboard";

function LegacyRedirect({ to }: { to: string }) {
  const [location] = useLocation();
  const query = location.includes("?") ? location.slice(location.indexOf("?")) : "";
  return <Redirect to={`${to}${query}`} />;
}

function AppRoutes() {
  return (
    <WouterRouter base={APP_BASE_PATH}>
      <Switch>
        <Route path={"/workflow"}>
          <Redirect to="/techmove" />
        </Route>
        <Route path={"/activities"}>
          <LegacyRedirect to="/techboard/kanban" />
        </Route>
        <Route>
          <DashboardLayout>
            <Switch>
              <Route path={"/"} component={AppLauncher} />
              <Route path={"/techboard"} component={Dashboard} />
              <Route path={"/techboard/resources"} component={Resources} />
              <Route path={"/techboard/projects"} component={Projects} />
              <Route path={"/techboard/absences"} component={Absences} />
              <Route path={"/techboard/planner"} component={Planner} />
              <Route path={"/techboard/org-chart"} component={OrgChart} />
              <Route path={"/techboard/kanban"} component={Activities} />
              <Route path={"/techboard/my-work"} component={Activities} />
              <Route path={"/techlead"}><Redirect to="/techmove" /></Route>
              <Route path={"/techlead/gp-track"}><Redirect to="/techmove/trail" /></Route>
              <Route path={"/techlead/teams"}><Redirect to="/techmove/teams" /></Route>
              <Route path={"/techlead/indicators"}><Redirect to="/techmove" /></Route>
              <Route path={"/techmove"} component={TechMoveDashboard} />
              <Route path={"/techmove/projects"} component={ProjectWorkflow} />
              <Route
                path={"/techmove/scope-items"}
                component={ScopeItemsPage}
              />
              <Route path={"/techmove/bdcq"} component={BDCQPage} />
              <Route path={"/techmove/workshops"} component={WorkshopsPage} />
              <Route path={"/techmove/dcd"} component={DCDPage} />
              <Route path={"/techmove/gaps"} component={GapsPage} />
              <Route
                path={"/techmove/configurations"}
                component={ConfigurationsPage}
              />
              <Route path={"/techmove/tests"} component={TestsPage} />
              <Route path={"/techmove/governance"} component={GovernancePage} />
              <Route path={"/techmove/raid"} component={RaidPage} />
              <Route path={"/techmove/trail"} component={TrailStagePage} />
              <Route path={"/techmove/board"}><LegacyRedirect to="/techboard/kanban" /></Route>
              <Route path={"/techmove/my-work"}><LegacyRedirect to="/techboard/my-work" /></Route>
              <Route path={"/techmove/teams"} component={TechMoveTeams} />
              <Route path={"/workflow/scope-items"}>
                <Redirect to="/techmove/scope-items" />
              </Route>
              <Route path={"/workflow/bdcq"}>
                <Redirect to="/techmove/bdcq" />
              </Route>
              <Route path={"/workflow/workshops"}>
                <Redirect to="/techmove/workshops" />
              </Route>
              <Route path={"/workflow/dcd"}>
                <Redirect to="/techmove/dcd" />
              </Route>
              <Route path={"/workflow/gaps"}>
                <Redirect to="/techmove/gaps" />
              </Route>
              <Route path={"/workflow/configurations"}>
                <Redirect to="/techmove/configurations" />
              </Route>
              <Route path={"/workflow/tests"}>
                <Redirect to="/techmove/tests" />
              </Route>
              <Route path={"/techtask"}><Redirect to="/techmove" /></Route>
              <Route path={"/techtask/board"}><LegacyRedirect to="/techboard/kanban" /></Route>
              <Route path={"/techtask/my-work"}><LegacyRedirect to="/techboard/my-work" /></Route>
              <Route path={"/admin"}>
                {() => <ProductOverview productId="admin" />}
              </Route>
              <Route path={"/admin/users"} component={Access} />
              <Route path={"/admin/registrations"} component={Cadastros} />
              <Route
                path={"/admin/standards"}
                component={StandardConfigurations}
              />
              <Route path={"/dashboard"}>
                <Redirect to="/techboard" />
              </Route>
              <Route path={"/cadastros"}>
                <Redirect to="/admin/registrations" />
              </Route>
              <Route path={"/resources"}>
                <Redirect to="/techboard/resources" />
              </Route>
              <Route path={"/projects"}>
                <Redirect to="/techboard/projects" />
              </Route>
              <Route path={"/absences"}>
                <Redirect to="/techboard/absences" />
              </Route>
              <Route path={"/planner"}>
                <Redirect to="/techboard/planner" />
              </Route>
              <Route path={"/org-chart"}>
                <Redirect to="/techboard/org-chart" />
              </Route>
              <Route path={"/gp-checklist"}>
                <Redirect to="/techmove/trail" />
              </Route>
              <Route path={"/access"}>
                <Redirect to="/admin/users" />
              </Route>
              <Route path={"/404"} component={NotFound} />
              <Route component={NotFound} />
            </Switch>
          </DashboardLayout>
        </Route>
      </Switch>
    </WouterRouter>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster />
          <AppRoutes />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
