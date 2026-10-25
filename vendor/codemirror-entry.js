// Re-exports the CodeMirror pieces the editor uses, bundled into vendor/codemirror.js
// by `npm run vendor` so the app itself stays build-free.
export { EditorView, Decoration, ViewPlugin, WidgetType, keymap, drawSelection, placeholder } from '@codemirror/view';
export { EditorState, EditorSelection, RangeSetBuilder, StateField, StateEffect } from '@codemirror/state';
export { defaultKeymap, history, historyKeymap, indentWithTab, undo, redo } from '@codemirror/commands';
export { syntaxTree, syntaxHighlighting, HighlightStyle } from '@codemirror/language';
export { markdown, markdownLanguage } from '@codemirror/lang-markdown';
export { tags } from '@lezer/highlight';
