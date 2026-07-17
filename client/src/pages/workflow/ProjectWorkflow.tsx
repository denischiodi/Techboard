import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useLocation } from "wouter";
import { FileSpreadsheet, MessageSquare, Users, FileText, AlertTriangle, Settings2, ArrowRight } from "lucide-react";

const steps = [
  { id: "scope-items", title: "DDA / Scope Items", description: "Upload e gestão dos scope items do projeto", icon: FileSpreadsheet, path: "/workflow/scope-items", color: "bg-blue-500" },
  { id: "bdcq", title: "BDCQ", description: "Perguntas de levantamento e respostas do cliente", icon: MessageSquare, path: "/workflow/bdcq", color: "bg-purple-500" },
  { id: "workshops", title: "Workshops", description: "Agendamento, transcrições e atas automáticas", icon: Users, path: "/workflow/workshops", color: "bg-green-500" },
  { id: "dcd", title: "DCD (IA)", description: "Documento de configuração detalhada gerado por IA", icon: FileText, path: "/workflow/dcd", color: "bg-orange-500" },
  { id: "gaps", title: "Gaps", description: "Lista de gaps extraída automaticamente do DCD", icon: AlertTriangle, path: "/workflow/gaps", color: "bg-red-500" },
  { id: "configurations", title: "Configurações", description: "Checklist de configurações a executar", icon: Settings2, path: "/workflow/configurations", color: "bg-teal-500" },
];

export default function ProjectWorkflow() {
  const [, setLocation] = useLocation();
  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Trilha do Projeto</h1>
        <p className="text-muted-foreground mt-1">Fluxo completo de implementação SAP S/4HANA - do escopo à configuração</p>
      </div>
      <div className="grid gap-4">
        {steps.map((step, index) => (
          <Card key={step.id} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setLocation(step.path)}>
            <CardContent className="flex items-center gap-4 py-4">
              <div className={`p-3 rounded-lg ${step.color} text-white`}>
                <step.icon className="h-6 w-6" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs">{index + 1}</Badge>
                  <h3 className="font-semibold">{step.title}</h3>
                </div>
                <p className="text-sm text-muted-foreground mt-1">{step.description}</p>
              </div>
              <ArrowRight className="h-5 w-5 text-muted-foreground" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
