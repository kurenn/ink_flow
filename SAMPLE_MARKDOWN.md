# Inkflow Markdown Support Demo

This file exercises all currently supported Markdown features in the app.

---

## Headings

# H1 Heading
## H2 Heading
### H3 Heading
#### H4 Heading
##### H5 Heading
###### H6 Heading

#HeadingWithoutSpace

---

## Unordered Lists

- Item using `-`
* Item using `*`
+ Item using `+`

- Parent item
  - Child item
    - Grandchild item

---

## Ordered Lists

1. Ordered item (dot style)
2. Second item
3. Third item

1) Ordered item (parenthesis style for live shortcut)
2) Second item

---

## Task Lists

- [ ] Open the app
- [x] Create a markdown file
- [ ] Verify all syntax rendering

---

## Blockquote

> This is a blockquote.
> It can span multiple lines.

---

## Inline Formatting

This line has **bold**, _italic_, ~~strikethrough~~, and `inline code`.

You can also combine formatting like **bold with `code`**.

---

## Links and Images

[OpenAI](https://openai.com)

![Sample image](https://picsum.photos/900/220)

---

## Fenced Code Blocks

```js
function greet(name) {
  return `Hello, ${name}`;
}

console.log(greet('Inkflow'));
```

```python
def add(a, b):
    return a + b

print(add(2, 3))
```

---

## Horizontal Rules

Below is another horizontal rule:

***

And another:

___

---

## Tables

| Feature | Syntax | Status |
| --- | --- | --- |
| Heading | `# Title` | Supported |
| Bullet list | `* item` | Supported |
| Task list | `- [x] done` | Supported |
| Quote | `> quote` | Supported |
| Code block | ```` ```js ```` | Supported |

---

## Quick Table Starter Line (for live shortcut)

| Name | Role |
