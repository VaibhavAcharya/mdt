# Blocks

Every block type mdt renders. Press `o` for the table of contents or `:` to fuzzy search headings.

## Inline formatting

Plain, **bold**, *italic*, ***bold italic***, ~~strikethrough~~, `inline code` and **`bold code`**.

A [link](https://nodejs.org), an [anchor link](#tables), an autolink https://example.com and an email <hello@example.com>.

Escapes: \*not italic\*, \`not code\`, \$not math\$. Entities: &copy; &mdash; &rarr; &hellip;

Line one with a hard break  
line two after two trailing spaces.<br>Line three after a `<br>`.

Wide characters wrap correctly: 日本語のテキスト, 한국어 텍스트, emoji 🚀✨🎉.

## Headings

### Level 3

#### Level 4

##### Level 5

###### Level 6

Setext level 1
==============

Setext level 2
--------------

## Lists

- Unordered item
- Item with **formatting** and `code`
  - Nested item
    - Third level
      - Fourth level
- Item with a long line that wraps across several rows so you can see how the continuation lines align with the text after the bullet

1. First
2. Second
   1. Nested ordered
   2. Another
3. Third

7. A list that starts at seven
8. Eight

* Loose list item one

* Loose list item two, with a paragraph

  And a second paragraph in the same item.

- A list item with a code block:

  ```js
  console.log('inside a list');
  ```

## Tasks

- [x] Done task
- [ ] Open task
  - [x] Nested done
  - [ ] Nested open

## Blockquotes

> A simple quote.

> A quote with **bold**, `code` and a [link](https://example.com).
>
> > A nested quote.
>
> - A list inside a quote
> - Second item

## Alerts

> [!NOTE]
> Useful information.

> [!TIP]
> A helpful tip.

> [!IMPORTANT]
> Something important.

> [!WARNING]
> Be careful here.

> [!CAUTION]
> This could break things.

## Tables

| Left | Center | Right | Formatted |
|:-----|:------:|------:|-----------|
| a | b | 1 | **bold** |
| longer cell | mid | 1,000 | `code` |
| x | y | 3.14 | [link](https://example.com) |

| Narrow terminal test | This table has long cells that must wrap when the terminal is narrow |
|---|---|
| Short | Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt |

## Horizontal rules

Above.

---

Between.

***

Below.

## HTML

<details>
<summary>Details and summary tags</summary>

Content inside a details block.

</details>

<p align="center">Centered paragraph from an HTML tag.</p>

<!-- This comment is hidden -->

Inline <kbd>Ctrl</kbd>+<kbd>C</kbd> tags are stripped.

## Front matter

Front matter at the top of a file is hidden. See [docs/guide.md](docs/guide.md).

## The end

Press `g` to go to the top, or `Backspace` if you came from another file.
