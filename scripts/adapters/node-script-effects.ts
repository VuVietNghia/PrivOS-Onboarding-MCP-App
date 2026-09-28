import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import readline from 'node:readline';
import type { CommandRunner, Prompt, WorkspaceFiles } from '../core/ports';

export function createNodeWorkspaceFiles(): WorkspaceFiles {
  return {
    readText: (file) => fs.readFile(file, 'utf8'),
    writeText: (file, text) => fs.writeFile(file, text, 'utf8'),
    mkdir: async (dir) => { await fs.mkdir(dir, { recursive: true }); },
    exists: async (file) => { try { await fs.access(file); return true; } catch { return false; } },
    list: async (dir) => (await fs.readdir(dir, { withFileTypes: true })).map((entry) => ({ name: entry.name, directory: entry.isDirectory() })),
    size: async (file) => (await fs.stat(file)).size,
  };
}

export function createNodePrompt(): Prompt {
  return {
    ask(question) {
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      return new Promise((resolve) => rl.question(question, (answer) => { rl.close(); resolve(answer.trim()); }));
    },
  };
}

export function createNodeCommandRunner(): CommandRunner {
  return {
    run(command, args, options) {
      return new Promise((resolve, reject) => {
        const child = spawn(command, [...args], { cwd: options.cwd, env: { ...process.env, ...options.env }, stdio: ['ignore', 'pipe', 'pipe'] });
        let stdout = ''; let stderr = '';
        child.stdout?.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
        child.stderr?.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });
        child.on('error', reject);
        child.on('exit', (code, signal) => resolve({ exitCode: signal ? 1 : code ?? 1, stdout, stderr }));
      });
    },
  };
}
