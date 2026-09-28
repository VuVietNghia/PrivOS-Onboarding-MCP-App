export interface WorkspaceFiles {
  readText(path: string): Promise<string>;
  writeText(path: string, text: string): Promise<void>;
  mkdir(path: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  list(path: string): Promise<Array<{ name: string; directory: boolean }>>;
  size(path: string): Promise<number>;
}

export interface CommandRunner {
  run(command: string, args: readonly string[], options: { cwd: string; env: Readonly<Record<string, string>> }):
    Promise<{ exitCode: number; stdout: string; stderr: string }>;
}

export interface Prompt { ask(question: string): Promise<string> }
