# Minimap headings

Run `npm run headings` from `rest` to regenerate Georgia11 ASCII headings
in every `.ts` file under `src` and `tests`, including subdirectories.

Mark a heading with a block comment:

```typescript
/* @@head Columns
 */
```

The script preserves the first line and replaces the rest of the comment
with FIGlet's Georgia11 output and a closing ` */` on its own line. Edit
the text after `@@head` and rerun the command whenever the heading changes.
Use about 8–10 characters for manageable widths; longer headings produce
a warning and are still rendered. ASCII art can exceed 80 columns.

Indentation and line endings are preserved. Only actual block comments
are processed; strings and ordinary comments are left untouched. Files
are written only when their contents change.
