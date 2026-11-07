# Code

Press `l` to toggle line numbers, `c` to copy the nearest block, or click a block to copy it.

```typescript
interface User {
  id: number;
  name: string;
  roles: readonly ('admin' | 'viewer')[];
}

export async function load(id: number): Promise<User> {
  const res = await fetch(`/api/users/${id}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as User;
}
```

```python
from dataclasses import dataclass

@dataclass
class Point:
    x: float
    y: float

    def __add__(self, other: "Point") -> "Point":
        return Point(self.x + other.x, self.y + other.y)
```

```rust
fn main() {
    let words = vec!["mdt", "renders", "markdown"];
    let joined: String = words.iter().map(|w| w.to_uppercase()).collect::<Vec<_>>().join(" ");
    println!("{joined}");
}
```

```go
package main

import "fmt"

func main() {
	ch := make(chan int)
	go func() { ch <- 42 }()
	fmt.Println(<-ch)
}
```

```bash
#!/usr/bin/env bash
set -euo pipefail
for f in *.md; do
  echo "Rendering $f"
  mdt "$f" > "${f%.md}.txt"
done
```

```json
{ "name": "mdt", "private": false, "keywords": ["markdown", "terminal"] }
```

```yaml
name: CI
on: [push]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
```

```sql
SELECT name, COUNT(*) AS builds
FROM projects
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY name
ORDER BY builds DESC;
```

```css
:root { --accent: #58a6ff; }
.button:hover { background: var(--accent); }
```

```diff
- const theme = 'dark';
+ const theme = detectTheme();
```

A very long line wraps inside the box:

```text
This line is intentionally very long so that it wraps inside the code block border instead of being cut off at the edge of the terminal window.
```

A block with no language:

```
plain text, no highlighting
```

An unknown language falls back to plain text:

```nosuchlang
still shown, just not colored
```

    Indented code block (four spaces).
