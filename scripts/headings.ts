import { readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import figlet from 'figlet';
import ts from 'typescript';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

async function collectFiles(directory: string): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(path)));
    } else if (entry.isFile() && entry.name.endsWith('.ts')) {
      files.push(path);
    }
  }
  return files.sort();
}

async function main(): Promise<void> {
  let updated = 0;
  for (const folder of ['src', 'tests']) {
    for (const path of await collectFiles(join(root, folder))) {
      const source = await readFile(path, 'utf8');
      const result = updateHeadings(source, path);
      if (result !== source) {
        await writeFile(path, result, 'utf8');
        console.log(`Updated ${relative(root, path)}`);
        updated++;
      }
    }
  }
  console.log(`Updated headings in ${updated} file(s).`);
}

function updateHeadings(source: string, path: string): string {
  const file = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true);
  const comments = new Map<number, ts.CommentRange>();

  // Parse token boundaries so strings, templates and regexes stay untouched.
  function visit(node: ts.Node): void {
    for (const range of [
      ...(ts.getLeadingCommentRanges(source, node.pos) ?? []),
      ...(ts.getTrailingCommentRanges(source, node.end) ?? []),
    ]) {
      if (range.kind === ts.SyntaxKind.MultiLineCommentTrivia) {
        comments.set(range.pos, range);
      }
    }
    for (const child of node.getChildren(file)) {
      visit(child);
    }
  }
  visit(file);

  // Replace from the end to preserve the original comment offsets.
  let result = source;
  for (const { pos, end } of [...comments.values()].sort(
    (left, right) => right.pos - left.pos
  )) {
    const comment = source.slice(pos, end);
    const heading = /^\/\* @@head[\t ]+([^\r\n]*)/.exec(comment);
    if (!heading) continue;
    if (!comment.endsWith('*/')) {
      throw new Error(`Unclosed heading comment in ${relative(root, path)}`);
    }

    const firstLine = heading[0].replace(/\*\/$/, '');
    const text = firstLine.slice('/* @@head'.length).trim();
    if (text.length === 0) {
      throw new Error(`Empty heading in ${relative(root, path)}`);
    }
    if ([...text].length > 10) {
      console.warn(`Heading exceeds 10 characters in ${path}: ${text}`);
    }
    const lineStart = source.lastIndexOf('\n', pos - 1) + 1;
    const indent = /^[\t ]*/.exec(source.slice(lineStart, pos))![0];
    const newline =
      /\r?\n/.exec(comment)?.[0] ?? /\r?\n/.exec(source)?.[0] ?? '\n';
    const art = figlet.textSync(text, { font: 'Georgia11' });
    if (art.includes('*/')) {
      throw new Error(`Heading art contains a comment terminator: ${text}`);
    }
    const lines = art.split('\n').map((line) => indent + line.trimEnd());
    const replacement = [firstLine, ...lines, `${indent} */`].join(newline);
    result = result.slice(0, pos) + replacement + result.slice(end);
  }
  return result;
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
