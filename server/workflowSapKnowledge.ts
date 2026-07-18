type SapModuleKnowledge = {
  areas: string[];
  transactions: string[];
  fiori: string[];
  spro: string[];
};

export const SAP_MODULE_KNOWLEDGE: Record<string, SapModuleKnowledge> = {
  FI: { areas: ["Universal Journal", "General Ledger", "Accounts Payable", "Accounts Receivable", "Asset Accounting"], transactions: ["FS00", "FB50", "F-53", "F-28", "F110"], fiori: ["Manage Journal Entries", "Manage Supplier Line Items", "Manage Customer Line Items"], spro: ["Financial Accounting > Financial Accounting Global Settings", "Financial Accounting > General Ledger Accounting"] },
  CO: { areas: ["Cost Center Accounting", "Profit Center Accounting", "Internal Orders", "Margin Analysis"], transactions: ["KS01", "KL01", "KSB1", "KO01"], fiori: ["Manage Cost Centers", "Display Line Items in General Ledger"], spro: ["Controlling > Cost Center Accounting", "Controlling > Profit Center Accounting"] },
  SD: { areas: ["Sales", "Pricing", "Availability Check", "Shipping", "Billing"], transactions: ["VA01", "VA02", "VL01N", "VL02N", "VF01"], fiori: ["Manage Sales Orders", "Create Outbound Deliveries", "Manage Billing Documents"], spro: ["Sales and Distribution > Sales", "Sales and Distribution > Basic Functions > Pricing"] },
  MM: { areas: ["Purchasing", "Inventory Management", "Material Master", "Invoice Verification"], transactions: ["MM01", "ME21N", "MIGO", "MIRO", "ME51N"], fiori: ["Manage Purchase Orders", "Post Goods Movement", "Create Supplier Invoice"], spro: ["Materials Management > Purchasing", "Materials Management > Inventory Management and Physical Inventory"] },
  PP: { areas: ["MRP", "Bills of Material", "Routings", "Production Orders", "Capacity Planning"], transactions: ["MD01N", "CS01", "CA01", "CO01", "CO11N"], fiori: ["Monitor Material Coverage", "Manage Production Orders"], spro: ["Production > Material Requirements Planning", "Production > Shop Floor Control"] },
  QM: { areas: ["Inspection Planning", "Quality Inspection", "Quality Notifications"], transactions: ["QP01", "QA32", "QE51N", "QM01"], fiori: ["Manage Inspection Lots", "Manage Quality Notifications"], spro: ["Quality Management > Quality Inspection", "Quality Management > Quality Notifications"] },
  PM: { areas: ["Technical Objects", "Maintenance Processing", "Preventive Maintenance"], transactions: ["IE01", "IL01", "IW21", "IW31", "IP01"], fiori: ["Manage Maintenance Notifications and Orders", "Find Technical Object"], spro: ["Plant Maintenance and Customer Service > Maintenance Processing"] },
  EWM: { areas: ["Inbound", "Outbound", "Warehouse Tasks", "Physical Inventory"], transactions: ["/SCWM/MON", "/SCWM/PRDI", "/SCWM/PRDO"], fiori: ["Warehouse Monitor", "Process Warehouse Tasks"], spro: ["Extended Warehouse Management > Cross-Process Settings"] },
  BTP: { areas: ["Integration Suite", "Extension Suite", "Identity and Access", "Event-driven integration"], transactions: [], fiori: ["SAP Integration Suite", "SAP Build", "SAP Event Mesh"], spro: [] },
  INTEGRACOES: { areas: ["APIs", "IDoc", "OData", "Events", "Monitoring"], transactions: ["WE02", "WE20", "SM58", "SRT_MONI"], fiori: ["Integration Suite - Monitor Integrations", "Communication Arrangements"], spro: ["SAP NetWeaver > Application Server > IDoc Interface / Application Link Enabling"] },
};

export function getSapKnowledgeContext(module?: string) {
  const key = (module || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toUpperCase();
  const knowledge = SAP_MODULE_KNOWLEDGE[key];
  if (!knowledge) return "Nenhuma referência estática específica foi encontrada. Não invente transações, apps Fiori ou caminhos SPRO; marque itens que exigem validação pelo especialista do módulo.";
  return `Referência SAP para ${module} (validar disponibilidade conforme edição e release do cliente):\n- Áreas: ${knowledge.areas.join(", ")}\n- Transações clássicas de referência: ${knowledge.transactions.join(", ") || "não aplicável"}\n- Apps/capacidades Fiori de referência: ${knowledge.fiori.join(", ") || "não aplicável"}\n- Caminhos IMG/SPRO de referência: ${knowledge.spro.join("; ") || "não aplicável"}\nUse apenas referências pertinentes aos requisitos e sinalize explicitamente tudo que depender da edição, release ou escopo contratado.`;
}

export const DCD_FEW_SHOT_EXAMPLE = `Exemplo de nível de detalhe esperado (não copiar fatos para o novo projeto):
## Decisão de design - Aprovação de pedidos
**Requisito relacionado:** REQ-012 - Aprovação por alçada.
**Decisão:** utilizar workflow flexível com níveis derivados do valor líquido e centro de custo.
**Configuração:** definir pré-condições, agentes e ordem de aprovação; validar apps e caminhos disponíveis na edição do cliente.
**Critérios de aceite:** pedido acima do limite permanece bloqueado até todas as aprovações; rejeição registra motivo e retorna ao solicitante.
**Rastreabilidade:** BDCQ Compras / pergunta sobre estratégias de liberação.
**Teste:** criar pedidos abaixo, no limite e acima de cada faixa, incluindo ausência do aprovador.`;
