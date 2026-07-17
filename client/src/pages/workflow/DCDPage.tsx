import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Trash2, Sparkles, FileText, Eye } from "lucide-react";

const PROJECT_ID = "default-project";

export default function DCDPage() {
  const [showGenerate, setShowGenerate] = useState(false);
  const [showView, setShowView] = useState<any>(null);
  const [front, setFront] = useState("");

  const { data: documents = [], refetch } = trpc.workflow.dcd.list.useQuery({ projectId: PROJECT_ID });
  const generateMut = trpc.workflow.dcd.generate.useMutation({
    onSuccess: () => { refetch(); setShowGenerate(false); toast.success("DCD gerado com sucesso!"); },
    onError: () => toast.error("Erro ao gerar DCD"),
  });
  const deleteMut = trpc.workflow.dcd.delete.useMutation({ onSuccess: () => { refetch(); toast.success("Removido"); } });

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">DCD - Design de Configuração Detalhada</h1>
          <p className="text-muted-foreground text-sm">Documentos gerados por IA a partir dos scope items, BDCQ e atas</p>
        </div>
        <Button onClick={() => setShowGenerate(true)}><Sparkles className="h-4 w-4 mr-2" />Gerar DCD (IA)</Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {documents.length === 0 ? (
          <Card className="col-span-full"><CardContent className="py-8 text-center text-muted-foreground">Nenhum DCD gerado. Clique em "Gerar DCD (IA)" para criar.</CardContent></Card>
        ) : documents.map((doc: any) => (
          <Card key={doc.id}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2"><FileText className="h-4 w-4" />{doc.title}</CardTitle>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" onClick={() => setShowView(doc)}><Eye className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" onClick={() => deleteMut.mutate({ id: doc.id })}><Trash2 className="h-4 w-4" /></Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2">
                {doc.front && <Badge variant="outline">{doc.front}</Badge>}
                <Badge variant="secondary">{doc.status || "Rascunho"}</Badge>
              </div>
              {doc.generatedAt && <p className="text-xs text-muted-foreground mt-2">Gerado em: {doc.generatedAt}</p>}
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={showGenerate} onOpenChange={setShowGenerate}>
        <DialogContent>
          <DialogHeader><DialogTitle>Gerar DCD via IA</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">A IA irá consolidar scope items, respostas do BDCQ e atas de workshop para gerar o documento.</p>
          <div><Label>Frente/Módulo (opcional)</Label><Input value={front} onChange={e => setFront(e.target.value)} placeholder="Ex: SD, MM, FI..." /></div>
          <DialogFooter>
            <Button onClick={() => generateMut.mutate({ projectId: PROJECT_ID, module: front || undefined })} disabled={generateMut.isPending}>
              <Sparkles className="h-4 w-4 mr-2" />{generateMut.isPending ? "Gerando..." : "Gerar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!showView} onOpenChange={() => setShowView(null)}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{showView?.title}</DialogTitle></DialogHeader>
          <div className="prose prose-sm dark:prose-invert whitespace-pre-wrap">{showView?.content}</div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
