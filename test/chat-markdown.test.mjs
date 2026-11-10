import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createChatMarkdown, streamingMarkdown } from '../src/chat-markdown.js';
const Markdown = createChatMarkdown(React);
const render = (text, streaming = false) => renderToStaticMarkup(React.createElement(Markdown, { text, sources: [], streaming }));

test('中文标点旁的加粗正确解析，数学星号和代码保留', () => {
  for (const text of ['这是**重点：**内容', '称**“双循环”**为', '**（注）**正文']) {
    assert.match(render(text), /<strong>/);
    assert.doesNotMatch(render(text), /\*\*/);
  }
  assert.match(render('2 ** 3 ** 4'), /2 \*\* 3 \*\* 4/);
  assert.match(render('`**code**`'), /<code>\*\*code\*\*<\/code>/);
  assert.match(render('\\*\\*转义\\*\\*'), /\*\*转义\*\*/);
});

test('流式未闭合强调只临时修复，完成态保留原文语义', () => {
  assert.match(render('**尚未结束', true), /<strong>尚未结束<\/strong>/);
  assert.match(render('**尚未结束', false), /\*\*尚未结束/);
  assert.equal(streamingMarkdown('**已闭合**'), '**已闭合**');
  assert.equal(streamingMarkdown('** 空格'), '** 空格');
  assert.equal(streamingMarkdown('`**代码'), '`**代码');
  assert.equal(streamingMarkdown('***复合'), '***复合');
  assert.equal(streamingMarkdown('```js\n**代码'), '```js\n**代码\n```');
  assert.equal(streamingMarkdown('```\n**代码\n```'), '```\n**代码\n```');
});

test('引用、列表、表格可读，HTML 与危险链接不能执行', () => {
  const html = render('## 标题\n\n- **重点**\n\n| 作者 | 数量 |\n| --- | --- |\n| 甲 | 1 |\n\n<script>alert(1)</script>\n\n[危险](javascript:alert(1))');
  assert.match(html, /<h2>标题<\/h2>/); assert.match(html, /<li><strong>重点/); assert.match(html, /<table>/);
  assert.doesNotMatch(html, /<script|href="javascript:/);
});
