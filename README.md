# mdt

Markdown in terminal. An interactive Markdown and JSON viewer written in TypeScript.

## Features

- Interactive viewer with keyboard and mouse scrolling
- Syntax highlighted code blocks (Shiki, `github-dark` and `github-light`)
- Headings, bold, italic, strikethrough, lists, blockquotes, GitHub alerts, tables and task lists
- Click a checkbox to toggle the task in the file
- Inline images through Kitty, iTerm2 or a Unicode half-block fallback, local and remote
- OSC 8 hyperlinks, click a link to open it
- Search with `/`, regex supported, smart case, `n` / `N` to move between matches
- Table of contents with `o`, fuzzy heading search with `:`, heading jumps with `[` / `]`
- Relative Markdown links open in the viewer, `Backspace` goes back
- Link picker with `f`
- Click a heading section, list or code block to copy it, `Y` copies the document, `c` copies the nearest code block
- Mermaid flowcharts drawn with box characters (`graph` / `flowchart`, TD, BT, LR, RL)
- LaTeX math to Unicode: `$\alpha + \beta$` renders as `α + β`
- Slide mode with `--slides`, `---` separates slides
- Auto reload when the file changes
- Reads stdin: `curl ... | mdt`
- Multiple files, switch with `Tab` / `Shift+Tab`
- HTML export with `--export html`, self contained with local images inlined
- Dark and light themes, toggle with `t`
- Line numbers in code blocks, toggle with `l`
- Config file at `~/.config/mdt/config.toml`
- Re-wraps on terminal resize
- JSON explorer with collapsible nodes and tables for arrays of objects
- Prints styled text when stdout is not a terminal

## Install

Requires Node 24.

```bash
pnpm install
pnpm build
pnpm link --global
```

## Usage

```bash
mdt README.md                      # view a file
mdt a.md b.md                      # multiple files (Tab to switch)
mdt data.json                      # view a JSON file
cat README.md | mdt                # read from stdin
mdt --slides deck.md               # slide mode
mdt --export html doc.md > out.html
mdt --theme light README.md
mdt -l README.md                   # line numbers in code blocks
mdt README.md | less -R            # styled output without the viewer
```

## Controls

### Navigation

| Key | Action |
|-----|--------|
| `j` / `Down` | Scroll down one line |
| `k` / `Up` | Scroll up one line |
| `Space` / `Page Down` | Page down |
| `b` / `Page Up` | Page up |
| `d` / `u` (or `Ctrl+d` / `Ctrl+u`) | Half page down / up |
| `g` / `Home` | Top |
| `G` / `End` | Bottom |
| `[` / `]` | Previous / next heading |
| `Backspace` | Go back after following a local link |
| Mouse wheel | Scroll |

### Search

| Key | Action |
|-----|--------|
| `/` | Open search (regex supported) |
| `Enter` | Run search |
| `n` / `N` | Next / previous match |
| `Esc` | Clear search |

### Features

| Key | Action |
|-----|--------|
| `o` | Table of contents |
| `:` | Fuzzy heading search |
| `f` | Link picker, type a number and `Enter` |
| `t` | Toggle dark / light theme |
| `l` | Toggle line numbers in code blocks |
| Click heading / list / code block | Copy it |
| Click checkbox | Toggle the task in the file |
| `Y` | Copy the document |
| `c` | Copy the nearest code block |
| `Tab` / `Shift+Tab` | Next / previous file |
| `h` / `?` / `F1` | Help |
| `q` / `Ctrl+C` | Quit |

### JSON

| Key | Action |
|-----|--------|
| `j` / `k` | Move cursor |
| `Enter` / `Space` | Expand or collapse |
| `l` / `Right` | Expand |
| `h` / `Left` | Collapse, or go to parent |
| `L` / `H` | Expand all / collapse all |

### Slides

| Key | Action |
|-----|--------|
| `Right` / `Space` / `l` / `j` / `Down` / `Page Down` | Next slide |
| `Left` / `b` / `h` / `k` / `Up` / `Page Up` | Previous slide |
| `g` / `Home` | First slide |
| `G` / `End` | Last slide |

## Configuration

`~/.config/mdt/config.toml` (or `$XDG_CONFIG_HOME/mdt/config.toml`):

```toml
theme = "dark"        # "dark" or "light"
line_numbers = false  # line numbers in code blocks
width = 0             # display width, 0 = terminal width
```

CLI flags override the config file.

## CLI

```
mdt [OPTIONS] [FILES]...

Options:
  -T, --theme <THEME>      Theme: dark or light
  -w, --width <WIDTH>      Display width override (0 = auto)
  -s, --slides             Slide mode (--- as slide separators)
  -l, --line-numbers       Show line numbers in code blocks
      --export <FORMAT>    Export format (html)
      --no-color           Disable colors
  -h, --help               Print help
  -V, --version            Print version
```

## Development

```bash
pnpm dev README.md   # run from source
pnpm test
pnpm typecheck
pnpm build
```
