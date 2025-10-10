import { wrappingInputRule } from '@tiptap/core';
import { BulletList } from '@tiptap/extension-list';

// Custom BulletList that excludes '-' from the input rule trigger.
// Only '*' and '+' at the beginning of a line should create a bullet list.
export const BulletListNoDash = BulletList.extend({
	addInputRules() {
		return [
			wrappingInputRule({
				find: /^\s*([+*])\s$/,
				type: this.type,
			}),
		];
	},
});
