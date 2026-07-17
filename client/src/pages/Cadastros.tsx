import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Plus, Pencil, Trash2, Users, Layers, Activity, FolderKanban, CalendarOff, Briefcase, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';
import type { LookupItem } from '../../../shared/types';

type LookupCategory = 'profiles' | 'fronts' | 'resourceStatuses' | 'projectStatuses' | 'absenceTypes' | 'allocationTypes' | 'allocationStatuses' | 'contractTypes' | 'dashboardCheckStatuses';

const CATEGORY_CONFIG: { key: LookupCategory; label: string; icon: React.ElementType; description: string }[] = [
  { key: 'profiles', label: 'Perfis', icon: Users, description: 'Papéis dos recursos (Funcional, Técnico, etc.)' },
  { key: 'fronts', label: 'Frentes', icon: Layers, description: 'Módulos/frentes de trabalho (FI, MM, SD, etc.)' },
  { key: 'resourceStatuses', label: 'Status de Recurso', icon: Activity, description: 'Status possíveis para recursos' },
  { key: 'projectStatuses', label: 'Status de Projeto', icon: FolderKanban, description: 'Status possíveis para projetos' },
  { key: 'absenceTypes', label: 'Tipos de Ausência', icon: CalendarOff, description: 'Tipos de férias e ausências' },
  { key: 'allocationTypes', label: 'Tipos de Alocação', icon: Briefcase, description: 'Tipos de alocação (Projeto, Interna, etc.)' },
  { key: 'allocationStatuses', label: 'Status de Alocação', icon: CheckCircle, description: 'Status possíveis para alocações' },
  { key: 'contractTypes', label: 'Tipos de Contratação', icon: Briefcase, description: 'Tipos de contrato (CLT, PJ, etc.)' },
  { key: 'dashboardCheckStatuses', label: 'Status p/ Verificar Recurso', icon: FolderKanban, description: 'Status de projeto que devem ser verificados no Dashboard (Projetos Faltando Recurso)' },
];

export default function Settings() {
  const { data: lookups, refetch } = trpc.settings.getLookups.useQuery();
  const addItem = trpc.settings.addLookup.useMutation({ onSuccess: () => refetch() });
  const updateItem = trpc.settings.updateLookup.useMutation({ onSuccess: () => refetch() });
  const deleteItem = trpc.settings.deleteLookup.useMutation({ onSuccess: () => refetch() });

  const [activeTab, setActiveTab] = useState<LookupCategory>('profiles');
  const [editDialog, setEditDialog] = useState<{ open: boolean; item?: LookupItem; category: LookupCategory }>({ open: false, category: 'profiles' });
  const [newValue, setNewValue] = useState('');
  const [editValue, setEditValue] = useState('');
  const [editActive, setEditActive] = useState(true);

  const handleAdd = () => {
    if (!newValue.trim()) return;
    addItem.mutate({ category: activeTab, value: newValue.trim() }, {
      onSuccess: () => {
        toast.success('Item adicionado com sucesso');
        setNewValue('');
      }
    });
  };

  const handleEdit = () => {
    if (!editDialog.item || !editValue.trim()) return;
    updateItem.mutate({
      id: editDialog.item.id,
      value: editValue.trim(),
      active: editActive,
    }, {
      onSuccess: () => {
        toast.success('Item atualizado');
        setEditDialog({ open: false, category: 'profiles' });
      }
    });
  };

  const handleDelete = (category: LookupCategory, id: string) => {
    if (!confirm('Tem certeza que deseja excluir este item?')) return;
    deleteItem.mutate({ id }, {
      onSuccess: () => toast.success('Item excluído'),
    });
  };

  const openEdit = (category: LookupCategory, item: LookupItem) => {
    setEditDialog({ open: true, item, category });
    setEditValue(item.value);
    setEditActive(item.active);
  };

  const currentItems = lookups?.[activeTab] || [];
  const currentConfig = CATEGORY_CONFIG.find(c => c.key === activeTab)!;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Cadastros</h1>
        <p className="text-muted-foreground">Gerencie os valores auxiliares utilizados em todo o sistema</p>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as LookupCategory)} className="space-y-4">
        <TabsList className="flex h-auto min-h-9 w-full flex-wrap justify-start gap-1 p-1">
          {CATEGORY_CONFIG.map(cat => (
            <TabsTrigger key={cat.key} value={cat.key} className="h-8 flex-none text-xs">
              <cat.icon className="h-3 w-3 mr-1" />
              <span className="hidden sm:inline">{cat.label}</span>
            </TabsTrigger>
          ))}
        </TabsList>

        {CATEGORY_CONFIG.map(cat => (
          <TabsContent key={cat.key} value={cat.key}>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <cat.icon className="h-5 w-5" />
                  {cat.label}
                </CardTitle>
                <p className="text-sm text-muted-foreground">{cat.description}</p>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Add new item */}
                <div className="flex gap-2">
                  <Input
                    placeholder={`Novo ${cat.label.toLowerCase().replace(/s$/, '')}...`}
                    value={activeTab === cat.key ? newValue : ''}
                    onChange={(e) => setNewValue(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
                  />
                  <Button onClick={handleAdd} disabled={!newValue.trim()}>
                    <Plus className="h-4 w-4 mr-1" /> Adicionar
                  </Button>
                </div>

                {/* Items list */}
                <div className="border rounded-lg divide-y">
                  {currentItems.length === 0 ? (
                    <div className="p-4 text-center text-muted-foreground">
                      Nenhum item cadastrado
                    </div>
                  ) : (
                    currentItems.map(item => (
                      <div key={item.id} className="flex items-center justify-between p-3 hover:bg-muted/50 transition-colors">
                        <div className="flex items-center gap-3">
                          <span className="font-medium">{item.value}</span>
                          {!item.active && (
                            <Badge variant="secondary" className="text-xs">Inativo</Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="sm" onClick={() => openEdit(cat.key, item)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="sm" className="text-destructive" onClick={() => handleDelete(cat.key, item.id)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                <p className="text-xs text-muted-foreground">
                  Total: {currentItems.length} itens ({currentItems.filter(i => i.active).length} ativos)
                </p>
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>

      {/* Edit Dialog */}
      <Dialog open={editDialog.open} onOpenChange={(o) => setEditDialog(prev => ({ ...prev, open: o }))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Item</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Valor</Label>
              <Input value={editValue} onChange={(e) => setEditValue(e.target.value)} />
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={editActive} onCheckedChange={setEditActive} />
              <Label>Ativo</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialog(prev => ({ ...prev, open: false }))}>Cancelar</Button>
            <Button onClick={handleEdit}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
