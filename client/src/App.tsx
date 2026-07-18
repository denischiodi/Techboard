import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { APP_BASE_PATH } from "@/const";
import NotFound from "@/pages/NotFound";
import { Route, Router as WouterRouter, Switch } from "wouter";
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
import TechMove from "./pages/TechMove";
import ProjectWorkflow from "./pages/workflow/ProjectWorkflow";
import ScopeItemsPage from "./pages/workflow/ScopeItemsPage";
import BDCQPage from "./pages/workflow/BDCQPage";
import WorkshopsPage from "./pages/workflow/WorkshopsPage";
import DCDPage from "./pages/workflow/DCDPage";
import GapsPage from "./pages/workflow/GapsPage";
import ConfigurationsPage from "./pages/workflow/ConfigurationsPage";
import GpChecklist from "./pages/GpChecklist";

function AppRoutes() {
  return (
    <WouterRouter base={APP_BASE_PATH}>
      <Switch>
        <Route path={"/techmove"} component={TechMove} />
        <Route>
          <DashboardLayout>
            <Switch>
              <Route path={"/"} component={Dashboard} />
              <Route path={"/cadastros"} component={Cadastros} />
              <Route path={"/resources"} component={Resources} />
              <Route path={"/projects"} component={Projects} />
              <Route path={"/absences"} component={Absences} />
              <Route path={"/planner"} component={Planner} />
              <Route path={"/org-chart"} component={OrgChart} />
              <Route path={"/workflow"} component={ProjectWorkflow} />
              <Route path={"/workflow/scope-items"} component={ScopeItemsPage} />
              <Route path={"/workflow/bdcq"} component={BDCQPage} />
              <Route path={"/workflow/workshops"} component={WorkshopsPage} />
              <Route path={"/workflow/dcd"} component={DCDPage} />
              <Route path={"/workflow/gaps"} component={GapsPage} />
              <Route path={"/workflow/configurations"} component={ConfigurationsPage} />
              <Route path={"/gp-checklist"} component={GpChecklist} />
              <Route path={"/access"} component={Access} />
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
