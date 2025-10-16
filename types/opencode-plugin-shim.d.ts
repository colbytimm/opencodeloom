declare module "@opencode-ai/plugin" {
  // Minimal typings to satisfy local tools usage
  type SchemaString = {
    describe: (text?: string) => SchemaString;
    optional: () => SchemaString;
    default: (value?: any) => SchemaString;
    transform: (fn?: (v: any) => any) => SchemaString;
  };

  interface ToolSchema {
    string: () => SchemaString;
  }

  type ToolDef = {
    description: string;
    args: Record<string, any>;
    execute: (args: any) => Promise<any> | any;
  };

  export const tool: ((def: ToolDef) => ToolDef) & { schema: ToolSchema };
}
