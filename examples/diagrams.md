# Diagrams

Mermaid `graph` and `flowchart` blocks are drawn with box characters.

## Top down

```mermaid
graph TD
  A[Request] --> B{Cached?}
  B -->|Yes| C[Return cache]
  B -->|No| D[Fetch origin]
  D --> E[(Store)]
  E --> C
```

## Left to right

```mermaid
flowchart LR
  Write --> Save -.-> Reload
  Reload ==> View
  Save -- on error --> Write
```

## Bottom up

```mermaid
graph BT
  Leaf1[Leaf one] --> Root
  Leaf2[Leaf two] --> Root
```

## Right to left

```mermaid
graph RL
  End --> Middle --> Start
```

## Node shapes

```mermaid
graph TD
  R[Rectangle] --> O(Rounded)
  O --> S([Stadium])
  S --> D{Decision}
  D --> C((Circle))
  D --> Sub[[Subroutine]]
```

## Cycles and fan out

```mermaid
graph TD
  Idea --> Build
  Build --> Ship
  Ship --> Learn
  Learn --> Idea
  Build --> Test & Docs
```

## Unsupported diagram

Sequence diagrams are shown as plain code:

```mermaid
sequenceDiagram
  Alice->>Bob: Hello
  Bob-->>Alice: Hi
```
