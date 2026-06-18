export type FieldType = 'text' | 'longtext' | 'number' | 'money' | 'date' | 'dropdown' | 'yesno';

export interface FieldDef {
  key: string;        // stable key stored in file.metadata
  label: string;      // shown on the form
  type: FieldType;
  required?: boolean;
  options?: string[]; // for 'dropdown'
}

export interface DocTypeTemplate {
  name: string;
  category: string;        // must match one of OrgTemplate.categories
  icon: string;            // lucide-ish name (display)
  color: string;           // tailwind color token, e.g. 'rose'
  referenceFormat: string; // e.g. 'GRD-{YYYY}-{seq}'
  publishable: boolean;
  fields: FieldDef[];
  chain: string[];         // ordered position names; [] = no approval step
}

export interface OrgTemplate {
  type: string;            // 'college' | 'registrar' | ...
  label: string;           // human label
  positions: string[];     // position names this office uses
  categories: string[];    // ordered category names
  documentTypes: DocTypeTemplate[];
}
