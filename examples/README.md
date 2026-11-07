# mdt examples

Open any file here with `mdt`. Start with this one: `mdt examples/README.md`, then click a link or press `f`.

| File | What it shows |
|:-----|:--------------|
| [blocks.md](blocks.md) | Every Markdown block: text, headings, lists, quotes, alerts, tables, HTML |
| [code.md](code.md) | Syntax highlighting in many languages, long lines, `l` for line numbers |
| [images.md](images.md) | PNG, JPEG, transparency, tall, wide, remote and broken images |
| [diagrams.md](diagrams.md) | Mermaid flowcharts in all four directions and every node shape |
| [math.md](math.md) | Inline and display LaTeX math |
| [tasks.md](tasks.md) | Checkboxes you can click to toggle in the file |
| [docs/guide.md](docs/guide.md) | Links between files, anchors, and `Backspace` to go back |
| [slides.md](slides.md) | A deck for `mdt --slides examples/slides.md` |
| [data.json](data.json) | Nested JSON explorer |
| [users.json](users.json) | JSON array shown as a table |

## Commands to try

```bash
mdt examples/README.md                         # this page
mdt examples/blocks.md examples/code.md        # Tab / Shift+Tab between files
mdt --slides examples/slides.md                # slide mode
mdt --theme light examples/images.md           # light theme
mdt -l examples/code.md                        # line numbers
cat examples/blocks.md | mdt                   # stdin
mdt examples/blocks.md | less -R               # piped, no viewer
mdt --export html examples/images.md > /tmp/images.html && open /tmp/images.html
```
